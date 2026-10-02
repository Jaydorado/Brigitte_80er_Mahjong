/**
 * The level screen: a static festive backdrop, the clue paper under the board, the board and the HUD.
 * Taps go through the reducer; the board animator renders and animates each result. A resize re-fits
 * the board; a new tile width or DPR re-bakes the atlas, swaps it in, and releases the old one.
 *
 * Lifecycle: the screen pushes one history entry, so the phone's Back asks before leaving a level in
 * progress, like Zurück in the HUD. A win is saved at once, then the last match lands, confetti plays
 * and `onWon` follows. Unmounting mid-way stops every animation, effect and pending step.
 */
import { clues } from '../content';
import { newGame, reduce, status, type Action } from '../core/game';
import { layouts } from '../core/layouts';
import { hashSeed, mulberry32 } from '../core/rng';
import { attemptSeed, type LevelDef } from '../levels/levels';
import { markWon, nextAttempt, type SaveV1 } from '../progress/save';
import { BoardAnimator } from './anim';
import { atlasDpr, bakeAtlas, releaseAtlas, type Atlas } from './atlas';
import { createBoard, type BoardView } from './board';
import { createCluePaper } from './cluePaper';
import { confirmLeave, showStuck } from './dialogs';
import { createFx } from './fx';
import { depthCount } from './fit';
import { measureFrame, type Frame } from './frame';
import { createHud } from './hud';
import { startTutorial } from './tutorial';

export interface LevelDeps { save: SaveV1; persist(s: SaveV1): void; onExit(): void; onWon(levelId: number): void }

const ROTATE_TEXT = 'Bitte das Handy drehen';
const TUTORIAL_LEVEL = 1;
/** Long enough for the longest board animation (a relocating shuffle, 450 ms) to land. */
const SETTLE_MS = 460;
const CONFETTI_MS = 1500;
/** Marks the history entry a level screen pushes. */
const HISTORY_KEY = 'mahjong80Level';

function wait(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/** Per level: sky gradient top → middle → bottom, then the bunting's flag colours. */
const THEMES: readonly { sky: readonly [string, string, string]; flags: readonly string[]; string: string }[] = [
  { sky: ['#FDEBEE', '#F4C0CB', '#DE8DA2'], flags: ['#8E2F4F', '#D9B26F', '#FFF8EE', '#C75C7A', '#F2C6CF'], string: '#7A3A50' },
  { sky: ['#FFF2E2', '#F9D2AC', '#E89C72'], flags: ['#8E2F4F', '#FFF8EE', '#D9B26F', '#E89AA8', '#C96A4A'], string: '#7A4632' },
  { sky: ['#F4EDFB', '#D8C6F0', '#A68CD3'], flags: ['#8E2F4F', '#D9B26F', '#FFF8EE', '#7C5FB0', '#E89AA8'], string: '#5A3F7A' },
  { sky: ['#EAF4FC', '#BDDBF3', '#83B4DE'], flags: ['#8E2F4F', '#FFF8EE', '#D9B26F', '#E89AA8', '#4E86B8'], string: '#34587A' },
  { sky: ['#FEF5E1', '#F3DBA6', '#D9AB5F'], flags: ['#8E2F4F', '#FFF8EE', '#E89AA8', '#B07A2A', '#6E8F5A'], string: '#7A5A2A' },
  { sky: ['#F8DDE6', '#C97A96', '#7A2544'], flags: ['#D9B26F', '#FFF8EE', '#E89AA8', '#F4D58D', '#C75C7A'], string: '#F0D9A8' },
  { sky: ['#EFF8EE', '#C8E4CC', '#86B993'], flags: ['#8E2F4F', '#FFF8EE', '#D9B26F', '#E89AA8', '#4F8F6A'], string: '#3F6A4D' },
  { sky: ['#E7F7F5', '#9EDCD6', '#44A0A6'], flags: ['#8E2F4F', '#FFF8EE', '#D9B26F', '#F2C6CF', '#2F7F88'], string: '#245E66' },
];

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The level backdrop as one static SVG: a warm gradient, soft glows, bokeh circles, a few sparkles,
 * a gentle vignette and bunting along the top. Seeded per level, so it never changes between visits.
 */
function backdrop(levelId: number): string {
  const t = THEMES[levelId - 1];
  const rnd = mulberry32(hashSeed(80, levelId));
  const [top, mid, bottom] = t.sky;
  const W = 800;
  const H = 360;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`,
    '<defs>',
    `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`,
    '<radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="b"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset=".55" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>',
    `<radialGradient id="h"><stop offset="0" stop-color="${bottom}" stop-opacity=".38"/><stop offset=".6" stop-color="${bottom}" stop-opacity=".2"/><stop offset="1" stop-color="${bottom}" stop-opacity="0"/></radialGradient>`,
    '<radialGradient id="k"><stop offset="0" stop-color="#FFE7A8" stop-opacity=".55"/><stop offset=".6" stop-color="#FFE7A8" stop-opacity=".25"/><stop offset="1" stop-color="#FFE7A8" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="o"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset=".78" stop-color="#fff" stop-opacity=".16"/><stop offset=".9" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="v" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#3A1F2B" stop-opacity="0"/><stop offset="1" stop-color="#3A1F2B" stop-opacity=".28"/></radialGradient>',
    '</defs>',
    `<rect width="${W}" height="${H}" fill="url(#s)"/>`,
    `<ellipse cx="230" cy="70" rx="430" ry="230" fill="url(#g)"/>`,
    `<ellipse cx="660" cy="330" rx="300" ry="160" fill="url(#g)" opacity=".6"/>`,
  ];

  // Bokeh: soft discs, warm gold discs and lens rings, larger ones fainter.
  const fills = ['b', 'b', 'k', 'o', 'h'];
  for (let i = 0; i < 30; i++) {
    const r = 8 + rnd() * rnd() * 62;
    const x = rnd() * W;
    const y = 30 + rnd() * (H - 30);
    const f = fills[Math.floor(rnd() * fills.length)];
    const op = 0.45 + (1 - r / 70) * 0.5;
    out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="url(#${f})" opacity="${r1(op * 10) / 10}"/>`);
  }
  // Sparkles: small four-point stars.
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W;
    const y = 50 + rnd() * (H - 60);
    const s = 0.5 + rnd() * 0.9;
    const c = rnd() < 0.5 ? '#FFF8EE' : '#F6DC9A';
    out.push(
      `<path transform="translate(${r1(x)} ${r1(y)}) scale(${r1(s)})" d="M0-7C.6-2 2-.6 7 0 2 .6.6 2 0 7-.6 2-2 .6-7 0-2-.6-.6-2 0-7Z" fill="${c}" opacity=".85"/>`,
    );
  }
  out.push(`<rect width="${W}" height="${H}" fill="url(#v)"/>`);

  // Bunting: three swags of pennants hanging from a string along the top.
  const anchors = [-40, 250, 540, 840];
  let flag = 0;
  for (let k = 0; k < anchors.length - 1; k++) {
    const x0 = anchors[k];
    const x1 = anchors[k + 1];
    const y0 = 3;
    const cx = (x0 + x1) / 2;
    const cy = y0 + 56;
    out.push(`<path d="M${x0} ${y0}Q${cx} ${cy} ${x1} ${y0}" fill="none" stroke="${t.string}" stroke-width="1.6" opacity=".75"/>`);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const px = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * cx + u * u * x1;
      const py = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * cy + u * u * y0;
      const dx = 2 * (1 - u) * (cx - x0) + 2 * u * (x1 - cx);
      const dy = 2 * (1 - u) * (cy - y0) + 2 * u * (y0 - cy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const color = t.flags[flag % t.flags.length];
      const dot = color === '#FFF8EE' ? '#E89AA8' : '#FFF8EE';
      flag++;
      out.push(
        `<g transform="translate(${r1(px)} ${r1(py)}) rotate(${r1(angle * 0.85)})">`,
        `<path d="M-12 0H12L2 25.5Q0 28-2 25.5Z" fill="${color}"/>`,
        '<path d="M0 0H12L2 25.5Q0 28 0 27Z" fill="#3A1F2B" opacity=".1"/>',
        '<path d="M-12 0H12L11 2.2H-11Z" fill="#fff" opacity=".35"/>',
        `<circle cy="8" r="2.6" fill="${dot}" opacity=".85"/><circle cx="-4.5" cy="3.6" r="1.4" fill="${dot}" opacity=".6"/><circle cx="4.5" cy="3.6" r="1.4" fill="${dot}" opacity=".6"/>`,
        '</g>',
      );
    }
    out.push(`<circle cx="${x1}" cy="${y0 + 1}" r="3.2" fill="#D9B26F" stroke="${t.string}" stroke-width=".8"/>`);
  }
  out.push('</svg>');
  return `url("data:image/svg+xml,${encodeURIComponent(out.join(''))}"), linear-gradient(${top}, ${bottom})`;
}

const PHONE_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="22" height="36" rx="4" opacity=".45"/><path d="M36 8a20 20 0 0 1 18 18"/><path d="M56 18l-2 8-8-2"/><rect x="18" y="34" width="40" height="24" rx="4" fill="currentColor" fill-opacity=".18"/><path d="M52 42v8"/></svg>';

export function mountLevel(root: HTMLElement, level: LevelDef, deps: LevelDeps): () => void {
  const layout = layouts[level.layoutId];
  const { save, attempt } = nextAttempt(deps.save, level.id);
  deps.persist(save);
  let state = newGame(layout, level.faces, attemptSeed(level.id, attempt));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const screen = document.createElement('div');
  screen.className = 'level';
  screen.dataset.level = String(level.id);
  const bg = document.createElement('div');
  bg.className = 'level-bg';
  bg.style.backgroundImage = backdrop(level.id);
  const area = document.createElement('div');
  area.className = 'level-area';
  const hud = createHud({
    back: () => requestLeave(),
    hint: () => !tutorialPending && dispatch({ type: 'hint' }),
    undo: () => !tutorialPending && dispatch({ type: 'undo' }),
    shuffle: () => !tutorialPending && dispatch({ type: 'shuffle' }),
  });
  const overlay = document.createElement('div');
  overlay.className = 'rotate-overlay';
  overlay.innerHTML = PHONE_ICON;
  const overlayText = document.createElement('p');
  overlayText.textContent = ROTATE_TEXT;
  overlay.append(overlayText);
  screen.append(bg, area, hud.el, overlay);
  root.append(screen);
  hud.update(state);

  const paper = createCluePaper(clues[level.clueIndex], level.clueScale);
  const fx = createFx(screen);
  let alive = true;
  /** Bumped on unmount: every delayed step (stuck dialog, win sequence) checks it before acting. */
  let gen = 0;
  let won = false;
  let leaving = false;
  let confirming = false;
  let closeStuck: (() => void) | null = null;
  /** The newest save this screen wrote (the tutorial flag and a win both build on it). */
  let saved = save;
  /** Level 1's first run: board and helpers stay dead from the first frame until the tutorial owns them. */
  let tutorialPending = level.id === TUTORIAL_LEVEL && !save.tutorialDone;
  let cancelTutorial: (() => void) | null = null;
  /** While the tutorial runs it owns board taps: it forwards the ones it allows to `dispatch`. */
  let tutorialTap: ((slot: number) => void) | null = null;
  let tutorialBoardChanged: (() => void) | null = null;
  let tutorialTimer = 0;
  let stuckTimer = 0;
  /** The player closed the stuck dialog with ×, Escape or a backdrop tap: no re-offer until asked. */
  let stuckDismissed = false;
  let board: BoardView | null = null;
  let animator: BoardAnimator | null = null;
  let atlas: Atlas | null = null;
  let bakeGen = 0;
  let requested = { w: 0, dpr: 0 };
  let frame: Frame;

  function dispatch(a: Action): void {
    if (!alive || won || leaving) return;
    const prev = state;
    state = reduce(state, a);
    const now = status(state);
    if (now === 'won') {
      won = true;
      deps.persist((saved = markWon(saved, level.id))); // saved before anything plays
    }
    if (animator) animator.play(prev, state);
    hud.update(state);
    if (now === 'won') {
      void celebrate();
    } else if (now === 'stuck' && (status(prev) !== 'stuck' || state.event.type === 'stuckHint')) {
      stuckDismissed = false;
      offerStuck();
    }
  }

  /** The stuck dialog, once the move that got here has landed (at most one open). */
  function offerStuck(): void {
    clearTimeout(stuckTimer);
    const g = gen;
    stuckTimer = window.setTimeout(() => {
      stuckTimer = 0;
      // While the leave question is open, its Weiterspielen offers this again.
      if (g !== gen || won || leaving || confirming || closeStuck || status(state) !== 'stuck') return;
      const closed = (then?: Action): void => {
        closeStuck = null;
        if (then) dispatch(then);
        else stuckDismissed = true;
      };
      closeStuck = showStuck(screen, {
        canUndo: state.history.length > 0,
        onShuffle: () => closed({ type: 'shuffle' }),
        onUndo: () => closed({ type: 'undo' }),
        onDismiss: () => closed(),
      });
    }, SETTLE_MS);
  }

  /** The last match lands, confetti plays and its last pieces fall (effect clock); then `onWon`. */
  async function celebrate(): Promise<void> {
    const g = gen;
    await wait(SETTLE_MS);
    if (g !== gen) return;
    await fx.confetti(CONFETTI_MS);
    if (g !== gen) return;
    await fx.idle(); // ≤ CONFETTI_TAIL_MS of shown time; pauses with the effects while hidden
    if (g !== gen) return;
    deps.onWon(level.id);
  }

  /** Zurück in the HUD, or the phone's Back: a level in progress asks first. */
  function requestLeave(): void {
    if (!alive || won || leaving || confirming) return;
    if (state.history.length === 0) {
      leave();
      return;
    }
    confirming = true;
    closeStuck?.();
    closeStuck = null;
    const g = gen;
    void confirmLeave(screen).then((yes) => {
      if (g !== gen) return;
      confirming = false;
      if (yes) leave();
      else if (status(state) === 'stuck' && !stuckDismissed) offerStuck();
    });
  }

  /** Leaves through our history entry, so the next Back does not land on it again. */
  function leave(): void {
    leaving = true;
    if ((history.state as Record<string, unknown> | null)?.[HISTORY_KEY] === level.id) history.back();
    else deps.onExit();
  }

  const onPopState = (): void => {
    if (!alive) return;
    if (leaving) {
      deps.onExit();
      return;
    }
    if (won) return; // the win is saved; its letter follows in a moment
    if (state.history.length === 0 && !confirming) {
      leaving = true;
      deps.onExit();
      return;
    }
    history.pushState({ [HISTORY_KEY]: level.id }, ''); // stay on the level while asking
    requestLeave();
  };

  /** The board the tutorial sees: always the current one, with its taps routed to the tutorial. */
  const tutorialBoard: BoardView = {
    get el() {
      return board!.el;
    },
    render: (s) => board!.render(s),
    tileEl: (slot) => board!.tileEl(slot),
    pos: (slot) => board!.pos(slot),
    center: (slot) => board!.center(slot),
    fit: (area) => board!.fit(area),
    onTap: (cb) => {
      tutorialTap = cb;
    },
    destroy() {},
  };

  /** Level 1, until it was done or skipped once: the guided tutorial starts once the board has settled. */
  function scheduleTutorial(): void {
    if (level.id !== TUTORIAL_LEVEL || saved.tutorialDone) return;
    const g = gen;
    tutorialTimer = window.setTimeout(() => {
      tutorialTimer = 0;
      tutorialPending = false;
      if (g !== gen || won || leaving) return;
      const [hint, undo, shuffle] = hud.el.querySelectorAll<HTMLElement>('.hud-btn');
      cancelTutorial = startTutorial({
        root: screen,
        board: tutorialBoard,
        getState: () => state,
        dispatch,
        helpers: { hint, undo, shuffle },
        onBoardChange: (cb) => {
          tutorialBoardChanged = cb;
        },
        onDone() {
          tutorialTap = null;
          tutorialBoardChanged = null;
          cancelTutorial = null;
          deps.persist((saved = { ...saved, tutorialDone: true }));
        },
      });
    }, SETTLE_MS);
  }

  history.pushState({ [HISTORY_KEY]: level.id }, '');
  window.addEventListener('popstate', onPopState);

  function applyFrame(): void {
    frame = measureFrame(screen, layout);
    const s = area.style;
    s.left = `${frame.area.x}px`;
    s.top = `${frame.area.y}px`;
    s.width = `${frame.area.w}px`;
    s.height = `${frame.area.h}px`;
  }

  async function build(): Promise<void> {
    const bake = ++bakeGen;
    const w = frame.w;
    const dpr = atlasDpr();
    requested = { w, dpr };
    let next: Atlas;
    try {
      next = await bakeAtlas(level.faces, depthCount(layout.slots), w, dpr); // the map pre-bakes with these
    } catch (err) {
      if (bake === bakeGen) requested = { w: 0, dpr: 0 }; // let the next resize retry
      console.error('[level] atlas bake failed', err);
      return;
    }
    if (!alive || bake !== bakeGen) {
      releaseAtlas(next);
      return;
    }
    animator?.finishAll(); // the old board lands in the current state before the swap
    const nb = createBoard(layout, next, w);
    nb.onTap((slot) => {
      if (tutorialPending) return;
      if (tutorialTap) tutorialTap(slot);
      else dispatch({ type: 'tap', slot });
    });
    paper.place(layout, w);
    nb.el.prepend(paper.el);
    nb.fit(frame.area);
    nb.render(state);
    const old = board;
    const first = old === null; // the first board on screen, whichever bake produced it
    const oldAtlas = atlas;
    board = nb;
    animator = new BoardAnimator(nb, fx, reducedMotion);
    atlas = next;
    area.replaceChildren(nb.el);
    old?.destroy();
    screen.dataset.w = String(w);
    console.info(`[level ${level.id}] tile width w=${w}px, dpr=${dpr}`);
    requestAnimationFrame(() => {
      if (oldAtlas) releaseAtlas(oldAtlas); // the new atlas is on screen now
      if (first && alive) {
        performance.mark('level-ready');
        if (performance.getEntriesByName('level-tap', 'mark').length > 0) {
          performance.measure('level-start', 'level-tap', 'level-ready');
        }
      }
    });
    if (first) scheduleTutorial();
    else tutorialBoardChanged?.();
    const px = await paper.fitText();
    if (alive && bake === bakeGen) console.info(`[level ${level.id}] clue ${px}px`);
  }

  let resizeRaf = 0;
  const relayout = () => {
    resizeRaf = 0;
    if (!alive) return;
    applyFrame();
    if (frame.w !== requested.w || atlasDpr() !== requested.dpr) void build();
    else board?.fit(frame.area);
  };
  const onResize = () => {
    if (resizeRaf === 0) resizeRaf = requestAnimationFrame(relayout);
  };
  // A DPR change (zoom, moving screens) needs a re-bake even when the CSS size stays the same.
  let dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const onDpr = () => {
    onResize();
    dprQuery.removeEventListener('change', onDpr);
    dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener('change', onDpr);
  };
  dprQuery.addEventListener('change', onDpr);
  window.addEventListener('resize', onResize);

  applyFrame();
  void build();

  return () => {
    if (!alive) return;
    alive = false;
    gen++;
    bakeGen++;
    window.removeEventListener('resize', onResize);
    window.removeEventListener('popstate', onPopState);
    dprQuery.removeEventListener('change', onDpr);
    if (resizeRaf !== 0) cancelAnimationFrame(resizeRaf);
    clearTimeout(stuckTimer);
    clearTimeout(tutorialTimer);
    cancelTutorial?.(); // an interrupted tutorial is not saved: it restarts next time
    cancelTutorial = null;
    tutorialTap = null;
    tutorialBoardChanged = null;
    closeStuck?.();
    closeStuck = null;
    animator?.cancelAll();
    animator = null;
    fx.destroy();
    board?.destroy();
    if (atlas) releaseAtlas(atlas);
    board = null;
    atlas = null;
    screen.remove();
  };
}
