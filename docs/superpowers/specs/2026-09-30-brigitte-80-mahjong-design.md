# Brigittes Mahjong — Design

Date: 2026-09-30. Status: sections 1–2 approved by Jay in chat; sections 3–5 delegated ("give it your best shot"), with performance and visual polish named as the top priorities. Author: `@default` (Claude Opus 5.5).

## Goal

A mahjong solitaire game in the style of Vita Mahjong, made as an 80th-birthday gift for Brigitte (Anna's mother). She plays 6 levels. Levels 1–5 each uncover one text hint about her present, and level 6 reveals it: a family trip to Gmunden. It reaches her as a GitHub Pages link that she installs herself as a fullscreen app on her Android phone, with nobody next to her.

It must look polished and run smoothly on an ordinary Android phone. It is a gift and should impress on first launch.

## Hard constraints

- **Target:** Android Chrome (current), phone, **landscape**, viewport ≥ 640×360 CSS px. Portrait shows a "Bitte das Handy drehen" overlay.
- **German only.** All player-facing text is German.
- **Deadline:** playable and deployed by the weekend of 2026-10-03/04.
- **No fail state:** no timer, no score, no lives, no lose screen. Hint, Undo, and Shuffle are free and unlimited.
- **Every deal is solvable** (by construction, and proven by tests).
- **Offline after first load.** Progress persists on the device.
- **Tile readability:** a tile face is ≥ 44 CSS px wide at 640×360.
- **Performance budget** (see Performance) is an acceptance criterion, not a nice-to-have.
- Spoiler risk from a public repo is accepted by Jay. Clue texts and the photo ship in plain form.

## Scope

In v1: 6 levels, the clue under the tiles plus a clue letter after each win, the finale with the Gmunden photo, the cake map, a welcome screen with install guidance, a guided tutorial in level 1, Hint / Undo / Shuffle, PWA offline, and GitHub Pages deploy.

Out of v1 (maybe after family feedback): sound/music, more levels, flower/season tiles, statistics, themes, iOS.

## Inputs from the family (not code)

All in `src/content.ts` and `public/`, editable without touching logic:

- `welcome`: greeting and a short personal message.
- `clues[0..4]`: the 5 text hints (Jay says these exist already).
- `finale`: the present text (default "Dein Geschenk: Eine Reise nach Gmunden mit der ganzen Familie!").
- `credit`: sign-off line.
- `public/gmunden.jpg`: a landscape photo of Gmunden, ≥ 1600 px wide, JPEG ≤ 400 KB.

Deploying to Brigitte is blocked until all of these are filled in. Development builds may run with obviously marked sample text (`[Beispiel] …`). A test fails on a `main` build if any content string still starts with `[Beispiel]`, so sample text cannot reach her.

## Stack

Same as Solitaire Dreams (`../Anna's Disney Solitaire clone`): TypeScript + Vite, DOM plus SVG, one `<canvas>` for effects, `vite-plugin-pwa` (autoUpdate), Vitest, and GitHub Actions deploying to GitHub Pages. No UI framework, no game engine. The CI workflow, PWA config, save pattern, and board-fit approach are reused from that repo.

- Repo: `https://github.com/Jaydorado/Brigitte_80er_Mahjong`
- Live URL: `https://jaydorado.github.io/Brigitte_80er_Mahjong/` (CI sets `VITE_BASE=/Brigitte_80er_Mahjong/`)
- Jay's one-time step: Settings → Pages → Source: GitHub Actions.

## Architecture

```
src/
  content.ts          family-editable text (see Inputs)
  core/               pure TS: no DOM, no timers, no Math.random
    tiles.ts          FaceId (34 faces: dots 1–9, bamboo 1–9, characters 1–9, 4 winds, 3 dragons)
    rng.ts            seeded PRNG (mulberry32) + Fisher–Yates
    layout.ts         Slot {col, row, layer}; Layout {slots, clueRect}; isFree(slot, occupied)
    layouts.ts        the 6 board shapes as data
    deal.ts           deal(layout, faces, seed) and reshuffle(state, seed): solvable by construction
    game.ts           GameState; reduce(state, select | undo | shuffle) → state; freePairs(); status
    solver.ts         bounded memoized DFS solvability check (tests only)
  levels/levels.ts    6 LevelDefs
  progress/save.ts    versioned localStorage
  ui/
    atlas.ts          bakes tile images into one sprite canvas (see Performance)
    board.ts          tile elements, board fit, selection/hint overlay
    hud.ts            back, tiles left, Tipp / Zurück / Mischen
    map.ts            cake with 6 candles
    cluePaper.ts      clue text or photo under the board
    dialogs.ts        stuck dialog, clue letter
    finale.ts         present reveal
    tutorial.ts       level-1 guidance
    welcome.ts        greeting + install guidance
    fx.ts             particle canvas: sparkles, confetti, fireworks
    art/              SVG/CSS art: tile body, cake, backgrounds, envelope; tile faces from vendor/
  vendor/tiles/       FluffyStuff riichi-mahjong-tiles SVGs (CC0), the 34 used faces only
  main.ts             screen router: welcome → map ↔ level → letter → map / finale
```

`core/` never imports from `ui/`. UI dispatches actions, the reducer returns new state, and the UI animates the difference.

## Game rules

**Coordinates.** A slot has `col` and `row` in half-tile units (so tiles can sit offset by half a tile) and a `layer` (0 = bottom). A tile covers a 2×2 half-unit footprint. The tile aspect is **4:5** (width:height). Each layer above 0 is drawn shifted up and left by 0.06 tile widths, and the side edge is 0.12 tile widths deep.

**Free tile.** A tile is free iff (a) no tile on a higher layer overlaps its footprint, and (b) on its own layer, its left side or its right side has no adjacent tile. A tile is adjacent on a side when it sits 2 half-units away horizontally with vertical footprints overlapping.

**Match.** Tap a free tile to select it (gold glow). Tap a free tile with the same `FaceId` to remove both. Tap the selected tile again to deselect. Tapping a different free tile with a different face moves the selection. Tapping a blocked tile does not select it; it wiggles.

**Undo.** Restores the last removed pair. Unlimited, back to the level start. A shuffle is also an undoable step.

**Shuffle.** Reassigns the faces of the remaining tiles to the remaining slots so that the remaining board is solvable (see Deal). The multiset of faces is kept. Always available.

**Hint.** Pulses one free matching pair. If none exist, it opens the stuck dialog.

**Stuck.** When no free matching pair exists and tiles remain, a friendly dialog opens ("Keine passenden Steine mehr frei") with the button *Mischen*. It does not open while an animation runs.

**Win.** The board is empty.

## Deal (solvable by construction)

`deal(layout, faceCount, seed)`:

1. **Removal order.** Start with all slots occupied. Repeatedly pick 2 distinct free slots at random (seeded) and remove them, recording the pair. If fewer than 2 free slots remain before the board is empty, restart with the next PRNG draw. Allow up to 1000 restarts; a layout that exceeds that fails its test.
2. **Faces.** Build a face multiset with `tiles/2` pairs spread over `faceCount` faces as evenly as possible (per-face pair counts differ by ≤ 1). Shuffle the pairs and assign one pair to each recorded removal pair.

The recorded removal order is then a valid solution. `reshuffle` runs the same algorithm on the remaining slots with the remaining face multiset. It stays valid because every face's remaining count is always even. Seeds: each attempt uses `seed = hash(levelId, attemptCounter)`, and each shuffle uses `hash(attemptSeed, shuffleCount)`. `attemptCounter` persists, so replays deal differently.

## Levels

```ts
interface LevelDef {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  layoutId: LayoutId;
  faceCount: number;      // distinct faces used
  reveal: { kind: 'clue'; index: 0 | 1 | 2 | 3 | 4 } | { kind: 'photo' };
  difficulty: 'leicht' | 'mittel' | 'schwer';
}
```

|#|Difficulty|Tiles|Layers|Faces|Shape|Reveal|
|---|---|---|---|---|---|---|
|1|leicht|36|2|9|wide rectangle (tutorial)|clue 1|
|2|leicht|48|2|12|gift box with bow|clue 2|
|3|mittel|64|3|18|flower|clue 3|
|4|mittel|72|3|24|two balloons|clue 4|
|5|schwer|88|4|34|stepped pyramid|clue 5|
|6|schwer|96|4|34|the number "80"|photo|

Every layout's layer-0 footprint should stay within **12 tile columns × 6 tile rows**. The binding rule is the board-fit test: at a 640×360 viewport, with the 72 px HUD column and 8 px margins (board area 552×344), the fitted tile width is ≥ 44 px for every layout, including layer offsets and edge depth. Faces for levels 1–2 favour dots and winds, which have the highest contrast. Shapes are data; their exact outlines are tuned during the build within these counts and bounds.

## Clue under the tiles

Each layout declares a `clueRect` in slot coordinates. The union of layer-0 tile footprints must fully cover `clueRect`, and a test checks this. `cluePaper` renders a cream paper card at `clueRect` beneath the tiles:
- Levels 1–5: the clue text, auto-sized to the largest font that fits, never below 20 px. If it doesn't fit at 20 px, a content test fails.
- Level 6: `gmunden.jpg`, cropped with `object-fit: cover`.

Removing tiles reveals what is underneath. Nothing is masked or computed.

## Screens and flow

1. **Welcome** (until dismissed once): greeting from `content.welcome`, and if the game is not installed (`display-mode` is not `fullscreen`/`standalone`), install guidance. The guidance is a single "Als App installieren" button driven by `beforeinstallprompt` when Chrome offers it, or else a 2-step German illustrated hint (⋮ menu → "Zum Startbildschirm hinzufügen"). Button *Los geht's*.
2. **Map:** a layered birthday cake with an "80" topper and 6 candles. Candle states: locked (dim), current (gentle pulse), won (lit, flickering flame, envelope beside it). Tapping the current or a won candle starts that level. Tapping an envelope reopens that clue letter. After level 6 is won, tapping the topper replays the finale. The install button also appears here while the game is not installed.
3. **Level:** background, clue paper, board, and a 72 px HUD column on the right. From the top, it holds: back to the map, tiles left, and three ≥ 56 px buttons *Tipp*, *Zurück*, *Mischen*, each with an icon and label. No HUD element overlaps the board. Leaving mid-level discards the board; re-entering deals fresh.
4. **Win (levels 1–5):**
   1. Last pair flies off.
   2. Confetti plays for 1.5 s.
   3. The clue letter opens: an envelope flap animates open, and a card rises showing "Hinweis N von 5" plus the clue at ≥ 28 px.
   4. *Weiter* returns to the map, where the new candle lights with a flame burst, then the next candle starts pulsing.
5. **Win (level 6), the finale:** full-screen photo with a slow zoom (Ken Burns, transform only), fireworks, then `content.finale` and `content.credit` fade in. All 6 candles shown lit. Button *Zur Torte*.
6. **Tutorial (level 1, first time only, skippable):**
   1. A free pair glows: "Tippe auf einen leuchtenden Stein".
   2. "Jetzt tippe auf seinen Zwilling".
   3. On the first blocked-tile tap: "Dieser Stein ist noch blockiert. Freie Steine haben oben nichts und links oder rechts Platz."
   4. Finally it points at the three helper buttons.

## Save

localStorage key `mahjong80.save`:

```ts
interface SaveV1 {
  version: 1;
  unlocked: 1 | 2 | 3 | 4 | 5 | 6;   // highest playable level
  won: number[];                     // level ids won at least once
  welcomeSeen: boolean;
  tutorialDone: boolean;
  attempts: Record<number, number>;  // per-level attempt counter (deal seeds)
}
```

A missing, unparsable, schema-invalid, or unknown-version save → a fresh save. The first run calls `navigator.storage.persist()`. It writes on every state change that matters: win, unlock, flags.

## Art

- **Palette:** cream `#FFF8EE`, champagne gold `#D9B26F`, rose `#E89AA8`, berry `#8E2F4F`, deep plum text `#3A1F2B`. Contrast of text on backgrounds ≥ 7:1.
- **Tiles:** an ivory face with a soft vertical gradient, a rounded bevel, a warm jade-green side edge (visible bottom and right, giving the 3D depth), and a baked soft drop shadow. The FluffyStuff face art sits centred. Suit tiles get a large deep-plum numeral 1–9 in the top-left corner; winds get O / S / W / N (German). Selected tiles show a gold glow ring; hint tiles a pulsing soft gold ring.
- **Backgrounds:** a warm gradient with soft blurred light circles (bokeh) and a strip of bunting along the top. Each level has its own hue. During a level the background is static (see Performance).
- **Cake map:** a three-tier cake in SVG, with icing drips, sprinkles, the "80" topper, and 6 candles. Flames are small SVG shapes animated by transform/opacity only.
- **Effects:**
  - Match: the pair slides together to the midpoint, scales down and fades out, and a gold sparkle burst plays.
  - Win: confetti in palette colours.
  - Finale: fireworks.
  - Candle lighting: a flame pop and glow.
- **Type:** a system-safe rounded sans for the UI, and a serif display face (bundled, one weight, ≤ 60 KB WOFF2, OFL) for letters and titles. Body ≥ 20 px, clue letter ≥ 28 px, touch targets ≥ 48 px (helpers ≥ 56 px).
- `prefers-reduced-motion`: particle bursts are dropped, and the envelope opens with a fade.

## Performance

Lessons from Solitaire Dreams (commit `667454e`): always-on `perspective` / `preserve-3d` on every card gave each card its own compositor layer, and ambient star animations kept running behind the opaque level screen. The rules below prevent both. The look comes from baked art, not live effects.

**Rules**

1. **Baked tile atlas.** At level start (and on resize / DPR change), `atlas.ts` renders each face used by the level, complete with body, bevel, edge, shadow, face art, and numeral, once into one sprite `<canvas>` at `min(devicePixelRatio, 3)`. That canvas is exported as one blob URL. Every tile is a single `<div>` showing its atlas region via `background-image` / `background-position`. There is no inline SVG per tile, and no CSS `filter`, `box-shadow`, or `backdrop-filter` on tiles.
2. **Tiles are flat at rest:** positioned once per board fit, with no `will-change`, no 3D, and no transitions on idle tiles. `will-change: transform, opacity` is set only on the 2 tiles currently animating and removed when they finish.
3. **One overlay for selection and hint:** a single glow element moved to the selected tile, and at most two hint rings. No per-tile class that repaints shadows.
4. **One effects canvas:** a full-screen `<canvas>` for all particles, pooled, with ≤ 300 live particles. It runs a `requestAnimationFrame` loop only while particles are alive, and its backing store is capped at DPR 2.
5. **No ambient animation behind a level:** the level background is a static image, generated once, and bokeh and bunting do not move. Ambient animations (candle flames, bokeh drift) run only on the map and in the finale, and pause on `visibilitychange: hidden`.
6. **No layout thrash:** board fit is computed once per resize. No DOM layout reads (`getBoundingClientRect`, `offset*`) during animations; tile positions come from the layout math.
7. **Assets:** total precache ≤ 2 MB. `gmunden.jpg` ≤ 400 KB, preloaded and `decode()`d before level 6's board appears. Only the 34 used FluffyStuff SVGs are bundled.
8. **Animations use only `transform` and `opacity`** (Web Animations API or CSS), plus canvas drawing.

**Budget** (acceptance; measured in Chrome DevTools at 800×360, DPR 3, CPU throttling 4×):

- A pair match and the win confetti keep ≥ 55 fps on average, with no dropped-frame run over 100 ms.
- No long task > 50 ms during play (tap → selection → match).
- Level start (atlas bake + deal + first paint) ≤ 400 ms on level 6.
- The Layers panel shows ≤ 12 compositor layers in a resting level.

## PWA & hosting

- `vite-plugin-pwa`, `registerType: 'autoUpdate'`, precaching all build assets including `gmunden.jpg` and the font.
- Manifest: name "Brigittes Mahjong", short name "Mahjong", `display: fullscreen`, `orientation: landscape`, palette colours, 192/512 and maskable icons (a cake with "80").
- GitHub Actions on push to `main`: `npm ci`, `npm test`, `npm run build` with `VITE_BASE=/Brigitte_80er_Mahjong/`, deploy `dist/` to Pages. The workflow is copied from Solitaire Dreams.

## Testing

Vitest (`core/`, `levels/`, `progress/`, `content`):

- `isFree`: covered by an upper layer (full and half-offset overlap); left-only, right-only, and both sides blocked; half-row vertical overlap.
- Reducer: select, deselect, move the selection, mismatched faces, blocked tap, match removes the pair, undo restores it, undo past a shuffle, shuffle keeps the face multiset, win detection, stuck detection.
- Deal: the same seed gives the same deal; per-face pair counts differ by ≤ 1; the recorded removal order replays legally to an empty board.
- **Solvability:** for each of the 6 levels, 200 seeds; the solver confirms every deal is solvable. For each level, 50 seeds × a mid-game `reshuffle` after half the pairs are removed along a random legal path; the solver confirms solvability. The solver is a depth-first search memoized on the removed-slot set. It is independent of `deal.ts` (it never reads the recorded removal order), and it has a budget of 200,000 nodes per board. Exceeding the budget fails the test. The whole solvability suite must finish in ≤ 60 s.
- Layouts: tile counts and layer counts match the level table; each count is even; board fit at 640×360 gives a tile width ≥ 44 px (see Levels); `clueRect` is fully covered by layer 0; no two slots overlap on the same layer.
- Content: each clue fits its level's `clueRect` at ≥ 20 px (measured with a fixed-width character model: average glyph width 0.55 em, line height 1.3); no `[Beispiel]` strings remain on a `main` build.
- Save: round trip; corrupt JSON, wrong shape, and unknown version all give a fresh save.

**UI smoke (headless Chromium, 800×360 landscape):**
- Welcome → map → level 1.
- Complete the tutorial.
- Play level 1 to the win using the hint pairs.
- The letter shows clue 1.
- The map shows candle 1 lit.
- Force a stuck state, and Shuffle resolves it.
- Level 6 finale renders the photo.
- The service worker registers and the game reloads offline.
- Screenshots of each screen are saved for Jay.

**Performance check:** the Budget above, recorded in the merge report with trace numbers.

## Success criteria

- Brigitte opens the link on her Android phone, installs the game from the in-app guidance, and it launches fullscreen in landscape.
- All 6 levels deal solvable boards, unlock in order, reveal their clue under the tiles and on a letter, and level 6 reveals the Gmunden photo and the present text.
- It meets the Performance budget, and it looks like a finished, polished game on first launch.
- `npm test` passes, including the per-level solvability tests.
