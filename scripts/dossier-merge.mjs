#!/usr/bin/env node
// Слияние досье в data/dossiers.json с проверкой.
//
// Зачем: досье собираются пачками по 6-8 персон и приходят отдельными JSON-файлами.
// Скрипт валидирует их по тем же правилам, что и verify, и вливает в общий файл
// без ручного копирования (руками легко потерять запись или сломать JSON).
//
// Запуск:
//   node scripts/dossier-merge.mjs inbox/*.json
//   node scripts/dossier-merge.mjs --dir inbox
//   node scripts/dossier-merge.mjs inbox/*.json --dry   (только проверка)

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const dirIdx = args.indexOf('--dir');
let files = args.filter((a) => !a.startsWith('--') && (dirIdx < 0 || a !== args[dirIdx + 1]));

if (dirIdx >= 0) {
  const dir = args[dirIdx + 1];
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
  files = names.map((n) => join(dir, n));
}

if (!files.length) {
  console.log('Нечего сливать: укажите файлы или --dir <каталог>.');
  process.exit(1);
}

const readJson = async (p, fallback) => {
  if (!existsSync(p)) return fallback;
  const raw = (await readFile(p, 'utf8')).trim();
  return raw ? JSON.parse(raw) : fallback;
};

// Модели иногда оборачивают ответ в ```json ... ``` — снимаем обёртку.
const parseLoose = (raw) => {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1];
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start > 0 || end < s.length - 1) s = s.slice(start, end + 1);
  return JSON.parse(s);
};

const store = await readJson('data/dossiers.json', {});
const people = await readJson('data/people.json', []);
const ids = new Set(people.map((p) => p.id));
const isUrl = (u) => /^https?:\/\/[^\s]+\.[^\s]+/.test(String(u || ''));

const errors = [];
const added = [];
const replaced = [];

for (const file of files) {
  let d;
  try {
    d = parseLoose(await readFile(file, 'utf8'));
  } catch (e) {
    errors.push(`${file}: не разобрать JSON (${e.message.slice(0, 80)})`);
    continue;
  }
  const id = String(d.id || '').trim();
  if (!id) { errors.push(`${file}: нет поля id`); continue; }
  if (!ids.has(id)) { errors.push(`${file}: персоны «${id}» нет в data/people.json`); continue; }

  const facts = d.facts || [];
  const relations = d.relations || [];
  facts.forEach((f, i) => {
    if (!String(f.claim || '').trim()) errors.push(`${id}: факт ${i + 1} без текста`);
    if (!isUrl(f.source)) errors.push(`${id}: факт ${i + 1} без ссылки`);
  });
  relations.forEach((r, i) => {
    if (!String(r.date || '').trim() || !String(r.event || '').trim()) errors.push(`${id}: запись ${i + 1} без даты или события`);
    if (!isUrl(r.source)) errors.push(`${id}: запись ${i + 1} без ссылки`);
  });
  (d.sources || []).forEach((s) => { if (!isUrl(s.url)) errors.push(`${id}: источник «${s.label || '?'}» с битым адресом`); });
  if (facts.length < 4) errors.push(`${id}: мало фактов (${facts.length})`);
  if (!relations.length) errors.push(`${id}: нет хронологии`);

  const existed = Object.prototype.hasOwnProperty.call(store, id);
  store[id] = {
    facts,
    relations,
    unknown: d.unknown || [],
    sources: d.sources || [],
  };
  (existed ? replaced : added).push(id);
}

if (errors.length) {
  console.log('ОТКЛОНЕНО — исправьте и повторите:');
  for (const e of errors) console.log('  •', e);
  process.exit(1);
}

if (dry) {
  console.log(`Проверка пройдена: ${added.length + replaced.length} досье, файл не изменён.`);
  process.exit(0);
}

// Ключи по алфавиту — чтобы диффы были читаемыми.
const sorted = {};
for (const key of Object.keys(store).sort()) sorted[key] = store[key];
await writeFile('data/dossiers.json', JSON.stringify(sorted, null, 2) + '\n', 'utf8');

const total = Object.keys(sorted).length;
console.log(`Влито: ${added.length} новых${added.length ? ' (' + added.join(', ') + ')' : ''}${replaced.length ? `, заменено: ${replaced.length} (${replaced.join(', ')})` : ''}.`);
console.log(`Всего досье: ${total} из ${ids.size} персон.`);
