/**
 * The baked tile atlas: every face a level uses, drawn once as a complete tile into one sprite
 * canvas and exported as a blob URL. Tiles show their cell through background-position, so the
 * board paints plain bitmaps instead of live SVG, shadows or filters.
 */
import { faceCorner, faceFile, type FaceId } from '../core/tiles';
import { cellSize, drawBlankFrame, drawTile, DISPLAY_FONT } from './art/tileArt';

export interface Atlas {
  url: string;
  /** Cell size in device px (the atlas bitmap's own pixels), without the gutter. */
  cellW: number;
  cellH: number;
  cols: number;
  dpr: number;
  /** Face → cell number, row-major. */
  index: Map<FaceId, number>;
}

/** Transparent gap around every cell, device px, so neighbouring cells never bleed into a tile. */
export const ATLAS_GUTTER = 2;

const faceUrls = import.meta.glob('../vendor/tiles/*.svg', {
  query: '?url', import: 'default', eager: true,
}) as Record<string, string>;

/** The white dragon (Haku), whose vendor art is blank. */
const HAKU: FaceId = 33;

/** Decoded face images, kept for the whole session. */
const faceImages = new Map<FaceId, Promise<HTMLImageElement>>();

function faceImage(f: FaceId): Promise<HTMLImageElement> {
  let p = faceImages.get(f);
  if (p === undefined) {
    const img = new Image();
    img.src = faceUrls[`../vendor/tiles/${faceFile(f)}.svg`];
    p = img.decode().then(() => img);
    p.catch(() => faceImages.delete(f)); // a failed decode may be retried by the next bake
    faceImages.set(f, p);
  }
  return p;
}

/** The device-pixel ratio atlases are baked at. */
export function atlasDpr(): number {
  return Math.min(window.devicePixelRatio || 1, 3);
}

/** Bitmap position of a cell's top-left, device px. */
export function cellOrigin(a: Atlas, cell: number): { x: number; y: number } {
  return {
    x: ATLAS_GUTTER + (cell % a.cols) * (a.cellW + ATLAS_GUTTER),
    y: ATLAS_GUTTER + Math.floor(cell / a.cols) * (a.cellH + ATLAS_GUTTER),
  };
}

/** Full bitmap size, device px. */
export function atlasSize(a: Atlas): { w: number; h: number } {
  const rows = Math.ceil(a.index.size / a.cols);
  return { w: ATLAS_GUTTER + a.cols * (a.cellW + ATLAS_GUTTER), h: ATLAS_GUTTER + rows * (a.cellH + ATLAS_GUTTER) };
}

/**
 * Bakes `faces` at face width `w` (CSS px) and `dpr`. Resolves once the atlas image itself is
 * decoded, so tiles that use the URL paint on the next frame.
 */
export async function bakeAtlas(faces: readonly FaceId[], w: number, dpr: number): Promise<Atlas> {
  const [images] = await Promise.all([
    Promise.all(faces.map(faceImage)),
    document.fonts.load(`700 ${Math.round(w * 0.34)}px ${DISPLAY_FONT}`),
  ]);
  const size = cellSize(w);
  const index = new Map<FaceId, number>();
  faces.forEach((f, i) => index.set(f, i));
  const layout: Atlas = {
    url: '',
    cellW: Math.ceil(size.w * dpr),
    cellH: Math.ceil(size.h * dpr),
    cols: Math.ceil(Math.sqrt(faces.length)),
    dpr,
    index,
  };
  const px = atlasSize(layout);
  const canvas = document.createElement('canvas');
  canvas.width = px.w;
  canvas.height = px.h;
  const ctx = canvas.getContext('2d')!;
  faces.forEach((f, i) => {
    const o = cellOrigin(layout, i);
    ctx.setTransform(1, 0, 0, 1, o.x, o.y);
    drawTile(ctx, images[i], faceCorner(f), w, dpr);
    if (f === HAKU) drawBlankFrame(ctx, w, dpr);
  });
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('atlas toBlob failed'))), 'image/png'),
  );
  canvas.width = canvas.height = 0; // drop the backing store now, not at GC
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return { ...layout, url };
}

export function releaseAtlas(a: Atlas): void {
  URL.revokeObjectURL(a.url);
}
