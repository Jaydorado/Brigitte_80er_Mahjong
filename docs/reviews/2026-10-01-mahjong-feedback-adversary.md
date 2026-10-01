Verdict: **reject**

# Mahjong feedback design — adversarial review

- **Target:** `docs/superpowers/specs/2026-10-01-mahjong-feedback-design.md`, commit `28f37533df1feccb7b049635220f07b306c2f143` (`28f3753`).
- **Inherited contract:** `docs/superpowers/specs/2026-09-30-brigitte-80-mahjong-design.md`, revision 2.
- **Author:** `@default`, `anthropic/claude-opus-5-5`.
- **Reviewer actually run:** `openai-codex/gpt-6-astra`.
- The working spec's §5 reveal wording changed during this review. I re-read the complete updated file; that text-only change does not resolve or alter these findings. Product code and both specifications were not edited.
- Repository discovery found no root `AGENTS.md` and no `docs/adr/` directory. No additional project rules could be read from those locations.

The overall feature is feasible. Rejection is of this executable specification, not of eight levels or the visual direction: it misses a reproducible level-7/8 crash, specifies an answer matcher that accepts ordinary German sentences naming the wrong destination, and leaves several acceptance requirements impossible or insufficiently defined.

## Findings, ordered by severity

### 1. **Blocker — an unlisted six-entry theme table makes levels 7 and 8 throw before mounting**

**Evidence:** §2 names level definitions, saves, cake, routing and text, but not the six-entry `THEMES` table at `src/ui/levelScreen.ts:43–50`. `backdrop()` indexes it with `levelId - 1` and immediately reads `t.sky` (`:58–61`); `mountLevel()` calls it at `:153`.

**Exercised counterexample:** in the actual Vite app, Chromium 145.0.7632.6, I called the existing `mountLevel()` with the current pyramid/eighty definitions copied with IDs 7/8. Both threw:

```text
id 7: TypeError: Cannot read properties of undefined (reading 'sky')
id 8: TypeError: Cannot read properties of undefined (reading 'sky')
```

The exception occurs before a board is mounted. This is not a claim that future implementation already exists: it proves that the spec's enumerated changes omit a necessary migration.

**Proposed spec change:** explicitly extend/reassign the backdrop themes to all eight level IDs, with no missing-entry fallback, and require actual entry into every level in the smoke. Include the count-assumption inventory below in the implementation scope rather than treating a textual replacement of `six`/`sechs` as sufficient.

**Refutation:** an eight-entry theme assignment and browser smoke that enters levels 7 and 8 without exceptions, paints their boards and verifies their clues.

### 2. **Major — the answer matcher awards the reveal for unrelated German words and other destinations**

**Evidence:** §4 rules 1–5, especially target lines 72–74. I executed a literal normalized-token/standard-Levenshtein interpretation of those rules:

| Input | Relevant normalized distance to `gmunden` | Spec result |
|---|---:|---|
| `gefunden` | 2 | correct |
| `gebunden` | 2 | correct |
| `gesunden` | 2 | correct |
| `Gründen` | `grunden`: 1 | correct |
| `Aus guten Gründen nach Wien` | `grunden`: 1 | correct |
| `Ich habe die Antwort gefunden: Wien` | `gefunden`: 2 | correct |
| `Das Schloss Ortner` | substring `schloss ort` | correct |
| `Schloss Ortenberg` | substring `schloss ort` | correct |
| `Orth an der Donau` | word `orth` | correct |
| `Seeschloss Monrepos` | substring `seeschloss` | correct |

The last two are the specified permissiveness producing genuine geographic false positives, not implementation errors. Only `Gmünd` is explicitly acknowledged as a deliberate wrong-place concession. Rule 5 does not rescue any of these: their accepting tokens already have at least four characters. Indeed, every accepting branch necessarily contains a token of that length, so rule 5 is effectively redundant after rules 3/4.

There are also boundary-dependent negatives: `Traun See` and `Schloss am Ort` both return false. Decide whether these recognizable variants should count rather than leaving tolerance to the builder. The explanatory assertion about München is numerically wrong: standard Levenshtein distance from `munchen` to `gmunden` is **3**, not 2. The required München rejection still works.

**Proposed spec change:** replace unrestricted fuzzy matching on *any* `g` word with explicit normalized destination aliases, including the required `gmunden`, `gemunden`, `gmundn`, and deliberate `gmund`. Match `traunsee` as a whole token and `schloss ort`/`schloss orth`/`seeschloss ort` as bounded token phrases, not substrings. Preserve the required standalone `orth` by recognizing it as the complete answer, not any word in an arbitrary sentence. Explicitly decide the remaining broad aliases/formatting variants. Add the two Wien sentences and `Schloss Ortenberg` as required negatives, or obtain explicit approval that these should reveal the gift. Merely reducing the distance threshold to 1 does not fix `Gründen`.

**Refutation:** a revised, deterministic acceptance table that rejects the unintended examples while retaining the approved positives; or explicit family approval of those false positives.

### 3. **Major — atlas multiplication and an obsolete performance scenario can hide the new worst case**

**Evidence:** §1 lines 13–16 requires baked shading but says only “one body variant per depth.” The current atlas is **one complete body-plus-face bitmap per face**, indexed solely by `FaceId` (`src/ui/atlas.ts:13–24,65–67,167–220`; `src/ui/board.ts:141–144`). A straightforward extension needs face × depth cells, not just five extra body cells.

Using the actual fit/cell-size arithmetic, DPR 3, the `eighty` board at 800×360:

| Packing using the current square-grid policy | Face width | Cells | Bitmap | Pixels | One RGBA bitmap |
|---|---:|---:|---|---:|---:|
| Current constants, one depth | 52 | 34 | 1124×1358 | 1,526,392 | 5.82 MiB |
| Proposed constants, four used depths | 49 | 136 | 2294×2726 | 6,253,444 | 23.85 MiB |
| Proposed constants, five unconditional depths | 49 | 170 | 2676×2953 | 7,902,228 | 30.14 MiB |

Four variants mean **4.10×** the pixels and, under the existing two-pass-per-cell design, 272 rather than 68 body/face passes. Edge extrusion itself changes from 19 to 33 round-rectangle steps per body (`src/ui/art/tileArt.ts:63–71`): repeating bodies naively makes those operations about **6.95×** the old total. This is one bitmap's storage, not a claim about total browser memory; a retained decoded atlas, spare atlas and in-progress canvas can coexist.

The cache key has faces/width/DPR only (`atlas.ts:285`), and the map's pre-bake call has no depth configuration (`map.ts:180`). A variable-depth bake needs a compatible key and identical parameters on pre-bake/acquire; alternatively a fixed variant set must be explicitly layout-independent. The existing idle scheduler paces individual passes, not an arbitrary group of four or five passes.

The baseline report records **581 ms** for an old from-scratch atlas and **65/66 ms** with successful pre-baking (`docs/reports/2026-10-perf.md`, “History of the level start”). It explicitly leaves immediate takeovers and 120 Hz phone pacing exposed. Its six budget rows and the inherited protocol still measure **level 6**, which this amendment changes from 96-tile `eighty` to 80-tile `train`. A literal rerun no longer measures level 8 or necessarily the largest shaded atlas. The map pre-bakes only the current unwon level, not every replayable candle (`map.ts:175–180`).

**Limit:** these are measured geometry and operation counts, **not measured shaded-atlas timings**. No final shaded implementation exists here, so I cannot honestly assert that it exceeds 400 ms. The specification does not provide evidence that it will stay below that limit either.

**Proposed spec change:** define a complete tile cell selected by `(face, depth)`, the bake's supported depth set, cache identity and pre-bake/acquire contract. Reuse body/face work where appropriate without adding live tile layers. Keep pacing around each bounded raster step. Update the protocol to exercise level 8 **and whichever final layout has the most expensive atlas**, with recorded map dwell/pre-bake state, a tap before pre-bake completes, a won-level replay without its atlas cached, and resize/DPR rebakes. Retain the 400 ms budget and actual phone check; do not treat a warmed current-candle run as proof of uncached entry. Record final bitmap size and bake duration alongside the six existing rows.

**Refutation:** final-tree measurements of those paths under the inherited throttle/DPR conditions, plus real-device evidence, meeting the unchanged budget.

### 4. **Major — shrinking the candle gap cannot preserve separate 52 px targets on the current top tier**

**Evidence:** `src/ui/art/cake.ts:71–75,227–234,260–262` defines a top-tier radius of 170, gap 56, and 52-wide hit rectangles. The SVG viewBox is 600×360 (`:442`) and fills the map (`src/ui/screens.css:782–795`). In the actual app at 640×360, I measured SVG scale **1**, with a main candle hit rectangle **52×104 CSS px**.

For eight candles in the current single row:

- Gap 56 places the outside centres at ±196, outside the top tier's ±170.
- Keeping even the centres on that tier requires `gap ≤ 340 / 7 = 48.57`.
- Keeping each 15-wide wax body on the tier requires `gap ≤ (340 − 15) / 7 = 46.43`.
- Separate 52-wide targets require `gap ≥ 52`.

Thus the prescribed gap-only adjustment creates overlapping hit regions; later SVG elements receive taps in the overlap. Measuring only each element's bounding box would misleadingly pass. Keeping gap 56 avoids overlap but leaves the outer candles floating outside their supporting tier.

**Proposed spec change:** authorize and specify widening/rearranging the cake top as part of the eight-candle change. For example, retain a gap of at least 52 and widen the top tier enough for the outer wax bodies (radius at least 189.5 at gap 52, with additional artistic clearance as needed). Require non-overlapping, individually usable candle targets of at least 52 CSS px at 640×360, and separate usable envelope controls. Test edge taps as well as centre taps.

**Refutation:** rendered eight-candle geometry with measured non-overlapping targets, correctly supported outer candles, and successful hit tests at 640×360.

### 5. **Major — “scroll on focus” does not define a keyboard-safe Android layout**

**Evidence:** §4 line 80 asks simultaneously for the question, field and submit button to remain visible, for the field to sit at the top, and for the preceding clue list to scroll underneath. It does not choose the scroll container, focused arrangement or viewport reference. The existing screen is fixed and overflow-hidden (`src/ui/screens.css:6–12`); only the parchment currently scrolls (`:882–897`), with another overflow-hidden side column (`:957–966`). `index.html:5` does not opt into `interactive-widget=resizes-content`.

Chrome's documented Android default resizes the **visual** viewport for the keyboard, not the layout viewport. Fixed elements and viewport-relative sizes can consequently remain behind the keyboard. A `window.resize` handler or one `scrollIntoView()` at focus is not a contract for the visible 640×approximately-180 area. See [Chrome's viewport/keyboard explanation](https://developer.chrome.com/blog/viewport-resize-behavior/), “Changing the default behavior in Chrome 108” and “Opting in to a different behavior.” A desktop `setViewportSize(640,180)` does not reproduce that default.

**Proposed spec change:** specify a visual-viewport-sized closing shell (including `visualViewport` resize/scroll offsets), with the question and answer controls in a persistent visible region and the clues in the remaining independently scrollable region. A measured `interactive-widget=resizes-content` approach is also viable, but choose it explicitly and verify it installed. State where wrong-answer feedback and the third-try reveal control remain reachable. Require an installed Android landscape check with the real keyboard: focus, keyboard animation, typing, Enter/submit, wrong ×3, keyboard dismissal and return to the map. Do not equate desktop viewport emulation with that gate.

**Refutation:** the specified focused layout on a named installed Android device, showing all required controls usable during and after keyboard transitions.

### 6. **Major — putting a WebP in `public/` does not precache it with this configuration**

**Evidence:** §5 line 92 promises offline photo availability. `vite.config.ts:33` currently matches only `**/*.{js,css,html,svg,png,ico,woff2}`; neither WebP nor Markdown is included. `includeAssets` is also an explicit list without the future photo. The current generated `dist-smoke/sw.js` contains a precache and navigation fallback, not a runtime image cache that would repair this omission.

**Failure path:** load/install the game online, go offline before ever opening the celebration, finish the game, and reveal. A merely copied public WebP has not been cached; decoding the image cannot succeed. An offline smoke that only reloads the cake map misses this.

**Size check:** the existing local `dist-smoke` manifest has 48 unique precache URLs totalling **860,457 bytes**. Adding a 200,000-byte photo alone would make **1,060,457 bytes**, leaving 939,543 bytes below a decimal 2 MB cap. This is evidence of present headroom, **not certification of the future production build**.

**Proposed spec change:** explicitly add WebP to the Workbox glob or explicitly include the chosen photo. Serve it with the Vite base path so the GitHub Pages subdirectory works. Keep necessary attribution available offline in the rendered app; explicitly include any separately linked local credit document if it is needed to satisfy the notice. Inspect the final generated precache and sum actual assets against 2 MB. Add an offline **first celebration view** smoke, after SW activation/reload but before the photo has ever been requested, exercising both correct-answer and reveal-button entry.

**Refutation:** the deployed-base production SW contains the selected photo, and first reveal offline produces a decoded, visible image and credit.

### 7. **Major — the photo-credit requirement omits licence-version, modification and ShareAlike handling**

**Evidence:** §5 lines 89–93 permits CC BY-SA and requires author, “licence,” source URL and Wikimedia Commons. It does not require the exact licence version/link, change notice, preservation of supplied notices, or define what receives a ShareAlike licence if the photo is adapted.

For a concrete permitted choice, [CC BY-SA 4.0 legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en) §3(a)(1) requires attribution information, a licence text/URI/link and indication of modifications; §3(b) governs the licence on shared adapted material. §2(a)(4) expressly says necessary technical modifications do **not by themselves** produce Adapted Material. Do not mistakenly claim that simply embedding a photograph in an `<img>` forces the entire TypeScript app under BY-SA, or that WebP conversion alone necessarily does so. Conversely, “Wikimedia Commons” plus an unlinked “CC BY-SA” is not a complete asset-specific licence record.

**Proposed spec change:** pin a particular Commons file and exact licence/version before implementation completes; record its source file page, creator/required attribution, licence URL and supplied notices. Display a readable credit with source/licence links and a modification notice such as “verkleinert, als WebP gespeichert” (plus crop/other edits if any). State that the photo remains separately licensed; if adaptation is made, license that adaptation as the selected licence requires. CC0 or a verified CC BY asset is a simpler permitted alternative, not a reason to invent licence obligations for the app. Avoid unexplained “small type” conflicting with the inherited readable-text floor.

**Refutation:** selected-asset metadata and the actual shipped credit demonstrate compliance with that exact licence, including offline-readable attribution.

### 8. **Major — level 1 cannot display the required three layers without an out-of-scope layout change**

**Evidence:** §1 line 21 demands screenshots of levels 1, 5 and 8 that “show three distinct layers.” Level 1 stays `rect`, whose masks have exactly two layers (`src/core/layouts.ts:5–8`; `src/core/layouts.test.ts:8`). The new geometry passes fit, so the reshape fallback does not authorize a third layer. Neither edge thickness nor shading creates another slot layer.

**Proposed spec change:** require two distinguishable layers for level 1, three for level 5 and four for level 8, or deliberately select a three-layer layout for the three-layer screenshot requirement. Also replace “top occupied layer” at line 13 with **“highest layer in the initial layout”** to match line 16. Specify the immutable slot formula `depth = extentOf(layout.slots).maxLayer - slot.layer` and `shade = [0, .10, .18, .25, .30][depth]`. Say whether shading affects only ivory body pixels or also glyph art/numerals/edge; the current separate body/face passes make both readings implementable with visibly different results. Removal, undo, shuffle and relocation must select shade by the destination slot, never by remaining occupancy.

**Refutation:** a revised, satisfiable screenshot criterion and one precise pixel/shade policy.

### 9. **Minor — save compatibility is structurally sound, but progress meaning and `solved` validation are unspecified**

**Evidence:** raising `LEVEL_COUNT` in `src/progress/save.ts:20` correctly widens the existing length/range/duplicate checks (`:28–40`). Existing valid saves remain structurally valid. However, old levels 3–6 are flower/balloons/pyramid/eighty (`src/levels/levels.ts:18–21`); new levels 3–6 are heart/flower/balloons/train. Preserving `won: [1,2,3,4,5,6]` therefore marks the never-played heart/train won, unlocks 7, and makes the player replay pyramid/eighty. “As before” does not say whether that reassignment is intentional.

`isSave` currently ignores extra properties, so merely adding `solved?: true` to the type does not reject JSON containing `solved: "false"`, `solved: false` or `solved: {}`. A builder using truthiness could silently bypass the answer screen for a malformed save; another might reject the entire save. The spec's intended literal-true contract needs runtime wording.

**Proposed spec change:** state explicitly that old numeric win/attempt IDs are preserved without content migration, with the resulting skipped/replayed layouts accepted, if that is the intended policy. Do not add a migration framework just to avoid stating the choice. Define `solved` as absent or exactly `true`; other present values follow the existing schema-invalid-save policy. Specify that successful answer/reveal persists it before starting asynchronous celebration, and verify subsequent level/flag saves retain it.

**Refutation:** explicit compatibility examples and schema cases, including an all-six old save and malformed `solved` values.

### 10. **Minor — “existing closing burst, then fade” leaves two different celebration lifecycles valid**

**Evidence:** §5 calls for fireworks after an accepted answer and then a decoded-photo fade. The existing `mountClosing()` instead starts a repeating four-second show on entry and runs it while the screen remains visible (`src/ui/closing.ts:12–13,32–72,129–145`). The inherited base spec also calls for fireworks on the closing screen. The amendment does not say whether the old loop continues during answer entry, is restarted on success, or is replaced by a one-shot celebration. Nor does “Back” distinguish the visible button from Android system Back. Existing routing has no celebration screen variant (`src/ui/router.ts:11–17`).

**Proposed spec change:** define the state sequence explicitly: unsolved clue/question view; accepted-or-revealed transition with `solved` persisted; one bounded celebration burst and image decode; photo/message view; map on the specified Back actions. State whether ambient closing fireworks remain before the answer, and ensure unmount cancels/invalidates the burst, decode and fade callbacks. Define the reduced-motion equivalent and what later `Das Geheimnis` visits replay. No new routing framework is needed.

**Refutation:** an unambiguous transition contract and focused smoke for leaving during decode/burst, re-entering solved, and the chosen Back behavior.

## Quantitative attacks that did not land

### Tile fit: 0.14 / 0.22 is viable on every existing layout

I ran the real `extentOf`, `boardArea` and `fitTileWidth` with an in-memory constants change, restoring the original constants afterwards. At 640×360 after safe-area insets, board area is **552×344**. With `extra = maxLayer × .14 + .22 + .06`:

| Layout | Extent across × down; max layer | Current width | Proposed width |
|---|---|---:|---:|
| rect | 9×3; 1 | 59 | **58** |
| gift | 9×5; 1 | 53 | **51** |
| flower | 11×5; 2 | 48 | **47** |
| balloons | 11×5; 2 | 48 | **47** |
| pyramid | 11×5; 3 | 48 | **47** |
| eighty | 9×5; 3 | 52 | **49** |

No existing layout needs the lower-shift or mask-reshape fallback. A new layout whose **all-slot** extent stays within 11×5 also fits at **47 px** with either three or four layers. The inherited authoring test only bounds layer 0 (`src/core/layouts.test.ts:22–28`); upper-layer protrusions still need the actual all-slot fit test. Heart/train masks do not yet exist, so their final extents and certificates cannot be asserted.

### Face counts do not prevent either new board from being certified

`range` is inclusive (`src/levels/levels.ts:13`). Heart uses **21 faces** and **28 pairs**: fourteen faces receive one pair, seven receive two. Train uses **34 faces** and **40 pairs**: twenty-eight faces receive one pair, six receive two. Running `assignFaces()` on removal-pair fixtures produced exactly those distributions. `src/core/deal.ts:47–65` cycles through a shuffled face list, then assigns both slots of each witness pair the same face. Divisibility by face count is not required. Certification is a property of the mask/free-slot removal order, not of every face receiving exactly four tiles. All six existing stored certificates also replayed successfully in the scoped probe; this does not certify the absent new masks.

### Clue 5 fits the existing balloons paper without reshaping

In Chromium 145.0.7632.6 at 640×360, I ran the real `createCluePaper()` using the specified clue and the proposed **47 px** tile width. The existing balloons rect is `w=22, h=4` half units (`src/core/layouts.ts:41`). The actual paper measured approximately **507.59×108.09 px**; the fitter chose **38 px** text, with 490 px available text width and 89 px text height. Explicitly setting 24 px yielded `scrollWidth = clientWidth = 490`, `scrollHeight = 29`, and 90 px inner height: no overflow. The exact supplied string has **40**, not 41, characters; that count error does not impair fitting.

Keep the inherited browser acceptance: `levels.test.ts:19–23` only lints the longest word at an estimated glyph width, not multi-line height or real font shaping. There is no evidence here for widening the clue rect or changing the balloons mask.

## Six-level assumption inventory

Necessary updates, including ones not found by searching for the numeral `6` alone:

- **Missed runtime blocker:** `src/ui/levelScreen.ts:43–61`, six backdrop themes indexed by new IDs (finding 1).
- **Already named in the amendment:** `src/levels/levels.ts:6,9,15–22` (unions/data), `src/progress/save.ts:20`, `src/ui/art/cake.ts:227`, `src/ui/router.ts:98`, UI labels in `src/ui/closing.ts:8`, `src/ui/art/cake.ts:13`, and `src/content.ts:2–10,19`.
- **Missed visual choreography:** `src/ui/screens.css:938–955` only gives the first six closing clues staggered fade rules. Clues 7/8 otherwise appear immediately while earlier clues fade. Extend deliberately or remove the per-position choreography rather than leaving a half-migrated presentation.
- **Test expectations/fixtures:** `src/content.test.ts:5–7`; `src/core/layouts.test.ts:8,43–44`; `src/levels/levels.test.ts:13`; `src/progress/save.test.ts:90–105`; `smoke/smoke.spec.ts:38,218,237,379,391–417,436`. Preserve behavioral tests; do not mechanically re-pin incidental string/count-only tests against project policy.
- **Performance scenario:** the inherited Budget, prior plan T11, and `docs/reports/2026-10-perf.md` all identify old level 6 as the largest board. The new protocol needs explicit level/layout identities (finding 3).
- **Comments:** `src/ui/letter.ts:11`; `src/ui/art/cake.ts:219,221,472`; `src/progress/save.ts:19`.
- **Already dynamic, not missing hard-coded sixes:** letter title uses `clues.length` (`src/ui/letter.ts:59`), map topper uses `art.candles.length` (`src/ui/map.ts:117,201`), the mini cake shares `CANDLE_COUNT`, and the closing list iterates `clues`. Do not add redundant constants to repair these.
- Unrelated sixes in SVG coordinates, certificates, animation timings and the clue fitter's “about six layouts” comment are not level-count assumptions.

## Load-bearing attack and evidence needed to overturn the verdict

**Load-bearing finding: after the spec's enumerated six-to-eight changes, the unlisted six-entry backdrop-theme table still makes level 7 and level 8 throw synchronously, preventing the required eight-level game from being finished.**

This was exercised through the actual `mountLevel()` in Chromium, not inferred from a grep. Refute it with the missing migration and real browser entry into both new IDs. That alone does not clear the independently demonstrated matcher failures, candle geometry conflict, impossible layer-1 acceptance, or unverified atlas/keyboard/offline contracts; those need the concrete amendments/evidence above.

## Verification record and limits

- Started the actual app using Vite on a dedicated local port; no build, formatter, linter or project-wide test suite was run.
- Ran a throwaway scoped Node/tsx/Playwright probe, entirely under `docs/reviews/`, then removed it. It used the actual geometry, face assignment, certificate replay, clue paper, map SVG and level mount functions. Chromium version: **145.0.7632.6**. Numerical/surface outputs and exception text are recorded above.
- Executed the specification's answer algorithm in the probe; this is a counterexample to the proposed algorithm, not a test of nonexistent `src/core/answer.ts` implementation.
- Summed unique URLs in the existing local `dist-smoke/sw.js` precache against their on-disk sizes; no new production artifact was generated.
- Read the official Chrome keyboard-viewport documentation and CC BY-SA 4.0 legal code linked above. No selected Commons photo exists yet to audit against its particular licence.
- No claim of shaded-atlas timing, actual Android keyboard success, new-layout certification, or final offline-photo success is made. Those require implementation/device evidence not present in this design-review assignment.

## Advocate rebuttal (@default, Opus 5.5, 2026-10-01)

All ten findings accepted; folded into spec rev 2 (same path).

1. Accept: THEMES gets eight entries, no fallback; full inventory in scope; smoke enters every level.
2. Accept: Gmunden fuzzy match restricted to tokens starting with 'gm' plus alias 'gemunden'; traunsee/phrases are whole-token sequences; 'orth' only as the entire answer. All listed counterexamples are required negatives. Traun See and Schloss am Ort accepted.
3. Accept, changed design: no face x depth cells. Tiles keep one element with two background layers from one atlas (face cell over a per-depth body cell); atlas grows by 1-4 body cells. Cache key gains depth count; pre-bake/acquire parameters identical. Perf protocol moves to level 8 plus largest atlas, with tap-before-prebake, uncached replay and resize paths.
4. Accept: top tier radius >= 200, gap >= 52, non-overlapping hit rects, centre and edge tap smoke.
5. Accept: interactive-widget=resizes-content plus a visualViewport fallback; answer region fixed at top of a 100dvh flex column, clues scroll; real-device gate on Jay's phone.
6. Accept: webp in globPatterns, BASE_URL path, precache total checked, offline first-reveal smoke.
7. Accept: CC0 > CC BY > CC BY-SA preference; pinned file record; readable in-app credit with licence link and modification notice.
8. Accept: screenshots need 2/3/4 layers on levels 1/5/8; depth formula and body-only shading specified; shade follows the slot.
9. Accept: no content migration (testers only), solved absent or exactly true, persisted before the celebration.
10. Accept: explicit state sequence; ambient fireworks before the answer, one bounded burst after, photo view inside closing.ts; unmount cancels.

Jay authorised implementation after these changes (chat, 2026-10-01).
