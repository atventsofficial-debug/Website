// The 3D seat view. Everyone can look round a concert's venue from above, filter it by
// category and see where each sits. Sitting in a seat and looking at the stage takes a
// 3D pass for that concert (passes.js); the demo venues are open to all.
//
// Routes: #seats-<event>, #seats-<event>--<category>, #seats-<event>@<seat> (a seat a friend
// shared) and #demo-<layout>.
import { getEvent } from './events.js';
import { crowdSeats, formatRpShort } from './layouts.js';
import { whenOf } from './when.js';
import { buyLink, activePass, canView, toggleSeat, STATUS } from './passes.js';
import { $, esc, icon, state, QUALITY, spotStats, share } from './ui.js';

const FOCUS_NAME = { concert: 'stage', cinema: 'screen', combat: 'octagon', stadium: 'centre spot' };
const out = icon('i-out');

// three.js and the viewer (about 700 KB) load only when a view needs them. A failed load
// is tried again next time.
let scene3d = null;
export const loadScene3d = () => (scene3d ||= import('./scene3d.js').catch(err => { scene3d = null; throw err; }));

const seatOf = id => { const v = state.venue, i = v?.seatById.get(id); return i === undefined ? null : v.seats[i]; };
const pass = () => (state.venue && !state.venue.meta.demo ? activePass(state.venue.eventId) : null);
// Seats drawn in coral: the ones on this fan's tickets, and a seat a friend sent.
const markedIds = () => [...(pass()?.seats || []), ...(state.shared ? [state.shared] : [])];
const priceText = c => (c.price == null ? c.note || 'On tiket.com' : formatRpShort(c.price));

// ---------------------------------------------------------------- open a venue

export async function openViewer(id, { cat, seat, back } = {}) {
  const venue = getEvent(id);
  $('#seats-back').href = back || (venue.meta.demo ? '#partner-demo' : `#event-${id}`);
  state.shared = venue.seatById.has(seat) ? seat : null;
  closePeek();
  if (state.venue?.eventId === id && state.scene) {
    state.filter = venue.catById[cat] ? cat : null;
    state.scene.setFilter(state.filter);
    paintViewer();
    showShared();
    return;
  }
  const loading = $('#loading');
  loading.classList.remove('gone');
  $('#loading-text').textContent = `Preparing ${venue.place.name}`;
  state.venue = venue;
  state.filter = venue.catById[cat] ? cat : null;
  state.viewing = null;
  if (!state.scene) {
    let SeatScene;
    try { ({ SeatScene } = await loadScene3d()); } catch {
      $('#loading-text').textContent = 'The 3D view could not load. Check your connection and try again.';
      return;
    }
    if (state.venue !== venue || state.view !== 'seats') return;
    state.scene ||= new SeatScene($('#app-canvas'), {
      quality: QUALITY,
      onHover: showTooltip,
      onSelect: pickSeat,
      onMode: setMode,
      onArrive: (s, dist) => {
        $('#sc-dist').textContent = `${Math.round(dist)} m to the ${FOCUS_NAME[state.venue.show ? 'concert' : state.venue.kind]} · eye height ${(s.y + (s.standing ? 1.62 : 1.2)).toFixed(1)} m${s.standing ? ' · free standing: stand anywhere on the floor' : ''}`;
      },
    });
  }
  // Let the loading screen paint before the heavy build.
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
  if (state.venue !== venue || state.view !== 'seats' || !state.scene) return;
  // The crowd is atmosphere, the same for every visitor. Nobody sits in the fan's own seats.
  const crowd = crowdSeats(venue);
  markedIds().forEach(s => crowd.delete(s));
  if (!(await state.scene.load(venue, crowd))) return;
  if (state.venue !== venue || state.view !== 'seats') return;
  state.scene.setCrowd(state.crowd);
  state.scene.setLabels(state.labels);
  if (state.filter) state.scene.setFilter(state.filter);
  paintViewer();
  setMode('overview');
  loading.classList.add('gone');
  showShared();
}

// Drop the scene when leaving the viewer: it is heavy.
export function closeViewer() {
  if (!state.scene) return;
  state.scene.dispose();
  state.scene = null;
  state.venue = null;
  state.peek = null;
}

// A seat from a friend's link: fly there with a pass, else show it on the map.
function showShared() {
  const s = seatOf(state.shared);
  if (!s || !state.scene) return;
  if (canView(state.venue)) state.scene.flyToSeat(s);
  else peek(s);
}

// ---------------------------------------------------------------- panels

// Everything round the 3D that depends on the pass: the chip, the side panel, the
// category pills and the coral seats. Called again when a pass changes.
export function paintViewer() {
  const v = state.venue;
  if (!v) return;
  const e = v.meta, p = pass(), open = canView(v), w = e.demo ? null : whenOf(e);
  $('#ev-label').textContent = e.demo ? 'Demo venue' : 'Concert';
  $('#ev-title').textContent = e.title;
  $('#ev-when').innerHTML = e.demo ? esc(e.subtitle) : `${esc(w.date)} · ${w.time ? esc(w.time) : 'time TBA'}${w.local ? `<small>${esc(w.local)}</small>` : ''}`;
  $('#ev-venue').textContent = v.event.venue;
  $('#app-chip').innerHTML = e.demo ? `${icon('i-eye')}<span>Demo venue · sample prices</span>`
    : p ? `${icon('i-eye')}<span>3D pass · ${STATUS[p.status].label}</span>`
      : `${icon('i-lock')}<span>View from above · seat views locked</span>`;
  $('#app-chip').className = `app-chip${open ? ' is-open' : ''}`;
  $('#app-side').innerHTML = e.demo ? `
      <p class="eyebrow">Demo venue</p>
      <h2>Sit anywhere</h2>
      <p>Click any seat to sit down, drag to look round, scroll to zoom. ${esc(e.blurb)}</p>
      <div class="row-btns"><a class="btn btn-coral btn-sm" href="#partner-contact">Book a demo</a><a class="btn btn-line btn-sm" href="#concerts">See concerts</a></div>`
    : p ? `
      <p class="eyebrow">Your 3D pass</p>
      <h2>Sit in any seat</h2>
      <p>Click a seat to sit down and look at the stage. Find the one on your e-ticket and mark it as yours.</p>
      ${p.seats?.length ? `<ul class="app-mine">${p.seats.map(seatOf).filter(Boolean).map(s => `<li><span>${esc(s.secName)} · ${esc(s.row)}${esc(String(s.num))}</span><button class="link" type="button" data-fly="${esc(s.id)}">Go there</button></li>`).join('')}</ul>` : '<p class="fine">No seat marked yet.</p>'}`
      : `
      <p class="eyebrow">${icon('i-lock')}Seat views locked</p>
      <h2>Look round, then sit down</h2>
      <p>Anyone can look round from above. To sit in a seat and see the stage, buy on tiket.com through us, then unlock with your order ID.</p>
      <div class="row-btns">${buyLink(e, `Buy on tiket.com ${out}`, 'btn btn-coral btn-sm')}<a class="btn btn-line btn-sm" href="#unlock-${e.id}">Unlock</a></div>`;
  renderCats();
  state.scene?.setMine(markedIds());
  if (state.viewing) fillSeatCard(state.viewing);
}

function renderCats() {
  const v = state.venue;
  $('#cats').innerHTML = v.categories.map(c => `
    <button class="cat-pill" type="button" data-cat="${c.id}" aria-pressed="${state.filter === c.id}">
      <b><i class="cat-dot" style="background:${esc(c.color)}"></i>${esc(c.name)}</b><span>${v.meta.soldOut?.includes(c.id) ? 'Sold out' : esc(priceText(c))}</span>
    </button>`).join('');
}

function setMode(mode, seat) {
  const inSeat = mode !== 'overview';
  if (inSeat) closePeek();
  $('#stage').classList.toggle('is-seat', inSeat);
  $('#tooltip').hidden = true;
  if (seat) { state.viewing = seat; fillSeatCard(seat); $('#sc-dist').textContent = 'Walking to the seat'; }
  if (mode === 'overview') state.viewing = null;
  $('#seatcard').hidden = !(mode === 'turning' || mode === 'seat' || (mode === 'overview' && state.peek));
  $('#pov-hint').hidden = mode !== 'seat';
  $('#zoom').hidden = mode !== 'seat';
}

// A click on a seat: sit down, or (without a pass) see what the seat is and how to unlock.
function pickSeat(seat) {
  if (canView(state.venue)) { state.scene.flyToSeat(seat); return; }
  peek(seat);
}

function peek(seat) {
  state.peek = seat;
  $('#stage').classList.add('is-peek');
  fillSeatCard(seat);
  $('#seatcard').hidden = false;
  state.scene?.setMine([...markedIds(), seat.id]);
}

function closePeek() {
  if (!state.peek) return;
  state.peek = null;
  $('#stage').classList.remove('is-peek');
  if (state.scene?.mode === 'overview') $('#seatcard').hidden = true;
  state.scene?.setMine(markedIds());
}

function fillSeatCard(seat) {
  const v = state.venue, e = v.meta, cat = v.catById[seat.cat], p = pass();
  const locked = !canView(v), mine = !!p?.seats?.includes(seat.id), friend = seat.id === state.shared;
  $('#sc-section').textContent = seat.secName;
  $('#sc-cat').textContent = cat.name;
  $('#sc-sec').textContent = seat.sec;
  const [[rowLabel, row], [numLabel, num]] = spotStats(seat);
  $('#sc-row').textContent = row;
  $('#sc-row').previousElementSibling.textContent = rowLabel;
  $('#sc-num').textContent = num;
  $('#sc-num').previousElementSibling.textContent = numLabel;
  $('#sc-price').textContent = priceText(cat);
  $('#sc-price').classList.toggle('sc-na', cat.price == null);
  const st = $('#sc-status');
  st.textContent = mine ? 'Your seat' : friend ? 'Friend’s seat' : locked ? 'Seat view locked' : e.demo ? 'Demo' : 'Seat view';
  st.className = `sc-status${mine || friend ? ' is-mine' : locked ? ' is-locked' : ''}`;
  $('#sc-close').hidden = !locked;
  if (locked) {
    const gone = e.soldOut?.includes(seat.cat);
    $('#sc-dist').textContent = friend ? `Your friend sits here. ${gone ? `${cat.name} is sold out, as listed.` : `Buy ${cat.name} on tiket.com through us and see their view.`}`
      : gone ? `${cat.name} is sold out, as listed. Unlock with your booking if you have one.` : `Buy ${cat.name} on tiket.com through us to sit here and see the stage.`;
    $('#sc-actions').innerHTML = `${buyLink(e, `Buy on tiket.com ${out}`)}<a class="btn btn-line" href="#unlock-${e.id}">${icon('i-lock')}Unlock 3D</a>`;
    return;
  }
  $('#sc-actions').innerHTML = `
    <button class="btn btn-line" type="button" data-act="back">${icon('i-back')}Back to the map</button>
    ${p ? `<button class="btn ${mine ? 'btn-line' : 'btn-coral'}" type="button" data-act="mine" aria-pressed="${mine}">${icon(mine ? 'i-minus' : 'i-check')}${mine ? 'Not my seat' : 'This is my seat'}</button>` : ''}
    <button class="btn btn-line" type="button" data-act="share">${icon('i-share')}Share</button>`;
}

function showTooltip(seat, ev) {
  const tt = $('#tooltip');
  if (!seat || !ev || state.peek) { tt.hidden = true; return; }
  const cat = state.venue.catById[seat.cat];
  tt.innerHTML = `<b>${esc(seat.secName)} · ${esc(seat.row)}${esc(String(seat.num))}</b> <span>${esc(cat.name)} · ${esc(priceText(cat))}${canView(state.venue) ? '' : ' · seat view locked'}</span>`;
  const r = $('#stage').getBoundingClientRect();
  tt.style.left = `${Math.min(ev.clientX - r.left, r.width - 280)}px`;
  tt.style.top = `${ev.clientY - r.top}px`;
  tt.hidden = false;
}

// ---------------------------------------------------------------- controls

export function bindViewer() {
  const toggle = (btn, key, apply) => btn.addEventListener('click', () => {
    state[key] = !state[key];
    btn.classList.toggle('is-on', state[key]);
    btn.setAttribute('aria-pressed', state[key]);
    apply(state[key]);
  });
  toggle($('#t-crowd'), 'crowd', on => state.scene?.setCrowd(on));
  toggle($('#t-labels'), 'labels', on => state.scene?.setLabels(on));
  $('#t-reset').addEventListener('click', () => { closePeek(); state.scene?.resetView(); });
  $('#sc-close').addEventListener('click', closePeek);
  $('#zoom').addEventListener('click', e => {
    const d = e.target.closest('[data-zoom]')?.dataset.zoom;
    if (d) state.scene?.zoomSeatView(+d);
  });
  $('#cats').addEventListener('click', e => {
    const b = e.target.closest('.cat-pill');
    if (!b) return;
    state.filter = state.filter === b.dataset.cat ? null : b.dataset.cat;
    state.scene?.setFilter(state.filter);
    renderCats();
  });
  $('#app-side').addEventListener('click', e => {
    const s = seatOf(e.target.closest('[data-fly]')?.dataset.fly);
    if (s) state.scene?.flyToSeat(s);
  });
  $('#sc-actions').addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act, s = state.viewing;
    if (act === 'back') state.scene?.backToOverview();
    if (!s) return;
    if (act === 'mine' && pass()) {
      toggleSeat(pass(), s.id);   // saves the pass: the 'passes' event paints the panels again
    }
    if (act === 'share') {
      const v = state.venue, e2 = v.meta;
      share({
        title: e2.title,
        text: e2.demo ? `The view from ${s.secName}, ${s.row}${s.num}, in 3D:` : `I'm in ${s.secName}, ${s.row}${s.num}, for ${e2.title} on ${whenOf(e2).date}. See where:`,
        url: `${location.origin}${location.pathname}#${e2.demo ? `demo-${v.key}` : `seats-${v.eventId}`}@${s.id}`,
      });
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || state.view !== 'seats') return;
    if (state.peek) closePeek();
    else if (state.scene?.mode === 'seat') state.scene.backToOverview();
  });
}
