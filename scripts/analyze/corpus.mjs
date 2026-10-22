#!/usr/bin/env node
// Корпусные расчёты по текстам автора (п. 5.1–5.3 плана сети: уровень T2 «Расчёт»).
//
// Считаем то, чего нет в открытом виде: частоты слов, распределение по годам,
// длину строки, лексическое разнообразие, сдвиг словаря между периодами.
// Результат — reports/corpus.json. Ничего не публикует: цифры нужно прочитать
// и проверить перед тем, как ставить их на страницу.
//
// Запуск: npm run analyze

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

// Служебные слова: без них частотный словарь показывает «и, в, не».
const STOP = new Set((
  'и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне ' +
  'было вот от меня еще нет о из ему теперь когда даже ну ли если уже или ни быть был него до вас ' +
  'нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их ' +
  'чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой ' +
  'совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при ' +
  'наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве ' +
  'три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда ' +
  'конечно всю между это как-то всё её нам тебе нас вас наш наша наше наши твой твоя твое твои ' +
  'свой своя свое свои лишь словно пусть эта этот эти тем той кою которое которые который которая ' +
  'будет буду будем будут если чтобы потому оттого ведь даже разве вдруг опять снова тоже также ' +
  'себе собой тобой мной нами вами ими ими оно его ей ею нас него нее них ему ей им кем чем ' +
  'тут там где когда пока лишь только-то было-то не-то'
).split(/\s+/));

const WORDS = /[а-яё]+/gi;

function tokens(text) {
  return (text.match(WORDS) || []).map((w) => w.toLowerCase().replace(/ё/g, 'е'));
}

function lines(text) {
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
}

// ---------- данные ----------

const works = JSON.parse(await readFile(join(ROOT, 'data', 'works.json'), 'utf8'));

// Поэзия и проза считаются отдельно: смешивать стихи со статьями и автобиографиями
// в частотных таблицах нельзя — разные регистры дают ложный «сдвиг словаря».
const POETRY = new Set(['Стихотворение', 'Поэма', 'Малая поэма']);
const WITH_ALL = process.argv.includes('--all');
const corpus = works.filter((w) => w.text && w.year && (WITH_ALL || POETRY.has(w.genre)));

// ---------- общие счётчики ----------

const allText = corpus.map((w) => w.text).join('\n');
const allTokens = tokens(allText);
const freq = new Map();
for (const t of allTokens) freq.set(t, (freq.get(t) || 0) + 1);

const isContent = (w) => !STOP.has(w) && w.length > 2;
const contentFreq = new Map([...freq].filter(([w]) => isContent(w)));
const sortedContent = [...contentFreq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const hapax = [...contentFreq].filter(([, n]) => n === 1).length;
const shortLines = corpus.flatMap((w) => lines(w.text));

// ---------- по годам ----------

const byYear = new Map();
for (const w of corpus) {
  if (!byYear.has(w.year)) byYear.set(w.year, { year: w.year, works: 0, tokens: 0, lines: 0, chars: 0, genres: {} });
  const y = byYear.get(w.year);
  y.works += 1;
  y.tokens += tokens(w.text).length;
  y.lines += lines(w.text).length;
  y.chars += (w.text || '').length;
  y.genres[w.genre] = (y.genres[w.genre] || 0) + 1;
}

const years = [...byYear.values()]
  .sort((a, b) => a.year - b.year)
  .map((y) => ({
    year: y.year,
    works: y.works,
    tokens: y.tokens,
    avgTokensPerWork: +(y.tokens / y.works).toFixed(1),
    avgCharsPerLine: +(y.chars / Math.max(1, y.lines)).toFixed(1),
    genres: y.genres,
  }));

// ---------- лексическое разнообразие ----------

function diversity(list) {
  const t = list.flatMap((w) => tokens(w.text));
  const unique = new Set(t).size;
  return { tokens: t.length, unique, ratio: +(unique / Math.max(1, t.length)).toFixed(3) };
}

const periods = [
  { id: '1910-1916', from: 1910, to: 1916, label: '1910–1916' },
  { id: '1917-1920', from: 1917, to: 1920, label: '1917–1920' },
  { id: '1921-1925', from: 1921, to: 1925, label: '1921–1925' },
].map((p) => {
  const list = corpus.filter((w) => w.year >= p.from && w.year <= p.to);
  const f = new Map();
  for (const w of list.flatMap((x) => tokens(x.text))) if (isContent(w)) f.set(w, (f.get(w) || 0) + 1);
  const top = [...f].sort((a, b) => b[1] - a[1]).slice(0, 25);
  return { ...p, works: list.length, ...diversity(list), top };
});

// Сдвиг словаря: слова, выросшие и упавшие между первым и последним периодом.
// Сравниваем не абсолютные частоты, а долю на 10 000 слов — иначе разница
// в объёме периодов выдаёт себя за смену словаря.
const norm = (list) => {
  const map = new Map();
  for (const w of list.flatMap((x) => tokens(x.text))) if (isContent(w)) map.set(w, (map.get(w) || 0) + 1);
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return { map, total };
};
const early = norm(corpus.filter((w) => w.year <= 1916));
const late = norm(corpus.filter((w) => w.year >= 1921));
const per10k = (map, total, w) => +(((map.get(w) || 0) / Math.max(1, total)) * 10000).toFixed(1);

const candidates = new Set([...early.map.keys(), ...late.map.keys()]);
const shift = [...candidates]
  .map((w) => ({
    word: w,
    early: per10k(early.map, early.total, w),
    late: per10k(late.map, late.total, w),
    count: (early.map.get(w) || 0) + (late.map.get(w) || 0),
  }))
  .filter((x) => x.count >= 8)
  .map((x) => ({ ...x, delta: +(x.late - x.early).toFixed(1) }));

const grew = shift.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 30);
const fell = shift.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 30);

// ---------- отдельные слова-маркеры ----------

const MARKERS = [
  'русь', 'россия', 'родина', 'деревня', 'город', 'любовь', 'смерть', 'тоска', 'печаль',
  'радость', 'бог', 'церковь', 'революция', 'вольница', 'степь', 'береза', 'клен', 'собака',
  'конь', 'луна', 'солнце', 'весна', 'осень', 'зима', 'лето', 'кабак', 'вино', 'песня',
];

const markers = MARKERS.map((m) => {
  const total = freq.get(m) || 0;
  const byY = years.map((y) => ({
    year: y.year,
    n: corpus
      .filter((w) => w.year === y.year)
      .flatMap((w) => tokens(w.text))
      .filter((t) => t === m).length,
  }));
  return { word: m, total, byYear: byY.filter((x) => x.n > 0) };
}).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);

// ---------- отчёт ----------

const report = {
  generatedAt: new Date().toISOString(),
  works: corpus.length,
  genres: corpus.reduce((acc, w) => ((acc[w.genre] = (acc[w.genre] || 0) + 1), acc), {}),
  yearsRange: [years[0].year, years[years.length - 1].year],
  totals: {
    tokens: allTokens.length,
    uniqueWords: new Set(allTokens).size,
    contentUnique: contentFreq.size,
    hapax,
    hapaxShare: +((hapax / contentFreq.size) * 100).toFixed(1),
    avgCharsPerLine: +(corpus.reduce((a, w) => a + (w.text || '').length, 0) / shortLines.length).toFixed(1),
    avgTokensPerWork: +(allTokens.length / corpus.length).toFixed(1),
  },
  top100: sortedContent.slice(0, 100),
  years,
  periods,
  grew,
  fell,
  markers,
};

await mkdir(join(ROOT, 'reports'), { recursive: true });
await writeFile(join(ROOT, 'reports', 'corpus.json'), JSON.stringify(report, null, 2), 'utf8');

// ---------- печать ----------

console.log(`Текстов: ${report.works} (${report.yearsRange.join('–')}), набор: ${WITH_ALL ? 'всё' : 'только поэзия'}`);
console.log(`Жанры в наборе: ${JSON.stringify(report.genres)}`);
console.log(`Словоупотреблений: ${report.totals.tokens}, разных словоформ: ${report.totals.uniqueWords}`);
console.log(`Знаменательных словоформ: ${report.totals.contentUnique}, из них однократных: ${hapax} (${report.totals.hapaxShare}%)`);
console.log(`Средняя строка: ${report.totals.avgCharsPerLine} зн., средний текст: ${report.totals.avgTokensPerWork} слов\n`);

console.log('Топ-20 слов:');
console.log('  ' + sortedContent.slice(0, 20).map(([w, n]) => `${w} ${n}`).join(', ') + '\n');

console.log('По периодам:');
for (const p of periods) {
  console.log(`  ${p.label}: ${p.works} текстов, ${p.tokens} слов, TTR ${p.ratio} — ${p.top.slice(0, 8).map(([w]) => w).join(', ')}`);
}

console.log('\nВыросло в 1921–1925 (на 10 000 слов):');
console.log('  ' + grew.slice(0, 12).map((x) => `${x.word} +${x.delta}`).join(', '));
console.log('Упало:');
console.log('  ' + fell.slice(0, 12).map((x) => `${x.word} ${x.delta}`).join(', '));

console.log('\nСлова-маркеры (всего вхождений / годы):');
for (const m of markers.slice(0, 14)) {
  const span = m.byYear.length ? `${m.byYear[0].year}–${m.byYear[m.byYear.length - 1].year}` : '—';
  console.log(`  ${m.word.padEnd(11)} ${String(m.total).padStart(4)}  ${span}`);
}

console.log('\nОтчёт: reports/corpus.json');
