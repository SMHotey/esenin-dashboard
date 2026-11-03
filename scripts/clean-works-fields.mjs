#!/usr/bin/env node
// Чистка полей «первая публикация» и «издание-источник» в data/works.json.
//
// Импорт с Викитеки притаскивает в `published` wiki-разметку: сноски <ref>,
// шаблоны {{Мир Божий|год=1897|номер=12|страницы=…}} и обрывки карточки
// («ИСТОЧНИК = »). В карточке произведения это выглядит как мусор, а не как
// библиографическая запись. У части произведений поле `source` пустое — тогда
// честно указываем Викитеку: откуда текст взяли, оттуда и ссылка.
//
// Запуск: node scripts/clean-works-fields.mjs [--dry]
// Логика совпадает с `cleanPublished` в scripts/import-works.mjs.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const FILE = join(ROOT, 'data', 'works.json');
const dry = process.argv.includes('--dry');

function cleanPublished(value) {
  let s = String(value || '');
  if (!s.trim()) return null;
  s = s.replace(/<ref[\s\S]*?<\/ref>/gi, ' ').replace(/<ref[^>]*\/>/gi, ' ');
  // Незакрытая сноска (импорт обрывал её на переносе строки) — режем до конца.
  s = s.replace(/<ref[\s\S]*$/i, ' ');
  s = s.replace(/\{\{\s*Мир Божий\s*\|([^{}]*)\}\}/gi, (_, body) => {
    const y = (body.match(/год\s*=\s*(\d{4})/) || [])[1];
    const n = (body.match(/номер\s*=\s*(\d+)/) || [])[1];
    const p = (body.match(/страницы\s*=\s*([^|]*)/) || [])[1];
    const page = p ? (p.match(/PA(\d+)/) || [])[1] : null;
    return `Мир Божий. ${y || ''}${n ? `. № ${n}` : ''}${page ? `. С. ${page}` : ''}`;
  });
  s = s.replace(/\{\{[^{}]*\}\}/g, ' ');
  s = s.replace(/\b(ИСТОЧНИК|ДАТАПУБЛИКАЦИИ)\b\s*=?/gi, ' ');
  s = s.replace(/&nbsp;/g, ' ').replace(/'''?/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  // Остатки карточки шаблона («| ИСТОЧНИК =», «| ЯЗЫКОРИГИНАЛА =»): знак равенства
  // в библиографической записи не встречается — значит, данных о публикации нет.
  if (s.includes('=')) return null;
  if (/^[\s|\-–—.,;:]+$/.test(s)) return null;
  return s || null;
}

const raw = JSON.parse(await readFile(FILE, 'utf8'));
const works = Array.isArray(raw) ? raw : raw.works;

let pubs = 0;
let sources = 0;
const samples = [];
for (const w of works) {
  const before = w.published;
  const after = cleanPublished(before);
  if ((before || null) !== after) {
    pubs += 1;
    if (samples.length < 8) samples.push(`${w.title}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    w.published = after;
  }
  if (!String(w.source || '').trim()) {
    w.source = 'Викитека: страница произведения (ru.wikisource.org)';
    sources += 1;
  }
}

console.log(`поле «первая публикация» поправлено: ${pubs}`);
samples.forEach((s) => console.log('  ' + s));
console.log(`пустое издание-источник заполнено: ${sources}`);

if (dry) {
  console.log('--dry: файл не изменён');
} else {
  await writeFile(FILE, JSON.stringify(Array.isArray(raw) ? works : raw, null, 1), 'utf8');
  console.log('data/works.json обновлён');
}
