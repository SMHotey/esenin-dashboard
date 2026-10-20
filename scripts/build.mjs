import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const config = existsSync(join(ROOT, 'site.config.json'))
  ? JSON.parse(await readFile(join(ROOT, 'site.config.json'), 'utf8'))
  : { siteUrl: 'https://example.org' };
const SITE = String(config.siteUrl || 'https://example.org').replace(/\/$/, '');
const assetVersion = createHash('sha1')
  .update(await readFile('src/styles.css'))
  .update(await readFile('src/app.js'))
  .digest('hex')
  .slice(0, 8);

const works = JSON.parse(await readFile('data/works.json', 'utf8'));
const people = JSON.parse(await readFile('data/people.json', 'utf8'));
const timeline = JSON.parse(await readFile('data/timeline.json', 'utf8'));
const research = JSON.parse(await readFile('data/research.json', 'utf8'));
const sources = JSON.parse(await readFile('data/sources.json', 'utf8'));
const studies = JSON.parse(await readFile('data/studies.json', 'utf8'));
const passions = JSON.parse(await readFile('data/passions.json', 'utf8'));
const versions = JSON.parse(await readFile('data/versions.json', 'utf8'));

const categories = {
  family: 'Семья',
  relatives: 'Родственники',
  friends: 'Друзья',
  wives: 'Жёны',
  women: 'Женщины',
  children: 'Дети',
};

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

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');

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
  const raw = await readFile(join('content', file), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(?:"([\s\S]*)"|(.+))$/);
    if (kv) meta[kv[1]] = (kv[2] ?? kv[3] ?? '').trim();
  }
  return { meta, body: m[2] };
}

// ---------- layout ----------

const nav = [
  ['/biography/', 'Биография', 'biography'],
  ['/people/', 'Люди', 'people'],
  ['/life/', 'Жизнь', 'life'],
  ['/works/', 'Библиотека', 'works'],
  ['/research/', 'Наука', 'research'],
  ['/versions.html', 'Версии', 'versions'],
  ['/sources.html', 'Источники', 'sources'],
];

function layout({ title, description, content, active = '', bodyClass = '', pageTitle = 'Сергей Есенин' }) {
  const navHtml = nav.map(([href, label, key]) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('');

  return `<!doctype html>
<html lang="ru" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}${title.includes('Есенин') ? '' : ' — Сергей Есенин'}</title>
<meta name="description" content="${esc(description)}">
<link rel="preload" href="/img/yesenin.jpg" as="image">
<link rel="stylesheet" href="/styles.css?v=${assetVersion}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/img/yesenin.jpg">
<meta name="theme-color" content="#f7f2e8">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Сергей Александрович Есенин',
    birthDate: '1895-10-03',
    deathDate: '1925-12-28',
    birthPlace: 'Константиново, Рязанская губерния',
    deathPlace: 'Ленинград',
    description: 'Русский поэт',
    image: `${SITE}/img/yesenin.jpg`,
  })}</script>
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">К содержанию</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/"><span class="brand-mark">Есенин</span><span class="brand-years">1895—1925</span></a>
    <nav class="main-nav" aria-label="Основная навигация">${navHtml}</nav>
    <div class="header-tools">
      <button class="icon-btn" data-search-open aria-label="Поиск по сайту" title="Поиск (Ctrl+K)">⌕</button>
      <button class="icon-btn" data-theme-toggle aria-label="Переключить тему" title="Тема">☾</button>
      <button class="icon-btn nav-toggle" data-nav-toggle aria-label="Меню">☰</button>
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
        <p style="max-width:40ch;color:var(--muted);font-size:14px">Дашборд-лендинг о Сергее Есенине: проверенная биография, люди вокруг поэта, полная библиотека произведений и научная литература.</p>
        <p style="font-size:12px;color:var(--muted)">Материалы сверяются с академическими изданиями. Спорные вопросы вынесены в раздел «Версии».</p>
      </div>
      <div>
        <h4>Разделы</h4>
        <ul>
          <li><a href="/biography/">Биография</a></li>
          <li><a href="/people/">Люди</a></li>
          <li><a href="/works/">Библиотека</a></li>
          <li><a href="/research/">Научные работы</a></li>
        </ul>
      </div>
      <div>
        <h4>Служебное</h4>
        <ul>
          <li><a href="/sources.html">Источники</a></li>
          <li><a href="/versions.html">Версии</a></li>
          <li><a href="/about.html">О проекте и правах</a></li>
          <li><a href="/search.json">Индекс поиска</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-note">
      <span>© 2026 Проект о Сергее Есенине. Тексты произведений — общественное достояние.</span>
      <span>Обновлено 20 октября 2026</span>
    </div>
  </div>
</footer>
<div class="search-dialog" data-search-dialog data-search-src="/search.json" role="dialog" aria-modal="true" aria-label="Поиск">
  <div class="search-box">
    <header><span aria-hidden="true">⌕</span><input type="search" placeholder="Найти произведение, человека, статью…" aria-label="Поисковый запрос"><button class="icon-btn" data-search-close aria-label="Закрыть">✕</button></header>
    <div class="search-results"></div>
  </div>
</div>
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

const stats = {
  works: works.length,
  poems: works.filter((w) => w.genre === 'Стихотворение').length,
  people: people.length,
  research: research.length,
  years: '1895—1925',
};

// ---------- home ----------

const featuredTitles = ['Берёза', 'Черёмуха', 'Письмо к женщине', 'Анна Снегина', 'Чёрный человек', 'Спит ковыль. Равнина дорогая'];
const featured = featuredTitles.map((t) => works.find((w) => norm(w.title).startsWith(norm(t)))).filter(Boolean);

const keyEvents = timeline.filter((e) => ['1895-10-03', '1909', '1914', '1915', '1916', '1917-07-30', '1922-05-02', '1925-12-28'].includes(e.date)).slice(0, 8);

const homePeople = ['alexander-nikitich', 'tatyana-fyodorovna', 'zinaida-raikh', 'isadora-duncan', 'sofia-tolstaya', 'blok', 'mariengof', 'benislavskaya']
  .map((id) => people.find((p) => p.id === id)).filter(Boolean);

const home = `
<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <div class="eyebrow">поэт · 1895—1925</div>
      <h1><span class="first">Сергей</span>Есенин</h1>
      <p class="hero-lead">Русский поэт, в котором деревенская Россия встретилась с революцией, имажинизмом и большой трагедией XX века.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/biography/">Читать биографию</a>
        <a class="btn btn-ghost" href="/works/">Открыть библиотеку</a>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><b>${stats.works}</b><span>произведений</span></div>
        <div class="hero-stat"><b>${stats.people}</b><span>персон</span></div>
        <div class="hero-stat"><b>${stats.research}</b><span>работ о поэте</span></div>
      </div>
    </div>
    <div class="portrait-wrap portrait-frame">
      <img class="portrait" src="/img/yesenin.jpg" alt="Портрет Сергея Есенина" width="360" height="480">
      <div class="portrait-caption">Сергей Есенин. Фотография до 1925 года.<br>Wikimedia Commons, Public Domain</div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>Разделы проекта</h2><p>Всё содержание собрано в восемь связанных между собой разделов.</p></div>
    </div>
    <div class="tiles">
      <a class="tile" href="/biography/"><span class="tile-kicker">01</span><span class="tile-title">Биография</span><span class="tile-count">Обзор и статьи по периодам</span></a>
      <a class="tile" href="/people/"><span class="tile-kicker">02</span><span class="tile-title">Люди</span><span class="tile-count">Семья, друзья, жёны — ${stats.people}</span></a>
      <a class="tile" href="/life/"><span class="tile-kicker">03</span><span class="tile-title">Жизнь</span><span class="tile-count">Учёба, увлечения, хронология</span></a>
      <a class="tile" href="/works/"><span class="tile-kicker">04</span><span class="tile-title">Библиотека</span><span class="tile-count">${stats.works} произведений с каталогом</span></a>
      <a class="tile" href="/research/"><span class="tile-kicker">05</span><span class="tile-title">Наука</span><span class="tile-count">${stats.research} работ о Есенине</span></a>
      <a class="tile" href="/versions.html"><span class="tile-kicker">06</span><span class="tile-title">Версии</span><span class="tile-count">Спорные вопросы биографии</span></a>
      <a class="tile" href="/sources.html"><span class="tile-kicker">07</span><span class="tile-title">Источники</span><span class="tile-count">Реестр и уровни достоверности</span></a>
      <a class="tile" href="/about.html"><span class="tile-kicker">08</span><span class="tile-title">О проекте</span><span class="tile-count">Принципы, права, обновления</span></a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="panels">
      <div class="panel">
        <h3>Ключевые даты</h3>
        <ul class="timeline-mini">
          ${keyEvents.map((e) => `<li><span class="year">${esc(e.display.split(' ').slice(-1)[0])}</span><span class="what">${esc(e.title)}<small>${esc(e.display)}</small></span></li>`).join('')}
        </ul>
        <p style="margin-top:14px"><a class="section-link" href="/life/timeline.html">Полная хронология →</a></p>
      </div>
      <div class="panel">
        <h3>Ключевые персоны</h3>
        <div class="people-chips">
          ${homePeople.map((p) => `<a class="chip" href="/people/${p.id}.html">${esc(p.name)}</a>`).join('')}
        </div>
        <p style="margin-top:18px;font-size:13px;color:var(--muted)">В разделе «Люди» — карточки членов семьи, друзей, жён и женщин, которым посвящены стихи.</p>
        <p><a class="section-link" href="/people/">Все персоны →</a></p>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>Из библиотеки</h2><p>${stats.works} текстов: стихотворения, малые поэмы, поэмы, проза, письма и статьи.</p></div>
      <a class="section-link" href="/works/">Весь каталог →</a>
    </div>
    <div class="works-grid">${featured.map(workCard).join('')}</div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>Научные работы</h2><p>Биографии, хроники и исследования, на которые опирается проект.</p></div>
      <a class="section-link" href="/research/">Все работы →</a>
    </div>
    <div class="research-list">
      ${research.slice(0, 4).map((r) => `<div class="research-item">
        <div class="research-year">${r.year}</div>
        <div><h3>${esc(r.title)}</h3><div class="authors">${esc(r.authors.join(', '))}</div>
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

const articleFiles = ['overview.md', 'early-years.md', 'petrograd.md', 'late-years.md'];
const articles = [];
for (const f of articleFiles) {
  const { meta, body } = await readArticle(f);
  articles.push({ ...meta, body, html: mdToHtml(body) });
}
const overview = articles[0];

const biographyIndex = `
${crumbs([['/', 'Главная'], [null, 'Биография']])}
<div class="wrap page-head">
  <h1>Биография</h1>
  <p>Обзорный очерк и статьи о ключевых периодах жизни поэта. Даты и имена сверены с академическими изданиями; спорные сюжеты вынесены в раздел «Версии».</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  <div class="works-grid">
    ${articles.map((a) => `<a class="work-card" href="/biography/${a.slug}.html">
      <span class="genre">${a.kind === 'overview' ? 'Обзор' : 'Период'}</span>
      <span class="title">${esc(a.title)}</span>
      <span class="preview">${esc(a.excerpt)}</span>
    </a>`).join('')}
  </div>
</div>`;

function articlePage(a) {
  return `${crumbs([['/', 'Главная'], ['/biography/', 'Биография'], [null, a.title]])}
  <div class="wrap article-layout">
    <article>
      <h1 style="font-size:clamp(32px,5vw,48px);margin-bottom:14px">${esc(a.title)}</h1>
      <div class="meta-line"><span class="badge">${a.kind === 'overview' ? 'обзор' : 'статья о жизни'}</span><span>Обновлено 20 октября 2026</span></div>
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
          <li><a href="/people/">Люди вокруг поэта</a></li>
          <li><a href="/life/timeline.html">Хронология</a></li>
          <li><a href="/works/">Библиотека</a></li>
        </ul>
      </div>
    </aside>
  </div>`;
}

// ---------- people ----------

const peopleIndex = `
${crumbs([['/', 'Главная'], [null, 'Люди']])}
<div class="wrap page-head">
  <h1>Люди вокруг Есенина</h1>
  <p>Семья, родственники, друзья, жёны и женщины, которым посвящены стихи. У каждой карточки указан статус отношений и источник сведений.</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  ${Object.entries(categories).map(([key, label]) => {
    const list = people.filter((p) => p.category === key);
    if (!list.length) return '';
    return `<section style="margin-bottom:44px">
      <div class="section-head"><div><h2 style="font-size:28px">${label}</h2><p>${list.length} ${plural(list.length, ['человек', 'человека', 'человек'])}</p></div><a class="section-link" href="/people/${key}.html">Отдельная страница →</a></div>
      <div class="people-grid">${list.map(personCard).join('')}</div>
    </section>`;
  }).join('')}
</div>`;

function categoryPage(key) {
  const list = people.filter((p) => p.category === key);
  return `${crumbs([['/', 'Главная'], ['/people/', 'Люди'], [null, categories[key]]])}
  <div class="wrap page-head"><h1>${categories[key]}</h1><p>${list.length} карточек. Все сведения сопровождаются указанием источника.</p></div>
  <div class="wrap" style="padding-bottom:50px"><div class="people-grid">${list.map(personCard).join('')}</div></div>`;
}

function personPage(p) {
  const related = works.filter((w) => norm(w.text).includes(norm(p.name.split(' ')[0]))).slice(0, 6);
  const rel = [
    ...people.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 6),
  ];
  return `${crumbs([['/', 'Главная'], ['/people/', 'Люди'], [`/people/${p.category}.html`, categories[p.category]], [null, p.name]])}
  <div class="wrap">
    <div class="person-hero">
      <div class="person-mono" aria-hidden="true">${esc(p.name[0])}</div>
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
        <p style="margin-top:16px;font-size:13px;color:var(--muted)">Полный граф связей — в разделе <a href="/people/">«Люди»</a>.</p>
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
    <a class="tile" href="/life/studies.html"><span class="tile-kicker">01</span><span class="tile-title">Учёба</span><span class="tile-count">Школа, училище, университет</span></a>
    <a class="tile" href="/life/passions.html"><span class="tile-kicker">02</span><span class="tile-title">Увлечения</span><span class="tile-count">Темы, круги, путешествия</span></a>
    <a class="tile" href="/life/timeline.html"><span class="tile-kicker">03</span><span class="tile-title">Хронология</span><span class="tile-count">${timeline.length} событий</span></a>
    <a class="tile" href="/biography/"><span class="tile-kicker">04</span><span class="tile-title">Биография</span><span class="tile-count">Обзор и статьи</span></a>
  </div>
</div>`;

const studiesPage = `
${crumbs([['/', 'Главная'], ['/life/', 'Жизнь'], [null, 'Учёба']])}
<div class="wrap page-head"><h1>Учёба</h1><p>Образование Есенина: от сельской школы до вольного слушания в университете.</p></div>
<div class="wrap" style="padding-bottom:50px">
  ${studies.map((s) => `<div class="panel" style="margin-bottom:14px">
    <div class="meta-line"><span class="badge">${esc(s.type)}</span><span>${esc(s.years)}</span></div>
    <h3 style="font-size:22px">${esc(s.title)}</h3>
    <p style="color:var(--ink-soft);max-width:70ch">${esc(s.text)}</p>
  </div>`).join('')}
  <div class="source-box"><b>Источник.</b> Сведения приведены по биографическим статьям и академическим изданиям; см. <a href="/sources.html">«Источники»</a>.</div>
</div>`;

const passionsPage = `
${crumbs([['/', 'Главная'], ['/life/', 'Жизнь'], [null, 'Увлечения']])}
<div class="wrap page-head"><h1>Увлечения и темы</h1><p>Не список хобби, а круг интересов, из которого выросла поэзия Есенина.</p></div>
<div class="wrap" style="padding-bottom:50px">
  ${passions.map((p) => `<div class="panel" style="margin-bottom:14px">
    <h3 style="font-size:22px">${esc(p.title)}</h3>
    <p style="color:var(--ink-soft);max-width:70ch">${esc(p.text)}</p>
    <div class="tag-row">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  </div>`).join('')}
</div>`;

const timelinePage = `
${crumbs([['/', 'Главная'], ['/life/', 'Жизнь'], [null, 'Хронология']])}
<div class="wrap page-head"><h1>Хронология</h1><p>${timeline.length} событий — от рождения в Константинове до смерти в Ленинграде.</p></div>
<div class="wrap" style="padding-bottom:60px">
  <ul class="timeline-mini" style="background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 24px">
    ${timeline.map((e) => `<li><span class="year">${esc(e.display)}</span><span class="what"><b>${esc(e.title)}</b><small>${esc(e.text)}</small></span></li>`).join('')}
  </ul>
</div>`;

// ---------- works ----------

const genres = [...new Set(works.map((w) => w.genre))];
const decades = [...new Set(works.filter((w) => w.year).map((w) => Math.floor(w.year / 10) * 10))].sort();

const worksIndex = `
${crumbs([['/', 'Главная'], [null, 'Библиотека']])}
<div class="wrap page-head">
  <h1>Библиотека</h1>
  <p>${stats.works} произведений: стихотворения — ${works.filter((w) => w.genre === 'Стихотворение').length}, малые поэмы — ${works.filter((w) => w.genre === 'Малая поэма').length}, поэмы — ${works.filter((w) => w.genre === 'Поэма').length}, проза — ${works.filter((w) => w.genre === 'Проза').length}, статьи — ${works.filter((w) => w.genre === 'Статья').length}, автобиография — 1. Поиск — по названию и первой строке.</p>
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
  <div class="results-line"><span>Найдено: <b data-result-count>${works.length}</b></span><span>Источник текстов: Викитека</span></div>
  <div class="catalog-grid" data-catalog>
    ${works.map((w) => `<a class="catalog-card" href="${workUrl(w)}" data-title="${esc(w.title)}" data-genre="${esc(w.genre)}" data-decade="${w.year ? Math.floor(w.year / 10) * 10 : ''}" data-year="${w.year || ''}" data-chars="${w.chars}" data-first="${esc(firstLine(w.text))}">
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
    <div class="meta-line"><span class="badge">${esc(w.genre)}</span>${w.year ? `<span>${w.year}</span>` : ''}<span>Источник: Викитека</span></div>
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
      <br>Текст находится в общественном достоянии. При цитировании указывайте источник.
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

// ---------- research ----------

const researchPage = `
${crumbs([['/', 'Главная'], [null, 'Научные работы']])}
<div class="wrap page-head">
  <h1>Научные работы о Есенине</h1>
  <p>${research.length} библиографических записей: биографии, хроники, монографии и энциклопедические статьи. Полные тексты не размещаются — только метаданные и аннотации.</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  <div class="note">Раздел задуман как отправная точка для исследования. Аннотации кратко описывают тему работы и не заменяют чтение источника.</div>
  <div class="research-list">
    ${research.slice().sort((a, b) => b.year - a.year).map((r) => `<article class="research-item">
      <div class="research-year">${r.year}</div>
      <div>
        <h3>${esc(r.title)}</h3>
        <div class="authors">${esc(r.authors.join(', '))}</div>
        <div class="pub">${esc(r.place)}: ${esc(r.publisher)}${r.pages ? ', ' + esc(r.pages) : ''}${r.isbn ? ' · ISBN ' + esc(r.isbn) : ''}</div>
        <p class="annotation">${esc(r.annotation)}</p>
        <div class="tag-row"><span class="tag">${esc(r.type)}</span>${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
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
  <div class="note">Дата обращения ко всем источникам — 20 октября 2026 года. Ссылки проверяются ежемесячно; устаревшие адреса фиксируются в журнале обновлений.</div>
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
    <p>Это некоммерческий просветительский проект, посвящённый Сергею Александровичу Есенину. Его задача — собрать в одном месте проверенную биографию, людей вокруг поэта, полную библиотеку текстов и научную литературу.</p>
    <h2>Принципы работы с фактами</h2>
    <p>Каждое утверждение опирается на источник. При расхождении источников мы показываем версии, а не выбираем удобную. Спорные сюжеты вынесены в раздел «Версии».</p>
    <h2>Тексты</h2>
    <p>Произведения Есенина находятся в общественном достоянии. Тексты импортированы из Викитеки; у каждого произведения указана страница-источник и, где возможно, редакция академического издания.</p>
    <h2>Изображения</h2>
    <p>Используются только файлы из Wikimedia Commons, находящиеся в общественном достоянии или под свободной лицензией. Атрибуция указана рядом с изображением.</p>
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
      <p>Тексты — общественное достояние. Фотографии — Wikimedia Commons (PD). Библиографические описания — в информационных целях.</p>
    </div>
  </aside>
</div>`;

const notFound = `
${crumbs([['/', 'Главная'], [null, '404']])}
<div class="wrap page-head" style="text-align:center;padding:90px 0">
  <h1 style="font-size:96px;color:var(--gold)">404</h1>
  <p>Такой страницы нет. Попробуйте начать с <a href="/">главной</a> или открыть <a href="/works/">каталог произведений</a>.</p>
</div>`;

// ---------- write ----------

async function emptyDir(dir) {
  await mkdir(dir, { recursive: true });
  let entries = [];
  try { entries = await readdir(dir); } catch { return; }
  for (const entry of entries) {
    await rm(join(dir, entry), { recursive: true, force: true, maxRetries: 3 });
  }
}

await emptyDir(DIST);
await mkdir(DIST, { recursive: true });

async function writePage(rel, html) {
  const file = join(DIST, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html, 'utf8');
}

await writePage('index.html', layout({
  title: 'Сергей Есенин — дашборд-лендинг',
  description: 'Биография, люди, библиотека произведений и научные работы о Сергее Есенине (1895–1925).',
  content: home, active: '',
}));

await writePage('biography/index.html', layout({
  title: 'Биография', description: 'Обзорная биография Сергея Есенина и статьи о периодах жизни.',
  content: biographyIndex, active: 'biography',
}));

for (const a of articles) {
  await writePage(`biography/${a.slug}.html`, layout({
    title: a.title, description: a.excerpt, content: articlePage(a), active: 'biography',
  }));
}

await writePage('people/index.html', layout({
  title: 'Люди вокруг Есенина', description: 'Семья, родственники, друзья, жёны и женщины в биографии Сергея Есенина.',
  content: peopleIndex, active: 'people',
}));

for (const key of Object.keys(categories)) {
  const list = people.filter((p) => p.category === key);
  if (!list.length) continue;
  await writePage(`people/${key}.html`, layout({
    title: categories[key], description: `${categories[key]} Сергея Есенина: ${list.length} карточек.`,
    content: categoryPage(key), active: 'people',
  }));
}

for (const p of people) {
  await writePage(`people/${p.id}.html`, layout({
    title: p.name, description: p.summary.slice(0, 180), content: personPage(p), active: 'people',
  }));
}

await writePage('life/index.html', layout({
  title: 'Жизнь', description: 'Учёба, увлечения и хронология жизни Сергея Есенина.',
  content: lifeIndex, active: 'life',
}));
await writePage('life/studies.html', layout({
  title: 'Учёба', description: 'Образование Сергея Есенина: земское училище, Спас-Клепики, университет Шанявского.',
  content: studiesPage, active: 'life',
}));
await writePage('life/passions.html', layout({
  title: 'Увлечения', description: 'Темы и интересы Сергея Есенина: деревня, литературные объединения, путешествия, песня.',
  content: passionsPage, active: 'life',
}));
await writePage('life/timeline.html', layout({
  title: 'Хронология', description: 'Основные события жизни Сергея Есенина.',
  content: timelinePage, active: 'life',
}));

await writePage('works/index.html', layout({
  title: 'Библиотека произведений', description: `Каталог произведений Сергея Есенина: ${stats.works} текстов с поиском и фильтрами.`,
  content: worksIndex, active: 'works',
}));

for (let i = 0; i < works.length; i++) {
  const w = works[i];
  await writePage(`works/${w.slug}.html`, layout({
    title: w.title, description: `${w.title} — Сергей Есенин. ${w.year || ''}`.trim(),
    content: workPage(w, i), active: 'works',
  }));
}

await writePage('research/index.html', layout({
  title: 'Научные работы', description: 'Библиографии и исследования о Сергее Есенине.',
  content: researchPage, active: 'research',
}));
await writePage('sources.html', layout({
  title: 'Источники', description: 'Реестр источников проекта о Сергее Есенине.',
  content: sourcesPage, active: 'sources',
}));
await writePage('versions.html', layout({
  title: 'Версии и спорные вопросы', description: 'Спорные вопросы биографии Сергея Есенина.',
  content: versionsPage, active: 'versions',
}));
await writePage('about.html', layout({
  title: 'О проекте', description: 'Принципы работы проекта, права на материалы, обновления.',
  content: aboutPage, active: '',
}));
await writePage('404.html', layout({
  title: 'Страница не найдена', description: 'Страница не найдена.', content: notFound, active: '',
}));

// ---------- assets ----------

await cp('src/styles.css', join(DIST, 'styles.css'));
await cp('src/app.js', join(DIST, 'app.js'));
await cp('public/img', join(DIST, 'img'), { recursive: true });

await writeFile(join(DIST, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#7b2f2f"/><text x="32" y="45" font-family="Georgia,serif" font-size="38" fill="#f7f2e8" text-anchor="middle">Е</text></svg>`, 'utf8');

// ---------- search index ----------

const searchItems = [
  ...works.map((w) => ({
    t: w.title, u: workUrl(w), g: 'Произведение',
    k: `${w.genre}${w.year ? ' · ' + w.year : ''}`,
    s: firstLine(w.text).slice(0, 90),
  })),
  ...articles.map((a) => ({ t: a.title, u: `/biography/${a.slug}.html`, g: 'Биография', k: a.kind === 'overview' ? 'Обзор' : 'Период', s: a.excerpt })),
  ...people.map((p) => ({ t: p.name, u: `/people/${p.id}.html`, g: 'Человек', k: p.role, s: p.summary.slice(0, 90) })),
  ...research.map((r) => ({ t: r.title, u: '/research/index.html', g: 'Научная работа', k: `${r.authors.join(', ')} · ${r.year}`, s: r.annotation })),
  { t: 'Хронология', u: '/life/timeline.html', g: 'Раздел', k: 'Жизнь', s: 'Основные события биографии' },
  { t: 'Учёба', u: '/life/studies.html', g: 'Раздел', k: 'Жизнь', s: 'Школа, училище, университет' },
  { t: 'Источники', u: '/sources.html', g: 'Раздел', k: 'Реестр', s: 'Уровни достоверности' },
];

await writeFile(join(DIST, 'search.json'), JSON.stringify(searchItems), 'utf8');

// ---------- sitemap ----------

const urls = [
  '/', '/biography/', '/people/', '/life/', '/works/', '/research/', '/versions.html', '/sources.html', '/about.html',
  ...articles.map((a) => `/biography/${a.slug}.html`),
  ...Object.keys(categories).filter((k) => people.some((p) => p.category === k)).map((k) => `/people/${k}.html`),
  ...people.map((p) => `/people/${p.id}.html`),
  '/life/studies.html', '/life/passions.html', '/life/timeline.html',
  ...works.map(workUrl),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>2026-10-20</lastmod></url>`).join('\n')}
</urlset>`;
await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8');
await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`, 'utf8');

console.log('built pages:', urls.length + 1);
console.log('works:', works.length, 'people:', people.length, 'research:', research.length);
