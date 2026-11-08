// Внешний SEO-аудит живого сайта: только GET/HEAD по публичным адресам, без кабинетов.
// Проверяет то, что нельзя проверить сборкой: редиректы, время ответа, отдачу
// robots/sitemap, canonical и разметку на реальных страницах.
//
// Запуск:
//   node scripts/seo-audit.mjs                — 14 проверок, таблица, reports/seo-audit.json
//   node scripts/seo-audit.mjs --json         — только JSON в stdout
//   node scripts/seo-audit.mjs --base http://localhost:8080   — против локальной сборки
//
// Код возврата 1, если есть FAIL. Сеть недоступна — это тоже FAIL: аудит без
// ответов сервера ничего не подтверждает, и молча зелёным он быть не должен.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, readConfig, sitemapEntries, locToPath, readPage, mainText, today, fmtPct,
} from './seo-common.mjs';

const args = process.argv.slice(2);
const BASE = (args.includes('--base') ? args[args.indexOf('--base') + 1] : readConfig().siteUrl).replace(/\/$/, '');
const JSON_ONLY = args.includes('--json');
const TIMEOUT = 15000;
const TTFB_LIMIT = 1500; // мс

const config = readConfig();
const HOST = new URL(BASE).host;
const YM = String(config.analytics?.yandexMetrika || '').trim();
const GA = String(config.analytics?.googleAnalytics || '').trim();
const KEY = String(config.indexNow?.key || '').trim();
const checks = [];
let liveLocs = null;

function add(id, name, status, detail, ms = null) {
  checks.push({ id, name, status, detail, ms });
}

async function req(url, { method = 'GET', redirect = 'follow' } = {}) {
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { method, redirect, signal: ctl.signal, headers: { 'user-agent': `site-audit/1.0 (+${BASE})` } });
    const body = method === 'HEAD' ? '' : await res.text();
    return { ok: true, status: res.status, headers: res.headers, body, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, status: 0, headers: new Headers(), body: '', ms: Math.round(performance.now() - t0), error: e.name === 'AbortError' ? `таймаут ${TIMEOUT} мс` : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- выборка страниц ----------

const entries = sitemapEntries();

// ---------- 1–3. Транспорт: HTTPS, http→https, www ----------

{
  const r = await req(`${BASE}/`);
  add('https', 'HTTPS отвечает 200', r.ok && r.status === 200 ? 'PASS' : 'FAIL',
    r.ok ? `GET ${BASE}/ → ${r.status}` : `нет ответа: ${r.error}`, r.ms);
}

{
  const plain = BASE.replace(/^https:/, 'http:');
  const r = await req(`${plain}/`, { method: 'HEAD', redirect: 'manual' });
  const loc = r.headers.get('location') || '';
  const good = r.ok && [301, 308].includes(r.status) && /^https:/.test(loc);
  add('http-redirect', 'http → https (301/308)', good ? 'PASS' : 'FAIL',
    r.ok ? `${r.status} → ${loc || 'нет Location'}` : `нет ответа: ${r.error}`);
}

{
  const www = `https://www.${HOST.replace(/^www\./, '')}/`;
  const r = await req(www, { redirect: 'follow' });
  add('www', 'www → 200 (или редирект на основной хост)', r.ok && r.status === 200 ? 'PASS' : 'FAIL',
    r.ok ? `GET ${www} → ${r.status}` : `нет ответа: ${r.error}`, r.ms);
}

// ---------- 4. TTFB ----------

{
  const times = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await req(`${BASE}/`);
    if (r.ok) times.push(r.ms);
  }
  if (!times.length) add('ttfb', `TTFB < ${TTFB_LIMIT} мс (3 замера)`, 'FAIL', 'нет ответа на главной');
  else {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    add('ttfb', `TTFB < ${TTFB_LIMIT} мс (3 замера)`, avg < TTFB_LIMIT ? 'PASS' : 'FAIL',
      `среднее ${avg} мс (${times.join(', ')}) — до заголовков ответа, без тела`, avg);
  }
}

// ---------- 5. robots.txt ----------

{
  const r = await req(`${BASE}/robots.txt`);
  const body = r.body || '';
  const hasSitemap = new RegExp(`Sitemap:\\s*${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml`).test(body);
  const blocksAll = /^\s*User-agent:\s*\*\s*$[\s\S]*?^\s*Allow:\s*\/\s*$/m.test(body) ? false : /^\s*Disallow:\s*\/\s*$/m.test(body);
  add('robots', 'robots.txt: 200, Sitemap указан, сайт не закрыт', r.status === 200 && hasSitemap && !blocksAll ? 'PASS' : 'FAIL',
    r.status !== 200 ? `GET /robots.txt → ${r.status}` : [hasSitemap ? 'Sitemap указан' : 'нет строки Sitemap', blocksAll ? 'Disallow: /' : 'индексация открыта'].join('; '));
}

// ---------- 6. sitemap.xml ----------

{
  const r = await req(`${BASE}/sitemap.xml`);
  const locs = [...String(r.body).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  liveLocs = locs;
  const wrongHost = locs.filter((u) => { try { return new URL(u).host !== HOST; } catch { return true; } });
  const dup = locs.length - new Set(locs).size;
  const local = sitemapEntries().length;
  const good = r.status === 200 && locs.length > 0 && wrongHost.length === 0 && dup === 0;
  const detail = r.status !== 200
    ? `GET /sitemap.xml → ${r.status}`
    : `${locs.length} URL (в сборке ${local}), чужих хостов: ${wrongHost.length}${dup ? `, дублей: ${dup}` : ''}`;
  add('sitemap', 'sitemap.xml: 200, адреса своего хоста, без дублей', good ? 'PASS' : 'FAIL', detail);
}

// ---------- 6a. Соответствие сборки и живого сайта ----------
// Отставание деплоя — не техническая ошибка, но его нужно видеть: страницы
// из сборки, которых ещё нет на сайте, выглядят в аудите как 404.

{
  if (!liveLocs) add('deploy', 'Сборка и живой sitemap совпадают', 'SKIP', 'нет живого sitemap');
  else {
    // Приводим оба набора к одному виду: '/', '/biography/', '/works/x.html'.
    const normPath = (p) => {
      if (p === 'index.html' || p === '/') return '/';
      const s = p.startsWith('/') ? p : `/${p}`;
      return s.replace(/index\.html$/, '');
    };
    const localPaths = new Set(sitemapEntries().map((e) => normPath(locToPath(e.loc) || '')));
    const livePaths = new Set(liveLocs.map((u) => { try { return normPath(decodeURIComponent(new URL(u).pathname)); } catch { return normPath(u); } }));
    const ahead = [...localPaths].filter((p) => !livePaths.has(p));
    const behind = [...livePaths].filter((p) => !localPaths.has(p));
    const status = behind.length ? 'FAIL' : ahead.length ? 'WARN' : 'PASS';
    const detail = ahead.length || behind.length
      ? `в сборке сверх сайта: ${ahead.length}${ahead.length ? ` (${ahead.slice(0, 3).join(', ')})` : ''}; на сайте сверх сборки: ${behind.length}${behind.length ? ` (${behind.slice(0, 3).join(', ')})` : ''} — нужен деплой`
      : 'состав совпадает';
    add('deploy', 'Сборка и живой sitemap совпадают', status, detail);
  }
}

// ---------- 7–10. Разметка на выборке страниц ----------

// Выборка — из живого sitemap, если он прочитан: иначе недоопубликованные
// страницы дадут ложные 404 в проверках разметки.
const allLocs = (liveLocs && liveLocs.length ? liveLocs : entries.map((e) => e.loc));
const pick = (re) => allLocs.find((u) => { try { return re.test(new URL(u).pathname); } catch { return false; } });
const samples = [
  '/',
  '/biography/',
  pick(/^\/works\/[^/]+\.html$/) ? new URL(pick(/^\/works\/[^/]+\.html$/)).pathname : '/works/',
  pick(/^\/publications\/[^/]+\.html$/) ? new URL(pick(/^\/publications\/[^/]+\.html$/)).pathname : null,
  pick(/^\/people\/[^/]+\.html$/) ? new URL(pick(/^\/people\/[^/]+\.html$/)).pathname : null,
].filter(Boolean);

const fetched = [];
for (const path of samples) {
  const r = await req(`${BASE}${path}`);
  fetched.push({ path, ...r });
}

{
  const bad = [];
  for (const p of fetched) {
    if (!p.ok || p.status !== 200) { bad.push(`${p.path}: ${p.status || p.error}`); continue; }
    const canon = p.body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
    if (!canon) bad.push(`${p.path}: нет canonical`);
    else if (canon[1].replace(/\/$/, '') !== `${BASE}${p.path}`.replace(/\/$/, '')) bad.push(`${p.path}: canonical → ${canon[1]}`);
  }
  add('canonical', 'canonical = адрес страницы', bad.length ? 'FAIL' : 'PASS',
    bad.length ? bad.join('; ') : `проверено ${fetched.length} страниц`);
}

{
  const bad = [];
  const seen = new Set();
  for (const p of fetched) {
    if (!p.ok) { bad.push(`${p.path}: нет ответа`); continue; }
    const title = (p.body.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
    const desc = (p.body.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) || [, ''])[1].trim();
    if (title.length < 20 || title.length > 90) bad.push(`${p.path}: title ${title.length} знаков`);
    if (desc.length < 60 || desc.length > 220) bad.push(`${p.path}: description ${desc.length} знаков`);
    if (seen.has(title)) bad.push(`${p.path}: title повторяет ${title}`);
    seen.add(title);
  }
  add('title-desc', 'title 20–90 и description 60–220 знаков, без повторов', bad.length ? 'FAIL' : 'PASS',
    bad.length ? bad.join('; ') : `проверено ${fetched.length} страниц`);
}

{
  const bad = [];
  for (const p of fetched) {
    if (!p.ok) continue;
    const n = (p.body.match(/<h1[\s>]/gi) || []).length;
    if (n !== 1) bad.push(`${p.path}: ${n}`);
  }
  add('h1', 'ровно один h1 на странице', bad.length ? 'FAIL' : 'PASS', bad.length ? bad.join('; ') : `проверено ${fetched.length}`);
}

{
  const bad = [];
  for (const p of fetched) {
    if (!p.ok) continue;
    const blocks = [...p.body.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    if (!blocks.length) { bad.push(`${p.path}: нет JSON-LD`); continue; }
    for (const b of blocks) {
      try {
        const j = JSON.parse(b);
        if (!j['@type'] && !(j['@graph'] || []).length) bad.push(`${p.path}: JSON-LD без @type`);
      } catch { bad.push(`${p.path}: JSON-LD не парсится`); }
    }
  }
  add('jsonld', 'JSON-LD: есть, парсится, с @type', bad.length ? 'FAIL' : 'PASS', bad.length ? bad.join('; ') : `проверено ${fetched.length}`);
}

// ---------- 11. Метрика ----------

if (!YM) add('metrika', 'Метрика: код счётчика на страницах', 'FAIL', 'site.config.json: analytics.yandexMetrika пуст');
else {
  const bad = [];
  for (const p of fetched) {
    if (!p.ok) { bad.push(`${p.path}: нет ответа`); continue; }
    const init = p.body.includes(`tag.js?id=${encodeURIComponent(YM)}`) || p.body.includes(`ym(${YM}`);
    const watch = p.body.includes(`mc.yandex.ru/watch/${YM}`);
    if (!init || !watch) bad.push(`${p.path}: ${!init ? 'нет инициализации' : ''}${!watch ? ' нет пикселя noscript' : ''}`.trim());
  }
  add('metrika', `Метрика: счётчик ${YM} на страницах`, bad.length ? 'FAIL' : 'PASS',
    bad.length ? bad.join('; ') : `init + noscript на ${fetched.length} страницах; существование счётчика проверяется в кабинете`);
}

// ---------- 12. GA4 ----------

if (!GA) add('ga4', 'GA4: Measurement ID', 'SKIP', 'site.config.json: analytics.googleAnalytics пуст — нужен Measurement ID от владельца');
else {
  const absent = fetched.filter((p) => !p.ok || !p.body.includes(GA)).map((p) => p.path);
  add('ga4', 'GA4: код на страницах', absent.length ? 'FAIL' : 'PASS', absent.length ? `нет на: ${absent.join(', ')}` : GA);
}

// ---------- 13. Подтверждение владения ----------

{
  const v = config.verification || {};
  const pairs = [
    ['yandex', 'yandex-verification'],
    ['google', 'google-site-verification'],
    ['bing', 'msvalidate.01'],
    ['mailru', 'mailru-verification'],
  ].filter(([k]) => String(v[k] || '').trim());
  if (!pairs.length) add('verification', 'Подтверждение владения', 'FAIL', 'site.config.json: verification пуст');
  else {
    const home = fetched.find((p) => p.path === '/');
    const problems = [];
    for (const [k, name] of pairs) {
      const code = String(v[k]).trim();
      const meta = home?.body.includes(`name="${name}" content="${code}"`) || home?.body.includes(`content="${code}" name="${name}"`);
      if (!meta) problems.push(`${k}: нет meta на главной`);
      const file = await req(`${BASE}/${k === 'google' ? `google${code}` : k === 'yandex' ? `yandex_${code}` : k === 'bing' ? `BingSiteAuth` : `mailru_${code}`}.html`);
      if (!(file.status === 200 && file.body.includes(code))) problems.push(`${k}: файл подтверждения не отдаётся`);
    }
    add('verification', 'Подтверждение владения: meta + файл', problems.length ? 'FAIL' : 'PASS',
      problems.length ? problems.join('; ') : pairs.map(([k]) => k).join(', '));
  }
}

// ---------- 14. IndexNow ----------

{
  if (!config.indexNow?.enabled) add('indexnow', 'IndexNow: ключ на сайте', 'SKIP', 'indexNow.enabled = false');
  else if (!/^[A-Za-z0-9-]{8,128}$/.test(KEY)) add('indexnow', 'IndexNow: ключ на сайте', 'FAIL', 'indexNow.key пуст или неверного формата');
  else {
    const r = await req(`${BASE}/${KEY}.txt`);
    const body = String(r.body).trim();
    add('indexnow', 'IndexNow: файл ключа отдаётся и совпадает', r.status === 200 && body === KEY ? 'PASS' : 'FAIL',
      r.status !== 200 ? `/${KEY}.txt → ${r.status}` : body === KEY ? `/${KEY}.txt` : `содержимое не совпадает с ключом`);
  }
}

// ---------- вывод ----------

const order = { FAIL: 0, PASS: 1, SKIP: 2 };
const summary = {
  pass: checks.filter((c) => c.status === 'PASS').length,
  warn: checks.filter((c) => c.status === 'WARN').length,
  fail: checks.filter((c) => c.status === 'FAIL').length,
  skip: checks.filter((c) => c.status === 'SKIP').length,
};
const result = { site: BASE, checkedAt: new Date().toISOString(), host: HOST, checks, summary };
mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'reports', 'seo-audit.json'), JSON.stringify(result, null, 2) + '\n');

if (JSON_ONLY) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const width = (s) => [...s].length;
  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));
  console.log(`SEO-аудит ${BASE} — ${today()}`);
  console.log('');
  console.log(`${pad('ПРОВЕРКА', 40)} ${pad('СТАТУС', 6)} ДЕТАЛИ`);
  for (const c of checks) {
    console.log(`${pad(c.name, 40)} ${pad(c.status, 6)} ${c.detail}`);
  }
  console.log('');
  console.log(`PASS ${summary.pass} · WARN ${summary.warn} · FAIL ${summary.fail} · SKIP ${summary.skip} — отчёт: reports/seo-audit.json`);
}

process.exit(summary.fail ? 1 : 0);
