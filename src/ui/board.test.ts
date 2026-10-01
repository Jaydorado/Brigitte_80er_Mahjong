/**
 * The board's per-depth body: every shown tile paints its face cell over the body cell of the slot
 * it sits in, through removal, undo, an in-place shuffle and a relocating shuffle. The DOM is a
 * minimal stand-in (the suite runs in node): elements with a style bag, children and no layout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freePairs, newGame, reduce, type GameState } from '../core/game';
import type { Layout } from '../core/layout';
import { layouts } from '../core/layouts';
import { cellOrigin, type Atlas } from './atlas';
import { createBoard, type BoardView } from './board';

class FakeStyle {
  [prop: string]: unknown;
  setProperty(name: string, value: string): void {
    this[name] = value;
  }
}

class FakeElement {
  className = '';
  hidden = false;
  style = new FakeStyle();
  children: FakeElement[] = [];
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  remove(): void {}
  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }
}

beforeEach(() => {
  vi.stubGlobal('document', { createElement: () => new FakeElement() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const FACE_IDS = [5, 7, 9];

/** A one-device-px atlas: faces in cells 0–2, then the body of depth d in cell 3 + d. */
function fakeAtlas(depths: number): Atlas {
  return {
    url: 'blob:atlas',
    image: {} as HTMLImageElement,
    cellW: 30,
    cellH: 40,
    cols: 3,
    dpr: 1,
    index: new Map(FACE_IDS.map((f, i) => [f, i])),
    bodies: Array.from({ length: depths }, (_, d) => FACE_IDS.length + d),
  };
}

/** The cell a "Xpx Ypx" background position shows. */
function cellAt(a: Atlas, position: string): number {
  const [x, y] = position.trim().split(/\s+/).map((v) => -parseFloat(v));
  for (let c = 0; c < a.cols * 4; c++) {
    const o = cellOrigin(a, c);
    if (o.x === x && o.y === y) return c;
  }
  throw new Error(`no cell at ${position}`);
}

/**
 * Every occupied slot shows its face over the body of `depthBySlot[slot]`; every other tile is hidden.
 * `depthBySlot` is written out per fixture: the expectation does not reuse the board's own depth math.
 */
function expectShades(board: BoardView, a: Atlas, s: GameState, depthBySlot: readonly number[]): void {
  for (let i = 0; i < s.board.occupied.length; i++) {
    const t = board.tileEl(i)!;
    if (!s.board.occupied[i]) {
      expect(t.style.display, `slot ${i} hidden`).toBe('none');
      continue;
    }
    expect(t.style.display, `slot ${i} shown`).toBe('');
    const [face, body, ...rest] = t.style.backgroundPosition.split(',');
    expect(rest).toEqual([]);
    expect(cellAt(a, face), `slot ${i} face`).toBe(a.index.get(s.board.faceAt[i]));
    expect(cellAt(a, body), `slot ${i} body`).toBe(a.bodies[depthBySlot[i]]);
  }
}

describe('board shading', () => {
  it('stacks two copies of the atlas on every tile, so a tile can show its face cell over its body cell', () => {
    const board = createBoard(layouts.rect, fakeAtlas(2), 40);
    const style = board.el.style as unknown as FakeStyle;
    expect(style['--atlas']).toBe('url("blob:atlas"), url("blob:atlas")');
    expect(style['--atlas-size']).toBe('98px 86px, 98px 86px'); // 3 faces + 2 bodies in 3 columns, 2 px gutters
  });

  // The stacked-twin trap (deal.test.ts): after the C+D match only A (covered) and B (on top of A)
  // remain, so Mischen relocates the tiles onto slots 0 and 3.
  const trap: Layout = {
    id: 'rect',
    slots: [
      { col: 0, row: 0, layer: 0 }, { col: 0, row: 0, layer: 1 },
      { col: 2, row: 0, layer: 0 }, { col: 0, row: 2, layer: 0 },
    ],
    clueRect: { col: 0, row: 0, w: 2, h: 2 },
    certificate: [[1, 2], [0, 3]],
  };
  const trapDepths = [1, 0, 1, 1];

  it('the body follows the destination slot through removal, a relocating shuffle and their undo', () => {
    const a = fakeAtlas(2);
    const board = createBoard(trap, a, 40);
    let s = newGame(trap, [5], 1);
    board.render(s);
    expectShades(board, a, s, trapDepths);

    s = reduce(reduce(s, { type: 'tap', slot: 2 }), { type: 'tap', slot: 3 });
    expect(s.event.type).toBe('matched');
    board.render(s);
    expectShades(board, a, s, trapDepths);

    s = reduce(s, { type: 'shuffle' });
    if (s.event.type !== 'shuffled' || s.event.moves === null) throw new Error('expected a relocating shuffle');
    expect(s.board.occupied).toEqual([true, false, false, true]); // the top tile now sits on the floor
    board.render(s);
    expectShades(board, a, s, trapDepths);

    s = reduce(s, { type: 'undo' });
    expect(s.board.occupied).toEqual([true, true, false, false]); // back on top
    board.render(s);
    expectShades(board, a, s, trapDepths);

    s = reduce(s, { type: 'undo' });
    board.render(s);
    expectShades(board, a, s, trapDepths);
  });

  it('on a real four-layer board the body stays the slot’s through matches, an in-place shuffle and undo', () => {
    const L = layouts.eighty;
    const top = Math.max(...L.slots.map((sl) => sl.layer));
    expect(top).toBe(3);
    const depthBySlot = L.slots.map((sl) => top - sl.layer);
    const a = fakeAtlas(4);
    const board = createBoard(L, a, 40);
    let s = newGame(L, FACE_IDS, 2);
    board.render(s);
    expectShades(board, a, s, depthBySlot);
    for (let k = 0; k < 3; k++) {
      const [x, y] = freePairs(s)[0];
      s = reduce(reduce(s, { type: 'tap', slot: x }), { type: 'tap', slot: y });
      expect(s.event.type).toBe('matched');
      board.render(s);
      expectShades(board, a, s, depthBySlot);
    }
    s = reduce(s, { type: 'shuffle' });
    board.render(s);
    expectShades(board, a, s, depthBySlot);
    s = reduce(reduce(s, { type: 'undo' }), { type: 'undo' });
    board.render(s);
    expectShades(board, a, s, depthBySlot);
  });
});
