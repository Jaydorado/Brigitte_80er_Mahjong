/**
 * `window.__mahjong`: the Playwright smoke suite's hook. `main.ts` loads this module only in dev or
 * when the URL carries `?smoke`, so a normal launch never has it.
 *
 * The level screen owns its `GameState` privately. The hook keeps a *mirror*: `openLevel` deals the
 * same game from the same saved attempt seed, and every action the hook performs (or is told about
 * with `note`) goes through the same pure `reduce`. Taps are real `pointerdown` events on the board,
 * so the level's own hit test and reducer run. `state()` reports the mirror beside two DOM counts
 * (visible `.tile`s and the HUD number); the suite asserts they agree, which is what proves the
 * mirror follows the screen.
 */
import { freePairs, newGame, reduce, status, tilesLeft, type Action, type GameState } from '../core/game';
import type { Pair } from '../core/layout';
import { layouts } from '../core/layouts';
import { attemptSeed, levels } from '../levels/levels';
import { loadSave } from '../progress/save';
import { boardGeometry } from './board';
import { TILE } from './fit';
import { show, type Screen } from './router';

export interface HookState {
  level: number;
  status: 'won' | 'stuck' | 'playing';
  tilesLeft: number;
  historyLength: number;
  freePairs: Pair[];
  /** The deal's (or last shuffle's) certificate: a winning order from the board as it was then. */
  witness: Pair[];
  selected: number | null;
  /** Number of `.tile` elements currently displayed. */
  visibleTiles: number;
  /** The number the HUD shows. */
  hudCount: number;
}

export interface SmokeHook {
  /** Shows any screen through the router. */
  show(s: Screen): void;
  /** Mounts a level through the router and starts mirroring it. */
  openLevel(id: number): void;
  /** The mirror beside the DOM; throws when no mirrored level is on screen. */
  state(): HookState;
  /** A real `pointerdown` on the board at the slot's face centre. */
  tap(slot: number): void;
  /** Clicks a HUD helper (a disabled Zurück does nothing, as for a player). */
  press(kind: 'hint' | 'undo' | 'shuffle'): void;
  /** Tells the mirror about an action the UI took without the hook (a real click on a dialog button). */
  note(a: Action): void;
  /** Taps both slots of each pair in order. */
  playPairs(pairs: readonly Pair[]): void;
  /** Plays the certificate of a fresh deal, leaving its last `keep` pairs on the board. */
  playWitness(keep?: number): void;
  /** Plays free pairs until no pair is free while tiles remain; false if no line was found. */
  playToStuck(): boolean;
  /** Match the first free pair, then press Zurück after `delayMs`. */
  matchThenUndo(delayMs: number): Promise<void>;
}

declare global {
  interface Window {
    __mahjong?: SmokeHook;
  }
}

interface Mirror { id: number; state: GameState }
let mirror: Mirror | null = null;

const HUD_LABEL = { hint: 'Tipp', undo: 'Zurück', shuffle: 'Mischen' } as const;

function need(): { m: Mirror; screen: HTMLElement } {
  const screen = document.querySelector<HTMLElement>('.level');
  if (!mirror || !screen || screen.dataset.level !== String(mirror.id)) {
    throw new Error('no mirrored level on screen: call openLevel first');
  }
  return { m: mirror, screen };
}

function visibleTiles(): number {
  let n = 0;
  for (const t of document.querySelectorAll<HTMLElement>('.level .tile')) {
    if (getComputedStyle(t).display !== 'none') n++;
  }
  return n;
}

function tap(slot: number): void {
  const { m, screen } = need();
  const board = screen.querySelector<HTMLElement>('.board');
  const w = Number(screen.dataset.w);
  if (!board || !(w > 0)) throw new Error('the board is not on screen yet');
  const rect = board.getBoundingClientRect();
  const p = boardGeometry(m.state.layout, w).at(m.state.layout.slots[slot]);
  board.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      button: 0,
      pointerType: 'touch',
      clientX: rect.left + p.x + w / 2,
      clientY: rect.top + p.y + (w * TILE.aspect) / 2,
    }),
  );
  m.state = reduce(m.state, { type: 'tap', slot });
}

function playPairs(pairs: readonly Pair[]): void {
  for (const [a, b] of pairs) {
    tap(a);
    tap(b);
  }
}

function press(kind: 'hint' | 'undo' | 'shuffle'): void {
  const { m, screen } = need();
  const btn = screen.querySelector<HTMLButtonElement>(`.hud-btn[aria-label="${HUD_LABEL[kind]}"]`);
  if (!btn) throw new Error(`no HUD button ${HUD_LABEL[kind]}`);
  if (btn.closest('[inert]')) throw new Error('the HUD is inert: a dialog is open');
  if (btn.disabled) return;
  btn.click();
  m.state = reduce(m.state, { type: kind });
}

/** A small deterministic generator for picking among free pairs (the hook's own, not the game's). */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x;
  };
}

/** A line of pairs that ends with tiles left and none free, found on a pure copy of the mirror. */
function findStuckLine(from: GameState): Pair[] | null {
  for (let attempt = 0; attempt < 400; attempt++) {
    const next = lcg(attempt + 1);
    let s = from;
    const line: Pair[] = [];
    for (;;) {
      const pairs = freePairs(s);
      if (pairs.length === 0) break;
      const [a, b] = pairs[next() % pairs.length];
      s = reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: b });
      line.push([a, b]);
    }
    if (tilesLeft(s) > 0) return line;
  }
  return null;
}

const hook: SmokeHook = {
  show,
  openLevel(id) {
    const def = levels.find((l) => l.id === id);
    if (!def) throw new Error(`no level ${id}`);
    show({ name: 'level', id });
    // The level counted this attempt when it mounted; the same count gives the same deal.
    const attempt = loadSave(localStorage).attempts[id] ?? 0;
    mirror = { id, state: newGame(layouts[def.layoutId], def.faces, attemptSeed(id, attempt)) };
  },
  state() {
    const { m, screen } = need();
    const hud = screen.querySelector('.hud-count span')?.textContent ?? '';
    return {
      level: m.id,
      status: status(m.state),
      tilesLeft: tilesLeft(m.state),
      historyLength: m.state.history.length,
      freePairs: freePairs(m.state),
      witness: m.state.witness,
      selected: m.state.selected,
      visibleTiles: visibleTiles(),
      hudCount: Number(hud),
    };
  },
  tap,
  press,
  note(a) {
    const { m } = need();
    m.state = reduce(m.state, a);
  },
  playPairs,
  playWitness(keep = 0) {
    const { m } = need();
    if (m.state.history.length > 0) throw new Error('playWitness needs a fresh deal');
    playPairs(m.state.witness.slice(0, m.state.witness.length - keep));
  },
  playToStuck() {
    const { m } = need();
    const line = findStuckLine(m.state);
    if (line === null) return false;
    playPairs(line);
    return true;
  },
  async matchThenUndo(delayMs) {
    const { m } = need();
    const pair = freePairs(m.state)[0];
    if (!pair) throw new Error('no free pair');
    playPairs([pair]);
    await new Promise<void>((r) => setTimeout(r, delayMs));
    press('undo');
  },
};

window.__mahjong = hook;
