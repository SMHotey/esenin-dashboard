import { readFile } from 'node:fs/promises';
const c = JSON.parse(await readFile('data/raw-cache.json', 'utf8'));
for (const k of ['Разбуди меня завтра рано (Есенин)', 'Буря воет, буря злится (Есенин)', 'Синий день. День такой синий (Есенин)', 'Русь уходящая (Есенин)']) {
  const raw = c[k];
  console.log('\n=====', k, raw.length);
  console.log(raw.slice(0, 500).replace(/\n/g, '⏎'));
  console.log('...TAIL:', raw.slice(-300).replace(/\n/g, '⏎'));
}
