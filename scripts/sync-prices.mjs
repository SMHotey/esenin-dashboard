// Синхронизация цен книг с магазином.
// Берёт партнёрскую ссылку из data/books.json, идёт по редиректу на страницу товара,
// читает JSON-LD (Offer/Book) и обновляет поля price, priceCurrency, availability,
// priceCheckedAt. Запускается по расписанию в CI или вручную: node scripts/sync-prices.mjs
import { readFile, writeFile } from 'node:fs/promises';

const FILE = 'data/books.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Магазины, у которых умеем читать цену со страницы товара.
const SYNCABLE_STORES = new Set(['chitai-gorod']);
const only = process.argv.includes('--book') ? process.argv[process.argv.indexOf('--book') + 1] : null;

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { html: await res.text(), url: res.url };
}

function parseOffer(html) {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let offer = null;
  let availability = null;
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (node['@type'] === 'Offer' || node['@type'] === 'AggregateOffer') {
      const price = Number(node.price ?? node.lowPrice);
      if (Number.isFinite(price) && price > 0) {
        offer = offer || { price, currency: node.priceCurrency || 'RUB' };
        if (node.availability) availability = String(node.availability).split('/').pop();
      }
    }
    Object.values(node).forEach(walk);
  };
  for (const b of blocks) {
    try { walk(JSON.parse(b)); } catch { /* невалидный блок пропускаем */ }
  }
  return offer ? { ...offer, availability } : null;
}

const books = JSON.parse(await readFile(FILE, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
let changed = 0;
let failed = 0;

for (const book of books) {
  if (only && book.id !== only) continue;
  const links = (book.links || []).filter((l) => SYNCABLE_STORES.has(l.store));
  if (!links.length) continue;
  try {
    const { html, url } = await fetchText(links[0].url);
    const offer = parseOffer(html);
    if (!offer) { console.warn(`ПРОПУСК ${book.id}: на странице нет цены`); failed++; continue; }
    const before = book.price;
    book.price = offer.price;
    book.priceCurrency = offer.currency;
    book.priceCheckedAt = today;
    book.availability = offer.availability || book.availability || null;
    book.productUrl = url.split('?')[0];
    if (before !== book.price) {
      console.log(`ЦЕНА ${book.id}: ${before ?? '—'} → ${book.price} ${book.priceCurrency}`);
      changed++;
    } else {
      console.log(`OK ${book.id}: ${book.price} ${book.priceCurrency} (без изменений)`);
      changed++;
    }
  } catch (err) {
    console.warn(`ОШИБКА ${book.id}: ${err.message}`);
    failed++;
  }
}

await writeFile(FILE, JSON.stringify(books, null, 2) + '\n', 'utf8');
console.log(`проверено книг: ${books.length}, обновлено: ${changed}, ошибок: ${failed}`);
