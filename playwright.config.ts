import { defineConfig } from '@playwright/test';

const PORT = 4317;
const ORIGIN = `http://127.0.0.1:${PORT}`;

/**
 * UI smoke: a production build (base `/`, `VITE_SMOKE=1` so it includes the `window.__mahjong` hook)
 * served by `vite preview`, driven in Chromium at the two landscape sizes the game targets. The
 * build goes to its own folder, so it never disturbs `dist/`, and ordinary builds never have the hook.
 */
export default defineConfig({
  testDir: 'smoke',
  testMatch: '*.spec.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: ORIGIN },
  projects: [
    { name: '640x360', use: { viewport: { width: 640, height: 360 } } },
    { name: '800x360', use: { viewport: { width: 800, height: 360 } } },
  ],
  webServer: {
    command:
      'cross-env VITE_BASE=/ VITE_SMOKE=1 vite build --outDir dist-smoke --emptyOutDir' +
      ` && cross-env VITE_BASE=/ vite preview --outDir dist-smoke --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
