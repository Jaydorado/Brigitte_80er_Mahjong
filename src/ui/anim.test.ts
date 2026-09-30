import { describe, expect, it } from 'vitest';
import { buildIndex, type Layout } from '../core/layout';
import { layouts } from '../core/layouts';
import { newGame, reduce } from '../core/game';
import { shuffleBoard, type Board } from '../core/deal';
import { undoShuffleFlights } from './anim';

// The stacked-twin trap from deal.test.ts: its only shuffle relocates tile 1 onto slot 3.
const slots = [
  { col: 0, row: 0, layer: 0 }, { col: 0, row: 0, layer: 1 },
  { col: 2, row: 0, layer: 0 }, { col: 0, row: 2, layer: 0 },
];
const trap: Layout = { id: 'rect', slots, clueRect: { col: 0, row: 0, w: 2, h: 2 }, certificate: [[1, 2], [0, 3]] };

describe('undoShuffleFlights', () => {
  it('flies every relocated tile straight back: the exact inverse of the shuffle moves', () => {
    const before: Board = { occupied: [true, true, false, false], faceAt: [5, 5, 5, 5] };
    const r = shuffleBoard(trap, buildIndex(slots), before, 1);
    expect(r.moves).not.toBeNull();
    const back = undoShuffleFlights(slots, r.board, before);
    const forward = r.moves!.filter((m) => m.from !== m.to);
    expect(back).toEqual(forward.map((m) => ({ from: m.to, to: m.from })));
  });

  it('an in-place shuffle undoes in place (null), like the forward shuffle', () => {
    const L = layouts.rect;
    const s0 = newGame(L, [0, 1, 2, 3, 4, 5, 6, 7], 3);
    const s1 = reduce(s0, { type: 'shuffle' });
    expect(s1.event).toEqual({ type: 'shuffled', moves: null });
    const s2 = reduce(s1, { type: 'undo' });
    if (s2.event.type !== 'undoShuffle') throw new Error('expected undoShuffle');
    expect(undoShuffleFlights(L.slots, s2.event.after, s2.event.before)).toBeNull();
  });
});
