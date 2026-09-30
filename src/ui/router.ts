import { levels } from '../levels/levels';
import { markWon, writeSave } from '../progress/save';
import type { SaveV1 } from '../progress/save';
import { mountClosing } from './closing';
import { mountLetter } from './letter';
import { mountLevel } from './levelScreen';
import { mountMap } from './map';
import { notifyNavigated } from './sw';
import { mountWelcome } from './welcome';

export type Screen =
  | { name: 'welcome' }
  | { name: 'map'; lit?: number }
  | { name: 'level'; id: number }
  | { name: 'letter'; id: number; next: 'map' | 'closing' }
  | { name: 'closing' };

interface Host {
  readonly root: HTMLElement;
  readonly storage: Storage;
}

let host: Host | null = null;
/** The single source of truth for progress; screens get it by value and persist through `persist`. */
let save: SaveV1;
let current: Screen | null = null;
let unmountCurrent: (() => void) | null = null;
/** Set when a win sends the player to its letter, so *Weiter* can light the candle on the map. */
let litAfterLetter: number | null = null;

function persist(next: SaveV1): void {
  save = next;
  writeSave(host!.storage, next);
}

/** Starts the router on `root` with the loaded save and shows `first`. */
export function startRouter(root: HTMLElement, storage: Storage, loaded: SaveV1, first: Screen): void {
  host = { root, storage };
  save = loaded;
  show(first);
}

/** True while the map or welcome is showing: the only screens where a waiting update may apply. */
export function isSafeScreen(): boolean {
  return current?.name === 'map' || current?.name === 'welcome';
}

/** Unmounts the current screen and mounts `s`. */
export function show(s: Screen): void {
  const { root } = host!;
  unmountCurrent?.();
  unmountCurrent = null;
  root.replaceChildren();
  current = s;
  unmountCurrent = mount(root, s);
  notifyNavigated();
}

function mount(root: HTMLElement, s: Screen): () => void {
  switch (s.name) {
    case 'welcome':
      return mountWelcome(root, {
        save,
        storage: host!.storage,
        onStart(next) {
          save = next;
          show({ name: 'map' });
        },
      });
    case 'map':
      return mountMap(root, {
        save,
        lit: s.lit,
        onLevel: (id) => show({ name: 'level', id }),
        onEnvelope: (id) => show({ name: 'letter', id, next: 'map' }),
        onTopper: () => show({ name: 'closing' }),
        onHelp: () => show({ name: 'welcome' }),
      });
    case 'level': {
      const level = levels.find((l) => l.id === s.id);
      if (level === undefined) return mount(root, { name: 'map' });
      // Decided before the level mounts: a win marks the level, so afterwards it is never "first".
      const firstWin = !save.won.includes(level.id);
      return mountLevel(root, level, {
        save,
        persist,
        onExit: () => show({ name: 'map' }),
        onWon(id) {
          persist(markWon(save, id));
          litAfterLetter = id;
          show({ name: 'letter', id, next: id === 6 && firstWin ? 'closing' : 'map' });
        },
      });
    }
    case 'letter': {
      const lit = litAfterLetter ?? undefined;
      litAfterLetter = null;
      return mountLetter(root, {
        id: s.id,
        onNext: () => show(s.next === 'closing' ? { name: 'closing' } : lit === undefined ? { name: 'map' } : { name: 'map', lit }),
      });
    }
    case 'closing':
      return mountClosing(root, { onBack: () => show({ name: 'map' }) });
  }
}
