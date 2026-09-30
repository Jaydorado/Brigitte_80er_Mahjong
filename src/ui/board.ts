/**
 * The board: one flat `div.tile` per slot showing its atlas cell, stacked by layer, row and column;
 * one selection ring and up to two hint rings that move to their tiles. Taps are hit-tested in
 * layout math against the face rectangles, so tiles carry no listeners of their own.
 */
import type { GameState } from '../core/game';
import type { Layout, Slot } from '../core/layout';
import { atlasSize, cellOrigin, type Atlas } from './atlas';
import { extentOf, slotPx, TILE, type Extent } from './fit';

export interface BoardView {
  el: HTMLElement;
  render(s: GameState): void; // sync DOM to state without animation
  tileEl(slot: number): HTMLElement | undefined;
  /** A slot's resting offset in the board (CSS px, device-px snapped): tiles sit at translate(x, y). */
  pos(slot: number): { x: number; y: number };
  /** A slot's face centre in viewport CSS px (the board rect is read at most once per fit). */
  center(slot: number): { x: number; y: number };
  fit(area: { w: number; h: number }): void;
  onTap(cb: (slot: number) => void): void;
  destroy(): void;
}

/** Pixel geometry of a layout at face width w, relative to the board origin (CSS px). */
export interface BoardGeometry {
  e: Extent;
  /** Full rendered extent: every face, edge, shadow and layer offset. */
  width: number;
  height: number;
  at(s: Slot): { x: number; y: number };
}

export function boardGeometry(layout: Layout, w: number): BoardGeometry {
  const e = extentOf(layout.slots);
  let originCol = Infinity;
  let originRow = Infinity;
  for (const s of layout.slots) {
    originCol = Math.min(originCol, s.col);
    originRow = Math.min(originRow, s.row);
  }
  const extra = (e.maxLayer * TILE.layerShift + TILE.edge + TILE.shadow) * w;
  return {
    e,
    width: e.across * w + extra,
    height: e.down * TILE.aspect * w + extra,
    at: (s) => slotPx(s, w, e, originCol, originRow),
  };
}

export function createBoard(layout: Layout, atlas: Atlas, w: number): BoardView {
  const { slots } = layout;
  const geo = boardGeometry(layout, w);
  const dpr = atlas.dpr;
  const snap = (v: number) => Math.round(v * dpr) / dpr; // whole device px keeps the bitmap crisp
  const faceH = w * TILE.aspect;
  const pos = slots.map((s) => {
    const p = geo.at(s);
    return { x: snap(p.x), y: snap(p.y) };
  });

  const el = document.createElement('div');
  el.className = 'board';
  const sheet = atlasSize(atlas);
  el.style.setProperty('--atlas', `url("${atlas.url}")`);
  el.style.setProperty('--atlas-size', `${sheet.w / dpr}px ${sheet.h / dpr}px`);
  el.style.setProperty('--cell-w', `${atlas.cellW / dpr}px`);
  el.style.setProperty('--cell-h', `${atlas.cellH / dpr}px`);
  el.style.setProperty('--face-w', `${w}px`);
  el.style.setProperty('--face-h', `${faceH}px`);
  el.style.width = `${geo.width}px`;
  el.style.height = `${geo.height}px`;

  const tiles = slots.map((s) => {
    const t = document.createElement('div');
    t.className = 'tile';
    t.style.zIndex = String(s.layer * 1000 + s.row * 10 + s.col);
    t.style.display = 'none';
    el.append(t);
    return t;
  });
  const shownFace: (number | null)[] = slots.map(() => null); // null = hidden
  const selectRing = document.createElement('div');
  selectRing.className = 'select-ring';
  selectRing.hidden = true;
  const hintRings = [0, 1].map(() => {
    const r = document.createElement('div');
    r.className = 'hint-ring';
    r.hidden = true;
    return r;
  });
  el.append(selectRing, ...hintRings);

  let occupied: readonly boolean[] = slots.map(() => false);
  let rect: DOMRect | null = null; // board's viewport rect, read lazily once per fit
  const taps: ((slot: number) => void)[] = [];

  const place = (node: HTMLElement, slot: number | null) => {
    if (slot === null) {
      node.hidden = true;
      return;
    }
    node.style.transform = `translate(${pos[slot].x}px, ${pos[slot].y}px)`;
    node.hidden = false;
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (!ev.isPrimary || ev.button > 0) return;
    rect ??= el.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    let hit = -1;
    let best = -1;
    for (let i = 0; i < slots.length; i++) {
      if (!occupied[i]) continue;
      const p = pos[i];
      if (x < p.x || x >= p.x + w || y < p.y || y >= p.y + faceH) continue;
      const s = slots[i];
      const z = s.layer * 1000 + s.row * 10 + s.col;
      if (z > best) {
        best = z;
        hit = i;
      }
    }
    if (hit < 0) return;
    ev.preventDefault();
    for (const cb of taps) cb(hit);
  };
  el.addEventListener('pointerdown', onPointerDown);

  return {
    el,
    render(s) {
      occupied = s.board.occupied;
      for (let i = 0; i < slots.length; i++) {
        const face = occupied[i] ? s.board.faceAt[i] : null;
        if (face === shownFace[i]) continue;
        const t = tiles[i];
        if (face === null) {
          t.style.display = 'none';
        } else {
          const o = cellOrigin(atlas, atlas.index.get(face)!);
          t.style.backgroundPosition = `${-o.x / dpr}px ${-o.y / dpr}px`;
          if (shownFace[i] === null) t.style.display = '';
        }
        shownFace[i] = face;
      }
      place(selectRing, s.selected);
      const hint = s.hint === null ? [] : s.hint.step === 1 ? [s.hint.a] : [s.hint.a, s.hint.b];
      hintRings.forEach((r, k) => place(r, hint[k] ?? null));
    },
    tileEl: (slot) => tiles[slot],
    pos: (slot) => pos[slot],
    center(slot) {
      rect ??= el.getBoundingClientRect();
      return { x: rect.left + pos[slot].x + w / 2, y: rect.top + pos[slot].y + faceH / 2 };
    },
    fit(area) {
      const x = snap(Math.max(0, (area.w - geo.width) / 2));
      const y = snap(Math.max(0, (area.h - geo.height) / 2));
      el.style.transform = `translate(${x}px, ${y}px)`;
      tiles.forEach((t, i) => {
        t.style.transform = `translate(${pos[i].x}px, ${pos[i].y}px)`;
      });
      rect = null;
    },
    onTap(cb) {
      taps.push(cb);
    },
    destroy() {
      el.removeEventListener('pointerdown', onPointerDown);
      taps.length = 0;
      el.remove();
    },
  };
}
