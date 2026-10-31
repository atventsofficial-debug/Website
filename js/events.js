// Concert catalogue and demo venues. Each runs on one venue template (seat layout) and
// carries its own copy, prices and stage branding. `image` is its own artwork and `photo`
// the venue render shown without one (media.js). Pure data: the Node server imports it
// too, so event ids and categories are checked on both sides.
import { getVenue } from './layouts.js';

// Country, time zone and the airport-style code printed on tickets. Times are the clock at
// the venue; fans abroad read them in their own zone (when.js).
export const CITY = {
  Jakarta: { country: 'ID', tz: 'Asia/Jakarta', code: 'JKT' },
  Bandung: { country: 'ID', tz: 'Asia/Jakarta', code: 'BDG' },
  Surabaya: { country: 'ID', tz: 'Asia/Jakarta', code: 'SUB' },
  London: { country: 'GB', tz: 'Europe/London', code: 'LON' },
};

// Concerts sold on tiket.com, as listed there in October 2026. Facts come from the
// promoters' announcements as reported by the press; anything not announced shows as TBA.
// We do not sell these tickets: `official` is where fans buy them, through our affiliate
// link when one is set (config.js). Replace the search links with each show's own page.
const TIKET = q => `https://www.tiket.com/en-id/to-do/search?title=${encodeURIComponent(q)}&productAllCategoryCodes=EVENT`;
export const LISTED = 'October 2026';
const PRICES = 'Prices as announced by the promoter, before tiket.com’s fees and tax. tiket.com has the live price and stock.';
const MODEL = 'The 3D venue is our illustration of the venue and the category layout, not the official seating plan. Use it to compare views; your ticket decides your seat.';

const JIEXPO = { name: 'JIExpo Kemayoran', city: 'Jakarta', address: 'Jl. Benyamin Sueb, Kemayoran, Jakarta Pusat', transit: 'KRL to Kemayoran station, then a short ride', capacity: '' };
const GBK = { name: 'Gelora Bung Karno Main Stadium', city: 'Jakarta', address: 'Jl. Pintu Satu Senayan, Gelora, Tanah Abang, Jakarta Pusat', transit: 'MRT Istora Mandiri station', capacity: '' };
const JIS = { name: 'Jakarta International Stadium', city: 'Jakarta', address: 'Jl. R.E. Martadinata, Papanggo, Tanjung Priok, Jakarta Utara', transit: '', capacity: '' };

const BTS_DAY = (n, dateISO, more = {}) => ({
  id: `evt-bts-arirang-${n}`, venue: 'stadium-round',
  title: 'BTS', subtitle: `World Tour ARIRANG · Day ${n}`,
  dateISO, time: 'TBA', doors: 'TBA', ends: '', age: '',
  host: 'iME Indonesia', hostNote: 'Promoter, with Live Nation',
  blurb: 'BTS bring the ARIRANG world tour to Gelora Bung Karno Main Stadium, on a 360-degree stage in the middle of the field. Every category is seated.',
  about: [
    'VIP Package Rp 4.5M, Platinum (the floor and the tribune closest to the field) Rp 3.65M, CAT 1 in the lower tribune Rp 2.8M, CAT 2 and CAT 3 in the upper tribune Rp 2.3M and Rp 1.8M.',
    'The promoter does not sell restricted-view seats. Official tickets are sold only through tiket.com, four per account per show.',
    PRICES,
    MODEL,
  ],
  runs: [],
  branding: { wall: 'BTS', sub: 'WORLD TOUR · ARIRANG', band: ['BTS WORLD TOUR', 'ARIRANG', 'GELORA BUNG KARNO', 'JAKARTA'] },
  place: GBK,
  official: { name: 'tiket.com', url: TIKET('BTS') },
  photo: `event-stadium-round-${n === 2 ? 2 : 1}`, image: 'bts-arirang',
  ...more,
});

export const EVENTS = [
  {
    id: 'evt-bocelli-jakarta', venue: 'concert', featured: true,
    title: 'Andrea Bocelli', subtitle: 'Romanza 30th Anniversary World Tour',
    dateISO: '2026-11-03T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '',
    host: 'Shoemaker Live', hostNote: 'Promoter · presented by Bank SMBC Indonesia and BNI',
    blurb: 'Andrea Bocelli marks thirty years of his album Romanza with a world tour. Jakarta is the second of his two Indonesian shows, three days after Borobudur.',
    about: [
      'Seven categories, from Pearl at Rp 1M to Diamond at Rp 13.95M. A presale in August gave Jenius and BNI cardholders up to 20% off; the remaining tickets sell at regular prices while they last.',
      PRICES,
      MODEL,
    ],
    runs: [],
    cats: [
      { id: 'diamond', name: 'Diamond', price: 13950000, color: '#e8f1ff' },
      { id: 'platinum', name: 'Platinum', price: 11700000, color: '#f5c451' },
      { id: 'emerald', name: 'Emerald', price: 8800000, color: '#6ee39a' },
      { id: 'gold', name: 'Gold', price: 5200000, color: '#ff7a6b' },
      { id: 'silver', name: 'Silver', price: 3600000, color: '#56b6ff' },
      { id: 'bronze', name: 'Bronze', price: 2600000, color: '#d49a6a' },
      { id: 'pearl', name: 'Pearl', price: 1000000, color: '#a993ff' },
    ],
    // The arena layout's blocks, front to back.
    zone: s => (s.sec.startsWith('VIP') ? (s.ri < 4 ? 'diamond' : 'platinum')
      : s.sec.startsWith('FA') ? (s.ri < 6 ? 'emerald' : 'gold')
        : s.tier === 1 ? (s.ri < 6 ? 'silver' : 'bronze') : 'pearl'),
    occupancy: { diamond: 0.7, platinum: 0.65, emerald: 0.6, gold: 0.55, silver: 0.5, bronze: 0.45, pearl: 0.55 },
    branding: { wall: 'ANDREA BOCELLI', sub: 'ROMANZA · 30TH ANNIVERSARY', band: ['ANDREA BOCELLI', 'ROMANZA 30TH ANNIVERSARY', 'JIEXPO KEMAYORAN', 'JAKARTA'] },
    place: JIEXPO,
    official: { name: 'tiket.com', url: TIKET('Andrea Bocelli') },
    photo: 'event-concert-1', image: 'bocelli-romanza',
  },
  {
    id: 'evt-mcr-jakarta', venue: 'stadium-end',
    title: 'My Chemical Romance', subtitle: 'Live in Jakarta 2026',
    dateISO: '2026-11-22T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '',
    host: 'Ravel Entertainment', hostNote: 'Promoter',
    blurb: 'My Chemical Romance headline Jakarta International Stadium. A standing festival floor in front of the stage, seated stands split Center and Left/Right.',
    about: [
      'VVIP and VVIP Upgrade sold out soon after sales opened in February; Festival, CAT 2 Center and CAT 3 Center were close behind.',
      'Festival is standing. CAT 1 to CAT 3 are seats in the stands, from Rp 1.06M to Rp 3.3M.',
      PRICES,
      MODEL,
    ],
    runs: [],
    branding: { wall: 'MY CHEMICAL ROMANCE', sub: 'LIVE IN JAKARTA 2026', band: ['MY CHEMICAL ROMANCE', 'LIVE IN JAKARTA', 'JAKARTA INTERNATIONAL STADIUM', '2026'] },
    place: JIS,
    official: { name: 'tiket.com', url: TIKET('My Chemical Romance') },
    photo: 'event-stadium-end-1', image: 'mcr-jakarta',
  },
  BTS_DAY(1, '2026-12-26T00:00'),
  BTS_DAY(2, '2026-12-27T00:00'),
  BTS_DAY(3, '2026-12-29T00:00', { soldOut: ['vip', 'plat', 'cat1', 'cat2', 'cat3'] }),
];

// Demo venues: one per layout, fully open, for the partner page and anyone who wants to try
// the seat view before buying. Fictional places, except the Tottenham model.
const DEMO_PLACE = {
  arena: { name: 'Nusantara Arena', city: 'Jakarta', address: 'Demo venue', capacity: '7,572 seats' },
  stadium: { name: 'Gelora Samudra Stadium', city: 'Jakarta', address: 'Demo venue', capacity: '' },
  hall: { name: 'Satria Hall', city: 'Surabaya', address: 'Demo venue', capacity: '7,632 seats' },
  cinema: { name: 'Cakrawala Cinema', city: 'Bandung', address: 'Demo venue', capacity: '270 seats per studio' },
  spurs: { name: 'Tottenham Hotspur Stadium', city: 'London', address: 'Modelled from a seating plan of the ground', capacity: '62,850 seats' },
};
const DEMO = (venue, name, blurb, place, branding = {}) => ({
  id: `demo-${venue}`, venue, demo: true, title: name, subtitle: 'Demo venue', blurb, place, branding, photo: `venue-${venue}`,
});
export const DEMOS = [
  DEMO('concert', 'Concert arena', 'End stage with an LED wall, VIP and Floor A blocks in front, two curved tiers behind.', DEMO_PLACE.arena,
    { wall: 'YOUR SHOW', sub: 'LIVE IN 3D', band: ['YOUR SHOW HERE', 'LIVE IN 3D', 'NUSANTARA ARENA', 'SEE YOUR SEAT'] }),
  DEMO('stadium-round', 'Stadium, 360 stage', 'A stage in the middle of the field with seated floor blocks on four sides and the full bowl round it.', { ...DEMO_PLACE.stadium, name: 'Gelora Samudra Stadium, 360 stage' },
    { wall: 'YOUR SHOW', sub: 'STADIUM TOUR', band: ['YOUR SHOW HERE', 'STADIUM TOUR', 'GELORA SAMUDRA', 'SEE YOUR SEAT'] }),
  DEMO('stadium-end', 'Stadium, end stage', 'Stage at one end, a standing festival floor, the stands split into Center and Left/Right.', { ...DEMO_PLACE.stadium, name: 'Gelora Samudra Stadium, end stage' },
    { wall: 'YOUR SHOW', sub: 'LIVE IN 3D', band: ['YOUR SHOW HERE', 'LIVE IN 3D', 'GELORA SAMUDRA', 'SEE YOUR SEAT'] }),
  DEMO('stadium', 'Football stadium', 'A two-tier bowl round the pitch, with the roof, floodlights and LED boards.', DEMO_PLACE.stadium,
    { home: 'HOME FC', away: 'AWAY FC' }),
  DEMO('stadium-tottenham', 'Real venue: Tottenham', 'Built from Tottenham Hotspur Stadium’s seating plan: numbered blocks, three tiers and the single-tier South Stand.', DEMO_PLACE.spurs,
    { home: 'HOME', away: 'AWAY' }),
  DEMO('combat', 'Arena, centre stage', 'An octagon or ring in the middle, ringside rows on four sides and a scoreboard above.', DEMO_PLACE.hall,
    { mark: 'FIGHT NIGHT', sub: 'LIVE IN 3D', hall: 'SATRIA HALL', title: 'FIGHT NIGHT · SURABAYA' }),
  DEMO('combat-studio', 'Studio hall', 'About 1,000 seats: cageside rows and one riser all round, under a low roof.', { ...DEMO_PLACE.hall, name: 'Satria Hall Studio', capacity: 'About 1,000 seats' },
    { mark: 'STUDIO', sub: 'LIVE IN 3D', hall: 'SATRIA STUDIO', title: 'STUDIO NIGHT' }),
  DEMO('cinema', 'Cinema studio', 'Stadium seating in front of a wide screen, rows A to N, sweetboxes on the back row.', DEMO_PLACE.cinema),
];

const byId = new Map([...EVENTS, ...DEMOS].map(e => [e.id, e]));
const cache = {};

export const eventMeta = id => byId.get(id);
export const isConcert = id => !!byId.get(id) && !byId.get(id).demo;
export const demoFor = key => DEMOS.find(d => d.venue === key);

// `venue` is the seat-layout template; `place` the real (or demo) venue.
export const placeOf = e => e.place;
export const timeKnown = e => e.time !== 'TBA';

// A venue object for one event: the template's seats with this event's prices, title and
// branding. Everything downstream (3D, pages, server) takes this. `cats` replaces the
// template's categories; `zone(seat)` then assigns each seat to one.
export function getEvent(id) {
  const e = byId.get(id);
  if (!e) return null;
  if (!cache[id]) {
    const base = getVenue(e.venue);
    const categories = (e.cats || base.categories).map(c => ({ ...c }));
    cache[id] = {
      ...base,
      seats: e.zone ? base.seats.map(s => ({ ...s, cat: e.zone(s) })) : base.seats,
      occupancy: e.occupancy || base.occupancy,
      eventId: e.id,
      meta: e,
      place: e.place,
      branding: e.branding,
      categories,
      catById: Object.fromEntries(categories.map(c => [c.id, c])),
      event: { title: e.title, venue: `${e.place.name}, ${e.place.city}` },
    };
  }
  return cache[id];
}

// Venues with concerts on the list, in catalogue order.
export const PLACES = [...new Map(EVENTS.map(e => [e.place.name, e.place])).values()]
  .map(p => ({ ...p, events: EVENTS.filter(e => e.place.name === p.name) }));

// Lowest announced price, or null when no category has one.
export function minPrice(id) {
  const known = getEvent(id).categories.map(c => c.price).filter(p => p != null);
  return known.length ? Math.min(...known) : null;
}

export const soldOut = (e, catId) => !!e.soldOut?.includes(catId);
export const allSoldOut = e => getEvent(e.id).categories.every(c => soldOut(e, c.id));
