// The 3D seat view. Everyone can look round a concert's venue from above, filter it by
// category and see where each sits. Sitting in a seat and looking at the stage takes a
// 3D pass for that concert (passes.js); the demo venues are open to all.
//
// Routes: #seats-<event>, #seats-<event>--<category>, #seats-<event>@<seat> (a seat a friend
// shared), #demo-<layout>, and #tour-<pass>: an approved fan's seat tour, in three steps.
//
// The tour: (1) the whole venue, where only the fan's own category can be picked; (2) that
// category up close, where only the seat on their e-ticket can be picked; (3) the view from
// that seat. Then a photo or video of that view (capture.js), or the whole venue again.
import { formatFee } from './rules.js';
import { getEvent, typeOf } from './events.js';
import { crowdSeats, formatRpShort, REAL_KEYS } from './layouts.js';
import { whenOf } from './when.js';
import { buyLink, activePass, openPass, passes, canView, toggleSeat, STATUS, refresh } from './passes.js';
import { placeSeat, cleanNumbering, isDefault, numberingOf, numberingSource } from './seatflip.js';
import { $, esc, icon, state, QUALITY, spotStats, share, toast } from './ui.js';
import { loadMates, matesBlock, bindMates, mateTags, resetMates, mates, startMatesLive, fanCardHtml, fillMatesList } from './fans.js';

const FOCUS_NAME = { concert: 'stage', cinema: 'screen', combat: 'octagon', stadium: 'centre spot' };
const out = icon('i-out');

// three.js and the viewer (about 700 KB) load only when a view needs them. A failed load
// is tried again next time.
let scene3d = null;
export const loadScene3d = () => (scene3d ||= import('./scene3d.js').catch(err => { scene3d = null; throw err; }));

const seatOf = id => { const v = state.venue, i = v?.seatById.get(id); return i === undefined ? null : v.seats[i]; };
const pass = () => (state.venue && !state.venue.meta.demo ? activePass(state.venue.eventId) : null);
const tourPass = () => (state.tour ? passes.get(state.tour.id) : null);
// The seat on the e-ticket, and where it is in the model when the venue numbers its rows or
// seats another way, or the fan pointed at it themselves (seatflip.js): the tour shows the
// second and names the first.
const ticketSeat = () => seatOf(tourPass()?.seat);
const tourSeat = () => placeSeat(state.venue, ticketSeat(), numberingOf(state.venue, tourPass()));
// Seats drawn in coral: the fan's own seat once the tour shows their category, and a seat a
// friend sent.
const markedIds = () => [
  ...(state.tour ? (state.tour.step >= 2 && tourSeat() ? [tourSeat().id] : []) : pass()?.status === 'confirmed' ? pass()?.seats || [] : []),
  ...(state.shared ? [state.shared] : []),
];
// The paid pass whose seat mates the view shows: the tour's, or the concert's open pass.
const matesPass = () => {
  const p = state.tour ? tourPass() : pass();
  return p?.status === 'confirmed' ? p : null;
};
// The seat mates' tags over their seats, set again only when they change.
let tagKey = '';
const dataIds = new WeakMap();
let dataSeq = 0;
const dataId = d => (d ? (dataIds.get(d) || (dataIds.set(d, ++dataSeq), dataSeq)) : 0);
function paintTags() {
  const sc = state.scene, p = matesPass();
  if (!sc?.scene || !sc.venue) return;
  // A cheap key (the list the Worker sent, by identity, and where the fan sits), so a full
  // venue's thousands of markers are not listed again on every repaint of the panel.
  const own = p ? (state.tour ? tourSeat()?.id : p.seats?.[0] || p.seat) : '';
  const key = `${state.venue?.eventId}|${p?.id || ''}|${own}|${dataId(mates.data)}|${mates.passId}|${state.tour?.fan?.seat || ''}`;
  if (key === tagKey) return;
  tagKey = key;
  // Every fan of the category, the one picked from the list (or a tap) marked out; fans of
  // other categories in orange, locked.
  const pick = state.tour?.fan?.seat;
  sc.setFans(p ? mateTags(own).map(f => (f.seat === pick ? { ...f, spot: true } : f)) : []);
}
function paintMates() {
  const p = matesPass();
  if (p) {
    loadMates(p, paintViewer);
    // New or deleted profiles arrive by themselves: the tags at once, the panel too unless
    // the fan is typing in it.
    startMatesLive(matesPass, () => { if (mates.editing) paintTags(); else paintViewer(); });
  }
  paintTags();
}

// A tap on a seat mate's tag (or their name in the list): their card, not Instagram yet.
// A tap on a fan in the list: up over the venue, a marker over that fan's seat, and their
// card. Only the fan picked gets a marker; the venue is not covered in them.
function showFanOnMap(f) {
  const sc = state.scene, s = seatOf(f.seat);
  if (!sc || !s || !state.tour) return;
  closeFanCard();
  state.tour.fan = f;
  paintTags();
  paintTour();
  const go = () => sc.frameCategory(s.cat, { sec: s.sec, seat: s, done: () => { if (state.tour?.fan === f) openFanCard(f); } });
  if (sc.mode === 'overview' && !sc.anim) go();
  else { state.tour.afterOverview = go; if (sc.mode === 'seat') sc.backToOverview(); }
}

function openFanCard(f) {
  const v = state.venue, s = seatOf(f.seat), box = $('#fan-card');
  if (!v || !box) return;
  box.innerHTML = fanCardHtml(f, { cat: v.catById[f.cat]?.name || '', seat: s ? seatText(s) : '', unlock: `#unlock-${v.eventId}`, fee: formatFee() });
  box.hidden = false;
  box.querySelector('.fan-card-in')?.focus?.();
}
function closeFanCard() {
  const box = $('#fan-card');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}
const seatText = s => (s.standing ? `${s.secName}, standing` : `${s.secName} · Row ${s.row} · Seat ${s.num}`);
const priceText = c => (c.price == null ? c.note || 'On tiket.com' : formatRpShort(c.price));

// ---------------------------------------------------------------- open a venue

export async function openViewer(id, { cat, seat, back, tour } = {}) {
  const venue = getEvent(id);
  // A tour opens only on a pass the Worker has just said is paid (passes.js).
  if (tour && passes.get(tour)?.status === 'verifying') await refresh(passes.get(tour));
  $('#seats-back').href = tour ? '#passes' : back || (venue.meta.demo ? '#partner-demo' : `#event-${id}`);
  state.shared = !tour && venue.seatById.has(seat) ? seat : null;
  const p = tour ? passes.get(tour) : null;
  state.tour = p && p.status === 'confirmed' && p.eventId === id && venue.seatById.has(p.seat) ? { id: p.id, step: 1 } : null;
  if (state.tour) cat = null;
  closePeek();
  if (state.venue?.eventId === id && state.scene) {
    if (state.tour) { startTour(); return; }
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
      onFan: f => (state.tour && !f.locked ? showFanOnMap(f) : openFanCard(f)),
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
  tagKey = '';
  if (!(await state.scene.load(venue, crowd))) return;
  if (state.venue !== venue || state.view !== 'seats') return;
  state.scene.setCrowd(state.crowd);
  state.scene.setLabels(state.labels);
  if (state.filter) state.scene.setFilter(state.filter);
  paintViewer();
  setMode('overview');
  loading.classList.add('gone');
  if (state.tour) startTour();
  showShared();
}

// Drop the scene when leaving the viewer: it is heavy.
export function closeViewer() {
  state.tour = null;
  document.body.classList.remove('in-tour');
  resetMates();
  closeFanCard();
  import('./capture.js').then(m => m.stopCapture());
  tagKey = '';
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
  $('#ev-label').textContent = e.demo ? 'Demo venue' : ({ cinema: 'Cinema', football: 'Football', sport: 'Sport', combat: 'Fight night', theatre: 'Theatre' }[typeOf(e)] || 'Concert');
  $('#ev-title').textContent = e.title;
  $('#ev-when').innerHTML = e.demo ? esc(e.subtitle) : `${esc(w.date)} · ${w.time ? esc(w.time) : 'time TBA'}${w.local ? `<small>${esc(w.local)}</small>` : ''}`;
  $('#ev-venue').textContent = v.event.venue;
  $('#app-chip').innerHTML = e.demo ? `${icon('i-eye')}<span>Demo venue · sample prices</span>`
    : state.tour ? `${icon('i-eye')}<span>Your seat tour · ${esc(v.catById[tourPass()?.cat]?.name || '')}</span>`
      : p ? `${icon(p.status === 'confirmed' ? 'i-eye' : 'i-lock')}<span>3D pass · ${STATUS[p.status].label}</span>`
        : `${icon('i-lock')}<span>View from above · seat views locked</span>`;
  $('#app-chip').className = `app-chip${open || state.tour ? ' is-open' : ''}`;
  document.body.classList.toggle('in-tour', !!state.tour);
  $('#app-side').classList.remove('is-mini');
  if (state.tour) { paintTour(); return; }
  $('#app-side').innerHTML = e.demo ? `
      <p class="eyebrow">Demo venue</p>
      <h2>Sit anywhere</h2>
      <p>Click any seat to sit down, drag to look round, scroll to zoom. ${esc(e.blurb)}</p>
      <div class="row-btns"><a class="btn btn-coral btn-sm" href="#partner-contact">Book a demo</a><a class="btn btn-line btn-sm" href="#concerts">See concerts</a></div>`
    : p?.status === 'confirmed' ? `
      <p class="eyebrow">Your 3D pass</p>
      <h2>Your seat is ready</h2>
      <p>Your pass is paid and open. Take the tour from the whole venue to your category, then to the view from your seat.</p>
      <div class="row-btns"><a class="btn btn-coral btn-sm" href="#tour-${esc(p.id)}">Open my seat view ${icon('i-arrow')}</a></div>
      ${matesBlock(p, { cats: v.catById })}`
      : p?.status === 'verifying' ? `
      <p class="eyebrow">${icon('i-clock')}Checking your pass</p>
      <h2>One moment</h2>
      <p>${esc(STATUS.verifying.note)}</p>
      <div class="row-btns"><a class="btn btn-line btn-sm" href="#passes">My 3D passes</a></div>`
      : p?.status === 'device' ? `
      <p class="eyebrow">${icon('i-lock')}Open on 2 other devices</p>
      <h2>Open it on this device</h2>
      <p>${esc(STATUS.device.note)}</p>
      <div class="row-btns"><a class="btn btn-coral btn-sm" href="#passes">Get the code ${icon('i-arrow')}</a></div>`
      : p?.status === 'checking' ? `
      <p class="eyebrow">${icon('i-clock')}Waiting for payment</p>
      <h2>Almost there</h2>
      <p>Your seat view opens as soon as the payment goes through. Look round from above until then.</p>
      <div class="row-btns"><a class="btn btn-line btn-sm" href="#passes">My 3D passes</a></div>`
      : `
      <p class="eyebrow">${icon('i-lock')}Seat views locked</p>
      <h2>Look round, then sit down</h2>
      <p>Anyone can look round from above. The view from your own seat opens with a 3D pass: fill in your seat, your name and your email, and pay ${formatFee()}.</p>
      <div class="row-btns"><a class="btn btn-coral btn-sm" href="#unlock-${e.id}">Unlock · ${formatFee()} ${icon('i-arrow')}</a>${buyLink(e, `Tickets ${out}`, 'btn btn-line btn-sm')}</div>`;
  renderCats();
  state.scene?.setMine(markedIds());
  if (state.viewing) fillSeatCard(state.viewing);
  paintMates();
}

function renderCats() {
  const v = state.venue, own = tourPass()?.cat;
  $('#cats').innerHTML = v.categories.map(c => `
    <button class="cat-pill${own && c.id !== own ? ' is-off' : ''}${own === c.id ? ' is-own' : ''}" type="button" data-cat="${c.id}" aria-pressed="${state.filter === c.id}"${own && c.id !== own ? ' aria-disabled="true"' : ''}>
      <b><i class="cat-dot" style="background:${esc(c.color)}"></i>${esc(c.name)}</b><span>${esc(priceText(c))}</span>
    </button>`).join('');
}

function setMode(mode, seat) {
  if (state.tour) {
    if (mode === 'turning' || mode === 'seat') state.scene?.setCrowd(state.crowd);
    if (mode === 'seat') { state.tour.step = 3; state.tour.picking = false; state.tour.fan = null; paintTags(); paintTour(); }
    // Up over the venue to show a fan picked from the list: the panel stays on the list.
    if (mode === 'overview' && state.tour.fan) {
      state.scene?.setCrowd(false);
      const go = state.tour.afterOverview;
      state.tour.afterOverview = null;
      go?.();
    }
    else if (mode === 'overview' && state.tour.step === 3) {
      state.tour.step = 2;
      state.tour.framed = true;
      state.scene?.setCrowd(false);
      if (state.tour.picking) frameBlock();
      paintTour();
    }
  }
  const inSeat = mode !== 'overview';
  if (inSeat) closePeek();
  $('#stage').classList.toggle('is-seat', inSeat);
  $('#tooltip').hidden = true;
  if (seat) { state.viewing = seat; fillSeatCard(seat); $('#sc-dist').textContent = 'Walking to the seat'; }
  if (mode === 'overview') state.viewing = null;
  $('#seatcard').hidden = !!state.tour || !(mode === 'turning' || mode === 'seat' || (mode === 'overview' && state.peek));
  $('#pov-hint').hidden = mode !== 'seat';
  $('#zoom').hidden = mode !== 'seat';
}

// A click on a seat: sit down, or (without a pass) see what the seat is and how to unlock.
function pickSeat(seat) {
  if (state.tour) { tourPick(seat); return; }
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
    $('#sc-dist').textContent = friend ? `Your friend sits here. Unlock a seat near them for ${formatFee()} to see their view.`
      : `Have a ticket here? Unlock the view from your seat for ${formatFee()}.`;
    $('#sc-actions').innerHTML = p?.status === 'confirmed'
      ? `<a class="btn btn-coral" href="#tour-${esc(p.id)}">Open my seat view ${icon('i-arrow')}</a>`
      : p?.status === 'checking' ? `<a class="btn btn-line" href="#passes">${icon('i-clock')}Waiting for payment</a>`
        : `<a class="btn btn-coral" href="#unlock-${e.id}">Unlock seat view · ${formatFee()} ${icon('i-arrow')}</a>${buyLink(e, `Tickets ${out}`, 'btn btn-line')}`;
    if (p?.status === 'confirmed') $('#sc-dist').textContent = 'Your pass is open. The tour takes you to your seat.';
    return;
  }
  $('#sc-actions').innerHTML = `
    <button class="btn btn-line" type="button" data-act="back">${icon('i-back')}Back to the map</button>
    ${p ? `<button class="btn ${mine ? 'btn-line' : 'btn-coral'}" type="button" data-act="mine" aria-pressed="${mine}">${icon(mine ? 'i-minus' : 'i-check', 'lead')}${mine ? 'Not my seat' : 'This is my seat'}</button>` : ''}
    <button class="btn btn-line" type="button" data-act="share">${icon('i-share')}Share</button>`;
}

function showTooltip(seat, ev) {
  const tt = $('#tooltip');
  if (!seat || !ev || state.peek) { tt.hidden = true; return; }
  const cat = state.venue.catById[seat.cat];
  const tp = tourPass();
  const note = !state.tour ? (canView(state.venue) ? '' : ' · seat view locked')
    : state.tour.picking ? (seat.sec === ticketSeat()?.sec && !seat.standing ? ' · tap to put your seat here' : ' · not your block')
    : seat.cat !== tp.cat ? ' · not your category'
      : state.tour.step === 1 ? ' · your category, tap to open'
        : seat.id === tourSeat()?.id ? ' · your seat, tap to sit' : ' · not your seat';
  tt.innerHTML = `<b>${esc(seat.secName)} · ${esc(seat.row)}${esc(String(seat.num))}</b> <span>${esc(cat.name)}${state.tour ? '' : ` · ${esc(priceText(cat))}`}${note}</span>`;
  const r = $('#stage').getBoundingClientRect();
  tt.style.left = `${Math.min(ev.clientX - r.left, r.width - 280)}px`;
  tt.style.top = `${ev.clientY - r.top}px`;
  tt.hidden = false;
}

// ---------------------------------------------------------------- controls

export function bindViewer() {
  // On phones the category rail and the tools sit above the bottom panel, whose height
  // changes (the seat tour's panel is taller), so they follow its measured height.
  const side = $('#app-side');
  if (side && window.ResizeObserver) new ResizeObserver(() => side.parentElement.style.setProperty('--side-h', `${side.offsetHeight}px`)).observe(side);
  const toggle = (btn, key, apply) => btn.addEventListener('click', () => {
    state[key] = !state[key];
    btn.classList.toggle('is-on', state[key]);
    btn.setAttribute('aria-pressed', state[key]);
    apply(state[key]);
  });
  toggle($('#t-crowd'), 'crowd', on => state.scene?.setCrowd(on));
  toggle($('#t-labels'), 'labels', on => state.scene?.setLabels(on));
  // Hides every panel over the venue, so the view fills the screen; the same button brings
  // them back. It stays that way for the visit, from one venue or seat to the next.
  $('#t-min').addEventListener('click', e => {
    const btn = e.currentTarget, on = !$('#stage').classList.contains('is-min');
    $('#stage').classList.toggle('is-min', on);
    btn.setAttribute('aria-pressed', on);
    btn.setAttribute('aria-label', on ? 'Show the panels' : 'Hide the panels');
    btn.title = btn.getAttribute('aria-label');
    btn.querySelector('use').setAttribute('href', on ? '#i-collapse' : '#i-expand');
  });
  $('#t-reset').addEventListener('click', () => { closePeek(); if (state.tour) startTour(); else state.scene?.resetView(); });
  $('#app-side').addEventListener('click', e => {
    const act = e.target.closest('[data-tour]')?.dataset.tour;
    if (act === 'cat' || act === 'seat') state.tour.numOpen = false;
    if (act === 'cat') tourCat(tourPass()?.cat);
    if (act === 'seat') { const s = tourSeat(); if (s) tourPick(s); }
    if (act === 'again') startTour();
    if (act === 'framecat') showCat();
    if (act === 'next') tourNext();
    if (act === 'capture') import('./capture.js').then(m => m.startCapture(state.scene, { title: state.venue?.meta?.title, seat: seatText(ticketSeat()) })).catch(() => toast('The camera could not start. Please try again.'));
    if (act === 'numopen' || act === 'numclose') setNumOpen(act === 'numopen');
    if (act === 'mini') { state.tour.mini = !state.tour.mini; paintTour(); $('#app-side [data-tour="mini"]')?.focus(); }
    if (act === 'prev') tourBack();
    if (act === 'pickseat') { state.tour.numOpen = false; startPicking(); }
    if (act === 'pickcancel') { state.tour.picking = false; paintTour(); }
    if (act === 'unpick') setNumbering('pick', '');
    const num = e.target.closest('[data-num]')?.dataset.num;
    if (num) { setNumbering(...num.split(':')); $(`#app-side [data-num="${CSS.escape(num)}"]`)?.focus(); }
    if (act === 'back') state.scene?.backToOverview();
  });
  bindMates($('#app-side'), { pass: matesPass, repaint: paintViewer });
  $('#fan-card').addEventListener('click', e => {
    const act = e.target.closest('[data-fancard]')?.dataset.fancard;
    if (e.target === e.currentTarget || act === 'close') closeFanCard();
    if (act === 'edit') { closeFanCard(); $('#app-side [data-mates="edit"]')?.click(); }
    if (e.target.closest('a[href^="#unlock-"]')) closeFanCard();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeFanCard(); if (state.tour?.numOpen) setNumOpen(false); } });
  $('#sc-close').addEventListener('click', closePeek);
  $('#zoom').addEventListener('click', e => {
    const d = e.target.closest('[data-zoom]')?.dataset.zoom;
    if (d) state.scene?.zoomSeatView(+d);
  });
  $('#cats').addEventListener('click', e => {
    const b = e.target.closest('.cat-pill');
    if (!b) return;
    if (state.tour) { tourCat(b.dataset.cat); return; }
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
    if (state.tour && state.scene?.mode === 'seat') { state.scene.backToOverview(); return; }
    if (state.peek) closePeek();
    else if (state.scene?.mode === 'seat') state.scene.backToOverview();
  });
}

// ---------------------------------------------------------------- the seat tour

const STEPS = ['Your category', 'Your seat'];

// The tour has two steps: the fan's category (step 2 here), then their seat (step 3). It opens
// on the whole venue from above, the category marked; the first button then flies to the
// category (`framed`), and only then becomes Sit in my seat.
function startTour() {
  const sc = state.scene, p = tourPass();
  if (!sc || !p) return;
  state.tour.step = 2;
  state.tour.numOpen = false;
  state.tour.picking = false;
  state.tour.framed = false;
  state.filter = p.cat;
  sc.setFilter(p.cat);
  sc.setMine(markedIds());
  sc.setCrowd(false);   // empty stands, so the category's colour and the coral seat read clearly
  if (sc.mode === 'seat') { state.tour.framed = true; sc.backToOverview(); }   // back over the category
  else sc.resetView();
  paintViewer();
}

function tourCat(cat) {
  const p = tourPass(), v = state.venue;
  if (!p || state.tour.step !== 1) return;
  if (cat !== p.cat) { toast(`Your ticket is ${v.catById[p.cat].name}. Pick that one.`); return; }
  state.tour.step = 2;
  state.filter = cat;
  state.scene.setFilter(cat);
  state.scene.setMine(markedIds());
  state.scene.setCrowd(false);   // empty stands, so the category's colour and the coral seat read clearly
  state.scene.frameCategory(cat, { seat: tourSeat() });
  paintViewer();
}

function tourPick(seat) {
  const p = tourPass(), v = state.venue, mine = tourSeat();
  if (!p || !mine) return;
  // Looking at a fan from the list: only the fan's own seat sits them back down.
  if (state.tour.fan) { if (seat.id === mine.id) state.scene.flyToSeat(mine); return; }
  if (state.tour.step === 1) {
    if (seat.cat === p.cat) tourCat(p.cat);
    else toast(`That is ${v.catById[seat.cat].name}. Your ticket is ${v.catById[p.cat].name}.`);
    return;
  }
  if (state.tour.step === 2 && state.tour.picking) {
    const t = ticketSeat();
    if (seat.sec !== t.sec || seat.standing) { toast(`Your ticket is for ${t.secName}. Tap a seat in that block.`); return; }
    state.tour.picking = false;
    setNumbering('pick', seat.id);
    toast(`Your seat is now where you tapped. Your ticket still reads ${seatText(t)}.`);
    state.scene.flyToSeat(tourSeat());
    return;
  }
  if (state.tour.step === 2) {
    if (seat.id === mine.id) { state.scene.flyToSeat(mine); return; }
    toast(`Not your seat. Yours is marked in coral: ${seatText(ticketSeat())}.`);
    return;
  }
  toast('This is your seat. Drag to look round.');
}

// The venue numbers another way: the fan's seat moves to where their ticket's row and number
// are counted the venue's way, and the view follows it. Setting a rule lets go of a seat the
// fan pointed at; an empty `pick` lets go of it too.
function setNumbering(key, value) {
  const p = tourPass();
  if (!p || !['seats', 'rows', 'letters', 'pick'].includes(key)) return;
  const { pick, ...rule } = numberingOf(state.venue, p);
  passes.save({ ...p, numbering: cleanNumbering(key === 'pick' ? { ...rule, pick: value } : { ...rule, [key]: value }) });
  const s = tourSeat();
  if (state.tour.step === 3 && s && !(key === 'pick' && value)) state.scene?.flyToSeat(s, { quick: true });
  paintViewer();
}

// Fly to the fan's category; the first button becomes Sit in my seat.
function showCat() {
  const p = tourPass();
  if (!p || !state.scene || state.tour.step !== 2) return;
  state.tour.framed = true;
  state.scene.frameCategory(p.cat, { seat: tourSeat() });
  paintTour();
}
// One step back: from the seat to the category, from tapping a seat to the category, from
// the category to the whole venue.
function tourBack() {
  const t = state.tour;
  if (!t) return;
  if (t.fan) { const s = tourSeat(); if (s) tourPick(s); }   // from a fan's seat back to the fan's own
  else if (t.step === 3) state.scene?.backToOverview();   // setMode puts the tour on step 2
  else if (t.step === 2 && t.picking) { t.picking = false; paintTour(); }
  else if (t.step === 2 && t.framed) startTour();
}
// One step on: the whole venue to the category, the category to the seat.
function tourNext() {
  const t = state.tour;
  if (!t || t.step !== 2 || t.picking) return;
  if (!t.framed) showCat();
  else { const s = tourSeat(); if (s) tourPick(s); }
}

// The sheet with the numbering choices, over the panel. Focus goes into it, and back to the
// row that opened it.
function setNumOpen(on) {
  if (!state.tour) return;
  state.tour.numOpen = on;
  state.tour.numIn = on;
  paintTour();
  $(on ? '#num-title' : '#app-side .num-trigger')?.focus();
}

// Point at the seat: back to the ticket's block from above, where a tap on one of its seats
// makes that the fan's seat (tourPick).
function startPicking() {
  const s = ticketSeat();
  if (!s || s.standing || !state.scene) return;
  state.tour.picking = true;
  if (state.scene.mode === 'seat') state.scene.backToOverview();   // setMode frames the block once there
  else { state.tour.step = 2; frameBlock(); paintTour(); }
}
function frameBlock() {
  const s = ticketSeat();
  if (s) state.scene?.frameCategory(s.cat, { seat: tourSeat(), sec: s.sec });
}

// How the venue counts: where seat 1 is (an end, or odd and even from the middle out), where
// row A is, and whether the rows skip I and O. Last, the fan can point at the seat. Not for
// standing tickets, which have no row or number.
//
// The same on every phone and computer: one slim row in the panel says how the seats are
// numbered now, and opens a sheet over the panel with the choices, so the stepper and the
// main buttons keep the room.
function numberingControls(p, s) {
  if (s.standing) return '';
  const v = state.venue, n = numberingOf(v, p), from = numberingSource(v, p);
  const status = from === 'pick' ? 'You tapped your seat yourself'
    : from === 'fan' && !isDefault(n) ? 'Adjusted by you'
      : from === 'event' ? 'From the venue’s latest info' : 'From the promoter’s seating plan';
  const own = from === 'pick' || (from === 'fan' && !isDefault(n));
  return `<button class="num-trigger${own ? ' is-own' : ''}" type="button" data-tour="numopen" aria-expanded="false">
      ${icon('i-seat', 'nt-ic')}<span class="nt-text"><b>See other seat position options</b><small>${status}</small></span>${icon('i-arrow', 'nt-go')}
    </button>`;
}

// The choices, shown in the panel in place of the step while the fan sets them.
function numberingSheet(p, s) {
  const v = state.venue, n = numberingOf(v, p), from = numberingSource(v, p);
  const opt = (key, value, label, hint = '', id = '') => `<button type="button" class="num-opt" data-num="${key}:${value}" aria-pressed="${n[key] === value}"${hint ? ` title="${hint}"` : ''}${id ? ` data-id="${id}"` : ''}>${label}</button>`;
  const body = from === 'pick' ? `
      <div class="fine num-lead">You put your seat where you know it is. Your ticket still reads ${esc(seatText(s))}.</div>
      <div class="num-foot"><button class="link" type="button" data-tour="unpick">Go back to the seat numbers</button></div>`
    : `
      <div class="fine num-lead">${from === 'event' ? `Your seat follows the latest numbering from ${esc(v.place.name)}, but plans can change on the day. If yours is different, set it here.` : 'We place your seat from the promoter’s plan. Numbering at the venue can differ, and plans can change on the day. If yours is different, set it here.'}</div>
      <div class="num-row" role="group" aria-label="Where seat 1 is"><span>Seat 1</span>${opt('seats', 'left', 'Left end')}${opt('seats', 'right', 'Right end')}</div>
      <div class="num-row" role="group" aria-label="Odd and even numbers from the middle of the row"><span>Odd, even</span>${opt('seats', 'odd-left', 'Odd left', '1, 3, 5 to the left of the middle; 2, 4, 6 to the right')}${opt('seats', 'odd-right', 'Odd right', '1, 3, 5 to the right of the middle; 2, 4, 6 to the left')}</div>
      <div class="num-row" role="group" aria-label="Where row A is"><span>Row A</span>${opt('rows', 'front', 'Front')}${opt('rows', 'back', 'Back', '', 'Belakang')}</div>
      <div class="num-row" role="group" aria-label="Row letters"><span>Letters</span>${opt('letters', 'all', 'A to Z')}${opt('letters', 'no-io', 'No I or O', 'The rows go H, J and N, P')}</div>
      <div class="num-foot"><span>Still not right?</span> <button class="link" type="button" data-tour="pickseat">Tap your seat yourself</button></div>`;
  return `<div class="num-sheet" role="group" aria-labelledby="num-title">
      <div class="num-head"><b id="num-title" tabindex="-1">If your seat is elsewhere</b><button class="btn btn-coral btn-sm num-done" type="button" data-tour="numclose">Done</button></div>
      ${body}
    </div>`;
}

// What the view from the seat rests on: the block is the promoter's, the row and number
// inside it are counted the way the venue confirmed, the fan set, or our estimate.
function seatNote(p, s) {
  const v = state.venue, how = numberingSource(v, p);
  if (s.standing || how === 'pick') return '';
  // A show whose plan we have not modelled sits in a stand-in hall: its block is ours too.
  const block = REAL_KEYS.includes(v.key) ? 'Your block is from the promoter’s plan.' : 'This hall is a stand-in until we model the promoter’s plan, so your block is our estimate too.';
  const text = how === 'event' ? `Rows and seats are counted the way ${v.place.name} numbers them.`
    : how === 'fan' ? `${block} The row and seat follow the numbering you set.`
      : `${block} The row and seat inside it are our estimate.`;
  return `<p class="fine seat-note">${esc(text)}</p>`;
}

function paintTour() {
  const p = tourPass(), v = state.venue, s = ticketSeat();
  if (!p || !s) return;
  const cat = v.catById[p.cat], step = state.tour.step, e = v.meta;
  if (state.tour.numOpen && step >= 2 && !state.tour.picking && !s.standing) {
    $('#app-side').classList.remove('is-mini');
    $('#app-side').innerHTML = numberingSheet(p, s);
    if (state.tour.numIn) { $('#app-side .num-sheet').classList.add('is-in'); state.tour.numIn = false; }
    renderCats();
    state.scene?.setMine(markedIds());
    return;
  }
  // A slim head in place of a stepper: back one step on the left, fold the panel away on the
  // right. Folded, the panel is only this head, so the venue fills the screen.
  const mini = !!state.tour.mini, t = state.tour;
  const canBack = step > 2 || !!t.picking || (step === 2 && !!t.framed), canNext = step === 2 && !t.picking;
  const where = t.fan ? t.fan.name : step === 1 ? v.place.name : step === 2 && state.tour.picking ? 'Tap your seat' : step === 2 ? cat.name : 'Your view';
  const bar = `<div class="tour-head">
      <button class="th-btn" type="button" data-tour="prev" aria-label="Back to the step before" title="Back to the step before"${canBack ? '' : ' disabled'}>${icon('i-back')}</button>
      <button class="th-btn" type="button" data-tour="next" aria-label="Next step" title="Next step"${canNext ? '' : ' disabled'}>${icon('i-arrow')}</button>
      <span class="th-step">${mini ? `<b>${esc(where)}</b>` : ''}</span>
      <button class="th-btn th-min" type="button" data-tour="mini" aria-expanded="${!mini}" aria-label="${mini ? 'Show the panel' : 'Minimise the panel'}" title="${mini ? 'Show the panel' : 'Minimise the panel'}">${icon('i-down')}</button>
    </div>`;
  if (mini) {
    $('#app-side').innerHTML = bar;
    $('#app-side').classList.add('is-mini');
    renderCats();
    state.scene?.setMine(markedIds());
    return;
  }
  $('#app-side').classList.remove('is-mini');
  const body = step === 1 ? `
      <h2>${esc(v.place.name)}</h2>
      <p>This is the whole venue for ${esc(e.title)}. Your ticket is <b>${esc(cat.name)}</b>: tap it below, or tap one of its seats.</p>
      <div class="row-btns"><button class="btn btn-coral btn-sm" type="button" data-tour="cat"><i class="cat-dot" style="background:${esc(cat.color)}"></i>${esc(cat.name)} ${icon('i-arrow')}</button></div>`
    : step === 2 && state.tour.picking ? `
      <h2>Tap your seat</h2>
      <p class="fine">Tap the seat you know is yours, in <b>${esc(s.secName)}</b>. Pinch or scroll to zoom in.</p>
      <div class="row-btns"><button class="btn btn-line btn-sm" type="button" data-tour="pickcancel">Cancel</button></div>`
    : step === 3 && t.fan ? `
      <p class="fine"><b>${esc(t.fan.name)}</b> sits in ${esc(seatText(seatOf(t.fan.seat) || s))}. Their seat has the green marker.</p>
      <div class="row-btns"><button class="btn btn-coral btn-sm" type="button" data-tour="seat">Back to my seat ${icon('i-seat')}</button></div>`
    : step === 2 ? `
      <p>Your seat is marked in coral: <b>${esc(seatText(s))}</b>. Tap it to sit down.</p>
      <div class="row-btns">${t.framed
        ? `<button class="btn btn-coral btn-sm" type="button" data-tour="seat">Sit in my seat ${icon('i-seat')}</button>`
        : `<button class="btn btn-coral btn-sm" type="button" data-tour="framecat">Show my category ${icon('i-pin')}</button>`}<button class="btn btn-line btn-sm" type="button" data-tour="again">${icon('i-venue')}Whole venue</button></div>
      ${numberingControls(p, s)}`
      : `
      <h2>Your view</h2>
      <p><b>${esc(seatText(s))}</b>, ${esc(cat.name)}. Drag to look round.</p>
      ${seatNote(p, s)}
      ${numberingControls(p, s)}
      <div class="tour-end">
        <button class="tour-act is-capture" type="button" data-tour="capture">${icon('i-camera')}<b>Capture this moment</b><span>Photo or video of your view</span></button>
        <button class="tour-act" type="button" data-tour="again">${icon('i-venue')}<b>See the whole venue</b><span>Take the tour again</span></button>
      </div>`;
  // Seat mates (the Instagram profile on the seat) at the end of the tour, in the seat.
  const matesHtml = step === 3 ? matesBlock(p, { cats: v.catById, compact: !!t.fan }) : '';
  $('#app-side').innerHTML = `${bar}${body}${matesHtml}`;
  if (matesHtml && state.scene) {
    fillMatesList($('#app-side'), {
      passId: p.id, fans: (mates.data?.fans || []).filter(f => !f.mine),
      blockOf: id => seatOf(id)?.secName, onOpen: showFanOnMap, current: t.fan?.seat || '',
    });
  }
  renderCats();
  state.scene?.setMine(markedIds());
  paintMates();
}
