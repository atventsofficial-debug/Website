// The payment Worker (worker/), with Midtrans and Resend played by stand-ins and D1 by an
// in-memory SQLite. No network.
//
//   node --test test/pay.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { writeWorkerCatalog } from '../scripts/worker-catalog.mjs';
import { EVENTS, getEvent, isConcert } from '../js/events.js';
import { checkClaim } from '../js/rules.js';

writeWorkerCatalog(path.resolve(new URL('..', import.meta.url).pathname));
const { default: worker } = await import('../worker/index.mjs');
const { concert, seatOf } = await import('../worker/catalog.mjs');
const { readPass } = await import('../worker/passkey.mjs');

const KEY = 'SB-Mid-server-TESTKEY0123456789abcdef';
const ORIGIN = 'https://atvents.com';
const env = (more = {}) => ({ MIDTRANS_SERVER_KEY: KEY, ASSETS: { fetch: async () => new Response('static 404', { status: 404 }) }, ...more });

// D1 as the Worker uses it (prepare, bind, run, first), on SQLite in memory.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => db.prepare(sql).get(...args) ?? null,
  });
  return { prepare: sql => stmt(sql), rows: () => db.prepare('SELECT * FROM orders').all() };
}

// Midtrans, as far as the Worker sees it: Snap makes a payment page, the status API answers
// with whatever the test puts in `paid`. Resend takes the emails into `mails`.
let calls, paid, snapFails, mails, mailFails;
const realFetch = globalThis.fetch, realError = console.error, realLog = console.log;
let logged;
beforeEach(() => {
  calls = []; paid = {}; snapFails = false; logged = []; mails = []; mailFails = false;
  console.error = (...a) => logged.push(a.join(' '));
  console.log = (...a) => logged.push(a.join(' '));
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === 'https://api.resend.com/emails') {
      if (mailFails) return Response.json({ message: 'The atvents.com domain is not verified.' }, { status: 403 });
      mails.push({ headers: init.headers, ...JSON.parse(init.body) });
      return Response.json({ id: `mail-${mails.length}` });
    }
    if (String(url) === 'https://app.sandbox.midtrans.com/snap/v1/transactions' || String(url) === 'https://app.midtrans.com/snap/v1/transactions') {
      if (snapFails) return Response.json({ error_messages: ['transaction_details.gross_amount is not equal to the sum of item_details'] }, { status: 400 });
      const host = new URL(url).origin;
      return Response.json({ token: 'snap-token-1', redirect_url: `${host}/snap/v4/redirection/snap-token-1` }, { status: 201 });
    }
    const m = /^https:\/\/api\.(?:sandbox\.)?midtrans\.com\/v2\/([^/]+)\/status$/.exec(String(url));
    if (m) {
      const t = paid[decodeURIComponent(m[1])];
      return t ? Response.json({ status_code: '200', order_id: decodeURIComponent(m[1]), gross_amount: '25000.00', currency: 'IDR', ...t }) : Response.json({ status_code: '404', status_message: "Transaction doesn't exist." });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realError; console.log = realLog; });

// Work the Worker leaves running after its answer (ctx.waitUntil), awaited by `settled()`.
let waits = [];
const ctx = { waitUntil: p => waits.push(p) };
const settled = async () => { const w = waits; waits = []; await Promise.all(w); };
const req = (p, init = {}) => worker.fetch(new Request(`${ORIGIN}${p}`, init), init.env || env(), ctx);
const post = (body, { headers = {}, ...more } = {}) => req('/api/payments', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), ...more,
});

// A real seat of a concert on sale, and an order for it.
const live = EVENTS.find(e => isConcert(e.id) && concert(e.id) && concert(e.id).start > Date.now());
const venue = getEvent(live.id), seat = venue.seats[Math.floor(venue.seats.length / 2)];
const order = (more = {}) => ({ eventId: live.id, cat: seat.cat, seat: seat.id, name: 'Rani Putri', email: 'Rani@Example.com', consent: true, ...more });

test('payments stay off until the server key is set', async () => {
  assert.equal((await req('/api/config', { env: env({ MIDTRANS_SERVER_KEY: '' }) })).status, 404);
  assert.equal((await post(order(), { env: env({ MIDTRANS_SERVER_KEY: undefined }) })).status, 503);
  const c = await (await req('/api/config')).json();
  assert.deepEqual(c, { mode: 'pay', provider: 'midtrans', sandbox: true, fee: 25000, mail: false });
  assert.equal((await (await req('/api/config', { env: env({ MIDTRANS_SERVER_KEY: 'Mid-server-LIVEKEY0123456789' }) })).json()).sandbox, false);
  assert.equal((await (await req('/api/config', { env: env({ MIDTRANS_ENV: 'production' }) })).json()).sandbox, false);
});

test('an order makes a Snap payment at the access fee and gives back a waiting pass', async () => {
  const r = await post(order({ amount: 1, gross_amount: 1 }));
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const p = await r.json();
  assert.match(p.id, /^PAY-[A-Z2-9]{16}$/);
  assert.equal(p.url, 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token-1');
  assert.equal(p.status, 'checking');
  assert.equal(p.amount, 25000);
  assert.equal(p.seat, seat.id);
  assert.ok(p.token.length > 60 && !p.token.includes(KEY));

  const snap = calls.find(c => c.url.endsWith('/snap/v1/transactions'));
  assert.equal(snap.init.headers.authorization, `Basic ${btoa(`${KEY}:`)}`);
  const body = JSON.parse(snap.init.body);
  assert.deepEqual(body.transaction_details, { order_id: p.id, gross_amount: 25000 });
  assert.equal(body.item_details.reduce((a, i) => a + i.price * i.quantity, 0), 25000, 'items add up to the fee');
  assert.ok(body.item_details[0].name.length <= 50);
  assert.deepEqual(body.customer_details, { first_name: 'Rani Putri', email: 'rani@example.com' });
  assert.equal(body.callbacks.finish, `${ORIGIN}/pay/done`);
  assert.equal(snap.init.headers['x-append-notification'], `${ORIGIN}/api/midtrans/notify`);
  // Open for an hour from now, in Jakarta time, as the page's clock shows it.
  assert.equal(body.expiry.unit, 'minute');
  assert.equal(body.expiry.duration, 60);
  const start = Date.parse(body.expiry.start_time.replace(' ', 'T').replace(' +0700', '+07:00'));
  assert.ok(Math.abs(start - Date.parse(p.createdAt)) < 1000);
  assert.equal(Date.parse(p.expiresAt) - Date.parse(p.createdAt), 36e5);
  assert.equal(p.snap, 'snap-token-1', 'the token that opens the form inside the page');
  assert.equal(p.email, 'rani@example.com');
  assert.ok(!JSON.stringify(p).includes(KEY));
});

test('the payment form opens inside the page only with a client key of the same environment', async () => {
  const cfg = async more => (await (await req('/api/config', { env: env(more) })).json()).clientKey;
  assert.equal(await cfg({}), undefined);
  assert.equal(await cfg({ MIDTRANS_CLIENT_KEY: 'SB-Mid-client-abcdEFGH1234' }), 'SB-Mid-client-abcdEFGH1234');
  assert.equal(await cfg({ MIDTRANS_CLIENT_KEY: 'Mid-client-abcdEFGH1234' }), undefined, 'a production key with a Sandbox server key');
  assert.equal(await cfg({ MIDTRANS_CLIENT_KEY: '<script>' }), undefined);
});

test('the order is checked the way the page checks it', async () => {
  const other = venue.seats.find(s => s.cat !== seat.cat);
  const cases = [
    [order({ eventId: 'evt-nope' }), 'eventId'],
    [order({ eventId: 'demo-concert' }), 'eventId'],
    [order({ cat: 'nope' }), 'cat'],
    [order({ seat: other.id }), 'seat'],
    [order({ seat: `${seat.sec}-${seat.row}9999` }), 'seat'],
    [order({ seat: '__proto__-A1' }), 'seat'],
    [order({ name: 'R' }), 'name'],
    [order({ email: 'not-an-email' }), 'email'],
    [order({ consent: 'yes' }), 'consent'],
  ];
  for (const [o, field] of cases) {
    const r = await post(o);
    assert.equal(r.status, 400, JSON.stringify(o));
    assert.equal((await r.json()).field, field);
  }
  assert.equal(calls.length, 0, 'nothing reached Midtrans');
});

test('a concert that is over sells no more passes', async () => {
  const now = Date.now;
  Date.now = () => concert(live.id).start + 2 * 864e5;
  try { assert.equal((await post(order())).status, 400); } finally { Date.now = now; }
});

test('only the site itself can start an order, with a small JSON body', async () => {
  assert.equal((await post(order(), { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await post(order(), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await post('{"eventId":')).status, 400);
  assert.equal((await post('[]')).status, 400);
  assert.equal((await post(order({ name: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await req('/api/payments')).status, 405);
  assert.equal(calls.length, 0);
});

test('too many orders from one address are refused', async () => {
  const limiter = { limit: async () => ({ success: false }) };
  const r = await post(order(), { env: env({ PAY_LIMIT: limiter }) });
  assert.equal(r.status, 429);
  assert.equal(calls.length, 0);
});

test('a refused Snap request is a 502 and the key is never logged', async () => {
  snapFails = true;
  const r = await post(order());
  assert.equal(r.status, 502);
  assert.ok(!(await r.text()).includes(KEY));
  assert.ok(logged.length > 0);
  assert.ok(logged.every(l => !l.includes(KEY) && !l.includes(btoa(`${KEY}:`))));
});

const status = (id, token, more) => req(`/api/passes/${id}`, { headers: { 'x-pass-token': token }, ...more });
async function newPass() { return (await post(order())).json(); }

test('the pass opens once Midtrans has the payment settled', async () => {
  const p = await newPass();
  const check = async () => (await (await status(p.id, p.token)).json()).status;
  assert.equal(await check(), 'checking', 'no transaction yet');
  paid[p.id] = { transaction_status: 'pending' };
  assert.equal(await check(), 'checking');
  paid[p.id] = { transaction_status: 'capture', fraud_status: 'challenge' };
  assert.equal(await check(), 'checking');
  paid[p.id] = { transaction_status: 'settlement' };
  const r = await (await status(p.id, p.token)).json();
  assert.deepEqual(r, { id: p.id, eventId: live.id, cat: seat.cat, qty: 1, seat: seat.id, route: 'paid', status: 'confirmed', createdAt: p.createdAt, expiresAt: p.expiresAt });
  paid[p.id] = { transaction_status: 'capture', fraud_status: 'accept' };
  assert.equal(await check(), 'confirmed');
  for (const s of ['expire', 'cancel', 'deny', 'failure', 'refund', 'partial_refund', 'chargeback']) {
    paid[p.id] = { transaction_status: s };
    assert.equal(await check(), 'rejected', s);
  }
});

test('a payment of another amount does not open the pass', async () => {
  const p = await newPass();
  paid[p.id] = { transaction_status: 'settlement', gross_amount: '1.00' };
  assert.equal((await (await status(p.id, p.token)).json()).status, 'rejected');
});

test('an order nobody started paying closes a little after its hour', async () => {
  const p = await newPass(), now = Date.now;
  try {
    Date.now = () => Date.parse(p.createdAt) + 65 * 6e4;
    assert.equal((await (await status(p.id, p.token)).json()).status, 'checking', 'a payment may still be on its way');
    Date.now = () => Date.parse(p.createdAt) + 71 * 6e4;
    assert.equal((await (await status(p.id, p.token)).json()).status, 'rejected');
  } finally { Date.now = now; }
});

test('a pass opens only with its own key', async () => {
  const a = await newPass(), b = await newPass();
  assert.equal((await status(a.id, b.token)).status, 404, 'another pass’s key');
  assert.equal((await status(a.id, '')).status, 404);
  const [body, sig] = a.token.split('.');
  const forged = btoa(JSON.stringify([a.id, live.id, seat.cat, seat.id, Date.now()])).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  assert.equal((await status(a.id, `${forged}.${sig}`)).status, 404, 'changed details');
  assert.equal((await status(a.id, `${body}.${sig.slice(0, -2)}AA`)).status, 404, 'changed signature');
  assert.equal((await status(a.id, a.token, { env: env({ MIDTRANS_SERVER_KEY: 'SB-Mid-server-OTHERKEY987654321' }) })).status, 404, 'another server key');
  assert.equal((await status('PAY-../../x', a.token)).status, 404);
  assert.equal((await req(`/api/passes/${a.id}`, { method: 'POST' })).status, 405);
  assert.ok(calls.every(c => !c.url.includes('/status')), 'Midtrans is asked only for a valid key');
});

// ---------------------------------------------------------------- notifications and the pass email

const MAILING = { RESEND_API_KEY: 're_test_0123456789abcdef' };
const sign = (n, key = KEY) => crypto.createHash('sha512').update(n.order_id + n.status_code + n.gross_amount + key).digest('hex');
const notify = (n, more = {}) => req('/api/midtrans/notify', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ status_code: '200', gross_amount: '25000.00', transaction_status: 'settlement', ...n, signature_key: n.signature_key ?? sign({ status_code: '200', gross_amount: '25000.00', ...n }) }),
  ...more,
});
// An order with the order book and email switched on.
async function mailedOrder(more = {}) {
  const DB = fakeD1(), e = env({ DB, ...MAILING, ...more });
  const p = await (await post(order({ name: '<b>Rani</b> Putri' }), { env: e })).json();
  return { DB, e, p };
}

test('the order book keeps each order, and the config says the email is on', async () => {
  const { DB, e, p } = await mailedOrder();
  assert.equal((await (await req('/api/config', { env: e })).json()).mail, true);
  const [row] = DB.rows();
  assert.equal(row.id, p.id);
  assert.equal(row.email, 'rani@example.com');
  assert.equal(row.status, 'checking');
  assert.equal(row.origin, ORIGIN);
  assert.equal(row.created_at, Date.parse(p.createdAt));
  assert.equal(row.emailed_at, null);
});

test('Midtrans’ signed notification of a paid order sends the pass email, once', async () => {
  const { DB, e, p } = await mailedOrder();
  paid[p.id] = { transaction_status: 'settlement' };
  const r = await notify({ order_id: p.id }, { env: e });
  assert.equal(r.status, 200);
  assert.equal(mails.length, 1);
  const m = mails[0];
  assert.deepEqual(m.to, ['rani@example.com']);
  assert.equal(m.from, 'Atvents <pass@atvents.com>');
  assert.equal(m.reply_to, 'halo@atvents.com');
  assert.equal(m.headers.authorization, `Bearer ${MAILING.RESEND_API_KEY}`);
  assert.match(m.subject, new RegExp(`^Your 3D seat view is open: ${live.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  // The button opens this very pass: its key checks out, for its own seat.
  const link = new RegExp(`${ORIGIN}/#pass-(${p.id})-([A-Za-z0-9_.-]+)`).exec(m.text);
  assert.ok(link, 'the pass link');
  const pass = await readPass(KEY, link[2]);
  assert.equal(pass.id, p.id);
  assert.equal(pass.seat, seat.id);
  assert.ok(m.html.includes(link[0].replace(/&/g, '&amp;')));
  assert.ok(m.html.includes('&lt;b&gt;Rani&lt;/b&gt;') && !m.html.includes('<b>Rani'), 'the name is escaped');
  assert.equal(DB.rows()[0].status, 'confirmed');
  assert.ok(DB.rows()[0].paid_at && DB.rows()[0].emailed_at);

  // Midtrans sends the news again, the page asks: no second email.
  assert.equal((await notify({ order_id: p.id }, { env: e })).status, 200);
  assert.equal((await (await status(p.id, p.token, { env: e })).json()).status, 'confirmed');
  await settled();
  assert.equal(mails.length, 1);
});

test('the page asking is enough to send the email when no notification comes', async () => {
  const { e, p } = await mailedOrder();
  assert.equal((await (await status(p.id, p.token, { env: e })).json()).status, 'checking');
  await settled();
  assert.equal(mails.length, 0, 'nothing before it is paid');
  paid[p.id] = { transaction_status: 'settlement' };
  assert.equal((await (await status(p.id, p.token, { env: e })).json()).status, 'confirmed');
  await settled();
  assert.equal(mails.length, 1);
});

test('a notification counts only with Midtrans’ signature, and the status is read again', async () => {
  const { e, p } = await mailedOrder();
  paid[p.id] = { transaction_status: 'pending' };
  calls = [];
  assert.equal((await notify({ order_id: p.id, signature_key: 'ab'.repeat(64) }, { env: e })).status, 401);
  assert.equal((await notify({ order_id: p.id, signature_key: sign({ order_id: p.id, status_code: '200', gross_amount: '25000.00' }, 'SB-Mid-server-OTHER') }, { env: e })).status, 401);
  assert.equal((await notify({ order_id: p.id, signature_key: '' }, { env: e })).status, 401);
  assert.equal(calls.length, 0, 'an unsigned notification reaches nobody');
  // Signed, saying settlement, while Midtrans itself still says pending: no email.
  assert.equal((await notify({ order_id: p.id }, { env: e })).status, 200);
  assert.equal(mails.length, 0);
  assert.equal((await req('/api/midtrans/notify', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}', env: e })).status, 415);
  assert.equal((await req('/api/midtrans/notify', { env: e })).status, 405);
});

test('a notification for an order that is not in the book is answered and sends nothing', async () => {
  const DB = fakeD1(), e = env({ DB, ...MAILING });
  paid['PAY-ABCDEFGHJKLMNPQR'] = { transaction_status: 'settlement' };
  assert.equal((await notify({ order_id: 'PAY-ABCDEFGHJKLMNPQR' }, { env: e })).status, 200);
  assert.equal((await notify({ order_id: 'ORDER-from-elsewhere' }, { env: e })).status, 200);
  assert.equal(mails.length, 0);
});

test('an email that did not go is tried again on the next notification', async () => {
  const { DB, e, p } = await mailedOrder();
  paid[p.id] = { transaction_status: 'settlement' };
  mailFails = true;
  assert.equal((await notify({ order_id: p.id }, { env: e })).status, 500, 'Midtrans is asked to send it again');
  assert.equal(DB.rows()[0].emailed_at, null);
  assert.ok(logged.some(l => l.includes('not sent')) && logged.every(l => !l.includes(MAILING.RESEND_API_KEY)));
  mailFails = false;
  assert.equal((await notify({ order_id: p.id }, { env: e })).status, 200);
  assert.equal(mails.length, 1);
});

test('without the order book or the email key, payments still work and nothing is sent', async () => {
  const p = await newPass();
  paid[p.id] = { transaction_status: 'settlement' };
  assert.equal((await notify({ order_id: p.id })).status, 200);
  assert.equal((await (await status(p.id, p.token)).json()).status, 'confirmed');
  const { e, p: q } = await mailedOrder({ RESEND_API_KEY: '' });
  paid[q.id] = { transaction_status: 'settlement' };
  assert.equal((await notify({ order_id: q.id }, { env: e })).status, 200);
  await settled();
  assert.equal(mails.length, 0);
});

test('Midtrans sends the fan back to the pass page', async () => {
  const back = await req('/pay/done?order_id=PAY-ABCDEFGHJKLMNPQR&status_code=200&transaction_status=settlement');
  assert.equal(back.status, 303);
  assert.equal(back.headers.get('location'), '/#paid-PAY-ABCDEFGHJKLMNPQR');
  assert.equal((await req('/pay/done?order_id=%3Cscript%3E')).headers.get('location'), '/#passes');
  assert.equal((await req('/pay/done')).headers.get('location'), '/#passes');
});

test('other addresses are not the Worker’s', async () => {
  assert.equal((await req('/api/claims')).status, 404);
  const r = await req('/nothing-here');
  assert.equal(r.status, 404);
  assert.equal(await r.text(), 'static 404');
});

test('the Worker’s seat list is exactly the venues’ seats', () => {
  for (const e of EVENTS) {
    if (!isConcert(e.id)) continue;
    const c = concert(e.id), v = getEvent(e.id);
    assert.deepEqual(Object.keys(c.cats), v.categories.map(x => x.id));
    for (const s of v.seats) {
      assert.ok(seatOf(c, s.cat, s.id), `${e.id} ${s.id}`);
      assert.equal(!!checkClaim({ eventId: e.id, cat: s.cat, seat: s.id, name: 'Ab', email: 'a@b.co', consent: true, requirePayment: false }).claim, true);
    }
    const s = v.seats[0], wrong = v.categories.find(x => x.id !== s.cat);
    if (wrong) assert.equal(seatOf(c, wrong.id, s.id), null, 'a seat in another category');
    assert.equal(seatOf(c, s.cat, `${s.sec}-${s.row}0`), null);
    assert.equal(seatOf(c, s.cat, `${s.sec}-ZZZ1`), null);
  }
});
