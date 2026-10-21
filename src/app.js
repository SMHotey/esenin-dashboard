(() => {
  const root = document.documentElement;
  const THEME_KEY = 'site-theme';

  function applyTheme(theme) {
    root.dataset.theme = theme;
    const btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀' : '☾';
      btn.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
      btn.setAttribute('title', btn.getAttribute('aria-label'));
    }
    // Цвет интерфейса браузера (адресная строка, полосы прокрутки) под текущую тему
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#141311' : '#f7f2e8');
  }

  // Тема по умолчанию — тёмная; светлая включается только выбором читателя.
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-theme-toggle]');
    if (t) {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    }
    const nav = e.target.closest('[data-nav-toggle]');
    if (nav) {
      const menu = document.querySelector('.main-nav');
      const open = menu?.classList.toggle('open');
      nav.setAttribute('aria-expanded', String(Boolean(open)));
    }
    if (e.target.closest('.main-nav a')) {
      document.querySelector('.main-nav')?.classList.remove('open');
      document.querySelector('[data-nav-toggle]')?.setAttribute('aria-expanded', 'false');
    }
  });

  // ---------- search ----------
  const dialog = document.querySelector('[data-search-dialog]');
  let searchData = null;
  let activeIndex = 0;
  let lastFocus = null;

  async function openSearch(query = '') {
    if (!dialog) return;
    lastFocus = document.activeElement;
    dialog.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
    const input = dialog.querySelector('input');
    input.value = query;
    input.focus();
    if (!searchData) {
      try {
        const res = await fetch(dialog.dataset.searchSrc || '/search.json');
        searchData = await res.json();
      } catch {
        searchData = [];
      }
    }
    renderResults(query);
  }

  function closeSearch() {
    if (!dialog?.hasAttribute('open')) return;
    dialog.removeAttribute('open');
    document.body.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function renderResults(query) {
    const box = dialog.querySelector('.search-results');
    if (!searchData) return;
    const q = query.trim().toLowerCase().replace(/ё/g, 'е');
    let items = searchData;
    if (q) {
      items = searchData
        .map((item) => {
          const hay = (item.t + ' ' + (item.k || '') + ' ' + (item.s || '')).toLowerCase().replace(/ё/g, 'е');
          const idx = hay.indexOf(q);
          return { item, score: idx === -1 ? -1 : (idx === 0 ? 100 : 50) - Math.min(idx, 40) };
        })
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)
        .map((x) => x.item);
    } else {
      items = searchData.slice(0, 8);
    }

    if (!items.length) {
      box.innerHTML = `<div class="search-empty">Ничего не найдено. Попробуйте другое слово или откройте <a href="/works/index.html">каталог</a>.</div>`;
      return;
    }
    activeIndex = 0;
    box.innerHTML = items.map((item, i) => `
      <a class="search-result${i === 0 ? ' active' : ''}" href="${item.u}">
        <div class="type">${item.g}</div>
        <div class="t">${item.t}</div>
        ${item.k ? `<div class="s">${item.k}</div>` : ''}
      </a>`).join('');
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-search-open]')) { e.preventDefault(); openSearch(); }
    if (e.target.closest('[data-search-close]')) closeSearch();
    if (e.target === dialog) closeSearch();
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-search-form]');
    if (!form) return;
    e.preventDefault();
    openSearch(form.querySelector('input')?.value || '');
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
    if (!dialog?.hasAttribute('open')) return;
    if (e.key === 'Escape') { closeSearch(); return; }

    if (e.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('input, button, a[href]')]
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }

    const results = [...dialog.querySelectorAll('.search-result')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === 'Enter' && results[activeIndex]) {
      window.location.href = results[activeIndex].href;
    }
    results.forEach((r, i) => r.classList.toggle('active', i === activeIndex));
  });

  if (dialog) {
    const input = dialog.querySelector('input');
    input.addEventListener('input', () => renderResults(input.value));
  }

  // ---------- catalog ----------
  const catalog = document.querySelector('[data-catalog]');
  if (catalog) {
    const cards = [...catalog.querySelectorAll('.catalog-card')];
    const input = document.querySelector('[data-catalog-search]');
    const genreChips = [...document.querySelectorAll('[data-filter-genre]')];
    const decade = document.querySelector('[data-filter-decade]');
    const sort = document.querySelector('[data-sort]');
    const countEl = document.querySelector('[data-result-count]');
    const grid = catalog;
    const more = document.querySelector('[data-load-more]');

    const state = { q: '', genre: 'all', decade: 'all', sort: 'year', shown: 60 };

    const params = new URLSearchParams(location.search);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('genre')) state.genre = params.get('genre');
    if (params.get('decade')) state.decade = params.get('decade');
    if (params.get('sort')) state.sort = params.get('sort');
    if (input) input.value = state.q;
    if (decade) decade.value = state.decade;
    if (sort) sort.value = state.sort;
    genreChips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filterGenre === state.genre)));

    function norm(s) { return s.toLowerCase().replace(/ё/g, 'е'); }

    function apply() {
      let list = cards.filter((card) => {
        const text = norm(card.dataset.title + ' ' + (card.dataset.first || '') + ' ' + (card.dataset.genre || ''));
        const qOk = !state.q || text.includes(norm(state.q));
        const gOk = state.genre === 'all' || card.dataset.genre === state.genre;
        const dOk = state.decade === 'all' || card.dataset.decade === state.decade;
        return qOk && gOk && dOk;
      });

      const by = {
        year: (a, b) => (+a.dataset.year || 9999) - (+b.dataset.year || 9999),
        'year-desc': (a, b) => (+b.dataset.year || 0) - (+a.dataset.year || 0),
        title: (a, b) => a.dataset.title.localeCompare(b.dataset.title, 'ru'),
        length: (a, b) => (+b.dataset.chars || 0) - (+a.dataset.chars || 0),
      }[state.sort];
      if (by) list.sort(by);

      cards.forEach((c) => c.classList.add('hidden'));
      grid.querySelectorAll('.empty').forEach((n) => n.remove());
      list.slice(0, state.shown).forEach((c) => { c.classList.remove('hidden'); grid.appendChild(c); });

      if (countEl) countEl.textContent = list.length;
      if (more) more.hidden = list.length <= state.shown;
      if (!list.length) {
        const div = document.createElement('div');
        div.className = 'empty';
        div.style.gridColumn = '1 / -1';
        div.innerHTML = 'Ничего не найдено. <button class="filter-chip" data-reset>Сбросить фильтры</button>';
        grid.appendChild(div);
      }

      const qp = new URLSearchParams();
      if (state.q) qp.set('q', state.q);
      if (state.genre !== 'all') qp.set('genre', state.genre);
      if (state.decade !== 'all') qp.set('decade', state.decade);
      if (state.sort !== 'year') qp.set('sort', state.sort);
      history.replaceState(null, '', qp.toString() ? '?' + qp : location.pathname);
    }

    input?.addEventListener('input', () => { state.q = input.value; state.shown = 60; apply(); });
    decade?.addEventListener('change', () => { state.decade = decade.value; state.shown = 60; apply(); });
    sort?.addEventListener('change', () => { state.sort = sort.value; state.shown = 60; apply(); });
    genreChips.forEach((chip) => chip.addEventListener('click', () => {
      state.genre = chip.dataset.filterGenre;
      genreChips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      state.shown = 60;
      apply();
    }));
    more?.addEventListener('click', () => { state.shown += 60; apply(); });
    catalog.addEventListener('click', (e) => {
      if (e.target.closest('[data-reset]')) {
        state.q = ''; state.genre = 'all'; state.decade = 'all'; state.shown = 60;
        if (input) input.value = '';
        if (decade) decade.value = 'all';
        genreChips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filterGenre === 'all')));
        apply();
      }
    });

    apply();
  }

  // ---------- poem tools ----------
  const poemPage = document.querySelector('.poem-page');
  if (poemPage) {
    const sizes = [17, 20, 23, 27];
    let sizeIndex = Number(localStorage.getItem('poem-size') || 1);
    poemPage.style.setProperty('--poem-size', sizes[sizeIndex] + 'px');

    document.addEventListener('click', (e) => {
      const act = e.target.closest('[data-poem-action]')?.dataset.poemAction;
      if (!act) return;
      if (act === 'bigger') {
        sizeIndex = Math.min(sizeIndex + 1, sizes.length - 1);
      } else if (act === 'smaller') {
        sizeIndex = Math.max(sizeIndex - 1, 0);
      } else if (act === 'reading') {
        poemPage.classList.toggle('reading');
      } else if (act === 'plain') {
        poemPage.classList.toggle('plain');
      } else if (act === 'print') {
        window.print();
      } else if (act === 'copy') {
        const text = poemPage.querySelector('.poem')?.innerText || '';
        const title = poemPage.querySelector('h1')?.innerText || '';
        navigator.clipboard?.writeText(`${title}\n\n${text}\n\nИсточник: ${location.href}`);
        e.target.textContent = 'Скопировано';
        setTimeout(() => { e.target.textContent = 'Копировать'; }, 1600);
      }
      poemPage.style.setProperty('--poem-size', sizes[sizeIndex] + 'px');
      localStorage.setItem('poem-size', String(sizeIndex));
    });
  }
})();
