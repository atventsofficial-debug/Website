// Seat mates in the 3D view: with a paid pass, the fan sees the concert's WhatsApp fan group
// and the other pass holders who chose to show their Instagram, each as a tag over their
// seat; and can show their own on their seat, or take it down. The rules are in
// fanrules.js, the server side in worker/fans.mjs.
//
// Nothing is shown for a fan until they tick the box. Only fans with a paid pass for the
// same concert see the tags, and only in the 3D view.
import { igHandle, igUrl, SEAT_TAKEN } from './fanrules.js';
import { $, esc, icon, state, toast } from './ui.js';

// What the Worker last said for the pass in the view: { passId, eventId, group, me, fans },
// with `editing` and `draft` while the fan fills in their profile.
export const mates = { passId: '', data: null, loading: false, error: '', editing: false, draft: null, busy: false };

const can = () => typeof state.store?.fans === 'function';
// Seat mates are for fans who paid: a pass the Worker confirmed carries its key (token). A
// pass from the preview checkout, where nothing is charged, has none, and gets no Instagram
// form, no tags and no list, on phones and on desktop alike.
const paid = p => !!p && p.status === 'confirmed' && p.route === 'paid' && !!p.token;

// Ask for the concert's seat mates once per pass; `after` paints the panel and the tags.
export async function loadMates(p, after) {
  if (!paid(p) || !can()) return;
  if (mates.passId === p.id && (mates.data || mates.loading)) return;
  Object.assign(mates, { passId: p.id, data: null, loading: true, error: '', editing: false, draft: null });
  try {
    const d = await state.store.fans(p);
    if (mates.passId === p.id) mates.data = d;
  } catch (err) {
    if (mates.passId === p.id) mates.error = err?.status === 503 ? '' : err?.message || 'Seat mates could not load.';
  } finally {
    if (mates.passId === p.id) { mates.loading = false; after?.(); }
  }
}

export function resetMates() {
  stopMatesLive();
  Object.assign(mates, { passId: '', data: null, loading: false, error: '', editing: false, draft: null, busy: false });
}

// Live: while the 3D view is open and on screen, ask again every few seconds, so a fan who
// shows (or deletes) their Instagram appears for everyone in the category without a reload.
// `changed()` is called only when the list really changed.
//
// Made for a crowd: each fan's next ask is a little early or late (so thousands never ask in
// the same second), an unchanged list comes back as a tiny answer, a busy or failing server
// is asked less and less often (up to once a minute, or when it says), and a fan who has not
// touched the page for IDLE stops asking until they do.
export const LIVE_EVERY = 8000;
const MAX_EVERY = 60000, IDLE = 10 * 6e4;
let live = null;
const sameFans = (a, b) => a === b || ['fans', 'others', 'me'].every(k => JSON.stringify(a?.[k] || null) === JSON.stringify(b?.[k] || null));
const jitter = ms => Math.round(ms * (0.8 + Math.random() * 0.4));

// What the next wait is after one ask: back to normal when it worked, longer when not.
export function nextWait(prev, err) {
  if (!err) return LIVE_EVERY;
  if (err.retryAfter) return Math.min(MAX_EVERY, Math.max(LIVE_EVERY, err.retryAfter * 1000));
  return Math.min(MAX_EVERY, Math.max(LIVE_EVERY, prev) * 2);
}
// The pass no longer opens seat mates (not paid, wrong key, after the show): stop asking.
const finalError = err => [403, 404, 410].includes(err?.status);

export async function refreshMates(p, changed) {
  if (!paid(p) || !can() || mates.passId !== p.id || mates.loading || mates.busy || document.hidden) return;
  const d = await state.store.fans(p, undefined, { since: !!mates.data });
  if (!d || d.unchanged || mates.passId !== p.id || sameFans(d, mates.data)) return;
  mates.data = d;
  changed?.();
}
export function startMatesLive(pass, changed) {
  if (live) return;
  live = { wait: LIVE_EVERY, timer: 0, last: Date.now(), idle: false };
  const L = live;
  const round = async () => {
    if (live !== L) return;
    if (document.hidden || Date.now() - L.last > IDLE) { L.idle = true; return; }   // woken by onWake
    let err = null;
    try { await refreshMates(pass(), changed); } catch (e) { err = e; }
    if (live !== L) return;
    if (finalError(err)) { stopMatesLive(); return; }
    L.wait = nextWait(L.wait, err);
    L.timer = setTimeout(round, jitter(L.wait));
  };
  L.wake = () => {
    L.last = Date.now();
    if (L.idle && !document.hidden) { L.idle = false; clearTimeout(L.timer); round(); }
  };
  L.timer = setTimeout(round, jitter(L.wait));
  document.addEventListener('visibilitychange', L.wake);
  for (const ev of WAKE_ON) addEventListener(ev, L.wake, { passive: true });
}
const WAKE_ON = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
export function stopMatesLive() {
  if (!live) return;
  clearTimeout(live.timer);
  document.removeEventListener('visibilitychange', live.wake);
  for (const ev of WAKE_ON) removeEventListener(ev, live.wake);
  live = null;
}

// The card a tap on a seat mate's tag opens: who sits there, and a way to their Instagram.
// Nothing opens Instagram until the fan asks for it here.
export function fanCardHtml(f, { cat = '', seat = '', unlock = '', fee = '' } = {}) {
  if (f.locked) {
    return `<div class="fan-card-in" role="dialog" aria-labelledby="fc-name">
      <button class="fan-card-x" type="button" data-fancard="close" aria-label="Close">${icon('i-x')}</button>
      <div class="fan-card-top">
        <span class="fan-card-av is-locked">${icon('i-lock')}</span>
        <div><b id="fc-name">A fan in ${esc(cat)}</b><span>Profile hidden</span></div>
      </div>
      <p class="fine fan-card-why">Someone with a paid 3D pass sits here. Only fans with a 3D pass in <b>${esc(cat)}</b> can see who they are and find them on Instagram.</p>
      <div class="fan-card-btns">
        <a class="btn btn-coral btn-sm" href="${esc(unlock)}">Unlock ${esc(cat)}${fee ? ` · ${esc(fee)}` : ''}</a>
        <button class="btn btn-line btn-sm" type="button" data-fancard="close">Close</button>
      </div>
    </div>`;
  }
  const first = [...(f.name || '?')][0].toUpperCase();
  return `<div class="fan-card-in" role="dialog" aria-labelledby="fc-name">
      <button class="fan-card-x" type="button" data-fancard="close" aria-label="Close">${icon('i-x')}</button>
      <div class="fan-card-top">
        <span class="fan-card-av${f.mine ? ' is-mine' : ''}">${esc(first)}</span>
        <div><b id="fc-name">${esc(f.mine ? `${f.name} (you)` : f.name)}</b><span>@${esc(f.instagram)}</span></div>
      </div>
      <dl class="fan-card-facts">
        ${cat ? `<div><dt>Category</dt><dd>${esc(cat)}</dd></div>` : ''}
        ${seat ? `<div><dt>Seat</dt><dd>${esc(seat)}</dd></div>` : ''}
      </dl>
      <p class="fine">${f.mine ? 'This is how fans in your category see you.' : 'A fan in your category with a paid 3D pass, who chose to show their Instagram here.'}</p>
      <div class="fan-card-btns">
        ${f.mine ? `<button class="btn btn-line btn-sm" type="button" data-fancard="edit">Edit my info</button>`
          : `<a class="btn btn-coral btn-sm" href="${esc(igUrl(f.instagram))}" target="_blank" rel="noopener noreferrer">Open Instagram</a>`}
        <button class="btn btn-line btn-sm" type="button" data-fancard="close">Close</button>
      </div>
    </div>`;
}

// The tags for the 3D view. The fan's own tag sits where the tour put their seat.
export const mateTags = (ownSeat) => (mates.passId ? [
  ...(mates.data?.fans || []).map(f => (f.mine && ownSeat ? { ...f, seat: ownSeat } : f)),
  // Fans in other categories: a marker, no name. A tap offers a pass in that category.
  ...(mates.data?.others || []).map(f => ({ ...f, locked: true })),
] : []);


// The WhatsApp links of a paid pass as tiles: the community (and a concert's fanbase group,
// when one is set). Used on the pass card, the "You're in" page and the 3D view.
export function waTiles(wa) {
  if (!wa?.group && !wa?.community) return '';
  const tile = (href, title, sub) => `<a class="wa-tile" href="${esc(href)}" target="_blank" rel="noopener noreferrer">
      <span class="wa-ico">${icon('i-chat')}</span>
      <span class="wa-txt"><b>${title}</b><small>${sub}</small></span>
      <span class="wa-go">${icon('i-out')}</span>
    </a>`;
  return `<div class="wa-tiles">${[
    wa.group && tile(wa.group, 'Fanbase group', 'Fans of this concert, on WhatsApp'),
    wa.community && tile(wa.community, 'Atvents community', 'Meet other fans on WhatsApp'),
  ].filter(Boolean).join('')}</div>`;
}

// The panel block: the WhatsApp group, the fan's own profile, and who else shows theirs.
export function matesBlock(p, { cats = {}, compact = false } = {}) {
  if (!paid(p) || !can()) return '';
  if (mates.passId !== p.id || mates.loading) return `<section class="mates"><h3 class="mates-h">Connect with your section</h3><p class="fine">Finding fans in your section…</p></section>`;
  if (mates.error) return `<section class="mates"><h3 class="mates-h">Connect with your section</h3><p class="fine">${esc(mates.error)} <button class="link" type="button" data-mates="retry">Try again</button></p></section>`;
  const d = mates.data;
  if (!d) return '';
  const others = d.fans.filter(f => !f.mine);
  // The WhatsApp groups are offered on the My passes page only, not over the 3D view.
  const catName = esc(cats[p.cat]?.name || 'your section');
  const head = `<div class="mates-head">
      <div><h3 class="mates-h">Connect with your section</h3><p class="mates-sub">Meet fans sitting in ${catName} on Instagram before the show.</p></div>
    </div>`;
  const count = others.length ? `<p class="mates-count"><b>${others.length}</b> fan${others.length === 1 ? '' : 's'} in ${catName} ${others.length === 1 ? 'is' : 'are'} here. Tap a name to see where they sit.</p>` : '';
  let mine;
  if (mates.editing) {
    const v = mates.draft || {};
    mine = `<form class="mates-form" data-mates-form novalidate>
        <label><span>Your name</span><input name="name" maxlength="40" autocomplete="nickname" value="${esc(v.name || '')}" placeholder="Rani"></label>
        <label><span>Instagram username</span><input name="instagram" maxlength="60" autocapitalize="none" autocomplete="off" spellcheck="false" value="${esc(v.instagram || '')}" placeholder="@yourname"></label>
        <label class="check"><input type="checkbox" name="consent"${v.consent ? ' checked' : ''}><span>I agree to show my name and Instagram on my seat. By ticking this, I accept that fans with a paid 3D pass for this concert can see them, and I will not hold atvents liable for that. I can delete them any time.</span></label>
        <p class="fine mates-err" role="alert" hidden></p>
        <div class="row-btns"><button class="btn btn-coral btn-sm" type="submit"${mates.busy ? ' disabled' : ''}>Save</button><button class="btn btn-line btn-sm" type="button" data-mates="cancel">Cancel</button></div>
        <p class="fine mates-note">Only fans in ${catName} with a paid 3D pass see it. Your email, phone and ticket details are never shown.</p>
      </form>`;
  } else if (d.me) {
    mine = `<div class="mates-me-card">
        <span class="mates-me-ig">${icon('i-ig')}</span>
        <div><b>${esc(d.me.name)}</b><a href="${esc(igUrl(d.me.instagram))}" target="_blank" rel="noopener noreferrer">@${esc(d.me.instagram)}</a></div>
        <span class="mates-on">On your seat</span>
      </div>
      <p class="mates-actions"><button class="link" type="button" data-mates="edit">Edit</button><button class="link" type="button" data-mates="off">Remove</button></p>`;
  } else if (others.some(f => f.seat === p.seat)) {
    mine = `<p class="fine mates-me">${esc(SEAT_TAKEN)}</p>`;
  } else {
    mine = `<button class="btn mates-add" type="button" data-mates="edit"><span class="mates-ig-sm">${icon('i-ig')}</span>Add my Instagram</button>
      <p class="mates-note">Optional. Only fans in ${catName} can see it, and you can remove it any time.</p>`;
  }
  // Every fan of the category who shows their Instagram, in a box a few rows tall that
  // scrolls; the rows are drawn as it scrolls (fillMatesList), so a sold out category stays
  // light. A tap on a row shows where that fan sits.
  const list = others.length ? `<label class="fan-list-search mates-search">${icon('i-search')}<input type="search" data-mates-q placeholder="Search a name or @instagram" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
      <div class="mates-scroll" data-mates-scroll><ul class="fan-list-ul mates-rows"></ul><i class="fan-list-end"></i></div>` : '';
  // Over the venue, showing a fan from the list: only the list, so the venue stays in view.
  if (compact) return `<section class="mates is-compact">${list}</section>`;
  return `<section class="mates">
      ${head}
      ${mine}
      ${count}
      ${list}
    </section>`;
}

// Clicks and the form inside the panel. `repaint` paints the panel and the tags again.
export function bindMates(root, { pass, repaint }) {
  root.addEventListener('click', async e => {
    const act = e.target.closest('[data-mates]')?.dataset.mates;
    if (!act) return;
    const p = pass();
    if (!p) return;
    if (act === 'retry') { resetMates(); loadMates(p, repaint); repaint(); }
    if (act === 'edit') {
      const me = mates.data?.me;
      mates.editing = true;
      mates.draft = { name: me?.name || (p.name || '').split(/\s+/)[0] || '', instagram: me ? `@${me.instagram}` : '', consent: !!me };
      repaint();
      root.querySelector('[data-mates-form] input[name=' + (me ? 'name' : 'instagram') + ']')?.focus();
    }
    if (act === 'cancel') { mates.editing = false; mates.draft = null; repaint(); }
    if (act === 'off') {
      try {
        mates.data = await state.store.fans(p, null);
        toast('Deleted. Your name and Instagram are no longer stored or shown.');
      } catch (err) { toast(err?.message || 'That did not go through. Please try again.'); }
      repaint();
    }
  });
  root.addEventListener('input', e => {
    const f = e.target.closest('[data-mates-form]');
    if (!f || !mates.draft) return;
    mates.draft = { name: f.name.value, instagram: f.instagram.value, consent: f.consent.checked };
  });
  root.addEventListener('submit', async e => {
    const f = e.target.closest('[data-mates-form]');
    if (!f) return;
    e.preventDefault();
    const p = pass();
    if (!p || mates.busy) return;
    const err = f.querySelector('.mates-err');
    const body = { name: f.name.value, instagram: igHandle(f.instagram.value) || f.instagram.value, consent: f.consent.checked };
    mates.busy = true;
    try {
      mates.data = await state.store.fans(p, body);
      mates.editing = false;
      mates.draft = null;
      toast('Saved. Fans in your section can now find you.');
      repaint();
    } catch (x) {
      err.textContent = x?.message || 'That did not go through. Please try again.';
      err.hidden = false;
      f[x?.field]?.focus?.();
    } finally {
      mates.busy = false;
      const btn = $('[data-mates-form] button[type=submit]');
      if (btn) btn.disabled = false;
    }
  });
}

// Fills the panel's scrolling list of fans: 40 rows at a time as it scrolls, filtered by the
// search box. The search and the scroll are kept across repaints of the panel. `blockOf(seat)`
// names a seat's block; `onOpen(fan)` is a tap on a row; `current` is the seat of the fan on
// show, whose row is marked.
const PAGE = 40;
const view = { passId: '', q: '', top: 0 };
export function fillMatesList(root, { passId, fans, blockOf, onOpen, current = '' }) {
  const box = root.querySelector('[data-mates-scroll]'), input = root.querySelector('[data-mates-q]');
  if (!box || !input) return;
  if (view.passId !== passId) Object.assign(view, { passId, q: '', top: 0 });
  const ul = box.querySelector('ul');
  const rows = fans.map(f => ({ f, block: blockOf(f.seat) || '', key: `${f.name} ${f.instagram}`.toLowerCase() }));
  let shown = [], drawn = 0;
  const row = ({ f, block }) => `<li><button type="button" data-fl-open="${esc(f.seat)}"${f.seat === current ? ' aria-current="true"' : ''}><span class="mates-av">${esc([...(f.name || '?')][0].toUpperCase())}</span><span class="mates-who"><b>${esc(f.name)}</b><span>@${esc(f.instagram)}</span></span><small>${esc(block)}</small></button></li>`;
  const more = () => {
    if (drawn >= shown.length) return;
    ul.insertAdjacentHTML('beforeend', shown.slice(drawn, drawn + PAGE).map(row).join(''));
    drawn = Math.min(shown.length, drawn + PAGE);
  };
  const filter = () => {
    const q = view.q.trim().toLowerCase().replace(/^@/, '');
    shown = q ? rows.filter(x => x.key.includes(q)) : rows;
    ul.innerHTML = shown.length ? '' : '<li class="mates-none">No fan by that name.</li>';
    drawn = 0;
    more();
  };
  input.value = view.q;
  filter();
  // Back where the fan left the list, drawing the rows down to there first.
  while (drawn < shown.length && ul.scrollHeight < view.top + box.clientHeight) more();
  box.scrollTop = view.top;
  box.addEventListener('scroll', () => {
    view.top = box.scrollTop;
    if (box.scrollTop + box.clientHeight > box.scrollHeight - 200) more();
  }, { passive: true });
  input.addEventListener('input', () => { view.q = input.value; view.top = 0; box.scrollTop = 0; filter(); });
  ul.addEventListener('click', e => {
    const seat = e.target.closest('[data-fl-open]')?.dataset.flOpen;
    const f = seat && fans.find(x => x.seat === seat);
    if (f) onOpen(f);
  });
}
