/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register';

/**
 * Update policy: a waiting service worker version is activated (which reloads the page) only while
 * the map or welcome screen is showing, or on the next launch. Never during a level.
 */
export interface UpdatePolicy {
  /** A new version is waiting. Applies it at once if the current screen is safe. */
  needRefresh(): void;
  /** The router shows a new screen. Applies a waiting version if that screen is safe. */
  navigated(): void;
}

export function createUpdatePolicy(isSafeScreen: () => boolean, apply: () => void): UpdatePolicy {
  let waiting = false;
  const tryApply = (): void => {
    if (!waiting || !isSafeScreen()) return;
    waiting = false;
    apply();
  };
  return {
    needRefresh() {
      waiting = true;
      tryApply();
    },
    navigated: tryApply,
  };
}

let policy: UpdatePolicy | null = null;

/** Registers the service worker. `isSafeScreen` answers whether the map or welcome is showing. */
export function initSw(isSafeScreen: () => boolean): void {
  const updateSW = registerSW({
    onNeedRefresh: () => policy?.needRefresh(),
  });
  policy = createUpdatePolicy(isSafeScreen, () => void updateSW(true));
}

/** The router calls this after every navigation so a waiting update lands on the first safe screen. */
export function notifyNavigated(): void {
  policy?.navigated();
}
