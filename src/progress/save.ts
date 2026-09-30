/**
 * The device-local save for Brigittes Mahjong: which levels are won, whether the welcome and
 * tutorial were seen, and how many attempts each level has cost.
 *
 * Anything unreadable, of the wrong shape, or of an unknown version falls back to a fresh save, so
 * a half-written or older payload can never block the game.
 */

export interface SaveV1 {
  readonly version: 1;
  readonly won: readonly number[];
  readonly welcomeSeen: boolean;
  readonly tutorialDone: boolean;
  readonly attempts: Readonly<Record<number, number>>;
}

export const SAVE_KEY = 'mahjong80.save';

/** The six levels of the game; the unlock walk stops here. */
const LEVEL_COUNT = 6;

export function freshSave(): SaveV1 {
  return { version: 1, won: [], welcomeSeen: false, tutorialDone: false, attempts: {} };
}

const isInt = (v: unknown): v is number => Number.isInteger(v);

function isSave(v: unknown): v is SaveV1 {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return false;
  if (!Array.isArray(o.won) || !o.won.every((n) => isInt(n) && n >= 1 && n <= LEVEL_COUNT)) return false;
  if (typeof o.welcomeSeen !== 'boolean' || typeof o.tutorialDone !== 'boolean') return false;
  if (typeof o.attempts !== 'object' || o.attempts === null || Array.isArray(o.attempts)) return false;
  for (const [k, n] of Object.entries(o.attempts)) {
    if (!/^\d+$/.test(k) || !isInt(n) || n < 0) return false;
  }
  return true;
}

export function loadSave(storage: Storage): SaveV1 {
  const raw = storage.getItem(SAVE_KEY);
  if (raw === null) return freshSave();
  try {
    const v: unknown = JSON.parse(raw);
    return isSave(v) ? v : freshSave();
  } catch {
    return freshSave();
  }
}

export function writeSave(storage: Storage, s: SaveV1): void {
  storage.setItem(SAVE_KEY, JSON.stringify(s));
}

/** The highest playable level: one past the highest win, clamped to the last level. */
export function unlocked(s: SaveV1): number {
  return Math.min(LEVEL_COUNT, Math.max(0, ...s.won) + 1);
}

/** The level to offer next: the lowest unlocked level not yet won, or `null` when all are won. */
export function currentLevel(s: SaveV1): number | null {
  const limit = unlocked(s);
  for (let level = 1; level <= limit; level++) {
    if (!s.won.includes(level)) return level;
  }
  return null;
}

/** Counts one more attempt on a level and returns the new count together with the updated save. */
export function nextAttempt(s: SaveV1, levelId: number): { save: SaveV1; attempt: number } {
  const attempt = (s.attempts[levelId] ?? 0) + 1;
  return { save: { ...s, attempts: { ...s.attempts, [levelId]: attempt } }, attempt };
}

export function markWon(s: SaveV1, levelId: number): SaveV1 {
  if (s.won.includes(levelId)) return s;
  return { ...s, won: [...s.won, levelId] };
}
