import { clues } from '../content';
import { buildBalloons, buildBunting } from './art/cake';
import './screens.css';

// Fixed interface labels (the clues live in content.ts).
const T = {
  next: 'Weiter',
};

export interface LetterOpts {
  /** Level id 1–6; picks the clue and the title "Hinweis N von 6". */
  readonly id: number;
  /** *Weiter*: the router decides between map (with `lit`) and closing. */
  onNext(): void;
}

const RULE_SVG =
  `<svg class="letter-rule" viewBox="0 0 180 14" aria-hidden="true" focusable="false">` +
  `<path d="M2 7H76M104 7H178" stroke="#d9b26f" stroke-width="1.6" stroke-linecap="round"/>` +
  `<circle cx="66" cy="7" r="2" fill="#e89aa8"/><circle cx="114" cy="7" r="2" fill="#e89aa8"/>` +
  `<path d="M90 12C81 6 84 1.5 90 4.5C96 1.5 99 6 90 12Z" fill="#8e2f4f"/></svg>`;

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FLAP_OUT = 'perspective(720px) rotateX(0deg)';
const FLAP_IN = 'perspective(720px) rotateX(180deg)';

/** Mounts the clue letter; returns the unmount function. */
export function mountLetter(root: HTMLElement, opts: LetterOpts): () => void {
  const screen = document.createElement('section');
  screen.className = 'screen letter';

  const bunting = document.createElement('div');
  bunting.className = 'letter-bunting';
  bunting.append(buildBunting());

  const stage = document.createElement('div');
  stage.className = 'letter-stage';

  const envelope = document.createElement('div');
  envelope.className = 'letter-envelope';
  const back = document.createElement('div');
  back.className = 'letter-env-back';
  const front = document.createElement('div');
  front.className = 'letter-env-front';
  const flap = document.createElement('div');
  flap.className = 'letter-env-flap';
  const pieces = [back, front, flap];

  const card = document.createElement('article');
  card.className = 'letter-card';
  const title = document.createElement('h2');
  title.className = 'letter-title';
  title.textContent = `Hinweis ${opts.id} von ${clues.length}`;
  const clue = document.createElement('p');
  clue.className = 'letter-clue';
  clue.textContent = clues[opts.id - 1] ?? '';
  card.append(title);
  card.insertAdjacentHTML('beforeend', RULE_SVG);
  card.append(clue);
  envelope.append(back, card, front, flap);

  const next = document.createElement('div');
  next.className = 'letter-next';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-primary';
  button.textContent = T.next;
  next.append(button);

  const balloons = [buildBalloons(), buildBalloons()];
  balloons[0]!.setAttribute('class', 'letter-balloons is-left');
  balloons[1]!.setAttribute('class', 'letter-balloons is-right');
  stage.append(envelope, ...balloons);
  screen.append(bunting, stage, next);
  root.append(screen);

  let alive = true;
  let clicked = false;
  button.addEventListener('click', () => {
    if (clicked) return;
    clicked = true;
    opts.onNext();
  });

  const running: Animation[] = [];
  /** Runs a WAAPI animation and resolves when it finishes; a cancelled one never resolves the sequence. */
  const play = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> => {
    const a = el.animate(keyframes, { fill: 'both', ...options });
    running.push(a);
    return a.finished.then(
      () => {
        a.cancel();
      },
      () => undefined,
    );
  };

  const reveal = (): void => {
    envelope.classList.add('is-gone');
    card.classList.add('is-shown');
    next.classList.add('is-shown');
    stage.classList.add('is-revealed');
  };

  const sequence = async (): Promise<void> => {
    if (reducedMotion()) {
      envelope.classList.add('is-gone');
      await play(card, [{ opacity: 0 }, { opacity: 1 }], { duration: 450 });
      if (!alive) return;
      card.classList.add('is-shown');
      next.classList.add('is-shown');
      stage.classList.add('is-revealed');
      return;
    }

    // 1. the envelope arrives
    envelope.classList.add('is-shown');
    await Promise.all(
      pieces.map((p) =>
        play(p, [{ opacity: 0, transform: 'translateY(30px) scale(0.9)' }, { opacity: 1, transform: 'none' }], {
          duration: 420,
          easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        }),
      ),
    );
    if (!alive) return;

    // 2. the flap opens: rotateX on the flap only, and only while it animates
    envelope.classList.add('is-opening');
    await play(
      flap,
      [
        { transform: FLAP_OUT, background: 'linear-gradient(180deg, #f1a8b6 0%, #d77f92 100%)', offset: 0 },
        { transform: 'perspective(720px) rotateX(89deg)', background: 'linear-gradient(180deg, #f1a8b6 0%, #d77f92 100%)', offset: 0.49 },
        { transform: 'perspective(720px) rotateX(91deg)', background: 'linear-gradient(0deg, #b04a68 0%, #8e2f4f 100%)', offset: 0.51 },
        { transform: FLAP_IN, background: 'linear-gradient(0deg, #b04a68 0%, #8e2f4f 100%)', offset: 1 },
      ],
      { duration: 620, easing: 'ease-in-out' },
    );
    if (!alive) return;
    envelope.classList.add('is-open'); // same picture as rotateX(180deg), now flat and behind the card

    // 3. the card rises out of the envelope while the envelope sinks away
    card.classList.add('is-shown');
    const rise = play(
      card,
      [{ transform: 'translateY(64px) scale(0.55)' }, { transform: 'none' }],
      { duration: 780, easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)' },
    );
    const sink = Promise.all(
      pieces.map((p) =>
        play(p, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(130px)' }], {
          duration: 460,
          delay: 80,
          easing: 'ease-in',
        }),
      ),
    );
    await Promise.all([rise, sink]);
    if (!alive) return;
    reveal();
    await play(next, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  };

  void sequence();

  return () => {
    alive = false;
    for (const a of running) a.cancel();
    screen.remove();
  };
}
