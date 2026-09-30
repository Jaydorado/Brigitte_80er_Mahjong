/**
 * The clue under the tiles: a cream paper card at the layout's clueRect, beneath every tile, with
 * the clue centred in the bundled display face at the largest whole px size that fits (≤ 64, ≥ 24).
 */
import type { Layout } from '../core/layout';
import { DISPLAY_FONT } from './art/tileArt';
import { boardGeometry } from './board';
import { TILE } from './fit';

export interface CluePaper {
  el: HTMLElement;
  /** Positions the card in board coordinates for face width w. */
  place(layout: Layout, w: number): void;
  /** Sizes the text once the display face is ready; resolves to the chosen px. Needs `el` attached. */
  fitText(): Promise<number>;
}

const MAX_PX = 64;
const MIN_PX = 24;

export function createCluePaper(clue: string): CluePaper {
  const el = document.createElement('div');
  el.className = 'clue-paper';
  el.setAttribute('aria-hidden', 'true'); // hidden under the tiles until they are cleared
  const text = document.createElement('div');
  text.className = 'clue-text';
  // A break opportunity after every "/", never inside a word.
  clue.split('/').forEach((part, i, parts) => {
    text.append(part);
    if (i < parts.length - 1) text.append('/', document.createElement('wbr'));
  });
  el.append(text);

  return {
    el,
    place(layout, w) {
      const inset = 0.1 * w;
      const r = layout.clueRect;
      const p = boardGeometry(layout, w).at({ col: r.col, row: r.row, layer: 0 });
      el.style.transform = `translate(${p.x + inset}px, ${p.y + inset}px)`;
      el.style.width = `${(r.w / 2) * w - 2 * inset}px`;
      el.style.height = `${(r.h / 2) * TILE.aspect * w - 2 * inset}px`;
    },
    async fitText() {
      await document.fonts.load(`700 ${MIN_PX}px ${DISPLAY_FONT}`);
      await document.fonts.ready;
      const innerH = el.clientHeight - parseFloat(getComputedStyle(el).paddingTop) * 2;
      // Binary search for the largest size that fits (a larger size never fits better): about six
      // layouts instead of up to forty. MIN_PX is the floor even when it overflows.
      let px = MIN_PX;
      let over = MAX_PX + 1; // smallest size known not to fit
      while (over - px > 1) {
        const mid = (px + over) >> 1;
        text.style.fontSize = `${mid}px`;
        if (text.scrollWidth <= text.clientWidth && text.scrollHeight <= innerH) px = mid;
        else over = mid;
      }
      text.style.fontSize = `${px}px`;
      el.dataset.px = String(px);
      return px;
    },
  };
}
