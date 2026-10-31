// The home page hero: one slide per show on sale. One concert arena fills it in 3D, seen
// from the seat in the middle of the audience; each slide puts its show's poster on the stage
// screens, and a card at the bottom gives the facts and the way to buy. Slides move on by themselves
// (with a pause button), or with the arrows, the tabs, a swipe or the arrow keys.
import { getEvent, placeOf, minPrice, allSoldOut } from './events.js';
import { crowdSeats, heroSeat, formatRpShort } from './layouts.js';
import { IMAGES, cover } from './media.js';
import { whenOf } from './when.js';
import { buyLink } from './passes.js';
import { onSale, featured, datesOf, upcoming, timesLine } from './pages.js';
import { loadScene3d } from './viewer.js';
import { $, $$, esc, icon, QUALITY, countdownHtml, tickCountdowns } from './ui.js';

// How long a slide stays before the next; how wide the view stays on a tall phone; how
// far above the seat's eye height the camera is (a phone held up, over the heads in front);
// how strong the light beams are, so the poster on the screens reads through them.
const SLIDE_SECONDS = 9;
const MIN_ACROSS = 54;
const LIFT = 0.45;
const BEAMS = 0.45;
const still = matchMedia('(prefers-reduced-motion: reduce)');

// `list`: the slides, and `key` the shows they were drawn for. `run` lives from startHero
// to stopHero and holds the 3D scene. `held`: why the slides are not moving on (the
// visitor paused them, is pointing at the card, is using the controls, has scrolled away
// or switched tabs).
const hero = { list: [], key: '', i: 0, run: null, bound: false, held: new Set() };

// One slide per show, the featured one first; a show with several nights is one slide.
function shows() {
  const first = featured();
  const rest = onSale().filter((e, i, all) => e.title !== first.title && all.findIndex(x => x.title === e.title) === i);
  return [first, ...rest];
}

// ---------------------------------------------------------------- the card

const MON = m => m[0] + m.slice(1).toLowerCase();

// "Tue, 3 Nov 2026 · times to be announced", or "26, 27 & 29 Dec 2026 · 3 nights".
function datesLine(list) {
  if (list.length === 1) return `${whenOf(list[0]).long} · ${timesLine(list[0])}`;
  const d = list.map(e => whenOf(e).pill.split(' '));
  if (d.every(x => x[1] === d[0][1] && x[2] === d[0][2])) {
    const days = d.map(x => x[0]);
    return `${days.slice(0, -1).join(', ')} & ${days.at(-1)} ${MON(d[0][1])} ${d[0][2]} · ${list.length} nights`;
  }
  return `${d.map(x => `${x[0]} ${MON(x[1])}`).join(', ')} ${d.at(-1)[2]} · ${list.length} nights`;
}

function card(e, n) {
  const v = placeOf(e);
  // Only when nothing is on sale does the hero show a concert that has taken place.
  const nights = datesOf(e).filter(upcoming), live = nights.length > 0;
  const dates = live ? nights : [e];
  const from = Math.min(...dates.map(x => minPrice(x.id) ?? Infinity));
  const gone = dates.every(allSoldOut);
  const art = IMAGES[e.image];
  return `<article class="hs-card" role="group" aria-roledescription="slide" aria-label="${n + 1} of ${hero.list.length}: ${esc(e.title)}">
    <div class="hs-info">
      <p class="eyebrow">${!live ? 'Taken place' : gone ? 'Sold out on tiket.com' : 'On sale on tiket.com'} · ${esc(v.city)}</p>
      <h2 class="hs-title">${esc(e.title)}</h2>
      <p class="hs-sub">${esc(e.subtitle.replace(/ · Day \d+$/, ''))}</p>
      <ul class="hs-facts">
        <li>${icon('i-cal')}<span>${esc(datesLine(dates))}</span></li>
        <li>${icon('i-pin')}<span>${esc(v.name)}</span></li>
      </ul>
      ${art ? `<p class="hs-credit">On the screens: ${esc(art.credit)}</p>` : ''}
    </div>
    <div class="hs-buy">
      ${live ? countdownHtml(new Date(whenOf(dates[0]).ms).toISOString()) : ''}
      <p class="hs-price"><small>${gone ? 'Sold out, as listed' : from < Infinity ? 'From, on tiket.com' : 'Tickets on'}</small><b>${from < Infinity ? formatRpShort(from) : 'tiket.com'}</b></p>
      <div class="row-btns">
        ${live ? buyLink(e, `${gone ? 'Check tiket.com' : 'Buy on tiket.com'} ${icon('i-out')}`) : ''}
        <a class="btn btn-line" href="#event-${esc(e.id)}"><span class="hs-wide">Concert details</span><span class="hs-narrow">Details</span></a>
      </div>
      ${live && !gone ? '<p class="hs-perk">Same price as on tiket.com, plus your own seat in 3D.</p>' : ''}
    </div>
  </article>`;
}

// ---------------------------------------------------------------- painting a slide

// `dir`: 1 when the slide came from the right (next), -1 from the left, 0 without motion.
function paint(dir = 0) {
  const e = hero.list[hero.i];
  const stack = $('#hs-stack');
  const old = [...stack.children].filter(c => !c.classList.contains('is-gone'));
  stack.insertAdjacentHTML('beforeend', card(e, hero.i));
  const fresh = stack.lastElementChild;
  if (dir && !still.matches) {
    // The old card leaves the way the new one pushes it; the new one slides in behind it.
    // While it fades, it is out of reach of the keyboard and screen readers.
    old.forEach(c => {
      c.style.setProperty('--shift', `${-dir * 56}px`);
      c.classList.add('is-gone');
      c.inert = true;
      setTimeout(() => c.remove(), 700);
    });
    fresh.style.setProperty('--shift', `${dir * 56}px`);
    fresh.classList.add('is-new');
    requestAnimationFrame(() => requestAnimationFrame(() => fresh.classList.remove('is-new')));
  } else old.forEach(c => c.remove());
  tickCountdowns();

  $$('#hs-tabs .hs-tab').forEach((t, k) => {
    t.classList.toggle('is-on', k === hero.i);
    t.classList.toggle('is-done', k < hero.i);
    if (k === hero.i) t.setAttribute('aria-current', 'true');
    else t.removeAttribute('aria-current');
  });
  $$('#hs-backs .hs-back').forEach((b, k) => b.classList.toggle('is-on', k === hero.i));
  $('#hero-canvas').setAttribute('aria-label', `3D view of a concert arena from the middle of the audience, with the poster for ${e.title} on the stage screens`);
  restartTimer();
}

function go(i, dir) {
  const n = hero.list.length;
  const next = ((i % n) + n) % n;
  if (next === hero.i || !n) return;
  hero.i = next;
  paint(dir);
  // Drawing the poster for the screens holds the page for a moment. It waits until the card
  // has started to move, which the browser then finishes on its own.
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(showVenue)));
}
const step = d => go(hero.i + d, d);

// ---------------------------------------------------------------- moving on by itself

// The active tab's bar fills over SLIDE_SECONDS (a CSS animation); when it ends, the next
// slide comes. Holding the slides pauses the animation, so the bar shows how long is left.
function restartTimer() {
  const bar = $('#hs-tabs .hs-tab.is-on .hs-bar i');
  if (!bar) return;
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = '';
}

function hold(reason, on) {
  if (on) hero.held.add(reason);
  else hero.held.delete(reason);
  const el = $('#home-hero');
  el.classList.toggle('is-held', hero.held.size > 0);
  const paused = hero.held.has('pause');
  el.classList.toggle('is-auto', !paused);
  const btn = $('#hs-play');
  btn.setAttribute('aria-label', paused ? 'Play the slideshow' : 'Pause the slideshow');
  btn.innerHTML = icon(paused ? 'i-play' : 'i-pause');
  // Announce slide changes only while they are not moving by themselves.
  $('#hs-stack').setAttribute('aria-live', paused ? 'polite' : 'off');
}

// The backdrops and the tabs, one a show; drawn again only when the shows on sale change.
// A backdrop is the poster, sharp where the stage will be, over a blurred copy of itself:
// it shows until the 3D is ready, while it changes venue, and instead of it for data savers.
function build() {
  $('#hs-backs').innerHTML = hero.list.map(e => {
    const src = esc(cover(e.image || e.photo, e.venue).src);
    return `<div class="hs-back"><img class="hs-blur" src="${src}" alt="" decoding="async"><img class="hs-poster" src="${src}" alt="" decoding="async"></div>`;
  }).join('');
  $('#hs-tabs').innerHTML = hero.list.map((e, k) => `<li><button class="hs-tab" type="button" data-hs-go="${k}" aria-label="${esc(e.title)}">
      <span class="hs-tab-t"><b>${String(k + 1).padStart(2, '0')}</b>${esc(e.title)}</span><span class="hs-bar"><i></i></span></button></li>`).join('');
  $('#home-hero .hs-nav').hidden = hero.list.length < 2;
}

function bind() {
  if (hero.bound) return;
  hero.bound = true;
  const el = $('#home-hero');
  el.style.setProperty('--hs-seconds', `${SLIDE_SECONDS}s`);

  el.addEventListener('click', ev => {
    const b = ev.target.closest('[data-hs-go], [data-hs-step]');
    if (b?.dataset.hsGo) go(+b.dataset.hsGo, Math.sign(+b.dataset.hsGo - hero.i));
    else if (b) step(+b.dataset.hsStep);
  });
  $('#hs-play').addEventListener('click', () => hold('pause', !hero.held.has('pause')));
  $('#hs-tabs').addEventListener('animationend', ev => { if (ev.animationName === 'hs-fill') step(1); });
  el.addEventListener('keydown', ev => {
    if (!ev.target.closest('.hs-nav') || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    ev.preventDefault();
    step(ev.key === 'ArrowLeft' ? -1 : 1);
    if (ev.target.closest('.hs-tab')) $('#hs-tabs .hs-tab.is-on')?.focus();
  });
  // Pointing at the card or the controls, or reaching them with the keyboard, holds the
  // slide. A click focuses a button too, but only keyboard focus (focus-visible) holds.
  for (const part of [$('#hs-stack'), el.querySelector('.hs-nav')]) {
    part.addEventListener('pointerenter', ev => { if (ev.pointerType === 'mouse') hold('point', true); });
    part.addEventListener('pointerleave', () => hold('point', false));
  }
  el.addEventListener('focusin', ev => hold('focus', ev.target.matches(':focus-visible')));
  el.addEventListener('focusout', ev => { if (!el.contains(ev.relatedTarget)) hold('focus', false); });
  // A sideways swipe anywhere on the hero; vertical moves still scroll the page.
  let from = null;
  el.addEventListener('pointerdown', ev => { from = ev.pointerType === 'mouse' || ev.target.closest('a, button') ? null : [ev.clientX, ev.clientY]; });
  el.addEventListener('pointercancel', () => { from = null; });
  el.addEventListener('pointerup', ev => {
    if (!from) return;
    const dx = ev.clientX - from[0], dy = ev.clientY - from[1];
    from = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
  });
  new IntersectionObserver(([e]) => hold('away', !e.isIntersecting)).observe(el);
  // A new card of another height, or a resized window, moves the open part of the hero.
  const sizes = new ResizeObserver(aim);
  sizes.observe($('#hs-stack'));
  sizes.observe($('#home-hero .hs-stage'));
  document.addEventListener('visibilitychange', () => hold('hidden', document.hidden));
  hold('pause', still.matches);
}

// ---------------------------------------------------------------- 3D

// The open part of the hero, between the site's nav and the card (or, on a phone, the
// controls over the bottom of the 3D). The poster backdrop is centred in it, and the 3D
// picture moves up so the stage sits in its middle.
function aim() {
  const stage = $('#home-hero .hs-stage'), c = stage.getBoundingClientRect();
  if (!c.height) return;
  const nav = $('#home-hero .hs-nav');
  const top = Math.max(c.top, $('#nav').getBoundingClientRect().bottom);
  const bottom = Math.min(c.bottom, $('#hs-stack').getBoundingClientRect().top, nav.hidden ? Infinity : nav.getBoundingClientRect().top);
  const mid = (top + bottom) / 2 - c.top;
  stage.style.setProperty('--hs-mid', `${Math.round(mid)}px`);
  stage.style.setProperty('--hs-open', `${Math.round(Math.max(0, bottom - top))}px`);
  hero.run?.scene?.setShift(Math.min(0.3, Math.max(0, 0.5 - mid / c.height)));
}

// The arena every slide is seen in: the concert demo, its boards showing the site's name.
let arena = null;
const stageVenue = () => arena ||= { ...getEvent('demo-concert'), branding: { wall: 'SEATSIGHT', sub: 'LIVE IN 3D', band: ['SEATSIGHT', 'SEE YOUR SEAT IN 3D', 'BIG CONCERTS ON TIKET.COM', 'LIVE IN 3D'] } };

// The arena, built once with the current show's poster on its screens; after that a new
// slide only changes the poster. Drawn cheaply (medium quality at most, 30 fps), and not at
// all for visitors saving data: the poster backdrop stays.
async function showVenue() {
  const run = hero.run;
  if (!run || navigator.connection?.saveData) return;
  if (!run.built) {
    let SeatScene;
    try { ({ SeatScene } = await loadScene3d()); } catch { return; }
    if (hero.run !== run || run.built) return;
    // Without motion: no glide into the seat and no wandering gaze, just the view.
    run.scene = new SeatScene($('#hero-canvas'), { interactive: false, labels: false, quality: QUALITY, maxLevel: 1, fps: 30, drift: still.matches ? 0 : 0.05 });
    aim();
    const venue = stageVenue();
    run.poster = hero.list[hero.i];
    run.built = run.scene.load({ ...venue, meta: run.poster }, crowdSeats(venue)).then(ok => {
      if (ok && hero.run === run) run.scene.showFrom(heroSeat(venue), { look: venue.hero?.look, fov: venue.hero?.fov, lift: LIFT, fit: MIN_ACROSS, beams: BEAMS, dur: still.matches ? 0 : 2.6 });
      return ok;
    });
  }
  if (!await run.built || hero.run !== run) return;
  const show = hero.list[hero.i];
  if (run.poster !== show) {
    run.poster = show;
    run.scene.setPoster(show);
  }
}

export function startHero() {
  const list = shows(), key = list.map(e => e.id).join();
  if (key !== hero.key) {
    hero.list = list;
    hero.key = key;
    hero.i = 0;
    build();
  }
  bind();
  paint();
  if (!hero.run) {
    hero.run = {};
    showVenue();
  }
}

export function stopHero() {
  if (!hero.run) return;
  hero.run.scene?.dispose();
  hero.run = null;
}
