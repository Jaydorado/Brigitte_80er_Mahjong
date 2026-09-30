import { describe, expect, it } from 'vitest';
import { hashSeed, mulberry32, shuffleInPlace } from './rng';

describe('rng', () => {
  it('same seed gives the same sequence', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const sa = Array.from({ length: 5 }, () => a());
    const sb = Array.from({ length: 5 }, () => b());
    expect(sa).toEqual(sb);
  });
  it('hashSeed is order-sensitive', () => {
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
  });
  it('shuffleInPlace is a permutation', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffleInPlace([...input], mulberry32(7));
    expect([...out].sort((x, y) => x - y)).toEqual(input);
  });
});
