import { describe, expect, it } from 'vitest';
import { FxEngine, MAX_PARTICLES } from './fx';

/** Deterministic stand-in for Math.random. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function engine(seed = 1): FxEngine {
  const e = new FxEngine(lcg(seed));
  e.resize(800, 360);
  return e;
}

describe('FxEngine', () => {
  it.each([1, 2, 3, 4, 5])('seed %i: ≤ 300 live particles under every effect at once, then idle', (seed) => {
    const e = engine(seed);
    void e.confetti(1500);
    void e.fireworks(6000);
    let peak = 0;
    let ms = 0;
    for (; ms < 20000 && e.active; ms += 16) {
      if (ms % 96 === 0 && ms < 6000) e.sparkle(400, 180);
      e.step(16);
      peak = Math.max(peak, e.live);
    }
    expect(MAX_PARTICLES).toBe(300);
    expect(peak).toBeLessThanOrEqual(MAX_PARTICLES);
    expect(peak).toBeGreaterThan(100);
    // Everything spawned by 6 s has died or left the screen a few seconds later: the loop may stop.
    expect(e.active).toBe(false);
    expect(e.live).toBe(0);
    expect(ms).toBeLessThan(12000);
  });

  it('a sparkle is 24 particles', () => {
    const e = engine();
    e.sparkle(100, 100);
    expect(e.live).toBe(24);
  });

  it('confetti resolves once its time has played, not before', async () => {
    const e = engine();
    let done = false;
    void e.confetti(1500).then(() => (done = true));
    for (let ms = 0; ms < 1488; ms += 16) e.step(16);
    await flush();
    expect(done).toBe(false);
    e.step(16);
    e.step(16);
    await flush();
    expect(done).toBe(true);
  });

  it('long frames count at most 50 ms each, so a stalled tab does not skip the show', async () => {
    const e = engine();
    let done = false;
    void e.fireworks(1000).then(() => (done = true));
    e.step(5000);
    await flush();
    expect(done).toBe(false);
  });

  it('destroy clears every particle and resolves pending effects', async () => {
    const e = engine();
    let settled = 0;
    void e.confetti(3000).then(() => settled++);
    void e.fireworks(3000).then(() => settled++);
    for (let i = 0; i < 30; i++) e.step(16);
    expect(e.live).toBeGreaterThan(0);
    e.destroy();
    await flush();
    expect(settled).toBe(2);
    expect(e.live).toBe(0);
    expect(e.active).toBe(false);
  });
});
