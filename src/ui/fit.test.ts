import { describe, expect, it } from 'vitest';
import { layouts } from '../core/layouts';
import { boardArea, depthCount, depthOf, extentOf, fitTileWidth, SHADES, TILE } from './fit';

describe('fit', () => {
  it.each(Object.values(layouts))('layout $id fits tiles ≥ 44 px wide at 640×360 on its all-slot extent', (L) => {
    const { w, h } = boardArea(640, 360);
    expect(fitTileWidth(w, h, extentOf(L.slots))).toBeGreaterThanOrEqual(44);
  });

  it('the layer offset and the side edge are never thinner than §1 (a layout that does not fit is reshaped instead)', () => {
    expect(TILE.layerShift).toBeGreaterThanOrEqual(0.14);
    expect(TILE.edge).toBeGreaterThanOrEqual(0.22);
  });

  it('board area at 640×360 leaves room for the HUD and margins', () => {
    expect(boardArea(640, 360)).toEqual({ w: 552, h: 344 });
  });

  it('safe-area insets shrink the board area', () => {
    expect(boardArea(640, 360, { t: 0, r: 24, b: 0, l: 24 })).toEqual({ w: 552 - 48, h: 344 });
  });
});

describe('depth and shade', () => {
  it('depth counts layers down from the layout’s highest layer: the top is 0, the floor is maxLayer', () => {
    const e = { across: 3, down: 2, maxLayer: 3 };
    expect([3, 2, 1, 0].map((layer) => depthOf({ col: 0, row: 0, layer }, e))).toEqual([0, 1, 2, 3]);
  });

  it('the top layer is unshaded and each deeper layer is darker than the one above it', () => {
    expect(SHADES[0]).toBe(0);
    for (let d = 1; d < SHADES.length; d++) expect(SHADES[d]).toBeGreaterThan(SHADES[d - 1]);
  });

  it('every layout’s slot depths run 0 … depthCount − 1, and the shade table covers them', () => {
    for (const L of Object.values(layouts)) {
      const e = extentOf(L.slots);
      const depths = new Set(L.slots.map((s) => depthOf(s, e)));
      const n = depthCount(L.slots);
      expect([...depths].sort(), L.id).toEqual(Array.from({ length: n }, (_, d) => d));
      expect(n, L.id).toBeLessThanOrEqual(SHADES.length);
    }
  });
});
