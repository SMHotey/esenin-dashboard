#!/usr/bin/env node
// Локальный сервер для просмотра сборки с автосном.
//
// Зачем: `python -m http.server` живёт, пока его не убьют руками, и в итоге висит
// сутками после проверки вёрстки. Правило проекта: если к серверу нет обращений
// час — он гасится сам.
//
// Запуск: npm run serve      (порт 4173 по умолчанию)
//          PORT=4180 IDLE_MINUTES=5 node scripts/serve.mjs
//
// Отдаёт статику из dist/, отвечает 404 с dist/404.html, держит keep-alive,
// печатает каждый запрос коротко и завершает процесс после простоя.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4173);
const IDLE_MINUTES = Number(process.env.IDLE_MINUTES || 60);
const IDLE_MS = IDLE_MINUTES * 60 * 1000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

if (!existsSync(DIST)) {
  console.error('нет каталога dist — сначала npm run build');
  process.exit(1);
}

let lastHit = Date.now();
let requests = 0;

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const safe = normalize(clean).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe);
  if (file.endsWith('/')) file = join(file, 'index.html');
  if (file.endsWith('\\')) file = join(file, 'index.html');
  try {
    const s = await stat(file);
    if (s.isDirectory()) return join(file, 'index.html');
    return file;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  lastHit = Date.now();
  requests += 1;
  const file = await resolveFile(req.url || '/');
  if (!file) {
    const four04 = join(DIST, '404.html');
    const body = existsSync(four04) ? await readFile(four04) : Buffer.from('404');
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(body);
    console.log(`404 ${req.url}`);
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('500');
  }
});

server.listen(PORT, () => {
  console.log(`сервер: http://localhost:${PORT} (dist)`);
  console.log(`автосон: ${IDLE_MINUTES} мин без запросов — процесс завершится сам`);
});

// Проверка простоя: раз в минуту (для коротких тестовых порогов — чаще).
const tick = Math.max(1000, Math.min(60_000, Math.floor(IDLE_MS / 4)));
const timer = setInterval(() => {
  const idleMin = Math.round((Date.now() - lastHit) / 60000);
  if (Date.now() - lastHit >= IDLE_MS) {
    console.log(`простой ${idleMin} мин — гашу сервер (обращений за сессию: ${requests})`);
    clearInterval(timer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  }
}, tick);
timer.unref?.();

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
