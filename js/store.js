// What visitors send us: clicks to tiket.com, 3D pass claims, partner requests and sign-ups,
// and the admin's view of them. LocalStore keeps it all in this browser (demo, static
// hosting), with the same rules as the server. ApiStore talks to server/server.mjs.
import { checkClick, checkClaim, checkSubscription, checkLead, checkConversions, passStatus, PASS_STATUSES, MAX_CLICKS, TAKEN, ACCESS_FEE, PAYMENT_ID } from './rules.js';

const DB = 'atvents:demo-db';
const fail = (status, message) => Object.assign(new Error(message), { status });
const newId = prefix => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export class LocalStore {
  constructor() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(DB)) || {}; } catch { /* private mode: memory only */ }
    this.db = { clicks: [], claims: [], conversions: {}, leads: [], subscribers: [], payments: [], ...saved };
  }
  get mode() { return 'demo'; }
  save() { try { localStorage.setItem(DB, JSON.stringify(this.db)); } catch { /* memory only */ } }

  async click(d) {
    const c = checkClick(d);
    if (!c) throw fail(400, 'Unknown click');
    if (!this.db.clicks.some(x => x.id === c.id)) this.db.clicks = [...this.db.clicks, { ...c, at: new Date().toISOString() }].slice(-500);
    this.save();
    return { ok: true };
  }

  // Same outcomes as POST /api/claims. One booking opens one pass: the same email gets that
  // pass again, with any new clicks added; another email is refused unless the pass on the
  // booking was closed.
  async claim(d) {
    const { claim: c, error } = checkClaim(d);
    if (error) throw fail(400, error);
    // A click recorded for another concert does not count for this one.
    const clicks = c.clicks.filter(id => !this.db.clicks.some(x => x.id === id && x.eventId !== c.eventId));
    let p = this.db.claims.find(x => x.eventId === c.eventId && x.orderRef === c.orderRef);
    if (p && p.email !== c.email) {
      if (p.status !== 'rejected') throw fail(409, TAKEN);
      this.db.claims = this.db.claims.filter(x => x !== p);
      p = null;
    }
    if (c.route === 'outside' && !this.db.payments.some(x => x.id === c.payment && x.status === 'paid')) throw fail(402, 'The Rp25.000 access fee has not been paid yet.');
    if (p) {
      p.clicks = [...new Set([...p.clicks, ...clicks])].slice(-MAX_CLICKS);
      // A new e-ticket or seat goes back to the review queue.
      if (c.seat) p.seat = c.seat;
      if (c.proof) { p.proof = c.proof; if (p.status === 'checking') p.reviewed = false; }
    } else this.db.claims.push(p = { id: newId('P'), ...c, clicks, status: 'checking', createdAt: new Date().toISOString() });
    if (p.status === 'checking') p.status = passStatus(p.clicks.map(s => this.db.conversions[s]));
    this.save();
    return { id: p.id, token: '', status: p.status, eventId: p.eventId, cat: p.cat, qty: p.qty, seat: p.seat || '', route: p.route || 'affiliate', createdAt: p.createdAt };
  }

  // The Rp25.000 access fee for tickets bought elsewhere. In the demo nothing is charged: the
  // payment page is a stand-in for the payment provider's own (Midtrans, Xendit), and
  // payDemo marks the order paid the way the provider's webhook would.
  async pay({ eventId, email }) {
    const id = `PAY-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    this.db.payments.push({ id, eventId, email, amount: ACCESS_FEE, status: 'pending', createdAt: new Date().toISOString() });
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
    return { id: c.id, eventId: c.eventId, cat: c.cat, qty: c.qty, seat: c.seat || '', route: c.route || 'affiliate', status: c.status, createdAt: c.createdAt };
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
    this.db = { clicks: [], claims: [], conversions: {}, leads: [], subscribers: [], payments: [] };
    try { localStorage.removeItem(DB); } catch { /* ignore */ }
  }
}

export class ApiStore {
  constructor(base = '') {
    this.base = base;
    try { this.adminToken = sessionStorage.getItem('atvents:admin') || ''; } catch { this.adminToken = ''; }
  }
  get mode() { return 'server'; }

  setAdminToken(t) {
    this.adminToken = t;
    try { sessionStorage.setItem('atvents:admin', t); } catch { /* memory only */ }
  }

  async req(path, { method = 'GET', body, headers = {}, keepalive = false } = {}) {
    const r = await fetch(this.base + path, {
      method, keepalive,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(this.adminToken && path.startsWith('api/admin/') ? { authorization: `Bearer ${this.adminToken}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(r.status, data.error || `HTTP ${r.status}`);
    return data;
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
