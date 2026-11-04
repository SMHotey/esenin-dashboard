// Режим книги — план 1, шаг S2.
//
// Постраничный вид собирается геометрией CSS-колонок (решение R6): текст не
// нарезается, страница — это колонка потока, а число страниц считается по
// scrollWidth потока. Библиотека листа, перелистывание и звук придут в S3-S4,
// клавиатура кроме Esc — в S5, печать — в S6, поэтому здесь нет ни библиотек,
// ни циклов перерисовки, ни обработчиков стрелок.
//
// Модуль загружается динамически: app.js импортирует его по клику
// «Режим книги», до этого запросов к /book/ нет (T5).
//
// Глобальных переменных нет — состояние только в замыкании модуля.

const VIEW_KEY = 'book.view.v1';
const PAGE_PREFIX = 'book.page.';
const PAGE_SUFFIX = '.v1';

// Автоопределение вида (§5 документа, вариант В2-A):
// окно меньше 700 px — принудительно одна страница (сохранённый выбор не
// затираем), иначе сохранённый выбор, а при первом заходе — разворот с 1024 px.
const MIN_WINDOW = 700;
const MIN_SPREAD = 1024;
// Шаг страницы: в развороте перелистываем сразу пару.
const STEP = { single: 1, spread: 2 };

// Состояние монтированной книги. pageCount = 0 означает «ещё не измерено» —
// в этом случае close() не трогает сохранённую позицию чтения.
let state = null;
// Промис подключения book.css: второй <link> в head не появляется.
let cssPromise = null;

function pageKey(slug) {
  return PAGE_PREFIX + slug + PAGE_SUFFIX;
}

function slugFromPath() {
  const path = decodeURIComponent(location.pathname);
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last.replace(/\.html$/, '');
}

function fail(what, err) {
  // console.warn — единственное, что разрешено конституцией (п.7): читатель
  // остаётся на обычном тексте, пустого экрана не бывает.
  console.warn('Режим книги: ' + what, err);
}

// Вид: сохранённый выбор главнее автоопределения, но окно меньше 700 px
// всегда показывает одну страницу — разворот туда просто не влезает.
function viewFor(width) {
  if (width < MIN_WINDOW) return 'single';
  const saved = localStorage.getItem(VIEW_KEY);
  if (saved === 'single' || saved === 'spread') return saved;
  return width >= MIN_SPREAD ? 'spread' : 'single';
}

// Позиция чтения — доля, а не номер страницы: при другой ширине окна и другом
// числе страниц читатель возвращается на то же место текста (R6).
function savedFrac(slug) {
  const value = Number(localStorage.getItem(pageKey(slug)));
  return Number.isFinite(value) && value >= 0 && value < 1 ? value : 0;
}

// Книжный CSS подключается один раз, из этого модуля (§4 документа): ссылка
// в <head> общей сборки привезла бы 5 КБ стилей на каждую страницу сайта.
function ensureCss() {
  if (cssPromise) return cssPromise;
  const version = document.documentElement.dataset.v || '';
  cssPromise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/book/book.css?v=' + version;
    link.onload = () => resolve(true);
    // Без CSS книга не сломается: геометрия колонок просто не измерится,
    // open() уйдёт в откат и оставит обычный текст.
    link.onerror = () => resolve(false);
    document.head.appendChild(link);
  });
  return cssPromise;
}

// Геометрия страницы берётся из вычисленных стилей потока, а не из констант:
// если стили ещё не подключились, ширина колонки вернётся «auto» и измерение
// упадёт с понятной ошибкой вместо тихо неверного числа страниц.
function measure() {
  const flow = state.flow;
  const pageW = parseFloat(getComputedStyle(flow).columnWidth);
  const gap = parseFloat(getComputedStyle(flow).columnGap);
  if (!Number.isFinite(pageW) || pageW <= 0 || !Number.isFinite(gap) || gap < 0) {
    throw new Error('не удалось измерить колонки потока (стили книги не подключены?)');
  }
  state.pageW = pageW;
  state.gap = gap;
  state.pageCount = Math.max(1, Math.round(flow.scrollWidth / (pageW + gap)));
}

// Видимая страница: поток сдвигается на номер страницы, счётчик и кнопки
// навигации догоняют состояние.
function render() {
  const s = state;
  s.flow.style.transform = 'translateX(' + (-s.page * (s.pageW + s.gap)) + 'px)';
  s.counter.textContent = (s.page + 1) + ' из ' + s.pageCount;
  s.prev.disabled = s.page <= 0;
  s.next.disabled = s.page >= s.pageCount - 1;
}

// Перелистывание: страница двигается на шаг (1 или 2), позиция пишется в
// localStorage долей, чтобы пережить смену вида и пересчёт при ресайзе.
function turn(delta) {
  if (!state) return;
  const step = STEP[state.view] || STEP.single;
  state.page = Math.max(0, Math.min(state.pageCount - 1, state.page + delta * step));
  render();
  localStorage.setItem(pageKey(state.slug), (state.page / state.pageCount).toFixed(4));
}

// Смена вида: ширина сцены меняется, поток переливается в другое число
// колонок — страницу восстанавливаем из сохранённой доли (T7.4).
function setView(view) {
  if (!state || (view !== 'single' && view !== 'spread')) return;
  try {
    const frac = state.pageCount > 0 ? state.page / state.pageCount : 0;
    state.view = view;
    state.section.setAttribute('data-book-view', view);
    state.btnSingle.setAttribute('aria-pressed', String(view === 'single'));
    state.btnSpread.setAttribute('aria-pressed', String(view === 'spread'));
    localStorage.setItem(VIEW_KEY, view);
    measure();
    state.page = Math.min(state.pageCount - 1, Math.floor(frac * state.pageCount));
    render();
  } catch (err) {
    fail('смена вида не удалась', err);
  }
}

function onKeydown(event) {
  // Esc закрывает книгу (§6 документа). Стрелки и клавиатура — в S5.
  if (event.key === 'Escape') close();
}

function onResize() {
  if (!state) return;
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    if (!state) return;
    try {
      // Книга переливается заново: новое число страниц, а место чтения — та же
      // доля текста. Без записи доли resize затёр бы позицию читателя.
      const frac = savedFrac(state.slug);
      measure();
      state.page = Math.min(state.pageCount - 1, Math.floor(frac * state.pageCount));
      render();
    } catch (err) {
      fail('пересчёт после ресайза не удался', err);
    }
  }, 200);
}

function buildSection(view) {
  const section = document.createElement('section');
  section.setAttribute('data-book', '');
  section.setAttribute('data-book-view', view);

  const bar = document.createElement('div');
  bar.className = 'book-tools';

  const exit = document.createElement('button');
  exit.type = 'button';
  exit.setAttribute('data-book-exit', '');
  exit.textContent = 'Обычный текст';

  const btnSingle = document.createElement('button');
  btnSingle.type = 'button';
  btnSingle.setAttribute('data-book-view-btn', 'single');
  btnSingle.setAttribute('aria-pressed', String(view === 'single'));
  btnSingle.textContent = 'Одна страница';

  const btnSpread = document.createElement('button');
  btnSpread.type = 'button';
  btnSpread.setAttribute('data-book-view-btn', 'spread');
  btnSpread.setAttribute('aria-pressed', String(view === 'spread'));
  btnSpread.textContent = 'Разворот';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.setAttribute('data-book-prev', '');
  prev.setAttribute('aria-label', 'Предыдущая страница');
  prev.textContent = '‹';

  const counter = document.createElement('span');
  counter.setAttribute('data-book-counter', '');
  counter.textContent = '1 из 1';

  const next = document.createElement('button');
  next.type = 'button';
  next.setAttribute('data-book-next', '');
  next.setAttribute('aria-label', 'Следующая страница');
  next.textContent = '›';

  bar.append(exit, btnSingle, btnSpread, prev, counter, next);

  const stage = document.createElement('div');
  stage.setAttribute('data-book-stage', '');

  const flow = document.createElement('div');
  flow.setAttribute('data-book-flow', '');
  // В поток идут клоны детей обёртки: оригинальный div.poem не удаляется и не
  // меняется, его текст остаётся в DOM и в ссылках на страницу (T7.1).
  const source = document.querySelector('div.poem[data-book-source]');
  if (!source) throw new Error('не найден div.poem[data-book-source]');
  for (const child of source.children) flow.appendChild(child.cloneNode(true));
  stage.appendChild(flow);
  section.append(bar, stage);

  exit.addEventListener('click', () => close());
  prev.addEventListener('click', () => turn(-1));
  next.addEventListener('click', () => turn(1));
  btnSingle.addEventListener('click', () => setView('single'));
  btnSpread.addEventListener('click', () => setView('spread'));

  return { section, stage, flow, counter, prev, next, btnSingle, btnSpread };
}

// Открытие книги. Функция асинхронная: сначала подключается book.css, иначе
// колонки измерялись бы до стилей и число страниц получалось бы неверным.
export async function open() {
  if (state) return true;
  const source = document.querySelector('div.poem[data-book-source]');
  if (!source) return false;
  try {
    await ensureCss();
    if (state) return true; // второй вызов, пока грузился CSS

    const slug = slugFromPath();
    const view = viewFor(window.innerWidth);
    const frac = savedFrac(slug);
    const parts = buildSection(view);

    source.after(parts.section);
    document.documentElement.setAttribute('data-book-open', '');
    state = { slug, view, page: 0, pageCount: 0, pageW: 480, gap: 60, timer: 0, ...parts };

    measure();
    state.page = Math.min(state.pageCount - 1, Math.floor(frac * state.pageCount));
    render();

    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize);

    // Верх секции (тулбар + сцена) — на 90 px ниже верха окна. Привязываемся
    // к секции, а не к сцене: шапка сайта липкая и занимает 73 px, при привязке
    // к верху сцены тулбар (43 px) уходил целиком под шапку — elementFromPoint
    // в центре кнопки отдавал ссылку шапки, и «Обычный текст» вёл на главную.
    // Требование R8 (закрыть кнопкой сразу после открытия) важнее буквы
    // «верх сцены на 90 px»; читатель по-прежнему видит верх страницы.
    const top = state.section.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo(0, Math.max(0, top));
    return true;
  } catch (err) {
    close();
    fail('не удалось открыть книгу', err);
    return false;
  }
}

// Закрытие: место чтения считывается ПОСЛЕ снятия data-book-open — только тогда
// div.poem снова виден и у него есть высота (T7.2).
export function close() {
  if (!state) return false;
  const { slug, page, pageCount, section, timer } = state;
  const frac = pageCount > 0 ? page / pageCount : 0;

  // Долю сохраняем до размонтирования; если книга не измерилась (pageCount 0),
  // сохранённую позицию читателя не затираем.
  if (pageCount > 0) localStorage.setItem(pageKey(slug), frac.toFixed(4));

  section.remove();
  document.documentElement.removeAttribute('data-book-open');
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', onResize);
  clearTimeout(timer);
  state = null;

  const source = document.querySelector('div.poem[data-book-source]');
  if (source) {
    const top = source.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, top + frac * source.offsetHeight - 90));
  }
  return true;
}
