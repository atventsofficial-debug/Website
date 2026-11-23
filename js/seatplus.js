// What 3D Pass Plus adds to the seat view (viewer.js): two seats side by side, and show mode.
//
// Compare: any seat card can go into the tray, two at a time. The tray measures both seats
// (compare.js) and says which sees more and what each wins on, for anyone. Sitting in either
// to look is what a Plus pass (or a demo venue) opens. A link carries the pair.
//
// Show mode: from a seat, the light sticks round you in a colour you pick (or the crowd's
// own), on the beat, steady or in a wave round the stage, a light-stick ocean, and the house
// lights up or down. It comes with Plus, and is open on the demo venues.
import { formatFee, PLUS_FEE, UPGRADE_FEE } from './rules.js';
import { canView, plusOnSale, upgradable } from './passes.js';
import { compareSeats, pairText } from './compare.js';
import { accessOf, wayIn } from './access.js';
import { $, esc, icon, state, share } from './ui.js';
import { setlistFor } from './setlists.js';

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
    ${r ? `<div class="cmp-foot">${open ? '' : `<div class="cmp-lock">${plusOffer('Sitting in both to look')}</div>`}
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

export function closeAccess() {
  const box = $('#access');
  if (!box) return;
  box.hidden = true;
  $('#t-access')?.setAttribute('aria-pressed', 'false');
  $('#t-access')?.classList.remove('is-on');
  $('#stage')?.classList.remove('access-open');
  routeSeat = null;
  state.scene?.setRoute(null);
}

export function paintAccess(opts = {}) {
  const box = $('#access');
  if (!box || box.hidden || !state.venue) return;
  const v = state.venue, info = accessOf(v), seat = accessSeat(opts), open = canView(v);
  const place = v.meta.place || {};
  const rows = info ? `<dl class="acc-rows">${info.map(([k, t]) => `<div><dt>${esc(k)}</dt><dd>${esc(t)}</dd></div>`).join('')}</dl>`
    : `<p class="acc-lede">Travel notes for this venue are coming. Check the promoter’s announcement for gates and parking.</p>`;
  let way = `<div class="acc-way is-empty"><p class="cmp-tag"><b>${icon('i-seat')}</b><span>Your way in</span></p><p class="acc-lede">Tap a seat on the map to see the way in from the nearest side of the venue.</p></div>`;
  if (seat) {
    const w = wayIn(v, seat), on = routeSeat === seat.id;
    way = `<div class="acc-way"><p class="cmp-tag"><b>${icon('i-seat')}</b><span>Your way in</span></p>
      <p class="cmp-name">${esc(seat.secName)}${seat.standing ? '' : ` · ${esc(seat.row)}${esc(String(seat.num))}`}</p>
      <p class="acc-walk"><b>${w.minutes}</b><span>min on foot<br>${w.metres} m from outside</span></p>
      ${open ? `<button class="btn ${on ? 'btn-line' : 'btn-coral'} btn-sm" type="button" data-acc="${on ? 'hide' : 'route'}" data-seat="${esc(seat.id)}">${on ? 'Hide the route' : `Show the route ${icon('i-arrow')}`}</button>`
        : `<div class="cmp-lock">${plusOffer('The route in 3D')}</div>`}</div>`;
  }
  box.innerHTML = `<div class="cmp-head">
      <div><p class="eyebrow">${icon('i-pin')}Getting there</p><h2>${esc(place.name || v.event?.venue || '')}</h2><p class="acc-addr mono">${esc(place.address || '')}</p></div>
      <button class="sq sq-sm" type="button" data-acc="close" aria-label="Close getting there"><svg><use href="#i-x"/></svg></button>
    </div>
    ${way}
    ${rows}
    <p class="cmp-note mono">From public information, an illustration. On the day the promoter’s announcement on gates, parking and road closures comes first.</p>`;
}

export function bindAccess(opts = {}) {
  const btn = $('#t-access'), box = $('#access');
  if (!btn || !box) return;
  btn.addEventListener('click', () => {
    if (!box.hidden) { closeAccess(); return; }
    box.hidden = false;
    btn.setAttribute('aria-pressed', 'true');
    btn.classList.add('is-on');
    $('#stage')?.classList.add('access-open');
    paintAccess(opts);
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-acc]');
    if (!b) return;
    const act = b.dataset.acc, seat = seatOf(b.dataset.seat);
    if (act === 'close') { closeAccess(); return; }
    if (act === 'hide') { routeSeat = null; state.scene?.setRoute(null); }
    if (act === 'route' && seat && canView(state.venue)) {
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
const DEFAULT = { color: '#a259ff', mix: 0, fx: 'beat', ocean: 0, roam: true };

function loadShow() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT }; }
}
const saveShow = () => { try { localStorage.setItem(KEY, JSON.stringify(state.show)); } catch { /* private mode */ } };

const showOpen = () => !!state.venue && canView(state.venue);
// The performers walk the stage with Plus, unless the fan keeps them on their spots.
const roamOn = () => showOpen() && state.show?.roam !== false;
const hasBand = () => !!state.scene?.band;

// Called on every change of the view's mode: show mode belongs to the seat.
export function showModeFor(mode) {
  const btn = $('#show-btn'), panel = $('#show-panel');
  if (!btn) return;
  state.show ||= loadShow();
  const inSeat = mode === 'seat';
  btn.hidden = !inSeat;
  if (mode === 'seat') state.showLights = true;
  if (!inSeat) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('is-on'); $('#stage')?.classList.remove('show-open'); }
  // A seat pass keeps the crowd's own light sticks; Plus brings back the fan's choice.
  state.scene?.setShow(showOpen() ? state.show : { ...state.show, mix: 0, ocean: 0, fx: 'beat' });
  state.scene?.setRoam(inSeat && roamOn());
  btn.classList.toggle('is-locked', !showOpen());
  if (!panel.hidden) paintShow();
}

function paintShow() {
  const panel = $('#show-panel'), o = state.show;
  const head = `<div class="show-head"><p class="eyebrow">${icon('i-lightstick')}Show mode</p><h2>Light up the crowd</h2></div>`;
  if (!showOpen()) {
    panel.innerHTML = `${head}<p class="show-lede">Your fandom's colour on every light stick round your seat, a wave round the stage, the artist walking every side of it, the songs of the night, and the house lights up or down.</p>${plusOffer('Show mode')}`;
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
      <div><dt>Crowd</dt><dd>${seg('ocean', [['0', 'As it is'], ['0.85', 'Light-stick ocean']], o.ocean > 0 ? '0.85' : '0')}</dd></div>
      ${hasBand() ? `<div><dt>Artist</dt><dd>${seg('roam', [['1', 'Walk the stage'], ['0', 'Stay put']], o.roam === false ? '0' : '1')}</dd></div>` : ''}
      <div><dt>Lights</dt><dd>${seg('lights', [['1', 'Show lights'], ['0', 'House lights up']], state.showLights === false ? '0' : '1')}</dd></div>
    </dl>
    ${setlistHtml()}`;
}

// The songs of the night: a recent set from the same tour (setlists.js), with its source.
function setlistHtml() {
  const l = setlistFor(state.venue?.meta?.id);
  const top = `<p class="eyebrow">${icon('i-music')}Setlist</p>`;
  if (!l) return `<section class="show-set">${top}<p class="show-set-note">No set from this tour has been posted yet. We add it once the tour plays its first nights.</p></section>`;
  return `<section class="show-set">${top}
    <p class="show-set-note">Expected, from a recent show of this tour. The night's songs and order can change.</p>
    <ol class="show-set-list">${l.songs.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
    ${l.partial ? '<p class="show-set-note">Part of the set: the rest has not been posted.</p>' : ''}
    <p class="show-set-src">Source: <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.from)}</a></p>
  </section>`;
}

export function bindShow() {
  const btn = $('#show-btn'), panel = $('#show-panel');
  if (!btn) return;
  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
    btn.classList.toggle('is-on', !panel.hidden);
    $('#stage')?.classList.toggle('show-open', !panel.hidden);
    if (!panel.hidden) paintShow();
  });
  const apply = () => { saveShow(); state.scene?.setShow(state.show); paintShow(); };
  panel.addEventListener('click', e => {
    const b = e.target.closest('button[data-show]');
    if (!b || !showOpen()) return;
    const { show: k, val } = b.dataset;
    if (k === 'color') Object.assign(state.show, { color: val, mix: 1 });
    if (k === 'mix') state.show.mix = +val;
    if (k === 'fx') state.show.fx = val;
    if (k === 'ocean') state.show.ocean = +val;
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
