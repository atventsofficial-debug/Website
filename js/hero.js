// The home page hero: one slide per show on sale. One concert arena fills it, in a photo
// taken from the middle of the audience; each slide puts its show's poster on the stage
// screens (herophoto.js), and a card at the bottom gives the facts and the way to buy. Slides move on by themselves
// (with a pause button), or with the arrows, the tabs, a swipe or the arrow keys.
import { formatFee } from './rules.js';
import { placeOf, minPrice, sellerOf, onTiket, saleInfo, typeOf } from './events.js';
import { formatRpShort } from './layouts.js';
import { IMAGES, cover, srcsetOf } from './media.js';
import { whenOf, isOver } from './when.js';
import { buyLink } from './passes.js';
import { onSale, featured, datesOf, upcoming, timesLine } from './pages.js';
import { HeroPhoto, FlatHeroPhoto, preloadPoster } from './herophoto.js';
import { $, $$, esc, icon, countdownHtml, tickCountdowns } from './ui.js';

// How long a slide stays before the next.
const SLIDE_SECONDS = 9;
const still = matchMedia('(prefers-reduced-motion: reduce)');
// Phones and tablets get the arena drawn flat (herophoto.js, FlatHeroPhoto): the layered
// version needs more graphics memory than their in-app browsers allow.
const light = () => matchMedia('(max-width: 760px), (pointer: coarse)').matches;

// `list`: the slides, and `key` the shows they were drawn for. `run` lives from startHero
// to stopHero and holds the arena photo. `held`: why the slides are not moving on (the
// visitor paused them, is pointing at the card, is using the controls, has scrolled away
// or switched tabs).
const hero = { list: [], key: '', i: 0, run: null, bound: false, held: new Set() };

// One slide per concert, the featured one first; a show with several nights is one slide.
// Matches, fights and films stay off it: the hero is a concert arena with the show on its screens.
// A show leaves the hero the moment it is over (not the day after, as on the lists), so the
// hero always leads with what is coming up.
function shows() {
  const concerts = onSale().filter(e => typeOf(e) === 'concert' && !isOver(e));
  const lead = featured();
  const first = typeOf(lead) === 'concert' && !isOver(lead) ? lead : concerts[0] || lead;
  const rest = concerts.filter((e, i, all) => e.title !== first.title && all.findIndex(x => x.title === e.title) === i);
  return [first, ...rest].slice(0, 6);
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
  const art = IMAGES[e.image];
  const seller = sellerOf(e), sale = saleInfo(e);
  // The countdown runs to the opening of the ticket sale; once open, the card says since when.
  const saleBox = !live ? ''
    : sale?.soon ? `<div class="hs-sale"><small>Ticket sale opens in</small>${countdownHtml(new Date(sale.ms).toISOString(), 'Time to the ticket sale')}</div>`
      : `<p class="hs-price hs-sale"><small>Ticket sale</small><b>${sale ? `Open since ${esc(sale.date)}` : 'Open now'}</b></p>`;
  return `<article class="hs-card" role="group" aria-roledescription="slide" aria-label="${n + 1} of ${hero.list.length}: ${esc(e.title)}">
    <div class="hs-body"><div class="hs-info">
      <p class="eyebrow">${!live ? 'Taken place' : `On sale on ${esc(seller)}`} · ${esc(v.city)}</p>
      <h2 class="hs-title">${esc(e.title)}</h2>
      <p class="hs-sub">${esc(e.subtitle.replace(/ · Day \d+$/, ''))}</p>
      <ul class="hs-facts">
        <li>${icon('i-cal')}<span>${esc(datesLine(dates))}</span></li>
        <li>${icon('i-pin')}<span>${esc(v.name)}</span></li>
      </ul>
      ${art ? `<p class="hs-credit">On the screens: ${esc(art.credit)}</p>` : ''}
    </div>
    <div class="hs-buy">
      ${saleBox}
      <p class="hs-price"><small>${from < Infinity ? `From, on ${esc(seller)}` : 'Tickets on'}</small><b>${from < Infinity ? formatRpShort(from) : esc(seller)}</b></p>
      <div class="row-btns">
        ${live ? `<a class="btn btn-coral" href="#unlock-${esc(e.id)}"><span class="hs-wide">See my seat in 3D</span><span class="hs-narrow">My seat in 3D</span> ${icon('i-arrow')}</a>` : ''}
        <a class="btn btn-line" href="#event-${esc(e.id)}"><span class="hs-wide">Concert details</span><span class="hs-narrow">Details</span></a>
      </div>
      ${live ? `<p class="hs-perk">The view from your seat, ${formatFee()}. Tickets: ${buyLink(e, `${esc(seller)} ${icon('i-out')}`, 'u hs-seller')}</p>` : ''}
    </div></div>
  </article>`;
}

// ---------------------------------------------------------------- painting a slide

// The card stays where it is; only what is on it changes: the new content fades in where
// the old was, and the card eases to the new content's height.
// `dir`: how the visitor moved (1 next, -1 back), 0 for a jump without motion.
function paint(dir = 0) {
  const e = hero.list[hero.i];
  const stack = $('#hs-stack');
  const shell = stack.querySelector('.hs-card');
  const tpl = document.createElement('template');
  tpl.innerHTML = card(e, hero.i);
  const fresh = tpl.content.firstElementChild;
  if (!shell) stack.append(fresh);
  else {
    shell.setAttribute('aria-label', fresh.getAttribute('aria-label'));
    const body = fresh.querySelector('.hs-body');
    if (dir && !still.matches) {
      body.classList.add('is-new');
      settle(shell, () => shell.replaceChildren(body));
    } else shell.replaceChildren(body);
  }
  tickCountdowns();

  $$('#hs-tabs .hs-tab').forEach((t, k) => {
    t.classList.toggle('is-on', k === hero.i);
    t.classList.toggle('is-done', k < hero.i);
    if (k === hero.i) t.setAttribute('aria-current', 'true');
    else t.removeAttribute('aria-current');
  });
  $$('#hs-backs .hs-back').forEach((b, k) => b.classList.toggle('is-on', k === hero.i));
  $('#hero-canvas').setAttribute('aria-label', `A concert arena seen from the middle of the audience, with the poster for ${e.title} on the stage screens`);
  restartTimer();
}

// Runs `change` on the card, then eases the card from its old height to its new one.
function settle(el, change) {
  const from = el.getBoundingClientRect().height;
  el.style.transition = 'none';
  el.style.height = '';
  change();
  const to = el.getBoundingClientRect().height;
  if (Math.abs(to - from) < 1) return;
  el.style.height = `${from}px`;
  el.getBoundingClientRect();
  el.style.transition = 'height 0.35s ease';
  el.style.height = `${to}px`;
  clearTimeout(el.settling);
  el.settling = setTimeout(() => { el.style.height = ''; el.style.transition = ''; }, 400);
}

function go(i, dir) {
  const n = hero.list.length;
  const next = ((i % n) + n) % n;
  if (next === hero.i || !n) return;
  hero.i = next;
  const backs = $$('#hs-backs .hs-back');
  fillBacks(backs[next]);
  // The slide after this one gets its backdrop and poster now, while this one shows.
  const after = (next + (dir < 0 ? -1 : 1) + n) % n;
  (window.requestIdleCallback || setTimeout)(() => {
    fillBacks(backs[after]);
    if (hero.run?.preloaded) preloadPoster(hero.list[after]);
  });
  // The card and the picture change together: while the arena is up, the slide waits (a
  // moment at most) for its poster, so the card never shows one show over another's picture.
  const turn = hero.turn = {};
  const ready = hero.run?.ready ? preloadPoster(hero.list[next]) : null;
  const show = () => {
    if (hero.turn !== turn) return;
    paint(dir);
    // Drawing the poster for the screens holds the page for a moment. It waits until the new
    // content has started to fade in, which the browser then finishes on its own.
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(showArena)));
  };
  if (ready) Promise.race([ready, new Promise(r => setTimeout(r, 900))]).then(show);
  else show();
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
  // The arena's light and camera stop only while nobody can see them.
  el.classList.toggle('is-away', hero.held.has('away') || hero.held.has('hidden'));
  const paused = hero.held.has('pause');
  el.classList.toggle('is-auto', !paused);
  const btn = $('#hs-play');
  if (btn) {
    btn.setAttribute('aria-label', paused ? 'Play the slideshow' : 'Pause the slideshow');
    btn.innerHTML = icon(paused ? 'i-play' : 'i-pause');
  }
  // Announce slide changes only while they are not moving by themselves.
  $('#hs-stack').setAttribute('aria-live', paused ? 'polite' : 'off');
}

// The backdrops and the tabs, one a show; drawn again only when the shows on sale change.
// A backdrop is the poster, sharp where the stage will be, over a blurred copy of itself:
// it shows until the arena photo is ready, and instead of it for data savers.
const fillBacks = root => {
  for (const img of root?.querySelectorAll('img[data-src]') || []) {
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    img.src = img.dataset.src;
    img.removeAttribute('data-src'); img.removeAttribute('data-srcset');
  }
};
function build() {
  // Only the slide on show fetches its poster with the page; the others follow once the page
  // has loaded, or the moment a visitor turns to them. A phone takes the 640 px file; the
  // blurred copy names the same files and size, so it reuses the poster's download.
  $('#hs-backs').innerHTML = hero.list.map((e, k) => {
    const c = cover(e.image || e.photo, e.venue), set = srcsetOf(c), now = k === hero.i, at = now ? '' : 'data-';
    const files = `${at}src="${esc(c.src)}"${set ? ` ${at}srcset="${esc(set)}" sizes="min(600px, 76vw)"` : ''}`;
    return `<div class="hs-back"><img class="hs-blur" ${files} alt="" decoding="async"><img class="hs-poster" ${files} alt="" decoding="async"${now ? ' fetchpriority="high"' : ''}></div>`;
  }).join('');
  // The backdrops either side once the page has loaded; the others as the slides turn (go).
  const n = hero.list.length, backs = () => $$('#hs-backs .hs-back');
  const rest = () => (window.requestIdleCallback || setTimeout)(() => [1, -1].forEach(d => fillBacks(backs()[(hero.i + d + n) % n])));
  if (document.readyState === 'complete') rest(); else addEventListener('load', rest, { once: true });
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
  $('#hs-play')?.addEventListener('click', () => hold('pause', !hero.held.has('pause')));
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

// ---------------------------------------------------------------- the arena

// The open part of the hero, between the site's nav and the card (or, on a phone, the
// controls over the bottom of the picture). The poster backdrop is centred in it, and the
// arena photo is placed so its screens sit whole in it.
function aim() {
  const stage = $('#home-hero .hs-stage'), c = stage.getBoundingClientRect();
  if (!c.height) return;
  const nav = $('#home-hero .hs-nav');
  const top = Math.max(c.top, $('#nav').getBoundingClientRect().bottom);
  const bottom = Math.min(c.bottom, $('#hs-stack').getBoundingClientRect().top, nav.hidden ? Infinity : nav.getBoundingClientRect().top);
  const mid = (top + bottom) / 2 - c.top;
  stage.style.setProperty('--hs-mid', `${Math.round(mid)}px`);
  stage.style.setProperty('--hs-open', `${Math.round(Math.max(0, bottom - top))}px`);
  hero.run?.photo?.layout(c.width, c.height, top - c.top, bottom - c.top);
}

// The arena photo, put up once with the current show's poster on its screens; after that a
// new slide only changes the poster. Not at all for visitors saving data: the poster
// backdrop stays.
async function showArena() {
  const run = hero.run;
  if (!run || navigator.connection?.saveData) return;
  if (!run.ready) {
    run.photo = new (light() ? FlatHeroPhoto : HeroPhoto)($('#hero-canvas'));
    run.poster = hero.list[hero.i];
    aim();
    run.ready = Promise.all([run.photo.setPoster(run.poster), run.photo.load()]).then(([, ok]) => ok);
  }
  if (!await run.ready || hero.run !== run) return;
  const show = hero.list[hero.i];
  if (run.poster !== show) {
    run.poster = show;
    run.photo.setPoster(show);
  }
  // The posters either side, ready before the visitor swipes. The rest follow one slide
  // ahead as the slides turn (go): fetching all twenty at once took the phone's bandwidth
  // and memory while the page was still opening.
  const n = hero.list.length;
  if (!run.preloaded) {
    run.preloaded = true;
    [1, -1].map(d => hero.list[(hero.i + d + n) % n]).reduce((p, e) => p.then(() => preloadPoster(e)), Promise.resolve());
  }
}

// A page left open: every few minutes the slides are worked out again, so a show that has
// just ended drops off and the next one comes in, without a reload.
let recheck = 0;
export function startHero() {
  clearInterval(recheck);
  recheck = setInterval(() => { if (hero.run && !document.hidden) refreshShows(); }, 5 * 6e4);
  refreshShows();
  bind();
  paint();
  if (!hero.run) {
    hero.run = {};
    // The arena photo waits until the page itself has loaded, so the text and the poster
    // are never held up by it.
    const start = () => (window.requestIdleCallback || setTimeout)(showArena, { timeout: 800 });
    if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });
  }
}
function refreshShows() {
  const list = shows(), key = list.map(e => e.id).join();
  if (key === hero.key) return;
  const was = hero.list[hero.i];
  hero.list = list;
  hero.key = key;
  hero.i = Math.max(0, list.indexOf(was));
  build();
  if (hero.run) paint();
}
export function stopHero() {
  if (!hero.run) return;
  hero.run.photo?.dispose();
  hero.run = null;
}
