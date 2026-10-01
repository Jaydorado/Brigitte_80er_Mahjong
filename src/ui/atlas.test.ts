import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { layouts } from '../core/layouts';
import { levels } from '../levels/levels';
import {
  ATLAS_GUTTER, atlasLayout, atlasSize, cellOrigin, createAtlasCache, createStepEstimate, MIN_IDLE_MS, RECENT_MS, RECENT_STEPS,
  SETUP_SEED_MS_PER_MPX, setUpBitmap, STARVED_MS, STEP_MARGIN_MS, whenIdle, type Atlas, type AtlasCacheDeps, type BakeJob,
} from './atlas';
import { depthCount } from './fit';

const FACES = [0, 1, 2];
/** Depth count of the fixture bakes. */
const D = 2;
const STEPS = 3;

/** Lets every pending promise continuation run (the fakes below never touch a timer). */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/**
 * A cache whose bakes draw in STEPS paced steps, with idle time handed out by the test. While
 * `exporting` is set, a draw that has taken its last step waits on it (the canvas export); while
 * `decoding` is set, the load waits on it (the blob URL's image decode).
 */
function harness() {
  const idleQueue: (() => void)[] = [];
  const bakes: { w: number; dpr: number; depths: number }[] = [];
  const loads: string[] = [];
  const revoked: Atlas[] = [];
  let exporting: PromiseWithResolvers<void> | null = null;
  let decoding: PromiseWithResolvers<void> | null = null;
  const deps: AtlasCacheDeps<string> = {
    async draw(_faces, depths, w, dpr, job) {
      bakes.push({ w, dpr, depths });
      for (let i = 0; i < STEPS; i++) await job.step();
      await exporting?.promise;
      return `blob:${w}@${dpr}#${bakes.length}`;
    },
    async load(url) {
      loads.push(url);
      await decoding?.promise;
      return { url } as unknown as Atlas;
    },
    revoke: (a) => revoked.push(a),
    idle(cb) {
      idleQueue.push(cb);
      return () => {
        const i = idleQueue.indexOf(cb);
        if (i >= 0) idleQueue.splice(i, 1);
      };
    },
  };
  /** Runs every idle callback, including ones queued meanwhile, until none are left. */
  const idle = async (): Promise<void> => {
    for (let n = 0; n < 100; n++) {
      await settle();
      const cb = idleQueue.shift();
      if (cb === undefined) return;
      cb();
    }
  };
  const holdExport = (): PromiseWithResolvers<void> => (exporting = Promise.withResolvers<void>());
  const holdDecode = (): PromiseWithResolvers<void> => (decoding = Promise.withResolvers<void>());
  return { cache: createAtlasCache(deps), bakes, loads, revoked, idle, idleQueue, holdExport, holdDecode };
}

describe('atlas cache', () => {
  it('keys on tile width, DPR and depth count: any other one is another bake, the same one is shared', async () => {
    const { cache, bakes } = harness();
    const a = await cache.acquire(FACES, D, 40, 3);
    const b = await cache.acquire(FACES, D, 40, 2);
    const c = await cache.acquire(FACES, D, 41, 3);
    const d = await cache.acquire(FACES, D + 1, 40, 3);
    const again = await cache.acquire(FACES, D, 40, 3);
    expect(bakes).toEqual([
      { w: 40, dpr: 3, depths: D }, { w: 40, dpr: 2, depths: D }, { w: 41, dpr: 3, depths: D }, { w: 40, dpr: 3, depths: D + 1 },
    ]);
    expect(new Set([a, b, c, d]).size).toBe(4);
    expect(again).toBe(a);
  });

  it('a pre-bake with another depth count is not taken for the level: the level bakes its own', async () => {
    const { cache, bakes, idle } = harness();
    cache.prebake(FACES, D, () => ({ w: 40, dpr: 3 }));
    await idle();
    await cache.acquire(FACES, D + 1, 40, 3);
    expect(bakes).toEqual([{ w: 40, dpr: 3, depths: D }, { w: 40, dpr: 3, depths: D + 1 }]);
  });

  it('the map’s pre-bake is the atlas its level acquires: both pass the level’s faces and its layout’s depth count', async () => {
    const { cache, bakes, idle } = harness();
    const level = levels[levels.length - 1];
    const depths = depthCount(layouts[level.layoutId].slots);
    cache.prebake(level.faces, depths, () => ({ w: 47, dpr: 3 }));
    await idle();
    await cache.acquire(level.faces, depths, 47, 3);
    expect(bakes).toEqual([{ w: 47, dpr: 3, depths }]);
  });

  it('a level acquiring a finished pre-bake gets it without baking again', async () => {
    const { cache, bakes, idle } = harness();
    const stop = cache.prebake(FACES, D, () => ({ w: 40, dpr: 3 }));
    await idle();
    stop(); // leaving the map after the pre-bake finished keeps it
    const a = await cache.acquire(FACES, D, 40, 3);
    expect(bakes).toHaveLength(1);
    expect(a.url).toBe('blob:40@3#1');
  });

  it('a level acquiring in the same task as the map cancel takes the pre-bake over and finishes it without idle time', async () => {
    const { cache, bakes, idle, idleQueue } = harness();
    const stop = cache.prebake(FACES, D, () => ({ w: 40, dpr: 3 }));
    idleQueue.shift()!(); // the map idles once: the pre-bake starts and waits for its first step
    await settle();
    expect(bakes).toHaveLength(1);
    stop(); // router: unmount the map ...
    const p = cache.acquire(FACES, D, 40, 3); // ... then mount the level, same task
    await expect(p).resolves.toMatchObject({ url: 'blob:40@3#1' });
    expect(idleQueue).toHaveLength(0); // no step waited for idle time after the take-over
    await idle();
    expect(bakes).toHaveLength(1);
  });

  it('leaving the map drops a pre-bake nobody took over; the level then bakes afresh', async () => {
    const { cache, bakes, idle, idleQueue } = harness();
    const stop = cache.prebake(FACES, D, () => ({ w: 40, dpr: 3 }));
    idleQueue.shift()!();
    await settle();
    stop();
    await idle();
    expect(idleQueue).toHaveLength(0); // the dropped bake asks for no more idle time
    const a = await cache.acquire(FACES, D, 40, 3);
    expect(bakes).toHaveLength(2);
    expect(a.url).toBe('blob:40@3#2');
  });

  it('a cancel before the map was ever idle bakes nothing', async () => {
    const { cache, bakes, idle } = harness();
    cache.prebake(FACES, D, () => ({ w: 40, dpr: 3 }))();
    await idle();
    expect(bakes).toHaveLength(0);
  });

  it('never revokes an atlas in use; keeps one unused spare and revokes older ones', async () => {
    const { cache, revoked } = harness();
    const a = await cache.acquire(FACES, D, 40, 3);
    const b = await cache.acquire(FACES, D, 41, 3);
    const c = await cache.acquire(FACES, D, 42, 3);
    cache.release(a);
    expect(revoked).toEqual([]); // a is the spare
    cache.release(b);
    expect(revoked).toEqual([a]); // b is the newer spare
    expect(revoked).not.toContain(c);
    expect(await cache.acquire(FACES, D, 41, 3)).toBe(b); // the spare is reused, not re-baked
  });

  it('after its export a pre-bake waits for idle time again before it decodes (so a hidden page holds it there)', async () => {
    const { cache, loads, idle, idleQueue, holdExport } = harness();
    const exported = holdExport();
    cache.prebake(FACES, D, () => ({ w: 40, dpr: 3 }));
    await idle(); // every draw step taken: the bake now waits on its export
    exported.resolve();
    await settle();
    expect(loads).toEqual([]);
    expect(idleQueue).toHaveLength(1);
    await idle();
    expect(loads).toEqual(['blob:40@3#1']);
  });

  it('a level taking a pre-bake over after its export decodes at once, without idle time', async () => {
    const { cache, loads, idle, idleQueue, holdExport } = harness();
    const exported = holdExport();
    cache.prebake(FACES, D, () => ({ w: 40, dpr: 3 }));
    await idle();
    exported.resolve();
    await settle(); // waiting for idle time before the decode
    const p = cache.acquire(FACES, D, 40, 3);
    await expect(p).resolves.toMatchObject({ url: 'blob:40@3#1' });
    expect(loads).toEqual(['blob:40@3#1']);
    expect(idleQueue).toHaveLength(0);
  });

  it('a pre-bake cancelled during its export never decodes, is not cached, and the spare survives', async () => {
    const { cache, bakes, loads, revoked, idle, holdExport } = harness();
    const spare = await cache.acquire(FACES, D, 40, 3);
    cache.release(spare);
    const exported = holdExport();
    const stop = cache.prebake(FACES, D, () => ({ w: 41, dpr: 3 }));
    await idle(); // every draw step taken: the bake now waits on its export
    stop();
    exported.resolve();
    await idle();
    expect(loads).toEqual(['blob:40@3#1']); // only the spare was ever decoded
    expect(revoked).toEqual([]);
    expect(await cache.acquire(FACES, D, 40, 3)).toBe(spare);
    const fresh = await cache.acquire(FACES, D, 41, 3);
    expect(bakes).toHaveLength(3);
    expect(fresh.url).toBe('blob:41@3#3');
  });

  it('a pre-bake cancelled during its decode is revoked, not cached, and the spare survives', async () => {
    const { cache, bakes, revoked, idle, holdDecode } = harness();
    const spare = await cache.acquire(FACES, D, 40, 3);
    cache.release(spare);
    const decoded = holdDecode();
    const stop = cache.prebake(FACES, D, () => ({ w: 41, dpr: 3 }));
    await idle(); // drawn, exported, and now decoding
    stop();
    decoded.resolve();
    await settle();
    expect(revoked).toEqual([{ url: 'blob:41@3#2' }]);
    expect(await cache.acquire(FACES, D, 40, 3)).toBe(spare);
    await cache.acquire(FACES, D, 41, 3);
    expect(bakes).toHaveLength(3);
  });

  it('a level acquiring in the same task as a cancel during the export still gets that atlas', async () => {
    const { cache, bakes, revoked, idle, holdExport } = harness();
    const exported = holdExport();
    const stop = cache.prebake(FACES, D, () => ({ w: 40, dpr: 3 }));
    await idle();
    stop();
    const p = cache.acquire(FACES, D, 40, 3);
    exported.resolve();
    await expect(p).resolves.toMatchObject({ url: 'blob:40@3#1' });
    expect(bakes).toHaveLength(1);
    expect(revoked).toEqual([]);
  });
});

describe('atlas layout', () => {
  it('holds one face cell per face and one body cell per depth, all distinct, in a bitmap just big enough', () => {
    for (const level of levels) {
      const depths = depthCount(layouts[level.layoutId].slots);
      const a = atlasLayout(level.faces, depths, 47, 3);
      const cells = [...level.faces.map((f) => a.index.get(f)!), ...a.bodies];
      expect(a.bodies).toHaveLength(depths);
      expect(new Set(cells).size).toBe(level.faces.length + depths);
      const size = atlasSize(a);
      const ends = cells.map((c) => cellOrigin(a, c));
      expect(Math.max(...ends.map((o) => o.x + a.cellW))).toBeLessThanOrEqual(size.w);
      expect(Math.max(...ends.map((o) => o.y + a.cellH))).toBe(size.h - ATLAS_GUTTER); // the last row ends at the bottom gutter
    }
  });
});

describe('whenIdle', () => {
  let visibility: DocumentVisibilityState;
  const listeners = new Set<() => void>();
  const idleCallbacks = new Map<number, IdleRequestCallback>();
  let nextId = 1;
  /** performance.now(), advanced by the test. */
  let clock = 0;
  /** One idle period with `ms` to spare: every callback requested so far runs. The period is over once they return; the next frame starts. */
  const idlePeriod = (ms = 50): void => {
    const due = [...idleCallbacks.values()];
    idleCallbacks.clear();
    let open = true;
    for (const cb of due) cb({ didTimeout: false, timeRemaining: () => (open ? ms : 0) });
    open = false;
    clock += 1000 / 75;
  };
  const setVisibility = (v: DocumentVisibilityState): void => {
    visibility = v;
    for (const l of [...listeners]) l();
  };

  beforeEach(() => {
    visibility = 'visible';
    listeners.clear();
    idleCallbacks.clear();
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    vi.stubGlobal('document', {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_type: string, l: () => void) => listeners.add(l),
      removeEventListener: (_type: string, l: () => void) => listeners.delete(l),
    });
    vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback) => {
      idleCallbacks.set(nextId, cb);
      return nextId++;
    });
    vi.stubGlobal('cancelIdleCallback', (id: number) => idleCallbacks.delete(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('runs only in an idle period with at least the time asked for; shorter ones wait for the next', () => {
    const cb = vi.fn();
    whenIdle(cb, 8);
    idlePeriod(7.9);
    idlePeriod(4);
    expect(cb).not.toHaveBeenCalled();
    idlePeriod(8);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a step asked for while an idle period still has room for it runs in that period; one needing more waits for the next', async () => {
    let left = 10;
    const second = vi.fn();
    const third = vi.fn();
    const dropped = vi.fn();
    whenIdle(() => {
      left = 5;
      whenIdle(second, 4);
      whenIdle(third, 6);
      whenIdle(dropped, 4)();
    }, 8);
    const [first] = [...idleCallbacks.values()];
    idleCallbacks.clear();
    first({ didTimeout: false, timeRemaining: () => left });
    await Promise.resolve();
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).not.toHaveBeenCalled();
    expect(dropped).not.toHaveBeenCalled();
    left = 0; // that period is over
    idlePeriod(6);
    expect(third).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });

  it('runs no step while the page is hidden and resumes once it is visible again', () => {
    const cb = vi.fn();
    whenIdle(cb);
    setVisibility('hidden');
    idlePeriod();
    idlePeriod();
    expect(cb).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(listeners.size).toBe(0);
    expect(cb).not.toHaveBeenCalled(); // back to waiting for an idle period
    idlePeriod();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancelling while hidden removes its visibility listener and never runs', () => {
    const cb = vi.fn();
    const cancel = whenIdle(cb);
    setVisibility('hidden');
    idlePeriod();
    cancel();
    expect(listeners.size).toBe(0);
    setVisibility('visible');
    idlePeriod();
    expect(cb).not.toHaveBeenCalled();
  });

  it('a step no idle period has time for runs, once refused for STARVED_MS, in the next period with at least MIN_IDLE_MS', () => {
    const cb = vi.fn();
    whenIdle(cb, 20);
    idlePeriod(9); // longer than any after it
    while (clock < STARVED_MS) idlePeriod(7);
    expect(cb).not.toHaveBeenCalled();
    idlePeriod(MIN_IDLE_MS - 0.1);
    expect(cb).not.toHaveBeenCalled();
    idlePeriod(MIN_IDLE_MS);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a step whose need shrinks while it waits runs in the first period with time for the new need', () => {
    const cb = vi.fn();
    let need = 21;
    whenIdle(cb, () => need);
    idlePeriod(7);
    expect(cb).not.toHaveBeenCalled();
    need = 3;
    idlePeriod(7);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  /**
   * Pre-bakes in 12 passes paced as the atlas paces them (each asks for its kind's current estimate and
   * records what it took), the second of them an outlier (a GC pause, say) slower than any idle period
   * after it. `period(n)` is the n-th idle period's length, n counted from the outlier (−1 before it).
   * Returns the loads once the pre-bake finishes, or after 500 periods.
   */
  const outlierPrebake = async (period: (n: number) => number): Promise<string[]> => {
    const loads: string[] = [];
    let n = -1;
    const cache = createAtlasCache<string>({
      async draw(_faces, _depths, w, dpr, job) {
        const passes = createStepEstimate(2);
        for (let i = 0; i < 12; i++) {
          await job.step(() => passes.need);
          const ms = i === 1 ? 20 : 2;
          clock += ms;
          passes.record(ms);
          if (i === 1) n = 0;
        }
        return `blob:${w}@${dpr}`;
      },
      async load(url) {
        loads.push(url);
        return { url } as unknown as Atlas;
      },
      revoke: () => {},
      idle: whenIdle,
    });
    cache.prebake(FACES, D, () => ({ w: 40, dpr: 3 }));
    for (let k = 0; k < 500 && loads.length === 0; k++) {
      idlePeriod(period(n));
      if (n >= 0) n++;
      await settle();
    }
    return loads;
  };

  it('an outlier pass, then one 9 ms idle period, then only 7 ms ones still finishes the pre-bake', async () => {
    expect(await outlierPrebake((n) => (n <= 0 ? 9 : 7))).toEqual(['blob:40@3']);
  });

  it('an outlier pass with only 6 ms idle periods, before and after, still finishes the pre-bake', async () => {
    expect(await outlierPrebake(() => 6)).toEqual(['blob:40@3']);
  });

  describe('bitmap setup', () => {
    /** A canvas whose backing-store allocation (a first draw after sizing) takes `msPerMpx` per million px. */
    const fakeCanvas = (msPerMpx: number) => {
      const c = {
        width: 0,
        height: 0,
        getContext: () => ({ clearRect: () => void (clock += (msPerMpx * c.width * c.height) / 1e6) }),
      };
      return c;
    };
    const job: BakeJob = { urgent: false, step: (needMs) => new Promise<void>((resolve) => void whenIdle(resolve, needMs)) };
    /**
     * Sets up a 3-Mpx bitmap (its context step, then its allocation step), handing out idle periods of
     * `ms` until it is set up or `max` have passed; returns the canvas.
     */
    const setUp = async (msPerMpx: number, ms: number, max = 2) => {
      const c = fakeCanvas(msPerMpx);
      void setUpBitmap(c as unknown as HTMLCanvasElement, 2000, 1500, job);
      for (let n = 0; n < max && c.width !== 2000; n++) {
        await settle();
        idlePeriod(ms);
        await settle();
      }
      return c;
    };

    it('sets the bitmap up only in an idle period with time for its size', async () => {
      const need = SETUP_SEED_MS_PER_MPX * 3 + STEP_MARGIN_MS;
      expect((await setUp(SETUP_SEED_MS_PER_MPX, need - 0.1, 3)).width).not.toBe(2000);
      idleCallbacks.clear();
      expect((await setUp(SETUP_SEED_MS_PER_MPX, need)).width).toBe(2000);
    });

    it('budgets the next setup for the slower of the seed and the last one measured', async () => {
      await setUp(2 * SETUP_SEED_MS_PER_MPX, 50); // twice the seed's cost
      const slowNeed = 2 * SETUP_SEED_MS_PER_MPX * 3 + STEP_MARGIN_MS;
      expect((await setUp(SETUP_SEED_MS_PER_MPX / 2, slowNeed - 0.1)).width).not.toBe(2000);
      idlePeriod(slowNeed);
      await settle();
      // That one measured half the seed's cost, so the budget is back at the seed.
      const seedNeed = SETUP_SEED_MS_PER_MPX * 3 + STEP_MARGIN_MS;
      expect((await setUp(SETUP_SEED_MS_PER_MPX, seedNeed)).width).toBe(2000);
    });
  });
});

describe('step estimate', () => {
  let clock = 0;
  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  it('asks for the seed plus a margin before any step is measured', () => {
    expect(createStepEstimate(6).need).toBe(6 + STEP_MARGIN_MS);
  });

  it('asks for the slowest recent step plus a margin, so one fast step does not hide a slow one', () => {
    const e = createStepEstimate(1);
    e.record(3);
    e.record(5);
    e.record(2);
    expect(e.need).toBe(5 + STEP_MARGIN_MS);
  });

  it('keeps the seed until measured steps displace it, then forgets a slow step after RECENT_STEPS faster ones', () => {
    const e = createStepEstimate(6);
    for (let i = 0; i < RECENT_STEPS - 1; i++) e.record(2);
    expect(e.need).toBe(6 + STEP_MARGIN_MS); // the seed is still among the recent steps
    e.record(2);
    expect(e.need).toBe(2 + STEP_MARGIN_MS);
    e.record(9);
    for (let i = 0; i < RECENT_STEPS - 1; i++) e.record(3);
    expect(e.need).toBe(9 + STEP_MARGIN_MS);
    e.record(3);
    expect(e.need).toBe(3 + STEP_MARGIN_MS);
  });

  it('forgets a slow step RECENT_MS after it ran, even when no newer step has run since', () => {
    const e = createStepEstimate(2);
    e.record(3);
    clock += 100;
    e.record(20);
    clock += RECENT_MS - 1;
    expect(e.need).toBe(20 + STEP_MARGIN_MS);
    clock += 1;
    expect(e.need).toBe(2 + STEP_MARGIN_MS); // both measured steps forgotten: the seed again
  });
});
