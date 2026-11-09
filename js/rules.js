// Formats and checks the browser and the server agree on. The page checks a form before
// sending it, the server (or the demo store) again before storing. Pure functions, no DOM.
import { getEvent, isConcert } from './events.js';

// Tickets a fan can unlock on one booking. tiket.com caps most shows at four per account.
export const MAX_QTY = 8;

// Our click id, sent to tiket.com in the affiliate link and back in the network's report.
export const CLICK_ID = /^[a-z0-9]{12}$/;
export const EMAIL = /^[^\s@<>()"',;:]{1,64}@[^\s@<>()"',;:]{1,190}\.[a-z]{2,24}$/i;
export const PHONE = /^\+?[0-9 ()-]{6,24}$/;

// A tiket.com order id as the fan types it: spaces and dots dropped, upper case.
export const normalRef = v => String(v ?? '').toUpperCase().replace(/[\s.]/g, '').slice(0, 40);
export const isOrderRef = v => /^[A-Z0-9-]{6,24}$/.test(v);
// What the page shows of it later: the last four characters.
export const maskRef = v => `••••${String(v).slice(-4)}`;
export const maskEmail = e => String(e).replace(/^(.)[^@]*(@.*)$/, '$1***$2');

// An affiliate deeplink template: https, with the places for tiket.com's page and our
// click id. Anything else is ignored and fans go straight to tiket.com.
export const validAffiliate = t => typeof t === 'string' && t.length <= 600 && /^https:\/\/[^\s"'<>`]+$/.test(t) && t.includes('{url}') && t.includes('{sub}');

// What a partner says their business is, and roughly how many tickets it sells a year.
export const PARTNER_KINDS = ['ticketing', 'promoter', 'venue', 'travel', 'brand', 'media', 'other'];
export const VOLUMES = ['under-10k', '10k-100k', '100k-1m', 'over-1m'];

// Campaign source from a link (?src=tiktok): attribution only, so anything odd is dropped.
export const cleanSource = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);

// A conversion status as an affiliate network's report words it, or null when unknown.
// Refusals are checked first, so "invalid" never reads as "valid".
export function conversionStatus(word) {
  const w = String(word ?? '').trim().toLowerCase();
  if (/reject|declin|cancel|invalid|void|refund|fraud/.test(w)) return 'rejected';
  if (/approv|confirm|valid|paid|success|complete/.test(w)) return 'approved';
  if (/pend|hold|wait|new|review|open/.test(w)) return 'pending';
  return null;
}

// A 3D pass is confirmed once the network reports a sale on one of its clicks, and closed
// when every sale reported on them was refused. Until then it stays open while we check.
export const PASS_STATUSES = ['checking', 'confirmed', 'rejected'];
export function passStatus(conversions) {
  const s = conversions.filter(Boolean);
  if (s.some(x => x !== 'rejected')) return 'confirmed';
  if (s.length) return 'rejected';
  return 'checking';
}

// Rows one import may carry.
export const MAX_REPORT_ROWS = 5000;

// Reads a conversion report pasted from a spreadsheet: comma, semicolon or tab separated,
// with a header row. The click id is the column called aff_sub, sub id or similar; the
// status column is the one called status. Returns [{ sub, status }] and what was skipped.
export function parseConversions(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], skipped: 0, error: 'Paste the report with its header row.' };
  const sep = [',', ';', '\t'].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const cells = l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
  const head = cells(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const subCol = head.findIndex(h => ['affsub', 'affsub1', 'subid', 'subid1', 'sub1', 'clickid', 'sub'].includes(h));
  const statusCol = head.findIndex(h => h === 'status' || h === 'conversionstatus');
  if (subCol < 0 || statusCol < 0) return { rows: [], skipped: 0, error: 'The header needs a sub id column (aff_sub) and a status column.' };
  const rows = [];
  let skipped = 0;
  for (const l of lines.slice(1)) {
    const c = cells(l), sub = String(c[subCol] || '').toLowerCase(), status = conversionStatus(c[statusCol]);
    if (CLICK_ID.test(sub) && status) rows.push({ sub, status });
    else skipped++;
  }
  return { rows, skipped, error: '' };
}

// ---------------------------------------------------------------- what visitors send

// Typed text: control characters and invisible direction marks become spaces, so a name
// cannot reorder what the admin reads. Only a message keeps its line breaks.
const LINE_JUNK = /[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g;
const TEXT_JUNK = /[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g;
const line = v => String(v ?? '').replace(LINE_JUNK, ' ').trim();
const text = v => String(v ?? '').replace(/\r\n?/g, '\n').replace(TEXT_JUNK, ' ').trim();
const email = v => line(v).toLowerCase();
const isEmail = v => v.length <= 160 && EMAIL.test(v);
const no = (field, error) => ({ field, error });

// A website as typed: empty is fine, "example.com" gets https://, anything else must be a
// web address. Null when it is not one.
export function webAddress(v) {
  const s = line(v);
  if (!s) return '';
  if (s.length > 200) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}

// Each check returns the cleaned value, or the form field at fault and what to tell the
// visitor. `field` is the input's name on the page.

// A click out to tiket.com: our click id and the concert. Null when either is unknown.
export function checkClick(d) {
  const id = line(d?.id), eventId = line(d?.eventId);
  return CLICK_ID.test(id) && isConcert(eventId) ? { id, eventId, src: cleanSource(d.src) } : null;
}

// A 3D pass claim: the tiket.com booking, and the click ids this device sent with it.
// One booking opens one pass: the same email gets that pass again, with any new clicks
// added (up to MAX_CLICKS); another email hears TAKEN, unless the pass was closed.
export const MAX_CLICKS = 40;
export const TAKEN = 'This order ID has already unlocked a 3D view with another email. Contact us if it is your booking.';
export function checkClaim(d = {}) {
  const eventId = line(d.eventId), v = isConcert(eventId) ? getEvent(eventId) : null;
  const cat = line(d.cat), orderRef = normalRef(d.orderRef), mail = email(d.email);
  if (!v) return no('eventId', 'Choose your concert.');
  if (!v.catById[cat]) return no('cat', 'Choose the category on your ticket.');
  if (!Number.isInteger(d.qty) || d.qty < 1 || d.qty > MAX_QTY) return no('qty', `Tickets in the order: 1 to ${MAX_QTY}.`);
  if (!isOrderRef(orderRef)) return no('orderRef', 'Check the order ID: the letters and numbers from your tiket.com booking, 6 to 24 of them.');
  if (!isEmail(mail)) return no('email', 'Please enter the email you used on tiket.com.');
  const route = d.route === 'outside' ? 'outside' : 'affiliate';
  // The seat on the e-ticket, from the venue's own seat list: it has to exist, and sit in the
  // category the fan chose. Older clients send none.
  let seat = '';
  if (d.seat != null && d.seat !== '') {
    seat = line(d.seat);
    const i = v.seatById.get(seat);
    if (i === undefined) return no('seat', 'Choose the seat on your e-ticket.');
    if (v.seats[i].cat !== cat) return no('seat', 'That seat is not in the category you chose. Check your e-ticket.');
  }
  // Bought elsewhere: the Rp25.000 access fee comes first, so a claim carries its payment.
  const payment = route === 'outside' ? line(d.payment) : '';
  if (route === 'outside' && !PAYMENT_ID.test(payment)) return no('payment', 'Pay the Rp25.000 access fee first.');
  if (d.consent !== true) return no('consent', route === 'outside' ? 'Please confirm these are your tickets and accept the terms.' : 'Please confirm you bought through our link and accept the terms.');
  const proof = d.proof && typeof d.proof === 'object' ? checkProof(d.proof) : null;
  if (d.requireProof && !proof) return no('proof', 'Add your e-ticket: a photo, a screenshot or the PDF from tiket.com.');
  const clicks = Array.isArray(d.clicks) ? [...new Set(d.clicks.filter(x => typeof x === 'string' && CLICK_ID.test(x)))].slice(0, 20) : [];
  return { claim: { eventId, cat, qty: d.qty, orderRef, email: mail, clicks, route, seat, payment, proof } };
}

// The e-ticket a fan sends with a claim, checked by a person before the 3D view opens.
// The page sends its name, type and size, with the file itself as a data URL in the demo.
export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_PROOF = 4 * 1024 * 1024;
export function checkProof(f) {
  const type = line(f.type), size = Number(f.size), name = line(f.name).slice(0, 120);
  if (!PROOF_TYPES.includes(type) || !Number.isFinite(size) || size <= 0 || size > MAX_PROOF) return null;
  const data = typeof f.data === 'string' && f.data.startsWith(`data:${type};base64,`) ? f.data : '';
  return { name, type, size, data };
}

// The access fee for tickets bought outside our links, and the id of a paid order.
export const ACCESS_FEE = 25000;
export const PAYMENT_ID = /^PAY-[A-Z0-9]{6,24}$/;

// The news list, or alerts for one concert.
export function checkSubscription(d = {}) {
  const mail = email(d.email), kind = line(d.kind), eventId = kind === 'alerts' ? line(d.eventId) : '';
  if (!isEmail(mail)) return no('email', 'Please enter a valid email address.');
  if (kind !== 'newsletter' && kind !== 'alerts') return no('kind', 'Unknown list.');
  if (kind === 'alerts' && !isConcert(eventId)) return no('eventId', 'Choose a concert.');
  return { subscription: { email: mail, kind, eventId } };
}

// A demo request from the partner page.
export function checkLead(d = {}) {
  const lead = {
    name: line(d.name), company: line(d.company), email: email(d.email), phone: line(d.phone), website: webAddress(d.website),
    kind: line(d.kind), volume: line(d.volume), message: text(d.message),
  };
  if (lead.name.length < 2 || lead.name.length > 80) return no('name', 'Please add your name.');
  if (lead.company.length < 2 || lead.company.length > 120) return no('company', 'Please add your company.');
  if (!isEmail(lead.email)) return no('email', 'Please check the email address.');
  if (lead.phone && !PHONE.test(lead.phone)) return no('phone', 'Please check the WhatsApp number, or leave it empty.');
  if (lead.website === null) return no('website', 'Please check the website address, or leave it empty.');
  if (!PARTNER_KINDS.includes(lead.kind)) return no('kind', 'Choose what your business does.');
  if (lead.volume && !VOLUMES.includes(lead.volume)) return no('volume', 'Choose roughly how many tickets, or leave it empty.');
  if (lead.message.length > 2000) return no('message', 'Please keep the message under 2,000 characters.');
  if (d.consent !== true) return no('consent', 'Please agree that we may contact you about this request.');
  return { lead };
}

// A conversion report as the admin imports it. Null when a row is not one.
export function checkConversions(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_REPORT_ROWS) return null;
  const ok = rows.every(r => typeof r?.sub === 'string' && CLICK_ID.test(r.sub) && ['approved', 'pending', 'rejected'].includes(r.status));
  return ok ? rows.map(r => ({ sub: r.sub, status: r.status })) : null;
}
