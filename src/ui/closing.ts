import { clues, credit, finale } from '../content';
import { buildBunting, buildMiniCake, pauseOnHidden } from './art/cake';
import { createFx } from './fx';
import './screens.css';

// Fixed interface labels (the family texts live in content.ts).
const T = {
  heading: 'Deine acht Hinweise',
  back: 'Zur Torte',
};

const SHOW_MS = 4000;
const SHOW_GAP_MS = 1400;

export interface ClosingOpts {
  /** *Zur Torte*. */
  onBack(): void;
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface ShowLoop {
  /** Begins the loop after the start delay (nothing while the page is hidden). */
  start(): void;
  /** Call on `visibilitychange`: stops the timer while hidden, restarts it when visible again. */
  visibilityChanged(): void;
  /** Ends the loop for good. */
  stop(): void;
}

/**
 * Plays one firework show, waits `SHOW_GAP_MS`, and plays the next, for as long as the page is visible.
 * A show already in flight finishes on its own (the effect clock pauses with a hidden page); only the
 * timers are stopped and restarted here.
 */
export function createShowLoop(
  play: () => Promise<void>,
  isHidden: () => boolean,
  startDelayMs = 350,
  gapMs = SHOW_GAP_MS,
): ShowLoop {
  let alive = true;
  let playing = false;
  let timer: Parameters<typeof clearTimeout>[0];

  const schedule = (ms: number): void => {
    if (!alive || playing || timer !== undefined || isHidden()) return;
    timer = setTimeout(run, ms);
  };
  const run = (): void => {
    timer = undefined;
    if (!alive || isHidden()) return;
    playing = true;
    void play().then(() => {
      playing = false;
      schedule(gapMs);
    });
  };

  return {
    start: () => schedule(startDelayMs),
    visibilityChanged() {
      if (isHidden()) {
        clearTimeout(timer);
        timer = undefined;
      } else schedule(startDelayMs);
    },
    stop() {
      alive = false;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}

/** Mounts the closing screen; returns the unmount function. */
export function mountClosing(root: HTMLElement, opts: ClosingOpts): () => void {
  const screen = document.createElement('section');
  screen.className = 'screen closing';

  const bunting = document.createElement('div');
  bunting.className = 'closing-bunting';
  bunting.append(buildBunting());

  const body = document.createElement('div');
  body.className = 'closing-body';

  const parchment = document.createElement('article');
  parchment.className = 'closing-parchment';
  const heading = document.createElement('h2');
  heading.className = 'closing-heading';
  heading.textContent = T.heading;
  const list = document.createElement('ol');
  list.className = 'closing-clues';
  clues.forEach((clue, i) => {
    const li = document.createElement('li');
    li.textContent = clue;
    li.style.setProperty('--i', String(i));
    list.append(li);
  });
  parchment.append(heading, list);

  const side = document.createElement('div');
  side.className = 'closing-side';
  const message = document.createElement('p');
  message.className = 'closing-finale';
  message.textContent = finale;
  const signature = document.createElement('p');
  signature.className = 'closing-credit';
  signature.textContent = credit;
  const cake = buildMiniCake();
  const cakeBox = document.createElement('div');
  cakeBox.className = 'closing-cake';
  cakeBox.append(cake.svg);
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn-primary closing-back';
  back.textContent = T.back;
  side.append(message, signature, cakeBox, back);

  body.append(parchment, side);
  screen.append(bunting, body);
  root.append(screen);

  const fx = createFx(screen);
  const offPause = pauseOnHidden(screen);
  back.addEventListener('click', () => opts.onBack());

  // The fireworks loop gently for as long as the screen is visible; a hidden page stops the timers too.
  const loop = createShowLoop(() => fx.fireworks(SHOW_MS), () => document.visibilityState === 'hidden');
  const onVisibility = (): void => loop.visibilityChanged();
  if (!reducedMotion()) {
    document.addEventListener('visibilitychange', onVisibility);
    loop.start();
  }

  return () => {
    loop.stop();
    document.removeEventListener('visibilitychange', onVisibility);
    offPause();
    fx.destroy();
    screen.remove();
  };
}
