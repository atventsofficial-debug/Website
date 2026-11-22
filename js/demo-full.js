// DEMO ONLY (branch demo/fans-full-booking, never shipped): the whole venue booked out, every
// seat and standing spot held by a fan with a paid 3D pass who shows their Instagram. Seeds
// one paid pass per category of the Jakarta show and answers the seat-mates list in this
// browser, so the 3D markers and the fans list can be tried with the biggest crowd there is.
import { getEvent } from './events.js';
import { passes } from './passes.js';
import { state } from './ui.js';
import { checkFan } from './fanrules.js';

const EVENT = 'evt-gnr-jakarta';
const FIRST = ['Rani', 'Dimas', 'Putri', 'Bagas', 'Nadia', 'Fajar', 'Ayu', 'Rizky', 'Salsa', 'Kevin', 'Intan', 'Yoga', 'Citra', 'Andre', 'Tasya', 'Bima', 'Laras', 'Gilang', 'Mega', 'Reza', 'Dewi', 'Arya', 'Sekar', 'Raka', 'Nabila', 'Hendra', 'Wulan', 'Farhan', 'Tiara', 'Galih'];
const LAST = ['', 'putra', 'sari', 'pratama', 'wijaya', 'lestari', 'nugroho', 'anggraini', 'saputra', 'maharani'];
const passId = cat => `p-demo-${cat}`;

export function startDemo() {
  const v = getEvent(EVENT);
  if (!v) return;
  // One pass per category, each on a seat in the middle of its category.
  for (const c of v.categories) {
    const seats = v.seats.filter(s => s.cat === c.id);
    const mine = seats[Math.floor(seats.length / 2)];
    if (!mine || passes.get(passId(c.id))) continue;
    passes.save({ id: passId(c.id), eventId: EVENT, status: 'confirmed', route: 'paid', token: 'demo', cat: c.id, seat: mine.id, seats: [mine.id], name: 'Kamu', email: 'demo@example.com', createdAt: new Date().toISOString() });
  }
  const me = {};
  const cache = {};
  const store = state.store;
  store.fans = async (p, change) => {
    if (change === null) me[p.id] = null;
    else if (change) {
      const { fan, field, error } = checkFan(change);
      if (error) throw Object.assign(new Error(error), { status: 400, field });
      me[p.id] = { name: fan.name, instagram: fan.instagram };
    }
    const key = `${p.id}|${p.seat}|${JSON.stringify(me[p.id] || null)}`;
    if (cache[p.id]?.key === key) return cache[p.id].d;
    const fans = [], others = [];
    let n = 0;
    for (const s of v.seats) {
      if (s.id === p.seat) continue;
      if (s.cat !== p.cat) { others.push({ seat: s.id, cat: s.cat }); continue; }
      const f = FIRST[n % FIRST.length], l = LAST[Math.floor(n / FIRST.length) % LAST.length];
      fans.push({ seat: s.id, cat: s.cat, name: f, instagram: `${f.toLowerCase()}${l ? `.${l}` : ''}${n >= FIRST.length * LAST.length ? `_${n}` : ''}` });
      n++;
    }
    if (me[p.id]) fans.push({ seat: p.seat, cat: p.cat, ...me[p.id], mine: true });
    const d = { eventId: EVENT, group: '', community: '', me: me[p.id] || null, fans, others };
    cache[p.id] = { key, d };
    return d;
  };
  if (!location.hash.startsWith('#tour-p-demo-')) history.replaceState(null, '', `${location.pathname}${location.search}#tour-${passId('triba')}`);
  demoBar(v);
}

// A small switch over the page: which category's pass to sit in.
function demoBar(v) {
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.dataset.noI18n = '';
  const cur = () => location.hash.replace('#tour-p-demo-', '');
  const total = v.seats.length;
  bar.innerHTML = `<b>DEMO</b><span>Full booking · ${total.toLocaleString('id-ID')} fans</span>
    <label><span class="sr">Kategori</span><select>${v.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></label>`;
  const sel = bar.querySelector('select');
  sel.value = cur();
  sel.addEventListener('change', () => { location.hash = `#tour-${passId(sel.value)}`; });
  addEventListener('hashchange', () => { if (location.hash.startsWith('#tour-p-demo-')) sel.value = cur(); });
  document.body.appendChild(bar);
}
