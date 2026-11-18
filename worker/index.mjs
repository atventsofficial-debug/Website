// The Worker in front of the static site (wrangler.jsonc): payments for 3D passes, through
// Midtrans. Cloudflare serves every file in site/ itself; only addresses with no file behind
// them reach this code.
//
//   GET  /api/config        { mode: 'pay', sandbox } once MIDTRANS_SERVER_KEY is set, else 404
//   POST /api/payments      an order: the Midtrans payment page and the key to the pass
//   GET  /api/passes/<id>   how that payment is going (header x-pass-token: the key)
//   GET  /pay/done          where Midtrans sends the fan back, on to #paid-<id>
//
// There is no database. Midtrans keeps each order, with the buyer's name and email (the
// Midtrans dashboard is where to look them up); the pass key is signed (passkey.mjs), and
// every status check asks Midtrans. Clicks, sign-ups and partner requests are not handled
// here: they stay in the visitor's browser, as before (js/store.js).
import { ACCESS_FEE, PAYMENT_ID, line, checkBuyer } from '../js/order.js';
import { concert, onSale, seatOf } from './catalog.mjs';
import { paymentsOf, midtrans, MidtransError, passStateOf } from './midtrans.mjs';
import { signPass, readPass } from './passkey.mjs';

const MAX_BODY = 4096;
// An order nobody started paying is closed a little after its Snap page expires (24 hours).
const UNPAID_CLOSE = 25 * 36e5;

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
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    try {
      if (path === '/api/config') return method === 'GET' ? config(env) : notAllowed('GET');
      if (path === '/api/payments') return method === 'POST' ? await createPayment(request, env, url) : notAllowed('POST');
      const pass = /^\/api\/passes\/([^/]{1,40})$/.exec(path);
      if (pass) return method === 'GET' ? await passStatus(request, env, pass[1]) : notAllowed('GET');
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
  return pay ? json(200, { mode: 'pay', provider: 'midtrans', sandbox: pay.sandbox, fee: ACCESS_FEE }) : fail(404, 'Payments are not switched on yet.');
}

// Cloudflare's rate limiter, per visitor address, when the binding is there (wrangler.jsonc).
async function tooMany(env, binding, request) {
  if (!env[binding]?.limit) return false;
  const { success } = await env[binding].limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
  return !success;
}

async function readJson(request) {
  if ((request.headers.get('content-type') || '').split(';')[0].trim() !== 'application/json') return fail(415, 'Send JSON.');
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return fail(413, 'Request too large.');
  const text = await request.text();
  if (text.length > MAX_BODY) return fail(413, 'Request too large.');
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* below */ }
  return fail(400, 'Invalid JSON.');
}

// PAY- and 16 characters with no look-alikes (no 0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newOrderId = () => `PAY-${[...crypto.getRandomValues(new Uint8Array(16))].map(b => ALPHABET[b & 31]).join('')}`;

// The order: the concert, the seat and the buyer, checked as the page checks them; then a
// Snap transaction at the access fee, which the browser cannot change.
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
    callbacks: { finish: `${url.origin}/pay/done` },
    custom_field1: `${eventId} / ${e.cats[cat]}`.slice(0, 255),
    custom_field2: where.slice(0, 255),
  });
  const token = await signPass(pay.key, { id, eventId, cat, seat: seat.id, createdAt });
  return json(201, {
    id, token, url: page.url, amount: ACCESS_FEE, sandbox: pay.sandbox,
    status: 'checking', eventId, cat, qty: 1, seat: seat.id, name: buyer.name, route: 'paid', createdAt: new Date(createdAt).toISOString(),
  });
}

// A pass, opened with its key: Midtrans says whether it is paid.
async function passStatus(request, env, id) {
  const pay = paymentsOf(env);
  if (!pay) return fail(503, 'Payments are not switched on yet.');
  if (await tooMany(env, 'STATUS_LIMIT', request)) return fail(429, 'Too many tries. Please wait a minute.');
  const p = PAYMENT_ID.test(id) ? await readPass(pay.key, request.headers.get('x-pass-token')) : null;
  if (!p || p.id !== id) return fail(404, 'Pass not found');
  const t = await midtrans(pay).status(id);
  const status = !t && Date.now() - p.createdAt > UNPAID_CLOSE ? 'rejected' : passStateOf(t, { id, amount: ACCESS_FEE });
  return json(200, { id, eventId: p.eventId, cat: p.cat, qty: 1, seat: p.seat, route: 'paid', status, createdAt: new Date(p.createdAt).toISOString() });
}

// Midtrans adds ?order_id=… to the finish address. The page takes it from there.
function backFromPayment(url) {
  const id = url.searchParams.get('order_id') || '';
  return new Response(null, { status: 303, headers: { location: PAYMENT_ID.test(id) ? `/#paid-${id}` : '/#passes', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
