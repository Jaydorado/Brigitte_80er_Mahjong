import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        id: base,
        start_url: base,
        scope: base,
        name: 'Brigittes Mahjong',
        short_name: 'Mahjong',
        description: 'Mahjong-Solitaire als Geburtstagsgeschenk.',
        lang: 'de',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#FFF8EE',
        theme_color: '#8E2F4F',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'] },
    }),
  ],
  test: { include: ['src/**/*.test.ts', 'tools/**/*.test.ts'] },
});
