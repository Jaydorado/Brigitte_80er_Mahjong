# Brigittes Mahjong — Design

Date: 2026-09-30. Revision 2 (after the adversarial review `docs/reviews/2026-09-30-mahjong-design-adversary.md` and Jay's switch to six text clues). Status:
- Sections 1–2 were approved by Jay in chat.
- Sections 3–5 were delegated to the author ("give it your best shot"), with performance and visual polish named as the top priorities.
- Revision 2 awaits Jay's approval.

Author: `@default` (Claude Opus 5.5).

## Goal

A mahjong solitaire game in the style of Vita Mahjong, made as an 80th-birthday gift for Brigitte (Anna's mother). She plays 6 levels, and each level uncovers one of six text clues about her present, a family trip to Gmunden. The clues let her guess; the game does not name the present in v1. A 7th level that reveals a photo may follow later (see Out of v1). The game reaches her as a GitHub Pages link that she installs herself as a fullscreen app on her Android phone, with nobody next to her.

It must look polished and run smoothly on an ordinary Android phone. It is a gift and should impress on first launch.

## Hard constraints

- **Target:** Android Chrome (current), phone, **landscape**, viewport ≥ 640×360 CSS px after safe-area insets. The welcome and install help also work in portrait. The map and level screens show a "Bitte das Handy drehen" overlay in portrait.
- **German only.** All player-facing text is German.
- **Deadline:** playable and deployed by the weekend of 2026-10-03/04.
- **No fail state:** no timer, no score, no lives, no lose screen. Hint, Undo, and Shuffle are free and unlimited.
- **The game can always be finished.** Every deal is solvable by construction, and *Mischen* always restores a solvable board, including after bad moves (see Shuffle).
- **Offline after first load.** Progress persists on the device.
- **Tile readability:** the tile **face** (excluding edge and shadow) is ≥ 44 CSS px wide at 640×360.
- **Performance budget** (see Performance) is an acceptance criterion, not a nice-to-have.
- Spoiler risk from a public repo is accepted by Jay. Clue texts ship in plain form.

## Scope

In v1: 6 levels; the clue under the tiles plus a clue letter after each win; a closing screen after level 6 with all six clues; the cake map; welcome and install help; a guided tutorial in level 1; Hint / Undo / Shuffle; PWA offline; GitHub Pages deploy.

Out of v1 (maybe after family feedback):
- A 7th easy level with a photo of Gmunden under the tiles and a photo reveal. Designed for: `reveal` is a union type, and the cake can get a 7th candle.
- Sound/music, more levels, flower/season tiles, statistics, themes, iOS.

## Content

All in `src/content.ts`, editable on GitHub in the browser without touching logic.

**Clues** (from Jay, verbatim; the family may polish spelling and capitalisation there):

|Level|Clue|
|---|---|
|1|Familie|
|2|9h 31 selzthal umsteigen|
|3|Grün/weiß|
|4|Klaus wildbolz/Albert fortell|
|5|Bezirkschulinspektor|
|6|12.2. 1989|

The longest is 31 characters. "Bezirkschulinspektor" is one 20-character word and sets the minimum paper width.

**Family texts still needed.** Until the family supplies them, they ship as `[Beispiel] …` placeholders:
- `welcome`: greeting and a personal message.
- `finale`: the closing line, e.g. "Errätst du, was wir vorhaben?"
- `credit`: sign-off line.

A test fails whenever any content string starts with `[Beispiel]`. CI runs it on every push to `main`, so a build with placeholder text cannot deploy.

## Stack

Same as Solitaire Dreams (`../Anna's Disney Solitaire clone`): TypeScript + Vite, DOM plus SVG, one `<canvas>` for effects, `vite-plugin-pwa`, Vitest, and GitHub Actions deploying to GitHub Pages. No UI framework, no game engine. The CI workflow, PWA config, save pattern, and safe-area-aware board-fit approach (`src/ui/frame.ts`) are reused.

- Repo: `https://github.com/Jaydorado/Brigitte_80er_Mahjong`.
- Live URL: `https://jaydorado.github.io/Brigitte_80er_Mahjong/`. CI sets `VITE_BASE=/Brigitte_80er_Mahjong/`.
- Jay's one-time step: Settings → Pages → Source: GitHub Actions.

## Architecture

```
src/
  content.ts          clues + family texts (see Content)
  core/               pure TS: no DOM, no timers, no Math.random
    tiles.ts          FaceId (34 faces: dots 1–9, bamboo 1–9, characters 1–9, 4 winds, 3 dragons)
    rng.ts            seeded PRNG (mulberry32) + Fisher–Yates
    layout.ts         Slot {col, row, layer}; Layout {slots, clueRect, certificate}; isFree(slot, occupied)
    layouts.ts        the 6 board shapes as data (generated certificate included)
    deal.ts           peel(), deal(), shuffleInPlace(), relocate()
    game.ts           GameState; reduce(state, action) → state; freePairs(); status
    solver.ts         exhaustive DFS for small test fixtures only
  levels/levels.ts    6 LevelDefs
  progress/save.ts    versioned localStorage
  ui/
    frame.ts          safe-area-aware board area + tile fit
    atlas.ts          bakes tile images into one sprite canvas (see Performance)
    board.ts          tile elements, selection/hint overlay, board animations
    hud.ts            back, tiles left, Tipp / Zurück / Mischen
    map.ts            cake with 6 candles
    cluePaper.ts      clue text under the board
    dialogs.ts        stuck dialog, leave-level confirm, clue letter
    closing.ts        closing screen after level 6
    tutorial.ts       level-1 guidance
    welcome.ts        greeting + install help
    fx.ts             particle canvas: sparkles, confetti, fireworks
    art/              SVG/CSS art: tile body, cake, backgrounds, envelope
  vendor/tiles/       FluffyStuff riichi-mahjong-tiles SVGs (CC0, verified), the 34 used faces
  main.ts             screen router
tools/certify.ts      generates and checks each layout's certificate
```

`core/` never imports from `ui/`. UI dispatches actions, the reducer returns new state, and the UI animates the difference.

## Geometry

- **Slots:** a slot has `col` and `row` in half-tile units and a `layer` (0 = bottom). A tile occupies a 2×2 half-unit footprint. No two slots on the same layer overlap.
- **Tile proportions:**
  - The face is 4:5 (width:height). "Tile width" always means face width `w`.
  - Each layer above 0 is drawn shifted up and left by `0.06w` per layer.
  - The side edge (right and bottom) is `0.12w` deep.
  - The baked shadow extends `0.06w` beyond the edge.
- **Board fit:** the board area is the viewport minus safe-area insets, minus the 72 px HUD column, minus 8 px margins. `w` is the largest value at which the **full rendered extent** fits: every tile's face, edge, shadow, and layer offsets. `w` is floored to a whole CSS px.
- **Authoring guide:** the layer-0 bounding box of every layout is ≤ **11 columns × 5 rows**. At 640×360 that gives w ≈ 48 px:
  - width `552 / (11 + 0.18 + 0.18)` = 48.6
  - height `344 / (5 × 1.25 + 0.18 + 0.18)` = 52.0

  The binding acceptance is the fit test: w ≥ 44 at 640×360 for every layout.
- **Hit targets:** a tile's hit target is its face rectangle, and tiles are exempt from the 48 px touch-target floor. Every other control is ≥ 48 px, and the helper buttons are ≥ 56 px. This exception is flagged for Jay: adjacent 44 px tiles cannot each have a non-overlapping 48 px target.

## Game rules

- **Free tile.** A tile is free iff:
  - no tile on a higher layer overlaps its footprint; and
  - on its own layer, its left side or its right side has no adjacent tile. A tile is adjacent on a side when it sits exactly 2 half-units away horizontally with overlapping vertical footprints.
- **Select and match.** Tap a free tile to select it (gold glow). Tap a free tile with the same `FaceId` to remove both.
  - Tapping the selected tile again deselects it.
  - Tapping a free tile with a different face moves the selection.
  - Tapping a blocked tile does not select it; it wiggles.

  Selecting uses no history entry.
- **Win.** The board is empty. The win is checked before stuck.
- **Stuck.** Tiles remain and no free matching pair exists.

**History and Undo.** History is a stack of entries, one per successful pair removal or shuffle:
- `match`: the two slots and their faces.
- `shuffle`: the full slot→face map and occupied set from before the shuffle.

*Zurück* pops one entry and restores exactly that state. It is unlimited, back to the level start. Every board-changing action clears the selection and hint. The shuffle counter only ever increases: undoing a shuffle and shuffling again gives a new arrangement.

**Hint.** Pulses one free matching pair. If none exists, it opens the stuck dialog.

**Stuck dialog.** It opens once each time the board *becomes* stuck, after running animations settle. Title: "Keine passenden Steine mehr frei". Buttons: *Mischen* (primary), *Letztes Paar zurück* (hidden when history is empty), and a close ×. After closing, the HUD stays usable and *Tipp* reopens the dialog. Because it offers Undo directly, shuffle → undo → stuck can never trap her.

## Deal and Shuffle (solvable by construction)

**Peel.** `peel(occupied, rng, maxTries)` searches for a removal order of an occupied slot set:
1. Repeatedly pick 2 distinct free slots at random and remove them, recording each pair.
2. If fewer than 2 free slots remain before the set is empty, start the try over.
3. It returns the order, or `null` after `maxTries`.

**Certificate.** Each layout ships one verified full-board removal order (`Layout.certificate`), generated by `tools/certify.ts` and checked by a test. It guarantees that a deal and a relocation always terminate.

**Deal.** `deal(layout, faceCount, seed)`:
1. Get an order: `peel(allSlots, rng, 1000)`, falling back to the certificate if it returns `null`.
2. Build a face multiset: `tiles/2` pairs over `faceCount` faces, with per-face pair counts differing by ≤ 1. Shuffle the pairs and assign one pair to each recorded removal pair.
3. The order is stored on the state as the attempt's **witness**. Replaying it is a legal solution. Assigning identical faces to pairs that are simultaneously free in a peel cannot be broken by removing either one first.

**Mischen.** It always ends on a solvable board with the same face multiset:
1. **In place:** `peel(currentOccupied, rng, 200)`. If it finds an order, reassign the remaining faces along it. Tiles stay where they are; only faces change (a quick flip-fade animation).
2. **Relocate** (when step 1 fails, e.g. a tile stacked on its only twin): with `m` pairs remaining, move the remaining tiles onto the slots of the **last `m` pairs of the layout's certificate**. That occupancy is exactly the certificate's state after its first `k−m` pairs, so its suffix is a valid removal order. Assign face pairs along that suffix. Tiles fly to their new slots. This may cover parts of the clue again; that is acceptable for a rare case.

The result's removal order becomes the new witness. Seeds:
- attempt: `hash(levelId, attemptCounter)`
- shuffle: `hash(attemptSeed, shuffleCounter)`

`attemptCounter` is saved when a level is entered, so every entry deals differently.

## Levels

```ts
interface LevelDef {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  layoutId: LayoutId;
  faceCount: number;
  clueIndex: 0 | 1 | 2 | 3 | 4 | 5;
  difficulty: 'leicht' | 'mittel' | 'schwer';
}
```

|#|Difficulty|Tiles|Layers|Faces|Shape|Clue|
|---|---|---|---|---|---|---|
|1|leicht|36|2|9|wide rectangle (tutorial)|Familie|
|2|leicht|48|2|12|gift box with bow|9h 31 selzthal umsteigen|
|3|mittel|64|3|18|flower|Grün/weiß|
|4|mittel|72|3|24|two balloons|Klaus wildbolz/Albert fortell|
|5|schwer|88|4|34|stepped pyramid|Bezirkschulinspektor|
|6|schwer|96|4|34|the number "80" (layer 0 about 9×5)|12.2. 1989|

- Faces for levels 1–2 favour dots and winds, which have the highest contrast.
- The exact outlines are tuned during the build, within these counts and the authoring guide.
- Capacity check (from the review): a 4×5 pixel "8" plus a 4×5 "0" gives 30 layer-0 positions in 9×5, and 96 tiles over 4 layers fits.

## Clue under the tiles

- **Paper rectangle.** Each layout declares a `clueRect` in half-unit coordinates. It must lie within the union of layer-0 face rectangles, inset by `0.1w` from every outer boundary so rounded corners cannot leak. A test checks this against the layout data.
- **Opaque tiles.** The tile body is opaque across its whole face rectangle in the atlas.
- **Rendering.** `cluePaper` renders a cream paper card at `clueRect` beneath the tiles, with 8 px padding and the clue centred. It uses the bundled display font, auto-sized to the largest size that fits, never below 24 px, and never breaks inside a word.
- **When it's hidden.** The clue is concealed at deal time. It becomes readable as tiles are removed; reading it before the last pair is intended.
- **Fit acceptance** happens in the browser smoke at 640×360, after `document.fonts.ready`: each level's paper shows its clue at ≥ 24 px with no overflow. The unit test keeps a cheap lint: an average glyph width of 0.6 em, and the longest word must fit the paper width at 24 px.

## Screens and flow

1. **Welcome** (first launch, and whenever opened from the map's "?" button). It works in portrait and landscape and shows:
   - The greeting from `content.welcome`.
   - **Install help**, shown when the page is not running as an installed app (`display-mode` is neither `fullscreen` nor `standalone`):
     - If Chrome has fired `beforeinstallprompt` (it may arrive late, so the page listens the whole time), a big button *Als App installieren*. The prompt can be used once; after it is accepted or dismissed, the button is replaced by the manual steps.
     - Otherwise, illustrated manual steps: "Oben rechts auf ⋮ tippen → „App installieren" (oder „Zum Startbildschirm hinzufügen")". Then: "Danach das Torten-Symbol auf dem Startbildschirm öffnen". Plus: "Schon installiert? Dann einfach das Torten-Symbol öffnen."
   - A *Los geht's* button.
2. **Map:**
   - A layered birthday cake with an "80" topper and 6 candles.
   - Candle states: locked (dim); current (gentle pulse), meaning the lowest unlocked level that has not been won, with no current candle once all are won; won (lit, flickering flame, envelope beside it).
   - Tapping the current candle or a won candle starts that level. Tapping an envelope reopens that clue letter.
   - After level 6 is won, tapping the topper reopens the closing screen.
   - A "?" button reopens the welcome/install help.
3. **Level:** background, clue paper, board, and the 72 px HUD column on the right. From the top, the HUD holds: back to the map, tiles left, and *Tipp*, *Zurück*, *Mischen* (≥ 56 px, icon + label). No HUD element overlaps the board.
   - Back: if at least one pair has been removed, a confirmation appears first: "Level verlassen? Beim nächsten Mal werden die Steine neu gemischt." Android's system Back follows the same path.
4. **Win:**
   1. At the winning transition, the win and unlock are saved *before* any celebration.
   2. The last pair flies off, and confetti plays for 1.5 s.
   3. The clue letter opens: an envelope flap animates open, and a card rises with "Hinweis N von 6" and the clue at ≥ 28 px.
   4. *Weiter* returns to the map: the new candle lights with a flame burst, and the next candle starts pulsing. After level 6, *Weiter* goes to the closing screen instead.
5. **Closing screen (after level 6):**
   - Fireworks.
   - A parchment with all six clues listed.
   - `content.finale` and `content.credit`.
   - All 6 candles shown lit.
   - Button *Zur Torte*.
6. **Tutorial** (level 1, first entry, unconditional, with a skip link on every step). Board input is limited to the step's target. Taps elsewhere give a gentle nudge on the target.
   1. A free pair glows: "Tippe auf diesen Stein." → "Jetzt auf den gleichen Stein. Gleiche Bilder passen zusammen."
   2. The pair flies off, then: "Nur freie Steine kann man nehmen: Es liegt kein Stein darauf, und links oder rechts ist Platz." Two example tiles on the board are ringed in turn, one covered from above and one blocked on both sides, each with a one-line caption.
   3. The three helper buttons are pointed at in turn with one line each, then "Viel Spaß!".

   `tutorialDone` is saved at the end or on skip. Leaving the level or suspending the app mid-tutorial restarts it on the next entry.

## Interaction and lifecycle

- **One board transition at a time.** A board-changing action (match, undo, shuffle) first *finishes* any running board animation, jumping it to its end state, then applies itself. Taps never get lost or queue up.
- **Screen generation.** Each screen mount has a generation number. Async work (atlas bake, animation callbacks, the stuck dialog, the win sequence) checks it and does nothing if the screen has changed. Unmounting cancels all animations under the screen.
- **Atlas swap.** A new atlas (after resize or a DPR change) is applied only to the generation that requested it. The old blob URL is revoked once the new one is displayed.
- **Updates.** `vite-plugin-pwa` with `registerType: 'prompt'` and no prompt UI. When a new version is waiting, it is activated only while the map or welcome screen is showing, or on the next launch. It never reloads during a level.

## Save

localStorage key `mahjong80.save`:

```ts
interface SaveV1 {
  version: 1;
  won: number[];                     // level ids won at least once
  welcomeSeen: boolean;
  tutorialDone: boolean;
  attempts: Record<number, number>;  // per-level attempt counter
}
```

- `unlocked` is derived: the highest won level + 1, capped at 6.
- A missing, unparsable, schema-invalid, or unknown-version save → a fresh save.
- The first run calls `navigator.storage.persist()`.
- Writes happen on level entry (attempt counter), at the winning transition, and on flag changes.
- The board itself is never saved. Leaving the level or the app mid-board restarts that level with a fresh deal.

## Art

- **Palette:** cream `#FFF8EE`, champagne gold `#D9B26F`, rose `#E89AA8`, berry `#8E2F4F`, deep plum text `#3A1F2B`. Text-on-background contrast is ≥ 7:1.
- **Tiles:**
  - An ivory face with a soft vertical gradient and a rounded bevel.
  - A warm jade-green side edge along the bottom and right.
  - A baked soft shadow.
  - The FluffyStuff face art centred.
  - Suit tiles carry a large deep-plum numeral 1–9 in the top-left corner; winds carry O / S / W / N.
  - The selection is a gold glow ring; a hint is a pulsing soft gold ring.
- **Backgrounds:** a warm gradient with soft light circles (bokeh) and bunting along the top. Each level has its own hue. It is static during a level.
- **Cake map:** a three-tier SVG cake with icing drips, sprinkles, the "80" topper, and 6 candles. Flames animate with transform and opacity only.
- **Effects:**
  - Match: the pair slides to the midpoint, scales down and fades out, and a gold sparkle burst plays.
  - Win: confetti.
  - Closing screen: fireworks.
  - Candle lighting: a flame pop.
- **Type:**
  - UI: a system rounded sans.
  - Paper, letters, and titles: a bundled serif display face (one weight, ≤ 60 KB WOFF2, OFL).
  - Body text ≥ 20 px, clue under the tiles ≥ 24 px, clue letter ≥ 28 px.
- **Reduced motion** (`prefers-reduced-motion`): particles are dropped, and the envelope and tile moves become fades.

## Performance

Lessons from Solitaire Dreams (commit `667454e`):
- Always-on `perspective` / `preserve-3d` on every card gave each card its own compositor layer.
- Ambient star animations kept running behind the opaque level screen.

The rules below prevent both. The look comes from baked art, not live effects.

**Rules**

1. **Baked tile atlas.** At level start, and on a resize or DPR change, `atlas.ts` renders each face the level uses into one sprite `<canvas>`, packed as a grid with 2 px gutters, at `min(devicePixelRatio, 3)`. Each cell holds the complete tile: body, bevel, edge, shadow, face art, and numeral.
   - The canvas is exported once as a blob URL.
   - Each tile is a single `<div>` showing its region via `background-image` / `background-position`.
   - The 34 face SVGs are decoded once per app session.
   - Not allowed on tiles: inline SVG per tile, CSS `filter`, `box-shadow`, `backdrop-filter`.
2. **Tiles are flat at rest.** Each is positioned once per board fit, with no `will-change`, no 3D, and no transitions on idle tiles. `will-change: transform, opacity` is set only on tiles that are animating, and removed when they finish.
3. **One overlay for selection and hint:** a single glow element that moves to the selected tile, plus at most two hint rings.
4. **One effects canvas:** full screen, pooled, ≤ 300 live particles, with its backing store capped at DPR 2. Its `requestAnimationFrame` loop runs only while particles are alive.
5. **No ambient animation behind a level.** The level background is static. Ambient animations (candle flames, bokeh drift) run only on the map and the closing screen, and pause on `visibilitychange: hidden`.
6. **No layout thrash.** The board fit is computed once per resize. No DOM layout reads during animations; positions come from the layout math.
7. **Assets:** total precache ≤ 2 MB. Only the 34 used face SVGs and one font are bundled.
8. **Animations use only `transform` and `opacity`** (Web Animations API or CSS), plus canvas drawing.

**Budget** (acceptance):

- **Desktop protocol.** Chrome DevTools device emulation at 800×360, DPR 3, CPU throttling 4×, warm start (second load, service worker active). Report the Chrome version and the median of 3 runs.
  - Scenario: enter level 6; make 5 matches, 1 undo, and 1 shuffle; take the win on level 1 with confetti.
  - Frames: ≥ 55 fps on average during match and confetti animations, and no dropped-frame run over 100 ms.
  - No long task > 50 ms from tap to selection or match.
  - Level start ≤ 400 ms on level 6, from the candle tap to the first frame with every tile painted. Measured with `performance.mark` at the tap and after the atlas image has decoded plus one rAF.
  - A resting level (no selection or hint) has ≤ 12 compositor layers in the Layers panel.
- **Physical device.** Install on a real Android phone (Jay's or his girlfriend's), then launch from the icon (fullscreen, landscape). Play level 1 to the win and level 6 for a few matches. It should be visibly smooth, with no hitches on match, shuffle, or confetti. Report the phone model. Desktop throttling does not simulate a phone GPU, so this check is mandatory.

## PWA & hosting

- `vite-plugin-pwa` with `registerType: 'prompt'` (see Interaction and lifecycle). It precaches all build assets, including the font.
- Manifest:
  - `id`, `start_url`, and `scope` all equal `/Brigitte_80er_Mahjong/`.
  - Name "Brigittes Mahjong", short name "Mahjong".
  - `display: fullscreen`, `orientation: landscape`.
  - Palette colours.
  - 192/512 px and maskable icons (a cake with "80").
- GitHub Actions on push to `main`: `npm ci`, `npm test`, `npm run build` with `VITE_BASE=/Brigitte_80er_Mahjong/`, then deploy `dist/` to Pages. Copied from Solitaire Dreams.

## Testing

Vitest (`core/`, `levels/`, `progress/`, content):

- **`isFree`:** covered from above (full and half-offset overlap); left-only, right-only, and both sides blocked; half-row vertical overlap.
- **Reducer:**
  - Select, deselect, move the selection, mismatch, blocked tap, and a match removing the pair.
  - Undo restoring a match exactly.
  - Two successive undos across a shuffle, restoring the exact pre-shuffle face map.
  - Shuffle keeping the face multiset.
  - Win before stuck.
  - Stuck detection, and the stuck status after undoing a shuffle.
  - The shuffle counter staying monotonic.
- **Deal:** the same seed gives the same deal; per-face pair counts differ by ≤ 1; the witness replays legally to an empty board through the reducer.
- **Certificates:** each layout's `certificate` replays legally on the full layout. `peel(allSlots, …, 1000)` succeeds on 1000 seeds per layout (the fallback exists, but should never be needed).
- **Recovery (the load-bearing test).** For each level and 200 seeds:
  1. Play random legal matches.
  2. Whenever stuck, apply *Mischen* and replay its new witness to confirm legality.
  3. Continue until the board is won.

  A run must win within 100 shuffles. Stuck states at any depth count, including early ones, and none are discarded.
- **Relocation fixture:** the review's stacked-twin tail (Appendix A). *Mischen* must relocate, and the result must replay to a win.
- **Oracle:** `solver.ts` (exhaustive DFS) confirms the recovery outcomes on small hand-made fixtures of ≤ 16 tiles. It is not run on full boards.
- **Layouts:**
  - Counts per the level table, all even.
  - No overlapping slots on the same layer.
  - The layer-0 bounding box is ≤ 11×5.
  - The fit at 640×360 gives w ≥ 44.
  - `clueRect` lies inside the inset layer-0 union.
- **Content:** the clue lint (see Clue under the tiles); no `[Beispiel]` strings.
- **Save:** round trip; corrupt JSON, wrong shape, and unknown version all give a fresh save; the attempt counter is saved on entry, so enter → abandon → reload → re-enter gives a different seed.

**UI smoke** (headless Chromium, 640×360 and 800×360 landscape, fonts ready). Screenshots of each screen are saved for Jay.
- The welcome renders in portrait and in landscape.
- The tutorial, played without mistakes, completes and saves `tutorialDone`.
- Level 1 played to the win via hints; the letter shows "Hinweis 1 von 6"; the map shows candle 1 lit and candle 2 pulsing.
- Every level's clue paper fits at ≥ 24 px with no overflow (fit acceptance).
- A forced stuck state: *Mischen* resolves it; *Letztes Paar zurück* works; shuffle → undo does not trap.
- A rapid match then an immediate *Zurück*, and Back during the last pair's flight, leave the board and the save consistent.
- Level 6's win leads to the closing screen listing all six clues.
- The service worker registers, and the game reloads offline.

**Performance check:** the Budget, recorded in the merge report.

## Scope cuts (only with Jay's explicit approval, in this order)

1. The envelope-flap choreography, the fireworks, and the candle-light burst are replaced by simple fades and the confetti.
2. The bespoke shapes (bow, flower, balloons) become roomy rectangles or pyramids. The "80" stays.
3. Decorative runtime work is replaced with static art where measurements show a cost.

Never cut: recovery (*Mischen* with relocation), cross-shuffle Undo, the stuck dialog's Undo route, readable sizes, the 640×360 fit, the offline installed check on a real phone, and the family content.

## Success criteria

- Brigitte opens the link on her Android phone, installs the game using the in-app help or the family's instructions, and it launches from the icon fullscreen in landscape.
- All 6 levels deal solvable boards and unlock in order. *Mischen* always leads to a finishable board. Each level reveals its clue under the tiles and on a letter, and level 6 leads to the closing screen.
- It meets the Performance budget, including the physical-phone check, and looks like a finished, polished game on first launch.
- `npm test` passes, including the recovery test.
