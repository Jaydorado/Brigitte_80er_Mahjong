/**
 * The clue under the tiles: a cream paper card at the layout's clueRect, beneath every tile, with
 * the clue centred in the bundled display face at the largest whole px size that fits (≤ 64, ≥ 24).
 * A level may ask for `scale` > 1: its clue is then shown at that multiple of the fitted size.
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

export function createCluePaper(clue: string, scale = 1): CluePaper {
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
      // A re-fit starts from the stylesheet's padding and overflow.
      el.style.paddingBlock = '';
      text.style.overflow = '';
      const fits = (innerH: number): boolean => text.scrollWidth <= text.clientWidth && text.scrollHeight <= innerH;
      // Binary search for the largest size that fits (a larger size never fits better): about six
      // layouts instead of up to forty. MIN_PX is the floor even when it overflows.
      const innerH = el.clientHeight - parseFloat(getComputedStyle(el).paddingTop) * 2;
      let px = MIN_PX;
      let over = MAX_PX + 1; // smallest size known not to fit
      while (over - px > 1) {
        const mid = (px + over) >> 1;
        text.style.fontSize = `${mid}px`;
        if (fits(innerH)) px = mid;
        else over = mid;
      }
      const basePx = px;
      if (scale > 1) {
        // The paper is cut for the fitted size, so a scaled clue gets the paper's full height (no
        // vertical padding). The font's line-box overhang above and below the glyphs would otherwise
        // count as overflow, so the text box clips it. The full scale is taken if it fits, else the
        // largest size between the fitted size and the full scale that does.
        el.style.paddingBlock = '0';
        text.style.overflow = 'hidden';
        const scaledH = el.clientHeight;
        let hi = basePx * scale;
        text.style.fontSize = `${hi}px`;
        if (fits(scaledH)) px = hi;
        else {
          for (let step = 0; step < 6; step++) {
            const mid = (px + hi) / 2;
            text.style.fontSize = `${mid}px`;
            if (fits(scaledH)) px = mid;
            else hi = mid;
          }
        }
      }
      text.style.fontSize = `${px}px`;
      el.dataset.basePx = String(basePx);
      el.dataset.px = String(px);
      return px;
    },
  };
}
