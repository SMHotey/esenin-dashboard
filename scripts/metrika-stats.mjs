// Срез Метрики без кабинета: визиты, поисковый трафик по системам, страницы входа
// из поиска и достижения целей. Заменяет то, что обычно смотрят в Вебмастере,
// пока его интерфейс недоступен.
//
// Запуск: node scripts/metrika-stats.mjs [--days 28] [--json]
// Токен: YANDEX_METRIKA_TOKEN (OAuth, scope metrika:read). Счётчик — из site.config.json
// (analytics.yandexMetrika) или YANDEX_METRIKA_COUNTER.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readConfig } from './seo-common.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const daysArg = args.indexOf('--days');
const DAYS = daysArg >= 0 ? Number(args[daysArg + 1]) : 28;

const config = readConfig();
const TOKEN = process.env.YANDEX_METRIKA_TOKEN || '';
const COUNTER = process.env.YANDEX_METRIKA_COUNTER || String(config.analytics?.yandexMetrika || '');

if (!TOKEN) {
  console.error('Нет YANDEX_METRIKA_TOKEN. Положите токен в .secrets/metrika.token и запустите:');
  console.error('  YANDEX_METRIKA_TOKEN=$(cat .secrets/metrika.token) node scripts/metrika-stats.mjs');
  process.exit(2);
}
if (!COUNTER) {
  console.error('Нет номера счётчика: site.config.json → analytics.yandexMetrika');
  process.exit(2);
}

const BASE = 'https://api-metrika.yandex.net';
const HEADERS = { Authorization: `OAuth ${TOKEN}` };

// Ошибки API печатаем одной строкой, без стектрейса: это CLI, а не библиотека.
process.on('unhandledRejection', (e) => {
  console.error(e?.message || String(e));
  process.exit(1);
});

async function api(path, params) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Метрика API ${res.status} ${path}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

const date1 = `${DAYS}daysAgo`;
const date2 = 'today';

try {

const out = { counter: COUNTER, days: DAYS, checkedAt: new Date().toISOString() };

// 1. Итоги за период.
const totals = await api('/stat/v1/data', {
  ids: COUNTER, date1, date2,
  metrics: 'ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDurationSeconds',
});
// Метрика отдаёт totals плоским массивом значений метрик (не вложенным), в отличие от data[].
const t = totals.totals || [];
out.totals = {
  visits: t[0], users: t[1], pageviews: t[2],
  bounceRate: t[3] != null ? Number(t[3].toFixed(1)) : null,
  avgDurationSec: t[4] != null ? Math.round(t[4]) : null,
};

// 2. Поисковый трафик по системам.
const engines = await api('/stat/v1/data', {
  ids: COUNTER, date1, date2,
  dimensions: 'ym:s:lastSearchEngineRoot',
  metrics: 'ym:s:visits',
  filters: "ym:s:lastTrafficSource=='organic'",
  sort: '-ym:s:visits', limit: 10,
});
out.search = (engines.data || []).map((r) => ({
  engine: r.dimensions?.[0]?.name || '—',
  visits: r.metrics?.[0],
}));

// 3. Страницы входа из поиска — то, что реально ранжируется.
const landings = await api('/stat/v1/data', {
  ids: COUNTER, date1, date2,
  dimensions: 'ym:s:startURLPath',
  metrics: 'ym:s:visits',
  filters: "ym:s:lastTrafficSource=='organic'",
  sort: '-ym:s:visits', limit: 15,
});
out.landings = (landings.data || []).map((r) => ({
  path: r.dimensions?.[0]?.name || '—',
  visits: r.metrics?.[0],
}));

// 4. Цели: список из management API, затем достижения по каждой.
let goals = [];
try {
  const list = await api(`/management/v1/counter/${COUNTER}/goals`);
  goals = (list.goals || []).map((g) => ({ id: g.id, name: g.name }));
} catch (e) {
  out.goalsError = e.message;
}

if (goals.length) {
  const metrics = goals.map((g) => `ym:s:goal${g.id}reaches`).join(',');
  const reached = await api('/stat/v1/data', { ids: COUNTER, date1, date2, metrics });
  const row = reached.totals || [];
  out.goals = goals.map((g, i) => ({ name: g.name, reaches: row[i] ?? 0 }));
}

mkdirSync(join(ROOT, 'reports'), { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, 'reports', `metrika-${stamp}.json`), JSON.stringify(out, null, 2) + '\n');

if (asJson) {
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const L = [];
L.push(`Метрика ${config.siteUrl} · счётчик ${COUNTER} · ${DAYS} дн.`);
L.push(`Визиты ${out.totals.visits} · посетители ${out.totals.users} · просмотры ${out.totals.pageviews} · отказы ${out.totals.bounceRate}% · среднее ${out.totals.avgDurationSec} с`);
L.push('');
L.push('Поиск по системам:');
if (!out.search.length) L.push('  нет поискового трафика за период');
for (const s of out.search) L.push(`  ${s.engine}: ${s.visits}`);
L.push('');
L.push('Страницы входа из поиска:');
if (!out.landings.length) L.push('  нет данных');
for (const p of out.landings) L.push(`  ${p.visits}\t${p.path}`);
if (out.goals?.length) {
  L.push('');
  L.push('Цели:');
  for (const g of out.goals) L.push(`  ${g.name}: ${g.reaches}`);
}
if (out.goalsError) L.push(`\nЦели: ${out.goalsError}`);
console.log(L.join('\n'));

} catch (e) {
  console.error(e?.message || String(e));
  process.exit(1);
}
