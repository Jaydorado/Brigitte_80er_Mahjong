/**
 * UI smoke for Brigittes Mahjong (plan Task 11): a production build under `vite preview`, driven in
 * Chromium at 640×360 and 800×360. Items are numbered as in the plan. Waits are conditions, never
 * fixed sleeps (one negative check, "a reload starts no tutorial", has to let a start delay pass).
 * Screenshots of every screen land in `smoke/screenshots/` (gitignored).
 */
import type { Locator, Page, TestInfo } from '@playwright/test';
import { clues, reveal, welcome } from '../src/content';
import { boot, expect, expectSynced, openLevel, readSave, seedSave, shot, stateOf, test } from './helpers';

const hudCount = (page: Page) => page.locator('.level .hud-count span');
const hudBtn = (page: Page, label: 'Tipp' | 'Zurück' | 'Mischen') => page.locator(`.level .hud-btn[aria-label="${label}"]`);
const candle = (page: Page, n: number) => page.locator(`.cake-slot[data-level="${n}"]`);
const STUCK_TITLE = 'Keine passenden Steine mehr frei';

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('1 welcome renders in portrait and landscape; Los geht\'s opens the map', async ({ page }, info) => {
  const landscape = page.viewportSize()!;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const title = page.getByRole('heading', { level: 1 });
  const start = page.getByRole('button', { name: "Los geht's" });
  await expect(title).toHaveText(welcome.title);
  await expect(start).toBeVisible();
  expect(await noHorizontalOverflow(page), 'portrait welcome overflows sideways').toBe(true);
  await shot(page, info, '01-welcome-portrait');

  await page.setViewportSize(landscape);
  await expect(title).toBeVisible();
  await expect(start).toBeInViewport();
  expect(await noHorizontalOverflow(page), 'landscape welcome overflows sideways').toBe(true);
  await shot(page, info, '01-welcome-landscape');

  await start.click();
  await expect(page.locator('.screen.map')).toBeVisible();
  await expect(page.locator('.cake-slot')).toHaveCount(clues.length);
  await expect(candle(page, 1)).toHaveClass(/is-current/);
  expect((await readSave(page)).welcomeSeen).toBe(true);
  await shot(page, info, '01-map');

  // The map asks for landscape in portrait, and lets go again once rotated.
  const overlay = page.locator('.map .rotate-overlay');
  await expect(overlay).toBeHidden();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Bitte das Handy drehen');
  await shot(page, info, '01-map-portrait-rotate');
  await page.setViewportSize(landscape);
  await expect(overlay).toBeHidden();
});

/** A first run of level 1: welcome seen, tutorial not done. */
async function openLevelOneFresh(page: Page): Promise<void> {
  await seedSave(page, { tutorialDone: false });
  await page.goto('/');
  await candle(page, 1).locator('.cake-hit').click();
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.level')?.dataset.w !== undefined);
  await expect(hudCount(page)).toHaveText('36');
}

const tutCard = (page: Page) => page.locator('.level .tut-card');
const tutText = (page: Page) => page.locator('.level .tut-text');
const tutNext = (page: Page) => page.locator('.level .tut-next');
const tutSkip = (page: Page) => page.locator('.level .tut-skip');
const tutRing = (page: Page) => page.locator('.level .tut-ring');
const GO_LABEL = 'Los geht’s'; // the tutorial's last button (typographic apostrophe)

/** Taps the tile the ring points at, then waits until the tutorial has moved to another step. */
async function tapRingedTile(page: Page): Promise<void> {
  const text = await tutText(page).textContent();
  const box = await tutRing(page).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(tutText(page)).not.toHaveText(text!);
}

/** Tutorial steps 1–2: tap the ringed tile, then its ringed twin. The first pair is gone afterwards. */
async function tutorialFirstPair(page: Page, info: TestInfo): Promise<void> {
  await expect(tutCard(page)).toBeVisible();
  await expect(tutText(page)).toHaveText(/^Tippe auf diesen Stein/);
  await expect(tutNext(page)).toBeHidden(); // a tap step has no Weiter
  await expect(tutSkip(page)).toBeVisible();
  await expect(tutRing(page)).toHaveCount(1);
  await shot(page, info, 'tutorial-1-tap-first');
  await tapRingedTile(page);
  await expect(tutText(page)).toHaveText(/^Jetzt auf den gleichen Stein/);
  await expect(tutRing(page)).toHaveCount(1);
  await shot(page, info, 'tutorial-2-tap-twin');
  await tapRingedTile(page);
  await expect(hudCount(page)).toHaveText('34');
  await expect(tutText(page)).toHaveText(/^Nur freie Steine/);
}

/** Weiter through the remaining steps to the last one, whose button is Los geht’s. */
async function tutorialWeiterToEnd(page: Page): Promise<void> {
  for (let guard = 0; guard < 10; guard++) {
    await expect(tutNext(page)).toBeVisible();
    const label = await tutNext(page).textContent();
    await tutNext(page).click();
    if (label === GO_LABEL) return;
  }
  throw new Error('the tutorial never reached its last step');
}

test('2 the tutorial completes without mistakes and saves tutorialDone', async ({ page }, info) => {
  await openLevelOneFresh(page);
  expect((await readSave(page)).tutorialDone).toBe(false);
  await tutorialFirstPair(page, info);

  // "What makes a tile free": a text step, then a covered tile and a boxed-in tile, each ringed.
  await expect(tutRing(page)).toHaveCount(0);
  await expect(tutNext(page)).toHaveText('Weiter');
  await shot(page, info, 'tutorial-3-free');
  await tutNext(page).click();
  for (const text of [/^Hier liegt ein Stein darauf/, /^Hier ist links und rechts kein Platz/]) {
    await expect(tutText(page)).toHaveText(text);
    await expect(tutRing(page)).toHaveCount(1);
    // Tapping the ringed tile shows the lesson (it wiggles, blocked) and takes nothing off the board.
    const box = await tutRing(page).boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(hudCount(page)).toHaveText('34');
    await shot(page, info, `tutorial-4-${text.source.includes('darauf') ? 'covered' : 'boxed-in'}`);
    await tutNext(page).click();
  }

  // The three helpers: each step points at its button and only that button works.
  await expect(tutText(page)).toHaveText(/^Findest du kein Paar\? Tipp/);
  await expect(page.locator('.level .tut-point')).toHaveAttribute('aria-label', 'Tipp');
  await hudBtn(page, 'Tipp').click();
  await expect(page.locator('.level .hint-ring:not([hidden])')).toHaveCount(1);
  await shot(page, info, 'tutorial-5-tipp');
  await tutNext(page).click();
  await expect(tutText(page)).toHaveText(/^Macht den letzten Zug rückgängig/);
  await expect(page.locator('.level .tut-point')).toHaveAttribute('aria-label', 'Zurück');
  await hudBtn(page, 'Zurück').click();
  await expect(hudCount(page)).toHaveText('36');
  await shot(page, info, 'tutorial-6-zurueck');
  await tutNext(page).click();
  await expect(tutText(page)).toHaveText(/^Mischt die Steine neu/);
  await expect(page.locator('.level .tut-point')).toHaveAttribute('aria-label', 'Mischen');
  await hudBtn(page, 'Mischen').click();
  await expect(hudCount(page)).toHaveText('36');
  await shot(page, info, 'tutorial-7-mischen');
  await tutNext(page).click();

  // The last step: Viel Spaß!; its button (Los geht’s) ends the tutorial.
  await expect(tutText(page)).toHaveText('Viel Spaß!');
  await expect(tutNext(page)).toHaveText(GO_LABEL);
  await shot(page, info, 'tutorial-8-end');
  await tutNext(page).click();
  await expect(tutCard(page)).toHaveCount(0);
  await expect(page.locator('.level .tut-point')).toHaveCount(0);
  await expect(tutRing(page)).toHaveCount(0);
  await expect.poll(async () => (await readSave(page)).tutorialDone).toBe(true);
  await expect(hudCount(page)).toHaveText('36');

  // A reload starts no tutorial: back to the level, the board is plain. (A negative check has to
  // let the tutorial's own start delay of 460 ms pass, hence the dwell.)
  await page.reload();
  await candle(page, 1).locator('.cake-hit').click();
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.level')?.dataset.w !== undefined);
  await page.waitForTimeout(900);
  await expect(tutCard(page)).toHaveCount(0);
  expect((await readSave(page)).tutorialDone).toBe(true);
});

test('2 Überspringen ends the tutorial at once and saves tutorialDone; helpers are blocked until then', async ({ page }, info) => {
  await openLevelOneFresh(page);
  await expect(tutCard(page)).toBeVisible();
  // On a tap step the helpers are swallowed: nothing happens, the tutorial stays on its step.
  const first = await tutText(page).textContent();
  await hudBtn(page, 'Mischen').click();
  await hudBtn(page, 'Tipp').click();
  await expect(page.locator('.level .hint-ring:not([hidden])')).toHaveCount(0);
  await expect(hudCount(page)).toHaveText('36');
  await expect(tutText(page)).toHaveText(first!);
  expect((await readSave(page)).tutorialDone).toBe(false);

  await tutSkip(page).click();
  await expect(tutCard(page)).toHaveCount(0);
  await expect(tutRing(page)).toHaveCount(0);
  await expect.poll(async () => (await readSave(page)).tutorialDone).toBe(true);
  // The helpers work again.
  await hudBtn(page, 'Tipp').click();
  await expect(page.locator('.level .hint-ring:not([hidden])')).toHaveCount(1);
  await shot(page, info, 'tutorial-skipped');
});

test('3 level 1 is won with Tipp twice and the ringed tiles; letter and map follow', async ({ page }, info) => {
  await openLevelOneFresh(page);
  await shot(page, info, '03-level-1-start');
  // The first launch: the tutorial comes first (its own walkthrough is test 2).
  await tutorialFirstPair(page, info);
  await tutorialWeiterToEnd(page);
  await expect(tutCard(page)).toHaveCount(0);
  await expect.poll(async () => (await readSave(page)).tutorialDone).toBe(true);

  let left = 34;
  while (left > 0) {
    await hudBtn(page, 'Tipp').click();
    await hudBtn(page, 'Tipp').click();
    const rings = page.locator('.level .hint-ring:not([hidden])');
    await expect(rings).toHaveCount(2);
    const boxes = [await rings.nth(0).boundingBox(), await rings.nth(1).boundingBox()];
    if (left === 34) await shot(page, info, '03-level-1-hint-rings');
    for (const b of boxes) await page.mouse.click(b!.x + b!.width / 2, b!.y + b!.height / 2);
    left -= 2;
    await expect(hudCount(page)).toHaveText(String(left));
    if (left === 18) await shot(page, info, '03-level-1-half');
  }
  // The tutorial flag survives the win's save.
  await expect.poll(async () => (await readSave(page)).won).toEqual([1]);
  expect((await readSave(page)).tutorialDone).toBe(true);
  await shot(page, info, '03-level-1-won');

  const title = page.locator('.letter-title');
  await expect(title).toHaveText(`Hinweis 1 von ${clues.length}`, { timeout: 20_000 });
  await expect(page.locator('.letter-clue')).toHaveText(clues[0]);
  const next = page.getByRole('button', { name: 'Weiter' });
  await expect(next).toBeEnabled();
  await shot(page, info, '03-letter-1');
  await next.click();

  await expect(page.locator('.screen.map')).toBeVisible();
  await expect(candle(page, 1)).toHaveClass(/is-won/);
  await expect(candle(page, 2)).toHaveClass(/is-current/); // pulses once the flame has popped
  const pulse = await candle(page, 2).locator('.cake-body').evaluate((el) => getComputedStyle(el).animationName);
  expect(pulse).toContain('cake-pulse');
  await expect(candle(page, 3)).toHaveClass(/is-locked/);
  await shot(page, info, '03-map-candle-1-lit');
});

test('4 the clue paper fits at ≥ 24 px on every level', async ({ page }, info) => {
  await seedSave(page, {});
  await boot(page);
  for (let id = 1; id <= clues.length; id++) {
    await openLevel(page, id);
    const fit = await page.evaluate(async (i) => {
      await document.fonts.ready;
      const text = document.querySelector<HTMLElement>('.clue-text')!;
      const paper = text.parentElement!;
      return {
        id: i,
        px: parseFloat(getComputedStyle(text).fontSize),
        scrollWidth: text.scrollWidth,
        clientWidth: text.clientWidth,
        scrollHeight: paper.scrollHeight,
        clientHeight: paper.clientHeight,
        text: text.textContent,
      };
    }, id);
    expect(fit.text, `level ${id} clue text`).toBe(clues[id - 1]);
    expect(fit.px, `level ${id} clue font size`).toBeGreaterThanOrEqual(24);
    expect(fit.scrollWidth, `level ${id} clue overflows sideways`).toBeLessThanOrEqual(fit.clientWidth);
    expect(fit.scrollHeight, `level ${id} clue overflows the paper`).toBeLessThanOrEqual(fit.clientHeight);
    await shot(page, info, `04-level-${id}`);
  }
});

test('5 stuck path: Mischen, Letztes Paar zurück, and shuffle → undo', async ({ page }, info) => {
  await seedSave(page, {});
  await boot(page);
  // Level 4 (flower): the old level 3 board. It leaves the most tiles when stuck, so the later stuck lines exist too.
  await openLevel(page, 4);
  const dialog = page.locator('.dlg-stuck');
  const playToStuck = () =>
    page.evaluate(() => {
      if (!window.__mahjong!.playToStuck()) throw new Error('no line to a stuck board');
    });
  const note = (type: 'shuffle' | 'undo') => page.evaluate((t) => window.__mahjong!.note({ type: t }), type);

  // Stuck → the dialog; Mischen resolves it.
  await playToStuck();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText(STUCK_TITLE);
  expect((await stateOf(page)).status).toBe('stuck');
  await shot(page, info, '05-stuck-dialog');
  await dialog.locator('button[data-act="shuffle"]').click();
  await note('shuffle');
  await expect(dialog).toHaveCount(0);
  let s = await expectSynced(page);
  expect(s.status).toBe('playing');
  // The real board agrees: Tipp rings a tile instead of reporting no pair.
  await page.evaluate(() => window.__mahjong!.press('hint'));
  await expect(page.locator('.level .hint-ring:not([hidden])')).toHaveCount(1);
  await shot(page, info, '05-after-mischen');

  // Stuck again → Letztes Paar zurück gives a playable board.
  await playToStuck();
  await expect(dialog).toBeVisible();
  const leftStuck = (await stateOf(page)).tilesLeft;
  await dialog.locator('button[data-act="undo"]').click();
  await note('undo');
  await expect(dialog).toHaveCount(0);
  s = await expectSynced(page);
  expect(s.status).toBe('playing');
  expect(s.tilesLeft).toBe(leftStuck + 2);

  // Stuck again → shuffle → Zurück undoes the shuffle: the dialog is back and offers the undo.
  await playToStuck();
  await expect(dialog).toBeVisible();
  await dialog.locator('button[data-act="shuffle"]').click();
  await note('shuffle');
  await expect(dialog).toHaveCount(0);
  expect((await expectSynced(page)).status).toBe('playing');
  await hudBtn(page, 'Zurück').click();
  await note('undo');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('button[data-act="undo"]')).toBeVisible();
  s = await expectSynced(page);
  expect(s.status).toBe('stuck');
  await shot(page, info, '05-stuck-after-shuffle-undo');
  await dialog.locator('button[data-act="undo"]').click();
  await note('undo');
  await expect(dialog).toHaveCount(0);
  expect((await expectSynced(page)).status).toBe('playing');
});

test('6 a match followed by Zurück within 50 ms leaves the board equal to the state', async ({ page }, info) => {
  await seedSave(page, {});
  await boot(page);
  await openLevel(page, 1);
  await expectSynced(page);
  const settled = () => expect(page.locator('.level .tile[style*="will-change"]')).toHaveCount(0);

  for (const delay of [0, 20, 45]) {
    await page.evaluate((d) => window.__mahjong!.matchThenUndo(d), delay);
    await settled();
    const s = await expectSynced(page);
    expect(s.tilesLeft, `after match + Zurück at ${delay} ms`).toBe(36);
    expect(s.visibleTiles).toBe(36);
    expect(s.historyLength).toBe(0);
  }
  // Two matches in a row, two Zurück in a row.
  await page.evaluate(() => {
    const h = window.__mahjong!;
    for (let i = 0; i < 2; i++) h.playPairs([h.state().freePairs[0]!]);
    h.press('undo');
    h.press('undo');
  });
  await settled();
  expect((await expectSynced(page)).tilesLeft).toBe(36);
  // And a match that stays: two fewer tiles on screen and in the state.
  await page.evaluate(() => {
    const h = window.__mahjong!;
    h.playPairs([h.state().freePairs[0]!]);
  });
  await settled();
  const s = await expectSynced(page);
  expect(s.tilesLeft).toBe(34);
  await shot(page, info, '06-after-rapid-matches');
});

for (const how of ['hud', 'system'] as const) {
  test(`7 Back (${how}) during the last pair's flight keeps save and screen consistent`, async ({ page }, info) => {
    await seedSave(page, {});
    await boot(page);
    await openLevel(page, 1);
    await page.evaluate(() => window.__mahjong!.playWitness(1));
    expect((await expectSynced(page)).tilesLeft).toBe(2);
    await shot(page, info, `07-${how}-two-tiles`);

    // The last pair: the win is reached in the tap; Back is pressed while its flight plays.
    await page.evaluate((kind) => {
      const h = window.__mahjong!;
      h.playPairs([h.state().freePairs[0]!]);
      if (kind === 'hud') document.querySelector<HTMLButtonElement>('.level .hud-back')!.click();
      else history.back();
    }, how);
    // Nothing opens on top of the flight: no leave question, no letter yet.
    await expect(page.locator('.dlg-leave')).toHaveCount(0);
    await expect(page.locator('.letter')).toHaveCount(0);

    // Save and screen agree: the win was saved (before the celebration), and wherever we end up
    // (the letter after the celebration, or the map if Back left), a won level is lit on the map.
    await expect.poll(async () => (await readSave(page)).won).toEqual([1]);
    await expect(page.locator('.letter, .screen.map').first()).toBeVisible({ timeout: 20_000 });
    if (await page.locator('.letter').count()) {
      await expect(page.locator('.letter-title')).toHaveText(`Hinweis 1 von ${clues.length}`);
      await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled();
      await shot(page, info, `07-${how}-letter`);
      await page.getByRole('button', { name: 'Weiter' }).click();
    }
    await expect(page.locator('.screen.map')).toBeVisible();
    await expect(candle(page, 1)).toHaveClass(/is-won/);
    await shot(page, info, `07-${how}-map`);
    expect((await readSave(page)).won).toEqual([1]);
  });
}

test('8 winning the last level after the others opens its letter; Weiter lists every clue', async ({ page }, info) => {
  const last = clues.length;
  await seedSave(page, { won: Array.from({ length: last - 1 }, (_, i) => i + 1) });
  await boot(page);
  await expect(page.locator('.screen.map')).toBeVisible();
  for (let n = 1; n < last; n++) await expect(candle(page, n)).toHaveClass(/is-won/);
  await expect(candle(page, last)).toHaveClass(/is-current/);
  await shot(page, info, '08-map-all-but-last-won');

  await openLevel(page, last);
  await page.evaluate(() => window.__mahjong!.playWitness(0));
  await expect.poll(async () => (await readSave(page)).won).toEqual(Array.from({ length: last }, (_, i) => i + 1));

  await expect(page.locator('.letter-title')).toHaveText(`Hinweis ${last} von ${last}`, { timeout: 25_000 });
  await expect(page.locator('.letter-clue')).toHaveText(clues[last - 1]!);
  const next = page.getByRole('button', { name: 'Weiter' });
  await expect(next).toBeEnabled();
  await shot(page, info, '08-letter-last');
  await next.click();

  await expect(page.locator('.screen.closing')).toBeVisible();
  await expect(page.locator('.closing-clues li')).toHaveText([...clues]);
  await shot(page, info, '08-closing');
  await page.getByRole('button', { name: 'Zur Torte' }).click();
  await expect(page.locator('.screen.map')).toBeVisible();
  for (let n = 1; n <= last; n++) await expect(candle(page, n)).toHaveClass(/is-won/);
  await shot(page, info, '08-map-all-won');
});

// Every level, not just the ones the other tests happen to use: the board paints from a decoded atlas at a
// tile width that clears the 44 px floor, and a scripted win opens that level's own clue.
for (let id = 1; id <= clues.length; id++) {
  test(`8 level ${id}: the board paints and a scripted win shows its clue`, async ({ page }, info) => {
    await seedSave(page, {});
    await boot(page);
    await openLevel(page, id);
    const s = await expectSynced(page);
    expect(s.tilesLeft, `level ${id} tiles`).toBeGreaterThan(0);
    expect(s.tilesLeft % 2, `level ${id} has pairs only`).toBe(0);

    const paint = await page.evaluate(async () => {
      const screen = document.querySelector<HTMLElement>('.level')!;
      const board = screen.querySelector<HTMLElement>('.board')!;
      const atlas = board.style.getPropertyValue('--atlas');
      const url = /url\("(blob:[^"]+)"\)/.exec(atlas)?.[1] ?? null; // the face and body layers share one image
      let decoded = 0;
      if (url !== null) {
        const img = new Image();
        img.src = url;
        await img.decode();
        decoded = img.naturalWidth * img.naturalHeight;
      }
      return { w: Number(screen.dataset.w), url, decoded };
    });
    expect(paint.url, `level ${id} atlas`).not.toBeNull();
    expect(paint.decoded, `level ${id} atlas bitmap`).toBeGreaterThan(0);
    expect(paint.w, `level ${id} tile width`).toBeGreaterThanOrEqual(44);
    await shot(page, info, `08-level-${id}-board`);

    await page.evaluate(() => window.__mahjong!.playWitness(0));
    await expect.poll(async () => (await readSave(page)).won).toContain(id);
    await expect(page.locator('.letter-title')).toHaveText(`Hinweis ${id} von ${clues.length}`, { timeout: 25_000 });
    await expect(page.locator('.letter-clue')).toHaveText(clues[id - 1]!);
    await shot(page, info, `08-level-${id}-letter`);
  });
}

// Eight 52 px targets share the top tier. At 640×360 both the centre and the edge (x ± 24) of every
// candle must open its own level: neighbouring targets must not overlap, and no envelope may sit on top.
test('8 candles: the centre and the edge of every candle open that candle’s level at 640×360', async ({ page }, info) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await seedSave(page, { won: Array.from({ length: clues.length - 1 }, (_, i) => i + 1) }); // 1…n−1 won, the last one current: all tappable
  await page.goto('/');
  await expect(page.locator('.screen.map')).toBeVisible();
  await expect(page.locator('.cake-slot')).toHaveCount(clues.length);
  await expect(candle(page, clues.length)).toHaveClass(/is-current/);
  await shot(page, info, '08-candle-taps-map');

  for (let n = 1; n <= clues.length; n++) {
    const rect = candle(page, n).locator('.cake-hit rect').first();
    const box = (await rect.boundingBox())!;
    expect(box.width, `candle ${n} hit width`).toBeGreaterThanOrEqual(52);
    const y = box.y + box.height / 2;
    const cx = box.x + box.width / 2;
    for (const [where, x] of [['centre', cx], ['left edge', cx - 24], ['right edge', cx + 24]] as const) {
      await page.mouse.click(x, y);
      await expect(page.locator('.level'), `candle ${n} ${where}`).toHaveAttribute('data-level', String(n));
      await page.evaluate(() => history.back());
      await expect(page.locator('.screen.map')).toBeVisible();
    }
  }
});

// ---------------------------------------------------------------- the riddle answer (spec §4, §5)

const ALL_WON = Array.from({ length: clues.length }, (_, i) => i + 1);
const answerField = (page: Page) => page.locator('.closing-answer .closing-input');
const wrongLine = (page: Page) => page.locator('.closing-answer .closing-wrong');
const revealBtn = (page: Page) => page.getByRole('button', { name: 'Auflösung zeigen' });
const photoView = (page: Page) => page.locator('.closing-photo');

/** The closing screen's all-won save with a watcher in every document that numbers each image's decode() settling and its insertion into `.closing-photo-img`. */
async function seedAllWon(page: Page): Promise<void> {
  await seedSave(page, { won: ALL_WON });
  await page.addInitScript(`(() => {
    let seq = 0;
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const p = decode.call(this);
      p.then(() => { if (this.__decodedSeq === undefined) this.__decodedSeq = ++seq; }, () => {}); // the app's own call settles first
      return p;
    };
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        const img = n.matches('.closing-photo-img') ? n : n.querySelector('.closing-photo-img');
        if (img && img.__insertSeq === undefined) img.__insertSeq = ++seq;
      }
    }).observe(document, { childList: true, subtree: true });
  })();`);
}

/** From the map of a finished game to the closing screen, by tapping the topper as a player does. */
async function openClosing(page: Page): Promise<void> {
  await expect(page.locator('.screen.map')).toBeVisible();
  // The active topper pulses, so it is never "stable" for Playwright's click: tap its box as a finger would.
  const box = (await page.locator('.cake-topper-hit').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.screen.closing')).toBeVisible();
}

async function submitAnswer(page: Page, text: string): Promise<void> {
  await answerField(page).fill(text);
  await answerField(page).press('Enter');
}

/** The photo view is up, once the fade is over: the decoded photo, the plaque, and the credit in the app. */
async function expectPhotoView(page: Page): Promise<void> {
  const view = photoView(page);
  await expect(view).toBeVisible();
  await expect
    .poll(() => view.evaluate((el) => (el.getAnimations().length === 0 ? getComputedStyle(el).opacity : 'fading')))
    .toBe('1');
  const img = view.locator('.closing-photo-img');
  await expect(img).toBeVisible();
  // The displayed image decodes without error, and the app decoded it *before* putting it on screen: the
  // watcher (seedAllWon) numbers the image's decode() settling and its insertion into the DOM.
  const order = await img.evaluate(async (el: HTMLImageElement) => {
    await el.decode(); // a rejection fails the test
    const mark = el as HTMLImageElement & { __decodedSeq?: number; __insertSeq?: number };
    return { loaded: el.complete && el.naturalWidth > 0 && el.naturalHeight > 0, decoded: mark.__decodedSeq, inserted: mark.__insertSeq };
  });
  expect(order.loaded, 'the photo is loaded').toBe(true);
  expect(order.decoded, 'the app called decode() on the photo and it settled').toBeDefined();
  expect(order.inserted, 'the photo was inserted into the DOM').toBeDefined();
  expect(order.decoded!, 'the photo is decoded before it is inserted').toBeLessThan(order.inserted!);
  await expect(view.locator('.closing-photo-title')).toHaveText(reveal.title);
  await expect(view.locator('.closing-photo-message')).toHaveText(reveal.message);
  const credit = view.locator('.closing-photo-credit');
  await expect(credit).toBeVisible();
  for (const part of ['Dimitry Anikin', 'CC0 1.0', 'Wikimedia Commons', 'verkleinert, als WebP gespeichert']) {
    await expect(credit, `credit mentions ${part}`).toContainText(part);
  }
  await expect(credit.getByRole('link', { name: 'CC0 1.0' })).toHaveAttribute('href', /creativecommons\.org/);
  await expect(credit.getByRole('link', { name: 'Wikimedia Commons' })).toHaveAttribute('href', /commons\.wikimedia\.org/);
  await expect(view.getByRole('button', { name: 'Zur Torte' })).toBeVisible();
}

test('10 answer: wrong ×3 offers Auflösung zeigen; a correct answer shows the photo and its credit; the save keeps solved', async ({ page }, info) => {
  await seedAllWon(page);
  await page.goto('/');
  await openClosing(page);
  await expect(page.getByText('Wohin geht die Reise?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Antworten' })).toBeVisible();
  await expect(page.locator('.closing-clues li')).toHaveText([...clues]);
  await expect(wrongLine(page)).toBeHidden();
  await expect(revealBtn(page)).toBeHidden();
  await shot(page, info, '10-answer-unsolved');

  // The wrong line and the reveal button live inside the answer region; the button needs the third wrong try.
  for (let tries = 1; tries <= 3; tries++) {
    await submitAnswer(page, 'Wien');
    await expect(wrongLine(page)).toBeVisible();
    await expect(wrongLine(page)).toHaveText('Noch nicht ganz – schau dir die Hinweise nochmal an.');
    if (tries < 3) await expect(revealBtn(page)).toBeHidden();
  }
  await expect(page.locator('.closing-answer').getByRole('button', { name: 'Auflösung zeigen' })).toBeVisible();
  await shot(page, info, '10-answer-wrong-3');
  expect((await readSave(page)).solved, 'the wrong-try counter and solved are not saved by wrong answers').toBeUndefined();

  // Words around the answer count, accents do not matter; the save is written with the celebration.
  await submitAnswer(page, 'Reise nach Gmünden!');
  await expect.poll(async () => (await readSave(page)).solved).toBe(true);
  await expectPhotoView(page);
  await shot(page, info, '10-answer-photo');
  expect((await readSave(page)).won).toEqual(ALL_WON);

  // Reload: the riddle is solved, so Das Geheimnis stands in for the answer region and replays the photo.
  await page.reload();
  await openClosing(page);
  await expect(answerField(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Antworten' })).toHaveCount(0);
  await expect(page.locator('.closing-clues li')).toHaveText([...clues]);
  const secret = page.getByRole('button', { name: 'Das Geheimnis' });
  await expect(secret).toBeVisible();
  await shot(page, info, '10-geheimnis');
  await secret.click();
  await expectPhotoView(page);
  expect((await readSave(page)).solved).toBe(true);

  // Zur Torte leaves the photo view for the map; the closing screen is gone.
  await photoView(page).getByRole('button', { name: 'Zur Torte' }).click();
  await expect(page.locator('.screen.map')).toBeVisible();
  await expect(page.locator('.screen.closing')).toHaveCount(0);
});

test('10 answer: Auflösung zeigen reveals the photo and saves solved', async ({ page }, info) => {
  await seedAllWon(page);
  await page.goto('/');
  await openClosing(page);
  for (let tries = 0; tries < 3; tries++) await submitAnswer(page, 'Salzburg');
  await revealBtn(page).click();
  await expect.poll(async () => (await readSave(page)).solved).toBe(true);
  await expectPhotoView(page);
  await shot(page, info, '10-reveal-button-photo');
});

test('10 answer: with reduced motion the photo appears as soon as it is decoded', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedAllWon(page);
  await page.goto('/');
  await openClosing(page);
  await submitAnswer(page, 'Gmunden');
  await expectPhotoView(page);
});

for (const how of ['Zur Torte', 'system Back'] as const) {
  test(`10 answer: leaving by ${how} during the burst and the decode leaves no errors and no photo view`, async ({ page }) => {
    await seedAllWon(page);
    await page.goto('/');
    await openClosing(page);
    await submitAnswer(page, 'Gmunden');
    // Straight away: the burst has started, the photo may still be decoding or waiting out its first second.
    await expect.poll(async () => (await readSave(page)).solved, { message: 'solved is written before the celebration' }).toBe(true);
    if (how === 'Zur Torte') await page.locator('.closing-back').click();
    else await page.evaluate(() => history.back());
    await expect(page.locator('.screen.map')).toBeVisible();
    await expect(page.locator('.screen.closing')).toHaveCount(0);
    // The photo view would come 1 s after the burst began, and the burst ends within 3 s: dwell past both
    // (a negative check has to let the cancelled timers and callbacks pass). The fixture then checks for errors.
    await page.waitForTimeout(3500);
    await expect(photoView(page)).toHaveCount(0);
    await expect(page.locator('.screen.map')).toBeVisible();
    await expect(page.locator('.fx-canvas:not([hidden])')).toHaveCount(0);
  });
}

// Keyboard-height viewport: with the on-screen keyboard up in landscape only ~180 px are left.
test('10 answer: at 640×180 the whole answer region is visible, with the field focused', async ({ page }, info) => {
  await page.setViewportSize({ width: 640, height: 180 });
  await seedAllWon(page);
  await page.goto('/');
  await openClosing(page);
  await answerField(page).focus();
  const region = page.locator('.closing-answer');
  const inView = async (name: string, loc: Locator) => {
    await expect(loc, name).toBeVisible();
    const box = (await loc.boundingBox())!;
    expect(box.y, `${name} top`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${name} bottom`).toBeLessThanOrEqual(180 + 0.5);
    expect(box.x, `${name} left`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} right`).toBeLessThanOrEqual(640 + 0.5);
  };
  await inView('question', page.getByText('Wohin geht die Reise?'));
  await inView('field', answerField(page));
  await inView('Antworten', page.getByRole('button', { name: 'Antworten' }));
  await inView('answer region', region);
  await shot(page, info, '10-answer-640x180');

  // Everything the region can show, at the lowest height: the wrong line and the reveal button too.
  for (let tries = 0; tries < 3; tries++) await submitAnswer(page, 'Linz');
  await inView('wrong line', wrongLine(page));
  await inView('Auflösung zeigen', revealBtn(page));
  await inView('answer region with feedback', region);
  await inView('field with feedback', answerField(page));
  await shot(page, info, '10-answer-640x180-wrong');
  expect(await noHorizontalOverflow(page), 'the closing screen overflows sideways at 640×180').toBe(true);
});

// ---------------------------------------------------------------- offline first reveal

/** Service worker active and controlling the page (after a reload), the photo never requested by the page. */
async function warmServiceWorker(page: Page): Promise<string[]> {
  const photoRequests: string[] = [];
  page.on('request', (r) => {
    if (/seeschloss-ort\.webp/.test(r.url())) photoRequests.push(r.url());
  });
  await page.goto('/');
  await expect(page.locator('.screen.map')).toBeVisible();
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state))
    .toBe('activated');
  await page.reload();
  await expect(page.locator('.screen.map')).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  expect(photoRequests, 'the page must not have requested the photo yet').toEqual([]);
  // Offline it can only come from the service worker's precache, so check it is there (the worker fetched it, not the page).
  const precached = await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const keys = await (await caches.open(name)).keys();
      if (keys.some((r) => /seeschloss-ort\.webp/.test(r.url))) return true;
    }
    return false;
  });
  expect(precached, 'the photo is in the service worker precache').toBe(true);
  return photoRequests;
}

test('11 offline first reveal: the correct answer shows the decoded photo and its credit', async ({ page, context }, info) => {
  await seedAllWon(page);
  const photoRequests = await warmServiceWorker(page);
  await context.setOffline(true);
  try {
    await openClosing(page);
    await submitAnswer(page, 'Schloss Ort');
    await expectPhotoView(page);
    expect(photoRequests.length, 'the photo was requested only now, offline').toBeGreaterThan(0);
    await shot(page, info, '11-offline-answer-photo');
  } finally {
    await context.setOffline(false);
  }
});

test('11 offline first reveal: Auflösung zeigen shows the decoded photo and its credit', async ({ page, context }, info) => {
  await seedAllWon(page);
  const photoRequests = await warmServiceWorker(page);
  await context.setOffline(true);
  try {
    await openClosing(page);
    for (let tries = 0; tries < 3; tries++) await submitAnswer(page, 'Graz');
    await revealBtn(page).click();
    await expectPhotoView(page);
    expect(photoRequests.length, 'the photo was requested only now, offline').toBeGreaterThan(0);
    await shot(page, info, '11-offline-reveal-photo');
  } finally {
    await context.setOffline(false);
  }
});

test('9 offline: once the service worker is active, a reload renders the map', async ({ page, context }, info) => {
  await seedSave(page, {});
  await page.goto('/');
  await expect(page.locator('.screen.map')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return reg.active?.state;
      }),
    )
    .toBe('activated');

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.screen.map')).toBeVisible();
  await expect(page.locator('.cake-slot')).toHaveCount(clues.length);
  await shot(page, info, '09-map-offline');
  await context.setOffline(false);
});

test('a normal launch (no ?smoke) exposes no window.__mahjong and loads no hook chunk', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(r.url());
  });
  await seedSave(page, {});
  await page.goto('/');
  await expect(page.locator('.screen.map')).toBeVisible();
  expect(await page.evaluate(() => typeof window.__mahjong)).toBe('undefined');
  expect(scripts.filter((u) => /testHook/i.test(u))).toEqual([]);
  // With ?smoke it is there.
  await page.goto('/?smoke');
  await page.waitForFunction(() => window.__mahjong !== undefined);
});
