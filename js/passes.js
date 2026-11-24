// Links to the official ticket sellers, and the 3D pass a fan buys here.
//
// Tickets are bought from the seller named on each concert (tiket.com, Loket and others).
// A tiket.com link may carry a click id of ours (the affiliate link's sub id), recorded here
// and on the server. The 3D seat view is sold here: the fan fills in the concert, the seat,
// their name and email, pays the access fee, and the pass opens at once.
import { eventMeta, isConcert, onTiket, sellerOf } from './events.js';
import { CLICK_ID, maskRef, validAffiliate } from './rules.js';
import { payMethod, payDetails } from './paymethods.js';
import { state, emit, esc, campaign } from './ui.js';
import { WA_GROUP } from './fanrules.js';
import { planOf, feeOf } from './order.js';

const WALLET = 'atvents:passes';
const CLICKS = 'atvents:clicks';
const CLICK_DAYS = 60;
const read = (key, mem) => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return mem || []; } };
const write = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* memory only */ } };

// ---------------------------------------------------------------- buy links

export function newClickId() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map(x => (x % 36).toString(36)).join('');
}

// One click id per concert for this page view; a recorded click gets a fresh one, so two
// purchases never share an id.
const subs = new Map();
const subFor = id => { if (!subs.has(id)) subs.set(id, newClickId()); return subs.get(id); };

// The affiliate link for a show's seller: tiket.com's, or another approved brand's
// (Traveloka). '' when the seller has none, and the button goes straight to it.
const sellerTpl = e => (onTiket(e) ? state.cfg.affiliateLink : state.cfg.sellerLinks?.[sellerOf(e)]) || '';
const fill = (tpl, url, sub, e) => tpl.replace('{url}', encodeURIComponent(url)).replace('{sub}', sub)
  .replace('{src}', encodeURIComponent(campaign().src || 'site')).replace('{event}', encodeURIComponent(e.id));
export const affiliated = e => validAffiliate(sellerTpl(e));

export function buyUrl(e, sub = subFor(e.id)) {
  const tpl = sellerTpl(e);
  if (!validAffiliate(tpl)) return e.official.url;
  return fill(tpl, e.official.url, sub, e);
}

// Hotels and flights on tiket.com, and things to do on Klook, for the trip to a concert,
// through the affiliate links. Not a ticket sale, so no click id: the sub id names the kind
// of trip and the concert, and these links never open the claim form. No affiliate link:
// the plain page. Labels and pages follow the venue's city.
const cityOf = e => e.place?.city || 'Jakarta';
export const TRAVEL = {
  hotel: { label: () => 'Hotels near the venue', url: () => 'https://www.tiket.com/id-id/hotel' },
  flight: { label: e => `Flights to ${cityOf(e)}`, url: () => 'https://www.tiket.com/id-id/pesawat' },
  todo: { label: e => `Things to do in ${cityOf(e)}`, url: e => `https://www.klook.com/id/search/result/?query=${encodeURIComponent(cityOf(e))}`, link: 'Klook' },
};
export function travelUrl(e, kind) {
  const t = TRAVEL[kind];
  if (!t) return '';
  const tpl = t.link ? state.cfg.sellerLinks?.[t.link] : state.cfg.affiliateLink;
  return validAffiliate(tpl) ? fill(tpl, t.url(e), `${kind}-${e.id}`.slice(0, 40), e) : t.url(e);
}

// Attributes for a link out to tiket.com. `sponsored` tells search engines it is an affiliate link.
// A link to another seller carries no click id: no click, no claim form after it. Every link
// names its concert (and the category, from a category ticket), so the sold-out note
// (js/soldpop.js) can step in before the fan leaves for the seller.
const outAttrs = (e, cat) => ` data-out="${esc(e.id)}"${cat ? ` data-out-cat="${esc(cat)}"` : ''}`;
export const buyAttrs = (e, cat = '') => (!onTiket(e) ? ` target="_blank" rel="noopener${affiliated(e) ? ' sponsored' : ''}"` : ` target="_blank" rel="noopener sponsored" data-buy="${esc(e.id)}" data-sub="${subFor(e.id)}"`) + outAttrs(e, cat);
export const buyLink = (e, label, cls = 'btn btn-coral') => `<a class="${cls}" href="${esc(buyUrl(e))}"${buyAttrs(e)}>${onTiket(e) ? label : label.replace(/tiket\.com/g, esc(sellerOf(e)))}</a>`;

const localClicks = () => read(CLICKS, localClicks.mem);
function recordClick(eventId, sub) {
  if (!isConcert(eventId) || !CLICK_ID.test(sub)) return;
  const cut = Date.now() - CLICK_DAYS * 864e5;
  const list = localClicks().filter(c => Date.parse(c.at) > cut && c.id !== sub).concat({ id: sub, eventId, at: new Date().toISOString() }).slice(-100);
  localClicks.mem = list;
  write(CLICKS, list);
  state.store.click({ id: sub, eventId, src: campaign().src || '' }).catch(() => {});
  // The next click on this concert gets its own id. Changed after the browser has read the link.
  subs.set(eventId, newClickId());
  setTimeout(() => document.querySelectorAll(`a[data-buy="${CSS.escape(eventId)}"]`).forEach(a => {
    a.dataset.sub = subFor(eventId);
    a.href = buyUrl(eventMeta(eventId));
  }), 0);
}

// The concert whose Buy button was just clicked in this tab, for the note on the form.
export const justBought = { id: '' };

// One listener for every buy link on every page. Middle clicks open a tab too.
export function bindBuyLinks() {
  const onClick = ev => {
    const a = ev.target.closest('a[data-buy]');
    if (!a || !(ev.type === 'click' || ev.button === 1)) return;
    recordClick(a.dataset.buy, a.dataset.sub);
    // A plain click opens tiket.com in a new tab (target=_blank); this tab goes to the seat
    // form for that concert, ready for when the fan comes back with the e-ticket.
    const plain = ev.type === 'click' && ev.button === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey;
    if (plain && isConcert(a.dataset.buy)) {
      justBought.id = a.dataset.buy;
      setTimeout(() => {
        const to = `#unlock-${a.dataset.buy}`;
        if (location.hash === to) window.dispatchEvent(new HashChangeEvent('hashchange'));
        else location.hash = to;
      }, 60);
    }
  };
  document.addEventListener('click', onClick);
  document.addEventListener('auxclick', onClick);
}

// The click ids this device sent to tiket.com for a concert, newest first, for a claim.
export const clicksFor = eventId => localClicks().filter(c => c.eventId === eventId).reverse().map(c => c.id).slice(0, 20);

// ---------------------------------------------------------------- the wallet

// The wallet on this device says which passes are paid, but anyone can write to it. With
// live payments a pass opens only once the Worker has said it is paid, on this page view:
// until then a 'confirmed' pass reads as 'verifying' (and is kept as 'confirmed').
const verified = new Set();
export const markVerified = id => { verified.add(id); };
const live = () => !!state.store?.live;
// A pass with no key (the preview's) cannot be checked, so with live payments it is closed.
const asShown = p => (p.status !== 'confirmed' || !live() || verified.has(p.id) ? p : { ...p, status: p.token ? 'verifying' : 'rejected' });
const asKept = p => (p.status === 'verifying' ? { ...p, status: 'confirmed' } : p);

export const passes = {
  all() { return read(WALLET, this._mem).map(asShown); },
  get(id) { return this.all().find(p => p.id === id); },
  save(p) {
    const list = read(WALLET, this._mem).filter(x => x.id !== p.id).concat(asKept(p));
    this._mem = list;
    write(WALLET, list);
    emit('passes');
  },
  remove(id) {
    const list = read(WALLET, this._mem).filter(x => x.id !== id);
    this._mem = list;
    write(WALLET, list);
    emit('passes');
  },
};

// The pass that opens a concert's seat views on this device: the newest one not closed.
export const activePass = eventId => passes.all().filter(p => p.eventId === eventId && p.status !== 'rejected').at(-1) || null;
// Only a checked pass opens the venue from the seat, and only its own seat (see tour.js).
export const openPass = eventId => passes.all().filter(p => p.eventId === eventId && p.status === 'confirmed').at(-1) || null;
// A paid 3D Pass Plus opens every seat of its concert, like a demo venue.
export const plusPass = eventId => passes.all().filter(p => p.eventId === eventId && p.status === 'confirmed' && p.plan === 'plus').at(-1) || null;
// A preview build (workers.dev) opened with ?open shows every seat view and Plus feature, to
// try a change without a pass. Never on atvents.com.
const previewOpen = typeof location !== 'undefined' && /\.workers\.dev$/.test(location.hostname) && new URLSearchParams(location.search).has('open');
export const canView = venue => !!venue.meta.demo || previewOpen || !!plusPass(venue.eventId);
// A paid seat pass of the concert that can still be upgraded to Plus: none when the concert
// has a Plus pass on this device already.
// On sale with PASS_PLUS on. A member of the team signed in on #admin sees it on sale before
// that, to check the form and the pass first: the team's own passes are Plus and free, and the
// Worker still refuses a paid Plus order until PASS_PLUS is on.
export const plusOnSale = () => !!(state.store?.plusOn || state.store?.teamKey);
export const upgradable = eventId => (!plusOnSale() || plusPass(eventId) ? null : passes.all().filter(p => p.eventId === eventId && p.status === 'confirmed' && p.plan !== 'plus').at(-1) || null);

// The seats on the fan's e-tickets, marked in the 3D view: as many as the booking has.
// Marking one more than that lets go of the first one marked.
export function toggleSeat(p, seatId) {
  const seats = p.seats || [];
  const next = seats.includes(seatId) ? seats.filter(s => s !== seatId) : [...seats, seatId].slice(-p.qty);
  passes.save({ ...p, seats: next });
  return next.includes(seatId);
}

// Open a pass with a paid order. The server keeps the name, email and payment; this device
// keeps the pass, the token that opens it elsewhere and the payment's last digits.
export async function claim({ eventId, name, email, cat, seat, payment }) {
  const r = await state.store.claim({ eventId, name, email, cat, seat, payment, consent: true, clicks: clicksFor(eventId) });
  const pass = { id: r.id, token: r.token || '', eventId, cat: r.cat, qty: r.qty || 1, seat: r.seat || seat || '', name: r.name || name, route: 'paid', plan: planOf(r.plan), amount: r.amount, status: r.status, ref: maskRef(payment), createdAt: r.createdAt, seats: r.seat || seat ? [r.seat || seat] : passes.get(r.id)?.seats || [] };
  passes.save(pass);
  return pass;
}

// A live order (PayStore): the pass waits on this device for its payment, as 'checking',
// with the key that asks the Worker how the payment went, and what the checkout needs to
// open again after a reload: the way to pay and what to pay with (the account number, the
// QR code, the store code), or the card form's token and Midtrans' payment page; the email
// the pass goes to, and when the order closes.
const PAY_PAGE = /^https:\/\/app\.(sandbox\.)?midtrans\.com\//;
export function holdPass(r) {
  const pass = {
    id: r.id, token: r.token, eventId: r.eventId, cat: r.cat, qty: 1, seat: r.seat, name: r.name, route: 'paid', status: r.status, ref: maskRef(r.id), createdAt: r.createdAt, seats: [r.seat],
    plan: planOf(r.plan), amount: Number.isInteger(r.amount) ? r.amount : feeOf(r.plan, !!r.base), base: r.base || '',
    snap: typeof r.snap === 'string' ? r.snap : '', url: PAY_PAGE.test(r.url || '') ? r.url : '', email: r.email || '', expiresAt: r.expiresAt || '',
    method: payMethod(r.method)?.id || '', pay: payDetails(r.method, r.pay) || null,
  };
  passes.save(pass);
  return pass;
}

// Ask how the check is going. Offline, or the server busy, the pass stays as it was. A pass
// the Worker does not know (a key it never signed) closes; one open on two other devices
// asks for the email code ('device').
export async function refresh(p) {
  // With live payments a pass with no key cannot be checked, so it never opens.
  if (live() && !p.token) return true;
  let r;
  try { r = await state.store.claimStatus(p.id, p.token); } catch (err) {
    if (live() && (err?.status === 404 || err?.status === 400)) { passes.save({ ...p, status: 'rejected', wa: null }); return true; }
    if (live() && err?.status === 403 && err.code === 'device') { saveLocked(p, err); return true; }
    return false;   // offline, or the server busy: the caller asks again later
  }
  if (r.status === 'confirmed') markVerified(p.id);
  // The Worker says which WhatsApp links a paid pass has; the demo store says nothing.
  const wa = r.status !== 'confirmed' ? null : 'wa' in r ? waLinks(r.wa) : p.wa || null;
  const now = asShown({ ...p, status: r.status }).status;
  const plan = r.plan ? planOf(r.plan) : p.plan;
  if (now !== p.status || plan !== p.plan || (r.seat && r.seat !== p.seat) || JSON.stringify(wa) !== JSON.stringify(p.wa || null)) {
    passes.save({ ...p, status: r.status, plan, seat: r.seat || p.seat, seats: r.seat ? [r.seat] : p.seats, wa });
  }
  return true;
}

// A paid pass open on two other devices: kept here as 'device', with where the code goes.
function saveLocked(p, err) {
  if (p.status === 'device' && p.lockedTo === (err.email || '')) return;
  passes.save({ ...p, status: 'device', lockedTo: err.email || '', canMail: !!err.mail, wa: null });
}

// The email code for this device, then the code back: the pass opens here.
export const sendCode = p => state.store.passCode(p.id, p.token);
export async function useCode(p, code) {
  const r = await state.store.passDevice(p.id, p.token, code);
  markVerified(p.id);
  passes.save({ ...p, status: r.status, seat: r.seat || p.seat, wa: waLinks(r.wa), lockedTo: undefined, canMail: undefined });
  return passes.get(p.id);
}

// The WhatsApp links a paid pass gets from the Worker (FANBASE_WA): the concert's fanbase
// group and the Atvents members' community. Only WhatsApp's own invite links are kept.
export function waLinks(v) {
  const ok = x => (typeof x === 'string' && WA_GROUP.test(x) ? x : '');
  const group = ok(v?.group), community = ok(v?.community);
  return group || community ? { group, community } : null;
}

// A pass link from another device: #pass-<id>-<token>.
export async function importPass(id, token) {
  let r;
  try { r = await state.store.claimStatus(id, token); } catch (err) {
    // Paid, and open on two other devices: the pass comes in locked, with the email code.
    if (err?.status !== 403 || err.code !== 'device' || !err.pass || err.pass.id !== id) throw err;
    const k = err.pass, old = passes.get(id);
    const p = { ...(old || {}), id, token, eventId: k.eventId, cat: k.cat, qty: 1, seat: k.seat || '', route: 'paid', plan: planOf(k.plan || old?.plan), status: 'device', lockedTo: err.email || '', canMail: !!err.mail, ref: old?.ref || '', createdAt: k.createdAt, seats: old?.seats || (k.seat ? [k.seat] : []), wa: null };
    passes.save(p);
    return passes.get(id);
  }
  if (r.status === 'confirmed') markVerified(id);
  const p = { id: r.id, token, eventId: r.eventId, cat: r.cat, qty: r.qty, seat: r.seat || '', route: r.route || 'affiliate', plan: planOf(r.plan), status: r.status, ref: passes.get(r.id)?.ref || '', createdAt: r.createdAt, seats: r.seat ? [r.seat] : passes.get(r.id)?.seats || [], wa: waLinks(r.wa) };
  // How the fan set the venue's numbering stays with the pass on this device (seatflip.js).
  const numbering = passes.get(r.id)?.numbering;
  if (numbering) p.numbering = numbering;
  passes.save(p);
  return passes.get(id);
}

export const passLink = p => (p.token ? `${location.origin}${location.pathname}#pass-${p.id}-${p.token}` : '');

export const STATUS = {
  checking: { label: 'Waiting for payment', note: 'Your seat view opens as soon as the payment goes through.' },
  confirmed: { label: 'Paid · open', note: 'Paid. Your seat view is open, and stays yours after the show too.' },
  rejected: { label: 'Closed', note: 'This pass is closed: its payment did not go through, or it was refunded. Write to us if that looks wrong.' },
  verifying: { label: 'Checking…', note: 'Checking your pass with Atvents. The seat view opens once it is confirmed, which needs an internet connection.' },
  device: { label: 'On 2 other devices', note: 'This pass is already open on two other devices. Get a code by email to open it here: the device used least recently is then signed out.' },
};
