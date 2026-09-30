/**
 * The level screen: a static festive backdrop, the clue paper under the board, the board and the HUD.
 * Taps go through the reducer and the board re-syncs without animation. A resize re-fits the board;
 * a new tile width or DPR re-bakes the atlas, swaps it in, and releases the old one.
 */
import { clues } from '../content';
import { newGame, reduce, status, type Action } from '../core/game';
import { layouts } from '../core/layouts';
import { hashSeed, mulberry32 } from '../core/rng';
import { attemptSeed, type LevelDef } from '../levels/levels';
import { nextAttempt, type SaveV1 } from '../progress/save';
import { atlasDpr, bakeAtlas, releaseAtlas, type Atlas } from './atlas';
import { createBoard, type BoardView } from './board';
import { createCluePaper } from './cluePaper';
import { measureFrame, type Frame } from './frame';
import { createHud } from './hud';

export interface LevelDeps { save: SaveV1; persist(s: SaveV1): void; onExit(): void; onWon(levelId: number): void }

const ROTATE_TEXT = 'Bitte das Handy drehen';

/** Per level: sky gradient top → middle → bottom, then the bunting's flag colours. */
const THEMES: readonly { sky: readonly [string, string, string]; flags: readonly string[]; string: string }[] = [
  { sky: ['#FDEBEE', '#F4C0CB', '#DE8DA2'], flags: ['#8E2F4F', '#D9B26F', '#FFF8EE', '#C75C7A', '#F2C6CF'], string: '#7A3A50' },
  { sky: ['#FFF2E2', '#F9D2AC', '#E89C72'], flags: ['#8E2F4F', '#FFF8EE', '#D9B26F', '#E89AA8', '#C96A4A'], string: '#7A4632' },
  { sky: ['#F4EDFB', '#D8C6F0', '#A68CD3'], flags: ['#8E2F4F', '#D9B26F', '#FFF8EE', '#7C5FB0', '#E89AA8'], string: '#5A3F7A' },
  { sky: ['#EAF4FC', '#BDDBF3', '#83B4DE'], flags: ['#8E2F4F', '#FFF8EE', '#D9B26F', '#E89AA8', '#4E86B8'], string: '#34587A' },
  { sky: ['#FEF5E1', '#F3DBA6', '#D9AB5F'], flags: ['#8E2F4F', '#FFF8EE', '#E89AA8', '#B07A2A', '#6E8F5A'], string: '#7A5A2A' },
  { sky: ['#F8DDE6', '#C97A96', '#7A2544'], flags: ['#D9B26F', '#FFF8EE', '#E89AA8', '#F4D58D', '#C75C7A'], string: '#F0D9A8' },
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

  const screen = document.createElement('div');
  screen.className = 'level';
  screen.dataset.level = String(level.id);
  const bg = document.createElement('div');
  bg.className = 'level-bg';
  bg.style.backgroundImage = backdrop(level.id);
  const area = document.createElement('div');
  area.className = 'level-area';
  const hud = createHud({
    back: () => deps.onExit(),
    hint: () => dispatch({ type: 'hint' }),
    undo: () => dispatch({ type: 'undo' }),
    shuffle: () => dispatch({ type: 'shuffle' }),
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

  const paper = createCluePaper(clues[level.clueIndex]);
  let alive = true;
  let won = false;
  let board: BoardView | null = null;
  let atlas: Atlas | null = null;
  let bakeGen = 0;
  let requested = { w: 0, dpr: 0 };
  let frame: Frame;

  function dispatch(a: Action): void {
    if (!alive) return;
    state = reduce(state, a);
    board?.render(state);
    hud.update(state);
    if (!won && status(state) === 'won') {
      won = true;
      deps.onWon(level.id);
    }
  }

  function applyFrame(): void {
    frame = measureFrame(screen, layout);
    const s = area.style;
    s.left = `${frame.area.x}px`;
    s.top = `${frame.area.y}px`;
    s.width = `${frame.area.w}px`;
    s.height = `${frame.area.h}px`;
  }

  async function build(): Promise<void> {
    const gen = ++bakeGen;
    const w = frame.w;
    const dpr = atlasDpr();
    requested = { w, dpr };
    let next: Atlas;
    try {
      next = await bakeAtlas(level.faces, w, dpr);
    } catch (err) {
      if (gen === bakeGen) requested = { w: 0, dpr: 0 }; // let the next resize retry
      console.error('[level] atlas bake failed', err);
      return;
    }
    if (!alive || gen !== bakeGen) {
      releaseAtlas(next);
      return;
    }
    const nb = createBoard(layout, next, w);
    nb.onTap((slot) => dispatch({ type: 'tap', slot }));
    paper.place(layout, w);
    nb.el.prepend(paper.el);
    nb.fit(frame.area);
    nb.render(state);
    const old = board;
    const first = old === null; // the first board on screen, whichever bake produced it
    const oldAtlas = atlas;
    board = nb;
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
    const px = await paper.fitText();
    if (alive && gen === bakeGen) console.info(`[level ${level.id}] clue ${px}px`);
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
    bakeGen++;
    window.removeEventListener('resize', onResize);
    dprQuery.removeEventListener('change', onDpr);
    if (resizeRaf !== 0) cancelAnimationFrame(resizeRaf);
    board?.destroy();
    if (atlas) releaseAtlas(atlas);
    board = null;
    atlas = null;
    screen.remove();
  };
}
