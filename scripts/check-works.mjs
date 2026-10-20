import { readFile } from 'node:fs/promises';
const works = JSON.parse(await readFile('data/works.json', 'utf8'));

console.log('total', works.length);
console.log('noYear:', works.filter((w) => !w.year).map((w) => w.title));
console.log('artifacts:', works.filter((w) => /\{\{|\}\}|\[\[|\]\]|Категория:|<div|<span|&nbsp;/.test(w.text)).map((w) => w.title));

const poems = works.filter((w) => w.genre === 'Стихотворение');
const avg = Math.round(poems.reduce((s, w) => s + w.chars, 0) / poems.length);
console.log('poems', poems.length, 'avg chars', avg, 'min', Math.min(...poems.map(w => w.chars)), 'max', Math.max(...poems.map(w => w.chars)));
console.log('longest poems:', poems.slice().sort((a, b) => b.chars - a.chars).slice(0, 5).map((w) => `${w.title}:${w.chars}`));
console.log('shortest poems:', poems.slice().sort((a, b) => a.chars - b.chars).slice(0, 5).map((w) => `${w.title}:${w.chars}`));

for (const n of ['Берёза', 'Черёмуха', 'Спит ковыль. Равнина дорогая', 'Чёрный человек', 'Анна Снегина']) {
  const w = works.find((x) => x.title.startsWith(n));
  console.log('\n===', n, w && { year: w.year, genre: w.genre, chars: w.chars });
  if (w) console.log(w.text.slice(0, 200).replace(/\n/g, '⏎'));
}
