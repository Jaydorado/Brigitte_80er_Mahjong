import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAtlasCache, whenIdle, type Atlas, type AtlasCacheDeps } from './atlas';

const FACES = [0, 1, 2];
const STEPS = 3;

/** Lets every pending promise continuation run (the fakes below never touch a timer). */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/**
 * A cache whose bakes take STEPS paced steps, with idle time handed out by the test. While `exporting`
 * is set, a bake that has taken its last step waits on it (the canvas export and image decode).
 */
function harness() {
  const idleQueue: (() => void)[] = [];
  const bakes: { w: number; dpr: number }[] = [];
  const revoked: Atlas[] = [];
  let exporting: PromiseWithResolvers<void> | null = null;
  const deps: AtlasCacheDeps = {
    async bake(_faces, w, dpr, job) {
      bakes.push({ w, dpr });
      for (let i = 0; i < STEPS; i++) await job.step();
      await exporting?.promise;
      return { url: `blob:${w}@${dpr}#${bakes.length}`, w, dpr } as unknown as Atlas;
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
  const hold = (): PromiseWithResolvers<void> => (exporting = Promise.withResolvers<void>());
  return { cache: createAtlasCache(deps), bakes, revoked, idle, idleQueue, hold };
}

describe('atlas cache', () => {
  it('keys on tile width and DPR: another size or DPR is another bake, the same one is shared', async () => {
    const { cache, bakes } = harness();
    const a = await cache.acquire(FACES, 40, 3);
    const b = await cache.acquire(FACES, 40, 2);
    const c = await cache.acquire(FACES, 41, 3);
    const again = await cache.acquire(FACES, 40, 3);
    expect(bakes).toEqual([{ w: 40, dpr: 3 }, { w: 40, dpr: 2 }, { w: 41, dpr: 3 }]);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(again).toBe(a);
  });

  it('a level acquiring a finished pre-bake gets it without baking again', async () => {
    const { cache, bakes, idle } = harness();
    const stop = cache.prebake(FACES, () => ({ w: 40, dpr: 3 }));
    await idle();
    stop(); // leaving the map after the pre-bake finished keeps it
    const a = await cache.acquire(FACES, 40, 3);
    expect(bakes).toHaveLength(1);
    expect(a.url).toBe('blob:40@3#1');
  });

  it('a level acquiring in the same task as the map cancel takes the pre-bake over and finishes it without idle time', async () => {
    const { cache, bakes, idle, idleQueue } = harness();
    const stop = cache.prebake(FACES, () => ({ w: 40, dpr: 3 }));
    idleQueue.shift()!(); // the map idles once: the pre-bake starts and waits for its first step
    await settle();
    expect(bakes).toHaveLength(1);
    stop(); // router: unmount the map ...
    const p = cache.acquire(FACES, 40, 3); // ... then mount the level, same task
    await expect(p).resolves.toMatchObject({ url: 'blob:40@3#1' });
    expect(idleQueue).toHaveLength(0); // no step waited for idle time after the take-over
    await idle();
    expect(bakes).toHaveLength(1);
  });

  it('leaving the map drops a pre-bake nobody took over; the level then bakes afresh', async () => {
    const { cache, bakes, idle, idleQueue } = harness();
    const stop = cache.prebake(FACES, () => ({ w: 40, dpr: 3 }));
    idleQueue.shift()!();
    await settle();
    stop();
    await idle();
    expect(idleQueue).toHaveLength(0); // the dropped bake asks for no more idle time
    const a = await cache.acquire(FACES, 40, 3);
    expect(bakes).toHaveLength(2);
    expect(a.url).toBe('blob:40@3#2');
  });

  it('a cancel before the map was ever idle bakes nothing', async () => {
    const { cache, bakes, idle } = harness();
    cache.prebake(FACES, () => ({ w: 40, dpr: 3 }))();
    await idle();
    expect(bakes).toHaveLength(0);
  });

  it('never revokes an atlas in use; keeps one unused spare and revokes older ones', async () => {
    const { cache, revoked } = harness();
    const a = await cache.acquire(FACES, 40, 3);
    const b = await cache.acquire(FACES, 41, 3);
    const c = await cache.acquire(FACES, 42, 3);
    cache.release(a);
    expect(revoked).toEqual([]); // a is the spare
    cache.release(b);
    expect(revoked).toEqual([a]); // b is the newer spare
    expect(revoked).not.toContain(c);
    expect(await cache.acquire(FACES, 41, 3)).toBe(b); // the spare is reused, not re-baked
  });

  it('a pre-bake cancelled during its export is not cached, its atlas is revoked and the spare survives', async () => {
    const { cache, bakes, revoked, idle, hold } = harness();
    const spare = await cache.acquire(FACES, 40, 3);
    cache.release(spare);
    const exported = hold();
    const stop = cache.prebake(FACES, () => ({ w: 41, dpr: 3 }));
    await idle(); // every step taken: the bake now waits on its export
    stop();
    exported.resolve();
    await settle();
    expect(revoked).toHaveLength(1);
    expect(revoked[0]).toMatchObject({ url: 'blob:41@3#2' });
    expect(await cache.acquire(FACES, 40, 3)).toBe(spare);
    const fresh = await cache.acquire(FACES, 41, 3);
    expect(bakes).toHaveLength(3);
    expect(fresh.url).toBe('blob:41@3#3');
  });

  it('a level acquiring in the same task as a cancel during the export still gets that atlas', async () => {
    const { cache, bakes, revoked, idle, hold } = harness();
    const exported = hold();
    const stop = cache.prebake(FACES, () => ({ w: 40, dpr: 3 }));
    await idle();
    stop();
    const p = cache.acquire(FACES, 40, 3);
    exported.resolve();
    await expect(p).resolves.toMatchObject({ url: 'blob:40@3#1' });
    expect(bakes).toHaveLength(1);
    expect(revoked).toEqual([]);
  });
});

describe('whenIdle', () => {
  let visibility: DocumentVisibilityState;
  const listeners = new Set<() => void>();
  const idleCallbacks = new Map<number, IdleRequestCallback>();
  let nextId = 1;
  /** One idle period with `ms` to spare: every callback requested so far runs. */
  const idlePeriod = (ms = 50): void => {
    const due = [...idleCallbacks.values()];
    idleCallbacks.clear();
    for (const cb of due) cb({ didTimeout: false, timeRemaining: () => ms });
  };
  const setVisibility = (v: DocumentVisibilityState): void => {
    visibility = v;
    for (const l of [...listeners]) l();
  };

  beforeEach(() => {
    visibility = 'visible';
    listeners.clear();
    idleCallbacks.clear();
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
  afterEach(() => vi.unstubAllGlobals());

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
});
