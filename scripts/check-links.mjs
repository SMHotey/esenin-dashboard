import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DIST = 'dist';
const files = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) await walk(p);
    else if (extname(entry.name) === '.html') files.push(p);
  }
}
await walk(DIST);

const missing = new Map();
let internal = 0;

for (const file of files) {
  const html = await readFile(file, 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const href = decodeURIComponent(m[1]);
    if (href.startsWith('//')) continue;
    internal++;
    let target = join(DIST, href);
    if (href.endsWith('/')) target = join(DIST, href, 'index.html');
    try {
      const s = await stat(target);
      if (s.isDirectory()) await stat(join(target, 'index.html'));
    } catch {
      if (!missing.has(href)) missing.set(href, new Set());
      missing.get(href).add(file.replace(/\\/g, '/').replace('dist', ''));
    }
  }
}

console.log('html files:', files.length, 'internal links:', internal, 'missing:', missing.size);
for (const [href, from] of [...missing].slice(0, 25)) {
  console.log('MISSING', href, '<-', [...from].slice(0, 3).join(', '));
}

// ---------- внешние ссылки ----------
// Проверяем всё, что мы сами разместили (музеи, источники, вики, справочники), — без выборки:
// именно выборка пропускала мёртвые партнёрские ссылки. Партнёрские (с erid/partnerId) здесь
// исключены намеренно: их отдельно и строже проверяет scripts/check-affiliate.mjs.
// Ошибки — только явные 404/410/5xx; таймауты, 403 антиботов и DNS-сбои — предупреждения,
// чтобы сеть не ломала сборку.
let selfHost = '';
try {
  const cfg = JSON.parse(await readFile('site.config.json', 'utf8'));
  if (cfg.siteUrl) selfHost = new URL(cfg.siteUrl).hostname;
} catch { /* конфига нет — просто не исключаем свой домен */ }

const SKIP_DOMAINS = new Set([
  'ru.wikisource.org', 'localhost', 'mc.yandex.ru', 'www.googletagmanager.com',
  ...(selfHost ? [selfHost, `www.${selfHost}`] : []),
]);
const SEARCH_RE = /[?&](query|q|text|phrase|search)=/;
const AFFILIATE_RE = /[?&](erid|partnerId|utm_source=advcake)=/i;

const ext = new Set();
for (const file of files) {
  const html = await readFile(file, 'utf8');
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const url = m[1];
    let host = '';
    try { host = new URL(url).hostname; } catch { continue; }
    if (SKIP_DOMAINS.has(host) || SEARCH_RE.test(url) || AFFILIATE_RE.test(url)) continue;
    ext.add(url);
  }
}

const EXTERNAL_LIMIT = Number(process.env.EXT_LINKS_LIMIT || 0); // 0 — проверяем все
const batch = EXTERNAL_LIMIT > 0 ? [...ext].slice(0, EXTERNAL_LIMIT) : [...ext];
const results = { ok: 0, err: [], warn: [] };

async function checkUrl(u) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const res = await fetch(u, { method: 'GET', redirect: 'follow', signal: ctl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuthorSiteLinkCheck/1.0)' } });
    clearTimeout(t);
    if (res.status >= 500) return { u, kind: 'err', why: `HTTP ${res.status}` };
    if (res.status === 404 || res.status === 410) return { u, kind: 'err', why: `HTTP ${res.status}` };
    if (res.status >= 400) return { u, kind: 'warn', why: `HTTP ${res.status}` };
    return { u, kind: 'ok' };
  } catch (e) {
    return { u, kind: 'warn', why: e.name === 'AbortError' ? 'таймаут' : String(e.cause?.code || e.message).slice(0, 60) };
  }
}

for (let i = 0; i < batch.length; i += 8) {
  const part = await Promise.all(batch.slice(i, i + 8).map(checkUrl));
  for (const r of part) {
    if (r.kind === 'ok') results.ok++;
    else if (r.kind === 'err') results.err.push(`${r.u} → ${r.why}`);
    else results.warn.push(`${r.u} → ${r.why}`);
  }
}

console.log(`external links: ${ext.size} unique, checked ${batch.length}, ok ${results.ok}, errors ${results.err.length}, warnings ${results.warn.length}`);
for (const e of results.err) console.log('BROKEN', e);
for (const w of results.warn.slice(0, 10)) console.log('WARN', w);

if (results.err.length) {
  console.log('ВНЕШНИЕ ССЫЛКИ НЕ ПРОВЕРЕНЫ: ошибок', results.err.length);
  process.exitCode = 1;
}
