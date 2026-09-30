import { describe, expect, it } from 'vitest';
import { layouts } from '../core/layouts';
import { boardArea, extentOf, fitTileWidth } from './fit';

describe('fit', () => {
  it.each(Object.values(layouts))('layout $id fits tiles ≥ 44 px wide at 640×360', (L) => {
    const { w, h } = boardArea(640, 360);
    expect(fitTileWidth(w, h, extentOf(L.slots))).toBeGreaterThanOrEqual(44);
  });

  it('board area at 640×360 leaves room for the HUD and margins', () => {
    expect(boardArea(640, 360)).toEqual({ w: 552, h: 344 });
  });

  it('safe-area insets shrink the board area', () => {
    expect(boardArea(640, 360, { t: 0, r: 24, b: 0, l: 24 })).toEqual({ w: 552 - 48, h: 344 });
  });
});
