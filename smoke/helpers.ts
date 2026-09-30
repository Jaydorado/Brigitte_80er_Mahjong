import { expect, test as base, type Page, type TestInfo } from '@playwright/test';
import { freshSave, SAVE_KEY, type SaveV1 } from '../src/progress/save';
// Type-only: declares `window.__mahjong` for the `page.evaluate` callbacks. Those callbacks run in
// the page, so they must never close over anything from this file.
import type {} from '../src/ui/testHook';

/** Every test fails on an uncaught page error or a console error. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
      });
      await use(errors);
      expect(errors, 'page and console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Writes the save before the app boots, but only when there is none (so reloads keep progress). */
export async function seedSave(page: Page, save: Partial<SaveV1>): Promise<void> {
  const value = JSON.stringify({ ...freshSave(), welcomeSeen: true, tutorialDone: true, ...save });
  await page.addInitScript(
    ([key, v]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, v);
    },
    [SAVE_KEY, value] as const,
  );
}

export async function readSave(page: Page): Promise<SaveV1> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as SaveV1, SAVE_KEY);
}

/** Loads the app with the smoke hook and waits until the hook is installed. */
export async function boot(page: Page): Promise<void> {
  await page.goto('/?smoke');
  await page.waitForFunction(() => window.__mahjong !== undefined);
}

/** Mounts a level through the hook and waits for its board and its fitted clue. */
export async function openLevel(page: Page, id: number): Promise<void> {
  await page.evaluate((i) => window.__mahjong!.openLevel(i), id);
  await page.waitForFunction((i) => {
    const screen = document.querySelector<HTMLElement>('.level');
    return screen?.dataset.level === String(i) && screen.dataset.w !== undefined;
  }, id);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.clue-paper')?.dataset.px !== undefined);
}

/** Screenshot into `smoke/screenshots/` (gitignored), named by project and step. */
export async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `smoke/screenshots/${info.project.name}-${name}.png` });
}

/** The hook's mirror beside the DOM counts. */
export function stateOf(page: Page) {
  return page.evaluate(() => window.__mahjong!.state());
}

/** Waits until the visible `.tile`s and the HUD number both equal the mirror's tiles left, then returns the state. */
export async function expectSynced(page: Page) {
  await expect
    .poll(async () => {
      const s = await stateOf(page);
      const ok = s.visibleTiles === s.tilesLeft && s.hudCount === s.tilesLeft;
      return ok ? 'synced' : `visible ${s.visibleTiles}, hud ${s.hudCount}, state ${s.tilesLeft}`;
    })
    .toBe('synced');
  return stateOf(page);
}
