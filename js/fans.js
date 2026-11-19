// Seat mates in the 3D view: with a paid pass, the fan sees the concert's WhatsApp fan group
// and the other pass holders who chose to show their Instagram, each as a tag over their
// seat; and can show their own on their seat, or take it down. The rules are in
// fanrules.js, the server side in worker/fans.mjs.
//
// Nothing is shown for a fan until they tick the box. Only fans with a paid pass for the
// same concert see the tags, and only in the 3D view.
import { igHandle, igUrl } from './fanrules.js';
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
  Object.assign(mates, { passId: '', data: null, loading: false, error: '', editing: false, draft: null, busy: false });
}

// The tags for the 3D view. The fan's own tag sits where the tour put their seat.
export const mateTags = (ownSeat) => (mates.passId ? mates.data?.fans || [] : []).map(f => (f.mine && ownSeat ? { ...f, seat: ownSeat } : f));

export const openInstagram = f => window.open(igUrl(f.instagram), '_blank', 'noopener,noreferrer');

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
export function matesBlock(p, { cats = {} } = {}) {
  if (!paid(p) || !can()) return '';
  if (mates.passId !== p.id || mates.loading) return `<section class="mates"><h3 class="mates-title">Seat mates</h3><p class="fine">Finding fans at this concert…</p></section>`;
  if (mates.error) return `<section class="mates"><h3 class="mates-title">Seat mates</h3><p class="fine">${esc(mates.error)} <button class="link" type="button" data-mates="retry">Try again</button></p></section>`;
  const d = mates.data;
  if (!d) return '';
  const others = d.fans.filter(f => !f.mine);
  const group = waTiles(d);
  const count = others.length ? `${others.length} fan${others.length === 1 ? '' : 's'} at this concert ${others.length === 1 ? 'shows' : 'show'} their Instagram on their seat. Tap a tag to say hi.`
    : 'No other fans show their Instagram yet. Be the first, and they will find you.';
  let mine;
  if (mates.editing) {
    const v = mates.draft || {};
    mine = `<form class="mates-form" data-mates-form novalidate>
        <p class="fine mates-note"><b>Optional.</b> Only fans who paid for a 3D pass to this concert can see it. Your email, phone and ticket details are never shown.</p>
        <label><span>Name other fans see</span><input name="name" maxlength="40" autocomplete="nickname" value="${esc(v.name || '')}" placeholder="Rani"></label>
        <label><span>Instagram</span><input name="instagram" maxlength="60" autocapitalize="none" autocomplete="off" spellcheck="false" value="${esc(v.instagram || '')}" placeholder="@yourname"></label>
        <label class="check"><input type="checkbox" name="consent"${v.consent ? ' checked' : ''}><span>I agree to show my name and Instagram on my seat. By ticking this, I accept that fans with a paid 3D pass for this concert can see them, and I will not hold atvents liable for that. I can delete them any time.</span></label>
        <p class="fine mates-err" role="alert" hidden></p>
        <div class="row-btns"><button class="btn btn-coral btn-sm" type="submit"${mates.busy ? ' disabled' : ''}>Show on my seat</button><button class="btn btn-line btn-sm" type="button" data-mates="cancel">Cancel</button></div>
      </form>`;
  } else if (d.me) {
    mine = `<p class="fine mates-me">Your seat shows <b>${esc(d.me.name)}</b> · <a class="u" href="${esc(igUrl(d.me.instagram))}" target="_blank" rel="noopener noreferrer">@${esc(d.me.instagram)}</a>. <button class="link" type="button" data-mates="edit">Edit</button> · <button class="link" type="button" data-mates="off">Delete my info</button></p>`;
  } else {
    mine = `<div class="row-btns"><button class="btn btn-line btn-sm" type="button" data-mates="edit">${icon('i-check')}Show my Instagram on my seat</button></div><p class="fine">Optional. Skip it and nothing about you is shown.</p>`;
  }
  // Fans in the same category first, then the rest, a handful at most: the 3D tags show all.
  const near = [...others.filter(f => f.cat === p.cat), ...others.filter(f => f.cat !== p.cat)].slice(0, 6);
  const list = near.length ? `<ul class="mates-list">${near.map(f => `
      <li><a href="${esc(igUrl(f.instagram))}" target="_blank" rel="noopener noreferrer"><b>${esc(f.name)}</b><span>@${esc(f.instagram)}</span></a><small>${esc(cats[f.cat]?.name || '')}</small></li>`).join('')}</ul>` : '';
  return `<section class="mates">
      <h3 class="mates-title">${icon('i-eye')}Seat mates</h3>
      <p class="fine">${count}</p>
      ${group}
      ${mine}
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
      toast('Your Instagram now shows on your seat.');
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
