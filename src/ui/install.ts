/**
 * PWA install state for the welcome screen.
 *
 * Chrome fires `beforeinstallprompt` once, possibly before the welcome screen exists, so the
 * listener is attached when this module loads and the event is kept until it is used.
 */

type InstallOutcome = 'accepted' | 'dismissed';

/** Chrome's install prompt event; not part of lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: InstallOutcome }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(canPrompt: boolean) => void>();

function setDeferred(e: BeforeInstallPromptEvent | null): void {
  deferred = e;
  for (const cb of [...listeners]) cb(e !== null);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's own mini-infobar away; the welcome screen has the button
    setDeferred(e as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => setDeferred(null));
}

export function isRunningInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/**
 * Calls `cb` with whether the install prompt can be used: right away when it already arrived, and
 * on every later change. Returns the unsubscribe function (screens call it on unmount).
 */
export function onInstallAvailability(cb: (canPrompt: boolean) => void): () => void {
  listeners.add(cb);
  if (deferred !== null) cb(true);
  return () => {
    listeners.delete(cb);
  };
}

/** Shows Chrome's install prompt. Single use: whatever the answer, the prompt is spent afterwards. */
export async function promptInstall(): Promise<InstallOutcome | 'unavailable'> {
  const e = deferred;
  if (e === null) return 'unavailable';
  setDeferred(null);
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome;
}
