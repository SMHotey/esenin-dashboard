const API = 'https://ru.wikisource.org/w/api.php';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(params, attempt = 0) {
  const url = new URL(API);
  url.search = new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString();
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'YeseninDashboard/1.0 (educational non-commercial project; contact: local)',
      'Accept': 'application/json',
    },
  });
  if (res.status === 429 && attempt < 6) {
    const wait = 2000 * Math.pow(2, attempt);
    console.warn(`429, retry in ${wait}ms`);
    await sleep(wait);
    return api(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function wikitext(title) {
  const data = await api({ action: 'parse', page: title, prop: 'wikitext' });
  if (data.error) throw new Error(`${title}: ${data.error.info}`);
  return data.parse.wikitext;
}

/** Batch fetch: returns Map<title, {content, categories}> for up to 50 titles */
export async function batch(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 20) {
    const chunk = titles.slice(i, i + 20);
    const data = await api({
      action: 'query',
      prop: 'revisions|categories',
      rvslots: 'main',
      rvprop: 'content',
      cllimit: 'max',
      titles: chunk.join('|'),
      redirects: '1',
    });
    const pages = data.query?.pages || [];
    for (const p of pages) {
      if (!p.title) continue;
      const content = p.revisions?.[0]?.slots?.main?.content || '';
      const cats = (p.categories || []).map((c) => c.title.replace(/^Категория:/, ''));
      out.set(p.title, { content, categories: cats });
    }
    await sleep(400);
  }
  return out;
}

export async function categories(title) {
  const data = await api({ action: 'query', prop: 'categories', cllimit: 'max', titles: title });
  const page = data.query?.pages?.[0];
  return (page?.categories || []).map((c) => c.title.replace(/^Категория:/, ''));
}
