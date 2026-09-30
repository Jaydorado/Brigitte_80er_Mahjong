import { describe, expect, it } from 'vitest';
import { currentLevel, freshSave, loadSave, markWon, nextAttempt, SAVE_KEY, unlocked, writeSave } from './save';

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
  };

  for (const [name, raw] of Object.entries(cases)) {
    it(`falls back to a fresh save for ${name}`, () => {
      const storage = new MemoryStorage();
      storage.setItem(SAVE_KEY, raw);
      expect(loadSave(storage)).toEqual(freshSave());
    });
  }
});

describe('unlocked', () => {
  it('is 1 with nothing won', () => {
    expect(unlocked(freshSave())).toBe(1);
  });

  it('is the highest won level plus one', () => {
    expect(unlocked({ ...freshSave(), won: [1, 2] })).toBe(3);
  });

  it('stops at level 6 when every level is won', () => {
    expect(unlocked({ ...freshSave(), won: [1, 2, 3, 4, 5, 6] })).toBe(6);
  });
});

describe('currentLevel', () => {
  it('is the lowest open level', () => {
    expect(currentLevel({ ...freshSave(), won: [1, 2] })).toBe(3);
  });

  it('skips a won level that is not the highest', () => {
    expect(currentLevel({ ...freshSave(), won: [1, 3] })).toBe(2);
  });

  it('is null once all six levels are won', () => {
    expect(currentLevel({ ...freshSave(), won: [1, 2, 3, 4, 5, 6] })).toBeNull();
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
});

describe('markWon', () => {
  it('adds the level once however often it is called', () => {
    const once = markWon(freshSave(), 2);
    expect(once.won).toEqual([2]);
    expect(markWon(once, 2)).toEqual(once);
  });
});
