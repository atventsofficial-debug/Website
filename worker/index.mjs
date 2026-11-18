// The Worker in front of the static site (wrangler.jsonc): payments for 3D passes, through
// Midtrans, and the email that sends the pass. Cloudflare serves every file in site/ itself;
// only addresses with no file behind them reach this code.
//
//   GET  /api/config            { mode: 'pay', sandbox, fee, clientKey, mail } once MIDTRANS_SERVER_KEY is set, else 404
//   POST /api/payments          an order: the payment form's token, the Midtrans payment page and the key to the pass
//   GET  /api/passes/<id>       how that payment is going (header x-pass-token: the key)
//   POST /api/midtrans/notify   Midtrans telling us a payment changed (signed with the server key)
//   GET  /pay/done              where Midtrans sends the fan back, on to #paid-<id>
//
// Midtrans keeps the payment; the order book (orders.mjs, in D1) keeps the buyer's name,
// email and seat. The pass email (mail.mjs) goes out once Midtrans says the order is paid,
// from its notification or from the page asking, whichever comes first, and only once. The
// pass key is signed (passkey.mjs), and every status check asks Midtrans. Clicks, sign-ups
// and partner requests are not handled here: they stay in the visitor's browser, as before
// (js/store.js).
import { ACCESS_FEE, PAY_MINUTES, PAYMENT_ID, line, checkBuyer } from '../js/order.js';
import { concert, onSale, seatOf } from './catalog.mjs';
import { paymentsOf, midtrans, MidtransError, passStateOf, signedByMidtrans, jakartaTime } from './midtrans.mjs';
import { signPass, readPass } from './passkey.mjs';
import { hasOrders, saveOrder, setStatus, takeEmail, returnEmail } from './orders.mjs';
import { mailerOf, passEmail } from './mail.mjs';

const MAX_BODY = 4096, NOTIFY_BODY = 16384;
const PAY_WINDOW = PAY_MINUTES * 6e4;
// An order nobody started paying is closed a little after its payment form expires.
const UNPAID_CLOSE = PAY_WINDOW + 10 * 6e4;

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-resource-policy': 'same-origin',
};
const json = (status, data, extra) => new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extra } });
const fail = (status, error, more = {}) => json(status, { error, ...more });
const notAllowed = allow => json(405, { error: 'Method not allowed' }, { allow });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    try {
      if (path === '/api/config') return method === 'GET' ? config(env) : notAllowed('GET');
      if (path === '/api/payments') return method === 'POST' ? await createPayment(request, env, url) : notAllowed('POST');
      const pass = /^\/api\/passes\/([^/]{1,40})$/.exec(path);
      if (pass) return method === 'GET' ? await passStatus(request, env, ctx, pass[1]) : notAllowed('GET');
      if (path === '/api/midtrans/notify') return method === 'POST' ? await notified(request, env) : notAllowed('POST');
      if (path === '/pay/done') return backFromPayment(url);
      if (path.startsWith('/api/')) return fail(404, 'Not found');
    } catch (err) {
      // Midtrans' own message, never the key: it is only ever in the Authorization header.
      console.error(`${method} ${path}: ${err instanceof MidtransError ? err.message : err?.stack || err}`);
      return err instanceof MidtransError
        ? fail(502, 'Midtrans did not answer just now. Please try again in a moment.')
        : fail(500, 'Something went wrong. Please try again.');
    }
    // Not ours: the static site's own answer (its 404).
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
};

function config(env) {
  const pay = paymentsOf(env);
  if (!pay) return fail(404, 'Payments are not switched on yet.');
  return json(200, {
    mode: 'pay', provider: 'midtrans', sandbox: pay.sandbox, fee: ACCESS_FEE,
    ...(pay.clientKey ? { clientKey: pay.clientKey } : {}),
    mail: !!mailerOf(env) && hasOrders(env),   // the pass email goes out once paid
  });
}

// Cloudflare's rate limiter, per visitor address, when the binding is there (wrangler.jsonc).
async function tooMany(env, binding, request) {
  if (!env[binding]?.limit) return false;
  const { success } = await env[binding].limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
  return !success;
}

async function readJson(request, max = MAX_BODY) {
  if ((request.headers.get('content-type') || '').split(';')[0].trim() !== 'application/json') return fail(415, 'Send JSON.');
  if (Number(request.headers.get('content-length') || 0) > max) return fail(413, 'Request too large.');
  const text = await request.text();
  if (text.length > max) return fail(413, 'Request too large.');
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* below */ }
  return fail(400, 'Invalid JSON.');
}

// Work that may finish after the answer has gone (the email), kept alive by the runtime.
const later = (ctx, promise) => (ctx?.waitUntil ? ctx.waitUntil(promise) : promise);

// PAY- and 16 characters with no look-alikes (no 0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newOrderId = () => `PAY-${[...crypto.getRandomValues(new Uint8Array(16))].map(b => ALPHABET[b & 31]).join('')}`;

// The order: the concert, the seat and the buyer, checked as the page checks them; then a
// Snap transaction at the access fee, which the browser cannot change, open for an hour.
async function createPayment(request, env, url) {
  const pay = paymentsOf(env);
  if (!pay) return fail(503, 'Payments are not switched on yet.');
  // Only this site's own pages may start an order.
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return fail(403, 'Forbidden');
  if (await tooMany(env, 'PAY_LIMIT', request)) return fail(429, 'Too many tries. Please wait a minute.');
  const d = await readJson(request);
  if (d instanceof Response) return d;

  const eventId = line(d.eventId), cat = line(d.cat), e = concert(eventId);
  if (!e || !onSale(e)) return fail(400, 'Choose your concert.', { field: 'eventId' });
  if (!Object.hasOwn(e.cats, cat)) return fail(400, 'Choose the category on your ticket.', { field: 'cat' });
  const seat = seatOf(e, cat, line(d.seat));
  if (!seat) return fail(400, 'Choose your seat.', { field: 'seat' });
  const { buyer, field, error } = checkBuyer(d);
  if (error) return fail(400, error, { field });

  const id = newOrderId(), createdAt = Date.now();
  const where = seat.standing ? `${seat.secName}, standing` : `${seat.secName}, row ${seat.row}, seat ${seat.num}`;
  const page = await midtrans(pay).createPayment({
    transaction_details: { order_id: id, gross_amount: ACCESS_FEE },
    item_details: [{ id: '3D-PASS', price: ACCESS_FEE, quantity: 1, name: `3D seat view: ${e.title}`.slice(0, 50) }],
    customer_details: { first_name: buyer.name.slice(0, 80), email: buyer.email },
    credit_card: { secure: true },
    expiry: { start_time: jakartaTime(createdAt), unit: 'minute', duration: PAY_MINUTES },
    callbacks: { finish: `${url.origin}/pay/done` },
    custom_field1: `${eventId} / ${e.cats[cat]}`.slice(0, 255),
    custom_field2: where.slice(0, 255),
  }, { notify: url.protocol === 'https:' ? `${url.origin}/api/midtrans/notify` : '' });
  // Without the order book the pass still opens on this device; only the email cannot go.
  await saveOrder(env, { id, eventId, title: e.title, cat, seat: seat.id, seatLabel: where, name: buyer.name, email: buyer.email, amount: ACCESS_FEE, origin: url.origin, createdAt })
    .catch(err => console.error(`order ${id} not saved: ${err?.message || err}`));
  const token = await signPass(pay.key, { id, eventId, cat, seat: seat.id, createdAt });
  return json(201, {
    id, token, snap: page.token, url: page.url, amount: ACCESS_FEE, sandbox: pay.sandbox,
    status: 'checking', eventId, cat, qty: 1, seat: seat.id, name: buyer.name, email: buyer.email, route: 'paid',
    createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(createdAt + PAY_WINDOW).toISOString(),
  });
}

// A pass, opened with its key: Midtrans says whether it is paid.
async function passStatus(request, env, ctx, id) {
  const pay = paymentsOf(env);
  if (!pay) return fail(503, 'Payments are not switched on yet.');
  if (await tooMany(env, 'STATUS_LIMIT', request)) return fail(429, 'Too many tries. Please wait a minute.');
  const p = PAYMENT_ID.test(id) ? await readPass(pay.key, request.headers.get('x-pass-token')) : null;
  if (!p || p.id !== id) return fail(404, 'Pass not found');
  const t = await midtrans(pay).status(id);
  const status = !t && Date.now() - p.createdAt > UNPAID_CLOSE ? 'rejected' : passStateOf(t, { id, amount: ACCESS_FEE });
  if (status !== 'checking') later(ctx, settle(env, pay, id, status));
  return json(200, {
    id, eventId: p.eventId, cat: p.cat, qty: 1, seat: p.seat, route: 'paid', status,
    createdAt: new Date(p.createdAt).toISOString(), expiresAt: new Date(p.createdAt + PAY_WINDOW).toISOString(),
  });
}

// Midtrans' notification. Only its signature makes it count, and even then the status is
// read again from Midtrans before anything changes. A 200 tells Midtrans to stop resending,
// so it waits for the email: if that did not go, a 500 has Midtrans send the news again.
async function notified(request, env) {
  const pay = paymentsOf(env);
  if (!pay) return fail(503, 'Payments are not switched on yet.');
  const n = await readJson(request, NOTIFY_BODY);
  if (n instanceof Response) return n;
  if (!(await signedByMidtrans(n, pay.key))) return fail(401, 'Bad signature');
  const id = n.order_id;
  if (!PAYMENT_ID.test(id)) return json(200, { ok: true });   // not an order of this site
  const status = passStateOf(await midtrans(pay).status(id), { id, amount: ACCESS_FEE });
  if (status !== 'checking' && !(await settle(env, pay, id, status))) return fail(500, 'Not done yet');
  return json(200, { ok: true });
}

// The order's new state into the order book; once paid, the pass email. False when
// something did not go, so it can be tried again. Never throws: it may run after the answer
// has gone.
async function settle(env, pay, id, status) {
  try {
    if (!hasOrders(env)) return true;
    await setStatus(env, id, status);
    return status === 'confirmed' ? await sendPass(env, pay, id) : true;
  } catch (err) {
    console.error(`order ${id}: ${err?.message || err}`);
    return false;
  }
}

async function sendPass(env, pay, id) {
  const mailer = mailerOf(env);
  if (!mailer) return true;   // email is not switched on
  const order = await takeEmail(env, id);
  if (!order) return true;    // sent already, or not an order in the book
  try {
    const token = await signPass(pay.key, { id, eventId: order.event_id, cat: order.cat, seat: order.seat, createdAt: order.created_at });
    const mail = passEmail({ order, concert: concert(order.event_id), link: `${order.origin}/#pass-${id}-${token}` });
    await mailer.send({ to: order.email, ...mail });
    console.log(`pass email sent: ${id}`);
    return true;
  } catch (err) {
    await returnEmail(env, id).catch(() => {});
    console.error(`pass email ${id} not sent: ${err?.message || err}`);
    return false;
  }
}

// Midtrans adds ?order_id=… to the finish address. The page takes it from there.
function backFromPayment(url) {
  const id = url.searchParams.get('order_id') || '';
  return new Response(null, { status: 303, headers: { location: PAYMENT_ID.test(id) ? `/#paid-${id}` : '/#passes', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
