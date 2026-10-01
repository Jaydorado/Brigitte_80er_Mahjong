const TARGET = 'gmunden';
const MAX_DISTANCE = 2;

const SCHLOSS_PHRASES: readonly (readonly string[])[] = [
  ['schloss', 'ort'],
  ['schloss', 'orth'],
  ['seeschloss', 'ort'],
  ['seeschloss', 'orth'],
  ['schloss', 'am', 'ort'],
];

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .split(' ')
    .filter((t) => t.length > 0);
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost));
    }
    prev = row;
  }
  return prev[b.length];
}

function hasGmunden(tokens: string[]): boolean {
  return tokens.some(
    (t) =>
      t === 'gemunden' ||
      (t.startsWith('gm') && levenshtein(t, TARGET) <= MAX_DISTANCE),
  );
}

function hasTraunsee(tokens: string[]): boolean {
  return tokens.some(
    (t, i) => t === 'traunsee' || (t === 'traun' && tokens[i + 1] === 'see'),
  );
}

// Rule 4: the closing `ort`/`orth` token counts only when it is the final token
// or the next token contains no letter (digits only). Tokens are compared whole,
// so "Ortner" never matches; "Schloss Ort am See" is therefore wrong.
function hasSchlossPhrase(tokens: string[]): boolean {
  return SCHLOSS_PHRASES.some((phrase) =>
    tokens.some((_, start) => {
      if (!phrase.every((p, k) => tokens[start + k] === p)) return false;
      const next = tokens[start + phrase.length];
      return next === undefined || !/[a-z]/.test(next);
    }),
  );
}

export function isCorrectAnswer(input: string): boolean {
  const tokens = tokenize(input);
  if (tokens.length === 1 && tokens[0] === 'orth') return true;
  return hasGmunden(tokens) || hasTraunsee(tokens) || hasSchlossPhrase(tokens);
}
