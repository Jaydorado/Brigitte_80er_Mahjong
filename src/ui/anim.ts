/**
 * Board animations for each reducer event (spec §Art/Effects, §Interaction and lifecycle): the match
 * flight with its sparkle, the blocked wiggle, the undo reappearance and the shuffles. Only transform
 * and opacity animate (WAAPI), `will-change` is set only while an element animates, and positions
 * come from layout math, never from DOM reads.
 *
 * One board transition at a time: `play` first finishes whatever is still running, jumping it to its
 * end state, so a tap is never dropped or queued. Under reduced motion flights become fades and no
 * particles play.
 */
import type { Board } from '../core/deal';
import type { GameState } from '../core/game';
import type { Slot } from '../core/layout';
import type { BoardView } from './board';
import type { Fx } from './fx';

/** A matched pair flies to its midpoint this long (ease-out)... */
const MATCH_FLY_MS = 280;
/** ...then shrinks to MATCH_END_SCALE and fades this long. */
const MATCH_VANISH_MS = 120;
const MATCH_END_SCALE = 0.6;
const WIGGLE_MS = 240;
const WIGGLE_PX = 3;
const UNDO_MATCH_MS = 200;
const UNDO_MATCH_SCALE = 0.8;
/** In-place shuffle: every tile dips to SHUFFLE_SCALE and back; the faces swap at the midpoint. */
const SHUFFLE_MS = 300;
const SHUFFLE_SCALE = 0.85;
const RELOCATE_MS = 450;
/** Reduced motion: the fades that replace flights. */
const FADE_MS = 200;
/** Matched tiles fly over every resting tile (layer·1000 + …), under the rings (100000). */
const FLIGHT_Z = '90000';

export interface Flight {
  from: number;
  to: number;
}

/** Same order as core `shuffleBoard`'s relocation zip: layer, row, column, slot. */
function occupiedByPosition(slots: readonly Slot[], occupied: readonly boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < occupied.length; i++) if (occupied[i]) out.push(i);
  return out.sort((i, j) => slots[i].layer - slots[j].layer || slots[i].row - slots[j].row || slots[i].col - slots[j].col || i - j);
}

/**
 * Undoing a shuffle that goes from `shuffled` back to `restored`: the relocation flights reversed
 * (tile slot in `shuffled` → slot in `restored`, stationary tiles left out), or null when the shuffle
 * kept every tile in place.
 */
export function undoShuffleFlights(slots: readonly Slot[], shuffled: Board, restored: Board): Flight[] | null {
  if (shuffled.occupied.every((o, i) => o === restored.occupied[i])) return null;
  const from = occupiedByPosition(slots, restored.occupied); // the forward shuffle's `from` side
  const to = occupiedByPosition(slots, shuffled.occupied);
  const out: Flight[] = [];
  for (let k = 0; k < from.length; k++) if (from[k] !== to[k]) out.push({ from: to[k], to: from[k] });
  return out;
}

/** The transform a resting tile has at board-local (x, y); flights end on exactly this string. */
function at(p: { x: number; y: number }, scale = 1): string {
  return scale === 1 ? `translate(${p.x}px, ${p.y}px)` : `translate(${p.x}px, ${p.y}px) scale(${scale})`;
}

/** One board transition in flight: its animations, an optional midpoint action, and its end state. */
interface Run {
  anims: Animation[];
  mid: (() => void) | null;
  timer: number;
  end: () => void;
  settled: boolean;
}

export class BoardAnimator {
  private readonly runs = new Set<Run>();
  /** Each element's latest animation, so settling an older one never clears a newer one's state. */
  private readonly latest = new WeakMap<HTMLElement, Animation>();

  constructor(
    private readonly board: BoardView,
    private readonly fx: Fx,
    private readonly reducedMotion: boolean,
  ) {}

  get busy(): boolean {
    return this.runs.size > 0;
  }

  /** Renders `next` and animates `next.event`, after jumping any running transition to its end. */
  play(prev: GameState, next: GameState): void {
    this.finishAll();
    const e = next.event;
    switch (e.type) {
      case 'matched':
        this.match(next, e.a, e.b);
        return;
      case 'blocked':
        this.board.render(next);
        this.wiggle(e.slot);
        return;
      case 'undoMatch':
        this.board.render(next);
        this.appear([e.a, e.b]);
        return;
      case 'shuffled':
        if (e.moves === null) {
          this.inPlace(next);
        } else {
          this.board.render(next);
          this.relocate(e.moves.filter((m) => m.from !== m.to));
        }
        return;
      case 'undoShuffle': {
        const flights = undoShuffleFlights(next.layout.slots, prev.board, next.board);
        if (flights === null) {
          this.inPlace(next);
        } else {
          this.board.render(next);
          this.relocate(flights);
        }
        return;
      }
      default:
        this.board.render(next);
    }
  }

  /** Jumps every running transition to its end state (the DOM then matches the last rendered state). */
  finishAll(): void {
    for (const run of [...this.runs]) this.settle(run, true);
  }

  /** Stops everything without end-of-run side effects such as the sparkle (unmount). */
  cancelAll(): void {
    for (const run of [...this.runs]) this.settle(run, false);
  }

  private settle(run: Run, complete: boolean): void {
    if (run.settled) return;
    run.settled = true;
    this.runs.delete(run);
    if (run.timer !== 0) clearTimeout(run.timer);
    const mid = run.mid;
    run.mid = null;
    if (complete && mid) mid();
    run.end();
    for (const a of run.anims) a.cancel(); // drops the fill; the end state is plain DOM now
  }

  /**
   * Animates each element with its keyframes and registers the run. `will-change` lives exactly as
   * long as the element's latest animation; `end` restores the rest.
   */
  private start(
    els: HTMLElement[],
    frames: (el: HTMLElement, i: number) => Keyframe[],
    ms: number,
    easing: string,
    end: () => void,
    mid: [number, () => void] | null = null,
  ): void {
    if (els.length === 0) {
      mid?.[1]();
      end();
      return;
    }
    const anims = els.map((el, i) => {
      el.style.willChange = 'transform, opacity';
      const a = el.animate(frames(el, i), { duration: ms, easing, fill: 'forwards' });
      this.latest.set(el, a);
      return a;
    });
    const run: Run = {
      anims,
      mid: mid ? mid[1] : null,
      timer: 0,
      settled: false,
      end: () => {
        anims.forEach((a, i) => {
          const el = els[i];
          if (this.latest.get(el) !== a) return;
          this.latest.delete(el);
          el.style.willChange = '';
        });
        end();
      },
    };
    if (mid) {
      run.timer = window.setTimeout(() => {
        run.timer = 0;
        const f = run.mid;
        run.mid = null;
        f?.();
      }, mid[0]);
    }
    this.runs.add(run);
    let left = anims.length;
    const done = (): void => {
      if (--left === 0) this.settle(run, true);
    };
    for (const a of anims) a.finished.then(done, done);
  }

  private tiles(slots: readonly number[]): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const s of slots) {
      const t = this.board.tileEl(s);
      if (t) out.push(t);
    }
    return out;
  }

  /**
   * The pair flies to its midpoint, shrinks and fades; a sparkle marks the spot. Render hides the
   * pair at once (so taps and the rings already follow the new state); the flight shows them again
   * until it ends. The sparkle's viewport point is taken before render writes the DOM, so it never
   * forces a layout.
   */
  private match(next: GameState, a: number, b: number): void {
    const ca = this.reducedMotion ? null : this.board.center(a);
    const cb = this.reducedMotion ? null : this.board.center(b);
    this.board.render(next);
    const els = this.tiles([a, b]);
    if (els.length !== 2) return;
    const pa = this.board.pos(a);
    const pb = this.board.pos(b);
    const m = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const z = els.map((el) => el.style.zIndex);
    for (const el of els) {
      el.style.display = '';
      el.style.zIndex = FLIGHT_Z;
    }
    const end = (): void => {
      els.forEach((el, i) => {
        el.style.display = 'none';
        el.style.zIndex = z[i];
      });
    };
    if (ca === null || cb === null) {
      this.start(els, () => [{ opacity: 1 }, { opacity: 0 }], FADE_MS, 'ease-out', end);
      return;
    }
    const sparkle = (): void => this.fx.sparkle((ca.x + cb.x) / 2, (ca.y + cb.y) / 2);
    const fly = MATCH_FLY_MS / (MATCH_FLY_MS + MATCH_VANISH_MS);
    this.start(
      els,
      (_, i) => [
        { transform: at(i === 0 ? pa : pb), opacity: 1, easing: 'ease-out' },
        { transform: at(m), opacity: 1, offset: fly, easing: 'ease-in' },
        { transform: at(m, MATCH_END_SCALE), opacity: 0 },
      ],
      MATCH_FLY_MS + MATCH_VANISH_MS,
      'linear',
      end,
      [MATCH_FLY_MS, sparkle],
    );
  }

  /** A tap on a blocked tile: a small shake (a brief dim under reduced motion). */
  private wiggle(slot: number): void {
    const els = this.tiles([slot]);
    if (els.length === 0) return;
    if (this.reducedMotion) {
      this.start(els, () => [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], WIGGLE_MS, 'ease-in-out', () => {});
      return;
    }
    const p = this.board.pos(slot);
    const dx = (d: number) => at({ x: p.x + d, y: p.y });
    this.start(
      els,
      () => [
        { transform: at(p) },
        { transform: dx(WIGGLE_PX), offset: 0.2 },
        { transform: dx(-WIGGLE_PX), offset: 0.45 },
        { transform: dx(WIGGLE_PX), offset: 0.7 },
        { transform: dx(-WIGGLE_PX * 0.5), offset: 0.88 },
        { transform: at(p) },
      ],
      WIGGLE_MS,
      'ease-in-out',
      () => {},
    );
  }

  /** Undo of a match: the pair (already shown by render) fades in, growing from 0.8. */
  private appear(slots: number[]): void {
    const els = this.tiles(slots);
    if (this.reducedMotion) {
      this.start(els, () => [{ opacity: 0 }, { opacity: 1 }], UNDO_MATCH_MS, 'ease-out', () => {});
      return;
    }
    this.start(
      els,
      (_, i) => [
        { transform: at(this.board.pos(slots[i]), UNDO_MATCH_SCALE), opacity: 0 },
        { transform: at(this.board.pos(slots[i])), opacity: 1 },
      ],
      UNDO_MATCH_MS,
      'ease-out',
      () => {},
    );
  }

  /** In-place shuffle (or its undo): every tile dips and returns; the new faces appear at the dip. */
  private inPlace(next: GameState): void {
    const occupied = next.board.occupied;
    const slots: number[] = [];
    for (let i = 0; i < occupied.length; i++) if (occupied[i]) slots.push(i);
    const els = this.tiles(slots);
    const swap = (): void => this.board.render(next);
    if (this.reducedMotion) {
      this.start(els, () => [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], SHUFFLE_MS, 'ease-in-out', swap, [SHUFFLE_MS / 2, swap]);
      return;
    }
    this.start(
      els,
      (_, i) => {
        const p = this.board.pos(slots[i]);
        return [{ transform: at(p) }, { transform: at(p, SHUFFLE_SCALE) }, { transform: at(p) }];
      },
      SHUFFLE_MS,
      'ease-in-out',
      swap,
      [SHUFFLE_MS / 2, swap],
    );
  }

  /** Relocating shuffle (or its undo): each moved tile (already rendered at `to`) flies in from `from`. */
  private relocate(flights: readonly Flight[]): void {
    const els: HTMLElement[] = [];
    const legs: Flight[] = [];
    for (const f of flights) {
      const el = this.board.tileEl(f.to);
      if (!el) continue;
      els.push(el);
      legs.push(f);
    }
    if (this.reducedMotion) {
      this.start(els, () => [{ opacity: 0 }, { opacity: 1 }], FADE_MS, 'ease-out', () => {});
      return;
    }
    this.start(
      els,
      (_, i) => {
        const from = this.board.pos(legs[i].from);
        const to = this.board.pos(legs[i].to);
        return [
          { transform: at(from) },
          { transform: at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 1.06), offset: 0.5 },
          { transform: at(to) },
        ];
      },
      RELOCATE_MS,
      'ease-in-out',
      () => {},
    );
  }
}
