import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Die Kuchen-Torte füllt die ganze Fläche, deshalb ist der Rand derselbe Beerenton
// wie der Hintergrund des Icons — so bleibt der maskable Rand unsichtbar.
const berryBackground = { background: '#8E2F4F', fit: 'contain' } as const;

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: berryBackground },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: berryBackground },
  },
  images: ['public/icon.svg'],
});
