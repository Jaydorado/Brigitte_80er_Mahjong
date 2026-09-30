import { describe, expect, it } from 'vitest';
import { buildIndex, freeSlots, isFree, slotsFromMasks, type Slot } from './layout';

const all = (n: number) => Array(n).fill(true) as boolean[];

describe('isFree', () => {
  it('row of three: ends free, middle blocked', () => {
    const s = slotsFromMasks([['###']]);
    const idx = buildIndex(s);
    expect(freeSlots(idx, all(3))).toEqual([0, 2]);
  });
  it('middle becomes free when one side is removed', () => {
    const idx = buildIndex(slotsFromMasks([['###']]));
    expect(isFree(1, idx, [false, true, true])).toBe(true);
  });
  it('full overlap from above blocks', () => {
    const s: Slot[] = [{ col: 0, row: 0, layer: 0 }, { col: 0, row: 0, layer: 1 }];
    const idx = buildIndex(s);
    expect(isFree(0, idx, [true, true])).toBe(false);
    expect(isFree(1, idx, [true, true])).toBe(true);
  });
  it('half-offset overlap from above blocks both tiles below', () => {
    const s: Slot[] = [{ col: 0, row: 0, layer: 0 }, { col: 2, row: 0, layer: 0 }, { col: 1, row: 0, layer: 1 }];
    const idx = buildIndex(s);
    expect(freeSlots(idx, all(3))).toEqual([2]);
  });
  it('half-row vertical offset still counts as a side neighbour', () => {
    const s: Slot[] = [{ col: 0, row: 0, layer: 0 }, { col: 2, row: 1, layer: 0 }, { col: 4, row: 0, layer: 0 }];
    expect(isFree(1, buildIndex(s), all(3))).toBe(false);
  });
  it('diagonal neighbour two rows down is not a side neighbour', () => {
    const s: Slot[] = [{ col: 0, row: 0, layer: 0 }, { col: 2, row: 2, layer: 0 }, { col: 4, row: 0, layer: 0 }];
    expect(isFree(1, buildIndex(s), all(3))).toBe(true);
  });
});

describe('slotsFromMasks', () => {
  it('orders by layer, row, col in half units', () => {
    expect(slotsFromMasks([['#.#'], ['..#']])).toEqual([
      { col: 0, row: 0, layer: 0 }, { col: 4, row: 0, layer: 0 }, { col: 4, row: 0, layer: 1 },
    ]);
  });
});
