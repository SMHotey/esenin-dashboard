// Недельный SEO-отчёт: читает reports/seo-audit.json, sitemap и dist, пишет
// reports/seo-YYYY-WW.md. Без кабинетных токенов — только внешние проверки и
// пометка «нет данных кабинета»; с токенами Метрики/Вебмастера — добавляет
// визиты, достижения целей и показы с позициями.
//
// Запуск: node scripts/seo-report.mjs
// Переменные окружения (необязательные):
//   YANDEX_METRIKA_TOKEN      — OAuth-токен Метрики
//   YANDEX_METRIKA_COUNTER    — номер счётчика (по умолчанию из site.config.json)
//   YANDEX_WEBMASTER_TOKEN    — OAuth-токен Вебмастера
//   YANDEX_WEBMASTER_USER     — номер пользователя Вебмастера
//   YANDEX_WEBMASTER_HOST     — id хоста в Вебмастере (обычно 'https:<host>:80')

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, readConfig, sitemapEntries, tierOf, locToPath, today } from './seo-common.mjs';

const config = readConfig();
const REPORTS = join(ROOT, 'reports');
mkdirSync(REPORTS, { recursive: true });

function readJson(name) {
  const p = join(REPORTS, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

const audit = readJson('seo-audit.json');
const coverage = readJson('content-coverage.json');
const orphans = readJson('links-orphans.json');
const goals = readJson('metrika-goals.json');

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week: String(week).padStart(2, '0') };
}

const { year, week } = isoWeek();
const file = join(REPORTS, `seo-${year}-W${week}.md`);

// ---------- кабинет (если есть токены) ----------

async function metrikaStats() {
  const token = process.env.YANDEX_METRIKA_TOKEN;
  const counter = process.env.YANDEX_METRIKA_COUNTER || config.analytics?.yandexMetrika;
  if (!token || !counter) return null;
  const url = new URL('https://api-metrika.yandex.net/stat/v1/data');
  url.searchParams.set('ids', String(counter));
  url.searchParams.set('date1', '7daysAgo');
  url.searchParams.set('date2', 'today');
  url.searchParams.set('metrics', 'ym:s:visits,ym:s:pageviews,ym:s:users');
  try {
    const res = await fetch(url, { headers: { Authorization: `OAuth ${token}` } });
    if (!res.ok) return { error: `Метрика API ${res.status}` };
    const j = await res.json();
    const t = j.totals?.[0] || [];
    return { visits: t[0], pageviews: t[1], users: t[2] };
  } catch (e) {
    return { error: `Метрика API: ${e.message}` };
  }
}

async function webmasterStats() {
  const token = process.env.YANDEX_WEBMASTER_TOKEN;
  const user = process.env.YANDEX_WEBMASTER_USER;
  const host = process.env.YANDEX_WEBMASTER_HOST;
  if (!token || !user || !host) return null;
  const url = new URL(`https://api.webmaster.yandex.net/v4/user/${user}/hosts/${encodeURIComponent(host)}/search-queries/popular`);
  url.searchParams.set('order_by', 'TOTAL_SHOWS');
  url.searchParams.set('count', '10');
  try {
    const res = await fetch(url, { headers: { Authorization: `OAuth ${token}` } });
    if (!res.ok) return { error: `Вебмастер API ${res.status}` };
    const j = await res.json();
    return { queries: (j.queries || []).map((q) => ({ text: q.query_text, shows: q.indicators?.TOTAL_SHOWS, clicks: q.indicators?.TOTAL_CLICKS, pos: q.indicators?.AVG_SHOW_POSITION })) };
  } catch (e) {
    return { error: `Вебмастер API: ${e.message}` };
  }
}

const metrika = await metrikaStats();
const webmaster = await webmasterStats();

// ---------- локальные числа ----------

const entries = sitemapEntries();
let works = 0;
let t1 = 0;
for (const e of entries) {
  const rel = locToPath(e.loc, config);
  const tier = rel ? tierOf(rel) : 'other';
  if (tier === 'works') works += 1;
  if (tier === 't1') t1 += 1;
}
const total = entries.length;

const lines = [];
lines.push(`# SEO-отчёт ${config.siteUrl} — ${year}, неделя ${week}`);
lines.push('');
lines.push(`Сформирован ${today()}. Источники: ` +
  [audit ? 'reports/seo-audit.json' : null, coverage ? 'reports/content-coverage.json' : null,
    orphans ? 'reports/links-orphans.json' : null, goals ? 'reports/metrika-goals.json' : null]
    .filter(Boolean).join(', ') || 'только dist/');
lines.push('');

lines.push('## Внешние проверки');
lines.push('');
if (!audit) {
  lines.push('Аудит не запускался: `npm run seo:audit`.');
} else {
  lines.push(`Дата проверки: ${String(audit.checkedAt).slice(0, 10)}. PASS ${audit.summary.pass} · FAIL ${audit.summary.fail} · SKIP ${audit.summary.skip}.`);
  lines.push('');
  lines.push('| проверка | статус | детали |');
  lines.push('| --- | --- | --- |');
  for (const c of audit.checks) lines.push(`| ${c.name} | ${c.status} | ${String(c.detail).replace(/\|/g, '/')} |`);
}
lines.push('');

lines.push('## Контент');
lines.push('');
lines.push(`URL в sitemap: ${total}. works: ${works} (${total ? ((works / total) * 100).toFixed(1) : '0'}%). T1–T4: ${t1}.`);
if (coverage) {
  lines.push(`По отчёту content-coverage: T1–T4 ${coverage.t1} — ${(coverage.shareDescriptive * 100).toFixed(1)}% описательных, ${(coverage.shareAll * 100).toFixed(1)}% всех; тонких страниц ${coverage.thin}.`);
}
if (orphans) lines.push(`Страниц-сирот: ${orphans.orphans.length}${orphans.orphans.length ? ` (${orphans.orphans.slice(0, 5).join(', ')})` : ''}.`);
if (goals) lines.push(`Цели Метрики: ${goals.ok ? 'PASS' : 'FAIL'} (${goals.goals.filter((g) => g.ok).map((g) => g.name).join(', ') || 'нет событий'}).`);
lines.push('');

lines.push('## Кабинет');
lines.push('');
if (metrika || webmaster) {
  if (metrika?.error) lines.push(`Метрика: ${metrika.error}.`);
  else if (metrika) lines.push(`Метрика за 7 дней: визиты ${metrika.visits}, просмотры ${metrika.pageviews}, посетители ${metrika.users}.`);
  if (webmaster?.error) lines.push(`Вебмастер: ${webmaster.error}.`);
  else if (webmaster?.queries?.length) {
    lines.push('');
    lines.push('| запрос | показы | клики | позиция |');
    lines.push('| --- | --- | --- | --- |');
    for (const q of webmaster.queries) lines.push(`| ${q.text} | ${q.shows ?? '—'} | ${q.clicks ?? '—'} | ${q.pos ?? '—'} |`);
  } else if (webmaster) lines.push('Вебмастер: данных по запросам нет.');
} else {
  lines.push('Нет данных кабинета: не заданы YANDEX_METRIKA_TOKEN / YANDEX_WEBMASTER_TOKEN. Показы, клики и позиции появятся в отчёте, когда токены будут в окружении.');
}
lines.push('');

lines.push('## Что делать дальше');
lines.push('');
const todo = [];
const fails = (audit?.checks || []).filter((c) => c.status === 'FAIL');
if (fails.length) todo.push(`Починить внешние проверки: ${fails.map((c) => c.name).join('; ')}.`);
if (audit && (audit.checks || []).some((c) => c.id === 'ga4' && c.status === 'SKIP')) todo.push('Получить Measurement ID GA4 у владельца и вписать в site.config.json → analytics.googleAnalytics.');
if (total && works / total > 0.7) todo.push(`Сокращать долю works: сейчас ${((works / total) * 100).toFixed(1)}% при стоп-правиле ≤70% — публиковать T1–T4 по контент-программе.`);
if (orphans?.orphans?.length) todo.push(`Связать сироты: ${orphans.orphans.slice(0, 5).join(', ')}.`);
if (goals && !goals.ok) todo.push('Довести события Метрики в src/app.js и пересобрать.');
if (!todo.length) todo.push('Наблюдать: показатели кабинета, переобход новых страниц, позиции по школьным запросам.');
for (const t of todo) lines.push(`- ${t}`);
lines.push('');

writeFileSync(file, lines.join('\n'));
console.log(`Отчёт: ${relative(ROOT, file)}`);
