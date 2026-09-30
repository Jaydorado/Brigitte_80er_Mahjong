export interface Slot { col: number; row: number; layer: number } // half-tile units
export interface Rect { col: number; row: number; w: number; h: number } // half-tile units
export type Pair = readonly [number, number]; // slot indices
export type LayoutId = 'rect' | 'gift' | 'flower' | 'balloons' | 'pyramid' | 'eighty';
export interface Layout { id: LayoutId; slots: Slot[]; clueRect: Rect; certificate: Pair[] }
export interface LayoutIndex { above: number[][]; left: number[][]; right: number[][] }

export function buildIndex(slots: readonly Slot[]): LayoutIndex {
  const above: number[][] = slots.map(() => []);
  const left: number[][] = slots.map(() => []);
  const right: number[][] = slots.map(() => []);
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    for (let j = 0; j < slots.length; j++) {
      if (i === j) continue;
      const b = slots[j];
      const dc = b.col - a.col;
      const dr = b.row - a.row;
      if (Math.abs(dr) >= 2) continue;
      if (b.layer > a.layer) {
        if (Math.abs(dc) < 2) above[i].push(j);
      } else if (b.layer === a.layer) {
        if (dc === -2) left[i].push(j);
        else if (dc === 2) right[i].push(j);
      }
    }
  }
  return { above, left, right };
}

export function isFree(i: number, idx: LayoutIndex, occupied: readonly boolean[]): boolean {
  if (idx.above[i].some((j) => occupied[j])) return false;
  return !idx.left[i].some((j) => occupied[j]) || !idx.right[i].some((j) => occupied[j]);
}

/** Occupied, free slot indices in ascending order. */
export function freeSlots(idx: LayoutIndex, occupied: readonly boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < occupied.length; i++) {
    if (occupied[i] && isFree(i, idx, occupied)) out.push(i);
  }
  return out;
}

/** layers[z][y] is a row string; '#' at x → Slot {col: 2x, row: 2y, layer: z}. Order: layer, row, col. */
export function slotsFromMasks(layers: readonly (readonly string[])[]): Slot[] {
  const slots: Slot[] = [];
  layers.forEach((rows, layer) => {
    rows.forEach((line, y) => {
      for (let x = 0; x < line.length; x++) {
        if (line[x] === '#') slots.push({ col: 2 * x, row: 2 * y, layer });
      }
    });
  });
  return slots;
}
