import { readFile } from 'node:fs/promises';
const c = JSON.parse(await readFile('data/raw-cache.json', 'utf8'));
const vals = Object.values(c);
let a = 0, b = 0, d = 0, onlyTemplate = 0;
for (const v of vals) {
  const hasTemplate = v.includes('{{poem|');
  const hasTag = v.includes('<poem>');
  if (hasTemplate) a++;
  if (hasTag) b++;
  if (!hasTemplate && !hasTag) d++;
  if (hasTemplate && !hasTag) onlyTemplate++;
}
console.log({ poemTemplate: a, poemTag: b, neither: d, onlyTemplate, total: vals.length });
const k = Object.keys(c).find((x) => x.includes('Анна Снегина'));
console.log('---', k);
console.log(c[k].slice(0, 600));
