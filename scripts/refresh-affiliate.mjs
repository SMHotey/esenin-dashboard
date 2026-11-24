#!/usr/bin/env node
// Обновление и починка партнёрских ссылок: то, что можно исправить без кабинета,
// исправляется здесь; то, что нельзя, — попадает в отчёт как задача для кабинета.
//
// Что умеет:
//   • ЛитРес — перевыпускает ссылку через Cakelink API (ключ AdvCake в .secrets/advcake.key
//     или в ADVCAKE_API_KEY). Ссылка магазина живёт в utm/erid и не привязана к домену сайта,
//     поэтому обновление полностью автоматическое.
//   • Читай-город — проверяет каждую ссылку с редиректами: жива ли карточка, тот ли товар,
//     уцелели ли partnerId/erid. Если ссылка умерла, а карточка товара жива — берёт рабочую
//     ссылку из реестра data/affiliate-links.json (магазин выдаёт одну ссылку на товар).
//     Если реестра нет и карточка мертва — убирает товар из данных: мёртвую карточку не
//     чинят, её снимают с сайта.
//   • Реестр ссылок ведётся здесь же: каждая проверенная пара «товар → ссылка» сохраняется,
//     чтобы следующая починка не требовала кабинета.
//
// Запуск:
//   node scripts/refresh-affiliate.mjs            — только проверка и отчёт (ничего не пишет)
//   node scripts/refresh-affiliate.mjs --fix      — применить починку
//   node scripts/refresh-affiliate.mjs --store=litres --limit=5 --json
//
// Код возврата: 0 — всё в порядке или починено; 1 — остались нерешённые проблемы;
//               2 — проверка не выполнена (магазин закрылся от этой сети).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ARGS = process.argv.slice(2);
const FIX = ARGS.includes('--fix');
const JSON_ONLY = ARGS.includes('--json');
const STORE_FILTER = (ARGS.find((a) => a.startsWith('--store=')) || '').split('=')[1] || '';
const LIMIT = Number((ARGS.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const TIMEOUT_MS = 25000;
const RETRY_STATUS = new Set([403, 429, 451, 503]);
const RETRY_DELAY_MS = 3500;
const CHG_DELAY_MS = 1600; // «Читай-город» режет частые запросы: только последовательно
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const STORES = {
  'chitai-gorod': {
    label: 'Читай-город',
    hosts: ['www.chitai-gorod.ru', 'chitai-gorod.ru'],
    productPath: /\/(product|good)\//,
    markKeys: ['partnerId', 'erid'],
  },
  litres: {
    label: 'ЛитРес',
    hosts: ['www.litres.ru', 'litres.ru'],
    productPath: /\/(audiobook|book|podcast)\//,
    markKeys: ['utm_content', 'advcake_params', 'erid'],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(rel, fallback) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) return fallback;
  const raw = (await readFile(file, 'utf8')).trim();
  return raw ? JSON.parse(raw) : fallback;
}

async function writeJson(rel, data) {
  const file = join(ROOT, rel);
  // Формат данных в репозитории — отступ 1 пробел (так их пишет импорт).
  // Определяем отступ по самому файлу, иначе каждая запись переформатирует его целиком.
  const prev = existsSync(file) ? await readFile(file, 'utf8') : '';
  const indentMatch = prev.match(/\n( +)\{/);
  const indent = indentMatch ? indentMatch[1].length : 1;
  const text = JSON.stringify(data, null, indent);
  const crlf = prev.includes('\r\n');
  const endsWithNewline = prev === '' || prev.endsWith('\n');
  const body = crlf ? text.replace(/\n/g, '\r\n') : text;
  await writeFile(file, endsWithNewline ? `${body}\n` : body, 'utf8');
}

const advcakeKey = async () => {
  if (process.env.ADVCAKE_API_KEY) return process.env.ADVCAKE_API_KEY.trim();
  const file = join(ROOT, '.secrets', 'advcake.key');
  if (!existsSync(file)) return '';
  return (await readFile(file, 'utf8')).trim();
};

// Ссылка ЛитРеса перевыпускается запросом к Cakelink: на вход товарная страница,
// на выход — ссылка с метками AdvCake и erid. Ключ не печатаем никогда.
async function refreshLitres(productUrl, key) {
  const url = `https://cakelink.ru/link?dl=${encodeURIComponent(productUrl)}&pass=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`cakelink HTTP ${res.status}`);
  const json = await res.json();
  const link = json?.data?.url;
  if (!json?.success || !link) throw new Error('cakelink: пустой ответ');
  return link;
}

// Сравнение ссылок без порядка параметров и без одноразовых меток: Cakelink выдаёт
// новый advcake_params на каждый запрос, но это не смена ссылки — платить за неё
// коммитом каждую неделю незачем. Меняем ссылку, только если изменились постоянные
// метки (utm_source, utm_medium, utm_campaign, utm_content, erid) или адрес товара.
const VOLATILE = new Set(['advcake_params', 'utm_term', 'ab_test_value', 'm', 'advcake_method']);
function sameLink(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    if (ua.origin !== ub.origin || ua.pathname !== ub.pathname) return false;
    const pick = (u) => [...u.searchParams.entries()]
      .filter(([k]) => !VOLATILE.has(k))
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return pick(ua) === pick(ub);
  } catch {
    return a === b;
  }
}

async function fetchLink(url) {
  const request = () => fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9' },
  });
  let response = await request();
  if (RETRY_STATUS.has(response.status)) {
    await sleep(RETRY_DELAY_MS);
    response = await request();
  }
  let body = '';
  try {
    body = (await response.text()).slice(0, 400000);
  } catch { /* тело нужно только для availability */ }
  return { response, body };
}

const productIdFrom = (url) => {
  try {
    const m = new URL(url).pathname.match(/-(\d+)\/?$/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
};

// Проверка ссылки «Читай-города»: вердикт ok / dead / blocked / wrong-product / no-mark.
async function checkChitai(linkUrl, item) {
  const { response, body } = await fetchLink(linkUrl);
  const finalUrl = response.url;
  const host = (() => { try { return new URL(finalUrl).hostname; } catch { return ''; } })();
  const base = { status: response.status, finalUrl };
  if ([403, 429, 451].includes(response.status)) return { ...base, verdict: 'blocked' };
  if (response.status === 404 || response.status === 410 || response.status >= 500) return { ...base, verdict: 'dead' };
  if (!STORES['chitai-gorod'].hosts.includes(host)) return { ...base, verdict: 'wrong-product', why: `чужой хост ${host || '—'}` };
  if (!STORES['chitai-gorod'].productPath.test(new URL(finalUrl).pathname)) {
    return { ...base, verdict: 'wrong-product', why: `не карточка товара: ${new URL(finalUrl).pathname}` };
  }
  const gotId = productIdFrom(finalUrl);
  if (item.productId && gotId && gotId !== String(item.productId)) {
    return { ...base, verdict: 'wrong-product', why: `ведёт на товар ${gotId}, а должен на ${item.productId}` };
  }
  const marked = STORES['chitai-gorod'].markKeys.some((k) => finalUrl.includes(`${k}=`) || (k === 'erid' && /erid/i.test(body.slice(0, 200000))));
  if (!marked) return { ...base, verdict: 'no-mark', why: 'потеряна партнёрская метка' };
  return { ...base, verdict: 'ok' };
}

const config = await readJson('site.config.json', {});
const books = await readJson('data/books.json', []);
const audiobooks = await readJson('data/audiobooks.json', []);
const registry = await readJson('data/affiliate-links.json', { items: {} });
registry.items = registry.items || {};

const key = await advcakeKey();
const targets = [];
for (const [source, items] of [['books.json', books], ['audiobooks.json', audiobooks]]) {
  for (const item of items) {
    for (const link of item.links || []) {
      if (!link.url) continue;
      if (STORE_FILTER && link.store !== STORE_FILTER) continue;
      targets.push({ source, item, link });
    }
  }
}
const limited = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;

const actions = [];
const removed = [];
const replacements = [];
const problems = [];
let blocked = 0;
let checked = 0;
let lastChitai = 0;

for (const t of limited) {
  const { item, link, source } = t;
  const productUrl = item.productUrl || '';
  const regSlot = productUrl ? registry.items[productUrl] : null;

  if (link.store === 'litres') {
    if (!key) {
      problems.push({ store: link.store, id: item.id, title: item.title, action: 'no-key', why: 'нет ключа AdvCake — ЛитРес не обновить' });
      continue;
    }
    try {
      const fresh = await refreshLitres(productUrl || link.url, key);
      checked += 1;
      // Ссылка перевыпущена — проверяем, что карточка жива: снятый с продажи товар
      // Cakelink всё равно оформляет ссылкой, и без проверки мёртвая карточка осталась бы.
      const probe = await fetchLink(fresh);
      if ([404, 410].includes(probe.response.status) || probe.response.status >= 500) {
        actions.push({ store: link.store, id: item.id, title: item.title, action: 'remove', why: `HTTP ${probe.response.status}` });
        if (FIX) removed.push({ source, item });
        continue;
      }
      if (sameLink(fresh, link.url)) {
        actions.push({ store: link.store, id: item.id, title: item.title, action: 'ok' });
      } else {
        actions.push({ store: link.store, id: item.id, title: item.title, action: 'refreshed', from: link.url, to: fresh });
        if (FIX) {
          replacements.push({ rel: `data/${source}`, from: link.url, to: fresh });
          link.url = fresh;
        }
      }
      if (FIX && productUrl) registry.items[productUrl] = { store: 'litres', url: link.url, checkedAt: new Date().toISOString().slice(0, 10) };
    } catch (e) {
      problems.push({ store: link.store, id: item.id, title: item.title, action: 'failed', why: String(e.message).slice(0, 80) });
    }
    continue;
  }

  if (link.store === 'chitai-gorod') {
    // Последовательные запросы с паузой: параллельность магазин воспринимает как атаку.
    const wait = CHG_DELAY_MS - (Date.now() - lastChitai);
    if (wait > 0) await sleep(wait);
    lastChitai = Date.now();
    let res;
    try {
      res = await checkChitai(link.url, item);
    } catch (e) {
      problems.push({ store: link.store, id: item.id, title: item.title, action: 'failed', why: String(e.cause?.code || e.message).slice(0, 80) });
      continue;
    }
    checked += 1;
    if (res.verdict === 'blocked') { blocked += 1; continue; }
    if (res.verdict === 'ok') {
      actions.push({ store: link.store, id: item.id, title: item.title, action: 'ok' });
      if (FIX && productUrl) registry.items[productUrl] = { store: 'chitai-gorod', url: link.url, checkedAt: new Date().toISOString().slice(0, 10) };
      continue;
    }
    // Ссылка плохая: пробуем взять рабочую из реестра (магазин выдаёт одну ссылку на товар).
    const candidate = regSlot && regSlot.store === 'chitai-gorod' && regSlot.url !== link.url ? regSlot.url : '';
    if (candidate) {
      const wait2 = CHG_DELAY_MS - (Date.now() - lastChitai);
      if (wait2 > 0) await sleep(wait2);
      lastChitai = Date.now();
      let second;
      try {
        second = await checkChitai(candidate, item);
      } catch {
        second = { verdict: 'failed' };
      }
      if (second.verdict === 'ok') {
        actions.push({ store: link.store, id: item.id, title: item.title, action: 'replaced', from: link.url, to: candidate, why: res.why || res.verdict });
        if (FIX) {
          replacements.push({ rel: `data/${source}`, from: link.url, to: candidate });
          link.url = candidate;
        }
        continue;
      }
    }
    // Карточка снята с продажи — не чиним ссылку, а снимаем товар с сайта.
    if (res.verdict === 'dead') {
      actions.push({ store: link.store, id: item.id, title: item.title, action: 'remove', why: `HTTP ${res.status}` });
      if (FIX) removed.push({ source, item });
      continue;
    }
    problems.push({ store: link.store, id: item.id, title: item.title, action: 'manual', why: `${res.verdict}: ${res.why || ''}`.trim() });
  }
}

// Точечная правка данных: блоки снимаем по id, ссылки меняем как текст.
// JSON.stringify переформатировал бы файл целиком — в chekhov-site другой отступ,
// CRLF и цены вида 319.0, — а нужен диф на снятые карточки, а не на весь файл.
function stripItems(raw, ids) {
  const spans = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let start = -1;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const block = raw.slice(start, i + 1);
        const idMatch = block.match(/"id"\s*:\s*"([^"]+)"/);
        if (idMatch && ids.has(idMatch[1])) {
          let from = start;
          while (from > 0 && (raw[from - 1] === ' ' || raw[from - 1] === '\t')) from -= 1;
          let to = i + 1;
          while (to < raw.length && (raw[to] === ' ' || raw[to] === '\t')) to += 1;
          if (raw[to] === ',') to += 1;
          while (to < raw.length && (raw[to] === '\r' || raw[to] === '\n')) to += 1;
          spans.push([from, to]);
        }
      }
    }
  }
  let out = raw;
  for (const [from, to] of spans.reverse()) out = out.slice(0, from) + out.slice(to);
  // Сняли последний элемент — перед закрывающей скобкой осталась висячая запятая.
  out = out.replace(/,(\r?\n[ \t]*\])/g, '$1');
  return out;
}

if (FIX) {
  const touched = new Set([
    ...removed.map((r) => `data/${r.source}`),
    ...replacements.map((r) => r.rel),
  ]);
  for (const rel of touched) {
    let raw = await readFile(join(ROOT, rel), 'utf8');
    const ids = new Set(removed.filter((r) => `data/${r.source}` === rel).map((r) => r.item.id));
    if (ids.size) raw = stripItems(raw, ids);
    for (const rep of replacements.filter((r) => r.rel === rel)) raw = raw.split(rep.from).join(rep.to);
    await writeFile(join(ROOT, rel), raw, 'utf8');
  }

  // Снятые карточки не выбрасываем бесследно: история нужна, чтобы тот же товар
  // не вернулся в данные при следующем импорте.
  if (removed.length) {
    const removedFile = await readJson('data/books-removed.json', { items: [] });
    removedFile.items = removedFile.items || [];
    for (const { item } of removed) {
      removedFile.items.push({
        id: item.id,
        title: item.title,
        productUrl: item.productUrl || '',
        removedAt: new Date().toISOString().slice(0, 10),
        why: 'партнёрская ссылка и карточка товара отдают 404',
      });
    }
    await writeJson('data/books-removed.json', removedFile);
  }
  await writeJson('data/affiliate-links.json', registry);
}

const report = {
  generatedAt: new Date().toISOString(),
  site: config.siteUrl || '',
  fix: FIX,
  checked,
  blocked,
  refreshed: actions.filter((a) => a.action === 'refreshed').length,
  replaced: actions.filter((a) => a.action === 'replaced').length,
  removed: actions.filter((a) => a.action === 'remove').length,
  manual: problems.filter((p) => p.action === 'manual').length,
  failed: problems.filter((p) => p.action !== 'manual').length,
  actions,
  problems,
};
await mkdir(join(ROOT, 'reports'), { recursive: true });
await writeFile(join(ROOT, 'reports', 'affiliate-refresh.json'), JSON.stringify(report, null, 2));

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`партнёрские ссылки: проверено ${checked}${blocked ? `, закрыто антиботом ${blocked}` : ''}${FIX ? '' : ' (режим проверки, без записи)'}`);
  if (!key) console.log('INFO  ЛитРес: ключ AdvCake не найден (.secrets/advcake.key или ADVCAKE_API_KEY)');
  for (const a of actions) {
    if (a.action === 'refreshed') console.log(`FIXED ${a.store} · ${a.title} → ссылка перевыпущена`);
    if (a.action === 'replaced') console.log(`FIXED ${a.store} · ${a.title} → ссылка заменена из реестра (${a.why})`);
    if (a.action === 'remove') console.log(`REMOVE ${a.store} · ${a.title} → карточка мертва (${a.why})`);
  }
  for (const p of problems) console.log(`TODO  ${p.store} · ${p.title} → ${p.action}: ${p.why}`);
  if (!actions.some((a) => a.action !== 'ok') && !problems.length) console.log('всё актуально, правок нет');
  console.log(`отчёт: reports/affiliate-refresh.json${FIX ? '' : '; для записи запусти с --fix'}`);
}

if (problems.some((p) => p.action === 'manual')) {
  console.log(`ОСТАЛИСЬ ССЫЛКИ, КОТОРЫЕ ЧИНИТ ТОЛЬКО КАБИНЕТ: ${problems.filter((p) => p.action === 'manual').length}`);
  process.exit(1);
}
if (checked === 0 && blocked > 0) {
  console.log('ПРОВЕРКА НЕ ВЫПОЛНЕНА: магазин не отдаёт страницы этой сети');
  process.exit(2);
}
