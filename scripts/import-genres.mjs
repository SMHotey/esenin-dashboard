import { writeFile } from 'node:fs/promises';
import { wikitext } from './wiki.mjs';

const AUTHOR = 'Автор:Сергей Александрович Есенин';
const GENRES = {
  'Малые поэмы': 'Малая поэма',
  'Поэмы': 'Поэма',
  'Художественная проза': 'Проза',
  'Письма': 'Письмо',
  'Автобиографии': 'Автобиография',
  'Статьи, заметки, ответы на вопросы анкет': 'Статья',
};

function sections(text) {
  const lines = text.split('\n');
  let h2 = '', h3 = '';
  const out = [];
  for (const line of lines) {
    const m3 = line.match(/^===\s*([^=]+?)\s*===\s*$/);
    const m2 = line.match(/^==\s*([^=]+?)\s*==\s*$/);
    if (m3) { h3 = m3[1]; continue; }
    if (m2) { h2 = m2[1]; h3 = ''; continue; }
    out.push({ line, h2, h3 });
  }
  return out;
}

function links(line) {
  const items = [];
  let m;
  const re2 = /\{\{2О\|([^|}]+)\|([^|}]+)\}\}/g;
  while ((m = re2.exec(line))) items.push({ target: m[1].trim(), label: m[2].trim() });
  const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
  while ((m = re.exec(line))) {
    const target = m[1].trim();
    if (/^(Категория|Файл|Image|Изображение):/i.test(target)) continue;
    items.push({ target, label: (m[2] || target).trim() });
  }
  return items;
}

const author = await wikitext(AUTHOR);
const map = {};
for (const { line, h2, h3 } of sections(author)) {
  const genre = GENRES[h3] || GENRES[h2];
  if (!genre || (!line.startsWith('*') && !line.includes('{{2О'))) continue;
  for (const { target } of links(line)) {
    if (!/\(Есенин\)$/.test(target)) continue;
    map[target] = genre;
  }
}
await writeFile('data/genre-map.json', JSON.stringify(map, null, 1), 'utf8');
console.log('genre map:', Object.keys(map).length);
