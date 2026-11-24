// A song's short preview for the setlist panel (js/seatplus.js): Apple's own 30-second clip,
// found through the iTunes Search API, with the song's page on Apple Music; else Deezer's. The clip is played
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

// Deezer's 30-second preview, when Apple does not answer (it limits requests from shared
// cloud addresses such as the Worker's). Same shape as Apple's, with where it is from.
export function pickDeezer(data, artist, song) {
  const rows = (data || []).map(d => ({ previewUrl: d.preview, trackViewUrl: d.link, trackName: d.title, artistName: d.artist?.name }));
  const hit = pickPreview(rows, artist, song);
  return hit ? { ...hit, from: 'Deezer' } : null;
}

// The clip, or null; `looked` gets what each store answered (its HTTP status and how many
// songs), so an answer of none can tell "Apple has no clip" from "Apple did not answer".
export async function findPreview(artist, song, fetchFn = fetch, looked = []) {
  const term = `${artist} ${String(song).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')}`.replace(/\s+/g, ' ').trim();
  for (const country of COUNTRIES) {
    const q = new URLSearchParams({ term, entity: 'song', limit: '15', country });
    let res;
    try {
      res = await fetchFn(`${SEARCH}?${q}`, { headers: { accept: 'application/json', 'user-agent': 'Atvents/1.0 (+https://atvents.com)' } });
    } catch { looked.push({ country, status: 0 }); continue; }
    const data = res.ok ? await res.json().catch(() => null) : null;
    looked.push({ country, status: res.status, songs: data?.results?.length ?? 0 });
    if (!data) continue;
    const hit = pickPreview(data.results, artist, song);
    // Apple's clips are served over https only from its own hosts.
    if (hit && /^https:\/\/[a-z0-9.-]+\.apple\.com\//.test(hit.url)) return { ...hit, from: 'Apple Music' };
  }
  try {
    const q = new URLSearchParams({ q: term, limit: '25' });
    const res = await fetchFn(`https://api.deezer.com/search?${q}`, { headers: { accept: 'application/json' } });
    const data = res.ok ? await res.json().catch(() => null) : null;
    // Deezer answers 200 with an error object when it is busy.
    const ok = res.ok && data && !data.error;
    looked.push({ country: 'deezer', status: ok ? 200 : res.status === 200 ? 503 : res.status, songs: data?.data?.length ?? 0 });
    const hit = ok ? pickDeezer(data.data, artist, song) : null;
    if (hit && /^https:\/\/[a-z0-9.-]+\.dzcdn\.net\//.test(hit.url)) return hit;
  } catch { looked.push({ country: 'deezer', status: 0 }); }
  return null;
}

// GET /api/preview?artist=…&song=…
export async function songPreview(url, ctx, json, fetchFn = fetch) {
  const artist = (url.searchParams.get('artist') || '').trim().slice(0, 80);
  const song = (url.searchParams.get('song') || '').trim().slice(0, 120);
  if (!artist || !song) return json(400, { error: 'Name the artist and the song.' });
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(`https://preview.atvents.invalid/v4/${encodeURIComponent(plain(artist))}/${encodeURIComponent(plain(song))}`);
  const kept = await cache?.match(key);
  if (kept) return kept;
  const looked = [];
  const hit = await findPreview(artist, song, fetchFn, looked);
  // Kept: a clip, or Apple's own answer that it has none. Not kept: Apple not answering.
  const answered = looked.some(l => l.status === 200);
  // Deezer's clip links are signed for about an hour; Apple's last.
  const res = hit
    ? json(200, hit, { 'cache-control': `public, max-age=${hit.from === 'Deezer' ? 1800 : 604800}` })
    : answered
      ? json(404, { error: 'No preview for this song.', code: 'none', looked }, { 'cache-control': 'public, max-age=86400' })
      : json(502, { error: 'The preview could not be found just now.', looked });
  if (cache && (hit || answered)) ctx?.waitUntil?.(cache.put(key, res.clone()));
  return res;
}
