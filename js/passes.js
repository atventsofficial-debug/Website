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

export function buyUrl(e, sub = subFor(e.id)) {
  const tpl = state.cfg.affiliateLink;
  // Shows tiket.com does not sell link straight to their own seller, with no affiliate link.
  if (!onTiket(e) || !validAffiliate(tpl)) return e.official.url;
  return tpl.replace('{url}', encodeURIComponent(e.official.url)).replace('{sub}', sub)
    .replace('{src}', encodeURIComponent(campaign().src || 'site')).replace('{event}', encodeURIComponent(e.id));
}

// Attributes for a link out to tiket.com. `sponsored` tells search engines it is an affiliate link.
// A link to another seller carries no click id: no click, no claim form after it.
export const buyAttrs = e => !onTiket(e) ? ' target="_blank" rel="noopener"' : ` target="_blank" rel="noopener sponsored" data-buy="${esc(e.id)}" data-sub="${subFor(e.id)}"`;
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

export const passes = {
  all() { return read(WALLET, this._mem); },
  get(id) { return this.all().find(p => p.id === id); },
  save(p) {
    const list = this.all().filter(x => x.id !== p.id).concat(p);
    this._mem = list;
    write(WALLET, list);
    emit('passes');
  },
  remove(id) {
    const list = this.all().filter(x => x.id !== id);
    this._mem = list;
    write(WALLET, list);
    emit('passes');
  },
};

// The pass that opens a concert's seat views on this device: the newest one not closed.
export const activePass = eventId => passes.all().filter(p => p.eventId === eventId && p.status !== 'rejected').at(-1) || null;
// Only a checked pass opens the venue from the seat, and only its own seat (see tour.js).
export const openPass = eventId => passes.all().filter(p => p.eventId === eventId && p.status === 'confirmed').at(-1) || null;
export const canView = venue => !!venue.meta.demo;

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
  const pass = { id: r.id, token: r.token || '', eventId, cat: r.cat, qty: r.qty || 1, seat: r.seat || seat || '', name: r.name || name, route: 'paid', status: r.status, ref: maskRef(payment), createdAt: r.createdAt, seats: r.seat || seat ? [r.seat || seat] : passes.get(r.id)?.seats || [] };
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
    snap: typeof r.snap === 'string' ? r.snap : '', url: PAY_PAGE.test(r.url || '') ? r.url : '', email: r.email || '', expiresAt: r.expiresAt || '',
    method: payMethod(r.method)?.id || '', pay: payDetails(r.method, r.pay) || null,
  };
  passes.save(pass);
  return pass;
}

// Ask how the check is going. Offline, or without the token, the pass stays as it was.
export async function refresh(p) {
  if (state.store.mode === 'server' && !p.token) return;
  const r = await state.store.claimStatus(p.id, p.token).catch(() => null);
  if (r && (r.status !== p.status || (r.seat && r.seat !== p.seat))) passes.save({ ...p, status: r.status, seat: r.seat || p.seat, seats: r.seat ? [r.seat] : p.seats });
}

// A pass link from another device: #pass-<id>-<token>.
export async function importPass(id, token) {
  const r = await state.store.claimStatus(id, token);
  const p = { id: r.id, token, eventId: r.eventId, cat: r.cat, qty: r.qty, seat: r.seat || '', route: r.route || 'affiliate', status: r.status, ref: passes.get(r.id)?.ref || '', createdAt: r.createdAt, seats: r.seat ? [r.seat] : passes.get(r.id)?.seats || [] };
  // How the fan set the venue's numbering stays with the pass on this device (seatflip.js).
  const numbering = passes.get(r.id)?.numbering;
  if (numbering) p.numbering = numbering;
  passes.save(p);
  return p;
}

export const passLink = p => (p.token ? `${location.origin}${location.pathname}#pass-${p.id}-${p.token}` : '');

export const STATUS = {
  checking: { label: 'Waiting for payment', note: 'Your seat view opens as soon as the payment goes through.' },
  confirmed: { label: 'Paid · open', note: 'Paid. Your seat view is open until after the show.' },
  rejected: { label: 'Closed', note: 'This pass is closed: its payment did not go through, or it was refunded. Write to us if that looks wrong.' },
};
