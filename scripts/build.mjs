import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { buildSectionPages } from './sections.mjs';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

async function readJson(rel, fallback) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) return fallback;
  const raw = (await readFile(file, 'utf8')).trim();
  // Пустой файл (0 байт) — это «данных пока нет», а не ошибка: раздел покажет заглушку.
  if (!raw) return fallback;
  return JSON.parse(raw);
}

const config = await readJson('site.config.json', {});

const A = {
  firstName: 'Автор',
  lastName: '',
  name: 'Автор',
  fullName: 'Автор',
  genitive: 'автора',
  prepositional: 'авторе',
  role: 'писатель',
  roleGenitive: 'писателя',
  years: '',
  birthDate: '',
  deathDate: '',
  birthPlace: '',
  deathPlace: '',
  shortDescription: 'Писатель',
  lead: '',
  portrait: '',
  portraitAlt: '',
  portraitCaption: '',
  footerAbout: '',
  footerNote: '',
  copyright: '',
  licenseNote: '',
  ...(config.author || {}),
};
if (!A.roleGenitive) A.roleGenitive = A.role;
if (!A.lastName) A.lastName = A.name;

const SITE = String(config.siteUrl || 'https://example.org').replace(/\/$/, '');
const TEXTS_PD = config.textsPublicDomain !== false;
const LANG = config.lang || 'ru';
const UPDATED = config.updated || new Date().toISOString().slice(0, 10);
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function formatDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || '');
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
const UPDATED_LABEL = formatDate(UPDATED);

// Цена книги: «8 299 ₽», пробелы-разделители как в магазине.
function priceFmt(value, currency = 'RUB') {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);
  const sign = currency === 'RUB' ? '₽' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
  return `${formatted} ${sign}`;
}
const ruDate = (iso) => formatDate(String(iso || '').slice(0, 10));

const stylesSource = await readFile('src/styles.css');
const appSource = await readFile('src/app.js');
const themeSource = await readFile('src/theme.js');
const assetVersion = createHash('sha1')
  .update(stylesSource).update(appSource).update(themeSource)
  .digest('hex').slice(0, 8);

const works = await readJson('data/works.json', []);
const people = await readJson('data/people.json', []);
const timeline = await readJson('data/timeline.json', []);
const research = await readJson('data/research.json', []);
const sources = await readJson('data/sources.json', []);
const studies = await readJson('data/studies.json', []);
const passions = await readJson('data/passions.json', []);
const versions = await readJson('data/versions.json', []);
const books = await readJson('data/books.json', []);
const places = await readJson('data/places.json', []);
const museums = await readJson('data/museums.json', []);
const monuments = await readJson('data/monuments.json', []);
const music = await readJson('data/music.json', { items: [] });
const films = await readJson('data/films.json', { items: [] });
const languages = await readJson('data/languages.json', { languages: [] });
const topics = await readJson('data/topics.json', []);
const glossary = await readJson('data/glossary.json', { groups: [] });
const faq = await readJson('data/faq.json', []);
const death = await readJson('data/death.json', { blocks: [] });

const categories = Object.keys(config.peopleCategories || {}).length
  ? config.peopleCategories
  : { family: 'Семья', friends: 'Друзья', colleagues: 'Коллеги' };

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const plural = (n, forms) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е');
const withName = (t) => t.replaceAll('{name}', A.name).replaceAll('{genitive}', A.genitive)
  .replaceAll('{prepositional}', A.prepositional).replaceAll('{role}', A.role)
  .replaceAll('{roleGenitive}', A.roleGenitive).replaceAll('{years}', A.years);

// ---------- markdown ----------

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let para = [];
  let list = null;

  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
    if (list) { out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`); list = null; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith('## ')) { flush(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('### ')) { flush(); out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('> ')) { flush(); out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); continue; }
    if (/^---+$/.test(line)) { flush(); out.push('<hr>'); continue; }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!list || list.type !== 'ul') { if (list) flush(); list = { type: 'ul', items: [] }; }
      list.items.push(li[1]);
      continue;
    }
    para.push(line);
  }
  flush();
  return out.join('\n');
}

function inline(text) {
  let t = esc(text);
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return t;
}

async function readArticle(file) {
  const raw = (await readFile(join('content', file), 'utf8')).replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: { slug: file.replace(/\.md$/, '') }, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(?:"([\s\S]*)"|(.+))$/);
    if (kv) meta[kv[1]] = (kv[2] ?? kv[3] ?? '').trim();
  }
  if (!meta.slug) meta.slug = file.replace(/\.md$/, '');
  return { meta, body: m[2] };
}

// ---------- layout ----------

const nav = [
  ['/biography/', 'Биография', 'biography'],
  ['/people/', 'Люди', 'people'],
  ['/life/', 'Жизнь', 'life'],
  ['/works/', 'Библиотека', 'works'],
  ['/places/', 'Места', 'places'],
  ['/legacy/', 'Наследие', 'legacy'],
  ['/books/', 'Книги', 'books'],
  ['/research/', 'Наука', 'research'],
];

function analyticsHtml() {
  const ym = config.analytics?.yandexMetrika;
  const ga = config.analytics?.googleAnalytics;
  let out = '';
  if (ym) {
    out += `<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${encodeURIComponent(ym)}', 'ym');

    ym(${JSON.stringify(String(ym))}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/${esc(ym)}" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->`;
  }
  if (ga) {
    out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config",${JSON.stringify(String(ga))});</script>`;
  }
  return out;
}

function layout({ title, description, content, active = '', bodyClass = '', jsonLd = [], noindex = false, ogType = 'website', preloadImage = '', breadcrumb = [] }) {
  const navHtml = nav.map(([href, label, key]) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('');

  const fullTitle = title.includes(A.lastName) || title.includes(A.name) ? title : `${title} — ${A.name}`;
  const ogImage = config.ogImage || A.portrait;
  const ogDims = config.ogImage ? '\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : '';
  const twitterCard = config.ogImage ? 'summary_large_image' : 'summary';
  const graph = [
    {
      '@type': 'Person',
      '@id': `${SITE}/#person`,
      name: A.fullName,
      alternateName: A.name,
      birthDate: A.birthDate || undefined,
      deathDate: A.deathDate || undefined,
      birthPlace: A.birthPlace ? { '@type': 'Place', name: A.birthPlace } : undefined,
      deathPlace: A.deathPlace ? { '@type': 'Place', name: A.deathPlace } : undefined,
      description: A.shortDescription,
      jobTitle: A.role,
      image: A.portrait ? `${SITE}${A.portrait}` : undefined,
      url: `${SITE}/`,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: `${SITE}/`,
      name: `${A.name} — биография, произведения, книги`,
      inLanguage: LANG,
      publisher: { '@id': `${SITE}/#person` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/works/?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'WebPage',
      '@id': '__CANONICAL__#webpage',
      url: '__CANONICAL__',
      name: fullTitle,
      description,
      isPartOf: { '@id': `${SITE}/#website` },
      inLanguage: LANG,
      dateModified: UPDATED,
    },
  ];
  if (breadcrumb.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': '__CANONICAL__#breadcrumb',
      itemListElement: breadcrumb.map(([href, label], i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: label,
        ...(href ? { item: `${SITE}${href}` } : {}),
      })),
    });
  }
  if (jsonLd) graph.push(...(Array.isArray(jsonLd) ? jsonLd : [jsonLd]));

  return `<!doctype html>
<html lang="${esc(LANG)}" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<link rel="canonical" href="__CANONICAL__">
${preloadImage ? `<link rel="preload" href="${esc(preloadImage)}" as="image">` : ''}
<link rel="stylesheet" href="/styles.css?v=${assetVersion}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(A.name)}">
<meta property="og:locale" content="${esc(config.locale || 'ru_RU')}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="__CANONICAL__">
${ogImage ? `<meta property="og:image" content="${SITE}${esc(ogImage)}">${ogDims}\n<meta name="twitter:card" content="${twitterCard}">` : '<meta name="twitter:card" content="summary">'}
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(description)}">
${ogImage ? `<meta name="twitter:image" content="${SITE}${esc(ogImage)}">` : ''}
<meta name="theme-color" content="#141311">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>
<script src="/theme.js?v=${assetVersion}"></script>
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">К содержанию</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/"><span class="brand-mark">${esc(A.lastName)}</span><span class="brand-years">${esc(A.years)}</span></a>
    <nav class="main-nav" aria-label="Основная навигация">${navHtml}</nav>
    <div class="header-tools">
      <button class="icon-btn" data-search-open aria-label="Поиск по сайту" title="Поиск (Ctrl+K)" aria-haspopup="dialog" aria-controls="site-search">⌕</button>
      <button class="icon-btn" data-theme-toggle aria-label="Включить светлую тему" title="Включить светлую тему">☀</button>
      <button class="icon-btn nav-toggle" data-nav-toggle aria-label="Меню" aria-expanded="false">☰</button>
    </div>
  </div>
</header>
<main id="main">
${content}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <h4>О проекте</h4>
        <p style="max-width:40ch;color:var(--muted);font-size:14px">${esc(A.footerAbout)}</p>
        <p style="font-size:12px;color:var(--muted)">${esc(A.footerNote)}</p>
      </div>
      <div>
        <h4>Разделы</h4>
        <ul>
          <li><a href="/biography/">Биография</a></li>
          <li><a href="/people/">Люди</a></li>
          <li><a href="/works/">Библиотека</a></li>
          <li><a href="/places/">Есенинские места</a></li>
          <li><a href="/legacy/">Наследие</a></li>
          <li><a href="/books/">Книги</a></li>
        </ul>
      </div>
      <div>
        <h4>Читателю</h4>
        <ul>
          <li><a href="/topics/">Стихи по темам</a></li>
          <li><a href="/works/az.html">Алфавитный указатель</a></li>
          <li><a href="/glossary.html">Словарь к стихам</a></li>
          <li><a href="/faq.html">Частые вопросы</a></li>
          <li><a href="/research/">Научные работы</a></li>
          <li><a href="/legacy/memory.html">Музеи и памятники</a></li>
        </ul>
      </div>
      <div>
        <h4>Служебное</h4>
        <ul>
          <li><a href="/sources.html">Источники</a></li>
          <li><a href="/versions.html">Версии</a></li>
          <li><a href="/about.html">О проекте и правах</a></li>
          <li><a href="/privacy.html">Политика конфиденциальности</a></li>
          <li><a href="/sitemap.xml">Карта сайта</a></li>
          <li><a href="/search.json">Индекс поиска</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-note">
      <span>${esc(A.copyright)}</span>
      <span>Обновлено ${esc(UPDATED_LABEL)}</span>
    </div>
  </div>
</footer>
<div class="search-dialog" id="site-search" data-search-dialog data-search-src="/search.json" role="dialog" aria-modal="true" aria-label="Поиск">
  <div class="search-box">
    <header><span aria-hidden="true">⌕</span><input type="search" placeholder="Найти произведение, человека, книгу…" aria-label="Поисковый запрос"><button class="icon-btn" data-search-close aria-label="Закрыть">✕</button></header>
    <div class="search-results"></div>
  </div>
</div>
${analyticsHtml()}
<script src="/app.js?v=${assetVersion}" defer></script>
</body>
</html>`;
}

// ---------- helpers ----------

function workUrl(w) { return `/works/${w.slug}.html`; }

function firstLine(text) {
  return (text || '').split('\n').find((l) => l.trim()) || '';
}

function workCard(w) {
  return `<a class="work-card" href="${workUrl(w)}">
    <span class="genre">${esc(w.genre)}</span>
    <span class="title">${esc(w.title)}</span>
    <span class="year">${w.year ? esc(w.year) : 'дата не установлена'}</span>
    <span class="preview">${esc(firstLine(w.text))}</span>
  </a>`;
}

function personCard(p) {
  return `<a class="person-card" href="/people/${p.id}.html">
    <span class="role">${esc(p.role)}</span>
    <span class="name">${esc(p.name)}</span>
    <span class="years">${esc(p.years)}</span>
    <span class="sum">${esc(p.summary)}</span>
  </a>`;
}

function crumbs(items) {
  return `<nav class="crumbs wrap" aria-label="Хлебные крошки">${items.map(([href, label], i) =>
    `${i ? '<span>→</span>' : ''}${href ? `<a href="${href}">${esc(label)}</a>` : esc(label)}`).join('')}</nav>`;
}

function affiliateUrl(url, store) {
  try {
    if (!store?.tagParam || !store?.tag) return url;
    const u = new URL(url);
    u.searchParams.set(store.tagParam, store.tag);
    return u.toString();
  } catch { return url; }
}

const stores = config.affiliate?.stores || {};

// Цену на страницах показываем только если это явно разрешено в конфиге:
// сбор данных (sync:prices) работает всегда, публикация — по флагу affiliate.showPrice.
const showPrice = config.affiliate?.showPrice === true;

// Маркировка интернет-рекламы: форма записи задана рекламодателем и должна выводиться
// мелким шрифтом рядом с рекламной ссылкой (ст. 18.1 ФЗ «О рекламе»).
const advertiser = config.affiliate?.advertiser || {};
const adSentence = advertiser.name
  ? `Реклама. Рекламодатель ${advertiser.name}${advertiser.ogrn ? `, ОГРН ${advertiser.ogrn}` : ''}.`
  : 'Реклама.';

function bookStoreLinks(b) {
  const links = [];
  // Если у книги задан список stores — показываем только эти магазины.
  const allow = Array.isArray(b.stores) && b.stores.length ? new Set(b.stores) : null;
  for (const l of b.links || []) {
    const store = stores[l.store];
    if (!store || !l.url) continue;
    if (allow && !allow.has(l.store)) continue;
    links.push({ key: l.store, label: store.label || l.store, url: affiliateUrl(l.url, store) });
  }
  for (const [key, store] of Object.entries(stores)) {
    if (!store.search) continue;
    if (allow && !allow.has(key)) continue;
    if ((b.links || []).some((l) => l.store === key)) continue;
    const q = b.searchQuery || `${A.lastName} ${b.title}`;
    links.push({ key, label: store.label || key, url: affiliateUrl(store.search.replace('{q}', encodeURIComponent(q)), store) });
  }
  return links;
}

function bookCard(b, index) {
  const tone = index % 5;
  const isAudio = /аудио/i.test(b.format || '');
  const isPaper = /бумаж/i.test(b.format || '');
  const meta = [b.year, b.pages ? `${b.pages} с.` : '', b.publisher, b.isbn ? `ISBN ${b.isbn}` : '', b.performer ? `Читает ${b.performer}` : '']
    .filter(Boolean).map(esc).join(' · ');
  // erid — идентификатор маркировки интернет-рекламы (ст. 18.1 ФЗ «О рекламе»):
  // его нужно показывать рядом с рекламной ссылкой, поэтому вытаскиваем его из URL.
  const eridOf = (url) => {
    const m = String(url || '').match(/[?&]erid=([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : '';
  };
  const links = bookStoreLinks(b).map((l, i) => {
    const erid = eridOf(l.url);
    const label = `Купить в ${esc(l.label)} (открывается в новой вкладке${erid ? ', реклама' : ''})`;
    return `<span class="book-buy">
      <a class="book-link${i === 0 ? ' is-primary' : ''}" href="${esc(l.url)}" target="_blank" rel="sponsored nofollow noopener" aria-label="${label}">${esc(l.label)} <span class="arr" aria-hidden="true">↗</span></a>
      ${erid ? `<span class="book-ad">${esc(adSentence)}</span><span class="book-erid">erid: ${esc(erid)}</span>` : ''}
    </span>`;
  }).join('');
  const tags = (b.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  // Обложка: если задана картинка, показываем её вместо типографской заглушки.
  const cover = b.cover
    ? `<div class="book-cover has-image" data-tone="${tone}">
        <picture>
          ${b.coverWebp ? `<source type="image/webp" srcset="${esc(b.coverWebp)}">` : ''}
          <img src="${esc(b.cover)}" alt="${esc(b.coverAlt || `${b.title} — обложка`)}"${b.coverWidth ? ` width="${Number(b.coverWidth)}"` : ''}${b.coverHeight ? ` height="${Number(b.coverHeight)}"` : ''} loading="lazy" decoding="async">
        </picture>
        ${b.coverCredit ? `<span class="book-credit">${esc(b.coverCredit)}</span>` : ''}
      </div>`
    : `<div class="book-cover" data-tone="${tone}" aria-hidden="true">
      <span class="bc-author">${esc(A.lastName)}</span>
      <span class="bc-format">${isAudio ? 'аудио' : isPaper ? 'бумажная' : 'эл. книга'}</span>
      <span class="bc-rule"></span>
      <span class="bc-title">${esc(b.title)}</span>
      ${b.series ? `<span class="bc-series">${esc(b.series)}</span>` : ''}
    </div>`;

  return `<article class="book-card" data-title="${esc(b.title)}" data-cat="${esc(b.category || '')}" data-pub="${esc(b.publisher || '')}" data-pages="${Number(b.pages) || 0}">
    ${cover}
    <div class="book-body">
      <h3>${esc(b.title)}</h3>
      ${b.subtitle ? `<div class="book-sub">${esc(b.subtitle)}</div>` : ''}
      <div class="book-meta"><span class="book-format">${esc(b.format)}</span>${meta ? ' · ' + meta : ''}</div>
      <p class="book-annotation">${esc(b.annotation)}</p>
      ${showPrice && b.price ? `<div class="book-price">
        <span class="bp-value">${esc(priceFmt(b.price, b.priceCurrency))}</span>
        <span class="bp-note">${b.availability === 'InStock' ? 'в наличии · ' : ''}цена на ${esc(ruDate(b.priceCheckedAt))}, в магазине может отличаться</span>
      </div>` : ''}
      <div class="book-tags">
        ${b.highlight ? '<span class="tag is-pick">выбор редакции</span>' : ''}
        ${tags}
      </div>
      <div class="book-actions">${links}</div>
    </div>
  </article>`;
}

const stats = {
  works: works.length,
  poems: works.filter((w) => w.genre === 'Стихотворение').length,
  people: people.length,
  research: research.length,
  books: books.length,
  years: A.years,
};

const worksWord = (n) => plural(n, ['произведение', 'произведения', 'произведений']);
const initials = `${String(A.firstName || '').trim()[0] || ''}${String(A.lastName || '').trim()[0] || ''}`;

// ---------- home ----------

// Карта «произведение → темы» заполняется при сборке дополнительных разделов.
let workTopics = new Map();

const featuredTitles = config.home?.featuredWorks || [];
const featured = (featuredTitles.length ? featuredTitles.map((t) => works.find((w) => norm(w.title).startsWith(norm(t)))) : works.slice(0, 6))
  .filter(Boolean).slice(0, 6);

const keyEventDates = config.home?.keyEvents || [];
const keyEvents = (keyEventDates.length ? timeline.filter((e) => keyEventDates.includes(e.date)) : timeline).slice(0, 8);

const homePeopleIds = config.home?.featuredPeople || [];
const homePeople = (homePeopleIds.length ? homePeopleIds.map((id) => people.find((p) => p.id === id)) : people.slice(0, 8))
  .filter(Boolean).slice(0, 8);

const homeBooks = (books.some((b) => b.highlight) ? books.filter((b) => b.highlight) : books).slice(0, 2);

const tiles = [
  ['/biography/', '01', 'Биография', 'Обзор и статьи по периодам'],
  ['/people/', '02', 'Люди', `Семья, друзья, коллеги — ${stats.people}`],
  ['/life/', '03', 'Жизнь', 'Учёба, увлечения, хронология'],
  ['/works/', '04', 'Библиотека', `${stats.works} ${worksWord(stats.works)} с каталогом`],
  ['/places/', '05', 'Места', `${places.length} ${plural(places.length, ['место', 'места', 'мест'])}: от Константинова до Нью-Йорка`],
  ['/legacy/', '06', 'Наследие', 'Гибель, музеи, музыка, кино, переводы'],
  ['/topics/', '07', 'Темы', `${topics.length} ${plural(topics.length, ['подборка', 'подборки', 'подборок'])} стихов`],
  ['/books/', '08', 'Книги', books.length ? `${stats.books} ${plural(stats.books, ['издание', 'издания', 'изданий'])} · партнёрские ссылки` : 'Издания автора'],
  ['/research/', '09', 'Наука', `${stats.research} ${plural(stats.research, ['работа', 'работы', 'работ'])} о ${A.prepositional}`],
  ['/glossary.html', '10', 'Словарь', 'Диалекты и архаизмы в стихах'],
  ['/faq.html', '11', 'Вопросы', 'Короткие ответы на частые вопросы'],
  ['/about.html', '12', 'О проекте', 'Принципы, права, обновления'],
];

const home = `
<section class="hero">
  <div class="wrap hero-grid${A.portrait ? '' : ' no-portrait'}">
    <div>
      <div class="eyebrow">${esc(A.role)} · ${esc(A.years)}</div>
      <h1><span class="first">${esc(A.firstName)}</span>${esc(A.lastName)}</h1>
      <p class="hero-lead">${esc(A.lead)}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/biography/">Читать биографию</a>
        <a class="btn btn-ghost" href="/works/">Открыть библиотеку</a>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><b>${stats.works}</b><span>${worksWord(stats.works)}</span></div>
        <div class="hero-stat"><b>${stats.people}</b><span>${plural(stats.people, ['персона', 'персоны', 'персон'])}</span></div>
        <div class="hero-stat"><b>${stats.books}</b><span>${plural(stats.books, ['издание', 'издания', 'изданий'])}</span></div>
        <div class="hero-stat"><b>${stats.research}</b><span>${plural(stats.research, ['работа', 'работы', 'работ'])}</span></div>
      </div>
    </div>
    ${A.portrait ? `<div class="portrait-wrap portrait-frame" data-years="${esc(A.years)}">
      <img class="portrait" src="${esc(A.portrait)}" alt="${esc(A.portraitAlt)}" width="360" height="480" fetchpriority="high" decoding="async">
      <div class="portrait-caption">${A.portraitCaption}</div>
    </div>` : `<div class="hero-emblem" aria-hidden="true">
      <span class="emblem-initials">${esc(initials)}</span>
      <span class="emblem-rule"></span>
      <span class="emblem-years">${esc(A.years)}</span>
      <span class="emblem-name">${esc(A.fullName)}</span>
    </div>`}
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>Разделы проекта</h2><p>Всё содержание собрано в связанные разделы — от биографии и людей до библиотеки и книжных изданий.</p></div>
    </div>
    <div class="tiles">
      ${tiles.map(([href, kicker, title, count]) => `<a class="tile" href="${href}"><span class="tile-kicker">${kicker}</span><span class="tile-title">${esc(title)}</span><span class="tile-count">${esc(count)}</span></a>`).join('')}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="panels">
      <div class="panel">
        <h3>Ключевые даты</h3>
        <ul class="timeline-mini">
          ${keyEvents.map((e) => `<li><span class="year">${esc(String(e.display || '').split(' ').slice(-1)[0])}</span><span class="what">${esc(e.title)}<small>${esc(e.display)}</small></span></li>`).join('')}
        </ul>
        <p style="margin-top:14px"><a class="section-link" href="/life/timeline.html">Полная хронология →</a></p>
      </div>
      <div class="panel">
        <h3>Ключевые персоны</h3>
        <div class="people-chips">
          ${homePeople.map((p) => `<a class="chip" href="/people/${p.id}.html">${esc(p.name)}</a>`).join('')}
        </div>
        <p style="margin-top:18px;font-size:13px;color:var(--muted)">В разделе «Люди» — карточки членов семьи, друзей и современников, с которыми связана биография.</p>
        <p><a class="section-link" href="/people/">Все персоны →</a></p>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>Есенинские места</h2><p>Восемь точек на карте: родина, две столицы, Кавказ и заграничные поездки.</p></div>
      <a class="section-link" href="/places/">Все места →</a>
    </div>
    <div class="works-grid">
      ${['konstantinovo', 'moskva', 'peterburg'].map((id) => places.find((p) => p.id === id)).filter(Boolean).map((p) => `<a class="work-card" href="/places/${p.id}.html">
        <span class="genre">${esc(p.kicker)}</span><span class="title">${esc(p.title)}</span>
        <span class="year">${esc(p.years || '')}</span><span class="preview">${esc(p.subtitle)}</span>
      </a>`).join('')}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>Наследие</h2><p>Гибель поэта, музеи и памятники, музыка, кино и переводы — пять разрезов одной темы.</p></div>
      <a class="section-link" href="/legacy/">Весь раздел →</a>
    </div>
    <div class="tiles">
      <a class="tile" href="/legacy/gibel.html"><span class="tile-kicker">01</span><span class="tile-title">Гибель поэта</span><span class="tile-count">Документы и версии</span></a>
      <a class="tile" href="/legacy/memory.html"><span class="tile-kicker">02</span><span class="tile-title">Музеи и памятники</span><span class="tile-count">${museums.length + monuments.length} адресов</span></a>
      <a class="tile" href="/legacy/music.html"><span class="tile-kicker">03</span><span class="tile-title">Есенин в музыке</span><span class="tile-count">Песни и романсы</span></a>
      <a class="tile" href="/legacy/cinema.html"><span class="tile-kicker">04</span><span class="tile-title">Есенин на экране</span><span class="tile-count">Фильмы и сериалы</span></a>
      <a class="tile" href="/legacy/translations.html"><span class="tile-kicker">05</span><span class="tile-title">Переводы</span><span class="tile-count">${(languages.languages || []).length} языков</span></a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>Стихи по темам</h2><p>${topics.length} подборок: природа, Родина, деревня, любовь, город, смерть, Кавказ, революция.</p></div>
      <a class="section-link" href="/topics/">Все подборки →</a>
    </div>
    <div class="tag-row" style="gap:8px">
      ${topics.map((t) => `<a class="chip" href="/topics/${t.id}.html">${esc(t.title.replace('Стихи Есенина ', '').replace(/^о /, ''))}</a>`).join('')}
      <a class="chip" href="/works/az.html">Алфавитный указатель</a>
      <a class="chip" href="/glossary.html">Словарь</a>
      <a class="chip" href="/faq.html">Частые вопросы</a>
    </div>
  </div>
</section>

${featured.length ? `<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>Из библиотеки</h2><p>${stats.works} ${worksWord(stats.works)}: полные тексты с указанием источника.</p></div>
      <a class="section-link" href="/works/">Весь каталог →</a>
    </div>
    <div class="works-grid">${featured.map(workCard).join('')}</div>
  </div>
</section>` : ''}

${homeBooks.length ? `<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>Книги</h2><p>Издания, которые можно купить: бумажные и электронные версии, аудиокниги.</p></div>
      <a class="section-link" href="/books/">Все книги →</a>
    </div>
    <div class="books-grid">${homeBooks.map(bookCard).join('')}</div>
    <p style="margin-top:16px;font-size:12px;color:var(--muted)"><b>Реклама.</b> ${esc(config.affiliate?.disclosure || '')}</p>
  </div>
</section>` : ''}

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>Научные работы</h2><p>Биографии, хроники и исследования, на которые опирается проект.</p></div>
      <a class="section-link" href="/research/">Все работы →</a>
    </div>
    <div class="research-list">
      ${research.slice(0, 4).map((r) => `<div class="research-item">
        <div class="research-year">${r.year}</div>
        <div><h3>${esc(r.title)}</h3><div class="authors">${esc((r.authors || []).join(', '))}</div>
        <div class="pub">${esc(r.publisher)}${r.pages ? ', ' + esc(r.pages) : ''}</div>
        <p class="annotation">${esc(r.annotation)}</p></div>
      </div>`).join('')}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="note">
      <b>Как мы работаем с фактами.</b> Каждое утверждение в статьях опирается на источник; спорные вопросы не выдаются за установленные. Фотографии — только из Wikimedia Commons в общественном достоянии или под свободной лицензией. Тексты произведений публикуются с указанием страницы-источника.
      <a href="/about.html">Подробнее о принципах →</a>
    </div>
  </div>
</section>`;

// ---------- biography ----------

const contentDir = join(ROOT, 'content');
let articleFiles = [];
if (existsSync(contentDir)) {
  articleFiles = (await readdir(contentDir)).filter((f) => f.endsWith('.md')).sort();
}
const articles = [];
for (const f of articleFiles) {
  const { meta, body } = await readArticle(f);
  articles.push({ ...meta, body, html: mdToHtml(body), order: Number(meta.order || 999) });
}
articles.sort((a, b) => (a.kind === 'overview' ? -1 : 0) - (b.kind === 'overview' ? -1 : 0) || a.order - b.order);

const biographyIndex = `
${crumbs([['/', 'Главная'], [null, 'Биография']])}
<div class="wrap page-head">
  <h1>Биография</h1>
  <p>Обзорный очерк и статьи о ключевых периодах жизни ${esc(A.genitive)}. Даты и имена сверены с академическими изданиями; спорные сюжеты вынесены в раздел «Версии».</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  ${articles.length ? `<div class="works-grid">
    ${articles.map((a) => `<a class="work-card" href="/biography/${a.slug}.html">
      <span class="genre">${a.kind === 'overview' ? 'Обзор' : 'Период'}</span>
      <span class="title">${esc(a.title)}</span>
      <span class="preview">${esc(a.excerpt)}</span>
    </a>`).join('')}
  </div>` : '<div class="note">Статьи о биографии готовятся. Пока доступны хронология и раздел «Люди».</div>'}
</div>`;

function articlePage(a) {
  return `${crumbs([['/', 'Главная'], ['/biography/', 'Биография'], [null, a.title]])}
  <div class="wrap article-layout">
    <article>
      <h1 style="font-size:clamp(32px,5vw,48px);margin-bottom:14px">${esc(a.title)}</h1>
      <div class="meta-line"><span class="badge">${a.kind === 'overview' ? 'обзор' : 'статья о жизни'}</span><span>Обновлено ${esc(UPDATED_LABEL)}</span></div>
      <div class="prose">${a.html}</div>
      <div class="source-box"><b>Источники и аппарат.</b> Полный перечень — в разделе <a href="/sources.html">«Источники»</a>. Оценки и версии, по которым в литературе нет согласия, разобраны в разделе <a href="/versions.html">«Версии»</a>.</div>
    </article>
    <aside>
      <div class="aside-card">
        <h4>Содержание</h4>
        <ul>
          ${articles.map((x) => `<li><a href="/biography/${x.slug}.html">${esc(x.title)}</a></li>`).join('')}
        </ul>
        <h4 style="margin-top:18px">Связанное</h4>
        <ul>
          <li><a href="/people/">Люди вокруг ${esc(A.genitive)}</a></li>
          <li><a href="/life/timeline.html">Хронология</a></li>
          <li><a href="/works/">Библиотека</a></li>
          <li><a href="/books/">Книги</a></li>
        </ul>
      </div>
    </aside>
  </div>`;
}

// ---------- people ----------

const peopleIndex = `
${crumbs([['/', 'Главная'], [null, 'Люди']])}
<div class="wrap page-head">
  <h1>Люди вокруг ${esc(A.genitive)}</h1>
  <p>Семья, друзья и современники, с которыми связана биография. У каждой карточки указан статус отношений и источник сведений.</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  ${people.length ? Object.entries(categories).map(([key, label]) => {
    const list = people.filter((p) => p.category === key);
    if (!list.length) return '';
    return `<section style="margin-bottom:44px">
      <div class="section-head"><div><h2 style="font-size:28px">${esc(label)}</h2><p>${list.length} ${plural(list.length, ['человек', 'человека', 'человек'])}</p></div><a class="section-link" href="/people/${key}.html">Отдельная страница →</a></div>
      <div class="people-grid">${list.map(personCard).join('')}</div>
    </section>`;
  }).join('') : '<div class="note">Раздел готовится.</div>'}
</div>`;

function categoryPage(key) {
  const list = people.filter((p) => p.category === key);
  return `${crumbs([['/', 'Главная'], ['/people/', 'Люди'], [null, categories[key]]])}
  <div class="wrap page-head"><h1>${esc(categories[key])}</h1><p>${list.length} ${plural(list.length, ['карточка', 'карточки', 'карточек'])}. Все сведения сопровождаются указанием источника.</p></div>
  <div class="wrap" style="padding-bottom:50px"><div class="people-grid">${list.map(personCard).join('')}</div></div>`;
}

function personPage(p) {
  const related = works.filter((w) => norm(w.text).includes(norm(String(p.name || '').split(' ')[0]))).slice(0, 6);
  const rel = people.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 6);
  return `${crumbs([['/', 'Главная'], ['/people/', 'Люди'], [`/people/${p.category}.html`, categories[p.category] || 'Люди'], [null, p.name]])}
  <div class="wrap">
    <div class="person-hero">
      <div class="person-mono" aria-hidden="true">${esc(String(p.name || '?')[0])}</div>
      <div>
        <div class="meta-line"><span class="badge">${esc(p.role)}</span><span>${esc(p.years)}</span></div>
        <h1 style="font-size:clamp(30px,4.5vw,44px)">${esc(p.name)}</h1>
        <p style="font-family:var(--serif);font-size:19px;color:var(--ink-soft);max-width:62ch">${esc(p.summary)}</p>
      </div>
    </div>
    <div class="grid-2" style="padding-bottom:40px">
      <div class="panel">
        <h3>Связи</h3>
        <div class="people-chips">${rel.map((x) => `<a class="chip" href="/people/${x.id}.html">${esc(x.name)}</a>`).join('')}</div>
        <p style="margin-top:16px;font-size:13px;color:var(--muted)">Полный список — в разделе <a href="/people/">«Люди»</a>.</p>
      </div>
      <div class="panel">
        <h3>В произведениях</h3>
        ${related.length ? `<div class="people-chips">${related.map((w) => `<a class="chip" href="${workUrl(w)}">${esc(w.title)}</a>`).join('')}</div>` : '<p style="color:var(--muted);font-size:14px">Прямых упоминаний в текстах библиотеки не найдено.</p>'}
      </div>
    </div>
    <div class="source-box" style="margin-bottom:60px"><b>Источник.</b> Биографические сведения сверены с энциклопедическими и академическими изданиями; см. <a href="/sources.html">реестр источников</a>. Даты жизни уточняются по мере поступления новых данных.</div>
  </div>`;
}

// ---------- life ----------

const lifeIndex = `
${crumbs([['/', 'Главная'], [null, 'Жизнь']])}
<div class="wrap page-head"><h1>Жизнь</h1><p>Учёба, интересы и хронология — три способа увидеть биографию не только как список дат.</p></div>
<div class="wrap" style="padding-bottom:50px">
  <div class="tiles">
    <a class="tile" href="/life/studies.html"><span class="tile-kicker">01</span><span class="tile-title">Учёба</span><span class="tile-count">${studies.length ? 'Школа, училище, университет' : 'Раздел готовится'}</span></a>
    <a class="tile" href="/life/passions.html"><span class="tile-kicker">02</span><span class="tile-title">Увлечения</span><span class="tile-count">${passions.length ? 'Темы, круги, путешествия' : 'Раздел готовится'}</span></a>
    <a class="tile" href="/life/timeline.html"><span class="tile-kicker">03</span><span class="tile-title">Хронология</span><span class="tile-count">${timeline.length} ${plural(timeline.length, ['событие', 'события', 'событий'])}</span></a>
    <a class="tile" href="/biography/"><span class="tile-kicker">04</span><span class="tile-title">Биография</span><span class="tile-count">Обзор и статьи</span></a>
  </div>
</div>`;

const studiesPage = `
${crumbs([['/', 'Главная'], ['/life/', 'Жизнь'], [null, 'Учёба']])}
<div class="wrap page-head"><h1>Учёба</h1><p>Образование: от школы до университета.</p></div>
<div class="wrap" style="padding-bottom:50px">
  ${studies.length ? studies.map((s) => `<div class="panel" style="margin-bottom:14px">
    <div class="meta-line"><span class="badge">${esc(s.type)}</span><span>${esc(s.years)}</span></div>
    <h3 style="font-size:22px">${esc(s.title)}</h3>
    <p style="color:var(--ink-soft);max-width:70ch">${esc(s.text)}</p>
  </div>`).join('') : '<div class="note">Раздел готовится.</div>'}
  <div class="source-box"><b>Источник.</b> Сведения приведены по биографическим статьям и академическим изданиям; см. <a href="/sources.html">«Источники»</a>.</div>
</div>`;

const passionsPage = `
${crumbs([['/', 'Главная'], ['/life/', 'Жизнь'], [null, 'Увлечения']])}
<div class="wrap page-head"><h1>Увлечения и темы</h1><p>Не список хобби, а круг интересов, из которого выросло творчество.</p></div>
<div class="wrap" style="padding-bottom:50px">
  ${passions.length ? passions.map((p) => `<div class="panel" style="margin-bottom:14px">
    <h3 style="font-size:22px">${esc(p.title)}</h3>
    <p style="color:var(--ink-soft);max-width:70ch">${esc(p.text)}</p>
    <div class="tag-row">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  </div>`).join('') : '<div class="note">Раздел готовится.</div>'}
</div>`;

const timelinePage = `
${crumbs([['/', 'Главная'], ['/life/', 'Жизнь'], [null, 'Хронология']])}
<div class="wrap page-head"><h1>Хронология</h1><p>${timeline.length} ${plural(timeline.length, ['событие', 'события', 'событий'])} — от рождения до последних лет.</p></div>
<div class="wrap" style="padding-bottom:60px">
  <ul class="timeline-mini" style="background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 24px">
    ${timeline.map((e) => `<li><span class="year">${esc(e.display)}</span><span class="what"><b>${esc(e.title)}</b><small>${esc(e.text)}</small></span></li>`).join('')}
  </ul>
</div>`;

// ---------- works ----------

const genres = [...new Set(works.map((w) => w.genre))];
const decades = [...new Set(works.filter((w) => w.year).map((w) => Math.floor(w.year / 10) * 10))].sort();

const genreSummary = genres.map((g) => `${esc(String(g).toLowerCase())} — ${works.filter((w) => w.genre === g).length}`).join(', ');

const worksIndex = `
${crumbs([['/', 'Главная'], [null, 'Библиотека']])}
<div class="wrap page-head">
  <h1>Библиотека</h1>
  <p>${stats.works} ${worksWord(stats.works)}${genreSummary ? `: ${genreSummary}` : ''}. Поиск — по названию и первой строке.</p>
  <div class="tag-row" style="margin-top:14px">
    <a class="chip" href="/topics/">Стихи по темам</a>
    <a class="chip" href="/works/az.html">Алфавитный указатель</a>
    <a class="chip" href="/glossary.html">Словарь к стихам</a>
    <a class="chip" href="/legacy/music.html">Песни и романсы</a>
  </div>
</div>
<div class="catalog-toolbar">
  <div class="wrap">
    <div class="toolbar-row">
      <div class="search-field"><input type="search" placeholder="Название или первая строка…" data-catalog-search aria-label="Поиск по каталогу"></div>
      <select data-filter-decade aria-label="Период">
        <option value="all">Все годы</option>
        ${decades.map((d) => `<option value="${d}">${d}-е</option>`).join('')}
      </select>
      <select data-sort aria-label="Сортировка">
        <option value="year">По году</option>
        <option value="year-desc">Сначала поздние</option>
        <option value="title">По алфавиту</option>
        <option value="length">По объёму</option>
      </select>
    </div>
    <div class="toolbar-row" style="margin-top:10px">
      <div class="filter-chips">
        <button class="filter-chip" data-filter-genre="all" aria-pressed="true">Все жанры</button>
        ${genres.map((g) => `<button class="filter-chip" data-filter-genre="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join('')}
      </div>
    </div>
  </div>
</div>
<div class="wrap">
  <div class="results-line"><span>Найдено: <b data-result-count>${works.length}</b></span><span>${TEXTS_PD ? 'Полные тексты с указанием источника' : 'Метаданные и ссылки на издания'}</span></div>
  <div class="catalog-grid" data-catalog>
    ${works.map((w) => `<a class="catalog-card" href="${workUrl(w)}" data-title="${esc(w.title)}" data-genre="${esc(w.genre)}" data-decade="${w.year ? Math.floor(w.year / 10) * 10 : ''}" data-year="${w.year || ''}" data-chars="${w.chars || 0}" data-first="${esc(firstLine(w.text))}">
      <span class="t">${esc(w.title)}</span>
      <span class="f">${esc(firstLine(w.text))}</span>
      <span class="m">${w.year ? w.year : '—'} · ${esc(w.genre)}</span>
    </a>`).join('')}
  </div>
  <button class="load-more" data-load-more hidden>Показать ещё</button>
</div>`;

function workPage(w, index) {
  const cleanSource = (s) => {
    if (!s) return '';
    if (/Полное собрание сочинений/i.test(s)) return 'Полное собрание сочинений: в 7 т. — М.: Наука; Голос, 1995–2002.';
    if (/ФЭБ|feb-web/i.test(s)) return 'ФЭБ «Русская литература и фольклор».';
    let t = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '');
    let prev;
    do { prev = t; t = t.replace(/\{\{[^{}]*\}\}/g, ''); } while (t !== prev);
    t = t.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1').replace(/\[[^\]]*\]/g, '');
    t = t.replace(/\s+/g, ' ').replace(/[(:;,\s]+$/, '').trim();
    return t.length > 140 ? t.slice(0, 137) + '…' : t;
  };
  const related = works.filter((x) => x.genre === w.genre && x.slug !== w.slug)
    .sort((a, b) => Math.abs((a.year || 0) - (w.year || 0)) - Math.abs((b.year || 0) - (w.year || 0)))
    .slice(0, 4);
  const prev = works[index - 1];
  const next = works[index + 1];

  return `${crumbs([['/', 'Главная'], ['/works/', 'Библиотека'], [null, w.title]])}
  <article class="wrap poem-page">
    <div class="meta-line"><span class="badge">${esc(w.genre)}</span>${w.year ? `<span>${w.year}</span>` : ''}<span>Источник: ${esc(w.sourceLabel || 'Викитека')}</span></div>
    <h1 class="poem-title">${esc(w.title)}</h1>
    <div class="poem-tools">
      <span class="label">Текст:</span>
      <button data-poem-action="smaller" aria-label="Уменьшить шрифт">A−</button>
      <button data-poem-action="bigger" aria-label="Увеличить шрифт">A+</button>
      <button data-poem-action="reading">Режим чтения</button>
      <button data-poem-action="plain">Без оформления</button>
      <button data-poem-action="print">Печать</button>
      <button data-poem-action="copy">Копировать</button>
    </div>
    <div class="poem">${esc(w.text)}</div>
    <div class="source-box">
      <b>Источник текста.</b> <a href="${esc(w.sourceUrl)}" rel="noopener">${esc(w.title)}</a> в Викитеке.
      ${w.source ? `<br><b>Редакция/издание:</b> ${esc(cleanSource(w.source))}` : ''}
      <br>${TEXTS_PD ? 'Текст находится в общественном достоянии. При цитировании указывайте источник.' : 'Полный текст не размещён: произведение охраняется авторским правом. Ссылка ведёт на страницу-источник.'}
    </div>
    <div class="tag-row" style="margin-top:18px">
      ${(workTopics.get(w.slug) || []).length ? `<span style="font-size:13px;color:var(--muted);align-self:center">Темы:</span>
      ${(workTopics.get(w.slug) || []).map((t) => `<a class="chip" href="/topics/${t.id}.html">${esc(t.kicker || t.title)}</a>`).join('')}` : ''}
      <a class="chip" href="/works/az.html">Алфавитный указатель</a>
      <a class="chip" href="/glossary.html">Словарь к стихам</a>
      <a class="chip" href="/topics/">Все подборки</a>
    </div>
    <nav style="display:flex;justify-content:space-between;gap:16px;margin-top:30px" aria-label="Навигация по произведениям">
      <span>${prev ? `<a href="${workUrl(prev)}">← ${esc(prev.title)}</a>` : ''}</span>
      <span>${next ? `<a href="${workUrl(next)}">${esc(next.title)} →</a>` : ''}</span>
    </nav>
  </article>
  <section class="section">
    <div class="wrap">
      <div class="section-head"><div><h2 style="font-size:26px">Похожие произведения</h2></div><a class="section-link" href="/works/">В каталог →</a></div>
      <div class="works-grid">${related.map(workCard).join('')}</div>
    </div>
  </section>`;
}

// ---------- books ----------

const booksCats = [...new Set(books.map((b) => b.category).filter(Boolean))];
const booksPubs = [...new Set(books.map((b) => b.publisher).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));

const booksPage = `
${crumbs([['/', 'Главная'], [null, 'Книги']])}
<div class="wrap page-head">
  <h1>Книги ${esc(A.genitive)}</h1>
  <p>${books.length ? `${books.length} ${plural(books.length, ['издание', 'издания', 'изданий'])} в продаже — от школьных сборников до многотомных собраний сочинений.` : ''} Полные тексты произведений при этом остаются бесплатными в <a href="/works/">библиотеке</a>.</p>
</div>
${books.length ? `<div class="catalog-toolbar">
  <div class="wrap">
    <div class="tag-row" role="group" aria-label="Тип издания">
      <button class="filter-chip" data-books-cat="all" aria-pressed="true">Все книги (${books.length})</button>
      ${booksCats.map((c) => `<button class="filter-chip" data-books-cat="${esc(c)}" aria-pressed="false">${esc(c)} (${books.filter((b) => b.category === c).length})</button>`).join('')}
    </div>
    <div class="catalog-controls">
      <label class="visually-hidden" for="books-pub">Издательство</label>
      <select id="books-pub" data-books-pub>
        <option value="all">Все издательства</option>
        ${booksPubs.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
      </select>
      <label class="visually-hidden" for="books-sort">Сортировка</label>
      <select id="books-sort" data-books-sort>
        <option value="title">По названию</option>
        <option value="pub">По издательству</option>
        <option value="pages">По числу страниц</option>
      </select>
      <span class="results-line">Показано: <b data-books-count>${books.length}</b></span>
    </div>
  </div>
</div>` : ''}
<div class="wrap" style="padding-bottom:40px">
  ${books.length ? `
  <div class="disclosure"><span class="ad-mark">реклама</span><span class="ad-legal">${esc(adSentence)}</span> <span class="ad-note">${esc(config.affiliate?.disclosure || '')}</span></div>
  <div class="books-grid" data-books-grid>${books.map(bookCard).join('')}</div>
  <button class="load-more" data-books-more hidden>Показать ещё</button>
  <div class="books-foot">
    <div class="note">Цены, наличие и формат указаны на стороне магазина и могут меняться. Проект не хранит данные о покупках. Ссылка ведёт в «Читай-город».</div>
    <a class="btn btn-ghost" href="/works/">Читать бесплатно в библиотеке</a>
  </div>` : `<div class="note">Раздел готовится: здесь появятся издания ${esc(A.genitive)} с партнёрскими ссылками. Пока полные тексты доступны в <a href="/works/">библиотеке</a>.</div>`}
</div>`;

// ---------- research ----------

const researchPage = `
${crumbs([['/', 'Главная'], [null, 'Научные работы']])}
<div class="wrap page-head">
  <h1>Научные работы о ${esc(A.prepositional)}</h1>
  <p>${research.length} ${plural(research.length, ['библиографическая запись', 'библиографические записи', 'библиографических записей'])}: биографии, хроники, монографии и энциклопедические статьи. Полные тексты не размещаются — только метаданные и аннотации.</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  <div class="note">Раздел задуман как отправная точка для исследования. Аннотации кратко описывают тему работы и не заменяют чтение источника.</div>
  <div class="research-list">
    ${research.slice().sort((a, b) => b.year - a.year).map((r) => `<article class="research-item">
      <div class="research-year">${r.year}</div>
      <div>
        <h3>${esc(r.title)}</h3>
        <div class="authors">${esc((r.authors || []).join(', '))}</div>
        <div class="pub">${esc(r.place)}: ${esc(r.publisher)}${r.pages ? ', ' + esc(r.pages) : ''}${r.isbn ? ' · ISBN ' + esc(r.isbn) : ''}</div>
        <p class="annotation">${esc(r.annotation)}</p>
        <div class="tag-row"><span class="tag">${esc(r.type)}</span>${(r.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>
    </article>`).join('')}
  </div>
</div>`;

// ---------- sources / versions / about ----------

const sourcesPage = `
${crumbs([['/', 'Главная'], [null, 'Источники']])}
<div class="wrap page-head">
  <h1>Источники</h1>
  <p>Реестр источников проекта. Уровень A — академические издания, B — энциклопедии, C — мемуары и тематические порталы, D — справочные интернет-ресурсы.</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  ${sources.map((s) => `<div class="source-row">
    <div><span class="tier" data-t="${esc(s.tier)}">${esc(s.tier)}</span></div>
    <div>
      <h3 style="font-size:18px;margin-bottom:2px">${esc(s.title)}</h3>
      <div style="font-size:13px;color:var(--muted)">${esc(s.type)} · ${esc(s.publisher)}</div>
      <p style="font-size:14px;color:var(--ink-soft);margin:6px 0">${esc(s.note)}</p>
      ${s.url ? `<a href="${esc(s.url)}" rel="noopener" style="font-size:13px">${esc(s.url)}</a>` : ''}
    </div>
  </div>`).join('')}
  <div class="note">Дата обращения ко всем источникам — ${esc(UPDATED_LABEL)}. Ссылки проверяются ежемесячно; устаревшие адреса фиксируются в журнале обновлений.</div>
</div>`;

const versionsPage = `
${crumbs([['/', 'Главная'], [null, 'Версии']])}
<div class="wrap page-head">
  <h1>Версии и спорные вопросы</h1>
  <p>Здесь собраны сюжеты, по которым в литературе нет единого мнения. Мы не выдаём версии за установленные факты.</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  ${versions.map((v) => `<details class="version-card">
    <summary>${esc(v.question)}<span class="status">${esc(v.status)}</span></summary>
    <div class="version-body">
      <ul>${v.versions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p style="font-size:13px;color:var(--muted)">${esc(v.note)}</p>
    </div>
  </details>`).join('')}
  <div class="note">Если вы заметили неточность — опишите её и укажите источник. Каждая правка проходит проверку и фиксируется в журнале обновлений.</div>
</div>`;

const aboutPage = `
${crumbs([['/', 'Главная'], [null, 'О проекте']])}
<div class="wrap article-layout" style="padding-bottom:60px">
  <article class="prose">
    <h1 style="font-size:clamp(30px,4.5vw,44px)">О проекте</h1>
    <p>Это некоммерческий просветительский проект, посвящённый ${esc(A.fullName)}. Его задача — собрать в одном месте проверенную биографию, людей вокруг ${esc(A.roleGenitive)}, полную библиотеку текстов, книжные издания и научную литературу.</p>
    <h2>Принципы работы с фактами</h2>
    <p>Каждое утверждение опирается на источник. При расхождении источников мы показываем версии, а не выбираем удобную. Спорные сюжеты вынесены в раздел «Версии».</p>
    <h2>Тексты</h2>
    <p>${esc(A.copyright)} ${TEXTS_PD ? 'Произведения находятся в общественном достоянии; у каждого указана страница-источник и, где возможно, редакция академического издания.' : 'Полные тексты произведений не размещаются, пока действует авторское право: доступны метаданные и ссылки на правомерные издания.'}</p>
    <h2>Разделы о местах, музыке, кино и языке</h2>
    <p>Тексты разделов «Есенинские места», «Наследие», «Стихи по темам», «Словарь к стихам» и «Частые вопросы» написаны для этого проекта. Они опираются на общедоступные факты — даты, названия, адреса, библиографические сведения — и не воспроизводят чужие статьи, очерки или музейные описания. Факт как таковой не является объектом авторского права; авторским правом охраняется форма изложения, поэтому все объяснения, связки и оценки в этих разделах — оригинальные.</p>
    <p>Стихотворные строки в словаре и подборках приведены из произведений ${esc(A.genitive)}, находящихся в общественном достоянии. Библиографические описания книг и статей даны в информационных целях.</p>
    <h2>Изображения</h2>
    <p>Используются только файлы из Wikimedia Commons, находящиеся в общественном достоянии или под свободной лицензией. Атрибуция указана рядом с изображением.</p>
    <h2>Книги и партнёрские ссылки</h2>
    <p>В разделе «Книги» собраны издания, которые можно приобрести. Ссылки на магазины — партнёрские: проект может получить вознаграждение, цена для покупателя не меняется. Материал помечен как реклама. Наличие и стоимость уточняются на стороне магазина.</p>
    <h2>Научные работы</h2>
    <p>Размещаются только библиографические описания и краткие аннотации. Полные тексты не публикуются без разрешения правообладателей.</p>
    <h2>Обновления</h2>
    <p>Ссылки проверяются ежемесячно, спорные факты — ежеквартально. Дата последнего обновления указана в подвале сайта.</p>
  </article>
  <aside>
    <div class="aside-card">
      <h4>Технологии</h4>
      <p>Статический сайт, собранный из JSON-данных и Markdown. Поиск работает на клиенте, без серверной базы данных.</p>
      <h4 style="margin-top:16px">Права</h4>
      <p>${esc(A.licenseNote)}</p>
      <h4 style="margin-top:16px">Обратная связь</h4>
      <p>Ошибки и уточнения принимаются с указанием источника; правки фиксируются в журнале обновлений.</p>
    </div>
  </aside>
</div>`;

// ---------- политика конфиденциальности ----------

const privacyPage = `
${crumbs([['/', 'Главная'], [null, 'Политика конфиденциальности']])}
<div class="wrap article-layout" style="padding-bottom:60px">
  <article class="prose">
    <h1 style="font-size:clamp(28px,4.2vw,40px)">Политика конфиденциальности</h1>
    <p>Сайт ${esc(new URL(SITE).host)} — некоммерческий просветительский проект о ${esc(A.prepositional)}. Мы не собираем имена, телефоны, адреса и адреса электронной почты: на сайте нет форм регистрации, подписки и оплаты. Ниже описано, какие технические данные обрабатываются при просмотре страниц.</p>
    <h2>Какие данные обрабатываются</h2>
    <p>Для статистики посещаемости используется «Яндекс.Метрика» (счётчик № ${esc(config.analytics?.yandexMetrika || '')}). Сервис получает: адрес просмотренной страницы, адрес предыдущей страницы, тип устройства и браузера, разрешение экрана, приблизительный регион (по IP), время визита, а также обезличенные данные о кликах и прокрутке (карта кликов, Вебвизор). Эти данные обрабатываются в обезличенном виде и не позволяют идентифицировать конкретного человека без дополнительной информации.</p>
    <h2>Зачем</h2>
    <p>Только чтобы понимать, какие разделы и тексты востребованы, находить технические ошибки и улучшать навигацию. Данные не используются для рекламных рассылок, не продаются и не передаются третьим лицам, кроме обработки в «Яндекс.Метрике» согласно её условиям.</p>
    <h2>Cookie</h2>
    <p>Cookie — небольшие файлы, которые браузер сохраняет на устройстве. Они нужны счётчику, чтобы отличать визиты, и используются для запоминания выбранной темы оформления (светлая или тёмная). Вы можете удалить cookie в настройках браузера или запретить их — сайт продолжит работать, но статистика по вашему визиту не будет учтена.</p>
    <h2>Отказ от учёта</h2>
    <p>Отключить сбор статистики «Яндекс.Метрикой» для своего браузера можно с помощью официального блокировщика: <a href="https://yandex.ru/support/metrica/general/opt-out.html" rel="nofollow noopener" target="_blank">yandex.ru/support/metrica/general/opt-out.html</a>. Достаточно установить его — на работу сайта это не влияет.</p>
    <h2>Внешние ссылки</h2>
    <p>В разделах «Книги» и «Наследие» есть ссылки на сторонние сайты (магазины, музеи, Викитека). После перехода на них действуют политики этих сайтов; мы не отвечаем за их содержание и обработку данных.</p>
    <h2>Изменения</h2>
    <p>Политика может обновляться при изменении состава сервисов. Дата последнего обновления — ${esc(UPDATED_LABEL)}.</p>
  </article>
  <aside>
    <div class="aside-card">
      <h4>Коротко</h4>
      <p>Никаких форм и аккаунтов. Только обезличенная статистика «Яндекс.Метрики» (счётчик № ${esc(config.analytics?.yandexMetrika || '')}) и cookie темы оформления.</p>
      <h4 style="margin-top:16px">Права</h4>
      <p>${esc(A.licenseNote)}</p>
      <h4 style="margin-top:16px">Связанное</h4>
      <ul>
        <li><a href="/about.html">О проекте и правах</a></li>
        <li><a href="/sources.html">Источники</a></li>
      </ul>
    </div>
  </aside>
</div>`;

// ---------- 404 ----------

const deskArt = existsSync(join(ROOT, 'src/art/desk-404.svg'))
  ? await readFile(join(ROOT, 'src/art/desk-404.svg'), 'utf8')
  : '';

const notFound = `
<section class="error-page">
  <div class="wrap error-grid">
    <div class="error-copy">
      <div class="error-code" aria-hidden="true">404</div>
      <h1>Этой страницы нет</h1>
      <p class="error-lead">Похоже, лист остался чистым: такого адреса на сайте нет или страница переехала. Начните с поиска — или вернитесь к началу.</p>
      <form class="error-search" data-search-form role="search">
        <input type="search" name="q" placeholder="Поиск по сайту…" aria-label="Поиск по сайту">
        <button type="submit">Искать</button>
      </form>
      <p class="error-hint">Поиск идёт по названиям, первой строке произведений и описаниям разделов.</p>
      <div class="error-links">
        <a class="chip" href="/">Главная</a>
        <a class="chip" href="/biography/">Биография</a>
        <a class="chip" href="/works/">Библиотека</a>
        <a class="chip" href="/books/">Книги</a>
        <a class="chip" href="/people/">Люди</a>
      </div>
    </div>
    <div class="error-art" aria-hidden="true">${deskArt}</div>
  </div>
</section>`;

// ---------- write ----------

// Дополнительные разделы считаем до записи страниц: они дают карту тем для
// страниц произведений (ссылки «Темы» внизу каждого текста).
const extra = buildSectionPages({
  A, SITE, LANG, UPDATED, UPDATED_LABEL, esc, plural, norm, crumbs, workUrl,
  works, places, museums, monuments, music, films, languages, topics, glossary, faq, death,
});
workTopics = extra.workTopics;

async function emptyDir(dir) {
  await mkdir(dir, { recursive: true });
  let entries = [];
  try { entries = await readdir(dir); } catch { return; }
  for (const entry of entries) {
    const target = join(dir, entry);
    try {
      await rm(target, { recursive: true, force: true, maxRetries: 3 });
    } catch (err) {
      // Windows: файл может быть занят (браузер, редактор, индексатор) и не удаляться.
      // Не роняем сборку: обнуляем содержимое, дальше файл перезапишется как обычно.
      if (['EBUSY', 'EPERM', 'EACCES'].includes(err?.code)) {
        try { await writeFile(target, '', 'utf8'); } catch { /* оставляем как есть */ }
        continue;
      }
      throw err;
    }
  }
}

await emptyDir(DIST);
await mkdir(DIST, { recursive: true });

async function writePage(rel, html) {
  const file = join(DIST, rel);
  await mkdir(dirname(file), { recursive: true });
  const url = rel === 'index.html' ? '/' : '/' + rel.replace(/index\.html$/, '');
  const out = html.replaceAll('__CANONICAL__', encodeURI(SITE + url));
  await writeFile(file, out, 'utf8');
  return out;
}

await writePage('index.html', layout({
  title: `${A.name}: биография, библиотека, книги`,
  description: `${A.shortDescription}: биография, люди, библиотека произведений, книги и научные работы. ${A.years}`,
  content: home, active: '', preloadImage: A.portrait,
}));

await writePage('biography/index.html', layout({
  title: 'Биография', description: `Обзорная биография ${A.genitive} и статьи о периодах жизни.`,
  content: biographyIndex, active: 'biography',
  breadcrumb: [['/', 'Главная'], [null, 'Биография']],
}));

for (const a of articles) {
  await writePage(`biography/${a.slug}.html`, layout({
    title: a.title, description: a.excerpt || '', content: articlePage(a), active: 'biography', ogType: 'article',
    breadcrumb: [['/', 'Главная'], ['/biography/', 'Биография'], [null, a.title]],
  }));
}

await writePage('people/index.html', layout({
  title: `Люди вокруг ${A.genitive}`, description: `Семья, друзья и современники ${A.genitive}: ${people.length} карточек с ролями, годами жизни и источниками сведений.`,
  content: peopleIndex, active: 'people',
  breadcrumb: [['/', 'Главная'], [null, 'Люди']],
}));

for (const key of Object.keys(categories)) {
  const list = people.filter((p) => p.category === key);
  if (!list.length) continue;
  await writePage(`people/${key}.html`, layout({
    title: categories[key], description: `${categories[key]} ${A.genitive}: ${list.length} карточек с ролью, годами жизни и указанием источника.`,
    content: categoryPage(key), active: 'people',
    breadcrumb: [['/', 'Главная'], ['/people/', 'Люди'], [null, categories[key]]],
  }));
}

for (const p of people) {
  await writePage(`people/${p.id}.html`, layout({
    title: p.name,
    description: `${p.name} — ${p.role}${p.years ? ', ' + p.years : ''}. ${String(p.summary || '')}`.slice(0, 200),
    content: personPage(p), active: 'people',
    breadcrumb: [['/', 'Главная'], ['/people/', 'Люди'], [null, p.name]],
  }));
}

await writePage('life/index.html', layout({
  title: 'Жизнь', description: `Учёба, увлечения и хронология жизни ${A.genitive} (${A.years}): три способа увидеть биографию не только как список дат.`,
  content: lifeIndex, active: 'life',
  breadcrumb: [['/', 'Главная'], [null, 'Жизнь']],
}));
await writePage('life/studies.html', layout({
  title: 'Учёба', description: `Образование ${A.genitive}: школы, училища и университеты — по документам и биографическим источникам.`,
  content: studiesPage, active: 'life',
  breadcrumb: [['/', 'Главная'], ['/life/', 'Жизнь'], [null, 'Учёба']],
}));
await writePage('life/passions.html', layout({
  title: 'Увлечения', description: `Темы и интересы ${A.genitive}: круг чтения, литературные объединения, путешествия и то, что стало основой творчества.`,
  content: passionsPage, active: 'life',
  breadcrumb: [['/', 'Главная'], ['/life/', 'Жизнь'], [null, 'Увлечения']],
}));
await writePage('life/timeline.html', layout({
  title: 'Хронология', description: `Основные события жизни ${A.genitive} (${A.years}): ${timeline.length} дат от рождения до последних лет.`,
  content: timelinePage, active: 'life',
  breadcrumb: [['/', 'Главная'], ['/life/', 'Жизнь'], [null, 'Хронология']],
}));

await writePage('works/index.html', layout({
  title: 'Библиотека произведений', description: `Каталог произведений ${A.genitive}: ${stats.works} текстов с поиском и фильтрами.`,
  content: worksIndex, active: 'works',
  breadcrumb: [['/', 'Главная'], [null, 'Библиотека']],
}));

for (let i = 0; i < works.length; i++) {
  const w = works[i];
  const ld = {
    '@type': 'CreativeWork',
    '@id': `${SITE}${workUrl(w)}#work`,
    name: w.title,
    author: { '@id': `${SITE}/#person` },
    genre: w.genre,
    inLanguage: LANG,
    url: `${SITE}${workUrl(w)}`,
    isAccessibleForFree: true,
    ...(w.year ? { datePublished: String(w.year) } : {}),
    ...(w.sourceUrl ? { isBasedOn: w.sourceUrl } : {}),
  };
  await writePage(`works/${w.slug}.html`, layout({
    title: w.title,
    description: `«${w.title}» — ${String(w.genre || '').toLowerCase()} ${A.genitive}${w.year ? ', ' + w.year : ''}. ${firstLine(w.text).slice(0, 120)} Читайте полный текст с указанием источника.`,
    content: workPage(w, i), active: 'works', ogType: 'article', jsonLd: ld,
    breadcrumb: [['/', 'Главная'], ['/works/', 'Библиотека'], [null, w.title]],
  }));
}

await writePage('books/index.html', layout({
  title: `Книги ${A.genitive}`, description: `Издания ${A.genitive}: электронные книги, бумажные версии и аудиокниги. Партнёрские ссылки.`,
  content: booksPage, active: 'books',
  breadcrumb: [['/', 'Главная'], [null, 'Книги']],
  jsonLd: books.length ? {
    '@type': 'ItemList',
    name: `Книги ${A.genitive}`,
    numberOfItems: books.length,
    itemListElement: books.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Book',
        name: b.title,
        author: { '@id': `${SITE}/#person` },
        inLanguage: LANG,
        ...(b.isbn ? { isbn: b.isbn } : {}),
        ...(b.year ? { datePublished: String(b.year) } : {}),
        ...(b.pages ? { numberOfPages: b.pages } : {}),
        bookFormat: /аудио/i.test(b.format || '') ? 'https://schema.org/AudiobookFormat' : /бумаж/i.test(b.format || '') ? 'https://schema.org/Hardcover' : 'https://schema.org/EBook',
        ...(showPrice && b.price ? {
          offers: {
            '@type': 'Offer',
            price: String(b.price),
            priceCurrency: b.priceCurrency || 'RUB',
            availability: b.availability === 'InStock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url: (b.links || [])[0]?.url || b.productUrl,
            seller: { '@type': 'Organization', name: stores[(b.links || [])[0]?.store]?.label || (b.links || [])[0]?.store || '' },
          },
        } : {}),
      },
    })),
  } : null,
}));

await writePage('research/index.html', layout({
  title: 'Научные работы', description: `Библиографии и исследования о ${A.prepositional}: ${research.length} записей с аннотациями и выходными данными.`,
  content: researchPage, active: 'research',
  breadcrumb: [['/', 'Главная'], [null, 'Наука']],
  jsonLd: research.length ? {
    '@type': 'ItemList',
    name: `Научные работы о ${A.prepositional}`,
    numberOfItems: research.length,
    itemListElement: research.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'CreativeWork',
        name: r.title,
        author: (r.authors || []).map((n) => ({ '@type': 'Person', name: n })),
        datePublished: String(r.year),
        inLanguage: LANG,
      },
    })),
  } : null,
}));

await writePage('sources.html', layout({
  title: 'Источники', description: `Реестр источников проекта о ${A.prepositional}: академические издания, энциклопедии, мемуары и справочные ресурсы с уровнями A–D.`,
  content: sourcesPage, active: 'sources',
  breadcrumb: [['/', 'Главная'], [null, 'Источники']],
}));
await writePage('versions.html', layout({
  title: 'Версии и спорные вопросы', description: `Спорные вопросы биографии ${A.genitive}: что установлено, какие есть версии и почему мы не выдаём их за факты.`,
  content: versionsPage, active: 'versions',
  breadcrumb: [['/', 'Главная'], [null, 'Версии']],
}));
await writePage('about.html', layout({
  title: 'О проекте', description: 'Принципы работы проекта: проверка фактов, права на тексты и изображения, партнёрские ссылки и обновления.',
  content: aboutPage, active: '',
  breadcrumb: [['/', 'Главная'], [null, 'О проекте']],
}));
await writePage('privacy.html', layout({
  title: 'Политика конфиденциальности', description: `Какие данные обрабатываются на сайте о ${A.prepositional}: обезличенная статистика «Яндекс.Метрики», cookie темы, отказ от учёта.`,
  content: privacyPage, active: '',
  breadcrumb: [['/', 'Главная'], [null, 'Политика конфиденциальности']],
}));
await writePage('404.html', layout({
  title: 'Страница не найдена', description: 'Страница не найдена. Вернитесь на главную или воспользуйтесь поиском по произведениям, людям и разделам сайта.', content: notFound,
  active: '', noindex: true,
}));

// ---------- дополнительные разделы ----------

for (const p of extra.pages) {
  await writePage(p.rel, layout({
    title: p.title,
    description: p.description,
    content: p.content,
    active: p.active || '',
    ogType: p.ogType || 'website',
    jsonLd: p.jsonLd || [],
    breadcrumb: p.breadcrumb || [],
  }));
}

// ---------- assets ----------

// Копируем ассеты чтением/записью, а не fs.cp: на Windows fs.cp сначала удаляет
// приёмник и падает с EBUSY, если файл занят браузером или редактором.
await writeFile(join(DIST, 'styles.css'), await readFile('src/styles.css'));
await writeFile(join(DIST, 'app.js'), await readFile('src/app.js'));
await writeFile(join(DIST, 'theme.js'), await readFile('src/theme.js'));
await cp('public/img', join(DIST, 'img'), { recursive: true, force: true });

await writeFile(join(DIST, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#7b2f2f"/><text x="32" y="45" font-family="Georgia,serif" font-size="38" fill="#f7f2e8" text-anchor="middle">${esc(String(A.lastName || A.name)[0])}</text></svg>`, 'utf8');

// ---------- search index ----------

const searchItems = [
  ...works.map((w) => ({
    t: w.title, u: workUrl(w), g: 'Произведение',
    k: `${w.genre}${w.year ? ' · ' + w.year : ''}`,
    s: firstLine(w.text).slice(0, 90),
  })),
  ...articles.map((a) => ({ t: a.title, u: `/biography/${a.slug}.html`, g: 'Биография', k: a.kind === 'overview' ? 'Обзор' : 'Период', s: a.excerpt || '' })),
  ...people.map((p) => ({ t: p.name, u: `/people/${p.id}.html`, g: 'Человек', k: p.role, s: String(p.summary || '').slice(0, 90) })),
  ...books.map((b) => ({ t: b.title, u: '/books/', g: 'Книга', k: `${b.format}${b.year ? ' · ' + b.year : ''}`, s: String(b.annotation || '').slice(0, 90) })),
  ...research.map((r) => ({ t: r.title, u: '/research/', g: 'Научная работа', k: `${(r.authors || []).join(', ')} · ${r.year}`, s: r.annotation })),
  { t: 'Хронология', u: '/life/timeline.html', g: 'Раздел', k: 'Жизнь', s: 'Основные события биографии' },
  { t: 'Учёба', u: '/life/studies.html', g: 'Раздел', k: 'Жизнь', s: 'Школа, училище, университет' },
  { t: 'Книги', u: '/books/', g: 'Раздел', k: 'Издания', s: 'Купить книги, аудиокниги' },
  { t: 'Источники', u: '/sources.html', g: 'Раздел', k: 'Реестр', s: 'Уровни достоверности' },
  { t: 'Версии', u: '/versions.html', g: 'Раздел', k: 'Спорные вопросы', s: 'Что установлено, а что — версия' },
  { t: 'О проекте', u: '/about.html', g: 'Раздел', k: 'Права и принципы', s: 'Лицензии, партнёрские ссылки, обновления' },
  ...extra.search,
];

const seenSearch = new Set();
const uniqueSearch = searchItems.filter((x) => {
  if (!x.u || seenSearch.has(x.u + '|' + x.t)) return false;
  seenSearch.add(x.u + '|' + x.t);
  return true;
});

await writeFile(join(DIST, 'search.json'), JSON.stringify(uniqueSearch), 'utf8');

// ---------- sitemap ----------

const urls = [
  '/', '/biography/', '/people/', '/life/', '/works/', '/books/', '/research/', '/places/', '/legacy/', '/topics/',
  '/versions.html', '/sources.html', '/about.html', '/faq.html', '/glossary.html', '/privacy.html',
  ...extra.urls,
  ...articles.map((a) => `/biography/${a.slug}.html`),
  ...Object.keys(categories).filter((k) => people.some((p) => p.category === k)).map((k) => `/people/${k}.html`),
  ...people.map((p) => `/people/${p.id}.html`),
  '/life/studies.html', '/life/passions.html', '/life/timeline.html',
  ...works.map(workUrl),
];

const uniqueUrls = [...new Set(urls)];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniqueUrls.map((u) => `  <url><loc>${encodeURI(SITE + u)}</loc><lastmod>${UPDATED}</lastmod><priority>${u === '/' ? '1.0' : u.endsWith('/') ? '0.8' : '0.6'}</priority></url>`).join('\n')}
</urlset>`;
await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8');
await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /404.html\nSitemap: ${SITE}/sitemap.xml\n`, 'utf8');

// llms.txt — краткая карта сайта для ИИ-поиска (AEO/GEO)
await writeFile(join(DIST, 'llms.txt'), `# ${A.name} — ${A.shortDescription.toLowerCase()}

> ${A.lead}

Проект: просветительский сайт о ${A.prepositional} (${A.years}): проверенная биография, люди,
полные тексты произведений в общественном достоянии, книги, научная литература, музеи и памятные места.

## Основное
- Биография: ${SITE}/biography/
- Люди вокруг поэта: ${SITE}/people/
- Хронология: ${SITE}/life/timeline.html
- Библиотека текстов: ${SITE}/works/
- Алфавитный указатель: ${SITE}/works/az.html
- Стихи по темам: ${SITE}/topics/
- Словарь диалектов и архаизмов: ${SITE}/glossary.html
- Частые вопросы: ${SITE}/faq.html

## Наследие
- Гибель поэта: ${SITE}/legacy/gibel.html
- Музеи и памятники: ${SITE}/legacy/memory.html
- Есенин в музыке: ${SITE}/legacy/music.html
- Есенин на экране: ${SITE}/legacy/cinema.html
- Переводы: ${SITE}/legacy/translations.html

## Справочное
- Есенинские места: ${SITE}/places/
- Книги: ${SITE}/books/
- Научные работы: ${SITE}/research/
- Источники: ${SITE}/sources.html
- Версии и спорные вопросы: ${SITE}/versions.html

## Права
Тексты произведений — общественное достояние. Тексты разделов написаны для проекта.
Фотографии — Wikimedia Commons (PD). Библиографические описания — в информационных целях.
`, 'utf8');

// ---------- deploy artifacts ----------

const ym = config.analytics?.yandexMetrika;
const ga = config.analytics?.googleAnalytics;
const scriptSrc = ["'self'", ...(ym ? ["'unsafe-inline'", 'https://mc.yandex.ru'] : []), ...(ga ? ["'unsafe-inline'", 'https://www.googletagmanager.com'] : [])].join(' ');
const imgSrc = ["'self'", 'data:', ...(ym ? ['https://mc.yandex.ru'] : [])].join(' ');
const connectSrc = ["'self'", ...(ym ? ['https://mc.yandex.ru'] : []), ...(ga ? ['https://www.googletagmanager.com', 'https://www.google-analytics.com'] : [])].join(' ');
const csp = `default-src 'self'; img-src ${imgSrc}; style-src 'self' 'unsafe-inline'; script-src ${scriptSrc}; connect-src ${connectSrc}; font-src 'self' data:; frame-src ${ym ? "'self' https://mc.yandex.ru" : "'self'"}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
// Внешний тег Метрики (mc.yandex.ru/metrika/tag.js) отдаётся динамически и не имеет
// публикуемого SRI-хеша, поэтому integrity для него не указывается: счётчик иначе не загрузится.
// Скрипт подключается только при заполненном analytics.yandexMetrika и разрешён в CSP выше.

await writeFile(join(DIST, '_headers'), `# Заголовки для Netlify / Cloudflare Pages (файл читается хостингом, не браузером)
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: ${csp}

/styles.css
  Cache-Control: public, max-age=31536000, immutable
/app.js
  Cache-Control: public, max-age=31536000, immutable
/theme.js
  Cache-Control: public, max-age=31536000, immutable
/img/*
  Cache-Control: public, max-age=31536000, immutable
/*.html
  Cache-Control: public, max-age=0, must-revalidate
`, 'utf8');

// Редиректы: второй домен и www ведут на основной, остальное — на 404.
const redirects = [
  '# Второй домен и www → основной (правило доменного уровня, работает на Netlify/Cloudflare Pages)',
  'https://poet-esenin.online/*  https://poet-esenin.ru/:splat  301!',
  'https://www.poet-esenin.online/*  https://poet-esenin.ru/:splat  301!',
  'https://www.poet-esenin.ru/*  https://poet-esenin.ru/:splat  301!',
  '',
  '/*  /404.html  404',
  '',
].join('\n');
await writeFile(join(DIST, '_redirects'), redirects, 'utf8');
await writeFile(join(DIST, '.nojekyll'), '', 'utf8');
// CNAME нужен GitHub Pages для кастомного домена; Netlify/Vercel файл игнорируют.
await writeFile(join(DIST, 'CNAME'), `${new URL(SITE).host}\n`, 'utf8');

// ---------- report ----------

const pageCount = uniqueUrls.length + 1;
console.log('built pages:', pageCount);
console.log('works:', works.length, 'people:', people.length, 'books:', books.length, 'research:', research.length);
if (/\.example\b|example\.(org|com)/.test(SITE)) console.warn('ВНИМАНИЕ: siteUrl — заглушка, укажите боевой домен в site.config.json');
// Ссылка считается промаркированной, если она пришла из партнёрской программы готовой
// (erid/partnerId внутри URL): тогда метка в конфиге не нужна.
const markedLinks = books.some((b) => (b.links || []).some((l) => /[?&](erid|partnerid)=/i.test(l.url || '')));
if (config.affiliate?.enabled && books.length && !Object.values(stores).some((s) => s.tag) && !markedLinks) {
  console.warn('ВНИМАНИЕ: у партнёрских ссылок нет меток — заполните affiliate.stores.*.tag перед публикацией');
}
if (!books.length) console.warn('ВНИМАНИЕ: data/books.json пуст — раздел «Книги» покажет заглушку');
