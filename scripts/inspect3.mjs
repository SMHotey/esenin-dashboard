import { readFile } from 'node:fs/promises';
import { cleanWiki } from './clean.mjs';
const c = JSON.parse(await readFile('data/raw-cache.json', 'utf8'));
const short = [];
for (const [k, v] of Object.entries(c)) {
  const t = cleanWiki(v);
  if (t.length < 30) short.push({ k, len: t.length, head: v.slice(0, 160).replace(/\n/g, '\\n') });
}
console.log('short:', short.length);
short.slice(0, 8).forEach((s) => console.log('\n', s.k, s.len, '\n', s.head));
console.log('\n--- Чёрный человек raw ---');
console.log(c['Чёрный человек (Есенин)'].slice(0, 900));
