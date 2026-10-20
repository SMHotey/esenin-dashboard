import { readFile } from 'node:fs/promises';
const wt = await readFile('data/wiki-biografiya.txt', 'utf8');
function section(name) {
  const re = new RegExp(`==\\s*${name}\\s*==([\\s\\S]*?)(?=\\n==[^=]|$)`);
  const m = wt.match(re);
  return m ? m[1] : '';
}
console.log('=== ЛИЧНАЯ ЖИЗНЬ ===');
console.log(section('Личная жизнь').slice(0, 5000));
console.log('\n=== РАННИЕ ГОДЫ ===');
console.log(section('Ранние годы').slice(0, 2500));
