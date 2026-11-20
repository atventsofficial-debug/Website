// Concert catalogue and demo venues. Each runs on one venue template (seat layout) and
// carries its own copy, prices and stage branding. `image` is its own artwork and `photo`
// the venue render shown without one (media.js). `numbering`, set once the promoter or the
// venue confirms how its seats are numbered, is how every pass's seat tour counts rows and
// seats (seatflip.js: { seats, rows, letters }); a fan can still set their own. Pure data:
// the Node server imports it too, so event ids and categories are checked on both sides.
import { getVenue, venueInfo, REAL_KEYS } from './layouts.js';
import { THEMES } from './themes.js';

// Country, time zone and the airport-style code printed on tickets. Times are the clock at
// the venue; fans abroad read them in their own zone (when.js).
export const CITY = {
  Jakarta: { country: 'ID', tz: 'Asia/Jakarta', code: 'JKT' },
  Bandung: { country: 'ID', tz: 'Asia/Jakarta', code: 'BDG' },
  Surabaya: { country: 'ID', tz: 'Asia/Jakarta', code: 'SUB' },
  Tangerang: { country: 'ID', tz: 'Asia/Jakarta', code: 'TNG' },
  London: { country: 'GB', tz: 'Europe/London', code: 'LON' },
};

// Concerts sold on tiket.com, as listed there in October 2026. Facts come from the
// promoters' announcements as reported by the press; anything not announced shows as TBA.
// We do not sell these tickets: `official` is where fans buy them, through our affiliate
// link when one is set (config.js). Each `url` is that show's own page on the seller or the
// promoter's ticket site, never a seller's home page or a search (checked November 2026).
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
const ICE_BSD = { name: 'ICE BSD City, Hall 5–6', art: 'jiexpo', city: 'Tangerang', address: 'Jl. BSD Grand Boulevard, Pagedangan, Tangerang, Banten', transit: '', capacity: '' };
const GRAHA_UNESA = { name: 'Graha UNESA', art: 'jiexpo', city: 'Surabaya', address: 'Universitas Negeri Surabaya, Lidah Wetan, Surabaya', transit: '', capacity: '' };
const XXI = { name: 'Cinema XXI', art: 'jiexpo', city: 'Jakarta', address: 'XXI cinemas across Indonesia', transit: '', capacity: '' };
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
  tiket: { name: 'tiket.com', url: 'https://www.tiket.com/en-id/to-do' },
  persija: { name: 'persija.id', url: 'https://www.persija.id/tickets' },
  xxi: { name: 'Cinema XXI', url: 'https://21cineplex.com/' },
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
// `type` sets the list filter (EVENT_TYPES below); a match, a fight or a film runs on the
// matching demo layout as its stand-in. `prices` is the promoter's own price list in words,
// `standInNote` replaces the stand-in sentence, `until` keeps a film on the lists through its run.
const SHOW = ({ id, image, theme, title, subtitle, dateISO, time = 'TBA', place, venue, type, host = 'TBA', hostNote = 'Promoter', from = null, range = '', prices = '', soldOutAll = false, blurb, extra = [], sale = {}, url = '', branding, standInNote = STANDIN, until, age = '' }) => {
  const cats = venueInfo(venue).categories.map(c => ({ ...c, price: null }));
  const seller = SELLERS[sale.seller] || { name: 'tiket.com', url: TIKET(title) };
  const official = url ? { ...seller, url } : seller;
  const onTiketCom = official.name === 'tiket.com';
  return {
    id, venue, title, subtitle, dateISO, time, doors: 'TBA', ends: '', age,
    ...(type ? { type } : {}), ...(until ? { until } : {}),
    host, hostNote, blurb, cats, from, standIn: true,
    // When general sale opens, and whether tiket.com is a confirmed seller (null: not known yet).
    sale: { tiket: onTiketCom && sale.seller ? true : sale.seller ? false : null, ...sale },
    about: [
      ...extra,
      prices || (range ? `Tickets announced from ${range}. Prices per category are on ${official.name}.` : 'Ticket prices have not been announced yet.'),
      standInNote,
      onTiketCom ? PRICES : `Prices as announced by the promoter. Sold on ${official.name}, not on tiket.com: ${official.name} has the live price and stock.`,
    ],
    runs: [],
    branding: branding || { wall: title.toUpperCase(), sub: subtitle.toUpperCase(), band: [title.toUpperCase(), subtitle.toUpperCase(), place.name.toUpperCase(), place.city.toUpperCase()] },
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

// Each day has its own page on tiket.com.
const BTS_URL = { 1: 'bts-jakarta-day1', 2: 'bts-jakarta-day2', 3: 'bts-jakarta-3rdshowday' };
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
  official: { name: 'tiket.com', url: `https://www.tiket.com/en-id/to-do/${BTS_URL[n]}` },
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
    // Vocals, two guitars and bass, with keys and drums on tour.
    lineup: [{ role: 'vocals' }, { role: 'guitar' }, { role: 'guitar' }, { role: 'bass' }, { role: 'keys' }, { role: 'drums' }],
    soldOut: ['vvip'],
    place: JIS,
    sale: { opens: '2026-02-07T10:00', tiket: true },
    official: { name: 'tiket.com', url: 'https://www.tiket.com/en-id/to-do/my-chemical-romance-live-in-jakarta-2026' },
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
    // Vocals, two guitars, bass, two keyboards and drums.
    lineup: [{ role: 'vocals' }, { role: 'guitar' }, { role: 'guitar' }, { role: 'bass' }, { role: 'keys' }, { role: 'keys', female: true }, { role: 'drums' }],
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
      'Prices as announced by the promoter, Chakra Live Asia. Sold only on 5sosjakarta.com, the promoter’s ticket site, not on tiket.com: it has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: '5 SECONDS OF SUMMER', sub: "EVERYONE'S A STAR! WORLD TOUR", band: ['5 SECONDS OF SUMMER', "EVERYONE'S A STAR!", 'INDONESIA ARENA', 'JAKARTA'] },
    theme: '5sos',
    // Four-piece: lead vocals on guitar, guitar, bass, drums.
    lineup: [{ role: 'vocals-guitar' }, { role: 'guitar' }, { role: 'bass' }, { role: 'drums' }],
    place: INA_ARENA,
    sale: { opens: '2026-06-21T12:00', tiket: false },
    official: { name: '5sosjakarta.com', url: 'https://5sosjakarta.com/' },
    photo: 'event-concert-1', image: '5sos-jakarta',
  },
  {
    id: 'evt-boyz2men-dewa19', venue: 'ina-b2m',
    title: 'Boyz II Men with Dewa 19', subtitle: 'feat. Ari Lasso & Virzha, Live in Jakarta',
    dateISO: '2026-12-09T18:00', time: '18:00', doors: 'TBA', ends: '22:00', age: '',
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
    photo: 'event-concert-1', image: 'boyz2men-live',
  },
  {
    id: 'evt-nflying-jakarta', venue: 'basket-nflying',
    title: 'N.Flying', subtitle: "LIVE '&CON5: into REM' in Indonesia",
    dateISO: '2027-01-10T19:00', time: '19:00', doors: 'TBA', ends: '', age: '',
    host: 'Karalas Live', hostNote: 'Promoter',
    blurb: 'N.Flying bring their &CON5 tour to Basket Hall at Gelora Bung Karno. Cockpit and Runway stand on the floor; Cloud 9, Skyline and Horizon are the seats along the two sides.',
    about: [
      'On the floor Cockpit A and B stand at the front, Runway A and B behind them, with no barrier between Cockpit and Runway; a barrier runs down the middle, A on the left and B on the right, the sound desk at the back.',
      'The seats are in the two side stands, in three bands from the floor up: Cloud 9 nearest the floor, then Skyline, then Horizon. Seat and queue numbers are announced closer to the show.',
      'Prices as announced by the promoter, before the government tax and the ticketing fee. Sold on Loket.com, not on tiket.com: Loket.com has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'N.FLYING', sub: "LIVE '&CON5: INTO REM'", band: ['N.FLYING', 'INTO REM', 'BASKET HALL GBK', 'JAKARTA'] },
    theme: 'nflying',
    // The band: lead vocals and rhythm guitar, a second singer, guitar, bass and drums.
    lineup: [{ role: 'vocals-guitar' }, { role: 'vocals' }, { role: 'guitar' }, { role: 'bass' }, { role: 'drums' }],
    place: BASKET,
    sale: { seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://nflyingjakarta2027.com/' },
    photo: 'event-concert-1', image: 'nflying-band',
  },
  {
    id: 'evt-bigbang-1', venue: 'jis-bigbang',
    title: 'BIGBANG', subtitle: 'World Tour XX: COSMOS · Day 1',
    dateISO: '2027-01-16T19:00', time: '19:00', doors: 'TBA', ends: '', age: '',
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
    official: { name: 'Loket.com', url: 'https://bigbanginjakarta.com/' },
    photo: 'event-stadium-end-1', image: 'bigbang-cosmos',
  },
  {
    id: 'evt-bigbang-2', venue: 'jis-bigbang',
    title: 'BIGBANG', subtitle: 'World Tour XX: COSMOS · Day 2',
    dateISO: '2027-01-17T19:00', time: '19:00', doors: 'TBA', ends: '', age: '',
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
    official: { name: 'Loket.com', url: 'https://bigbanginjakarta.com/' },
    photo: 'event-stadium-end-1', image: 'bigbang-cosmos',
  },
  {
    id: 'evt-enhypen-jakarta', venue: 'jis-enhypen',
    title: 'ENHYPEN', subtitle: "World Tour 'Blood Saga'",
    dateISO: '2027-01-23T19:00', time: '19:00', doors: 'TBA', ends: '', age: '',
    host: 'PK Entertainment', hostNote: 'Promoter',
    blurb: "ENHYPEN bring the 'Blood Saga' world tour to Jakarta International Stadium. A runway runs from the stage to a walkway right across the floor, with VIP A and B standing either side of it.",
    about: [
      'On the floor: VIP A and VIP B standing either side of the runway, in front of the walkway across the floor; CAT 1 numbered chairs behind it, back past the delay towers; CAT 2 C chairs in the two back corners, beside the sound desk.',
      'In the first tier CAT 2 A (left) and CAT 2 B (right) run along the sides from the stage, CAT 3 round the far end; the middle tier is all CAT 4. The upper tier is sold from midfield back: CAT 7 A/B, then CAT 6 A/B along the sides, CAT 5 round the far end.',
      'Prices as announced by the promoter, before the 10% tax, the 6% platform fee and other fees. VIP gets a queue number on purchase; seat numbers come closer to the show. Sold on Loket.com through enhypeninjakarta.com, not on tiket.com: Loket.com has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'ENHYPEN', sub: "WORLD TOUR 'BLOOD SAGA'", band: ['ENHYPEN', 'BLOOD SAGA', 'JAKARTA INTERNATIONAL STADIUM', 'JAKARTA'] },
    theme: 'enhypen',
    // Seven members, singing and dancing.
    lineup: Array.from({ length: 7 }, () => ({ role: 'dancer' })),
    place: JIS,
    sale: { opens: '2026-07-13T15:00', seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://enhypeninjakarta.com/' },
    photo: 'event-stadium-end-1', image: 'enhypen-bloodsaga',
  },
  SHOW({ id: 'evt-westlife-jakarta', theme: 'westlife', sale: { opens: '2026-05-23T10:00', seller: 'loket' }, url: 'https://westlifestadiumshowjkt.com/', image: 'westlife-25', title: 'Westlife', subtitle: '25: The Anniversary World Tour', dateISO: '2027-01-23T00:00', place: GBK, venue: 'stadium-end',
    soldOutAll: true, blurb: 'Westlife mark 25 years at Gelora Bung Karno Main Stadium.' }),
  {
    id: 'evt-nancy-ajram', venue: 'istora-nancy',
    title: 'Nancy Ajram', subtitle: 'Live in Jakarta',
    dateISO: '2027-01-30T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '',
    host: 'TBA', hostNote: 'Promoter',
    blurb: 'Nancy Ajram returns to Istora Senayan after her first Jakarta show in 2025. Festival stands in front of the stage; VIP chairs on the floor behind the sound desk, Diamond facing the stage, Platinum and Gold along the sides.',
    about: [
      'Festival is standing from the stage back to the sound desk; VIP is numbered chairs on the floor behind it. Diamond is the stand facing the stage, Platinum the first tier and Gold the second tier along both sides.',
      'Prices as announced by the promoter, before the government tax, the platform fee and other fees. Sold on nancyajramjakarta.com and Traveloka, not on tiket.com.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'NANCY AJRAM', sub: 'LIVE IN JAKARTA', band: ['NANCY AJRAM', 'LIVE IN JAKARTA', 'ISTORA SENAYAN', 'JAKARTA'] },
    theme: 'nancy',
    // The singer and her band.
    lineup: [{ role: 'vocals', female: true }, { role: 'keys' }, { role: 'keys' }, { role: 'guitar' }, { role: 'bass' }, { role: 'drums' }],
    place: ISTORA,
    sale: { opens: '2026-03-16T10:00', seller: 'traveloka', tiket: false },
    official: { name: 'Traveloka', url: 'https://www.traveloka.com/en-id/activities/indonesia/product/nancy-ajram-live-in-jakarta-2027-tickets-8745573405209' },
    photo: 'event-concert-1', image: 'nancy-ajram',
  },
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
    official: { name: 'tiket.com', url: 'https://www.tiket.com/en-id/to-do/maroon5asia2027-generalonsale' },
    photo: 'event-stadium-end-1', image: 'maroon5-jakarta-live',
  },
  {
    id: 'evt-thescript-jakarta', venue: 'ina-script',
    title: 'The Script', subtitle: 'Man in the Arena Tour 2027',
    dateISO: '2027-04-03T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '',
    host: 'Color Asia Live', hostNote: 'Promoter',
    blurb: 'The Script bring the Man in the Arena tour to Indonesia Arena, with The Calling as very special guest. Golden Festival stands round a catwalk from the stage, Festival behind it.',
    about: [
      'Golden Festival is standing round the catwalk, its Priority tickets (early entry, a PVC card and a priority merchandise line) at the front with no barrier between them. Festival is standing behind it, round the sound desk.',
      'In the first tier Diamond VIP (snack and drink included) takes the front rows along the sides and across the far end, Platinum the rows behind, and Gold the two corners, where the wheelchair spaces are. In the upper tier Silver faces the stage and runs along the sides, Bronze takes the corners. Red, beside the stage in both tiers, is sold as restricted view.',
      'Prices as announced by the promoter, before the government tax, the admin fee and the 20% platform fee. Sold on TipTip and thescriptjkt.com, not on tiket.com: TipTip has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'THE SCRIPT', sub: 'MAN IN THE ARENA TOUR 2027', band: ['THE SCRIPT', 'MAN IN THE ARENA TOUR 2027', 'INDONESIA ARENA', 'JAKARTA'] },
    theme: 'script',
    // Lead vocals, two guitars, bass, keys and drums.
    lineup: [{ role: 'vocals' }, { role: 'guitar' }, { role: 'guitar' }, { role: 'bass' }, { role: 'keys' }, { role: 'drums' }],
    place: INA_ARENA,
    sale: { opens: '2026-08-22T10:00', seller: 'tiptip', tiket: false },
    official: { name: 'TipTip', url: 'https://info.tiptip.id/thescriptjkt2027' },
    photo: 'event-concert-1', image: 'thescript-arena',
  },
  {
    id: 'evt-m2m-jakarta', venue: 'tennis-m2m',
    title: 'M2M', subtitle: 'Two Tour',
    dateISO: '2027-04-10T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '7+',
    host: 'Akselerasi Entertainment', hostNote: 'Promoter',
    blurb: 'M2M play Tennis Indoor at Gelora Bung Karno on their Two Tour. CAT 1 and CAT 2 stand on the floor; CAT 3 faces the stage and CAT 4 A and B run along the sides.',
    about: [
      'CAT 1 and CAT 2 are free standing on the floor, CAT 1 at the front, the sound desk at the back of CAT 2. CAT 3 is numbered seats in the stand facing the stage; CAT 4 A (left) and CAT 4 B (right) numbered seats along the sides. Seat numbers come closer to the show; some views may be partly blocked by the sound desk.',
      'Minimum age 7; under 14s must come with an adult. Prices as announced by the promoter, before the 20% for taxes, royalties, admin and platform fees. Sold on Loket.com, not on tiket.com.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'M2M', sub: 'TWO TOUR', band: ['M2M', 'TWO TOUR', 'TENNIS INDOOR GBK', 'JAKARTA'] },
    theme: 'm2m',
    // The duo, one on guitar, with their band.
    lineup: [{ role: 'vocals-guitar', female: true }, { role: 'vocals', female: true }, { role: 'guitar' }, { role: 'bass' }, { role: 'keys' }, { role: 'drums' }],
    place: TENNIS,
    sale: { opens: '2026-10-26T11:00', seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://m2minjakarta.com/' },
    photo: 'event-concert-1', image: 'm2m-live',
  },

  // Added 20 November 2026, each read off the seller's or promoter's own event page that day.
  {
    id: 'evt-simpleplan-jakarta', venue: 'tennis-m2m',
    title: 'Simple Plan', subtitle: 'The Bigger Than You Think! Tour',
    dateISO: '2026-11-27T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '',
    host: 'Akselerasi Entertainment', hostNote: 'Promoter, with TSP & Co. and Midas Promotions',
    blurb: 'Simple Plan celebrate 25 years with The Bigger Than You Think! Tour at Tennis Indoor Senayan, a setlist from every era of the band, with LØLØ as special guest. CAT 1 and CAT 2 stand on the floor; CAT 3 faces the stage and CAT 4 A and B run along the sides.',
    about: [
      'From the promoter’s seating plan: CAT 1 is free standing at the front (Rp 1.65M) and CAT 2 free standing behind it, round the sound desk (Rp 950K). CAT 3 is numbered seats in the stand facing the stage (Rp 1.95M); CAT 4 A and CAT 4 B numbered seats along the two sides (Rp 1.45M). Seat numbers are given by the system within each category.',
      'Prices as announced by the promoter, before tax and the admin fee. Sold on Loket.com through simpleplanindonesia.com, not on tiket.com: it has the live price and stock. The Surabaya show (28 Nov, Jatim Expo) is on the same site.',
      MODEL,
    ],
    runs: [],
    cats: [
      { id: 'cat3', name: 'CAT 3', price: 1950000, color: '#7cb342', note: 'Numbered seats facing the stage' },
      { id: 'cat1', name: 'CAT 1', price: 1650000, color: '#d84a3a', note: 'Free standing at the front' },
      { id: 'cat4a', name: 'CAT 4 A', price: 1450000, color: '#a0642e' },
      { id: 'cat4b', name: 'CAT 4 B', price: 1450000, color: '#a0642e' },
      { id: 'cat2', name: 'CAT 2', price: 950000, color: '#f2c14e', note: 'Free standing, round the sound desk' },
    ],
    branding: { wall: 'SIMPLE PLAN', sub: 'THE BIGGER THAN YOU THINK! TOUR', band: ['SIMPLE PLAN', 'BIGGER THAN YOU THINK!', 'TENNIS INDOOR SENAYAN', 'JAKARTA'] },
    theme: 'm2m',
    // Five-piece pop-punk: lead vocals, two guitars, bass, drums.
    lineup: [{ role: 'vocals' }, { role: 'guitar' }, { role: 'guitar' }, { role: 'bass' }, { role: 'drums' }],
    place: TENNIS,
    sale: { opens: '2026-05-05T10:00', seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://simpleplanindonesia.com/' },
    photo: 'event-concert-1', image: 'simpleplan-jakarta',
  },
  SHOW({ id: 'evt-boynextdoor-jakarta', image: 'boynextdoor-jakarta', time: '19:00', theme: 'enhypen', title: 'BOYNEXTDOOR', subtitle: "TOUR 'KNOCK ON Vol.2' in Jakarta", dateISO: '2026-12-05T19:00', place: ICE_BSD, venue: 'concert',
    host: 'PK Entertainment', from: 2146000, sale: { seller: 'tiket', tiket: true }, url: 'https://www.tiket.com/en-id/to-do/boynextdoor-tour-knock-on-vol2',
    blurb: "BOYNEXTDOOR bring their first world tour, 'KNOCK ON Vol.2', to ICE BSD City Hall 5–6. Standing pens on the floor, ONEDOOR VIP at the front; CAT 1 and CAT 2 are numbered seats.",
    prices: 'From tiket.com: ONEDOOR VIP A and B (standing) Rp 3,944,000; ORANGE A and B (standing) Rp 3,190,000; PINK A and B (standing) Rp 2,146,000; CAT 1 (numbered seating) Rp 3,190,000; CAT 2 (numbered seating) Rp 2,726,000. Prices include the 10% tax and the 6% platform fee. ORANGE A and PINK A were sold out on 20 November 2026.',
    extra: ['Sold only on tiket.com, up to six tickets per transaction. Wristband redemption is announced by the promoter (@pkentertainment.id, bndinjakarta.com). No under-12s in the standing pens.'] }),
  SHOW({ id: 'evt-persija-baliutd', image: 'persija-match', type: 'football', theme: 'gnr', title: 'Persija Jakarta vs Bali United', subtitle: 'BRI Super League 2026/27', dateISO: '2026-12-12T19:00', time: '19:00', place: GBK, venue: 'stadium',
    host: 'Persija Jakarta', hostNote: 'Home club', sale: { seller: 'persija' }, url: 'https://www.persija.id/matches/persija-jakarta-vs-bali-united-fc-2026-12-12',
    blurb: 'Persija host Bali United at Gelora Bung Karno Main Stadium in the BRI Super League, kick-off 19:00 WIB.',
    branding: { home: 'PERSIJA', away: 'BALI UTD' },
    standInNote: 'The 3D venue is our generic football stadium, not GBK’s own stands: use it for a feel of the view from the side or behind the goal, not to pick a seat.',
    extra: ['Tickets are sold by the club on persija.id (sign in under Tickets), usually in the week before the match. Prices and stands had not been announced on 20 November 2026.'] }),
  SHOW({ id: 'evt-janice-tjen-live', image: 'janice-tjen-live', type: 'sport', theme: 'nancy', title: 'Janice Tjen Live', subtitle: 'Game. Set. Celebrate.', dateISO: '2026-12-12T13:00', time: '13:00', place: TENNIS, venue: 'tennis',
    host: 'Tatler Indonesia', hostNote: 'Organiser · Tatler Sports', from: 600000, sale: { seller: 'loket' }, url: 'https://www.loket.com/event/janice-tjen-live-game-set-celebrate_w8U1',
    blurb: 'Indonesia’s top-ranked tennis player Janice Tjen comes home for an exhibition match against Thailand’s Mananchaya Sawangkaew at Tennis Indoor Senayan.',
    branding: { mark: 'JANICE TJEN', sub: 'GAME · SET · CELEBRATE', hall: 'TENNIS INDOOR SENAYAN', title: 'JANICE TJEN LIVE · JAKARTA' },
    prices: 'From Loket.com: Platinum Rp 7,000,000 and VIP Seats Rp 3,960,000 (both sold out), Courtside Rp 2,700,000, CAT 1 Rp 830,000, CAT 2 Rp 600,000. Gates and programme from 13:00 to 21:00 WIB.',
    standInNote: 'The 3D venue is our tennis centre court, with courtside rows along both sidelines and two tiers round it, not the promoter’s plan of Tennis Indoor (none has been published): use it for a feel of courtside and the stands, not to pick a seat.' }),
  SHOW({ id: 'evt-persija-madura', image: 'persija-calonego', type: 'football', theme: 'gnr', title: 'Persija Jakarta vs Madura United', subtitle: 'BRI Super League 2026/27', dateISO: '2026-12-16T15:30', time: '15:30', place: GBK, venue: 'stadium',
    host: 'Persija Jakarta', hostNote: 'Home club', sale: { seller: 'persija' }, url: 'https://www.persija.id/matches/persija-jakarta-vs-madura-united-fc-2026-12-16',
    blurb: 'Persija host Madura United at Gelora Bung Karno Main Stadium in the BRI Super League, kick-off 15:30 WIB.',
    branding: { home: 'PERSIJA', away: 'MADURA UTD' },
    standInNote: 'The 3D venue is our generic football stadium, not GBK’s own stands: use it for a feel of the view from the side or behind the goal, not to pick a seat.',
    extra: ['Tickets are sold by the club on persija.id (sign in under Tickets), usually in the week before the match. Prices and stands had not been announced on 20 November 2026.'] }),
  SHOW({ id: 'evt-dune-part-three', image: 'dune-part-three', type: 'cinema', theme: 'bocelli', title: 'Dune: Part Three', subtitle: 'In cinemas', dateISO: '2026-12-18T00:00', until: '2027-01-15T00:00', place: XXI, venue: 'cinema',
    host: 'Warner Bros. Pictures', hostNote: 'Studio · directed by Denis Villeneuve', sale: { seller: 'xxi' }, url: 'https://21cineplex.com/dune-part-three,139921,26DPTE.htm',
    blurb: 'Denis Villeneuve’s Dune: Part Three, with Timothée Chalamet, Zendaya, Florence Pugh and Robert Pattinson, opens worldwide on 18 December 2026.',
    prices: 'Ticket prices depend on the cinema, the studio (regular, IMAX, premiere) and the day; XXI shows them with the showtimes in the M-Tix app and on 21cineplex.com.',
    standInNote: 'The 3D view is our cinema studio (rows A to N, sweetboxes at the back), not a particular XXI studio: use it to compare a front, middle or back row.',
    extra: ['Cinema XXI listed it as coming soon on 20 November 2026; the Indonesian opening day is confirmed when XXI opens the showtimes. We keep it on the list until mid-January.'] }),
  SHOW({ id: 'evt-jkt48-15th', image: 'jkt48-15th', theme: 'maroon5', title: 'JKT48', subtitle: 'AYO SENYUMLAH · 15th Anniversary Concert', dateISO: '2026-12-19T18:30', time: '18:30', place: GRAHA_UNESA, venue: 'concert',
    host: 'JKT48', hostNote: 'Organiser', from: 450000, sale: { opens: '2026-11-16T12:00', seller: 'loket' }, url: 'https://www.loket.com/event/jkt48-ayosenyumlah-concert',
    blurb: 'JKT48 mark fifteen years, and their 28th single “Ayo Senyumlah”, with an anniversary concert at Graha UNESA in Surabaya, 18:30 to 20:30 WIB.',
    prices: 'From Loket.com (general sale): CAT 3 Rp 1,200,000, CAT 4 Rp 1,000,000, CAT 5 Rp 750,000, CAT 6 Rp 550,000, CAT 7 Rp 450,000. On 20 November 2026 only CAT 4 was still available.',
    extra: ['Sold only on Loket.com, up to four tickets per transaction; the e-ticket is exchanged for a wristband. More on jkt48.com.'] }),
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
  DEMO('tennis', 'Tennis centre court', 'A court down the middle with courtside rows along both sidelines and two tiers round it.', { ...DEMO_PLACE.hall, name: 'Satria Hall, Centre Court', capacity: '' },
    { mark: 'CENTRE COURT', sub: 'LIVE IN 3D', hall: 'SATRIA HALL', title: 'NUSANTARA OPEN · SURABAYA' }),
  DEMO('cinema', 'Cinema studio', 'Stadium seating in front of a wide screen, rows A to N, sweetboxes on the back row.', DEMO_PLACE.cinema),
];

const byId = new Map([...EVENTS, ...DEMOS].map(e => [e.id, e]));
const cache = {};

export const eventMeta = id => byId.get(id);
export const isConcert = id => !!byId.get(id) && !byId.get(id).demo;
export const demoFor = key => DEMOS.find(d => d.venue === key);

// `venue` is the seat-layout template; `place` the real (or demo) venue.
export const placeOf = e => e.place;
// What kind of event it is, for the list's filter. Every show so far is a concert; a match or
// a fight night sets `type` on its entry ('football', 'combat', ...).
export const EVENT_TYPES = { concert: 'Concerts', football: 'Football', combat: 'UFC & fights', sport: 'Sports', theatre: 'Theatre', cinema: 'Cinema', festival: 'Festivals' };
export const typeOf = e => (e.type && EVENT_TYPES[e.type] ? e.type : 'concert');
export const timeKnown = e => e.time !== 'TBA';

// A venue object for one event: the template's seats with this event's prices, title and
// branding. Everything downstream (3D, pages, server) takes this. `cats` replaces the
// template's categories; `zone(seat)` then assigns each seat to one.
export function getEvent(id) {
  const e = byId.get(id);
  if (!e) return null;
  if (!cache[id]) {
    // Without the seats at first: lists and prices need only the categories, and laying out a
    // venue's seats is seconds of a phone's CPU. `seats` and `seatById` are built the first
    // time a page reads them (a 3D view, a seat picker, a seat count).
    const base = venueInfo(e.venue);
    const categories = (e.cats || base.categories).map(c => ({ ...c }));
    const ev = cache[id] = {
      ...base,
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
    const lazy = (name, make) => Object.defineProperty(ev, name, {
      configurable: true, enumerable: true,
      get() { const value = make(); Object.defineProperty(ev, name, { value, writable: true, enumerable: true, configurable: true }); return value; },
      set(value) { Object.defineProperty(ev, name, { value, writable: true, enumerable: true, configurable: true }); },
    });
    lazy('seats', () => { const full = getVenue(e.venue); return e.zone ? full.seats.map(s => ({ ...s, cat: e.zone(s) })) : full.seats; });
    lazy('seatById', () => getVenue(e.venue).seatById);
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
