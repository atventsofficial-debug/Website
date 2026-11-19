// The Worker in front of the static site (wrangler.jsonc): payments for 3D passes, through
// Midtrans, and the email that sends the pass. Cloudflare serves every file in site/ itself;
// only addresses with no file behind them reach this code.
//
//   GET  /api/config            { mode: 'pay', sandbox, fee, clientKey, mail, methods, sso } once MIDTRANS_SERVER_KEY is set, else 404
//   POST /api/payments          an order and the way to pay it: what to pay with, and the key to the pass
//   GET  /api/passes/<id>       how that payment is going (header x-pass-token: the key)
//   POST /api/passes/<id>/cancel  the fan picks another way to pay: Midtrans closes this one
//   GET/PUT/DELETE /api/passes/<id>/fans  seat mates: the concert's fans who show their
//                               Instagram on their seat, and its WhatsApp group (fans.mjs)
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
import { paymentsOf, midtrans, MidtransError, PaymentRefused, chargeOf, payDetailsOf, passStateOf, signedByMidtrans, jakartaTime } from './midtrans.mjs';
import { payMethod, methodsOn } from '../js/paymethods.js';
import { clientsOf } from '../js/sso.js';
import { signPass, readPass } from './passkey.mjs';
import { hasOrders, saveOrder, setStatus, statusOf, takeEmail, returnEmail } from './orders.mjs';
import { hasFans, fansList, forgetFans, saveFan, dropFan, dropConcert, KEEP_AFTER } from './fans.mjs';
import { checkFan, waLinksFor, waOf, SEAT_TAKEN } from '../js/fanrules.js';
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
const fail = (status, error, more = {}, extra) => json(status, { error, ...more }, extra);
const notAllowed = allow => json(405, { error: 'Method not allowed' }, { allow });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    try {
      if (path === '/api/config') return method === 'GET' ? config(env) : notAllowed('GET');
      if (path === '/api/payments') return method === 'POST' ? await createPayment(request, env, url) : notAllowed('POST');
      const pass = /^\/api\/passes\/([^/]{1,40})$/.exec(path);
      if (pass) return method === 'GET' ? await passStatus(request, env, ctx, pass[1]) : notAllowed('GET');
      const cancel = /^\/api\/passes\/([^/]{1,40})\/cancel$/.exec(path);
      if (cancel) return method === 'POST' ? await cancelPayment(request, env, ctx, url, cancel[1]) : notAllowed('POST');
      const mates = /^\/api\/passes\/([^/]{1,40})\/fans$/.exec(path);
      if (mates) return ['GET', 'PUT', 'DELETE'].includes(method) ? await seatMates(request, env, ctx, url, mates[1]) : notAllowed('GET, PUT, DELETE');
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
    methods: methodsOn(env.MIDTRANS_METHODS),
    // "Continue with Google / Microsoft" on the form (js/sso.js): the apps' client ids, which
    // are public. A button shows only with its id.
    sso: clientsOf({ google: env.GOOGLE_CLIENT_ID, microsoft: env.MICROSOFT_CLIENT_ID }),
  });
}

// Cloudflare's rate limiter, per visitor address, when the binding is there (wrangler.jsonc).
// A pass's own calls are counted per pass and address, not per address alone: phones on a
// mobile network often share one address (carrier NAT), and one fan must not use up the
// others' turns. A limiter that fails lets the call through: it guards, it never blocks.
async function tooMany(env, binding, request, pass = '') {
  if (!env[binding]?.limit) return false;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    const { success } = await env[binding].limit({ key: pass ? `${pass}:${ip}` : ip });
    return !success;
  } catch { return false; }
}
const slowDown = () => fail(429, 'Too many tries. Please wait a minute.', {}, { 'retry-after': '30' });

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

// The order: the concert, the seat, the buyer and the way to pay, checked as the page checks
// them; then the charge at the access fee, which the browser cannot change, open for an hour.
// A card opens Midtrans' card form (Snap); every other way is a Core API charge, and its
// account number, QR code or store code comes back for the page to show.
async function createPayment(request, env, url) {
  const pay = paymentsOf(env);
  if (!pay) return fail(503, 'Payments are not switched on yet.');
  // Only this site's own pages may start an order.
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return fail(403, 'Forbidden');
  if (await tooMany(env, 'PAY_LIMIT', request)) return slowDown();
  const d = await readJson(request);
  if (d instanceof Response) return d;

  const eventId = line(d.eventId), cat = line(d.cat), e = concert(eventId);
  if (!e || !onSale(e)) return fail(400, 'Choose your concert.', { field: 'eventId' });
  if (!Object.hasOwn(e.cats, cat)) return fail(400, 'Choose the category on your ticket.', { field: 'cat' });
  const seat = seatOf(e, cat, line(d.seat));
  if (!seat) return fail(400, 'Choose your seat.', { field: 'seat' });
  const { buyer, field, error } = checkBuyer(d);
  if (error) return fail(400, error, { field });
  const way = payMethod(line(d.method));
  if (!way || !methodsOn(env.MIDTRANS_METHODS).includes(way.id)) return fail(400, 'Choose how to pay.', { field: 'method' });

  const id = newOrderId(), createdAt = Date.now();
  const where = seat.standing ? `${seat.secName}, standing` : `${seat.secName}, row ${seat.row}, seat ${seat.num}`;
  const order = {
    transaction_details: { order_id: id, gross_amount: ACCESS_FEE },
    item_details: [{ id: '3D-PASS', price: ACCESS_FEE, quantity: 1, name: `3D seat view: ${e.title}`.slice(0, 50) }],
    customer_details: { first_name: buyer.name.slice(0, 80), email: buyer.email },
    custom_field1: `${eventId} / ${e.cats[cat]}`.slice(0, 255),
    custom_field2: where.slice(0, 255),
  };
  const notify = url.protocol === 'https:' ? `${url.origin}/api/midtrans/notify` : '';
  const mt = midtrans(pay);
  let paying;
  if (way.kind === 'card') {
    const page = await mt.createPayment({
      ...order,
      enabled_payments: ['credit_card'],
      credit_card: { secure: true },
      expiry: { start_time: jakartaTime(createdAt), unit: 'minute', duration: PAY_MINUTES },
      callbacks: { finish: `${url.origin}/pay/done` },
    }, { notify });
    paying = { snap: page.token, url: page.url };
  } else {
    let answer;
    try {
      answer = await mt.charge({ ...order, ...chargeOf(way.id, url.origin), custom_expiry: { order_time: jakartaTime(createdAt), expiry_duration: PAY_MINUTES, unit: 'minute' } }, { notify });
    } catch (err) {
      if (!(err instanceof PaymentRefused)) throw err;
      console.error(`POST /api/payments ${way.id}: ${err.message}`);
      return fail(409, `${way.name} is not open right now. Please choose another way to pay.`, { field: 'method' });
    }
    const details = payDetailsOf(way.id, answer);
    if (!details) throw new MidtransError(`Charge ${way.id}: the answer has no payment details`);
    paying = { pay: details };
  }
  // Without the order book the pass still opens on this device; only the email cannot go.
  await saveOrder(env, { id, eventId, title: e.title, cat, seat: seat.id, seatLabel: where, name: buyer.name, email: buyer.email, amount: ACCESS_FEE, method: way.id, origin: url.origin, createdAt })
    .catch(err => console.error(`order ${id} not saved: ${err?.message || err}`));
  const token = await signPass(pay.key, { id, eventId, cat, seat: seat.id, createdAt });
  return json(201, {
    id, token, method: way.id, ...paying, amount: ACCESS_FEE, sandbox: pay.sandbox,
    status: 'checking', eventId, cat, qty: 1, seat: seat.id, name: buyer.name, email: buyer.email, route: 'paid',
    createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(createdAt + PAY_WINDOW).toISOString(),
  });
}

// A pass, opened with its key: Midtrans says whether it is paid.
async function passStatus(request, env, ctx, id) {
  const pay = paymentsOf(env);
  if (!pay) return fail(503, 'Payments are not switched on yet.');
  if (await tooMany(env, 'STATUS_LIMIT', request, id)) return slowDown();
  const p = await passOf(pay, request, id);
  if (!p) return fail(404, 'Pass not found');
  // Settled in the order book: no need to ask Midtrans again (it keeps the book up to date
  // with its notifications), so a crowd opening their passes never queues on Midtrans.
  const known = await statusOf(env, id).catch(() => null);
  if (known === 'confirmed' || known === 'rejected') {
    if (known === 'confirmed') later(ctx, sendPass(env, pay, id).catch(() => {}));
    return passJson(p, known, env);
  }
  const t = await midtrans(pay).status(id);
  const status = !t && Date.now() - p.createdAt > UNPAID_CLOSE ? 'rejected' : passStateOf(t, { id, amount: ACCESS_FEE });
  if (status !== 'checking') later(ctx, settle(env, pay, id, status));
  return passJson(p, status, env);
}

const passOf = async (pay, request, id) => {
  const p = PAYMENT_ID.test(id) ? await readPass(pay.key, request.headers.get('x-pass-token')) : null;
  return p && p.id === id ? p : null;
};
// A paid pass also gets the WhatsApp links (FANBASE_WA): the fanbase group, the community.
const passJson = (p, status, env) => {
  // Always there once paid (null when none is set), so a link taken out goes from the page too.
  const wa = status === 'confirmed' ? { wa: waOf(env?.FANBASE_WA, p.eventId) } : {};
  return json(200, {
    id: p.id, eventId: p.eventId, cat: p.cat, qty: 1, seat: p.seat, route: 'paid', status,
    createdAt: new Date(p.createdAt).toISOString(), expiresAt: new Date(p.createdAt + PAY_WINDOW).toISOString(),
    ...wa,
  });
};

// The fan picks another way to pay: Midtrans closes this order, so its account number or
// code stops taking money and one seat is never paid twice. Then Midtrans' own status says
// where it stands: paid after all opens the pass; closed is 'rejected'. Only this site's
// pages may ask, with the pass key.
async function cancelPayment(request, env, ctx, url, id) {
  const pay = paymentsOf(env);
  if (!pay) return fail(503, 'Payments are not switched on yet.');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return fail(403, 'Forbidden');
  if (await tooMany(env, 'STATUS_LIMIT', request, id)) return slowDown();
  const p = await passOf(pay, request, id);
  if (!p) return fail(404, 'Pass not found');
  const mt = midtrans(pay);
  const answer = await mt.cancel(id), t = await mt.status(id);
  let status = passStateOf(t, { id, amount: ACCESS_FEE });
  if (status === 'checking') {
    // Still open at Midtrans and not cancelled: say so rather than let it take money unseen.
    // No transaction at all (a card form nobody used) has nothing to close.
    if (t && answer !== '200') return fail(409, 'This payment could not be changed just now. Please try again.');
    status = 'rejected';
  }
  later(ctx, settle(env, pay, id, status));
  return passJson(p, status, env);
}

// Midtrans' notification. Only its signature makes it count, and even then the status is
// read again from Midtrans before anything changes. A 200 tells Midtrans to stop resending,
// so it waits for the email: if that did not go, a 500 has Midtrans send the news again.
async function notified(request, env) {
  const pay = paymentsOf(env);
  if (!pay) return fail(503, 'Payments are not switched on yet.');
  const n = await readJson(request, NOTIFY_BODY);
  if (n instanceof Response) return n;
  if (!(await signedByMidtrans(n, pay.signKeys))) return fail(401, 'Bad signature');
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
    const mail = passEmail({ order, concert: concert(order.event_id), link: `${order.origin}/#pass-${id}-${token}`, wa: waLinksFor(env.FANBASE_WA, order.event_id) });
    await mailer.send({ to: order.email, ...mail });
    console.log(`pass email sent: ${id}`);
    return true;
  } catch (err) {
    await returnEmail(env, id).catch(() => {});
    console.error(`pass email ${id} not sent: ${err?.message || err}`);
    return false;
  }
}

// Seat mates (fans.mjs). Only a paid pass gets in, with its key: the order book says so, or
// else Midtrans does. GET: the concert's fans who show their Instagram, which of them is
// this pass, and the WhatsApp group. PUT: show this pass's name and Instagram on its seat.
// DELETE: take them down.
async function seatMates(request, env, ctx, url, id) {
  const pay = paymentsOf(env);
  if (!pay || !hasFans(env)) return fail(503, 'Seat mates are not switched on yet.');
  const m = request.method;
  if (m !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return fail(403, 'Forbidden');
  }
  if (await tooMany(env, m === 'GET' ? 'FANS_LIMIT' : 'STATUS_LIMIT', request, id)) return slowDown();
  const p = await passOf(pay, request, id);
  if (!p) return fail(404, 'Pass not found');
  if (!paidSeen(env, id) && (await statusOf(env, id)) !== 'confirmed') {
    const status = passStateOf(await midtrans(pay).status(id), { id, amount: ACCESS_FEE });
    if (status !== 'confirmed') return fail(403, 'Seat mates open once your pass is paid.');
    later(ctx, settle(env, pay, id, status));
  }
  paidSeen(env, id, true);
  const show = concert(p.eventId);
  if (!show || show.start + KEEP_AFTER < Date.now()) {
    await dropConcert(env, p.eventId);
    return fail(410, 'Seat mates close a month after the show.');
  }
  if (m === 'PUT') {
    const d = await readJson(request);
    if (d instanceof Response) return d;
    const { fan, field, error } = checkFan(d);
    if (error) return fail(400, error, { field });
    if ((await saveFan(env, p, fan)) === 'taken') return fail(409, SEAT_TAKEN);
  }
  if (m === 'DELETE') await dropFan(env, id);
  if (m !== 'GET') await forgetFans(env, p.eventId);
  // A fan sees the seat mates of their own category only (CAT 2 sees CAT 2): the rest
  // never leave the Worker.
  // Fans in other categories show as a marker only: their seat and its category, never a
  // name or an Instagram.
  let list;
  try { list = await fansList(env, p.eventId); } catch (err) {
    console.error(`seat mates ${p.eventId}: ${err?.message || err}`);
    return fail(503, 'Seat mates are busy. Trying again shortly.', {}, { 'retry-after': '20' });
  }
  // The browser already has this list: a tiny answer instead of the whole list again.
  const vh = { 'x-fans-version': list.version };
  if (m === 'GET' && request.headers.get('x-fans-have') === list.version) return new Response(null, { status: 204, headers: { ...HEADERS, ...vh } });
  const all = list.rows, rows = all.filter(r => r.cat === p.cat);
  const me = rows.find(r => r.order_id === id);
  return json(200, {
    eventId: p.eventId,
    ...waLinksFor(env.FANBASE_WA, p.eventId),
    me: me ? { name: me.name, instagram: me.instagram } : null,
    fans: rows.map(r => ({ seat: r.seat, cat: r.cat, name: r.name, instagram: r.instagram, ...(r.order_id === id ? { mine: true } : {}) })),
    others: all.filter(r => r.cat !== p.cat).map(r => ({ seat: r.seat, cat: r.cat })),
  }, vh);
}

// Passes this Worker has seen paid, for a few minutes: a fan with the 3D view open asks
// every few seconds, and a paid pass stays paid, so the order book is not asked each time.
const PAID_FOR = 5 * 6e4, paidMem = new WeakMap();
function paidSeen(env, id, set = false, now = Date.now()) {
  const key = env.DB || env;
  let m = paidMem.get(key);
  if (!m) paidMem.set(key, (m = new Map()));
  if (set) { if (m.size > 20000) m.clear(); m.set(id, now); return true; }
  const at = m.get(id);
  return !!at && now - at < PAID_FOR;
}

// Midtrans adds ?order_id=… to the finish address. The page takes it from there.
function backFromPayment(url) {
  const id = url.searchParams.get('order_id') || '';
  return new Response(null, { status: 303, headers: { location: PAYMENT_ID.test(id) ? `/#paid-${id}` : '/#passes', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
