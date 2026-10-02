import { describe, expect, it } from 'vitest';
import { isCorrectAnswer } from './answer';

const CORRECT = [
  'Gmunden',
  'gmünden',
  'GMUNDEN!',
  'Reise nach Gmunden',
  'Reise Gmunden',
  'Gemunden',
  'Gmundn',
  'Gmünd',
  'nach gmunden am traunsee',
  'Traunsee',
  'Traun See',
  'Schloss Orth',
  'Seeschloss Ort',
  'Schloss am Ort',
  'Schloss Ort am See',
  'Schloss Orth am Traunsee',
  'orth',
];

const WRONG = [
  '',
  '   ',
  'Ort',
  'Wien',
  'München',
  'Muenchen',
  'Salzburg',
  'Graz',
  'Linz',
  'Gaming',
  'Gänserndorf',
  'gefunden',
  'gebunden',
  'gesunden',
  'Gründen',
  'Aus guten Gründen nach Wien',
  'Ich habe die Antwort gefunden: Wien',
  'Das Schloss Ortner',
  'Schloss Ortenberg',
  'Orth an der Donau',
  'Seeschloss Monrepos',
];

describe('isCorrectAnswer', () => {
  it.each(CORRECT)('accepts %j', (input) => {
    expect(isCorrectAnswer(input)).toBe(true);
  });

  it.each(WRONG)('rejects %j', (input) => {
    expect(isCorrectAnswer(input)).toBe(false);
  });
});
