// Shared state and small DOM helpers used by every page module.
import { CONFIG } from './config.js';
import { formatRpShort } from './layouts.js';
import { cleanSource } from './rules.js';

export const $ = sel => document.querySelector(sel);
export const $$ = sel => [...document.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = id => `<svg><use href="#${id}"/></svg>`;
export const QUALITY = new URLSearchParams(location.search).get('quality') || 'auto';

export const state = {
  cfg: { ...CONFIG },
  store: null,
  view: null,
  venue: null,      // the event open in the 3D viewer (getEvent result)
  scene: null,
  viewing: null,    // the seat the camera is at
  filter: null,     // category highlighted on the map
  crowd: true,
  labels: true,
  campaign: null,   // { src } from a campaign link, for this visit
};

// 'passes' fires when a 3D pass is added, changed or removed on this device.
export const bus = new EventTarget();
export const emit = name => bus.dispatchEvent(new Event(name));
export const on = (name, fn) => bus.addEventListener(name, fn);

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}

export const shortSec = name => name.replace(/^Section /, '').replace(/^(R|C)\w+side /, '$1S ').replace(/ Stand/, '').replace(/^Studio \d+$/, 'S3');
// Row and seat of a spot. On a standing floor there is no seat: the spot is where the view is from.
export const spotStats = s => (s.standing ? [['Entry', 'Standing'], ['Spot', `${s.row}${s.num}`]] : [['Row', s.row], ['Seat', s.num]]);

// "Rp 2.5M" as its sign and amount, for the big price type on tickets.
const priceParts = n => { const [cur, amount] = formatRpShort(n).split(' '); return { cur, n: amount }; };

// The white entrance ticket used for anything a fan can buy or open. `attrs` go on its
// button (a link out to tiket.com carries target and rel). Without a price the ticket says
// so in `na`.
export function entranceTicket({ ev, sub = '', code, price, href, attrs = '', buy = 'Buy', dark = false, date = '', city = '', meta = '', out = false, label = 'Entrance ticket', na = '' }) {
  const p = price == null ? null : priceParts(price);
  const len = String(code).length;
  const size = len <= 3 ? '' : len <= 5 ? 'font-size:clamp(18px,2vw,30px)' : len <= 7 ? 'font-size:clamp(15px,1.5vw,22px)' : 'font-size:clamp(13px,1.25vw,18px)';
  return `<article class="tk${dark ? ' tk-dark' : ''}${out ? ' tk-out' : ''}">
    <div class="tk-stub">
      <p class="tk-ev">${esc(ev)}${sub ? `<small>${esc(sub)}</small>` : ''}</p>
      <b class="tk-code" style="${size}">${esc(code)}</b>
      <a class="tk-buy" href="${href}"${attrs}>${esc(buy)}</a>
    </div>
    <div class="tk-body">
      <div class="tk-top"><i class="tk-vinyl"></i>${date ? `<span class="tk-pill">${esc(date)}</span>` : ''}${city ? `<span class="tk-pill">${esc(city)}</span>` : ''}</div>
      <p class="tk-label">${esc(label)}</p>
      ${p ? `<p class="tk-price${p.n.length > 5 ? ' tk-price-long' : ''}"><small>${p.cur}</small>${p.n}</p>` : `<p class="tk-price tk-price-na">${esc(na || 'Price on tiket.com')}</p>`}
      ${meta ? `<div class="tk-meta">${meta}</div>` : ''}
    </div>
  </article>`;
}

// Live countdowns: any element with data-until (ISO) shows days, hours, minutes, seconds.
export function countdownHtml(until, label = 'Time to the show') {
  return `<div class="countdown" data-until="${esc(until)}" role="timer" aria-label="${esc(label)}">${['Days', 'Hrs', 'Min', 'Sec'].map(l => `<span><b>00</b><small>${l}</small></span>`).join('')}</div>`;
}
export function tickCountdowns() {
  document.querySelectorAll('[data-until]').forEach(el => {
    const ms = Math.max(0, Date.parse(el.dataset.until) - Date.now());
    const parts = [Math.floor(ms / 864e5), Math.floor(ms / 36e5) % 24, Math.floor(ms / 6e4) % 60, Math.floor(ms / 1e3) % 60];
    el.querySelectorAll('b').forEach((b, i) => { const v = String(parts[i]).padStart(2, '0'); if (b.textContent !== v) b.textContent = v; });
  });
}

// Share a link with the system sheet, or copy it.
export async function share({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copyText(url, 'Link copied. Paste it in WhatsApp or anywhere.');
}

export async function copyText(text, done = 'Copied.') {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { toast(text); }
}

// Email capture: the concert alerts list and per-concert alerts.
export function bindSubscribe(form, sub, msgEl) {
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const email = form.email.value.trim();
    const say = (t, cls) => { msgEl.textContent = t; msgEl.className = `form-msg ${cls}`; msgEl.hidden = false; };
    if (!email || !form.email.validity.valid) { say('Please enter a valid email address.', 'is-err'); form.email.focus(); return; }
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await state.store.subscribe({ kind: sub.kind, eventId: sub.eventId || '', email });
      say(sub.done || 'You’re on the list.', 'is-ok');
      form.email.value = '';
    } catch (e) {
      say(e.status === 429 ? 'Too many tries. Please wait a few minutes.' : (e.message || 'Could not sign you up. Please try again.'), 'is-err');
    } finally { btn.disabled = false; }
  });
}

// Campaign links: ?src=instagram before the hash (or after it, inside a preview that cannot
// carry a query string). Kept for the visit and passed to tiket.com with each click.
const CAMPAIGN = 'atvents:campaign';
export function captureCampaign() {
  const q = new URLSearchParams(location.search);
  new URLSearchParams(location.hash.split('?')[1] || '').forEach((v, k) => q.set(k, v));
  const src = cleanSource(q.get('src') || q.get('utm_source'));
  if (!src) return;
  state.campaign = { src };
  try { sessionStorage.setItem(CAMPAIGN, JSON.stringify(state.campaign)); } catch { /* memory only */ }
}
export function campaign() {
  if (!state.campaign) {
    try { state.campaign = JSON.parse(sessionStorage.getItem(CAMPAIGN)) || {}; } catch { state.campaign = {}; }
  }
  return state.campaign;
}

// Giant one-line titles (concert names, the partner headline) are sized by the viewport, so a
// long name can run past the edge. fitGiants() shrinks each .giant until it fits its box, and
// runs again whenever the box changes width. On phones the CSS lets titles wrap instead.
const fitObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => entries.forEach(e => fitGiant(e.target.querySelector(':scope > .giant')))) : null;
function fitGiant(el) {
  if (!el || !el.isConnected) return;
  el.style.removeProperty('font-size');
  if (getComputedStyle(el).whiteSpace !== 'nowrap') return;
  const box = el.parentElement.clientWidth;
  if (!box) return;
  const need = el.scrollWidth;
  if (need > box) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${Math.floor(size * (box / need) * 0.98)}px`;
  }
}
export function fitGiants(root = document) {
  root.querySelectorAll('.giant').forEach(el => {
    fitGiant(el);
    if (fitObserver && !el.parentElement.dataset.fit) { el.parentElement.dataset.fit = '1'; fitObserver.observe(el.parentElement); }
  });
  if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(() => root.querySelectorAll('.giant').forEach(fitGiant));
}
