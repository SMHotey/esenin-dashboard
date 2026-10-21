// Проверка готовности dist/ к продакшену.
// Запуск: node scripts/verify.mjs [--strict]
// --strict превращает предупреждения в ошибки (для CI перед деплоем).

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { existsSync } from 'node:fs';

const DIST = 'dist';
const strict = process.argv.includes('--strict');
const errors = [];
const warnings = [];
const info = [];

const readJson = async (p) => {
  const raw = (await readFile(p, 'utf8')).trim();
  // Пустой файл данных — «пока нет», раздел показывает заглушку (см. build.mjs).
  return raw ? JSON.parse(raw) : [];
};
const config = await readJson('site.config.json');
const SITE = String(config.siteUrl || '').replace(/\/$/, '');

if (!SITE) errors.push('site.config.json: не задан siteUrl');
if (/\.example\b|example\.(org|com)/.test(SITE)) warnings.push('siteUrl всё ещё заглушка — укажите боевой домен');
if (config.affiliate?.enabled === false) info.push('партнёрские ссылки отключены в конфиге');

async function walk(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) await walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function distPathFor(urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p.endsWith('/')) p += 'index.html';
  return join(DIST, p.replace(/^\//, ''));
}

const files = await walk(DIST);
const htmlFiles = files.filter((f) => extname(f) === '.html');
const titles = new Map();

for (const file of htmlFiles) {
  const rel = file.replace(/\\/g, '/').replace(/^dist\//, '');
  const html = await readFile(file, 'utf8');

  if (!html.startsWith('<!doctype html>')) errors.push(`${rel}: нет doctype`);
  if (!/<html lang="[a-z-]+"/.test(html)) errors.push(`${rel}: нет lang у <html>`);
  if (html.includes('__CANONICAL__')) errors.push(`${rel}: не подставлен canonical`);

  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
  if (!title.trim()) errors.push(`${rel}: пустой <title>`);
  else if (title.length > 90) warnings.push(`${rel}: длинный title (${title.length})`);
  if (title) {
    if (titles.has(title)) errors.push(`${rel}: дублируется title с ${titles.get(title)}`);
    else titles.set(title, rel);
  }

  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] || '';
  if (!desc) errors.push(`${rel}: нет description`);
  else if (desc.length < 50) warnings.push(`${rel}: короткий description (${desc.length})`);

  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) errors.push(`${rel}: h1 встречается ${h1} раз`);

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || '';
  if (!canonical) errors.push(`${rel}: нет canonical`);
  else if (!canonical.startsWith(SITE + '/')) errors.push(`${rel}: canonical вне siteUrl`);

  const robots = html.match(/<meta name="robots" content="([^"]+)"/)?.[1] || '';
  if (rel === '404.html' && !robots.includes('noindex')) errors.push('404.html: должен быть noindex');

  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || '';
  if (ogImage) {
    const local = ogImage.replace(SITE, '');
    if (!existsSync(join(DIST, decodeURIComponent(local)))) errors.push(`${rel}: og:image не найден (${local})`);
  }

  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!ld.length) warnings.push(`${rel}: нет JSON-LD`);
  for (const [, body] of ld) {
    try { JSON.parse(body); } catch (e) { errors.push(`${rel}: битый JSON-LD (${e.message})`); }
  }

  // внутренние ссылки
  for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    if (href.startsWith('//')) continue;
    const target = distPathFor(href);
    if (!existsSync(target)) errors.push(`${rel}: битая ссылка ${href}`);
    else if ((await stat(target)).isDirectory() && !existsSync(join(target, 'index.html'))) {
      errors.push(`${rel}: каталог без index.html ${href}`);
    }
  }
}

// --- sitemap ---
const sitemap = await readFile(join(DIST, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!locs.length) errors.push('sitemap.xml пуст');
for (const loc of locs) {
  if (!loc.startsWith(SITE)) errors.push(`sitemap: чужой домен ${loc}`);
  const path = decodeURIComponent(new URL(loc).pathname);
  if (!existsSync(distPathFor(path))) errors.push(`sitemap: нет файла для ${path}`);
}
if (locs.some((l) => l.includes('/404.html'))) errors.push('sitemap: 404 не должен индексироваться');
if (!locs.some((l) => l.endsWith('/books/'))) errors.push('sitemap: нет раздела книг');
if (locs.length > htmlFiles.length) errors.push('sitemap: URL больше, чем HTML-страниц');

// --- поиск ---
const search = await readJson(join(DIST, 'search.json'));
if (!Array.isArray(search) || !search.length) errors.push('search.json пуст');
for (const item of search.slice(0, 500)) {
  if (!item.u || !existsSync(distPathFor(item.u))) errors.push(`search.json: битый URL ${item.u}`);
}

// --- книги ---
const books = await readJson('data/books.json');
if (!books.length) warnings.push('data/books.json пуст — раздел «Книги» покажет заглушку');
for (const b of books) {
  if (!b.title || !b.annotation) errors.push(`books.json: у ${b.id || '?'} нет title/annotation`);
  for (const l of b.links || []) {
    if (!/^https:\/\//.test(l.url)) errors.push(`books.json: ${b.id} — ссылка не https`);
  }
}
const markedLinks = books.some((b) => (b.links || []).some((l) => /[?&](erid|partnerid)=/i.test(l.url || '')));
if (config.affiliate?.enabled && books.length && !Object.values(config.affiliate?.stores || {}).some((s) => s.tag) && !markedLinks) {
  warnings.push('партнёрские ссылки без меток: заполните affiliate.stores.*.tag');
}
const booksHtml = await readFile(join(DIST, 'books/index.html'), 'utf8');
if (books.length && !booksHtml.includes('rel="sponsored')) errors.push('books: у ссылок нет rel="sponsored"');
if (books.length && !booksHtml.includes('ad-mark')) errors.push('books: нет пометки «реклама»');
// Маркировка рекламы обязана быть в заданной форме: «Реклама. Рекламодатель … , ОГРН …»
const adv = config.affiliate?.advertiser || {};
if (books.length && adv.name) {
  const required = `Реклама. Рекламодатель ${adv.name}${adv.ogrn ? `, ОГРН ${adv.ogrn}` : ''}.`;
  if (!booksHtml.includes(required)) errors.push(`books: нет обязательной маркировки «${required}»`);
}
// Цена: если она есть в данных, она обязана быть на странице вместе с датой проверки
for (const b of books) {
  if (!b.price) continue;
  const expected = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(b.price));
  if (!booksHtml.includes(expected)) errors.push(`books: ${b.id} — цена ${expected} не выведена на странице`);
  if (!b.priceCheckedAt) warnings.push(`books: ${b.id} — у цены нет даты проверки (priceCheckedAt)`);
}
// Обложки книг должны попадать в сборку
for (const b of books) {
  for (const key of ['cover', 'coverWebp']) {
    if (!b[key]) continue;
    const f = join(DIST, b[key].replace(/^\//, ''));
    if (!existsSync(f)) errors.push(`books: ${b.id} — файл обложки ${b[key]} не попал в dist/`);
    else if ((await stat(f)).size < 1024) errors.push(`books: ${b.id} — обложка ${b[key]} подозрительно мала`);
  }
}
// Проверяем маркировку интернет-рекламы: если в ссылке есть erid, он должен быть виден на странице.
for (const b of books) {
  for (const l of b.links || []) {
    const erid = (String(l.url).match(/[?&]erid=([^&]+)/i) || [])[1];
    if (erid && !booksHtml.includes(`erid: ${decodeURIComponent(erid)}`)) {
      errors.push(`books: у ${b.id} ссылка с erid=${decodeURIComponent(erid)}, но erid не выведен на странице`);
    }
  }
}

// --- служебные файлы ---
for (const f of ['404.html', 'robots.txt', 'sitemap.xml', 'search.json', '_headers', '_redirects', '.nojekyll', 'favicon.svg', 'styles.css', 'app.js']) {
  if (!existsSync(join(DIST, f))) errors.push(`dist/${f} отсутствует`);
}
if (!existsSync(join(DIST, 'books/index.html'))) errors.push('нет страницы /books/');
if (!existsSync(join(DIST, 'theme.js'))) errors.push('нет /theme.js (анти-вспышка темы)');

// --- итог ---
const totalBytes = (await Promise.all(files.map((f) => stat(f).then((s) => s.size)))).reduce((a, b) => a + b, 0);
info.push(`страниц: ${htmlFiles.length}, файлов: ${files.length}`);
info.push(`размер dist: ${(totalBytes / 1024 / 1024).toFixed(1)} МБ`);
if (warnings.length) {
  console.log('ПРЕДУПРЕЖДЕНИЯ:');
  for (const w of warnings) console.log('  ! ' + w);
}
if (errors.length) {
  console.log('ОШИБКИ:');
  for (const e of errors) console.log('  x ' + e);
}
console.log(`\nПроверено: ${info.join('; ')}`);
console.log(errors.length ? `ПРОВЕРКА НЕ ПРОЙДЕНА: ${errors.length} ошибок, ${warnings.length} предупреждений` : `ПРОВЕРКА ПРОЙДЕНА: ошибок нет, предупреждений ${warnings.length}`);
if (errors.length || (strict && warnings.length)) process.exit(1);
