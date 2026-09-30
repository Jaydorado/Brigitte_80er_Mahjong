import type { LayoutId } from '../core/layout';
import { hashSeed } from '../core/rng';
import type { FaceId } from '../core/tiles';

export interface LevelDef {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  layoutId: LayoutId;
  faces: readonly FaceId[];
  clueIndex: 0 | 1 | 2 | 3 | 4 | 5;
  difficulty: 'leicht' | 'mittel' | 'schwer';
}

const range = (from: number, to: number): FaceId[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const levels: readonly LevelDef[] = [
  { id: 1, layoutId: 'rect', faces: [0, 1, 2, 3, 4, 27, 28, 29, 30], clueIndex: 0, difficulty: 'leicht' },
  { id: 2, layoutId: 'gift', faces: [...range(0, 8), 31, 32, 33], clueIndex: 1, difficulty: 'leicht' },
  { id: 3, layoutId: 'flower', faces: range(0, 17), clueIndex: 2, difficulty: 'mittel' },
  { id: 4, layoutId: 'balloons', faces: [...range(0, 17), ...range(27, 30), 31, 32], clueIndex: 3, difficulty: 'mittel' },
  { id: 5, layoutId: 'pyramid', faces: range(0, 33), clueIndex: 4, difficulty: 'schwer' },
  { id: 6, layoutId: 'eighty', faces: range(0, 33), clueIndex: 5, difficulty: 'schwer' },
];

export function attemptSeed(levelId: number, attempt: number): number {
  return hashSeed(levelId, attempt);
}
