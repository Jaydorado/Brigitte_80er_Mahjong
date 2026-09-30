# Brigittes Mahjong Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task goes to the builder named in its header. The controller never writes product code.

**Goal:** An offline, installable landscape PWA mahjong solitaire game with 6 levels. Each level uncovers one of six clues for Brigitte's 80th birthday.

**Architecture:** Pure-TypeScript `core/` (geometry, deal, shuffle with relocation, reducer), with no DOM. A DOM `ui/` renders tiles from one baked sprite atlas, plus one canvas for particles. This is the same stack and CI as Solitaire Dreams.

**Tech Stack:** TypeScript 7, Vite 8, vite-plugin-pwa 1.3, Vitest 5, Playwright (smoke only), GitHub Actions → GitHub Pages. Versions are copied from `../Anna's Disney Solitaire clone/package.json`.

**Spec:** `docs/superpowers/specs/2026-09-30-brigitte-80-mahjong-design.md` (revision 2, approved). Executors read both. Where the plan says "per spec §X", the spec text is the requirement.

**Reference repo (read-only):** `C:/Users/julia/Projects/Anna's Disney Solitaire clone/`. Copy patterns from it: `vite.config.ts`, `.github/workflows/`, `src/progress/save.ts`, `src/ui/frame.ts` (safe-area handling), `src/ui/fx.ts` (animation identity via WeakMap, `finished.then(done, done)`).

## Global Constraints

- Landscape Android Chrome, viewport ≥ 640×360 CSS px after safe-area insets. Welcome and install help also work in portrait. Map and level screens show "Bitte das Handy drehen" in portrait.
- All player-facing text is German. Content lives only in `src/content.ts`.
- `core/`: no DOM, no timers, no `Math.random`. `core/` never imports `ui/`.
- Tile face width ≥ 44 CSS px at 640×360. Other controls ≥ 48 px; helper buttons ≥ 56 px. Body text ≥ 20 px, clue under tiles ≥ 24 px, clue letter ≥ 28 px.
- Animations only on `transform`/`opacity` (WAAPI or CSS), plus canvas drawing. No CSS `filter`, `box-shadow`, or `backdrop-filter` on tiles. No `will-change` or 3D on resting tiles. No ambient animation behind a level.
- Palette: `#FFF8EE` cream, `#D9B26F` gold, `#E89AA8` rose, `#8E2F4F` berry, `#3A1F2B` plum text.
- Save key `mahjong80.save`. Base path `/Brigitte_80er_Mahjong/`.
- The family texts ship as warm drafts, and `TEXTS_FINAL = false` in `src/content.ts`. Drafts deploy, so the family can preview and refine them. The release check (`RELEASE=1 npm test`) fails until `TEXTS_FINAL = true`. Brigitte gets the link only after that check passes.
- The UI respects `prefers-reduced-motion`.

## Dependency order

```
T1 scaffold ─┬─ T2 geometry ── T3 deal/shuffle ── T4 reducer ── T5 layouts+levels+recovery
             └─ T6 save
T5 + T6 ──── T7 board/atlas/level screen ── T8 interactions/fx/dialogs ─┬─ T10 tutorial
                                                                       └─ T9 map/welcome/letter/closing/router
T8 + T9 + T10 ── T11 smoke + perf + deploy
```

T2–T5 and T6 can run in parallel with each other only where the arrows allow. T6 is independent after T1.

## File map

|File|Task|Responsibility|
|---|---|---|
|`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.github/workflows/deploy.yml`, `public/` icons|T1|build, PWA, CI|
|`src/content.ts`, `src/content.test.ts`|T1|clues + family texts; release check|
|`src/vendor/tiles/*.svg`, `src/vendor/tiles/LICENSE.md`|T1|34 CC0 faces|
|`src/core/tiles.ts`, `src/core/rng.ts`, `src/core/layout.ts` (+ tests)|T2|faces, PRNG, geometry, `isFree`|
|`src/core/deal.ts`, `src/core/solver.ts` (+ tests)|T3|peel, deal, shuffle/relocate, fixture oracle|
|`src/core/game.ts` (+ test)|T4|reducer, hint, history, status|
|`src/core/layouts.ts`, `src/levels/levels.ts`, `tools/certify.ts`, `src/ui/fit.ts` (+ tests)|T5|6 shapes, certificates, levels, fit math, recovery test|
|`src/progress/save.ts` (+ test)|T6|persistence|
|`src/ui/frame.ts`, `src/ui/atlas.ts`, `src/ui/art/tileArt.ts`, `src/ui/board.ts`, `src/ui/hud.ts`, `src/ui/cluePaper.ts`, `src/ui/levelScreen.ts`, `src/ui/styles.css`, `src/main.ts` (temporary dev route)|T7|board rendering|
|`src/ui/fx.ts`, `src/ui/anim.ts`, `src/ui/dialogs.ts`, edits in `board.ts`, `levelScreen.ts`|T8|match flights, particles, stuck/leave dialogs, lifecycle|
|`src/ui/map.ts`, `src/ui/art/cake.ts`, `src/ui/welcome.ts`, `src/ui/install.ts`, `src/ui/letter.ts`, `src/ui/closing.ts`, `src/ui/router.ts`, `src/main.ts`, `src/ui/sw.ts`|T9|screens + flow|
|`src/ui/tutorial.ts`, edits in `levelScreen.ts`|T10|level-1 guidance|
|`smoke/smoke.spec.ts`, `playwright.config.ts`, `docs/reports/2026-10-perf.md`|T11|UI smoke, perf report|

---

### Task 1: Scaffold, content, vendor tiles, CI

**Builder:** `builder-cheap`.

**Files:** as in the file map (T1 rows). Copy from the reference repo and adapt.

**Interfaces:**
- Produces:
  ```ts
  // src/content.ts
  export const clues: readonly [string, string, string, string, string, string];
  export const welcome: { title: string; message: string };
  export const finale: string;
  export const credit: string;
  ```
- Produces: the face SVGs at `src/vendor/tiles/<Name>.svg`, imported via `import.meta.glob('../vendor/tiles/*.svg', { query: '?url', import: 'default', eager: true })` by T7.

- [ ] **Step 1: `package.json`.** Same `devDependencies` and scripts as the reference repo, minus `@vite-pwa/assets-generator`/`seeds` unless icons are generated with it. Name `brigittes-mahjong`. Add script `"certify": "tsx tools/certify.ts"`. Run `npm install`.
- [ ] **Step 2: `vite.config.ts`.**
  - `base: process.env.VITE_BASE ?? '/'`.
  - `VitePWA` with `registerType: 'prompt'` and `injectRegister: false` (T9 registers manually).
  - Manifest per spec §PWA:
    - `id`, `start_url`, and `scope`: `process.env.VITE_BASE ?? '/'`.
    - `name: 'Brigittes Mahjong'`, `short_name: 'Mahjong'`, `display: 'fullscreen'`, `orientation: 'landscape'`.
    - `background_color: '#FFF8EE'`, `theme_color: '#8E2F4F'`.
    - Icons 64/192/512 plus a maskable one.
  - `workbox.globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}']`.
  - `test.include: ['src/**/*.test.ts', 'tools/**/*.test.ts']`.
- [ ] **Step 3: `index.html`.** Same as the reference, with `lang="de"`, title "Brigittes Mahjong", and `theme-color` `#8E2F4F`.
- [ ] **Step 4: icons.** Create `public/icon.svg`: a simple three-tier cake in rose/cream with gold "80", code-drawn. Generate the PNG sizes with `@vite-pwa/assets-generator` as the reference does (`pwa-assets.config.ts`).
- [ ] **Step 5: vendor tiles.** Download these 34 files from `https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular/`:
  - `Pin1..Pin9`, `Sou1..Sou9`, `Man1..Man9`
  - `Ton`, `Nan`, `Shaa`, `Pei`
  - `Chun`, `Hatsu`, `Haku`

  Save them into `src/vendor/tiles/`, and add `LICENSE.md` with the upstream CC0 text and the repo URL. Do not download the `-Dora` variants.
- [ ] **Step 6: `src/content.ts`.**

  ```ts
  // Texte für Brigittes Mahjong. Hier dürfen alle Texte geändert werden.
  // Reihenfolge der Hinweise = Level 1 bis 6.
  export const clues = [
    'Familie',
    '9h 31 selzthal umsteigen',
    'Grün/weiß',
    'Klaus wildbolz/Albert fortell',
    'Bezirkschulinspektor',
    '12.2. 1989',
  ] as const;

  export const welcome = {
    title: 'Alles Gute zum 80. Geburtstag, liebe Brigitte!',
    message:
      'Wir haben dir ein kleines Spiel gebaut, ganz für dich allein. In jedem Level versteckt sich unter den Steinen ein Hinweis auf dein Geschenk. Nimm dir Zeit, es gibt keine Eile. Viel Freude beim Rätseln!',
  };

  export const finale =
    'Du hast alle sechs Hinweise gefunden! Errätst du, was wir gemeinsam vorhaben? Wir freuen uns schon riesig darauf.';
  export const credit = 'In Liebe, deine Familie';

  // Auf true setzen, sobald die Familie die Texte freigegeben hat. Erst dann bekommt Brigitte den Link.
  export const TEXTS_FINAL = false;
  ```
- [ ] **Step 7: test `src/content.test.ts`.**

  ```ts
  import { describe, expect, it } from 'vitest';
  import { clues, credit, finale, TEXTS_FINAL, welcome } from './content';

  describe('content', () => {
    it('has six non-empty clues and non-empty texts', () => {
      expect(clues).toHaveLength(6);
      for (const s of [...clues, welcome.title, welcome.message, finale, credit]) expect(s.trim().length).toBeGreaterThan(0);
    });
    it.skipIf(process.env.RELEASE !== '1')('texts are approved by the family (release check)', () => {
      expect(TEXTS_FINAL).toBe(true);
    });
  });
  ```

  Run `npx vitest run src/content.test.ts`. Expected: 1 passed, 1 skipped. Add a script `"release-check": "cross-env RELEASE=1 vitest run"`, with `cross-env` as a devDependency (Windows shell). CI runs plain `npm test`, so drafts deploy for the family preview.
- [ ] **Step 8: CI.** Copy `.github/workflows/deploy.yml` from the reference with `VITE_BASE: /Brigitte_80er_Mahjong/`.
- [ ] **Step 9: placeholder `src/main.ts`** that renders "Brigittes Mahjong" into `#app`, and `src/ui/styles.css` with the palette as CSS custom properties (`--cream`, `--gold`, `--rose`, `--berry`, `--plum`).
- [ ] **Step 10: verify.**
  - `npm test` passes.
  - `npm run release-check` fails only on the release check.
  - `npm run build` succeeds, and `dist/manifest.webmanifest` contains `"display":"fullscreen"`.
- [ ] **Step 11: commit** `chore: scaffold Brigittes Mahjong (Vite, PWA, CI, CC0 tiles, content)`.

---

### Task 2: Faces, PRNG, geometry

**Builder:** `builder-opus`.

**Files:** `src/core/tiles.ts`, `src/core/rng.ts`, `src/core/layout.ts`, `src/core/layout.test.ts`, `src/core/rng.test.ts`.

**Interfaces (produces):**

```ts
// tiles.ts
export type FaceId = number; // 0..33
// 0–8 dots 1–9 (Pin), 9–17 bamboo 1–9 (Sou), 18–26 characters 1–9 (Man),
// 27 East(Ton) 28 South(Nan) 29 West(Shaa) 30 North(Pei), 31 red(Chun) 32 green(Hatsu) 33 white(Haku)
export const FACE_COUNT = 34;
export function faceFile(f: FaceId): string;   // 'Pin1' … 'Haku'
export function faceCorner(f: FaceId): string; // '1'..'9' for suits; 'O','S','W','N' for winds; '' for dragons

// rng.ts
export type Rng = () => number;                         // [0, 1)
export function mulberry32(seed: number): Rng;
export function hashSeed(...parts: number[]): number;    // uint32, order-sensitive (e.g. FNV-1a over 32-bit words)
export function shuffleInPlace<T>(arr: T[], rng: Rng): T[];
export function randInt(rng: Rng, n: number): number;   // 0..n-1

// layout.ts
export interface Slot { col: number; row: number; layer: number } // half-tile units
export interface Rect { col: number; row: number; w: number; h: number } // half-tile units
export type Pair = readonly [number, number];            // slot indices
export type LayoutId = 'rect' | 'gift' | 'flower' | 'balloons' | 'pyramid' | 'eighty';
export interface Layout { id: LayoutId; slots: Slot[]; clueRect: Rect; certificate: Pair[] }
export interface LayoutIndex { above: number[][]; left: number[][]; right: number[][] }
export function buildIndex(slots: readonly Slot[]): LayoutIndex;
export function isFree(i: number, idx: LayoutIndex, occupied: readonly boolean[]): boolean;
export function freeSlots(idx: LayoutIndex, occupied: readonly boolean[]): number[];
export function slotsFromMasks(layers: readonly (readonly string[])[]): Slot[];
// layers[z][y] is a row string; '#' at x → Slot {col: 2x, row: 2y, layer: z}. Order: layer, row, col.
```

**Rules (spec §Game rules):**
- `above[i]`: slots on a higher layer with `|dc| < 2 && |dr| < 2`.
- `left[i]` / `right[i]`: same layer, `dc === -2` / `+2`, `|dr| < 2`.
- Free iff no occupied `above`, and (no occupied `left` or no occupied `right`).

- [ ] **Step 1: failing tests `src/core/layout.test.ts`.**

  ```ts
  import { describe, expect, it } from 'vitest';
  import { buildIndex, freeSlots, isFree, slotsFromMasks, type Slot } from './layout';

  const all = (n: number) => Array(n).fill(true) as boolean[];

  describe('isFree', () => {
    it('row of three: ends free, middle blocked', () => {
      const s = slotsFromMasks([['###']]);
      const idx = buildIndex(s);
      expect(freeSlots(idx, all(3))).toEqual([0, 2]);
    });
    it('middle becomes free when one side is removed', () => {
      const idx = buildIndex(slotsFromMasks([['###']]));
      expect(isFree(1, idx, [false, true, true])).toBe(true);
    });
    it('full overlap from above blocks', () => {
      const s: Slot[] = [{ col: 0, row: 0, layer: 0 }, { col: 0, row: 0, layer: 1 }];
      const idx = buildIndex(s);
      expect(isFree(0, idx, [true, true])).toBe(false);
      expect(isFree(1, idx, [true, true])).toBe(true);
    });
    it('half-offset overlap from above blocks both tiles below', () => {
      const s: Slot[] = [{ col: 0, row: 0, layer: 0 }, { col: 2, row: 0, layer: 0 }, { col: 1, row: 0, layer: 1 }];
      const idx = buildIndex(s);
      expect(freeSlots(idx, all(3))).toEqual([2]);
    });
    it('half-row vertical offset still counts as a side neighbour', () => {
      const s: Slot[] = [{ col: 0, row: 0, layer: 0 }, { col: 2, row: 1, layer: 0 }, { col: 4, row: 0, layer: 0 }];
      expect(isFree(1, buildIndex(s), all(3))).toBe(false);
    });
    it('diagonal neighbour two rows down is not a side neighbour', () => {
      const s: Slot[] = [{ col: 0, row: 0, layer: 0 }, { col: 2, row: 2, layer: 0 }, { col: 4, row: 0, layer: 0 }];
      expect(isFree(1, buildIndex(s), all(3))).toBe(true);
    });
  });

  describe('slotsFromMasks', () => {
    it('orders by layer, row, col in half units', () => {
      expect(slotsFromMasks([['#.#'], ['..#']])).toEqual([
        { col: 0, row: 0, layer: 0 }, { col: 4, row: 0, layer: 0 }, { col: 4, row: 0, layer: 1 },
      ]);
    });
  });
  ```

  `src/core/rng.test.ts`: the same seed gives the same sequence (first 5 values equal across two instances); `hashSeed(1, 2) !== hashSeed(2, 1)`; `shuffleInPlace` is a permutation (sorted output equals sorted input).
- [ ] **Step 2:** run `npx vitest run src/core`. Expected: FAIL (modules missing).
- [ ] **Step 3:** implement the three modules to the interfaces above. `faceFile` maps per the comment table. `faceCorner` returns the digit for 0–26 (`String(f % 9 + 1)`), and `['O','S','W','N'][f-27]` for 27–30.
- [ ] **Step 4:** run `npx vitest run src/core`. Expected: PASS.
- [ ] **Step 5: commit** `feat(core): faces, seeded rng, layout geometry and isFree`.

---

### Task 3: Peel, deal, shuffle with relocation, fixture oracle

**Builder:** `builder-opus` (precision work: it is the load-bearing guarantee).

**Files:** `src/core/deal.ts`, `src/core/solver.ts`, `src/core/deal.test.ts`, `src/core/solver.test.ts`.

**Interfaces:**
- Consumes: T2's `Layout`, `LayoutIndex`, `Pair`, `isFree`, `freeSlots`, `Rng`, `mulberry32`, `shuffleInPlace`, `randInt`, `FaceId`.
- Produces:
  ```ts
  export interface Board { occupied: boolean[]; faceAt: FaceId[] } // faceAt[i] meaningful only where occupied[i]
  export function peel(idx: LayoutIndex, occupied: readonly boolean[], rng: Rng, maxTries: number): Pair[] | null;
  export function assignFaces(order: readonly Pair[], faces: readonly FaceId[], rng: Rng, slotCount: number): FaceId[];
  // faces = distinct faces to use; pairs round-robin over a shuffled copy of `faces`, so per-face pair counts differ by ≤ 1
  export function deal(layout: Layout, idx: LayoutIndex, faces: readonly FaceId[], seed: number): { board: Board; witness: Pair[] };
  export interface ShuffleResult { board: Board; witness: Pair[]; moves: { from: number; to: number }[] | null }
  // moves === null → in place (only faces changed); otherwise every remaining tile's from → to slot
  export function shuffleBoard(layout: Layout, idx: LayoutIndex, board: Board, seed: number): ShuffleResult;
  export function replayLegal(idx: LayoutIndex, board: Board, order: readonly Pair[]): boolean;
  // true iff each pair, in order, is two occupied, free, same-face slots at its step, and the board ends empty
  ```
  ```ts
  // solver.ts (tests only)
  export function solvable(idx: LayoutIndex, board: Board): boolean; // exhaustive DFS, memo on occupied bitstring; for ≤ 16 tiles
  ```

**Algorithm (spec §Deal and Shuffle):**
- `peel`: a try copies `occupied`; loop: `f = freeSlots`; if `f.length < 2` → the try fails (unless empty → success); pick two distinct indices with `randInt`; record; clear both. Up to `maxTries` tries.
- `deal`:
  - `order = peel(allTrue, rng, 1000) ?? layout.certificate`.
  - `faceAt = assignFaces(order, faces, rng, slots.length)`.
  - `rng = mulberry32(seed)`.
- `shuffleBoard`:
  - `rng = mulberry32(seed)`.
  - Remaining face pairs: group the occupied tiles by face; each face count is even (assert; throw if not). Split into pairs.
  - In place: `order = peel(board.occupied, rng, 200)`. If non-null, shuffle the face pairs and assign one to each order pair → `moves: null`.
  - Relocate: `m = remaining/2`; `target = layout.certificate.slice(certificate.length - m)`; the target slot set is the union of those pairs. The new occupied set = exactly the target slots. Assign the shuffled face pairs along `target` (the witness = `target`). `moves`: sort the old occupied slots and the target slots each by `(layer, row, col)` and zip.

- [ ] **Step 1: failing tests `src/core/deal.test.ts`.**

  ```ts
  import { describe, expect, it } from 'vitest';
  import { buildIndex, slotsFromMasks, type Layout } from './layout';
  import { deal, peel, replayLegal, shuffleBoard, type Board } from './deal';
  import { mulberry32 } from './rng';
  import { solvable } from './solver';

  function mkLayout(masks: string[][]): Layout {
    const slots = slotsFromMasks(masks);
    const idx = buildIndex(slots);
    const certificate = peel(idx, slots.map(() => true), mulberry32(1), 1000)!;
    return { id: 'rect', slots, clueRect: { col: 0, row: 0, w: 2, h: 2 }, certificate };
  }
  const L = mkLayout([['######', '######', '######'], ['.####.', '.####.']]); // 26 tiles

  describe('deal', () => {
    it('is deterministic per seed', () => {
      const idx = buildIndex(L.slots);
      expect(deal(L, idx, [0, 1, 2, 3], 7)).toEqual(deal(L, idx, [0, 1, 2, 3], 7));
    });
    it('witness replays legally for 200 seeds', () => {
      const idx = buildIndex(L.slots);
      for (let s = 0; s < 200; s++) {
        const { board, witness } = deal(L, idx, [0, 1, 2, 3, 4], s);
        expect(replayLegal(idx, board, witness)).toBe(true);
      }
    });
    it('per-face pair counts differ by at most 1', () => {
      const idx = buildIndex(L.slots);
      const { board } = deal(L, idx, [0, 1, 2, 3, 4], 3);
      const counts = new Map<number, number>();
      for (const f of board.faceAt) counts.set(f, (counts.get(f) ?? 0) + 1);
      const pairs = [...counts.values()].map((c) => c / 2);
      expect(Math.max(...pairs) - Math.min(...pairs)).toBeLessThanOrEqual(1);
    });
  });

  describe('shuffleBoard', () => {
    it('keeps the face multiset and yields a legal witness (in place)', () => {
      const idx = buildIndex(L.slots);
      const { board } = deal(L, idx, [0, 1, 2, 3, 4], 5);
      const r = shuffleBoard(L, idx, board, 99);
      const ms = (b: Board) => b.faceAt.filter((_, i) => b.occupied[i]).sort((a, b) => a - b);
      expect(ms(r.board)).toEqual(ms(board));
      expect(replayLegal(idx, r.board, r.witness)).toBe(true);
    });

    it('relocates the stacked-twin trap (review Appendix A) and stays solvable', () => {
      // A(0,0,0) B(0,0,1) C(2,0,0) D(0,2,0); after C+D removed only A (covered) and B remain.
      const slots = [
        { col: 0, row: 0, layer: 0 }, { col: 0, row: 0, layer: 1 },
        { col: 2, row: 0, layer: 0 }, { col: 0, row: 2, layer: 0 },
      ];
      const idx = buildIndex(slots);
      const trap: Layout = { id: 'rect', slots, clueRect: { col: 0, row: 0, w: 2, h: 2 }, certificate: [[1, 2], [0, 3]] };
      const board: Board = { occupied: [true, true, false, false], faceAt: [5, 5, 5, 5] };
      const r = shuffleBoard(trap, idx, board, 1);
      expect(r.moves).not.toBeNull();
      expect(replayLegal(idx, r.board, r.witness)).toBe(true);
      expect(solvable(idx, r.board)).toBe(true);
    });
  });
  ```

  `src/core/solver.test.ts`:
  - `solvable` is true on a fresh 2×3 single-layer deal.
  - It is false on the trap board `{occupied:[true,true,false,false], faceAt:[5,5,5,5]}`.
  - It is false on the single row `'####'` with faces `[1,1,2,2]`: only the ends are free, and they show faces 1 and 2.
  - Across 100 seeds of a 12-tile layout, for boards reached by random legal play and then `shuffleBoard`, it is true.
- [ ] **Step 2:** run `npx vitest run src/core/deal.test.ts src/core/solver.test.ts`. Expected: FAIL.
- [ ] **Step 3:** implement `deal.ts` and `solver.ts` to the interfaces.
- [ ] **Step 4:** run the same command. Expected: PASS.
- [ ] **Step 5: commit** `feat(core): solvable deal and shuffle with certificate relocation`.

---

### Task 4: Game reducer

**Builder:** `builder-opus`.

**Files:** `src/core/game.ts`, `src/core/game.test.ts`.

**Interfaces:**
- Consumes: T3's `Board`, `deal`, `shuffleBoard`, and T2's types.
- Produces:
  ```ts
  export type HistoryEntry =
    | { kind: 'match'; a: number; b: number; face: FaceId }
    | { kind: 'shuffle'; before: Board; witness: Pair[] };
  export type GameEvent =
    | { type: 'selected'; slot: number } | { type: 'deselected' }
    | { type: 'blocked'; slot: number }
    | { type: 'matched'; a: number; b: number }
    | { type: 'hint'; slots: number[] }             // step 1: [a]; step 2: [a, b]
    | { type: 'stuckHint' }                         // Tipp pressed with no free pair
    | { type: 'undoMatch'; a: number; b: number }
    | { type: 'shuffled'; moves: { from: number; to: number }[] | null }
    | { type: 'undoShuffle'; before: Board; after: Board }
    | { type: 'noop' };
  export interface GameState {
    layout: Layout; idx: LayoutIndex; board: Board; witness: Pair[];
    selected: number | null; hint: { a: number; b: number; step: 1 | 2 } | null;
    history: HistoryEntry[]; attemptSeed: number; shuffleCounter: number;
    event: GameEvent;
  }
  export type Action = { type: 'tap'; slot: number } | { type: 'hint' } | { type: 'undo' } | { type: 'shuffle' };
  export function newGame(layout: Layout, faces: readonly FaceId[], attemptSeed: number): GameState;
  export function reduce(s: GameState, a: Action): GameState;       // pure; never mutates s
  export function status(s: GameState): 'won' | 'stuck' | 'playing'; // won checked first
  export function freePairs(s: GameState): Pair[];                  // free same-face pairs, deterministic order
  export function tilesLeft(s: GameState): number;
  ```

**Rules** (spec §Game rules, §History and Undo, §Hint):
- tap:
  - An unoccupied slot → `noop`.
  - A blocked tile → `blocked`.
  - A free tile:
    - no selection → select it;
    - same as the selection → deselect;
    - same face as the selection → match (push history, clear selection and hint);
    - else → move the selection.
  - A new selection clears the hint unless the selected slot is the hint's `a` or `b`. In that case the hint is kept, so she can follow it.
- hint:
  - If `freePairs` is empty → `stuckHint`.
  - Else if a hint is active at step 1 → step 2 (same pair).
  - Else pick the pair whose max layer is highest (ties: lowest slot index sum), step 1.
- undo:
  - Empty history → `noop`.
  - `match` → restore both tiles.
  - `shuffle` → restore `before` and its `witness`.
  - Undo clears selection and hint.
- shuffle:
  - `seed = hashSeed(attemptSeed, shuffleCounter)`; `shuffleCounter + 1` always, never rolled back on undo.
  - Push `{kind:'shuffle', before: board, witness}` and apply the result.
  - Clear selection and hint.
- `newGame`: `deal(layout, idx, faces, attemptSeed)`.

- [ ] **Step 1: failing tests `src/core/game.test.ts`.** Use the 26-tile layout from T3's test (copy the `mkLayout` helper verbatim), `faces = [0,1,2,3,4]`, `attemptSeed = 11`. A helper `firstFreePair(s)` returns `freePairs(s)[0]`. Tests:

  ```ts
  it('selects, deselects and moves selection', () => { /* tap a free tile → selected; tap again → deselected; tap free tile of other face → selection moves */ });
  it('blocked tap does not select', () => { /* find an occupied non-free slot; reduce → event.type 'blocked', selected null */ });
  it('matching a free pair removes both and pushes history', () => {
    let s = newGame(L, faces, 11);
    const [a, b] = freePairs(s)[0];
    s = reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: b });
    expect(s.board.occupied[a] || s.board.occupied[b]).toBe(false);
    expect(s.history).toHaveLength(1);
    expect(s.event).toEqual({ type: 'matched', a, b });
  });
  it('undo restores a match exactly', () => { /* board after undo toEqual board before the match */ });
  it('two undos across a shuffle restore the pre-shuffle board, then the pre-match board', () => {
    /* s0 → match → s1 → shuffle → s2; undo → board equals s1.board; undo → equals s0.board */
  });
  it('shuffle keeps the face multiset and the counter is monotonic across undo', () => {
    /* shuffle → counter 1; undo → counter still 1; shuffle → counter 2 */
  });
  it('hint step 1 marks one tile, step 2 adds its twin; a match clears it', () => {
    let s = reduce(newGame(L, faces, 11), { type: 'hint' });
    expect(s.event).toMatchObject({ type: 'hint' });
    expect((s.event as { slots: number[] }).slots).toHaveLength(1);
    s = reduce(s, { type: 'hint' });
    expect((s.event as { slots: number[] }).slots).toHaveLength(2);
    const { a, b } = s.hint!;
    s = reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: b });
    expect(s.hint).toBeNull();
  });
  it('selecting the hinted tile keeps the hint; selecting another clears it', () => { /* … */ });
  it('status: won before stuck; stuck when no free pair', () => {
    /* play freePairs[0] repeatedly until empty → 'won'. Build a stuck board by hand:
       state with board { occupied: trap pattern } using the T3 trap layout → 'stuck' */
  });
  it('hint on a stuck board emits stuckHint', () => { /* … */ });
  it('reduce never mutates its input', () => { /* structuredClone before, deep-equal after */ });
  ```

  Every `/* … */` must be written out as real assertions by the builder, following the named behaviour. These comments specify behaviour, not code to leave in.
- [ ] **Step 2:** run `npx vitest run src/core/game.test.ts`. Expected: FAIL.
- [ ] **Step 3:** implement `game.ts`.
- [ ] **Step 4:** run it. Expected: PASS.
- [ ] **Step 5: commit** `feat(core): game reducer with two-step hint, undo across shuffle`.

---

### Task 5: Layouts, certificates, levels, fit math, recovery test

**Builder:** `builder-opus`.

**Files:** `src/core/layouts.ts`, `tools/certify.ts`, `src/levels/levels.ts`, `src/ui/fit.ts` (pure, no DOM), `src/core/layouts.test.ts`, `src/levels/levels.test.ts`, `src/ui/fit.test.ts`, `src/core/recovery.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // layouts.ts
  export const layouts: Record<LayoutId, Layout>;
  // levels.ts
  export interface LevelDef { id: 1|2|3|4|5|6; layoutId: LayoutId; faces: readonly FaceId[]; clueIndex: 0|1|2|3|4|5; difficulty: 'leicht'|'mittel'|'schwer' }
  export const levels: readonly LevelDef[];
  export function attemptSeed(levelId: number, attempt: number): number; // hashSeed(levelId, attempt)
  // fit.ts
  export const TILE = { aspect: 1.25, layerShift: 0.06, edge: 0.12, shadow: 0.06 } as const; // multiples of w (aspect = h/w)
  export interface Extent { across: number; down: number; maxLayer: number } // across/down in tiles
  export function extentOf(slots: readonly Slot[]): Extent;
  export function fitTileWidth(areaW: number, areaH: number, e: Extent): number; // floor
  export function boardArea(vw: number, vh: number, safe = { t: 0, r: 0, b: 0, l: 0 }): { w: number; h: number }; // minus HUD 72 + margins 8
  export function slotPx(s: Slot, w: number, e: Extent, originCol: number, originRow: number): { x: number; y: number };
  // x = (col-originCol)/2*w - layer*shift*w + maxLayer*shift*w; y analog with h = 1.25w
  ```

  `fitTileWidth = floor(min(areaW / (across + maxLayer*0.06 + 0.12 + 0.06), areaH / (down*1.25 + maxLayer*0.06 + 0.12 + 0.06)))`.

**Layout data** (the shapes may be refined visually, but counts, bounding box ≤ 11×5, and the clue rect rules must hold). Masks list layer 0 first; `#` = tile.

```ts
rect (L1, 36 = 27 + 9):
  L0: '#########','#########','#########'
  L1: '.........','#########','.........'
  clueRect: { col: 0, row: 0, w: 18, h: 6 }

gift (L2, 48 = 40 + 8):
  L0: '..##.##..','#########','#########','#########','#########'
  L1: '.........','....#....','.##.#.##.','....#....','....#....'
  clueRect: { col: 0, row: 2, w: 18, h: 8 }

flower (L3, 64 = 39 + 21 + 4):
  L0: '...#####...','.#########.','###########','.#########.','...#####...'
  L1: '...........','..#######..','..#######..','..#######..','...........'
  L2: '...........','...........','...####....','...........','...........'
  clueRect: { col: 2, row: 2, w: 18, h: 6 }

balloons (L4, 72 = 36 + 24 + 12):
  L0: '.###...###.','###########','###########','.###...###.','..#.....#..'
  L1: '.###...###.','.###...###.','.###...###.','.###...###.','...........'
  L2: '...........','.###...###.','.###...###.','...........','...........'
  clueRect: { col: 0, row: 2, w: 22, h: 4 }

pyramid (L5, 88 = 55 + 27 + 5 + 1):
  L0: 5 × '###########'
  L1: '...........','.#########.','.#########.','.#########.','...........'
  L2: '...........','...........','...#####...','...........','...........'
  L3: '...........','...........','.....#.....','...........','...........'
  clueRect: { col: 0, row: 0, w: 22, h: 10 }

eighty (L6, 96 = 30 + 30 + 30 + 6):
  L0 = L1 = L2: '####.####','#..#.#..#','####.#..#','#..#.#..#','####.####'
  L3: '####.....','#..#.....','.........','.........','.........'
  clueRect: { col: 0, row: 4, w: 8, h: 2 }   // the 8's middle bar
```

The builder recounts each shape. The tests below are authoritative. If a mask's count is off, fix the mask (keeping the shape idea), never the table.

**Levels:**

|id|layoutId|faces|clueIndex|difficulty|
|---|---|---|---|---|
|1|rect|`[0,1,2,3,4,27,28,29,30]`|0|leicht|
|2|gift|`[0..8, 31,32,33]`|1|leicht|
|3|flower|`[0..17]`|2|mittel|
|4|balloons|`[0..17, 27..30, 31, 32]`|3|mittel|
|5|pyramid|`[0..33]`|4|schwer|
|6|eighty|`[0..33]`|5|schwer|

**`tools/certify.ts`:** for each layout, it runs `peel(allTrue, mulberry32(2026), 100000)` and prints the certificate as a TS literal to paste into `layouts.ts`. With `--check`, it exits with code 1 if any stored certificate fails `replayLegal` with all-same faces. `layouts.ts` holds the pasted certificates as literal data.

- [ ] **Step 1: failing tests.**

  `src/core/layouts.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { layouts } from './layouts';
  import { levels } from '../levels/levels';
  import { buildIndex } from './layout';
  import { peel, replayLegal } from './deal';
  import { mulberry32 } from './rng';

  const expected = { rect: [36, 2], gift: [48, 2], flower: [64, 3], balloons: [72, 3], pyramid: [88, 4], eighty: [96, 4] } as const;

  describe.each(Object.values(layouts))('layout $id', (L) => {
    const idx = buildIndex(L.slots);
    it('has the planned tile and layer count', () => {
      const [n, layers] = expected[L.id];
      expect(L.slots.length).toBe(n);
      expect(new Set(L.slots.map((s) => s.layer)).size).toBe(layers);
    });
    it('has no overlapping slots on one layer', () => {
      for (let i = 0; i < L.slots.length; i++) for (let j = i + 1; j < L.slots.length; j++) {
        const a = L.slots[i], b = L.slots[j];
        if (a.layer === b.layer) expect(Math.abs(a.col - b.col) < 2 && Math.abs(a.row - b.row) < 2).toBe(false);
      }
    });
    it('layer-0 bounding box is at most 11 × 5 tiles', () => {
      const l0 = L.slots.filter((s) => s.layer === 0);
      const across = (Math.max(...l0.map((s) => s.col)) - Math.min(...l0.map((s) => s.col))) / 2 + 1;
      const down = (Math.max(...l0.map((s) => s.row)) - Math.min(...l0.map((s) => s.row))) / 2 + 1;
      expect(across).toBeLessThanOrEqual(11);
      expect(down).toBeLessThanOrEqual(5);
    });
    it('clueRect is covered by layer 0 (every half-unit cell inside it lies in some layer-0 footprint)', () => {
      const r = L.clueRect;
      for (let c = r.col; c < r.col + r.w; c++) for (let rr = r.row; rr < r.row + r.h; rr++)
        expect(L.slots.some((s) => s.layer === 0 && c >= s.col && c < s.col + 2 && rr >= s.row && rr < s.row + 2)).toBe(true);
    });
    it('stored certificate replays on the full board', () => {
      expect(replayLegal(idx, { occupied: L.slots.map(() => true), faceAt: L.slots.map(() => 0) }, L.certificate)).toBe(true);
    });
    it('random peel succeeds for 1000 seeds within 1000 tries', () => {
      for (let s = 0; s < 1000; s++) expect(peel(idx, L.slots.map(() => true), mulberry32(s), 1000)).not.toBeNull();
    });
  });

  it('levels reference six distinct clues in order', () => {
    expect(levels.map((l) => l.clueIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  ```

  The paper inset of `0.1w` is applied at render time (T7). The test checks full half-unit cells, which guarantees the inset area sits on tile faces.

  `src/ui/fit.test.ts`:
  - For every layout, `fitTileWidth(...Object.values(boardArea(640, 360)), extentOf(L.slots)) >= 44`.
  - `boardArea(640, 360)` equals `{ w: 552, h: 344 }`.
  - With safe insets `{l: 24, r: 24}`, the width shrinks by 48.

  `src/levels/levels.test.ts`:
  - Face lists have the lengths 9, 12, 18, 24, 34, 34.
  - For each level, `tiles/2 >= faces.length`.
  - Clue lint: for each level, the longest word of `clues[clueIndex]` (split on spaces and after `/`) fits `paperWidthPx(level, w=44) - 16` at 24 px with a 0.6 em average glyph width, where `paperWidthPx = clueRect.w/2*44 - 2*0.1*44`.

  `src/core/recovery.test.ts` (the load-bearing test; spec §Testing):

  ```ts
  import { describe, expect, it } from 'vitest';
  import { levels } from '../levels/levels';
  import { layouts } from './layouts';
  import { freePairs, newGame, reduce, status, type GameState } from './game';
  import { replayLegal } from './deal';
  import { mulberry32, randInt } from './rng';

  describe.each(levels)('level $id recovery', (lv) => {
    it('random legal play + Mischen on every stuck state always reaches a win (200 seeds)', () => {
      for (let seed = 0; seed < 200; seed++) {
        const rng = mulberry32(seed * 7919 + lv.id);
        let s: GameState = newGame(layouts[lv.layoutId], lv.faces, seed);
        let shuffles = 0;
        while (status(s) !== 'won') {
          if (status(s) === 'stuck') {
            s = reduce(s, { type: 'shuffle' });
            expect(replayLegal(s.idx, s.board, s.witness)).toBe(true);
            expect(++shuffles).toBeLessThanOrEqual(100);
            continue;
          }
          const pairs = freePairs(s);
          const [a, b] = pairs[randInt(rng, pairs.length)];
          s = reduce(reduce(s, { type: 'tap', slot: a }), { type: 'tap', slot: b });
        }
      }
    }, 60_000);
  });
  ```
- [ ] **Step 2:** run `npx vitest run src/core src/levels src/ui/fit.test.ts`. Expected: FAIL.
- [ ] **Step 3:** implement `layouts.ts` (masks → `slotsFromMasks`), `levels.ts`, and `fit.ts`. Run `npm run certify`, paste the certificates, and run `npm run certify -- --check`.
- [ ] **Step 4:** run the tests. Expected: PASS. Report the recovery test's runtime.
- [ ] **Step 5: commit** `feat: six layouts with certificates, levels, fit math, recovery test`.

---

### Task 6: Save

**Builder:** `builder-cheap`.

**Files:** `src/progress/save.ts`, `src/progress/save.test.ts`. Pattern: the reference `src/progress/save.ts`.

**Interfaces (produces):**

```ts
export interface SaveV1 { version: 1; won: number[]; welcomeSeen: boolean; tutorialDone: boolean; attempts: Record<number, number> }
export const SAVE_KEY = 'mahjong80.save';
export function freshSave(): SaveV1;              // { version:1, won:[], welcomeSeen:false, tutorialDone:false, attempts:{} }
export function loadSave(storage: Storage): SaveV1;   // any invalid → freshSave()
export function writeSave(storage: Storage, s: SaveV1): void;
export function unlocked(s: SaveV1): number;          // min(6, max(0, ...won) + 1)
export function currentLevel(s: SaveV1): number | null; // lowest level ≤ unlocked not in won; null if all 6 won
export function nextAttempt(s: SaveV1, levelId: number): { save: SaveV1; attempt: number }; // increments attempts[levelId], returns the new value
export function markWon(s: SaveV1, levelId: number): SaveV1; // idempotent
```

- [ ] **Step 1: failing tests**, using an in-memory `Storage` stub:
  - Round trip.
  - Corrupt JSON, a wrong shape (e.g. `won: 'x'`), and `version: 2` each give `freshSave()`.
  - `unlocked` for `won: []` is 1 and for `won: [1,2]` is 3; with all won it stays 6.
  - `currentLevel`: `won: [1,2]` gives 3; all won gives `null`.
  - `nextAttempt` gives 1, then 2, and the second value persists through `writeSave`/`loadSave`.
  - `markWon` is idempotent.
- [ ] **Step 2:** run the tests. Expected: FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: commit** `feat(progress): versioned save with derived unlock and attempt counter`.

---

### Task 7: Tile atlas, board rendering, level screen (static)

**Builder:** `builder-opus` (performance-critical).

**Files:** `src/ui/frame.ts`, `src/ui/art/tileArt.ts`, `src/ui/atlas.ts`, `src/ui/board.ts`, `src/ui/hud.ts`, `src/ui/cluePaper.ts`, `src/ui/levelScreen.ts`, `src/ui/styles.css`, temporary dev route in `src/main.ts` (`?level=N` mounts a level directly; removed in T9), and a bundled font under `src/ui/fonts/`.

**Interfaces:**
- Consumes: T4 `GameState`/`reduce`/`status`/`tilesLeft`; T5 `layouts`, `levels`, `fit.ts`; T2 `faceFile`, `faceCorner`; T1 content.
- Produces:
  ```ts
  // atlas.ts
  export interface Atlas { url: string; cellW: number; cellH: number; cols: number; dpr: number; index: Map<FaceId, number> }
  export function bakeAtlas(faces: readonly FaceId[], w: number, dpr: number): Promise<Atlas>; // caches decoded face images per session
  export function releaseAtlas(a: Atlas): void; // URL.revokeObjectURL
  // board.ts
  export interface BoardView {
    el: HTMLElement;
    render(s: GameState): void;           // sync DOM to state without animation
    tileEl(slot: number): HTMLElement | undefined;
    fit(area: { w: number; h: number }): void;
    onTap(cb: (slot: number) => void): void;
    destroy(): void;
  }
  export function createBoard(layout: Layout, atlas: Atlas, w: number): BoardView;
  // levelScreen.ts
  export interface LevelDeps { save: SaveV1; persist(s: SaveV1): void; onExit(): void; onWon(levelId: number): void }
  export function mountLevel(root: HTMLElement, level: LevelDef, deps: LevelDeps): () => void; // returns unmount
  ```

**Requirements** (spec §Geometry, §Art/Tiles, §Performance rules 1–3, 6, 8; §Clue under the tiles):

1. `frame.ts`: reads the safe-area insets once per resize (pattern: the reference `frame.ts`), and calls `boardArea` + `fitTileWidth`.
2. `tileArt.ts`: `drawTile(ctx, face: HTMLImageElement, corner: string, w: number, dpr: number)` draws one tile cell in canvas 2D, in this order:
   1. The baked soft shadow (offset blur via `ctx.shadowBlur`/`shadowColor`, *baked once*).
   2. The jade edge `#3F7F6A → #2E5E4F`, `0.12w` right and bottom.
   3. The ivory face with a rounded rect radius `0.12w`, a vertical gradient `#FFFDF6 → #F1E6CF`, and a 1 px inner highlight.
   4. The face SVG centred at 78% of the face size.
   5. The corner label in the top-left: bold, `0.34w`, colour `#3A1F2B`, with a 2 px cream halo stroke.

   The face rect must be fully opaque (spec: concealment).
3. `atlas.ts`:
   - Grid-pack the level's faces with 2 px gutters at `dpr = min(devicePixelRatio, 3)`.
   - `canvas.toBlob` → object URL.
   - Decode the face SVGs once per session: `Image` + `decode()`, cached in a module `Map`.
4. `board.ts`:
   - One absolutely positioned `div.tile` per slot, stacked by `z-index = layer*1000 + row*10 + col` (so right/lower tiles draw over the edges of left/upper ones on the same layer).
   - Position via `transform: translate(x,y)`, set in `fit`.
   - Each tile uses `background: url(atlas) -Xpx -Ypx / sizepx`.
   - Removed tiles get `display:none`.
   - One pointer listener on the board container. Hit-testing is done in layout math (the topmost occupied tile whose **face rect** contains the point), not per-tile listeners.
   - A single `div.select-ring` and up to two `div.hint-ring` elements, repositioned (not per-tile classes).
5. `cluePaper.ts`:
   - A cream card positioned at `clueRect` (converted with `slotPx`), inset `0.1w`, with 8 px padding.
   - Text centred in the bundled serif display font (OFL, one weight, ≤ 60 KB WOFF2; e.g. *Playfair Display* Bold or *Lora* Bold subset to Latin-1).
   - Auto-size: the largest integer px ≤ 64 at which `scrollWidth ≤ clientWidth && scrollHeight ≤ clientHeight`, measured after `document.fonts.ready`, never below 24.
   - Insert `<wbr>` after `/`.
   - Rendered under the board (lower z).
6. `hud.ts`: a 72 px right column, top to bottom:
   - ← back (48 px);
   - tiles-left counter (`tilesLeft`);
   - *Tipp*, *Zurück*, *Mischen* (≥ 56 px, icon + label, cream on berry).

   *Zurück* is disabled when history is empty.
7. `levelScreen.ts`:
   - A static background: a gradient per level hue plus bokeh circles plus bunting, drawn once into a canvas or CSS gradients, with no animation.
   - On mount: `nextAttempt` → persist → `newGame(layout, faces, attemptSeed(id, attempt))` → `bakeAtlas` → `createBoard` → render.
   - Taps go through `reduce` and `board.render` (animation arrives in T8).
   - Resize: re-fit, re-bake the atlas, swap it, and release the old one.
   - Portrait: shows the "Bitte das Handy drehen" overlay.
8. `styles.css`: the palette variables; `.tile` has no `will-change`, no `transition`, and no `box-shadow`.

- [ ] **Step 1:** implement per the requirements above. There are no unit tests for the DOM; `fit.ts` is covered by T5.
- [ ] **Step 2: verify** with `npm run dev` and Playwright (or DevTools device emulation) at 640×360 and 800×360, DPR 3, using `?level=1` and `?level=6`:
  - Screenshots are saved to `.superpowers/sdd/<plan>/t7-*.png` (gitignored).
  - Tiles are ≥ 44 px face width (log `w`).
  - The clue is invisible at deal and readable after taps remove the covering tiles.
  - Matching by tapping works.
  - The DevTools Layers panel at rest shows ≤ 12 layers.
- [ ] **Step 3:** `npm test` and `npm run build` pass.
- [ ] **Step 4: commit** `feat(ui): baked tile atlas, board, HUD, clue paper, level screen`.

---

### Task 8: Animations, particles, dialogs, interaction lifecycle

**Builder:** `builder-opus`.

**Files:** `src/ui/anim.ts`, `src/ui/fx.ts`, `src/ui/dialogs.ts`, modifications to `src/ui/board.ts` and `src/ui/levelScreen.ts`.

**Interfaces:**
- Produces:
  ```ts
  // anim.ts
  export class BoardAnimator {
    constructor(board: BoardView, fx: Fx, reducedMotion: boolean);
    play(prev: GameState, next: GameState): void; // animates next.event; finishes any running board animation first (anim.finish())
    finishAll(): void;
    cancelAll(): void;
    get busy(): boolean;
  }
  // fx.ts
  export interface Fx { sparkle(x: number, y: number): void; confetti(ms: number): Promise<void>; fireworks(ms: number): Promise<void>; destroy(): void }
  export function createFx(root: HTMLElement): Fx; // one canvas, pooled ≤ 300 particles, DPR ≤ 2, rAF only while alive, pauses on visibilitychange
  // dialogs.ts
  export function showStuck(root: HTMLElement, opts: { canUndo: boolean; onShuffle(): void; onUndo(): void }): () => void; // returns close
  export function confirmLeave(root: HTMLElement): Promise<boolean>;
  ```

**Requirements** (spec §Interaction and lifecycle, §Game rules/Stuck dialog, §Art/Effects, §Performance 2, 4, 5, 8):

1. **Match:**
   - Both tiles get `will-change` and fly to their midpoint over 280 ms (ease-out), then scale to 0.6 and fade over 120 ms.
   - Sparkle at the midpoint (24 particles, gold/cream).
   - `will-change` is removed on finish.
   - Uses the WeakMap identity pattern from the reference `fx.ts`.
2. **Blocked:** a wiggle keyframe on the tile (`translateX ±3px`, 240 ms).
3. **Undo match:** the tiles reappear with a fade + scale from 0.8 (200 ms).
4. **Shuffle:**
   - In place (`moves === null`): all tiles scale 1 → 0.85 → 1 while the atlas positions swap at the midpoint (300 ms total).
   - Relocate: tiles fly `from → to` over 450 ms.
   - Undo shuffle: the same, reversed.
5. **Serialization:** `levelScreen` calls `animator.play(prev, next)` for every reduce. `play` first calls `finishAll()`, so taps are never dropped or queued.
6. **Stuck dialog:**
   - After each reduce whose status transitions into `'stuck'` (it was not stuck before), and after the animation settles, show the dialog.
   - `stuckHint` shows it too.
   - Buttons: *Mischen* (primary), *Letztes Paar zurück* (hidden if history is empty), and ×.
   - A modal overlay that is dismissible.
7. **Leave:**
   - Back (HUD) and Android Back (`popstate`; push one history state on level mount, like the reference) → if `history.length > 0`, `confirmLeave`: "Level verlassen? Beim nächsten Mal werden die Steine neu gemischt." with *Weiterspielen* / *Verlassen*.
8. **Win:**
   1. On the reduce that yields `'won'`, **immediately** call `markWon` + persist.
   2. Then the last match animation, then `fx.confetti(1500)`.
   3. Then `deps.onWon(levelId)`.
9. **Generation guard:**
   - `mountLevel` holds `let gen = 0`; unmount increments it and calls `cancelAll()`, `fx.destroy()`, and closes dialogs.
   - Every async continuation checks the captured generation.
10. **Reduced motion:** no particles; fades instead of flights.

- [ ] **Step 1:** implement.
- [ ] **Step 2: verify** in a browser at 800×360 via `?level=1` / `?level=6`:
  - A rapid double match then immediate *Zurück* leaves a consistent board (screenshot).
  - Force a stuck state (dev-only `?stuck=1` that deals the level and plays `freePairs[0]` until stuck or 10 tiles remain; removed in T9): the dialog shows; *Mischen* resolves it; *Letztes Paar zurück* works; shuffle → undo re-opens the dialog without trapping.
  - Back mid-level asks for confirmation.
  - The win persists `won` before confetti ends: reload during confetti, then check localStorage.
- [ ] **Step 3: perf spot check** at DevTools 4× CPU throttle: during a match there is no long task > 50 ms (a screenshot of the Performance panel summary goes to the SDD folder).
- [ ] **Step 4:** `npm test`, `npm run build`.
- [ ] **Step 5: commit** `feat(ui): match flights, particles, stuck and leave dialogs, lifecycle guards`.

---

### Task 9: Cake map, welcome and install help, clue letter, closing screen, router, update policy

**Builder:** `builder-sonnet`.

**Files:** `src/ui/art/cake.ts`, `src/ui/map.ts`, `src/ui/welcome.ts`, `src/ui/install.ts`, `src/ui/letter.ts`, `src/ui/closing.ts`, `src/ui/router.ts`, `src/ui/sw.ts`, `src/main.ts` (replaces the T7/T8 dev routes).

**Interfaces:**
- Consumes: T6 save API; T8 `mountLevel` with `LevelDeps`; T8 `createFx`; T1 content.
- Produces:
  ```ts
  // router.ts
  export type Screen = { name: 'welcome' } | { name: 'map'; lit?: number } | { name: 'level'; id: number } | { name: 'letter'; id: number; next: 'map' | 'closing' } | { name: 'closing' };
  export function show(s: Screen): void;      // unmount current, mount next
  // install.ts
  export function isRunningInstalled(): boolean; // matchMedia('(display-mode: fullscreen)') || '(display-mode: standalone)'
  export function onInstallAvailability(cb: (canPrompt: boolean) => void): void; // listens for beforeinstallprompt the whole session
  export function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'>; // one use
  // sw.ts
  export function initSw(isSafeScreen: () => boolean): void; // virtual:pwa-register registerSW; on needRefresh, apply updateSW(true) only when isSafeScreen() (map or welcome), checking on each navigation
  ```

**Requirements** (spec §Screens and flow 1, 2, 4, 5; §Art; §PWA; §Interaction/Updates):

1. **Welcome:**
   - Shown on first launch (`!welcomeSeen`) and from the map's "?".
   - Works in portrait and landscape (no rotate overlay).
   - `welcome.title` + `welcome.message`.
   - If not `isRunningInstalled()`:
     - The *Als App installieren* button, shown while `canPrompt`.
     - Otherwise the manual steps, each with a small drawn illustration (Chrome's ⋮ icon, the menu entry):
       - "Oben rechts auf ⋮ tippen"
       - "„App installieren" (oder „Zum Startbildschirm hinzufügen") wählen"
       - "Danach das Torten-Symbol auf dem Startbildschirm öffnen"
       - "Schon installiert? Dann einfach das Torten-Symbol öffnen."
   - *Los geht's* → set `welcomeSeen`, persist, go to the map.
2. **Cake map (`cake.ts` SVG, drawn once):**
   - A three-tier cake in rose, cream, and berry, with icing drips, sprinkles, a gold "80" topper, and 6 candles across the top tier.
   - Candles: locked = dim wax, no flame. Current (`currentLevel`) = gentle pulse (a CSS transform-scale loop). Won = a lit flame (a flicker loop on transform/opacity), plus a small envelope icon under the candle.
   - Taps: the current or a won candle → the level; an envelope → the letter (`next: 'map'`); the topper (when all 6 are won) → closing; "?" → welcome.
   - After a win, the map opens with `lit: id`: that candle plays a flame pop + `fx.sparkle`, then the next candle starts pulsing.
   - Ambient loops pause on `visibilitychange`.
   - A rotate overlay in portrait.
3. **Letter:**
   - An envelope; the flap opens (rotateX on the flap only, during the animation only), then a card rises.
   - Title "Hinweis N von 6"; clue at ≥ 28 px in the display font.
   - *Weiter* → the map with `lit`, or closing after level 6 (first win), or the map when opened from an envelope.
   - Reduced motion: a fade.
4. **Closing:**
   - `fx.fireworks(4000)` looping gently while the screen is visible.
   - A parchment listing all six clues (numbered).
   - `finale` + `credit` fade in.
   - A small cake with all 6 candles lit; *Zur Torte*.
5. **Router:** `onWon(id)` → `show({ name: 'letter', id, next: id === 6 && firstWin ? 'closing' : 'map' })`. Level unmount runs through the existing unmount function.
6. **Update policy:** `initSw(() => current is map or welcome)`.

- [ ] **Step 1:** implement.
- [ ] **Step 2: verify** in a browser at 640×360, 800×360, and portrait 360×800 (welcome only):
  - First launch → welcome → map → level 1 → win (use the dev console or play) → letter "Hinweis 1 von 6" → map with candle 1 lit and candle 2 pulsing.
  - The envelope reopens clue 1.
  - Level 6 win → letter → closing with all six clues.
  - The topper reopens closing.
  - Screenshots go to the SDD folder.
- [ ] **Step 3:** `npm test`, `npm run build`.
- [ ] **Step 4: commit** `feat(ui): cake map, welcome and install help, letters, closing screen, router`.

---

### Task 10: Tutorial

**Builder:** `builder-sonnet`.

**Files:** `src/ui/tutorial.ts`, a modification to `src/ui/levelScreen.ts`.

**Interface:**
```ts
export function startTutorial(ctx: {
  root: HTMLElement; board: BoardView; getState(): GameState; dispatch(a: Action): void;
  helpers: { hint: HTMLElement; undo: HTMLElement; shuffle: HTMLElement };
  onDone(): void; // sets tutorialDone + persist
}): () => void;   // returns cancel (called on unmount)
```

**Requirements** (spec §Screens and flow 6):
- It runs on level 1 when `!tutorialDone`.
- Each step shows a speech card, bottom-left over the board margin, with ≥ 22 px text and a "Überspringen" link.
- Board taps outside the step's target are swallowed and nudge the target.

Steps:
1. Ring `freePairs[0].a`: "Tippe auf diesen Stein." After it's tapped, ring b: "Jetzt auf den gleichen Stein. Gleiche Bilder passen zusammen."
2. After the match: "Nur freie Steine kann man nehmen: Es liegt kein Stein darauf, und links oder rechts ist Platz." Then ring, in turn with captions (*Weiter* button):
   - An occupied slot with an occupied `above` tile: "Hier liegt ein Stein darauf."
   - An occupied slot with both sides occupied: "Hier ist links und rechts kein Platz." Level 1's middle row under layer 1 and its top-row interior tiles provide both.
3. Point at *Tipp*: "Findest du kein Paar? Tipp zeigt dir einen Stein." Then *Zurück*: "Macht den letzten Zug rückgängig." Then *Mischen*: "Mischt die Steine neu, wenn nichts mehr geht." Then "Viel Spaß!" → `onDone`.

- Skip → `onDone` immediately.
- Unmount mid-tutorial → cancel without saving, so it restarts next time.

- [ ] **Step 1:** implement.
- [ ] **Step 2: verify** in a browser at 640×360: follow all steps without mistakes → `tutorialDone` is true in localStorage. Reload → no tutorial. Clear it → start → skip → done. Leave mid-tutorial → it restarts on re-entry. Screenshots of each step.
- [ ] **Step 3:** `npm test`, `npm run build`.
- [ ] **Step 4: commit** `feat(ui): level-1 guided tutorial`.

---

### Task 11: UI smoke, performance report, deploy

**Builder:** `builder-sonnet` for the smoke suite. The controller runs the perf protocol and coordinates the physical-phone check with Jay.

**Files:** `playwright.config.ts`, `smoke/smoke.spec.ts`, `package.json` script `"smoke": "playwright test"`, `docs/reports/2026-10-perf.md`.

**Requirements** (spec §Testing/UI smoke, §Performance/Budget). The smoke runs `vite preview` of a production build with `VITE_BASE=/` at viewports 640×360 and 800×360, and checks:

1. Welcome renders in portrait (360×800) and in landscape; *Los geht's* → the map.
2. The tutorial completes without mistakes; `tutorialDone` is saved.
3. Level 1 is won by repeatedly pressing *Tipp* twice and tapping the two ringed tiles. The letter shows "Hinweis 1 von 6"; the map shows candle 1 lit and candle 2 pulsing.
4. For each level, via `page.evaluate` on a test hook `window.__mahjong` (exposed only when `import.meta.env.DEV || location.search.includes('smoke')`): mount the level, wait for `document.fonts.ready`, and assert the clue paper font size ≥ 24 px with `scrollWidth <= clientWidth`.
5. Stuck path: through the hook, deal level 3 and play until stuck. The dialog appears; *Mischen* → `status` is `playing`; stuck again → *Letztes Paar zurück* works; shuffle → undo → the dialog reappears and *Letztes Paar zurück* is available.
6. Rapid tap: match, then *Zurück* within 50 ms → the board DOM matches the state (count of visible `.tile` === `tilesLeft`).
7. Back during the last pair's flight on a hook-prepared 2-tile board → no letter opens, and the save has `won` updated (the win happened) or not (the flight had not yet produced the win). Either way the save and the screen are consistent: if `won` includes the level, the map shows it lit.
8. Hook: mark 1–5 won, win level 6 → letter → closing lists 6 clues.
9. Offline: after the service worker is active, `context.setOffline(true)` → reload → the map renders.

Screenshots of every screen → `smoke/screenshots/` (gitignored), attached to the final report.

- [ ] **Step 1:** implement the smoke suite. `npm run smoke` passes.
- [ ] **Step 2 (controller):** run the spec's desktop perf protocol and record the numbers in `docs/reports/2026-10-perf.md`: Chrome version, median of 3, fps, long tasks, level-6 start ms, resting layers.
- [ ] **Step 3 (Jay + controller):**
  1. Pages is already enabled (Jay, 2026-09-30).
  2. Put the family's final texts into `src/content.ts` and set `TEXTS_FINAL = true`.
  3. `npm run release-check` passes.
  4. Push `main` → the CI deploys.
- [ ] **Step 4 (Jay):** on a physical Android phone: open the URL in Chrome → install → launch from the cake icon (fullscreen, landscape) → play level 1 to the win and a few matches on level 6 → airplane mode → relaunch works. Report the phone model and a judgement of smoothness into the perf report.
- [ ] **Step 5:** adversarial merge pass (`adversary`) on the full diff, report at `docs/reviews/2026-10-0X-mahjong-v1-adversary.md`. Fix the P1s, then send Brigitte the link and the family's install message.

---

## Self-review (plan author)

- **Spec coverage:**
  - Geometry and hit targets: T2/T5/T7.
  - Rules, history, hint: T4.
  - Deal, shuffle, relocation, certificate: T3/T5.
  - Levels and clues: T1/T5.
  - Clue paper: T7, fit acceptance in T11.
  - Screens: T7–T10.
  - Lifecycle: T8/T9.
  - Save: T6.
  - Art: T7/T9.
  - Performance rules: T7/T8; budget: T11.
  - PWA/manifest: T1; update policy: T9.
  - Tests: T2–T6/T11.
  - Placeholder guard: T1.
  - Scope cuts: controller's call with Jay.
- **Type names are consistent across tasks:** `Board`, `Pair`, `Layout`, `LayoutIndex`, `GameState`, `GameEvent`, `LevelDef.faces`, `attemptSeed()`, `BoardView`, `Fx`, `BoardAnimator`, `Screen`.
- **Deviations from the spec:**
  - The spec's `LevelDef.faceCount` is realised as an explicit `faces` list (count = length), per the spec's "faces for levels 1–2 favour dots and winds".
  - The family texts ship as drafts; the release gate is `TEXTS_FINAL` + `npm run release-check` (decided by Jay, 2026-09-30), replacing the spec's original `[Beispiel]` CI block.
