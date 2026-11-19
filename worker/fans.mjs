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

// A concert fills up long before this; the cap keeps one answer small.
export const MAX_FANS = 3000;

const ready = new WeakMap();
async function db(env) {
  const d = env?.DB;
  if (!d?.prepare) return null;
  if (!ready.has(d)) ready.set(d, (async () => {
    await d.prepare(SCHEMA).run();
    await d.prepare(INDEX).run();
    await d.prepare(ONE_A_SEAT).run().catch(() => {});
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
    await d.prepare(`INSERT INTO fans (order_id, event_id, cat, seat, name, instagram, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
    ON CONFLICT(order_id) DO UPDATE SET name = ?5, instagram = ?6, updated_at = ?7`)
    .bind(p.id, p.eventId, p.cat, p.seat, fan.name, fan.instagram, now).run();
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) return 'taken';
    throw err;
  }
  return true;
}

export async function dropFan(env, id) {
  const d = await db(env);
  if (!d) return;
  await d.prepare('DELETE FROM fans WHERE order_id = ?').bind(id).run();
}

// A month after the show nobody needs them: the concert's rows go (privacy policy).
export const KEEP_AFTER = 30 * 864e5;
export async function dropConcert(env, eventId) {
  const d = await db(env);
  if (!d) return;
  await d.prepare('DELETE FROM fans WHERE event_id = ?').bind(eventId).run();
}
