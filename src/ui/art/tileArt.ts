/**
 * One complete mahjong tile, drawn once into an atlas cell (see atlas.ts). The cell origin is the
 * top-left corner of the face; the jade edge and the soft shadow extend to the right and bottom:
 * cell = (1 + edge + shadow) w wide and (aspect + edge + shadow) w tall, in CSS px times dpr.
 */
import { TILE } from '../fit';

/** Family name of the bundled display face (styles.css @font-face). */
export const DISPLAY_FONT = 'Lora';

const JADE_NEAR = [0x3f, 0x7f, 0x6a] as const; // #3F7F6A, where the edge meets the face
const JADE_FAR = [0x2e, 0x5e, 0x4f] as const; // #2E5E4F, the far edge
const IVORY_TOP = '#FFFDF6';
const IVORY_BOTTOM = '#F1E6CF';
const PLUM = '#3A1F2B';
const CREAM = '#FFF8EE';

const mix = (a: readonly number[], b: readonly number[], t: number): string =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

/** CSS size of one atlas cell for face width w. */
export function cellSize(w: number): { w: number; h: number } {
  return { w: w * (1 + TILE.edge + TILE.shadow), h: w * (TILE.aspect + TILE.edge + TILE.shadow) };
}

/**
 * Draws one tile with its face's top-left at the context's current origin (device px). All
 * geometry is in CSS px scaled by dpr; canvas shadows are in device px, so they scale by hand.
 */
export function drawTile(
  ctx: CanvasRenderingContext2D, face: HTMLImageElement, corner: string, w: number, dpr: number,
): void {
  const h = w * TILE.aspect;
  const e = w * TILE.edge;
  const r = w * 0.12;
  const cell = cellSize(w);
  const px = 1 / dpr; // one device pixel in CSS px

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.beginPath();
  ctx.rect(0, 0, cell.w, cell.h);
  ctx.clip();

  // 1. The baked soft shadow, cast by the tile body onto the table, down and right.
  ctx.save();
  ctx.shadowColor = 'rgba(58, 31, 43, 0.5)';
  ctx.shadowBlur = w * 0.045 * dpr;
  ctx.shadowOffsetX = w * 0.018 * dpr;
  ctx.shadowOffsetY = w * 0.022 * dpr;
  ctx.fillStyle = mix(JADE_NEAR, JADE_FAR, 1);
  ctx.beginPath();
  ctx.roundRect(e, e, w, h, r);
  ctx.fill();
  ctx.restore();

  // 2. The jade edge: the body extruded 0.12w right and down, one device pixel per step, darkening
  //    from #3F7F6A at the face to #2E5E4F at the far edge.
  const steps = Math.max(1, Math.ceil(e * dpr));
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    ctx.fillStyle = mix(JADE_NEAR, JADE_FAR, t);
    ctx.beginPath();
    ctx.roundRect(e * t, e * t, w, h, r);
    ctx.fill();
  }
  // A crisp dark rim on the far edge and a thin ivory seam where the face sits on the jade.
  ctx.lineWidth = px;
  ctx.strokeStyle = 'rgba(20, 52, 42, 0.55)';
  ctx.beginPath();
  ctx.roundRect(e + px / 2, e + px / 2, w - px, h - px, r);
  ctx.stroke();
  ctx.fillStyle = '#E4D6B6';
  ctx.beginPath();
  ctx.roundRect(e * 0.22, e * 0.22, w, h, r);
  ctx.fill();

  // 3. The ivory face: opaque rounded rect, vertical gradient, a rounded bevel and a 1 px highlight.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, IVORY_TOP);
  g.addColorStop(1, IVORY_BOTTOM);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
  ctx.fill();

  // Bevel: a soft warm shade along the bottom-right inside the rim, light along the top-left.
  const bevel = w * 0.05;
  const shade = ctx.createLinearGradient(0, 0, w, h);
  shade.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  shade.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  shade.addColorStop(0.6, 'rgba(176, 142, 92, 0)');
  shade.addColorStop(1, 'rgba(176, 142, 92, 0.38)');
  ctx.strokeStyle = shade;
  ctx.lineWidth = bevel;
  ctx.beginPath();
  ctx.roundRect(bevel / 2, bevel / 2, w - bevel, h - bevel, Math.max(0, r - bevel / 2));
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, w - 1, h - 1, r - 0.5);
  ctx.stroke();
  ctx.lineWidth = px;
  ctx.strokeStyle = 'rgba(150, 118, 70, 0.55)';
  ctx.beginPath();
  ctx.roundRect(px / 2, px / 2, w - px, h - px, r);
  ctx.stroke();

  // 4. The face art, centred at 78% of the face, keeping its own aspect.
  const boxW = w * 0.78;
  const boxH = h * 0.78;
  const ia = (face.naturalWidth || 3) / (face.naturalHeight || 4);
  const artW = Math.min(boxW, boxH * ia);
  const artH = artW / ia;
  ctx.drawImage(face, (w - artW) / 2, (h - artH) / 2, artW, artH);

  // 5. The corner numeral / wind letter, top-left, with a cream halo so it reads over the art.
  if (corner !== '') {
    const size = w * 0.34;
    ctx.font = `700 ${size}px ${DISPLAY_FONT}, Georgia, serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4; // 2 px of halo outside the glyph
    ctx.strokeStyle = CREAM;
    const x = w * 0.09;
    const y = w * 0.06;
    ctx.strokeText(corner, x, y);
    ctx.fillStyle = PLUM;
    ctx.fillText(corner, x, y);
  }

  ctx.restore();
}

/**
 * The white dragon's frame. The vendor Haku art is empty, and a blank face reads as a missing tile,
 * so the atlas adds the classic blue double frame on top of drawTile for that face.
 */
export function drawBlankFrame(ctx: CanvasRenderingContext2D, w: number, dpr: number): void {
  const h = w * TILE.aspect;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = '#2B4C9B';
  ctx.lineWidth = w * 0.06;
  ctx.beginPath();
  ctx.roundRect(w * 0.2, w * 0.22, w * 0.6, h - w * 0.44, w * 0.06);
  ctx.stroke();
  ctx.lineWidth = w * 0.022;
  ctx.beginPath();
  ctx.roundRect(w * 0.29, w * 0.31, w * 0.42, h - w * 0.62, w * 0.03);
  ctx.stroke();
  ctx.restore();
}
