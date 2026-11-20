// The sold-out note. Cards and pages carry no sold-out marks: what Atvents sells, the 3D seat
// view, never sells out. Only when a fan clicks through to the seller (tiket.com, Loket,
// TipTip...) for tickets the seller lists as sold out does this note open first, so nobody
// lands on an empty page. From it the fan can go on to the seller anyway (more may be
// released) or open their seat in 3D. Links name their concert in data-out, and a category
// ticket its category in data-out-cat (buyAttrs in js/passes.js).
import { eventMeta, getEvent, sellerOf, soldOut } from './events.js';
import { esc, icon } from './ui.js';

let box = null, lastFocus = null;

// What the seller has run out of, for this link: null when there is nothing to say.
function soldText(a) {
  const e = eventMeta(a.dataset.out), venue = e && getEvent(e.id);
  if (!venue) return null;
  const seller = sellerOf(e), cat = a.dataset.outCat;
  if (cat) {
    if (!soldOut(e, cat)) return null;
    const name = venue.catById[cat]?.name || e.tickets?.find(t => t.id === cat)?.name || 'This category';
    return { title: `${name} tickets are sold out`, text: `${seller} lists ${name} as sold out for ${e.title}. The promoter sometimes releases more, so it can be worth a look.` };
  }
  const cats = e.tickets || venue.categories, gone = cats.filter(c => soldOut(e, c.id));
  if (!gone.length) return null;
  if (gone.length === cats.length) return { title: 'Tickets are sold out', text: `${seller} lists every category of ${e.title} as sold out. The promoter sometimes releases more, so it can be worth a look.` };
  const names = gone.map(c => c.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return { title: `${list} ${gone.length > 1 ? 'are' : 'is'} sold out`, text: `On ${seller}, ${list} ${gone.length > 1 ? 'are' : 'is'} sold out for ${e.title}. The other categories are still on sale.` };
}

function close() {
  if (!box || box.hidden) return;
  box.hidden = true;
  document.documentElement.classList.remove('has-soldpop');
  lastFocus?.focus?.();
}

function open(a, msg) {
  if (!box) {
    box = document.createElement('div');
    box.className = 'soldpop';
    box.hidden = true;
    document.body.append(box);
    box.addEventListener('click', ev => {
      if (ev.target === box || ev.target.closest('[data-sp-close]')) close();
      // Going on to the seller or to the 3D view closes the note behind it.
      else if (ev.target.closest('.soldpop-actions a')) setTimeout(close, 0);
    });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') close(); });
  }
  const e = eventMeta(a.dataset.out), seller = sellerOf(e);
  // The link on to the seller is a copy of the one clicked, so the click is recorded as before.
  const on = a.cloneNode(false);
  on.className = 'btn btn-line';
  on.removeAttribute('data-out');
  on.removeAttribute('data-out-cat');
  on.innerHTML = `Continue to ${esc(seller)} ${icon('i-out')}`;
  box.innerHTML = `
    <div class="soldpop-card" role="dialog" aria-modal="true" aria-labelledby="sp-title">
      <button class="soldpop-x" type="button" data-sp-close aria-label="Close">${icon('i-x')}</button>
      <p class="eyebrow">Tickets on ${esc(seller)}</p>
      <h2 id="sp-title">${esc(msg.title)}</h2>
      <p>${esc(msg.text)}</p>
      <p class="soldpop-3d">${icon('i-eye')}<span>Already have a ticket? The view from your seat in 3D is still open.</span></p>
      <div class="soldpop-actions">
        <a class="btn btn-coral" href="#unlock-${esc(e.id)}">See my seat in 3D ${icon('i-arrow')}</a>
      </div>
    </div>`;
  box.querySelector('.soldpop-actions').append(on);
  lastFocus = a;
  box.hidden = false;
  document.documentElement.classList.add('has-soldpop');
  box.querySelector('.soldpop-actions .btn-coral').focus();
}

// One listener for every link out to a seller, ahead of the click tracking (capture phase).
export function bindSoldOut() {
  document.addEventListener('click', ev => {
    const a = ev.target.closest('a[data-out]');
    if (!a || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const msg = soldText(a);
    if (!msg) return;
    ev.preventDefault();
    ev.stopPropagation();
    open(a, msg);
  }, true);
}
