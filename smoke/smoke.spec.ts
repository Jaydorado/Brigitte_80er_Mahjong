/**
 * UI smoke for Brigittes Mahjong (plan Task 11): a production build under `vite preview`, driven in
 * Chromium at 640×360 and 800×360. Items are numbered as in the plan. Waits are conditions, never
 * fixed sleeps. Screenshots of every screen land in `smoke/screenshots/` (gitignored).
 */
import type { Page } from '@playwright/test';
import { clues, welcome } from '../src/content';
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
  await expect(page.locator('.cake-slot')).toHaveCount(6);
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

test('3 level 1 is won with Tipp twice and the ringed tiles; letter and map follow', async ({ page }, info) => {
  await seedSave(page, {}); // tutorialDone is seeded, so the level-1 tutorial never interferes here
  await page.goto('/');
  await candle(page, 1).locator('.cake-hit').click();
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.level')?.dataset.w !== undefined);
  await expect(hudCount(page)).toHaveText('36');
  await shot(page, info, '03-level-1-start');

  let left = 36;
  while (left > 0) {
    await hudBtn(page, 'Tipp').click();
    await hudBtn(page, 'Tipp').click();
    const rings = page.locator('.level .hint-ring:not([hidden])');
    await expect(rings).toHaveCount(2);
    const boxes = [await rings.nth(0).boundingBox(), await rings.nth(1).boundingBox()];
    if (left === 36) await shot(page, info, '03-level-1-hint-rings');
    for (const b of boxes) await page.mouse.click(b!.x + b!.width / 2, b!.y + b!.height / 2);
    left -= 2;
    await expect(hudCount(page)).toHaveText(String(left));
    if (left === 18) await shot(page, info, '03-level-1-half');
  }
  // The win is saved before the celebration ends.
  await expect.poll(async () => (await readSave(page)).won).toEqual([1]);
  await shot(page, info, '03-level-1-won');

  const title = page.locator('.letter-title');
  await expect(title).toHaveText('Hinweis 1 von 6', { timeout: 20_000 });
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
  for (let id = 1; id <= 6; id++) {
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
  await openLevel(page, 3);
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
      await expect(page.locator('.letter-title')).toHaveText('Hinweis 1 von 6');
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

test('8 winning level 6 after 1–5 opens its letter; Weiter lists all six clues', async ({ page }, info) => {
  await seedSave(page, { won: [1, 2, 3, 4, 5] });
  await boot(page);
  await expect(page.locator('.screen.map')).toBeVisible();
  for (let n = 1; n <= 5; n++) await expect(candle(page, n)).toHaveClass(/is-won/);
  await expect(candle(page, 6)).toHaveClass(/is-current/);
  await shot(page, info, '08-map-five-won');

  await openLevel(page, 6);
  await expect(hudCount(page)).toHaveText('96');
  await page.evaluate(() => window.__mahjong!.playWitness(0));
  await expect.poll(async () => (await readSave(page)).won).toEqual([1, 2, 3, 4, 5, 6]);

  await expect(page.locator('.letter-title')).toHaveText('Hinweis 6 von 6', { timeout: 25_000 });
  await expect(page.locator('.letter-clue')).toHaveText(clues[5]);
  const next = page.getByRole('button', { name: 'Weiter' });
  await expect(next).toBeEnabled();
  await shot(page, info, '08-letter-6');
  await next.click();

  await expect(page.locator('.screen.closing')).toBeVisible();
  await expect(page.locator('.closing-clues li')).toHaveText([...clues]);
  await shot(page, info, '08-closing');
  await page.getByRole('button', { name: 'Zur Torte' }).click();
  await expect(page.locator('.screen.map')).toBeVisible();
  for (let n = 1; n <= 6; n++) await expect(candle(page, n)).toHaveClass(/is-won/);
  await shot(page, info, '08-map-all-won');
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
  await expect(page.locator('.cake-slot')).toHaveCount(6);
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
