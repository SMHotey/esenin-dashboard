// Цели Метрики в коде: события должны быть в src/app.js и в собранной копии dist/app.js,
// а счётчик — на страницах. Кабинет не трогаем: создание целей — действие владельца,
// скрипт только проверяет, что события вообще отправляются и что имена стабильны.
//
// События: book_click (клик по книге), audiobook_click (клик по аудиокниге),
// scroll_90 (дочитывание до 90%), print (печать текста).
//
// Запуск: node scripts/metrika-goals.mjs [--json]

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DIST, readConfig, pageFiles, readPage } from './seo-common.mjs';

const args = process.argv.slice(2);
const config = readConfig();
const YM = String(config.analytics?.yandexMetrika || '').trim();

const GOALS = [
  ['book_click', 'клик по ссылке на книгу'],
  ['audiobook_click', 'клик по аудиокниге'],
  ['scroll_90', 'дочитывание до 90%'],
  ['print', 'печать текста'],
];

const srcPath = join(ROOT, 'src', 'app.js');
const distPath = join(DIST, 'app.js');
const src = existsSync(srcPath) ? readFileSync(srcPath, 'utf8') : '';
const dist = existsSync(distPath) ? readFileSync(distPath, 'utf8') : '';

const rows = [];
for (const [name, why] of GOALS) {
  const inSrc = new RegExp(`['"\`]${name}['"\`]`).test(src);
  const inDist = new RegExp(`['"\`]${name}['"\`]`).test(dist);
  rows.push({ name, why, inSrc, inDist, ok: inSrc && inDist });
}

const sender = /ym\([^)]*['"]reachGoal['"]/.test(src);

// Счётчик и его id на страницах: инициализация в build.mjs + data-ym для app.js.
const pages = pageFiles(DIST).slice(0, 400);
const home = readPage('index.html') || '';
const withYm = YM
  ? (home.includes(`tag.js?id=${encodeURIComponent(YM)}`) || home.includes(`ym(${YM}`)) && home.includes(`data-ym="${YM}"`)
  : false;

const problems = [];
if (!YM) problems.push('site.config.json: analytics.yandexMetrika пуст');
if (!src) problems.push('нет src/app.js');
if (!dist) problems.push('нет dist/app.js — соберите сайт (npm run build)');
if (!sender) problems.push('в src/app.js нет вызова ym(..., \'reachGoal\', ...)');
for (const r of rows) {
  if (!r.inSrc) problems.push(`src/app.js: нет события ${r.name}`);
  if (!r.inDist) problems.push(`dist/app.js: нет события ${r.name}`);
}
if (YM && !home.includes(`data-ym="${YM}"`)) problems.push(`dist/index.html: нет data-ym="${YM}" — app.js не узнает номер счётчика`);
if (YM && !withYm) problems.push(`dist/index.html: нет кода Метрики ${YM}`);

const result = {
  site: config.siteUrl, checkedAt: new Date().toISOString(),
  counter: YM, sender, goals: rows, pagesChecked: pages.length,
  ok: problems.length === 0, problems,
};
mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'reports', 'metrika-goals.json'), JSON.stringify(result, null, 2) + '\n');

if (args.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Цели Метрики ${config.siteUrl} — счётчик ${YM || 'не задан'}`);
  console.log('');
  for (const r of rows) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(16)} ${r.why}`);
  }
  console.log('');
  console.log(`  Код отправки: ${sender ? 'PASS' : 'FAIL'} (ym(..., 'reachGoal', ...))`);
  console.log(`  data-ym на главной: ${YM && home.includes(`data-ym="${YM}"`) ? 'PASS' : 'FAIL'}`);
  if (problems.length) {
    console.log('');
    console.log('  Проблемы:');
    for (const p of problems) console.log(`    ✗ ${p}`);
  }
  console.log('');
  console.log(`  Итог: ${result.ok ? 'PASS' : 'FAIL'}`);
}

process.exit(result.ok ? 0 : 1);
