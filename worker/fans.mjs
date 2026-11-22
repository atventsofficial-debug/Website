// Seat mates, in D1 next to the order book (orders.mjs): one row per paid pass whose fan
// chose to show their name and Instagram on their seat. The concert's other paid passes
// read them in the 3D view (js/fans.js), with the concert's WhatsApp fan group.
//
// A row is only ever made by the fan, with the box ticked (checkFan in js/fanrules.js), and
// the fan can take it down (DELETE). Nobody else's email, name on the order or order id
// leaves the Worker: only the seat, the category, the name they typed and the Instagram.
const SCHEMA = `CREATE TABLE IF NOT EXISTS fans (
  order_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  cat TEXT NOT NULL,
  seat TEXT NOT NULL,
  name TEXT NOT NULL,
  instagram TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;
const INDEX = 'CREATE INDEX IF NOT EXISTS fans_event ON fans (event_id)';
// One seat shows one Instagram. The index also stops two fans claiming it at the same moment;
// should older rows already break it, the check in saveFan still holds.
const ONE_A_SEAT = 'CREATE UNIQUE INDEX IF NOT EXISTS fans_seat ON fans (event_id, seat)';
// One number per concert, raised on every change to its fans: a Worker checks this one row
// and reads the whole list again only when it moved.
const META = 'CREATE TABLE IF NOT EXISTS fans_meta (event_id TEXT PRIMARY KEY, ver INTEGER NOT NULL)';
const BUMP = 'INSERT INTO fans_meta (event_id, ver) VALUES (?1, 1) ON CONFLICT(event_id) DO UPDATE SET ver = ver + 1';

// More than the largest stadium holds: every seat can show its fan. Each fan is sent only
// their own category's names; the rest go as a count per block (catView).
export const MAX_FANS = 100000;

const ready = new WeakMap();
async function db(env) {
  const d = env?.DB;
  if (!d?.prepare) return null;
  if (!ready.has(d)) ready.set(d, (async () => {
    await d.prepare(SCHEMA).run();
    await d.prepare(INDEX).run();
    await d.prepare(ONE_A_SEAT).run().catch(() => {});
    await d.prepare(META).run();
  })().catch(err => { ready.delete(d); throw err; }));
  await ready.get(d);
  return d;
}

export const hasFans = env => !!env?.DB?.prepare;

export async function fansOf(env, eventId) {
  const d = await db(env);
  if (!d) return [];
  const r = await d.prepare(`SELECT order_id, cat, seat, name, instagram FROM fans WHERE event_id = ? ORDER BY created_at LIMIT ${MAX_FANS}`).bind(eventId).all();
  // One seat, one Instagram: the first fan on a seat keeps it.
  const seen = new Set();
  return (r?.results || []).filter(x => !seen.has(x.seat) && seen.add(x.seat));
}

// 'taken' when another pass already shows a fan on this seat: one seat, one Instagram.
export async function saveFan(env, p, fan, now = Date.now()) {
  const d = await db(env);
  if (!d) return false;
  const other = await d.prepare('SELECT order_id FROM fans WHERE event_id = ? AND seat = ? AND order_id != ? LIMIT 1').bind(p.eventId, p.seat, p.id).first();
  if (other) return 'taken';
  try {
    await d.batch([
      d.prepare(`INSERT INTO fans (order_id, event_id, cat, seat, name, instagram, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
      ON CONFLICT(order_id) DO UPDATE SET name = ?5, instagram = ?6, updated_at = ?7`)
        .bind(p.id, p.eventId, p.cat, p.seat, fan.name, fan.instagram, now),
      d.prepare(BUMP).bind(p.eventId),
    ]);
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) return 'taken';
    throw err;
  }
  return true;
}

export async function dropFan(env, id, eventId) {
  const d = await db(env);
  if (!d) return;
  await d.batch([d.prepare('DELETE FROM fans WHERE order_id = ?').bind(id), d.prepare(BUMP).bind(eventId)]);
}

// A month after the show nobody needs them: the concert's rows go (privacy policy).
export const KEEP_AFTER = 30 * 864e5;
export async function dropConcert(env, eventId) {
  const d = await db(env);
  if (!d) return;
  await d.batch([d.prepare('DELETE FROM fans WHERE event_id = ?').bind(eventId), d.prepare('DELETE FROM fans_meta WHERE event_id = ?').bind(eventId)]);
}

// ---------------------------------------------------------------- many fans at once
// Thousands of fans with the 3D view open each ask every few seconds. The concert's list is
// read from D1 once and kept a few seconds: in this Worker's memory (one copy, and one read
// in flight, per concert) and in Cloudflare's cache of this data centre, so the other
// Workers there skip D1 too. A fan's own change clears both here; elsewhere it shows within
// FRESH. Should D1 not answer, the last list keeps being served for up to STALE.
// Every FRESH a Worker reads one row (the concert's change number, fans_meta); the whole
// list is read from D1 again only after a fan saved or removed their Instagram.
// The version (a hash of the list) lets a browser that already has it get a tiny answer.
export const FRESH = 4000, STALE = 10 * 6e4;
const mem = new WeakMap();   // env.DB -> Map(eventId -> { at, rows, version, pending })
const cacheKey = eventId => `https://fans.cache.internal/${encodeURIComponent(eventId)}`;
const edge = () => globalThis.caches?.default || null;

async function versionOf(rows) {
  const text = JSON.stringify(rows);
  if (globalThis.crypto?.subtle) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    return [...h.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

async function verOf(env, eventId) {
  const d = await db(env);
  const r = d && await d.prepare('SELECT ver FROM fans_meta WHERE event_id = ?').bind(eventId).first();
  return r?.ver ?? 0;
}

export async function fansList(env, eventId, now = Date.now()) {
  if (!env?.DB) return { rows: [], version: '0', ver: 0 };
  let m = mem.get(env.DB);
  if (!m) mem.set(env.DB, (m = new Map()));
  const hit = m.get(eventId);
  if (hit?.rows && now - hit.at < FRESH) return hit;
  if (hit?.pending) return hit.pending;
  const load = (async () => {
    const c = edge();
    const cached = c && await c.match(cacheKey(eventId)).catch(() => null);
    const kept = cached ? await cached.json().catch(() => null) : null;
    if (kept && now - kept.at < FRESH) return kept;
    // One row: has anything changed since the list we hold (here, or in this data centre)?
    const ver = await verOf(env, eventId);
    if (hit?.rows && hit.ver === ver) return { ...hit, at: now, pending: null };
    if (kept?.rows && kept.ver === ver) return { ...kept, at: now };
    const rows = await fansOf(env, eventId);
    const v = { at: now, ver, rows, version: await versionOf(rows) };
    c?.put(cacheKey(eventId), new Response(JSON.stringify(v), { headers: { 'cache-control': `max-age=${Math.ceil(STALE / 1000)}` } })).catch(() => {});
    return v;
  })();
  m.set(eventId, { ...(hit || {}), pending: load });
  try {
    const v = await load;
    m.set(eventId, v);
    return v;
  } catch (err) {
    // D1 is down or slow: the last list we had, if it is not too old.
    if (hit?.rows && now - hit.at < STALE) { m.set(eventId, { ...hit, pending: null }); return { ...hit, stale: true }; }
    m.delete(eventId);
    throw err;
  }
}

// What one category's fans get, worked out once per list and category, not per request:
// their own category's names (as JSON, ready to send), the other categories as one count
// per block (no names, no seats), and a version of just that, so a change elsewhere in the
// venue does not send every fan the whole list again.
const views = new WeakMap();   // list.rows -> Map(cat -> view)
export async function catView(list, cat) {
  let m = views.get(list.rows);
  if (!m) views.set(list.rows, (m = new Map()));
  if (m.has(cat)) return m.get(cat);
  const own = [], blocks = new Map(), byOrder = new Map();
  for (const r of list.rows) {
    if (r.cat === cat) { own.push({ seat: r.seat, cat: r.cat, name: r.name, instagram: r.instagram }); byOrder.set(r.order_id, r); continue; }
    const sec = String(r.seat).replace(/-[A-Z]{1,3}\d{1,4}$/, ''), k = `${r.cat}|${sec}`;
    const b = blocks.get(k);
    if (b) b.n++;
    else blocks.set(k, { seat: r.seat, cat: r.cat, n: 1 });
  }
  const fans = JSON.stringify(own), others = JSON.stringify([...blocks.values()]);
  const view = { fans, others, byOrder, version: (await versionOf(fans + others)) };
  m.set(cat, view);
  return view;
}

// After a fan saves or removes their Instagram: the next read goes to D1.
export async function forgetFans(env, eventId) {
  mem.get(env?.DB)?.delete(eventId);
  await edge()?.delete(cacheKey(eventId)).catch(() => {});
}
