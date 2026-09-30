/**
 * The baked tile atlas: every face a level uses, drawn once as a complete tile into one sprite
 * canvas and exported as a blob URL. Tiles show their cell through background-position, so the
 * board paints plain bitmaps instead of live SVG, shadows or filters.
 *
 * Atlases are cached by faces, tile width and DPR. The map pre-bakes the level its candle opens in
 * short idle-time steps, so the tap finds the atlas ready; a level that asks for an atlas still in
 * that pre-bake takes it over and finishes it at once.
 */
import { faceCorner, faceFile, type FaceId } from '../core/tiles';
import { cellSize, drawBlankFrame, drawTile, DISPLAY_FONT } from './art/tileArt';

export interface Atlas {
  url: string;
  /** The decoded bitmap behind `url`, held so a cached atlas stays loaded and paints on the next frame. */
  image: HTMLImageElement;
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
export function cellOrigin(a: Pick<Atlas, 'cols' | 'cellW' | 'cellH'>, cell: number): { x: number; y: number } {
  return {
    x: ATLAS_GUTTER + (cell % a.cols) * (a.cellW + ATLAS_GUTTER),
    y: ATLAS_GUTTER + Math.floor(cell / a.cols) * (a.cellH + ATLAS_GUTTER),
  };
}

/** Full bitmap size, device px. */
export function atlasSize(a: Pick<Atlas, 'cols' | 'cellW' | 'cellH' | 'index'>): { w: number; h: number } {
  const rows = Math.ceil(a.index.size / a.cols);
  return { w: ATLAS_GUTTER + a.cols * (a.cellW + ATLAS_GUTTER), h: ATLAS_GUTTER + rows * (a.cellH + ATLAS_GUTTER) };
}

/** How a bake paces itself. */
export interface BakeJob {
  /** Resolves when the next short step may run: at once for a waiting level, else in idle time. Rejects when a pre-bake is dropped. */
  step(): Promise<void>;
  /** A level waits for this atlas: no more idle pacing. */
  readonly urgent: boolean;
  /** A pre-bake nobody took over was cancelled: stop at the next check, keep nothing. */
  readonly dropped: boolean;
}

const DROPPED = 'atlas pre-bake dropped';

/**
 * Bakes `faces` at face width `w` (CSS px) and `dpr`. Resolves once the atlas image itself is
 * decoded, so tiles that use the URL paint on the next frame.
 */
async function bake(faces: readonly FaceId[], w: number, dpr: number, job: BakeJob): Promise<Atlas> {
  // Pre-baking: one face request per idle step (each SVG then parses in its own short task).
  for (const f of faces) {
    if (job.urgent) break;
    await job.step();
    void faceImage(f).catch(() => {}); // the Promise.all below reports a failure
  }
  const [images] = await Promise.all([
    Promise.all(faces.map(faceImage)),
    document.fonts.load(`700 ${Math.round(w * 0.34)}px ${DISPLAY_FONT}`),
  ]);
  const size = cellSize(w);
  const index = new Map<FaceId, number>();
  faces.forEach((f, i) => index.set(f, i));
  const layout = {
    cellW: Math.ceil(size.w * dpr),
    cellH: Math.ceil(size.h * dpr),
    cols: Math.ceil(Math.sqrt(faces.length)),
    dpr,
    index,
  };
  const px = atlasSize(layout);
  const canvas = document.createElement('canvas');
  let blob: Blob;
  try {
    canvas.width = px.w;
    canvas.height = px.h;
    // A CPU-backed canvas: a one-pixel read rasterises the cell just drawn, so a pre-bake spreads the
    // raster work over its idle steps instead of paying for all of it at once in toBlob.
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    for (let i = 0; i < faces.length; i++) {
      await job.step();
      const f = faces[i];
      const o = cellOrigin(layout, i);
      ctx.setTransform(1, 0, 0, 1, o.x, o.y);
      drawTile(ctx, images[i], faceCorner(f), w, dpr);
      if (f === HAKU) drawBlankFrame(ctx, w, dpr);
      if (!job.urgent) ctx.getImageData(o.x, o.y, 1, 1);
    }
    await job.step();
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('atlas toBlob failed'))), 'image/png'),
    );
    if (job.dropped) throw new DOMException(DROPPED, 'AbortError'); // cancelled during the export: skip the decode
  } finally {
    canvas.width = canvas.height = 0; // drop the backing store now, not at GC
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return { ...layout, url, image: img };
}

export interface AtlasCacheDeps {
  bake(faces: readonly FaceId[], w: number, dpr: number, job: BakeJob): Promise<Atlas>;
  revoke(a: Atlas): void;
  /** Runs `cb` once the page is idle; returns a cancel function. */
  idle(cb: () => void): () => void;
}

export interface AtlasCache {
  /** The atlas for these faces at w and dpr: cached, taken over from a pre-bake, or baked now. Pair with `release`. */
  acquire(faces: readonly FaceId[], w: number, dpr: number): Promise<Atlas>;
  /** The screen no longer shows `a`; it stays cached as the spare until evicted. */
  release(a: Atlas): void;
  /**
   * Bakes in idle time at the size `size()` reports when idle begins. The returned cancel drops a
   * bake still running, unless a level has acquired it meanwhile (even in the same task).
   */
  prebake(faces: readonly FaceId[], size: () => { w: number; dpr: number }): () => void;
}

/**
 * The atlas cache. Atlases in use are never evicted; of the unused ones, only the `spare` most
 * recently used stay (their blob URLs revoked on eviction).
 */
export function createAtlasCache(deps: AtlasCacheDeps, spare = 1): AtlasCache {
  interface Entry {
    key: string;
    promise: Promise<Atlas>;
    atlas: Atlas | null;
    users: number;
    used: number;
    urgent: boolean;
    dropped: boolean;
    /** Ends a pending idle wait early. */
    wake: (() => void) | null;
  }
  const entries = new Map<string, Entry>();
  let clock = 0;

  const keyOf = (faces: readonly FaceId[], w: number, dpr: number): string => `${w}@${dpr}:${faces.join(',')}`;

  const evict = (): void => {
    const unused = [...entries.values()].filter((e) => e.atlas !== null && e.users === 0).sort((a, b) => b.used - a.used);
    for (const e of unused.slice(spare)) {
      entries.delete(e.key);
      deps.revoke(e.atlas!);
    }
  };

  const start = (key: string, faces: readonly FaceId[], w: number, dpr: number, urgent: boolean): Entry => {
    const e: Entry = { key, promise: Promise.resolve(null!), atlas: null, users: 0, used: ++clock, urgent, dropped: false, wake: null };
    const job: BakeJob = {
      get urgent() {
        return e.urgent;
      },
      get dropped() {
        return e.dropped && !e.urgent;
      },
      step() {
        // A level acquires by setting `urgent`, so a dropped bake it took over (even in the same task as the cancel) runs on.
        if (e.urgent) return Promise.resolve();
        if (e.dropped) return Promise.reject(new DOMException(DROPPED, 'AbortError'));
        const { promise, resolve, reject } = Promise.withResolvers<void>();
        const done = (): void => {
          e.wake = null;
          if (e.urgent || !e.dropped) resolve();
          else reject(new DOMException(DROPPED, 'AbortError'));
        };
        const cancelIdle = deps.idle(done);
        e.wake = () => {
          cancelIdle();
          queueMicrotask(done);
        };
        return promise;
      },
    };
    entries.set(key, e);
    e.promise = deps
      .bake(faces, w, dpr, job)
      .then((a) => {
        if (job.dropped) {
          // Cancelled after its last step (during the export or decode): never cached, so no spare is evicted for it.
          deps.revoke(a);
          throw new DOMException(DROPPED, 'AbortError');
        }
        e.atlas = a;
        e.used = ++clock;
        if (e.users === 0) evict();
        return a;
      })
      .catch((err: unknown) => {
        if (entries.get(key) === e) entries.delete(key);
        throw err;
      });
    return e;
  };

  return {
    acquire(faces, w, dpr) {
      const key = keyOf(faces, w, dpr);
      const e = entries.get(key) ?? start(key, faces, w, dpr, true);
      e.users++;
      e.used = ++clock;
      if (!e.urgent) {
        e.urgent = true;
        e.wake?.();
      }
      return e.promise;
    },
    release(a) {
      for (const e of entries.values()) {
        if (e.atlas !== a) continue;
        e.users = Math.max(0, e.users - 1);
        e.used = ++clock;
        if (e.users === 0) evict();
        return;
      }
      deps.revoke(a);
    },
    prebake(faces, size) {
      let e: Entry | null = null;
      const cancelIdle = deps.idle(() => {
        const { w, dpr } = size();
        const key = keyOf(faces, w, dpr);
        const hit = entries.get(key);
        if (hit) {
          hit.used = ++clock;
          return;
        }
        e = start(key, faces, w, dpr, false);
        e.promise.catch(() => {}); // dropped or failed: the level bakes on its own when it opens
      });
      return () => {
        cancelIdle();
        if (e === null || e.atlas !== null) return;
        e.dropped = true;
        e.wake?.();
      };
    },
  };
}

/** Idle steps shorter than this wait for a longer idle period (a pre-bake step takes up to ~10 ms). */
const MIN_IDLE_MS = 10;

/**
 * Runs `cb` in an idle period with at least MIN_IDLE_MS to spare. While the page is hidden it holds,
 * listening for `visibilitychange` only until visible again, then waits for idle anew. Returns a cancel.
 */
export function whenIdle(cb: () => void): () => void {
  let idleId = 0;
  let timer = 0;
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') return;
    document.removeEventListener('visibilitychange', onVisibility);
    request();
  };
  const tick = (d?: IdleDeadline): void => {
    idleId = timer = 0;
    if (document.visibilityState === 'hidden') document.addEventListener('visibilitychange', onVisibility);
    else if (d !== undefined && d.timeRemaining() < MIN_IDLE_MS) request();
    else cb();
  };
  const request = (): void => {
    if (typeof requestIdleCallback === 'function') idleId = requestIdleCallback(tick);
    else timer = window.setTimeout(tick, 50);
  };
  request();
  return () => {
    if (idleId !== 0) cancelIdleCallback(idleId);
    if (timer !== 0) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

const cache = createAtlasCache({ bake, revoke: (a) => URL.revokeObjectURL(a.url), idle: whenIdle });

/** The atlas for `faces` at face width `w` (CSS px) and `dpr`, decoded and ready to paint. Pair with `releaseAtlas`. */
export function bakeAtlas(faces: readonly FaceId[], w: number, dpr: number): Promise<Atlas> {
  return cache.acquire(faces, w, dpr);
}

export function releaseAtlas(a: Atlas): void {
  cache.release(a);
}

/** Pre-bakes in idle time (see AtlasCache.prebake); returns the cancel function. */
export function prebakeAtlas(faces: readonly FaceId[], size: () => { w: number; dpr: number }): () => void {
  return cache.prebake(faces, size);
}
