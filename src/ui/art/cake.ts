/**
 * Baked SVG art for the screens: the three-tier birthday cake (drawn once), a small all-lit
 * variant for the closing screen, and the decorations the welcome and letter screens share
 * (bunting, balloons, the "80" rosette, the app icon).
 *
 * Everything is static markup. The only motion is CSS on `transform`/`opacity` in `screens.css`,
 * keyed on the state classes set here; it runs on the map and closing screen only.
 */

const NS = 'http://www.w3.org/2000/svg';

const T = {
  cakeLabel: 'Geburtstagstorte mit acht Kerzen',
};

const f = (n: number): string => String(Math.round(n * 10) / 10);

/** Deterministic pseudo-random numbers, so the sprinkles fall the same way on every load. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let buildCount = 0;

function svgRoot(viewBox: string, markup: string, cls?: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('focusable', 'false');
  if (cls !== undefined) svg.setAttribute('class', cls);
  svg.innerHTML = markup;
  return svg;
}

type Stop = readonly [number, string, number?];

function stops(list: readonly Stop[]): string {
  return list
    .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`)
    .join('');
}

/** Horizontal (or vertical) linear gradient over the element's own box. */
function grad(id: string, list: readonly Stop[], vertical = false): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">${stops(list)}</linearGradient>`;
}

/** Horizontal gradient over fixed user-space x, so two shapes share one seamless colour run. */
function gradUser(id: string, x1: number, x2: number, list: readonly Stop[]): string {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(x1)}" y1="0" x2="${f(x2)}" y2="0">${stops(list)}</linearGradient>`;
}

function radial(id: string, list: readonly Stop[], cx = 0.5, cy = 0.5, r = 0.5): string {
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(list)}</radialGradient>`;
}

// ───────────────────────────── the cake ─────────────────────────────

/** A cylinder tier seen slightly from above: top face is an ellipse, body hangs `h` below. */
interface Tier {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly h: number;
}

const CX = 300;
// The top tier carries eight 52 px candle targets (gap 54, wax out to x = ±189 from the centre), so
// its radius is 210; the lower tiers step out from it and still sit inside the 600-wide viewBox.
const TOP: Tier = { cx: CX, cy: 134, rx: 210, ry: 26, h: 62 };
const MID: Tier = { cx: CX, cy: 196, rx: 245, ry: 28, h: 52 };
const BOT: Tier = { cx: CX, cy: 248, rx: 280, ry: 30, h: 50 };

/** y of the front rim of a tier's top face at x. */
function rimY(t: Tier, x: number): number {
  const u = (x - t.cx) / t.rx;
  return t.cy + t.ry * Math.sqrt(Math.max(0, 1 - u * u));
}

/** y of the front bottom edge of a tier at x. */
function baseY(t: Tier, x: number): number {
  return rimY(t, x) + t.h;
}

interface Drip {
  readonly dx: number;
  readonly len: number;
  readonly hw: number;
}

function smoothMax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** Depth of the icing edge below the rim at x: a band `band` deep plus rounded, filleted drips. */
function icingDepth(t: Tier, x: number, band: number, drips: readonly Drip[]): number {
  let depth = 0;
  for (const d of drips) {
    const u = Math.abs(x - (t.cx + d.dx));
    const cap =
      u <= d.hw ? d.len - d.hw + Math.sqrt(d.hw * d.hw - u * u) : d.len - d.hw - (u - d.hw) * 5;
    depth = smoothMax(depth, cap, 9);
  }
  return band + depth;
}

/** The icing: front rim of the top face down to a dripping lower edge. */
function icingPath(t: Tier, band: number, drips: readonly Drip[]): string {
  let d = `M${f(t.cx - t.rx)} ${f(t.cy)}A${t.rx} ${t.ry} 0 0 0 ${f(t.cx + t.rx)} ${f(t.cy)}`;
  for (let x = t.cx + t.rx; x >= t.cx - t.rx - 0.01; x -= 2) {
    d += `L${f(x)} ${f(rimY(t, x) + icingDepth(t, x, band, drips))}`;
  }
  return `${d}Z`;
}

function bodyPath(t: Tier): string {
  const x0 = t.cx - t.rx;
  const x1 = t.cx + t.rx;
  return `M${x0} ${t.cy}V${t.cy + t.h}A${t.rx} ${t.ry} 0 0 0 ${x1} ${t.cy + t.h}V${t.cy}Z`;
}

function pearls(t: Tier, gap: number, id: string): string {
  const n = Math.floor((2 * t.rx - 24) / gap);
  const start = t.cx - (n * gap) / 2;
  let out = '<g>';
  for (let k = 0; k <= n; k++) {
    const x = start + k * gap;
    out += `<circle cx="${f(x)}" cy="${f(baseY(t, x) - 3.2)}" r="3.7" fill="url(#${id})"/>`;
  }
  return `${out}</g>`;
}

interface SprinkleSpec {
  readonly t: Tier;
  readonly upper: Tier | null;
  readonly count: number;
  readonly colors: readonly string[];
  readonly seed: number;
  readonly avoidX?: readonly number[];
}

/** Sprinkles on the visible part of a tier's top face. */
function sprinkles(s: SprinkleSpec): string {
  const rnd = lcg(s.seed);
  const byColor = new Map<string, string>();
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < s.count; tries++) {
    const x = s.t.cx + (rnd() * 2 - 1) * s.t.rx * 0.92;
    const y = s.t.cy + (rnd() * 2 - 1) * s.t.ry * 0.86;
    const a = rnd() * 180;
    const color = s.colors[Math.floor(rnd() * s.colors.length)]!;
    const ux = (x - s.t.cx) / (s.t.rx * 0.93);
    const uy = (y - s.t.cy) / (s.t.ry * 0.9);
    if (ux * ux + uy * uy > 1) continue;
    if (s.upper !== null && Math.abs(x - s.upper.cx) < s.upper.rx + 6 && y < baseY(s.upper, x) + 5) continue;
    if (s.avoidX?.some((ax) => Math.abs(x - ax) < 13)) continue;
    placed++;
    byColor.set(
      color,
      `${byColor.get(color) ?? ''}<rect x="-3.6" y="-1.3" width="7.2" height="2.6" rx="1.3" transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})"/>`,
    );
  }
  let out = '';
  for (const [color, rects] of byColor) out += `<g fill="${color}">${rects}</g>`;
  return out;
}

const DIGIT_OUTLINE = '#a97b2c';

/** The gold "80", built from strokes so it needs no font. Centred at `cx`, top at `top`. */
function eighty(cx: number, top: number, gold: string): string {
  const shapes = (attrs: string): string =>
    `<circle cx="${cx - 24}" cy="${top + 16}" r="10" ${attrs}/>` +
    `<circle cx="${cx - 24}" cy="${top + 38}" r="12" ${attrs}/>` +
    `<ellipse cx="${cx + 24}" cy="${top + 28}" rx="13" ry="20" ${attrs}/>`;
  return (
    `<g fill="none" stroke-linejoin="round">` +
    shapes(`stroke="${DIGIT_OUTLINE}" stroke-width="13.5"`) +
    shapes(`stroke="url(#${gold})" stroke-width="9.5"`) +
    shapes(`stroke="#fff6cf" stroke-opacity=".75" stroke-width="2.2" transform="translate(-2.4 -2.4)"`) +
    `</g>`
  );
}

function sparkleStar(x: number, y: number, s: number, delay: number, gold: string): string {
  return (
    `<g transform="translate(${x} ${y}) scale(${s})"><g class="cake-sparkle" style="--d:${delay}s">` +
    `<path d="M0-11Q1.6-1.6 11 0Q1.6 1.6 0 11Q-1.6 1.6-11 0Q-1.6-1.6 0-11Z" fill="url(#${gold})"/>` +
    `</g></g>`
  );
}

function heart(scale: number, fill: string): string {
  return `<path transform="scale(${scale})" d="M0 6C-9 0-5-6 0-2C5-6 9 0 0 6Z" fill="${fill}"/>`;
}

export type CandleState = 'locked' | 'current' | 'won';

export interface CakeCandle {
  /** Carries the state class (`is-locked` / `is-current` / `is-won`) and the level number. */
  readonly slot: SVGGElement;
  /** The wax body with its stripes. */
  readonly wax: SVGGElement;
  /** The flame group; visible and flickering while the candle is won. */
  readonly flame: SVGGElement;
  /** Tap target for the level: the candle and the number badge below it. */
  readonly hit: SVGGElement;
  /** The envelope slot below the candle; shown while the candle is won. */
  readonly envelope: SVGGElement;
  /** Tap target for the envelope. */
  readonly envelopeHit: SVGRectElement;
}

export interface CakeArt {
  readonly svg: SVGSVGElement;
  /** The eight candles, level 1 first. */
  readonly candles: readonly CakeCandle[];
  /** The gold "80" topper; `is-active` once all eight are won. */
  readonly topper: SVGGElement;
  /** Tap target for the topper. */
  readonly topperHit: SVGRectElement;
}

const CANDLE_COUNT = 8;
/** Centre-to-centre distance; the 52-wide hit rectangles then never overlap (2 px apart). */
const CANDLE_GAP = 54;

/** Centre x of candle `i` (0-based), in viewBox units. */
function candleX(i: number): number {
  return CX + (i - (CANDLE_COUNT - 1) / 2) * CANDLE_GAP;
}

function candleMarkup(p: string, i: number): string {
  const x = candleX(i);
  const dx = Math.abs(x - CX);
  // The base sits on the front half of the top face, following the ellipse so even the outermost wax
  // body (7.5 px half-width, plus the shadow) stays on the tier.
  const y = TOP.cy + 0.55 * TOP.ry * Math.sqrt(1 - ((dx + 12) / TOP.rx) ** 2);
  const ey = rimY(TOP, x) + 31 - y; // centre of the envelope / number badge, slot-local
  const stripe = i % 2 === 0 ? '#e89aa8' : '#d9b26f';
  let stripes = '';
  for (let k = 0; k < 4; k++) {
    const sy = -46 + k * 15;
    stripes += `<path d="M-9 ${sy}L9 ${sy + 8}V${sy + 14}L-9 ${sy + 6}Z"/>`;
  }
  return (
    `<g class="cake-slot is-locked" data-level="${i + 1}" style="--i:${i}" transform="translate(${f(x)} ${f(y)})">` +
    `<ellipse cx="0" cy="1.5" rx="11.5" ry="3.6" fill="#3a1f2b" opacity=".26"/>` +
    `<g class="cake-body">` +
    `<circle class="cake-halo" cx="0" cy="-62" r="34" fill="url(#${p}halo)"/>` +
    `<g class="cake-wax">` +
    `<rect x="-7.5" y="-40" width="15" height="40" rx="3" fill="url(#${p}wax)" stroke="#a5476a" stroke-opacity=".6" stroke-width="1"/>` +
    `<g clip-path="url(#${p}candleClip)" fill="${stripe}" opacity=".85">${stripes}</g>` +
    `<rect x="-4.8" y="-38" width="2.4" height="35" rx="1.1" fill="#fff" opacity=".55"/>` +
    `<rect class="cake-dim" x="-7.5" y="-40" width="15" height="40" rx="3" fill="#7d6b71"/>` +
    `<ellipse cx="0" cy="-40" rx="6.5" ry="2.3" fill="#fff8ee" stroke="#a5476a" stroke-opacity=".4" stroke-width=".8"/>` +
    `</g>` +
    `<path d="M0-40V-46" stroke="#3a1f2b" stroke-width="1.7" stroke-linecap="round"/>` +
    `<g transform="translate(0 -45)"><g class="cake-flame">` +
    `<circle class="cake-glow" cx="0" cy="-14" r="21" fill="url(#${p}glow)"/>` +
    `<path d="M0 2C-9.5 1-10.5-9-3-19C-1.2-21.5 0-25 0-27.5C1.2-25 2.6-22.5 4.4-20C10.5-11 9.5 1 0 2Z" fill="url(#${p}flame)"/>` +
    `<path d="M0 1C-4.6-.4-5-7.5 0-14C5-7.5 4.6-.4 0 1Z" fill="url(#${p}flameIn)"/>` +
    `</g></g>` +
    `</g>` +
    `<g class="cake-hit" fill="#000" fill-opacity="0">` +
    `<rect x="-26" y="-78" width="52" height="88"/>` +
    `<rect x="-26" y="${f(ey - 24)}" width="52" height="48"/>` +
    `</g>` +
    `<g class="cake-num" aria-hidden="true" transform="translate(0 ${f(ey)})">` +
    `<circle r="12.5" fill="url(#${p}badge)" stroke="#d9b26f" stroke-width="1.6"/>` +
    `<text y="6" text-anchor="middle" font-size="17" font-weight="700" fill="#8e2f4f" style="font-family:var(--font-display,Georgia,serif)">${i + 1}</text>` +
    `</g>` +
    `<g class="cake-env" transform="translate(0 ${f(ey)})">` +
    `<g class="cake-env-icon" aria-hidden="true">` +
    `<rect x="-20" y="-14" width="40" height="28" rx="3.5" fill="url(#${p}paper)" stroke="#d9b26f" stroke-width="1.5"/>` +
    `<path d="M-20-14L0 3L20-14" fill="#f5e2c6" stroke="#d9b26f" stroke-width="1.3" stroke-linejoin="round"/>` +
    `<path d="M-20 14L-6 1.5M20 14L6 1.5" stroke="#d9b26f" stroke-width="1" fill="none"/>` +
    `<g transform="translate(0 3)">${heart(0.85, '#8e2f4f')}</g>` +
    `</g>` +
    `<rect class="cake-env-hit" x="-26" y="-24" width="52" height="48" fill="#000" fill-opacity="0"/>` +
    `</g>` +
    `</g>`
  );
}

function buildCakeArt(mini: boolean): CakeArt {
  const p = `ck${++buildCount}-`;
  const candleXs = Array.from({ length: CANDLE_COUNT }, (_, i) => candleX(i));

  const defs =
    `<defs>` +
    grad(`${p}gold`, [[0, '#fbeab0'], [0.45, '#e2bd73'], [1, '#b98d45']], true) +
    grad(`${p}goldH`, [[0, '#b98d45'], [0.3, '#f3dc9c'], [0.6, '#d9b26f'], [1, '#a9803a']]) +
    radial(`${p}pearl`, [[0, '#fffbe6'], [0.55, '#e6c47e'], [1, '#b98d45']], 0.35, 0.3, 0.75) +
    grad(`${p}bodyTop`, [[0, '#5c1a31'], [0.14, '#7a2643'], [0.32, '#b0466b'], [0.46, '#a33e62'], [0.7, '#8e2f4f'], [1, '#571830']]) +
    grad(`${p}bodyMid`, [[0, '#dcc19b'], [0.12, '#ecd8b8'], [0.32, '#fffdf6'], [0.5, '#fff8ee'], [0.78, '#f1dfc3'], [1, '#d3b78f']]) +
    grad(`${p}bodyBot`, [[0, '#c9707f'], [0.14, '#dd8c9b'], [0.34, '#f8b9c4'], [0.5, '#eea3b0'], [0.75, '#e08e9d'], [1, '#b95c6f']]) +
    gradUser(`${p}iceTop`, TOP.cx - TOP.rx, TOP.cx + TOP.rx, [[0, '#ecd9bf'], [0.3, '#fffaf1'], [0.5, '#fffdf8'], [0.75, '#fff6ea'], [1, '#e6d0b0']]) +
    gradUser(`${p}iceMid`, MID.cx - MID.rx, MID.cx + MID.rx, [[0, '#d98494'], [0.3, '#f7b7c2'], [0.5, '#fbc9d1'], [0.75, '#f2a9b6'], [1, '#d17c8d']]) +
    gradUser(`${p}iceBot`, BOT.cx - BOT.rx, BOT.cx + BOT.rx, [[0, '#ecd9bf'], [0.3, '#fffaf1'], [0.5, '#fffdf8'], [0.75, '#fff6ea'], [1, '#e6d0b0']]) +
    grad(`${p}shade`, [[0, '#3a1f2b', 0], [0.55, '#3a1f2b', 0.04], [1, '#3a1f2b', 0.2]], true) +
    grad(`${p}ribbon`, [[0, '#5c1a31'], [0.2, '#8e2f4f'], [0.42, '#c25a7b'], [0.6, '#9c3859'], [1, '#5c1a31']]) +
    grad(`${p}plate`, [[0, '#f2dfae'], [1, '#b98d45']], true) +
    radial(`${p}plateTop`, [[0, '#fffdf6'], [0.8, '#fff1d6'], [1, '#ecd39d']], 0.5, 0.45, 0.6) +
    grad(`${p}wax`, [[0, '#f0d9c2'], [0.35, '#fffdf6'], [1, '#e8cfb4']]) +
    grad(`${p}paper`, [[0, '#fffdf6'], [1, '#f3e1c4']], true) +
    radial(`${p}badge`, [[0, '#fffdf6'], [1, '#f4e3c6']], 0.4, 0.35, 0.8) +
    radial(`${p}halo`, [[0, '#ffe9a6', 0.85], [0.55, '#ffd96a', 0.35], [1, '#ffd96a', 0]]) +
    radial(`${p}glow`, [[0, '#fff2b0', 0.75], [1, '#ffc95c', 0]]) +
    grad(`${p}flame`, [[0, '#ffe08a'], [0.55, '#ffb340'], [1, '#f0782c']], true) +
    grad(`${p}flameIn`, [[0, '#ffffff'], [1, '#ffe9a3']], true) +
    `<clipPath id="${p}candleClip"><rect x="-7.5" y="-40" width="15" height="40" rx="3"/></clipPath>` +
    `<clipPath id="${p}clipMid"><path d="${bodyPath(MID)}"/></clipPath>` +
    `</defs>`;

  // The drip offsets were drawn for the earlier, narrower tiers; `k` carries them out to the new radii.
  const spread = (list: readonly (readonly number[])[], k: number, hw: number) =>
    list.map(([dx, len, w]) => ({ dx: dx! * k, len: len!, hw: w ?? hw }));
  const drips = {
    top: spread([[-190, 15], [-138, 16], [-69, 24], [0, 14], [69, 22], [138, 17], [190, 19]], 1, 5),
    mid: spread([[-205, 14, 5], [-170, 22, 6], [-128, 12, 5], [-88, 18, 5.5], [88, 20, 6], [130, 13, 5], [172, 22, 6], [208, 15, 5]], 245 / 225, 5),
    bot: spread(
      [
        [-255, 13], [-222, 20], [-188, 12], [-150, 20], [-112, 14], [-70, 19], [-25, 12],
        [22, 20], [68, 14], [108, 20], [147, 12], [186, 19], [222, 14], [254, 18],
      ],
      280 / 275,
      5.5,
    ),
  };

  const rimStroke = (t: Tier): string =>
    `<path d="M${f(t.cx - t.rx)} ${f(t.cy)}A${t.rx} ${t.ry} 0 0 0 ${f(t.cx + t.rx)} ${f(t.cy)}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.6"/>` +
    `<ellipse cx="${t.cx}" cy="${t.cy}" rx="${t.rx}" ry="${t.ry}" fill="none" stroke="#3a1f2b" stroke-opacity=".12" stroke-width="1"/>`;

  const tierShadow = (t: Tier): string =>
    `<ellipse cx="${t.cx}" cy="${t.cy + t.h}" rx="${t.rx + 12}" ry="${t.ry + 7}" fill="#3a1f2b" opacity=".2"/>`;

  // Plate and stand
  const plate =
    `<path d="M4 300v6A296 30 0 0 0 596 306v-6Z" fill="url(#${p}plate)"/>` +
    `<path d="M300 338c-40 0-60 3-60 12h120c0-9-20-12-60-12Z" fill="url(#${p}goldH)"/>` +
    `<ellipse cx="300" cy="352" rx="98" ry="7" fill="#a9803a"/>` +
    `<ellipse cx="300" cy="350" rx="98" ry="7" fill="url(#${p}gold)"/>` +
    `<ellipse cx="300" cy="300" rx="296" ry="30" fill="url(#${p}plateTop)" stroke="#d9b26f" stroke-width="2"/>` +
    `<ellipse cx="300" cy="300" rx="284" ry="25" fill="none" stroke="#d9b26f" stroke-opacity=".55" stroke-width="1"/>`;

  // Bottom tier: rose body, cream icing, swags
  let swags = '';
  for (let k = 0; k < 10; k++) {
    const x0 = CX - 255 + k * 51;
    const x1 = x0 + 51;
    const off = 30;
    const y0 = rimY(BOT, x0) + off;
    const y1 = rimY(BOT, x1) + off;
    const ym = rimY(BOT, (x0 + x1) / 2) + off + 12;
    const c = 2 * ym - (y0 + y1) / 2;
    const d = `M${x0} ${f(y0)}Q${(x0 + x1) / 2} ${f(c)} ${x1} ${f(y1)}`;
    swags += `<path d="${d}" fill="none" stroke="#c9707f" stroke-width="6.4" stroke-linecap="round" opacity=".55"/>`;
    swags += `<path d="${d}" fill="none" stroke="#fff8ee" stroke-width="4.6" stroke-linecap="round"/>`;
  }
  for (let k = 0; k <= 10; k++) {
    const x = CX - 255 + k * 51;
    swags += `<circle cx="${x}" cy="${f(rimY(BOT, x) + 30)}" r="4.4" fill="url(#${p}pearl)"/>`;
  }
  const bot =
    `<path d="${bodyPath(BOT)}" fill="url(#${p}bodyBot)"/>` +
    `<path d="${bodyPath(BOT)}" fill="url(#${p}shade)"/>` +
    swags +
    pearls(BOT, 13, `${p}pearl`) +
    `<ellipse cx="${BOT.cx}" cy="${BOT.cy}" rx="${BOT.rx}" ry="${BOT.ry}" fill="url(#${p}iceBot)"/>` +
    `<path d="${icingPath(BOT, 7, drips.bot)}" transform="translate(0 3)" fill="#3a1f2b" opacity=".2"/>` +
    `<path d="${icingPath(BOT, 7, drips.bot)}" fill="url(#${p}iceBot)"/>` +
    rimStroke(BOT) +
    sprinkles({ t: BOT, upper: MID, count: 74, seed: 7, colors: ['#d9b26f', '#e89aa8', '#8e2f4f', '#f3d58e', '#c96a86'] });

  // Middle tier: cream body, rose icing, berry ribbon with bow
  const ribbonTop: string[] = [];
  const ribbonBottom: string[] = [];
  for (let x = MID.cx - MID.rx; x <= MID.cx + MID.rx + 0.01; x += 3) {
    ribbonTop.push(`${f(x)} ${f(rimY(MID, x) + 28)}`);
    ribbonBottom.push(`${f(x)} ${f(rimY(MID, x) + 41)}`);
  }
  const ribbonD = `M${ribbonTop.join('L')}L${ribbonBottom.reverse().join('L')}Z`;
  const ribbonLine = (off: number): string => {
    const pts: string[] = [];
    for (let x = MID.cx - MID.rx; x <= MID.cx + MID.rx + 0.01; x += 3) pts.push(`${f(x)} ${f(rimY(MID, x) + off)}`);
    return `<path d="M${pts.join('L')}" fill="none" stroke="#e2bd73" stroke-width="1.1"/>`;
  };
  const by = rimY(MID, CX) + 34.5;
  const bow =
    `<g transform="translate(${CX} ${f(by)})">` +
    `<path d="M-1 3L-17 19L-9 17.5L-5 21.5L2 6Z" fill="#6e2039"/><path d="M1 3L17 19L9 17.5L5 21.5L-2 6Z" fill="#7d2544"/>` +
    `<path d="M0 0C-14-21-48-24-52-6C-54 9-22 13 0 0Z" fill="url(#${p}ribbon)" stroke="#5c1a31" stroke-opacity=".5" stroke-width="1"/>` +
    `<path d="M0 0C14-21 48-24 52-6C54 9 22 13 0 0Z" fill="url(#${p}ribbon)" stroke="#5c1a31" stroke-opacity=".5" stroke-width="1"/>` +
    `<path d="M-4 0C-14-9-30-11-37-5C-39 2-19 6-4 0Z" fill="#6e2039" opacity=".55"/>` +
    `<path d="M4 0C14-9 30-11 37-5C39 2 19 6 4 0Z" fill="#6e2039" opacity=".55"/>` +
    `<circle r="7" fill="url(#${p}pearl)" stroke="#a9803a" stroke-width="1"/>` +
    `</g>`;
  const mid =
    tierShadow(MID) +
    `<path d="${bodyPath(MID)}" fill="url(#${p}bodyMid)"/>` +
    `<path d="${bodyPath(MID)}" fill="url(#${p}shade)"/>` +
    `<path d="${ribbonD}" fill="url(#${p}ribbon)"/>` +
    ribbonLine(31) +
    ribbonLine(38) +
    pearls(MID, 12, `${p}pearl`) +
    bow +
    `<ellipse cx="${MID.cx}" cy="${MID.cy}" rx="${MID.rx}" ry="${MID.ry}" fill="url(#${p}iceMid)"/>` +
    `<path d="${icingPath(MID, 6, drips.mid)}" transform="translate(0 3)" fill="#3a1f2b" opacity=".2"/>` +
    `<path d="${icingPath(MID, 6, drips.mid)}" fill="url(#${p}iceMid)"/>` +
    rimStroke(MID) +
    sprinkles({ t: MID, upper: TOP, count: 54, seed: 21, colors: ['#d9b26f', '#fff8ee', '#8e2f4f', '#f3d58e', '#fff8ee'] });

  // Top tier: berry body, cream icing; candles and envelopes stand on / under it
  const top =
    tierShadow(TOP) +
    `<path d="${bodyPath(TOP)}" fill="url(#${p}bodyTop)"/>` +
    `<path d="${bodyPath(TOP)}" fill="url(#${p}shade)"/>` +
    pearls(TOP, 12, `${p}pearl`) +
    `<ellipse cx="${TOP.cx}" cy="${TOP.cy}" rx="${TOP.rx}" ry="${TOP.ry}" fill="url(#${p}iceTop)"/>` +
    `<path d="${icingPath(TOP, 7, drips.top)}" transform="translate(0 3)" fill="#3a1f2b" opacity=".2"/>` +
    `<path d="${icingPath(TOP, 7, drips.top)}" fill="url(#${p}iceTop)"/>` +
    rimStroke(TOP) +
    sprinkles({ t: TOP, upper: null, count: 20, seed: 5, colors: ['#d9b26f', '#e89aa8', '#8e2f4f', '#f3d58e'], avoidX: candleXs });

  const topper =
    `<g class="cake-topper">` +
    `<g>` +
    `<path d="M300 52V${TOP.cy - 4}" stroke="#a97b2c" stroke-width="4.4" stroke-linecap="round"/>` +
    `<path d="M300 52V${TOP.cy - 4}" stroke="url(#${p}goldH)" stroke-width="2.6" stroke-linecap="round"/>` +
    `<ellipse cx="300" cy="${TOP.cy - 2}" rx="5" ry="2" fill="#3a1f2b" opacity=".3"/>` +
        eighty(CX, 6, `${p}gold`) +
    sparkleStar(252, 10, 0.7, 0.2, `${p}gold`) +
    sparkleStar(350, 16, 0.8, 0.9, `${p}gold`) +
    sparkleStar(338, 66, 0.5, 0.5, `${p}gold`) +
    `</g>` +
    `<rect class="cake-topper-hit" x="246" y="0" width="108" height="66" fill="#000" fill-opacity="0"/>` +
    `</g>`;

  const sparkles =
    [
      [70, 110, 1.1, 0], [32, 190, 0.8, 0.7], [530, 120, 1, 1.3], [568, 204, 1.2, 0.4],
      [118, 56, 0.8, 1.7], [490, 64, 0.9, 2.1], [34, 272, 0.7, 1.1], [566, 282, 0.8, 1.9],
    ]
      .map(([x, y, s, d]) => sparkleStar(x!, y!, s!, d!, `${p}gold`))
      .join('');

  const candles = Array.from({ length: CANDLE_COUNT }, (_, i) => candleMarkup(p, i)).join('');

  const markup = defs + `<g class="cake-sparkles">${sparkles}</g>` + plate + bot + mid + top + topper + candles;
  const svg = svgRoot('0 0 600 360', markup, mini ? 'cake cake--mini' : 'cake');
  // The map cake holds real controls, so it is a labelled group; the closing cake is a picture.
  svg.setAttribute('role', mini ? 'img' : 'group');
  svg.setAttribute('aria-label', T.cakeLabel);

  const q = <E extends Element>(root: ParentNode, sel: string): E => root.querySelector<E>(sel)!;
  const candleHandles = Array.from(svg.querySelectorAll<SVGGElement>('.cake-slot')).map(
    (slot): CakeCandle => ({
      slot,
      wax: q<SVGGElement>(slot, '.cake-wax'),
      flame: q<SVGGElement>(slot, '.cake-flame'),
      hit: q<SVGGElement>(slot, '.cake-hit'),
      envelope: q<SVGGElement>(slot, '.cake-env'),
      envelopeHit: q<SVGRectElement>(slot, '.cake-env-hit'),
    }),
  );
  const topperEl = q<SVGGElement>(svg, '.cake-topper');
  const art: CakeArt = { svg, candles: candleHandles, topper: topperEl, topperHit: q<SVGRectElement>(topperEl, '.cake-topper-hit') };
  if (mini) {
    for (const c of candleHandles) setCandleState(c, 'won');
    setTopperActive(art, true);
  }
  return art;
}

/** The map cake: all candles locked, topper inactive. The map applies the save state. */
export function buildCake(): CakeArt {
  return buildCakeArt(false);
}

/** The closing screen's small cake: all eight candles lit, no taps. */
export function buildMiniCake(): CakeArt {
  return buildCakeArt(true);
}

export function setCandleState(c: CakeCandle, state: CandleState): void {
  c.slot.classList.remove('is-locked', 'is-current', 'is-won', 'is-lighting');
  c.slot.classList.add(`is-${state}`);
}

/** Lights a candle with the flame pop; the flicker takes over when the pop ends. */
export function lightCandle(c: CakeCandle): void {
  setCandleState(c, 'won');
  c.slot.classList.add('is-lighting');
  c.flame.addEventListener('animationend', () => c.slot.classList.remove('is-lighting'), { once: true });
}

export function setTopperActive(art: CakeArt, active: boolean): void {
  art.topper.classList.toggle('is-active', active);
}

/**
 * Pauses every CSS loop under `el` (class `is-paused`) while the page is hidden.
 * Returns the function that removes the listener.
 */
export function pauseOnHidden(el: Element): () => void {
  const sync = (): void => {
    el.classList.toggle('is-paused', document.visibilityState === 'hidden');
  };
  document.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    document.removeEventListener('visibilitychange', sync);
  };
}

// ───────────────────── shared decorations ─────────────────────

const FLAG_COLORS = ['#e89aa8', '#d9b26f', '#8e2f4f', '#fff8ee', '#f4b6c1', '#c98a3e'];

/** A garland of triangular flags. Stretches to the width of its box, height follows. */
export function buildBunting(): SVGSVGElement {
  const p0 = { x: -10, y: 4 };
  const p1 = { x: 320, y: 42 };
  const p2 = { x: 650, y: 4 };
  let flags = '';
  const n = 17;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const x = (1 - t) ** 2 * p0.x + 2 * t * (1 - t) * p1.x + t * t * p2.x;
    const y = (1 - t) ** 2 * p0.y + 2 * t * (1 - t) * p1.y + t * t * p2.y;
    const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;
    const c = FLAG_COLORS[k % FLAG_COLORS.length]!;
    const outline = c === '#fff8ee' ? ' stroke="#d9b26f" stroke-width="1.4"' : '';
    flags +=
      `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})">` +
      `<path d="M-13 0H13L0 28Z" fill="${c}"${outline}/>` +
      `<path d="M-13 0H0L0 28Z" fill="#fff" opacity=".16"/>` +
      `<circle cx="0" cy="7" r="2" fill="#fff8ee" opacity=".7"/>` +
      `</g>`;
  }
  const svg = svgRoot(
    '0 0 640 56',
    `<path d="M${p0.x} ${p0.y}Q${p1.x} ${p1.y} ${p2.x} ${p2.y}" fill="none" stroke="#8e2f4f" stroke-opacity=".75" stroke-width="2"/>${flags}`,
    'bunting',
  );
  svg.setAttribute('preserveAspectRatio', 'xMidYMin slice');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

/** Three balloons on tangled strings. */
export function buildBalloons(): SVGSVGElement {
  const p = `bl${++buildCount}-`;
  const balloon = (id: string, cx: number, cy: number, rx: number, ry: number, light: string, mid: string, dark: string): string =>
    radial(`${p}${id}`, [[0, light], [0.55, mid], [1, dark]], 0.35, 0.3, 0.8) +
    `<path d="M${cx} ${cy + ry - 1}L${cx - 5} ${cy + ry + 9}H${cx + 5}Z" fill="${dark}"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${p}${id})"/>` +
    `<ellipse cx="${cx - rx * 0.4}" cy="${cy - ry * 0.45}" rx="${rx * 0.2}" ry="${ry * 0.3}" fill="#fff" opacity=".45" transform="rotate(-25 ${cx - rx * 0.4} ${cy - ry * 0.45})"/>`;
  const strings =
    `<g fill="none" stroke="#8e2f4f" stroke-opacity=".6" stroke-width="1.4">` +
    `<path d="M38 96C40 130 52 150 60 196"/><path d="M84 88C80 130 70 160 60 196"/><path d="M62 132C64 160 60 180 60 196"/></g>`;
  const markup =
    strings +
    balloon('a', 38, 52, 30, 38, '#f8c1cb', '#e89aa8', '#c96a86') +
    balloon('b', 84, 46, 28, 36, '#fbe7b0', '#e2bd73', '#b98d45') +
    balloon('c', 62, 96, 27, 34, '#c25a7b', '#8e2f4f', '#5c1a31') +
    `<path d="M60 196l-9 8M60 196l9 8" stroke="#e89aa8" stroke-width="3" stroke-linecap="round"/>`;
  const svg = svgRoot('0 0 122 208', markup, 'balloons');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

/** A gold rosette with "80": the welcome and letter badge. */
export function buildRosette(): SVGSVGElement {
  const p = `ro${++buildCount}-`;
  let petals = '';
  for (let k = 0; k < 20; k++) {
    petals += `<ellipse cx="0" cy="-58" rx="11" ry="15" transform="rotate(${k * 18})" />`;
  }
  const markup =
    `<defs>` +
    grad(`${p}gold`, [[0, '#fbeab0'], [0.45, '#e2bd73'], [1, '#b98d45']], true) +
    radial(`${p}disc`, [[0, '#a83e62'], [1, '#6e2039']], 0.4, 0.3, 0.85) +
    grad(`${p}rib`, [[0, '#f4b6c1'], [1, '#c96a86']], true) +
    `</defs>` +
    `<g transform="translate(80 80)">` +
    `<path d="M-26 36L-44 104L-22 92L-12 114L6 44Z" fill="url(#${p}rib)" stroke="#a9557a" stroke-width="1.2"/>` +
    `<path d="M26 36L44 104L22 92L12 114L-6 44Z" fill="url(#${p}rib)" stroke="#a9557a" stroke-width="1.2"/>` +
    `<g fill="url(#${p}gold)" stroke="#a97b2c" stroke-width="1.2">${petals}</g>` +
    `<circle r="56" fill="url(#${p}gold)" stroke="#a97b2c" stroke-width="1.5"/>` +
    `<circle r="47" fill="url(#${p}disc)" stroke="#fbeab0" stroke-width="2.4"/>` +
    `<circle r="41" fill="none" stroke="#e2bd73" stroke-width="1" stroke-dasharray="1.5 4" stroke-linecap="round"/>` +
    `<g transform="translate(0 -1) scale(.86)">${eighty(0, -28, `${p}gold`)}</g>` +
    `</g>`;
  const svg = svgRoot('0 0 160 200', markup, 'rosette');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

/** The app icon (a cake with "80"), as it sits on the home screen. */
export function buildCakeIcon(): SVGSVGElement {
  const dots = (cx0: number, y: number, r: number, n: number, gap: number, fill: string): string => {
    let out = `<g fill="${fill}">`;
    for (let k = 0; k < n; k++) out += `<circle cx="${f(cx0 + k * gap)}" cy="${y}" r="${r}"/>`;
    return `${out}</g>`;
  };
  const markup =
    `<rect width="512" height="512" rx="96" fill="#8E2F4F"/>` +
    `<rect x="106" y="288" width="300" height="124" rx="10" fill="#FFF8EE"/><path d="M106 288h300v18H106z" fill="#E89AA8"/>` +
    dots(119.6, 306, 13, 11, 27.3, '#E89AA8') +
    `<g fill="none" stroke="#D9B26F" stroke-width="11"><circle cx="222" cy="346" r="17"/><circle cx="222" cy="379" r="20"/><ellipse cx="290" cy="362.5" rx="20" ry="33"/></g>` +
    `<rect x="134" y="208" width="244" height="80" rx="10" fill="#E89AA8"/><path d="M134 208h244v18H134z" fill="#FFF8EE"/>` +
    dots(146.2, 226, 12, 10, 24.4, '#FFF8EE') +
    `<rect x="168" y="130" width="176" height="78" rx="10" fill="#FFF8EE"/><path d="M168 130h176v16H168z" fill="#E89AA8"/>` +
    dots(179, 146, 11, 8, 22, '#E89AA8') +
    `<g fill="#E89AA8"><rect x="210" y="100" width="8" height="34" rx="4"/><rect x="252" y="100" width="8" height="34" rx="4"/><rect x="294" y="100" width="8" height="34" rx="4"/></g>` +
    `<g fill="#D9B26F"><path d="M214 85c-5 7-6 12 0 15 6-3 5-8 0-15z"/><path d="M256 85c-5 7-6 12 0 15 6-3 5-8 0-15z"/><path d="M298 85c-5 7-6 12 0 15 6-3 5-8 0-15z"/></g>`;
  const svg = svgRoot('0 0 512 512', markup, 'cake-icon');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}
