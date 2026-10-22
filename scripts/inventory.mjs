#!/usr/bin/env node
// Инвентаризация собранных страниц по уровням ценности (п. 5.1 и 5.6 плана сети).
//
// Задача: показать фактическую картину — какие страницы дают что-то, чего нет
// в пересказах (документ, расчёт, разбор), а какие остаются справочником (T5),
// который сам по себе ценности не создаёт. Скрипт ничего не правит: только
// считает и складывает результат в reports/inventory.json.
//
// Запуск: npm run inventory  (после npm run build — читает dist/)

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

// Вывод часто смотрят через head — обрыв пайпа не должен считаться ошибкой.
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const OUT_DIR = join(ROOT, 'reports');

// ---------- разбор html ----------

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&laquo;': '«', '&raquo;': '»', '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
  '&times;': '×', '&middot;': '·', '&copy;': '©', '&rarr;': '→', '&larr;': '←',
};

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m] ?? m);
}

function textOf(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function countOf(html, re) {
  return (html.match(re) || []).length;
}

// внешние ссылки внутри контента: то, на что можно опереться как на источник
function externalLinks(html) {
  const out = [];
  const re = /<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const host = m[1].replace(/^https?:\/\//, '').split('/')[0];
    out.push({ url: m[1], host, label: textOf(m[2]).slice(0, 80) });
  }
  return out;
}

// ---------- классификация ----------

// Мусор и служебные страницы: считаем, но в доли ценности не включаем.
const SERVICE = new Set(['404.html', 'privacy.html', 'about.html', 'sources.html', 'versions.html']);

const SECTION_TITLES = {
  biography: 'Биография (статьи)',
  life: 'Жизнь (обзоры, хронология)',
  people: 'Люди',
  works: 'Произведения',
  topics: 'Подборки по темам',
  places: 'Места',
  legacy: 'Наследие',
  books: 'Книги',
  research: 'Научные работы',
  publications: 'Журнал',
  index: 'Главная и справочные',
};

function sectionOf(rel) {
  const parts = rel.split('/');
  if (parts.length === 1) return 'index';
  return parts[0];
}

// Эвристика уровня. Оценка честная, но грубая: смотрим на то, что реально
// лежит на странице (таблицы, цитаты, документы, внешние источники, объём).
function levelOf(page) {
  const { rel, text, ext, tables, quotes, figures, sourceBox, dossier } = page;

  if (rel.startsWith('works/') && !/^(works\/index|works\/az)\.html$/.test(rel)) return 'T1-текст';
  if (SERVICE.has(rel)) return 'служебная';
  // Досье: факты и даты со ссылками на источники — это документ, а не пересказ.
  if (dossier) return 'T1-досье';

  const docSignals =
    (quotes >= 2 ? 1 : 0) + (figures >= 1 ? 1 : 0) + (sourceBox && ext >= 3 ? 1 : 0);
  if (docSignals >= 2) return 'T1-документ';
  if (tables >= 1 && text >= 1200) return 'T2-расчёт';
  if (/^(versions\.html|legacy\/gibel\.html)$/.test(rel)) return 'T4-разбор';
  if (/\bверси|расхожд|спорн|опроверг|миф/i.test(text) && text >= 1500) return 'T4-разбор';
  if (tables >= 1 || figures >= 1) return 'T3-синтез';
  return 'T5-справочник';
}

// Чего не хватает: подсказка для «доливки» (п. 5.6).
function gapsOf(page) {
  const g = [];
  if (page.level.startsWith('T5') || page.level.startsWith('T4') || page.level.startsWith('T3')) {
    if (!page.ext) g.push('нет внешних источников');
    if (!page.tables && !page.figures) g.push('нет таблицы или документа');
    if (page.text < 1500) g.push(`короткий текст (${page.text} зн.)`);
    if (!page.sourceBox) g.push('нет блока источников');
  }
  if (page.level === 'T1-текст' && page.text < 200) g.push('подозрительно короткий текст произведения');
  return g;
}

// ---------- обход dist ----------

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = (await walk(DIST)).sort();
const pages = [];

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const rel = relative(DIST, file).split(sep).join('/');

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const main = mainMatch ? mainMatch[1] : html;

  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1]).trim();
  const h1 = textOf((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ''])[1]);
  const text = textOf(main);
  const ext = externalLinks(main);

  const page = {
    rel,
    title,
    h1,
    section: sectionOf(rel),
    text: text.length,
    h2: countOf(main, /<h2\b/gi),
    tables: countOf(main, /<table\b/gi),
    quotes: countOf(main, /<blockquote\b/gi),
    figures: countOf(main, /<figure\b/gi),
    images: countOf(main, /<img\b/gi),
    sourceBox: /class="source-box"/.test(main),
    dossier: /class="dossier"/.test(main),
    ext: ext.length,
    extHosts: [...new Set(ext.map((x) => x.host))].slice(0, 8),
  };
  page.level = levelOf(page);
  page.gaps = gapsOf(page);
  pages.push(page);
}

// ---------- сводка ----------

const LEVELS = ['T1-досье', 'T1-документ', 'T2-расчёт', 'T3-синтез', 'T4-разбор', 'T5-справочник', 'T1-текст', 'служебная'];

function stats(list) {
  if (!list.length) return null;
  const lens = list.map((p) => p.text).sort((a, b) => a - b);
  const sum = lens.reduce((a, b) => a + b, 0);
  return {
    pages: list.length,
    avg: Math.round(sum / list.length),
    median: lens[Math.floor(lens.length / 2)],
    min: lens[0],
    max: lens[lens.length - 1],
    withSources: list.filter((p) => p.ext > 0).length,
    withDoc: list.filter((p) => p.tables > 0 || p.quotes > 0 || p.figures > 0).length,
  };
}

const byLevel = {};
for (const l of LEVELS) byLevel[l] = stats(pages.filter((p) => p.level === l));

const bySection = {};
for (const [id, title] of Object.entries(SECTION_TITLES)) {
  const list = pages.filter((p) => p.section === id);
  if (list.length) {
    const counts = {};
    for (const p of list) counts[p.level] = (counts[p.level] || 0) + 1;
    bySection[id] = { title, ...stats(list), levels: counts };
  }
}

// Доля ценных страниц: считаем без текстов произведений и служебных.
const content = pages.filter((p) => !p.level.startsWith('T1-текст') && p.level !== 'служебная');
const valuable = content.filter((p) => /^T[1-4]/.test(p.level));

const summary = {
  generatedAt: new Date().toISOString(),
  totalPages: pages.length,
  contentPages: content.length,
  valuablePages: valuable.length,
  valuableShare: content.length ? +(valuable.length / content.length * 100).toFixed(1) : 0,
  byLevel,
  bySection,
};

// ---------- печать ----------

console.log(`Страниц в dist: ${pages.length}`);
console.log(`Описательных (без текстов произведений и служебных): ${content.length}`);
console.log(`Из них T1–T4: ${valuable.length} — ${summary.valuableShare}%  (цель ≥ 60%)\n`);

console.log('По уровням:');
for (const l of LEVELS) {
  const s = byLevel[l];
  if (!s) continue;
  console.log(
    `  ${l.padEnd(14)} ${String(s.pages).padStart(4)} стр.  медиана ${String(s.median).padStart(5)} зн.  ` +
    `с источниками ${String(s.withSources).padStart(3)}  с документом ${String(s.withDoc).padStart(3)}`
  );
}

console.log('\nПо разделам:');
for (const [id, s] of Object.entries(bySection)) {
  const lv = Object.entries(s.levels).map(([k, v]) => `${k}×${v}`).join(', ');
  console.log(`  ${s.title.padEnd(28)} ${String(s.pages).padStart(4)} стр.  медиана ${String(s.median).padStart(5)} зн.  ${lv}`);
}

// Кандидаты на «доливку»: справочные страницы без источников и без документа,
// сначала самые короткие.
const candidates = content
  .filter((p) => p.level === 'T5-справочник' || /^T[34]-/.test(p.level))
  .sort((a, b) => a.text - b.text || a.ext - b.ext)
  .slice(0, 40);

console.log('\nПервые кандидаты на доливку (короткие, без источника и документа):');
for (const p of candidates.slice(0, 25)) {
  console.log(`  ${p.rel}  ${p.text} зн. — ${p.gaps.slice(0, 3).join('; ') || 'нет данных'}`);
}

// Сколько персон уже получили досье: это главный счётчик «доливки» по разделу «Люди».
try {
  const people = JSON.parse(await readFile(join(ROOT, 'data/people.json'), 'utf8'));
  const dossiers = JSON.parse(await readFile(join(ROOT, 'data/dossiers.json'), 'utf8'));
  const have = people.filter((p) => dossiers[p.id]).length;
  const pct = people.length ? Math.round((have / people.length) * 100) : 0;
  const noDossier = people.filter((p) => !dossiers[p.id]).map((p) => p.name);
  summary.dossiers = { have, total: people.length, pct };
  console.log(`\nДосье: ${have} из ${people.length} персон (${pct}%)`);
  if (noDossier.length) console.log(`Без досье: ${noDossier.slice(0, 8).join(', ')}${noDossier.length > 8 ? ` и ещё ${noDossier.length - 8}` : ''}`);
} catch (e) {
  console.log(`\nДосье: данных нет (${e.code || e.message})`);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'inventory.json'), JSON.stringify({ summary, pages }, null, 2), 'utf8');
console.log(`\nОтчёт: reports/inventory.json (${pages.length} страниц)`);
