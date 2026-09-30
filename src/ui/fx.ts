/**
 * Effects canvas: the match sparkle, the win confetti and the closing fireworks, all drawn on one
 * full-screen canvas over the screen. Particles live in a fixed pool of MAX_PARTICLES objects (nothing
 * is allocated per frame), the backing store is at most DPR 2, and requestAnimationFrame runs only while
 * something is alive; when the last particle dies the canvas is hidden. A hidden page pauses the show
 * (the effect clock stops with it). Under `prefers-reduced-motion: reduce` nothing is drawn and the
 * effect promises resolve at once.
 *
 * `FxEngine` is the DOM-free part (pool, physics, emitters, effect clock); `createFx` adds the canvas,
 * the frame loop and the drawing.
 */

export interface Fx {
  sparkle(x: number, y: number): void;
  confetti(ms: number): Promise<void>;
  fireworks(ms: number): Promise<void>;
  destroy(): void;
}

export const MAX_PARTICLES = 300;
/** Backing-store pixel ratio cap. */
const DPR_MAX = 2;
/** A frame advances the effect clock by at most this much, so a stalled tab resumes where it paused. */
const MAX_STEP_MS = 50;
const TAU = Math.PI * 2;

// Particle kinds.
const DOT = 0;
const PAPER = 1;
const RIBBON = 2;
const HEART = 3;
const STAR5 = 4;
const STAR4 = 5;
const SPARK = 6;
const ROCKET = 7;
const FLASH = 8;

// Palette (global constraints): gold, rose, berry, cream.
const COLORS = ['#D9B26F', '#E89AA8', '#8E2F4F', '#FFF8EE'] as const;
const GOLD = 0;
const ROSE = 1;
const BERRY = 2;
const CREAM = 3;

// Firework burst patterns and how many sparks each needs (plus one centre flash).
const PEONY = 0;
const HEART_BURST = 1;
const WILLOW = 2;
const RING = 3;
const EIGHTY = 4;
const BURST_SIZE = [72, 64, 60, 56, 84] as const;
/** The show cycles through these; the "80" burst comes once, halfway through a long enough show. */
const CYCLE = [PEONY, HEART_BURST, RING, WILLOW] as const;

export class Particle {
  kind = DOT;
  color = GOLD;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** Gravity, px/s². */
  g = 0;
  /** Air drag: velocity decays by e^(-drag·s). */
  drag = 0;
  rot = 0;
  vrot = 0;
  /** Paper turning over: the drawn height is cos(flip). */
  flip = 0;
  vflip = 0;
  /** Sideways flutter, px/s at angular rate swayF (rad/s). */
  sway = 0;
  swayF = 0;
  phase = 0;
  size = 1;
  age = 0;
  life = 1;
  /** Twinkle rate (rad/s) for stars; for sparks, any value > 0 makes them crackle as they fade. */
  twinkle = 0;
  glow = false;
  /** Sparks and rockets draw a streak this many seconds of velocity long. */
  trail = 0;
  /** A rocket's burst pattern. */
  burst = 0;
}

interface Task {
  at: number;
  /** Runs at `at` (effect clock, ms); returns the next time to run, or -1 when finished. */
  run(at: number): number;
}

interface Wait {
  at: number;
  resolve(): void;
}

export class FxEngine {
  /** pool[0 .. live) are the live particles. */
  readonly pool: Particle[] = Array.from({ length: MAX_PARTICLES }, () => new Particle());
  live = 0;
  private t = 0;
  private w = 800;
  private h = 360;
  /** Size unit: 1 at a 400 px short side. */
  private u = 1;
  /** Sparks promised to rockets still climbing. */
  private reserved = 0;
  private readonly tasks: Task[] = [];
  private readonly waits: Wait[] = [];

  constructor(private readonly rand: () => number = Math.random) {}

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.u = Math.min(2, Math.max(0.75, Math.min(w, h) / 400));
  }

  /** Anything alive or scheduled: the frame loop keeps running while this holds. */
  get active(): boolean {
    return this.live > 0 || this.tasks.length > 0 || this.waits.length > 0;
  }

  /** A gold and cream burst at (x, y), viewport px: one flash, 11 twinkling stars, 12 glints. */
  sparkle(x: number, y: number): void {
    const { u, rand } = this;
    const flash = this.spawn(FLASH, GOLD, x, y, 0, 0, 13 * u, 300);
    if (flash) {
      flash.glow = true;
      flash.vrot = 1.5;
    }
    for (let i = 1; i < 24; i++) {
      const star = i <= 11;
      const a = (i / 23) * TAU + rand() * 0.45;
      const sp = (star ? 150 + rand() * 210 : 90 + rand() * 230) * u;
      const p = this.spawn(
        star ? STAR4 : DOT,
        star ? (i % 4 === 0 ? CREAM : GOLD) : GOLD,
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp - 40 * u,
        (star ? 5 + rand() * 3.5 : 1.6 + rand()) * u,
        star ? 560 + rand() * 300 : 420 + rand() * 320,
      );
      if (!p) return;
      p.drag = 4.5;
      p.g = 170 * u;
      if (star) {
        p.vrot = (rand() < 0.5 ? -1 : 1) * (3 + rand() * 5);
        p.twinkle = 20 + rand() * 12;
        p.glow = true;
      }
    }
  }

  /**
   * Party-popper confetti: a volley from both bottom corners, a smaller second volley near halfway,
   * and a rain of paper, ribbons, hearts and stars from the top for `ms`. Resolves after `ms`.
   */
  confetti(ms: number): Promise<void> {
    const done = new Promise<void>((resolve) => this.waits.push({ at: this.t + ms, resolve }));
    this.volley(50);
    if (ms >= 1000) this.schedule(this.t + ms * 0.45, () => (this.volley(30), -1));
    const end = this.t + ms;
    const every = ms / 120;
    this.schedule(this.t, (at) => {
      this.rainDrop();
      const next = at + every;
      return next >= end ? -1 : next;
    });
    return done;
  }

  /**
   * Rockets climb from the bottom and burst: peony, heart, ring and golden willow in turn, plus one
   * "80" written in sparks halfway through a show of 2.4 s or more. Launches stop 0.9 s before `ms`
   * so the last bursts bloom inside the show. Resolves after `ms`.
   */
  fireworks(ms: number): Promise<void> {
    const done = new Promise<void>((resolve) => this.waits.push({ at: this.t + ms, resolve }));
    const stop = this.t + Math.max(0, ms - 900);
    const eightyAt = ms >= 2400 ? this.t + ms * 0.5 : Infinity;
    let launched = 0;
    let eighty = false;
    this.schedule(this.t, (at) => {
      if (at > stop && launched > 0) return -1;
      const pattern = !eighty && at >= eightyAt ? EIGHTY : CYCLE[launched % CYCLE.length]!;
      if (this.live + this.reserved + BURST_SIZE[pattern] + 2 > MAX_PARTICLES) return this.t + 90;
      this.launch(pattern);
      launched++;
      if (pattern === EIGHTY) eighty = true;
      return this.t + 380 + this.rand() * 320;
    });
    return done;
  }

  /** Advances the effect clock by `dtMs` (capped at MAX_STEP_MS): runs due emitters, moves particles. */
  step(dtMs: number): void {
    const dt = Math.min(MAX_STEP_MS, Math.max(0, dtMs));
    this.t += dt;
    const { t } = this;
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i]!;
      while (task.at <= t) {
        const next = task.run(task.at);
        if (next < 0) {
          this.tasks.splice(i, 1);
          break;
        }
        task.at = next;
      }
    }
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i]!;
      if (w.at <= t) {
        this.waits.splice(i, 1);
        w.resolve();
      }
    }
    const s = dt / 1000;
    const floor = this.h + 40;
    const { pool } = this;
    for (let i = 0; i < this.live; ) {
      const p = pool[i]!;
      p.age += dt;
      if (p.kind === ROCKET && (p.vy >= -40 || p.age >= p.life)) {
        this.explode(p);
        this.kill(i);
        continue;
      }
      if (p.age >= p.life) {
        this.kill(i);
        continue;
      }
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * s);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.g * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      if (p.sway !== 0) p.x += Math.cos(p.phase + (p.age / 1000) * p.swayF) * p.sway * s;
      p.rot += p.vrot * s;
      p.flip += p.vflip * s;
      if (p.kind === ROCKET && dt > 0 && this.live + this.reserved < MAX_PARTICLES - 8) {
        // Glitter falling off the climbing rocket; never eats into the sparks reserved for bursts.
        const d = this.spawn(DOT, p.age % 32 < 16 ? GOLD : ROSE, p.x, p.y, (this.rand() - 0.5) * 40 * this.u, 20 * this.u, (1.1 + this.rand() * 0.8) * this.u, 380);
        if (d) {
          d.drag = 3;
          d.g = 90 * this.u;
        }
      }
      if (p.y > floor && p.vy > 0) {
        this.kill(i);
        continue;
      }
      i++;
    }
  }

  /** Drops every particle and emitter and resolves the pending effect promises. */
  destroy(): void {
    this.live = 0;
    this.reserved = 0;
    this.tasks.length = 0;
    const waits = this.waits.splice(0);
    for (const w of waits) w.resolve();
  }

  private schedule(at: number, run: (at: number) => number): void {
    this.tasks.push({ at, run });
  }

  /** A fresh particle from the pool, or null when all MAX_PARTICLES are alive. */
  private spawn(kind: number, color: number, x: number, y: number, vx: number, vy: number, size: number, life: number): Particle | null {
    if (this.live >= MAX_PARTICLES) return null;
    const p = this.pool[this.live++]!;
    p.kind = kind;
    p.color = color;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.size = size;
    p.life = life;
    p.age = 0;
    p.g = 0;
    p.drag = 0;
    p.rot = this.rand() * TAU;
    p.vrot = 0;
    p.flip = this.rand() * TAU;
    p.vflip = 0;
    p.sway = 0;
    p.swayF = 0;
    p.phase = this.rand() * TAU;
    p.twinkle = 0;
    p.glow = false;
    p.trail = 0;
    p.burst = 0;
    return p;
  }

  private kill(i: number): void {
    const last = --this.live;
    const p = this.pool[i]!;
    this.pool[i] = this.pool[last]!;
    this.pool[last] = p;
  }

  /** One piece of confetti: paper, ribbon, heart, star or dot, in gold, rose, berry or (rarely) cream. */
  private paper(x: number, y: number, vx: number, vy: number): void {
    const { u, rand } = this;
    const r = rand();
    const kind = r < 0.4 ? PAPER : r < 0.6 ? RIBBON : r < 0.73 ? HEART : r < 0.86 ? STAR5 : DOT;
    const c = rand();
    const color = c < 0.36 ? GOLD : c < 0.66 ? ROSE : c < 0.9 ? BERRY : CREAM;
    const size = (kind === DOT ? 3.2 + rand() * 1.2 : kind === RIBBON ? 5.4 + rand() * 2.4 : 6.6 + rand() * 3.6) * u;
    const p = this.spawn(kind, color, x, y, vx, vy, size, 4200 + rand() * 1800);
    if (!p) return;
    p.drag = 2.4;
    p.g = 380 * u;
    p.vrot = (rand() - 0.5) * 12;
    p.vflip = 4 + rand() * 9;
    p.sway = (30 + rand() * 45) * u;
    p.swayF = 2 + rand() * 3;
  }

  private volley(perSide: number): void {
    const { w, h, rand } = this;
    for (let i = 0; i < perSide * 2; i++) {
      const left = i % 2 === 0;
      const a = (-90 + (left ? 1 : -1) * (14 + rand() * 30)) * (Math.PI / 180);
      const sp = h * (1.7 + rand() * 1.6);
      this.paper(left ? -8 : w + 8, h + 8, Math.cos(a) * sp, Math.sin(a) * sp);
    }
  }

  private rainDrop(): void {
    const { u, rand } = this;
    this.paper(rand() * this.w, -14, (rand() - 0.5) * 60 * u, (40 + rand() * 110) * u);
  }

  private launch(pattern: number): void {
    const { w, h, u, rand } = this;
    const x = pattern === EIGHTY ? w * 0.5 : w * (0.18 + rand() * 0.64);
    const apex = pattern === EIGHTY ? h * 0.4 : h * (0.16 + rand() * 0.22);
    const g = h * 2.4;
    const vy = -Math.sqrt(2 * g * (h + 6 - apex));
    const vx = pattern === EIGHTY ? 0 : (w * 0.5 - x) * (0.05 + rand() * 0.15);
    const p = this.spawn(ROCKET, GOLD, x, h + 6, vx, vy, 3 * u, 3000);
    if (!p) return;
    p.g = g;
    p.trail = 0.08;
    p.glow = true;
    p.burst = pattern;
    this.reserved += BURST_SIZE[pattern as 0]! + 1;
  }

  private explode(rocket: Particle): void {
    const { u, h, rand } = this;
    const pattern = rocket.burst;
    this.reserved = Math.max(0, this.reserved - BURST_SIZE[pattern as 0]! - 1);
    const { x, y } = rocket;
    const flash = this.spawn(FLASH, GOLD, x, y, 0, 0, 24 * u, 300);
    if (flash) flash.glow = true;
    const main = [BERRY, ROSE, GOLD][Math.floor(rand() * 3)]!;
    // Gold reads weakly on the cream screens, so gold bursts carry berry accents and the others gold.
    const accent = main === GOLD ? BERRY : GOLD;
    const n = BURST_SIZE[pattern as 0]!;
    for (let i = 0; i < n; i++) {
      // (dx, dy): where the spark comes to rest, in units of R; with drag k the launch speed is R·k.
      let dx: number;
      let dy: number;
      let color = i % 4 === 0 ? accent : main;
      let R = h * 0.3;
      let k = 2.3;
      let life = 1300 + rand() * 500;
      let g = h * 0.32;
      let trail = 0.06;
      let size = 2.4 + rand() * 1.2;
      let crackle = rand() < 0.35;
      if (pattern === HEART_BURST) {
        const a = (i / n) * TAU;
        const s = Math.sin(a);
        dx = (16 * s * s * s) / 17;
        dy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17;
        color = i % 3 === 0 ? ROSE : BERRY;
        R = h * 0.27;
        g = h * 0.1;
        life = 1700 + rand() * 300;
        trail = 0.04;
        crackle = false;
      } else if (pattern === RING) {
        const outer = i < 36;
        const a = (outer ? i / 36 : (i - 36) / 20) * TAU;
        const r = outer ? 1 : 0.5;
        dx = Math.cos(a) * r;
        dy = Math.sin(a) * r;
        color = outer ? main : accent;
      } else if (pattern === EIGHTY) {
        // "8": two stacked circles, the lower one larger; "0": a tall ellipse beside it.
        if (i < 22) {
          const a = (i / 22) * TAU;
          dx = -0.62 + Math.cos(a) * 0.42;
          dy = -0.52 + Math.sin(a) * 0.42;
        } else if (i < 48) {
          const a = ((i - 22) / 26) * TAU;
          dx = -0.62 + Math.cos(a) * 0.5;
          dy = 0.42 + Math.sin(a) * 0.5;
        } else {
          const a = ((i - 48) / 36) * TAU;
          dx = 0.62 + Math.cos(a) * 0.46;
          dy = Math.sin(a) * 0.94;
        }
        color = i % 3 === 0 ? GOLD : BERRY;
        R = h * 0.24;
        k = 2.8;
        g = h * 0.03;
        life = 2500 + rand() * 250;
        trail = 0.02;
        size = 3.2 + rand() * 0.6;
        crackle = false;
      } else {
        // Peony and willow: a filled sphere seen from the front, denser towards the rim.
        const a = (i / n) * TAU + rand() * 0.2;
        const z = rand() * 2 - 1;
        const r = Math.sqrt(1 - z * z) * (0.85 + rand() * 0.15);
        dx = Math.cos(a) * r;
        dy = Math.sin(a) * r;
        if (pattern === WILLOW) {
          color = i % 4 === 0 ? ROSE : GOLD;
          R = h * 0.26;
          k = 1.7;
          g = h * 0.3;
          life = 2000 + rand() * 500;
          trail = 0.12;
          crackle = true;
        }
      }
      const p = this.spawn(SPARK, color, x, y, dx * R * k + rocket.vx * 0.3, dy * R * k, size * u, life);
      if (!p) return;
      p.drag = k;
      p.g = g;
      p.trail = trail;
      p.glow = i % 3 === 0;
      p.twinkle = crackle ? 1 : 0;
    }
  }
}

/** Unit shapes and glow sprites, built once per canvas on first draw. */
interface Art {
  dot: Path2D;
  paper: Path2D;
  ribbon: Path2D;
  heart: Path2D;
  star5: Path2D;
  star4: Path2D;
  /** Soft round glows, one per palette colour, spanning -1..1. */
  glow: HTMLCanvasElement[];
}

function makeArt(): Art {
  const dot = new Path2D();
  dot.arc(0, 0, 1, 0, TAU);
  const paper = new Path2D();
  paper.rect(-1, -0.62, 2, 1.24);
  const ribbon = new Path2D();
  ribbon.rect(-1.7, -0.32, 3.4, 0.64);
  const heart = new Path2D();
  heart.moveTo(0, 0.95);
  heart.bezierCurveTo(-1.35, 0.05, -1.05, -1.1, 0, -0.38);
  heart.bezierCurveTo(1.05, -1.1, 1.35, 0.05, 0, 0.95);
  const star5 = new Path2D();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.45 : 1;
    if (i === 0) star5.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star5.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  star5.closePath();
  const star4 = new Path2D();
  star4.moveTo(0, -1);
  star4.quadraticCurveTo(0.12, -0.12, 1, 0);
  star4.quadraticCurveTo(0.12, 0.12, 0, 1);
  star4.quadraticCurveTo(-0.12, 0.12, -1, 0);
  star4.quadraticCurveTo(-0.12, -0.12, 0, -1);
  star4.closePath();
  // Coloured glows (cream glows gold): a white bloom would vanish on the cream screens.
  const glow = COLORS.map((c, i) => {
    const tint = i === CREAM ? COLORS[GOLD] : c;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `${tint}B3`);
    grad.addColorStop(0.35, `${tint}55`);
    grad.addColorStop(1, `${tint}00`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return cv;
  });
  return { dot, paper, ribbon, heart, star5, star4, glow };
}

/** Draws every live particle; exactly one setTransform per particle. */
function drawParticles(ctx: CanvasRenderingContext2D, e: FxEngine, d: number, art: Art): void {
  ctx.resetTransform();
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineCap = 'round';
  const { pool, live } = e;
  for (let i = 0; i < live; i++) {
    const p = pool[i]!;
    const f = p.age / p.life;
    const color = COLORS[p.color as 0];
    switch (p.kind) {
      case SPARK:
      case ROCKET: {
        let a = p.kind === ROCKET ? 1 : f < 0.5 ? 1 : 1 - ((f - 0.5) / 0.5) ** 1.5;
        if (p.twinkle > 0 && f > 0.55 && Math.sin(p.phase + p.age * 0.07) < -0.1) a *= 0.2;
        ctx.setTransform(d, 0, 0, d, 0, 0);
        if (p.glow) {
          const r = p.size * (p.kind === ROCKET ? 4.5 : 3.5);
          ctx.globalAlpha = a * 0.5;
          ctx.drawImage(art.glow[p.color]!, p.x - r, p.y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = a;
        ctx.strokeStyle = color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * p.trail, p.y - p.vy * p.trail);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        break;
      }
      case STAR4:
      case FLASH: {
        const a = p.kind === FLASH ? 1 - f : 1 - f * f;
        // Twinkle pulses the star's size, so the colour stays crisp on light screens.
        const tw = p.twinkle > 0 ? 0.7 + 0.3 * Math.sin(p.phase + (p.age / 1000) * p.twinkle) : 1;
        const s = (p.kind === FLASH ? p.size * (0.45 + 0.9 * f) : p.size * tw) * d;
        const c = Math.cos(p.rot) * s;
        const sn = Math.sin(p.rot) * s;
        ctx.setTransform(c, sn, -sn, c, p.x * d, p.y * d);
        if (p.glow) {
          ctx.globalAlpha = a * 0.4;
          ctx.drawImage(art.glow[p.color]!, -1.3, -1.3, 2.6, 2.6);
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = color;
        ctx.fill(art.star4);
        if (p.color === CREAM) {
          // A cream star needs a gold rim to show on the ivory tiles.
          ctx.lineWidth = 0.14;
          ctx.strokeStyle = COLORS[GOLD];
          ctx.stroke(art.star4);
        }
        break;
      }
      case DOT: {
        const a = p.life > 2000 ? (f < 0.85 ? 1 : (1 - f) / 0.15) : 1 - f * f;
        const s = p.size * d;
        ctx.setTransform(s, 0, 0, s, p.x * d, p.y * d);
        ctx.globalAlpha = a;
        ctx.fillStyle = color;
        ctx.fill(art.dot);
        break;
      }
      default: {
        // Confetti turning over in the air: the drawn height follows cos(flip), the back a shade dimmer.
        const fy = Math.cos(p.flip);
        let a = f < 0.85 ? 1 : (1 - f) / 0.15;
        if (fy < 0) a *= 0.72;
        const s = p.size * d;
        const c = Math.cos(p.rot) * s;
        const sn = Math.sin(p.rot) * s;
        ctx.setTransform(c, sn, -sn * fy, c * fy, p.x * d, p.y * d);
        ctx.globalAlpha = a;
        ctx.fillStyle = color;
        ctx.fill(p.kind === PAPER ? art.paper : p.kind === RIBBON ? art.ribbon : p.kind === HEART ? art.heart : art.star5);
      }
    }
  }
}

/** One effects canvas over `root`; call `destroy` on unmount (pending effect promises then resolve). */
export function createFx(root: HTMLElement): Fx {
  const engine = new FxEngine();
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:60';
  canvas.hidden = true;
  root.append(canvas);
  const ctx = canvas.getContext('2d');
  let art: Art | null = null;
  let raf = 0;
  let last = -1;
  let dpr = 1;
  let destroyed = false;
  let vw = innerWidth;
  let vh = innerHeight;
  let resized = true;

  const fit = (): void => {
    resized = false;
    dpr = Math.min(DPR_MAX, devicePixelRatio || 1);
    const bw = Math.round(vw * dpr);
    const bh = Math.round(vh * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    engine.resize(vw, vh);
  };

  const frame = (now: number): void => {
    raf = 0;
    if (last >= 0) engine.step(now - last);
    last = now;
    if (resized) fit();
    if (ctx && engine.live > 0) {
      art ??= makeArt();
      drawParticles(ctx, engine, dpr, art);
    } else ctx?.clearRect(0, 0, canvas.width, canvas.height);
    if (engine.active) raf = requestAnimationFrame(frame);
    else canvas.hidden = true;
  };

  const run = (): void => {
    if (destroyed || raf || document.visibilityState === 'hidden') return;
    canvas.hidden = false;
    last = -1;
    raf = requestAnimationFrame(frame);
  };

  /** Before spawning: the engine must know the current viewport. */
  const ready = (): boolean => {
    if (destroyed || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (resized) fit();
    return true;
  };

  const onResize = (): void => {
    vw = innerWidth;
    vh = innerHeight;
    resized = true;
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else if (engine.active) run();
  };

  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    sparkle(x, y) {
      if (!ready()) return;
      engine.sparkle(x, y);
      run();
    },
    confetti(ms) {
      if (!ready()) return Promise.resolve();
      const done = engine.confetti(ms);
      run();
      return done;
    },
    fireworks(ms) {
      if (!ready()) return Promise.resolve();
      const done = engine.fireworks(ms);
      run();
      return done;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      engine.destroy();
      canvas.remove();
    },
  };
}
