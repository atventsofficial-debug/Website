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
// The devices a paid pass is open on, and the one email code a pass may have out at a time,
// for opening it on another device (devices.mjs).
const DEVICES = `CREATE TABLE IF NOT EXISTS pass_devices (
  order_id TEXT NOT NULL,
  device TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (order_id, device)
)`;
const CODES = `CREATE TABLE IF NOT EXISTS pass_codes (
  order_id TEXT PRIMARY KEY,
  device TEXT NOT NULL,
  code TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
)`;
async function setUp(d) {
  await d.prepare(SCHEMA).run();
  await d.prepare(DEVICES).run();
  await d.prepare(CODES).run();
  await d.prepare(ADD_METHOD).run().catch(err => { if (!/duplicate column/i.test(String(err?.message))) throw err; });
}

const ready = new WeakMap();
export async function db(env) {
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

// The order's state as Midtrans last told it. paid_at is the first time it was paid. A pass
// the admin took back ('revoked', README: Taking a pass back) stays taken back, whatever
// Midtrans says later.
export async function setStatus(env, id, status, now = Date.now()) {
  const d = await db(env);
  if (!d) return;
  await d.prepare(`UPDATE orders SET status = ?1, paid_at = COALESCE(paid_at, CASE WHEN ?1 = 'confirmed' THEN ?2 END) WHERE id = ?3 AND status <> ?1 AND status <> 'revoked'`)
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

// The order's state in the book: 'confirmed' once paid, 'revoked' once taken back, or null
// when the book has no row.
export async function statusOf(env, id) {
  const d = await db(env);
  if (!d) return null;
  return (await d.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first())?.status ?? null;
}

// The order's row, or null: for the email code (devices.mjs) and its address.
export async function orderOf(env, id) {
  const d = await db(env);
  if (!d) return null;
  return d.prepare('SELECT id, event_id, title, name, email, status FROM orders WHERE id = ?').bind(id).first();
}

// A pass for a member of the team (team.mjs): paid at 0, by nobody, so it opens like any
// paid pass. No pass email goes out (emailed_at is set): the member is on the page already.
export async function saveTeamOrder(env, o, now = Date.now()) {
  const d = await db(env);
  if (!d) return false;
  await d.prepare(`INSERT INTO orders (id, event_id, title, cat, seat, seat_label, name, email, amount, method, status, origin, created_at, paid_at, emailed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'team', 'confirmed', ?, ?, ?, ?)`)
    .bind(o.id, o.eventId, o.title, o.cat, o.seat, o.seatLabel, o.name, o.email, o.origin, o.createdAt, now, now).run();
  return true;
}
