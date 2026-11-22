// What visitors send us: clicks to tiket.com, 3D pass claims, partner requests and sign-ups,
// and the admin's view of them. LocalStore keeps it all in this browser (demo, static
// hosting), with the same rules as the server. PayStore is LocalStore with real payments,
// through the site's Worker (worker/) and Midtrans. ApiStore talks to server/server.mjs.
import { clientsOf } from './sso.js';
import { teamKey } from './team.js';
import { checkFan, SEAT_TAKEN } from './fanrules.js';
import { checkClick, checkClaim, checkSubscription, checkLead, checkConversions, passStatus, PASS_STATUSES, TAKEN, ACCESS_FEE, PAYMENT_ID } from './rules.js';

const DB = 'atvents:demo-db';
const DEVICE_KEY = 'atvents:device';
const fail = (status, message) => Object.assign(new Error(message), { status });
const newId = prefix => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

// This browser's device id, sent with every pass request (x-device): a paid pass opens on two
// devices (worker/devices.mjs). Made once and kept; clearing the site's data makes a new one.
export function deviceId() {
  let id = '';
  try { id = localStorage.getItem(DEVICE_KEY) || ''; } catch { /* below */ }
  if (/^[A-Za-z0-9_-]{16,64}$/.test(id)) return id;
  id = [...crypto.getRandomValues(new Uint8Array(18))].map(b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('');
  deviceId.mem ||= id;
  try { localStorage.setItem(DEVICE_KEY, id); } catch { return deviceId.mem; }
  return id;
}

// A JSON request to our own API; an error carries the status and the server's message.
async function call(path, { method = 'GET', body, headers = {}, keepalive = false, onHeaders } = {}) {
  const r = await fetch(path, {
    method, keepalive,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = r.status === 204 ? null : await r.json().catch(() => ({}));
  // retryAfter: the seconds the server asks us to wait (429, 503), for the live lists.
  // code 'device' (a pass open on two other devices): where its email code goes, and the pass.
  if (!r.ok) throw Object.assign(fail(r.status, data?.error || `HTTP ${r.status}`), { field: data?.field, code: data?.code, email: data?.email, mail: data?.mail, pass: data?.pass, expired: data?.expired, retryAfter: Number(r.headers.get('retry-after')) || 0 });
  if (onHeaders) onHeaders(r.headers, r.status);
  return data;
}

export class LocalStore {
  constructor() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(DB)) || {}; } catch { /* private mode: memory only */ }
    this.db = { clicks: [], claims: [], conversions: {}, leads: [], subscribers: [], payments: [], ...saved };
  }
  get mode() { return 'demo'; }
  get live() { return false; }
  save() { try { localStorage.setItem(DB, JSON.stringify(this.db)); } catch { /* memory only */ } }

  async click(d) {
    const c = checkClick(d);
    if (!c) throw fail(400, 'Unknown click');
    if (!this.db.clicks.some(x => x.id === c.id)) this.db.clicks = [...this.db.clicks, { ...c, at: new Date().toISOString() }].slice(-500);
    this.save();
    return { ok: true };
  }

  // Same outcomes as POST /api/claims. A pass opens only on a paid order of the access fee,
  // and one order opens one pass. Sending the same order again (a retry, a second tab) gives
  // back that pass; another email on it is refused.
  async claim(d) {
    const { claim: c, error } = checkClaim(d);
    if (error) throw fail(400, error);
    const pay = this.db.payments.find(x => x.id === c.payment);
    if (!pay || pay.status !== 'paid') throw fail(402, 'The payment has not gone through yet.');
    let p = this.db.claims.find(x => x.payment === c.payment);
    if (p && p.email !== c.email) throw fail(409, TAKEN);
    if (!p) this.db.claims.push(p = { id: newId('P'), ...c, status: 'confirmed', createdAt: new Date().toISOString() });
    this.save();
    return { id: p.id, token: '', status: p.status, eventId: p.eventId, cat: p.cat, qty: p.qty, seat: p.seat || '', name: p.name, route: 'paid', createdAt: p.createdAt };
  }

  // The access fee for a 3D seat view. In the demo nothing is charged: the payment page is a
  // stand-in for the payment provider's own (Midtrans, Xendit), and payDemo marks the order
  // paid the way the provider's webhook would.
  async pay({ eventId, email, name, seat }) {
    const id = `PAY-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    this.db.payments.push({ id, eventId, email, name, seat, amount: ACCESS_FEE, status: 'pending', createdAt: new Date().toISOString() });
    this.save();
    return { id, amount: ACCESS_FEE, status: 'pending', demo: true };
  }
  async payDemo(id) {
    const p = this.db.payments.find(x => x.id === id);
    if (!p || !PAYMENT_ID.test(id)) throw fail(404, 'Payment not found');
    p.status = 'paid';
    p.paidAt = new Date().toISOString();
    this.save();
    return { id, status: 'paid' };
  }
  async paymentStatus(id) {
    const p = this.db.payments.find(x => x.id === id);
    if (!p) throw fail(404, 'Payment not found');
    return { id, status: p.status, amount: p.amount };
  }

  async claimStatus(id) {
    const c = this.db.claims.find(x => x.id === id);
    if (!c) throw fail(404, 'Pass not found');
    return { id: c.id, eventId: c.eventId, cat: c.cat, qty: c.qty, seat: c.seat || '', name: c.name || '', route: c.route || 'affiliate', status: c.status, createdAt: c.createdAt };
  }

  // Seat mates (js/fans.js), the same answers as GET/PUT/DELETE /api/passes/<id>/fans. In
  // the demo they stay in this browser, so only this browser's own passes show up.
  async fans(p, change) {
    const own = this.db.claims.find(x => x.id === p.id);
    if (p.status !== 'confirmed' && own?.status !== 'confirmed') throw fail(403, 'Seat mates open once your pass is paid.');
    let list = (this.db.fans ||= []);
    if (change === null) list = this.db.fans = list.filter(f => f.id !== p.id);
    else if (change) {
      const { fan, field, error } = checkFan(change);
      if (error) throw Object.assign(fail(400, error), { field });
      // One seat shows one Instagram, as on the server.
      if (list.some(f => f.id !== p.id && f.eventId === p.eventId && f.seat === p.seat)) throw fail(409, SEAT_TAKEN);
      list = this.db.fans = [...list.filter(f => f.id !== p.id), { id: p.id, eventId: p.eventId, cat: p.cat, seat: p.seat, ...fan }];
    }
    if (change !== undefined) this.save();
    const rows = list.filter(f => f.eventId === p.eventId && f.cat === p.cat), me = rows.find(f => f.id === p.id);
    const others = list.filter(f => f.eventId === p.eventId && f.cat !== p.cat).map(f => ({ seat: f.seat, cat: f.cat }));
    return {
      eventId: p.eventId, group: '', community: '', me: me ? { name: me.name, instagram: me.instagram } : null,
      fans: rows.map(f => ({ seat: f.seat, cat: f.cat, name: f.name, instagram: f.instagram, ...(f.id === p.id ? { mine: true } : {}) })),
      others,
    };
  }

  async subscribe(d) {
    const { subscription: s, error } = checkSubscription(d);
    if (error) throw fail(400, error);
    if (!this.db.subscribers.some(x => x.email === s.email && x.kind === s.kind && x.eventId === s.eventId)) {
      this.db.subscribers.push({ ...s, createdAt: new Date().toISOString() });
      this.save();
    }
    return { ok: true };
  }

  async partnerLead(d) {
    const { lead, error } = checkLead(d);
    if (error) throw fail(400, error);
    const id = newId('L');
    this.db.leads.push({ id, ...lead, createdAt: new Date().toISOString() });
    this.save();
    return { ok: true, id };
  }

  // ---------- admin (demo: this browser's data)

  // Same shape as GET /api/admin/summary: per concert, per campaign source, and counts.
  async summary() {
    const { clicks, claims, leads, subscribers } = this.db;
    const cut = Date.now() - 30 * 864e5, events = {}, sources = {};
    const row = id => (events[id] ||= { eventId: id, clicks: 0, clicks30: 0, checking: 0, confirmed: 0, rejected: 0 });
    for (const c of clicks) {
      const r = row(c.eventId);
      r.clicks++;
      if (Date.parse(c.at) > cut) r.clicks30++;
      sources[c.src || ''] = (sources[c.src || ''] || 0) + 1;
    }
    for (const c of claims) row(c.eventId)[c.status]++;
    return {
      events: Object.values(events),
      sources: Object.entries(sources).map(([src, n]) => ({ src, clicks: n })).sort((a, b) => b.clicks - a.clicks),
      leads: leads.length,
      subscribers: subscribers.length,
    };
  }
  async claims() { return this.db.claims.slice().reverse(); }
  async setClaim(id, status) {
    if (!PASS_STATUSES.includes(status)) throw fail(400, 'Unknown status');
    const c = this.db.claims.find(x => x.id === id);
    if (!c) throw fail(404, 'Claim not found');
    c.status = status;
    this.save();
    return { ok: true };
  }
  async importConversions(list) {
    const rows = checkConversions(list);
    if (!rows) throw fail(400, 'The report has rows without a click id or status.');
    for (const r of rows) this.db.conversions[r.sub] = r.status;
    let confirmed = 0, rejected = 0;
    for (const c of this.db.claims) {
      if (c.status !== 'checking') continue;
      const s = passStatus(c.clicks.map(x => this.db.conversions[x]));
      if (s === 'confirmed') confirmed++;
      if (s === 'rejected') rejected++;
      if (s !== 'checking') c.status = s;
    }
    this.save();
    return { imported: rows.length, confirmed, rejected };
  }
  async leads() { return this.db.leads.slice().reverse(); }
  async subscribers() { return this.db.subscribers.slice().reverse(); }
  async reset() {
    this.db = { clicks: [], claims: [], conversions: {}, leads: [], subscribers: [], payments: [], fans: [] };
    try { localStorage.removeItem(DB); } catch { /* ignore */ }
  }
}

// Live payments. The order goes to the Worker, which hands over to Midtrans' payment page
// and gives back the pass with its key; the pass then asks the Worker how the payment went.
// Everything else stays in this browser, as in LocalStore. `sandbox`: the Worker has a
// Midtrans Sandbox key, so nothing is charged.
export class PayStore extends LocalStore {
  // From /api/config: Sandbox or not, the client key that opens Midtrans' card form inside
  // the page (without it, a card payment goes to Midtrans' payment page), whether the pass
  // email is switched on, the ways to pay switched on (js/paymethods.js), and the client ids
  // for "Continue with Google / Microsoft" (js/sso.js).
  constructor({ sandbox = false, clientKey = '', mail = false, methods = null, sso = null, staging = false, team = false } = {}) {
    super();
    // The staging copy (wrangler.jsonc, env.staging), and whether the team sign-in is on.
    this.staging = !!staging;
    this.team = !!team;
    this.sandbox = !!sandbox;
    this.clientKey = typeof clientKey === 'string' ? clientKey : '';
    this.mail = !!mail;
    this.methods = Array.isArray(methods) ? methods.filter(m => typeof m === 'string') : null;
    this.sso = clientsOf(sso);
  }
  get mode() { return 'pay'; }
  get live() { return true; }
  pay(d) { return call('api/payments', { method: 'POST', body: d, headers: { 'x-device': deviceId() } }); }
  // A member of the team (js/team.js): the pass opens without paying.
  get teamKey() { return this.team ? teamKey() : null; }
  teamPass(d) { return call('api/team/passes', { method: 'POST', body: d, headers: { 'x-team-key': this.teamKey?.key || '', 'x-device': deviceId() } }); }
  // Another way to pay: the server has Midtrans close this order first.
  cancelPay(id, token) { return call(`api/passes/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: { 'x-pass-token': token, 'x-device': deviceId() } }); }
  // Seat mates: undefined reads, a profile shows it, null takes it down. A pass from the
  // preview, without a key, is still this browser's.
  // With { since: true } a read sends the version of the list it already has, and gets
  // { unchanged: true } back when nothing changed (a tiny answer, for the live list).
  fans(p, change, { since = false } = {}) {
    if (!p.token) return super.fans(p, change);
    const path = `api/passes/${encodeURIComponent(p.id)}/fans`, headers = { 'x-pass-token': p.token, 'x-device': deviceId() };
    this.fansVer ||= {};
    const onHeaders = h => { const v = h.get('x-fans-version'); if (v) this.fansVer[p.id] = v; };
    // The list is the same for the whole category; the server names this pass's own seat.
    const mine = d => {
      if (d?.mineSeat && Array.isArray(d.fans)) for (const f of d.fans) if (f.seat === d.mineSeat) f.mine = true;
      return d;
    };
    if (change === null) return call(path, { method: 'DELETE', headers, onHeaders }).then(mine);
    if (change) return call(path, { method: 'PUT', headers, body: change, onHeaders }).then(mine);
    if (since && this.fansVer[p.id]) headers['x-fans-have'] = this.fansVer[p.id];
    return call(path, { headers, onHeaders }).then(d => mine(d) ?? { unchanged: true });
  }
  // A pass from the preview, without a key, is still this browser's.
  claimStatus(id, token) {
    return token ? call(`api/passes/${encodeURIComponent(id)}`, { headers: { 'x-pass-token': token, 'x-device': deviceId() } }) : super.claimStatus(id);
  }
  // A paid pass open on two other devices: a code to the buyer's email, then the code back.
  passCode(id, token) { return call(`api/passes/${encodeURIComponent(id)}/code`, { method: 'POST', headers: { 'x-pass-token': token, 'x-device': deviceId() } }); }
  passDevice(id, token, code) { return call(`api/passes/${encodeURIComponent(id)}/device`, { method: 'POST', body: { code }, headers: { 'x-pass-token': token, 'x-device': deviceId() } }); }
}

export class ApiStore {
  constructor(base = '') {
    this.base = base;
    try { this.adminToken = sessionStorage.getItem('atvents:admin') || ''; } catch { this.adminToken = ''; }
  }
  get mode() { return 'server'; }
  get live() { return false; }

  setAdminToken(t) {
    this.adminToken = t;
    try { sessionStorage.setItem('atvents:admin', t); } catch { /* memory only */ }
  }

  req(path, { headers = {}, ...opts } = {}) {
    const admin = this.adminToken && path.startsWith('api/admin/') ? { authorization: `Bearer ${this.adminToken}` } : {};
    return call(this.base + path, { ...opts, headers: { ...admin, ...headers } });
  }

  // keepalive: the fan is on their way to tiket.com, the record must still arrive.
  click(c) { return this.req('api/clicks', { method: 'POST', body: c, keepalive: true }); }
  claim(c) { return this.req('api/claims', { method: 'POST', body: c }); }
  claimStatus(id, token) { return this.req(`api/claims/${encodeURIComponent(id)}`, { headers: { 'x-pass-token': token } }); }
  // The server creates the order with the payment provider and returns its payment page.
  pay(d) { return this.req('api/payments', { method: 'POST', body: d }); }
  paymentStatus(id) { return this.req(`api/payments/${encodeURIComponent(id)}`); }
  subscribe(s) { return this.req('api/subscribe', { method: 'POST', body: s }); }
  partnerLead(l) { return this.req('api/partners', { method: 'POST', body: l }); }

  summary() { return this.req('api/admin/summary'); }
  async claims() { return (await this.req('api/admin/claims')).claims; }
  setClaim(id, status) { return this.req(`api/admin/claims/${encodeURIComponent(id)}`, { method: 'POST', body: { status } }); }
  importConversions(rows) { return this.req('api/admin/conversions', { method: 'POST', body: { rows } }); }
  async leads() { return (await this.req('api/admin/leads')).leads; }
  async subscribers() { return (await this.req('api/admin/subscribers')).subscribers; }
}
