// Проверка готовности dist/ к продакшену.
// Запуск: node scripts/verify.mjs [--strict]
// --strict превращает предупреждения в ошибки (для CI перед деплоем).

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { moscowToday } from './today.mjs';

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

// Фотографии персон: файл на месте, лицензия свободная, подпись есть.
const peopleData = await readJson('data/people.json', []);
let photos = 0;
for (const person of peopleData) {
  if (!person.photo) continue;
  photos += 1;
  const rel = String(person.photo).replace(/^\//, '');
  if (!existsSync(join(DIST, rel))) errors.push(`фото персоны ${person.id}: нет файла ${person.photo}`);
  if (!/\.(jpe?g|png|webp)$/i.test(person.photo)) errors.push(`фото персоны ${person.id}: неожиданный формат ${person.photo}`);
  if (!person.photoAlt) errors.push(`фото персоны ${person.id}: нет alt`);
  if (!person.photoCredit) errors.push(`фото персоны ${person.id}: нет подписи об источнике`);
  if (!/pd|public domain|cc0/i.test(String(person.photoLicense || ''))) errors.push(`фото персоны ${person.id}: лицензия «${person.photoLicense || 'нет'}» — нужна свободная`);
  if (!person.photoSource) errors.push(`фото персоны ${person.id}: нет ссылки на страницу файла`);
}
if (photos) info.push(`фото персон: ${photos} из ${peopleData.length}`);

// Досье персон: каждое утверждение должно нести ссылку на источник.
// Досье без ссылок хуже, чем его отсутствие: это выглядит как проверенный факт.
if (existsSync('data/dossiers.json')) {
  const dossiers = await readJson('data/dossiers.json');
  const people = existsSync('data/people.json') ? await readJson('data/people.json') : [];
  const ids = new Set((Array.isArray(people) ? people : []).map((x) => x.id));
  const isUrl = (u) => /^https?:\/\/[^\s]+\.[^\s]+/.test(String(u || ''));
  for (const [id, d] of Object.entries(dossiers || {})) {
    if (!ids.has(id)) errors.push(`досье: нет персоны с id «${id}»`);
    for (const [i, f] of (d.facts || []).entries()) {
      if (!String(f.claim || '').trim()) errors.push(`досье ${id}: факт ${i + 1} без текста`);
      if (!isUrl(f.source)) errors.push(`досье ${id}: факт ${i + 1} без ссылки на источник`);
    }
    for (const [i, r] of (d.relations || []).entries()) {
      if (!String(r.date || '').trim() || !String(r.event || '').trim()) errors.push(`досье ${id}: запись ${i + 1} без даты или события`);
      if (!isUrl(r.source)) errors.push(`досье ${id}: запись ${i + 1} без ссылки на источник`);
    }
    for (const s of d.sources || []) {
      if (!isUrl(s.url)) errors.push(`досье ${id}: источник «${s.label || '?'}» с битым адресом`);
    }
    if ((d.facts || []).length < 4) warnings.push(`досье ${id}: мало фактов (${(d.facts || []).length}) — возможно, недособрано`);
  }
  info.push(`досье: ${Object.keys(dossiers || {}).length} персон`);
}

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
// Файлы подтверждения прав (yandex_<код>.html и подобные) — служебные заглушки
// поисковиков: у них нет ни canonical, ни title, правила обычных страниц к ним не относятся.
const VERIFICATION_FILE = /(?:^|\/)(?:yandex|google|msvalidate|mailru)[_-]?[A-Za-z0-9]+\.html$/i;
const htmlFiles = files.filter((f) => extname(f) === '.html').filter((f) => !VERIFICATION_FILE.test(f.replace(/\\/g, '/')));
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

  // Экранированный HTML-тег в отрендеренной странице = сырой тег в markdown или данных:
  // генератор прогоняет текст через esc(), и читатель видит «<a href=…>» обычным текстом.
  const escTag = html.match(/&lt;\/?[a-zA-Z][a-zA-Z0-9]*(?:[^&]|&(?!gt;))*?(?:&gt;|&nbsp;|\s|$)/);
  if (escTag) errors.push(`${rel}: на странице виден экранированный HTML «${escTag[0].slice(0, 60)}» — в источнике сырой тег`);

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
if (!sitemap.includes('image:image')) warnings.push('sitemap: нет картинок (портрет и обложки)');

// --- RSS-лента ---
const feedPath = join(DIST, 'feed.xml');
if (!existsSync(feedPath)) errors.push('нет feed.xml');
else {
  const feed = await readFile(feedPath, 'utf8');
  const items = [...feed.matchAll(/<item>/g)].length;
  if (!items) errors.push('feed.xml: нет ни одного item');
  if (!feed.includes(`${SITE}/feed.xml`)) errors.push('feed.xml: нет atom:link на себя');
  if (!feed.includes(SITE)) errors.push('feed.xml: ссылки не на боевой домен');
}

// --- журнал (публикации) ---
const pubDir = join('content', 'publications');
if (existsSync(pubDir)) {
  const today = moscowToday();
  const files = (await readdir(pubDir)).filter((f) => f.endsWith('.md'));
  let published = 0;
  // Одно и то же фото в двух публикациях подряд читается как небрежность:
  // карточки журнала стоят рядом, повтор сразу видно. Держим картинки разными.
  const pubImages = new Map();
  for (const f of files) {
    const raw = await readFile(join(pubDir, f), 'utf-8');
    const title = raw.match(/^title:\s*"?([^"\n]+)"?\s*$/m)?.[1]?.trim();
    const slug = raw.match(/^slug:\s*(\S+)\s*$/m)?.[1]?.trim() || f.replace(/\.md$/, '');
    const date = raw.match(/^date:\s*(\S+)\s*$/m)?.[1]?.trim();
    if (!title) errors.push(`публикация ${f}: нет title`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) errors.push(`публикация ${f}: нет даты YYYY-MM-DD`);
    // Сырой HTML в markdown: генератор экранирует теги (esc в inline), и читатель
    // увидит их на странице текстом — «<a href=…>Библиотека</a>». Ссылка = [текст](/путь/).
    const pubBody = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
    if (/<\/?[a-zA-Z][^>]*>/.test(pubBody)) {
      errors.push(`публикация ${f}: в тексте сырой HTML — ссылки пишутся как [текст](/путь/), теги не нужны`);
    }
    // Разработчицкие детали (пути скриптов, npm-команды) в тексте для читателя —
    // признак недописанной редакционной правки.
    if (/\b(?:scripts\/[\w./-]+|npm run [\w:.-]+|reports\/[\w./-]+|[\w-]+\.mjs)\b/.test(raw)) {
      errors.push(`публикация ${f}: разработчицкие пути/команды (scripts/, npm run, reports/) в тексте для читателя`);
    }
    // Иллюстрация публикации: файл на месте, атрибуция полная, свободная лицензия.
    const fm = (name) => raw.match(new RegExp(`^${name}:\\s*"?([^"\\n]+)"?\\s*$`, 'm'))?.[1]?.trim() || '';
    const pubImage = fm('image');
    if (pubImage) {
      if (!existsSync(join(DIST, pubImage.replace(/^\//, '')))) errors.push(`публикация ${f}: нет файла картинки ${pubImage}`);
      if (!fm('imageAlt')) errors.push(`публикация ${f}: у картинки нет imageAlt`);
      if (!fm('imageCaption') && !fm('imageAlt')) errors.push(`публикация ${f}: у картинки нет подписи`);
      if (!/pd|public domain|cc0|cc by/i.test(fm('imageLicense'))) errors.push(`публикация ${f}: лицензия «${fm('imageLicense') || 'нет'}» — нужна свободная`);
      if (!String(fm('imageSource')).startsWith('https://commons.wikimedia.org/')) errors.push(`публикация ${f}: нет ссылки на файл Викисклада (imageSource)`);
      const seen = pubImages.get(pubImage);
      if (seen) errors.push(`публикация ${f}: картинка ${pubImage} уже стоит в публикации ${seen} — в журнале нужны разные`);
      else pubImages.set(pubImage, f);
    } else {
      errors.push(`публикация ${f}: нет картинки (image)`);
    }
    const page = join(DIST, 'publications', `${slug}.html`);
    const isFuture = /^\d{4}-\d{2}-\d{2}$/.test(date || '') && date > today;
    if (!isFuture) {
      published += 1;
      if (!existsSync(page)) errors.push(`публикация ${f}: не выпущена, но страницы ${slug}.html нет`);
    } else if (existsSync(page) && process.env.PUBLISH_ALL !== '1') {
      errors.push(`публикация ${f}: будущая дата ${date}, а страница уже в dist`);
    }
  }
  // Правило редакции: одна публикация в день и запас готовых статей на две недели.
  // Предупреждение, а не ошибка: срочная правка сайта не должна ждать редактуры.
  const futureDates = [];
  for (const f of files) {
    const raw = await readFile(join(pubDir, f), 'utf-8');
    const d = raw.match(/^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
    if (d && d > today) futureDates.push(d);
  }
  futureDates.sort();
  if (futureDates.length) {
    const isWeekday = (iso) => {
      const day = new Date(iso + 'T12:00:00Z').getUTCDay();
      return day !== 0 && day !== 6;
    };
    const last = futureDates[futureDates.length - 1];
    let buffer = 0;
    const cursor = new Date(today + 'T12:00:00Z');
    while (cursor.toISOString().slice(0, 10) < last) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (isWeekday(cursor.toISOString().slice(0, 10))) buffer += 1;
    }
    buffer += 1;
    if (buffer < 14) warnings.push(`очередь журнала: готовых статей на ${buffer} будних дней вперёд из 14 — пора писать`);
    else info.push(`очередь журнала: запас ${buffer} будних дней`);
  } else {
    warnings.push('очередь журнала пуста: нет ни одной статьи с будущей датой — публиковать будет нечего');
  }
  if (!existsSync(join(DIST, 'publications', 'index.html'))) errors.push('нет index.html журнала');
  if (!sitemap.includes('/publications/')) errors.push('карта сайта: нет журнала');
}

// --- редакционный тон страниц ---
// Формулы, которые выдают текст, собранный роботом: обращение к учителю,
// обещания «вы узнаете», канцелярские концовки. Проверяем весь dist, а не
// только журнал: эти фразы умеют просачиваться в описания разделов.
const BAD_TONE = [
  'как использовать на уроке',
  'что использовать на уроке',
  'что важно знать к разбору',
  'по одной публикации в день',
  'факты сверены с академическими изданиями',
  'формулировки — наши',
  'в этой статье мы расскажем',
  'вы узнаете',
];
for (const f of htmlFiles) {
  const text = await readFile(f, 'utf8');
  const low = text.toLowerCase();
  for (const phrase of BAD_TONE) {
    if (low.includes(phrase)) errors.push(`${f}: редакционная формула «${phrase}» — переписать живым текстом`);
  }
}

// --- «Обновлено»: фактическая дата правки ---
// В подвале каждой страницы должна стоять дата последнего изменения её
// материала или структуры (data/updated.json), а не дата сборки.
const updatedManifest = await readJson('data/updated.json', null);
if (!updatedManifest || !updatedManifest.sections || !updatedManifest.sections.structure) {
  errors.push('data/updated.json: нет манифеста дат разделов — запустить npm run stamp:updated');
} else {
  const todayIso = moscowToday();
  for (const [key, date] of Object.entries(updatedManifest.sections)) {
    if (date && date > todayIso) errors.push(`data/updated.json: раздел ${key} датирован будущим (${date})`);
  }
  let dated = 0;
  for (const f of htmlFiles) {
    const text = await readFile(f, 'utf8');
    if (!/Обновлено \d{1,2} [а-яё]+ \d{4}/i.test(text)) {
      errors.push(`${f}: в подвале нет поля «Обновлено» с датой`);
      continue;
    }
    dated++;
    const futureDates = [...text.matchAll(/"dateModified":"(\d{4}-\d{2}-\d{2})"/g)]
      .map((m) => m[1])
      .filter((d) => d > todayIso);
    if (futureDates.length) errors.push(`${f}: dateModified в будущем (${futureDates[0]})`);
  }
  info.push(`страниц с датой «Обновлено»: ${dated}`);
}

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
// Маркировка рекламы обязана быть в заданной форме: «Реклама. Рекламодатель … , ОГРН …»
const adv = config.affiliate?.advertiser || {};
if (books.length && adv.name) {
  const required = `Реклама. Рекламодатель ${adv.name}${adv.ogrn ? `, ОГРН ${adv.ogrn}` : ''}.`;
  if (!booksHtml.includes(required)) errors.push(`books: нет обязательной маркировки «${required}»`);
}
// Цена: собирается всегда, публикуется только при affiliate.showPrice.
// Проверяем структурно, а не поиском числа (число может случайно встретиться в ISBN или страницах).
const showPrice = config.affiliate?.showPrice === true;
const hasPriceBlock = booksHtml.includes('class="book-price"') || booksHtml.includes('bp-value');
if (books.length && showPrice && !hasPriceBlock) errors.push('books: affiliate.showPrice включён, но цены на странице нет');
if (books.length && !showPrice && hasPriceBlock) errors.push('books: цена попала на страницу при выключенном affiliate.showPrice');
for (const b of books) {
  if (b.price && !b.priceCheckedAt) warnings.push(`books: ${b.id} — у цены нет даты проверки (priceCheckedAt)`);
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

// --- аудиокниги (ЛитРес, Партнёрская программа AdvCake) ---
const audiobooks = await readJson('data/audiobooks.json');
if (audiobooks.length) {
  if (!locs.some((l) => l.endsWith('/audiobooks/'))) errors.push('sitemap: нет раздела аудиокниг');
  const audioHtml = await readFile(join(DIST, 'audiobooks/index.html'), 'utf8');
  const seenAudio = new Set();
  for (const b of audiobooks) {
    const id = b.id || '?';
    if (!b.title || !b.annotation) errors.push(`audiobooks.json: у ${id} нет title/annotation`);
    if (!b.durationMinutes || !b.duration) errors.push(`audiobooks.json: у ${id} нет длительности`);
    if (!b.category) errors.push(`audiobooks.json: у ${id} нет категории`);
    if (!b.performer) warnings.push(`audiobooks.json: у ${id} не указан чтец`);
    if (seenAudio.has(b.productId)) errors.push(`audiobooks.json: товар ${b.productId} продублирован`);
    seenAudio.add(b.productId);
    if (!(b.links || []).length) errors.push(`audiobooks.json: у ${id} нет партнёрской ссылки`);
    for (const l of b.links || []) {
      if (!/^https:\/\//.test(l.url)) errors.push(`audiobooks.json: ${id} — ссылка не https`);
      if (!/[?&]utm_source=advcake/.test(l.url)) errors.push(`audiobooks.json: ${id} — ссылка без меток advcake`);
      if (!/[?&]erid=/.test(l.url)) errors.push(`audiobooks.json: ${id} — ссылка без erid`);
    }
    if (!b.cover) errors.push(`audiobooks.json: у ${id} нет обложки`);
    for (const key of ['cover', 'coverWebp']) {
      if (!b[key]) continue;
      const file = join(DIST, b[key].replace(/^\//, ''));
      if (!existsSync(file)) errors.push(`аудиокниги: ${id} — файл обложки ${b[key]} не попал в dist/`);
      else if ((await stat(file)).size < 1024) errors.push(`аудиокниги: ${id} — обложка ${b[key]} подозрительно мала`);
    }
  }
  const audioCards = (audioHtml.match(/class="book-card"/g) || []).length;
  if (audioCards !== audiobooks.length) errors.push(`аудиокниги: карточек на странице ${audioCards}, а в данных ${audiobooks.length}`);
  if (!audioHtml.includes('rel="sponsored')) errors.push('аудиокниги: у ссылок нет rel="sponsored"');
  if (audioHtml.includes('class="book-price"')) errors.push('аудиокниги: цена попала на страницу при выключенном affiliate.showPrice');
  // Рекламодатель у ЛитРеса свой — маркировка должна быть его, а не «Читай-города».
  const litresAdv = config.affiliate?.stores?.litres?.advertiser || {};
  if (litresAdv.name) {
    const required = `Реклама. Рекламодатель ${litresAdv.name}${litresAdv.inn ? `, ИНН ${litresAdv.inn}` : litresAdv.ogrn ? `, ОГРН ${litresAdv.ogrn}` : ''}.`;
    if (!audioHtml.includes(required)) errors.push(`аудиокниги: нет обязательной маркировки «${required}»`);
  }
  for (const b of audiobooks) {
    for (const l of b.links || []) {
      const erid = (String(l.url).match(/[?&]erid=([^&]+)/i) || [])[1];
      if (erid && !audioHtml.includes(`erid: ${decodeURIComponent(erid)}`)) {
        errors.push(`аудиокниги: у ${b.id} ссылка с erid=${decodeURIComponent(erid)}, но erid не выведен на странице`);
      }
    }
  }
  if (!search.some((s) => s.u === '/audiobooks/')) errors.push('search.json: нет раздела аудиокниг');
  info.push(`аудиокниг проверено: ${audiobooks.length}`);
}

// --- тексты произведений ---
// Импорт с Викитеки оставлял <h3>, __NOTOC__ и «== 1 ==» — на странице это мусор.
const worksData = await readJson('data/works.json');
for (const w of worksData) {
  const t = String(w.text || '');
  if (/<\/?[a-zA-Z][^>]*>/.test(t)) errors.push(`works.json: ${w.slug} — сырые HTML-теги в тексте произведения`);
  if (/(?:^|\n)__\w+__/.test(t)) errors.push(`works.json: ${w.slug} — wiki-хелперы (__NOTOC__) в тексте`);
  if (/(?:^|\n)==+[^=\n]+==+\s*(?:\n|$)/.test(t)) errors.push(`works.json: ${w.slug} — wiki-заголовки «== … ==» в тексте`);
}
if (worksData.length) info.push(`произведений проверено: ${worksData.length}`);

// --- книжный вид: разметка прозы (план 1, шаг S1) ---
// V1. Охват задан конфигом, а не кодом: без genres/minChars книгу не собрать.
const bookCfg = config.reader?.book || {};
if (!Array.isArray(bookCfg.genres) || !bookCfg.genres.length) {
  errors.push('site.config.json: нет reader.book.genres/minChars');
} else if (!(Number(bookCfg.minChars) > 0)) {
  errors.push('site.config.json: нет reader.book.genres/minChars');
}
// V2. Отбор по конфигу: ровно 17 текстов (решение владельца, порог не подгоняем).
const bookGenres = new Set(bookCfg.genres || []);
const bookMin = Number(bookCfg.minChars) || 1500;
const bookSelection = worksData.filter((w) => bookGenres.has(w.genre) && (w.chars || 0) >= bookMin);
if (bookSelection.length !== 17) {
  errors.push(`book: по reader.book отобрано ${bookSelection.length} текстов вместо 17`);
}
const bookSelSlugs = new Set(bookSelection.map((w) => w.slug));
const collapseBook = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const decodeBook = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&');

// V4. Содержимое обёртки .poem[data-book-source] без потери знаков.
// Идём по тегам и считаем баланс div — иначе оборвёмся на вложенном book-verse.
function bookInner(html) {
  const at = html.indexOf('class="poem" data-book-source');
  if (at < 0) return null;
  const openEnd = html.indexOf('>', at);
  if (openEnd < 0) return null;
  let depth = 1;
  const re = /<(\/?)div\b[^>]*>/gi;
  re.lastIndex = openEnd + 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === '/') {
      depth -= 1;
      if (depth === 0) return html.slice(openEnd + 1, m.index);
    } else {
      depth += 1;
    }
  }
  return null;
}
const bookPlain = (inner) => collapseBook(decodeBook(String(inner)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')));

// V3. Обёртка стоит ровно у 17 отобранных текстов и отсутствует у остальных.
const bookPages = new Map();
let bookBlocks = 0;
for (const w of worksData) {
  const rel = `works/${w.slug}.html`;
  const file = join(DIST, rel);
  if (!existsSync(file)) continue; // пропажу поймает проверка ссылок
  const html = await readFile(file, 'utf8');
  const inner = bookInner(html);
  if (inner == null) {
    if (bookSelSlugs.has(w.slug)) errors.push(`${rel}: у текста книги нет обёртки .poem[data-book-source]`);
    continue;
  }
  if (!bookSelSlugs.has(w.slug)) {
    errors.push(`${rel}: обёртка data-book-source у текста вне отбора reader.book`);
    continue;
  }
  bookPages.set(w.slug, html);
  bookBlocks += (inner.match(/<p[\s>]/g) || []).length
    + (inner.match(/class="book-verse"/g) || []).length
    + (inner.match(/class="book-head"/g) || []).length;
  const got = bookPlain(inner);
  const want = collapseBook(w.text);
  if (got !== want) {
    let i = 0;
    while (i < got.length && got[i] === want[i]) i += 1;
    errors.push(`${rel}: текст книги расходится с works.json на позиции ${i}: «${got.slice(i, i + 40)}» вместо «${want.slice(i, i + 40)}»`);
  }
  // S6 (п.6, R4): chars — длина текста по-сырому; строковое равенство выше
  // держит собранные знаки, здесь — связка «chars = длине text».
  if (w.chars !== w.text.length) {
    errors.push(`${rel}: chars ${w.chars} при длине text ${w.text.length} в works.json`);
  }
}
if (bookPages.size !== 17) errors.push(`book: страниц с обёрткой data-book-source ${bookPages.size} вместо 17`);

// V5. Типовые счётчики: замер по правилам БП на текущих данных. Расхождение означает,
// что правило реализовано иначе, а не что замер устарел.
const bookTypeExpect = {
  'ярославны-плачут': { 'book-verse': 11 },
  'ключи-марии': { 'book-verse': 3 },
  'отчее-слово': { 'book-verse': 2 },
  'о-сборниках-произведений-пролетарских-писателей': { 'book-verse': 1 },
  'железный-миргород': { 'book-part': 2, 'book-head': 5 },
  'у-белой-воды': { 'book-part': 3 },
  'avtobiografiya-1923': { 'book-date': 1 },
};
for (const [slug, expect] of Object.entries(bookTypeExpect)) {
  const html = bookPages.get(slug);
  if (!html) {
    errors.push(`book: нет страницы works/${slug}.html с обёрткой data-book-source`);
    continue;
  }
  for (const [cls, want] of Object.entries(expect)) {
    const got = (html.match(new RegExp(`class="${cls}"`, 'g')) || []).length;
    if (got !== want) errors.push(`works/${slug}.html: блоков ${cls} ${got}, ожидалось ${want}`);
  }
}
// Структурные строки не должны остаться обычными абзацами.
if (bookPages.has('железный-миргород') && /<p>\s*(?:I|II)\s*<\/p>/.test(bookPages.get('железный-миргород'))) {
  errors.push('works/железный-миргород.html: номер части «I»/«II» остался абзацем p');
}
if (bookPages.has('у-белой-воды') && /<p>\s*[123]\s*<\/p>/.test(bookPages.get('у-белой-воды'))) {
  errors.push('works/у-белой-воды.html: номер части «1»/«2»/«3» остался абзацем p');
}
if (bookPages.has('avtobiografiya-1923') && !/class="book-date">1923</.test(bookPages.get('avtobiografiya-1923'))) {
  errors.push('works/avtobiografiya-1923.html: год 1923 не размечен блоком book-date');
}
// V6. Сводка по книжному виду (575 блоков — замер по правилам БП).
info.push(`book: ${bookPages.size} текстов, ${bookBlocks} абзацев`);

// V7. Книга S3: вендоренный лист на месте, цел и в бюджете, canvas в разметке нет.
// Книжные файлы копируются из src/book как есть, поэтому проверяется именно dist.
for (const f of ['book.js', 'book.css', 'stpageflip.js']) {
  if (!existsSync(join(DIST, 'book', f))) errors.push(`dist/book/${f} отсутствует`);
}
const flipPath = join(DIST, 'book', 'stpageflip.js');
if (existsSync(flipPath)) {
  const raw = await readFile(flipPath);
  // Заголовка MIT в самом бандле нет (он добавлен при вендоринге), поэтому
  // проверяется начало файла — соглашение шага S3, решение R2.
  const head = raw.subarray(0, 2048).toString('utf8');
  if (!head.includes('MIT') || !head.includes('StPageFlip')) {
    errors.push('dist/book/stpageflip.js: в первых 2 КБ нет заголовка MIT со StPageFlip');
  }
  if (raw.length > 51200) errors.push(`dist/book/stpageflip.js: ${raw.length} байт при бюджете 51200`);
  else info.push(`book: StPageFlip ${raw.length} байт`);
}
// Текст книги обязан оставаться текстом: canvas в собранной разметке нет.
for (const file of files.filter((f) => extname(f) === '.html')) {
  const html = await readFile(file, 'utf8');
  if (/<canvas[\s>]/i.test(html)) errors.push(`${file.replace(/\\/g, '/')}: элемент canvas в разметке`);
}

// S6 (п.3б, R3): суммарный бюджет книжного кода. Порог шага 65 536 (64 КБ) —
// документ §8 п.3 приведён к этому факту 06.11.2026 (В1 = A), см. §16.
const BOOK_BUDGET = 65536;
let bookCodeBytes = 0;
let bookCodeComplete = true;
for (const f of ['book.js', 'book.css']) {
  const p = join(DIST, 'book', f);
  if (!existsSync(p)) { bookCodeComplete = false; continue; }
  bookCodeBytes += (await stat(p)).size;
}
if (bookCodeComplete && bookCodeBytes > BOOK_BUDGET) {
  errors.push(`dist/book: book.js + book.css ${bookCodeBytes} байт при бюджете ${BOOK_BUDGET} — порог гейта, см. §8 п.3 документа`);
}

// Счётчик Метрики продублирован в src/book/book.js (модулю конфиг недоступен).
// Перенос серии 06.11.2026: у сайтов разные счётчики, и подмена одного другим
// при клонировании — реальная ошибка, поэтому сверка с конфигом стала гейтом,
// а не строкой отчёта.
const ymId = String(config.analytics?.yandexMetrika || '');
if (ymId) {
  const bookJs = existsSync(join(DIST, 'book', 'book.js'))
    ? await readFile(join(DIST, 'book', 'book.js'), 'utf8') : '';
  const inBook = /const YM_ID = '(\d+)'/.exec(bookJs);
  if (!inBook) errors.push('dist/book/book.js: не найдена константа YM_ID');
  else if (inBook[1] !== ymId) errors.push(`dist/book/book.js: YM_ID ${inBook[1]} не совпадает с analytics.yandexMetrika ${ymId}`);
  else info.push('book: счётчик Метрики совпадает с конфигом');
}

// S6 (п.7): книга грузится по клику (S2), поэтому book.js не должен стоять
// статическим script src ни в одной собранной странице.
for (const file of files.filter((f) => extname(f) === '.html')) {
  const html = await readFile(file, 'utf8');
  if (/<script[^>]+src="[^"]*book\.js/.test(html)) {
    errors.push(`${file.replace(/\\/g, '/')}: book.js подключён статическим script src в HTML`);
  }
}

// S6 (п.8): кнопка «Режим книги» — ровно у 17 отобранных текстов и ни у кого
// из коротких (проза-жанры с chars < reader.book.minChars).
const bookShortSlugs = new Set(
  worksData.filter((w) => bookGenres.has(w.genre) && (w.chars || 0) < bookMin).map((w) => w.slug),
);
let bookBtnPages = 0;
for (const w of worksData) {
  const rel = `works/${w.slug}.html`;
  const file = join(DIST, rel);
  if (!existsSync(file)) continue;
  const html = await readFile(file, 'utf8');
  const hasBtn = html.includes('data-poem-action="book"');
  if (hasBtn) bookBtnPages += 1;
  if (bookSelSlugs.has(w.slug) && !hasBtn) errors.push(`${rel}: у текста книги нет кнопки «Режим книги»`);
  if (bookShortSlugs.has(w.slug) && hasBtn) errors.push(`${rel}: кнопка «Режим книги» у короткого текста (chars ${w.chars} < ${bookMin})`);
}
if (bookBtnPages !== 17) errors.push(`book: страниц с кнопкой «Режим книги» ${bookBtnPages} вместо 17`);

// --- служебные файлы ---

// Служебные оговорки сборщика не должны доходить до читателя: на странице —
// готовый текст, а не разговор сайта с самим собой. Ловим формулировки,
// которые уже попадали в публикацию («в этом пакете», «выдуманный список»);
// одиночное «выдуманный» не ловим — оно встречается в художественных текстах.
const META_PHRASES = [
  'в этом пакете',
  'в данном пакете',
  'перед публикацией его нужно сверить',
  'выдуманный длинный список',
  'каждая строка подтверждается',
  'сокращён сознательно',
];
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const lowered = html.toLowerCase();
  for (const phrase of META_PHRASES) {
    if (lowered.includes(phrase)) errors.push(`${file}: служебная оговорка «${phrase}» видна читателю`);
  }
}
// Печать: на бумагу идёт только произведение. «Похожие произведения», переходы
// к соседним текстам и блок источника помечены классами и выключены в @media
// print — проверяем, что разметка и правило не разошлись между собой.
const printCss = await readFile(join(DIST, 'styles.css'), 'utf8');
const printBlocks = [...printCss.matchAll(/@media print \{[\s\S]*?\n\}/g)].map((m) => m[0]);
if (!printBlocks.some((b) => b.includes('.related-works') && b.includes('.work-nav') && b.includes('.source-box'))) {
  errors.push('styles.css: в @media print не выключены «Похожие произведения», переходы или источник');
}
const sampleWork = worksData.find((w) => existsSync(join(DIST, 'works', `${w.slug}.html`)));
if (sampleWork) {
  const sampleHtml = await readFile(join(DIST, 'works', `${sampleWork.slug}.html`), 'utf8');
  if (!sampleHtml.includes('class="section related-works"')) errors.push(`works/${sampleWork.slug}.html: «Похожие произведения» без класса related-works — блок попадёт на печать`);
  if (!sampleHtml.includes('class="work-nav"')) errors.push(`works/${sampleWork.slug}.html: переходы к соседним текстам без класса work-nav`);
}

for (const f of ['404.html', 'robots.txt', 'sitemap.xml', 'search.json', '_headers', '_redirects', '.nojekyll', 'favicon.svg', 'styles.css', 'app.js']) {
  if (!existsSync(join(DIST, f))) errors.push(`dist/${f} отсутствует`);
}
if (!existsSync(join(DIST, 'books/index.html'))) errors.push('нет страницы /books/');
if (!existsSync(join(DIST, 'theme.js'))) errors.push('нет /theme.js (анти-вспышка темы)');

// IndexNow: без файла-ключа в корне Яндекс и Bing отклонят отправку адресов.
const indexNowKey = String(config.indexNow?.key || '').trim();
if (config.indexNow?.enabled !== false && indexNowKey) {
  const keyPath = join(DIST, `${indexNowKey}.txt`);
  if (!existsSync(keyPath)) errors.push(`нет файла ключа IndexNow dist/${indexNowKey}.txt`);
  else if ((await readFile(keyPath, 'utf8')).trim() !== indexNowKey) errors.push(`файл ключа IndexNow ${indexNowKey}.txt не совпадает с ключом в конфиге`);
  else info.push('IndexNow: ключ на месте');
}

// Файл подтверждения Яндекс.Вебмастера: без него домен не подтвердить.
const yandexCode = String(config.verification?.yandex || '').trim();
if (yandexCode) {
  const yFile = join(DIST, `yandex_${yandexCode}.html`);
  if (!existsSync(yFile)) errors.push(`нет файла подтверждения Вебмастера dist/yandex_${yandexCode}.html`);
  else if (!(await readFile(yFile, 'utf8')).includes(`Verification: ${yandexCode}`)) errors.push(`файл yandex_${yandexCode}.html не содержит код подтверждения`);
  else info.push('Вебмастер: файл подтверждения на месте');
}

// Файл подтверждения Google Search Console.
const googleCode = String(config.verification?.google || '').trim();
if (googleCode) {
  const gFile = join(DIST, `google${googleCode}.html`);
  if (!existsSync(gFile)) errors.push(`нет файла подтверждения Google dist/google${googleCode}.html`);
  else if (!(await readFile(gFile, 'utf8')).includes(`google-site-verification: google${googleCode}.html`)) errors.push(`файл google${googleCode}.html не содержит код подтверждения`);
  else info.push('Google: файл подтверждения на месте');
}

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
