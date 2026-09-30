import { describe, expect, it } from 'vitest';
import { buildIndex, slotsFromMasks, type Layout } from './layout';
import { deal, peel, replayLegal, shuffleBoard, type Board } from './deal';
import { mulberry32 } from './rng';
import { solvable } from './solver';

function mkLayout(masks: string[][]): Layout {
  const slots = slotsFromMasks(masks);
  const idx = buildIndex(slots);
  const certificate = peel(idx, slots.map(() => true), mulberry32(1), 1000)!;
  return { id: 'rect', slots, clueRect: { col: 0, row: 0, w: 2, h: 2 }, certificate };
}
const L = mkLayout([['######', '######', '######'], ['.####.', '.####.']]); // 26 tiles

describe('deal', () => {
  it('is deterministic per seed', () => {
    const idx = buildIndex(L.slots);
    expect(deal(L, idx, [0, 1, 2, 3], 7)).toEqual(deal(L, idx, [0, 1, 2, 3], 7));
  });
  it('witness replays legally for 200 seeds', () => {
    const idx = buildIndex(L.slots);
    for (let s = 0; s < 200; s++) {
      const { board, witness } = deal(L, idx, [0, 1, 2, 3, 4], s);
      expect(replayLegal(idx, board, witness)).toBe(true);
    }
  });
  it('per-face pair counts differ by at most 1', () => {
    const idx = buildIndex(L.slots);
    const { board } = deal(L, idx, [0, 1, 2, 3, 4], 3);
    const counts = new Map<number, number>();
    for (const f of board.faceAt) counts.set(f, (counts.get(f) ?? 0) + 1);
    const pairs = [...counts.values()].map((c) => c / 2);
    expect(Math.max(...pairs) - Math.min(...pairs)).toBeLessThanOrEqual(1);
  });
});

describe('shuffleBoard', () => {
  it('keeps the face multiset and yields a legal witness (in place)', () => {
    const idx = buildIndex(L.slots);
    const { board } = deal(L, idx, [0, 1, 2, 3, 4], 5);
    const r = shuffleBoard(L, idx, board, 99);
    const ms = (b: Board) => b.faceAt.filter((_, i) => b.occupied[i]).sort((a, b) => a - b);
    expect(ms(r.board)).toEqual(ms(board));
    expect(replayLegal(idx, r.board, r.witness)).toBe(true);
  });

  it('relocates the stacked-twin trap (review Appendix A) and stays solvable', () => {
    // A(0,0,0) B(0,0,1) C(2,0,0) D(0,2,0); after C+D removed only A (covered) and B remain.
    const slots = [
      { col: 0, row: 0, layer: 0 }, { col: 0, row: 0, layer: 1 },
      { col: 2, row: 0, layer: 0 }, { col: 0, row: 2, layer: 0 },
    ];
    const idx = buildIndex(slots);
    const trap: Layout = { id: 'rect', slots, clueRect: { col: 0, row: 0, w: 2, h: 2 }, certificate: [[1, 2], [0, 3]] };
    const board: Board = { occupied: [true, true, false, false], faceAt: [5, 5, 5, 5] };
    const r = shuffleBoard(trap, idx, board, 1);
    expect(r.moves).not.toBeNull();
    expect(replayLegal(idx, r.board, r.witness)).toBe(true);
    expect(solvable(idx, r.board)).toBe(true);
  });

  it('relocation zips old tiles and suffix slots in (layer, row, col) order, leaving the input untouched', () => {
    const slots = [
      { col: 0, row: 0, layer: 0 }, { col: 0, row: 0, layer: 1 },
      { col: 2, row: 0, layer: 0 }, { col: 0, row: 2, layer: 0 },
    ];
    const idx = buildIndex(slots);
    const trap: Layout = { id: 'rect', slots, clueRect: { col: 0, row: 0, w: 2, h: 2 }, certificate: [[1, 2], [0, 3]] };
    const board: Board = { occupied: [true, true, false, false], faceAt: [5, 5, 5, 5] };
    const snap = structuredClone(board);
    const r = shuffleBoard(trap, idx, board, 1);
    expect(r.moves).toEqual([{ from: 0, to: 0 }, { from: 1, to: 3 }]);
    expect(r.board.occupied).toEqual([true, false, false, true]);
    expect(r.witness).toEqual([[0, 3]]);
    expect(board).toEqual(snap);
  });

  it('in-place shuffle never mutates the input board', () => {
    const idx = buildIndex(L.slots);
    const { board } = deal(L, idx, [0, 1, 2, 3, 4], 5);
    const snap = structuredClone(board);
    expect(shuffleBoard(L, idx, board, 99).moves).toBeNull();
    expect(board).toEqual(snap);
  });

  it('throws when a face has an odd number of tiles left', () => {
    const idx = buildIndex(L.slots);
    const { board } = deal(L, idx, [0, 1, 2, 3, 4], 5);
    const bad: Board = { occupied: board.occupied.slice(), faceAt: board.faceAt.slice() };
    const i = bad.faceAt.findIndex((f) => f !== bad.faceAt[0]);
    bad.faceAt[i] = bad.faceAt[0];
    expect(() => shuffleBoard(L, idx, bad, 1)).toThrow();
  });
});

describe('peel', () => {
  it('does not mutate occupied and returns a legal pairing of exactly the occupied set', () => {
    const idx = buildIndex(L.slots);
    const occ = L.slots.map(() => true);
    const order = peel(idx, occ, mulberry32(42), 1000);
    expect(occ.every(Boolean)).toBe(true);
    expect(order).not.toBeNull();
    expect(order!.flat().sort((a, b) => a - b)).toEqual(L.slots.map((_, i) => i));
  });
  it('returns null when no removal order exists (tile stacked on its only partner)', () => {
    const idx = buildIndex([{ col: 0, row: 0, layer: 0 }, { col: 0, row: 0, layer: 1 }]);
    expect(peel(idx, [true, true], mulberry32(1), 50)).toBeNull();
  });
});
