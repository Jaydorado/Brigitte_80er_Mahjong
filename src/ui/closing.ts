import { isCorrectAnswer } from '../core/answer';
import { clues, credit, finale, reveal } from '../content';
import { markSolved, type SaveV1 } from '../progress/save';
import { buildBunting, buildMiniCake, pauseOnHidden } from './art/cake';
import { createFx, type Fx } from './fx';
import './screens.css';

// Fixed interface labels (the family texts live in content.ts).
const T = {
  heading: 'Deine acht Hinweise',
  back: 'Zur Torte',
  question: 'Wohin geht die Reise?',
  submit: 'Antworten',
  wrong: 'Noch nicht ganz – schau dir die Hinweise nochmal an.',
  reveal: 'Auflösung zeigen',
  secret: 'Das Geheimnis',
  photoAlt: 'Das Seeschloss Ort im Traunsee bei Gmunden',
  photoBy: 'Foto:',
};

/** The reveal photo, pinned in `public/photo-credit.md` (a separately licensed work). */
const PHOTO = {
  file: 'seeschloss-ort.webp',
  creator: 'Dimitry Anikin',
  licence: 'CC0 1.0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  source: 'Wikimedia Commons',
  page: 'https://commons.wikimedia.org/wiki/File:Schlo%C3%9F_Ort_2.jpg',
  changes: 'verkleinert, als WebP gespeichert',
};

const SHOW_MS = 4000;
const SHOW_GAP_MS = 1400;
/** Wrong tries before *Auflösung zeigen* appears (the count is not saved). */
const REVEAL_AFTER = 3;
/**
 * The celebration burst: this many rockets at once. A `fireworks(ms)` call with ms ≤ 900 launches
 * exactly one rocket (launches stop 900 ms before `ms`), a peony that climbs for < 0.9 s and whose
 * sparks live < 1.8 s, so the whole burst is over within 3 s.
 */
const BURST_ROCKETS = 3;
const ROCKET_SHOW_MS = 900;
/** The photo fades in no earlier than this after the burst began (and never before it is decoded). */
const PHOTO_AFTER_MS = 1000;
const PHOTO_FADE_MS = 900;
const SHAKE_MS = 420;
const SHAKE: Keyframe[] = [0, -10, 9, -7, 5, -2, 0].map((x) => ({ transform: `translateX(${x}px)` }));
/** The keyboard fallback kicks in when the visual viewport is this much shorter than the window. */
const KEYBOARD_SLACK_PX = 50;
/** The key the closing screen puts on the history entry it pushes, so system Back leads to the map. */
const HISTORY_KEY = 'mahjong80Closing';

/** How long boot waits for the pop of a stale closing entry before it gives up and boots in place. */
const STALE_POP_WAIT_MS = 1000;

/**
 * Boot step (main.ts): runs `start` once the history entry is settled. A reload while the closing
 * screen is open boots into the map but leaves the closing entry (and its key) on top of the map's
 * own; Back from the map would then land on that dead entry, and a later *Zur Torte* would pop back
 * to it. So that entry is popped first, and the app starts only after its `popstate`, so no screen
 * mounted in the meantime takes that pop for a Back. Should the pop never arrive (no entry below),
 * the entry is made plain and the app starts anyway.
 */
export function settleClosingHistory(start: () => void): void {
  if ((history.state as Record<string, unknown> | null)?.[HISTORY_KEY] !== true) {
    start();
    return;
  }
  let started = false;
  const go = (): void => {
    if (started) return;
    started = true;
    clearTimeout(fallback);
    window.removeEventListener('popstate', go);
    if ((history.state as Record<string, unknown> | null)?.[HISTORY_KEY] === true) history.replaceState(null, '');
    start();
  };
  const fallback = window.setTimeout(go, STALE_POP_WAIT_MS);
  window.addEventListener('popstate', go);
  history.back();
}

export interface ClosingOpts {
  /** The progress at mount: `solved` decides between the answer region and *Das Geheimnis*. */
  save: SaveV1;
  /** Writes the save (the router keeps its copy in sync). */
  persist(next: SaveV1): void;
  /** *Zur Torte* and system Back. */
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

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function link(text: string, href: string): HTMLAnchorElement {
  const a = make('a', 'closing-photo-link', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/**
 * Mounts the closing screen; returns the unmount function.
 *
 * States (spec §5): the clues with the answer region (or *Das Geheimnis* once solved) under the
 * ambient fireworks → accepted or revealed: `solved` is saved, the ambient show stops, one short burst
 * plays while the photo decodes → the photo view fades in once the photo is decoded and 1 s has passed
 * (at once after decoding under reduced motion). Unmounting cancels the burst, the decode callback and
 * the timers.
 */
export function mountClosing(root: HTMLElement, opts: ClosingOpts): () => void {
  const screen = make('section', 'screen closing');

  const bunting = make('div', 'closing-bunting');
  bunting.append(buildBunting());

  const body = make('div', 'closing-body');

  // The main column: the answer region on top (never shrinks), the clue list under it (scrolls).
  const main = make('div', 'closing-main');
  const controls: (HTMLInputElement | HTMLButtonElement)[] = [];
  let input: HTMLInputElement | null = null;
  let region: HTMLElement;
  if (opts.save.solved === true) {
    region = make('div', 'closing-answer is-solved');
    const secret = make('button', 'btn-primary closing-secret', T.secret);
    secret.type = 'button';
    secret.addEventListener('click', () => celebrate(false));
    region.append(secret);
    controls.push(secret);
  } else {
    const form = make('form', 'closing-answer');
    form.noValidate = true;
    const question = make('label', 'closing-question', T.question);
    const field = make('input', 'closing-input');
    field.type = 'text';
    field.id = 'closing-answer-input';
    field.spellcheck = false;
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('enterkeyhint', 'send');
    question.htmlFor = field.id;
    const submit = make('button', 'btn-primary closing-submit', T.submit);
    submit.type = 'submit';
    const showAnswer = make('button', 'closing-reveal', T.reveal);
    showAnswer.type = 'button';
    showAnswer.hidden = true;
    const wrong = make('p', 'closing-wrong', T.wrong);
    wrong.setAttribute('role', 'status');
    wrong.hidden = true;
    form.append(question, field, submit, showAnswer, wrong);

    let wrongTries = 0;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (celebrating) return;
      if (isCorrectAnswer(field.value)) {
        celebrate(true);
        return;
      }
      wrongTries++;
      wrong.hidden = false;
      if (wrongTries >= REVEAL_AFTER) showAnswer.hidden = false;
      if (!reducedMotion()) field.animate(SHAKE, { duration: SHAKE_MS, easing: 'ease-in-out' });
    });
    showAnswer.addEventListener('click', () => celebrate(true));
    region = form;
    input = field;
    controls.push(field, submit, showAnswer);
  }

  const parchment = make('article', 'closing-parchment');
  const heading = make('h2', 'closing-heading', T.heading);
  const list = make('ol', 'closing-clues');
  clues.forEach((clue, i) => {
    const li = make('li', '', clue);
    li.style.setProperty('--i', String(i));
    list.append(li);
  });
  parchment.append(heading, list);
  main.append(region, parchment);

  const side = make('div', 'closing-side');
  const message = make('p', 'closing-finale', finale);
  const signature = make('p', 'closing-credit', credit);
  const cake = buildMiniCake();
  const cakeBox = make('div', 'closing-cake');
  cakeBox.append(cake.svg);
  const back = make('button', 'btn-primary closing-back', T.back);
  back.type = 'button';
  side.append(message, signature, cakeBox, back);

  body.append(main, side);
  screen.append(bunting, body);
  root.append(screen);

  let alive = true;
  let celebrating = false;
  let burst: Fx | null = null;
  let photoTimer = 0;

  const ambient = createFx(screen);
  const offPause = pauseOnHidden(screen);

  // The fireworks loop gently for as long as the screen is visible; a hidden page stops the timers too.
  const loop = createShowLoop(() => ambient.fireworks(SHOW_MS), () => document.visibilityState === 'hidden');
  const onVisibility = (): void => loop.visibilityChanged();
  if (!reducedMotion()) {
    document.addEventListener('visibilitychange', onVisibility);
    loop.start();
  }

  // Leaving: *Zur Torte* and system Back both go to the map. The pushed entry gives Back something to
  // pop; *Zur Torte* pops it too, so the map is never left with a dead entry above it.
  let left = false;
  let popping = false;
  const exit = (): void => {
    if (left) return;
    left = true;
    opts.onBack();
  };
  const leave = (): void => {
    if (left || popping) return;
    if ((history.state as Record<string, unknown> | null)?.[HISTORY_KEY] === true) {
      popping = true;
      history.back(); // its popstate calls exit
    } else exit();
  };
  history.pushState({ [HISTORY_KEY]: true }, '');
  window.addEventListener('popstate', exit);
  back.addEventListener('click', leave);

  // Keyboard fallback for browsers that ignore `interactive-widget=resizes-content`: while the field
  // has focus and the visual viewport is clearly shorter than the window, the screen follows it.
  const viewport = window.visualViewport ?? null;
  const fitKeyboard = (): void => {
    const squeezed =
      viewport !== null && input !== null && document.activeElement === input && viewport.height < innerHeight - KEYBOARD_SLACK_PX;
    screen.style.height = squeezed ? `${Math.round(viewport.height)}px` : '';
  };
  if (input !== null) {
    viewport?.addEventListener('resize', fitKeyboard);
    input.addEventListener('focus', fitKeyboard);
    input.addEventListener('blur', fitKeyboard);
  }

  /** Accepted, revealed, or *Das Geheimnis*: save first, then the burst and the decode in parallel. */
  function celebrate(persist: boolean): void {
    if (celebrating || !alive) return;
    celebrating = true;
    if (persist) opts.persist(markSolved(opts.save));
    for (const c of controls) c.disabled = true;
    input?.blur();

    loop.stop();
    document.removeEventListener('visibilitychange', onVisibility);
    ambient.destroy(); // a show still in flight ends here, so the burst alone bounds the effects

    const calm = reducedMotion();
    let decoded = false;
    let waited = calm;
    const img = make('img', 'closing-photo-img');
    img.alt = T.photoAlt;
    img.src = `${import.meta.env.BASE_URL}${PHOTO.file}`;
    const ready = (): void => {
      if (alive && decoded && waited) showPhoto(img);
    };
    if (!calm) {
      burst = createFx(screen);
      for (let i = 0; i < BURST_ROCKETS; i++) void burst.fireworks(ROCKET_SHOW_MS);
      photoTimer = window.setTimeout(() => {
        waited = true;
        ready();
      }, PHOTO_AFTER_MS);
    }
    img
      .decode()
      .catch(() => {
        img.hidden = true; // not loadable (it is precached, so this should not happen): text only
      })
      .then(() => {
        decoded = true;
        ready();
      });
  }

  function showPhoto(img: HTMLImageElement): void {
    const view = make('div', 'closing-photo');
    const plaque = make('div', 'closing-photo-plaque');
    plaque.append(make('h2', 'closing-photo-title', reveal.title), make('p', 'closing-photo-message', reveal.message));
    const photoCredit = make('p', 'closing-photo-credit');
    photoCredit.append(
      `${T.photoBy} ${PHOTO.creator} · `,
      link(PHOTO.licence, PHOTO.licenceUrl),
      ' · ',
      link(PHOTO.source, PHOTO.page),
      ` · ${PHOTO.changes}`,
    );
    const photoBack = make('button', 'btn-primary closing-photo-back', T.back);
    photoBack.type = 'button';
    photoBack.addEventListener('click', leave);
    view.append(img, plaque, photoCredit, photoBack);
    // Nothing may run on under the photo: the cake's flames, glows and sparkles loop forever. Frozen
    // while the photo fades in over them, then out of rendering. The photo only ever leaves for the map
    // (a fresh mount), so they never need to come back. Under reduced motion there is no fade: the
    // photo is there at once and the content under it leaves rendering at once.
    const under = [bunting, body];
    const hideUnder = (): void => {
      for (const el of under) el.hidden = true;
    };
    for (const el of under) el.classList.add('is-paused');
    screen.append(view);
    if (reducedMotion()) {
      hideUnder();
      return;
    }
    view.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PHOTO_FADE_MS, easing: 'ease-out' }).finished.then(
      hideUnder,
      () => {}, // cancelled by the unmount: the screen is gone anyway
    );
  }

  return () => {
    alive = false;
    clearTimeout(photoTimer);
    loop.stop();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('popstate', exit);
    viewport?.removeEventListener('resize', fitKeyboard);
    offPause();
    ambient.destroy();
    burst?.destroy();
    screen.remove();
  };
}
