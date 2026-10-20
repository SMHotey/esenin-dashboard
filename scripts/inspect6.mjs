import { readFile } from 'node:fs/promises';
const c = JSON.parse(await readFile('data/raw-cache.json', 'utf8'));
for (const k of Object.keys(c).filter((x) => x.startsWith('До свиданья') || x.startsWith('Русь советская'))) {
  const raw = c[k];
  console.log('\n=====', k, raw.length);
  console.log(raw.slice(raw.indexOf('}}') + 2, raw.indexOf('}}') + 900));
  console.log('...TAIL...');
  console.log(raw.slice(-500));
}
