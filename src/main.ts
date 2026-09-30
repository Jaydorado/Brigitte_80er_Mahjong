import './ui/styles.css';
// install.ts attaches its `beforeinstallprompt` listener at module load, so it must load at startup.
import './ui/install';
import { loadSave, SAVE_KEY } from './progress/save';
import { isSafeScreen, startRouter } from './ui/router';
import { initSw } from './ui/sw';

const root = document.querySelector<HTMLElement>('#app')!;

// First run (no save yet): ask the browser to keep this origin's storage, so progress survives cleanup.
if (localStorage.getItem(SAVE_KEY) === null) void navigator.storage?.persist?.();

const save = loadSave(localStorage);
startRouter(root, localStorage, save, save.welcomeSeen ? { name: 'map' } : { name: 'welcome' });
initSw(isSafeScreen);

// The Playwright smoke hook (`window.__mahjong`): the dev server, or the dedicated smoke build
// (`VITE_SMOKE=1`) opened with `?smoke`. Ordinary builds drop this line, so they neither ship nor precache it.
if (import.meta.env.DEV || (import.meta.env.VITE_SMOKE === '1' && location.search.includes('smoke'))) {
  void import('./ui/testHook');
}
