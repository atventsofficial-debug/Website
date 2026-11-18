// The order book, in Cloudflare D1 (binding DB, wrangler.jsonc): one row per order, so the
// Worker knows where to send the pass email once Midtrans says it is paid, and sends it once.
// Midtrans keeps the payment itself; this keeps the buyer's name and email, the seat, the
// way they chose to pay, and when the pass was paid and emailed.
//
// Without the binding (a local run, or before the database exists) every call here does
// nothing: payments still work, only no email goes out.
//
// The table is made on first use, so a new database needs no setup step.
const SCHEMA = `CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cat TEXT NOT NULL,
  seat TEXT NOT NULL,
  seat_label TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'checking',
  origin TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  emailed_at INTEGER
)`;

// A table made before the way to pay was kept gets its column. SQLite has no ADD COLUMN IF
// NOT EXISTS: on a table that has it, the ALTER fails with "duplicate column", which is fine.
const ADD_METHOD = "ALTER TABLE orders ADD COLUMN method TEXT NOT NULL DEFAULT ''";
async function setUp(d) {
  await d.prepare(SCHEMA).run();
  await d.prepare(ADD_METHOD).run().catch(err => { if (!/duplicate column/i.test(String(err?.message))) throw err; });
}

const ready = new WeakMap();
async function db(env) {
  const d = env?.DB;
  if (!d?.prepare) return null;
  if (!ready.has(d)) ready.set(d, setUp(d).catch(err => { ready.delete(d); throw err; }));
  await ready.get(d);
  return d;
}

export const hasOrders = env => !!env?.DB?.prepare;

export async function saveOrder(env, o) {
  const d = await db(env);
  if (!d) return false;
  await d.prepare(`INSERT OR IGNORE INTO orders (id, event_id, title, cat, seat, seat_label, name, email, amount, method, origin, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(o.id, o.eventId, o.title, o.cat, o.seat, o.seatLabel, o.name, o.email, o.amount, o.method || '', o.origin, o.createdAt).run();
  return true;
}

// The order's state as Midtrans last told it. paid_at is the first time it was paid.
export async function setStatus(env, id, status, now = Date.now()) {
  const d = await db(env);
  if (!d) return;
  await d.prepare(`UPDATE orders SET status = ?1, paid_at = COALESCE(paid_at, CASE WHEN ?1 = 'confirmed' THEN ?2 END) WHERE id = ?3 AND status <> ?1`)
    .bind(status, now, id).run();
}

// Takes the paid order's email for this run: the row once, the first time it is asked for,
// null after that. Two runs at once (Midtrans' notification and the page asking) cannot both
// get it.
export async function takeEmail(env, id, now = Date.now()) {
  const d = await db(env);
  if (!d) return null;
  return d.prepare(`UPDATE orders SET emailed_at = ? WHERE id = ? AND status = 'confirmed' AND emailed_at IS NULL RETURNING *`)
    .bind(now, id).first();
}

// The email did not go: give it back, so the next notification or check tries again.
export async function returnEmail(env, id) {
  const d = await db(env);
  if (!d) return;
  await d.prepare('UPDATE orders SET emailed_at = NULL WHERE id = ?').bind(id).run();
}
