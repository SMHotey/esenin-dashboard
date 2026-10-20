const TAG_RE = /<\/?(?:center|div|span|small|big|p|i|b|u|sup|sub|blockquote|font|table|tr|td|th)[^>]*>/gi;

function stripBasic(t) {
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*\/>/g, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  t = t.replace(/\{\{\s*indent\s*\|\s*(\d+)\s*\}\}/gi, (_, n) => ' '.repeat(Number(n)));
  let prev;
  do { prev = t; t = t.replace(/\{\{[^{}]*\}\}/g, ''); } while (t !== prev);
  t = t.replace(/\[\[(?:Категория|Файл|Image|Изображение):[^\]]*\]\]/gi, '');
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1');
  t = t.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1');
  t = t.replace(/\[https?:\/\/[^\]]+\]/g, '');
  t = t.replace(/'''?/g, '');
  t = t.replace(/<\/?poem[^>]*>/gi, '');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(TAG_RE, '\n');
  t = t.replace(/^__[A-Z]+__$/gm, '');
  t = t.replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
       .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return t;
}

function extractPoemBlocks(raw) {
  const blocks = [];
  let out = '';
  let i = 0;
  const OPEN_RE = /\{\{\s*(?:poem|poemx|f1|v|стих)\s*\|/gi;
  while (i < raw.length) {
    OPEN_RE.lastIndex = i;
    const found = OPEN_RE.exec(raw);
    const start = found ? found.index : -1;
    if (start === -1) { out += raw.slice(i); break; }
    out += raw.slice(i, start);

    let depth = 0, j = start;
    for (; j < raw.length - 1; j++) {
      if (raw[j] === '{' && raw[j + 1] === '{') { depth++; j++; continue; }
      if (raw[j] === '}' && raw[j + 1] === '}') { depth--; j++; if (depth === 0) break; continue; }
    }
    const block = raw.slice(start, j + 1);

    let body = '';
    const open = block.search(/<poem[^>]*>/i);
    const close = block.toLowerCase().lastIndexOf('</poem>');
    if (open !== -1 && close > open) {
      body = block.slice(open, close + 7).replace(/^<poem[^>]*>/i, '').replace(/<\/poem>$/i, '');
    } else {
      const firstBar = block.indexOf('|');
      const secondBar = block.indexOf('|', firstBar + 1);
      body = secondBar === -1 ? '' : block.slice(secondBar + 1, block.lastIndexOf('}}'));
      // drop trailing date parameter like |‹1913›
      body = body.replace(/\|\s*[‹«]?\d{4}[›»]?\s*$/,'');
    }
    blocks.push(stripBasic(body).trim());
    out += `\n\n@@POEM_${blocks.length - 1}@@\n\n`;
    i = j + 1;
  }
  return { out, blocks };
}

export function cleanWiki(raw) {
  raw = raw.split(/\n==+\s*(Примечания|Комментарии|Сноски|Библиография|Литература|Источники|См\. также)\s*==+/i)[0];
  const poemClose = raw.lastIndexOf('</poem>');
  const divIdx = raw.search(/<div[^>]*class="[^"]*indent[^"]*"/i);
  if (poemClose !== -1 && divIdx > poemClose) raw = raw.slice(0, divIdx);
  const { out, blocks } = extractPoemBlocks(raw);
  let t = stripBasic(out);
  t = t.replace(/@@POEM_(\d+)@@/g, (_, n) => '\n' + (blocks[Number(n)] || '') + '\n');
  t = t.split('\n').map((l) => l.replace(/[ \t]+$/g, '')).join('\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

export function templateField(raw, name) {
  const m = raw.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n]*)`, 'i'));
  return m ? m[1].trim() : '';
}

export function yearFrom(raw) {
  const created = templateField(raw, 'ДАТАСОЗДАНИЯ').match(/(1[89]\d\d|19\d\d|20\d\d)/);
  if (created) return Number(created[1]);
  const content = templateField(raw, 'СОДЕРЖАНИЕ').match(/#(1[89]\d\d|19\d\d)/);
  if (content) return Number(content[1]);
  const cats = raw.match(/\[\[Категория:(?:Поэзия|Литература) (1[89]\d\d|19\d\d)/);
  if (cats) return Number(cats[1]);
  const poemOff = raw.match(/\{\{poem-off\|[^}]*?(1[89]\d\d|19\d\d)/i);
  if (poemOff) return Number(poemOff[1]);
  const trailing = raw.match(/\|\s*[‹«]?\s*((?:1[89]|19)\d\d)\s*[›»]?\s*\}\}\s*(?:\n|$)/);
  if (trailing) return Number(trailing[1]);
  const italic = raw.match(/''[<‹«]?\s*((?:1[89]|19)\d\d)\s*[>›»]?''/);
  return italic ? Number(italic[1]) : null;
}
