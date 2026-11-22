// A seat mate's Instagram picture. Instagram has no official way to get it for a personal
// account, so the Worker asks the same public endpoint instagram.com's own pages use. It is
// only ever a nicety: saving a profile never waits on Instagram, and whenever Instagram does
// not answer the card shows the name's first letter. igExists answers true (there), false
// (not there) or null (no clear answer); answers are kept a while.
const ENDPOINT = 'https://i.instagram.com/api/v1/users/web_profile_info/?username=';
const HEADERS = {
  'x-ig-app-id': '936619743392459',
  accept: 'application/json',
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
const KEEP_YES = 24 * 36e5, KEEP_NO = 10 * 6e4;
const seen = new Map();   // handle -> { ok, pic, at }
const PIC_FOR = 36e5;   // Instagram's picture links are signed and run out: asked again hourly

export async function igExists(handle, { fetchImpl = globalThis.fetch, now = Date.now(), timeout = 4000 } = {}) {
  const h = String(handle || '').toLowerCase();
  if (!h) return false;
  const k = seen.get(h);
  if (k && now - k.at < (k.ok ? KEEP_YES : KEEP_NO)) return k.ok;
  let ok = null, pic = '';
  try {
    const r = await fetchImpl(ENDPOINT + encodeURIComponent(h), { headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
    if (r.status === 404) ok = false;
    else if (r.status === 200) {
      const j = await r.json().catch(() => null);
      if (j?.data?.user?.username) { ok = true; pic = j.data.user.profile_pic_url_hd || j.data.user.profile_pic_url || ''; }
      else if (j?.data && j.data.user === null) ok = false;
    }
  } catch { ok = null; }
  if (ok !== null) {
    if (seen.size > 5000) seen.clear();
    seen.set(h, { ok, pic, at: now });
  }
  return ok;
}

// The account's profile picture, through this Worker (the site's pages load images from
// their own address only), kept a day in Cloudflare's cache. Null when there is none to get:
// the card then shows the name's first letter.
const PIC_HOSTS = /^https:\/\/(?:[a-z0-9-]+\.)*(?:cdninstagram\.com|fbcdn\.net)\//i;
export async function igPicture(handle, { fetchImpl = globalThis.fetch, now = Date.now(), cache = globalThis.caches?.default } = {}) {
  const h = String(handle || '').toLowerCase();
  const key = `https://igpic.cache.internal/${encodeURIComponent(h)}`;
  const kept = cache && await cache.match(key).catch(() => null);
  if (kept) return kept;
  let k = seen.get(h);
  if (!k?.pic || now - k.at > PIC_FOR) { seen.delete(h); await igExists(h, { fetchImpl, now }); k = seen.get(h); }
  if (!k?.pic || !PIC_HOSTS.test(k.pic)) return null;
  try {
    const r = await fetchImpl(k.pic, { headers: { 'user-agent': HEADERS['user-agent'] }, signal: AbortSignal.timeout(5000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type.split(';')[0])) return null;
    const body = await r.arrayBuffer();
    if (body.byteLength > 400000) return null;
    const out = new Response(body, { headers: { 'content-type': type, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } });
    if (cache) await cache.put(key, new Response(body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' } })).catch(() => {});
    return out;
  } catch { return null; }
}
