import { isFree, type Layout, type LayoutIndex, type Pair } from './layout';
import { mulberry32, randInt, shuffleInPlace, type Rng } from './rng';
import type { FaceId } from './tiles';

export interface Board { occupied: boolean[]; faceAt: FaceId[] } // faceAt[i] meaningful only where occupied[i]

/** moves === null → in place (only faces changed); otherwise every remaining tile's from → to slot. */
export interface ShuffleResult { board: Board; witness: Pair[]; moves: { from: number; to: number }[] | null }

/**
 * Random removal order of the occupied set: each try repeatedly removes two distinct random free
 * slots; a try fails when fewer than two are free before the set is empty. Never mutates `occupied`.
 */
export function peel(idx: LayoutIndex, occupied: readonly boolean[], rng: Rng, maxTries: number): Pair[] | null {
  const n = occupied.length;
  let count = 0;
  for (let i = 0; i < n; i++) if (occupied[i]) count++;
  if (count === 0) return [];
  if (count % 2 !== 0) return null; // a lone tile always remains
  const occ = occupied.slice();
  const free: number[] = []; // reused per step; same ascending order as freeSlots()
  const picked = new Array<number>(count);
  for (let t = 0; t < maxTries; t++) {
    if (t > 0) for (let i = 0; i < n; i++) occ[i] = occupied[i];
    let k = 0;
    while (k < count) {
      free.length = 0;
      for (let i = 0; i < n; i++) if (occ[i] && isFree(i, idx, occ)) free.push(i);
      if (free.length < 2) break;
      const a = randInt(rng, free.length);
      let b = randInt(rng, free.length - 1);
      if (b >= a) b++;
      picked[k++] = free[a];
      picked[k++] = free[b];
      occ[free[a]] = false;
      occ[free[b]] = false;
    }
    if (k === count) {
      const order: Pair[] = [];
      for (let p = 0; p < count; p += 2) order.push([picked[p], picked[p + 1]]);
      return order;
    }
  }
  return null;
}

/**
 * One face per removal pair: round-robin over a shuffled copy of `faces` (per-face pair counts differ
 * by ≤ 1), then the pair faces are shuffled onto the pairs. Slots outside `order` get face 0.
 */
export function assignFaces(order: readonly Pair[], faces: readonly FaceId[], rng: Rng, slotCount: number): FaceId[] {
  if (faces.length === 0 && order.length > 0) throw new Error('assignFaces: no faces');
  const deck = shuffleInPlace(faces.slice(), rng);
  const pairFaces = shuffleInPlace(order.map((_, k) => deck[k % deck.length]), rng);
  const faceAt = new Array<FaceId>(slotCount).fill(0);
  for (let k = 0; k < order.length; k++) {
    faceAt[order[k][0]] = pairFaces[k];
    faceAt[order[k][1]] = pairFaces[k];
  }
  return faceAt;
}

export function deal(layout: Layout, idx: LayoutIndex, faces: readonly FaceId[], seed: number): { board: Board; witness: Pair[] } {
  const rng = mulberry32(seed);
  const occupied = layout.slots.map(() => true);
  const witness = peel(idx, occupied, rng, 1000) ?? layout.certificate.slice();
  const faceAt = assignFaces(witness, faces, rng, layout.slots.length);
  return { board: { occupied, faceAt }, witness };
}

/**
 * Mischen: same face multiset, always solvable. In place if a peel of the current occupancy is found
 * within 200 tries; otherwise the tiles relocate onto the slots of the certificate's last m pairs,
 * whose suffix is then a valid removal order. Never mutates `board`.
 */
export function shuffleBoard(layout: Layout, idx: LayoutIndex, board: Board, seed: number): ShuffleResult {
  const rng = mulberry32(seed);
  const n = board.occupied.length;

  const faceCount = new Map<FaceId, number>();
  for (let i = 0; i < n; i++) {
    if (board.occupied[i]) faceCount.set(board.faceAt[i], (faceCount.get(board.faceAt[i]) ?? 0) + 1);
  }
  const pairFaces: FaceId[] = [];
  for (const [face, c] of faceCount) {
    if (c % 2 !== 0) throw new Error(`shuffleBoard: face ${face} has an odd tile count (${c})`);
    for (let p = 0; p < c / 2; p++) pairFaces.push(face);
  }

  let witness = peel(idx, board.occupied, rng, 200);
  let occupied: boolean[];
  let moves: { from: number; to: number }[] | null = null;
  if (witness) {
    occupied = board.occupied.slice();
  } else {
    const cert = layout.certificate;
    const m = pairFaces.length;
    if (m > cert.length) throw new Error('shuffleBoard: more pairs remain than the certificate holds');
    witness = cert.slice(cert.length - m);
    occupied = new Array<boolean>(n).fill(false);
    const to: number[] = [];
    for (const [a, b] of witness) {
      occupied[a] = true;
      occupied[b] = true;
      to.push(a, b);
    }
    const from: number[] = [];
    for (let i = 0; i < n; i++) if (board.occupied[i]) from.push(i);
    const s = layout.slots;
    const byPosition = (i: number, j: number) =>
      s[i].layer - s[j].layer || s[i].row - s[j].row || s[i].col - s[j].col || i - j;
    from.sort(byPosition);
    to.sort(byPosition);
    moves = from.map((f, k) => ({ from: f, to: to[k] }));
  }

  shuffleInPlace(pairFaces, rng);
  const faceAt = board.faceAt.slice();
  for (let k = 0; k < witness.length; k++) {
    faceAt[witness[k][0]] = pairFaces[k];
    faceAt[witness[k][1]] = pairFaces[k];
  }
  return { board: { occupied, faceAt }, witness, moves };
}

/** True iff each pair, in order, is two occupied, free, same-face slots at its step, and the board ends empty. */
export function replayLegal(idx: LayoutIndex, board: Board, order: readonly Pair[]): boolean {
  const occ = board.occupied.slice();
  for (const [a, b] of order) {
    if (a === b || !occ[a] || !occ[b]) return false;
    if (board.faceAt[a] !== board.faceAt[b]) return false;
    if (!isFree(a, idx, occ) || !isFree(b, idx, occ)) return false;
    occ[a] = false;
    occ[b] = false;
  }
  return !occ.includes(true);
}
