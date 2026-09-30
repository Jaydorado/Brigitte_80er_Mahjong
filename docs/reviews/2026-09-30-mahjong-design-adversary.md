# Mahjong design — adversarial review

**Verdict: reject.** Revise the recovery contract before implementation planning. The initial-deal proof is sound, but its claimed extension to every reachable partial board is false. The remaining findings are bounded changes, not a recommendation to change the stack or add a framework.

- **Target:** `docs/superpowers/specs/2026-09-30-brigitte-80-mahjong-design.md`, read verbatim; repository HEAD `f310bfb3c6a6d654bfcff0694aa2564a3ee09959`, tracked specification blob `120b0c3cf564b7eeaf49875016d8e5b3fe3890e9`.
- **Author:** `@default`, Claude Opus 5.5. **Reviewer actually running:** `openai-codex/gpt-6-astra`.
- **References read:** Solitaire Dreams' design, `src/ui/frame.ts`, relevant `src/ui/fx.ts` and `src/ui/styles.css` sections, and the complete patch for `667454e78ed0b5d77f30ffd49baa148c6aad5ffe`. Its temporary-3D/pause-hidden-animations lessons are accurately represented here. Its frame code also explicitly subtracts safe-area insets before fitting; copying only its nominal viewport numbers would lose that property.
- **Project rules:** the target repository's root listing and file discovery exposed no root `AGENTS.md` or `docs/adr/`; neither supplied additional rules. No product files were edited.
- Findings cite the specification's named sections, rather than inferred implementation files. P1 means fix before building the affected contract; P2 means an actionable design/acceptance defect; P3 means a small ambiguity. No P0 security/data-destruction claim is made.

## Load-bearing attack

**A legal match can leave two identical tiles stacked on each other; their counts are even, but only the upper tile is free, so no face-only shuffle of those slots can ever recover the game.** A single-button stuck dialog then has no successful action. Appendix A runs this counterexample against the specified geometry rules.

To refute this finding, provide either (a) a proof that **every legally reachable occupancy of every shipped layout** has a complete free-pair geometric removal sequence, not merely that the original layout has one, or (b) change recovery so that it may move slots or restore removals, with a constructive completion witness. More shuffle seeds, a larger restart cap, and replaying the original deal's witness do not refute it.

## Findings, ordered by severity

### 1. P1 — Even face counts do not make a partial board reshufflable

**Spec:** Game rules / Free tile, Shuffle, Hint, Stuck; Deal / final paragraph; Hard constraints / No fail state.

**Evidence:** Use half-tile coordinates:

|Tile|col|row|layer|Face|
|---|---:|---:|---:|---|
|A|0|0|0|X|
|B|0|0|1|X|
|C|2|0|0|X|
|D|0|2|0|X|

There are no same-layer overlaps. Initially B, C and D are free. Removing B+C, then A+D, is a valid solution and a possible output of the specified construction. Removing C+D first is also a legal matching move, but leaves A covered by B. Only B is free. The two remaining X tiles have an even count, yet **no reassignment of any faces can produce two free slots**. All 1,000 generation restarts on this occupancy fail. Four copies of a face are not an exotic exception: all nine level-1 faces have four copies under the proposed distribution.

This is a counterexample to the claimed general guarantee, not evidence that a particular unwritten 36-tile layout has already failed. The spec contains no restriction excluding this trap from its layouts or reachable tails. Hints may choose the bad pair as readily as a player.

**Proposed change:** keep the even-multiset invariant, but replace the false sufficiency claim. The simplest bounded recovery is to let *Mischen* also reposition the remaining tiles onto a canonical suffix of a known full-layout removal certificate, and assign the remaining face pairs along that suffix. It preserves tile count and face multiset and has a completion proof without runtime search. Explicitly amend “remaining slots”; explain that shuffle may move tiles and may change which parts of the paper are covered. If fixed slots are essential, instead specify an undo-based recovery that restores enough removals to reach a certified recoverable position. Obtain approval for one behavior before planning. Add the stacked two-tile tail as a mandatory recovery case.

### 2. P1 — Installation guidance is not sufficient to deliver the promised unaided fullscreen launch

**Spec:** Goal; Hard constraints / landscape and portrait overlay; Screens and flow / Welcome and Map; PWA & hosting; Success criteria.

**Evidence:** `display: fullscreen` is a valid installable manifest mode; it is **not** a request that turns the currently open link into an installed fullscreen window. The user must complete installation and launch the installed icon. The welcome instructions stop before that step. `display-mode` says how this window is running, not whether another installed instance exists: an already-installed app opened again as a normal Chrome link can fail the spec's “not installed” check while Chrome withholds `beforeinstallprompt` precisely because it is already installed.

The documentation retrieved for this review says the prompt event has no guaranteed firing time. Chrome's published promotion criteria include a prior interaction and 30 seconds of engagement. The fallback must therefore work on the first visit; it is not merely an exceptional path. Google's current German Android help describes a menu path through **“Installieren und Verknüpfung erstellen” → “Installieren”**, not universally the spec's two-step “Zum Startbildschirm hinzufügen.” Actual labels remain device/version dependent. The reference game's portrait onboarding does not prove this landscape flow. A global portrait overlay can additionally conceal the welcome instructions while the browser is still in portrait; manifest orientation does not rotate an ordinary tab.

**Proposed change:** specify a small, explicit onboarding state machine: usable portrait welcome/install help; late-arriving prompt support; one-use prompt cleared after acceptance or dismissal; manual instructions when unavailable; “Danach auf dem Startbildschirm das Torten-Symbol öffnen”; and repeatable help from the map. Detect “running installed” separately from a claim that installation is absent. Restrict the rotate-to-play overlay to gameplay, or keep installation help accessible through it. Set manifest `id`, `start_url` and `scope` consistently under `/Brigitte_80er_Mahjong/`. Accept the actual fullscreen display mode on installed launch, not `document.fullscreenElement`. Make one clean-profile **physical Android Chrome** install → icon launch → landscape → airplane-mode launch a release gate; headless Chromium cannot establish this success criterion.

### 3. P2 — The 12×6 envelope has almost no vertical art allowance, and the 48 px touch floor is unresolved

**Spec:** Hard constraints / Tile readability; Game rules / Coordinates; Levels / binding board-fit rule; Art / Tiles and Type; Performance / atlas.

**Evidence/arithmetic:** The stated board area is correct: `640 - 72 - 2×8 = 552`, `360 - 2×8 = 344`. For a four-layer layout whose upper layers reach the same extremes as the base, cumulative layer shifts add `3×0.06w = 0.18w` and the bottom/right edge adds `0.12w`:

- width bound: `(12 + 0.18 + 0.12)w = 12.30w`;
- height bound: `(6×1.25 + 0.18 + 0.12)w = 7.80w`;
- fitted width: `min(552/12.30, 344/7.80) = 44.102564 px`;
- at `w = 44`, the height is **343.2 px**, leaving **0.8 px total** for any additional outer shadow/gutter/rounding allowance.

This is **not a proof that every proposed layout fails**: inset upper layers can avoid extending the bounding box, and smaller footprints fit comfortably. It is proof that “within 12×6” is not a safe authoring recipe for the baked soft shadow the spec also requires. A full six-row board with 48 px faces is already 360 px tall before depth. Adjacent 44 px tiles cannot each have independent, non-overlapping 48 px hit regions; extending their divs into each other needs an explicit hit arbitration rule. “Tile width” also needs to distinguish face width from atlas-cell width including edges and transparent padding.

**Proposed change:** define one shared face/edge/shadow/hit geometry contract, cumulative layer offset, rounding rule, and safe-area treatment. Fit **actual rendered extents**, not just the layer-0 grid. Prefer approximately ≤11 columns ×5 rows for the dense boards if 48 px faces are to satisfy the touch rule without overlap. Alternatively explicitly approve an exception for tile hit targets while keeping other controls ≥48 px. Produce the six coordinate datasets and a 640×360 fitted screenshot before treating the dimensions as settled. Do not shrink type or reinterpret atlas-cell width as face readability to make the test pass.

### 4. P2 — The independent DFS and restart budgets are assertions, not validated acceptance evidence

**Spec:** Deal / 1,000 restarts; Testing / Solvability and UI smoke; Performance / 400 ms level start.

**Evidence:** There are `6×200 + 6×50 = 1,500` solver boards. A 60 s serial suite allows **40 ms per board on average**, including generation and test overhead. If each consumes 200,000 nodes, the solver must process **300 million nodes / 60 s = 5 million nodes/s** before that overhead. A 96-tile board has 48 removal decisions. Memoizing by removed-slot set is sound for a fixed face assignment, but does not make general search polynomial or establish the promised runtime. It also needs a representation that distinguishes all 96 slots, not JavaScript's 32-bit bitwise masks, and must not reuse cache entries across different face assignments.

Conversely, 96 tiles do **not** prove this search impossible: at level 6, 20 faces have only one pair and 14 faces have two pairs; many branches may be forced. No actual coordinates, branching order or benchmark exists in the target to settle common-case runtime. Likewise, no observed full-layout restart frequency is available. On the four-tile example, a uniformly chosen geometric pair fails in one of three first choices; on its legal trapped tail, failure probability is one. A cap does not provide a successful runtime fallback, and finite seed tests do not prove that every future attempt seed stays under it.

There is also a hole in the sampling instruction: a “random legal path” can get stuck **before half the pairs are removed**. Silently discarding such paths would specifically omit the recovery failures this review found. Playing the smoke test to a win using arbitrary Hint pairs is not guaranteed to work without recovery either.

**Proposed change:** use a validated geometric certificate for each full layout, so dealing itself needs no probabilistic restart search. Keep independently implemented rule-checking of every generated witness as the scalable proof. Benchmark the proposed independent DFS on the real six datasets before locking its release-gate workload; if necessary, seek approval to keep DFS exhaustive on small/adversarial fixtures and sampled on large boards rather than spending the weekend optimizing an auxiliary solver. Return separate `solved`, `unsolvable` and `budget-exceeded` outcomes. Test **all sampled legal prefixes**, including early stuck states and two-tile tails; do not rejection-sample them away. Define seed list, solver move ordering, node accounting and CI reference runner. The scripted win flow must use the specified recovery when hints exhaust.

### 5. P2 — Undoing a shuffle can immediately re-open a modal that blocks the undo the player needs

**Spec:** Game rules / Undo, Hint, Stuck; Testing / “undo past a shuffle”.

**Evidence:** The following sequence is permitted: make a bad match → stuck dialog → Mischen → Zurück. Undoing the shuffle correctly restores the pre-shuffle stuck board, so automatic stuck detection opens the dialog again. The only specified dialog action is *Mischen*. If it is modal, the player cannot reach Zurück a second time to undo the bad match. Re-shuffle/undo can repeat forever. This issue remains even after finding 1's geometric recovery is fixed.

“Shuffle is undoable” also does not say whether the full face mapping, selection, seed/shuffle counter and hint state are restored. Restoring just removed tiles is insufficient across reassignments. Rolling the counter back versus leaving it monotonic changes what shuffle → undo → shuffle does.

**Proposed change:** specify one atomic history entry per successful pair removal or shuffle, with enough prior board/face/RNG state for exact reversal; selection taps do not consume undo entries. Clear selection and hints on board-changing actions. Choose and document whether repeat-after-undo reproduces the same shuffle (recommended for deterministic replay) or consumes a new monotonically numbered shuffle. Give the stuck dialog a direct *Letztes Paar zurück* route or a dismissible route to Undo and Back, and open it once per transition into a stuck board, not on every render. Define empty-board status as won before considering “no pairs.” Test two successive undos across a shuffle, including the modal behavior.

### 6. P2 — Tutorial completion depends on a mistake the novice may never make

**Spec:** Screens and flow / Tutorial; Game rules / Match and Hint; Art / numeral overlays.

**Evidence:** Steps 1–2 teach matching the illuminated pair, but the availability rule appears only “on the first blocked-tile tap,” followed by “Finally” pointing at helpers. A player who follows the illuminated pair correctly has no reason to produce that event. Two reasonable builders can either wait there forever or finish the tutorial without explaining blocking. The text “oben nichts” can also mean “no tile higher up on the screen” to a novice, rather than “nothing lying on this tile.” Large numerals on all three suits make “same number” a plausible mistaken matching rule. Unlimited Hint does not explain why two identical visible tiles cannot be tapped.

**Proposed change:** make a short, unconditional sequence: one guided match; a visual example of a tile covered by another and of both sides blocked; then helpers and completion. Explain “gleiche Bilder” and “kein Stein darauf; links oder rechts frei.” Do not wait for a wrong tap to advance. Define what happens on an off-target tap, Back, skip, shuffle and app suspension during the guide, and when `tutorialDone` is saved. Include one no-mistakes tutorial smoke and a brief unassisted novice check. Keep it short; this does not require a tutorial framework.

### 7. P2 — Logical clue coverage and an average-glyph estimate cannot prove the displayed clue fits or is concealed

**Spec:** Inputs from the family; Levels; Clue under the tiles; Art / rounded bevel; Testing / Layouts and Content.

**Evidence:** A shape can contain many tiles and still have only a thin completely covered rectangular strip. At 44 px tile width, a one-row strip is 55 px high: with the test's 26 px line height, it has at most two unpadded lines. A four-tile-wide strip is 176 px: the `0.55×20 = 11 px` model permits roughly 16 characters/line, or only 32 before padding and real word wrapping. With 8 px padding on all sides that example has room for only one 26 px line. Tile count, “flower,” or “balloons” says nothing about whether the family's actual German sentence fits. Those strings and rectangles are not present yet.

The fixed-width character model is not a browser font metric and has no maximum-word constraint. Wide glyphs and German compounds can overflow a card that the estimate accepts. Separately, the union of logical 2×2 footprints is not necessarily the union of **opaque atlas pixels**: rounded corners, shadow padding or renderer gaps can expose paper at the outset. Half-offset upper tiles alone do not invalidate concealment if layer 0 is genuinely opaque and covers the text; an exact union test is useful and should remain. Once tiles are removed, reading the whole sentence before the last pair is an expected consequence of this reveal design, not a bug the current spec forbids.

**Proposed change:** choose the actual clue strings, paper padding and a fully covered `clueRect` for each level together. Define the half-unit-to-CSS transform for the paper explicitly. Retain the cheap content estimate only as a lint; acceptance must use the bundled/system font after fonts are ready in a real browser at 640×360 and require no horizontal or vertical overflow at ≥20 px. Also check letter layout at ≥28 px. Keep glyph bounds inside opaque layer-0 coverage and inspect the initially occupied board for legible leaks. State that concealment is required at deal time, not until the final match; if complete-until-win secrecy is desired, that requires an explicitly different reveal design.

### 8. P2 — Actions during effects and asynchronous atlas work have no defined ordering

**Spec:** Architecture / reducer then animate difference; Screens and flow / win sequence; Game rules / Stuck; Performance / Rules 1–4 and 6.

**Evidence:** The reducer removes a pair before the visual pair finishes flying, but only the stuck dialog is explicitly delayed. A rapid second match can create four animated tiles despite the “only 2 tiles currently animating” rule. Undo during that flight can restore tiles whose old completion callbacks subsequently hide/remove them. Leaving for the map or resizing during an asynchronous atlas export can likewise let stale work install the wrong atlas, display a stale stuck dialog, or open a letter over another screen. This is the same class of superseded-animation issue for which the reference `667454e` patch uses animation identity checks; flat-at-rest CSS alone does not solve it.

**Proposed change:** define a small interaction contract: while a match/shuffle transition is settling, either reject further board mutations with disabled helpers or queue them under an explicit policy. For this deadline, serialize them. On Back, abort pending effects and ignore their completion callbacks. Apply a resize/DPR atlas result only to the current screen and fit generation; release superseded resources. Persist the win/unlock at the winning state transition before confetti/letter delays. Require a scoped rapid-tap → Undo and Back-during-last-pair smoke. Do not add a general animation scheduler.

### 9. P2 — The rendering approach is plausible, but the performance gate omits the conditions needed to measure it

**Spec:** Performance / atlas, assets and Budget; Testing / Performance check.

**Evidence/arithmetic:** A 34-face RGBA atlas at 44×55 CSS px and DPR 3 is `34×44×55×9×4 = 2,962,080 bytes`, **2.825 MiB** before body depth and padding. Including a 0.12w right/bottom edge gives approximately **3.468 MiB** for the used cells, before packing waste/shadows. A 6×6 grid of such cells at integer backing sizes is about 888×1086 pixels without shadow padding. This is quite reasonable; there is no grounded claim that the atlas itself is too large. A single long strip, however, would already be about 5,032 backing pixels wide at this size, so packing is relevant. The ≤2 MB compressed precache budget is unrelated to decoded/GPU memory.

A retained baking canvas, decoded blob image and GPU backing may coexist; the exact duplication is browser-dependent. The 800×360 effects canvas at DPR 2 alone is **4.395 MiB**. Image decode, blob export, font loading, texture upload and old/new atlases during resize also belong in the start/memory accounting. “At level start” and “first paint” do not define whether face assets are already decoded, whether the photo preload is counted, or whether a frame with blank tile backgrounds counts. Four-times CPU slowdown is relative to the test host and does not throttle its GPU to an ordinary phone's GPU. The no-idle-3D rules reduce promotion pressure but cannot mathematically guarantee a browser's total compositor layer count.

**Proposed change:** keep the architecture, but pin the measurement host/Chrome version, cold versus warm asset state, start timestamp and first **fully painted** board endpoint; report repeat runs rather than a single favorable trace. Pack a compact atlas with declared gutters, distinguish face dimensions from atlas dimensions, and release old blob URLs/canvases only after the replacement is ready. Define resting-layer count with no active hint/selection animation, and separately exercise overlays. Include Shuffle and resize responsiveness in the scenario, not only match taps. Measure the current 34-face/96-tile start on the target Android class early; do not treat arithmetic as proof of ≤400 ms or ≤12 layers.

### 10. P2 — Progress/reset behavior leaves avoidable surprises during a long level

**Spec:** Screens and flow / Level; Save; Deal / attemptCounter; PWA & hosting / autoUpdate.

**Evidence:** Discarding the board on Back is explicit, so the absence of mid-level saving is not secretly an implementation obligation. For this recipient, however, one accidental Back can discard up to 47 successful pairs on level 6 without warning. An app reload/eviction also necessarily discards it because `SaveV1` contains no board. The copied PWA choice says `autoUpdate` but does not specify whether registration code automatically reloads active clients; the plugin supports that behavior and documents the corresponding loss-of-in-progress-data risk. This matters if last-minute fixes are deployed while she is playing.

The spec also explicitly promises persistent per-level attempt counters, while the enumerated write events mention only win, unlock and flags. An enter-level → abandon → reload path can repeat the same deal unless the increment is saved at entry.

**Proposed change:** do not add full mid-board persistence for this deadline unless requested. Add a clear confirmation before an intentional exit with progress, handle the Android/system Back path consistently, and document the reload behavior. Specify that an update must not automatically reload an active level; adopt it at a safe screen boundary or next launch using the simplest supported registration policy. Save the attempt increment atomically on level entry, and save win/unlock before celebration. Test enter → abandon → reload → re-enter for a different attempt seed, plus update/background behavior on the installed app.

### 11. P3 — The sixth won candle points to a clue letter that does not exist

**Spec:** Screens and flow / Map, Win levels 1–5, finale; LevelDef / reveal; Save / unlocked.

**Evidence:** Every won candle is described as having an envelope whose tap reopens “that clue letter,” but there are five clues and no level-6 letter. Level 6 has a photo/finale and a separate topper replay route. Once all six levels are won, `unlocked = 6` also cannot by itself distinguish “current level 6” from “no current unfinished level.” These ambiguities invite an out-of-range clue access or a contradictory lit-and-current final candle.

**Proposed change:** put envelopes beside won candles 1–5 only; specify the level-6 candle as replay-level and the topper as replay-finale. Derive “current” from an unfinished unlocked level and specify none when all are won. Add those routes to the map smoke; no new screen is needed.

## Numerical and algorithmic conclusions that did not warrant a failure claim

- **Initial deal construction is valid.** Starting with a complete geometric free-pair removal sequence, assigning one identical face pair to each recorded pair makes replay legal. Removal cannot introduce a covering or side-blocking tile, so removing the first of two free tiles does not make the second blocked. It is fine to construct a removal sequence first; reverse placement is not necessary. The proof is conditional on actually finding the sequence and says nothing about all alternative legal plays.
- **96 tiles / four layers / an “80” silhouette is arithmetically feasible.** A 4×5 pixel-style 8 uses 16 cells (`####`, `#..#`, `####`, `#..#`, `####`); a 4×5 zero uses 14 (`####`, `#..#`, `#..#`, `#..#`, `####`). Place them a column apart: 30 positions in a 9×5 footprint. Three repeated layers plus six supported positions on layer 3 give **96 tiles across four layers**, with upper positions remaining inside that silhouette. At the conservative cumulative-offset bound this footprint permits about **52.52 px** face width. Appendix A checks the counts. This proves capacity, not attractiveness, clue/photo composition, safe play paths, generation frequency or an approved production layout.
- **A fully covered clue rectangle can exist**, but adequate area for the actual sentence is not implied by tile count. That is a data-and-rendering gate, not an inherently impossible requirement.
- **The atlas and flat DOM strategy are reasonable.** Sharing one background image does not inherently create 96 compositor layers. The original performance lesson is sound; actual layer count and timings remain measured properties.
- **`display: fullscreen` and `beforeinstallprompt` are compatible.** The defect is the onboarding lifecycle and proof on the real device, not an alleged browser prohibition on fullscreen PWAs.

## Scope versus the weekend

Recommended cut order **if Jay explicitly approves reducing scope**:

1. Remove separate fireworks, candle-light bursts, Ken Burns, and the mechanical envelope-flap choreography before reducing text/tile sizes. Keep one polished static cake, a readable letter, the full-screen photo and one inexpensive celebration/fade.
2. Simplify bespoke flower/balloon/bow/pyramid silhouettes to verified, roomy boards. Keep six levels and the birthday identity. A compact “80” is feasible, but its exact silhouette is less important than easy tapping and readable gifts.
3. Reduce the expensive independent large-board DFS matrix only after replacing it with independently checked constructive certificates and retaining small/adversarial solver cases. Do not simply remove solvability evidence or skip failing seeds.
4. Replace repeated runtime decorative baking/choreography with simpler static/prepared art where measurements show it matters; keep the shared-atlas and idle-animation discipline.

Do **not** cut deterministic recovery, the no-pairs Hint case, cross-shuffle Undo semantics, actual family content, readable controls, installed/offline Android verification, or the 640×360 fit check. These are the gift's functioning delivery path. Avoid adding sound, a generalized tutorial/animation framework, networking, or a save UI. A short real-device vertical slice (install → one taught match → stuck/recovery → readable clue → offline relaunch) should precede polishing all six screens.

## Verification performed

- Read the design verbatim and the referenced performance patch, rather than treating the reference spec as evidence that its implementation proves this new game's requirements.
- Ran the dimension, atlas and solver-budget arithmetic with Python 3.13.14.
- Ran the self-contained geometric counterexample and capacity assertions in this report with:

  `python -m doctest -v docs/reviews/2026-09-30-mahjong-design-adversary.md`

  This exercises the specified `isFree` behavior, a successful constructed solution, the alternative legal move that destroys geometric solvability, the ineffectiveness of 1,000 face-only retries on that tail, and the count/fit arithmetic. It is a design-model reproduction, **not** a test against nonexistent product code.
- Retrieved the following public browser documentation; documentation is not substituted for current-device testing:
  - Chrome install promotion criteria: https://web.dev/articles/install-criteria (page says last updated 2024-09-19).
  - Prompt lifecycle and non-guaranteed timing: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event .
  - Manifest fullscreen and fallback behavior: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display .
  - Current retrieved German Android install help: https://support.google.com/chrome/answer/9658361?hl=de&co=GENIE.Platform%3DAndroid .
  - PWA automatic-update/reload behavior: https://vite-pwa-org.netlify.app/guide/auto-update . The registration mechanism matters; `registerType` alone was not treated as proof that the reference app reloads during play.

## Not verified

- The six actual slot datasets, actual clue strings/rectangles, photo/font assets and rendered typography: they are not implemented in the target repository. No claim about their final appearance or actual generation rejection rate is possible yet.
- The proposed 200,000-node solver's runtime, the 60 s suite, ≥55 fps, ≤50 ms long tasks, ≤400 ms level start, ≤12 compositor layers, ≤2 MB precache, or actual peak GPU/decoded memory. Arithmetic here is not a performance trace.
- Installation, menu labels, browser fallback, orientation lock, safe areas, storage durability, SW activation/offline readiness, and update handling on Brigitte's current Android Chrome. No device/browser automation was available for the absent app. In particular, a successfully registered SW alone would not prove its complete offline cache is ready.
- Unassisted usability for an 80-year-old, including face-art recognition, wind labels, helper labels in the 72 px HUD, font scaling, and first-time tutorial comprehension. These require the actual surface and a person, not a unit test.
- No project-wide build/test suite, formatter, or linter was run. This was a read-only design assignment except for this report; the runnable proof below creates no product files.

## Appendix A — executable design counterexample

Run the doctest command above from the target repository. Coordinates, overlap and side adjacency below implement only the rules quoted in the spec; no generator output or implementation internals are consulted. The final block is a count/fit witness, not a proposed production layout.

```pycon
>>> from itertools import combinations
>>> from collections import Counter
>>> def free_slots(board):
...     result = []
...     for name, (x, y, layer, face) in board.items():
...         others = [tile for other, tile in board.items() if other != name]
...         covered = any(z > layer and abs(xx-x) < 2 and abs(yy-y) < 2 for xx, yy, z, _ in others)
...         left = any(z == layer and xx == x-2 and abs(yy-y) < 2 for xx, yy, z, _ in others)
...         right = any(z == layer and xx == x+2 and abs(yy-y) < 2 for xx, yy, z, _ in others)
...         if not covered and not (left and right):
...             result.append(name)
...     return tuple(sorted(result))
>>> def remove_match(board, a, b):
...     assert a != b and a in free_slots(board) and b in free_slots(board)
...     assert board[a][3] == board[b][3]
...     return {name: tile for name, tile in board.items() if name not in (a, b)}
>>> def geometrically_peelable(board):
...     if not board:
...         return True
...     return any(geometrically_peelable({name: tile for name, tile in board.items() if name not in pair})
...                for pair in combinations(free_slots(board), 2))
>>> initial = {'A': (0, 0, 0, 'X'), 'B': (0, 0, 1, 'X'), 'C': (2, 0, 0, 'X'), 'D': (0, 2, 0, 'X')}
>>> free_slots(initial)
('B', 'C', 'D')
>>> geometrically_peelable(initial)
True
>>> remove_match(remove_match(initial, 'B', 'C'), 'A', 'D')
{}
>>> dead = remove_match(initial, 'C', 'D')
>>> tuple(sorted(dead)), free_slots(dead)
(('A', 'B'), ('B',))
>>> Counter(tile[3] for tile in dead.values())
Counter({'X': 2})
>>> geometrically_peelable(dead)
False
>>> sum(not geometrically_peelable(dead) for _ in range(1000))
1000
>>> sum(not geometrically_peelable(remove_match(initial, *pair)) for pair in combinations(free_slots(initial), 2))
1
>>> round(min(552 / (12 + .18 + .12), 344 / (6 * 1.25 + .18 + .12)), 6)
44.102564
>>> round(344 - 44 * (6 * 1.25 + .18 + .12), 3)
0.8
>>> glyph8 = ('####', '#..#', '####', '#..#', '####')
>>> glyph0 = ('####', '#..#', '#..#', '#..#', '####')
>>> base = [(x + dx, y) for dx, glyph in ((0, glyph8), (5, glyph0)) for y, row in enumerate(glyph) for x, cell in enumerate(row) if cell == '#']
>>> sum(row.count('#') for row in glyph8), sum(row.count('#') for row in glyph0), len(base)
(16, 14, 30)
>>> slots80 = [(2*x, 2*y, z) for z in range(3) for x, y in base] + [(2*x, 2*y, 3) for x, y in base[:6]]
>>> len(slots80), len(set(slots80)), len({z for x, y, z in slots80})
(96, 96, 4)
>>> max(x for x, y in base) + 1, max(y for x, y in base) + 1
(9, 5)
>>> round(min(552 / (9 + .18 + .12), 344 / (5 * 1.25 + .18 + .12)), 2)
52.52

```

## Advocate rebuttal (`@default`, 2026-09-30)

Spec revision 2 addresses every finding. Jay switched to six text clues at the same time, so the photo finale moves to a possible later level 7.

|#|Response|Change in revision 2|
|---|---|---|
|1|**Accept.** The counterexample is correct.|*Mischen* = in-place peel (200 tries), else relocation onto the last `m` pairs of the layout's stored certificate (a valid removal suffix by construction). New recovery test plays random legal matches to a win for 200 seeds per level, with no discarded stuck states; progress is ≥ 1 pair per shuffle, so the 100-shuffle cap is loose. The stacked-twin tail is a fixture.|
|2|**Accept.**|Welcome and install help work in portrait; the rotate overlay only on map and level. The late `beforeinstallprompt` is used once; manual steps name both Chrome menu labels plus "open the cake icon"; "?" on the map reopens the help. Manifest `id`/`start_url`/`scope` set. A physical Android install → icon launch check is mandatory.|
|3|**Accept.**|The fit uses full rendered extents incl. shadow and safe areas; the authoring guide is ≤ 11×5 (w ≈ 48 at 640×360); "tile width" = face width. Tile hit targets are exempt from 48 px, **flagged for Jay**.|
|4|**Accept.**|Stored per-layout certificate: deal and relocation always terminate. The full-board DFS is dropped; the scalable proof is witness replay through the reducer; DFS only on ≤ 16-tile fixtures.|
|5|**Accept.**|Atomic history entries (a shuffle stores the full prior map); monotonic shuffle counter; the stuck dialog offers *Letztes Paar zurück* and ×, and opens once per transition into stuck; win is checked before stuck.|
|6|**Accept.**|Unconditional three-step tutorial with a covered and a side-blocked example; wording "Es liegt kein Stein darauf"; defined save, skip, and leave behaviour.|
|7|**Accept, now mostly moot.**|The clues are now known and short (max 31 chars, longest word 20). The `clueRect` is inset by `0.1w` inside opaque layer 0; fit acceptance moves to the real browser after `fonts.ready` at ≥ 24 px; the character model is only a lint. Concealment is required at deal time only.|
|8|**Accept.**|Board actions finish running animations first; screen generation guards async work; the atlas swap is scoped; win/unlock are saved at the winning transition.|
|9|**Accept.**|Pinned protocol (warm start, median of 3, defined start/end marks, resting-layer definition, shuffle in scenario), gutters in the packed atlas, old blob revoked after swap, and a mandatory physical-phone check.|
|10|**Accept.**|Confirmation on Back with progress (system Back too); `registerType: 'prompt'`, with activation only on map/welcome or next launch; attempt counter saved on entry.|
|11|**Moot.**|Six clues now, so every candle has a letter. "Current" = the lowest unlocked unwon level, none when all are won; the topper reopens the closing screen.|

The scope-cut order was adopted almost verbatim ("Scope cuts"), gated on Jay's approval.
