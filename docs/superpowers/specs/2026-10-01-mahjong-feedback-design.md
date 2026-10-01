# Brigittes Mahjong — feedback round 1 (rev 1)

Author: `@default` (Opus 5.5), 2026-10-01. Approved in chat by Jay ("looks great").
Base spec: `docs/superpowers/specs/2026-09-30-brigitte-80-mahjong-design.md` (rev 2). Everything there still holds unless this document changes it. Performance rules and the Budget are unchanged and non-negotiable.

Deadline: 2026-10-03.

## 1. Layer readability (priority 1)

Family feedback: an older player cannot tell which tile sits on which layer.

- `TILE.layerShift` (now 0.06 w) goes up to **0.14 w**, and `TILE.edge` (now 0.12 w) goes up to **0.22 w**. Each higher layer moves visibly up and left, and every tile shows a thick side edge at the bottom-right.
- **Layer shading:** a tile's face is darkened by its layer. The top occupied layer is unchanged; each layer below it is darker by a fixed step: 0 / 10 / 18 / 25 / 30 % toward `#3a1f2b`, measured from the board's top layer down.
  - The shading is baked into the atlas: one body variant per depth, 5 at most.
  - No CSS `filter`, no per-tile opacity, no 3D transforms. The shading must not change the at-rest layer count.
- **The shading follows the tile's slot, not the board's highest layer at the moment.** The darkening is computed once per layout from `extent.maxLayer`, so tiles don't flip brightness as the board empties.
- Fit: `fitTileWidth` already accounts for both constants. The existing rule (at least 44 px per tile at 640×360 on every layout) stays authoritative.
  - If a layout falls below 44, the builder lowers `layerShift` for everyone, never below 0.11 w, and records the final value.
  - If it still fails, the builder reshapes that layout's mask within §2's constraints.
- Acceptance:
  - Screenshots at 640×360 and 800×360 of levels 1, 5 and 8 show three distinct layers at a glance.
  - The perf protocol is re-run on the final tree, and all six budget lines pass.

## 2. Eight levels, eight clues

The clues in level order, exactly as the family wrote them. Capitalisation is normalised only where noted.

| Level | Tiles | Layout | Difficulty | Clue |
|---|---|---|---|---|
| 1 | 36 | `rect` | leicht | Familie |
| 2 | 48 | `gift` | leicht | Reise |
| 3 | 56 | `heart` (new) | mittel | 9h 31 Selzthal umsteigen |
| 4 | 64 | `flower` | mittel | Grün/weiß |
| 5 | 72 | `balloons` | mittel | Übernachten bei Klaus & Albert unmöglich |
| 6 | 80 | `train` (new) | schwer | Hertha verbindet |
| 7 | 88 | `pyramid` | schwer | Bezirkschulinspektor |
| 8 | 96 | `eighty` | schwer | 12.2.1989 |

("selzthal" is capitalised as "Selzthal", a place name. Everything else is verbatim.)

- **New layouts:**
  - `heart`: 56 tiles, 3 layers, a heart outline.
  - `train`: 80 tiles, at most 4 layers, a locomotive with two carriages.
  - Each gets its mask in `layouts.ts`, a `clueRect` covered by layer 0, a certificate from `npm run certify`, and rows in the layouts tests (counts, bbox, coverage, certificate replay).
- **Face sets:**
  - Level 3: `range(0, 17)` plus the dragons `31–33`.
  - Level 6: `range(0, 33)`.
  - Levels 1, 2, 4, 5, 7 and 8 keep the face sets of their current layouts.
- **Clue fit:** the existing levels test (24 px clue text at 640×360) applies to all eight. Clue 5 (41 characters) may wrap onto up to 3 lines.
  - If `balloons` can't hold it, widen its `clueRect`. Failing that, reshape its mask: 72 tiles, layer 0 must cover the paper.
- **`LevelDef`:** `id` widens to `1…8` and `clueIndex` to `0…7`. `LEVEL_COUNT` in `save.ts` becomes 8.
- **Cake map:**
  - 8 candles. The candle gap shrinks if needed, and every candle tap target stays at least 52 px at 640×360.
  - The 80 topper activates once all eight are won.
  - The labels change: "Geburtstagstorte mit acht Kerzen".
  - The closing route triggers on level **8** (R2 logic unchanged: `firstWin` is captured before mount).
- **Save compatibility:** a v1 save with `won` ⊆ 1…6 stays valid and unlocks the next level as before. `isSave` accepts `won` values 1…8, with no duplicates and at most 8 entries. No version bump: the old shape is a subset of the new one.
- **Text:** every "sechs"/"six" in the UI and in `content.ts` becomes "acht". `content.ts` comments say "Level 1 bis 8".

## 3. Welcome headline

`welcome.title` becomes **"Alles Gute zum 80. Geburtstag!"**, without the name. The app name and the manifest (`Brigittes Mahjong`) stay as they are.

## 4. The riddle answer

After the level-8 letter, the closing screen shows the eight clues (as today) and below them:

- The question **"Wohin geht die Reise?"**, a text field and a button **"Antworten"**. Enter submits too.
- **Matching** lives in a pure function, `src/core/answer.ts`: `isCorrectAnswer(input: string): boolean`.
  1. Lowercase; ä→a, ö→o, ü→u, ß→ss; strip other diacritics (NFD + remove combining marks).
  2. Replace every character outside `a–z0–9` with a space; split on whitespace.
  3. Correct if **any word starts with `g`** and has Levenshtein distance ≤ 2 to `gmunden`. Without the `g` rule, "München" (`munchen`) would be distance 2 and count as correct.
  4. Also correct if the normalised text, with single spaces, contains `traunsee`, `schloss ort` or `seeschloss`, or contains the word `orth` (spelled with the h).
  5. Never correct: empty input, or input with only words shorter than 4 letters. In particular, `ort` alone is wrong.
- Required test cases, in `answer.test.ts`:
  - Correct: "Gmunden", "gmünden", "GMUNDEN!", "Reise nach Gmunden", "Reise Gmunden", "Gemunden", "Gmundn", "Gmünd", "nach gmunden am traunsee", "Traunsee", "Schloss Orth", "Seeschloss Ort", "orth".
  - Wrong: "", "   ", "Ort", "Wien", "München", "Muenchen", "Salzburg", "Graz", "Linz", "Gaming", "Gänserndorf".
  - "Gmünd" being correct is deliberate: it's close enough to count as the family's intent.
- **Wrong answer:** the field shakes once (a transform-only animation, skipped under reduced motion) and **"Noch nicht ganz – schau dir die Hinweise nochmal an."** appears. After the 3rd wrong try, a secondary button **"Auflösung zeigen"** appears. It goes to the celebration with the same photo and text.
- **Keyboard:** at 640×360 with the on-screen keyboard open (about half the height), the question, field and button stay visible. On focus the screen scrolls so the field sits at the top, and the clue list scrolls underneath.
- **Save:** `SaveV1` gains an optional `solved?: true`, set on a correct answer or "Auflösung zeigen". `isSave` accepts saves with or without it.
  - On a later visit, the closing screen shows the clues plus a **"Das Geheimnis"** button that goes straight to the celebration.
  - The wrong-try counter is not saved.
- `answer.ts` must not be imported by any level code (bundle hygiene only).

## 5. Celebration and photo

- A correct answer, or "Auflösung zeigen", shows the existing fireworks (the `fx` closing burst), then fades in:
  - a photo of **Seeschloss Ort, Gmunden** from Wikimedia Commons, with a free licence (CC0, CC BY or CC BY-SA);
  - a credit line under it, in small type: author, licence and "Wikimedia Commons";
  - the final text from `content.ts` `reveal` (new export), a heading plus a message.
- The photo is resized at build time to 1280 px on the long edge, WebP at quality ≤ 80, ≤ 200 KB. It is committed under `public/` and precached, so it works offline.
  - The builder records the source URL, author and licence in `public/photo-credit.md` and in the credit line.
- Draft text (the family may change it; it's covered by the `TEXTS_FINAL` gate):
  - `reveal.title`: "Wir fahren nach Gmunden!"
  - `reveal.message`: "Gemeinsam geht die Reise an den Traunsee, ins Seeschloss Ort. Wir freuen uns so sehr darauf!"
- Back from the celebration goes to the cake map.
- Perf: the photo is a plain `<img>`, decoded before the fade-in. There's no live effect on it beyond one opacity transition.

## Out of scope

The app name, any layout changes beyond `heart`/`train` (and §1/§2 reshape fallbacks), other text changes, the install problem on Jay's phone (tested separately).

## Testing

- Unit:
  - `answer.test.ts` (§4).
  - layouts tests for `heart` and `train`.
  - levels test for 8 levels and clue fit.
  - save tests for `won` 1…8, `solved`, and a 6-level save still loading.
  - the fit test with the new constants.
- Smoke (`npm run smoke`): extend to 8 levels; add the answer flow (wrong ×3 → "Auflösung zeigen" visible; correct answer → photo visible; reload → "Das Geheimnis" button).
- The perf protocol (T11 Step 2) is re-run on the final tree, and `docs/reports/2026-10-perf.md` is updated.
