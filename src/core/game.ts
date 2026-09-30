import { buildIndex, freeSlots, isFree, type Layout, type LayoutIndex, type Pair } from './layout';
import { deal, shuffleBoard, type Board } from './deal';
import { hashSeed } from './rng';
import type { FaceId } from './tiles';

export type HistoryEntry =
  | { kind: 'match'; a: number; b: number; face: FaceId }
  | { kind: 'shuffle'; before: Board; witness: Pair[] };

export type GameEvent =
  | { type: 'selected'; slot: number } | { type: 'deselected' }
  | { type: 'blocked'; slot: number }
  | { type: 'matched'; a: number; b: number }
  | { type: 'hint'; slots: number[] }             // step 1: [a]; step 2: [a, b]
  | { type: 'stuckHint' }                         // Tipp pressed with no free pair
  | { type: 'undoMatch'; a: number; b: number }
  | { type: 'shuffled'; moves: { from: number; to: number }[] | null }
  | { type: 'undoShuffle'; before: Board; after: Board }
  | { type: 'noop' };

export interface GameState {
  layout: Layout; idx: LayoutIndex; board: Board; witness: Pair[];
  selected: number | null; hint: { a: number; b: number; step: 1 | 2 } | null;
  history: HistoryEntry[]; attemptSeed: number; shuffleCounter: number;
  event: GameEvent;
}

export type Action = { type: 'tap'; slot: number } | { type: 'hint' } | { type: 'undo' } | { type: 'shuffle' };

export function newGame(layout: Layout, faces: readonly FaceId[], attemptSeed: number): GameState {
  const idx = buildIndex(layout.slots);
  const { board, witness } = deal(layout, idx, faces, attemptSeed);
  return {
    layout, idx, board, witness,
    selected: null, hint: null,
    history: [], attemptSeed, shuffleCounter: 0,
    event: { type: 'noop' },
  };
}

/** Free same-face pairs [i, j] with i < j, ordered by i then j. Occupancy is authoritative. */
export function freePairs(s: GameState): Pair[] {
  const free = freeSlots(s.idx, s.board.occupied);
  const out: Pair[] = [];
  for (let x = 0; x < free.length; x++) {
    for (let y = x + 1; y < free.length; y++) {
      if (s.board.faceAt[free[x]] === s.board.faceAt[free[y]]) out.push([free[x], free[y]]);
    }
  }
  return out;
}

export function tilesLeft(s: GameState): number {
  let n = 0;
  for (const o of s.board.occupied) if (o) n++;
  return n;
}

export function status(s: GameState): 'won' | 'stuck' | 'playing' {
  if (tilesLeft(s) === 0) return 'won';
  return freePairs(s).length === 0 ? 'stuck' : 'playing';
}

/** Pure: returns a new state and never mutates `s` or anything it references. */
export function reduce(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'tap': return tap(s, a.slot);
    case 'hint': return hint(s);
    case 'undo': return undo(s);
    case 'shuffle': return shuffle(s);
  }
}

function tap(s: GameState, slot: number): GameState {
  const { board } = s;
  if (!board.occupied[slot]) return { ...s, event: { type: 'noop' } };
  if (!isFree(slot, s.idx, board.occupied)) return { ...s, event: { type: 'blocked', slot } };
  if (s.selected === slot) return { ...s, selected: null, event: { type: 'deselected' } };
  if (s.selected !== null && board.faceAt[s.selected] === board.faceAt[slot]) {
    const a = s.selected;
    const occupied = board.occupied.slice();
    occupied[a] = false;
    occupied[slot] = false;
    return {
      ...s,
      board: { occupied, faceAt: board.faceAt },
      selected: null, hint: null,
      history: [...s.history, { kind: 'match', a, b: slot, face: board.faceAt[slot] }],
      event: { type: 'matched', a, b: slot },
    };
  }
  const keepHint = s.hint !== null && (slot === s.hint.a || slot === s.hint.b);
  return { ...s, selected: slot, hint: keepHint ? s.hint : null, event: { type: 'selected', slot } };
}

function hint(s: GameState): GameState {
  const pairs = freePairs(s);
  if (pairs.length === 0) return { ...s, hint: null, event: { type: 'stuckHint' } };
  if (s.hint !== null && s.hint.step === 1) {
    const { a, b } = s.hint;
    return { ...s, hint: { a, b, step: 2 }, event: { type: 'hint', slots: [a, b] } };
  }
  const layer = (i: number) => s.layout.slots[i].layer;
  let best = pairs[0];
  let bestTop = Math.max(layer(best[0]), layer(best[1]));
  for (let k = 1; k < pairs.length; k++) {
    const p = pairs[k];
    const top = Math.max(layer(p[0]), layer(p[1]));
    if (top > bestTop || (top === bestTop && p[0] + p[1] < best[0] + best[1])) {
      best = p;
      bestTop = top;
    }
  }
  const [a, b] = best;
  return { ...s, hint: { a, b, step: 1 }, event: { type: 'hint', slots: [a] } };
}

function undo(s: GameState): GameState {
  const last = s.history[s.history.length - 1];
  if (last === undefined) return { ...s, event: { type: 'noop' } };
  const history = s.history.slice(0, -1);
  if (last.kind === 'match') {
    const occupied = s.board.occupied.slice();
    const faceAt = s.board.faceAt.slice();
    occupied[last.a] = true;
    occupied[last.b] = true;
    faceAt[last.a] = last.face;
    faceAt[last.b] = last.face;
    return {
      ...s, board: { occupied, faceAt }, selected: null, hint: null, history,
      event: { type: 'undoMatch', a: last.a, b: last.b },
    };
  }
  return {
    ...s, board: last.before, witness: last.witness, selected: null, hint: null, history,
    event: { type: 'undoShuffle', before: last.before, after: s.board },
  };
}

function shuffle(s: GameState): GameState {
  const r = shuffleBoard(s.layout, s.idx, s.board, hashSeed(s.attemptSeed, s.shuffleCounter));
  return {
    ...s,
    board: r.board, witness: r.witness, selected: null, hint: null,
    history: [...s.history, { kind: 'shuffle', before: s.board, witness: s.witness }],
    shuffleCounter: s.shuffleCounter + 1,
    event: { type: 'shuffled', moves: r.moves },
  };
}
