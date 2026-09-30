/**
 * Modal dialogs over the level screen: the stuck dialog and the leave-level confirmation.
 * A dialog makes the root's other children inert, traps Tab, and is dismissible (×, Escape, or a tap on
 * the dimmed backdrop). Opening and closing animate only transform and opacity (a plain fade under
 * `prefers-reduced-motion: reduce`).
 */
import './dialogs.css';

const STUCK_TITLE = 'Keine passenden Steine mehr frei';
const SHUFFLE_LABEL = 'Mischen';
const UNDO_LABEL = 'Letztes Paar zurück';
const CLOSE_LABEL = 'Schließen';
const LEAVE_TITLE = 'Level verlassen?';
const LEAVE_TEXT = 'Beim nächsten Mal werden die Steine neu gemischt.';
const STAY_LABEL = 'Weiterspielen';
const LEAVE_LABEL = 'Verlassen';

const OPEN_MS = 260;
const CLOSE_MS = 160;

/** Two tiles tumbling over a gold swirl: the stuck dialog's picture. */
const STUCK_ART =
  `<svg class="dlg-art" viewBox="0 0 120 120" aria-hidden="true">` +
  `<circle cx="60" cy="62" r="50" fill="#D9B26F" opacity=".18"/>` +
  `<path d="M22 70a40 40 0 0 1 64-38" fill="none" stroke="#D9B26F" stroke-width="5" stroke-linecap="round"/>` +
  `<path d="M80 22l8 11-13 3" fill="none" stroke="#D9B26F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="M98 54a40 40 0 0 1-64 38" fill="none" stroke="#E89AA8" stroke-width="5" stroke-linecap="round"/>` +
  `<path d="M40 102l-8-11 13-3" fill="none" stroke="#E89AA8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<g transform="rotate(-12 46 62)"><rect x="30" y="38" width="32" height="44" rx="6" fill="#D9B26F"/>` +
  `<rect x="28" y="35" width="32" height="44" rx="6" fill="#FFF8EE" stroke="#D9B26F" stroke-width="2.5"/>` +
  `<circle cx="44" cy="57" r="8" fill="none" stroke="#8E2F4F" stroke-width="3"/><circle cx="44" cy="57" r="2.5" fill="#E89AA8"/></g>` +
  `<g transform="rotate(10 76 64)"><rect x="62" y="42" width="32" height="44" rx="6" fill="#D9B26F"/>` +
  `<rect x="60" y="39" width="32" height="44" rx="6" fill="#FFF8EE" stroke="#D9B26F" stroke-width="2.5"/>` +
  `<path d="M76 50c-6 7-6 15 0 22 6-7 6-15 0-22z" fill="#8E2F4F"/><path d="M69 61h14" stroke="#E89AA8" stroke-width="3" stroke-linecap="round"/></g>` +
  `</svg>`;

const SHUFFLE_ICON =
  `<svg class="dlg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4c5 0 5 10 10 10h4M3 17h4c2 0 3-1.6 4-3.5M13 9.5C14 8 15 7 17 7h4M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const UNDO_ICON =
  `<svg class="dlg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5L4 10l5 5M4 10h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const HEART_ORNAMENT =
  `<svg class="dlg-ornament" viewBox="0 0 120 20" aria-hidden="true"><path d="M4 10h40M76 10h40" stroke="#D9B26F" stroke-width="2" stroke-linecap="round"/>` +
  `<path d="M60 17c-9-6-13-9.5-13-13.2A4.3 4.3 0 0 1 60 3a4.3 4.3 0 0 1 13 .8C73 7.5 69 11 60 17z" fill="#E89AA8"/></svg>`;

let titleSeq = 0;

/**
 * Opens a dialog in `root`: `body` may use `{title}` as the heading id; buttons carry `data-act` keys
 * into `on`. A button closes the dialog, then runs its action; ×, Escape and a backdrop tap run `dismiss`.
 * Returns an idempotent close.
 */
function openDialog(root: HTMLElement, cls: string, body: string, on: Record<string, () => void>, dismiss: () => void): () => void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const opener = document.activeElement;
  const background = [...root.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.inert);
  for (const el of background) el.inert = true;
  const titleId = `dlg-title-${++titleSeq}`;
  const backdrop = document.createElement('div');
  backdrop.className = 'dlg-backdrop';
  backdrop.innerHTML =
    `<div class="dlg ${cls}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">` +
    `${body.replaceAll('{title}', titleId)}</div>`;
  const panel = backdrop.firstElementChild as HTMLElement;

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    backdrop.inert = true;
    for (const el of background) el.inert = false;
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    if (!backdrop.isConnected) return;
    const out = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' });
    if (!reduce) {
      panel.animate([{ transform: 'none' }, { transform: 'translateY(8px) scale(0.96)' }], {
        duration: CLOSE_MS,
        easing: 'ease-in',
        fill: 'forwards',
      });
    }
    const remove = (): void => backdrop.remove();
    out.finished.then(remove, remove);
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
      dismiss();
      return;
    }
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-act]');
    if (!b) return;
    close();
    if (b.dataset.act === 'dismiss') dismiss();
    else on[b.dataset.act!]?.();
  });
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      dismiss();
      return;
    }
    if (e.key !== 'Tab') return;
    const buttons = [...backdrop.querySelectorAll<HTMLButtonElement>('button:enabled')];
    const edge = e.shiftKey ? buttons[0] : buttons[buttons.length - 1];
    if (edge && document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? buttons[buttons.length - 1] : buttons[0])!.focus({ preventScroll: true });
    }
  });

  root.append(backdrop);
  backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 120 : OPEN_MS * 0.7, easing: 'ease-out' });
  if (!reduce) {
    panel.animate(
      [
        { transform: 'translateY(18px) scale(0.9)', opacity: 0 },
        { transform: 'translateY(-2px) scale(1.015)', opacity: 1, offset: 0.7 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: OPEN_MS, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
    );
  }
  backdrop.querySelector<HTMLButtonElement>('button.primary')?.focus({ preventScroll: true });
  return close;
}

/**
 * "Keine passenden Steine mehr frei": *Mischen* (primary), *Letztes Paar zurück* (only when there is
 * something to undo) and ×. Exactly one callback runs when it closes by the player's hand (×, Escape
 * and a backdrop tap are `onDismiss`). Returns close, which runs none.
 */
export function showStuck(root: HTMLElement, opts: { canUndo: boolean; onShuffle(): void; onUndo(): void; onDismiss(): void }): () => void {
  const undo = opts.canUndo
    ? `<button type="button" class="dlg-btn" data-act="undo">${UNDO_ICON}<span>${UNDO_LABEL}</span></button>`
    : '';
  return openDialog(
    root,
    'dlg-stuck',
    STUCK_ART +
      `<div class="dlg-main">` +
      `<h2 id="{title}">${STUCK_TITLE}</h2>` +
      `<div class="dlg-actions">` +
      `<button type="button" class="dlg-btn primary" data-act="shuffle">${SHUFFLE_ICON}<span>${SHUFFLE_LABEL}</span></button>` +
      undo +
      `</div></div>` +
      `<button type="button" class="dlg-close" data-act="dismiss" aria-label="${CLOSE_LABEL}">×</button>`,
    { shuffle: () => opts.onShuffle(), undo: () => opts.onUndo() },
    () => opts.onDismiss(),
  );
}

/** "Level verlassen?" with *Weiterspielen* / *Verlassen*; resolves true to leave. Dismissing means stay. */
export function confirmLeave(root: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    openDialog(
      root,
      'dlg-leave',
      HEART_ORNAMENT +
        `<h2 id="{title}">${LEAVE_TITLE}</h2>` +
        `<p>${LEAVE_TEXT}</p>` +
        `<div class="dlg-actions">` +
        `<button type="button" class="dlg-btn primary" data-act="stay">${STAY_LABEL}</button>` +
        `<button type="button" class="dlg-btn" data-act="leave">${LEAVE_LABEL}</button>` +
        `</div>`,
      { stay: () => resolve(false), leave: () => resolve(true) },
      () => resolve(false),
    );
  });
}
