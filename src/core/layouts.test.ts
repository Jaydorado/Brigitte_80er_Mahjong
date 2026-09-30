import { describe, expect, it } from 'vitest';
import { layouts } from './layouts';
import { levels } from '../levels/levels';
import { buildIndex } from './layout';
import { peel, replayLegal } from './deal';
import { mulberry32 } from './rng';

const expected = { rect: [36, 2], gift: [48, 2], flower: [64, 3], balloons: [72, 3], pyramid: [88, 4], eighty: [96, 4] } as const;

describe.each(Object.values(layouts))('layout $id', (L) => {
  const idx = buildIndex(L.slots);
  it('has the planned tile and layer count', () => {
    const [n, layers] = expected[L.id];
    expect(L.slots.length).toBe(n);
    expect(new Set(L.slots.map((s) => s.layer)).size).toBe(layers);
  });
  it('has no overlapping slots on one layer', () => {
    for (let i = 0; i < L.slots.length; i++) for (let j = i + 1; j < L.slots.length; j++) {
      const a = L.slots[i], b = L.slots[j];
      if (a.layer === b.layer) expect(Math.abs(a.col - b.col) < 2 && Math.abs(a.row - b.row) < 2).toBe(false);
    }
  });
  it('layer-0 bounding box is at most 11 × 5 tiles', () => {
    const l0 = L.slots.filter((s) => s.layer === 0);
    const across = (Math.max(...l0.map((s) => s.col)) - Math.min(...l0.map((s) => s.col))) / 2 + 1;
    const down = (Math.max(...l0.map((s) => s.row)) - Math.min(...l0.map((s) => s.row))) / 2 + 1;
    expect(across).toBeLessThanOrEqual(11);
    expect(down).toBeLessThanOrEqual(5);
  });
  it('clueRect is covered by layer 0 (every half-unit cell inside it lies in some layer-0 footprint)', () => {
    const r = L.clueRect;
    for (let c = r.col; c < r.col + r.w; c++) for (let rr = r.row; rr < r.row + r.h; rr++)
      expect(L.slots.some((s) => s.layer === 0 && c >= s.col && c < s.col + 2 && rr >= s.row && rr < s.row + 2)).toBe(true);
  });
  it('stored certificate replays on the full board', () => {
    expect(replayLegal(idx, { occupied: L.slots.map(() => true), faceAt: L.slots.map(() => 0) }, L.certificate)).toBe(true);
  });
  it('random peel succeeds for 1000 seeds within 1000 tries', () => {
    for (let s = 0; s < 1000; s++) expect(peel(idx, L.slots.map(() => true), mulberry32(s), 1000)).not.toBeNull();
  });
});

it('levels reference six distinct clues in order', () => {
  expect(levels.map((l) => l.clueIndex)).toEqual([0, 1, 2, 3, 4, 5]);
});
