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
import { PAY_METHODS } from '../js/paymethods.js';

writeWorkerCatalog(path.resolve(new URL('..', import.meta.url).pathname));
const { default: worker } = await import('../worker/index.mjs');
const { concert, seatOf } = await import('../worker/catalog.mjs');
const { readPass } = await import('../worker/passkey.mjs');

const KEY = 'SB-Mid-server-TESTKEY0123456789abcdef';
const ORIGIN = 'https://atvents.com';
const env = (more = {}) => ({ MIDTRANS_SERVER_KEY: KEY, ASSETS: { fetch: async () => new Response('static 404', { status: 404 }) }, ...more });

// D1 as the Worker uses it (prepare, bind, run, first, batch), on SQLite in memory.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  // A batch runs as one transaction: all of it or none.
  const batch = async list => {
    db.exec('BEGIN');
    try { const out = list.map(s => ({ meta: { changes: Number(db.prepare(s.sql).run(...s.args).changes) } })); db.exec('COMMIT'); return out; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  };
  return { prepare: sql => stmt(sql), batch, rows: () => db.prepare('SELECT * FROM orders').all() };
}

// Midtrans, as far as the Worker sees it: Snap makes a card payment page; the Core API charge
// answers each way to pay as Midtrans' docs show it (or with `chargeAnswer`, when a test sets
// one) and leaves the order pending; cancel closes a pending order ('404' with none, '412'
// once it is closed or paid, or `cancelCode`); the status API answers with whatever is in
// `paid`. Resend takes the emails into `mails`.
let calls, paid, snapFails, mails, mailFails, chargeAnswer, cancelCode;
const API = 'https://api.sandbox.midtrans.com';
function chargeOk(b) {
  const tid = 'a1b2c3d4-0000-4000-8000-123456789abc';
  const base = { status_code: '201', status_message: 'Success', transaction_id: tid, order_id: b.transaction_details.order_id, gross_amount: '25000.00', currency: 'IDR', payment_type: b.payment_type, transaction_status: 'pending' };
  const qr = kind => ({ name: 'generate-qr-code', method: 'GET', url: `${API}/v2/${kind}/${tid}/qr-code` });
  switch (b.payment_type) {
    case 'bank_transfer': return { ...base, va_numbers: [{ bank: b.bank_transfer.bank, va_number: '12345678901' }] };
    case 'permata': return { ...base, permata_va_number: '8562000011112222' };
    case 'echannel': return { ...base, biller_code: '70012', bill_key: '990011223344' };
    case 'qris': return { ...base, actions: [qr('qris')] };
    case 'gopay': return { ...base, actions: [qr('gopay'), { name: 'deeplink-redirect', method: 'GET', url: `gojek://gopay/merchanttransfer?tref=${tid}&amount=25000` }] };
    case 'shopeepay': return { ...base, actions: [{ name: 'deeplink-redirect', method: 'GET', url: `https://wsa.uat.wallet.airpay.co.id/universal-link/wallet/pay?token=${tid}` }] };
    case 'cstore': return { ...base, store: b.cstore.store, payment_code: b.cstore.store === 'alfamart' ? 'ALFA01234567' : '0123456789' };
    default: return { status_code: '402', status_message: 'Payment channel is not activated.' };
  }
}
const igMissing = new Set(['no.such.fan']);
const realFetch = globalThis.fetch, realError = console.error, realLog = console.log;
let logged;
beforeEach(() => {
  calls = []; paid = {}; snapFails = false; logged = []; mails = []; mailFails = false; chargeAnswer = null; cancelCode = null;
  console.error = (...a) => logged.push(a.join(' '));
  console.log = (...a) => logged.push(a.join(' '));
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    // Instagram: every account is there but the ones listed as missing.
    const ig = /^https:\/\/i\.instagram\.com\/api\/v1\/users\/web_profile_info\/\?username=(.+)$/.exec(String(url));
    if (ig) return igMissing.has(decodeURIComponent(ig[1])) ? new Response(null, { status: 404 }) : Response.json({ data: { user: { username: decodeURIComponent(ig[1]), profile_pic_url: `https://scontent.cdninstagram.com/${ig[1]}.jpg` } } });
    if (/^https:\/\/scontent\.cdninstagram\.com\//.test(String(url))) return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } });
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
    if (/^https:\/\/api\.(?:sandbox\.)?midtrans\.com\/v2\/charge$/.test(String(url))) {
      const b = JSON.parse(init.body);
      const a = chargeAnswer ? chargeAnswer(b) : Response.json(chargeOk(b));
      if (!chargeAnswer) paid[b.transaction_details.order_id] = { transaction_status: 'pending' };
      return a;
    }
    const c = /^https:\/\/api\.(?:sandbox\.)?midtrans\.com\/v2\/([^/]+)\/cancel$/.exec(String(url));
    if (c) {
      const id = decodeURIComponent(c[1]), t = paid[id];
      const code = cancelCode || (!t ? '404' : t.transaction_status === 'pending' ? '200' : '412');
      if (code === '200') paid[id] = { transaction_status: 'cancel' };
      return Response.json({ status_code: code, status_message: code === '200' ? 'Success, transaction is canceled' : 'Cannot cancel' });
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
// Every request comes from one device unless a test names another (x-device, js/passes.js).
const DEVICE = 'device-aaaaaaaaaaaaaaaa';
const req = (p, init = {}) => worker.fetch(new Request(`${ORIGIN}${p}`, { ...init, headers: { 'x-device': DEVICE, ...init.headers } }), init.env || env(), ctx);
const post = (body, { headers = {}, ...more } = {}) => req('/api/payments', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), ...more,
});

// A real seat of a concert on sale, and an order for it, paid by card unless a test says.
const live = EVENTS.find(e => isConcert(e.id) && concert(e.id) && concert(e.id).start > Date.now());
const venue = getEvent(live.id), seat = venue.seats[Math.floor(venue.seats.length / 2)];
const order = (more = {}) => ({ eventId: live.id, cat: seat.cat, seat: seat.id, name: 'Rani Putri', email: 'Rani@Example.com', consent: true, method: 'card', ...more });

test('payments stay off until the server key is set', async () => {
  assert.equal((await req('/api/config', { env: env({ MIDTRANS_SERVER_KEY: '' }) })).status, 404);
  assert.equal((await post(order(), { env: env({ MIDTRANS_SERVER_KEY: undefined }) })).status, 503);
  const c = await (await req('/api/config')).json();
  assert.deepEqual(c, { mode: 'pay', provider: 'midtrans', sandbox: true, fee: 25000, plus: 50000, upgrade: 25000, mail: false, methods: PAY_METHODS.map(m => m.id), sso: {} });
  assert.equal((await (await req('/api/config', { env: env({ MIDTRANS_SERVER_KEY: 'Mid-server-LIVEKEY0123456789' }) })).json()).sandbox, false);
  assert.equal((await (await req('/api/config', { env: env({ MIDTRANS_ENV: 'production' }) })).json()).sandbox, false);
  const tilde = 'SB-Mid-server-abcdEFGH1234ijkl~mnopQRST';
  assert.equal((await req('/api/config', { env: env({ MIDTRANS_SERVER_KEY: tilde }) })).status, 200, 'a key from the newer Access keys page');
  assert.equal((await req('/api/config', { env: env({ MIDTRANS_SERVER_KEY: 'SB-Mid-server-has a space' }) })).status, 404);
});

test('the sign-in buttons get their client ids from the dashboard, and only ids that look right', async () => {
  const sso = async more => (await (await req('/api/config', { env: env(more) })).json()).sso;
  const google = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com', microsoft = '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0';
  assert.deepEqual(await sso({ GOOGLE_CLIENT_ID: google, MICROSOFT_CLIENT_ID: microsoft }), { google, microsoft });
  assert.deepEqual(await sso({ GOOGLE_CLIENT_ID: google }), { google });
  assert.deepEqual(await sso({ GOOGLE_CLIENT_ID: 'GOCSPX-a-client-secret' }), {}, 'a secret pasted by mistake is never sent');
});

test('MIDTRANS_METHODS narrows the ways to pay, and a list with none the checkout knows means all', async () => {
  const methods = async v => (await (await req('/api/config', { env: env({ MIDTRANS_METHODS: v }) })).json()).methods;
  assert.deepEqual(await methods(' BCA, qris ,paypal'), ['qris', 'bca']);
  assert.deepEqual(await methods('paypal'), PAY_METHODS.map(m => m.id));
  assert.deepEqual(await methods(''), PAY_METHODS.map(m => m.id));
});

test('a card order makes a Snap payment at the access fee and gives back a waiting pass', async () => {
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
  assert.equal(p.method, 'card');
  assert.deepEqual(body.enabled_payments, ['credit_card'], 'Snap shows the card form alone');
  assert.equal(body.credit_card.secure, true);
  assert.ok(!calls.some(c => c.url.endsWith('/v2/charge')));
  assert.equal(p.email, 'rani@example.com');
  assert.ok(!JSON.stringify(p).includes(KEY));
});

test('the payment form opens inside the page with a client key, never a Sandbox one in production', async () => {
  const cfg = async more => (await (await req('/api/config', { env: env(more) })).json()).clientKey;
  assert.equal(await cfg({}), undefined);
  assert.equal(await cfg({ MIDTRANS_CLIENT_KEY: 'SB-Mid-client-abcdEFGH1234' }), 'SB-Mid-client-abcdEFGH1234');
  assert.equal(await cfg({ MIDTRANS_CLIENT_KEY: 'Mid-client-abcdEFGH1234' }), 'Mid-client-abcdEFGH1234', 'newer Sandbox accounts have no SB- on the client key');
  assert.equal(await cfg({ MIDTRANS_SERVER_KEY: 'Mid-server-LIVEKEY0123456789', MIDTRANS_CLIENT_KEY: 'SB-Mid-client-abcdEFGH1234' }), undefined, 'a Sandbox client key with a production server key');
  assert.equal(await cfg({ MIDTRANS_SERVER_KEY: 'Mid-server-LIVEKEY0123456789', MIDTRANS_CLIENT_KEY: 'Mid-client-abcdEFGH1234' }), 'Mid-client-abcdEFGH1234');
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
    [order({ method: undefined }), 'method'],
    [order({ method: 'paypal' }), 'method'],
    [order({ method: '__proto__' }), 'method'],
  ];
  for (const [o, field] of cases) {
    const r = await post(o);
    assert.equal(r.status, 400, JSON.stringify(o));
    assert.equal((await r.json()).field, field);
  }
  assert.equal(calls.length, 0, 'nothing reached Midtrans');
});

// What each way to pay sends Midtrans, and what the page gets back to pay with.
const WAYS = {
  qris: [{ payment_type: 'qris', qris: { acquirer: 'gopay' } }, { qr: `${API}/v2/qris/a1b2c3d4-0000-4000-8000-123456789abc/qr-code` }],
  gopay: [{ payment_type: 'gopay', gopay: { enable_callback: true, callback_url: `${ORIGIN}/pay/done` } }, { qr: `${API}/v2/gopay/a1b2c3d4-0000-4000-8000-123456789abc/qr-code`, app: 'gojek://gopay/merchanttransfer?tref=a1b2c3d4-0000-4000-8000-123456789abc&amount=25000' }],
  shopeepay: [{ payment_type: 'shopeepay', shopeepay: { callback_url: `${ORIGIN}/pay/done` } }, { qr: '', app: 'https://wsa.uat.wallet.airpay.co.id/universal-link/wallet/pay?token=a1b2c3d4-0000-4000-8000-123456789abc' }],
  bca: [{ payment_type: 'bank_transfer', bank_transfer: { bank: 'bca' } }, { va: '12345678901' }],
  bni: [{ payment_type: 'bank_transfer', bank_transfer: { bank: 'bni' } }, { va: '12345678901' }],
  bri: [{ payment_type: 'bank_transfer', bank_transfer: { bank: 'bri' } }, { va: '12345678901' }],
  cimb: [{ payment_type: 'bank_transfer', bank_transfer: { bank: 'cimb' } }, { va: '12345678901' }],
  permata: [{ payment_type: 'permata' }, { va: '8562000011112222' }],
  mandiri: [{ payment_type: 'echannel' }, { billerCode: '70012', billKey: '990011223344' }],
  alfamart: [{ payment_type: 'cstore', cstore: { store: 'alfamart', alfamart_free_text_1: '3D seat view, Atvents' } }, { code: 'ALFA01234567' }],
  indomaret: [{ payment_type: 'cstore', cstore: { store: 'indomaret', message: '3D seat view, Atvents' } }, { code: '0123456789' }],
};

test('every way but the card is a Core API charge, and the page gets what to pay with', async () => {
  assert.deepEqual(Object.keys(WAYS).sort(), PAY_METHODS.filter(m => m.kind !== 'card').map(m => m.id).sort());
  for (const [method, [sent, got]] of Object.entries(WAYS)) {
    calls = [];
    const r = await post(order({ method }));
    assert.equal(r.status, 201, method);
    const p = await r.json();
    assert.equal(p.method, method);
    assert.deepEqual(p.pay, got, method);
    assert.equal(p.snap, undefined);
    assert.equal(p.url, undefined);
    assert.equal(calls.length, 1, 'one call: the charge');
    const [c] = calls;
    assert.equal(c.url, `${API}/v2/charge`);
    assert.equal(c.init.headers.authorization, `Basic ${btoa(`${KEY}:`)}`);
    assert.equal(c.init.headers['x-append-notification'], `${ORIGIN}/api/midtrans/notify`);
    const body = JSON.parse(c.init.body);
    for (const [k, v] of Object.entries(sent)) {
      if (k === 'echannel') continue;
      assert.deepEqual(body[k], v, `${method} ${k}`);
    }
    if (method === 'mandiri') assert.ok(body.echannel.bill_info1.length <= 10 && body.echannel.bill_info2.length <= 30, 'Mandiri’s bill lines fit');
    assert.deepEqual(body.transaction_details, { order_id: p.id, gross_amount: 25000 });
    assert.equal(body.item_details.reduce((a, i) => a + i.price * i.quantity, 0), 25000);
    assert.deepEqual(body.customer_details, { first_name: 'Rani Putri', email: 'rani@example.com' });
    assert.equal(body.custom_expiry.expiry_duration, 60);
    assert.equal(body.custom_expiry.unit, 'minute');
    assert.ok(Math.abs(Date.parse(body.custom_expiry.order_time.replace(' ', 'T').replace(' +0700', '+07:00')) - Date.parse(p.createdAt)) < 1000);
    assert.equal(Date.parse(p.expiresAt) - Date.parse(p.createdAt), 36e5);
  }
});

test('a way the Worker has switched off is refused before Midtrans hears of it', async () => {
  const r = await post(order({ method: 'qris' }), { env: env({ MIDTRANS_METHODS: 'bca,card' }) });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).field, 'method');
  assert.equal(calls.length, 0);
});

test('a channel Midtrans refuses asks for another way; an answer the page cannot use is a 502', async () => {
  chargeAnswer = () => Response.json({ status_code: '402', status_message: 'Payment channel is not activated.' });
  let r = await post(order({ method: 'qris' }));
  assert.equal(r.status, 409);
  const e = await r.json();
  assert.equal(e.field, 'method');
  assert.match(e.error, /^QRIS is not open right now/);

  chargeAnswer = () => Response.json({ status_code: '500', status_message: 'Sorry, we encountered internal server error.' }, { status: 500 });
  assert.equal((await post(order({ method: 'bca' }))).status, 502, 'Midtrans down');

  // Answers that look paid-for but carry nothing safe to show: a QR code from another host,
  // a wallet link to anywhere else, an account number that is not digits, no store code.
  const bad = [
    ['qris', b => ({ ...chargeOk(b), actions: [{ name: 'generate-qr-code', url: 'https://evil.example/qr-code' }] })],
    ['gopay', b => ({ ...chargeOk(b), actions: [{ name: 'deeplink-redirect', url: 'javascript:alert(1)' }] })],
    ['shopeepay', b => ({ ...chargeOk(b), actions: [{ name: 'deeplink-redirect', url: 'https://airpay.co.id.evil.example/pay' }] })],
    ['bca', b => ({ ...chargeOk(b), va_numbers: [{ bank: 'bca', va_number: '1234<script>' }] })],
    ['mandiri', b => ({ ...chargeOk(b), bill_key: '' })],
    ['alfamart', b => ({ ...chargeOk(b), payment_code: 'ALFA "1"' })],
  ];
  for (const [method, answer] of bad) {
    chargeAnswer = b => Response.json(answer(b));
    r = await post(order({ method }));
    assert.equal(r.status, 502, method);
    const text = await r.text();
    assert.ok(!text.includes('evil') && !text.includes('script'), method);
  }
  assert.ok(logged.every(l => !l.includes(KEY) && !l.includes(btoa(`${KEY}:`))));
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
  assert.deepEqual(r, { id: p.id, eventId: live.id, cat: seat.cat, qty: 1, seat: seat.id, route: 'paid', plan: 'seat', status: 'confirmed', createdAt: p.createdAt, expiresAt: p.expiresAt, wa: null });
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

// ---------------------------------------------------------------- another way to pay

const cancel = (id, token, more = {}) => req(`/api/passes/${id}/cancel`, { method: 'POST', headers: { 'x-pass-token': token, origin: ORIGIN, ...more.headers }, ...more });

test('choosing another way closes the order at Midtrans first', async () => {
  const p = await (await post(order({ method: 'bca' }))).json();
  calls = [];
  const r = await cancel(p.id, p.token);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'rejected');
  assert.equal(calls[0].url, `${API}/v2/${p.id}/cancel`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(paid[p.id].transaction_status, 'cancel');

  // A card form nobody used has no transaction at Midtrans: nothing to close.
  const q = await newPass();
  assert.equal((await (await cancel(q.id, q.token)).json()).status, 'rejected');
});

test('an order paid before it could be closed opens its pass instead', async () => {
  const { e, p } = await mailedOrder();
  paid[p.id] = { transaction_status: 'settlement' };
  const r = await cancel(p.id, p.token, { env: e });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'confirmed');
  await settled();
  assert.equal(mails.length, 1, 'and its email goes');
});

test('an order Midtrans would not close stays as it is, and the page is told to try again', async () => {
  const p = await (await post(order({ method: 'alfamart' }))).json();
  cancelCode = '412';
  const r = await cancel(p.id, p.token);
  assert.equal(r.status, 409);
  assert.equal(paid[p.id].transaction_status, 'pending');
});

test('only the site, with the pass key, can close an order', async () => {
  const p = await (await post(order({ method: 'bca' }))).json(), other = await newPass();
  calls = [];
  assert.equal((await cancel(p.id, p.token, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await cancel(p.id, other.token)).status, 404);
  assert.equal((await cancel(p.id, '')).status, 404);
  assert.equal((await cancel('PAY-../../x', p.token)).status, 404);
  assert.equal((await req(`/api/passes/${p.id}/cancel`, { headers: { 'x-pass-token': p.token } })).status, 405);
  assert.equal((await cancel(p.id, p.token, { env: env({ STATUS_LIMIT: { limit: async () => ({ success: false }) } }) })).status, 429);
  assert.equal(calls.length, 0, 'Midtrans is not asked');
  assert.equal(paid[p.id].transaction_status, 'pending');
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
  assert.equal(row.method, 'card');
  assert.equal(row.created_at, Date.parse(p.createdAt));
  assert.equal(row.emailed_at, null);
});

test('an order book made before the way to pay was kept gets its column', async () => {
  const DB = fakeD1();
  await DB.prepare(`CREATE TABLE orders (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, title TEXT NOT NULL, cat TEXT NOT NULL, seat TEXT NOT NULL,
    seat_label TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'checking',
    origin TEXT NOT NULL, created_at INTEGER NOT NULL, paid_at INTEGER, emailed_at INTEGER)`).run();
  const p = await (await post(order({ method: 'bca' }), { env: env({ DB, ...MAILING }) })).json();
  const [row] = DB.rows();
  assert.equal(row.id, p.id);
  assert.equal(row.method, 'bca');
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
  // The concert's poster and the logo, from the site's own address; the way it was paid.
  const poster = concert(live.id).poster;
  assert.match(poster.src, /^assets\/mail\/[\w.-]+\.jpg$/);
  assert.ok(m.html.includes(`src="${ORIGIN}/${poster.src}"`), 'the poster');
  assert.ok(m.html.includes(`src="${ORIGIN}/assets/mail/atvents-logo.png"`), 'the logo');
  assert.ok(m.html.includes('Credit or debit card') && m.text.includes('Paid with: Credit or debit card'));
  assert.ok(m.text.includes(`Seat: ${DB.rows()[0].seat_label}`));
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

test('with a signature key set, a notification signed with it counts, and one signed with the server key still does', async () => {
  const SIG = 'SB-Mid-signature-abcd1234~efgh5678';
  const { e, p } = await mailedOrder({ MIDTRANS_SIGNATURE_KEY: SIG });
  paid[p.id] = { transaction_status: 'settlement' };
  const n = { order_id: p.id, status_code: '200', gross_amount: '25000.00' };
  assert.equal((await notify({ ...n, signature_key: sign(n, 'SB-Mid-signature-OTHER') }, { env: e })).status, 401);
  assert.equal((await notify({ ...n, signature_key: sign(n, SIG) }, { env: e })).status, 200);
  assert.equal((await notify({ ...n, signature_key: sign(n, KEY) }, { env: e })).status, 200);
  assert.equal(mails.length, 1, 'one email, however many notifications');
  const c = await (await req('/api/config', { env: e })).text();
  assert.ok(!c.includes(SIG) && !c.includes(KEY), 'neither key reaches the browser');
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

// ---------------------------------------------------------------- seat mates

const WA = 'https://chat.whatsapp.com/AbCdEfGhIj123456';
const mates = (p, { method = 'GET', body, env: e, headers = {} } = {}) => req(`/api/passes/${p.id}/fans`, {
  method, env: e,
  headers: { 'x-pass-token': p.token, origin: ORIGIN, ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined,
});

test('seat mates: only a paid pass gets in, and a fan shows only what they chose, after ticking the box', async () => {
  const DB = fakeD1(), e = env({ DB, FANBASE_WA: WA });
  const a = await (await post(order(), { env: e })).json();
  const other = venue.seats.find(s => s.cat === seat.cat && s.id !== seat.id);
  const b = await (await post(order({ seat: other.id, name: 'Dimas Arya', email: 'dimas@example.com' }), { env: e })).json();

  // Not paid yet: nothing, not even the group link.
  let r = await mates(a, { env: e });
  assert.equal(r.status, 403);
  assert.equal((await r.text()).includes('whatsapp'), false);
  // A wrong key gets nothing either.
  assert.equal((await mates({ id: a.id, token: b.token }, { env: e })).status, 404);

  paid[a.id] = { transaction_status: 'settlement' };
  paid[b.id] = { transaction_status: 'settlement' };
  r = await mates(a, { env: e });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { eventId: live.id, group: '', community: WA, me: null, mineSeat: null, fans: [], others: [] });
  await settled();

  // Without the box ticked, or with no Instagram, nothing is saved.
  assert.equal((await mates(a, { env: e, method: 'PUT', body: { name: 'Rani', instagram: '@rani.p' } })).status, 400);
  const bad = await mates(a, { env: e, method: 'PUT', body: { name: 'Rani', instagram: 'not a handle!', consent: true } });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).field, 'instagram');
  // Another site's page cannot set it.
  assert.equal((await mates(a, { env: e, method: 'PUT', body: { name: 'Rani', instagram: '@rani.p', consent: true }, headers: { origin: 'https://evil.example' } })).status, 403);
  // Saving never asks Instagram whether the account is there.
  const before = calls.length;
  assert.equal((await mates(a, { env: e, method: 'PUT', body: { name: 'Rani', instagram: '@no.such.fan', consent: true } })).status, 200);
  assert.equal(calls.slice(before).some(c => c.url.includes('instagram.com')), false);

  r = await mates(a, { env: e, method: 'PUT', body: { name: 'Rani', instagram: 'https://www.instagram.com/Rani.P/', consent: true } });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).me, { name: 'Rani', instagram: 'rani.p' });

  // The other fan sees Rani's seat, name and Instagram, and nothing else of her order.
  const seen = await (await mates(b, { env: e })).json();
  assert.deepEqual(seen.fans, [{ seat: seat.id, cat: seat.cat, name: 'Rani', instagram: 'rani.p' }]);
  const text = JSON.stringify(seen);
  for (const secret of [a.id, 'rani@example.com', 'Rani Putri']) assert.equal(text.includes(secret), false, secret);

  // Taken down: gone for everyone.
  r = await mates(a, { env: e, method: 'DELETE' });
  assert.equal((await r.json()).me, null);
  assert.deepEqual((await (await mates(b, { env: e })).json()).fans, []);
});

test('seat mates: one seat shows one Instagram, the first fan to put theirs there', async () => {
  const DB = fakeD1(), e = env({ DB, FANBASE_WA: WA });
  const a = await (await post(order(), { env: e })).json();
  const b = await (await post(order({ name: 'Dimas Arya', email: 'dimas@example.com' }), { env: e })).json();
  assert.ok(a.id && b.id && a.id !== b.id, 'two passes for the same seat');
  paid[a.id] = { transaction_status: 'settlement' };
  paid[b.id] = { transaction_status: 'settlement' };
  const show = (p, instagram) => mates(p, { env: e, method: 'PUT', body: { name: 'Fan', instagram, consent: true } });
  assert.equal((await show(a, '@rani.p')).status, 200);
  // The second pass on that seat is told no, and the seat keeps the first fan.
  const r = await show(b, '@dimas.a');
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /One seat shows one Instagram/);
  const seen = await (await mates(b, { env: e })).json();
  assert.deepEqual(seen.fans.map(f => f.instagram), ['rani.p']);
  assert.equal(seen.me, null);
  // The first fan can still change theirs; once they delete it, the seat is free.
  assert.equal((await show(a, '@rani.putri')).status, 200);
  await mates(a, { env: e, method: 'DELETE' });
  assert.equal((await show(b, '@dimas.a')).status, 200);
  await settled();
});

test('a paid pass gets the WhatsApp links: the concert\'s fanbase group and the community, in the answer and the email', async () => {
  const GROUP = 'https://chat.whatsapp.com/DewaDewa19Group', COMMUNITY = 'https://chat.whatsapp.com/KHrYTEwiAhnEjN4eMuOSio';
  const DB = fakeD1(), e = env({ DB, ...MAILING, FANBASE_WA: JSON.stringify({ '*': COMMUNITY, [live.id]: GROUP }) });
  const p = await (await post(order(), { env: e })).json();
  // Not paid: no links.
  assert.equal((await (await status(p.id, p.token, { env: e })).json()).wa, undefined);
  paid[p.id] = { transaction_status: 'settlement' };
  assert.deepEqual((await (await status(p.id, p.token, { env: e })).json()).wa, { group: GROUP, community: COMMUNITY });
  await settled();
  assert.equal(mails.length, 1);
  assert.ok(mails[0].html.includes(GROUP) && mails[0].html.includes(COMMUNITY));
  assert.ok(mails[0].text.includes(GROUP) && mails[0].text.includes(COMMUNITY));
  const m = await (await mates(p, { env: e })).json();
  assert.equal(m.group, GROUP);
  assert.equal(m.community, COMMUNITY);
});

test('the WhatsApp links: one link is the community, JSON sets a group per concert, and only WhatsApp invites count', async () => {
  const { waLinksFor } = await import('../js/fanrules.js');
  const C = 'https://chat.whatsapp.com/KHrYTEwiAhnEjN4eMuOSio', G = 'https://chat.whatsapp.com/DewaDewa19Group';
  assert.deepEqual(waLinksFor(C, 'x'), { group: '', community: C });
  assert.deepEqual(waLinksFor(JSON.stringify({ '*': C, x: G }), 'x'), { group: G, community: C });
  assert.deepEqual(waLinksFor(JSON.stringify({ '*': C, x: G }), 'y'), { group: '', community: C });
  assert.deepEqual(waLinksFor(JSON.stringify({ '*': 'https://evil.example/join', x: 'http://chat.whatsapp.com/AbCdEfGhIj12' }), 'x'), { group: '', community: '' });
  assert.deepEqual(waLinksFor('', 'x'), { group: '', community: '' });
  assert.deepEqual(waLinksFor('{oops', 'x'), { group: '', community: '' });
});

test('seat mates stay off without the order book', async () => {
  const p = await newPass();
  paid[p.id] = { transaction_status: 'settlement' };
  assert.equal((await mates(p)).status, 503);
});

test('seat mates: a fan sees only the seat mates of their own category', async () => {
  const DB = fakeD1(), e = env({ DB });
  const otherCat = venue.seats.find(s => s.cat !== seat.cat && !s.standing && seatOf(concert(live.id), s.cat, s.id));
  const sameCat = venue.seats.find(s => s.cat === seat.cat && s.id !== seat.id);
  const a = await (await post(order(), { env: e })).json();
  const b = await (await post(order({ cat: otherCat.cat, seat: otherCat.id, name: 'Dimas Arya', email: 'dimas@example.com' }), { env: e })).json();
  const c = await (await post(order({ seat: sameCat.id, name: 'Salsa Bila', email: 'salsa@example.com' }), { env: e })).json();
  for (const p of [a, b, c]) paid[p.id] = { transaction_status: 'settlement' };
  const show = (p, name, instagram) => mates(p, { env: e, method: 'PUT', body: { name, instagram, consent: true } });
  assert.equal((await show(a, 'Rani', 'rani.p')).status, 200);
  assert.equal((await show(b, 'Dimas', 'dimas.arya')).status, 200);

  // Salsa (same category as Rani) sees Rani, not Dimas.
  const seenByC = (await (await mates(c, { env: e })).json()).fans;
  assert.deepEqual(seenByC.map(f => f.instagram), ['rani.p']);
  // Dimas, in another category, sees only himself.
  const seenByB = await (await mates(b, { env: e })).json();
  assert.deepEqual(seenByB.fans.map(f => f.instagram), ['dimas.arya']);
  assert.equal(JSON.stringify(seenByB).includes('rani'), false);
  assert.equal(JSON.stringify(seenByB).includes('Rani'), false);
  // ...but he sees that someone sits in Rani's block: a count per block, with one seat in it
  // and the category, never a name.
  assert.deepEqual(seenByB.others, [{ seat: seat.id, cat: seat.cat, n: 1 }]);
  assert.deepEqual(seenByC.length, 1);
  // Their Instagram picture: for a fan in the same category only.
  const pic = (p, h) => req(`/api/passes/${p.id}/fans/pic/${h}`, { env: e, headers: { 'x-pass-token': p.token } });
  const got = await pic(c, 'rani.p');
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/jpeg');
  assert.equal((await pic(b, 'rani.p')).status, 404);
  assert.equal((await pic(c, 'someone.else')).status, 404);
  await settled();
});

// ---------------------------------------------------------------- many fans at once

test('a crowd: a paid pass in the order book is answered without asking Midtrans again', async () => {
  const DB = fakeD1(), e = env({ DB });
  const a = await (await post(order(), { env: e })).json();
  paid[a.id] = { transaction_status: 'settlement' };
  const ask = () => req(`/api/passes/${a.id}`, { env: e, headers: { 'x-pass-token': a.token } });
  assert.equal((await (await ask()).json()).status, 'confirmed');
  await settled();
  calls = [];
  for (let i = 0; i < 5; i++) assert.equal((await (await ask()).json()).status, 'confirmed');
  await settled();
  assert.equal(calls.filter(c => c.url.includes('/status')).length, 0, 'Midtrans is not asked once the book says paid');
});

test('a crowd: seat mates send only a version when the list has not changed, and survive D1 going down', async () => {
  const DB = fakeD1(), e = env({ DB, FANBASE_WA: WA });
  const a = await (await post(order(), { env: e })).json();
  const other = venue.seats.find(s => s.cat === seat.cat && s.id !== seat.id);
  const b = await (await post(order({ seat: other.id, name: 'Dimas Arya', email: 'dimas@example.com' }), { env: e })).json();
  paid[a.id] = { transaction_status: 'settlement' };
  paid[b.id] = { transaction_status: 'settlement' };
  await mates(a, { env: e, method: 'PUT', body: { name: 'Rani', instagram: 'rani.p', consent: true } });
  let r = await mates(b, { env: e });
  assert.equal(r.status, 200);
  const v = r.headers.get('x-fans-version');
  assert.ok(v);
  // Same list: 204, no body.
  r = await mates(b, { env: e, headers: { 'x-fans-have': v } });
  assert.equal(r.status, 204);
  assert.equal(await r.text(), '');
  // A change shows straight away, with a new version.
  await mates(a, { env: e, method: 'DELETE' });
  r = await mates(b, { env: e, headers: { 'x-fans-have': v } });
  assert.equal(r.status, 200);
  assert.notEqual(r.headers.get('x-fans-version'), v);
  assert.deepEqual((await r.json()).fans, []);
  await settled();
  // D1 stops answering: the last list keeps being served (once it is past its few seconds).
  const realPrepare = DB.prepare.bind(DB);
  DB.prepare = () => { throw new Error('D1 is down'); };
  await new Promise(res => setTimeout(res, 4100));
  r = await mates(b, { env: e });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).fans, []);
  DB.prepare = realPrepare;
});

test('a crowd: the limiter counts per pass, so fans sharing one address do not block each other', async () => {
  const seen = [];
  const LIM = { limit: async ({ key }) => { seen.push(key); return { success: seen.filter(k => k === key).length <= 2 }; } };
  const DB = fakeD1(), e = env({ DB, FANBASE_WA: WA, FANS_LIMIT: LIM });
  const a = await (await post(order(), { env: e })).json();
  const other = venue.seats.find(s => s.cat === seat.cat && s.id !== seat.id);
  const b = await (await post(order({ seat: other.id, name: 'Dimas Arya', email: 'dimas@example.com' }), { env: e })).json();
  paid[a.id] = { transaction_status: 'settlement' };
  paid[b.id] = { transaction_status: 'settlement' };
  const ip = { 'cf-connecting-ip': '114.4.4.4' };
  assert.equal((await mates(a, { env: e, headers: ip })).status, 200);
  assert.equal((await mates(a, { env: e, headers: ip })).status, 200);
  const third = await mates(a, { env: e, headers: ip });
  assert.equal(third.status, 429);
  assert.equal(third.headers.get('retry-after'), '30');
  // Same address, another fan: still in.
  assert.equal((await mates(b, { env: e, headers: ip })).status, 200);
  // A broken limiter lets fans through.
  const e2 = env({ DB, FANBASE_WA: WA, FANS_LIMIT: { limit: async () => { throw new Error('limiter down'); } } });
  assert.equal((await mates(b, { env: e2, headers: ip })).status, 200);
});

test('a crowd: 300 fans asking at the same moment read the concert list from D1 once', async () => {
  const DB = fakeD1(), e = env({ DB, FANBASE_WA: WA });
  let fanReads = 0;
  const prepare = DB.prepare;
  DB.prepare = sql => { if (/FROM fans WHERE event_id = \? ORDER BY/.test(sql)) fanReads++; return prepare(sql); };
  const seats = venue.seats.filter((s, i) => i % 7 === 0).slice(0, 300);
  const fans = [];
  for (const s of seats) {
    const p = await (await post(order({ cat: s.cat, seat: s.id, email: `f${fans.length}@example.com` }), { env: e })).json();
    paid[p.id] = { transaction_status: 'settlement' };
    fans.push(p);
  }
  await settled();
  // Each pass's first ask confirms it is paid; then all 300 ask together.
  await Promise.all(fans.map(p => mates(p, { env: e })));
  fanReads = 0;
  const t0 = performance.now();
  const answers = await Promise.all(fans.map(p => mates(p, { env: e })));
  const ms = performance.now() - t0;
  assert.ok(answers.every(r => r.status === 200));
  assert.ok(fanReads <= 1, `D1 read ${fanReads} times`);
  console.info(`300 fans at once: ${ms.toFixed(0)} ms, ${fanReads} D1 read`);
});

// ---------------------------------------------------------------- a pass and its devices

const onDevice = (dev, p, e, path = '', init = {}) => req(`/api/passes/${p.id}${path}`, {
  env: e, ...init, headers: { 'x-pass-token': p.token, 'x-device': dev, origin: ORIGIN, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
});
const PHONE = 'device-bbbbbbbbbbbbbbbb', FRIEND = 'device-cccccccccccccccc', TABLET = 'device-dddddddddddddddd';

test('a paid pass opens on two devices; a third gets in only with the code emailed to the buyer', async () => {
  const { DB, e, p } = await mailedOrder();
  paid[p.id] = { transaction_status: 'settlement' };
  // The device that paid, then the phone the email is opened on.
  assert.equal((await (await onDevice(DEVICE, p, e)).json()).status, 'confirmed');
  assert.equal((await (await onDevice(PHONE, p, e)).json()).status, 'confirmed');
  await settled();
  mails = [];
  // The link passed on to a friend: not a third device.
  const r = await onDevice(FRIEND, p, e);
  assert.equal(r.status, 403);
  const body = await r.json();
  assert.equal(body.code, 'device');
  assert.equal(body.email, 'r***@example.com');
  assert.equal(body.mail, true);
  assert.equal(body.status, undefined, 'no pass details for the third device');
  // No header at all: no way round it.
  assert.equal((await req(`/api/passes/${p.id}`, { env: e, headers: { 'x-pass-token': p.token, 'x-device': '' } })).status, 403);
  // Seat mates are closed to it too.
  assert.equal((await onDevice(FRIEND, p, e, '/fans')).status, 403);

  // The code goes to the buyer, never to the device asking.
  const sent = await onDevice(FRIEND, p, e, '/code', { method: 'POST' });
  assert.equal(sent.status, 200);
  const s = await sent.json();
  assert.deepEqual(s, { ok: true, sent: true, email: 'r***@example.com', minutes: 15 });
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, ['rani@example.com']);
  const code = /\b(\d{6})\b/.exec(mails[0].text)[1];
  assert.ok(!JSON.stringify(s).includes(code));
  // Asking again at once sends nothing.
  assert.equal((await onDevice(FRIEND, p, e, '/code', { method: 'POST' })).status, 429);
  assert.equal(mails.length, 1);
  // Only the device that asked can use it.
  assert.equal((await onDevice(TABLET, p, e, '/device', { method: 'POST', body: JSON.stringify({ code }) })).status, 400);
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal((await (await onDevice(FRIEND, p, e, '/device', { method: 'POST', body: JSON.stringify({ code: wrong }) })).json()).field, 'code');
  const ok = await onDevice(FRIEND, p, e, '/device', { method: 'POST', body: JSON.stringify({ code: code.slice(0, 3) + ' ' + code.slice(3) }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).status, 'confirmed');
  // The code is used up; the device used least recently is signed out, the other stays.
  assert.equal((await onDevice(TABLET, p, e, '/device', { method: 'POST', body: JSON.stringify({ code }) })).status, 400);
  const devices = DB.prepare('SELECT device FROM pass_devices WHERE order_id = ?').bind(p.id);
  assert.equal((await devices.all()).results.length, 2);
  assert.equal((await onDevice(FRIEND, p, e)).status, 200);
});

test('a code runs out after five wrong tries and after fifteen minutes', async () => {
  const { e, p } = await mailedOrder();
  paid[p.id] = { transaction_status: 'settlement' };
  await onDevice(DEVICE, p, e); await onDevice(PHONE, p, e); await settled();
  mails = [];
  await onDevice(FRIEND, p, e, '/code', { method: 'POST' });
  const code = /\b(\d{6})\b/.exec(mails[0].text)[1], wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await onDevice(FRIEND, p, e, '/device', { method: 'POST', body: JSON.stringify({ code: wrong }) });
  const r = await (await onDevice(FRIEND, p, e, '/device', { method: 'POST', body: JSON.stringify({ code }) })).json();
  assert.equal(r.expired, true, 'the right code no longer works');
  assert.equal((await onDevice(FRIEND, p, e)).status, 403);
});

test('an unpaid pass sends no code, and an unpaid pass is not held to its devices', async () => {
  const { e, p } = await mailedOrder();
  assert.equal((await onDevice(FRIEND, p, e, '/code', { method: 'POST' })).status, 403);
  assert.equal(mails.length, 0);
  for (const d of [PHONE, FRIEND, TABLET]) assert.equal((await (await onDevice(d, p, e)).json()).status, 'checking');
});

test('a pass the admin takes back closes, whatever Midtrans says after', async () => {
  const { DB, e, p } = await mailedOrder();
  paid[p.id] = { transaction_status: 'settlement' };
  assert.equal((await (await onDevice(DEVICE, p, e)).json()).status, 'confirmed');
  await settled();
  await DB.prepare("UPDATE orders SET status = 'revoked' WHERE id = ?").bind(p.id).run();
  assert.equal((await (await onDevice(DEVICE, p, e)).json()).status, 'rejected');
  assert.equal((await notify({ order_id: p.id }, { env: e })).status, 200);
  assert.equal(DB.rows()[0].status, 'revoked');
  assert.equal((await (await onDevice(DEVICE, p, e)).json()).status, 'rejected');
});

test('a paid pass stays open after its show', async () => {
  const { e, p } = await mailedOrder();
  paid[p.id] = { transaction_status: 'settlement' };
  const realNow = Date.now;
  try {
    Date.now = () => concert(live.id).start + 400 * 864e5;
    assert.equal((await (await onDevice(DEVICE, p, e)).json()).status, 'confirmed');
    await settled();
  } finally { Date.now = realNow; }
});

// ---------------------------------------------------------------- 3D Pass Plus

const PLUS = { PASS_PLUS: 'on' };

test('3D Pass Plus is coming soon until PASS_PLUS is on', async () => {
  assert.equal((await (await req('/api/config')).json()).plusOn, undefined);
  assert.equal((await (await req('/api/config', { env: env(PLUS) })).json()).plusOn, true);
  const r = await post(order({ plan: 'plus' }));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).field, 'plan');
  assert.equal((await post(order({ upgrade: 'PAY-AAAAAAAAAAAAAAAA', upgradeToken: 'x' }))).status, 400);
  assert.ok(!calls.some(c => /midtrans/.test(c.url)), 'Midtrans never hears of it');
});

test('a Plus order is charged at the Plus fee, and its key says Plus', async () => {
  const r = await post(order({ plan: 'plus', amount: 1 }), { env: env(PLUS) });
  assert.equal(r.status, 201);
  const p = await r.json();
  assert.equal(p.amount, 50000);
  assert.equal(p.plan, 'plus');
  const body = JSON.parse(calls.find(c => c.url.endsWith('/snap/v1/transactions')).init.body);
  assert.deepEqual(body.transaction_details, { order_id: p.id, gross_amount: 50000 });
  assert.equal(body.item_details.reduce((a, i) => a + i.price * i.quantity, 0), 50000);
  const k = await readPass(KEY, p.token);
  assert.equal(k.plan, 'plus');
  assert.equal(k.amount, 50000);
  // Paid at the seat fee, a Plus order stays shut; at its own fee it opens, as Plus.
  paid[p.id] = { transaction_status: 'settlement' };
  assert.equal((await (await status(p.id, p.token, { env: env(PLUS) })).json()).status, 'rejected');
  paid[p.id] = { transaction_status: 'settlement', gross_amount: '50000.00' };
  const s = await (await status(p.id, p.token)).json();
  assert.equal(s.status, 'confirmed');
  assert.equal(s.plan, 'plus');
});

test('any other plan is a seat pass', async () => {
  const p = await (await post(order({ plan: 'gold' }), { env: env(PLUS) })).json();
  assert.equal(p.plan, 'seat');
  assert.equal(p.amount, 25000);
});

test('a key made before plans opens as a seat pass at the access fee', async () => {
  const { signPass } = await import('../worker/passkey.mjs');
  const p = await newPass();
  // The old key: five fields, no plan and no amount.
  const enc = s => Buffer.from(s).toString('base64url');
  const body = enc(JSON.stringify([p.id, live.id, seat.cat, seat.id, Date.parse(p.createdAt)]));
  const mac = crypto.createHmac('sha256', crypto.createHmac('sha256', KEY).update('atvents pass key v1').digest()).update(body).digest('base64url');
  const k = await readPass(KEY, `${body}.${mac}`);
  assert.equal(k.plan, 'seat');
  assert.equal(k.amount, 25000);
  assert.ok(await signPass(KEY, { id: p.id, eventId: live.id, cat: seat.cat, seat: seat.id, createdAt: 1 }));
});

test('an upgrade to Plus costs the difference, keeps the seat, and needs a paid seat pass of the concert', async () => {
  const DB = fakeD1(), e = env({ DB, ...PLUS });
  const base = await (await post(order(), { env: e })).json();
  const up = more => post(order({ plan: 'plus', upgrade: base.id, upgradeToken: base.token, cat: 'nope', seat: 'nope', ...more }), { env: e });
  // Not paid yet: refused.
  let r = await up();
  assert.equal(r.status, 400);
  assert.equal((await r.json()).field, 'upgrade');
  paid[base.id] = { transaction_status: 'settlement' };
  // Another pass's key, or none: refused.
  assert.equal((await up({ upgradeToken: 'x.y' })).status, 400);
  const other = await (await post(order(), { env: e })).json();
  assert.equal((await up({ upgradeToken: other.token })).status, 400);
  r = await up();
  assert.equal(r.status, 201);
  const p = await r.json();
  assert.equal(p.amount, 25000);
  assert.equal(p.plan, 'plus');
  assert.equal(p.base, base.id);
  assert.equal(p.seat, seat.id, 'the seat of the pass it upgrades');
  const row = DB.rows().find(x => x.id === p.id);
  assert.equal(row.plan, 'plus');
  assert.equal(row.base, base.id);
  assert.equal(row.amount, 25000);
  paid[p.id] = { transaction_status: 'settlement', gross_amount: '25000.00' };
  assert.equal((await (await status(p.id, p.token)).json()).status, 'confirmed');
  // A Plus pass cannot be upgraded again.
  assert.equal((await up({ upgrade: p.id, upgradeToken: p.token })).status, 400);
});

test('a Plus notification is checked against the amount in the order book, and its email says Plus', async () => {
  const DB = fakeD1(), e = env({ DB, ...MAILING, ...PLUS });
  const p = await (await post(order({ plan: 'plus' }), { env: e })).json();
  paid[p.id] = { transaction_status: 'settlement', gross_amount: '50000.00' };
  const n = { order_id: p.id, gross_amount: '50000.00' };
  assert.equal((await notify({ ...n, signature_key: sign({ status_code: '200', ...n }) }, { env: e })).status, 200);
  assert.equal(DB.rows()[0].status, 'confirmed');
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /^Your 3D Pass Plus is open: /);
  const link = new RegExp(`${ORIGIN}/#pass-(${p.id})-([A-Za-z0-9_.-]+)`).exec(mails[0].text);
  assert.equal((await readPass(KEY, link[2])).plan, 'plus');
});

// ---------------------------------------------------------------- live chat (chat.mjs)

test('live chat: a ticket only for a paid pass, with a name; the socket only with a good ticket', async () => {
  const DB = fakeD1();
  const rooms = [];
  const CHAT = { idFromName: n => n, get: n => ({ fetch: async (url, init) => { rooms.push({ n, url, who: JSON.parse(new Headers(init.headers).get('x-chat-who')) }); return new Response('upgraded', { status: 200 }); } }) };
  const e = env({ DB, CHAT });
  const a = await (await post(order(), { env: e })).json();
  const ticket = (p, body = { name: 'Rani' }, headers = {}) => req(`/api/passes/${p.id}/chat`, {
    method: 'POST', env: e, headers: { 'x-pass-token': p.token, origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const socket = (t, ev = live.id, headers = { upgrade: 'websocket' }) => req(`/api/chat/${ev}?ticket=${encodeURIComponent(t)}`, { env: e, headers: { origin: ORIGIN, ...headers } });

  // Off without the binding.
  assert.equal((await req(`/api/passes/${a.id}/chat`, { method: 'POST', headers: { 'x-pass-token': a.token, 'content-type': 'application/json' }, body: '{"name":"Rani"}' })).status, 503);
  // Not paid yet.
  assert.equal((await ticket(a)).status, 403);
  paid[a.id] = { transaction_status: 'settlement' };
  // No name, or another site.
  const noName = await ticket(a, { name: ' ' });
  assert.equal(noName.status, 400);
  assert.equal((await noName.json()).field, 'name');
  assert.equal((await ticket(a, { name: 'Rani' }, { origin: 'https://evil.example' })).status, 403);

  const r = await ticket(a, { name: '  Rani  ' });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.name, 'Rani');
  assert.equal(d.eventId, live.id);
  await settled();

  // The socket: only a WebSocket, only with the ticket, only for its concert.
  assert.equal((await socket(d.ticket, live.id, {})).status, 426);
  assert.equal((await socket('nope')).status, 403);
  assert.equal((await socket(d.ticket, 'another-show')).status, 403);
  assert.equal((await socket(d.ticket)).status, 200);
  assert.deepEqual(rooms.at(-1).who, { id: a.id, name: 'Rani', cat: seat.cat, seat: seat.id });
  assert.match(rooms.at(-1).n, new RegExp(`^${live.id}:\\d+$`));
  // Nothing of the order beyond the seat and the chosen name goes to the room.
  assert.equal(JSON.stringify(rooms).includes('rani@example.com'), false);
});
