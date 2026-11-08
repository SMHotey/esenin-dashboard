// Граф внутренних ссылок по собранному dist: ищет страницы-сироты.
// Сирота — страница из sitemap, на которую не ведёт ни одна ссылка <a href>.
// Поисковик находит такие страницы только через sitemap, и вес от них не течёт.
//
// Запуск: node scripts/links-orphans.mjs [--json]
// Код возврата 1, если есть сироты.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, DIST, readConfig, sitemapEntries, locToPath, pageFiles, readPage, links, isHub, today, fmtPct,
} from './seo-common.mjs';

const args = process.argv.slice(2);
const config = readConfig();

const pages = pageFiles(DIST);
const incoming = new Map();      // rel → всего входящих
const incomingMain = new Map();  // rel → входящих из читаемой части (<main>)
const outgoing = new Map();

function toRel(href, fromRel) {
  const raw = String(href).split('#')[0].split('?')[0];
  if (!raw) return null;
  if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) return null;
  let path;
  if (/^https?:/i.test(raw)) {
    let u;
    try { u = new URL(raw); } catch { return null; }
    if (u.host !== new URL(config.siteUrl).host) return null; // внешние не считаем
    path = u.pathname;
  } else if (raw.startsWith('/')) {
    path = raw;
  } else {
    // относительная ссылка — от каталога текущей страницы
    const baseDir = fromRel.includes('/') ? fromRel.slice(0, fromRel.lastIndexOf('/') + 1) : '';
    path = new URL(raw, `https://${new URL(config.siteUrl).host}/${baseDir}`).pathname;
  }
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { decoded = path; }
  if (decoded === '/') return 'index.html';
  if (decoded.endsWith('/')) decoded += 'index.html';
  return decoded.replace(/^\/+/, '');
}

for (const rel of pages) {
  const html = readPage(rel);
  if (!html) continue;
  const mainHtml = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || '';
  const allHrefs = links(html);
  const mainHrefs = mainHtml ? links(mainHtml) : [];
  const mainSet = new Set(mainHrefs.map((h) => toRel(h, rel)).filter(Boolean));
  let out = 0;
  for (const href of allHrefs) {
    const target = toRel(href, rel);
    if (!target || target === rel) continue;
    incoming.set(target, (incoming.get(target) || 0) + 1);
    if (mainSet.has(target)) incomingMain.set(target, (incomingMain.get(target) || 0) + 1);
    out += 1;
  }
  outgoing.set(rel, out);
}

const sitemap = sitemapEntries().map((e) => locToPath(e.loc, config)).filter(Boolean);
const missing = sitemap.filter((rel) => !pages.includes(rel)); // sitemap ссылается на то, чего нет
// Сирота — нет ни одной входящей ссылки. Ссылки только из футера/меню считаем
// отдельно: страница формально не сирота, но из текста на неё не ведут.
const present = sitemap.filter((rel) => pages.includes(rel));
const orphans = present.filter((rel) => !incoming.get(rel));
const footerOnly = present.filter((rel) => incoming.get(rel) && !incomingMain.get(rel));
const deadEnds = present.filter((rel) => !outgoing.get(rel));

const result = {
  site: config.siteUrl, checkedAt: new Date().toISOString(),
  pages: pages.length, sitemap: sitemap.length,
  orphans, footerOnly, deadEnds, missingFromDist: missing,
  ok: orphans.length === 0 && missing.length === 0,
};
mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'reports', 'links-orphans.json'), JSON.stringify(result, null, 2) + '\n');

if (args.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Граф ссылок ${config.siteUrl} — ${today()}`);
  console.log('');
  console.log(`  HTML в dist: ${pages.length}, URL в sitemap: ${sitemap.length}`);
  console.log(`  страниц без входящих ссылок: ${orphans.length}`);
  if (orphans.length) for (const o of orphans.slice(0, 30)) console.log(`    · /${o}`);
  if (missing.length) {
    console.log(`  в sitemap, но нет в dist: ${missing.length}`);
    for (const m of missing.slice(0, 10)) console.log(`    · /${m}`);
  }
  console.log(`  тупиков без исходящих ссылок: ${deadEnds.length}${deadEnds.length ? ' (справочно, не ошибка)' : ''}`);
  if (footerOnly.length) console.log(`  только из футера/меню (справочно): ${footerOnly.length} — ${footerOnly.slice(0, 8).join(', ')}`);
  console.log(`  Итог: ${result.ok ? 'PASS' : 'FAIL'}`);
}

process.exit(result.ok ? 0 : 1);
