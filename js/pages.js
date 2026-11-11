// Fan pages: home, the concert list, a concert, unlocking a 3D pass, My 3D passes and the
// questions. The partner page lives in partners.js, the admin in admin.js and the 3D
// viewer in viewer.js.
import { formatRpShort, crowdSeats } from './layouts.js';
import { loadScene3d } from './viewer.js';
import { EVENTS, PLACES, CITY, LISTED, getEvent, eventMeta, placeOf, timeKnown, minPrice, soldOut, allSoldOut, isConcert, demoFor, onTiket, sellerOf, saleInfo } from './events.js';
import { coverImg, eventImg, posterFig } from './media.js';
import { picker } from './picker.js';
import { whenOf, startOf, venueClock, gapText } from './when.js';
import { justBought, buyUrl, buyAttrs, buyLink, passes, activePass, claim, refresh, passLink, clicksFor, STATUS } from './passes.js';
import { checkClaim, PROOF_TYPES, MAX_PROOF } from './rules.js';
import { FAQ_FANS, faqHtml } from './content.js';
import { $, $$, esc, icon, state, QUALITY, entranceTicket, share, copyText, bindSubscribe, toast } from './ui.js';

const DAY = 864e5;
const cityCode = e => CITY[placeOf(e).city]?.code || '';
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
// Keeps a short phrase on one line ("Jakarta Utara"): it wraps only between phrases.
const keep = t => t.replace(/ /g, ' ');
// Stub code: the category's own, or its first word keeping a number ('CAT 1', not 'CAT').
export const code = c => (c.code || (/^\S+ \d+$/.test(c.name) ? c.name : c.name.split(' ')[0])).toUpperCase();
const out = icon('i-out');

// ---------------------------------------------------------------- the catalogue

// A concert stays on the lists until the day after the show; its own page keeps working.
export const upcoming = e => startOf(e) + DAY > Date.now();
export const byDate = (a, b) => startOf(a) - startOf(b);
export const onSale = () => EVENTS.filter(upcoming).sort(byDate);
export const featured = () => EVENTS.find(e => e.featured && upcoming(e)) || onSale()[0] || EVENTS[0];
// All dates of one show (BTS plays three nights), soonest first.
export const datesOf = e => EVENTS.filter(x => x.title === e.title).sort(byDate);

// Times not yet announced by the promoter read "to be announced", never a guess.
const doorsKnown = e => timeKnown(e) && e.doors !== 'TBA';
const clock = (e, hhmm) => venueClock(e, hhmm).time;
export function timesLine(e) {
  if (!timeKnown(e)) return 'times to be announced';
  const start = whenOf(e).time;
  return doorsKnown(e) ? `doors ${clock(e, e.doors)} · show ${start}` : `starts ${start}`;
}

// ---------------------------------------------------------------- shared pieces

// Top-down dot plan of a venue, drawn from the same seat data as the 3D. `byCat` colours
// each category as the 3D legend does; otherwise the plan is one colour.
export function dotMap(v, { byCat = !!v.zoneColors } = {}) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const s of v.seats) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
  const [fx, , fz] = v.focus;
  x0 = Math.min(x0, fx, v.show === 'end' ? -58 : fx); x1 = Math.max(x1, fx); z0 = Math.min(z0, fz); z1 = Math.max(z1, fz);
  const W = 400, H = 300, pad = 28;
  const k = Math.min((W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (z1 - z0 || 1));
  const ox = (W - (x1 - x0) * k) / 2, oz = (H - (z1 - z0) * k) / 2;
  const px = x => (ox + (x - x0) * k).toFixed(1), pz = z => (oz + (z - z0) * k).toFixed(1);
  const step = Math.max(1, Math.round(v.seats.length / 1400));
  const r = Math.max(0.9, Math.min(2.4, k * 0.26));
  const paths = {};
  v.seats.forEach((s, i) => {
    if (i % step) return;
    const key = byCat ? s.cat : 'all';
    paths[key] = (paths[key] || '') + `M${px(s.x)} ${pz(s.z)}h0`;
  });
  const dot = `stroke-width="${(r * 2).toFixed(2)}" stroke-linecap="round"`;
  const rect = (x, z, w, h, rx, cls) => `<rect x="${(+px(x) - w * k / 2).toFixed(1)}" y="${(+pz(z) - h * k / 2).toFixed(1)}" width="${(w * k).toFixed(1)}" height="${(h * k).toFixed(1)}" rx="${rx}" class="${cls}"/>`;
  // Stadium concerts: the pitch in outline, the stage (sizes as in venues3d.js) in colour.
  const focus = v.show === 'round' ? `${rect(0, 0, 105, 68, 4, 'pitch')}<circle cx="${px(0)}" cy="${pz(0)}" r="${(9.8 * k).toFixed(1)}" class="focus"/>`
    : v.show === 'end' ? `${rect(0, 0, 105, 68, 4, 'pitch')}${rect(-48, 0, 16, 52, 2, 'focus')}`
      : v.kind === 'combat' ? `<circle cx="${px(fx)}" cy="${pz(fz)}" r="${(4.5 * k).toFixed(1)}" class="focus"/>`
        : v.kind === 'stadium' ? rect(fx, fz, 105, 68, 4, 'focus')
          : v.kind === 'cinema' ? `<rect x="${(+px(fx) - 4.8 * k).toFixed(1)}" y="${(+pz(fz) - 2).toFixed(1)}" width="${(9.6 * k).toFixed(1)}" height="4" rx="2" class="focus"/>`
            : rect(fx, fz, 20, 9, 2, 'focus');
  return `<svg class="tpl-map" viewBox="0 0 ${W} ${H}" aria-hidden="true">${focus}
    ${Object.entries(paths).map(([cat, d]) => (cat === 'all' ? `<path class="free" d="${d}" ${dot}/>` : `<path d="${d}" stroke="${esc(v.catById[cat].color)}" ${dot}/>`)).join('')}</svg>`;
}

function eventTags(e, { run = false } = {}) {
  const tags = [];
  if (activePass(e.id)) tags.push(`<span class="tag tag-coral">${icon('i-eye')}3D pass</span>`);
  const more = run ? datesOf(e).filter(upcoming).length - 1 : 0;
  if (more > 0) tags.push(`<span class="tag tag-white">+${plural(more, 'date')}</span>`);
  if (allSoldOut(e)) tags.push('<span class="tag tag-dark">Sold out</span>');
  else if (e.soldOut?.length) tags.push(`<span class="tag tag-dark">${esc(getEvent(e.id).catById[e.soldOut[0]].name)} sold out</span>`);
  return tags.join('');
}

// Where the price is printed: the seller's name with it.
const priceTag = (e, from) => (from == null ? `<small>Tickets on</small><b>${esc(sellerOf(e))}</b>` : `<small>From, on ${esc(sellerOf(e))}</small><b>${formatRpShort(from)}</b>`);

// The whole card opens the concert page (a stretched link). `run` folds the other dates of
// the same show into a tag, for lists that show each show once.
function eventCard(e, opts = {}) {
  const v = placeOf(e), dm = whenOf(e).block, from = minPrice(e.id);
  const price = priceTag(e, from);
  return `<article class="ev">
    <div class="ev-cover">
      <div class="ev-pic">${eventImg(e, `${v.name}, ${v.city}`)}</div>
      <span class="ev-tags">${eventTags(e, opts)}</span>
      <span class="ev-date"><b>${dm.day}</b><small>${dm.mon}</small></span>
    </div>
    <div class="ev-body">
      <p class="ev-meta">Concert · ${keep(esc(v.city))}</p>
      <h3><a class="ev-link" href="#event-${e.id}">${esc(e.title)}</a></h3>
      <p class="ev-sub">${esc(e.subtitle)} · ${esc(v.name)}</p>
      <div class="ev-foot"><div class="mini-tk"><span>${price}</span><em>${allSoldOut(e) ? 'Sold out' : 'Tickets'}</em></div></div>
    </div></article>`;
}

// The home page's cards are concert passes: the poster behind, the name in tall caps, a
// perforation, and the price where a ticket prints it. The whole pass opens the concert page.
function ticketCard(e, opts = {}) {
  const v = placeOf(e), dm = whenOf(e).block, from = minPrice(e.id);
  return `<article class="ev tkt">
    <div class="tkt-bg">${eventImg(e, `${v.name}, ${v.city}`)}</div>
    <div class="tkt-in">
      <div class="tkt-top"><span class="tkt-brand">${icon('i-mark')}<span>ATVENTS<small>3D SEAT VIEW</small></span></span><span class="ev-tags">${eventTags(e, opts)}</span></div>
      <h3 class="tkt-title"><a class="ev-link" href="#event-${e.id}">${esc(e.title)}</a></h3>
      <p class="tkt-sub">${esc(e.subtitle)}</p>
      <p class="tkt-line"><span>${dm.day} ${dm.mon}</span><i>|</i><span>${keep(esc(v.city))}</span><i>|</i><span>Your seat in 3D</span></p>
      <div class="tkt-cut" aria-hidden="true"></div>
      <div class="tkt-foot">
        <div class="tkt-code"><small>${allSoldOut(e) ? 'Sold out' : 'Concert pass'}</small><i class="barcode"></i></div>
        <p class="tkt-price">${priceTag(e, from)}</p>
      </div>
    </div></article>`;
}

// One card a show, soonest first, for the home page and "more concerts".
const oncePerShow = list => list.filter((e, i, all) => all.findIndex(x => x.title === e.title) === i);

// Big hero title: shrink long names so they stay on one line on desktop. Phones wrap the
// title, so there the longest word sets the size.
function titleSize(t) {
  const len = t.length, word = Math.max(...t.split(' ').map(w => w.length));
  const phone = word > 7 ? `--tsm:min(120px,${Math.min(16, 88 / (word * 0.78)).toFixed(1)}vw);` : '';
  if (len <= 10) return phone;
  if (len <= 14) return `${phone}--ts:clamp(70px,10.4vw,176px)`;
  if (len <= 20) return `${phone}--ts:clamp(60px,7.6vw,128px)`;
  return `${phone}--ts:clamp(36px,${(86 / (len * 0.62)).toFixed(2)}vw,98px)`;
}
const heroTitle = e => `<h1 class="giant hero-title" style="${titleSize(e.title)}">${esc(e.title)}</h1>`;

function kicker(sub) {
  const w = sub.split(' ');
  const cut = Math.max(1, Math.ceil(w.length / 2));
  return `<p class="hero-kicker"><span class="w-fill">${esc(w.slice(0, cut).join(' '))}</span> <span class="w-ol">${esc(w.slice(cut).join(' '))}</span></p>`;
}

// A category as a white entrance ticket. The whole ticket is the link out to tiket.com.
function catTicket(e, c, { dark = false, meta } = {}) {
  const gone = soldOut(e, c.id);
  return entranceTicket({
    ev: e.title, sub: c.name, code: code(c), price: c.price, href: esc(buyUrl(e)), attrs: buyAttrs(e),
    buy: gone ? 'Sold out' : 'Buy', dark, out: gone, date: whenOf(e).pill, city: cityCode(e), na: c.note,
    meta: meta ?? (gone ? `<span class="tk-hot">Sold out, as listed. ${esc(sellerOf(e))} may release more.</span>` : onTiket(e) ? '<span>Opens tiket.com · 3D seat view included</span>' : `<span>Opens ${esc(sellerOf(e))} · not sold on tiket.com</span>`),
  });
}

// ---------------------------------------------------------------- home

let homeBound = false;

export function renderHome() {
  if (!homeBound) {
    homeBound = true;
    bindSubscribe($('#news-form'), { kind: 'newsletter', done: 'You’re on the list. The next big concert lands in your inbox.' }, $('#news-msg'));
  }
  const list = oncePerShow(onSale());
  $('#home-events').innerHTML = list.map(e => ticketCard(e, { run: true })).join('') + `
    <a class="ev ev-alerts tkt-alerts" href="#news-form">
      <span class="feat-ic">${icon('i-bell')}</span>
      <h3>More concerts coming</h3>
      <p>Get the date, the prices and the 3D venue the day a big show goes on sale.</p>
      <span class="pill-link">Concert alerts ${icon('i-arrow')}</span>
    </a>`;

  $('#home-venues').innerHTML = PLACES.map((p, i) => {
    const shows = p.events.filter(upcoming), first = shows[0] || p.events[0];
    const from = Math.min(...shows.map(e => minPrice(e.id) ?? Infinity));
    return `<a class="venue" href="#seats-${first.id}">
      <div class="venue-cover">${coverImg(first.photo, first.venue, `${p.name}, ${p.city}`)}</div>
      <div class="venue-body">
        <span class="venue-n">0${i + 1} · ${esc(p.city)}</span>
        <h3>${esc(p.name)}</h3>
        <p>${esc(demoFor(first.venue)?.title || 'Venue')} · ${plural(getEvent(first.id).seats.length, 'seat')} modelled</p>
        <div class="venue-foot"><span>${shows.length ? plural(shows.length, 'concert') : 'No concerts on sale yet'}${from < Infinity ? ` · from <b>${formatRpShort(from)}</b>` : ''}</span><span class="go">${icon('i-arrow')}</span></div>
      </div></a>`;
  }).join('');

  $('#home-faq').innerHTML = faqHtml(FAQ_FANS, ['price', 'unlock', 'check', 'no-link', 'story']);
}

// ---------------------------------------------------------------- concert list

const listQuery = { q: '', sort: 'date' };
const SORTS = [{ value: 'date', label: 'Soonest' }, { value: 'price', label: 'Lowest price' }];
let sortPicker = null;

export function renderConcerts() {
  if (!sortPicker) {
    $('#concerts-q').addEventListener('input', e => { listQuery.q = e.target.value; renderConcerts(); });
    sortPicker = picker($('#concerts-sort'), { name: 'Sort', label: 'Sort', onPick: v => { listQuery.sort = v; renderConcerts(); } });
  }
  sortPicker.set(SORTS, listQuery.sort);
  const q = listQuery.q.trim().toLowerCase();
  const match = e => !q || [e.title, e.subtitle, e.host, placeOf(e).name, placeOf(e).city].join(' ').toLowerCase().includes(q);
  const all = onSale();
  const list = all.filter(match).sort(listQuery.sort === 'price' ? (a, b) => (minPrice(a.id) ?? Infinity) - (minPrice(b.id) ?? Infinity) || byDate(a, b) : byDate);
  $('#concerts-count').textContent = `${plural(all.length, 'concert')} on sale, as listed in ${LISTED}. Prices as announced; tiket.com has the live price.`;
  $('#concerts-grid').innerHTML = list.length ? list.map(e => ticketCard(e)).join('')
    : `<div class="empty-state"><h3>Nothing matches.</h3><p>${q ? `No concert matches “${esc(listQuery.q.trim())}”.` : 'No concerts on sale right now.'} New shows are added as they go on sale: get the concert alerts on the home page to hear first.</p>${q ? '<button class="btn btn-line" type="button" id="concerts-clear">Clear the search</button>' : ''}</div>`;
  $('#concerts-clear')?.addEventListener('click', () => { listQuery.q = ''; $('#concerts-q').value = ''; renderConcerts(); });
}

// ---------------------------------------------------------------- concert page

// The concert page hero: the whole venue in 3D from above, the show's poster on the stage
// screens, turning slowly. The cover image stays behind it until the venue is built, and for
// visitors saving data. One scene at a time; leaving the page or opening another drops it.
const evHero = { scene: null, id: '' };
export function stopEventHero() {
  evHero.scene?.dispose();
  evHero.scene = null;
  evHero.id = '';
}
async function startEventHero(id) {
  stopEventHero();
  if (navigator.connection?.saveData) return;
  evHero.id = id;
  // After the page has loaded and the browser is idle: the 3D never holds up the page.
  if (document.readyState !== 'complete') await new Promise(r => addEventListener('load', r, { once: true }));
  await new Promise(r => (window.requestIdleCallback || setTimeout)(r, { timeout: 1500 }));
  if (evHero.id !== id) return;
  let SeatScene;
  try { ({ SeatScene } = await loadScene3d()); } catch { return; }
  const box = $('#ev-hero-3d');
  if (evHero.id !== id || !box) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = evHero.scene = new SeatScene(box, { interactive: false, labels: false, quality: QUALITY, maxLevel: 1, fps: 30, drift: still ? 0 : 0.04 });
  const venue = getEvent(id);
  const ok = await scene.load(venue, crowdSeats(venue));
  if (!ok || evHero.scene !== scene) return;
  box.classList.add('is-on');
  $('#ev-hero')?.classList.add('has-3d');
  if (!still) {
    const turn = () => { if (evHero.scene === scene) { scene.orbit(24, 14); setTimeout(turn, 14500); } };
    setTimeout(turn, 400);
  }
}

export function renderEvent(id) {
  const e = eventMeta(id), venue = getEvent(id), v = placeOf(e), w = whenOf(e), dm = w.block;
  const live = upcoming(e), from = minPrice(id), pass = activePass(id);
  const url = `${location.origin}${location.pathname}#event-${id}`;
  const others = datesOf(e).filter(x => x.id !== id && upcoming(x));
  const poster = posterFig(e);
  $('#ev-hero').classList.toggle('has-poster', !!poster);
  $('#ev-hero').innerHTML = `
    <div class="hero-bg">
      ${eventImg(e, `${v.name}, ${v.city}`, { eager: true })}
      <div class="hero-canvas ev-hero-3d" id="ev-hero-3d" role="img" aria-label="3D view of ${esc(v.name)} from above, with the stage for ${esc(e.title)}"></div>
      <i class="hero-shade" aria-hidden="true"></i>
    </div>
    <div class="hero-in">
      ${kicker(e.subtitle)}
      ${heroTitle(e)}
      <div class="hero-space"></div>
      <div class="hero-bar">
        ${poster}
        <div class="ev-info">
          <a class="back-link" href="#concerts">${icon('i-back')}All concerts</a>
          <div class="tags"><span class="tag tag-coral">Concert</span><span class="tag tag-white">${dm.dow} ${dm.day} ${dm.mon}</span>${allSoldOut(e) ? '<span class="tag tag-dark">Sold out</span>' : ''}${pass ? `<span class="tag tag-line">${icon('i-eye')}3D pass on this device</span>` : ''}</div>
          <p class="ev-blurb">${esc(e.blurb)}</p>
          ${live && saleInfo(e) ? `<p class="ev-sale">${icon('i-cal')}<span>${esc(saleInfo(e).line)}</span></p>` : ''}
          ${others.length ? `<p class="ev-dates">Also on ${others.map(x => `<a class="pill" href="#event-${x.id}">${esc(whenOf(x).block.dow)} ${whenOf(x).block.day} ${whenOf(x).block.mon}${allSoldOut(x) ? ' <span>sold out</span>' : ''}</a>`).join('')}</p>` : ''}
          ${live && !onTiket(e) ? `<p class="ev-official">${icon('i-link')}<span>Sold on ${esc(sellerOf(e))}, not on tiket.com. The button opens ${esc(sellerOf(e))} directly; it is not an affiliate link. Bought a ticket there? Unlock the 3D view of your seat for Rp25.000.</span></p>`
            : live ? `<p class="ev-official">${icon('i-link')}<span>Sold on tiket.com. Buy with our button and the 3D tour to your seat comes free once we have checked your e-ticket. It is an <a href="#disclosure">affiliate link</a>: the price is the same.</span></p>`
            : '<p class="ev-official">This concert has taken place. Its 3D venue stays open to look round.</p>'}
          <div class="row-btns">${live ? buyLink(e, `Buy on tiket.com ${out}`) : ''}${pass?.status === 'confirmed' ? `<a class="btn btn-line" href="#tour-${esc(pass.id)}">Start my seat tour</a>` : `<a class="btn btn-line" href="#seats-${id}">Look round in 3D</a>`}</div>
        </div>
        <div class="ev-actions">
          <div class="row-btns">
            <button class="btn btn-line btn-sm" type="button" id="ev-share">${icon('i-share')}Share</button>
            ${live ? `<button class="btn btn-line btn-sm" type="button" id="ev-alert-btn" aria-expanded="false" aria-controls="ev-alert">${icon('i-bell')}Alerts</button>` : ''}
          </div>
          <form class="alert-form" id="ev-alert" novalidate hidden>
            <input name="email" type="email" required autocomplete="email" placeholder="Email for news of this show" aria-label="Email">
            <button class="btn btn-coral btn-sm" type="submit">Notify me</button>
          </form>
          <p class="form-msg" id="ev-alert-msg" role="status" hidden></p>
        </div>
      </div>
      <dl class="ev-specs">
        <div><dt>When</dt><dd>${esc(w.date)}<small>${timeKnown(e) ? esc([doorsKnown(e) && `Doors ${clock(e, e.doors)}`, `Start ${w.time}`, e.ends && `ends ${clock(e, e.ends)}`].filter(Boolean).join(' · ')) : 'Times to be announced by the promoter'}</small>${w.local ? `<small>${esc(w.local)}</small>` : ''}</dd></div>
        <div><dt>Where</dt><dd>${esc(v.name)}<small>${esc(v.address)}</small></dd></div>
        <div><dt>Promoter</dt><dd>${esc(e.host)}<small>${esc(e.hostNote)}</small></dd></div>
      </dl>
    </div>`;
  $('#ev-share').addEventListener('click', () => share({ title: e.title, text: `${e.title} · ${w.date} · ${v.name}. See the venue in 3D:`, url }));
  $('#ev-alert-btn')?.addEventListener('click', ev => {
    const f = $('#ev-alert'), show = f.hidden;
    f.hidden = !show;
    ev.currentTarget.setAttribute('aria-expanded', show);
    if (show) f.email.focus();
  });
  bindSubscribe($('#ev-alert'), { kind: 'alerts', eventId: id, done: 'Done. We email you when there is news about this show.' }, $('#ev-alert-msg'));

  $('#ev-bar').innerHTML = `<div class="ev-bar-in">
      <span class="ev-date"><b>${dm.day}</b><small>${dm.mon}</small></span>
      <div class="ev-bar-t"><b>${esc(e.title)}</b><span>${esc(e.subtitle)} · ${esc(v.name)}${timeKnown(e) ? ` · ${esc(w.time)}` : ''}</span></div>
      <span class="ev-from">${from == null ? `<small>Tickets on</small><b>${esc(sellerOf(e))}</b>` : `<small>From</small><b>${formatRpShort(from)}</b>`}</span>
      ${live ? buyLink(e, `Buy on tiket.com ${out}`) : `<a class="btn btn-line" href="#seats-${id}">Look round in 3D</a>`}
    </div>`;

  render3dPanel(e, venue);

  $('#ev-tickets-note').textContent = `${e.about.find(p => p.startsWith('Prices as announced')) || 'Prices as announced by the promoter.'} Each ticket opens the concert on ${sellerOf(e)}.`;
  $('#ev-cats').innerHTML = venue.categories.map((c, i) => catTicket(e, c, { dark: i === 0, meta: live ? undefined : '<span>This concert has taken place.</span>' })).join('');

  const gap = gapText(e);
  $('#ev-runs-sec').hidden = !e.runs.length;
  $('#ev-run-note').textContent = `${w.date}.${timeKnown(e) ? ` Times in ${w.zone}${gap ? `, your time zone. ${gap}` : ''}.` : ''}`;
  $('#ev-runs').innerHTML = e.runs.map(([t, h, p]) => { const c = venueClock(e, t); return `<li><b class="run-t">${esc(c.time)}${c.local ? `<small>${esc(c.local)}</small>` : ''}</b><h3>${esc(h)}</h3>${p ? `<p>${esc(p)}</p>` : ''}</li>`; }).join('');

  $('#ev-about').innerHTML = `
    <div class="about">
      <div class="about-text"><p class="eyebrow">About the show</p><h2 class="big big-sm"><span class="fade">${esc(e.title)}</span></h2>${e.about.map(p => `<p>${esc(p)}</p>`).join('')}</div>
      <aside class="host-card"><span class="eyebrow eyebrow-ink">Promoter</span><b>${esc(e.host)}</b><p>${esc(e.hostNote)}</p><i class="barcode"></i></aside>
      <div class="venue-box">
        <p class="eyebrow">Getting there</p>
        <dl class="venue-facts">
          <div><dt>${icon('i-pin')}Venue</dt><dd><b>${esc(v.name)}</b>${esc(v.address)}</dd></div>
          <div><dt>${icon('i-arrow')}Travel</dt><dd>${esc(v.transit || 'See the promoter’s guide for transport and parking')}</dd></div>
          <div><dt>${icon('i-seat')}Categories</dt><dd>${plural(venue.categories.length, 'category', 'categories')}${v.capacity ? ` · ${esc(v.capacity)}` : ''}</dd></div>
          <div><dt>${icon('i-clock')}Doors</dt><dd>${esc(doorsKnown(e) ? `${clock(e, e.doors)}, show at ${w.time}` : timeKnown(e) ? `To be announced, starts ${w.time}` : 'To be announced')}</dd></div>
        </dl>
      </div>
    </div>`;

  $('#ev-faq').innerHTML = faqHtml(FAQ_FANS, ['price', 'unlock', 'no-link', 'tour', 'official']);

  const more = [...others, ...oncePerShow(onSale().filter(x => x.title !== e.title))].slice(0, 4);
  $('#ev-more-sec').hidden = !more.length;
  $('#ev-more').innerHTML = more.map(x => ticketCard(x, { run: x.title !== e.title })).join('');
}

// "Your seat, in 3D": the plan in category colours, and what this device can do with it.
function render3dPanel(e, venue) {
  const id = e.id, pass = activePass(id);
  const mine = pass ? venue.catById[pass.cat] : null;
  const action = pass
    ? `<p class="ev3d-pass"><span class="pass-pill is-${pass.status}">${STATUS[pass.status].label}</span><span>Your 3D pass for ${esc(mine?.name || 'this concert')}. ${esc(STATUS[pass.status].note)}</span></p>
       <div class="row-btns">${pass.status === 'confirmed' ? `<a class="btn btn-coral" href="#tour-${esc(pass.id)}">Start my seat tour ${icon('i-arrow')}</a>` : `<a class="btn btn-coral" href="#seats-${id}">Look round in 3D ${icon('i-arrow')}</a>`}<a class="btn btn-line" href="#passes">My 3D passes</a></div>`
    : `<ol class="mini-steps">
        <li><b>1</b><span>Look round the venue from above. Free, for everyone.</span></li>
        <li><b>2</b><span>Buy on tiket.com with our button, or unlock a ticket bought elsewhere for Rp25.000.</span></li>
        <li><b>3</b><span>Send your seat and e-ticket. Once checked, the tour takes you to the view from your seat.</span></li>
      </ol>
      <div class="row-btns"><a class="btn btn-coral" href="#seats-${id}">Look round in 3D ${icon('i-arrow')}</a><a class="btn btn-line" href="#unlock-${id}">${icon('i-lock')}Unlock my view</a></div>`;
  startEventHero(id);
  $('#ev-3d').innerHTML = `
    <div class="ev3d">
      <a class="ev3d-map" href="#seats-${id}" aria-label="Open the 3D venue">${dotMap(venue, { byCat: true })}<span class="ev3d-go">Open in 3D ${icon('i-arrow')}</span></a>
      <div class="ev3d-side">
        <p class="eyebrow">Your seat, in 3D</p>
        <h2 class="big big-sm"><span class="fade">See the stage</span> <span class="ol">from your seat</span></h2>
        ${action}
        <ul class="cat-key">${venue.categories.map(c => `<li><i style="background:${esc(c.color)}"></i><span>${esc(c.name)}</span><b>${c.price == null ? '' : formatRpShort(c.price)}</b></li>`).join('')}</ul>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- unlock a 3D pass

let unlockBound = false;

// The form to claim a pass: the concert, the seat on the e-ticket (picked from the venue's own
// seat list, so a seat that does not exist cannot be sent), the tiket.com booking and the
// e-ticket itself. `eventId` comes from #unlock-<id>; without it, the concert last clicked
// through to tiket.com, then the featured one. Fans who bought somewhere else pay the
// Rp25.000 access fee first; the form opens once it is paid.
const unlock = { route: 'affiliate', payment: null, proof: null };

export function renderUnlock(eventId) {
  const form = $('#unlock-form');
  if (!unlockBound) { unlockBound = true; bindUnlock(form); }
  $('#unlock-done')?.remove();
  $('#unlock-body').hidden = false;
  $('.route-switch').hidden = false;
  $('#unlock-error').hidden = true;
  const all = onSale();
  if (isConcert(eventId) && !all.some(e => e.id === eventId)) all.unshift(eventMeta(eventId));
  unlock.all = all;
  unlock.want = isConcert(eventId) ? eventId : '';
  unlock.open = justBought.id && justBought.id === unlock.want ? unlock.want : (unlock.open && unlock.open === unlock.want ? unlock.open : '');
  // Someone who never clicked through to tiket.com on this device most likely bought elsewhere.
  setRoute(form, unlock.payment ? 'outside' : unlock.route);
  const note = $('#unlock-note');
  if (justBought.id && justBought.id === unlock.want) {
    note.innerHTML = `${icon('i-out')}<span>tiket.com is open in a new tab. Once you have paid there and have your e-ticket, come back to this tab and fill in your seat.</span>`;
    note.hidden = false;
    justBought.id = '';
  } else note.hidden = true;
}

// The concerts the form offers. Through our link: only concerts this device clicked through
// to tiket.com. Bought elsewhere: every concert on sale.
function fillEvents(form) {
  const outside = unlock.route === 'outside';
  const list = outside ? unlock.all : unlock.all.filter(e => clicksFor(e.id).length);
  const gate = !outside && !(unlock.open && list.some(e => e.id === unlock.open));
  $('#buy-gate').hidden = !gate;
  if (gate) {
    // Only concerts tiket.com sells: the free unlock is for tickets bought through our link.
    const sold = unlock.all.filter(onTiket);
    const want = unlock.want ? sold.find(e => e.id === unlock.want) : null;
    const rows = want ? [want, ...sold.filter(e => e !== want)] : sold;
    const other = unlock.all.find(e => e.id === unlock.want && !onTiket(e));
    $('#buy-gate .gate-lede').innerHTML = other
      ? `${esc(other.title)} is sold on ${esc(sellerOf(other))}, not on tiket.com. Bought there? Choose <b>I bought somewhere else</b> above to unlock your seat for Rp25.000. The concerts below are on tiket.com, where our button unlocks the 3D view free.`
      : 'The form opens once you have bought through one of our <b>Buy on tiket.com</b> buttons. Pick your concert: tiket.com opens in a new tab, and this page moves straight to your seat form.';
    $('#gate-list').innerHTML = rows.map(e => `<li>
        <span class="gate-when"><b>${esc(whenOf(e).date)}</b><small>${esc(placeOf(e).name)}</small></span>
        <span class="gate-ev"><b>${esc(e.title)}</b><small>${esc(e.subtitle || '')}</small></span>
        <span class="gate-act">${upcoming(e) ? buyLink(e, `Buy on tiket.com ${icon('i-out')}`) : '<span class="tag">Sold out</span>'}</span>
      </li>`).join('');
    return false;
  }
  const prev = form.eventId.value;
  const pick = unlock.open;
  form.eventId.innerHTML = list.filter(e => e.id === unlock.open).map(e => `<option value="${e.id}">${esc(e.title)} · ${esc(whenOf(e).date)}</option>`).join('');
  form.eventId.value = pick;
  fillCats(form);
  return true;
}

function setRoute(form, route) {
  unlock.route = route;
  $$('.route-switch [data-route]').forEach(b => b.setAttribute('aria-selected', b.dataset.route === route));
  const outside = route === 'outside', paid = unlock.payment?.status === 'paid';
  $('#pay-box').hidden = !outside;
  const open = unlock.all ? fillEvents(form) : true;
  form.hidden = (outside && !paid) || !open;
  $('#consent-text').innerHTML = outside
    ? `These are my tickets for this concert, and I agree to the <a class="u" href="#terms">terms</a> and the <a class="u" href="#privacy">privacy policy</a>.`
    : `I bought these tickets on tiket.com through an <span data-brand>${esc(state.cfg.brand)}</span> link, and I agree to the <a class="u" href="#terms">terms</a> and the <a class="u" href="#privacy">privacy policy</a>.`;
  $('#unlock-foot').hidden = outside;
  [...form.querySelectorAll('legend')].forEach((l, i) => { const n = l.querySelector('i') || l; n.textContent = n.textContent.replace(/^\d+/, String(i + (outside ? 2 : 1)).padStart(2, '0')); });
}

// The seat pickers, from the venue's seats: section, then row, then seat number. A standing
// area has no rows or numbers on the ticket: the section is enough, and the tour stands the
// fan in the middle of it.
const seatsIn = (venue, cat) => venue.seats.filter(s => s.cat === cat);
const opts = (list, label) => `<option value="">${label}</option>${list.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}`;
const byNatural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

function fillCats(form) {
  const venue = getEvent(form.eventId.value), prev = form.cat.value;
  form.cat.innerHTML = `<option value="">Choose</option>${venue.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}`;
  if (venue.catById[prev]) form.cat.value = prev;
  fillSecs(form);
}

function fillSecs(form) {
  const venue = getEvent(form.eventId.value), cat = form.cat.value, prev = form.sec.value;
  const list = cat ? seatsIn(venue, cat) : [];
  const secs = [...new Map(list.map(s => [s.sec, s.secName])).entries()].sort((a, b) => byNatural(a[1], b[1]));
  const standing = list.length > 0 && list.every(s => s.standing);
  form.sec.innerHTML = opts(secs, cat ? 'Choose' : 'Category first');
  form.sec.disabled = !cat;
  if (secs.some(([v]) => v === prev)) form.sec.value = prev;
  else if (secs.length === 1) form.sec.value = secs[0][0];
  $('#row-field').hidden = standing;
  $('#num-field').hidden = standing;
  form.row.required = form.num.required = !standing;
  $('#seat-note').textContent = standing ? 'A standing area: no row or seat number. Choose the area on your e-ticket; your tour stands you in the middle of it.' : 'As printed on your e-ticket. Only seats that exist in this venue are listed.';
  fillRows(form);
}

function fillRows(form) {
  const venue = getEvent(form.eventId.value), sec = form.sec.value, prev = form.row.value;
  const list = sec ? seatsIn(venue, form.cat.value).filter(s => s.sec === sec) : [];
  const rows = [...new Set(list.map(s => s.row))].sort(byNatural).map(r => [r, r]);
  form.row.innerHTML = opts(rows, sec ? 'Choose' : 'Section first');
  form.row.disabled = !sec;
  if (rows.some(([v]) => v === prev)) form.row.value = prev;
  fillNums(form);
}

function fillNums(form) {
  const venue = getEvent(form.eventId.value), sec = form.sec.value, row = form.row.value, prev = form.num.value;
  const list = row ? seatsIn(venue, form.cat.value).filter(s => s.sec === sec && s.row === row) : [];
  const nums = list.map(s => [s.id, String(s.num)]).sort((a, b) => byNatural(a[1], b[1]));
  form.num.innerHTML = opts(nums, row ? 'Choose' : 'Row first');
  form.num.disabled = !row;
  if (nums.some(([v]) => v === prev)) form.num.value = prev;
}

// The seat id the form points at: the seat chosen, or the middle of a standing area.
function chosenSeat(form) {
  const venue = getEvent(form.eventId.value), list = seatsIn(venue, form.cat.value).filter(s => s.sec === form.sec.value);
  if (!list.length) return '';
  if (list.every(s => s.standing)) {
    const cx = list.reduce((a, s) => a + s.x, 0) / list.length, cz = list.reduce((a, s) => a + s.z, 0) / list.length;
    return list.reduce((best, s) => (Math.hypot(s.x - cx, s.z - cz) < Math.hypot(best.x - cx, best.z - cz) ? s : best)).id;
  }
  return form.num.value;
}

// The e-ticket, read in the browser. A photo is scaled down to 1400 px on its long side, as
// JPEG, which keeps the text on the ticket readable at a fraction of the size.
async function readProof(file) {
  if (!file) return null;
  if (!PROOF_TYPES.includes(file.type)) throw new Error('Use a JPG, PNG or WebP image, or a PDF.');
  if (file.size > MAX_PROOF) throw new Error('That file is over 4 MB. Send a screenshot instead.');
  const asUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  if (file.type === 'application/pdf') {
    // The demo keeps files in this browser's storage, which holds a few MB at most.
    const data = state.store.mode === 'demo' && file.size > 900 * 1024 ? '' : await asUrl(file);
    return { name: file.name, type: file.type, size: file.size, data };
  }
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
  return { name: file.name, type: 'image/jpeg', size: blob.size, data: await asUrl(blob) };
}

function showProof(p) {
  const empty = $('#proof-drop .drop-empty'), shown = $('#proof-drop .drop-file');
  empty.hidden = !!p;
  shown.hidden = !p;
  shown.innerHTML = p ? `${p.type.startsWith('image/') && p.data ? `<img src="${p.data}" alt="">` : icon('i-tix')}<span><b>${esc(p.name)}</b><small>${Math.max(1, Math.round(p.size / 1024))} KB · tap to change</small></span>` : '';
}

// The access fee. The live site sends the fan to the payment provider's own page; the demo
// shows a stand-in that charges nothing.
async function startPayment(form) {
  const btn = $('#pay-start');
  btn.disabled = true;
  try {
    const p = await state.store.pay({ eventId: form.eventId.value });
    unlock.payment = p;
    if (p.url) { location.href = p.url; return; }
    $('#pay-sheet').hidden = false;
    $('#pay-sheet').innerHTML = `
      <p class="eyebrow">${icon('i-card')}Demo payment</p>
      <p>This preview charges nothing. On the live site this step opens the payment provider (QRIS, e-wallets, bank transfer), and the form opens by itself once Rp25.000 is paid.</p>
      <div class="row-btns"><button class="btn btn-coral btn-sm" type="button" id="pay-demo">Mark as paid (demo)</button><button class="btn btn-line btn-sm" type="button" id="pay-cancel">Cancel</button></div>`;
  } catch (e) { toast(e.message || 'The payment could not start. Please try again.'); } finally { btn.disabled = false; }
}

function paid(form) {
  $('#pay-sheet').hidden = true;
  $('#pay-start').hidden = true;
  $('#pay-done').hidden = false;
  $('#pay-done').innerHTML = `${icon('i-check')}<span>Paid · <span class="mono">${esc(unlock.payment.id)}</span>. Now tell us your seat.</span>`;
  setRoute(form, 'outside');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindUnlock(form) {
  form.eventId.addEventListener('change', () => fillCats(form));
  form.cat.addEventListener('change', () => fillSecs(form));
  form.sec.addEventListener('change', () => fillRows(form));
  form.row.addEventListener('change', () => fillNums(form));
  $('.route-switch').addEventListener('click', ev => {
    const b = ev.target.closest('[data-route]');
    if (b) setRoute(form, b.dataset.route);
  });
  $('#pay-start').addEventListener('click', () => startPayment(form));
  $('#pay-box').addEventListener('click', async ev => {
    if (ev.target.closest('#pay-cancel')) { $('#pay-sheet').hidden = true; unlock.payment = null; }
    if (ev.target.closest('#pay-demo')) {
      try { unlock.payment = { ...unlock.payment, ...(await state.store.payDemo(unlock.payment.id)) }; paid(form); } catch (e) { toast(e.message || 'Could not mark it paid.'); }
    }
  });
  form.proof.addEventListener('change', async () => {
    const err = $('#unlock-error');
    try { unlock.proof = await readProof(form.proof.files[0]); err.hidden = true; } catch (e) { unlock.proof = null; form.proof.value = ''; err.textContent = e.message; err.hidden = false; }
    showProof(unlock.proof);
  });
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#unlock-error');
    const say = (msg, field) => { err.textContent = msg; err.hidden = false; if (field && form[field]) form[field].focus(); };
    if (!form.cat.value) return say('Choose the category on your e-ticket.', 'cat');
    if (!form.sec.value) return say('Choose the section on your e-ticket.', 'sec');
    const seat = chosenSeat(form);
    if (!seat) return say(form.row.value ? 'Choose the seat number on your e-ticket.' : 'Choose the row on your e-ticket.', form.row.value ? 'num' : 'row');
    const { claim: data, field, error } = checkClaim({
      eventId: form.eventId.value, cat: form.cat.value, qty: 1, seat, orderRef: form.orderRef.value, email: form.email.value, consent: form.consent.checked,
      route: unlock.route, payment: unlock.payment?.id, proof: unlock.proof, requireProof: true,
    });
    if (error) return say(error, field === 'proof' ? null : field);
    err.hidden = true;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const p = await claim(data);
      form.orderRef.value = '';
      form.proof.value = '';
      unlock.proof = null;
      if (unlock.route === 'outside') { unlock.payment = null; $('#pay-start').hidden = false; $('#pay-done').hidden = true; }
      showProof(null);
      showUnlocked(p);
    } catch (e) {
      say(e.status === 429 ? 'Too many tries. Please wait a few minutes.' : e.message || 'Could not send it. Please try again.');
    } finally { btn.disabled = false; }
  });
}

function showUnlocked(p) {
  const e = eventMeta(p.eventId);
  $('#unlock-body').hidden = true;
  $('.route-switch').hidden = true;
  const open = p.status === 'confirmed';
  $('#unlock-body').insertAdjacentHTML('beforebegin', `
    <div class="unlock-done" id="unlock-done">
      <div class="unlock-next">
        <p class="eyebrow">Pass ${esc(p.id)}</p>
        <h2 class="big"><span class="fade">${open ? 'You’re' : 'Sent for'}</span> <span class="ol">${open ? 'in' : 'review'}</span></h2>
        <p class="lede">${open ? `Your seat view for ${esc(e.title)} is open. Take the tour to your seat.`
          : `We check your e-ticket against the seat you entered, usually within a few hours, and email you when your seat view for ${esc(e.title)} opens. Nothing else to do until then.`}</p>
        <div class="row-btns">${open ? `<a class="btn btn-coral" href="#tour-${esc(p.id)}">Start my seat tour ${icon('i-arrow')}</a>` : `<a class="btn btn-coral" href="#seats-${p.eventId}">Look round the venue ${icon('i-arrow')}</a>`}<a class="btn btn-line" href="#passes">My 3D passes</a></div>
        ${state.store.mode === 'demo' && !open ? `<p class="fine">Preview: approve it yourself on the <a class="u" href="#admin">admin page</a>, then open it from My 3D passes.</p>` : ''}
        ${p.token ? `<p class="fine">On another phone or laptop? <button class="link" type="button" data-copy-pass="${esc(p.id)}">Copy the pass link</button> and open it there. Keep it to yourself: the link opens your pass.</p>` : ''}
      </div>
      ${passCard(p, { actions: false })}
    </div>`);
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- my 3D passes

// A pass as a ticket stub: the category in big type, then the concert and the check.
function passCard(p, { actions = true } = {}) {
  const e = eventMeta(p.eventId);
  if (!e) return '';
  const venue = getEvent(p.eventId), c = venue.catById[p.cat], w = whenOf(e), st = STATUS[p.status] || STATUS.checking;
  const seats = (p.seats || []).map(id => venue.seats[venue.seatById.get(id)]).filter(Boolean);
  const len = code(c || { name: p.cat }).length;
  return `<article class="pass${p.status === 'rejected' ? ' is-closed' : ''}">
    <div class="pass-stub">
      <span class="pass-k">3D pass</span>
      <b class="pass-code"${len > 7 ? ' style="font-size:clamp(22px,2.2vw,30px)"' : ''}>${esc(code(c || { name: p.cat }))}</b>
      <span class="pass-n">${plural(p.qty, 'ticket')}</span>
    </div>
    <div class="pass-body">
      <div class="pass-top"><span class="pass-pill is-${p.status}">${st.label}</span><span class="mono">${esc(p.id)}</span></div>
      <h3>${esc(e.title)}</h3>
      <p class="pass-when">${esc(w.date)} · ${esc(placeOf(e).name)}</p>
      <p class="pass-note">${esc(st.note)}</p>
      <dl class="pass-facts">
        <div><dt>Category</dt><dd>${esc(c?.name || p.cat)}</dd></div>
        ${p.ref ? `<div><dt>Order</dt><dd class="mono">${esc(p.ref)}</dd></div>` : ''}
        <div><dt>${seats.length > 1 ? 'Seats' : 'Seat'}</dt><dd>${seats.length ? seats.map(s => esc(s.standing ? `${s.secName}, standing` : `${s.secName} · Row ${s.row} · Seat ${s.num}`)).join(', ') : 'Not given'}</dd></div>
        ${p.route === 'outside' ? '<div><dt>Access</dt><dd>Rp25.000, paid</dd></div>' : ''}
      </dl>
      ${actions ? `<div class="row-btns">
        ${p.status === 'rejected' ? `<a class="btn btn-coral btn-sm" href="#unlock-${p.eventId}">Send it again</a><a class="btn btn-line btn-sm" href="#contact">Write to us</a>`
          : p.status === 'confirmed' ? `<a class="btn btn-coral btn-sm" href="#tour-${esc(p.id)}">Start my seat tour ${icon('i-arrow')}</a>`
            : `<a class="btn btn-line btn-sm" href="#seats-${p.eventId}">Look round the venue ${icon('i-arrow')}</a>`}
        ${p.token ? `<button class="btn btn-line btn-sm" type="button" data-copy-pass="${esc(p.id)}">${icon('i-link')}Copy pass link</button>` : ''}
        <button class="link" type="button" data-remove-pass="${esc(p.id)}">Remove from this device</button>
      </div>` : ''}
    </div>
  </article>`;
}

export function renderPasses({ check = false } = {}) {
  const starts = p => { const e = eventMeta(p.eventId); return e ? startOf(e) : Infinity; };
  const list = passes.all().filter(p => eventMeta(p.eventId)).sort((a, b) => starts(a) - starts(b));
  const open = list.filter(p => p.status !== 'rejected').length;
  $('#passes-note').textContent = list.length
    ? `${plural(list.length, 'pass', 'passes')} on this device${open < list.length ? `, ${open} open` : ''}. Each opens the seat views of its concert.`
    : 'Passes you unlock appear here, on the device you unlocked them on.';
  $('#passes-body').innerHTML = list.length
    ? `<div class="pass-grid">${list.map(p => passCard(p)).join('')}</div>`
    : `<div class="empty-state"><h3>No 3D passes yet.</h3><p>Buy a concert ticket on tiket.com with one of our buttons, then send your seat and e-ticket. Bought elsewhere? Unlock it for Rp25.000.</p><div class="row-btns"><a class="btn btn-coral" href="#concerts">Find a concert ${icon('i-arrow')}</a><a class="btn btn-line" href="#unlock">Send my seat</a></div></div>`;
  // Ask the server how each check is going, once per visit to the page.
  if (check) list.forEach(p => refresh(p));
}

// Pass buttons work wherever a pass card is drawn: copy its link, or take it off this device.
export function bindPassButtons() {
  let armed = null, armedTimer = 0;
  document.addEventListener('click', ev => {
    const copy = ev.target.closest('[data-copy-pass]');
    if (copy) {
      const link = passLink(passes.get(copy.dataset.copyPass) || {});
      if (link) copyText(link, 'Pass link copied. Open it on your other device.');
      return;
    }
    const rm = ev.target.closest('[data-remove-pass]');
    if (!rm) return;
    // A second tap confirms, so one slip does not lose a pass.
    if (armed !== rm) {
      armed = rm;
      rm.textContent = 'Tap again to remove';
      clearTimeout(armedTimer);
      armedTimer = setTimeout(() => { if (armed === rm) { armed = null; rm.textContent = 'Remove from this device'; } }, 4000);
      return;
    }
    armed = null;
    passes.remove(rm.dataset.removePass);
    toast('Removed from this device. Open its pass link, or send your seat again, to bring it back.');
  });
}

export function navCount() {
  const n = passes.all().filter(p => p.status !== 'rejected' && eventMeta(p.eventId)).length;
  $$('[data-count="passes"]').forEach(b => { b.hidden = !n; b.textContent = n; });
}

// ---------------------------------------------------------------- questions

export function renderFaq() {
  $('#faq-list').innerHTML = faqHtml(FAQ_FANS);
}
