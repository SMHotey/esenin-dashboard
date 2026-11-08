// Общие помощники SEO-проверок: конфиг сайта, sitemap, страницы dist.
// Только чтение: ни один скрипт на этом модуле ничего не меняет в проекте.
//
// Разметка сайта известна заранее, поэтому классификация страниц — часть модуля,
// а не трёх копий в content-coverage.mjs и seo-report.mjs.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { moscowToday } from './today.mjs';

export const ROOT = process.cwd();
export const DIST = join(ROOT, 'dist');

export function readConfig() {
  return JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
}

export function siteHost(config = readConfig()) {
  return new URL(String(config.siteUrl || '')).host;
}

// ---------- dist ----------

export function pageFiles(dir = DIST) {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push(relative(dir, p).split(sep).join('/'));
    }
  })(dir);
  return out.sort();
}

export function readPage(rel, dir = DIST) {
  const p = join(dir, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' };

export function stripTags(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

// Текст читаемой части страницы: <main>, если он есть, иначе весь body.
export function mainText(html) {
  const m = String(html).match(/<main[\s\S]*?<\/main>/i);
  return stripTags(m ? m[0] : html);
}

export function words(text) {
  return String(text).split(/[^0-9A-Za-zА-Яа-яЁё]+/).filter((w) => w.length > 1);
}

export function links(html) {
  return [...String(html).matchAll(/<a\s[^>]*href="([^"]+)"/gi)].map((m) => m[1]);
}

// ---------- sitemap ----------

export function sitemapEntries(dir = DIST) {
  const p = join(dir, 'sitemap.xml');
  if (!existsSync(p)) return [];
  const xml = readFileSync(p, 'utf8');
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
    const block = m[1];
    return {
      loc: (block.match(/<loc>([^<]+)<\/loc>/) || [, ''])[1],
      lastmod: (block.match(/<lastmod>([^<]+)<\/lastmod>/) || [, ''])[1],
      priority: (block.match(/<priority>([^<]+)<\/priority>/) || [, ''])[1],
    };
  }).filter((x) => x.loc);
}

// URL сайта → путь файла в dist ('works/x.html', 'index.html').
export function locToPath(loc, config = readConfig()) {
  let p;
  try {
    p = decodeURIComponent(new URL(loc).pathname);
  } catch {
    return null;
  }
  if (p === '/') return 'index.html';
  if (p.endsWith('/')) p += 'index.html';
  return p.replace(/^\/+/, '');
}

// ---------- классификация ----------

export const T_SECTIONS = ['publications', 'biography', 'places', 'research'];

export function dossierSlugs() {
  const p = join(ROOT, 'data', 'dossiers.json');
  if (!existsSync(p)) return new Set();
  const d = JSON.parse(readFileSync(p, 'utf8'));
  return new Set(Object.keys(d).filter((k) => d[k] && Object.keys(d[k]).length));
}

export function isHub(rel) {
  return rel === 'index.html' || rel.endsWith('/index.html');
}

export function sectionOf(rel) {
  if (rel === 'index.html') return '(главная)';
  return rel.split('/')[0].replace(/\.html$/, '');
}

// T1–T4 — описательные страницы по классификации из SEO-плана:
// публикации, биография, места, наука, версии/источники и досье людей.
// Произведения (works) в долю не входят.
export function tierOf(rel, dossiers = dossierSlugs()) {
  if (rel.startsWith('works/')) return 'works';
  if (rel.startsWith('publications/') && !isHub(rel)) return 't1';
  if (/^(biography|places|research)\//.test(rel) && !isHub(rel)) return 't1';
  if (rel.startsWith('people/') && rel.endsWith('.html') && !isHub(rel)) {
    return dossiers.has(rel.slice('people/'.length, -'.html'.length)) ? 't1' : 'person';
  }
  if (rel === 'versions.html' || rel === 'sources.html') return 't1';
  if (isHub(rel)) return 'hub';
  return 'other';
}

export function today() {
  return moscowToday();
}

export function fmtPct(x) {
  return `${(x * 100).toFixed(1).replace('.', ',')}%`;
}
