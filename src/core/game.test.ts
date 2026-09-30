import { describe, expect, it } from 'vitest';
import { buildIndex, isFree, slotsFromMasks, type Layout, type Pair } from './layout';
import { peel } from './deal';
import { mulberry32 } from './rng';
import { freePairs, newGame, reduce, status, tilesLeft, type GameState } from './game';

function mkLayout(masks: string[][]): Layout {
  const slots = slotsFromMasks(masks);
  const idx = buildIndex(slots);
  const certificate = peel(idx, slots.map(() => true), mulberry32(1), 1000)!;
  return { id: 'rect', slots, clueRect: { col: 0, row: 0, w: 2, h: 2 }, certificate };
}
const L = mkLayout([['######', '######', '######'], ['.####.', '.####.']]); // 26 tiles
const faces = [0, 1, 2, 3, 4];

const firstFreePair = (s: GameState): Pair => freePairs(s)[0];

const freeTiles = (s: GameState): number[] =>
  s.board.occupied.flatMap((o, i) => (o && isFree(i, s.idx, s.board.occupied) ? [i] : []));

/** A free tile whose face differs from `slot`'s face. */
const freeOtherFace = (s: GameState, slot: number): number =>
  freeTiles(s).find((i) => s.board.faceAt[i] !== s.board.faceAt[slot])!;

const occupiedFaces = (s: GameState): number[] =>
  s.board.faceAt.filter((_, i) => s.board.occupied[i]).sort((x, y) => x - y);

const tapPair = (s: GameState, [a, b]: Pair): GameState =>
  reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: b });

/** Stacked-twin trap from T3: A(0,0,0) under B(0,0,1); with C and D gone only covered A and B remain. */
function stuckState(): GameState {
  const slots = [
    { col: 0, row: 0, layer: 0 }, { col: 0, row: 0, layer: 1 },
    { col: 2, row: 0, layer: 0 }, { col: 0, row: 2, layer: 0 },
  ];
  const trap: Layout = { id: 'rect', slots, clueRect: { col: 0, row: 0, w: 2, h: 2 }, certificate: [[1, 2], [0, 3]] };
  const s = newGame(trap, [5], 1);
  return { ...s, board: { occupied: [true, true, false, false], faceAt: [5, 5, 5, 5] } };
}

describe('game reducer', () => {
  it('selects, deselects and moves selection', () => {
    let s = newGame(L, faces, 11);
    const a = freeTiles(s)[0];
    s = reduce(s, { type: 'tap', slot: a });
    expect(s.selected).toBe(a);
    expect(s.event).toEqual({ type: 'selected', slot: a });

    s = reduce(s, { type: 'tap', slot: a });
    expect(s.selected).toBeNull();
    expect(s.event).toEqual({ type: 'deselected' });

    const c = freeOtherFace(s, a);
    s = reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: c });
    expect(s.selected).toBe(c);
    expect(s.event).toEqual({ type: 'selected', slot: c });
    expect(s.history).toHaveLength(0);
  });

  it('tapping a vacated slot is a noop even when its stale face matches the selection', () => {
    let s = newGame(L, faces, 11);
    const [a, b] = firstFreePair(s);
    s = tapPair(s, [a, b]);
    const c = freeTiles(s)[0];
    s = reduce(s, { type: 'tap', slot: c });
    const stale: GameState = { ...s, board: { ...s.board, faceAt: s.board.faceAt.map((f, i) => (i === a ? s.board.faceAt[c] : f)) } };
    const t = reduce(stale, { type: 'tap', slot: a });
    expect(t.event).toEqual({ type: 'noop' });
    expect(t.selected).toBe(c);
    expect(t.board).toEqual(stale.board);
    expect(t.history).toHaveLength(1);
  });

  it('blocked tap does not select', () => {
    const s0 = newGame(L, faces, 11);
    const blocked = s0.board.occupied.findIndex((o, i) => o && !isFree(i, s0.idx, s0.board.occupied));
    expect(blocked).toBeGreaterThanOrEqual(0);
    const s = reduce(s0, { type: 'tap', slot: blocked });
    expect(s.event).toEqual({ type: 'blocked', slot: blocked });
    expect(s.selected).toBeNull();
    expect(s.board).toEqual(s0.board);
  });

  it('matching a free pair removes both and pushes history', () => {
    let s = newGame(L, faces, 11);
    const [a, b] = freePairs(s)[0];
    s = reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: b });
    expect(s.board.occupied[a] || s.board.occupied[b]).toBe(false);
    expect(s.history).toHaveLength(1);
    expect(s.event).toEqual({ type: 'matched', a, b });
    expect(s.selected).toBeNull();
    expect(tilesLeft(s)).toBe(24);
  });

  it('undo restores a match exactly', () => {
    const s0 = newGame(L, faces, 11);
    const [a, b] = firstFreePair(s0);
    const s1 = tapPair(s0, [a, b]);
    const s2 = reduce(s1, { type: 'undo' });
    expect(s2.board).toEqual(s0.board);
    expect(s2.history).toHaveLength(0);
    expect(s2.event).toEqual({ type: 'undoMatch', a, b });
    expect(tilesLeft(s2)).toBe(26);
  });

  it('undo with empty history is a noop', () => {
    const s0 = newGame(L, faces, 11);
    const s = reduce(s0, { type: 'undo' });
    expect(s.event).toEqual({ type: 'noop' });
    expect(s.board).toEqual(s0.board);
  });

  it('two undos across a shuffle restore the pre-shuffle board, then the pre-match board', () => {
    const s0 = newGame(L, faces, 11);
    const s1 = tapPair(s0, firstFreePair(s0));
    const s2 = reduce(s1, { type: 'shuffle' });
    expect(s2.history).toHaveLength(2);
    expect(s2.event.type).toBe('shuffled');

    const u1 = reduce(s2, { type: 'undo' });
    expect(u1.board).toEqual(s1.board);
    expect(u1.witness).toEqual(s1.witness);
    expect(u1.event).toEqual({ type: 'undoShuffle', before: s1.board, after: s2.board });

    const u2 = reduce(u1, { type: 'undo' });
    expect(u2.board).toEqual(s0.board);
    expect(u2.history).toHaveLength(0);
  });

  it('shuffle keeps the face multiset and the counter is monotonic across undo', () => {
    const s0 = newGame(L, faces, 11);
    const s1 = reduce(s0, { type: 'shuffle' });
    expect(occupiedFaces(s1)).toEqual(occupiedFaces(s0));
    expect(s1.shuffleCounter).toBe(1);

    const u = reduce(s1, { type: 'undo' });
    expect(u.board).toEqual(s0.board);
    expect(u.shuffleCounter).toBe(1);

    const s2 = reduce(u, { type: 'shuffle' });
    expect(s2.shuffleCounter).toBe(2);
    expect(occupiedFaces(s2)).toEqual(occupiedFaces(s0));
  });

  it('shuffle and undo clear selection and hint', () => {
    const s0 = reduce(newGame(L, faces, 11), { type: 'hint' });
    const sel = reduce(s0, { type: 'tap', slot: s0.hint!.a });
    expect(sel.selected).not.toBeNull();
    expect(sel.hint).not.toBeNull();
    const sh = reduce(sel, { type: 'shuffle' });
    expect(sh.selected).toBeNull();
    expect(sh.hint).toBeNull();

    const again = reduce(reduce(sh, { type: 'hint' }), { type: 'tap', slot: freeTiles(sh)[0] });
    const un = reduce(again, { type: 'undo' });
    expect(un.selected).toBeNull();
    expect(un.hint).toBeNull();
  });

  it('hint step 1 marks one tile, step 2 adds its twin; a match clears it', () => {
    let s = reduce(newGame(L, faces, 11), { type: 'hint' });
    expect(s.event).toMatchObject({ type: 'hint' });
    expect((s.event as { slots: number[] }).slots).toHaveLength(1);
    s = reduce(s, { type: 'hint' });
    expect((s.event as { slots: number[] }).slots).toHaveLength(2);
    const { a, b } = s.hint!;
    s = reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: b });
    expect(s.hint).toBeNull();
  });

  it('hint picks the free pair with the highest top layer, ties by lowest slot sum, and restarts after step 2', () => {
    const s0 = newGame(L, faces, 11);
    const layerOf = (i: number) => L.slots[i].layer;
    const best = freePairs(s0).reduce((p, q) => {
      const dp = Math.max(layerOf(p[0]), layerOf(p[1]));
      const dq = Math.max(layerOf(q[0]), layerOf(q[1]));
      return dq > dp || (dq === dp && q[0] + q[1] < p[0] + p[1]) ? q : p;
    });
    const s1 = reduce(s0, { type: 'hint' });
    expect(s1.hint).toEqual({ a: best[0], b: best[1], step: 1 });
    expect(s1.event).toEqual({ type: 'hint', slots: [best[0]] });
    const s2 = reduce(s1, { type: 'hint' });
    expect(s2.hint).toEqual({ a: best[0], b: best[1], step: 2 });
    expect(s2.event).toEqual({ type: 'hint', slots: [best[0], best[1]] });
    const s3 = reduce(s2, { type: 'hint' });
    expect(s3.hint).toEqual({ a: best[0], b: best[1], step: 1 });
    expect(s3.event).toEqual({ type: 'hint', slots: [best[0]] });
  });

  it('selecting the hinted tile keeps the hint; selecting another clears it', () => {
    const h = reduce(newGame(L, faces, 11), { type: 'hint' });
    const { a, b } = h.hint!;

    const onA = reduce(h, { type: 'tap', slot: a });
    expect(onA.selected).toBe(a);
    expect(onA.hint).toEqual(h.hint);
    const step2 = reduce(onA, { type: 'hint' });
    expect(step2.hint).toEqual({ a, b, step: 2 });
    expect(step2.selected).toBe(a);

    const onB = reduce(h, { type: 'tap', slot: b });
    expect(onB.selected).toBe(b);
    expect(onB.hint).toEqual(h.hint);

    const other = freeTiles(h).find((i) => i !== a && i !== b)!;
    const onOther = reduce(h, { type: 'tap', slot: other });
    expect(onOther.selected).toBe(other);
    expect(onOther.hint).toBeNull();

    const c = freeOtherFace(h, a);
    const moved = reduce(onA, { type: 'tap', slot: c });
    expect(moved.selected).toBe(c);
    expect(moved.hint).toBeNull();
  });

  it('status: won before stuck; stuck when no free pair', () => {
    let s = newGame(L, faces, 11);
    expect(status(s)).toBe('playing');
    while (freePairs(s).length > 0) s = tapPair(s, firstFreePair(s));
    expect(tilesLeft(s)).toBe(0);
    expect(freePairs(s)).toEqual([]);
    expect(status(s)).toBe('won');

    const stuck = stuckState();
    expect(tilesLeft(stuck)).toBe(2);
    expect(freePairs(stuck)).toEqual([]);
    expect(status(stuck)).toBe('stuck');
  });

  it('hint on a stuck board emits stuckHint', () => {
    const stuck = stuckState();
    const s = reduce(stuck, { type: 'hint' });
    expect(s.event).toEqual({ type: 'stuckHint' });
    expect(s.hint).toBeNull();
    expect(s.board).toEqual(stuck.board);
  });

  it('reduce never mutates its input', () => {
    let s = newGame(L, faces, 11);
    const [a, b] = firstFreePair(s);
    const actions = [
      { type: 'hint' }, { type: 'hint' }, { type: 'tap', slot: a }, { type: 'tap', slot: b },
      { type: 'shuffle' }, { type: 'tap', slot: freeTiles(s)[0] }, { type: 'undo' }, { type: 'undo' }, { type: 'undo' },
    ] as const;
    for (const act of actions) {
      const snap = structuredClone(s);
      const next = reduce(s, act);
      expect(s).toEqual(snap);
      s = next;
    }
    const stuck = stuckState();
    const snap = structuredClone(stuck);
    reduce(stuck, { type: 'hint' });
    expect(stuck).toEqual(snap);
  });

  it('newGame deals deterministically from the attempt seed', () => {
    const s = newGame(L, faces, 11);
    expect(newGame(L, faces, 11)).toEqual(s);
    expect(s).toMatchObject({ selected: null, hint: null, history: [], attemptSeed: 11, shuffleCounter: 0 });
    expect(tilesLeft(s)).toBe(26);
  });
});
