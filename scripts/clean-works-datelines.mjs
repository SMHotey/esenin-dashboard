#!/usr/bin/env node
// Чистка хвостовых подписей-дат в текстах библиотеки.
//
// На Викитеке под стихотворением стоит подпись «|1886—1889» или «|28 марта 1886».
// Импорт привозил её строкой, начинающейся с вертикальной черты, и она попадала
// на страницу произведения как последняя строка — мусор в конце текста.
//
// Правило то же, что в импортёре (`stripTrailingDatelines` в import-works.mjs):
// с конца текста снимаются пустые строки и строки, начинающиеся с «|».
//
// Запуск: node scripts/clean-works-datelines.mjs [--dry]
// Пересчитывает `chars` и пишет data/works.json.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const FILE = join(ROOT, 'data', 'works.json');
const dry = process.argv.includes('--dry');

const raw = JSON.parse(await readFile(FILE, 'utf8'));
const works = Array.isArray(raw) ? raw : raw.works;

// Интервики-хвосты («sr:Црни човек», «en:The Black Man») — остаток разметки
// Викитеки, а не текст произведения. Снимаем их до чистки подписей, иначе
// подпись-дата оказывается не последней строкой и остаётся в тексте.
const INTERWIKI = /^[a-z]{2,3}:[^\n]*$/gim;

let touched = 0;
const samples = [];
for (const w of works) {
  const original = String(w.text || '');
  const before = original.replace(INTERWIKI, '').replace(/\n{3,}/g, '\n\n').trim();
  const lines = before.split('\n');
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1] || '';
    if (!line.trim()) { end -= 1; continue; }
    if (/^\s*\|/.test(line)) { end -= 1; continue; }
    break;
  }
  if (before === original && end === lines.length) continue;
  touched += 1;
  const cut = lines.slice(end).filter((l) => l.trim()).join(' ');
  if (samples.length < 10) samples.push(`${w.title} — снято: ${JSON.stringify(cut)}`);
  w.text = lines.slice(0, end).join('\n').trim();
  w.chars = w.text.length;
}

console.log(`произведений с подписью в конце: ${touched} из ${works.length}`);
samples.forEach((s) => console.log('  ' + s));
if (dry) {
  console.log('--dry: файл не изменён');
} else {
  await writeFile(FILE, JSON.stringify(Array.isArray(raw) ? works : raw, null, 1), 'utf8');
  console.log('data/works.json обновлён');
}
