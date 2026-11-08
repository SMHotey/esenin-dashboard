// Контент-покрытие: доля T1–T4 и абсолютное число описательных страниц.
//
// T1–T4 (по SEO-плану): разборы и публикации, биография, места, наука,
// версии/источники и досье людей. Тексты произведений (works) в долю не входят:
// их сотни, и они не тот контент, ради которого сайт открывают из поиска.
// Знаменатель — тоже без works: доля считается по описательным страницам.
//
// Отдельной строкой печатается доля works в sitemap: это стоп-правило
// («больше 70% — сайт не продвигается»), а не гейт сборки. Пока она выше нормы,
// работает контент-программа, а не ссылки и не переоптимизация.
//
// Запуск:
//   node scripts/content-coverage.mjs          — таблица, exit 1 при недоборе
//   node scripts/content-coverage.mjs --gate   — то же (вызывается из verify)
//   node scripts/content-coverage.mjs --json   — JSON в stdout

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, DIST, readConfig, sitemapEntries, locToPath, readPage, mainText, words,
  tierOf, sectionOf, isHub, today, fmtPct,
} from './seo-common.mjs';

const args = process.argv.slice(2);
const TARGET_SHARE = 0.15; // доля T1–T4 среди описательных страниц
const MIN_PAGES = 30;      // абсолютный минимум T1–T4
const WORKS_STOP = 0.70;   // стоп-правило по доле works в sitemap

const config = readConfig();
const entries = sitemapEntries();
if (!entries.length) {
  console.error('Нет dist/sitemap.xml — сначала npm run build.');
  process.exit(1);
}

const rows = [];
let t1 = 0;
let works = 0;
let hubs = 0;
let other = 0;
let person = 0;
const bySection = new Map();

for (const e of entries) {
  const rel = locToPath(e.loc, config);
  if (!rel) continue;
  const tier = tierOf(rel);
  const sec = sectionOf(rel);
  const acc = bySection.get(sec) || { total: 0, t1: 0 };
  acc.total += 1;
  if (tier === 't1') { t1 += 1; acc.t1 += 1; }
  bySection.set(sec, acc);
  if (tier === 'works') works += 1;
  else if (tier === 'hub') hubs += 1;
  else if (tier === 'person') person += 1;
  else if (tier === 't1') { /* уже посчитано */ }
  else other += 1;
}

const total = entries.length;
const descriptive = total - works;
const shareDescriptive = descriptive ? t1 / descriptive : 0;
const shareAll = total ? t1 / total : 0;
const worksShare = total ? works / total : 0;
const okCount = t1 >= MIN_PAGES;
const okShare = shareDescriptive >= TARGET_SHARE;
const ok = okCount && okShare;

// Тонкие страницы — для справки: меньше 200 слов в читаемой части.
// Отдельно считаем короткие произведения (текст самого стихотворения < 400 знаков):
// такая страница тонкая не потому, что её не заполнили, а потому что короче текст
// в природе. Это разные задачи: первая требует контента, вторая — ничего.
const workTextLen = new Map();
try {
  for (const w of JSON.parse(readFileSync(join(ROOT, 'data', 'works.json'), 'utf8'))) {
    workTextLen.set(w.slug, (w.text || '').trim().length);
  }
} catch { /* без works.json считаем всё «страницами без текста» */ }

let thin = 0;
let thinWorks = 0;
let thinShortWorks = 0;
for (const e of entries) {
  const rel = locToPath(e.loc, config);
  if (!rel) continue;
  const html = readPage(rel);
  if (!html) continue;
  if (words(mainText(html)).length < 200) {
    thin += 1;
    if (rel.startsWith('works/')) {
      thinWorks += 1;
      const slug = decodeURIComponent(rel.slice('works/'.length).replace(/\.html$/, ''));
      const len = workTextLen.get(slug);
      if (len !== undefined && len < 400) thinShortWorks += 1;
    }
  }
}

const need = okShare ? 0 : Math.ceil((TARGET_SHARE * descriptive - t1) / (1 - TARGET_SHARE));

const result = {
  site: config.siteUrl, checkedAt: new Date().toISOString(),
  total, works, hubs, person, other, t1, descriptive,
  shareDescriptive: Number(shareDescriptive.toFixed(4)),
  shareAll: Number(shareAll.toFixed(4)),
  worksShare: Number(worksShare.toFixed(4)),
  thin, thinWorks,
  norms: { targetShare: TARGET_SHARE, minPages: MIN_PAGES, worksStop: WORKS_STOP },
  ok, need,
  sections: [...bySection.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total),
};

mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'reports', 'content-coverage.json'), JSON.stringify(result, null, 2) + '\n');

if (args.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Контент-покрытие ${config.siteUrl} — ${today()}`);
  console.log('');
  console.log(`  URL в sitemap:        ${total}`);
  console.log(`  T1–T4:                ${t1} (${fmtPct(shareDescriptive)} описательных, ${fmtPct(shareAll)} всех)`);
  console.log(`  works:                ${works} (${fmtPct(worksShare)} sitemap; стоп-правило ≤ ${fmtPct(WORKS_STOP)})`);
  console.log(`  описательных всего:   ${descriptive} (хабы ${hubs}, персоны без досье ${person}, прочее ${other})`);
  console.log(`  тонких (<200 слов):   ${thin}, из них works ${thinWorks}`);
  console.log(`  из них короткие тексты произведений (<400 знаков): ${thinShortWorks}, прочих тонких works (текст есть, страница короткая): ${thinWorks - thinShortWorks}`);
  console.log('');
  console.log(`  Норма: T1–T4 ≥ ${MIN_PAGES} страниц и ≥ ${fmtPct(TARGET_SHARE)} описательных.`);
  console.log(`  Итог: ${ok ? 'PASS' : `FAIL — не хватает ${need} страниц T1–T4`}`);
  if (!okCount) console.log(`        абсолютных страниц ${t1} из ${MIN_PAGES}`);
  if (worksShare > WORKS_STOP) {
    console.log(`  Структура: works занимают ${fmtPct(worksShare)} — сайт в фазе контент-программы, ссылки и переоптимизация не в приоритете.`);
  }
  console.log('');
  console.log('  Разделы:');
  for (const s of result.sections) {
    console.log(`    ${s.name.padEnd(14)} ${String(s.total).padStart(4)}  из них T1–T4 ${String(s.t1).padStart(3)}`);
  }
}

process.exit(ok ? 0 : 1);
