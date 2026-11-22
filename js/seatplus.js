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
import { $, esc, icon, state, share } from './ui.js';

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
  const head = `<div class="cmp-head"><p class="eyebrow">${icon('i-compare')}Compare seats</p>
    <button class="sq sq-sm" type="button" data-cmp="close" aria-label="Close compare"><svg><use href="#i-x"/></svg></button></div>`;
  const col = (s, i) => `<div class="cmp-seat${seats.length === 2 && i === 0 ? ' is-a' : ' is-b'}"><b>${'AB'[i]}</b><span>${esc(seatName(s))}</span><small>${esc(v.catById[s.cat]?.name || '')}</small>
    ${open ? `<button class="btn btn-line btn-sm" type="button" data-cmp="sit" data-seat="${esc(s.id)}">${icon('i-eye')}Sit here</button>` : ''}
    <button class="cmp-x" type="button" data-cmp="drop" data-seat="${esc(s.id)}" aria-label="Take ${esc(seatName(s))} out">${icon('i-x')}</button></div>`;
  if (seats.length < 2) {
    box.innerHTML = `${head}<div class="cmp-seats">${col(seats[0], 0)}<div class="cmp-seat is-empty"><b>B</b><span>Pick a second seat on the map, then tap Compare on its card.</span></div></div>`;
    return;
  }
  const r = compareSeats(v, seats[0], seats[1]), [a, b] = r.stats;
  const row = (label, va, vb, better) => `<tr><th>${label}</th><td class="${better === 0 ? 'is-win' : ''}">${va}</td><td class="${better === 1 ? 'is-win' : ''}">${vb}</td></tr>`;
  const lower = (x, y, eps) => (Math.abs(x - y) < eps ? -1 : x < y ? 0 : 1);
  const price = s => (s.price == null ? '—' : fmtRp(s.price));
  const verdict = r.best < 0 ? 'A close call: both seats see the stage about as well.'
    : `Seat ${'AB'[r.best]} sees more of the show.`;
  const wins = r.wins.map((w, i) => (w.length ? `<li><b>${'AB'[i]}</b> ${esc(w.join(' · '))}</li>` : '')).join('');
  box.innerHTML = `${head}<div class="cmp-seats">${seats.map(col).join('')}</div>
    <table class="cmp-table">
      ${row('View score', `${r.score[0]}<small>/100</small>`, `${r.score[1]}<small>/100</small>`, r.best)}
      ${row('To the stage', `${Math.round(a.dist)} m`, `${Math.round(b.dist)} m`, lower(a.dist, b.dist, 2))}
      ${a.round ? '' : row('Off centre', `${Math.round(a.side)}°`, `${Math.round(b.side)}°`, lower(a.side, b.side, 8))}
      ${row('Eye height', `${a.height.toFixed(1)} m`, `${b.height.toFixed(1)} m`, -1)}
      ${row('Price', price(a), price(b), a.price != null && b.price != null ? lower(a.price, b.price, 1) : -1)}
    </table>
    <p class="cmp-verdict">${esc(verdict)}${r.value >= 0 && r.value !== r.best ? ` Seat ${'AB'[r.value]} is the better value for the price.` : ''}</p>
    ${wins ? `<ul class="cmp-wins">${wins}</ul>` : ''}
    <div class="cmp-actions"><button class="btn btn-line btn-sm" type="button" data-cmp="share">${icon('i-share')}Share this pair</button>
      ${open ? '' : plusOffer('Sitting in both to look')}</div>
    <p class="cmp-note">Measured from the 3D model, an illustration of the venue. The real layout on the day may differ.</p>`;
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

// ---------------------------------------------------------------- show mode

const COLORS = [
  ['#ffffff', 'White'], ['#ff4fa3', 'Pink'], ['#a259ff', 'Purple'], ['#3b82f6', 'Blue'],
  ['#2dd4bf', 'Mint'], ['#facc15', 'Yellow'], ['#ef4444', 'Red'], ['#fb923c', 'Orange'],
];
const FX = [['beat', 'On the beat'], ['steady', 'Steady'], ['wave', 'Wave']];
const KEY = 'atv-show';
const DEFAULT = { color: '#a259ff', mix: 0, fx: 'beat', ocean: 0 };

function loadShow() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT }; }
}
const saveShow = () => { try { localStorage.setItem(KEY, JSON.stringify(state.show)); } catch { /* private mode */ } };

const showOpen = () => !!state.venue && canView(state.venue);

// Called on every change of the view's mode: show mode belongs to the seat.
export function showModeFor(mode) {
  const btn = $('#show-btn'), panel = $('#show-panel');
  if (!btn) return;
  state.show ||= loadShow();
  const inSeat = mode === 'seat';
  btn.hidden = !inSeat;
  if (mode === 'seat') state.showLights = true;
  if (!inSeat) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); $('#stage')?.classList.remove('show-open'); }
  // A seat pass keeps the crowd's own light sticks; Plus brings back the fan's choice.
  state.scene?.setShow(showOpen() ? state.show : { ...state.show, mix: 0, ocean: 0, fx: 'beat' });
  btn.classList.toggle('is-locked', !showOpen());
  if (!panel.hidden) paintShow();
}

function paintShow() {
  const panel = $('#show-panel'), o = state.show;
  if (!showOpen()) {
    panel.innerHTML = `<p class="eyebrow">${icon('i-lightstick')}Show mode</p>
      <p class="show-lede">Light up the crowd round your seat in your fandom's colour, set the sticks to a wave and turn the house lights up or down.</p>
      ${plusOffer('Show mode')}`;
    return;
  }
  const chip = (group, val, label, on) => `<button class="show-chip" type="button" data-show="${group}" data-val="${esc(val)}" aria-pressed="${on}">${esc(label)}</button>`;
  panel.innerHTML = `<p class="eyebrow">${icon('i-lightstick')}Show mode</p>
    <div class="show-group"><p>Light-stick colour</p>
      <div class="show-swatches">${COLORS.map(([c, n]) => `<button class="show-sw" type="button" data-show="color" data-val="${c}" style="--sw:${c}" aria-label="${n}" title="${n}" aria-pressed="${o.mix > 0 && o.color === c}"></button>`).join('')}
        <label class="show-sw show-custom" title="Your own colour" style="--sw:${esc(o.color)}"><input type="color" value="${esc(o.color)}" data-show="custom" aria-label="Your own colour"></label></div>
      <div class="show-chips">${chip('mix', '0', 'Mixed colours', o.mix === 0)}${chip('mix', '1', 'Everyone in my colour', o.mix > 0)}</div></div>
    <div class="show-group"><p>Effect</p><div class="show-chips">${FX.map(([v, l]) => chip('fx', v, l, o.fx === v)).join('')}</div></div>
    <div class="show-group"><p>Crowd</p><div class="show-chips">${chip('ocean', '0', 'As it is', !o.ocean)}${chip('ocean', '0.85', 'Light-stick ocean', o.ocean > 0)}</div></div>
    <div class="show-group"><p>Lights</p><div class="show-chips">${chip('lights', '1', 'Show lights', state.showLights !== false)}${chip('lights', '0', 'House lights up', state.showLights === false)}</div></div>`;
}

export function bindShow() {
  const btn = $('#show-btn'), panel = $('#show-panel');
  if (!btn) return;
  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
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
    if (k === 'lights') { state.showLights = val === '1'; state.scene?.setShowLights(state.showLights); paintShow(); return; }
    apply();
  });
  panel.addEventListener('input', e => {
    if (e.target.dataset.show !== 'custom' || !showOpen()) return;
    Object.assign(state.show, { color: e.target.value, mix: 1 });
    saveShow();
    state.scene?.setShow(state.show);
    e.target.parentElement.style.setProperty('--sw', e.target.value);
  });
  panel.addEventListener('change', e => { if (e.target.dataset.show === 'custom') paintShow(); });
}
