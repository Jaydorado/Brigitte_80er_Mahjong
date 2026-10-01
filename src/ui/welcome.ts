import { welcome } from '../content';
import { writeSave } from '../progress/save';
import type { SaveV1 } from '../progress/save';
import { buildBalloons, buildBunting, buildCakeIcon, buildRosette } from './art/cake';
import { isRunningInstalled, onInstallAvailability, promptInstall } from './install';
import './screens.css';

// Fixed interface labels (the family texts live in content.ts).
const T = {
  install: 'Als App installieren',
  steps: [
    'Oben rechts auf ⋮ tippen',
    '„App installieren" (oder „Zum Startbildschirm hinzufügen") wählen',
    'Danach das Torten-Symbol auf dem Startbildschirm öffnen',
  ],
  menuEntry: 'App installieren',
  installed: 'Schon installiert? Dann einfach das Torten-Symbol öffnen.',
  start: "Los geht's",
};

export interface WelcomeOpts {
  /** The current save. Welcome sets `welcomeSeen` on it (immutably) when the player starts. */
  readonly save: SaveV1;
  /** Where the updated save is written. */
  readonly storage: Storage;
  /** Called after the save is written, with the updated save; the router goes to the map. */
  onStart(next: SaveV1): void;
}

const svgWrap = (viewBox: string, body: string): string =>
  `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

/** A fingertip below-left of (x, y), pointing at it, with a ring around the target. */
function tap(x: number, y: number): string {
  return (
    `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#d9b26f" stroke-width="2.4" opacity=".75"/>` +
    `<circle cx="${x}" cy="${y}" r="22" fill="none" stroke="#d9b26f" stroke-width="1.6" opacity=".4"/>` +
    `<g transform="translate(${x + 3} ${y + 6}) rotate(-25)">` +
    `<rect x="-5.5" y="0" width="11" height="22" rx="5.5" fill="#f2c9a5" stroke="#c99a74" stroke-width="1.3"/>` +
    `<path d="M-4 5h8" stroke="#c99a74" stroke-width="1" opacity=".6"/>` +
    `</g>`
  );
}

/** Step 1: Chrome's address bar with the ⋮ button ringed at the top right. */
function artMenuButton(): string {
  return svgWrap(
    '0 0 132 84',
    `<rect width="132" height="84" rx="12" fill="#f6f0e8" stroke="#d9b26f" stroke-width="1.5"/>` +
      `<path d="M0 12A12 12 0 0 1 12 0H120A12 12 0 0 1 132 12V34H0Z" fill="#fff"/>` +
      `<path d="M0 34H132" stroke="#e5d9c9"/>` +
      `<rect x="9" y="8" width="80" height="19" rx="9.5" fill="#efe6dc"/>` +
      `<circle cx="20" cy="17.5" r="3.6" fill="#b9a99a"/><rect x="28" y="15" width="46" height="5" rx="2.5" fill="#cdbfb1"/>` +
      `<circle cx="109" cy="17" r="13" fill="#fbeab0" stroke="#d9b26f" stroke-width="2"/>` +
      `<g fill="#3a1f2b"><circle cx="109" cy="10.5" r="2.5"/><circle cx="109" cy="17" r="2.5"/><circle cx="109" cy="23.5" r="2.5"/></g>` +
      `<rect x="12" y="46" width="60" height="6" rx="3" fill="#e8dccb"/><rect x="12" y="58" width="96" height="6" rx="3" fill="#efe4d5"/><rect x="12" y="70" width="44" height="6" rx="3" fill="#efe4d5"/>` +
      tap(109, 17),
  );
}

/** Step 2: the open Chrome menu with "App installieren" highlighted. */
function artMenuEntry(): string {
  const bar = (y: number, w: number): string => `<rect x="46" y="${y}" width="${w}" height="5" rx="2.5" fill="#d7cbbb"/><circle cx="38" cy="${y + 2.5}" r="3.4" fill="#d7cbbb"/>`;
  return svgWrap(
    '0 0 132 84',
    `<rect width="132" height="84" rx="12" fill="#f6f0e8" stroke="#d9b26f" stroke-width="1.5"/>` +
      `<rect x="20" y="6" width="104" height="72" rx="8" fill="#fff" stroke="#d9c9b3" stroke-width="1.3"/>` +
      bar(14, 44) +
      bar(26, 56) +
      `<rect x="26" y="36" width="92" height="20" rx="6" fill="#fbeab0" stroke="#d9b26f" stroke-width="1.8"/>` +
      `<rect x="32" y="40" width="9" height="13" rx="2" fill="none" stroke="#8e2f4f" stroke-width="1.5"/><path d="M36.5 43.5v6M33.5 46.5h6" stroke="#8e2f4f" stroke-width="1.4" stroke-linecap="round"/>` +
      `<text x="46" y="49.6" font-size="8.4" font-weight="700" fill="#3a1f2b" textLength="62" lengthAdjust="spacingAndGlyphs" style="font-family:system-ui,sans-serif">${T.menuEntry}</text>` +
      bar(62, 50) +
      `<g transform="translate(104 50) rotate(-25)"><rect x="-5.5" y="0" width="11" height="22" rx="5.5" fill="#f2c9a5" stroke="#c99a74" stroke-width="1.3"/></g>`,
  );
}

/** Step 3: the home screen with the cake icon ringed. */
function artHomeScreen(): string {
  const tile = (x: number, y: number): string =>
    `<rect x="${x}" y="${y}" width="26" height="26" rx="7" fill="#d9d2e0"/><rect x="${x + 5}" y="${y + 31}" width="16" height="3.5" rx="1.7" fill="#ccc4d6"/>`;
  const icon = buildCakeIcon().innerHTML;
  return svgWrap(
    '0 0 132 84',
    `<rect width="132" height="84" rx="12" fill="#e9e4f0" stroke="#d9b26f" stroke-width="1.5"/>` +
      tile(12, 8) +
      tile(53, 8) +
      tile(94, 8) +
      tile(12, 46) +
      tile(94, 46) +
      `<circle cx="66" cy="59" r="21" fill="none" stroke="#d9b26f" stroke-width="2.2" opacity=".8"/>` +
      `<svg x="53" y="46" width="26" height="26" viewBox="0 0 512 512">${icon}</svg>` +
      `<text x="66" y="80" font-size="7.6" text-anchor="middle" fill="#3a1f2b" style="font-family:system-ui,sans-serif">Mahjong</text>` +
      `<g transform="translate(84 62) rotate(-25)"><rect x="-5.5" y="0" width="11" height="20" rx="5.5" fill="#f2c9a5" stroke="#c99a74" stroke-width="1.3"/></g>`,
  );
}

function stepItem(n: number, art: string, text: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'install-step';
  li.innerHTML = art;
  const p = document.createElement('p');
  const no = document.createElement('span');
  no.className = 'step-no';
  no.textContent = String(n);
  p.append(no, text);
  li.append(p);
  return li;
}

function manualSteps(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'welcome-install';
  const ol = document.createElement('ol');
  ol.className = 'install-steps';
  const arts = [artMenuButton(), artMenuEntry(), artHomeScreen()];
  T.steps.forEach((text, i) => ol.append(stepItem(i + 1, arts[i]!, text)));
  const note = document.createElement('p');
  note.className = 'install-note';
  note.append(buildCakeIcon(), T.installed);
  wrap.append(ol, note);
  return wrap;
}

/** Mounts the welcome screen; returns the unmount function. */
export function mountWelcome(root: HTMLElement, opts: WelcomeOpts): () => void {
  const screen = document.createElement('section');
  screen.className = 'screen welcome';

  const scroll = document.createElement('div');
  scroll.className = 'welcome-scroll';

  const bunting = document.createElement('div');
  bunting.className = 'welcome-bunting';
  bunting.append(buildBunting());

  const hero = document.createElement('header');
  hero.className = 'welcome-hero';
  const art = document.createElement('div');
  art.className = 'welcome-art';
  art.append(buildBalloons(), buildRosette(), buildBalloons());
  const title = document.createElement('h1');
  title.className = 'welcome-title';
  title.textContent = welcome.title;
  hero.append(art, title);

  const text = document.createElement('div');
  text.className = 'welcome-text';
  const installHost = document.createElement('div');
  text.append(
    ...welcome.message.split('\n\n').map((para) => {
      const p = document.createElement('p');
      p.className = 'welcome-message';
      p.textContent = para;
      return p;
    }),
    installHost,
  );

  scroll.append(bunting, hero, text);

  const footer = document.createElement('div');
  footer.className = 'welcome-footer';
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'btn-primary';
  start.textContent = T.start;
  footer.append(start);
  hero.append(footer);

  screen.append(scroll);
  root.append(screen);

  // Install help: only when not already running as an installed app.
  let alive = true;
  let canPrompt = false;
  let promptSpent = false;
  const renderInstall = (): void => {
    installHost.replaceChildren();
    if (isRunningInstalled()) return;
    if (canPrompt && !promptSpent) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-primary btn-install';
      btn.textContent = T.install;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        void promptInstall().then(() => {
          promptSpent = true;
          if (alive) renderInstall();
        });
      });
      installHost.append(btn);
    } else {
      installHost.append(manualSteps());
    }
  };
  renderInstall();
  const offInstall = onInstallAvailability((can) => {
    canPrompt = can;
    if (alive) renderInstall();
  });

  let started = false;
  start.addEventListener('click', () => {
    if (started) return;
    started = true;
    const next: SaveV1 = opts.save.welcomeSeen ? opts.save : { ...opts.save, welcomeSeen: true };
    if (next !== opts.save) writeSave(opts.storage, next);
    opts.onStart(next);
  });

  return () => {
    alive = false;
    offInstall();
    screen.remove();
  };
}
