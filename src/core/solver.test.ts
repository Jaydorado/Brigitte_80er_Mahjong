import { describe, expect, it } from 'vitest';
import { buildIndex, freeSlots, slotsFromMasks, type Layout } from './layout';
import { deal, peel, replayLegal, shuffleBoard, type Board } from './deal';
import { mulberry32, randInt } from './rng';
import { solvable } from './solver';

function mkLayout(masks: string[][]): Layout {
  const slots = slotsFromMasks(masks);
  const certificate = peel(buildIndex(slots), slots.map(() => true), mulberry32(1), 1000)!;
  return { id: 'rect', slots, clueRect: { col: 0, row: 0, w: 2, h: 2 }, certificate };
}

describe('solvable', () => {
  it('is true on a fresh 2x3 single-layer deal', () => {
    const L = mkLayout([['###', '###']]);
    const idx = buildIndex(L.slots);
    expect(solvable(idx, deal(L, idx, [0, 1, 2], 4).board)).toBe(true);
  });

  it('is false on the stacked-twin trap board', () => {
    const idx = buildIndex([
      { col: 0, row: 0, layer: 0 }, { col: 0, row: 0, layer: 1 },
      { col: 2, row: 0, layer: 0 }, { col: 0, row: 2, layer: 0 },
    ]);
    expect(solvable(idx, { occupied: [true, true, false, false], faceAt: [5, 5, 5, 5] })).toBe(false);
  });

  it('is false on a single row whose free ends show different faces', () => {
    const idx = buildIndex(slotsFromMasks([['####']]));
    expect(solvable(idx, { occupied: [true, true, true, true], faceAt: [1, 1, 2, 2] })).toBe(false);
  });

  it('confirms shuffleBoard after random legal play on a 12-tile layout, 100 seeds', () => {
    const L = mkLayout([['####', '####'], ['.##.', '.##.']]);
    expect(L.slots.length).toBe(12);
    const idx = buildIndex(L.slots);
    let rescued = 0; // boards that were already dead before shuffling
    for (let s = 0; s < 100; s++) {
      const board: Board = deal(L, idx, [0, 1, 2], s).board;
      const play = mulberry32(1000 + s);
      const depth = randInt(play, 6);
      for (let step = 0; step < depth; step++) {
        const f = freeSlots(idx, board.occupied);
        const matches: [number, number][] = [];
        for (let a = 0; a < f.length; a++) {
          for (let b = a + 1; b < f.length; b++) {
            if (board.faceAt[f[a]] === board.faceAt[f[b]]) matches.push([f[a], f[b]]);
          }
        }
        if (matches.length === 0) break;
        const [a, b] = matches[randInt(play, matches.length)];
        board.occupied[a] = false;
        board.occupied[b] = false;
      }
      if (!solvable(idx, board)) rescued++;
      const r = shuffleBoard(L, idx, board, 7 * s + 1);
      expect(replayLegal(idx, r.board, r.witness)).toBe(true);
      expect(solvable(idx, r.board)).toBe(true);
    }
    expect(rescued).toBeGreaterThan(0);
  });
});
