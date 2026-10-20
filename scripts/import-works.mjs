import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { wikitext, api } from './wiki.mjs';

const AUTHOR = 'Автор:Сергей Александрович Есенин';
const CACHE = 'data/raw-cache.json';

const GENRES = {
  'Малые поэмы': 'Малая поэма',
  'Поэмы': 'Поэма',
  'Художественная проза': 'Проза',
  'Письма': 'Письмо',
  'Автобиографии': 'Автобиография',
  'Статьи, заметки, ответы на вопросы анкет': 'Статья',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sectionMap(text) {
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

function linksFromLine(line) {
  const items = [];
  let m;
  const re2 = /\{\{2О\|([^|}]+)\|([^|}]+)\}\}/g;
  while ((m = re2.exec(line))) items.push({ target: m[1].trim(), label: m[2].trim() });
  const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
  while ((m = re.exec(line))) {
    const target = m[1].trim();
    if (/^(Категория|Файл|Image|Изображение):/i.test(target)) continue;
    items.push({ target, label: (m[2] || target).replace(/'''?/g, '').trim() });
  }
  return items;
}

function cleanWiki(raw) {
  let t = raw;
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*\/>/g, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  let prev;
  do { prev = t; t = t.replace(/\{\{[^{}]*\}\}/g, ''); } while (t !== prev);
  t = t.replace(/\[\[(?:Категория|Файл|Image|Изображение):[^\]]*\]\]/gi, '');
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1');
  t = t.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1');
  t = t.replace(/\[https?:\/\/[^\]]+\]/g, '');
  t = t.replace(/'''?/g, '');
  t = t.replace(/<\/?poem[^>]*>/gi, '');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/?(?:center|div|span|small|big|p|i|b|u|sup|sub|blockquote)[^>]*>/gi, '\n');
  t = t.replace(/^__[A-Z]+__$/gm, '');
  t = t.replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
       .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  t = t.split('\n').map((l) => l.replace(/[ \t]+$/g, '')).join('\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function templateField(raw, name) {
  const m = raw.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n]*)`, 'i'));
  return m ? m[1].trim() : '';
}

function slugify(s) {
  return s.toLowerCase().replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 90);
}

async function fetchPages(titles, cache) {
  const missing = titles.filter((t) => !cache[t]);
  console.log(`to fetch: ${missing.length} of ${titles.length}`);
  for (let i = 0; i < missing.length; i += 10) {
    const chunk = missing.slice(i, i + 10);
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      try {
        const data = await api({
          action: 'query', prop: 'revisions', rvslots: 'main', rvprop: 'content',
          titles: chunk.join('|'), redirects: '1',
        });
        const redirects = data.query?.redirects || [];
        const norm = data.query?.normalized || [];
        const byTitle = new Map(data.query?.pages?.map((p) => [p.title, p]) || []);
        for (const t of chunk) {
          let key = t;
          const n = norm.find((x) => x.from === t); if (n) key = n.to;
          const r = redirects.find((x) => x.from === key); if (r) key = r.to;
          const p = byTitle.get(key);
          const content = p?.revisions?.[0]?.slots?.main?.content;
          if (content) cache[t] = content;
        }
        ok = true;
      } catch (e) {
        console.warn('retry chunk', i, e.message);
        await sleep(3000 * (attempt + 1));
      }
    }
    await sleep(700);
    if ((i / 10) % 5 === 0) console.log(`${i + chunk.length}/${missing.length}`);
  }
}

async function main() {
  await mkdir('data', { recursive: true });
  let cache = {};
  if (existsSync(CACHE)) {
    cache = JSON.parse(await readFile(CACHE, 'utf8'));
    console.log('cache entries:', Object.keys(cache).length);
  }

  console.log('fetching author page...');
  const author = await wikitext(AUTHOR);
  const entries = new Map();

  for (const { line, h2, h3 } of sectionMap(author)) {
    const genre = GENRES[h3] || GENRES[h2];
    if (!genre) continue;
    if (!line.startsWith('*') && !line.includes('{{2О')) continue;
    for (const { target, label } of linksFromLine(line)) {
      if (target.startsWith('/') || target.includes('/Стихотворения')) continue;
      if (!/\(Есенин\)$/.test(target)) continue;
      if (!entries.has(target)) entries.set(target, { title: label, genre, year: null });
    }
  }

  const cm = await api({ action: 'query', list: 'categorymembers', cmtitle: 'Категория:Поэзия Сергея Александровича Есенина', cmlimit: '500', cmtype: 'page' });
  for (const { title } of cm.query.categorymembers) {
    if (!/\(Есенин\)$/.test(title)) continue;
    if (!entries.has(title)) entries.set(title, { title: title.replace(/\s*\(Есенин\)$/, ''), genre: 'Стихотворение', year: null });
  }
  console.log('entries:', entries.size);

  const titles = [...entries.keys()];
  await fetchPages(titles, cache);
  await writeFile(CACHE, JSON.stringify(cache), 'utf8');
  console.log('cached:', Object.keys(cache).length);

  const works = [];
  for (const [title, meta] of entries) {
    const raw = cache[title];
    if (!raw) { console.warn('MISS', title); continue; }
    const text = cleanWiki(raw);
    if (text.length < 30) continue;
    const created = templateField(raw, 'ДАТАСОЗДАНИЯ').match(/(1[89]\d\d|19\d\d|20\d\d)/);
    works.push({
      title: meta.title, slug: slugify(meta.title), genre: meta.genre,
      year: created ? Number(created[1]) : meta.year,
      published: templateField(raw, 'ДАТАПУБЛИКАЦИИ') || null,
      text, chars: text.length,
      sourceUrl: `https://ru.wikisource.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      source: templateField(raw, 'ИСТОЧНИК') || null,
    });
  }

  const seen = new Set();
  const unique = works.filter((w) => { if (seen.has(w.slug)) return false; seen.add(w.slug); return true; });
  unique.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title, 'ru'));

  await writeFile('data/works.json', JSON.stringify(unique, null, 1), 'utf8');
  const byGenre = {};
  unique.forEach((w) => (byGenre[w.genre] = (byGenre[w.genre] || 0) + 1));
  console.log('written:', unique.length, byGenre);
}

main().catch((e) => { console.error(e); process.exit(1); });
