# Brigittes Mahjong — feedback round 1 (rev 2)

Author: `@default` (Opus 5.5), 2026-10-01. Jay approved the design in chat ("looks great") and authorised implementation after the adversarial changes.
- Rev 2 folds in all ten findings of `docs/reviews/2026-10-01-mahjong-feedback-adversary.md`. The rebuttal is appended there.
- Base spec: `docs/superpowers/specs/2026-09-30-brigitte-80-mahjong-design.md` (rev 2). Everything there still holds unless this document changes it.
- Performance rules and the 400 ms Budget are unchanged and non-negotiable.
- Deadline: 2026-10-03. Brigitte does not have the link yet. The only existing saves belong to family testers.

## 1. Layer readability (priority 1)

Family feedback: an older player cannot tell which tile sits on which layer.

### Geometry
`TILE.layerShift` goes from 0.06 w to **0.14 w**, and `TILE.edge` goes from 0.12 w to **0.22 w**. The adversary measured these against every existing layout at 640×360: the narrowest tile is now 47 px, and the floor is 44. The 44 px fit test stays authoritative and must run on the **all-slot** extent, upper layers included, for the new layouts as well.
- If a new layout fails, reshape its mask. Do not lower the constants.

### Shading
- **Depth formula.** Each slot has an immutable depth: `depth = extentOf(layout.slots).maxLayer − slot.layer`. Shading follows from it: `shade = [0, 0.10, 0.18, 0.25, 0.30][depth]`, mixed toward `#3a1f2b`.
- **What gets darker.** Shading darkens the tile **body pixels only**: the ivory face background and the side edge. Glyph art stays untouched, so symbols keep their contrast.
- **The shade follows the slot, never what is left on the board.** It is chosen by the slot a tile occupies, including the destination slot after shuffle, relocation or undo. It never depends on remaining occupancy.

### Atlas contract
The atlas gets two kinds of cell.
- **Face cells**, one per `FaceId`: the glyph only, on a transparent background.
- **Body cells**, one per depth the layout actually uses (`maxLayer + 1`, at most 5).

Each tile stays **one DOM element** carrying **two background layers** from the same atlas image (`background-image: url(atlas), url(atlas)`): the face cell on top and its depth's body cell underneath. This adds no elements, no compositor layers and no CSS `filter`/opacity, and the atlas grows by only 1–4 body cells instead of multiplying faces by depths.
- The body/face pass split already exists in `tileArt.ts`/`atlas.ts`. Reuse it; the pixel-identical requirement for faces does not apply to this change.
- The cache key gains the depth count. Pre-bake (`map.ts`) and acquire (`levelScreen.ts`) must pass identical parameters, so a pre-baked atlas is actually reused.
- The idle scheduler keeps pacing each bounded raster step: one face or one body cell per step.

### Acceptance
- **Screenshots** at 640×360 and 800×360:
  - level 1 (`rect`): two clearly distinguishable layers;
  - level 5: three;
  - level 8 (`eighty`): four.
- **Unit tests:** the depth formula, and the shade staying stable across removal, undo and shuffle.

## 2. Eight levels, eight clues

| Level | Tiles | Layout | Difficulty | Clue (verbatim; "selzthal" → "Selzthal") |
|---|---|---|---|---|
| 1 | 36 | `rect` | leicht | Familie |
| 2 | 48 | `gift` | leicht | Reise |
| 3 | 56 | `heart` (new) | mittel | 9h 31 Selzthal umsteigen |
| 4 | 64 | `flower` | mittel | Grün/weiß |
| 5 | 72 | `balloons` | mittel | Übernachten bei Klaus & Albert unmöglich |
| 6 | 80 | `train` (new) | schwer | Hertha verbindet |
| 7 | 88 | `pyramid` | schwer | Bezirkschulinspektor |
| 8 | 96 | `eighty` | schwer | 12.2.1989 |

### New layouts
- `heart`: 56 tiles, 3 layers, a heart outline.
- `train`: 80 tiles, at most 4 layers, a locomotive with two carriages.

Each gets:
- its mask in `layouts.ts`;
- a `clueRect` covered by layer 0;
- a certificate from `npm run certify`;
- layouts test rows (counts, bbox, coverage, certificate replay);
- an all-slot extent that fits at least 44 px at 640×360. Staying within 11×5 across×down gives 47 px.

### Face sets and clue fit
- **Face sets:**
  - level 3 is `[...range(0, 17), 31, 32, 33]`;
  - level 6 is `range(0, 33)`;
  - the other levels keep their current layout's set.
- **Clue fit:** clue 5 already fits the existing `balloons` paper at 24 px (the adversary measured 38 px chosen). The browser-level clue check covers all eight clues.

### The full six-to-eight inventory (all in scope)
- **Data and types:**
  - `src/levels/levels.ts`: `id` is `1…8`, `clueIndex` is `0…7`, and the data rows.
  - `src/progress/save.ts`: `LEVEL_COUNT = 8`, plus its comment.
- **Level screen:** `src/ui/levelScreen.ts:43–61`, the `THEMES` table. It needs **eight entries, one per level ID, with no missing-entry fallback**. Without them, levels 7 and 8 throw before mounting (adversary finding 1). Two new backdrop themes are added in the same visual language.
- **Routing:** `src/ui/router.ts`: closing after level **8** (R2 logic unchanged).
- **Labels:**
  - `src/ui/closing.ts`: "Deine acht Hinweise".
  - `src/ui/art/cake.ts`: "Geburtstagstorte mit acht Kerzen" and `CANDLE_COUNT = 8`, plus its comments.
- **Closing screen CSS:** `src/ui/screens.css:938–955`. The closing clue stagger covers all eight. Do this with a `--i` custom property rather than per-position rules.
- **Text and comments:**
  - `src/content.ts`: the clues; "Level 1 bis 8" in its comments; "sechs" → "acht" in the remaining text.
  - Comments in `src/ui/letter.ts:11` and `cake.ts:219,221,472`.
- **Tests:**
  - Update behavioural tests: `content.test.ts`, `layouts.test.ts`, `levels.test.ts`, `save.test.ts`, `smoke/smoke.spec.ts`.
  - Do not re-pin incidental count or string tests.
- **Already dynamic, do not touch:**
  - the letter title (`clues.length`);
  - the map topper (`art.candles.length`);
  - the closing list iteration.

### Cake map, 8 candles (adversary finding 4)
Shrinking the gap alone can't work: eight 52 px targets on the current top tier overlap.
- Widen the top tier to a radius of **≥ 200**. The viewBox stays 600×360; rescale the lower tiers to keep the proportions.
- Candle gap **≥ 52**. Every wax body sits on the tier.
- Hit rectangles are 52 px wide and **do not overlap**. Envelopes stay separately tappable.
- A smoke check at 640×360 taps **both the centre and the edge (x ± 24)** of every candle and confirms the right level opens.

### Saves
- **Old saves:** numeric `won` IDs and attempt keys are kept with **no content migration**. An old save with `won: [1…6]` therefore counts new levels 3–6 as won and unlocks 7. This is accepted: the only such saves belong to family testers.
- **`isSave`** accepts `won` values 1…8, with no duplicates and at most 8 entries.
- **`solved`** is either absent or exactly `true`. Any other value is schema-invalid and falls back to a fresh save, the existing policy.
- **Persistence:** every save write keeps `solved`.

## 3. Welcome headline

`welcome.title` becomes **"Alles Gute zum 80. Geburtstag!"**. The app name and the manifest stay as they are.

## 4. The riddle answer

After the level-8 letter, the closing screen shows the eight clues and the answer region:
- the question **"Wohin geht die Reise?"**;
- a text field;
- the button **"Antworten"**; Enter also submits.

### Matching (adversary finding 2)
A pure function: `src/core/answer.ts` `isCorrectAnswer(input: string): boolean`.

1. **Normalise.**
   1. Lowercase.
   2. ä→a, ö→o, ü→u, ß→ss. Then NFD and remove combining marks.
   3. Every character outside `a–z0–9` becomes a space.
   4. Split into tokens.
2. **Gmunden token.** The answer is correct if any token **starts with `gm`** and is within Levenshtein distance ≤ 2 of `gmunden`. That covers "gmunden", "gmundn", "gmuenden", "gmund" and "gmünd"→"gmund". Explicit alias: `gemunden`.
   - Because a token must start with `gm`, ordinary words like "gefunden", "gebunden", "gesunden" and "Gründen" are excluded.
3. **Traunsee.** The token `traunsee`, or the adjacent tokens `traun` `see`.
4. **Schloss phrases.** Exact adjacent token sequences:
   - `schloss ort`, `schloss orth`, `seeschloss ort`, `seeschloss orth`, `schloss am ort`.
   - `ort`/`orth` must be the **final token or followed by a non-letter token**, never a prefix of a longer token. "Ortner" and "Ortenberg" stay wrong because tokens are compared whole.
5. **`orth` alone.** Correct only when it is the **entire answer** (the token list is exactly `[orth]`).
6. **Nothing else** is correct.

**Required tests** in `answer.test.ts`:
- **Correct:**
  - "Gmunden", "gmünden", "GMUNDEN!", "Reise nach Gmunden", "Reise Gmunden", "Gemunden", "Gmundn", "Gmünd";
  - "nach gmunden am traunsee", "Traunsee", "Traun See";
  - "Schloss Orth", "Seeschloss Ort", "Schloss am Ort", "orth".
- **Wrong:**
  - "", "   ", "Ort";
  - "Wien", "München", "Muenchen", "Salzburg", "Graz", "Linz", "Gaming", "Gänserndorf";
  - "gefunden", "gebunden", "gesunden", "Gründen";
  - "Aus guten Gründen nach Wien", "Ich habe die Antwort gefunden: Wien";
  - "Das Schloss Ortner", "Schloss Ortenberg", "Orth an der Donau", "Seeschloss Monrepos".

### Wrong answer
- The field shakes once. The animation is transform-only and skipped under reduced motion.
- The line **"Noch nicht ganz – schau dir die Hinweise nochmal an."** appears **inside the answer region**.
- After the 3rd wrong try, the secondary button **"Auflösung zeigen"** appears, also inside the answer region.
- The wrong-try counter is not saved.

### Keyboard layout (adversary finding 5)
**Chosen approach:**
- `index.html`'s viewport meta gains `interactive-widget=resizes-content` (Chrome 108+), so the layout viewport shrinks with the keyboard.
- The closing screen is a flex column at `height: 100dvh`.
  - The **answer region** sits first, at the top, and never shrinks: question, field, button, feedback and the reveal button.
  - The **clue list** fills the rest and scrolls on its own (`overflow-y: auto`).
- **Fallback, in the same component:**
  - If `visualViewport.height` < `innerHeight` − 50 while the field has focus, the shell height follows `visualViewport.height`.
  - This covers browsers that ignore `interactive-widget`.

**Verification:**
- Desktop smoke at 640×180 checks that the answer region is fully visible.
- The **real-device gate** is Jay's installed Android phone in landscape: focus, keyboard, typing, Enter, wrong ×3, reveal button, dismissing the keyboard, back to the map. This is part of the existing phone check.

### Save
On a correct answer or **"Auflösung zeigen"**, `solved: true` is **written before** the celebration starts.

## 5. Celebration and photo

### State sequence (adversary finding 10)
1. **Unsolved view.**
   - Clues plus the answer region.
   - The existing ambient closing fireworks keep running, unchanged from the base spec.
2. **Accepted or revealed.**
   1. Persist `solved`.
   2. Stop the ambient loop.
   3. Start **one bounded burst** of at most 3 s, using the existing fx, and **decode the photo in parallel**.
3. **Photo view.** It fades in (one opacity transition) once **both** the photo is decoded **and** 1 s has passed since the burst began. It shows:
   - the photo;
   - `reveal.title` and `reveal.message`;
   - the credit line.
4. **Leaving.** The visible "Zur Torte" button and Android system Back both go to the map.
   - Unmounting cancels the burst, the decode callback and the fade timers.

- **Reduced motion:** no burst; the photo view appears as soon as the photo is decoded.
- **Later visits** (`solved` already true): the closing screen shows clues plus **"Das Geheimnis"** in place of the answer region.
  - Tapping it runs step 2 without the persist, then step 3.
- **Routing:** the photo view is a state inside `closing.ts`, not a new route.

### Photo (adversary findings 6, 7)
**Choosing the photo:**
- One Commons file of **Seeschloss Ort, Gmunden**.
- Preference order: **CC0 → CC BY → CC BY-SA**. Use BY-SA only if no good CC0/BY photo exists.
- Pin it: record the file-page URL, creator, exact licence and version, licence URL and any supplied notices in `public/photo-credit.md` (a repo record, not precached).

**Processing:**
- Resize to 1280 px on the long edge, WebP, quality ≤ 80, ≤ 200 KB.
- Stored at `public/seeschloss-ort.webp`. Referenced via `import.meta.env.BASE_URL` so it works on the GitHub Pages subpath.

**Precache:**
- Add `webp` to the Workbox `globPatterns`.
- After the build, check that `dist/sw.js` lists the photo and that the precache total is ≤ 2 MB.

**Credit, rendered in the app and readable offline**, at the inherited text-size floor (no "small type"):
- creator;
- licence name and version, linked to the licence URL;
- "Wikimedia Commons", linked to the file page;
- the modification notice "verkleinert, als WebP gespeichert" (plus "zugeschnitten" if cropped).

The photo stays separately licensed. If it is BY-SA, only the photo derivative carries BY-SA, not the app.

**Text** (from Jay; covered by the `TEXTS_FINAL` gate), new export `reveal` in `content.ts`:
- `reveal.title`: "Wir fahren nach Gmunden!"
- `reveal.message`: "Wir freuen uns auf eine gemeinsame Zeit in Gmunden 😊". The emoji renders in the system emoji font.

**Perf:** a plain `<img>`, decoded (`img.decode()`) before the fade, with no live effect beyond the one opacity transition.

## Out of scope

- the app name;
- layout changes beyond `heart`/`train` and §1's reshape rule;
- other text changes;
- Jay's install problem (tested separately).

## Testing

### Unit
- `answer.test.ts` (§4).
- Depth and shade (§1).
- Layouts for `heart` and `train`.
- Levels: 8 levels and clue fit.
- Save:
  - `won` 1…8;
  - an old all-six save loads;
  - `solved: true` round-trips;
  - `solved: false`, `"false"` and `{}` are invalid;
  - level writes keep `solved`.
- Fit with the new constants, on all-slot extents.

### Smoke (`npm run smoke`)
- Enter **every** level 1–8: the board paints, there are no page errors, and the right clue shows after a scripted win.
- 8-candle centre and edge taps (§2).
- Answer flow:
  - wrong ×3 → "Auflösung zeigen" visible;
  - a correct answer → photo and credit visible;
  - reload → "Das Geheimnis" works;
  - leaving during the burst/decode leaves no errors.
- Keyboard-height viewport at 640×180: the answer region is visible.
- **Offline first reveal:** after SW activation and a reload, go offline before the photo was ever requested. Both the correct-answer path and the reveal-button path show the decoded photo and the credit.

### Perf (T11 Step 2 protocol, re-run on the final tree)
The scenario becomes **level 8 (`eighty`, 96 tiles, 4 depths)** and **whichever layout has the largest atlas** (record the bitmap size and bake time). Paths:
- a warm pre-baked start (the number of record, ≤ 400 ms);
- a tap before the pre-bake completes;
- a replay of a won level whose atlas is not cached;
- a resize rebake.

Update `docs/reports/2026-10-perf.md`. The real-phone check stays mandatory (Jay).
