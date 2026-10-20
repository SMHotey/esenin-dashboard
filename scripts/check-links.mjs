import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DIST = 'dist';
const files = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) await walk(p);
    else if (extname(entry.name) === '.html') files.push(p);
  }
}
await walk(DIST);

const missing = new Map();
let internal = 0;

for (const file of files) {
  const html = await readFile(file, 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const href = decodeURIComponent(m[1]);
    if (href.startsWith('//')) continue;
    internal++;
    let target = join(DIST, href);
    if (href.endsWith('/')) target = join(DIST, href, 'index.html');
    try {
      const s = await stat(target);
      if (s.isDirectory()) await stat(join(target, 'index.html'));
    } catch {
      if (!missing.has(href)) missing.set(href, new Set());
      missing.get(href).add(file.replace(/\\/g, '/').replace('dist', ''));
    }
  }
}

console.log('html files:', files.length, 'internal links:', internal, 'missing:', missing.size);
for (const [href, from] of [...missing].slice(0, 25)) {
  console.log('MISSING', href, '<-', [...from].slice(0, 3).join(', '));
}
