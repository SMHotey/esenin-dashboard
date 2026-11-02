#!/usr/bin/env node
// Состояние очереди журнала: сколько статей готово и на сколько дней вперёд.
//
// Правило редакции: одна публикация в день, и в запасе всегда должно быть готовых
// статей на две недели. Скрипт считает, что уже вышло, что ждёт своей даты,
// и показывает дыры в календаре — чтобы запас не кончился незаметно.
//
// Запуск: node scripts/queue-status.mjs [--json] [--min 14]

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { moscowToday } from './today.mjs';

const DIR = join('content', 'publications');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const minArg = args.indexOf('--min');
const MIN_BUFFER = minArg >= 0 ? Number(args[minArg + 1]) || 14 : 14;

const today = moscowToday();
const files = (await readdir(DIR)).filter((f) => f.endsWith('.md'));

const items = [];
for (const f of files) {
  const raw = await readFile(join(DIR, f), 'utf-8');
  const date = raw.match(/^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
  const title = raw.match(/^title:\s*"([^"]+)"/m)?.[1] || f;
  if (date) items.push({ date, title, file: f });
}
items.sort((a, b) => a.date.localeCompare(b.date));

const published = items.filter((i) => i.date <= today);
const scheduled = items.filter((i) => i.date > today);

// Дни недели: журнал выходит по будням, суббота и воскресенье не считаются.
const isWeekday = (iso) => {
  const d = new Date(iso + 'T12:00:00Z').getUTCDay();
  return d !== 0 && d !== 6;
};

// Дыры: будни между завтра и последней запланированной датой без статьи.
const gaps = [];
if (scheduled.length) {
  const last = scheduled[scheduled.length - 1].date;
  const have = new Set(scheduled.map((s) => s.date));
  const d = new Date(today + 'T12:00:00Z');
  for (let guard = 0; guard < 60; guard += 1) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (iso > last) break;
    if (isWeekday(iso) && !have.has(iso)) gaps.push(iso);
  }
}

// Дни буфера: сколько будних дней до последней готовой статьи включительно.
let bufferDays = 0;
if (scheduled.length) {
  const d = new Date(today + 'T12:00:00Z');
  const last = scheduled[scheduled.length - 1].date;
  while (d.toISOString().slice(0, 10) < last) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWeekday(d.toISOString().slice(0, 10))) bufferDays += 1;
  }
  bufferDays += 1;
}

const verdict = bufferDays >= MIN_BUFFER ? 'ok' : 'мало';
const report = {
  today,
  published: published.length,
  scheduled: scheduled.length,
  bufferDays,
  min: MIN_BUFFER,
  verdict,
  gaps,
  lastScheduled: scheduled.length ? scheduled[scheduled.length - 1].date : null,
  nextThree: scheduled.slice(0, 3).map((s) => `${s.date} — ${s.title}`),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 1));
} else {
  console.log(`Очередь журнала на ${today}`);
  console.log(`  вышло статей: ${published.length}`);
  console.log(`  в запасе: ${scheduled.length} (запас ${bufferDays} будних дней, нужно ${MIN_BUFFER})`);
  if (scheduled.length) {
    console.log('  ближайшие:');
    for (const s of scheduled.slice(0, 5)) console.log(`    ${s.date} — ${s.title}`);
  }
  if (gaps.length) {
    console.log(`  дыры в календаре (${gaps.length}): ${gaps.slice(0, 10).join(', ')}`);
  }
  console.log(verdict === 'ok'
    ? '  состояние: запас есть'
    : `  состояние: запас меньше двух недель — нужно написать ещё ${Math.max(0, MIN_BUFFER - bufferDays)} будних дней`);
}
