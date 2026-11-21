// Fan pages: home, the concert list, a concert, unlocking a 3D pass, My 3D passes and the
// questions. The partner page lives in partners.js, the admin in admin.js and the 3D
// viewer in viewer.js.
import { formatRpShort, crowdSeats, REAL_KEYS } from './layouts.js';
import { loadScene3d } from './viewer.js';
import { EVENTS, CITY, LISTED, getEvent, eventMeta, placeOf, timeKnown, minPrice, allSoldOut, isConcert, demoFor, onTiket, sellerOf, saleInfo, EVENT_TYPES, typeOf, optionsOf, isCard } from './events.js';
import { cardImg, eventImg, kindCover, posterFig, posterImg, thumbImg } from './media.js';
import { picker } from './picker.js';
import { whenOf, startOf, venueClock, gapText } from './when.js';
import { waTiles } from './fans.js';
import { justBought, buyUrl, buyAttrs, buyLink, passes, activePass, claim, holdPass, refresh, passLink, clicksFor, STATUS, markVerified, sendCode, useCode } from './passes.js';
import { checkClaim, formatFee } from './rules.js';
import { ACCESS_FEE, PAY_MINUTES, line, email as cleanEmail, isEmail } from './order.js';
import { signIn, PROVIDERS } from './sso.js';
import { PAY_GROUPS, PAY_METHODS, payMethod, payDetails, wayName } from './paymethods.js';
import { loadSnap, embedSnap, hideSnap } from './snap.js';
import { FAQ_FANS, faqHtml } from './content.js';
import { $, $$, esc, icon, state, QUALITY, entranceTicket, share, copyText, bindSubscribe, toast, pageToTop, countdownHtml, tickCountdowns } from './ui.js';

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
// The tag on an event page and what its 3D block looks at, by the kind of event.
const TYPE_TAG = { football: 'Football', sport: 'Sport', combat: 'Fight night', cinema: 'Cinema', theatre: 'Theatre' };
const SEE_WHAT = { football: 'pitch', sport: 'court', combat: 'ring', cinema: 'screen' };
// What the ticket card calls its pass, by the kind of event.
const PASS_LABEL = { football: 'Match pass', sport: 'Match pass', combat: 'Fight pass', cinema: 'Cinema pass', theatre: 'Show pass' };
// A film stays on the lists through its run (`until`), a show for a day after it starts.
export const upcoming = e => (e.until ? Date.parse(e.until) : startOf(e)) + DAY > Date.now();
export const byDate = (a, b) => startOf(a) - startOf(b);
export const onSale = () => EVENTS.filter(upcoming).sort(byDate);
export const featured = () => EVENTS.find(e => e.featured && upcoming(e)) || onSale()[0] || EVENTS[0];
// All dates of one show (BTS plays three nights), soonest first.
// Other dates of the show; another ticket class of the same showing is not another date.
export const datesOf = e => (optionsOf(e).length > 1 ? [e] : EVENTS.filter(x => x.title === e.title)).sort(byDate);
// The lowest price over a showing's ticket classes.
const fromOf = e => { const p = optionsOf(e).map(x => minPrice(x.id)).filter(x => x != null); return p.length ? Math.min(...p) : null; };

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
      : v.court === 'tennis' ? rect(fx, fz, 23.77, 10.97, 1, 'focus')
      : v.kind === 'combat' ? `<circle cx="${px(fx)}" cy="${pz(fz)}" r="${(4.5 * k).toFixed(1)}" class="focus"/>`
        : v.kind === 'stadium' ? rect(fx, fz, 105, 68, 4, 'focus')
          : v.kind === 'cinema' ? `<rect x="${(+px(fx) - 4.8 * k).toFixed(1)}" y="${(+pz(fz) - 2).toFixed(1)}" width="${(9.6 * k).toFixed(1)}" height="4" rx="2" class="focus"/>`
            : rect(fx, fz, 20, 9, 2, 'focus');
  return `<svg class="tpl-map" viewBox="0 0 ${W} ${H}" aria-hidden="true">${focus}
    ${Object.entries(paths).map(([cat, d]) => (cat === 'all' ? `<path class="free" d="${d}" ${dot}/>` : `<path d="${d}" stroke="${esc(v.catById[cat].color)}" ${dot}/>`)).join('')}</svg>`;
}

// Where the price is printed: the seller's name with it.
const priceTag = (e, from) => (from == null ? `<small>Tickets on</small><b>${esc(sellerOf(e))}</b>` : `<small>From, on ${esc(sellerOf(e))}</small><b>${formatRpShort(from)}</b>`);

// The dates a pass stands for, as its corner prints them: "30 JAN 2027", "16 & 17 JAN 2027",
// "26, 27 & 29 DEC 2026", "1–4 MAR 2027", or "30 DEC 2026 – 2 JAN 2027" across months.
function datesText(list) {
  const p = list.map(x => whenOf(x).pill.split(' ')), [d0, m0, y0] = p[0], [dN, mN, yN] = p[p.length - 1];
  if (p.length === 1) return p[0].join(' ');
  if (m0 !== mN || y0 !== yN) return `${d0} ${m0}${y0 === yN ? '' : ` ${y0}`} – ${dN} ${mN} ${yN}`;
  if (p.length > 3) return `${d0}–${dN} ${m0} ${y0}`;
  const days = p.map(x => x[0]);
  return `${days.slice(0, -1).join(', ')} & ${dN} ${m0} ${y0}`;
}

// The pass's name sits on one line when it still prints large there (30px on a 286px
// card), else on two, split where the longer line is shortest; the card's width sets the
// size (see .tkt-title). Widths are Inter Bold capitals at the title's tracking, in ems.
const GLYPH = Object.fromEntries([
  [0.2, ' '], [0.25, 'I'], [0.3, "'.,:!"], [0.4, '1'], [0.43, '-'], [0.53, 'L?'], [0.55, 'FJ7'],
  [0.57, 'E'], [0.59, '25'], [0.62, 'PRS3689'], [0.63, 'BTZ'], [0.64, '04&'], [0.69, 'DK'],
  [0.7, 'UYCX'], [0.71, 'AHV'], [0.72, 'G'], [0.73, 'N'], [0.74, 'OQ'], [0.9, 'M'], [1, 'W'],
].flatMap(([w, cs]) => [...cs].map(c => [c, w])));
const emOf = t => [...t.toUpperCase()].reduce((w, c) => w + (GLYPH[c] ?? 0.7), 0);
function titleLines(t) {
  const one = emOf(t), words = t.split(' ');
  if (286 / one >= 30 || words.length < 2) return { lines: [t], em: one };
  return words.slice(1).reduce((best, _, i) => {
    const lines = [words.slice(0, i + 1).join(' '), words.slice(i + 1).join(' ')];
    const em = Math.max(...lines.map(emOf));
    return em < best.em ? { lines, em } : best;
  }, { lines: [t], em: Infinity });
}

// The home page's cards are concert passes: the poster behind, the logo and the date and
// venue in the top corners, the name just above the perforation, and the price where a
// ticket prints it. `run` makes one pass stand for every coming date of the show. Cards carry
// no sold-out marks: what Atvents sells, the 3D seat view, never sells out. Concert tickets
// that the seller has run out of are said in a note when the fan clicks through to the
// seller (js/soldpop.js). The whole pass opens its page.
function ticketCard(e, opts = {}) {
  const v = placeOf(e);
  const dates = opts.run ? datesOf(e).filter(x => x === e || upcoming(x)) : [e];
  const live = dates.find(x => !allSoldOut(x)) || e, from = fromOf(live), name = titleLines(e.title);
  const tags = [];
  if (dates.some(x => activePass(x.id))) tags.push(`<span class="tag tag-coral">${icon('i-eye')}3D pass</span>`);
  return `<article class="ev tkt">
    <div class="tkt-bg">${cardImg(e, `${v.name}, ${v.city}`)}</div>
    <div class="tkt-in">
      <div class="tkt-top">
        <span class="tkt-brand">${icon('i-mark')}<span>atvents<small>3D seat view</small></span></span>
        <p class="tkt-when"><b>${datesText(dates)}</b>${typeOf(e) === 'cinema' ? '' : `<span>${esc(v.name)}, ${keep(esc(v.city))}</span>`}</p>
      </div>
      ${tags.length ? `<p class="tkt-tags">${tags.join('')}</p>` : ''}
      <h3 class="tkt-title" style="--em:${name.em.toFixed(2)}"><a class="ev-link" href="#event-${e.id}">${name.lines.map(esc).join('<br> ')}</a></h3>
      <div class="tkt-cut" aria-hidden="true"></div>
      <div class="tkt-foot">
        <div class="tkt-code"><small>${PASS_LABEL[typeOf(e)] || 'Concert pass'}</small><i class="barcode"></i></div>
        <p class="tkt-price">${priceTag(live, from)}</p>
      </div>
    </div></article>`;
}

// One card a show, soonest first, for the home page and "more concerts".
const oncePerShow = list => list.filter((e, i, all) => all.findIndex(x => x.title === e.title) === i).map(e => (isCard(e) ? e : optionsOf(e)[0]));

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

// A category as a white entrance ticket. The whole ticket is the link out to tiket.com. A
// category the seller has sold out of looks the same: the note comes on the click (js/soldpop.js).
function catTicket(e, c, { dark = false, meta } = {}) {
  return entranceTicket({
    ev: e.title, sub: c.name, code: code(c), price: c.price, href: esc(buyUrl(e)), attrs: buyAttrs(e, c.id),
    buy: 'Buy', dark, date: whenOf(e).pill, city: cityCode(e), na: c.note || (c.price == null ? `Price on ${sellerOf(e)}` : ''),
    meta: meta ?? (onTiket(e) ? '<span>Opens tiket.com · 3D seat view included</span>' : `<span>Opens ${esc(sellerOf(e))} · not sold on tiket.com</span>`),
  });
}

// ---------------------------------------------------------------- home

// The kinds of event on the home page, one card each. `types` are typeOf values; `demo` the
// layout whose render stands in when nothing of that kind is on sale.
const KINDS = [
  { key: 'concert', name: 'Concerts', title: 'Concerts', one: 'concert', types: ['concert'], what: 'Arenas and stadiums', demo: 'concert' },
  { key: 'sports', name: 'Sport', title: 'Football & sport', one: 'match', many: 'matches', types: ['football', 'sport', 'combat'], what: 'Pitches, courts and rings', demo: 'stadium' },
  { key: 'cinema', name: 'Cinema', title: 'Cinema', one: 'film', types: ['cinema'], what: 'Studios, row by row', demo: 'cinema' },
  { key: 'festival', name: 'Festivals', title: 'Festivals', one: 'festival', types: ['festival'], what: 'Open-air stages and festival floors', demo: 'stadium-end' },
];
const KIND_TYPES = Object.fromEntries(KINDS.map(k => [k.key, k.types]));

let homeBound = false;

export function renderHome() {
  if (!homeBound) {
    homeBound = true;
    bindSubscribe($('#news-form'), { kind: 'newsletter', done: 'You’re on the list. The next big concert lands in your inbox.' }, $('#news-msg'));
  }
  // One row per kind of event, with its name, nearest first: concerts, then festivals, films
  // and sport when any are on sale. Four show at once; the rest scroll sideways.
  const near = oncePerShow(onSale());
  $('#home-events').innerHTML = [KINDS[0], KINDS[3], KINDS[2], KINDS[1]].map(k => {
    const all = near.filter(e => k.types.includes(typeOf(e))), row = all.slice(0, 12);
    return row.length ? `<div class="home-row">
      <div class="home-row-head"><h3>${esc(k.title)}</h3><a class="pill-link" href="#events-${k.key}">See all ${plural(all.length, k.one, k.many)} ${icon('i-arrow')}</a></div>
      <div class="tkt-grid home-row-cards">${row.map(e => ticketCard(e, { run: true })).join('')}</div>
    </div>` : '';
  }).join('');

  // One card per kind of event we cover, each opening the list filtered to it. A kind with
  // nothing on sale yet still shows, with its 3D venue and the alerts.
  const shows = oncePerShow(onSale());
  $('#home-venues').innerHTML = KINDS.map((k, i) => {
    const list = shows.filter(e => k.types.includes(typeOf(e)));
    const from = Math.min(...list.map(e => minPrice(e.id) ?? Infinity));
    const venues = new Set(list.map(e => placeOf(e).name)).size;
    return `<a class="venue" href="${list.length ? `#events-${k.key}` : '#news-form'}">
      <div class="venue-cover">${kindCover(k.key, `${k.title}: the view from a seat`)}</div>
      <div class="venue-body">
        <span class="venue-n">0${i + 1} · ${esc(k.name)}</span>
        <h3>${esc(k.title)}</h3>
        <p>${esc(k.what)}${venues ? ` · ${plural(venues, 'venue')} in 3D` : ''}</p>
        <div class="venue-foot"><span>${list.length ? plural(list.length, k.one, k.many) : 'Coming soon · get the alerts'}${from < Infinity ? ` · from <b>${formatRpShort(from)}</b>` : ''}</span><span class="go">${icon('i-arrow')}</span></div>
      </div></a>`;
  }).join('');

  $('#home-faq').innerHTML = faqHtml(FAQ_FANS, ['price', 'unlock', 'pay', 'seller', 'footage']);
  renderNews();
  bindFootageForm();
}

// ---------------------------------------------------------------- concert updates

// The latest on the big shows, from the concert list itself: sales opening soon, sales
// that opened in the last weeks, shows coming up in the next month and categories sold
// out. Newest news first; each line opens the concert.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMon = ms => { const d = new Date(ms); return `${d.getDate()} ${MON[d.getMonth()]}`; };
export function concertNews(now = Date.now()) {
  const items = [];
  for (const e of oncePerShow(onSale())) {
    const sale = saleInfo(e, now), start = startOf(e), v = placeOf(e), n = datesOf(e).length;
    const dates = n > 1 ? `${n} dates from ${whenOf(e).date}` : whenOf(e).date;
    if (sale?.soon) items.push({ e, at: now + 1, tag: 'Sale soon', text: `Tickets for ${e.title} go on sale ${sale.date} on ${sellerOf(e)}.` });
    else if (sale && now - sale.ms < 45 * DAY) items.push({ e, at: sale.ms, tag: 'On sale', text: `${e.title}: tickets on sale on ${sellerOf(e)} since ${sale.date}. ${dates}, ${v.name}.` });
    if (start - now < 31 * DAY) items.push({ e, at: now, tag: start - now < 8 * DAY ? 'This week' : 'Coming up', text: `${e.title} plays ${v.name}, ${dates}.${timeKnown(e) ? ` Show starts ${whenOf(e).time}.` : ' Times still to be announced.'}` });
    // No sold-out news: it reads as if the 3D seat view were gone. The seller's stock is said on the way out (js/soldpop.js).
  }
  return items.sort((a, b) => b.at - a.at);
}

function renderNews() {
  const list = concertNews().slice(0, 8);
  $('#news-stamp').textContent = `Updated ${LISTED}.`;
  $('#home-news').innerHTML = list.map(n => `<li><a href="#event-${n.e.id}">
      <span class="nl-tag${n.tag === 'Sale soon' || n.tag === 'This week' ? ' is-hot' : ''}">${esc(n.tag)}</span>
      <span class="nl-text">${esc(n.text)}</span>
      <span class="nl-when">${esc(dayMon(n.tag === 'On sale' ? n.at : startOf(n.e)))}</span>
      <span class="go">${icon('i-arrow')}</span>
    </a></li>`).join('');
}

// ---------------------------------------------------------------- footage (coming soon)

// Not on sale yet: the page shows what is coming, per concert, and takes emails for the
// waiting list. Nothing here can be bought.
export function renderFootage() {
  const shows = oncePerShow(onSale()).slice(0, 6);
  $('#footage-grid').innerHTML = shows.map(e => `<li class="fg-card">
      <div class="fg-media">${eventImg(e, '')}<span class="fg-play" aria-hidden="true">${icon('i-play')}</span><span class="soon-tag">Coming soon</span></div>
      <div class="fg-body"><b>${esc(e.title)}</b><small>${esc(whenOf(e).date)} · ${esc(placeOf(e).name)}</small><span class="fg-price">Clips and photos · price to come</span></div>
    </li>`).join('');
  bindFootageForm();
}

let footageBound = false;
function bindFootageForm() {
  if (footageBound || !$('#footage-form')) return;
  footageBound = true;
  bindSubscribe($('#footage-form'), { kind: 'footage', done: 'You’re on the list. We write once, when footage goes on sale.' }, $('#footage-msg'));
}

// ---------------------------------------------------------------- concert list

const listQuery = { q: '', type: 'all' };
let typePicker = null;

export function renderConcerts() {
  if (!typePicker) {
    $('#concerts-q').addEventListener('input', e => { listQuery.q = e.target.value; renderConcerts(); });
    typePicker = picker($('#concerts-type'), { name: 'Type of event', label: 'Type', onPick: v => { listQuery.type = v; history.replaceState(null, '', '#events'); renderConcerts(); } });
  }
  // #events-<kind> (a home page card) opens the list filtered to that kind.
  const fromHash = location.hash.match(/^#events-(\w+)/)?.[1];
  if (fromHash) listQuery.type = fromHash;
  const q = listQuery.q.trim().toLowerCase();
  const match = e => !q || [EVENT_TYPES[typeOf(e)], e.title, e.subtitle, e.host, placeOf(e).name, placeOf(e).city].join(' ').toLowerCase().includes(q);
  const all = onSale().filter(isCard);
  // The dropdown offers only the kinds of event on sale now, with a count each. Its list
  // scrolls after a few rows, so more kinds never make it run down the page.
  // "All sport" joins football, tennis and fights when more than one of them is on sale.
  const isType = (t, e) => t === 'all' || (KIND_TYPES[t] || [t]).includes(typeOf(e));
  const kinds = Object.keys(EVENT_TYPES).map(t => [t, all.filter(e => typeOf(e) === t).length]).filter(([, n]) => n);
  const sportKinds = kinds.filter(([t]) => KIND_TYPES.sports.includes(t));
  if (sportKinds.length > 1) kinds.splice(kinds.indexOf(sportKinds[0]), 0, ['sports', all.filter(e => isType('sports', e)).length]);
  if (listQuery.type !== 'all' && !kinds.some(([t]) => t === listQuery.type)) listQuery.type = sportKinds.length === 1 && listQuery.type === 'sports' ? sportKinds[0][0] : 'all';
  typePicker.set([['all', all.length], ...kinds].map(([t, n]) => ({ value: t, label: t === 'all' ? 'All events' : t === 'sports' ? 'All sport' : EVENT_TYPES[t], note: String(n) })), listQuery.type);
  const list = all.filter(e => isType(listQuery.type, e)).filter(match).sort(byDate);
  $('#concerts-count').textContent = `${plural(all.length, 'event')} on sale, as listed in ${LISTED}. Prices as announced; tiket.com has the live price.`;
  $('#concerts-grid').innerHTML = list.length ? list.map(e => ticketCard(e)).join('')
    : `<div class="empty-state"><h3>Nothing matches.</h3><p>${q ? `No event matches “${esc(listQuery.q.trim())}”.` : 'No concerts on sale right now.'} New shows are added as they go on sale: get the concert alerts on the home page to hear first.</p>${q ? '<button class="btn btn-line" type="button" id="concerts-clear">Clear the search</button>' : ''}</div>`;
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
  // Phones keep the cover picture: a second live venue behind a page being scrolled is what
  // makes them stutter, and the 3D view itself is one tap away.
  if (navigator.connection?.saveData || matchMedia('(max-width: 760px)').matches) return;
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
  const opts = optionsOf(e);
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
          <a class="back-link" href="#concerts">${icon('i-back')}All events</a>
          <div class="tags"><span class="tag tag-coral">${esc(TYPE_TAG[typeOf(e)] || 'Concert')}</span><span class="tag tag-white">${dm.dow} ${dm.day} ${dm.mon}</span>${pass ? `<span class="tag tag-line">${icon('i-eye')}3D pass on this device</span>` : ''}</div>
          <p class="ev-blurb">${esc(e.blurb)}</p>
          ${live && saleInfo(e) ? `<p class="ev-sale">${icon('i-cal')}<span>${esc(saleInfo(e).line)}</span></p>` : ''}
          ${opts.length > 1 ? `<p class="ev-dates ev-opts">Ticket class ${opts.map(x => `<a class="pill" href="#event-${x.id}"${x === e ? ' aria-current="page"' : ''}>${esc(x.option)}<span>${formatRpShort(minPrice(x.id))}</span></a>`).join('')}</p>` : ''}
          ${others.length ? `<p class="ev-dates">Also on ${others.map(x => `<a class="pill" href="#event-${x.id}">${esc(whenOf(x).block.dow)} ${whenOf(x).block.day} ${whenOf(x).block.mon}</a>`).join('')}</p>` : ''}
          ${live ? `<p class="ev-official">${icon('i-link')}<span>Tickets are sold by ${esc(sellerOf(e))}, the official seller. The 3D view from your seat is sold here for ${formatFee()} and opens as soon as you pay.</span></p>`
            : '<p class="ev-official">This concert has taken place. Its 3D venue stays open to look round.</p>'}
          <div class="row-btns">${pass?.status === 'confirmed' ? `<a class="btn btn-coral" href="#tour-${esc(pass.id)}">Start my seat tour ${icon('i-arrow')}</a>` : live ? `<a class="btn btn-coral" href="#unlock-${id}">Unlock my seat view · ${formatFee()} ${icon('i-arrow')}</a>` : ''}${live ? buyLink(e, `Tickets on tiket.com ${out}`, 'btn btn-line') : ''}${live || pass?.status === 'confirmed' ? '' : `<a class="btn btn-line" href="#seats-${id}">Look round in 3D</a>`}</div>
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
        <div><dt>When</dt><dd>${esc(w.date)}<small>${timeKnown(e) ? esc([doorsKnown(e) && `Doors ${clock(e, e.doors)}`, `Start ${w.time}`, e.ends && `ends ${clock(e, e.ends)}`].filter(Boolean).join(' · ')) : typeOf(e) === 'cinema' ? 'Now showing: times for each cinema on m.tix' : 'Times to be announced by the promoter'}</small>${w.local ? `<small>${esc(w.local)}</small>` : ''}</dd></div>
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
      ${(() => {
        // The bar counts down to the day of the show; a film says it is showing now.
        const at = startOf(e);
        if (typeOf(e) === 'cinema') return live ? `<span class="ev-from"><small>Now showing</small><b>${esc(sellerOf(e))}</b></span>` : '';
        if (at > Date.now()) return `<div class="ev-count"><small>Starts in</small>${countdownHtml(new Date(at).toISOString())}</div>`;
        return live ? '<span class="ev-from"><small>Today</small><b>On now</b></span>' : '';
      })()}
    </div>`;

  tickCountdowns();
  render3dPanel(e, venue);

  $('#ev-tickets-note').textContent = `${e.about.find(p => p.startsWith('Prices as announced')) || 'Prices as announced by the promoter.'} Each ticket opens the ${typeOf(e) === 'concert' ? 'concert' : 'event'} on ${sellerOf(e)}.`;
  // A stand-in show lists the promoter's own categories, when we have them.
  $('#ev-cats').innerHTML = (e.tickets || venue.categories).map((c, i) => catTicket(e, c, { dark: i === 0, meta: live ? undefined : '<span>This concert has taken place.</span>' })).join('');

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

  $('#ev-faq').innerHTML = faqHtml(FAQ_FANS, ['price', 'unlock', 'seller', 'tour', 'official']);

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
        <li><b>2</b><span>Fill in your seat, your name and your email, and pay ${formatFee()}.</span></li>
        <li><b>3</b><span>Your pass opens at once: the tour takes you to the view from your seat.</span></li>
      </ol>
      <div class="row-btns"><a class="btn btn-coral" href="#seats-${id}">Look round in 3D ${icon('i-arrow')}</a></div>`;
  startEventHero(id);
  $('#ev-3d').innerHTML = `
    <div class="ev3d">
      <a class="ev3d-map" href="#seats-${id}" aria-label="Open the 3D venue">${dotMap(venue, { byCat: true })}</a>
      <div class="ev3d-side">
        <p class="eyebrow">Your seat, in 3D</p>
        <h2 class="big big-sm"><span class="fade">See the ${SEE_WHAT[typeOf(e)] || 'stage'}</span> <span class="ol">from your seat</span></h2>
        ${action}
        <ul class="cat-key">${venue.categories.map(c => `<li><i style="background:${esc(c.color)}"></i><span>${esc(c.name)}</span><b>${c.price == null ? '' : formatRpShort(c.price)}</b></li>`).join('')}</ul>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- unlock a 3D pass

let unlockBound = false;

// One way in: the fan fills in the concert, the seat (picked from the venue's own seat
// list, so a seat that does not exist cannot be sent), their name and email, then pays the
// access fee. The pass opens as soon as the payment goes through. `eventId` comes from
// #unlock-<id>; without it, the first concert on sale. The name and email come from Google
// or Microsoft (js/sso.js), or are typed: `who` is who signed in, `typing` that the fan
// chose to type them. Continue stays greyed out until every field is filled. `fixed`: the
// concert was chosen on the page before, so it is shown, not asked again.
const unlock = { payment: null, data: null, again: null, method: '', who: null, typing: false, fixed: false };

// Phones, "My seat 3D": the concerts on sale as cards in a sheet that rises from the bottom,
// in place of a dropdown that grows with every concert. A search field once there are many.
let evSheet = null, evSheetFrom = null;
function closeEvSheet() {
  if (!evSheet || evSheet.hidden) return;
  evSheet.hidden = true;
  document.documentElement.classList.remove('has-evsheet');
  evSheetFrom?.focus?.();
}
function openEvSheet(list) {
  if (!evSheet) {
    evSheet = document.createElement('div');
    evSheet.className = 'evsheet';
    evSheet.hidden = true;
    document.body.append(evSheet);
    evSheet.addEventListener('click', ev => {
      if (ev.target === evSheet || ev.target.closest('[data-es-close]') || ev.target.closest('.evsheet-grid a')) setTimeout(closeEvSheet, 0);
    });
    evSheet.addEventListener('input', ev => {
      if (!ev.target.matches('.evsheet-find input')) return;
      const q = ev.target.value.trim().toLowerCase();
      let shown = 0;
      evSheet.querySelectorAll('.evsheet-grid li').forEach(li => { const on = !q || li.dataset.q.includes(q); li.hidden = !on; shown += on; });
      evSheet.querySelector('.evsheet-none').hidden = shown > 0;
    });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeEvSheet(); });
    window.addEventListener('hashchange', closeEvSheet);
  }
  evSheet.innerHTML = `
    <div class="evsheet-card" role="dialog" aria-modal="true" aria-labelledby="es-title">
      <div class="evsheet-head"><div><h2 id="es-title">Choose your concert</h2><small>${list.length} on sale</small></div>
        <button class="evsheet-x" type="button" data-es-close aria-label="Close">${icon('i-x')}</button></div>
      ${list.length > 6 ? `<label class="evsheet-find">${icon('i-search')}<input type="search" placeholder="Search a concert or venue" aria-label="Search a concert"></label>` : ''}
      <div class="evsheet-body">
        <ul class="evsheet-grid">${list.map(e => `<li data-q="${esc(`${e.title} ${placeOf(e).name}`.toLowerCase())}"><a href="#unlock-${esc(e.id)}">
          <span class="evsheet-img">${posterImg(e)}</span><b>${esc(e.title)}</b><small>${esc(whenOf(e).date)}</small><small>${esc(placeOf(e).name)}</small></a></li>`).join('')}</ul>
        <p class="evsheet-none" hidden>No concert by that name.</p>
      </div>
    </div>`;
  evSheetFrom = document.activeElement;
  evSheet.hidden = false;
  document.documentElement.classList.add('has-evsheet');
  evSheet.querySelector('.evsheet-x').focus();
}

export function renderUnlock(eventId) {
  const form = $('#unlock-form');
  if (!unlockBound) { unlockBound = true; bindUnlock(form); }
  $('#unlock-done')?.remove();
  $('#unlock-body').hidden = false;
  $('#unlock-error').hidden = true;
  $('#pay-test').hidden = !state.store.sandbox;
  closePay(form);
  // From the tab, the menu or Unlock 3D with no concert in hand: the events on sale first, as
  // cards; one tap opens the form for it (#unlock-<id>), poster and all.
  // A concert that has taken place sells no more passes: its link opens the list instead.
  if (isConcert(eventId) && !upcoming(eventMeta(eventId))) { eventId = ''; unlock.again = null; }
  const picking = !isConcert(eventId) && !unlock.again;
  $('#uf-pick').hidden = !picking;
  form.hidden = picking;
  if (picking) {
    $('#unlock-note').hidden = true;
    // Wider screens: the events as rows, one tap opens the form for it. Phones ("My seat 3D",
    // the middle tab) get a page of their own that is not a second Events list: what the seat
    // view is, the three steps, one field to choose the concert, and the fan's own seat views.
    const list = onSale();
    // Shows still to come first, then the ones that have taken place.
    const mine = passes.all().filter(p => p.status === 'confirmed' && isConcert(p.eventId))
      .sort((a, b) => !upcoming(eventMeta(a.eventId)) - !upcoming(eventMeta(b.eventId)));
    $('#uf-pick').innerHTML = `
      <div class="uf-desk"><div class="uf-head"><h2>Choose your event</h2><small>Then your seat, then pay</small></div>
      <ul class="uf-pick-list">${list.map(e => `<li><a class="uf-pick-row" href="#unlock-${esc(e.id)}">
        ${posterImg(e)}<span class="uf-event-text"><b>${esc(e.title)}</b><small>${esc(whenOf(e).date)} · ${esc(placeOf(e).name)}</small></span>${icon('i-arrow')}</a></li>`).join('')}</ul></div>
      <div class="s3d-m">
        <figure class="s3d-hero"><img src="assets/tour/seat-640.webp" srcset="assets/tour/seat-640.webp 640w, assets/tour/seat.webp 1200w" sizes="92vw" alt="The stage seen from a seat in 3D" decoding="async">
          <figcaption><span class="s3d-chip">${icon('i-seat')}Seat view in 3D</span><b>See the stage from any seat, before you buy or before the night.</b><small>${formatFee()} · one seat, one concert · opens at once</small></figcaption></figure>
        <ol class="s3d-steps" aria-label="Three steps">
          <li class="is-on"><i>1</i><span>Concert</span></li><li><i>2</i><span>Your seat</span></li><li><i>3</i><span>Pay &amp; view</span></li>
        </ol>
        <button type="button" class="uf-field s3d-select" id="s3d-ev" aria-haspopup="dialog"><small>Which concert?</small><b>Choose your concert</b>${icon('i-down')}</button>
        <p class="s3d-note">${icon('i-seat')}<span>Next you pick the seat: the one on your ticket, or one you are thinking of buying. Category, section, row and seat, then pay.</span></p>
        ${mine.length ? `<div class="s3d-mine"><div class="uf-head"><h2>Your seat views</h2><small>Paid and open</small></div>
          <ul>${mine.map(p => { const e = eventMeta(p.eventId), st = seatIn(p.eventId, p.seat); return `<li><a href="#tour-${esc(p.id)}">${icon('i-seat')}<span><b>${esc(e.title)}</b><small>${upcoming(e) ? '' : 'Event ended · '}${st ? esc(spotStats(st).map(([k, v]) => `${k} ${v}`).join(' · ')) : esc(whenOf(e).date)}</small></span>${icon('i-arrow')}</a></li>`; }).join('')}</ul></div>` : ''}
        <p class="s3d-foot">Just looking? Every concert in ${icon('i-search')}<a class="u" href="#concerts">Events</a> lets you look round its venue from above, free. The 3D view does not include a concert ticket: tickets are sold by the seller on each concert page.</p>
      </div>`;
    $('#s3d-ev').addEventListener('click', () => openEvSheet(list));
    return;
  }
  const all = onSale();
  if (isConcert(eventId) && !all.some(e => e.id === eventId)) all.unshift(eventMeta(eventId));
  const pick = isConcert(eventId) ? eventId : (all.some(e => e.id === form.eventId.value) ? form.eventId.value : all[0]?.id);
  form.eventId.innerHTML = all.map(e => `<option value="${e.id}">${esc(e.title)} · ${esc(whenOf(e).date)}</option>`).join('');
  form.eventId.value = pick;
  unlock.fixed = isConcert(eventId);
  paintEvent(form);
  fillCats(form);
  const again = unlock.again?.eventId === pick ? unlock.again : null;
  unlock.again = null;
  if (again) prefill(form, again);
  if (!unlock.who && (form.name.value || form.email.value)) unlock.typing = true;
  const note = $('#unlock-note');
  if (justBought.id && justBought.id === pick) {
    const e = eventMeta(pick);
    note.innerHTML = `${icon('i-out')}<span>${esc(sellerOf(e))} is open in a new tab for your ticket. When you know your seat, fill it in here to see the view from it.</span>`;
    note.hidden = false;
    justBought.id = '';
  } else note.hidden = true;
  paintWho(form);
  ready(form);
  // Another way to pay for the same order: straight back to the ways, the details kept.
  if (again?.ways) {
    form.consent.checked = true;
    const data = checkForm(form);
    if (data) { unlock.data = data; showWays(form); }
  }
}

// A seat as a pass names it.
const seatText = s => (s.standing ? `${s.secName}, standing` : `${s.secName} · Row ${s.row} · Seat ${s.num}`);
const seatIn = (eventId, seatId) => { const venue = getEvent(eventId), i = venue?.seatById.get(seatId); return i === undefined ? null : venue.seats[i]; };

// The concert. Chosen on the page before (#unlock-<id>), it is shown with its poster, date
// and venue, and Change opens the list; from the menu's Unlock 3D, it is picked from the list.
function paintEvent(form) {
  const e = unlock.fixed ? eventMeta(form.eventId.value) : null, box = $('#uf-event');
  $('#ev-field').hidden = !!e;
  box.hidden = !e;
  box.innerHTML = e ? `${thumbImg(e)}<span class="uf-event-text"><b>${esc(e.title)}</b><small>${esc(whenOf(e).date)} · ${esc(placeOf(e).name)}</small></span>
    ${form.eventId.options.length > 1 ? '<button class="link uf-change" type="button" id="uf-event-change">Change</button>' : ''}` : '';
}

// Where the pass goes: the buttons for Google and Microsoft (each only with its client id
// from /api/config), or the two fields typed. Signed in, the fields are filled and hidden
// behind who it is, with a way to change it.
function paintWho(form) {
  const clients = state.store.sso || {}, any = Object.keys(clients).length > 0, who = unlock.who;
  $$('#uf-sso [data-sso]').forEach(b => { b.hidden = !clients[b.dataset.sso]; });
  $('#uf-sso').hidden = !any || !!who;
  $('#uf-or').hidden = !any || !!who || unlock.typing;
  $('#uf-details').hidden = !!who || (any && !unlock.typing);
  const box = $('#uf-who'), p = who && PROVIDERS[who.provider];
  box.hidden = !who;
  box.innerHTML = who ? `<span class="uf-av" aria-hidden="true">${esc((who.name || who.email).trim().charAt(0).toUpperCase())}</span>
    <span class="uf-who-text"><b>${esc(who.name)}</b><small>${esc(who.email)}</small><span class="uf-ok"><svg><use href="#i-${who.provider}"/></svg>Verified by ${esc(p.name)}</span></span>
    <button class="link uf-change" type="button" id="uf-change">Change</button>` : '';
}

// What is still to fill in, in the form's order. A row or seat counts once its section is
// chosen (they are greyed out before), and the name and email as one when they sit behind
// the sign-in buttons.
function missing(form) {
  const left = [];
  if (!form.cat.value) left.push('cat');
  if (!form.sec.value) left.push('sec');
  else if (!chosenSeat(form)) left.push(form.row.value ? 'num' : 'row');
  const name = line(form.name.value).length >= 2, mail = isEmail(cleanEmail(form.email.value));
  if (!$('#uf-details').hidden) {
    if (!name) left.push('name');
    if (!mail) left.push('email');
  } else if (!unlock.who && (!name || !mail)) left.push('who');
  if (!form.consent.checked) left.push('consent');
  return left;
}

const MISSING = {
  cat: ['the category', 'Choose the category on your ticket.'],
  sec: ['the section', 'Choose the section on your ticket.'],
  row: ['the row', 'Choose your row.'],
  num: ['the seat', 'Choose your seat number.'],
  name: ['your name', 'Please enter your name.'],
  email: ['your email', 'Please enter a valid email. Your pass and receipt go there.'],
  who: ['your email', 'Continue with Google or Microsoft, or type your name and email, so your pass has somewhere to go.'],
  consent: ['the terms', 'Please accept the terms and the privacy policy.'],
};
// The box a missing field is marked on.
const boxOf = (form, k) => (k === 'who' ? $('#uf-sso') : k === 'consent' ? form.consent.closest('.check') : form[k].closest('.uf-field'));

// Continue greys out until nothing is missing; a field marked as missing loses the mark
// once it is filled, and the "still to fill in" line goes once nothing is.
function ready(form) {
  const left = missing(form);
  $('#pay-start').setAttribute('aria-disabled', left.length ? 'true' : 'false');
  for (const k of Object.keys(MISSING)) {
    if (!left.includes(k)) boxOf(form, k)?.classList.remove('is-missing');
  }
  if (!left.length) $('#unlock-error').hidden = true;
  return left;
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
  $('#seat-note').textContent = standing ? 'A standing area: no row or seat number. Choose the area on your ticket; your tour stands you in the middle of it.' : '';
  $('#seat-note').hidden = !standing;
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

// The form filled in again from an order on this device: "Start again", "Change details".
function prefill(form, p) {
  const s = seatIn(p.eventId, p.seat);
  if (s) {
    form.cat.value = s.cat;
    fillSecs(form);
    form.sec.value = s.sec;
    fillRows(form);
    if (!s.standing) { form.row.value = s.row; fillNums(form); form.num.value = s.id; }
  }
  if (p.name) form.name.value = p.name;
  if (p.email) form.email.value = p.email;
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

// The payment, in two steps like a ticket shop's checkout: the form, then the ways to pay
// (js/paymethods.js), each with its logo. With live payments (PayStore) the way the fan picks
// makes the order, the pass waits on this device, and the checkout opens at #paid-<id> with
// what to pay with. In the preview, a stand-in sheet that charges nothing marks it paid.
function checkForm(form) {
  const err = $('#unlock-error');
  const say = (msg, field) => { err.textContent = msg; err.hidden = false; if (field && form[field]) form[field].focus(); return null; };
  // Everything still missing is marked at once, and named.
  const left = ready(form);
  if (left.length) {
    left.forEach(k => boxOf(form, k)?.classList.add('is-missing'));
    const names = left.map(k => MISSING[k][0]);
    const msg = left.length === 1 ? MISSING[left[0]][1] : `Still to fill in: ${names.slice(0, -1).join(', ')} and ${names.at(-1)}.`;
    return say(msg, left[0] === 'who' ? null : left[0]);
  }
  const seat = chosenSeat(form);
  const { claim: data, field, error } = checkClaim({
    eventId: form.eventId.value, cat: form.cat.value, seat, name: form.name.value, email: form.email.value, consent: form.consent.checked, requirePayment: false,
  });
  if (error) return say(error, field);
  err.hidden = true;
  return data;
}

function startPayment(form) {
  const data = checkForm(form);
  if (!data) return;
  unlock.data = data;
  showWays(form);
}

// A phone or tablet, where GoPay and ShopeePay open their app instead of showing a code to
// scan. iPads say they are Macs, but have a touch screen.
const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
// A way to pay's logos, as the merchants draw them, on a white plate. Each logo has its own
// height (.lg-<logo> in css/styles.css), so a wide one and a square one look the same size.
// Always next to the way's name, so the pictures need no text of their own.
const logo = l => `<img class="lg-${l}" src="assets/pay/${l}.webp" alt="" decoding="async">`;
const logos = way => `<span class="pm-logo${way.logos.length > 1 ? ' is-many' : ''}">${way.logos.map(logo).join('')}</span>`;
// The ways switched on (PayStore has the list from /api/config; the preview shows them all),
// without ShopeePay away from a phone: it only pays in its app.
const waysOn = () => PAY_METHODS.filter(m => (!state.store.methods || state.store.methods.includes(m.id)) && (!m.phone || isPhone()));

// The checkout's steps. Before an order is open, the first two lead back to the form.
function stepper(back) {
  const done = label => `<li class="is-done">${back ? `<button class="link" type="button" data-back>${icon('i-check')}${label}</button>` : `<span>${icon('i-check')}${label}</span>`}</li>`;
  return `<ol class="co-stepper" aria-label="Checkout">${done('Seat')}${done('Your details')}<li class="is-on" aria-current="step"><i>3</i><span>Payment</span></li></ol>`;
}

// The order beside the checkout (under it on a phone): the concert and the seat, who the
// pass is for, the total and the way to pay. On the first screen it holds the one Pay
// button, which a phone pins to the bottom of the screen.
function orderCard(p, way, { go = false } = {}) {
  const e = eventMeta(p.eventId), s = seatIn(p.eventId, p.seat), fee = formatFee();
  const to = p.email ? (state.store.mail ? `Your pass goes to <b>${esc(p.email)}</b>` : `${esc(p.name || '')} · ${esc(p.email)}`) : '';
  return `<aside class="co-sum${go ? ' is-go' : ''}" aria-label="Your order">
      <div class="co-sum-ev">${thumbImg(e)}<span><b>${esc(e?.title || '3D seat view')}</b>${e ? `<small>${esc(whenOf(e).date)} · ${esc(placeOf(e).name)}</small>` : ''}${s ? `<small>${esc(seatText(s))}</small>` : ''}</span></div>
      ${to ? `<p class="co-sum-to">${icon('i-mail')}<span>${to}</span></p>` : ''}
      <dl class="co-sum-lines">
        <div><dt>3D seat view × 1</dt><dd>${fee}</dd></div>
        <div><dt>Service fee</dt><dd>Free</dd></div>
        <div class="co-total"><dt>Total</dt><dd>${fee}</dd></div>
      </dl>
      <div class="co-sum-way" id="co-sum-way">${wayLine(way)}</div>
      ${go ? `<p class="co-error" id="pm-error" role="alert" hidden></p>
      <div class="co-go-row"><span class="co-go-total"><small>Total</small><b>${fee}</b></span>${goButton(way)}</div>
      ${payNotes('co-sum-notes')}` : ''}
    </aside>`;
}
const wayLine = way => (way ? `${logos(way)}<span>Paying with <b>${esc(wayName(way))}</b></span>` : '<span class="co-sum-none">Choose a way to pay</span>');
// "Pay Rp25.000" beside the total on a laptop, "Pay with BCA" on a phone's bar.
const goButton = way => `<button class="btn btn-coral btn-block co-go" type="button" id="pay-go" aria-disabled="${way ? 'false' : 'true'}"><span class="co-go-wide">Pay ${formatFee()}</span><span class="co-go-narrow">${way ? esc(way.id === 'card' ? 'Pay by card' : `Pay with ${way.name}`) : 'Pay'}</span>${icon('i-arrow')}</button>`;
const payNotes = cls => `<div class="${cls}">${state.store.sandbox ? '<p class="fine pay-test">Test mode: this payment goes to the Midtrans Sandbox, and nothing is charged.</p>' : ''}<p class="fine co-safe">${icon('i-lock')}<span>Payments run through Midtrans. Card numbers go into Midtrans’ own form and never reach us.</span></p></div>`;
// On a phone, the order in one line above the ways to pay.
function miniOrder(p) {
  const e = eventMeta(p.eventId), s = seatIn(p.eventId, p.seat);
  return `<div class="co-mini">${thumbImg(e)}<span><b>${esc(e?.title || '3D seat view')}</b>${s ? `<small>${esc(seatText(s))}</small>` : ''}</span><b class="co-mini-fee">${formatFee()}</b></div>`;
}

function openSheet(form) {
  form.hidden = true;
  $('#pay-sheet').hidden = false;
  $('#unlock-body').classList.add('is-paying');
}

// Step three: how to pay, like a ticket shop's checkout. The ways come in groups that fold,
// one radio each; the one chosen goes beside the total, and the Pay button makes the order.
function showWays(form) {
  const data = unlock.data, sheet = $('#pay-sheet'), ways = waysOn();
  stopCheckout();
  if (!ways.some(m => m.id === unlock.method)) unlock.method = '';
  openSheet(form);
  sheet.innerHTML = `${stepper(true)}
    <div class="co-top">
      ${miniOrder(data)}
      <h2 class="pay-state">Choose how to pay</h2>
    </div>
    <div class="co-cols">
      <div class="co-main">
        ${teamBlock()}
        <div class="pm-groups">${PAY_GROUPS.map(g => wayGroup(g, ways.filter(m => m.group === g.id))).join('')}</div>
        ${payNotes('co-main-notes')}
      </div>
      ${orderCard(data, payMethod(unlock.method), { go: true })}
    </div>`;
  // After the router's own scroll to the top of the page.
  requestAnimationFrame(() => sheet.scrollIntoView({ block: 'start' }));
}

// A member of the team (js/team.js), signed in on #admin: the pass opens without paying.
const teamBlock = () => {
  const t = state.store.teamKey;
  return t ? `<div class="co-team"><p><b>Akses tim</b> · ${esc(t.email)}<small>Pass ini terbuka tanpa bayar dan tanpa Midtrans.</small></p>
    <button class="btn btn-coral" type="button" id="pay-team">Buka gratis (tim) ${icon('i-arrow')}</button><p class="co-error" id="team-pay-error" role="alert" hidden></p></div>` : '';
};
async function teamOpen(form, btn) {
  const data = unlock.data, err = $('#team-pay-error');
  if (!data) return closePay(form);
  btn.disabled = true;
  err.hidden = true;
  try {
    const p = await state.store.teamPass({ eventId: data.eventId, cat: data.cat, seat: data.seat, name: data.name });
    holdPass(p);
    location.hash = `#paid-${p.id}`;
  } catch (e) {
    err.textContent = e.status === 401 ? 'Sesi tim habis. Masuk lagi di halaman Admin.' : e.message || 'Tidak bisa membuka pass. Coba lagi.';
    err.hidden = false;
    btn.disabled = false;
  }
}

// A group of ways: open for the wallets and the banks, and for a way already chosen. Folded,
// it names its ways and shows their logos.
const OPEN_GROUPS = new Set(['wallet', 'va']);
const GROUP_ICON = { wallet: 'i-wallet', va: 'i-bank', card: 'i-card', store: 'i-store' };
function wayGroup(g, list) {
  if (!list.length) return '';
  const open = OPEN_GROUPS.has(g.id) || list.some(m => m.id === unlock.method);
  return `<details class="pm-group"${open ? ' open' : ''}>
      <summary>${icon(GROUP_ICON[g.id])}<span class="pm-gt"><b>${esc(g.name)}</b><small>${esc(list.map(m => m.name).join(', '))}</small></span><span class="pm-mini">${list.flatMap(m => m.logos).slice(0, 4).map(logo).join('')}</span>${icon('i-down')}</summary>
      <div class="pm-list">${list.map(wayRow).join('')}</div>
    </details>`;
}
const wayRow = m => `<label class="pm${m.id === unlock.method ? ' is-on' : ''}" data-method="${m.id}">
        <input type="radio" name="pm" value="${m.id}"${m.id === unlock.method ? ' checked' : ''}>
        ${logos(m)}
        <span class="pm-text"><b>${esc(wayName(m))}</b>${m.note ? `<small>${esc(m.note)}</small>` : ''}</span>
      </label>`;

// A way chosen: it goes beside the total and onto the Pay button.
function pickWay(method) {
  const way = waysOn().find(m => m.id === method);
  if (!way) return;
  unlock.method = way.id;
  $$('#pay-sheet .pm').forEach(r => r.classList.toggle('is-on', r.dataset.method === way.id));
  $('#co-sum-way').innerHTML = wayLine(way);
  $('#pay-go').outerHTML = goButton(way);
  $('#pm-error').hidden = true;
}

function goPay(form, btn) {
  if (!unlock.method) {
    const err = $('#pm-error');
    err.textContent = 'Choose how you want to pay first.';
    err.hidden = false;
    $('#pay-sheet .pm-groups').scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  chooseWay(form, unlock.method, btn);
}

async function chooseWay(form, method, btn) {
  const data = unlock.data;
  if (!data) return closePay(form);
  const all = $$('#pay-sheet input[name=pm], #pay-go'), err = $('#pm-error');
  all.forEach(b => { b.disabled = true; });
  btn.classList.add('is-busy');
  err.hidden = true;
  let leaving = false;   // the buttons stay off while the next screen loads
  try {
    const p = await state.store.pay({ eventId: data.eventId, cat: data.cat, seat: data.seat, name: data.name, email: data.email, consent: true, method });
    if (state.store.live) {
      const held = holdPass(p);
      leaving = true;
      // A card without the client key: Midtrans' own card page, then back.
      if (held.method === 'card' && !state.store.clientKey && held.url) location.assign(held.url);
      else location.hash = `#paid-${p.id}`;   // the checkout (renderPaid)
      return;
    }
    unlock.payment = p;
    if (p.url) { leaving = true; location.href = p.url; return; }
    previewSheet(p, data, payMethod(method));
  } catch (e) {
    if (e.field && e.field !== 'method' && form[e.field]) {
      closePay(form);
      $('#unlock-error').textContent = e.message;
      $('#unlock-error').hidden = false;
      form[e.field].focus();
      return;
    }
    err.textContent = e.status === 429 ? 'Too many tries. Please wait a minute.' : e.message || 'The payment could not start. Please try again.';
    err.hidden = false;
  } finally {
    if (!leaving) { all.forEach(b => { b.disabled = false; }); btn.classList.remove('is-busy'); }
  }
}

// The preview's stand-in for the live checkout: nothing is charged.
const WHAT = { va: 'the virtual account number to transfer to', bill: 'the bill key to pay', qr: 'the QR code to scan', app: 'the button that opens the app', store: 'the code to show at the cashier', card: 'Midtrans’ card form' };
function previewSheet(p, data, way) {
  $('#pay-sheet').innerHTML = frame(`
      <p class="eyebrow">${icon('i-card')}Payment</p>
      <h2 class="pay-state">Pay ${formatFee(p.amount)}${way ? ` with ${esc(wayName(way))}` : ''}</h2>`, `
      <p class="fine">Preview mode: no payment provider is connected yet, so nothing is charged. On the live site, ${way ? `${esc(wayName(way))} shows ${WHAT[way.kind]}` : 'the way you chose opens'} right on this page, and your pass opens by itself once it is paid.</p>
      <div class="row-btns"><button class="btn btn-coral" type="button" id="pay-demo">Pay ${formatFee(p.amount)} (preview) ${icon('i-arrow')}</button><button class="btn btn-line co-alt" type="button" id="pay-ways">Choose another way</button></div>`, data, way, true);
}

// A checkout screen: the steps, the title, then what to do on the left and the order on the
// right. The title spans both columns, so the order's card starts level with the first card
// on the left.
const frame = (top, main, p, way, back = false) => `${stepper(back)}
    <div class="co-top">${top}</div>
    <div class="co-cols">
      <div class="co-main">${main}</div>
      ${orderCard(p, way)}
    </div>`;

// ---------------------------------------------------------------- the checkout (#paid-<id>)

// One order on screen at a time, like a ticket shop's checkout: what to pay with (the
// account number, the QR code, the store code, or Midtrans' card form), a clock for the
// hour the order stays open, and the pass opening the moment Midtrans says it is paid. The
// page asks the Worker how the payment is going: every 10 s, every 5 s for a QR code or an
// app, every 3 s right after the card form says it went through, and at once when the fan
// comes back to the tab (from a banking or e-wallet app). Back from Midtrans' card page or
// from GoPay, the same screen.
const co = { run: 0, poll: 0, tick: 0, every: 10000, wake: null };
const LATE = 15 * 6e4;    // after the order closes, how long the page still asks
const expiryOf = p => (Date.parse(p.expiresAt) || Date.parse(p.createdAt) + PAY_MINUTES * 6e4 || 0);
const clockText = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function stopCheckout() {
  co.run++;
  clearTimeout(co.poll);
  clearInterval(co.tick);
  co.wake = null;
  hideSnap();
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) co.wake?.(); });

export function renderPaid(id) {
  const first = passes.get(id);
  renderUnlock(first?.eventId);   // the form behind the checkout, and no older checkout
  const run = co.run, here = location.hash;
  const form = $('#unlock-form'), sheet = $('#pay-sheet');
  openSheet(form);
  if (!first) { sheet.innerHTML = paidSheet(null, id); return; }
  // What to pay with is checked again as it comes back from the device, like the Worker
  // checked Midtrans' answer: only digits, Midtrans' QR codes and the wallets' own links.
  const until = expiryOf(first), way = payMethod(first.method), pay = way ? payDetails(way.id, first.pay) : null;
  const alive = () => co.run === run && location.hash === here;
  let inForm = false;

  // Paid: the pass opens. Closed: the sheet says so. Otherwise false, still waiting.
  const settled = p => {
    if (p.status === 'confirmed') { stopCheckout(); closePay(form); form.reset(); showUnlocked(p, { emailed: state.store.mail && !!p.email }); return true; }
    if (p.status === 'rejected') { stopCheckout(); sheet.innerHTML = paidSheet(p, id); return true; }
    // Paid, but open on two other devices: My 3D passes asks for the email code.
    if (p.status === 'device') { stopCheckout(); closePay(form); location.hash = 'passes'; return true; }
    return false;
  };
  if (settled(first)) return;

  // One check at a time; each one sets the next.
  let busy = false;
  const check = async () => {
    clearTimeout(co.poll);
    if (!alive() || busy) return;
    busy = true;
    try {
      if (!document.hidden) {
        // A busy server or a bad connection: ask a little less often, up to every 30 s.
        if ((await refresh(passes.get(id) || first)) === false) co.every = Math.min(30000, Math.round(co.every * 1.5));
        if (!alive()) return;
        const p = passes.get(id);
        if (!p || settled(p)) return;
        if (!inForm) sheet.innerHTML = paidSheet(p, id);
      }
    } finally { busy = false; }
    if (alive() && Date.now() < until + LATE) co.poll = setTimeout(check, Math.round(co.every * (0.85 + Math.random() * 0.3)));
  };
  co.wake = check;
  co.every = 10000;
  const say = t => { const el = $('#co-status'); if (el) el.textContent = t; };
  // The clock; at zero the order closes and the sheet says the time ran out.
  const startClock = () => {
    const tick = () => {
      if (!alive()) return clearInterval(co.tick);
      const left = until - Date.now(), clock = $('#co-clock');
      if (clock) { clock.querySelector('b').textContent = clockText(left); clock.classList.toggle('is-low', left < 5 * 6e4); }
      if (left <= 0) { clearInterval(co.tick); hideSnap(); inForm = false; sheet.innerHTML = paidSheet(passes.get(id) || first, id); }
    };
    tick();
    co.tick = setInterval(tick, 1000);
  };
  const open = Date.now() < until;

  if (open && way && pay) {
    // What to pay with, drawn here: the number, the code, the QR code, the app button.
    inForm = true;
    sheet.innerHTML = payingSheet({ ...first, pay }, id, way);
    const qr = sheet.querySelector('.co-qr img');
    qr?.addEventListener('error', () => { qr.closest('.co-qr').innerHTML = '<p class="co-qr-off">The QR code did not load. Reload the page, or choose another way to pay.</p>'; });
    startClock();
    if (way.kind === 'qr' || way.kind === 'app') co.every = 5000;
    co.poll = setTimeout(check, co.every);
  } else if (open && state.store.clientKey && first.snap) {
    // The card: Midtrans' card form inside the page.
    inForm = true;
    sheet.innerHTML = cardSheet(first, id);
    const to = first.email && state.store.mail ? ` and the link goes to ${first.email}` : '';
    startClock();
    loadSnap(state.store).then(snap => {
      if (!alive() || !inForm) return;
      $('#snap-box').innerHTML = '';
      embedSnap(snap, first.snap, 'snap-box', {
        onSuccess: () => { say('Paid. Opening your pass…'); co.every = 3000; check(); },
        onPending: () => { say(`Waiting for your bank to confirm the card. Your pass opens here by itself${to}.`); co.every = 5000; check(); },
        onError: () => { say('That did not go through. Try again, or choose another way to pay.'); check(); },
      });
    }).catch(() => {
      if (!alive() || !inForm) return;
      $('#snap-box').innerHTML = `<div class="co-fallback"><p>The card form could not load on this page.</p>${first.url ? `<a class="btn btn-coral" href="${esc(first.url)}">Pay on Midtrans’ page ${icon('i-arrow')}</a><p class="fine">It brings you back here when you are done.</p>` : '<p class="fine">Please reload the page and try again.</p>'}</div>`;
    });
    co.poll = setTimeout(check, co.every);
  } else {
    sheet.innerHTML = paidSheet(first, id);
    co.every = 5000;
    check();
  }
}

const head = (p, id) => `
    <div class="co-head">
      <p class="eyebrow">${icon('i-card')}Payment <span class="mono">${esc(id)}</span></p>
      <p class="co-clock" id="co-clock">${icon('i-clock')}Pay within <b class="mono">${clockText(expiryOf(p) - Date.now())}</b></p>
    </div>`;
const waiting = p => `<p class="fine co-status" id="co-status" aria-live="polite">Waiting for your payment. Your pass opens here by itself${p.email && state.store.mail ? `, and the link goes to ${esc(p.email)}` : ''}.</p>`;
const otherWayBtn = id => `<button class="btn btn-line co-alt" type="button" id="pay-other" data-id="${esc(id)}">Choose another way to pay</button>`;

// What to pay with, for every way but the card, in the site's own design.
const BANK_APP = { bca: 'BCA mobile or myBCA', bni: 'wondr by BNI or BNI Mobile Banking', bri: 'BRImo', permata: 'PermataMobile X', cimb: 'OCTO Mobile', mandiri: 'Livin’ by Mandiri' };
// Long numbers and codes in groups of four, as banks and cashiers read them out; copied whole.
const fours = v => v.replace(/(.{4})(?=.)/g, '$1 ');
const field = (label, value, shown = value, big = true) => `<div class="co-field${big ? ' is-big' : ''}">
        <span><small>${esc(label)}</small><b class="mono">${esc(shown)}</b></span>
        <button class="btn btn-line btn-sm" type="button" data-copy="${esc(value)}" aria-label="Copy ${esc(label.toLowerCase())}">${icon('i-copy')}Copy</button>
      </div>`;
const qrBox = (src, alt) => `<figure class="co-qr"><img src="${esc(src)}" alt="${esc(alt)}" width="232" height="232" referrerpolicy="no-referrer"></figure>`;

function payingSheet(p, id, way) {
  const d = p.pay, fee = formatFee(), phone = isPhone();
  const amount = field('Amount', String(ACCESS_FEE), fee, false);
  let title = `Pay with ${way.name}`, body = '', steps = [], tap = false;
  if (way.kind === 'va') {
    title = `Transfer to your ${way.bank} virtual account`;
    body = field('Virtual account number', d.va, fours(d.va)) + amount;
    steps = [`Open ${BANK_APP[way.id]}, or go to a ${way.bank} ATM.`, `Choose transfer to a virtual account${way.id === 'bri' ? ' (BRIVA)' : ''} and enter the number above.`, `Check that the amount is ${fee}, then pay.`];
  } else if (way.kind === 'bill') {
    title = 'Pay your Mandiri bill';
    body = field('Company code', d.billerCode) + field('Bill key', d.billKey, fours(d.billKey)) + amount;
    steps = [`Open ${BANK_APP.mandiri}, or go to a Mandiri ATM.`, 'Choose Pay (Bayar), then find the company code above.', `Enter the bill key, check that the amount is ${fee}, then pay.`];
  } else if (way.kind === 'qr') {
    title = 'Scan to pay with QRIS';
    body = qrBox(d.qr, `QRIS code to pay ${fee}`);
    steps = ['Open GoPay, OVO, DANA, ShopeePay, LinkAja or your bank’s app, and choose Scan or Pay.', phone ? 'On this phone? Press and hold the code to save it, then pick it from your gallery in the app’s scanner.' : 'Scan the code on this screen.', `Check that the amount is ${fee}, then pay.`];
  } else if (way.kind === 'app') {
    tap = !!d.app && (phone || !d.qr);
    body = (tap ? `<a class="btn btn-coral btn-block co-app" href="${esc(d.app)}">Open ${esc(way.name)} ${icon('i-out')}</a>` : '')
      + (d.qr && !(tap && phone) ? qrBox(d.qr, `${way.name} code to pay ${fee}`) : '');
    steps = tap
      ? [`Tap Open ${way.name}: the app shows the payment of ${fee}.`, 'Check it and pay.', 'Come back to this page. Your pass opens here by itself.']
      : ['Open the Gojek or GoPay app on your phone and tap Pay.', 'Scan the code on this screen.', `Check that the amount is ${fee}, then pay.`];
  } else if (way.kind === 'store') {
    title = `Pay at ${way.name}`;
    body = field('Payment code', d.code, fours(d.code)) + amount;
    steps = [way.id === 'alfamart' ? 'Go to any Alfamart, Alfamidi or Dan+Dan.' : 'Go to any Indomaret.', 'Show this code to the cashier. They check the details with you.', `Pay ${fee} at the till and keep the receipt.`];
  }
  const by = new Date(expiryOf(p)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return frame(`${head(p, id)}
      <h2 class="pay-state">${esc(title)}</h2>`, `
      <div class="co-pay is-${way.kind}">
        <div class="co-way">${logos(way)}<span><b>${esc(wayName(way))}</b><small>Open until ${esc(by)}</small></span></div>
        <div class="co-fields">${body}</div>
        <ol class="co-steps">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      </div>
      ${waiting(p)}
      <div class="row-btns"><button class="btn ${tap ? 'btn-line co-alt' : 'btn-coral'}" type="button" id="pay-check" data-id="${esc(id)}">I have paid ${tap ? '' : icon('i-check')}</button>${otherWayBtn(id)}</div>
      <p class="fine co-safe">${icon('i-lock')}<span>The payment goes to Atvents through Midtrans. Paid already and this page did not move? It checks again by itself; you can close it, the pass link comes by email.</span></p>`, p, way);
}

// The card: Midtrans' card form (white, as Midtrans draws it) inside the checkout.
function cardSheet(p, id) {
  const way = payMethod('card');
  return frame(`${head(p, id)}
      <h2 class="pay-state">Pay by card</h2>`, `
      <div class="co-pay is-card">
        <div class="co-way">${logos(way)}<span><b>Credit or debit card</b><small>${esc(way.note)}</small></span></div>
        <div class="co-bleed"><div class="co-form" id="snap-box"><p class="co-loading">Loading the card form…</p></div></div>
      </div>
      ${waiting(p)}
      <div class="row-btns">${otherWayBtn(id)}</div>
      <p class="fine co-safe">${icon('i-lock')}<span>Your card details go to Midtrans, never to us.${p.url ? ` Trouble with the form? <a class="u" href="${esc(p.url)}">Pay on Midtrans’ page</a>.` : ''}</span></p>`, p, way);
}

function paidSheet(p, id) {
  const ref = `<span class="mono">${esc(id)}</span>`;
  if (!p) {
    return `<p class="eyebrow">${icon('i-card')}Payment ${ref}</p>
      <h2 class="pay-state">This payment is not on this device</h2>
      <p>Open the link in the email we sent you, or My 3D passes on the phone or laptop you paid on. Paid, and the pass does not open? Write to us with the reference above.</p>
      <div class="row-btns"><a class="btn btn-coral" href="#passes">My 3D passes ${icon('i-arrow')}</a><a class="btn btn-line" href="#contact">Write to us</a></div>`;
  }
  const way = payMethod(p.method), eyebrow = `<p class="eyebrow">${icon('i-card')}Payment ${ref}</p>`;
  if (p.status === 'rejected') {
    return frame(`${eyebrow}
      <h2 class="pay-state">The payment did not go through</h2>`, `
      <p class="fine">It was cancelled or it ran out of time, so this pass did not open. You can start again with the same seat.</p>
      <div class="row-btns"><button class="btn btn-coral" type="button" data-again="${esc(id)}">Try again ${icon('i-arrow')}</button><a class="btn btn-line co-alt" href="#contact">Write to us</a></div>`, p, way);
  }
  if (Date.now() > expiryOf(p)) {
    return frame(`${eyebrow}
      <h2 class="pay-state">The time to pay ran out</h2>`, `
      <p class="fine">This order was open for ${PAY_MINUTES} minutes and closed unpaid. Paid just now? It opens here in a moment. Otherwise, start again with the same seat.</p>
      <div class="row-btns"><button class="btn btn-coral" type="button" data-again="${esc(id)}">Start again ${icon('i-arrow')}</button><button class="btn btn-line co-alt" type="button" id="pay-check" data-id="${esc(id)}">Check again</button></div>`, p, way);
  }
  return frame(`${eyebrow}
      <h2 class="pay-state">Waiting for your payment</h2>`, `
      <p class="fine">Paying by bank transfer, QRIS or at a store? Midtrans can take a few minutes to confirm it. This page checks by itself${state.store.mail && p.email ? `, the link goes to ${esc(p.email)} once it is paid,` : ''} and My 3D passes checks again each time you open it.</p>
      <div class="row-btns"><button class="btn btn-coral" type="button" id="pay-check" data-id="${esc(id)}">Check again</button>${p.url ? `<a class="btn btn-line co-alt" href="${esc(p.url)}">Pay on Midtrans’ page</a>` : `<a class="btn btn-line co-alt" href="#passes">My 3D passes</a>`}</div>`, p, way);
}

function closePay(form) {
  stopCheckout();
  $('#pay-sheet').hidden = true;
  $('#unlock-body').classList.remove('is-paying');
  form.hidden = false;
}

// Back to the checkout's first steps, filled in from the order: the ways to pay (`ways`) or
// the form.
function backToForm(id, { ways = false } = {}) {
  const p = passes.get(id);
  stopCheckout();
  unlock.again = p ? { ...p, ways } : null;
  if (ways) unlock.method = '';   // another way: none chosen yet
  location.hash = p ? `#unlock-${p.eventId}` : '#unlock';
}

// "Choose another way to pay": Midtrans closes this order first, so its number or code
// stops taking money. Paid after all? The pass opens instead.
async function otherWay(id, btn) {
  const p = passes.get(id);
  if (!p?.token || !state.store.cancelPay) return backToForm(id, { ways: true });
  btn.disabled = true;
  try {
    const r = await state.store.cancelPay(id, p.token);
    if (r.status === 'confirmed') { markVerified(id); passes.save({ ...p, status: 'confirmed' }); renderPaid(id); return; }
    backToForm(id, { ways: true });
    passes.remove(id);   // closed and never paid: nothing to keep
  } catch (e) {
    btn.disabled = false;
    toast(e.status === 429 ? 'Too many tries. Please wait a minute.' : e.message || 'This payment could not be changed just now. Please try again.');
  }
}

// "I have paid": ask now, and say so if the money has not arrived yet.
async function checkNow(id, btn) {
  btn.disabled = true;
  if (!co.wake) { renderPaid(id); return; }
  await co.wake();
  if (!btn.isConnected) return;
  btn.disabled = false;
  const el = $('#co-status');
  if (el && passes.get(id)?.status === 'checking') el.textContent = 'Not in yet. A bank transfer or a store payment can take a few minutes to reach Midtrans; this page keeps checking and opens your pass by itself.';
}

async function paid(form) {
  const btn = $('#pay-demo');
  if (btn) btn.disabled = true;
  try {
    unlock.payment = { ...unlock.payment, ...(await state.store.payDemo(unlock.payment.id)) };
    const p = await claim({ ...unlock.data, payment: unlock.payment.id });
    unlock.payment = null;
    unlock.data = null;
    closePay(form);
    form.reset();
    showUnlocked(p);
  } catch (e) {
    toast(e.status === 429 ? 'Too many tries. Please wait a few minutes.' : e.message || 'Could not open your pass. Please try again.');
  } finally { if (btn) btn.disabled = false; }
}

function bindUnlock(form) {
  form.eventId.addEventListener('change', () => fillCats(form));
  form.cat.addEventListener('change', () => fillSecs(form));
  form.sec.addEventListener('change', () => fillRows(form));
  form.row.addEventListener('change', () => fillNums(form));
  form.addEventListener('input', () => ready(form));
  form.addEventListener('click', ev => {
    const sso = ev.target.closest('[data-sso]');
    if (sso) { signInWith(form, sso); return; }
    if (ev.target.closest('#uf-event-change')) { location.hash = '#unlock'; return; }
    if (ev.target.closest('#uf-type')) { unlock.typing = true; paintWho(form); ready(form); form.name.focus(); return; }
    if (ev.target.closest('#uf-change')) { unlock.who = null; form.name.value = ''; form.email.value = ''; paintWho(form); ready(form); }
  });
  $('#pay-sheet').addEventListener('click', ev => {
    const t = ev.target;
    if (t.closest('[data-back]')) { unlock.payment = null; closePay(form); return; }
    if (t.closest('#pay-ways')) { unlock.payment = null; showWays(form); return; }
    if (t.closest('#pay-demo')) { paid(form); return; }
    const team = t.closest('#pay-team');
    if (team) { if (!team.disabled) teamOpen(form, team); return; }
    const go = t.closest('#pay-go');
    if (go) { if (!go.disabled) goPay(form, go); return; }
    const copy = t.closest('[data-copy]');
    if (copy) { copyText(copy.dataset.copy, 'Copied.'); return; }
    const other = t.closest('#pay-other');
    if (other) { otherWay(other.dataset.id, other); return; }
    const again = t.closest('[data-again]');
    if (again) { backToForm(again.dataset.again, { ways: true }); return; }
    const check = t.closest('#pay-check');
    if (check) checkNow(check.dataset.id, check);
  });
  $('#pay-sheet').addEventListener('change', ev => { if (ev.target.name === 'pm') pickWay(ev.target.value); });
  form.addEventListener('submit', ev => { ev.preventDefault(); startPayment(form); });
  form.addEventListener('change', () => { $('#unlock-error').hidden = true; ready(form); });
}

// "Continue with Google / Microsoft": their window opens; once the fan has signed in, the
// name and email fill in. Without a name (some Microsoft accounts), the fields open with the
// email in, to type the name. A window closed without signing in changes nothing.
async function signInWith(form, btn) {
  const provider = btn.dataset.sso, id = state.store.sso?.[provider], err = $('#unlock-error');
  if (!id) return;
  err.hidden = true;
  btn.classList.add('is-busy');
  const idle = () => btn.classList.remove('is-busy');
  window.addEventListener('focus', () => setTimeout(idle, 1500), { once: true });
  try {
    const who = await signIn(provider, id);
    form.email.value = who.email;
    if (who.name) { form.name.value = who.name; unlock.who = who; } else { unlock.who = null; unlock.typing = true; }
    paintWho(form);
    ready(form);
    if (!who.name) form.name.focus();
  } catch (e) {
    err.textContent = e?.reason === 'blocked'
      ? 'Your browser blocked the sign-in window. Allow pop-ups for atvents.com, or type your name and email.'
      : `Signing in with ${PROVIDERS[provider].name} did not work. Please try again, or type your name and email.`;
    err.hidden = false;
  } finally {
    idle();
  }
}

// The WhatsApp tiles of a paid pass (passes.js waLinks, fans.js waTiles).
const waButtons = p => (p?.status === 'confirmed' ? waTiles(p.wa) : '');

function showUnlocked(p, { emailed = false } = {}) {
  p = passes.get(p.id) || p;
  const e = eventMeta(p.eventId);
  const wa = waButtons(p);
  $('#unlock-body').hidden = true;
  $('#unlock-body').insertAdjacentHTML('beforebegin', `
    <div class="unlock-done" id="unlock-done">
      <div class="unlock-next">
        <p class="eyebrow">Pass ${esc(p.id)}</p>
        <h2 class="big"><span class="fade">You’re</span> <span class="ol">in</span></h2>
        <p class="lede">Paid. Your seat view for ${esc(e.title)} is open. Take the tour to your seat.</p>
        <div class="row-btns"><a class="btn btn-coral" href="#tour-${esc(p.id)}">Start my seat tour ${icon('i-arrow')}</a>${p.seat ? `<button class="btn btn-line" type="button" data-story-pass="${esc(p.id)}">${icon('i-share', 'lead')}<span>Post my seat to story</span></button>` : ''}<a class="btn btn-line" href="#passes">My 3D passes</a></div>
        ${wa ? `<div class="unlock-wa"><p class="fine">Meet other fans going to ${esc(e.title)} before the show.</p>${wa}</div>` : ''}
        ${emailed ? `<p class="unlock-mail">${icon('i-mail')}<span>The pass link is on its way to <b>${esc(p.email)}</b>. Open it on any phone or laptop to see your seat there too.</span></p>` : ''}
        ${p.token ? `<p class="fine">On another phone or laptop? <button class="link" type="button" data-copy-pass="${esc(p.id)}">Copy the pass link</button> and open it there. Keep it to yourself: the link opens your pass.</p>` : ''}
      </div>
      ${passCard(p, { actions: false })}
    </div>`);
  pageToTop();
}

// ---------------------------------------------------------------- my 3D passes

// A pass as a ticket stub: the category in big type, then the concert and the check.
function passCard(p, { actions = true } = {}) {
  const e = eventMeta(p.eventId);
  if (!e) return '';
  const venue = getEvent(p.eventId), c = venue.catById[p.cat], w = whenOf(e), st = STATUS[p.status] || STATUS.checking;
  // After the show a paid pass stays open for good: the seat tour and the story still play.
  const ended = !upcoming(e), kept = ended && p.status === 'confirmed';
  const seats = (p.seats || []).map(id => venue.seats[venue.seatById.get(id)]).filter(Boolean);
  const len = code(c || { name: p.cat }).length;
  return `<article class="pass${p.status === 'rejected' ? ' is-closed' : ''}">
    <div class="pass-stub">
      <span class="pass-k">3D pass</span>
      <b class="pass-code"${len > 7 ? ' style="font-size:20px"' : len > 5 ? ' style="font-size:clamp(22px,2.2vw,30px)"' : ''}>${esc(code(c || { name: p.cat }))}</b>
      <span class="pass-n">1 seat</span>
    </div>
    <div class="pass-body">
      <div class="pass-top"><span class="pass-pill is-${p.status}">${st.label}</span>${ended ? '<span class="pass-pill is-ended">Event ended</span>' : ''}<span class="mono">${esc(p.id)}</span>${actions ? `<button class="pass-del" type="button" data-remove-pass="${esc(p.id)}" aria-label="Remove this pass from this device" title="Remove from this device">${icon('i-trash')}</button>` : ''}</div>
      <h3>${esc(e.title)}</h3>
      <p class="pass-when">${esc(w.date)} · ${esc(placeOf(e).name)}</p>
      <p class="pass-note">${esc(kept ? 'The show is over. Your seat view stays yours: open the tour and your story any time.' : st.note)}</p>
      <dl class="pass-facts">
        <div><dt>Category</dt><dd>${esc(c?.name || p.cat)}</dd></div>
        ${p.name ? `<div><dt>Name</dt><dd>${esc(p.name)}</dd></div>` : ''}
        <div><dt>${seats.length > 1 ? 'Seats' : 'Seat'}</dt><dd>${seats.length ? seats.map(s => esc(s.standing ? `${s.secName}, standing` : `${s.secName} · Row ${s.row} · Seat ${s.num}`)).join(', ') : 'Not given'}</dd></div>
        ${p.route === 'paid' || p.route === 'outside' ? `<div><dt>Access</dt><dd>${formatFee()}, paid</dd></div>` : ''}
      </dl>
      ${actions ? `<div class="row-btns">
        ${p.status === 'rejected' ? `${ended ? '' : `<a class="btn btn-coral btn-sm" href="#unlock-${p.eventId}">Unlock again</a>`}<a class="btn btn-line btn-sm" href="#contact">Write to us</a>`
          : p.status === 'confirmed' ? `<a class="btn btn-coral btn-sm" href="#tour-${esc(p.id)}">Start my seat tour ${icon('i-arrow')}</a>${p.seat ? `<button class="btn btn-line btn-sm" type="button" data-story-pass="${esc(p.id)}">${icon('i-share')}Story</button>` : ''}`
            : `<a class="btn btn-line btn-sm" href="#seats-${p.eventId}">Look round the venue ${icon('i-arrow')}</a>`}
        ${p.token && p.status !== 'device' ? `<button class="btn btn-line btn-sm" type="button" data-copy-pass="${esc(p.id)}">${icon('i-link')}Copy pass link</button>` : ''}
      </div>${p.status === 'device' ? otpForm(p) : ''}${waButtons(p) ? `<div class="pass-wa">${waButtons(p)}</div>` : ''}
` : ''}
    </div>
  </article>`;
}

// A paid pass open on two other devices: the code goes to the buyer's email, and the code
// back opens the pass here (worker/devices.mjs).
const otpForm = p => (p.canMail === false
  ? '<p class="pass-otp-note">Write to us with your payment reference to open your pass on this device.</p>'
  : `<form class="pass-otp" data-otp-pass="${esc(p.id)}" novalidate>
      <button class="btn btn-coral btn-sm" type="button" data-send-code="${esc(p.id)}">${icon('i-mail')}Email a code${p.lockedTo ? ` to ${esc(p.lockedTo)}` : ''}</button>
      <label class="pass-otp-field"><span>Code from the email</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" required></label>
      <button class="btn btn-line btn-sm" type="submit">Open here</button>
    </form>`);

export function renderPasses({ check = false } = {}) {
  const starts = p => { const e = eventMeta(p.eventId); return e ? startOf(e) : Infinity; };
  const past = p => !upcoming(eventMeta(p.eventId));
  const list = passes.all().filter(p => eventMeta(p.eventId))
    .sort((a, b) => past(a) - past(b) || (past(a) ? starts(b) - starts(a) : starts(a) - starts(b)));
  const open = list.filter(p => p.status !== 'rejected').length;
  $('#passes-note').textContent = list.length
    ? `${plural(list.length, 'pass', 'passes')} on this device${open < list.length ? `, ${open} open` : ''}. Each opens the seat views of its concert.`
    : 'Passes you unlock appear here, on the device you unlocked them on.';
  $('#passes-body').innerHTML = list.length
    ? `<div class="pass-grid">${list.map(p => passCard(p)).join('')}</div>`
    : `<div class="empty-state"><h3>No 3D passes yet.</h3><p>Pick your concert and your seat, pay ${formatFee()}, and the view from your seat opens here.</p><div class="row-btns"><a class="btn btn-coral" href="#unlock">Unlock my seat view ${icon('i-arrow')}</a><a class="btn btn-line" href="#concerts">Find a concert</a></div></div>`;
  // Ask the server how each check is going, once per visit to the page.
  if (check) list.forEach(p => refresh(p));
}

// Pass buttons work wherever a pass card is drawn: copy its link, make its story video, or
// take it off this device.
export function bindPassButtons() {
  document.addEventListener('submit', async ev => {
    const form = ev.target.closest('[data-otp-pass]');
    if (!form) return;
    ev.preventDefault();
    const p = passes.get(form.dataset.otpPass), code = form.code.value.replace(/\s+/g, '');
    if (!p) return;
    if (!/^\d{6}$/.test(code)) { toast('Type the 6-digit code from the email.'); form.code.focus(); return; }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await useCode(p, code);
      toast('Your pass is open on this device.');
    } catch (e) {
      btn.disabled = false;
      toast(e.status === 429 ? 'Too many tries. Please wait a minute.' : e.message || 'That code did not work. Please try again.');
    }
  });
  document.addEventListener('click', async ev => {
    const send = ev.target.closest('[data-send-code]');
    if (send) {
      const p = passes.get(send.dataset.sendCode);
      if (!p) return;
      send.disabled = true;
      try {
        const r = await sendCode(p);
        if (r.open) { await refresh(p); toast('Your pass is open on this device.'); return; }
        toast(`Code sent to ${r.email}. It works for ${r.minutes} minutes.`);
        send.closest('form')?.code?.focus();
      } catch (e) {
        toast(e.message || 'The code could not be sent. Please try again.');
      }
      setTimeout(() => { send.disabled = false; }, 30000);
      return;
    }
    const copy = ev.target.closest('[data-copy-pass]');
    if (copy) {
      const link = passLink(passes.get(copy.dataset.copyPass) || {});
      if (link) copyText(link, 'Pass link copied. Open it on your other device.');
      return;
    }
    // The story video of the seat (story.js), for an Instagram or TikTok story.
    const story = ev.target.closest('[data-story-pass]');
    if (story) {
      import('./story.js').then(m => m.makeStory(passes.get(story.dataset.storyPass))).catch(() => toast('The story video could not start. Please try again.'));
      return;
    }
    // The bin opens a check on the card itself; only its Remove takes the pass off.
    const no = ev.target.closest('[data-remove-no]');
    if (no) { no.closest('.pass-confirm')?.remove(); return; }
    const yes = ev.target.closest('[data-remove-yes]');
    if (yes) {
      passes.remove(yes.dataset.removeYes);
      toast('Removed from this device. Open its pass link to bring it back.');
      return;
    }
    const rm = ev.target.closest('[data-remove-pass]');
    if (!rm) return;
    const card = rm.closest('.pass');
    if (!card || card.querySelector('.pass-confirm')) return;
    const id = rm.dataset.removePass, p = passes.get(id), e = p && eventMeta(p.eventId);
    card.insertAdjacentHTML('beforeend', `<div class="pass-confirm" role="alertdialog" aria-labelledby="pc-${esc(id)}">
        <div class="pass-confirm-box">
          <span class="pass-confirm-ico">${icon('i-trash')}</span>
          <h4 id="pc-${esc(id)}">Remove this pass?</h4>
          <p>${e ? `Your 3D pass for ${esc(e.title)} will be removed from this device.` : 'This pass will be removed from this device.'} You can bring it back with the link in your pass email.</p>
          <div class="pass-confirm-btns"><button class="btn btn-line btn-sm" type="button" data-remove-no>Cancel</button><button class="btn btn-sm pass-confirm-yes" type="button" data-remove-yes="${esc(id)}">Remove</button></div>
        </div>
      </div>`);
    card.querySelector('[data-remove-no]')?.focus();
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') document.querySelectorAll('.pass-confirm').forEach(x => x.remove());
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
