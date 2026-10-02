/**
 * The clue under the tiles: a cream paper card at the layout's clueRect, beneath every tile, with
 * the clue centred in the bundled display face at the largest whole px size that fits (≤ 64, ≥ 24).
 * A level may ask for `scale` > 1: its clue is then shown at exactly that multiple of the fitted size,
 * and the card grows a little around its centre if the larger text needs the room.
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

  /** The card as place() put it (board px): fitText may grow it around its centre and resets to this. */
  let placed = { x: 0, y: 0, h: 0 };
  return {
    el,
    place(layout, w) {
      const inset = 0.1 * w;
      const r = layout.clueRect;
      const p = boardGeometry(layout, w).at({ col: r.col, row: r.row, layer: 0 });
      placed = {
        x: p.x + inset,
        y: p.y + inset,
        h: (r.h / 2) * TILE.aspect * w - 2 * inset,
      };
      el.style.transform = `translate(${placed.x}px, ${placed.y}px)`;
      el.style.width = `${(r.w / 2) * w - 2 * inset}px`;
      el.style.height = `${placed.h}px`;
    },
    async fitText() {
      await document.fonts.load(`700 ${MIN_PX}px ${DISPLAY_FONT}`);
      await document.fonts.ready;
      // A re-fit starts from the stylesheet's padding and the card as placed.
      el.style.paddingBlock = '';
      text.style.overflow = '';
      el.style.height = `${placed.h}px`;
      el.style.transform = `translate(${placed.x}px, ${placed.y}px)`;
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
        // The paper is cut for the fitted size, so the scaled clue never shrinks to fit it: the card
        // loses its vertical padding and grows around its centre by what is still missing. That stays
        // under the tiles (the card is inset 0.1w inside the covered clueRect, and the growth is a few px).
        // The font's line-box overhang below the glyphs is blank, so the text box clips it and the card
        // is sized to the text box.
        px = basePx * scale;
        el.style.paddingBlock = '0';
        text.style.overflow = 'hidden';
        text.style.fontSize = `${px}px`;
        const grow = Math.max(0, Math.ceil(text.getBoundingClientRect().height) - el.clientHeight);
        if (grow > 0) {
          el.style.height = `${placed.h + grow}px`;
          el.style.transform = `translate(${placed.x}px, ${placed.y - grow / 2}px)`;
        }
      }
      text.style.fontSize = `${px}px`;
      el.dataset.basePx = String(basePx);
      el.dataset.px = String(px);
      return px;
    },
  };
}
