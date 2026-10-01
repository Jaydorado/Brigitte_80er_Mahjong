import { describe, expect, it } from 'vitest';
import { clues, credit, finale, reveal, TEXTS_FINAL, welcome } from './content';

describe('content', () => {
  it('has eight non-empty clues and non-empty texts', () => {
    expect(clues).toHaveLength(8);
    for (const s of [...clues, welcome.title, welcome.message, finale, credit, reveal.title, reveal.message])
      expect(s.trim().length).toBeGreaterThan(0);
  });
  it.skipIf(process.env.RELEASE !== '1')('texts are approved by the family (release check)', () => {
    expect(TEXTS_FINAL).toBe(true);
  });
});
