#!/usr/bin/env node
// Find real match photos via the Brave Search Image API, returning only
// candidates that actually download as a usable image. The drafter then VIEWS
// the top candidates and picks one that satisfies the editorial image rules
// (players in action, format-correct kit, same two teams, within 3 years).
//
// Usage: node scripts/find-image.js "<search query>" [count]
const { loadSecrets, getBraveKey } = require('./config');

const query = process.argv[2];
const count = Number(process.argv[3] || 12);
if (!query) {
  console.error('Usage: node scripts/find-image.js "<search query>" [count]');
  process.exit(1);
}

async function validate(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 cricdotcric-agent' }, redirect: 'follow' });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!/^image\//.test(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 15000) return null; // skip tiny thumbnails / trackers
    return { bytes: buf.length, contentType: ct };
  } catch {
    return null;
  }
}

(async () => {
  const key = getBraveKey(loadSecrets());
  const api = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=${count}&safesearch=strict`;
  const r = await fetch(api, { headers: { Accept: 'application/json', 'X-Subscription-Token': key } });
  if (!r.ok) throw new Error(`Brave API ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const results = data.results || [];

  const candidates = [];
  for (const item of results) {
    const imgUrl = (item.properties && item.properties.url) || (item.thumbnail && item.thumbnail.src);
    if (!imgUrl) continue;
    const v = await validate(imgUrl);
    if (!v) continue;
    candidates.push({ url: imgUrl, source: item.source, title: item.title, page: item.url, bytes: v.bytes });
    if (candidates.length >= 8) break;
  }

  console.log(JSON.stringify({ ok: true, query, count: candidates.length, candidates }, null, 2));
})().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
