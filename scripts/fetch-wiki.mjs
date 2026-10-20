import { writeFile } from 'node:fs/promises';

const API = 'https://ru.wikipedia.org/w/api.php';
const url = new URL(API);
url.search = new URLSearchParams({
  action: 'parse', page: 'Есенин, Сергей Александрович', prop: 'wikitext', format: 'json', formatversion: '2',
}).toString();
const res = await fetch(url, { headers: { 'User-Agent': 'YeseninDashboard/1.0' } });
const data = await res.json();
const wt = data.parse.wikitext;
await writeFile('data/wiki-biografiya.txt', wt, 'utf8');
console.log('len', wt.length);

function section(name) {
  const re = new RegExp(`==\\s*${name}\\s*==([\\s\\S]*?)(?=\\n==[^=]|$)`);
  const m = wt.match(re);
  return m ? m[1] : '';
}
const lit = section('Литература');
console.log('\n=== ЛИТЕРАТУРА ===\n', lit.slice(0, 4000));
