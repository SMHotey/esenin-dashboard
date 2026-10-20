import { readFile } from 'node:fs/promises';
const c = JSON.parse(await readFile('data/raw-cache.json', 'utf8'));
const k = Object.keys(c).find((x) => x.startsWith('Берёза'));
console.log('KEY', k);
const raw = c[k];
console.log(raw.slice(raw.indexOf('{{poem')));
console.log('--- keys containing Чёрный:', Object.keys(c).filter((x) => x.includes('Чёрный')));
