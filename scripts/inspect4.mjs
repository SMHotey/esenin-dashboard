import { readFile } from 'node:fs/promises';
const c = JSON.parse(await readFile('data/raw-cache.json', 'utf8'));
for (const key of ['Черёмуха (Есенин)', 'Юность (Есенин)', 'Я пастух, мои палаты (Есенин)', 'Чёрный человек (Есенин)']) {
  const raw = c[key];
  console.log('\n\n=====', key, raw ? raw.length : 'MISSING');
  if (raw) console.log(raw.slice(0, 700));
}
