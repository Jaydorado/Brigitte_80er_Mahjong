import { layouts } from '../core/layouts';
import { levels } from '../levels/levels';
import { currentLevel } from '../progress/save';
import type { SaveV1 } from '../progress/save';
import { buildBalloons, buildCake, lightCandle, pauseOnHidden, setCandleState, setTopperActive } from './art/cake';
import type { CakeArt } from './art/cake';
import { atlasDpr, prebakeAtlas } from './atlas';
import { measureFrame } from './frame';
import { createFx } from './fx';
import './screens.css';

// Fixed interface labels (the family texts live in content.ts).
const T = {
  help: 'Hilfe und Willkommen',
  rotate: 'Bitte das Handy drehen',
};

const PHONE_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="22" height="36" rx="4" opacity=".45"/><path d="M36 8a20 20 0 0 1 18 18"/><path d="M56 18l-2 8-8-2"/><rect x="18" y="34" width="40" height="24" rx="4" fill="currentColor" fill-opacity=".18"/><path d="M52 42v8"/></svg>';

const HELP_ICON =
  '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M11.4 12.2c0-2.7 2-4.6 4.8-4.6 2.7 0 4.6 1.7 4.6 4.1 0 1.6-.8 2.6-2.2 3.6-1.3.9-2 1.6-2 3.1" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16.4" cy="24.6" r="2.1" fill="currentColor"/></svg>';

/** The lit candle's moment: pause before the pop, the pop, then the next candle starts pulsing. */
const LIT_DELAY_MS = 450;
const NEXT_PULSE_DELAY_MS = 1100;
const SPARKLE_BURSTS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [-26, -22, 120],
  [24, -30, 240],
  [-14, -52, 380],
  [18, -8, 520],
  [0, -40, 680],
];
const FIREWORK_MS = 1600;

export interface MapOpts {
  /** The router's current save: decides locked / current / won. */
  readonly save: SaveV1;
  /** After a win: the candle that plays the lighting moment. */
  readonly lit?: number;
  onLevel(id: number): void;
  onEnvelope(id: number): void;
  onTopper(): void;
  onHelp(): void;
}

/** Mounts the cake map; returns the unmount function. */
export function mountMap(root: HTMLElement, opts: MapOpts): () => void {
  const { save, lit } = opts;
  const screen = document.createElement('section');
  screen.className = 'screen map';

  const art: CakeArt = buildCake();
  const current = currentLevel(save);
  const won = (id: number): boolean => save.won.includes(id);

  // The candle that plays the lighting moment starts as the unlit one it just was; the candle that
  // this win unlocks waits (dim) until the flame has popped.
  const holdFor = lit !== undefined && won(lit) ? lit : undefined;
  art.candles.forEach((candle, i) => {
    const id = i + 1;
    let state: 'locked' | 'current' | 'won' = won(id) ? 'won' : id === current ? 'current' : 'locked';
    if (holdFor !== undefined) {
      if (id === holdFor) state = 'current';
      else if (id === holdFor + 1 && state === 'current') state = 'locked';
    }
    setCandleState(candle, state);
  });
  setTopperActive(art, save.won.length === art.candles.length && holdFor === undefined);

  const stage = document.createElement('div');
  stage.className = 'map-stage';
  const balloonsL = buildBalloons();
  balloonsL.classList.add('map-balloons', 'is-left');
  const balloonsR = buildBalloons();
  balloonsR.classList.add('map-balloons', 'is-right');
  stage.append(balloonsL, art.svg, balloonsR);

  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'map-help';
  help.setAttribute('aria-label', T.help);
  help.innerHTML = HELP_ICON;

  const overlay = document.createElement('div');
  overlay.className = 'rotate-overlay';
  overlay.innerHTML = PHONE_ICON;
  const overlayText = document.createElement('p');
  overlayText.textContent = T.rotate;
  overlay.append(overlayText);

  screen.append(stage, help, overlay);
  root.append(screen);
  const fx = createFx(screen);
  const offPause = pauseOnHidden(screen);

  // Taps: a candle opens its level only while it is the current one or already won.
  art.candles.forEach((candle, i) => {
    const id = i + 1;
    candle.hit.addEventListener('click', () => {
      if (!candle.slot.classList.contains('is-current') && !candle.slot.classList.contains('is-won')) return;
      performance.mark('level-tap');
      opts.onLevel(id);
    });
    candle.envelopeHit.addEventListener('click', () => {
      if (candle.slot.classList.contains('is-won')) opts.onEnvelope(id);
    });
  });
  art.topper.addEventListener('click', () => {
    if (art.topper.classList.contains('is-active')) opts.onTopper();
  });
  help.addEventListener('click', () => opts.onHelp());

  const timers: number[] = [];
  const later = (fn: () => void, ms: number): void => {
    timers.push(window.setTimeout(fn, ms));
  };

  // The level the pulsing candle opens is pre-baked in idle time (after any lighting moment), so its
  // tap finds the atlas ready. The map and the level screens share the full-viewport, safe-area frame.
  let gone = false;
  let stopPrebake: (() => void) | null = null;
  const prebake = (): void => {
    const level = levels.find((l) => l.id === current);
    if (gone || level === undefined) return;
    stopPrebake = prebakeAtlas(level.faces, () => ({ w: measureFrame(screen, layouts[level.layoutId]).w, dpr: atlasDpr() }));
  };

  if (holdFor !== undefined) {
    const candle = art.candles[holdFor - 1]!;
    later(() => {
      lightCandle(candle);
      // One read for the candle's place on screen; the sparkles then burst around the flame.
      const r = candle.flame.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      for (const [dx, dy, at] of SPARKLE_BURSTS) later(() => fx.sparkle(x + dx, y + dy), at);
      void fx.fireworks(FIREWORK_MS);
      void fx.idle().then(prebake);
      later(() => {
        const next = art.candles[holdFor];
        if (next !== undefined && holdFor + 1 === current) setCandleState(next, 'current');
        setTopperActive(art, save.won.length === art.candles.length);
      }, NEXT_PULSE_DELAY_MS);
    }, LIT_DELAY_MS);
  } else {
    prebake();
  }

  return () => {
    gone = true;
    stopPrebake?.();
    for (const t of timers) clearTimeout(t);
    offPause();
    fx.destroy();
    screen.remove();
  };
}
