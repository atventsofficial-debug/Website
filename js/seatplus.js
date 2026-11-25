// What 3D Pass Plus adds to the seat view (viewer.js): two seats side by side, and show mode.
//
// Compare: any seat card can go into the tray, two at a time. The tray measures both seats
// (compare.js) and says which sees more and what each wins on, for anyone. Sitting in either
// to look is what a Plus pass (or a demo venue) opens. A link carries the pair.
//
// Show mode: from a seat, the light sticks round you in a colour you pick (or the crowd's
// own), on the beat, steady or in a wave round the stage, a light-stick ocean, and the house
// lights up or down. It comes with Plus, and is open on the demo venues.
//
// Eye height: from a seat, how tall the fan is and how tall the people a few rows in front
// are, so the view is the one they will have on the night (or a clearer one). Plus too.
import { formatFee, PLUS_FEE, UPGRADE_FEE } from './rules.js';
import { canView, plusOpen, plusOnSale, upgradable } from './passes.js';
import { compareSeats, pairText } from './compare.js';
import { accessOf, wayIn } from './access.js';
import { $, esc, icon, state, share, toast } from './ui.js';
import { setlistFor } from './setlists.js';
import { isConcert } from './events.js';
import { CityMap, KINDS, mapAreaOf } from './citymap.js';

const seatOf = id => { const v = state.venue, i = v?.seatById.get(id); return i === undefined ? null : v.seats[i]; };
const seatName = s => (s.standing ? s.secName : `${s.secName} · ${s.row}${s.num}`);
const fmtRp = n => `Rp${Math.round(n).toLocaleString('id-ID')}`;

// What a locked visitor is offered: Plus when it is on sale, the upgrade with a seat pass.
function plusOffer(what) {
  const e = state.venue.meta;
  if (!plusOnSale()) return `<p class="plus-lock">${icon('i-lock')}<span>${what} comes with 3D Pass Plus. <b>Coming soon.</b></span></p>`;
  const up = upgradable(e.id);
  return `<p class="plus-lock">${icon('i-lock')}<span>${what} comes with 3D Pass Plus.</span></p>
    <a class="btn btn-coral btn-sm" href="${up ? `#upgrade-${esc(up.id)}` : `#plus-${esc(e.id)}`}">${up ? `Upgrade · ${formatFee(UPGRADE_FEE)}` : `Get Plus · ${formatFee(PLUS_FEE)}`} ${icon('i-arrow')}</a>`;
}

// ---------------------------------------------------------------- compare

export const compareIds = () => (state.tour ? [] : (state.compare || []).filter(id => seatOf(id)));

export function addCompare(seat, repaint) {
  const ids = compareIds().filter(id => id !== seat.id);
  ids.push(seat.id);
  state.compare = ids.slice(-2);
  paintCompare();
  repaint?.();
}

export function setCompare(ids) {
  state.compare = ids.slice(0, 2);
}

export function paintCompare() {
  const box = $('#compare');
  if (!box) return;
  const ids = compareIds();
  box.hidden = !ids.length || !state.venue;
  $('#stage')?.classList.toggle('has-compare', !box.hidden);
  if (box.hidden) return;
  const v = state.venue, seats = ids.map(seatOf), open = canView(v);
  const r = seats.length === 2 ? compareSeats(v, seats[0], seats[1]) : null;
  const title = !r ? 'Pick a second seat' : r.best < 0 ? 'A close call' : `Seat ${'AB'[r.best]} sees more`;
  const lede = !r ? 'Tap any seat on the map, then Compare on its card.'
    : r.value >= 0 && r.value !== r.best ? `Seat ${'AB'[r.value]} is the better value for the price.`
      : r.best < 0 ? 'Both seats see the stage about as well.' : 'Nearer, straighter on, or both.';
  const card = (s, i) => `<div class="cmp-seat${r?.best === i ? ' is-best' : ''}">
      <p class="cmp-tag"><b>${'AB'[i]}</b><span>${esc(v.catById[s.cat]?.name || '')}</span></p>
      <p class="cmp-name">${esc(s.secName)}</p>
      <p class="cmp-spot mono">${s.standing ? 'Free standing' : `Row ${esc(s.row)} · Seat ${esc(String(s.num))}`}</p>
      ${r ? `<p class="cmp-score"><b>${r.score[i]}</b><span>View score</span></p>` : ''}
    </div>`;
  const empty = `<div class="cmp-seat is-empty"><p class="cmp-tag"><b>B</b><span>Second seat</span></p><p class="cmp-spot mono">Not picked yet</p></div>`;
  let rows = '';
  if (r) {
    const [a, b] = r.stats;
    const lower = (x, y, eps) => (Math.abs(x - y) < eps ? -1 : x < y ? 0 : 1);
    const row = (label, va, vb, win) => `<div><dt>${label}</dt><dd class="${win === 0 ? 'is-win' : ''}">${va}</dd><dd class="${win === 1 ? 'is-win' : ''}">${vb}</dd></div>`;
    rows = `<dl class="cmp-rows">
      ${row('To the stage', `${Math.round(a.dist)} m`, `${Math.round(b.dist)} m`, lower(a.dist, b.dist, 2))}
      ${a.round ? '' : row('Off centre', `${Math.round(a.side)}°`, `${Math.round(b.side)}°`, lower(a.side, b.side, 8))}
      ${row('Eye height', `${a.height.toFixed(1)} m`, `${b.height.toFixed(1)} m`, -1)}
      ${row('Price', a.price == null ? '—' : fmtRp(a.price), b.price == null ? '—' : fmtRp(b.price), a.price != null && b.price != null ? lower(a.price, b.price, 1) : -1)}
    </dl>`;
  }
  const sit = open && seats.length ? `<div class="cmp-sit">${seats.map((s, i) => `<button class="btn ${i === 0 ? 'btn-coral' : 'btn-line'} btn-sm" type="button" data-cmp="sit" data-seat="${esc(s.id)}">Sit in ${'AB'[i]}</button>`).join('')}</div>` : '';
  box.innerHTML = `<div class="cmp-head">
      <div><p class="eyebrow">${icon('i-compare')}Compare seats</p><h2>${esc(title)}</h2><p class="cmp-lede">${esc(lede)}</p></div>
      <button class="sq sq-sm" type="button" data-cmp="close" aria-label="Close compare"><svg><use href="#i-x"/></svg></button>
    </div>
    <div class="cmp-seats">${seats.map(card).join('')}${seats.length < 2 ? empty : ''}</div>
    ${rows}
    ${sit}
    ${r ? `<div class="cmp-foot">
      <button class="btn btn-line btn-sm" type="button" data-cmp="share">${icon('i-share')}Share this pair</button></div>
    <p class="cmp-note mono">Measured from the 3D model. The real layout on the day may differ.</p>` : ''}`;
}

export function bindCompare({ repaint }) {
  $('#compare')?.addEventListener('click', e => {
    const b = e.target.closest('[data-cmp]');
    if (!b) return;
    const act = b.dataset.cmp, s = seatOf(b.dataset.seat);
    if (act === 'close') { state.compare = []; paintCompare(); repaint?.(); }
    if (act === 'drop') { state.compare = compareIds().filter(id => id !== b.dataset.seat); paintCompare(); repaint?.(); }
    if (act === 'sit' && s && canView(state.venue)) state.scene?.flyToSeat(s);
    if (act === 'share') {
      const v = state.venue, ids = compareIds(), e2 = v.meta;
      share({
        title: e2.title,
        text: `Which seat for ${e2.title}? ${ids.map(id => seatName(seatOf(id))).join(' or ')}, side by side in 3D:`,
        url: `${location.origin}${location.pathname}#${e2.demo ? `demo-${v.key}` : `seats-${v.eventId}`}@${pairText(ids)}`,
      });
    }
  });
}

// ---------------------------------------------------------------- getting there

// The seat the way in leads to: the one being looked at, the tour's, or the first compared.
let routeSeat = null;
const accessSeat = ({ tourSeat } = {}) => state.viewing || state.peek || tourSeat?.() || seatOf(compareIds()[0]) || null;

// The map round the venue (citymap.js): opens with the panel where the venue has one.
let city = null, mapView = false, mapReady = false, mapKind = null, mapStop = null, mapFailed = false;
const mapArea = () => mapAreaOf(state.venue?.meta?.place?.name);
const KIND_LABEL = Object.fromEntries(KINDS.map(([k, label]) => [k, label]));

// On a computer a panel opens under its button in the bar at the top (css/styles.css): its left
// edge under the button's, or its right edge when it would run off the screen.
const DROPS = [['#t-access', '#access'], ['#set-btn', '#set-panel'], ['#show-btn', '#show-panel'], ['#eye-btn', '#eye-panel']];
export function placeDrops() {
  const stage = $('#stage');
  if (!stage) return;
  let over = false;
  if (window.matchMedia?.('(min-width: 961px)').matches) {
    const st = stage.getBoundingClientRect(), side = $('#app-side');
    // The tour's card at the bottom right: a panel that would cover it opens the other way, and
    // if it covers it either way the card steps aside while the panel is open, as on a phone.
    const mine = stage.classList.contains('drop-over');
    const sr = side && !side.hidden && (mine || getComputedStyle(side).opacity !== '0') ? side.getBoundingClientRect() : null;
    for (const [b, p] of DROPS) {
      const btn = $(b), panel = $(p);
      if (!btn || !panel || panel.hidden || btn.hidden) continue;
      const r = btn.getBoundingClientRect(), w = panel.offsetWidth, foot = panel.getBoundingClientRect().top + panel.offsetHeight;
      const covers = x => !!sr && st.left + x + w > sr.left - 12 && foot > sr.top;
      // Directions opens towards the left: the street map behind it gets the wider side.
      let x = r.left - st.left;
      if (p === '#access' || x + w > st.width - 16 || covers(x)) x = r.right - st.left - w;
      x = Math.max(16, x);
      if (covers(x)) over = true;
      panel.style.setProperty('--drop-x', `${Math.round(x)}px`);
    }
  }
  stage.classList.toggle('drop-over', over);
}

function mapInset() {
  const box = $('#access'), stage = $('#stage');
  if (!box || !stage) return {};
  placeDrops();
  const b = box.getBoundingClientRect(), st = stage.getBoundingClientRect();
  if (b.width > st.width * 0.7) return { bottom: Math.max(0, st.bottom - b.top) };
  // On a computer the panel opens under its button in the bar at the top: the map keeps
  // clear of the bar and of the panel, on whichever side of it has more room.
  const top = Math.max(0, ($('#stage .app-top')?.getBoundingClientRect().bottom ?? st.top) - st.top);
  return st.right - b.right >= b.left - st.left ? { top, left: Math.max(0, b.right - st.left) } : { top, right: Math.max(0, st.right - b.left) };
}

async function openMap(opts) {
  const key = mapArea();
  if (!key) return;
  city ||= new CityMap($('#stage'), { onPick: id => pickStop(id, opts) });
  mapView = true; mapReady = false;
  $('#stage')?.classList.add('map-open');
  paintAccess(opts);
  city.setInset(mapInset());
  try {
    await city.open(key, state.venue.meta.place.name);
    if (!mapView) { city.close(); return; }
    mapReady = true; mapFailed = false;
    if (mapStop != null && !city.walks.some(w => w.id === mapStop)) mapStop = null;
    if (mapStop != null && plusOpen(state.venue)) city.pick(mapStop);
  } catch {
    mapFailed = true; mapView = false;
    $('#stage')?.classList.remove('map-open');
  }
  paintAccess(opts);
}

function closeMap() {
  mapView = false; mapReady = false;
  city?.close();
  $('#stage')?.classList.remove('map-open');
}

function pickStop(id, opts) {
  mapStop = id;
  const s = city?.walks.find(w => w.id === id);
  if (s) mapKind = s.kind;
  if (plusOpen(state.venue)) city?.pick(id);
  paintAccess(opts);
}

export function closeAccess() {
  const box = $('#access');
  if (!box) return;
  box.hidden = true;
  $('#t-access')?.setAttribute('aria-pressed', 'false');
  $('#t-access')?.classList.remove('is-on');
  $('#stage')?.classList.remove('access-open');
  routeSeat = null;
  state.scene?.setRoute(null);
  closeMap();
  mapStop = null; mapKind = null;
}

const fmtM = m => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

// How are you coming: the kinds of transport round the venue, its nearest stops, and the walk.
function mapHtml(open) {
  if (!mapReady) return `<div class="acc-map is-loading"><p class="acc-lede">Drawing the streets round the venue…</p></div>`;
  const walks = city.walks, kinds = KINDS.map(([k]) => k).filter(k => walks.some(w => w.kind === k));
  if (!kinds.length) return '';
  if (!kinds.includes(mapKind)) mapKind = kinds[0];
  const list = walks.filter(w => w.kind === mapKind).slice(0, 4);
  const sel = walks.find(w => w.id === mapStop) || null;
  const legs = sel ? sel.walk.legs.slice(0, 6) : [];
  const walk = !sel ? `<p class="acc-lede">Pick where you arrive: the walk from there lights up on the map.</p>`
    : !open ? `<div class="cmp-lock">${plusOffer('The walking route on the map')}</div>`
      : `<div class="acc-route">
        <p class="acc-walk"><b>${sel.walk.minutes}</b><span>min on foot<br>${fmtM(sel.walk.metres)} to the venue</span></p>
        <ol class="acc-legs">
          <li><i></i><span>From <b>${esc(sel.name)}</b></span></li>
          ${legs.map(l => `<li><i></i><span>${l.name ? `Along <b>${esc(l.name)}</b>` : 'On the footpath'}</span><em class="mono">${fmtM(l.metres)}</em></li>`).join('')}
          <li class="is-end"><i></i><span>At the venue door</span></li>
        </ol>
      </div>`;
  return `<div class="acc-map">
      <p class="cmp-tag"><b>${icon('i-pin')}</b><span>How are you coming?</span></p>
      <div class="show-seg acc-kinds">${kinds.map(k => `<button type="button" data-acc="kind" data-kind="${k}" aria-pressed="${k === mapKind}">${esc(KIND_LABEL[k])}</button>`).join('')}</div>
      <ul class="acc-stops">${list.map(w => `<li><button type="button" data-acc="stop" data-stop="${w.id}" aria-pressed="${w.id === mapStop}"><span class="acc-badge" data-kind="${w.kind}">${esc(KINDS.find(([k]) => k === w.kind)[2])}</span><span class="acc-stop-name">${esc(w.name)}</span><span class="acc-stop-m mono">${fmtM(w.walk.metres)} · ${w.walk.minutes} min</span></button></li>`).join('')}</ul>
      ${walk}
    </div>`;
}

export function paintAccess(opts = {}) {
  const box = $('#access');
  if (!box || box.hidden || !state.venue) return;
  const v = state.venue, info = accessOf(v), seat = accessSeat(opts), open = plusOpen(v);
  const place = v.meta.place || {};
  const head = `<div class="cmp-head">
      <div><p class="eyebrow">${icon('i-pin')}Getting there</p><h2>${esc(place.name || v.event?.venue || '')}</h2><p class="acc-addr mono">${esc(place.address || '')}</p></div>
      <button class="sq sq-sm" type="button" data-acc="close" aria-label="Close getting there"><svg><use href="#i-x"/></svg></button>
    </div>`;
  // Directions are Plus: a seat pass (or no pass) sees what they hold, and the way to Plus.
  if (!open) {
    box.innerHTML = `${head}
    <p class="acc-lede">Trains, buses, parking, the gates and the way to your seat, on a map of the streets round the venue and in 3D.</p>
    ${plusOffer('Directions')}`;
    return;
  }
  const rows = info ? `<dl class="acc-rows">${info.map(([k, t]) => `<div><dt>${esc(k)}</dt><dd>${esc(t)}</dd></div>`).join('')}</dl>`
    : `<p class="acc-lede">Travel notes for this venue are coming. Check the promoter’s announcement for gates and parking.</p>`;
  let way = `<div class="acc-way is-empty"><p class="cmp-tag"><b>${icon('i-seat')}</b><span>Your way in</span></p><p class="acc-lede">Tap a seat on the map to see the way in from the nearest side of the venue.</p></div>`;
  if (seat) {
    const w = wayIn(v, seat), on = routeSeat === seat.id;
    way = `<div class="acc-way"><p class="cmp-tag"><b>${icon('i-seat')}</b><span>${mapView ? 'Then, inside' : 'Your way in'}</span></p>
      <p class="cmp-name">${esc(seat.secName)}${seat.standing ? '' : ` · ${esc(seat.row)}${esc(String(seat.num))}`}</p>
      <p class="acc-walk"><b>${w.minutes}</b><span>min on foot<br>${w.metres} m from outside</span></p>
      ${open ? `<button class="btn ${on && !mapView ? 'btn-line' : 'btn-coral'} btn-sm" type="button" data-acc="${on && !mapView ? 'hide' : 'route'}" data-seat="${esc(seat.id)}">${on && !mapView ? 'Hide the route' : `Show the way to the seat in 3D ${icon('i-arrow')}`}</button>`
        : `<div class="cmp-lock">${plusOffer('The route in 3D')}</div>`}</div>`;
  }
  const hasMap = !!mapArea() && !mapFailed;
  const tabs = hasMap ? `<div class="show-seg acc-views"><button type="button" data-acc="view" data-val="map" aria-pressed="${mapView}">Streets round it</button><button type="button" data-acc="view" data-val="3d" aria-pressed="${!mapView}">The venue in 3D</button></div>` : '';
  box.innerHTML = `${head}
    ${tabs}
    ${mapView ? mapHtml(open) : ''}
    ${way}
    ${rows}
    <p class="cmp-note mono">From public information${hasMap ? ' and OpenStreetMap' : ''}, an illustration. On the day the promoter’s announcement on gates, parking and road closures comes first.</p>`;
  if (mapView) city?.setInset(mapInset());
}

export function bindAccess(opts = {}) {
  const btn = $('#t-access'), box = $('#access');
  if (!btn || !box) return;
  btn.addEventListener('click', () => {
    if (!box.hidden) { closeAccess(); return; }
    if (toUpgrade()) return;
    box.hidden = false;
    btn.setAttribute('aria-pressed', 'true');
    btn.classList.add('is-on');
    $('#stage')?.classList.add('access-open');
    paintAccess(opts);
    if (plusOpen(state.venue) && mapArea() && !mapFailed) openMap(opts);
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-acc]');
    if (!b) return;
    const act = b.dataset.acc, seat = seatOf(b.dataset.seat);
    if (act === 'close') { closeAccess(); return; }
    if (act === 'view') { if (b.dataset.val === 'map') { if (!mapView) openMap(opts); } else { closeMap(); paintAccess(opts); } return; }
    if (act === 'kind') { mapKind = b.dataset.kind; const first = city?.walks.find(w => w.kind === mapKind); if (first) { pickStop(first.id, opts); return; } }
    if (act === 'stop') { pickStop(+b.dataset.stop, opts); return; }
    if (act === 'hide') { routeSeat = null; state.scene?.setRoute(null); }
    if (act === 'route' && seat && plusOpen(state.venue)) {
      closeMap();
      routeSeat = seat.id;
      state.scene?.setRoute(wayIn(state.venue, seat).points);
      if (state.scene?.mode !== 'overview') state.scene?.backToOverview();
      else state.scene?.resetView();
    }
    paintAccess(opts);
  });
}

// ---------------------------------------------------------------- show mode

const COLORS = [
  ['#ffffff', 'White'], ['#ff4fa3', 'Pink'], ['#a259ff', 'Purple'], ['#3b82f6', 'Blue'],
  ['#2dd4bf', 'Mint'], ['#facc15', 'Yellow'], ['#ef4444', 'Red'], ['#fb923c', 'Orange'],
];
const FX = [['beat', 'On the beat'], ['steady', 'Steady'], ['wave', 'Wave']];
const KEY = 'atv-show';
const DEFAULT = { color: '#a259ff', mix: 0, fx: 'beat', ocean: 0, roam: true, stand: false };

function loadShow() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT }; }
}
const saveShow = () => { try { localStorage.setItem(KEY, JSON.stringify(state.show)); } catch { /* private mode */ } };

const showOpen = () => !!state.venue && plusOpen(state.venue);
// The performers walk the stage with Plus, unless the fan keeps them on their spots.
const roamOn = () => showOpen() && state.show?.roam !== false;
const hasBand = () => !!state.scene?.band;
// A venue with seats, where the crowd can sit or stand (show mode's Everyone).
const hasSeats = () => !!state.venue?.seats.some(s => !s.standing);

// Called on every change of the view's mode: show mode belongs to the seat.
export function showModeFor(mode) {
  const btn = $('#show-btn'), panel = $('#show-panel');
  if (!btn) return;
  state.show ||= loadShow();
  const inSeat = mode === 'seat';
  // In the tour the button is there from the start (on a computer, in the bar at the top; a
  // phone shows it in the seat's row): before the seat, a tap sits the fan down first.
  btn.hidden = !inSeat && !state.tour;
  if (mode === 'seat') state.showLights = true;
  if (!inSeat) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('is-on'); $('#stage')?.classList.remove('show-open'); }
  eyeModeFor(mode);
  // A seat pass keeps the crowd's own light sticks; Plus brings back the fan's choice.
  state.scene?.setShow(showOpen() ? { ...state.show, stand: !!state.show.stand && hasSeats() } : { ...state.show, mix: 0, ocean: 0, fx: 'beat', stand: false });
  state.scene?.setRoam(inSeat && roamOn());
  btn.classList.toggle('is-locked', !showOpen());
  $('#set-btn')?.classList.toggle('is-locked', !showOpen());
  $('#t-access')?.classList.toggle('is-locked', !showOpen());
  if (!panel.hidden) paintShow();
}

// A Plus button the fan cannot open yet shows a lock, and a tap on it never opens its panel:
// it goes to pay first. With a seat pass, to the upgrade for the difference; with none, to
// the concert's Plus page. Only while Plus is not on sale does the panel open, to say so.
function toUpgrade() {
  const v = state.venue;
  if (!v || showOpen() || !plusOnSale()) return false;
  const up = upgradable(v.meta.id);
  if (up) location.hash = `#upgrade-${up.id}`;
  else if (isConcert(v.meta.id)) location.hash = `#plus-${v.meta.id}`;
  else return false;
  return true;
}

function paintShow() {
  const panel = $('#show-panel'), o = state.show;
  // Its own close button: on a phone the panel covers the row whose Show button opened it.
  const head = `<div class="show-head set-head"><p class="eyebrow">${icon('i-show')}Show mode</p><h2>Light up the crowd</h2><button class="sq sq-sm set-x" type="button" data-show-close aria-label="Close show mode" title="Close">${icon('i-x')}</button></div>`;
  if (!showOpen()) {
    panel.innerHTML = `${head}<p class="show-lede">Your fandom's colour on every light stick round your seat, a wave round the stage, the artist walking every side of it, and the house lights up or down.</p>${plusOffer('Show mode')}`;
    return;
  }
  const seg = (group, opts, cur) => `<div class="show-seg">${opts.map(([val, label]) => `<button type="button" data-show="${group}" data-val="${esc(val)}" aria-pressed="${String(val) === String(cur)}">${esc(label)}</button>`).join('')}</div>`;
  panel.innerHTML = `${head}
    <dl class="show-rows">
      <div><dt>Colour</dt><dd>
        <div class="show-swatches">${COLORS.map(([c, n]) => `<button class="show-sw" type="button" data-show="color" data-val="${c}" style="--sw:${c}" aria-label="${n}" title="${n}" aria-pressed="${o.mix > 0 && o.color === c}"></button>`).join('')}
          <label class="show-sw show-custom" title="Your own colour"${o.mix > 0 && !COLORS.some(([c]) => c === o.color) ? ' data-on="true"' : ''}><input type="color" value="${esc(o.color)}" data-show="custom" aria-label="Your own colour"><svg aria-hidden="true"><use href="#i-plus"/></svg></label></div>
        ${seg('mix', [['0', 'Mixed'], ['1', 'All my colour']], o.mix > 0 ? '1' : '0')}</dd></div>
      <div><dt>Effect</dt><dd>${seg('fx', FX, o.fx)}</dd></div>
      ${hasSeats() ? `<div><dt>Everyone</dt><dd>${seg('stand', [['0', 'Seated'], ['1', 'Standing up']], o.stand ? '1' : '0')}</dd></div>` : ''}
      <div><dt>Crowd</dt><dd>${seg('ocean', [['0', 'As it is'], ['0.85', 'Light-stick ocean']], o.ocean > 0 ? '0.85' : '0')}</dd></div>
      ${hasBand() ? `<div><dt>Artist</dt><dd>${seg('roam', [['1', 'Walk the stage'], ['0', 'Stay put']], o.roam === false ? '0' : '1')}</dd></div>` : ''}
      <div><dt>Lights</dt><dd>${seg('lights', [['1', 'Show lights'], ['0', 'House lights up']], state.showLights === false ? '0' : '1')}</dd></div>
    </dl>`;
}

export function bindShow() {
  const btn = $('#show-btn'), panel = $('#show-panel');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (panel.hidden && toUpgrade()) return;
    if (panel.hidden && state.tour && state.scene?.mode !== 'seat') { document.dispatchEvent(new CustomEvent('atv:sit', { detail: 'show' })); return; }
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
    btn.classList.toggle('is-on', !panel.hidden);
    $('#stage')?.classList.toggle('show-open', !panel.hidden);
    if (!panel.hidden) { closeSetlist(); closeEye(); paintShow(); }
  });
  const apply = () => { saveShow(); state.scene?.setShow(state.show); paintShow(); };
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-show-close]')) { btn.click(); return; }
    const b = e.target.closest('button[data-show]');
    if (!b || !showOpen()) return;
    const { show: k, val } = b.dataset;
    if (k === 'color') Object.assign(state.show, { color: val, mix: 1 });
    if (k === 'mix') state.show.mix = +val;
    if (k === 'fx') state.show.fx = val;
    if (k === 'ocean') state.show.ocean = +val;
    if (k === 'stand') state.show.stand = val === '1';
    if (k === 'roam') { state.show.roam = val === '1'; saveShow(); state.scene?.setRoam(roamOn()); paintShow(); return; }
    if (k === 'lights') { state.showLights = val === '1'; state.scene?.setShowLights(state.showLights); paintShow(); return; }
    apply();
  });
  panel.addEventListener('input', e => {
    if (e.target.dataset.show !== 'custom' || !showOpen()) return;
    Object.assign(state.show, { color: e.target.value, mix: 1 });
    saveShow();
    state.scene?.setShow(state.show);
    e.target.parentElement.style.setProperty('--sw', e.target.value);
    e.target.parentElement.dataset.on = 'true';
  });
  panel.addEventListener('change', e => { if (e.target.dataset.show === 'custom') paintShow(); });
}

// ---------------------------------------------------------------- setlist
//
// The songs of the night in a panel of their own, from any step: a recent set from the same
// tour (setlists.js), with its source. Each song plays a short preview: Apple's own 30-second
// clip, found by the Worker (worker/preview.mjs) and played straight from Apple, with a link
// to the song on Apple Music. It comes with Plus, as it did inside show mode.

const player = { audio: null, i: -1, found: new Map() };
const setArtist = () => setlistFor(state.venue?.meta?.id)?.artist || state.venue?.meta?.title || '';

export function closeSetlist() {
  const btn = $('#set-btn'), panel = $('#set-panel');
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
  btn?.classList.remove('is-on');
  $('#stage')?.classList.remove('set-open');
}

// Stops the song: leaving the 3D venue, or another song started.
export function stopPreview() {
  const a = player.audio;
  if (a) { a.pause(); a.removeAttribute('src'); a.load(); }
  player.i = -1;
  $('#set-btn')?.classList.remove('is-playing');
  paintPlaying();
}

function paintPlaying(progress = 0) {
  $('#set-panel')?.querySelectorAll('.set-list li').forEach(li => {
    const on = +li.dataset.i === player.i, b = li.querySelector('.set-play');
    li.classList.toggle('is-playing', on);
    li.style.setProperty('--p', on ? progress : 0);
    if (!b) return;
    b.querySelector('use')?.setAttribute('href', on ? '#i-pause' : '#i-play');
    b.setAttribute('aria-label', `${on ? 'Pause' : 'Play'} a preview of ${li.dataset.title}`);
  });
}

function paintSet() {
  const panel = $('#set-panel');
  if (!panel || !state.venue) return;
  const head = `<div class="show-head set-head"><p class="eyebrow">${icon('i-music')}Setlist</p><h2>Songs of the night</h2><button class="sq sq-sm set-x" type="button" data-set-close aria-label="Close the setlist" title="Close">${icon('i-x')}</button></div>`;
  if (!showOpen()) {
    panel.innerHTML = `${head}<p class="show-lede">The songs a recent show of this tour played, in order, each with a short preview to play while you look round from your seat.</p>${plusOffer('The setlist')}`;
    return;
  }
  const l = setlistFor(state.venue.meta?.id);
  if (!l) { panel.innerHTML = `${head}<p class="show-set-note">No set from this tour has been posted yet. We add it once the tour plays its first nights.</p>`; return; }
  panel.innerHTML = `${head}
    <p class="show-set-note">Expected, from a recent show of this tour. The night's songs and order can change. Tap a song to hear a short preview.</p>
    <ol class="set-list">${l.songs.map((t, i) => {
      const f = player.found.get(`${setArtist()}|${t}`);
      return `<li data-i="${i}" data-title="${esc(t)}"${f === null ? ' class="is-none"' : ''}>
        <button class="set-play" type="button" data-song="${i}" aria-label="Play a preview of ${esc(t)}"${f === null ? ' disabled' : ''}>${icon('i-play')}</button>
        <span class="set-n">${String(i + 1).padStart(2, '0')}</span>
        <span class="set-t">${esc(t)}${f === null ? '<small>No preview</small>' : ''}</span>
        ${f?.link ? `<a class="set-am" href="${esc(f.link)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t)} on ${esc(f.from || 'Apple Music')}">${esc(f.from || 'Apple Music')}</a>` : ''}
      </li>`;
    }).join('')}</ol>
    ${l.partial ? '<p class="show-set-note">Part of the set: the rest has not been posted.</p>' : ''}
    <p class="show-set-src">Source: <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.from)}</a>. Previews courtesy of Apple Music and Deezer.</p>`;
  paintPlaying(player.audio && player.audio.duration ? player.audio.currentTime / player.audio.duration : 0);
}

async function playSong(i) {
  const l = setlistFor(state.venue?.meta?.id), title = l?.songs[i];
  if (!title) return;
  if (player.i === i && player.audio && !player.audio.paused) { player.audio.pause(); return; }
  if (player.i === i && player.audio?.src) { player.audio.play().catch(() => {}); return; }
  stopPreview();
  player.i = i;
  paintPlaying();
  const key = `${setArtist()}|${title}`;
  let f = player.found.get(key);
  if (f === undefined) {
    $(`#set-panel li[data-i="${i}"]`)?.classList.add('is-loading');
    try {
      const r = await fetch(`/api/preview?${new URLSearchParams({ artist: setArtist(), song: title })}`);
      f = r.ok ? await r.json() : r.status === 404 ? null : undefined;
    } catch { f = undefined; }
    if (f !== undefined) player.found.set(key, f);
    $(`#set-panel li[data-i="${i}"]`)?.classList.remove('is-loading');
  }
  if (player.i !== i) return;   // another song was tapped meanwhile
  if (!f?.url) { player.i = -1; paintSet(); if (f === undefined) toast('The preview could not load. Please try again.'); return; }
  if (!player.audio) {
    const a = player.audio = new Audio();
    a.preload = 'auto';
    a.addEventListener('timeupdate', () => paintPlaying(a.duration ? a.currentTime / a.duration : 0));
    a.addEventListener('play', () => $('#set-btn')?.classList.add('is-playing'));
    a.addEventListener('pause', () => { $('#set-btn')?.classList.remove('is-playing'); });
    a.addEventListener('ended', () => {
      // On to the next song with a preview, as a setlist plays.
      const next = player.i + 1, list = setlistFor(state.venue?.meta?.id);
      if (list && next < list.songs.length) playSong(next); else stopPreview();
    });
  }
  player.audio.src = f.url;
  player.audio.play().catch(() => { stopPreview(); });
  paintSet();
}

export function bindSetlist() {
  const btn = $('#set-btn'), panel = $('#set-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    if (!open) { closeSetlist(); return; }
    if (toUpgrade()) return;
    // One panel at a time beside the buttons: the setlist takes show mode's place.
    const show = $('#show-panel');
    if (show && !show.hidden) $('#show-btn')?.click();
    closeEye();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('is-on');
    $('#stage')?.classList.add('set-open');
    paintSet();
  });
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-set-close]')) { closeSetlist(); btn.focus(); return; }
    const b = e.target.closest('[data-song]');
    if (b && showOpen()) playSong(+b.dataset.song);
  });
}

// ---------------------------------------------------------------- eye height
//
// How tall you are and how tall the people a few rows in front of you are. The camera sits
// at your eye height (scene3d.js setEye); the people in front grow or shrink on their spots
// (crowd3d.js setAhead). Kept on this device for every concert. With a seat pass (no Plus)
// the view keeps the model's own heights, and the button carries a lock.

const EYE_KEY = 'atv-eye';
// The height the 3D view is modelled at (scene3d.js EYE_REF_CM; that file loads late, with three.js).
const EYE_REF_CM = 170;
const EYE_MIN = 140, EYE_MAX = 200;
const EYE_DEFAULT = { me: EYE_REF_CM, front: EYE_REF_CM, rows: 3 };
const ROWS = [[1, '1 row'], [3, '3 rows'], [5, '5 rows']];
const clampCm = v => Math.min(EYE_MAX, Math.max(EYE_MIN, Math.round(+v || EYE_REF_CM)));

function loadEye() {
  try {
    const o = { ...EYE_DEFAULT, ...JSON.parse(localStorage.getItem(EYE_KEY) || '{}') };
    return { me: clampCm(o.me), front: clampCm(o.front), rows: ROWS.some(([n]) => n === +o.rows) ? +o.rows : 3 };
  } catch { return { ...EYE_DEFAULT }; }
}
const saveEye = () => { try { localStorage.setItem(EYE_KEY, JSON.stringify(state.eye)); } catch { /* private mode */ } };
const applyEye = () => state.scene?.setEye(showOpen() ? state.eye : null);

export function closeEye() {
  const btn = $('#eye-btn'), panel = $('#eye-panel');
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
  btn?.classList.remove('is-on');
  $('#stage')?.classList.remove('eye-open');
}

// Called with show mode's on every change of mode: the button belongs to the seat.
function eyeModeFor(mode) {
  const btn = $('#eye-btn');
  if (!btn) return;
  state.eye ||= loadEye();
  btn.hidden = mode !== 'seat';
  btn.classList.toggle('is-locked', !showOpen());
  if (mode !== 'seat') closeEye();
  else applyEye();
  if (!$('#eye-panel').hidden) paintEye();
}

// What the people in front are, said in words beside the number.
const frontWord = cm => (cm <= EYE_REF_CM - 12 ? 'Shorter than most' : cm >= EYE_REF_CM + 12 ? 'Taller than most' : 'About average');

function paintEye() {
  const panel = $('#eye-panel'), o = state.eye;
  if (!panel) return;
  const head = `<div class="show-head set-head"><p class="eyebrow">${icon('i-eye')}Eye height</p><h2>See it at your height</h2><button class="sq sq-sm set-x" type="button" data-eye-close aria-label="Close eye height" title="Close">${icon('i-x')}</button></div>`;
  if (!showOpen()) {
    panel.innerHTML = `${head}<p class="show-lede">Set how tall you are and how tall the people in the rows in front of you are, and the view from your seat follows: the real view on the night, or a clearer one.</p>${plusOffer('Eye height')}`;
    return;
  }
  const slider = (key, label, val, note) => `<div><dt>${label}</dt><dd>
      <div class="eye-val"><b class="mono" data-eye-out="${key}">${val} cm</b>${note ? `<span data-eye-note="${key}">${esc(note)}</span>` : ''}</div>
      <input class="eye-range" type="range" min="${EYE_MIN}" max="${EYE_MAX}" step="1" value="${val}" data-eye="${key}" aria-label="${label}, in centimetres">
    </dd></div>`;
  const changed = o.me !== EYE_REF_CM || o.front !== EYE_REF_CM || o.rows !== 3;
  panel.innerHTML = `${head}
    <dl class="show-rows">
      ${slider('me', 'Your height', o.me, '')}
      ${slider('front', 'People in front', o.front, frontWord(o.front))}
      <div><dt>How many rows</dt><dd><div class="show-seg">${ROWS.map(([n, label]) => `<button type="button" data-eye-rows="${n}" aria-pressed="${n === o.rows}">${esc(label)}</button>`).join('')}</div></dd></div>
    </dl>
    <div class="eye-foot"><p class="show-set-note">The 3D view starts at ${EYE_REF_CM} cm.</p>${changed ? '<button class="link" type="button" data-eye-reset>Back to average</button>' : ''}</div>`;
}

export function bindEye() {
  const btn = $('#eye-btn'), panel = $('#eye-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    if (!panel.hidden) { closeEye(); return; }
    if (toUpgrade()) return;
    // One panel at a time beside the buttons.
    if (!$('#show-panel').hidden) $('#show-btn')?.click();
    closeSetlist();
    state.eye ||= loadEye();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('is-on');
    $('#stage')?.classList.add('eye-open');
    paintEye();
  });
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-eye-close]')) { closeEye(); btn.focus(); return; }
    if (!showOpen()) return;
    const r = e.target.closest('[data-eye-rows]');
    if (r) { state.eye.rows = +r.dataset.eyeRows; saveEye(); applyEye(); paintEye(); return; }
    if (e.target.closest('[data-eye-reset]')) { state.eye = { ...EYE_DEFAULT }; saveEye(); applyEye(); paintEye(); }
  });
  // Dragging moves the view as it goes; the panel repaints once let go.
  panel.addEventListener('input', e => {
    const key = e.target.dataset.eye;
    if (!key || !showOpen()) return;
    state.eye[key] = clampCm(e.target.value);
    const out = panel.querySelector(`[data-eye-out="${key}"]`), note = panel.querySelector(`[data-eye-note="${key}"]`);
    if (out) out.textContent = `${state.eye[key]} cm`;
    if (note) note.textContent = frontWord(state.eye[key]);
    applyEye();
  });
  panel.addEventListener('change', e => { if (e.target.dataset.eye) { saveEye(); paintEye(); } });
}
