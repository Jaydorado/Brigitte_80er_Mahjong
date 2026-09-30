// npm run certify            → print fresh certificates as a TS literal to paste into src/core/layouts.ts
// npm run certify -- --check → exit 1 if any stored certificate fails to replay on the full board
import { peel, replayLegal } from '../src/core/deal';
import { buildIndex, type LayoutId, type Pair } from '../src/core/layout';
import { layouts } from '../src/core/layouts';
import { mulberry32 } from '../src/core/rng';

const check = process.argv.includes('--check');
const entries = Object.values(layouts);

if (check) {
  let failed = false;
  for (const L of entries) {
    const board = { occupied: L.slots.map(() => true), faceAt: L.slots.map(() => 0) };
    const ok = replayLegal(buildIndex(L.slots), board, L.certificate);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${L.id} (${L.slots.length} tiles, ${L.certificate.length} pairs)`);
    if (!ok) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

const certs: Partial<Record<LayoutId, Pair[]>> = {};
for (const L of entries) {
  const order = peel(buildIndex(L.slots), L.slots.map(() => true), mulberry32(2026), 100000);
  if (!order) {
    console.error(`no removal order found for ${L.id}`);
    process.exit(1);
  }
  certs[L.id] = order;
}

const PAIRS_PER_LINE = 12;
const lines = entries.map((L) => {
  const pairs = certs[L.id]!.map(([a, b]) => `[${a}, ${b}]`);
  const rows: string[] = [];
  for (let i = 0; i < pairs.length; i += PAIRS_PER_LINE) rows.push(`    ${pairs.slice(i, i + PAIRS_PER_LINE).join(', ')},`);
  return `  ${L.id}: [\n${rows.join('\n')}\n  ],`;
});
console.log(`const certificates: Record<LayoutId, Pair[]> = {\n${lines.join('\n')}\n};`);
