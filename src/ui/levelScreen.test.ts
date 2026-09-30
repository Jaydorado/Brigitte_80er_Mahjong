/**
 * Level screen lifecycle with the rendering modules mocked out: the order of the win's save and its
 * animation, the stuck offer around a leave question, and the confetti handoff to `onWon`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freePairs, newGame, reduce, status, type GameState } from '../core/game';
import { layouts } from '../core/layouts';
import { attemptSeed, levels, type LevelDef } from '../levels/levels';
import { freshSave, nextAttempt, type SaveV1 } from '../progress/save';
import { mountLevel } from './levelScreen'; // vi.mock calls below are hoisted above this import
import type { TutorialCtx } from './tutorial';

const h = vi.hoisted(() => ({
  log: [] as string[],
  tap: null as ((slot: number) => void) | null,
  hud: null as { back(): void; hint(): void; undo(): void; shuffle(): void } | null,
  stuckOpen: 0,
  stuckOpts: null as { onDismiss?(): void } | null,
  leave: null as ((yes: boolean) => void) | null,
  idle: null as (() => void) | null,
  tut: null as TutorialCtx | null,
  saves: [] as SaveV1[],
}));

vi.mock('./atlas', () => ({ atlasDpr: () => 1, bakeAtlas: async () => ({}), releaseAtlas: () => {} }));
vi.mock('./frame', () => ({ measureFrame: () => ({ w: 40, area: { x: 0, y: 0, w: 700, h: 340 } }) }));
vi.mock('./cluePaper', () => ({ createCluePaper: () => ({ el: {}, place() {}, fitText: async () => 16 }) }));
vi.mock('./board', () => ({
  createBoard: () => ({
    el: { prepend() {} },
    onTap: (cb: (slot: number) => void) => (h.tap = cb),
    fit() {},
    render() {},
    destroy() {},
  }),
}));
vi.mock('./hud', () => ({
  createHud: (on: typeof h.hud) => {
    h.hud = on;
    return { el: { querySelectorAll: () => [{}, {}, {}] }, update() {} };
  },
}));
vi.mock('./anim', () => ({
  BoardAnimator: class {
    play(_: GameState, next: GameState) {
      h.log.push(`play ${next.event.type}`);
    }
    finishAll() {}
    cancelAll() {}
  },
}));
vi.mock('./dialogs', () => ({
  showStuck: (_: unknown, opts: { onDismiss?(): void }) => {
    h.stuckOpen++;
    h.stuckOpts = opts;
    return () => {};
  },
  confirmLeave: () => {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    h.leave = resolve;
    return promise;
  },
}));
vi.mock('./tutorial', () => ({
  startTutorial: (ctx: TutorialCtx) => {
    h.tut = ctx;
    h.log.push('tutorial start');
    return () => h.log.push('tutorial cancel');
  },
}));
vi.mock('./fx', () => ({
  createFx: () => ({
    sparkle() {},
    confetti: async () => {
      h.log.push('confetti');
    },
    fireworks: async () => {},
    idle: () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      h.idle = resolve;
      h.log.push('idle?');
      return promise;
    },
    destroy() {},
  }),
}));

function fakeEl(): Record<string, unknown> {
  return {
    style: {},
    dataset: {},
    className: '',
    innerHTML: '',
    textContent: '',
    append() {},
    prepend() {},
    replaceChildren() {},
    remove() {},
  };
}

/** The game the screen deals for `level` from `save`, replayed here to know the moves. */
function dealt(level: LevelDef, save: SaveV1): GameState {
  const { attempt } = nextAttempt(save, level.id);
  return newGame(layouts[level.layoutId], level.faces, attemptSeed(level.id, attempt));
}

beforeEach(() => {
  vi.useFakeTimers();
  h.log.length = 0;
  h.tap = null;
  h.stuckOpen = 0;
  h.stuckOpts = null;
  h.leave = null;
  h.idle = null;
  h.tut = null;
  h.saves.length = 0;
  vi.stubGlobal('document', { createElement: fakeEl });
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('addEventListener', () => {});
  vi.stubGlobal('removeEventListener', () => {});
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('history', { state: null, pushState() {}, back() {} });
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(level: LevelDef, save: SaveV1, onWon: () => void = () => {}): Promise<() => void> {
  const unmount = mountLevel(fakeEl() as unknown as HTMLElement, level, {
    save,
    persist: (s) => {
      h.saves.push(s);
      h.log.push(`persist won=${JSON.stringify(s.won)}`);
    },
    onExit: () => h.log.push('exit'),
    onWon,
  });
  await vi.advanceTimersByTimeAsync(0); // the mocked atlas bake resolves; the board appears
  expect(h.tap).not.toBeNull();
  return unmount;
}

/** A level and save whose deal a greedy `freePairs[0]` player drives into 'stuck'. */
function stuckSetup(): { level: LevelDef; save: SaveV1; moves: [number, number][] } {
  for (let n = 0; n < 12; n++) {
    for (const level of levels) {
      let save = freshSave();
      for (let k = 0; k < n; k++) save = nextAttempt(save, level.id).save;
      let s = dealt(level, save);
      const moves: [number, number][] = [];
      while (status(s) === 'playing') {
        const [a, b] = freePairs(s)[0];
        moves.push([a, b]);
        s = reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: b });
      }
      if (status(s) === 'stuck') return { level, save, moves };
    }
  }
  throw new Error('no greedy stuck deal found');
}

describe('level screen lifecycle', () => {
  it('saves the win before the last match animates', async () => {
    const level = levels[0];
    const save = freshSave();
    await mount(level, save);
    for (const [a, b] of dealt(level, save).witness) {
      h.tap!(a);
      h.tap!(b);
    }
    const won = h.log.findIndex((l) => l === 'persist won=[1]');
    const lastMatch = h.log.lastIndexOf('play matched');
    expect(won).toBeGreaterThanOrEqual(0);
    expect(won).toBeLessThan(lastMatch);
  });

  it('hands over to onWon only when the confetti has actually landed (effect clock), not after wall time', async () => {
    const level = levels[0];
    const save = freshSave();
    const onWon = vi.fn();
    await mount(level, save, onWon);
    for (const [a, b] of dealt(level, save).witness) {
      h.tap!(a);
      h.tap!(b);
    }
    await vi.advanceTimersByTimeAsync(10_000); // a hidden tab: wall time passes, the effect clock does not
    expect(h.log).toContain('confetti');
    expect(onWon).not.toHaveBeenCalled();
    h.idle!();
    await vi.advanceTimersByTimeAsync(0);
    expect(onWon).toHaveBeenCalledTimes(1);
  });

  it('offers the stuck dialog after a leave question the player turned down', async () => {
    const { level, save, moves } = stuckSetup();
    await mount(level, save);
    for (const [a, b] of moves) {
      h.tap!(a);
      h.tap!(b);
    }
    h.hud!.back(); // asks before the stuck offer is due
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.stuckOpen).toBe(0);
    h.leave!(false); // Weiterspielen
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.stuckOpen).toBe(1);
  });

  it('a stuck dialog the player dismissed stays closed after a turned-down leave question', async () => {
    const { level, save, moves } = stuckSetup();
    await mount(level, save);
    for (const [a, b] of moves) {
      h.tap!(a);
      h.tap!(b);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.stuckOpen).toBe(1);
    h.stuckOpts!.onDismiss!(); // ×
    h.hud!.back();
    h.leave!(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.stuckOpen).toBe(1);
  });

  it('a stuck dialog closed by the leave question comes back after Weiterspielen', async () => {
    const { level, save, moves } = stuckSetup();
    await mount(level, save);
    for (const [a, b] of moves) {
      h.tap!(a);
      h.tap!(b);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.stuckOpen).toBe(1);
    h.hud!.back();
    h.leave!(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.stuckOpen).toBe(2);
  });

  describe('tutorial', () => {
    const done = (): SaveV1 => ({ ...freshSave(), tutorialDone: true });

    it('starts on level 1 after the board settled, not before and not once done', async () => {
      await mount(levels[0], freshSave());
      expect(h.tut).toBeNull();
      await vi.advanceTimersByTimeAsync(500);
      expect(h.tut).not.toBeNull();
    });

    it('does not start when done, nor on other levels', async () => {
      const unmount = await mount(levels[0], done());
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.tut).toBeNull();
      unmount();
      await mount(levels[1], freshSave());
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.tut).toBeNull();
    });

    it('routes board taps to the tutorial while it runs and saves tutorialDone (keeping the win later) when it is done', async () => {
      const level = levels[0];
      const save = freshSave();
      await mount(level, save);
      await vi.advanceTimersByTimeAsync(500);
      const taps: number[] = [];
      h.tut!.board.onTap((slot) => taps.push(slot));
      h.tap!(3);
      expect(taps).toEqual([3]);
      expect(h.log).not.toContain('play selected');
      expect(h.log).not.toContain('play blocked');

      h.tut!.onDone();
      expect(h.saves.at(-1)).toMatchObject({ tutorialDone: true, won: [] });
      h.tap!(dealt(level, save).witness[0][0]); // the board plays again
      expect(h.log).toContain('play selected');
      expect(taps).toEqual([3]);
      h.tap!(dealt(level, save).witness[0][0]); // deselect
      for (const [a, b] of dealt(level, save).witness) {
        h.tap!(a);
        h.tap!(b);
      }
      expect(h.log).toContain('persist won=[1]');
      expect(h.saves.at(-1)).toMatchObject({ tutorialDone: true, won: [1] });
    });

    it('unmounting mid-tutorial cancels it without saving', async () => {
      const unmount = await mount(levels[0], freshSave());
      await vi.advanceTimersByTimeAsync(500);
      const persists = h.log.filter((l) => l.startsWith('persist')).length;
      unmount();
      expect(h.log).toContain('tutorial cancel');
      expect(h.log.filter((l) => l.startsWith('persist')).length).toBe(persists);
    });

    it('unmounting before it started never starts it', async () => {
      const unmount = await mount(levels[0], freshSave());
      unmount();
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.tut).toBeNull();
    });
  });
});
