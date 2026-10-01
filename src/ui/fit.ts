import type { Slot } from '../core/layout';

/**
 * Tile geometry in multiples of the face width w (aspect = h / w). The layer shift and the side edge
 * are thick enough to tell the layers apart (feedback §1): a layout that does not fit is reshaped.
 */
export const TILE = { aspect: 1.25, layerShift: 0.14, edge: 0.22, shadow: 0.06 } as const;

/** How far each depth's tile body is mixed toward plum #3A1F2B; depth 0 is the layout's top layer. */
export const SHADES: readonly number[] = [0, 0.1, 0.18, 0.25, 0.3];

const HUD = 72;
const MARGIN = 8;

/** across/down in tiles over all slots; maxLayer is the highest layer index. */
export interface Extent { across: number; down: number; maxLayer: number }

export function extentOf(slots: readonly Slot[]): Extent {
  let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity, maxLayer = 0;
  for (const s of slots) {
    if (s.col < minCol) minCol = s.col;
    if (s.col > maxCol) maxCol = s.col;
    if (s.row < minRow) minRow = s.row;
    if (s.row > maxRow) maxRow = s.row;
    if (s.layer > maxLayer) maxLayer = s.layer;
  }
  return { across: (maxCol - minCol) / 2 + 1, down: (maxRow - minRow) / 2 + 1, maxLayer };
}

/** A slot's depth below the layout's highest layer (fixed per slot, whatever is left on the board). */
export function depthOf(s: Slot, e: Extent): number {
  return e.maxLayer - s.layer;
}

/** How many depths a layout uses: its layer count, upper layers included. */
export function depthCount(slots: readonly Slot[]): number {
  return extentOf(slots).maxLayer + 1;
}

/** Largest whole-pixel face width w that fits the extent (with layer shift, edge and shadow) into the area. */
export function fitTileWidth(areaW: number, areaH: number, e: Extent): number {
  const extra = e.maxLayer * TILE.layerShift + TILE.edge + TILE.shadow;
  return Math.floor(Math.min(areaW / (e.across + extra), areaH / (e.down * TILE.aspect + extra)));
}

/** Viewport minus safe-area insets, the HUD column and a margin on every side. */
export function boardArea(vw: number, vh: number, safe = { t: 0, r: 0, b: 0, l: 0 }): { w: number; h: number } {
  return {
    w: vw - safe.l - safe.r - HUD - 2 * MARGIN,
    h: vh - safe.t - safe.b - 2 * MARGIN,
  };
}

/** Top-left of the slot's face in px relative to the board origin; higher layers shift up-left. */
export function slotPx(s: Slot, w: number, e: Extent, originCol: number, originRow: number): { x: number; y: number } {
  const shift = (e.maxLayer - s.layer) * TILE.layerShift * w;
  return {
    x: ((s.col - originCol) / 2) * w + shift,
    y: ((s.row - originRow) / 2) * TILE.aspect * w + shift,
  };
}
