#!/usr/bin/env node
// Дата последнего изменения по разделам — из истории git.
//
// Зачем: «Обновлено» в подвале и lastmod в карте сайта должны показывать
// фактическую дату правки материала или структуры, а не дату сборки.
// Считать дату сборки нельзя: страница, которую не трогали полгода, будет
// выглядеть свежей, и это обман читателя и поисковика.
//
// Как работает: для каждого раздела берётся самый поздний коммит, который
// трогал его файлы (`git log -1 --format=%cs -- <пути>`). Пишется
// data/updated.json — он коммитится вместе с правками и используется как
// запасной вариант там, где истории git нет (например, в CI с мелким клоном).
//
// Запуск: npm run stamp:updated (автоматически перед сборкой).

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const MANIFEST = 'data/updated.json';

// Раздел → файлы, из которых он собирается. Порядок не важен: берётся максимум.
const GROUPS = {
  structure: ['scripts/build.mjs', 'scripts/sections.mjs', 'src', 'site.config.json', 'package.json'],
  works: ['data/works.json', 'data/extra-works.json', 'data/genre-map.json'],
  people: ['data/people.json', 'data/dossiers.json'],
  timeline: ['data/timeline.json', 'data/studies.json', 'data/passions.json'],
  biography: ['content/biography', 'data/timeline.json'],
  publications: ['content/publications'],
  places: ['data/places.json', 'data/museums.json'],
  legacy: ['data/music.json', 'data/films.json', 'data/languages.json', 'data/glossary.json', 'data/monuments.json', 'data/death.json'],
  books: ['data/books.json'],
  research: ['data/research.json'],
  versions: ['data/versions.json'],
  sources: ['data/sources.json'],
  faq: ['data/faq.json'],
  topics: ['data/topics.json'],
};

const hasGit = existsSync('.git');

// В мелком клоне (CI без fetch-depth: 0) git log показывает один коммит, и все
// разделы получили бы сегодняшнюю дату — это ровно тот обман, которого избегаем.
// Поэтому в мелком клоне ничего не пересчитываем, а берём закоммиченный манифест.
let shallow = false;
if (hasGit) {
  try {
    shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true';
  } catch {
    shallow = false;
  }
}

function gitDate(paths) {
  if (!hasGit || shallow) return null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...paths], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

function latest(...dates) {
  const ok = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')));
  return ok.length ? ok.sort().at(-1) : null;
}

// Прошлый манифест: нужен как запасной вариант, если git недоступен.
let previous = {};
if (existsSync(MANIFEST)) {
  try {
    previous = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    previous = {};
  }
}

const sections = {};
for (const [name, paths] of Object.entries(GROUPS)) {
  sections[name] = latest(gitDate(paths), previous.sections?.[name]) || null;
}

// Персональные даты публикаций: у каждой записи журнала своя история правок.
const files = { ...(previous.files || {}) };
if (hasGit && !shallow) {
  try {
    const { readdir } = await import('node:fs/promises');
    const list = (await readdir('content/publications')).filter((f) => f.endsWith('.md'));
    for (const f of list) {
      const d = gitDate([`content/publications/${f}`]);
      if (d) files[`content/publications/${f}`] = d;
    }
  } catch {
    /* остаёмся на прошлых значениях */
  }
}

const manifest = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sections,
  files,
  note: 'Даты последнего изменения по разделам. Обновляется скриптом scripts/last-updated.mjs из истории git; в CI без истории используется этот файл.',
};

// Не затираем манифест пустотой: без git и без истории он остаётся прежним.
const meaningful = Object.values(sections).some(Boolean);
if (meaningful || !existsSync(MANIFEST)) {
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

const fmt = Object.entries(sections)
  .map(([k, v]) => `${k}: ${v || '—'}`)
  .join(', ');
console.log(`Даты разделов (${MANIFEST}): ${fmt}`);
