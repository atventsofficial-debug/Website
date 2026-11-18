// Concert catalogue and demo venues. Each runs on one venue template (seat layout) and
// carries its own copy, prices and stage branding. `image` is its own artwork and `photo`
// the venue render shown without one (media.js). `numbering`, set once the promoter or the
// venue confirms how its seats are numbered, is how every pass's seat tour counts rows and
// seats (seatflip.js: { seats, rows, letters }); a fan can still set their own. Pure data:
// the Node server imports it too, so event ids and categories are checked on both sides.
import { getVenue, REAL_KEYS } from './layouts.js';
import { THEMES } from './themes.js';

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
export const LISTED = 'November 2026';
const PRICES = 'Prices as announced by the promoter, before tiket.com’s fees and tax. tiket.com has the live price and stock.';
const MODEL = 'The 3D venue is our illustration of the venue and the category layout, not the official seating plan. Use it to compare views; your ticket decides your seat.';

// `art`: the venue's picture on its home page card (assets/covers/place, media.js).
// `seatColor`: the building's own seats, where a source says what they look like: GBK red,
// white and grey, laid out like a wrapped flag (Medcom); JIS orange, with grey mixed in up top
// (StadiumDB); Madya white (Football Tribe); Istora three greys (Wikipedia); Indonesia Arena
// grey moulded flip-up seats (Datra Avant; FIBA World Cup 2023 photos on Wikimedia Commons).
// Elsewhere the seats take the show's theme colour (themes.js). `seatStyle`: the seat's shape
// where the building's own is known (venues3d.js seatGeometry), else the template's.
const JIEXPO = { name: 'JIExpo Kemayoran', art: 'jiexpo', city: 'Jakarta', address: 'Jl. Benyamin Sueb, Kemayoran, Jakarta Pusat', transit: 'KRL to Kemayoran station, then a short ride', capacity: '' };
const GBK = { name: 'Gelora Bung Karno Main Stadium', art: 'gbk', seatColor: { bands: ['#eceef0', '#c8102e'], speckle: ['#8e9297', 0.12] }, city: 'Jakarta', address: 'Jl. Pintu Satu Senayan, Gelora, Tanah Abang, Jakarta Pusat', transit: 'MRT Istora Mandiri station', capacity: '' };
const JIS = { name: 'Jakarta International Stadium', art: 'jis', seatColor: { bands: ['#e2701f', '#e2701f', ['#e2701f', '#e2701f', '#9da2a8']] }, city: 'Jakarta', address: 'Jl. R.E. Martadinata, Papanggo, Tanjung Priok, Jakarta Utara', transit: '', capacity: '' };

const MADYA = { name: 'Stadion Madya GBK', art: 'madya', seatColor: '#e8eaed', city: 'Jakarta', address: 'Kompleks Gelora Bung Karno, Senayan, Jakarta Pusat', transit: 'MRT Istora Mandiri station', capacity: '' };
const ISTORA = { name: 'Istora Senayan GBK', art: 'istora', seatColor: { mix: ['#6c7075', '#979ba0', '#c0c3c7'] }, city: 'Jakarta', address: 'Kompleks Gelora Bung Karno, Senayan, Jakarta Pusat', transit: 'MRT Istora Mandiri station', capacity: '' };
const BASKET = { name: 'Basket Hall GBK', art: 'basket-hall', city: 'Jakarta', address: 'Kompleks Gelora Bung Karno, Senayan, Jakarta Pusat', transit: 'MRT Istora Mandiri station', capacity: '' };
const TENNIS = { name: 'Tennis Indoor GBK', art: 'tennis-indoor', city: 'Jakarta', address: 'Kompleks Gelora Bung Karno, Senayan, Jakarta Pusat', transit: 'MRT Istora Mandiri station', capacity: '' };
const INA_ARENA = { name: 'Indonesia Arena', art: 'indonesia-arena', seatColor: '#8a8e94', seatStyle: 'flipup', city: 'Jakarta', address: 'Kompleks Gelora Bung Karno, Senayan, Jakarta Pusat', transit: 'MRT Istora Mandiri station', capacity: '' };

// Shows announced for the next six months whose seating plan we have not modelled yet.
// They run on a stand-in layout: the My Chemical Romance stadium plan (stadium-end) for
// stadiums, the concert arena (concert) for indoor halls. Category prices are not set
// (the page says TBA); `from` is the lowest announced price when the press gave a range.
// Facts from GBK's listings as reported by Beritasatu (4 and 6 Nov 2026), IDN Times and
// kumparan; check each against the promoter before going live.
// Sellers other than tiket.com, for shows tiket.com does not sell. No affiliate link there.
const SELLERS = {
  loket: { name: 'Loket.com', url: 'https://www.loket.com/' },
  tiptip: { name: 'TipTip', url: 'https://tiptip.id/' },
  traveloka: { name: 'Traveloka', url: 'https://www.traveloka.com/en-id/activities' },
};
export const sellerOf = e => e?.official?.name || 'tiket.com';
export const onTiket = e => sellerOf(e) === 'tiket.com';

// When general sale opens. `opens` is an ISO time, or a month ('2026-02') when only that is known.
// null when nothing has been announced. `line` is the sentence for the concert page.
export function saleInfo(e, now = Date.now()) {
  const at = e?.sale?.opens;
  if (!at) return null;
  const month = at.length === 7;
  const ms = Date.parse(month ? `${at}-01T00:00` : at);
  const d = new Date(ms), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const date = month ? `${d.toLocaleDateString('en-GB', { month: 'long' })} ${d.getFullYear()}` : `${d.getDate()} ${M} ${d.getFullYear()}`;
  const soon = !month && ms > now;
  return { ms, soon, date, line: soon ? `Ticket sale opens ${date} on ${sellerOf(e)}.` : `Ticket sale opened ${date} on ${sellerOf(e)}.` };
}
const STANDIN = 'The seating plan for this show has not been published, so the 3D venue uses a stand-in layout. Use it for a feel of the venue, not to pick a seat.';
const SHOW = ({ id, image, theme, title, subtitle, dateISO, place, venue, host = 'TBA', hostNote = 'Promoter', from = null, range = '', soldOutAll = false, blurb, extra = [], sale = {} }) => {
  const cats = getVenue(venue).categories.map(c => ({ ...c, price: null }));
  const official = SELLERS[sale.seller] || { name: 'tiket.com', url: TIKET(title) };
  return {
    id, venue, title, subtitle, dateISO, time: 'TBA', doors: 'TBA', ends: '', age: '',
    host, hostNote, blurb, cats, from, standIn: true,
    // When general sale opens, and whether tiket.com is a confirmed seller (null: not known yet).
    sale: { tiket: sale.seller ? false : null, ...sale },
    about: [
      ...extra,
      range ? `Tickets announced from ${range}. Prices per category are on ${official.name}.` : 'Ticket prices have not been announced yet.',
      STANDIN,
      official.name === 'tiket.com' ? PRICES : `Prices as announced by the promoter. Sold on ${official.name}, not on tiket.com: ${official.name} has the live price and stock.`,
    ],
    runs: [],
    branding: { wall: title.toUpperCase(), sub: subtitle.toUpperCase(), band: [title.toUpperCase(), subtitle.toUpperCase(), place.name.toUpperCase(), place.city.toUpperCase()] },
    theme,
    place,
    official,
    // Its venue's render: the templates' renders come from the demos, so no other show's name
    // is on their screens. A venue from a promoter's plan is drawn for its own show, so a
    // stand-in show there takes the end-stage stadium instead.
    photo: REAL_KEYS.includes(venue) ? 'event-stadium-end-1' : `event-${venue}-1`, image,
    ...(soldOutAll ? { soldOut: cats.map(c => c.id) } : {}),
  };
};

const BTS_DAY = (n, dateISO, more = {}) => ({
  id: `evt-bts-arirang-${n}`, venue: 'stadium-round', theme: 'bts',
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
    id: 'evt-bocelli-jakarta', venue: 'concert', featured: true, theme: 'bocelli',
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
    occupancy: { diamond: 0.92, platinum: 0.9, emerald: 0.9, gold: 0.88, silver: 0.5, bronze: 0.45, pearl: 0.55 },
    branding: { wall: 'ANDREA BOCELLI', sub: 'ROMANZA · 30TH ANNIVERSARY', band: ['ANDREA BOCELLI', 'ROMANZA 30TH ANNIVERSARY', 'JIEXPO KEMAYORAN', 'JAKARTA'] },
    place: JIEXPO,
    official: { name: 'tiket.com', url: TIKET('Andrea Bocelli') },
    photo: 'event-concert-1', image: 'bocelli-romanza',
  },
  {
    id: 'evt-mcr-jakarta', venue: 'jis-mcr',
    title: 'My Chemical Romance', subtitle: 'Live in Jakarta 2026',
    dateISO: '2026-11-22T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '',
    host: 'Ravel Entertainment', hostNote: 'Promoter',
    blurb: 'My Chemical Romance headline Jakarta International Stadium. A standing festival floor in front of the stage; the three tiers are CAT 1, CAT 2 and CAT 3, each split into Center, facing the stage, and Left and Right.',
    about: [
      'VVIP and VVIP Upgrade, the pen in front of the stage, sold out soon after sales opened in February; Festival, CAT 2 Center and CAT 3 Center were close behind.',
      'Festival is standing, round the VVIP pen and back past the sound desk. CAT 1 is the lower tier, CAT 2 the middle tier and CAT 3 the upper tier, numbered seats from Rp 1.06M to Rp 3.3M. The MCR boxes sit between CAT 2 and CAT 3 in the Center stand. The stands behind the stage are closed.',
      PRICES,
      MODEL,
    ],
    runs: [],
    branding: { wall: 'MY CHEMICAL ROMANCE', sub: 'LIVE IN JAKARTA 2026', band: ['MY CHEMICAL ROMANCE', 'LIVE IN JAKARTA', 'JAKARTA INTERNATIONAL STADIUM', '2026'] },
    theme: 'mcr',
    soldOut: ['vvip'],
    place: JIS,
    sale: { opens: '2026-02-07T10:00', tiket: true },
    official: { name: 'tiket.com', url: TIKET('My Chemical Romance') },
    photo: 'event-jis-mcr-1', image: 'mcr-jakarta',
  },
  BTS_DAY(1, '2026-12-26T00:00'),
  BTS_DAY(2, '2026-12-27T00:00'),
  BTS_DAY(3, '2026-12-29T00:00', { soldOut: ['vip', 'plat', 'cat1', 'cat2', 'cat3'] }),
  {
    id: 'evt-gnr-jakarta', venue: 'madya-end',
    title: "Guns N' Roses", subtitle: 'World Tour 2026',
    dateISO: '2026-11-21T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '',
    host: 'Rajawali Indonesia', hostNote: 'Promoter, with HKE · presented by bale by BTN',
    blurb: "Guns N' Roses bring their 2026 world tour to Stadion Madya at Gelora Bung Karno: an end stage in the south bend, three standing festival areas on the field and seats in both grandstands.",
    about: [
      'Festival A, B and C stand on the field, front to back. In both grandstands VIP is nearest the stage, then Tribune A, then Tribune B. General sale prices run from Rp 1.75M (Festival C) to Rp 7.5M (VIP).',
      'Seat numbers come closer to the show. TipTip lists the gates open from 17:00 to 22:00 WIB. Delay towers and the front-of-house desk may block part of the view from some spots.',
      `Prices as announced by the promoter, before the 10% tax and TipTip's fees. Sold on TipTip, not on tiket.com: TipTip has the live price and stock.`,
      MODEL,
    ],
    runs: [],
    branding: { wall: "GUNS N' ROSES", sub: 'WORLD TOUR 2026', band: ["GUNS N' ROSES", 'WORLD TOUR 2026', 'STADION MADYA GBK', 'JAKARTA'] },
    theme: 'gnr',
    place: MADYA,
    sale: { opens: '2026-07-30T10:00', seller: 'tiptip', tiket: false },
    official: { name: 'TipTip', url: 'https://tiptip.id/event/2e313def-fcca-4af8-ae16-2c243df736a8' },
    photo: 'event-madya-end-1', image: 'gnr-jakarta',
  },
  {
    id: 'evt-5sos-jakarta', venue: 'ina-5sos',
    title: '5 Seconds of Summer', subtitle: "Everyone's a Star! World Tour",
    dateISO: '2026-12-06T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '',
    host: 'Chakra Live Asia', hostNote: 'Promoter',
    blurb: "5 Seconds of Summer play Indonesia Arena, their second Jakarta night after the 14 November show sold out: the same stage, setlist and seat plan. GA standing fills the floor; CAT 1 wraps the first tier, CAT 2 to CAT 4 the upper tiers.",
    about: [
      "GA is standing on the whole floor, the GA VIP 'No.1 Obsession' package at its front, the sound desk at the back. CAT 1 runs round the first tier, with a CAT 1 VIP block on each side towards the stage. The VIP Box seats ring the hall above CAT 1.",
      'CAT 2 is the upper tier facing the stage and along the sides, CAT 3 its blocks nearest the stage, and CAT 4 the end blocks beside the stage, with a side view. Numbered seats from Rp 910K (CAT 4) to Rp 5M (VIP Box).',
      PRICES,
      MODEL,
    ],
    runs: [],
    branding: { wall: '5 SECONDS OF SUMMER', sub: "EVERYONE'S A STAR! WORLD TOUR", band: ['5 SECONDS OF SUMMER', "EVERYONE'S A STAR!", 'INDONESIA ARENA', 'JAKARTA'] },
    theme: '5sos',
    // Four-piece: lead vocals on guitar, guitar, bass, drums.
    lineup: [{ role: 'vocals-guitar' }, { role: 'guitar' }, { role: 'bass' }, { role: 'drums' }],
    place: INA_ARENA,
    sale: { opens: '2026-06-21T12:00', tiket: null },
    official: { name: 'tiket.com', url: TIKET('5 Seconds of Summer') },
    photo: 'event-concert-1', image: '5sos-jakarta',
  },
  {
    id: 'evt-boyz2men-dewa19', venue: 'ina-b2m',
    title: 'Boyz II Men with Dewa 19', subtitle: 'feat. Ari Lasso & Virzha, Live in Jakarta',
    dateISO: '2026-12-09T00:00', time: '18:00', doors: 'TBA', ends: '22:00', age: '',
    host: 'Rajawali Indonesia', hostNote: 'Promoter',
    blurb: 'Boyz II Men share the Indonesia Arena stage with Dewa 19 feat. Ari Lasso and Virzha, a full set each. Standing Festival round a catwalk on the floor; VIP, Diamond and Platinum in the first tier, Gold and Silver above.',
    about: [
      'Festival is standing on the floor, either side of the catwalk, the sound desk at the back. In the first tier VIP fills the front rows (A on the left, B on the right, C facing the stage), Diamond A and B behind it along the sides and Platinum at the back. The VIP Box ring is above.',
      'In the upper tiers Gold faces the stage and Silver A and B run along the sides. Bronze (first tier) and Pearl (upper) are the blocks beside the stage, sold as restricted view. VIP Box, Silver, Bronze and Pearl are sold out on Loket.com; seat numbers come closer to the show.',
      'Prices as announced by the promoter, before the 10% tax, the 5% platform fee and the convenience fee. Sold on Loket.com, not on tiket.com: Loket.com has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'BOYZ II MEN + DEWA19', sub: 'LIVE IN JAKARTA', band: ['BOYZ II MEN', 'DEWA19 FEAT. ARI LASSO & VIRZHA', 'INDONESIA ARENA', 'JAKARTA'] },
    theme: 'b2m',
    // Boyz II Men's set: the three singers out front, the band behind them.
    lineup: [{ role: 'vocals' }, { role: 'vocals' }, { role: 'vocals' }, { role: 'keys' }, { role: 'guitar' }, { role: 'bass' }, { role: 'drums' }],
    soldOut: ['vipboxa', 'vipboxb', 'vipboxc', 'silvera', 'silverb', 'bronzea', 'bronzeb', 'pearla', 'pearlb'],
    place: INA_ARENA,
    sale: { opens: '2026-09-26T10:00', seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://www.loket.com/event/boyziimen-9des-3ux9' },
    photo: 'event-concert-1', image: 'boyz2men-dewa19',
  },
  SHOW({ id: 'evt-nflying-jakarta', theme: 'nflying', sale: {}, image: 'nflying-jakarta', title: 'N.Flying', subtitle: "LIVE '&CON5: into REM' in Indonesia", dateISO: '2027-01-10T00:00', place: BASKET, venue: 'concert',
    from: 1400000, range: 'Rp 1.4M to Rp 3.4M', blurb: 'N.Flying bring their &CON5 tour to Basket Hall at Gelora Bung Karno.' }),
  {
    id: 'evt-bigbang-1', venue: 'jis-bigbang',
    title: 'BIGBANG', subtitle: 'World Tour XX: COSMOS · Day 1',
    dateISO: '2027-01-16T00:00', time: '19:00', doors: 'TBA', ends: '', age: '',
    host: 'PK Entertainment', hostNote: 'Promoter, with AEG Presents Asia and Sound Rhythm',
    blurb: 'BIGBANG (G-Dragon, Taeyang and Daesung) celebrate 20 years with the XX: COSMOS world tour at Jakarta International Stadium. An X-shaped thrust runs out from the stage, the Ultimate VIP standing pens inside it.',
    about: [
      'The first night sold out in presale; the promoter released more seats on 13 November 2026, in limited numbers.',
      'On the floor: Ultimate VIP standing inside the X, Diamond VIP numbered chairs round it and Gold VIP chairs behind, by the sound desk. CAT 2 is the first tier, with CAT 1 A and B along its sides by the stage; CAT 3 the middle tier; CAT 4 the upper tier, with CAT 5 A and B along its sides by the stage. CAT 6 and CAT 7 are the restricted-view blocks beside the stage.',
      'Prices as announced by the promoter, before the 10% tax, the 6% platform fee and other fees. Seat numbers come closer to the show. Sold on Loket.com, not on tiket.com: Loket.com has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'BIGBANG', sub: 'WORLD TOUR XX : COSMOS', band: ['BIGBANG', 'XX : COSMOS', 'JAKARTA INTERNATIONAL STADIUM', 'JAKARTA'] },
    theme: 'bigbang',
    // Three singers, with dancers.
    lineup: [{ role: 'vocals' }, { role: 'vocals' }, { role: 'vocals' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }],
    place: JIS,
    sale: { opens: '2026-09-20T10:00', seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://www.loket.com/' },
    photo: 'event-stadium-end-1', image: 'bigbang-cosmos',
  },
  {
    id: 'evt-bigbang-2', venue: 'jis-bigbang',
    title: 'BIGBANG', subtitle: 'World Tour XX: COSMOS · Day 2',
    dateISO: '2027-01-17T00:00', time: '19:00', doors: 'TBA', ends: '', age: '',
    host: 'PK Entertainment', hostNote: 'Promoter, with AEG Presents Asia and Sound Rhythm',
    blurb: 'BIGBANG (G-Dragon, Taeyang and Daesung) celebrate 20 years with the XX: COSMOS world tour at Jakarta International Stadium. An X-shaped thrust runs out from the stage, the Ultimate VIP standing pens inside it.',
    about: [
      'The second night, added after the first sold out; more seats were released on 13 November 2026.',
      'On the floor: Ultimate VIP standing inside the X, Diamond VIP numbered chairs round it and Gold VIP chairs behind, by the sound desk. CAT 2 is the first tier, with CAT 1 A and B along its sides by the stage; CAT 3 the middle tier; CAT 4 the upper tier, with CAT 5 A and B along its sides by the stage. CAT 6 and CAT 7 are the restricted-view blocks beside the stage.',
      'Prices as announced by the promoter, before the 10% tax, the 6% platform fee and other fees. Seat numbers come closer to the show. Sold on Loket.com, not on tiket.com: Loket.com has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'BIGBANG', sub: 'WORLD TOUR XX : COSMOS', band: ['BIGBANG', 'XX : COSMOS', 'JAKARTA INTERNATIONAL STADIUM', 'JAKARTA'] },
    theme: 'bigbang',
    // Three singers, with dancers.
    lineup: [{ role: 'vocals' }, { role: 'vocals' }, { role: 'vocals' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }],
    place: JIS,
    sale: { opens: '2026-09-24T10:00', seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://www.loket.com/' },
    photo: 'event-stadium-end-1', image: 'bigbang-cosmos',
  },
  SHOW({ id: 'evt-enhypen-jakarta', theme: 'enhypen', sale: { opens: '2026-07-13T15:00', seller: 'loket' }, image: 'enhypen-bloodsaga', title: 'ENHYPEN', subtitle: "World Tour 'Blood Saga'", dateISO: '2027-01-23T00:00', place: JIS, venue: 'stadium-end',
    host: 'PK Entertainment', blurb: "ENHYPEN bring the 'Blood Saga' world tour to Jakarta International Stadium." }),
  SHOW({ id: 'evt-westlife-jakarta', theme: 'westlife', sale: { opens: '2026-05-23T10:00' }, image: 'westlife-25', title: 'Westlife', subtitle: '25: The Anniversary World Tour', dateISO: '2027-01-23T00:00', place: GBK, venue: 'stadium-end',
    soldOutAll: true, blurb: 'Westlife mark 25 years at Gelora Bung Karno Main Stadium.' }),
  SHOW({ id: 'evt-nancy-ajram', theme: 'nancy', sale: { opens: '2026-03-16T10:00', seller: 'traveloka' }, image: 'nancy-ajram', title: 'Nancy Ajram', subtitle: 'Live in Jakarta', dateISO: '2027-01-30T00:00', place: ISTORA, venue: 'concert',
    from: 1150000, range: 'Rp 1.15M to Rp 5.75M', blurb: 'Nancy Ajram plays Istora Senayan.' }),
  {
    id: 'evt-maroon5-jakarta', venue: 'jis-maroon5',
    title: 'Maroon 5', subtitle: 'Asia 2027',
    dateISO: '2027-02-05T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '',
    host: 'TEM Presents', hostNote: 'Promoter, with Live Nation',
    blurb: 'Maroon 5 bring their Asia 2027 tour to Jakarta International Stadium. A runway runs from the stage to a B-stage on the Festival floor.',
    about: [
      'Festival is free standing on the whole floor, round the runway and the B-stage, back to the sound desk and the delay towers. The Early Entry Package (Rp 4.9M) is a Festival ticket with early entry and a gift.',
      'CAT 1 is the first tier facing the stage behind the sound desk, CAT 2 the rest of the first tier, CAT 3 the middle tier and CAT 5 the upper tier. CAT 4, CAT 6 and CAT 7 are the blocks beside the stage in the first, middle and upper tiers, sold as restricted view.',
      'Prices as announced by the promoter, before the 10% tax, the 6% platform fee and the convenience fee. Sold only on maroon5jakarta2027.com.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'MAROON 5', sub: 'ASIA 2027', band: ['MAROON 5', 'ASIA 2027', 'JAKARTA INTERNATIONAL STADIUM', 'JAKARTA'] },
    theme: 'maroon5',
    // Six-piece: lead vocals, two guitars, bass, keys, drums.
    lineup: [{ role: 'vocals' }, { role: 'guitar' }, { role: 'guitar' }, { role: 'bass' }, { role: 'keys' }, { role: 'drums' }],
    place: JIS,
    sale: { opens: '2026-08-29T10:00', tiket: null },
    official: { name: 'tiket.com', url: TIKET('Maroon 5') },
    photo: 'event-stadium-end-1', image: 'maroon5-asia',
  },
  SHOW({ id: 'evt-thescript-jakarta', theme: 'script', sale: { opens: '2026-08-22T10:00', seller: 'tiptip' }, image: 'thescript-arena', title: 'The Script', subtitle: 'Man in the Arena Tour 2027', dateISO: '2027-04-03T00:00', place: ISTORA, venue: 'concert',
    from: 1300000, range: 'Rp 1.3M to Rp 4.2M', blurb: 'The Script bring the Man in the Arena tour to Istora Senayan.' }),
  SHOW({ id: 'evt-m2m-jakarta', theme: 'm2m', sale: { opens: '2026-10-26T11:00' }, image: 'm2m-two', title: 'M2M', subtitle: 'Two Tour', dateISO: '2027-04-10T00:00', place: TENNIS, venue: 'concert',
    from: 1250000, range: 'Rp 1.25M to Rp 2.25M', blurb: 'M2M play Tennis Indoor at Gelora Bung Karno on their Two Tour.' }),
];

// Demo venues: one per layout, fully open, for the partner page and anyone who wants to try
// the seat view before buying. Fictional places, except the Tottenham model.
const DEMO_PLACE = {
  arena: { name: 'Nusantara Arena', city: 'Jakarta', address: 'Demo venue', capacity: '8,734 seats' },
  stadium: { name: 'Gelora Samudra Stadium', city: 'Jakarta', address: 'Demo venue', capacity: '' },
  hall: { name: 'Satria Hall', city: 'Surabaya', address: 'Demo venue', capacity: '7,632 seats' },
  cinema: { name: 'Cakrawala Cinema', city: 'Bandung', address: 'Demo venue', capacity: '270 seats per studio' },
  spurs: { name: 'Tottenham Hotspur Stadium', city: 'London', address: 'Modelled from a seating plan of the ground', capacity: '62,850 seats' },
};
const DEMO = (venue, name, blurb, place, branding = {}) => ({
  id: `demo-${venue}`, venue, demo: true, title: name, subtitle: 'Demo venue', blurb, place, branding, photo: `venue-${venue}`,
});
export const DEMOS = [
  DEMO('concert', 'Concert arena', 'End stage with an LED wall, a standing VIP and Floor A filling the floor, two curved tiers behind.', DEMO_PLACE.arena,
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
      // The building's own seats where we know them, else the show's colour, else the template's.
      seatColor: e.place?.seatColor || THEMES[e.theme]?.seat || base.seatColor,
      seatStyle: e.place?.seatStyle || base.seatStyle,
      // Who is on stage (crowd3d.js Band): roles only, no likeness.
      lineup: e.lineup || null,
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
  return known.length ? Math.min(...known) : (byId.get(id)?.from ?? null);
}

export const soldOut = (e, catId) => !!e.soldOut?.includes(catId);
export const allSoldOut = e => getEvent(e.id).categories.every(c => soldOut(e, c.id));
