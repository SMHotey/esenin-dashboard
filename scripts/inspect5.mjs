import { readFile } from 'node:fs/promises';
import { cleanWiki } from './clean.mjs';
const c = JSON.parse(await readFile('data/raw-cache.json', 'utf8'));
for (const k of ['Поэтам Грузии (Есенин)', 'Спит ковыль. Равнина дорогая (Есенин)', 'Сыплет черёмуха снегом (Есенин)']) {
  const raw = c[k];
  console.log('\n=====', k, raw ? raw.length : 'MISSING', '->', raw ? cleanWiki(raw).length : 0);
  if (raw) console.log(raw.slice(0, 600));
}
