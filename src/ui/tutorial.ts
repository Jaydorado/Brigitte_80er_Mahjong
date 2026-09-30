/**
 * The level-1 guided tutorial (spec §Screens and flow 6): a speech card bottom-left over the board
 * margin, a ring that points at the step's target, and a swallow-and-nudge for every tap elsewhere.
 *
 * Steps: tap one free tile, tap its twin; what makes a tile free (an occupied-`above` tile, a tile
 * with both sides taken); then the three helpers Tipp, Zurück, Mischen; then "Viel Spaß!".
 * *Überspringen* (shown on every step) and the last step's button call `onDone`; the returned
 * cancel (unmount) does not, so an interrupted tutorial restarts next time. The ring is one element
 * in the board; the pointed-at helper carries `tut-point`. Motion is transform/opacity only and off
 * under reduced motion.
 */
import { freePairs, type Action, type GameState } from '../core/game';
import type { BoardView } from './board';
import './tutorial.css';

// Fixed interface texts (the family texts live in content.ts).
const T = {
  tapFirst: 'Tippe auf diesen Stein.',
  tapTwin: 'Jetzt auf den gleichen Stein. Gleiche Bilder passen zusammen.',
  free: 'Nur freie Steine kann man nehmen: Es liegt kein Stein darauf, und links oder rechts ist Platz.',
  covered: 'Hier liegt ein Stein darauf.',
  boxedIn: 'Hier ist links und rechts kein Platz.',
  hint: 'Findest du kein Paar? Tipp zeigt dir einen Stein.',
  undo: 'Macht den letzten Zug rückgängig.',
  shuffle: 'Mischt die Steine neu, wenn nichts mehr geht.',
  end: 'Viel Spaß!',
  next: 'Weiter',
  go: 'Los geht’s',
  skip: 'Überspringen',
} as const;

type Helper = 'hint' | 'undo' | 'shuffle';
const HELPERS: readonly Helper[] = ['hint', 'undo', 'shuffle'];

export interface TutorialCtx {
  root: HTMLElement;
  board: BoardView;
  getState(): GameState;
  dispatch(a: Action): void;
  helpers: { hint: HTMLElement; undo: HTMLElement; shuffle: HTMLElement };
  onDone(): void; // sets tutorialDone + persist
  /** The level screen swaps its board after a resize re-bake: the tutorial redraws its ring on the new one. */
  onBoardChange?(cb: () => void): void;
}

type Step =
  | { kind: 'tap'; text: string; target: number; back?: number } // `back`: the tile whose tap undoes the selection
  | { kind: 'look'; text: string; target: number | null }
  | { kind: 'helper'; text: string; which: Helper }
  | { kind: 'end'; text: string };

/** Slots to explain "free" on, read from the board after the first match (null: none on this board). */
export function explainTargets(s: GameState): { covered: number | null; boxedIn: number | null } {
  const { occupied } = s.board;
  const taken = (list: readonly number[]) => list.some((j) => occupied[j]);
  let covered: number | null = null;
  let boxedIn: number | null = null;
  let boxedInUnder: number | null = null;
  for (let i = 0; i < occupied.length; i++) {
    if (!occupied[i]) continue;
    const under = taken(s.idx.above[i]);
    if (under && covered === null) covered = i;
    if (taken(s.idx.left[i]) && taken(s.idx.right[i])) {
      if (!under && boxedIn === null) boxedIn = i; // clean example: nothing on top
      else if (boxedInUnder === null) boxedInUnder = i;
    }
  }
  return { covered, boxedIn: boxedIn ?? boxedInUnder };
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function startTutorial(ctx: TutorialCtx): () => void {
  const { root, board, helpers } = ctx;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const card = document.createElement('div');
  card.className = 'tut-card';
  card.dataset.pos = 'bl';
  const text = document.createElement('p');
  text.className = 'tut-text';
  text.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'tut-actions';
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'tut-skip';
  skip.textContent = T.skip;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'tut-next';
  actions.append(skip, next);
  card.append(text, actions);
  root.append(card);

  let finished = false;
  let step: Step;
  let ring: HTMLElement | null = null;
  let pointed: HTMLElement | null = null;
  let pair: readonly [number, number] | null = null;
  let queue: Step[] = [];
  let queueAt = 0;
  let nudging: Animation | null = null;

  /** Puts the card in the first corner that leaves `avoid` visible (bottom-left by default). */
  function placeCard(avoid: DOMRect | null): void {
    const order = ['bl', 'tl', 'br', 'tr'];
    let chosen = 'bl';
    if (avoid !== null) {
      for (const pos of order) {
        card.dataset.pos = pos;
        if (!intersects(card.getBoundingClientRect(), avoid)) {
          chosen = pos;
          break;
        }
      }
    }
    card.dataset.pos = chosen;
  }

  function clearPointer(): void {
    ring?.remove();
    ring = null;
    pointed?.classList.remove('tut-point');
    pointed = null;
  }

  /** Shows `s`: texts and buttons, the ring or the pointed-at helper, and a card corner clear of it. */
  function enter(s: Step): void {
    step = s;
    clearPointer();
    text.textContent = s.text;
    next.hidden = s.kind === 'tap';
    next.textContent = s.kind === 'end' ? T.go : T.next;
    let avoid: DOMRect | null = null;
    const slot = s.kind === 'tap' ? s.target : s.kind === 'look' ? s.target : null;
    if (slot !== null) {
      const el = document.createElement('div');
      el.className = 'tut-ring';
      el.dataset.slot = String(slot);
      const p = board.pos(slot);
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      const glow = document.createElement('span');
      glow.className = 'tut-ring-glow';
      el.append(glow);
      board.el.append(el);
      ring = el;
      avoid = el.getBoundingClientRect();
    } else if (s.kind === 'helper') {
      pointed = helpers[s.which];
      pointed.classList.add('tut-point');
      avoid = pointed.getBoundingClientRect();
    }
    placeCard(avoid);
  }

  /** Steps after the first match, built from the board as it is then. */
  function startLooking(): void {
    const { covered, boxedIn } = explainTargets(ctx.getState());
    queue = [{ kind: 'look', text: T.free, target: null }];
    if (covered !== null) queue.push({ kind: 'look', text: T.covered, target: covered });
    if (boxedIn !== null) queue.push({ kind: 'look', text: T.boxedIn, target: boxedIn });
    queue.push(
      { kind: 'helper', text: T.hint, which: 'hint' },
      { kind: 'helper', text: T.undo, which: 'undo' },
      { kind: 'helper', text: T.shuffle, which: 'shuffle' },
      { kind: 'end', text: T.end },
    );
    queueAt = 0;
    enter(queue[0]);
  }

  function advance(): void {
    if (step.kind === 'end') {
      finish();
      return;
    }
    enter(queue[++queueAt]);
  }

  /** The tap-a / tap-b steps follow the game: matched → explain; a selected → b; otherwise a. */
  function followGame(): void {
    if (pair === null) return;
    const [a, b] = pair;
    const s = ctx.getState();
    if (!s.board.occupied[a] || !s.board.occupied[b]) startLooking();
    else if (s.selected === a) enter({ kind: 'tap', text: T.tapTwin, target: b, back: a });
    else enter({ kind: 'tap', text: T.tapFirst, target: a });
  }

  /** Nudges what the player should use now: the ring, the pointed-at helper, or Weiter. */
  function nudge(): void {
    const el = ring?.firstElementChild ?? pointed ?? next;
    nudging?.cancel();
    nudging = el.animate(
      reducedMotion
        ? [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }]
        : [{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(0.96)' }, { transform: 'scale(1)' }],
      { duration: reducedMotion ? 300 : 380, easing: 'ease-out' },
    );
  }

  const onTap = (slot: number): void => {
    if (finished) return;
    if (step.kind === 'tap' && (slot === step.target || slot === step.back)) {
      ctx.dispatch({ type: 'tap', slot });
      followGame();
    } else if (step.kind === 'look' && step.target === slot) {
      ctx.dispatch({ type: 'tap', slot }); // a blocked tile wiggles: the lesson in action
    } else {
      nudge();
    }
  };
  board.onTap(onTap);

  /** Helper buttons work only on the step that points at them. */
  const onClickCapture = (ev: MouseEvent): void => {
    if (finished) return;
    const target = ev.target as Node;
    const hit = HELPERS.find((h) => helpers[h].contains(target));
    if (hit === undefined || (step.kind === 'helper' && step.which === hit)) return;
    ev.stopPropagation();
    ev.preventDefault();
    nudge();
  };
  root.addEventListener('click', onClickCapture, true);

  skip.addEventListener('click', () => finish());
  next.addEventListener('click', () => advance());
  ctx.onBoardChange?.(() => {
    if (!finished) enter(step);
  });

  function teardown(): void {
    finished = true;
    nudging?.cancel();
    clearPointer();
    root.removeEventListener('click', onClickCapture, true);
    card.remove();
  }

  function finish(): void {
    if (finished) return;
    teardown();
    ctx.onDone();
  }

  const first = freePairs(ctx.getState())[0];
  if (first === undefined) {
    startLooking();
  } else {
    pair = first;
    followGame();
  }

  return () => {
    if (!finished) teardown();
  };
}
