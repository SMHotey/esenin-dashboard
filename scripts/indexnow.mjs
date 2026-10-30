// Отправка адресов в IndexNow (Яндекс, Bing, Seznam, Naver): ускоряет переобход
// и первичное попадание страниц в индекс без аккаунта вебмастера.
//
// Запуск:
//   node scripts/indexnow.mjs               — все страницы из dist/sitemap.xml
//   node scripts/indexnow.mjs --recent 2    — правленные за последние N дней (деплой)
//   node scripts/indexnow.mjs --changed     — только не отправленные ранее (локально)
//   node scripts/indexnow.mjs --limit 50    — первые N адресов (проба)
//
// Ключ и флаг берутся из site.config.json → indexNow {enabled, key}. Файл-ключ
// <key>.txt кладёт в dist сама сборка (build.mjs), поэтому перед отправкой
// убедитесь, что деплой уже прошёл: робот сначала проверяет ключ на сайте.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const ENDPOINTS = ["https://api.indexnow.org/indexnow", "https://yandex.com/indexnow"];
const MAX_PER_REQUEST = 10000; // ограничение протокола

const cfg = JSON.parse(readFileSync("site.config.json", "utf8"));
const SITE = String(cfg.siteUrl || "").replace(/\/$/, "");
const key = String(cfg.indexNow?.key || "").trim();
const enabled = cfg.indexNow?.enabled !== false;

const args = process.argv.slice(2);
const onlyChanged = args.includes("--changed");
const dryRun = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) || 0 : 0;
const recentArg = args.indexOf("--recent");
const recentDays = recentArg >= 0 ? Number(args[recentArg + 1]) || 0 : 0;

if (!SITE) fail("site.config.json: не задан siteUrl");
if (!enabled) {
  console.log("IndexNow выключен в site.config.json (indexNow.enabled = false) — пропускаю.");
  process.exit(0);
}
if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) fail("site.config.json: indexNow.key пустой или недопустимой длины (8–128 символов)");

const SITEMAP = join("dist", "sitemap.xml");
if (!existsSync(SITEMAP)) fail("нет dist/sitemap.xml — сначала npm run build");

// Ключ должен лежать в собранном каталоге: если нет, деплой отстал от сборки.
const keyFile = join("dist", `${key}.txt`);
if (!existsSync(keyFile)) warn(`в dist нет файла ключа ${key}.txt — проверьте indexNow в build.mjs`);

const urls = [...readFileSync(SITEMAP, "utf8").matchAll(/<url>\s*<loc>\s*([^<\s]+)\s*<\/loc>(?:\s*<lastmod>\s*([^<\s]+)\s*<\/lastmod>)?/g)]
  .map((m) => ({ url: m[1], lastmod: m[2] || "" }))
  .filter((x) => x.url.startsWith(SITE + "/"))
  .filter((x) => !/\.(jpe?g|png|webp|gif|svg|ico|json|xml|txt)$/i.test(x.url));

// --recent N: берём только то, что правили за последние N дней — статичная альтернатива
// «изменённому с прошлого деплоя» для CI, где кэш отправленного не сохраняется.
if (recentDays) {
  const since = new Date(Date.now() - recentDays * 86400000).toISOString().slice(0, 10);
  const recent = urls.filter((x) => x.lastmod && x.lastmod.slice(0, 10) >= since);
  if (recent.length) {
    urls.length = 0;
    urls.push(...recent);
  }
}

const STATE = join(".cache", "indexnow-sent.json");
let sent = new Set();
if (onlyChanged && existsSync(STATE)) {
  try {
    sent = new Set(JSON.parse(readFileSync(STATE, "utf8")).urls || []);
  } catch {
    sent = new Set();
  }
}
let queue = (onlyChanged ? urls.filter((x) => !sent.has(x.url)) : urls.slice()).map((x) => x.url);
if (limit) queue = queue.slice(0, limit);

if (!queue.length) {
  console.log("IndexNow: новых адресов нет.");
  process.exit(0);
}

console.log(`IndexNow: ${queue.length} адресов из ${urls.length} (${SITE})`);
if (dryRun) {
  console.log(queue.slice(0, 10).join("\n") + (queue.length > 10 ? `\n… ещё ${queue.length - 10}` : ""));
  process.exit(0);
}

const body = JSON.stringify({
  host: new URL(SITE).host,
  key,
  keyLocation: `${SITE}/${key}.txt`,
  urlList: queue.slice(0, MAX_PER_REQUEST),
});

let ok = false;
for (const endpoint of ENDPOINTS) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text().catch(() => "");
    // 200 — принято, 202 — принято с проверкой ключа; 4xx — ошибка ключа/формата.
    if (res.status === 200 || res.status === 202) {
      console.log(`${endpoint}: ${res.status} OK`);
      ok = true;
    } else {
      warn(`${endpoint}: ${res.status} ${text.slice(0, 200)}`);
    }
  } catch (e) {
    warn(`${endpoint}: ${e.message}`);
  }
}

if (ok) {
  // Помним отправленное, чтобы --changed не гонял одни и те же адреса каждый день.
  // В CI каталог .cache может отсутствовать, а падать из-за состояния нельзя:
  // отправка уже прошла, это лишь локальная памятка.
  try {
    mkdirSync(dirname(STATE), { recursive: true });
    const all = new Set([...sent, ...queue]);
    writeFileSync(STATE, JSON.stringify({ updated: new Date().toISOString(), urls: [...all] }, null, 1));
    console.log(`IndexNow: отправлено ${queue.length}, всего помечено ${all.size}`);
  } catch (e) {
    warn(`IndexNow: не удалось сохранить состояние (${e.code || e.message}) — на отправку не влияет`);
    console.log(`IndexNow: отправлено ${queue.length}`);
  }
} else {
  console.log("IndexNow: ни один сервис не принял пакет (роботу всё равно нужен живой сайт и ключ).");
  process.exitCode = 0; // не валим деплой из-за внешнего сервиса
}

function fail(msg) {
  console.error("x " + msg);
  process.exit(1);
}
function warn(msg) {
  console.warn("! " + msg);
}
