import { describe, expect, it } from 'vitest';
import { createAtlasCache, type Atlas, type AtlasCacheDeps } from './atlas';

const FACES = [0, 1, 2];
const STEPS = 3;

/** Lets every pending promise continuation run (the fakes below never touch a timer). */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** A cache whose bakes take STEPS paced steps, with idle time handed out by the test. */
function harness() {
  const idleQueue: (() => void)[] = [];
  const bakes: { w: number; dpr: number }[] = [];
  const revoked: Atlas[] = [];
  const deps: AtlasCacheDeps = {
    async bake(_faces, w, dpr, job) {
      bakes.push({ w, dpr });
      for (let i = 0; i < STEPS; i++) await job.step();
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
  return { cache: createAtlasCache(deps), bakes, revoked, idle, idleQueue };
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
});
