import { describe, expect, it } from 'vitest';
import { currentLevel, freshSave, loadSave, markSolved, markWon, nextAttempt, SAVE_KEY, unlocked, writeSave, type SaveV1 } from './save';

/** In-memory `Storage` so the tests never touch the DOM or a real origin's storage. */
class MemoryStorage implements Storage {
  private readonly m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(key: string): string | null {
    return this.m.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.m.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.m.delete(key);
  }
  setItem(key: string, value: string): void {
    this.m.set(key, value);
  }
}

describe('freshSave', () => {
  it('is an empty version 1 save under the mahjong80.save key', () => {
    expect(SAVE_KEY).toBe('mahjong80.save');
    expect(freshSave()).toEqual({ version: 1, won: [], welcomeSeen: false, tutorialDone: false, attempts: {} });
  });
});

describe('storage round trip', () => {
  it('writes and reads back the same save', () => {
    const storage = new MemoryStorage();
    const save = { ...freshSave(), won: [1, 2], welcomeSeen: true, attempts: { 3: 2 } };
    writeSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
    expect(storage.getItem(SAVE_KEY)).toBe(JSON.stringify(save));
  });

  it('returns a fresh save when nothing is stored', () => {
    expect(loadSave(new MemoryStorage())).toEqual(freshSave());
  });
});

describe('loadSave validation', () => {
  const cases: Record<string, string> = {
    'corrupt JSON': '{nope',
    'wrong shape (won is a string)': JSON.stringify({ ...freshSave(), won: 'x' }),
    'unknown version': JSON.stringify({ ...freshSave(), version: 2 }),
    'missing field': JSON.stringify({ version: 1, won: [] }),
    'a win beyond level 8': JSON.stringify({ ...freshSave(), won: [1, 9] }),
    'solved: false': JSON.stringify({ ...freshSave(), solved: false }),
    'solved: "false"': JSON.stringify({ ...freshSave(), solved: 'false' }),
    'solved: {}': JSON.stringify({ ...freshSave(), solved: {} }),
  };

  for (const [name, raw] of Object.entries(cases)) {
    it(`falls back to a fresh save for ${name}`, () => {
      const storage = new MemoryStorage();
      storage.setItem(SAVE_KEY, raw);
      expect(loadSave(storage)).toEqual(freshSave());
    });
  }

  it('falls back to a fresh save for a win list longer than the eight levels, and never throws', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...freshSave(), won: Array(10_000).fill(1) }));
    const loaded = loadSave(storage);
    expect(loaded).toEqual(freshSave());
    expect(() => unlocked(loaded)).not.toThrow();
    expect(unlocked(loaded)).toBe(1);
  });

  it('falls back to a fresh save for a win list with a duplicate level', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...freshSave(), won: [1, 1, 2] }));
    expect(loadSave(storage)).toEqual(freshSave());
    expect(unlocked({ ...freshSave(), won: [1, 1, 2] })).toBe(3);
  });

  it('accepts every level 1…8 as won', () => {
    const storage = new MemoryStorage();
    const save = { ...freshSave(), won: [8, 1, 2, 3, 4, 5, 6, 7] };
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    expect(loadSave(storage)).toEqual(save);
  });

  it('loads an old all-six save unchanged: levels 1–6 count as won and level 7 is next', () => {
    const storage = new MemoryStorage();
    const old = { version: 1, won: [1, 2, 3, 4, 5, 6], welcomeSeen: true, tutorialDone: true, attempts: { 1: 2, 6: 4 } };
    storage.setItem(SAVE_KEY, JSON.stringify(old));
    const loaded = loadSave(storage);
    expect(loaded).toEqual(old);
    expect(unlocked(loaded)).toBe(7);
    expect(currentLevel(loaded)).toBe(7);
  });
});

describe('unlocked', () => {
  it('is 1 with nothing won', () => {
    expect(unlocked(freshSave())).toBe(1);
  });

  it('is the highest won level plus one', () => {
    expect(unlocked({ ...freshSave(), won: [1, 2] })).toBe(3);
  });

  it('stops at level 8 when every level is won', () => {
    expect(unlocked({ ...freshSave(), won: [1, 2, 3, 4, 5, 6, 7, 8] })).toBe(8);
  });
});

describe('currentLevel', () => {
  it('is the lowest open level', () => {
    expect(currentLevel({ ...freshSave(), won: [1, 2] })).toBe(3);
  });

  it('skips a won level that is not the highest', () => {
    expect(currentLevel({ ...freshSave(), won: [1, 3] })).toBe(2);
  });

  it('is null once all eight levels are won', () => {
    expect(currentLevel({ ...freshSave(), won: [1, 2, 3, 4, 5, 6, 7, 8] })).toBeNull();
  });
});

describe('nextAttempt', () => {
  it('counts 1, then 2 for the same level', () => {
    const first = nextAttempt(freshSave(), 3);
    expect(first.attempt).toBe(1);
    const second = nextAttempt(first.save, 3);
    expect(second.attempt).toBe(2);
  });

  it('counts levels independently and persists the count', () => {
    const storage = new MemoryStorage();
    const one = nextAttempt(freshSave(), 3);
    const two = nextAttempt(one.save, 4);
    writeSave(storage, two.save);
    expect(loadSave(storage).attempts).toEqual({ 3: 1, 4: 1 });
  });

  it('persists the second attempt for the same level', () => {
    const storage = new MemoryStorage();
    const first = nextAttempt(freshSave(), 3);
    const second = nextAttempt(first.save, 3);
    expect(second.attempt).toBe(2);
    writeSave(storage, second.save);
    expect(loadSave(storage).attempts).toEqual({ 3: 2 });
  });
});

describe('markWon', () => {
  it('adds the level once however often it is called', () => {
    const once = markWon(freshSave(), 2);
    expect(once.won).toEqual([2]);
    expect(markWon(once, 2)).toEqual(once);
  });
});

describe('solved', () => {
  const allWon = (): SaveV1 => ({ ...freshSave(), won: [1, 2, 3, 4, 5, 6, 7, 8] });

  it('is absent on a fresh save and set by markSolved', () => {
    expect('solved' in freshSave()).toBe(false);
    expect(markSolved(allWon())).toEqual({ ...allWon(), solved: true });
  });

  it('solved: true round-trips through storage', () => {
    const storage = new MemoryStorage();
    const save = markSolved(allWon());
    writeSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
    expect(loadSave(storage).solved).toBe(true);
  });

  it('level writes keep it', () => {
    const storage = new MemoryStorage();
    const solved = markSolved(allWon());
    const replayed = nextAttempt(solved, 3).save;
    writeSave(storage, markWon(replayed, 3));
    expect(loadSave(storage).solved).toBe(true);
    expect(loadSave(storage).attempts).toEqual({ 3: 1 });
  });
});
