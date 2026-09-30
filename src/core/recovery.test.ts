import { describe, expect, it } from 'vitest';
import { levels } from '../levels/levels';
import { layouts } from './layouts';
import { freePairs, newGame, reduce, status, type GameState } from './game';
import { replayLegal } from './deal';
import { mulberry32, randInt } from './rng';

describe.each(levels)('level $id recovery', (lv) => {
  it('random legal play + Mischen on every stuck state always reaches a win (200 seeds)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = mulberry32(seed * 7919 + lv.id);
      let s: GameState = newGame(layouts[lv.layoutId], lv.faces, seed);
      let shuffles = 0;
      while (status(s) !== 'won') {
        if (status(s) === 'stuck') {
          s = reduce(s, { type: 'shuffle' });
          expect(replayLegal(s.idx, s.board, s.witness)).toBe(true);
          expect(++shuffles).toBeLessThanOrEqual(100);
          continue;
        }
        const pairs = freePairs(s);
        const [a, b] = pairs[randInt(rng, pairs.length)];
        s = reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: b });
      }
    }
  }, 60_000);
});
