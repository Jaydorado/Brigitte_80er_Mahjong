# Mahjong feedback round 1 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each task goes to the builder named in its header. Steps use checkbox syntax.

**Goal:** layer readability, eight levels with the family's eight clues, a welcome headline without the name, a riddle answer screen, and the Seeschloss Ort reveal.

**Architecture:** extend the existing modules in place. There is one new pure module (`src/core/answer.ts`); the photo view is a state inside `closing.ts`; tiles keep one DOM element each, now with two atlas background layers.

**Tech stack:** Vite, TypeScript, vitest, Playwright smoke (`npm run smoke`), vite-plugin-pwa/Workbox.

**Spec:** `docs/superpowers/specs/2026-10-01-mahjong-feedback-design.md` (rev 2). The spec is the contract. It gives exact strings, numbers, test cases and state sequences, and this plan does not repeat them. Every builder reads its task's spec sections in full before starting.

**Deviation from the writing-plans template (recorded):** steps carry no code blocks. The spec pins behaviour, strings and test tables exactly, and every task goes to `builder-opus`/`builder-sonnet` working test-first. Cost if wrong: a builder misreads a spec line, and the reviewer catches it.

## Global constraints

- Base-spec Performance rules: no live effects beyond those listed, no CSS `filter`, no added compositor layers at rest (≤ 12), and the 400 ms level start.
- Tile width ≥ 44 px at 640×360, on the all-slot extent, for every layout.
- Candle hit targets ≥ 52 px wide and non-overlapping at 640×360.
- UI strings are German and verbatim from the spec. Family texts live only in `src/content.ts`; fixed UI labels live in their UI modules (ledger R14).
- `TEXTS_FINAL` stays `false`. The release step belongs to Jay.
- Assets resolve through `import.meta.env.BASE_URL` (GitHub Pages subpath).
- Test-first for every behaviour. Do not re-pin incidental count or string tests (spec §2 inventory).
- Commit only your own paths (`git add <paths>`). `main` is shared with parallel builders.

## Dependency order and shared files

```
F1 answer ─────────────────────────────┐
F2a core data ── F2b 8-level UI ── F3 layers ── F5 smoke + perf
                         └──────── F4 closing/answer/photo ──┘
```

- F1 ∥ F2a: disjoint files.
- F2b needs F2a's level data.
- F3 shares `levelScreen.ts` with F2b and `map.ts`/`board.ts` with nobody else, so it starts after F2b's commit.
- F4 shares `closing.ts`/`screens.css` with F2b, so it starts after F2b. It is disjoint from F3 (F4 must not touch `levelScreen.ts`, `atlas.ts`, `board.ts`, `fit.ts` or `tileArt.ts`), so F3 ∥ F4.
- F5 runs after F3 and F4 land.

---

### Task F1: answer matcher (builder-sonnet)

**Spec:** §4 "Matching" and its test table.
**Files:** create `src/core/answer.ts` and `src/core/answer.test.ts`.
**Produces:** `export function isCorrectAnswer(input: string): boolean`. No other exports are needed. Levenshtein is a private helper.

- [ ] Write `answer.test.ts` with every Correct and Wrong case from spec §4 as table-driven `it.each`.
- [ ] Run `npx vitest run src/core/answer.test.ts`. It fails: the module is missing.
- [ ] Implement normalisation and rules 1–6 exactly as written.
- [ ] Run again; everything passes.
- [ ] Commit: `feat(core): riddle answer matcher`.

### Task F2a: eight-level core data (builder-opus)

**Spec:** §2 (table, new layouts, face sets, saves), §3, and §5 "Text".
**Files:**
- `src/core/layouts.ts`: `heart` and `train` masks, clueRects, certificates via `npm run certify`.
- `src/core/layout.ts`: the `LayoutId` union.
- `src/core/layouts.test.ts`.
- `src/levels/levels.ts` and `levels.test.ts`.
- `src/content.ts`: the eight clues; `welcome.title`; "sechs" → "acht"; comments "Level 1 bis 8"; new `export const reveal = { title, message }`.
- `src/content.test.ts`.
- `src/progress/save.ts`: `LEVEL_COUNT = 8`; `solved?: true` validated as absent or exactly `true`; every write keeps `solved`; new `markSolved(save): SaveV1`.
- `src/progress/save.test.ts`.

**Produces:**
- `LevelDef.id: 1|…|8` and `clueIndex: 0|…|7`.
- `layouts.heart` and `layouts.train`.
- `reveal`.
- `SaveV1.solved?: true` and `markSolved`.

Steps:
- [ ] Write failing tests:
  - layouts: counts 56/80, layer limits 3/4, bbox, clueRect coverage, certificate replay, all-slot fit ≥ 44 at 640×360;
  - levels: 8 rows, each clue index used once;
  - save cases from spec §Testing "Save".
- [ ] Run `npx vitest run src/core/layouts.test.ts src/levels src/progress src/content.test.ts`. The new tests fail.
- [ ] Implement. Generate certificates with `npm run certify`, then run `npm run certify -- --check` (ok ×8).
- [ ] Run the same vitest command; everything passes. Also run `npx tsc --noEmit`. UI type errors from the widened unions belong to F2b: list them in the report and leave the UI files untouched.
- [ ] Commit: `feat(core): eight levels, heart and train layouts, solved flag`.

### Task F2b: eight-level UI (builder-sonnet)

**Spec:** §2 "The full six-to-eight inventory" and "Cake map, 8 candles".
**Files:**
- `src/ui/levelScreen.ts`: only the `THEMES` table, 8 entries, two new themes in the existing style, no fallback.
- `src/ui/router.ts`: closing after level 8.
- `src/ui/closing.ts`: only the heading label.
- `src/ui/art/cake.ts`: 8 candles, top tier radius ≥ 200, gap ≥ 52, non-overlapping hits, labels, comments.
- `src/ui/screens.css`: the closing clue stagger via `--i`.
- `src/ui/letter.ts`: comment only.

**Consumes:** F2a's `levels` and `clues`.

Steps:
- [ ] Failing check first: a throwaway Playwright script, in `.superpowers/sdd/<plan>/`, that mounts levels 7 and 8 and taps the centre and edges of all 8 candles at 640×360. It fails on the current code.
- [ ] Implement.
- [ ] Run `npx tsc --noEmit` (clean) and `npm test`. The script passes; take screenshots of the map at 640×360 and 800×360.
- [ ] Commit: `feat(ui): eight candles, eight themes, closing after level 8`.

### Task F3: layer readability (builder-opus)

**Spec:** §1 in full.
**Files:**
- `src/ui/fit.ts`: constants; a `depthOf(slot, extent)` and `SHADES` export.
- `src/ui/fit.test.ts`.
- `src/ui/art/tileArt.ts`: the body pass takes a shade; the face pass draws the glyph on transparent.
- `src/ui/atlas.ts`: face cells plus per-depth body cells; the cache key gains the depth count; scheduler steps of one cell.
- `src/ui/atlas.test.ts`.
- `src/ui/board.ts`: one element per tile, two background layers, the body chosen by the slot's depth.
- `src/ui/map.ts`: pre-bake parameters identical to acquire.
- `src/ui/levelScreen.ts`: acquire parameters only.

**Consumes:** the F2a layouts and the F2b `levelScreen.ts` state.
**Produces:** `depthOf(slot: Slot, e: Extent): number` and `SHADES: readonly number[]`.

Steps:
- [ ] Failing tests:
  - `depthOf` formula;
  - shade selected by destination slot across remove/undo/shuffle/relocation (board-level unit test);
  - atlas cell count = faces + depths;
  - cache key differs by depth count;
  - pre-bake key equals acquire key;
  - fit ≥ 44 on all 8 layouts with the new constants.
- [ ] Implement.
- [ ] Run `npx tsc --noEmit` and `npm test`.
- [ ] Measure: resting layers ≤ 12.
- [ ] Take screenshots of levels 1/5/8 at 640×360 and 800×360, showing 2/3/4 distinguishable layers.
- [ ] Do a quick perf check with `perf/perf.mjs` (SDD folder) on level 8 at 4× CPU and report it.
- [ ] Commit: `feat(ui): thicker layer offset and per-depth shading`.

### Task F4: answer screen, celebration, photo (builder-opus)

**Spec:** §4 "Wrong answer", "Keyboard layout" and "Save"; §5 in full.
**Files:**
- `src/ui/closing.ts`: the answer region, the state sequence, the photo view, unmount cancellation.
- `src/ui/closing.test.ts`.
- `src/ui/screens.css`: the closing flex column and the answer region.
- `index.html`: viewport `interactive-widget=resizes-content`.
- `vite.config.ts`: `webp` in `globPatterns`.
- `public/seeschloss-ort.webp`.
- `public/photo-credit.md`.

**Consumes:** `isCorrectAnswer` (F1), `reveal` and `markSolved` (F2a), the closing heading (F2b).

Steps:
- [ ] Pick and pin the Commons photo (spec §5, preference CC0 → BY → BY-SA). Record it in `photo-credit.md`. Resize to 1280 px, WebP q ≤ 80, ≤ 200 KB, using a throwaway script outside `src/`.
- [ ] Failing tests in `closing.test.ts` (mocked fx, image decode):
  - wrong ×3 shows the reveal button;
  - correct persists `solved` before the burst starts;
  - the photo view waits for decode and 1 s;
  - reduced motion means no burst;
  - unmount mid-burst/decode means no callbacks;
  - a solved save shows "Das Geheimnis".
- [ ] Implement.
- [ ] Run `npx tsc --noEmit` and `npm test`.
- [ ] Run `npm run build`: `dist/sw.js` lists `seeschloss-ort.webp` and the precache total is ≤ 2 MB (sum it).
- [ ] Take Playwright screenshots at 640×360 and at 640×180 with the answer field focused.
- [ ] Commit: `feat(ui): riddle answer, celebration and Seeschloss Ort reveal`.

### Task F5: smoke and perf (builder-sonnet for the smoke and harness changes; the controller measures)

**Spec:** §Testing "Smoke" and "Perf".
**Files:** `smoke/smoke.spec.ts`, `smoke/helpers.ts`, `src/ui/testHook.ts` (if a seam is needed), and the SDD-folder `perf/perf.mjs` (level 8 plus the largest atlas, with the four paths).

Steps:
- [ ] Extend the smoke with every item in spec §Testing "Smoke".
- [ ] Run `npm run smoke` three times; it must be green every time.
- [ ] Update the perf harness scenario and paths.
- [ ] Controller runs the protocol (3 runs, headless and headed) on the final tree and updates `docs/reports/2026-10-perf.md`.
- [ ] Commit: `test(smoke): eight levels, answer flow, offline reveal`. The perf report gets its own commit.

## Out of scope for the loop

- Setting `TEXTS_FINAL = true`.
- The physical phone check (Jay).
- The adversarial merge pass (held for Jay, as in the first round).
