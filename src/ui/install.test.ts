import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

type Outcome = 'accepted' | 'dismissed';

interface FakeWindow extends EventTarget {
  matchMedia(q: string): { matches: boolean };
}

/** A window stand-in: an EventTarget with a scriptable matchMedia. */
function fakeWindow(matching: readonly string[] = []): FakeWindow {
  const w = new EventTarget() as FakeWindow;
  w.matchMedia = (q: string) => ({ matches: matching.includes(q) });
  return w;
}

/** A `beforeinstallprompt` event as Chrome fires it. */
function installEvent(outcome: Outcome) {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: Mock<() => Promise<void>>;
    userChoice: Promise<{ outcome: Outcome }>;
  };
  e.prompt = vi.fn(() => Promise.resolve());
  e.userChoice = Promise.resolve({ outcome });
  return e;
}

async function load(w: FakeWindow) {
  vi.resetModules();
  vi.stubGlobal('window', w);
  return import('./install');
}

describe('install', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('detects an installed app by fullscreen or standalone display mode', async () => {
    expect((await load(fakeWindow(['(display-mode: standalone)']))).isRunningInstalled()).toBe(true);
    expect((await load(fakeWindow(['(display-mode: fullscreen)']))).isRunningInstalled()).toBe(true);
    expect((await load(fakeWindow(['(display-mode: browser)']))).isRunningInstalled()).toBe(false);
  });

  it('reports availability when the prompt arrives late, and keeps Chrome from showing its own bar', async () => {
    const w = fakeWindow();
    const { onInstallAvailability } = await load(w);
    const cb = vi.fn();
    onInstallAvailability(cb);
    expect(cb).not.toHaveBeenCalled();
    const e = installEvent('accepted');
    w.dispatchEvent(e);
    expect(cb).toHaveBeenCalledExactlyOnceWith(true);
    expect(e.defaultPrevented).toBe(true);
  });

  it('tells a subscriber that arrives after the prompt already fired', async () => {
    const w = fakeWindow();
    const { onInstallAvailability } = await load(w);
    w.dispatchEvent(installEvent('dismissed'));
    const cb = vi.fn();
    onInstallAvailability(cb);
    expect(cb).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('lets the prompt be used exactly once, then reports unavailable', async () => {
    const w = fakeWindow();
    const { onInstallAvailability, promptInstall } = await load(w);
    const cb = vi.fn();
    onInstallAvailability(cb);
    const e = installEvent('accepted');
    w.dispatchEvent(e);
    await expect(promptInstall()).resolves.toBe('accepted');
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(false);
    await expect(promptInstall()).resolves.toBe('unavailable');
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });

  it('reports a dismissed prompt and offers no second attempt', async () => {
    const w = fakeWindow();
    const { promptInstall } = await load(w);
    w.dispatchEvent(installEvent('dismissed'));
    await expect(promptInstall()).resolves.toBe('dismissed');
    await expect(promptInstall()).resolves.toBe('unavailable');
  });

  it('is unavailable before any prompt event, and after the app got installed', async () => {
    const w = fakeWindow();
    const { onInstallAvailability, promptInstall } = await load(w);
    await expect(promptInstall()).resolves.toBe('unavailable');
    const cb = vi.fn();
    onInstallAvailability(cb);
    w.dispatchEvent(installEvent('accepted'));
    w.dispatchEvent(new Event('appinstalled'));
    expect(cb).toHaveBeenLastCalledWith(false);
    await expect(promptInstall()).resolves.toBe('unavailable');
  });

  it('stops notifying a subscriber that unsubscribed', async () => {
    const w = fakeWindow();
    const { onInstallAvailability } = await load(w);
    const cb = vi.fn();
    const off = onInstallAvailability(cb);
    off();
    w.dispatchEvent(installEvent('accepted'));
    expect(cb).not.toHaveBeenCalled();
  });
});
