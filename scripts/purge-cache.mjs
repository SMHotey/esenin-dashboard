// Сброс кэша Cloudflare после деплоя: читает список страниц из dist и чистит их,
// чтобы свежие публикации и цены книг появлялись сразу, а не через edge TTL.
// Запускается из deploy-джобы с CF_API_TOKEN и CF_ZONE_ID (GitHub Secrets).
import { readFileSync, readdirSync, existsSync } from "node:fs";

const SITE = (() => {
  try {
    const cfg = JSON.parse(readFileSync("site.config.json", "utf8"));
    if (cfg.siteUrl) return cfg.siteUrl.replace(/\/$/, "");
  } catch {}
  return "https://poet-esenin.ru";
})();

const HUBS = [
  "/", "/books/", "/publications/", "/works/", "/biography/", "/people/", "/life/",
  "/places/", "/legacy/", "/research/", "/topics/", "/faq.html", "/glossary.html",
  "/about.html", "/sources.html", "/versions.html", "/privacy.html",
  "/search.json", "/feed.xml", "/sitemap.xml", "/llms.txt",
];

const files = [...HUBS];
const pubDir = "dist/publications";
if (existsSync(pubDir)) {
  for (const f of readdirSync(pubDir)) if (f.endsWith(".html")) files.push("/publications/" + f);
}
// HTML главных страниц из sitemap (без картинок)
if (existsSync("dist/sitemap.xml")) {
  const sm = readFileSync("dist/sitemap.xml", "utf8");
  for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const path = new URL(m[1]).pathname;
    if (path.endsWith("/") || path.endsWith(".html")) files.push(path);
  }
}
const urls = [...new Set(files)].map((p) => SITE + p);

const { CF_API_TOKEN: token, CF_ZONE_ID: zone } = process.env;
if (!token || !zone) {
  console.log("нет CF_API_TOKEN/CF_ZONE_ID — сброс кэша пропущен");
  process.exit(0);
}

let purged = 0;
for (let i = 0; i < urls.length; i += 30) {
  const batch = urls.slice(i, i + 30);
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ files: batch }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    console.error("пакет " + (i / 30 + 1) + " не очищен:", JSON.stringify(data.errors || data).slice(0, 300));
    process.exitCode = 1;
  } else {
    purged += batch.length;
  }
}
console.log(`сброшен кэш для ${purged} из ${urls.length} адресов (${SITE})`);
