// Режим книги — план 1, шаги S2-S3.
//
// S2: кнопка «Режим книги», ленивая загрузка модуля и стилей, сцена, тулбар,
//     ключи localStorage и доля места чтения.
// S3: настоящий лист с изгибом на вендоренном StPageFlip (UMD, window.St.PageFlip),
//     нарезка текста по Range на элементы .page, перелистывание мышью, пальцем и
//     кнопками, пересборка по resize, откат на обычный текст при отказе библиотеки.
// S4: звук листа — ленивый AudioContext, шумовой буфер 60 мс с полосовым
//     фильтром, напористость влево/вправо, порог 120 мс, prefers-reduced-motion,
//     кнопка «Звук» в тулбаре и персистентный ключ localStorage.
//
// Модуль загружается динамически: app.js импортирует его по клику «Режим книги»,
// до этого запросов к /book/ нет (T5 постановки S2).
//
// Глобальных переменных нет — состояние только в замыкании модуля.

const VIEW_KEY = 'book.view.v1';
const PAGE_PREFIX = 'book.page.';
const PAGE_SUFFIX = '.v1';

// S4: звук листа. SOUND_KEY — сохранённый выбор читателя (R6); параметры — §7
// документа и R5 постановки: «вперёд» громче и выше по полосе, «назад» тише на
// 40 %, один тик включения — один старт.
const SOUND_KEY = 'book.sound.v1';
const SOUND_MS = 60;            // буфер: 60 мс шума — длина одного переворота
const VOLUME = 0.18;            // громкость «вперёд»
const BACK_VOLUME = 0.108;      // «назад»: 0.18 × 0.6
const THROTTLE_MS = 120;        // порог подавления повтора (R5)
const FWD_BAND = [900, 2600];   // полоса пропускания «вперёд»
const BACK_BAND = [600, 1800];  // полоса «назад» — ниже (R2)

// Автоопределение вида (§5 документа, вариант В2-A):
// окно меньше 700 px — принудительно одна страница (сохранённый выбор не
// затираем), иначе сохранённый выбор, а при первом заходе — разворот с 1024 px.
const MIN_WINDOW = 700;
const MIN_SPREAD = 1024;

// Параметры листа (T4). Ширина совпадает с --book-page-w из book.css, высота
// снимается со сцены: CSS S2 задаёт ей clamp(480px, 70vh, 720px), а 700 px из
// прототипа на экране высотой 768 px не влезают и обрезали бы низ листа.
const PAGE_WIDTH_FALLBACK = 480;
const FLIP_MS = 700;          // T4: flippingTime; T7: prefers-reduced-motion → 1 мс
const SHADOW_OPACITY = 0.5;   // R9: тень при изгибе заметна, текст не «сереет»
const SWIPE_DISTANCE = 30;    // T4: значение по умолчанию, задано явно
const PAGE_CLASS = 'page';    // имя элемента страницы (T3)
const LIB_URL = '/book/stpageflip.js';

// Состояние монтированной книги. pageCount = 0 означает «ещё не измерилось» —
// в этом случае close() не трогает сохранённую позицию чтения.
let state = null;
// Промисы ленивой загрузки: второй вызов возвращает тот же промис.
let cssPromise = null;
let libPromise = null;
// Открытие идёт: повторный клик не поднимает вторую книгу.
let opening = null;
// S4: звук. Контекст и буфер ленивы — создаются на первом включении или первом
// листании (R6), в close() закрываются. audioBroken — «звук недоступен»:
// взводится один раз на открытие, глушит кнопку без повторного console.warn.
let audioCtx = null;
let noiseBuf = null;
let lastPlayedAt = 0;
let audioBroken = false;
let soundOn = false;
// Прогрев путей WebAudio уже сделан (см. warmAudio) — повторные касания
// книги не строят граф заново.
let graphWarmed = false;
// Направление следующего звука (R2): кнопка «‹/›» → знак смещения при
// перетаскивании → половина сцены под указателем (правая — вперёд) → вперёд.
// pendingDir ставят обработчики кнопок и гасят в turn().
let pendingDir = 0;
let dragStartX = 0;
let dragMoved = false;
let dragActive = false;
let dragDx = 0;
let pressRightHalf = true;

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
// числе страниц читатель возвращается на то же место текста (R6 постановки S2).
function savedFrac(slug) {
  const value = Number(localStorage.getItem(pageKey(slug)));
  return Number.isFinite(value) && value >= 0 && value < 1 ? value : 0;
}

// ---------- S4: звук листа ----------

// prefers-reduced-motion: у читателя с этим запросом анимация выключена — звук
// по умолчанию выключен, а переворот почти мгновенный (T7).
function prefersReduced() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Сохранённый выбор главнее настройки системы; отсутствие ключа — автоопределение
// (R6: по умолчанию звук включён, при prefers-reduced-motion — выключен без
// записи в localStorage).
function readSoundPref() {
  const value = localStorage.getItem(SOUND_KEY);
  if (value === 'on') return true;
  if (value === 'off') return false;
  return !prefersReduced();
}

function writeSoundPref(on) {
  localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
}

// Книжный CSS подключается один раз, из этого модуля (§4 документа): ссылка
// в <head> общей сборки привезла бы стили книги на каждую страницу сайта.
function ensureCss() {
  if (cssPromise) return cssPromise;
  const version = document.documentElement.dataset.v || '';
  cssPromise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/book/book.css?v=' + version;
    link.onload = () => resolve(true);
    // Без CSS геометрия листа не измерится: open() уйдёт в откат и оставит
    // обычный текст.
    link.onerror = () => resolve(false);
    document.head.appendChild(link);
  });
  return cssPromise;
}

// UMD-библиотека подключается один раз тем же приёмом, что и CSS (T2).
// Версия ассета обязательна: /book/* отдаётся с immutable на год, и без ?v=
// читатель до года получал бы старый файл из кэша.
function ensureLib() {
  if (libPromise) return libPromise;
  const version = document.documentElement.dataset.v || '';
  libPromise = new Promise((resolve) => {
    if (window.St && typeof window.St.PageFlip === 'function') {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = LIB_URL + '?v=' + version;
    script.async = true;
    script.onload = () => resolve(Boolean(window.St && typeof window.St.PageFlip === 'function'));
    script.onerror = () => {
      // Тег убираем: битый запрос не должен висеть в <head> после отката.
      script.remove();
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return libPromise;
}

// Аудиоконтекст создаётся только по жесту — включением звука или первым
// листанием (R6: ни при загрузке модуля, ни при открытии книги). Уже
// существующий поднимается из suspended — вкладка могла заснуть.
function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') resumeAudio(audioCtx);
    return audioCtx;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (typeof Ctor !== 'function') {
    settleAudioError(new Error('AudioContext недоступен в этом браузере'));
    return null;
  }
  try {
    audioCtx = new Ctor();
  } catch (err) {
    settleAudioError(err);
    return null;
  }
  if (audioCtx.state === 'suspended') resumeAudio(audioCtx);
  return audioCtx;
}

function resumeAudio(ctx) {
  const resumed = ctx.resume();
  if (resumed && typeof resumed.catch === 'function') {
    resumed.catch((err) => settleAudioError(err));
  }
}

// Один буфер на открытие: 60 мс белого шума (RMS ≈ 0.577 — слышно как короткий
// шелест листа). В close() буфер обнуляется вместе с контекстом.
function noiseBuffer(ctx) {
  if (noiseBuf) return noiseBuf;
  const len = Math.max(1, Math.round(ctx.sampleRate * (SOUND_MS / 1000)));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuf = buffer;
  return buffer;
}

// Отказ аудио (нет конструктора, new AudioContext бросил, resume() отклонился):
// один console.warn, кнопка гаснет, книга и её листание не трогаются.
function settleAudioError(err) {
  if (audioBroken) return;
  audioBroken = true;
  fail('звук недоступен', err);
  const btn = state && state.btnSound;
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-pressed', 'false');
    btn.title = 'Звук недоступен в этом браузере';
  }
}

// Прогрев аудиоконтекста на первом касании книги — жест читателя на тулбаре
// или сцене. Холодный new AudioContext меряется 50…1600 мс, а первые вызовы
// методов WebAudio на холодной службе звука — десятками миллисекунд каждый
// (замер стенда S4): без прогрева первый старт опаздывал на 100…1400 мс и
// экспонента успевала схлопнуться до самого старта (R1, G4.5, G4.3/R5).
// Поэтому здесь строится весь путь — буфер, фильтр, гейн, спад, соединения —
// но без start(): звука нет, пробного звука нет (R11), читатель ничего не
// слышит. При выключенном звуке и после отказа — ничего не создаётся; R6 не
// нарушен: ни при загрузке модуля, ни при открытии книги контекста нет (G4.1).
function warmAudio() {
  if (!soundOn || audioBroken || graphWarmed) return;
  try {
    const ctx = ensureAudio();
    if (!ctx) return;
    const freq = Math.sqrt(FWD_BAND[0] * FWD_BAND[1]);
    noiseBuffer(ctx);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = freq / (FWD_BAND[1] - FWD_BAND[0]);
    const gain = ctx.createGain();
    gain.gain.value = VOLUME;
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + SOUND_MS / 1000);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    graphWarmed = true;
  } catch (err) {
    // Сюда попадает и отказ ensureAudio (resume() синхронно бросает).
    settleAudioError(err);
  }
}

// Один старт на тик: шум 60 мс с экспоненциальным спадом за те же 60 мс,
// полосовой фильтр (целевая — геометрическая середина полосы,
// Q = f / (высокая − низкая)), «назад» тише на 40 % и ниже по полосе (R2),
// порог 120 мс между стартами (R5).
function playFlip(dir) {
  if (!soundOn || audioBroken || !state) return;
  const now = performance.now();
  if (now - lastPlayedAt < THROTTLE_MS) return;
  try {
    const ctx = ensureAudio();
    if (!ctx) return;
    const band = dir < 0 ? BACK_BAND : FWD_BAND;
    const freq = Math.sqrt(band[0] * band[1]);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = freq / (band[1] - band[0]);
    const gain = ctx.createGain();
    const volume = dir < 0 ? BACK_VOLUME : VOLUME;
    const begin = ctx.currentTime;
    gain.gain.value = volume;
    // Спад не до полной тишины, а до 0.0001: экспонента не щёлкает на нуле.
    gain.gain.exponentialRampToValueAtTime(0.0001, begin + SOUND_MS / 1000);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    lastPlayedAt = now;
  } catch (err) {
    settleAudioError(err);
  }
}

// Размер листа: ширина — из CSS книги, высота — фактическая высота сцены.
function pageSize(stage) {
  const fromCss = parseFloat(getComputedStyle(stage).getPropertyValue('--book-page-w'));
  const pageW = Math.floor(Number.isFinite(fromCss) && fromCss > 0 ? fromCss : PAGE_WIDTH_FALLBACK);
  const pageH = Math.floor(stage.clientHeight);
  if (!(pageW > 0) || !(pageH > 0)) {
    throw new Error('сцена книги не измерилась: ' + pageW + '×' + pageH + ' (стили книги не подключены?)');
  }
  return { pageW, pageH };
}

// Последняя позиция в хосте, которая ещё влезает в лист: границы округляются
// вниз по строкам (R5). Сравнение по нижней границе диапазона — двоичный поиск
// по символам текстового узла, а не по абзацам: абзац может быть длиннее листа.
function findCut(host, limit) {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  range.setStart(host, 0);
  let fits = null;   // последняя позиция, влезшая целиком
  let node = walker.nextNode();
  while (node) {
    const len = node.data.length;
    if (len > 0) {
      range.setEnd(node, len);
      if (range.getBoundingClientRect().bottom <= limit) {
        fits = { node, offset: len };
      } else {
        let lo = 0;
        let hi = len;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          range.setEnd(node, mid);
          if (range.getBoundingClientRect().bottom <= limit) lo = mid;
          else hi = mid - 1;
        }
        // lo === 0 — этот блок уже не влезает: режем перед ним.
        return lo > 0 ? { node, offset: lo } : fits;
      }
    }
    node = walker.nextNode();
  }
  return fits;
}

// Range.extractContents, дойдя до конца абзаца, оставляет в хосте пустой
// <p> — он даёт отступ и лишнюю пустую страницу в конце. Пустые абзацы текста
// не несут, поэтому их можно убирать, не трогая сумму текста.
function pruneEmpty(root) {
  for (const node of root.querySelectorAll('p')) {
    if (node.textContent === '') node.remove();
  }
}

// Нарезка текста на страницы через Range.extractContents (T3): текст не
// теряется и не дублируется, а частично выбранный блок (например div.book-verse)
// клонируется в обе страницы — стили блоков переживают разрез.
function paginate(host, boxH) {
  const pages = [];
  const padTop = parseFloat(getComputedStyle(host).paddingTop) || 0;
  while (host.firstChild) {
    const limit = host.getBoundingClientRect().top + padTop + boxH;
    const cut = findCut(host, limit);
    const range = document.createRange();
    range.setStart(host, 0);
    if (cut) {
      range.setEnd(cut.node, cut.offset);
    } else {
      // Ничего не влезло (огромный отступ или первая строка ниже листа) —
      // двигаем страницу хотя бы на один символ, иначе нарезка зациклится.
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      if (first && first.data.length > 1) range.setEnd(first, 1);
      else range.setEnd(host, 1);
    }
    const fragment = range.extractContents();
    pruneEmpty(fragment);
    pruneEmpty(host);
    // Пустой огрызок (остался только пустой абзац) страницей не считается,
    // но и ошибкой не является: содержимое хоста при этом уменьшилось.
    if (fragment.textContent.length === 0) continue;
    pages.push(fragment);
  }
  return pages;
}

// Снять книгу со сцены: destroy убирает обёртки библиотеки, сцена — листы и
// инлайновые min-/max-стили, которые библиотека вешает на свой корень.
function unmount() {
  const s = state;
  if (!s) return;
  if (s.flip) {
    try {
      s.flip.destroy();
    } catch (err) {
      fail('не удалось снять книгу со сцены', err);
    }
  }
  s.flip = null;
  s.pages = [];
  if (s.section) s.section.book = null;
  s.stage.replaceChildren();
}

// Счётчик, кнопки и состояние после перелистывания (R4, вопрос В2 — вариант A:
// в развороте номер выровнен по левой странице пары).
function sync() {
  const s = state;
  if (!s || !s.flip) return;
  const total = s.flip.getPageCount();
  const index = s.flip.getCurrentPageIndex();
  s.page = index;
  s.pageCount = total;
  s.counter.textContent = (Math.min(index, Math.max(total - 1, 0)) + 1) + ' из ' + total;
  const step = s.flip.getOrientation() === 'landscape' ? 2 : 1;
  s.prev.disabled = total <= 1 || index <= 0;
  s.next.disabled = total <= 1 || index >= total - step;
}

function savePosition() {
  const s = state;
  if (!s || !s.pageCount) return;
  localStorage.setItem(pageKey(s.slug), (s.page / s.pageCount).toFixed(4));
}

function onFlip() {
  sync();
  savePosition();
}

// Перелистывание кнопками «‹»/«›» — один лист за нажатие (R4).
function turn(delta) {
  const s = state;
  if (!s || !s.flip) return;
  try {
    if (delta < 0) s.flip.flipPrev();
    else s.flip.flipNext();
  } catch (err) {
    fail('перелистывание не удалось', err);
  }
  // Направление гасится здесь же: changeState приходит синхронно внутри
  // flipNext/flipPrev и уже забрало pendingDir; если лист не пошёл (граница,
  // идёт анимация) — хвост не должен направить чужой следующий звук.
  pendingDir = 0;
}

// Направление звука по приоритету R2: нажатие кнопки «‹/›» → половина сцены
// под указателем (правая — вперёд) → вперёд. Перетаскивание передаёт знак
// смещения само — его отпускание знает и dx, и факт переворота.
function nextDir() {
  if (pendingDir !== 0) {
    const dir = pendingDir;
    pendingDir = 0;
    return dir;
  }
  return pressRightHalf ? 1 : -1;
}

// Перевернётся ли лист, если отпустить сейчас: библиотека на отпускании
// переворачивает только при getPosition().x <= 0 (F4.11) — по этому признаку
// и решается звук, иначе лист возвращается на место молча.
function flipWillTurn() {
  const flip = state && state.flip;
  if (!flip) return false;
  try {
    const calc = flip.getFlipController().getCalculation();
    return Boolean(calc) && calc.getPosition().x <= 0;
  } catch (err) {
    return false;
  }
}

// S4: жест на сцене. pointerdown запоминает точку и половину сцены, pointermove
// (перехват, passive) — смещение больше 5 px. Движение и отпускание слушаются на
// window: библиотека завершает жест своим userStop там же, и отпускание за краем
// сцены — тоже переворот (F4.7, F4.11).
function onStagePointerDown(event) {
  dragActive = true;
  dragStartX = event.clientX;
  dragMoved = false;
  dragDx = 0;
  const rect = state.stage.getBoundingClientRect();
  pressRightHalf = event.clientX >= rect.left + rect.width / 2;
  // Прогрев графа — в том же жесте, который может потребовать звука (R6):
  // холодный new AudioContext стоит 150-250 мс, а до changeState остаются
  // десятки миллисекунд (см. warmAudio()).
  warmAudio();
}

function onStagePointerMove(event) {
  if (!dragActive) return;
  if (Math.abs(event.clientX - dragStartX) > 5) {
    dragMoved = true;
    dragDx = event.clientX - dragStartX;
  }
}

function onStagePointerUp() {
  if (!dragActive) return;
  dragActive = false;
  if (!dragMoved) return;
  dragMoved = false;
  // Звук — только по факту переворота: короткий жест лист возвращает на место.
  if (!flipWillTurn()) return;
  playFlip(dragDx < 0 ? 1 : -1);
}

// Пересборка книги: из копий блоков источника режется текст, листы монтируются
// в StPageFlip, место чтения ставится по доле frac (T6).
function mount(frac) {
  const s = state;
  const source = document.querySelector('div.poem[data-book-source]');
  if (!source) throw new Error('не найден div.poem[data-book-source]');
  unmount();

  const { pageW, pageH } = pageSize(s.stage);
  const flow = document.createElement('div');
  flow.setAttribute('data-book-flow', '');
  s.stage.replaceChildren(flow);

  // Мерный лист: тот же класс и те же паддинги, что у настоящих, поэтому
  // текст режется по его контентной коробке и не вылезает за поля.
  const host = document.createElement('div');
  host.className = PAGE_CLASS;
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;width:' + pageW + 'px;height:' + pageH + 'px';
  flow.appendChild(host);
  // Копируются ВСЕ дети .poem (включая текстовые узлы): сумма текста страниц
  // обязана совпасть с текстом источника символ в символ (R5).
  for (const node of source.childNodes) host.appendChild(node.cloneNode(true));

  const css = getComputedStyle(host);
  const padX = (parseFloat(css.paddingLeft) || 0) + (parseFloat(css.paddingRight) || 0);
  const padY = (parseFloat(css.paddingTop) || 0) + (parseFloat(css.paddingBottom) || 0);
  const boxW = host.clientWidth - padX;
  const boxH = host.clientHeight - padY;
  if (!(boxW > 40) || !(boxH > 40)) throw new Error('лист книги не измерился: ' + boxW + '×' + boxH);
  const fragments = paginate(host, boxH);
  host.remove();

  const pages = fragments.map((fragment, i) => {
    const page = document.createElement('div');
    page.className = PAGE_CLASS;
    page.setAttribute('data-book-page', String(i + 1));
    page.appendChild(fragment);
    return page;
  });
  if (!pages.length) throw new Error('нарезка не дала ни одной страницы');
  // Обложка и последний лист — твёрдые (R5).
  pages[0].setAttribute('data-density', 'hard');
  pages[pages.length - 1].setAttribute('data-density', 'hard');
  flow.append(...pages);

  // Корень библиотеки — книжный поток [data-book-flow], а не сама сцена: страницы
  // библиотека переносит в свой .stf__block внутрь корня, и тогда F9 остаётся
  // выполненным — атрибут data-book-flow по-прежнему носитель книги (S4-S6).
  // Геометрия потока равна сцене (100% × 100%), поэтому ориентацию по-прежнему
  // выбирает ширина сцены из CSS S2 (R3), а не ширина окна.
  const flip = new window.St.PageFlip(flow, {
    width: pageW,
    height: pageH,
    size: 'fixed',
    // autoSize: true библиотека понимает как «подогнать родителя под книгу»:
    // сцена сама становится шириной в разворот, и «одна страница» перестаёт
    // работать. Ширину сцены задаёт CSS S2 (R3), поэтому авторазмер выключен.
    autoSize: false,
    usePortrait: true,
    showCover: false,
    // T7: при prefers-reduced-motion — без тени и почти мгновенный переворот
    // (1 мс; ноль библиотека отвергает как Invalid flippingTime).
    drawShadow: !prefersReduced(),
    maxShadowOpacity: SHADOW_OPACITY,
    flippingTime: prefersReduced() ? 1 : FLIP_MS,
    useMouseEvents: true,
    clickEventForward: true,
    disableFlipByClick: false,
    mobileScrollSupport: true,
    swipeDistance: SWIPE_DISTANCE,
  });
  s.flip = flip;
  s.pages = pages;
  s.pageW = pageW;
  s.pageH = pageH;
  // Ссылка на экземпляр библиотеки: по ней headless-гейт S3 (G5) читает
  // getPageCount()/getCurrentPageIndex() и листает книгу, и ею же удобно
  // смотреть состояние из консоли. Разметку и место чтения она не меняет.
  s.section.book = flip;

  flip.on('flip', onFlip);
  // Звук листа: библиотека сообщает начало переворота событием changeState
  // (payload {data}), состояние «flipping» — единственный, который звучит;
  // направление даёт nextDir() по приоритету R2.
  flip.on('changeState', (event) => {
    if (event && event.data === 'flipping') playFlip(nextDir());
  });
  // Ориентацию выбирает библиотека по ширине сцены (R3): здесь только синхронизация.
  flip.on('changeOrientation', sync);
  // Доля из localStorage применяется при готовности книги, без анимации (T6).
  flip.on('init', () => {
    const total = flip.getPageCount();
    const target = Math.min(total - 1, Math.max(0, Math.floor(frac * total)));
    if (target > 0) flip.turnToPage(target);
    sync();
  });
  flip.loadFromHTML(pages);
  sync();
}

// Смена вида: ширина сцены берётся из CSS по data-book-view, ориентацию
// выбирает библиотека — поэтому книга пересобирается и ставится на ту же долю.
function setView(view) {
  const s = state;
  if (!s || (view !== 'single' && view !== 'spread') || s.view === view) return;
  const frac = s.pageCount > 0 ? s.page / s.pageCount : savedFrac(s.slug);
  try {
    s.view = view;
    s.section.setAttribute('data-book-view', view);
    s.btnSingle.setAttribute('aria-pressed', String(view === 'single'));
    s.btnSpread.setAttribute('aria-pressed', String(view === 'spread'));
    localStorage.setItem(VIEW_KEY, view);
    mount(frac);
  } catch (err) {
    fail('смена вида не удалась', err);
  }
}

function onKeydown(event) {
  // Esc закрывает книгу (§6 документа). Стрелки и остальная клавиатура — в S5.
  if (event.key === 'Escape') close();
}

function onResize() {
  if (!state) return;
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    if (!state) return;
    try {
      // Пересборка на ту же долю: без неё resize затёр бы место чтения.
      const frac = state.pageCount > 0 ? state.page / state.pageCount : savedFrac(state.slug);
      mount(frac);
    } catch (err) {
      fail('пересборка после ресайза не удалась', err);
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

  // Кнопка звука (T5): между «Разворот» и «‹», без формы, aria-pressed —
  // по текущему soundOn; если аудио уже отказалось, сразу disabled.
  const btnSound = document.createElement('button');
  btnSound.type = 'button';
  btnSound.setAttribute('data-book-sound', '');
  btnSound.textContent = 'Звук';
  btnSound.setAttribute('aria-pressed', String(soundOn));
  if (audioBroken) {
    btnSound.disabled = true;
    btnSound.title = 'Звук недоступен в этом браузере';
  }

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

  bar.append(exit, btnSingle, btnSpread, btnSound, prev, counter, next);

  const stage = document.createElement('div');
  stage.setAttribute('data-book-stage', '');

  section.append(bar, stage);

  exit.addEventListener('click', () => close());
  // Направление звука ставится до листания (R2, приоритет 1): changeState
  // приходит синхронно внутри turn().
  prev.addEventListener('click', () => {
    pendingDir = -1;
    turn(-1);
  });
  next.addEventListener('click', () => {
    pendingDir = 1;
    turn(1);
  });
  btnSingle.addEventListener('click', () => setView('single'));
  btnSpread.addEventListener('click', () => setView('spread'));
  // Переключатель звука (T5): выбор пишется сразу; включение — жест, в котором
  // создаётся контекст и прогревается граф, пробного звука нет (R6, R11).
  // Отказ аудио гасит кнопку.
  btnSound.addEventListener('click', () => {
    if (audioBroken) return;
    soundOn = !soundOn;
    writeSoundPref(soundOn);
    btnSound.setAttribute('aria-pressed', String(soundOn));
    warmAudio();
  });

  return { section, stage, counter, prev, next, btnSingle, btnSpread, btnSound };
}

async function openInternal() {
  const source = document.querySelector('div.poem[data-book-source]');
  if (!source) return false;
  try {
    await ensureCss();
    if (state) return true; // второй вызов, пока грузился CSS
    const lib = await ensureLib();
    if (state) return true;
    if (!lib) {
      // Откат T7: обычный текст остаётся, книжная сцена не рисуется.
      fail('библиотека StPageFlip не загрузилась — остаётся обычный текст');
      return false;
    }

    const slug = slugFromPath();
    const view = viewFor(window.innerWidth);
    const frac = savedFrac(slug);
    const parts = buildSection(view);

    source.after(parts.section);
    document.documentElement.setAttribute('data-book-open', '');
    state = { slug, view, page: 0, pageCount: 0, pageW: 0, pageH: 0, timer: 0, flip: null, pages: [], ...parts };
    mount(frac);

    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize);

    // S4: состояние звука — после mount, кнопка по ключу (T8). Жесты сцены —
    // перехват; движение и отпускание — на window (указатель уходит за край
    // сцены), снимаются в close(). Прогрев контекста — только в жестах, которые
    // требуют звука: сцена и «‹/›/Звук» (R6); клик по переключателю вида его
    // не создаёт.
    soundOn = readSoundPref();
    state.btnSound.setAttribute('aria-pressed', String(soundOn));
    if (audioBroken) state.btnSound.disabled = true;
    [state.prev, state.next, state.btnSound].forEach((btn) => {
      btn.addEventListener('pointerdown', warmAudio, true);
    });
    state.stage.addEventListener('pointerdown', onStagePointerDown, true);
    window.addEventListener('pointermove', onStagePointerMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onStagePointerUp, true);

    // Верх секции (тулбар + сцена) — на 90 px ниже верха окна. Привязываемся
    // к секции, а не к сцене: шапка сайта липкая и занимает 73 px, при привязке
    // к верху сцены тулбар уходил целиком под шапку — elementFromPoint в центре
    // кнопки отдавал ссылку шапки, и «Обычный текст» вёл на главную.
    const top = state.section.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo(0, Math.max(0, top));
    return true;
  } catch (err) {
    close();
    fail('не удалось открыть книгу', err);
    return false;
  }
}

// Открытие книги. Функция асинхронная: сначала подключаются book.css и
// библиотека, иначе лист мерился бы до стилей и число страниц было бы неверным.
export async function open() {
  if (state) return true;
  if (opening) return opening;
  opening = openInternal();
  try {
    return await opening;
  } finally {
    opening = null;
  }
}

// Закрытие: место чтения считывается ПОСЛЕ снятия data-book-open — только тогда
// div.poem снова виден и у него есть высота (T7.2 постановки S2).
export function close() {
  if (!state) return false;
  const { slug, page, pageCount, section, timer } = state;
  const frac = pageCount > 0 ? page / pageCount : 0;

  // Долю сохраняем до размонтирования; если книга не измерилась (pageCount 0),
  // сохранённую позицию читателя не затираем.
  if (pageCount > 0) localStorage.setItem(pageKey(slug), frac.toFixed(4));

  unmount();
  section.remove();
  document.documentElement.removeAttribute('data-book-open');
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', onResize);
  clearTimeout(timer);

  // S4: жесты сцены снять, аудио закрыть, состояния вернуть к умолчаниям —
  // следующее открытие прочитает ключ заново (T8). Кнопка «Звук» при этом
  // уже убрана вместе с секцией.
  state.stage.removeEventListener('pointerdown', onStagePointerDown, true);
  window.removeEventListener('pointermove', onStagePointerMove, { capture: true, passive: true });
  window.removeEventListener('pointerup', onStagePointerUp, true);
  if (audioCtx) {
    try {
      audioCtx.close();
    } catch (err) {
      fail('не удалось закрыть AudioContext', err);
    }
  }
  audioCtx = null;
  noiseBuf = null;
  lastPlayedAt = 0;
  audioBroken = false;
  soundOn = false;
  graphWarmed = false;
  pendingDir = 0;
  dragMoved = false;
  dragActive = false;
  dragDx = 0;
  pressRightHalf = true;
  state = null;

  const source = document.querySelector('div.poem[data-book-source]');
  if (source) {
    const top = source.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, top + frac * source.offsetHeight - 90));
  }
  return true;
}
