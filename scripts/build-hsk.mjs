// Generates assets/hsk.json (word -> HSK 2.0 level) from the MIT-licensed
// https://github.com/drkameleon/complete-hsk-vocabulary dataset.
import { writeFile } from 'node:fs/promises';

const SOURCE =
  'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.min.json';

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Failed to fetch HSK data: ${res.status}`);
const entries = await res.json();

const levels = {};
for (const entry of entries) {
  // "o5" = old HSK (2.0) level 5, the 6-level scale most learner apps show.
  const old = entry.l.find((l) => l.startsWith('o'));
  if (old) levels[entry.s] = Number(old.slice(1));
}

const out = new URL('../assets/hsk.json', import.meta.url);
await writeFile(out, JSON.stringify(levels));
console.log(`Wrote ${Object.keys(levels).length} words to assets/hsk.json`);
