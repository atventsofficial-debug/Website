// The Worker in front of the static site (wrangler.jsonc): payments for 3D passes, through
// Midtrans, and the email that sends the pass. Cloudflare serves every file in site/ itself;
// only addresses with no file behind them reach this code.
//
//   GET  /api/config            { mode: 'pay', sandbox, fee, clientKey, mail, methods, sso } once MIDTRANS_SERVER_KEY is set, else 404
//   POST /api/payments          an order and the way to pay it: what to pay with, and the key to the pass.
//                               { plan: 'plus' } is the Plus pass (every seat); with { upgrade, upgradeToken }
//                               of a paid seat pass of the concert, Plus for the difference
//   GET  /api/passes/<id>       how that payment is going (header x-pass-token: the key)
//   POST /api/passes/<id>/cancel  the fan picks another way to pay: Midtrans closes this one
//   GET/PUT/DELETE /api/passes/<id>/fans  seat mates: the concert's fans who show their
//                               Instagram on their seat, and its WhatsApp group (fans.mjs)
//   POST /api/passes/<id>/code  a paid pass, open on two devices already: email the buyer a
//                               code that opens it on this one (devices.mjs)
//   POST /api/passes/<id>/device  { code }: this device gets in, the least used one goes
//   POST /api/midtrans/notify   Midtrans telling us a payment changed (signed with the server key)
//   GET  /pay/done              where Midtrans sends the fan back, on to #paid-<id>
//   POST /api/team/session      { idToken } from Google: a member of the team (ADMIN_EMAILS)
//                               gets a team key (team.mjs)
//   GET  /api/team/me           who the team key (header x-team-key) belongs to
//   POST /api/team/passes       a pass for a member, paid at 0: a Plus pass, with every 3D
//                               view, seat mates and the story open as for a fan who paid
//
// Midtrans keeps the payment; the order book (orders.mjs, in D1) keeps the buyer's name,
// email and seat. The pass email (mail.mjs) goes out once Midtrans says the order is paid,
// from its notification or from the page asking, whichever comes first, and only once. The
// pass key is signed (passkey.mjs), and every status check asks Midtrans. Clicks, sign-ups
// and partner requests are not handled here: they stay in the visitor's browser, as before
// (js/store.js).
import { ACCESS_FEE, PLUS_FEE, UPGRADE_FEE, PAY_MINUTES, PAYMENT_ID, line, checkBuyer, planOf, feeOf } from '../js/order.js';
import { concert, onSale, seatOf } from './catalog.mjs';
import { paymentsOf, midtrans, MidtransError, PaymentRefused, chargeOf, payDetailsOf, passStateOf, signedByMidtrans, jakartaTime } from './midtrans.mjs';
import { payMethod, methodsOn } from '../js/paymethods.js';
import { clientsOf } from '../js/sso.js';
import { signPass, readPass } from './passkey.mjs';
import { hasOrders, saveOrder, setStatus, statusOf, takeEmail, returnEmail, orderOf, saveTeamOrder } from './orders.mjs';
import { deviceOf, admit, newCode, useCode, maskEmail, CODE_MINUTES } from './devices.mjs';
import { hasFans, fansList, catView, forgetFans, saveFan, dropFan, dropConcert, KEEP_AFTER } from './fans.mjs';
import { checkFan, waLinksFor, waOf, SEAT_TAKEN } from '../js/fanrules.js';
import { igPicture } from './igcheck.mjs';
import { mailerOf, passEmail, codeEmail, signInEmail } from './mail.mjs';
import { emailOf, paidOrders, newSignCode, useSignCode, openAll, signFan, readFan, SIGN_MINUTES } from './account.mjs';
import { googleEmail, onTeam, signTeam, readTeam, teamOf } from './team.mjs';
import { songPreview } from './preview.mjs';

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
      // A seat mate's Instagram picture, for the same paid pass, of a fan in its own category.
      const pic = /^\/api\/passes\/([^/]{1,40})\/fans\/pic\/([A-Za-z0-9._]{1,30})$/.exec(path);
      if (pic) return method === 'GET' ? await seatMates(request, env, ctx, url, pic[1], pic[2]) : notAllowed('GET');
      const code = /^\/api\/passes\/([^/]{1,40})\/code$/.exec(path);
      if (code) return method === 'POST' ? await sendCode(request, env, url, code[1]) : notAllowed('POST');
      const device = /^\/api\/passes\/([^/]{1,40})\/device$/.exec(path);
      if (device) return method === 'POST' ? await addDevice(request, env, url, device[1]) : notAllowed('POST');
      if (path === '/api/midtrans/notify') return method === 'POST' ? await notified(request, env) : notAllowed('POST');
      if (path === '/pay/done') return backFromPayment(url);
      if (path === '/api/team/session') return method === 'POST' ? await teamSession(request, env, url) : notAllowed('POST');
      if (path === '/api/team/me') return method === 'GET' ? await teamMe(request, env) : notAllowed('GET');
      if (path === '/api/team/passes') return method === 'POST' ? await teamPass(request, env, url) : notAllowed('POST');
      if (path === '/api/me/code') return method === 'POST' ? await meCode(request, env, url) : notAllowed('POST');
      if (path === '/api/me/session') return method === 'POST' ? await meSession(request, env, url) : notAllowed('POST');
      if (path === '/api/me/passes') return method === 'GET' ? await mePasses(request, env) : notAllowed('GET');
      if (path === '/api/preview') return method === 'GET' ? await songPreview(url, ctx, json) : notAllowed('GET');
      if (path.startsWith('/api/')) return fail(404, 'Not found');
    } catch (err) {
      // Midtrans' own message, never the key: it is only ever in the Authorization header.
      console.error(`${method} ${path}: ${err instanceof MidtransError ? err.message : err?.stack || err}`);
      return err instanceof MidtransError
        ? fail(502, 'Midtrans did not answer just now. Please try again in a moment.')
        : fail(500, 'Something went wrong. Please try again.');
    }
    // Not ours: the static site's own answer (its 404). The staging copy (wrangler.jsonc,
    // env.staging) runs this Worker before every file, so search engines are told to keep
    // it out of their results.
    const res = env.ASSETS ? await env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    if (!env.STAGING) return res;
    const out = new Response(res.body, res);
    out.headers.set('x-robots-tag', 'noindex, nofollow');
    return out;
  },
};

// 3D Pass Plus on sale: PASS_PLUS = 'on' in the Cloudflare dashboard.
const plusOn = env => String(env?.PASS_PLUS ?? '').trim().toLowerCase() === 'on';

function config(env) {
  const pay = paymentsOf(env);
  if (!pay) return fail(404, 'Payments are not switched on yet.');
  return json(200, {
    mode: 'pay', provider: 'midtrans', sandbox: pay.sandbox, fee: ACCESS_FEE, plus: PLUS_FEE, upgrade: UPGRADE_FEE,
    // 3D Pass Plus is on sale only once PASS_PLUS is 'on' (README); until then the page shows it
    // as coming soon.
    ...(plusOn(env) ? { plusOn: true } : {}),
    ...(pay.clientKey ? { clientKey: pay.clientKey } : {}),
    mail: !!mailerOf(env) && hasOrders(env),   // the pass email goes out once paid
    methods: methodsOn(env.MIDTRANS_METHODS),
    // "Continue with Google / Microsoft" on the form (js/sso.js): the apps' client ids, which
    // are public. A button shows only with its id.
    sso: clientsOf({ google: env.GOOGLE_CLIENT_ID, microsoft: env.MICROSOFT_CLIENT_ID }),
    // The staging copy: the page always takes Sandbox payments, and says it is staging.
    ...(env.STAGING ? { staging: true } : {}),
    // The team sign-in on #admin (team.mjs): on once there is a list and Google's client id.
    // Signing in to My 3D passes (account.mjs): with the order book, by email code and/or Google.
    ...(hasOrders(env) && (mailerOf(env) || clientsOf({ google: env.GOOGLE_CLIENT_ID }).google) ? { account: { code: !!mailerOf(env), google: !!clientsOf({ google: env.GOOGLE_CLIENT_ID }).google } } : {}),
    ...(teamOf(env).size > 0 && clientsOf({ google: env.GOOGLE_CLIENT_ID }).google && hasOrders(env) ? { team: true } : {}),
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

// The order: the concert, the seat, the buyer, the plan and the way to pay, checked as the
// page checks them; then the charge at the plan's fee (js/order.js), which the browser cannot
// change, open for an hour. An upgrade to Plus names a paid seat pass of the same concert,
// with its key: the seat comes from that pass, and the charge is the difference.
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

  const eventId = line(d.eventId), e = concert(eventId), plan = planOf(line(d.plan));
  if (!e || !onSale(e)) return fail(400, 'Choose your concert.', { field: 'eventId' });
  if ((plan === 'plus' || d.upgrade != null) && !plusOn(env)) return fail(400, '3D Pass Plus is coming soon.', { field: 'plan' });
  let base = null;
  if (d.upgrade != null) {
    base = await paidSeatPass(env, pay, line(d.upgrade), line(d.upgradeToken), eventId);
    if (!base) return fail(400, 'Upgrade a paid seat pass of this concert.', { field: 'upgrade' });
  }
  // An upgrade keeps the seat of the pass it is bought on.
  const cat = base ? base.cat : line(d.cat);
  if (!Object.hasOwn(e.cats, cat)) return fail(400, 'Choose the category on your ticket.', { field: 'cat' });
  const seat = seatOf(e, cat, base ? base.seat : line(d.seat));
  if (!seat) return fail(400, 'Choose your seat.', { field: 'seat' });
  const amount = base ? UPGRADE_FEE : feeOf(plan);
  const { buyer, field, error } = checkBuyer(d);
  if (error) return fail(400, error, { field });
  const way = payMethod(line(d.method));
  if (!way || !methodsOn(env.MIDTRANS_METHODS).includes(way.id)) return fail(400, 'Choose how to pay.', { field: 'method' });

  const id = newOrderId(), createdAt = Date.now();
  const where = seat.standing ? `${seat.secName}, standing` : `${seat.secName}, row ${seat.row}, seat ${seat.num}`;
  const order = {
    transaction_details: { order_id: id, gross_amount: amount },
    item_details: [{ id: base ? '3D-PLUS-UP' : plan === 'plus' ? '3D-PLUS' : '3D-PASS', price: amount, quantity: 1, name: `${base ? 'Upgrade to 3D Pass Plus' : plan === 'plus' ? '3D Pass Plus' : '3D seat view'}: ${e.title}`.slice(0, 50) }],
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
  const planned = base ? 'plus' : plan;
  await saveOrder(env, { id, eventId, title: e.title, cat, seat: seat.id, seatLabel: where, name: buyer.name, email: buyer.email, amount, method: way.id, plan: planned, base: base?.id || '', origin: url.origin, createdAt })
    .catch(err => console.error(`order ${id} not saved: ${err?.message || err}`));
  // The device that paid is the pass's first.
  const dev = await deviceOf(request);
  if (dev && hasOrders(env)) await admit(env, id, dev, createdAt).catch(err => console.error(`order ${id}: device not kept: ${err?.message || err}`));
  const token = await signPass(pay.key, { id, eventId, cat, seat: seat.id, createdAt, plan: planned, amount });
  return json(201, {
    id, token, method: way.id, ...paying, amount, sandbox: pay.sandbox, plan: planned, ...(base ? { base: base.id } : {}),
    status: 'checking', eventId, cat, qty: 1, seat: seat.id, name: buyer.name, email: buyer.email, route: 'paid',
    createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(createdAt + PAY_WINDOW).toISOString(),
  });
}

// The seat pass an upgrade is bought on: its own key, the same concert, not Plus already,
// and paid (the order book says so, or else Midtrans). Null otherwise.
async function paidSeatPass(env, pay, id, token, eventId) {
  const p = PAYMENT_ID.test(id) ? await readPass(pay.key, token) : null;
  if (!p || p.id !== id || p.eventId !== eventId || p.plan !== 'seat') return null;
  const known = await statusOf(env, id).catch(() => null);
  if (known === 'confirmed') return p;
  if (known === 'revoked' || known === 'rejected') return null;
  return passStateOf(await midtrans(pay).status(id), { id, amount: p.amount }) === 'confirmed' ? p : null;
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
  if (known === 'revoked') return passJson(p, 'rejected', env);
  let status = known;
  if (known === 'confirmed') later(ctx, sendPass(env, pay, id).catch(() => {}));
  else if (known !== 'rejected') {
    const t = await midtrans(pay).status(id);
    status = !t && Date.now() - p.createdAt > UNPAID_CLOSE ? 'rejected' : passStateOf(t, { id, amount: p.amount });
    if (status !== 'checking') later(ctx, settle(env, pay, id, status));
  }
  if (status !== 'confirmed') return passJson(p, status, env);
  const locked = await deviceLock(env, request, id, p);
  return locked || passJson(p, status, env);
}

// A paid pass never ends: the seat view and the story stay the fan's after the show. Only
// a refund (Midtrans) or the admin (status 'revoked', README) closes it.

// A paid pass opens on two devices (devices.mjs): null lets this one in, else the 403 that
// tells the page to ask for an email code. Without the order book any device gets in.
async function deviceLock(env, request, id, p) {
  if (!hasOrders(env)) return null;
  const device = await deviceOf(request);
  if (device && paidSeen(env, `${id}:${device}`)) return null;
  if (device && (await admit(env, id, device)) === 'ok') { paidSeen(env, `${id}:${device}`, true); return null; }
  const order = await orderOf(env, id).catch(() => null);
  return fail(403, device ? 'This pass is already open on two other devices.' : 'Reload the page to open this pass.', { code: 'device', email: maskEmail(order?.email), mail: !!mailerOf(env) && !!device,
    // What the key says anyway, so the page can show which pass this is.
    pass: { id: p.id, eventId: p.eventId, cat: p.cat, seat: p.seat, createdAt: new Date(p.createdAt).toISOString() } });
}

// The email code for one more device. Only for a paid pass, with its key, from this site.
async function sendCode(request, env, url, id) {
  const pay = paymentsOf(env);
  if (!pay || !hasOrders(env)) return fail(503, 'Payments are not switched on yet.');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return fail(403, 'Forbidden');
  if (await tooMany(env, 'STATUS_LIMIT', request, id)) return slowDown();
  const p = await passOf(pay, request, id);
  if (!p) return fail(404, 'Pass not found');
  const device = await deviceOf(request);
  if (!device) return fail(400, 'Reload the page to open this pass.');
  const order = await orderOf(env, id);
  if (order?.status !== 'confirmed') return fail(403, 'This pass is not paid.');
  const mailer = mailerOf(env);
  if (!mailer) return fail(503, 'Email is not switched on. Write to us to open your pass here.');
  if ((await admit(env, id, device)) === 'ok') return json(200, { ok: true, open: true });
  const c = await newCode(env, id, device);
  if (c.wait) return fail(429, `A code was just sent to ${maskEmail(order.email)}. Wait ${c.wait} seconds to ask for another.`, {}, { 'retry-after': String(c.wait) });
  await mailer.send({ to: order.email, ...codeEmail({ order, concert: concert(order.event_id), code: c.code, minutes: CODE_MINUTES }) });
  console.log(`pass code sent: ${id}`);
  return json(200, { ok: true, sent: true, email: maskEmail(order.email), minutes: CODE_MINUTES });
}

// The code back: this device gets in, and the pass answers as GET /api/passes/<id> does.
async function addDevice(request, env, url, id) {
  const pay = paymentsOf(env);
  if (!pay || !hasOrders(env)) return fail(503, 'Payments are not switched on yet.');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return fail(403, 'Forbidden');
  if (await tooMany(env, 'STATUS_LIMIT', request, id)) return slowDown();
  const p = await passOf(pay, request, id);
  if (!p) return fail(404, 'Pass not found');
  const device = await deviceOf(request);
  if (!device) return fail(400, 'Reload the page to open this pass.');
  const d = await readJson(request);
  if (d instanceof Response) return d;
  if ((await statusOf(env, id)) !== 'confirmed') return fail(403, 'This pass is not paid.');
  const r = await useCode(env, id, device, line(d.code).replace(/\s+/g, ''));
  if (r === 'wrong') return fail(400, 'That code is not right. Check the email and try again.', { field: 'code' });
  if (r !== 'ok') return fail(400, 'That code has run out. Ask for a new one.', { field: 'code', expired: true });
  return passJson(p, 'confirmed', env);
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
    id: p.id, eventId: p.eventId, cat: p.cat, qty: 1, seat: p.seat, route: 'paid', plan: p.plan, status,
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
  let status = passStateOf(t, { id, amount: p.amount });
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
  // The amount the order was made at, from the order book; an order not in it is a seat pass.
  const amount = (await orderOf(env, id).catch(() => null))?.amount ?? ACCESS_FEE;
  const status = passStateOf(await midtrans(pay).status(id), { id, amount });
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
    const token = await signPass(pay.key, { id, eventId: order.event_id, cat: order.cat, seat: order.seat, createdAt: order.created_at, plan: order.plan, amount: order.amount });
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
async function seatMates(request, env, ctx, url, id, picOf = '') {
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
  if (!paidSeen(env, id)) {
    const known = await statusOf(env, id);
    if (known === 'revoked') return fail(403, 'Seat mates open once your pass is paid.');
    if (known !== 'confirmed') {
      const status = passStateOf(await midtrans(pay).status(id), { id, amount: p.amount });
      if (status !== 'confirmed') return fail(403, 'Seat mates open once your pass is paid.');
      later(ctx, settle(env, pay, id, status));
    }
  }
  paidSeen(env, id, true);
  const locked = await deviceLock(env, request, id, p);
  if (locked) return locked;
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
  if (m === 'DELETE') await dropFan(env, id, p.eventId);
  if (m !== 'GET') await forgetFans(env, p.eventId);
  // A fan sees the seat mates of their own category only (CAT 2 sees CAT 2): the rest
  // never leave the Worker.
  // Fans in other categories show only as a count per block: never a name or an Instagram.
  let list;
  try { list = await fansList(env, p.eventId); } catch (err) {
    console.error(`seat mates ${p.eventId}: ${err?.message || err}`);
    return fail(503, 'Seat mates are busy. Trying again shortly.', {}, { 'retry-after': '20' });
  }
  if (picOf) {
    const h = picOf.toLowerCase();
    if (!list.rows.some(r => r.cat === p.cat && String(r.instagram).toLowerCase() === h)) return fail(404, 'Not found');
    return (await igPicture(h)) || fail(404, 'No picture');
  }
  // The browser already has this list: a tiny answer instead of the whole list again.
  // The category's part is built once and sent as it is to every fan in it: only `me` and
  // `mineSeat` are this pass's own.
  const view = await catView(list, p.cat);
  const vh = { 'x-fans-version': view.version };
  if (m === 'GET' && request.headers.get('x-fans-have') === view.version) return new Response(null, { status: 204, headers: { ...HEADERS, ...vh } });
  const me = view.byOrder.get(id);
  const head = JSON.stringify({
    eventId: p.eventId,
    ...waLinksFor(env.FANBASE_WA, p.eventId),
    me: me ? { name: me.name, instagram: me.instagram } : null,
    mineSeat: me ? me.seat : null,
  });
  return new Response(`${head.slice(0, -1)},"fans":${view.fans},"others":${view.others}}`, { status: 200, headers: { ...HEADERS, ...vh } });
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

// ---------------------------------------------------------------- the team (team.mjs)

// Google's ID token in, a team key out, for an address on ADMIN_EMAILS only. Every refusal
// reads the same, so the answer does not tell who is on the list.
async function teamSession(request, env, url) {
  const pay = paymentsOf(env), google = clientsOf({ google: env.GOOGLE_CLIENT_ID }).google;
  if (!pay || !google || !teamOf(env).size) return fail(503, 'Team sign-in is not switched on.');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return fail(403, 'Forbidden');
  if (await tooMany(env, 'PAY_LIMIT', request)) return slowDown();
  const d = await readJson(request, 8192);
  if (d instanceof Response) return d;
  const email = await googleEmail(d.idToken, google);
  if (!email || !onTeam(env, email)) {
    console.log('team sign-in refused');
    return fail(403, 'This Google account is not on the Atvents team.');
  }
  console.log('team sign-in');
  return json(200, await signTeam(pay.key, email));
}

const teamFrom = async (env, pay, request) => readTeam(env, pay.key, request.headers.get('x-team-key'));

async function teamMe(request, env) {
  const pay = paymentsOf(env);
  if (!pay) return fail(503, 'Team sign-in is not switched on.');
  const who = await teamFrom(env, pay, request);
  return who ? json(200, who) : fail(401, 'Sign in again.');
}

// A pass for a member: the same checks as an order (concert, category, seat), then a row in
// the order book that is paid at 0 and needs no Midtrans. It opens, everywhere, as any paid
// pass does.
async function teamPass(request, env, url) {
  const pay = paymentsOf(env);
  if (!pay || !hasOrders(env)) return fail(503, 'Team passes need the order book.');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return fail(403, 'Forbidden');
  if (await tooMany(env, 'PAY_LIMIT', request)) return slowDown();
  const who = await teamFrom(env, pay, request);
  if (!who) return fail(401, 'Sign in again.');
  const d = await readJson(request);
  if (d instanceof Response) return d;
  const eventId = line(d.eventId), cat = line(d.cat), e = concert(eventId);
  if (!e) return fail(400, 'Choose your concert.', { field: 'eventId' });
  if (!Object.hasOwn(e.cats, cat)) return fail(400, 'Choose the category on your ticket.', { field: 'cat' });
  const seat = seatOf(e, cat, line(d.seat));
  if (!seat) return fail(400, 'Choose your seat.', { field: 'seat' });
  const name = (line(d.name) || 'Atvents team').slice(0, 80);
  const id = newOrderId(), createdAt = Date.now();
  const where = seat.standing ? `${seat.secName}, standing` : `${seat.secName}, row ${seat.row}, seat ${seat.num}`;
  await saveTeamOrder(env, { id, eventId, title: e.title, cat, seat: seat.id, seatLabel: where, name, email: who.email, origin: url.origin, createdAt });
  const dev = await deviceOf(request);
  if (dev) await admit(env, id, dev, createdAt).catch(err => console.error(`order ${id}: device not kept: ${err?.message || err}`));
  console.log(`team pass: ${id}`);
  const token = await signPass(pay.key, { id, eventId, cat, seat: seat.id, createdAt, plan: 'plus', amount: 0 });
  return json(201, {
    id, token, method: 'team', amount: 0, sandbox: pay.sandbox, plan: 'plus',
    status: 'confirmed', eventId, cat, qty: 1, seat: seat.id, name, email: who.email, route: 'paid',
    createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(createdAt + PAY_WINDOW).toISOString(),
  });
}

// ---------------------------------------------------------------- My 3D passes (account.mjs)

const NOT_BOUGHT = 'This email has no paid 3D pass. Sign in with the email you paid with.';

// The 6-digit code to sign in with, to an email that has a paid pass. Any other is refused.
async function meCode(request, env, url) {
  const pay = paymentsOf(env), mailer = mailerOf(env);
  if (!pay || !hasOrders(env) || !mailer) return fail(503, 'Signing in by email is not switched on.');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return fail(403, 'Forbidden');
  if (await tooMany(env, 'PAY_LIMIT', request)) return slowDown();
  const device = await deviceOf(request);
  if (!device) return fail(400, 'Reload the page and try again.');
  const d = await readJson(request, 2048);
  if (d instanceof Response) return d;
  const email = emailOf(d.email);
  if (!email) return fail(400, 'Type the email you paid with.', { field: 'email' });
  const orders = await paidOrders(env, email);
  if (!orders.length) return fail(404, NOT_BOUGHT, { field: 'email', code: 'not-bought' });
  const c = await newSignCode(env, email, device);
  if (c.wait) return fail(429, `A code was just sent. Wait ${c.wait} seconds to ask for another.`, {}, { 'retry-after': String(c.wait) });
  await mailer.send({ to: orders.at(-1).email, ...signInEmail({ name: orders.at(-1).name, code: c.code, minutes: SIGN_MINUTES }) });
  console.log('sign-in code sent');
  return json(200, { ok: true, sent: true, email: maskEmail(email), minutes: SIGN_MINUTES });
}

// Signing in: the email and its code, or Google's ID token (checked here, team.mjs). Only an
// email with a paid pass gets a fan key; its passes open on this device and come back.
async function meSession(request, env, url) {
  const pay = paymentsOf(env);
  if (!pay || !hasOrders(env)) return fail(503, 'Signing in is not switched on.');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return fail(403, 'Forbidden');
  if (await tooMany(env, 'PAY_LIMIT', request)) return slowDown();
  const device = await deviceOf(request);
  if (!device) return fail(400, 'Reload the page and try again.');
  const d = await readJson(request, 8192);
  if (d instanceof Response) return d;
  let email = '';
  if (d.idToken) {
    const google = clientsOf({ google: env.GOOGLE_CLIENT_ID }).google;
    if (!google) return fail(503, 'Signing in with Google is not switched on.');
    email = emailOf(await googleEmail(d.idToken, google));
    if (!email) return fail(403, 'Google did not confirm this account. Please try again.');
  } else {
    email = emailOf(d.email);
    if (!email) return fail(400, 'Type the email you paid with.', { field: 'email' });
    const r = await useSignCode(env, email, device, line(d.code).replace(/\s+/g, ''));
    if (r === 'wrong') return fail(400, 'That code is not right. Check the email and try again.', { field: 'code' });
    if (r !== 'ok') return fail(400, 'That code has run out. Ask for a new one.', { field: 'code', expired: true });
  }
  const orders = await paidOrders(env, email);
  if (!orders.length) {
    console.log('sign-in refused: no paid pass');
    return fail(403, NOT_BOUGHT, { code: 'not-bought' });
  }
  await openAll(env, orders, device);
  console.log('fan sign-in');
  return json(200, { ...(await signFan(pay.key, email)), passes: await passKeys(pay, orders) });
}

// Signed in: the email's paid passes, each with its key, open on this device. A pass paid
// since signing in comes along too.
async function mePasses(request, env) {
  const pay = paymentsOf(env);
  if (!pay || !hasOrders(env)) return fail(503, 'Signing in is not switched on.');
  if (await tooMany(env, 'STATUS_LIMIT', request)) return slowDown();
  const who = await readFan(pay.key, request.headers.get('x-fan-key'));
  if (!who) return fail(401, 'Sign in again.');
  const device = await deviceOf(request);
  if (!device) return fail(400, 'Reload the page and try again.');
  const orders = await paidOrders(env, who.email);
  await openAll(env, orders, device);
  return json(200, { ...who, passes: await passKeys(pay, orders) });
}

const passKeys = (pay, orders) => Promise.all(orders.map(async o => ({
  id: o.id, eventId: o.event_id, token: await signPass(pay.key, { id: o.id, eventId: o.event_id, cat: o.cat, seat: o.seat, createdAt: o.created_at, plan: o.plan, amount: o.amount }),
})));

// Midtrans adds ?order_id=… to the finish address. The page takes it from there.
function backFromPayment(url) {
  const id = url.searchParams.get('order_id') || '';
  return new Response(null, { status: 303, headers: { location: PAYMENT_ID.test(id) ? `/#paid-${id}` : '/#passes', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
