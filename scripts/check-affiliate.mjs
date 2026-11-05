#!/usr/bin/env node
// Проверка актуальности партнёрских ссылок: жива ли ссылка, ведёт ли на тот же товар,
// сохранилась ли метка tracking'а и в наличии ли товар.
//
// Источники: data/books.json (бумажные издания) и data/audiobooks.json (аудиокниги).
// Один запрос на ссылку, с редиректами: магазин отвечает 200 уже на странице товара,
// поэтому «мёртвой» считаем только 404/410/5xx, а «подозрительной» — 403, таймаут,
// уход на поиск/главную, потерю utm/erid и разметку OutOfStock.
//
// Запуск: node scripts/check-affiliate.mjs [--json] [--store=litres] [--limit=N]
// Отчёт: reports/affiliate-report.json (каталог в .gitignore).
// Код возврата: 1 — есть мёртвые ссылки, 0 — всё живо (подозрительные не валят сборку).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ARGS = process.argv.slice(2);
const JSON_ONLY = ARGS.includes('--json');
const STORE_FILTER = (ARGS.find((a) => a.startsWith('--store=')) || '').split('=')[1] || '';
const LIMIT = Number((ARGS.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const CONCURRENCY = 6;
const TIMEOUT_MS = 25000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

// Магазины: где должна оказаться ссылка после редиректов и как выглядит страница товара.
// Ключи совпадают с affiliate.stores в site.config.json.
const STORES = {
  'chitai-gorod': {
    label: 'Читай-город',
    hosts: ['www.chitai-gorod.ru', 'chitai-gorod.ru'],
    productPath: /\/(product|good)\//,
    markKeys: ['partnerId', 'erid'], // хотя бы одна метка должна дожить до товара
  },
  litres: {
    label: 'ЛитРес',
    hosts: ['www.litres.ru', 'litres.ru'],
    productPath: /\/(audiobook|book|podcast)\//,
    markKeys: ['utm_content', 'advcake_params', 'erid'],
  },
};

async function readJson(rel, fallback) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) return fallback;
  const raw = (await readFile(file, 'utf8')).trim();
  return raw ? JSON.parse(raw) : fallback;
}

const config = await readJson('site.config.json', {});
const books = await readJson('data/books.json', []);
const audiobooks = await readJson('data/audiobooks.json', []);

// Собираем все товарные ссылки из данных: их и проверяем на актуальность.
const targets = [];
for (const [source, items] of [['books.json', books], ['audiobooks.json', audiobooks]]) {
  for (const item of items) {
    for (const link of item.links || []) {
      if (!link.url) continue;
      if (STORE_FILTER && link.store !== STORE_FILTER) continue;
      targets.push({ source, id: item.id, title: item.title, store: link.store, url: link.url, productUrl: item.productUrl || '' });
    }
  }
}

const limited = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;

function markingOk(finalUrl, body, store) {
  const cfg = STORES[store];
  if (!cfg) return true;
  const url = String(finalUrl || '');
  const marks = cfg.markKeys.filter((k) => url.includes(`${k}=`) || (k === 'erid' && /erid/i.test(body.slice(0, 200000))));
  return marks.length > 0;
}

async function checkOne(t) {
  const cfg = STORES[t.store];
  const res = { ...t, finalUrl: '', status: 0, availability: '', verdict: 'ok', why: '' };
  if (!cfg) {
    res.verdict = 'warn';
    res.why = 'неизвестный магазин';
    return res;
  }
  let response;
  try {
    response = await fetch(t.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9' },
    });
  } catch (e) {
    res.verdict = 'warn';
    res.why = e.name === 'TimeoutError' || e.name === 'AbortError' ? 'таймаут' : String(e.cause?.code || e.message).slice(0, 60);
    return res;
  }
  res.status = response.status;
  res.finalUrl = response.url;

  let body = '';
  try {
    body = (await response.text()).slice(0, 400000);
  } catch { /* тело не нужно для вердикта по коду */ }

  const av = body.match(/"availability"\s*:\s*"(?:https:\/\/schema\.org\/)?([A-Za-z]+)"/);
  if (av) res.availability = av[1];

  const host = (() => { try { return new URL(res.finalUrl).hostname; } catch { return ''; } })();

  if (response.status === 404 || response.status === 410) {
    res.verdict = 'dead';
    res.why = `HTTP ${response.status}`;
  } else if (response.status >= 500) {
    res.verdict = 'dead';
    res.why = `HTTP ${response.status}`;
  } else if (response.status >= 400) {
    res.verdict = 'warn';
    res.why = `HTTP ${response.status}`;
  } else if (!cfg.hosts.includes(host)) {
    res.verdict = 'warn';
    res.why = `редирект на чужой хост: ${host || '—'}`;
  } else if (!cfg.productPath.test(new URL(res.finalUrl).pathname)) {
    res.verdict = 'warn';
    res.why = `ушло не на карточку товара: ${new URL(res.finalUrl).pathname}`;
  } else if (!markingOk(res.finalUrl, body, t.store)) {
    res.verdict = 'warn';
    res.why = 'потеряна партнёрская метка';
  } else if (res.availability && res.availability !== 'InStock') {
    res.verdict = 'warn';
    res.why = `наличие: ${res.availability}`;
  }
  return res;
}

const results = [];
for (let i = 0; i < limited.length; i += CONCURRENCY) {
  const part = await Promise.all(limited.slice(i, i + CONCURRENCY).map(checkOne));
  results.push(...part);
  if (!JSON_ONLY) process.stdout.write(`  проверено ${Math.min(i + CONCURRENCY, limited.length)}/${limited.length}\n`);
}

const dead = results.filter((r) => r.verdict === 'dead');
const warn = results.filter((r) => r.verdict === 'warn');
const byStore = {};
for (const r of results) {
  byStore[r.store] = byStore[r.store] || { total: 0, dead: 0, warn: 0 };
  byStore[r.store].total++;
  if (r.verdict === 'dead') byStore[r.store].dead++;
  if (r.verdict === 'warn') byStore[r.store].warn++;
}

const report = {
  generatedAt: new Date().toISOString(),
  site: config.siteUrl || '',
  checked: results.length,
  dead: dead.length,
  warnings: warn.length,
  byStore,
  deadLinks: dead,
  warningsList: warn,
};
await mkdir(join(ROOT, 'reports'), { recursive: true });
await writeFile(join(ROOT, 'reports', 'affiliate-report.json'), JSON.stringify(report, null, 2));

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const stores = Object.entries(byStore).map(([k, v]) => `${STORES[k]?.label || k}: ${v.total} ссылок, мёртвых ${v.dead}, подозрительных ${v.warn}`).join('; ');
  console.log(`партнёрские ссылки: проверено ${results.length}${stores ? ` (${stores})` : ''}`);
  for (const r of dead) console.log(`DEAD  ${r.store} · ${r.title} · ${r.url} → ${r.why}`);
  for (const r of warn.slice(0, 15)) console.log(`WARN  ${r.store} · ${r.title} · ${r.url} → ${r.why}`);
  console.log(`отчёт: reports/affiliate-report.json`);
}

if (dead.length) {
  console.log(`ПАРТНЁРСКИЕ ССЫЛКИ НЕ АКТУАЛЬНЫ: мёртвых ${dead.length}`);
  process.exit(1);
}
