// A song's short preview for the setlist panel (js/seatplus.js): Apple's own 30-second clip,
// found through the iTunes Search API, with the song's page on Apple Music. The clip is played
// straight from Apple; nothing of the song passes through or is kept by Atvents. Apple lets
// these previews be played to promote the song, with a link to it on Apple Music.
//
// One answer per artist and song, kept a week in the Worker's cache (a day when there is
// none), so a busy setlist does not run into the Search API's limit.

const SEARCH = 'https://itunes.apple.com/search';
const COUNTRIES = ['ID', 'US'];

// Lower case, no accents, no "(remix)" or "[live]", letters and digits only: "Run BTS (remix)"
// and "Run BTS" are one song, "Guns N' Roses" and "Guns N Roses" one band.
export function plain(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// The best match among the Search API's results: by this artist, with a preview, and the
// title the same, else starting with the song's title, else holding it.
export function pickPreview(results, artist, song) {
  const who = plain(artist), want = plain(song);
  if (!who || !want) return null;
  const ours = (results || []).filter(r => {
    const a = plain(r.artistName);
    return r.previewUrl && a && (a.includes(who) || who.includes(a));
  });
  const t = r => plain(r.trackName), raw = r => String(r.trackName || '').toLowerCase().trim();
  // The title as written first ("Dynamite" over "Dynamite (Tropical Remix)"), then one with
  // no version in brackets, then any of the same name, then the closest.
  const best = ours.find(r => raw(r) === String(song).toLowerCase().trim())
    || ours.find(r => t(r) === want && !/[([]/.test(r.trackName))
    || ours.find(r => t(r) === want) || ours.find(r => t(r).startsWith(want)) || ours.find(r => t(r).includes(want));
  return best ? { url: best.previewUrl, link: best.trackViewUrl || '', track: best.trackName, artist: best.artistName } : null;
}

export async function findPreview(artist, song, fetchFn = fetch) {
  const term = `${artist} ${String(song).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')}`.replace(/\s+/g, ' ').trim();
  for (const country of COUNTRIES) {
    const q = new URLSearchParams({ term, entity: 'song', limit: '15', country });
    let res;
    try { res = await fetchFn(`${SEARCH}?${q}`, { headers: { accept: 'application/json' } }); } catch { continue; }
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    const hit = pickPreview(data?.results, artist, song);
    // Apple's clips are served over https only from its own hosts.
    if (hit && /^https:\/\/[a-z0-9.-]+\.apple\.com\//.test(hit.url)) return hit;
  }
  return null;
}

// GET /api/preview?artist=…&song=…
export async function songPreview(url, ctx, json, fetchFn = fetch) {
  const artist = (url.searchParams.get('artist') || '').trim().slice(0, 80);
  const song = (url.searchParams.get('song') || '').trim().slice(0, 120);
  if (!artist || !song) return json(400, { error: 'Name the artist and the song.' });
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(`https://preview.atvents.invalid/${encodeURIComponent(plain(artist))}/${encodeURIComponent(plain(song))}`);
  const kept = await cache?.match(key);
  if (kept) return kept;
  const hit = await findPreview(artist, song, fetchFn);
  const res = hit
    ? json(200, hit, { 'cache-control': 'public, max-age=604800' })
    : json(404, { error: 'No preview for this song.', code: 'none' }, { 'cache-control': 'public, max-age=86400' });
  if (cache) ctx?.waitUntil?.(cache.put(key, res.clone()));
  return res;
}
