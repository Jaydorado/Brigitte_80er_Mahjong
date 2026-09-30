/**
 * The level frame: the viewport minus the safe-area insets, the 72 px HUD column and the margins,
 * and the tile width that fits the layout into it. The insets come from the screen element's
 * `padding: env(safe-area-inset-*)` (styles.css), read once per resize.
 */
import type { Layout } from '../core/layout';
import { boardArea, extentOf, fitTileWidth } from './fit';

export interface Insets { t: number; r: number; b: number; l: number }

export interface Frame {
  safe: Insets;
  /** Board area, CSS px; x/y are relative to the screen element's border box. */
  area: { x: number; y: number; w: number; h: number };
  /** Face width, whole CSS px. */
  w: number;
}

/** Width of the HUD column (fit.ts subtracts the same 72 px). */
export const HUD_W = 72;

export function readInsets(screen: HTMLElement): Insets {
  const cs = getComputedStyle(screen);
  return {
    t: parseFloat(cs.paddingTop) || 0,
    r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0,
    l: parseFloat(cs.paddingLeft) || 0,
  };
}

export function measureFrame(screen: HTMLElement, layout: Layout): Frame {
  const vw = screen.clientWidth;
  const vh = screen.clientHeight;
  const safe = readInsets(screen);
  const { w: aw, h: ah } = boardArea(vw, vh, safe);
  // boardArea leaves an equal margin on every side; recover it rather than repeat the constant.
  const mx = (vw - safe.l - safe.r - HUD_W - aw) / 2;
  const my = (vh - safe.t - safe.b - ah) / 2;
  return {
    safe,
    area: { x: safe.l + mx, y: safe.t + my, w: aw, h: ah },
    w: Math.max(1, fitTileWidth(aw, ah, extentOf(layout.slots))),
  };
}
