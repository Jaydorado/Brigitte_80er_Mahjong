import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShowLoop } from './closing';

describe('closing fireworks loop', () => {
  let hidden = false;
  let finish: () => void = () => {};
  const play = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    play.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  const settle = async (): Promise<void> => {
    finish();
    await Promise.resolve();
  };

  it('plays again after the gap, for as long as the page is visible', async () => {
    const loop = createShowLoop(play, () => hidden, 100, 50);
    loop.start();
    vi.advanceTimersByTime(100);
    expect(play).toHaveBeenCalledTimes(1);
    await settle();
    vi.advanceTimersByTime(50);
    expect(play).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('starts no show while hidden and resumes when visible again', () => {
    const loop = createShowLoop(play, () => hidden, 100, 50);
    loop.start();
    hidden = true;
    loop.visibilityChanged();
    vi.advanceTimersByTime(10_000);
    expect(play).not.toHaveBeenCalled();
    hidden = false;
    loop.visibilityChanged();
    vi.advanceTimersByTime(100);
    expect(play).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it('does not schedule the next show when a show ends while hidden, and restarts it on return', async () => {
    const loop = createShowLoop(play, () => hidden, 100, 50);
    loop.start();
    vi.advanceTimersByTime(100);
    hidden = true;
    loop.visibilityChanged();
    await settle();
    vi.advanceTimersByTime(10_000);
    expect(play).toHaveBeenCalledTimes(1);
    hidden = false;
    loop.visibilityChanged();
    vi.advanceTimersByTime(100);
    expect(play).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('never starts a second show while one is still playing', () => {
    const loop = createShowLoop(play, () => hidden, 100, 50);
    loop.start();
    vi.advanceTimersByTime(100);
    hidden = true;
    loop.visibilityChanged();
    hidden = false;
    loop.visibilityChanged();
    vi.advanceTimersByTime(10_000);
    expect(play).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it('stop ends the loop for good', async () => {
    const loop = createShowLoop(play, () => hidden, 100, 50);
    loop.start();
    vi.advanceTimersByTime(100);
    loop.stop();
    await settle();
    vi.advanceTimersByTime(10_000);
    loop.visibilityChanged();
    vi.advanceTimersByTime(10_000);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
