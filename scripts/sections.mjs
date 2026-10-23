// Дополнительные разделы сайта: места, наследие, темы, словарь, вопросы, алфавит.
// Модуль не пишет файлы: он возвращает описания страниц, их пишет scripts/build.mjs.
// Все тексты написаны для проекта; факты и общедоступные сведения — без заимствованных
// фрагментов чужих статей.

export function buildSectionPages(ctx) {
  const {
    A, SITE, LANG, UPDATED, UPDATED_LABEL, esc, plural, norm, crumbs, workUrl,
    works, places, museums, monuments, music, films, languages, topics, glossary, faq, death,
  } = ctx;

  const pages = [];
  const urls = [];
  const search = [];

  const page = (rel, title, description, content, opts = {}) => {
    const p = { rel, title, description: String(description).slice(0, 200), content, ...opts };
    pages.push(p);
    urls.push(rel === 'index.html' ? '/' : '/' + rel.replace(/index\.html$/, ''));
    return p;
  };

  const findWork = (q) => works.find((w) => norm(w.title).startsWith(norm(q))) || works.find((w) => norm(w.title).includes(norm(q)));
  const workChips = (titles = []) => {
    const items = titles.map(findWork).filter(Boolean);
    if (!items.length) return '';
    return `<div class="tag-row">${items.map((w) => `<a class="chip" href="${workUrl(w)}">${esc(w.title)}</a>`).join('')}</div>`;
  };

  // ---------- тематические подборки ----------

  const topicWorks = new Map();
  const workTopics = new Map();
  for (const t of topics) {
    const keys = t.keywords || [];
    const allowed = t.genres && t.genres.length ? new Set(t.genres) : null;
    const scored = [];
    for (const w of works) {
      if (allowed && !allowed.has(w.genre)) continue;
      if (w.genre === 'Статья' || w.genre === 'Автобиография') continue;
      const hay = norm(w.text);
      let score = 0;
      for (const k of keys) {
        const nk = norm(k);
        let idx = hay.indexOf(nk);
        while (idx !== -1) { score++; idx = hay.indexOf(nk, idx + nk.length); }
      }
      if (score >= (t.min || 2)) scored.push({ w, score });
    }
    scored.sort((a, b) => b.score - a.score || (a.w.year || 0) - (b.w.year || 0));
    const list = scored.slice(0, 100);
    topicWorks.set(t.id, list);
    for (const { w } of list) {
      if (!workTopics.has(w.slug)) workTopics.set(w.slug, []);
      workTopics.get(w.slug).push(t);
    }
  }

  page('topics/index.html', 'Стихи Есенина по темам: подборки', 
    'Тематические подборки стихов Сергея Есенина: природа, Родина, деревня, любовь, мать, город, смерть, Кавказ, революция. С пояснениями и ссылками на полные тексты.',
    `${crumbs([['/', 'Главная'], [null, 'Темы']])}
<div class="wrap page-head">
  <h1>Стихи по темам</h1>
  <p>Девять подборок: от природы и деревни до города, смерти и революции. В каждой — короткое вступление и тексты, в которых тема держится не одним словом, а всей тканью стихотворения.</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  <div class="works-grid">
    ${topics.map((t) => `<a class="work-card" href="/topics/${t.id}.html">
      <span class="genre">${esc(t.kicker || 'Подборка')}</span>
      <span class="title">${esc(t.title)}</span>
      <span class="year">${(topicWorks.get(t.id) || []).length} ${plural((topicWorks.get(t.id) || []).length, ['текст', 'текста', 'текстов'])}</span>
      <span class="preview">${esc(t.lead)}</span>
    </a>`).join('')}
  </div>
  <div class="note" style="margin-top:24px">
    <b>Как устроены подборки.</b> Тексты отобраны по ключевым словам и образам, а не по школьной программе: в подборку попадает стихотворение, где тема действительно работает. Поэтому списки пересекаются — это нормально.
    <a href="/works/">Полная библиотека →</a>
  </div>
</div>`,
    { active: 'works', breadcrumb: [['/', 'Главная'], ['/topics/', 'Темы']], jsonLd: {
      '@type': 'CollectionPage', name: 'Стихи Есенина по темам', inLanguage: LANG,
      hasPart: topics.map((t) => ({ '@type': 'CollectionPage', name: t.title, url: `${SITE}/topics/${t.id}.html` })),
    } });
  search.push({ t: 'Стихи по темам', u: '/topics/', g: 'Раздел', k: 'Подборки', s: 'Природа, Родина, деревня, любовь, город, Кавказ' });

  for (const t of topics) {
    const list = (topicWorks.get(t.id) || []).slice();
    page(`topics/${t.id}.html`, t.title,
      `${t.title}: ${list.length} ${plural(list.length, ['произведение', 'произведения', 'произведений'])} с пояснением, о чём подборка и как читать эти тексты.`,
      `${crumbs([['/', 'Главная'], ['/topics/', 'Темы'], [null, t.kicker || t.title]])}
<div class="wrap article-layout">
  <article>
    <h1 style="font-size:clamp(30px,4.6vw,44px);margin-bottom:12px">${esc(t.title)}</h1>
    <div class="meta-line"><span class="badge">подборка</span><span>${list.length} ${plural(list.length, ['текст', 'текста', 'текстов'])}</span><span>Обновлено ${esc(UPDATED_LABEL)}</span></div>
    <p style="font-family:var(--serif);font-size:19px;color:var(--ink-soft);max-width:64ch">${esc(t.lead)}</p>
    <div class="prose">
      ${(t.intro || []).map((p) => `<p>${esc(p)}</p>`).join('')}
    </div>
    <h2 style="margin:34px 0 14px;font-size:26px">Тексты подборки</h2>
    <ul class="topic-work-list">
      ${list.map(({ w }) => `<li>
        <a href="${workUrl(w)}">${esc(w.title)}</a>
        <span class="tw-year">${w.year ? esc(w.year) : 'дата не установлена'}</span>
        <span class="tw-first">${esc((w.text || '').split('\\n').find((l) => l.trim()) || '')}</span>
      </li>`).join('')}
    </ul>
    <div class="source-box"><b>Принцип отбора.</b> В подборку входят тексты, где тема подтверждается ключевыми образами и словарём. Это редакционный список, а не академическая классификация.
      <a href="/topics/">Другие темы →</a></div>
  </article>
  <aside>
    <div class="aside-card">
      <h4>Другие подборки</h4>
      <ul>${topics.filter((x) => x.id !== t.id).map((x) => `<li><a href="/topics/${x.id}.html">${esc(x.title)}</a></li>`).join('')}</ul>
      <h4 style="margin-top:18px">Связанное</h4>
      <ul>
        <li><a href="/works/">Библиотека</a></li>
        <li><a href="/glossary.html">Словарь к стихам</a></li>
        <li><a href="/life/timeline.html">Хронология</a></li>
        <li><a href="/faq.html">Частые вопросы</a></li>
      </ul>
    </div>
  </aside>
</div>`,
      { active: 'works', breadcrumb: [['/', 'Главная'], ['/topics/', 'Темы'], [`/topics/${t.id}.html`, t.kicker || t.title]], jsonLd: {
        '@type': 'CollectionPage', name: t.title, description: t.lead, inLanguage: LANG,
        url: `${SITE}/topics/${t.id}.html`,
        mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.map(({ w }, i) => ({ '@type': 'ListItem', position: i + 1, name: w.title, url: `${SITE}${workUrl(w)}` })) },
      } });
    search.push({ t: t.title, u: `/topics/${t.id}.html`, g: 'Подборка', k: 'Стихи', s: t.lead });
  }

  // ---------- места ----------

  page('places/index.html', 'Есенинские места',
    'Константиново, Спас-Клепики, Рязань, Москва, Петербург, Кавказ и зарубежные поездки: где жил и что видел Сергей Есенин. Музеи и маршруты.',
    `${crumbs([['/', 'Главная'], [null, 'Места']])}
<div class="wrap page-head">
  <h1>Есенинские места</h1>
  <p>Восемь точек, без которых биография рассыпается на даты: село на Оке, учительская школа, губернский город, две столицы, Кавказ и заграница 1922—1923 годов.</p>
</div>
<div class="wrap" style="padding-bottom:30px">
  <div class="works-grid">
    ${places.map((p) => `<a class="work-card place-card" href="/places/${p.id}.html">
      ${p.photo ? `<img class="place-card-photo" src="${esc(p.photoWebp || p.photo)}" alt="${esc(p.photoAlt || p.title)}" loading="lazy" decoding="async">` : ''}
      <span class="genre">${esc(p.kicker)}</span>
      <span class="title">${esc(p.title)}</span>
      <span class="year">${esc(p.years || '')}</span>
      <span class="preview">${esc(p.subtitle)}</span>
    </a>`).join('')}
  </div>
</div>
<div class="wrap" style="padding-bottom:50px">
  <div class="note">
    <b>Как читать раздел.</b> Места описаны не как путеводитель, а как среда: что здесь было при жизни поэта и что осталось сегодня. Музеи, адреса и памятники собраны отдельно — в <a href="/legacy/memory.html">разделе «Память»</a>.
  </div>
</div>`,
    { active: 'places', breadcrumb: [['/', 'Главная'], ['/places/', 'Места']], jsonLd: {
      '@type': 'ItemList', name: 'Есенинские места', numberOfItems: places.length,
      itemListElement: places.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title, url: `${SITE}/places/${p.id}.html` })),
    } });
  search.push({ t: 'Есенинские места', u: '/places/', g: 'Раздел', k: 'Музеи и города', s: 'Константиново, Москва, Петербург, Кавказ' });

  for (const p of places) {
    const near = (p.see || []).map((id) => places.find((x) => x.id === id)).filter(Boolean);
    page(`places/${p.id}.html`, p.title,
      `${p.title} в жизни ${A.genitive}: ${p.subtitle}. Что здесь было при жизни поэта, что сохранилось и как устроен музейный маршрут.`,
      `${crumbs([['/', 'Главная'], ['/places/', 'Места'], [null, p.title]])}
<div class="wrap article-layout">
  <article>
    ${p.photo ? `<figure class="place-hero"><picture>${p.photoWebp ? `<source srcset="${esc(p.photoWebp)}" type="image/webp">` : ''}<img src="${esc(p.photo)}" alt="${esc(p.photoAlt || p.title)}" loading="lazy" decoding="async"></picture><figcaption>${esc(p.photoAlt || p.title)} · Фото: <a href="${esc(p.photoSource)}" rel="noopener external" target="_blank">Викисклад</a>${p.photoCredit ? ` · ${esc(p.photoCredit)}` : ''}${p.photoLicense ? ` · ${esc(p.photoLicense)}` : ''}</figcaption></figure>` : ''}
    <div class="meta-line"><span class="badge">${esc(p.kicker)}</span><span>${esc(p.region)}</span>${p.years ? `<span>${esc(p.years)}</span>` : ''}</div>
    <h1 style="font-size:clamp(30px,4.6vw,44px);margin-bottom:10px">${esc(p.title)}</h1>
    <p style="font-family:var(--serif);font-size:19px;color:var(--ink-soft);max-width:64ch">${esc(p.lead)}</p>
    <div class="panel" style="margin:20px 0 26px">
      <h3 style="font-size:18px">Коротко</h3>
      <dl class="fact-list">
        ${(p.facts || []).map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}
      </dl>
    </div>
    ${(p.blocks || []).map((b) => `<h2>${esc(b.h)}</h2><p>${esc(b.p)}</p>`).join('')}
    ${workChips(p.works) ? `<h2>В произведениях</h2>${workChips(p.works)}` : ''}
    <div class="source-box"><b>О тексте.</b> Очерк написан для проекта по общедоступным сведениям и музейным описаниям. Даты и адреса уточняйте на официальных сайтах музеев: режим работы и экспозиции меняются.</div>
  </article>
  <aside>
    <div class="aside-card">
      <h4>Рядом</h4>
      <ul>${near.length ? near.map((x) => `<li><a href="/places/${x.id}.html">${esc(x.title)}</a></li>`).join('') : '<li><a href="/places/">Все места</a></li>'}</ul>
      <h4 style="margin-top:18px">Связанное</h4>
      <ul>
        <li><a href="/legacy/memory.html">Музеи и памятники</a></li>
        <li><a href="/biography/">Биография</a></li>
        <li><a href="/life/timeline.html">Хронология</a></li>
        <li><a href="/people/">Люди</a></li>
      </ul>
    </div>
  </aside>
</div>`,
      { active: 'places', breadcrumb: [['/', 'Главная'], ['/places/', 'Места'], [`/places/${p.id}.html`, p.title]], jsonLd: {
        '@type': 'Place', name: p.title, description: p.lead, url: `${SITE}/places/${p.id}.html`,
        containedInPlace: { '@type': 'Place', name: p.region },
      } });
    search.push({ t: p.title, u: `/places/${p.id}.html`, g: 'Место', k: p.region, s: p.subtitle });
  }

  // ---------- наследие ----------

  const legacyCards = [
    ['/legacy/gibel.html', 'gibel', 'Гибель поэта', 'Обстоятельства, документы, версии'],
    ['/legacy/memory.html', 'memory', 'Музеи и памятники', `${museums.length + monuments.length} адресов памяти`],
    ['/legacy/music.html', 'music', 'Есенин в музыке', 'Песни, романсы, Свиридов'],
    ['/legacy/cinema.html', 'cinema', 'Есенин на экране', 'Фильмы и сериалы'],
    ['/legacy/translations.html', 'translations', 'Переводы', 'Как поэт говорит на других языках'],
  ];

  page('legacy/index.html', 'Наследие Есенина',
    'Гибель поэта, музеи и памятники, музыка и кино, переводы: пять разделов о том, как Есенин вошёл в культуру и как его читают сегодня.',
    `${crumbs([['/', 'Главная'], [null, 'Наследие']])}
<div class="wrap page-head">
  <h1>Наследие</h1>
  <p>Пять разрезов одной темы: что произошло в декабре 1925 года, что осталось в музеях и на карте, как стихи стали песнями и фильмами и как они звучат на других языках.</p>
</div>
<div class="wrap" style="padding-bottom:30px">
  <div class="tiles">
    ${legacyCards.map(([href, art, t, c]) => `<a class="tile" href="${href}" style="--tile-art:url('/img/tiles/${art}.svg')"><span class="tile-title">${esc(t)}</span><span class="tile-count">${esc(c)}</span></a>`).join('')}
  </div>
</div>
<div class="wrap" style="padding-bottom:50px">
  <div class="note"><b>Границы раздела.</b> Здесь только то, что можно проверить: даты, адреса, названия, авторы. Оценки и спорные сюжеты вынесены в <a href="/versions.html">«Версии»</a>, а исследовательская литература — в <a href="/research/">«Науку»</a>.</div>
</div>`,
    { active: 'legacy', breadcrumb: [['/', 'Главная'], ['/legacy/', 'Наследие']] });
  search.push({ t: 'Наследие', u: '/legacy/', g: 'Раздел', k: 'Память', s: 'Гибель, музеи, музыка, кино, переводы' });

  page('legacy/gibel.html', 'Гибель Есенина: обстоятельства и версии',
    'Как умер Сергей Есенин: хроника декабря 1925 года, официальная версия, документы и аргументы сторонников версии убийства.',
    `${crumbs([['/', 'Главная'], ['/legacy/', 'Наследие'], [null, 'Гибель поэта']])}
<div class="wrap article-layout">
  <article>
    <h1 style="font-size:clamp(30px,4.6vw,44px);margin-bottom:12px">Гибель поэта</h1>
    <div class="meta-line"><span class="badge">1925</span><span>Ленинград</span><span>Обновлено ${esc(UPDATED_LABEL)}</span></div>
    <p style="font-family:var(--serif);font-size:19px;color:var(--ink-soft);max-width:64ch">${esc(death.lead)}</p>
    <dl class="fact-list" style="margin:20px 0 26px">
      ${(death.facts || []).map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}
    </dl>
    ${(death.blocks || []).slice(0, 4).map((b) => `<h2>${esc(b.h)}</h2><p>${esc(b.p)}</p>`).join('')}
    <h2>Хроника</h2>
    <ul class="timeline-mini" style="background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 22px">
      ${(death.timeline || []).map((e) => `<li><span class="year">${esc(e.date)}</span><span class="what">${esc(e.text)}</span></li>`).join('')}
    </ul>
    ${(death.blocks || []).slice(4).map((b) => `<h2>${esc(b.h)}</h2><p>${esc(b.p)}</p>`).join('')}
    <div class="source-box"><b>${esc(death.note)}</b> Аргументы сторон и библиография — в разделах <a href="/versions.html">«Версии»</a> и <a href="/research/">«Наука»</a>.</div>
  </article>
  <aside>
    <div class="aside-card">
      <h4>По теме</h4>
      <ul>
        <li><a href="/versions.html">Версии и спорные вопросы</a></li>
        <li><a href="/people/">Люди вокруг поэта</a></li>
        <li><a href="/places/peterburg.html">Петербург</a></li>
        <li><a href="/research/">Научные работы</a></li>
        <li><a href="/faq.html">Частые вопросы</a></li>
      </ul>
    </div>
  </aside>
</div>`,
    { active: 'legacy', breadcrumb: [['/', 'Главная'], ['/legacy/', 'Наследие'], ['/legacy/gibel.html', 'Гибель поэта']], jsonLd: {
      '@type': 'Article', headline: 'Гибель Есенина: обстоятельства и версии', inLanguage: LANG,
      about: { '@id': `${SITE}/#person` }, dateModified: UPDATED,
      url: `${SITE}/legacy/gibel.html`,
    } });
  search.push({ t: 'Гибель поэта', u: '/legacy/gibel.html', g: 'Наследие', k: '1925, Ленинград', s: 'Обстоятельства, документы, версии' });

  page('legacy/memory.html', 'Музеи и памятники Есенину',
    'Музеи Есенина в Константинове и Москве, Спас-Клепики, памятник на Тверском бульваре и могила на Ваганьковском: адреса памяти поэта.',
    `${crumbs([['/', 'Главная'], ['/legacy/', 'Наследие'], [null, 'Музеи и памятники']])}
<div class="wrap page-head">
  <h1>Музеи и памятники</h1>
  <p>Четыре музея и три адреса памяти. Это не путеводитель: часы работы меняются, а экспозиции обновляются — здесь важно, что именно хранится и почему это место имеет значение.</p>
</div>
<div class="wrap" style="padding-bottom:40px">
  <h2 style="font-size:26px;margin-bottom:14px">Музеи</h2>
  ${museums.map((m) => `<div class="panel" style="margin-bottom:14px">
    <div class="meta-line"><span class="badge">${esc(m.place)}</span>${m.founded ? `<span>${esc(m.founded)}</span>` : ''}</div>
    <h3 style="font-size:22px">${esc(m.name)}</h3>
    ${m.address ? `<p style="font-size:13px;color:var(--muted);margin:0 0 8px">${esc(m.address)}</p>` : ''}
    <p style="color:var(--ink-soft);max-width:72ch">${esc(m.about)}</p>
    <div class="tag-row">${(m.what || []).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
    ${m.note ? `<p style="font-size:13px;color:var(--muted);margin:10px 0 0">${esc(m.note)}</p>` : ''}
  </div>`).join('')}
  <h2 style="font-size:26px;margin:34px 0 14px">Памятники и могила</h2>
  ${monuments.map((m) => `<div class="panel" style="margin-bottom:14px">
    <div class="meta-line"><span class="badge">${esc(m.place)}</span>${m.year ? `<span>${esc(m.year)}</span>` : ''}</div>
    <h3 style="font-size:22px">${esc(m.name)}</h3>
    <p style="color:var(--ink-soft);max-width:72ch">${esc(m.about)}</p>
    ${m.note ? `<p style="font-size:13px;color:var(--muted);margin:0">${esc(m.note)}</p>` : ''}
  </div>`).join('')}
  <div class="prose" style="margin-top:30px">
    <h2>Как память становится инфраструктурой</h2>
    <p>Есенинские места работают не по отдельности, а как сеть: музей-заповедник в Константинове связан со школой в Спас-Клепиках, московский музей — с домом, где поэт жил до революции, а памятники и могила замыкают маршрут на двух кладбищах и бульварах. Для читателя это удобно: биография перестаёт быть текстом и становится картой.</p>
    <p>Отдельная часть памяти — имена. Улицы, библиотеки, школы и премии названы в честь поэта; в разных городах проходят есенинские чтения и конференции. Мы не пытаемся перечислить их все: списки быстро устаревают, а принцип важнее перечня.</p>
  </div>
  <div class="note" style="margin-top:22px">Адреса, режим работы и стоимость билетов уточняйте на официальных сайтах музеев. Если вы заметили неточность — напишите, указав источник; правка будет внесена после проверки.</div>
</div>`,
    { active: 'legacy', breadcrumb: [['/', 'Главная'], ['/legacy/', 'Наследие'], ['/legacy/memory.html', 'Музеи и памятники']], jsonLd: [
      { '@type': 'ItemList', name: 'Музеи Есенина', numberOfItems: museums.length, itemListElement: museums.map((m, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Museum', name: m.name, address: m.address, url: `${SITE}/legacy/memory.html` } })) },
    ] });
  search.push({ t: 'Музеи и памятники', u: '/legacy/memory.html', g: 'Наследие', k: 'Адреса памяти', s: 'Константиново, Москва, Спас-Клепики' });

  page('legacy/music.html', 'Есенин в музыке: песни, романсы, Свиридов',
    'Песни и романсы на стихи Есенина, «Поэма памяти Сергея Есенина» Свиридова: что стало музыкой, кто и как исполняет, что теряется при переложении.',
    `${crumbs([['/', 'Главная'], ['/legacy/', 'Наследие'], [null, 'Есенин в музыке']])}
<div class="wrap article-layout">
  <article>
    <h1 style="font-size:clamp(30px,4.6vw,44px);margin-bottom:12px">Есенин в музыке</h1>
    <div class="meta-line"><span class="badge">музыка</span><span>${(music.items || []).length} ориентиров</span><span>Обновлено ${esc(UPDATED_LABEL)}</span></div>
    <div class="prose">${(music.intro || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    <div class="research-list" style="margin-top:26px">
      ${(music.items || []).map((m) => `<article class="research-item">
        <div class="research-year">${esc(m.year || '')}</div>
        <div>
          <h3>${esc(m.title)}</h3>
          <div class="authors">${esc(m.kind || '')}${m.work ? ` · стихи: «${esc(m.work)}»` : ''}</div>
          <p class="annotation">${esc(m.note)}</p>
          ${m.work && findWork(m.work) ? `<p style="margin:8px 0 0"><a href="${workUrl(findWork(m.work))}">Читать текст →</a></p>` : ''}
        </div>
      </article>`).join('')}
    </div>
    <div class="source-box"><b>Осторожно с атрибуцией.</b> ${esc(music.note || '')}</div>
  </article>
  <aside>
    <div class="aside-card">
      <h4>Связанное</h4>
      <ul>
        <li><a href="/legacy/cinema.html">Есенин на экране</a></li>
        <li><a href="/legacy/translations.html">Переводы</a></li>
        <li><a href="/biography/">Биография</a></li>
        <li><a href="/books/">Книги и аудиокниги</a></li>
        <li><a href="/works/">Библиотека текстов</a></li>
      </ul>
    </div>
  </aside>
</div>`,
    { active: 'legacy', breadcrumb: [['/', 'Главная'], ['/legacy/', 'Наследие'], ['/legacy/music.html', 'Есенин в музыке']], jsonLd: {
      '@type': 'Article', headline: 'Есенин в музыке', inLanguage: LANG, dateModified: UPDATED,
      about: { '@id': `${SITE}/#person` },
    } });
  search.push({ t: 'Есенин в музыке', u: '/legacy/music.html', g: 'Наследие', k: 'Песни и романсы', s: 'Свиридов, романсы, песни на стихи' });

  page('legacy/cinema.html', 'Есенин на экране: фильмы и сериалы',
    'Экранизации и фильмы о Есенине: «Пой песню, поэт…», сериал «Есенин» 2005 года, документальное кино. Что удалось и что теряется при переносе стихов на экран.',
    `${crumbs([['/', 'Главная'], ['/legacy/', 'Наследие'], [null, 'Есенин на экране']])}
<div class="wrap article-layout">
  <article>
    <h1 style="font-size:clamp(30px,4.6vw,44px);margin-bottom:12px">Есенин на экране</h1>
    <div class="meta-line"><span class="badge">кино</span><span>${(films.items || []).length} работы</span><span>Обновлено ${esc(UPDATED_LABEL)}</span></div>
    <div class="prose">${(films.intro || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    <div class="research-list" style="margin-top:26px">
      ${(films.items || []).map((f) => `<article class="research-item">
        <div class="research-year">${esc(f.year || '')}</div>
        <div>
          <h3>${esc(f.title)}</h3>
          <div class="authors">${esc(f.kind || '')}${f.authors ? ' · ' + esc(f.authors) : ''}</div>
          <p class="annotation">${esc(f.note)}</p>
        </div>
      </article>`).join('')}
    </div>
    <div class="source-box"><b>Неполная фильмография.</b> ${esc(films.note || '')}</div>
  </article>
  <aside>
    <div class="aside-card">
      <h4>Связанное</h4>
      <ul>
        <li><a href="/legacy/music.html">Есенин в музыке</a></li>
        ${findWork('Анна Снегина') ? `<li><a href="${workUrl(findWork('Анна Снегина'))}">«Анна Снегина»</a></li>` : ''}
        <li><a href="/people/">Прототипы и современники</a></li>
        <li><a href="/books/">Книги</a></li>
      </ul>
    </div>
  </aside>
</div>`,
    { active: 'legacy', breadcrumb: [['/', 'Главная'], ['/legacy/', 'Наследие'], ['/legacy/cinema.html', 'Есенин на экране']], jsonLd: {
      '@type': 'Article', headline: 'Есенин на экране', inLanguage: LANG, dateModified: UPDATED,
    } });
  search.push({ t: 'Есенин на экране', u: '/legacy/cinema.html', g: 'Наследие', k: 'Кино', s: 'Фильмы и сериалы о поэте' });

  page('legacy/translations.html', 'Есенин в переводах',
    'На какие языки переведён Есенин и почему его трудно переводить: диалектизмы, церковнославянизмы, ритм. Три стратегии перевода и что теряется.',
    `${crumbs([['/', 'Главная'], ['/legacy/', 'Наследие'], [null, 'Переводы']])}
<div class="wrap article-layout">
  <article>
    <h1 style="font-size:clamp(30px,4.6vw,44px);margin-bottom:12px">Есенин в переводах</h1>
    <div class="meta-line"><span class="badge">переводы</span><span>${(languages.languages || []).length} языков в списке</span><span>Обновлено ${esc(UPDATED_LABEL)}</span></div>
    <div class="prose">${(languages.intro || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    ${(languages.blocks || []).map((b) => `<h2>${esc(b.h)}</h2><p>${esc(b.p)}</p>`).join('')}
    <h2>Языки</h2>
    <div class="lang-grid">${(languages.languages || []).map((l) => `<span class="tag">${esc(l)}</span>`).join('')}</div>
    <div class="source-box"><b>О списке.</b> ${esc(languages.note || '')}</div>
  </article>
  <aside>
    <div class="aside-card">
      <h4>Связанное</h4>
      <ul>
        <li><a href="/research/">Научные работы</a></li>
        <li><a href="/legacy/music.html">Есенин в музыке</a></li>
        <li><a href="/glossary.html">Словарь к стихам</a></li>
        <li><a href="/faq.html">Частые вопросы</a></li>
      </ul>
    </div>
  </aside>
</div>`,
    { active: 'legacy', breadcrumb: [['/', 'Главная'], ['/legacy/', 'Наследие'], ['/legacy/translations.html', 'Переводы']], jsonLd: {
      '@type': 'Article', headline: 'Есенин в переводах', inLanguage: LANG, dateModified: UPDATED,
    } });
  search.push({ t: 'Есенин в переводах', u: '/legacy/translations.html', g: 'Наследие', k: 'Переводы', s: 'Языки, стратегии, потери' });

  // ---------- словарь ----------

  const exampleFor = (entry) => {
    const forms = [entry.w, ...(entry.forms || [])].map(norm);
    const alt = forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`(^|[^а-яё])(?:${alt})($|[^а-яё])`, 'i');
    for (const w of works) {
      for (const line of String(w.text || '').split('\n')) {
        if (re.test(norm(line)) && line.trim().length > 3 && !line.trim().startsWith('*')) {
          return { line: line.trim(), work: w, title: false };
        }
      }
    }
    const byTitle = works.find((w) => norm(w.title).includes(norm(entry.w)));
    return byTitle ? { line: '', work: byTitle, title: true } : null;
  };
  let wordTotal = 0;

  page('glossary.html', 'Словарь к стихам Есенина',
    'Диалектные и церковнославянские слова в стихах Есенина: пожня, околица, сень, сорокоуст — значения и примеры из текстов.',
    `${crumbs([['/', 'Главная'], [null, 'Словарь']])}
<div class="wrap article-layout">
  <article>
    <h1 style="font-size:clamp(30px,4.6vw,44px);margin-bottom:12px">Словарь к стихам</h1>
    <div class="meta-line"><span class="badge">лексика</span><span>${(glossary.groups || []).reduce((s, g) => s + (g.words || []).length, 0)} слов</span><span>Обновлено ${esc(UPDATED_LABEL)}</span></div>
    <div class="prose">${(glossary.intro || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    ${(glossary.groups || []).map((g) => `<section style="margin-top:34px">
      <h2>${esc(g.title)}</h2>
      <p>${esc(g.about)}</p>
      <div class="glossary">
        ${(g.words || []).map((x) => {
          const ex = exampleFor(x);
          if (ex) wordTotal++;
          return `<div class="glossary-item" id="w-${encodeURIComponent(x.w)}">
            <b>${esc(x.w)}</b> — ${esc(x.m)}
            ${ex && ex.line ? `<span class="glossary-ex">${esc(ex.line)}</span><a class="glossary-src" href="${workUrl(ex.work)}">${esc(ex.work.title)} →</a>` : ''}
            ${ex && ex.title ? `<span class="glossary-ex">Заглавие произведения</span><a class="glossary-src" href="${workUrl(ex.work)}">${esc(ex.work.title)} →</a>` : ''}
          </div>`;
        }).join('')}
      </div>
    </section>`).join('')}
    <div class="source-box"><b>Как пользоваться.</b> Значения даны по основному смыслу в контексте есенинских текстов; примеры взяты из произведений, размещённых на сайте.</div>
  </article>
  <aside>
    <div class="aside-card">
      <h4>По теме</h4>
      <ul>
        <li><a href="/works/">Библиотека текстов</a></li>
        <li><a href="/life/passions.html">Темы и интересы</a></li>
        <li><a href="/topics/">Подборки стихов</a></li>
        <li><a href="/faq.html">Частые вопросы</a></li>
      </ul>
    </div>
  </aside>
</div>`,
    { active: '', breadcrumb: [['/', 'Главная'], ['/glossary.html', 'Словарь']], jsonLd: {
      '@type': 'DefinedTermSet', name: 'Словарь к стихам Есенина', inLanguage: LANG,
      hasDefinedTerm: (glossary.groups || []).flatMap((g) => (g.words || []).slice(0, 12).map((x) => ({ '@type': 'DefinedTerm', name: x.w, description: x.m }))),
    } });
  search.push({ t: 'Словарь к стихам', u: '/glossary.html', g: 'Словарь', k: 'Лексика', s: 'Пожня, околица, сень, сорокоуст' });

  // ---------- частые вопросы ----------

  page('faq.html', 'Есенин: частые вопросы',
    'Ответы на частые вопросы о Есенине: когда родился, сколько было жён и детей, как умер, где музеи, можно ли читать стихи бесплатно.',
    `${crumbs([['/', 'Главная'], [null, 'Вопросы']])}
<div class="wrap page-head">
  <h1>Частые вопросы</h1>
  <p>Короткие ответы на то, что чаще всего ищут: даты, семья, образование, смерть, музеи и права на тексты. Без версий и оценок — они в отдельных разделах.</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  ${faq.map((f, i) => `<details class="version-card"${i === 0 ? ' open' : ''}>
    <summary>${esc(f.q)}<span class="status">${String(i + 1).padStart(2, '0')}</span></summary>
    <div class="version-body"><p style="margin:0;max-width:70ch">${esc(f.a)}</p></div>
  </details>`).join('')}
  <div class="note" style="margin-top:24px">Не нашли ответ? Смотрите <a href="/life/timeline.html">хронологию</a>, <a href="/people/">карточки людей</a> и <a href="/versions.html">разбор спорных вопросов</a>.</div>
</div>`,
    { active: '', breadcrumb: [['/', 'Главная'], ['/faq.html', 'Вопросы']], jsonLd: {
      '@type': 'FAQPage', inLanguage: LANG,
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    } });
  search.push({ t: 'Частые вопросы', u: '/faq.html', g: 'Раздел', k: 'FAQ', s: 'Даты, семья, смерть, музеи, права' });

  // ---------- алфавитный указатель ----------

  const azGroups = new Map();
  for (const w of works) {
    const first = norm(w.title).trim()[0] || '#';
    const key = /[а-я]/.test(first) ? first.toUpperCase() : '#';
    if (!azGroups.has(key)) azGroups.set(key, []);
    azGroups.get(key).push(w);
  }
  const azKeys = [...azGroups.keys()].sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b, 'ru')));

  page('works/az.html', 'Алфавитный указатель произведений Есенина',
    `Все произведения Есенина по алфавиту: ${works.length} названий с годами и ссылками на полные тексты. Удобно искать по первой букве.`,
    `${crumbs([['/', 'Главная'], ['/works/', 'Библиотека'], [null, 'Алфавитный указатель']])}
<div class="wrap page-head">
  <h1>Алфавитный указатель</h1>
  <p>${works.length} ${plural(works.length, ['произведение', 'произведения', 'произведений'])} по алфавиту. Если помните первую букву, но не название — начните отсюда.</p>
</div>
<div class="wrap" style="padding-bottom:50px">
  <div class="az-nav">${azKeys.map((k) => `<a class="chip" href="#az-${encodeURIComponent(k)}">${esc(k)}</a>`).join('')}</div>
  ${azKeys.map((k) => `<section id="az-${encodeURIComponent(k)}" style="margin-top:26px">
    <h2 style="font-size:24px;border-bottom:1px solid var(--line);padding-bottom:6px">${esc(k)}</h2>
    <ul class="az-list">
      ${azGroups.get(k).sort((a, b) => a.title.localeCompare(b.title, 'ru')).map((w) => `<li><a href="${workUrl(w)}">${esc(w.title)}</a>${w.year ? `<span class="tw-year">${w.year}</span>` : ''}</li>`).join('')}
    </ul>
  </section>`).join('')}
</div>`,
    { active: 'works', breadcrumb: [['/', 'Главная'], ['/works/', 'Библиотека'], ['/works/az.html', 'Алфавитный указатель']], jsonLd: {
      '@type': 'CollectionPage', name: 'Алфавитный указатель произведений Есенина', inLanguage: LANG,
    } });
  search.push({ t: 'Алфавитный указатель', u: '/works/az.html', g: 'Раздел', k: 'Библиотека', s: 'Все произведения по алфавиту' });

  // ---------- доп. страницы поиска ----------
  for (const p of places) search.push({ t: `${p.title} — место`, u: `/places/${p.id}.html`, g: 'Место', k: p.kicker, s: p.subtitle });

  return { pages, urls, search, workTopics, topics };
}
