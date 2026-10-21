import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { cleanWiki, yearFrom } from './clean.mjs';

const CACHE = 'data/raw-cache.json';
const GENRES = {
  'Малые поэмы': 'Малая поэма',
  'Поэмы': 'Поэма',
  'Художественная проза': 'Проза',
  'Письма': 'Письмо',
  'Автобиографии': 'Автобиография',
  'Статьи, заметки, ответы на вопросы анкет': 'Статья',
};

function slugify(s) {
  return s.toLowerCase().replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 90);
}

const cache = JSON.parse(await readFile(CACHE, 'utf8'));
const genreMap = existsSync('data/genre-map.json')
  ? JSON.parse(await readFile('data/genre-map.json', 'utf8')) : {};

const works = [];
for (const [title, raw] of Object.entries(cache)) {
  const text = cleanWiki(raw);
  if (text.length < 30) { console.warn('short', text.length, title); continue; }
  const name = title.replace(/\s*\(Есенин\)$/, '').replace(/\s*\([^)]*\)$/, '');
  works.push({
    title: name,
    slug: slugify(name),
    genre: genreMap[title] || 'Стихотворение',
    year: yearFrom(raw),
    published: (raw.match(/\|\s*ДАТАПУБЛИКАЦИИ\s*=\s*([^\n]*)/i) || [])[1] || null,
    text,
    chars: text.length,
    sourceUrl: `https://ru.wikisource.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    source: (raw.match(/\|\s*ИСТОЧНИК\s*=\s*([^\n]*)/i) || [])[1] || null,
  });
}

const seen = new Set();
const unique = works.filter((w) => { if (seen.has(w.slug)) return false; seen.add(w.slug); return true; });

// Дополнительные тексты, которых нет в вики-кэше (например, автобиографии 1916—1925 годов).
// Файл необязательный: без него сборка работает как раньше.
if (existsSync('data/extra-works.json')) {
  const extra = JSON.parse(await readFile('data/extra-works.json', 'utf8'));
  for (const e of extra) {
    if (!e.slug || !e.text) continue;
    if (unique.some((w) => w.slug === e.slug)) continue;
    unique.push({ ...e, chars: e.text.length });
  }
}

unique.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title, 'ru'));

await mkdir('data', { recursive: true });
await writeFile('data/works.json', JSON.stringify(unique, null, 1), 'utf8');

const byGenre = {};
unique.forEach((w) => (byGenre[w.genre] = (byGenre[w.genre] || 0) + 1));
console.log('written:', unique.length, byGenre, 'noYear:', unique.filter((w) => !w.year).length);
