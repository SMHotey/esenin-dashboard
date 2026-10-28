#!/usr/bin/env node
// Проверка текстов публикаций «филологом»: тон, объём, источники, цитаты.
//
// Смысл: роботные формулы и школьный регистр («как использовать на уроке»,
// «что важно знать к разбору») — признак текста, написанного для галочки.
// Скрипт ловит их до публикации, сверяет объём и наличие конкретных источников,
// а цитаты в кавычках-ёлочках проверяет по корпусу произведений библиотеки.
//
// Запуск: node scripts/text-audit.mjs          — только уже выпущенные (date <= сегодня)
//         node scripts/text-audit.mjs --all    — включая запланированные
//         node scripts/text-audit.mjs --strict — предупреждения считать ошибками

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PUB_DIR = join(ROOT, 'content', 'publications');
const STRICT = process.argv.includes('--strict');
const ALL = !process.argv.includes('--published');
const TODAY = new Date().toISOString().slice(0, 10);

// Формулы, которых в текстах быть не должно: обращение к учителю, обещания
// читателю, редакционные шаблоны. Каждая — с объяснением для правки.
const BANNED = [
  [/как использовать/i, 'инструкция «как использовать» — текст пишется о предмете, а не о применении'],
  [/что использовать/i, 'та же инструкция в другой формулировке'],
  [/на уроке/i, 'школьный регистр: читатель — не обязательно учитель'],
  [/для урока/i, 'школьный регистр'],
  [/готовите (сочинение|урок|экскурсию|доклад)/i, 'обращение к учителю/ученику'],
  [/ребята\b/i, 'разговор с классом'],
  [/вы узнаете/i, 'обещание читателю вместо сообщения'],
  [/в этой статье (мы )?(расскажем|разберём|поговорим)/i, 'редакционная заглушка'],
  [/факты сверены с академическими изданиями/i, 'общая фраза вместо перечня источников'],
  [/формулировки — наши/i, 'редакционная мантра'],
  [/по одной публикации в день/i, 'описание работы редакции вместо содержания'],
  [/что важно знать к разбору/i, 'пустой подзаголовок-рубрика'],
  [/что (важно|стоит) проверить к разбору/i, 'рубрика вместо разбора'],
  [/где читать дальше/i, 'навигационная заглушка вместо вывода'],
  [/практическая информация/i, 'канцелярский подзаголовок'],
  [/пригодится/i, 'обещание пользы'],
  [/в наше время/i, 'общее место'],
  [/не секрет, что/i, 'общее место'],
];

const norm = (s) => String(s)
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^а-яa-z0-9]+/g, ' ')
  .trim();

function frontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const meta = {};
  if (!m) return { meta, body: raw };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    meta[kv[1]] = v;
  }
  return { meta, body: raw.slice(m[0].length) };
}

const works = JSON.parse(await readFile(join(ROOT, 'data', 'works.json'), 'utf8'));
const extrasPath = join(ROOT, 'data', 'extra-works.json');
const extras = existsSync(extrasPath) ? JSON.parse(await readFile(extrasPath, 'utf8')) : [];
const corpus = norm([...works, ...extras].map((w) => w.text || '').join(' '));
const titles = new Set([...works, ...extras].map((w) => norm(w.title || '')).filter(Boolean));

const files = existsSync(PUB_DIR) ? (await readdir(PUB_DIR)).filter((f) => f.endsWith('.md')).sort() : [];
const errors = [];
const warnings = [];
const info = [];
const checked = [];

for (const f of files) {
  const raw = await readFile(join(PUB_DIR, f), 'utf8');
  const { meta, body } = frontmatter(raw);
  const date = String(meta.date || '');
  const isFuture = /^\d{4}-\d{2}-\d{2}$/.test(date) && date > TODAY;
  if (isFuture && !ALL) continue;

  const label = `${f}${isFuture ? ' (запланирована)' : ''}`;
  const plain = body.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // 1. Тон: роботные формулы и школьный регистр.
  for (const [re, why] of BANNED) {
    const m = plain.match(re);
    if (m) errors.push(`${label}: «${m[0]}» — ${why}`);
  }

  // 2. Объём. Короткий текст — обычно не разбор, а пересказ.
  const len = plain.replace(/\s+/g, ' ').trim().length;
  if (len < 4000) errors.push(`${label}: ${len} знаков — для разбора мало (минимум 4000)`);
  else if (len < 5000) warnings.push(`${label}: ${len} знаков — короче рабочей нормы 5000; проверь, всё ли сказано`);

  // 3. Анонс: конкретика, а не обещание.
  const excerpt = String(meta.excerpt || '');
  if (excerpt.length < 60) errors.push(`${label}: анонс короче 60 знаков — не объясняет, о чём текст`);
  if (excerpt.length > 240) warnings.push(`${label}: анонс ${excerpt.length} знаков — обрежется в карточке`);
  if (/узнаете|расскажем|поговорим|интересн/i.test(excerpt)) errors.push(`${label}: анонс обещает, а не сообщает`);

  // 4. Источники: нужен конкретный аппарат (том, страница, издание, архив).
  const src = String(meta.sources || '');
  const concrete = /ПСС|Полное собрание|т\.\s*\d|с\.\s*\d|№\s*\d|Пг\.|М\.|Л\.|журнал|газет|архив|издани|мемуар/i.test(src);
  if (!concrete) errors.push(`${label}: в sources нет конкретного источника (том, страница, издание)`);
  if (/сверены с академическими изданиями|по открытым сведениям|открытыми биографическими/i.test(src) && !/т\.\s*\d|с\.\s*\d|№\s*\d/.test(src)) {
    errors.push(`${label}: sources — общая формулировка без выходных данных`);
  }

  // 5. Цитаты в «ёлочках»: сверяем с корпусом произведений. Не найденная цитата —
  //    не обязательно ошибка (письма, мемуары), но требует проверки.
  const quotes = [...plain.matchAll(/«([^»]{10,200})»/g)].map((m) => m[1]);
  const missing = [];
  for (const q of quotes) {
    const nq = norm(q);
    if (!nq || nq.split(' ').length < 2) continue;
    if (corpus.includes(nq)) continue;
    if (titles.has(nq)) continue;
    if (/^(Город и деревня|Красная новь|Бакинский рабочий|Северные записки|Мирок|Проталинка|Голос жизни|Новый журнал для всех|Перевал|Англетер|Интернационал|Радуница|Мой путь|Радовцы|Анна Снегина|Чёрный человек|Корова|Молитва матери|Берёза)/.test(q)) continue;
    missing.push(q);
  }
  if (missing.length) {
    info.push(`${label}: не в корпусе библиотеки (проверить по источнику): ${missing.map((q) => `«${q}»`).join('; ')}`);
  }

  checked.push({ file: f, future: isFuture, chars: len });
}

const published = checked.filter((c) => !c.future).length;
console.log(`Проверено текстов: ${checked.length} (выпущено ${published}, запланировано ${checked.length - published})`);
if (warnings.length) {
  console.log(`\nПредупреждения (${warnings.length}):`);
  for (const w of warnings) console.log(`  · ${w}`);
}
if (info.length && process.argv.includes('--verbose')) {
  console.log(`\nК сверке (${info.length}) — цитаты, которых нет в корпусе библиотеки; это нормально для писем и мемуаров, но требует ссылки:`);
  for (const i of info) console.log(`  · ${i}`);
}
if (errors.length) {
  console.log(`\nОшибки (${errors.length}):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
}
if (STRICT && warnings.length) process.exit(1);
console.log('\nОшибок нет.');
