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
import { cellSize, drawBlankFrame, drawTileBody, drawTileFace, DISPLAY_FONT } from './art/tileArt';

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
  /**
   * Resolves when the next short step may run: at once for a waiting level, else in an idle period
   * with at least `needMs` to spare. Rejects when a pre-bake is dropped.
   */
  step(needMs?: number): Promise<void>;
  /** A level waits for this atlas: no more idle pacing. */
  readonly urgent: boolean;
}

/** Idle time a step asks for beyond its slowest recent duration. */
export const STEP_MARGIN_MS = 1;
/** How many of the latest step durations the estimate keeps: enough to span the dearer face SVGs. */
export const RECENT_STEPS = 8;
/**
 * How long the estimate keeps a step duration. One slow step (a GC pause, say) can ask for more than
 * any idle period the page offers, so no newer step could run to displace it: it is forgotten by
 * age instead. The step waiting behind it runs once starved (STARVED_MS) and then finds it gone.
 */
export const RECENT_MS = 250;

/**
 * The idle time the next step of one kind needs: the slowest of the recent steps plus a margin.
 * `seedMs` stands in for a measured step until RECENT_STEPS real ones have displaced it, and again
 * once every measured one is older than RECENT_MS.
 */
export function createStepEstimate(seedMs: number): { readonly need: number; record(ms: number): void } {
  const recent = [{ ms: seedMs, at: Infinity }]; // the seed never ages
  return {
    get need() {
      const now = performance.now();
      let slowest = -1;
      for (const s of recent) if (now - s.at < RECENT_MS) slowest = Math.max(slowest, s.ms);
      return (slowest < 0 ? seedMs : slowest) + STEP_MARGIN_MS;
    },
    record(ms) {
      recent.push({ ms, at: performance.now() });
      if (recent.length > RECENT_STEPS) recent.shift();
    },
  };
}

/**
 * Pass steps before any is measured. At 4× CPU throttle a body pass takes 3–4 ms and a face pass
 * 1.5–5 ms, depending on the face's SVG. The atlas's first passes run cold: headed, the first body
 * pass measured 3.7–6.5 ms and the first face pass 5.0–8.4 ms over 65 level-6 pre-bakes.
 */
const BODY_SEED_MS = 6;
const FACE_SEED_MS = 8;

/**
 * Allocating a bitmap's backing store costs in proportion to its pixels: level 6 at DPR 3 (1124×1358,
 * 1.53 Mpx) measured 3.2–4.1 ms at 4× CPU throttle headed (2.1–2.7 ms per million px), 2.9–3.3 headless.
 */
export const SETUP_SEED_MS_PER_MPX = 3;
/** The latest pre-bake's measured allocation cost, ms per million px. */
let setupMsPerMpx = SETUP_SEED_MS_PER_MPX;

/**
 * Sizes `canvas` to w×h device px and returns its context with the backing store allocated, in two
 * steps. First the context, on a 1-px bitmap: a page's first canvas draw can wait on a synchronous
 * call that opens the renderer's GPU channel, measured 0.2–4.5 ms at 4× CPU throttle, and it must not
 * land in the allocation's budget. Then the bitmap, budgeted for its pixels at the slower of the seed
 * and the latest measured rate.
 */
export async function setUpBitmap(canvas: HTMLCanvasElement, w: number, h: number, job: BakeJob): Promise<CanvasRenderingContext2D> {
  await job.step();
  canvas.width = canvas.height = 1;
  // A CPU-backed canvas: a one-pixel read rasterises what was just drawn, so a pre-bake spreads the
  // raster work over its idle steps instead of paying for all of it at once in toBlob.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (!job.urgent) ctx.clearRect(0, 0, 1, 1);
  const mpx = (w * h) / 1e6;
  await job.step(Math.max(SETUP_SEED_MS_PER_MPX, setupMsPerMpx) * mpx + STEP_MARGIN_MS);
  const start = performance.now();
  // Resizing resets the bitmap and the context state. The first draw call allocates the backing store
  // (a read does not), so a no-op clear does it here.
  canvas.width = w;
  canvas.height = h;
  if (!job.urgent) {
    ctx.clearRect(0, 0, 1, 1);
    setupMsPerMpx = (performance.now() - start) / mpx;
  }
  return ctx;
}

const DROPPED = 'atlas pre-bake dropped';

/** A drawn atlas: its layout and exported PNG, not yet decoded. */
interface DrawnAtlas {
  layout: Omit<Atlas, 'url' | 'image'>;
  blob: Blob;
}

/** Draws `faces` at face width `w` (CSS px) and `dpr` into one bitmap and exports it as a PNG. */
async function draw(faces: readonly FaceId[], w: number, dpr: number, job: BakeJob): Promise<DrawnAtlas> {
  await document.fonts.load(`700 ${Math.round(w * 0.34)}px ${DISPLAY_FONT}`);
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
  try {
    // Setting up the bitmap (megabytes at DPR 3) takes steps of its own, apart from the first cell.
    const ctx = await setUpBitmap(canvas, px.w, px.h, job);
    // Pre-baking, each cell is two steps, its body pass and then its face pass, and each waits for an
    // idle period long enough for the slowest recent step of its kind.
    const bodySteps = createStepEstimate(BODY_SEED_MS);
    const faceSteps = createStepEstimate(FACE_SEED_MS);
    // Pre-baking, a cell's body step requests the next face but one and its face step the one after,
    // so faces stay about two cells ahead while every SVG still parses in its own short task. A level
    // waiting for the atlas requests all remaining faces at once.
    let requested = 0;
    const request = (n: number): void => {
      for (; requested < Math.min(n, faces.length); requested++) void faceImage(faces[requested]).catch(() => {});
    };
    /** One pass over cell `i`: runs `paint` at the cell's origin, flushes it and times it (pre-baking). */
    const pass = async (i: number, estimate: typeof bodySteps, lead: number, paint: () => void): Promise<void> => {
      await job.step(estimate.need);
      const start = performance.now();
      request(job.urgent ? faces.length : i + lead);
      const o = cellOrigin(layout, i);
      ctx.setTransform(1, 0, 0, 1, o.x, o.y);
      paint();
      if (!job.urgent) {
        ctx.getImageData(o.x, o.y, 1, 1);
        estimate.record(performance.now() - start);
      }
    };
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      request(job.urgent ? faces.length : i + 1);
      await pass(i, bodySteps, 2, () => drawTileBody(ctx, w, dpr));
      const image = await faceImage(f);
      await pass(i, faceSteps, 3, () => {
        drawTileFace(ctx, image, faceCorner(f), w, dpr);
        if (f === HAKU) drawBlankFrame(ctx, w, dpr);
      });
    }
    await job.step(Math.max(bodySteps.need, faceSteps.need));
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('atlas toBlob failed'))), 'image/png'),
    );
    return { layout, blob };
  } finally {
    canvas.width = canvas.height = 0; // drop the backing store now, not at GC
  }
}

/** Decodes a drawn atlas behind a blob URL, so tiles that use the URL paint on the next frame. */
async function load({ layout, blob }: DrawnAtlas): Promise<Atlas> {
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

/** `D` is a drawn, not yet decoded atlas. */
export interface AtlasCacheDeps<D> {
  draw(faces: readonly FaceId[], w: number, dpr: number, job: BakeJob): Promise<D>;
  load(drawn: D): Promise<Atlas>;
  revoke(a: Atlas): void;
  /** Runs `cb` once the page is idle with at least `needMs` to spare (a default when omitted); returns a cancel function. */
  idle(cb: () => void, needMs?: number): () => void;
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
export function createAtlasCache<D>(deps: AtlasCacheDeps<D>, spare = 1): AtlasCache {
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
      step(needMs) {
        // A level acquires by setting `urgent`, so a dropped bake it took over (even in the same task as the cancel) runs on.
        if (e.urgent) return Promise.resolve();
        if (e.dropped) return Promise.reject(new DOMException(DROPPED, 'AbortError'));
        const { promise, resolve, reject } = Promise.withResolvers<void>();
        const done = (): void => {
          e.wake = null;
          if (e.urgent || !e.dropped) resolve();
          else reject(new DOMException(DROPPED, 'AbortError'));
        };
        const cancelIdle = deps.idle(done, needMs);
        e.wake = () => {
          cancelIdle();
          queueMicrotask(done);
        };
        return promise;
      },
    };
    entries.set(key, e);
    e.promise = deps
      .draw(faces, w, dpr, job)
      .then(async (drawn) => {
        // Exported: one more step before the blob URL and decode, so a hidden page holds here too and a
        // pre-bake dropped during the export stops without decoding.
        await job.step();
        return deps.load(drawn);
      })
      .then((a) => {
        if (e.dropped && !e.urgent) {
          // Cancelled during the decode: never cached, so no spare is evicted for it.
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

/** The idle time a step asks for unless it says otherwise: starting a pre-bake, opening its context, decoding its export. */
const MIN_IDLE_MS = 6;

/**
 * How long a step waits for an idle period with the time it asks for before it settles for the longest
 * period offered meanwhile. A step that asks for more than this page ever offers (an estimate or budget
 * above a fast display's idle periods) would otherwise stall the pre-bake for good. Long enough that a
 * short run of busy frames, whose idle periods are all short, does not lower the bar.
 */
export const STARVED_MS = 250;

/** The latest idle period handed out; its timeRemaining() is 0 once it is over. */
let period: IdleDeadline | null = null;

/**
 * Runs `cb` in an idle period with at least `needMs` to spare: the current one if it still has that
 * much left, else the next one that does, or once refused for STARVED_MS, the next one as long as the
 * longest refused. While the page is hidden it holds, listening for `visibilitychange` only until
 * visible again, then waits for idle anew. Returns a cancel.
 */
export function whenIdle(cb: () => void, needMs = MIN_IDLE_MS): () => void {
  let idleId = 0;
  let timer = 0;
  let cancelled = false;
  // Starvation is measured from when the wait began or the page became visible again.
  let since = performance.now();
  let longest = -1; // the longest idle period refused, ms; none yet
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') return;
    document.removeEventListener('visibilitychange', onVisibility);
    since = performance.now();
    longest = -1;
    request();
  };
  const admits = (d: IdleDeadline): boolean => {
    const left = d.timeRemaining();
    const starved = longest >= 0 && performance.now() - since >= STARVED_MS;
    if (left >= (starved ? Math.min(needMs, longest) : needMs)) return true;
    longest = Math.max(longest, left);
    return false;
  };
  const tick = (d?: IdleDeadline): void => {
    idleId = timer = 0;
    if (d !== undefined) period = d;
    if (document.visibilityState === 'hidden') document.addEventListener('visibilitychange', onVisibility);
    else if (d !== undefined && !admits(d)) request();
    else cb();
  };
  const request = (): void => {
    if (typeof requestIdleCallback === 'function') idleId = requestIdleCallback(tick);
    else timer = window.setTimeout(tick, 50);
  };
  if (period !== null && document.visibilityState !== 'hidden' && period.timeRemaining() >= needMs) {
    queueMicrotask(() => {
      if (!cancelled) cb();
    });
  } else request();
  return () => {
    cancelled = true;
    if (idleId !== 0) cancelIdleCallback(idleId);
    if (timer !== 0) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

const cache = createAtlasCache({ draw, load, revoke: (a) => URL.revokeObjectURL(a.url), idle: whenIdle });

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
