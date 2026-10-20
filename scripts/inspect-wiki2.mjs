import { readFile } from 'node:fs/promises';
const wt = await readFile('data/wiki-biografiya.txt', 'utf8');
function section(name) {
  const re = new RegExp(`==\\s*${name}\\s*==([\\s\\S]*?)(?=\\n==[^=]|$)`);
  const m = wt.match(re);
  return m ? m[1] : '';
}
const s = section('Личная жизнь');
console.log(s.slice(5000, 9000));
