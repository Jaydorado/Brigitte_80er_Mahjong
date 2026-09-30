import { freeSlots, type LayoutIndex } from './layout';
import type { Board } from './deal';

/** Exhaustive DFS with a memo of dead occupancies. Test oracle for boards of ≤ 16 tiles only. */
export function solvable(idx: LayoutIndex, board: Board): boolean {
  const occ = board.occupied.slice();
  const dead = new Set<string>();
  const dfs = (): boolean => {
    if (!occ.includes(true)) return true;
    const key = occ.map((o) => (o ? '1' : '0')).join('');
    if (dead.has(key)) return false;
    const free = freeSlots(idx, occ);
    for (let a = 0; a < free.length; a++) {
      for (let b = a + 1; b < free.length; b++) {
        if (board.faceAt[free[a]] !== board.faceAt[free[b]]) continue;
        occ[free[a]] = false;
        occ[free[b]] = false;
        const won = dfs();
        occ[free[a]] = true;
        occ[free[b]] = true;
        if (won) return true;
      }
    }
    dead.add(key);
    return false;
  };
  return dfs();
}
