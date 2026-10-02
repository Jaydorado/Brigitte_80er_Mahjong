import { describe, expect, it } from 'vitest';
import { clues } from '../content';
import { layouts } from '../core/layouts';
import { levels, type LevelDef } from './levels';

const TILE_W = 44;
const TEXT_PX = 24;
const GLYPH_EM = 0.6;
const paperWidthPx = (lv: LevelDef, w: number) => (layouts[lv.layoutId].clueRect.w / 2) * w - 2 * 0.1 * w;

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('levels', () => {
  it('are the eight planned levels, in order, each with its own clue', () => {
    expect(levels.map((l) => [l.id, l.layoutId, l.difficulty, l.clueIndex])).toEqual([
      [1, 'rect', 'leicht', 0],
      [2, 'gift', 'leicht', 1],
      [3, 'heart', 'mittel', 2],
      [4, 'flower', 'mittel', 3],
      [5, 'balloons', 'mittel', 4],
      [6, 'train', 'schwer', 5],
      [7, 'pyramid', 'schwer', 6],
      [8, 'eighty', 'schwer', 7],
    ]);
    expect(clues).toHaveLength(levels.length);
  });

  it('only level 8 shows its clue larger than fitted, at 1.5x', () => {
    expect(levels.filter((l) => l.clueScale !== undefined).map((l) => [l.id, l.clueScale])).toEqual([[8, 1.5]]);
  });

  it('the new layouts get their planned face sets; the others keep their layout\'s set', () => {
    const byLayout = Object.fromEntries(levels.map((l) => [l.layoutId, [...l.faces]]));
    expect(byLayout.heart).toEqual([...range(0, 17), 31, 32, 33]);
    expect(byLayout.train).toEqual(range(0, 33));
    expect(byLayout.flower).toEqual(range(0, 17));
    expect(byLayout.balloons).toEqual([...range(0, 17), ...range(27, 30), 31, 32]);
    expect(byLayout.pyramid).toEqual(range(0, 33));
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
