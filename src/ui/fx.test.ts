import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFx, FxEngine, MAX_PARTICLES } from './fx';

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

  it("sparks reserved for a climbing rocket stay free: sparkles filling the pool don't swallow its burst", () => {
    const e = engine();
    void e.fireworks(1000); // one rocket only: launches stop after 100 ms
    e.step(16);
    const trails = (): number => e.pool.slice(0, e.live).filter((p) => p.trail > 0).length; // rocket and sparks; sparkles have none
    let peak = 0;
    for (let ms = 0; ms < 1500; ms += 16) {
      for (let k = 0; k < 3; k++) e.sparkle(400, 180); // keep the pool as full as other emitters can make it
      e.step(16);
      peak = Math.max(peak, trails());
    }
    expect(peak).toBeGreaterThanOrEqual(56); // the smallest burst pattern, whole
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

describe('createFx frame loop', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('requests no frames while no particle is alive between emissions, and wakes for the next one', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    const frames: FrameRequestCallback[] = [];
    const canvas = { style: {}, hidden: true, width: 0, height: 0, setAttribute() {}, getContext: () => null, remove() {} };
    vi.stubGlobal('document', { createElement: () => canvas, addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' });
    vi.stubGlobal('innerWidth', 800);
    vi.stubGlobal('innerHeight', 360);
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('devicePixelRatio', 1);
    vi.stubGlobal('addEventListener', () => {});
    vi.stubGlobal('removeEventListener', () => {});
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    /** Runs `ms` of wall time at 60 Hz: timers fire, and each queued frame runs once per 16 ms. */
    const pump = (ms: number): number => {
      let ran = 0;
      for (let t = 0; t < ms; t += 16) {
        vi.advanceTimersByTime(16);
        const due = frames.splice(0);
        for (const cb of due) cb(performance.now());
        ran += due.length;
      }
      return ran;
    };

    const fx = createFx({ append() {} } as unknown as HTMLElement);
    let done = false;
    void fx.confetti(1_000_000).then(() => (done = true)); // rain drops thousands of ms apart
    expect(pump(7000)).toBeGreaterThan(100); // the opening volley is drawn every frame until it lands
    // The volley has landed; the next drop is seconds away: no frames meanwhile, only a timer.
    const idle = pump(1000);
    expect(idle).toBe(0);
    expect(frames.length).toBe(0);
    expect(canvas.hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    // The timer wakes the loop for the next drop.
    expect(pump(8000)).toBeGreaterThan(0);
    expect(done).toBe(false);
    fx.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
