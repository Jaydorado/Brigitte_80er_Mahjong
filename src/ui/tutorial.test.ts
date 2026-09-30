/** The tutorial's "what makes a tile free" examples must exist on level 1 after the first match. */
import { describe, expect, it } from 'vitest';
import { freePairs, newGame, reduce } from '../core/game';
import { isFree } from '../core/layout';
import { layouts } from '../core/layouts';
import { attemptSeed, levels } from '../levels/levels';
import { explainTargets } from './tutorial';

describe('explainTargets', () => {
  it('finds a covered tile and a boxed-in tile with nothing on top on every level-1 deal', () => {
    const level = levels[0];
    for (let attempt = 1; attempt <= 40; attempt++) {
      let s = newGame(layouts[level.layoutId], level.faces, attemptSeed(level.id, attempt));
      const [a, b] = freePairs(s)[0];
      s = reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: b });
      const { covered, boxedIn } = explainTargets(s);
      expect(covered).not.toBeNull();
      expect(boxedIn).not.toBeNull();
      const { occupied } = s.board;
      expect(occupied[covered!]).toBe(true);
      expect(s.idx.above[covered!].some((j) => occupied[j])).toBe(true);
      expect(isFree(covered!, s.idx, occupied)).toBe(false);
      expect(occupied[boxedIn!]).toBe(true);
      expect(s.idx.above[boxedIn!].some((j) => occupied[j])).toBe(false);
      expect(isFree(boxedIn!, s.idx, occupied)).toBe(false);
    }
  });
});
