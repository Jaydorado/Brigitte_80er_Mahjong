import { describe, expect, it } from 'vitest';
import { clues } from '../content';
import { layouts } from '../core/layouts';
import { levels, type LevelDef } from './levels';

const TILE_W = 44;
const TEXT_PX = 24;
const GLYPH_EM = 0.6;
const paperWidthPx = (lv: LevelDef, w: number) => (layouts[lv.layoutId].clueRect.w / 2) * w - 2 * 0.1 * w;

describe('levels', () => {
  it('face lists have the planned lengths', () => {
    expect(levels.map((l) => l.faces.length)).toEqual([9, 12, 18, 24, 34, 34]);
  });

  it.each(levels)('level $id has at least as many pairs as faces', (lv) => {
    expect(layouts[lv.layoutId].slots.length / 2).toBeGreaterThanOrEqual(lv.faces.length);
  });

  it.each(levels)('level $id: longest clue word fits the clue paper at 24 px', (lv) => {
    const words = clues[lv.clueIndex].split(/ |(?<=\/)/);
    const longest = Math.max(...words.map((word) => word.length));
    expect(longest * TEXT_PX * GLYPH_EM).toBeLessThanOrEqual(paperWidthPx(lv, TILE_W) - 16);
  });
});
