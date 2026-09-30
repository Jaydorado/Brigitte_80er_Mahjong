/**
 * The level HUD: a 72 px column on the right with back, tiles left, and the three helpers
 * Tipp / Zurück / Mischen (icon + label, cream on berry).
 */
import { tilesLeft, type GameState } from '../core/game';

export interface HudActions { back(): void; hint(): void; undo(): void; shuffle(): void }

export interface Hud {
  el: HTMLElement;
  update(s: GameState): void;
}

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICON = {
  back: svg('<path d="M19 12H6"/><path d="M11 6l-6 6 6 6"/>'),
  hint: svg(
    '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" fill="currentColor" fill-opacity=".22"/>',
  ),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  shuffle: svg(
    '<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
  ),
  tile: '<svg viewBox="0 0 20 24" aria-hidden="true"><rect x="3" y="3" width="15" height="19" rx="3" fill="#2E5E4F"/><rect x="1" y="1" width="15" height="19" rx="3" fill="#FFFDF6" stroke="#B08E5C" stroke-width="1"/><circle cx="8.5" cy="10.5" r="3.4" fill="none" stroke="#8E2F4F" stroke-width="1.6"/><circle cx="8.5" cy="10.5" r="1.2" fill="#D9B26F"/></svg>',
} as const;

function button(cls: string, icon: string, label: string | null, aria: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.setAttribute('aria-label', aria);
  b.innerHTML = icon;
  if (label !== null) {
    const span = document.createElement('span');
    span.textContent = label;
    b.append(span);
  }
  b.addEventListener('click', onClick);
  return b;
}

export function createHud(on: HudActions): Hud {
  const el = document.createElement('nav');
  el.className = 'hud';
  const back = button('hud-back', ICON.back, null, 'Zurück zur Torte', on.back);
  const count = document.createElement('div');
  count.className = 'hud-count';
  count.setAttribute('role', 'status');
  count.innerHTML = ICON.tile;
  const num = document.createElement('span');
  count.append(num);
  const hint = button('hud-btn', ICON.hint, 'Tipp', 'Tipp', on.hint);
  const undo = button('hud-btn', ICON.undo, 'Zurück', 'Zurück', on.undo);
  const shuffle = button('hud-btn', ICON.shuffle, 'Mischen', 'Mischen', on.shuffle);
  const helpers = document.createElement('div');
  helpers.className = 'hud-helpers';
  helpers.append(hint, undo, shuffle);
  el.append(back, count, helpers);

  let shown = -1;
  return {
    el,
    update(s) {
      const n = tilesLeft(s);
      if (n !== shown) {
        num.textContent = String(n);
        count.setAttribute('aria-label', `${n} Steine übrig`);
        shown = n;
      }
      undo.disabled = s.history.length === 0;
    },
  };
}
