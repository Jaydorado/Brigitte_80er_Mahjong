import { clues, credit, finale } from '../content';
import { buildBunting, buildMiniCake, pauseOnHidden } from './art/cake';
import { createFx } from './fx';
import './screens.css';

// Fixed interface labels (the family texts live in content.ts).
const T = {
  heading: 'Deine sechs Hinweise',
  back: 'Zur Torte',
};

const SHOW_MS = 4000;
const SHOW_GAP_MS = 1400;

export interface ClosingOpts {
  /** *Zur Torte*. */
  onBack(): void;
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  for (const clue of clues) {
    const li = document.createElement('li');
    li.textContent = clue;
    list.append(li);
  }
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

  // The fireworks loop gently for as long as the screen is up; the fx clock stops while hidden.
  let alive = true;
  let timer = 0;
  const show = (): void => {
    void fx.fireworks(SHOW_MS).then(() => {
      if (alive) timer = window.setTimeout(show, SHOW_GAP_MS);
    });
  };
  if (!reducedMotion()) timer = window.setTimeout(show, 350);

  return () => {
    alive = false;
    clearTimeout(timer);
    offPause();
    fx.destroy();
    screen.remove();
  };
}
