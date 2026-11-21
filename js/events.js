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
const XXI_SALE = 'Sold by Cinema XXI on m.21cineplex.com and the m.tix app, not on tiket.com. Showtimes, studios and prices differ by cinema and by day: m.tix has them for each cinema.';
const XXI_PRICE = { reguler: 'Rp 75,000', imax: 'Rp 90,000', premiere: 'Rp 250,000' };
// Each class runs on one plan XXI uses for it (cinemas.js); a cinema's own studio may differ.
const CLASS = {
  reguler: { venue: 'xxi-reguler', option: 'Reguler 2D', words: 'A Reguler 2D studio as XXI lays one out: rows M (front) to A (back), an aisle two seats in from the left wall and another four seats in from the right, two more seats on the left in the back three rows. 174 seats.' },
  imax: { venue: 'xxi-imax', option: 'IMAX 2D', words: 'An XXI IMAX studio: rows N, M and L in front of a cross aisle, then K to A behind it, raked steeply; K to G are the middle block only, F to B run wall to wall. 380 seats.' },
  premiere: { venue: 'xxi-premiere', option: 'The Premiere', words: 'A Premiere studio: five rows, E (front) to A, each of three pairs of recliners (6–5, 4–3, 2–1 from the left) with aisles between the pairs. 30 seats.' },
};
const XXI_MAP = 'The 3D studio is drawn from Cinema XXI’s own seat map for a studio of this class (the seat picker on m.21cineplex.com, 21 November 2026), seat for seat. Studios differ from one cinema to the next, so use it for a feel of the rows and the screen; you pick your seat when you book on m.tix.';
const CINEMA_XXI = { name: 'Cinema XXI', art: 'jiexpo', seatColor: '#9a1325', city: 'Jakarta', address: 'Cinemas across Indonesia', transit: 'Showtimes for each cinema on m.tix', capacity: '' };

// Films Cinema XXI listed as now showing on 21 November 2026. One card a film; each class it
// shows in (Reguler, IMAX, The Premiere) is an event of its own with that class's 3D studio.
const FILM_LIST = [
  { slug: 'hunger-games', code: '26HGSR', title: 'The Hunger Games: Sunrise on the Reaping', image: 'hunger-games-sunrise', theme: 'bocelli', since: '18 November',
    host: 'Lionsgate', who: 'directed by Francis Lawrence', mins: '2 h 38 min', genre: 'Action, fantasy', classes: ['reguler', 'imax', 'premiere'],
    blurb: 'Panem, 24 years before The Hunger Games: the reaping for the 50th Games, the Second Quarter Quell.' },
  { slug: 'godzilla-minus-zero', code: '26GMZO', title: 'Godzilla Minus Zero', image: 'godzilla-minus-zero', theme: 'gnr', since: '4 November',
    host: 'Toho', who: 'written and directed by Takashi Yamazaki', mins: '2 h 15 min', genre: 'Action, sci-fi', classes: ['reguler'],
    blurb: 'Takashi Yamazaki’s follow-up to Godzilla Minus One: two years after the war and Godzilla’s attack, Japan is rebuilding when a new threat rises.' },
  { slug: 'ramayana', code: '26RAMA', title: 'Ramayana: Director’s Cut', image: 'ramayana-directors-cut', theme: 'bocelli', since: '11 November',
    host: 'Columbia Pictures', who: 'directed by Nitesh Tiwari, with Ranbir Kapoor, Yash and Sai Pallavi', mins: '3 h 28 min', genre: 'Epic', classes: ['reguler', 'premiere'],
    blurb: 'The ancient epic: a young prince and princess, whose marriage and exile begin a legendary journey of love, duty and fate.' },
  { slug: 'gak-ada-matinya', code: '16GAMA', title: 'Gak Ada Matinya', image: 'gak-ada-matinya', theme: 'gnr', since: '5 November',
    host: 'MD Pictures', who: 'produced by Manoj Punjabi and Muhadkly Acho, directed by Etienne Caesar, with Oki Rengga, Mikha Tambayong, Fedi Nuril and Mathias Muchus', mins: '2 h 1 min', genre: 'Comedy, drama', classes: ['reguler'],
    blurb: 'Behind on his mortgage and out of work, Binsar learns that the father he resented, just died in hospital, had life insurance that could save him; on the way to the funeral home, his father wakes up in the hearse.' },
  { slug: 'seporsi-mie-ayam', code: '16SMAS', title: 'Seporsi Mie Ayam Sebelum Mati', image: 'seporsi-mie-ayam', theme: 'bocelli', since: '12 November',
    host: 'Sinergi Pictures', who: 'with Ben Film, directed by Kuntz Agus, with Benidictus Siregar, Chicco Kurniawan and Tika Panggabean', mins: '2 h 1 min', genre: 'Drama', classes: ['reguler'],
    blurb: 'On his birthday Ale wants one last bowl of his favourite mie ayam, and over it meets strangers whose lives slowly change how he sees his own. From Brian Khrisna’s novel.' },
  { slug: 'blue-lock', code: '26BLOK', title: 'Blue Lock', image: 'blue-lock', theme: 'bocelli', since: '20 November',
    host: 'Kodansha', who: 'with CK Works and Credeus, directed by Yusuke Taki, with Kaito Sakurai and Masataka Kubota', mins: '2 h 7 min', genre: 'Action, drama, sport', classes: ['reguler'],
    blurb: 'The live-action film: 300 high-school footballers in a secret training camp, where one comes out as the world’s best striker and those knocked out may never play for Japan.' },
  { slug: 'people-pleaser', code: '16PPSP', title: 'People Pleaser: Si Paling Gak Enakan', image: 'people-pleaser', theme: 'gnr', since: '19 November',
    host: 'LYTO Pictures', who: 'directed by Bobby Prasetyo, with Mawar de Jongh, Ardit Erwandha, Cut Mini and Surya Saputra', mins: '1 h 47 min', genre: 'Comedy, drama', classes: ['reguler'],
    blurb: 'Karina always puts others first, even her own dreams; when her chance finally comes, she has to choose between keeping everyone happy and saying no.' },
  { slug: 'laut-bercerita', code: '16LBEA', title: 'Laut Bercerita', image: 'laut-bercerita', theme: 'bocelli', since: '29 October',
    host: 'Pal 8 Pictures', who: 'directed by Yosep Anggi Noen, with Reza Rahadian, Yunita Siregar, Christine Hakim and Dian Sastrowardoyo; from the novel by Leila S. Chudori', mins: '2 h 15 min', genre: 'Drama', classes: ['reguler'],
    blurb: 'Yogyakarta, the late 1990s: Biru Laut joins the Winatra study group to fight for free speech, until one night he and his friends disappear and his family begins a long search.' },
  { slug: 'hamka-awal-mula', code: '16HAM3', title: 'Hamka: Awal Mula (Vol. 3)', image: 'hamka-awal-mula', theme: 'bocelli', since: '19 November',
    host: 'Falcon Pictures & Starvision', who: 'directed by Fajar Bustomi, with Vino G. Bastian, Laudya Cynthia Bella, Donny Damara and Reza Rahadian', mins: '1 h 56 min', genre: 'Drama, biography', classes: ['reguler'],
    blurb: 'The young Hamka in Maninjau, his clash with his father Haji Rasul, the journey to Mecca and his life with Siti Raham.' },
];
const FILMS = FILM_LIST.flatMap(f => f.classes.map((k, i) => {
  const c = CLASS[k];
  return {
    id: i ? `evt-${f.slug}-${k}` : `evt-${f.slug}`, option: c.option, venue: c.venue,
    title: f.title, subtitle: `Now showing · ${c.option}`,
    dateISO: '2026-11-21T00:00', time: 'TBA', until: '2026-11-28T23:59',
    doors: 'TBA', ends: '', age: '', type: 'cinema',
    host: f.host, hostNote: `Studio · ${f.who}`,
    blurb: `${f.blurb} ${f.genre}; ${f.mins}. In Indonesian cinemas since ${f.since} 2026.`,
    about: [c.words, `${c.option} at a Jakarta XXI on Saturday 21 November 2026: ${XXI_PRICE[k]} (Gandaria City).`, XXI_SALE, XXI_MAP],
    runs: [],
    branding: { wall: f.title.toUpperCase(), sub: c.option.toUpperCase(), band: [f.title.toUpperCase(), 'CINEMA XXI', c.option.toUpperCase(), 'NOW SHOWING'] },
    theme: f.theme, place: CINEMA_XXI,
    sale: { seller: 'xxi', tiket: false },
    official: { name: 'Cinema XXI', url: `https://m.21cineplex.com/id/movies/${f.code}` },
    photo: 'event-cinema-1', image: f.image,
  };
}));

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
// `tickets` is the promoter's own category list ({ name, price, note, sold }): the event page
// shows it as the tickets, while the 3D stand-in keeps its own generic blocks.
const SHOW = ({ id, image, theme, title, subtitle, dateISO, time = 'TBA', place, venue, type, host = 'TBA', hostNote = 'Promoter', from = null, range = '', prices = '', soldOutAll = false, blurb, extra = [], sale = {}, url = '', branding, standInNote = STANDIN, until, age = '', tickets }) => {
  const tks = tickets?.map(t => ({ ...t, id: `tk-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` }));
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
    ...(tks ? { tickets: tks } : {}),
    ...(soldOutAll || tks?.some(t => t.sold) ? { soldOut: [...(soldOutAll ? cats.map(c => c.id) : []), ...(tks || []).filter(t => t.sold || soldOutAll).map(t => t.id)] } : {}),
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
      'VVIP and VVIP Upgrade, the pen in front of the stage, sold out soon after sales opened in February. On 21 November 2026 tiket.com also had CAT 2 Center and CAT 3 Center sold out; Festival and the other blocks were still on sale.',
      'Festival is standing, round the VVIP pen and back past the sound desk. CAT 1 is the lower tier, CAT 2 the middle tier and CAT 3 the upper tier, numbered seats from Rp 1.06M to Rp 3.3M. The MCR boxes sit between CAT 2 and CAT 3 in the Center stand. The stands behind the stage are closed.',
      PRICES,
      MODEL,
    ],
    runs: [],
    branding: { wall: 'MY CHEMICAL ROMANCE', sub: 'LIVE IN JAKARTA 2026', band: ['MY CHEMICAL ROMANCE', 'LIVE IN JAKARTA', 'JAKARTA INTERNATIONAL STADIUM', '2026'] },
    theme: 'mcr',
    // Vocals, two guitars and bass, with keys and drums on tour.
    lineup: [{ role: 'vocals' }, { role: 'guitar' }, { role: 'guitar' }, { role: 'bass' }, { role: 'keys' }, { role: 'drums' }],
    soldOut: ['vvip', 'cat2c', 'cat3c'],
    place: JIS,
    sale: { opens: '2026-02-07T10:00', tiket: true },
    official: { name: 'tiket.com', url: 'https://www.tiket.com/en-id/to-do/my-chemical-romance-live-in-jakarta-2026' },
    photo: 'event-jis-mcr-1', image: 'mcr-jakarta',
  },
  // Days 1 and 2 sold out on tiket.com, as checked on 21 November 2026.
  BTS_DAY(1, '2026-12-26T00:00', { soldOut: ['vip', 'plat', 'cat1', 'cat2', 'cat3'] }),
  BTS_DAY(2, '2026-12-27T00:00', { soldOut: ['vip', 'plat', 'cat1', 'cat2', 'cat3'] }),
  BTS_DAY(3, '2026-12-29T00:00', { soldOut: ['vip', 'plat', 'cat1', 'cat2', 'cat3'] }),
  {
    id: 'evt-gnr-jakarta', venue: 'madya-end',
    title: "Guns N' Roses", subtitle: 'World Tour 2026',
    dateISO: '2026-11-21T17:00', time: '17:00', doors: '17:00', ends: '22:00', age: '',
    host: 'Rajawali Indonesia', hostNote: 'Promoter, with HKE · presented by bale by BTN',
    blurb: "Guns N' Roses bring their 2026 world tour to Stadion Madya at Gelora Bung Karno: an end stage in the south bend, three standing festival areas on the field and seats in both grandstands.",
    about: [
      'Festival A, B and C stand on the field, front to back. In both grandstands VIP is nearest the stage, then Tribune A, then Tribune B. General sale prices run from Rp 1.75M (Festival C) to Rp 7.5M (VIP).',
      'TipTip lists the show from 17:00 to 22:00 WIB and every category as sold out (21 November 2026). VIP, Tribune A and Tribune B are numbered seats; the seat number is emailed up to three days before the show. Up to eight tickets per transaction; children over 3 pay full price. Delay towers and the front-of-house desk may block part of the view from some spots.',
      `Prices as announced by the promoter, before the 10% tax and TipTip's fees. Sold on TipTip, not on tiket.com: TipTip has the live price and stock.`,
      MODEL,
    ],
    runs: [],
    branding: { wall: "GUNS N' ROSES", sub: 'WORLD TOUR 2026', band: ["GUNS N' ROSES", 'WORLD TOUR 2026', 'STADION MADYA GBK', 'JAKARTA'] },
    theme: 'gnr',
    // Vocals, two guitars, bass, two keyboards and drums.
    lineup: [{ role: 'vocals' }, { role: 'guitar' }, { role: 'guitar' }, { role: 'bass' }, { role: 'keys' }, { role: 'keys', female: true }, { role: 'drums' }],
    soldOut: ['vip', 'fesa', 'triba', 'fesb', 'tribb', 'fesc'],
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
      'The seats are in the two side stands, in three bands from the floor up: Cloud 9 nearest the floor, then Skyline, then Horizon. Seat and queue numbers come seven days before the show, up to four tickets per transaction. On 21 November 2026 Runway A, both Skyline blocks and both Horizon blocks were sold out.',
      'Prices as announced by the promoter, before the government tax and the ticketing fee. Sold on Loket.com, not on tiket.com: Loket.com has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'N.FLYING', sub: "LIVE '&CON5: INTO REM'", band: ['N.FLYING', 'INTO REM', 'BASKET HALL GBK', 'JAKARTA'] },
    theme: 'nflying',
    // The band: lead vocals and rhythm guitar, a second singer, guitar, bass and drums.
    lineup: [{ role: 'vocals-guitar' }, { role: 'vocals' }, { role: 'guitar' }, { role: 'bass' }, { role: 'drums' }],
    // Sold out on Loket.com on 21 November 2026.
    soldOut: ['runwaya', 'skylinea', 'skylineb', 'horizona', 'horizonb'],
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
      'The first night sold out in presale; the promoter released more seats on 13 November 2026, in limited numbers. On 21 November 2026 Loket.com listed only the Ultimate, Diamond and Gold VIP categories for this night, all sold out.',
      'On the floor: Ultimate VIP standing inside the X, Diamond VIP numbered chairs round it and Gold VIP chairs behind, by the sound desk. CAT 2 is the first tier, with CAT 1 A and B along its sides by the stage; CAT 3 the middle tier; CAT 4 the upper tier, with CAT 5 A and B along its sides by the stage. CAT 6 and CAT 7 are the restricted-view blocks beside the stage.',
      'Prices as announced by the promoter, before the 10% tax, the 6% platform fee and other fees. Seat numbers come closer to the show. Sold on Loket.com, not on tiket.com: Loket.com has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'BIGBANG', sub: 'WORLD TOUR XX : COSMOS', band: ['BIGBANG', 'XX : COSMOS', 'JAKARTA INTERNATIONAL STADIUM', 'JAKARTA'] },
    theme: 'bigbang',
    // Three singers, with dancers.
    lineup: [{ role: 'vocals' }, { role: 'vocals' }, { role: 'vocals' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }],
    // On 21 November 2026 Loket.com offered only the VIP categories for this night, all sold out.
    soldOut: ['uvip', 'dvip', 'gvip', 'cat1a', 'cat1b', 'cat2', 'cat3', 'cat4', 'cat5a', 'cat5b', 'cat6a', 'cat6b', 'cat7a', 'cat7b'],
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
      'The second night, added after the first sold out; more seats were released on 13 November 2026. On 21 November 2026 Gold VIP, CAT 1 B and CAT 2 to CAT 5 were still on sale; Ultimate VIP, Diamond VIP, CAT 1 A, CAT 6 and CAT 7 were sold out.',
      'On the floor: Ultimate VIP standing inside the X, Diamond VIP numbered chairs round it and Gold VIP chairs behind, by the sound desk. CAT 2 is the first tier, with CAT 1 A and B along its sides by the stage; CAT 3 the middle tier; CAT 4 the upper tier, with CAT 5 A and B along its sides by the stage. CAT 6 and CAT 7 are the restricted-view blocks beside the stage.',
      'Prices as announced by the promoter, before the 10% tax, the 6% platform fee and other fees. Seat numbers come closer to the show. Sold on Loket.com, not on tiket.com: Loket.com has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'BIGBANG', sub: 'WORLD TOUR XX : COSMOS', band: ['BIGBANG', 'XX : COSMOS', 'JAKARTA INTERNATIONAL STADIUM', 'JAKARTA'] },
    theme: 'bigbang',
    // Three singers, with dancers.
    lineup: [{ role: 'vocals' }, { role: 'vocals' }, { role: 'vocals' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }, { role: 'dancer' }],
    // Sold out on Loket.com on 21 November 2026.
    soldOut: ['uvip', 'dvip', 'cat1a', 'cat6a', 'cat6b', 'cat7a', 'cat7b'],
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
    // Sold out on Loket.com on 21 November 2026.
    soldOut: ['vipa', 'vipb', 'cat1', 'cat2a', 'cat2c', 'cat7a', 'cat7b'],
    place: JIS,
    sale: { opens: '2026-07-13T15:00', seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://enhypeninjakarta.com/' },
    photo: 'event-stadium-end-1', image: 'enhypen-bloodsaga',
  },
  {
    id: 'evt-nancy-ajram', venue: 'istora-nancy',
    title: 'Nancy Ajram', subtitle: 'Live in Jakarta',
    dateISO: '2027-01-30T15:00', time: 'TBA', doors: '15:00', ends: '22:00', age: '',
    host: 'TBA', hostNote: 'Promoter',
    blurb: 'Nancy Ajram returns to Istora Senayan after her first Jakarta show in 2025. Festival stands in front of the stage; VIP chairs on the floor behind the sound desk, Diamond facing the stage, Platinum and Gold along the sides.',
    about: [
      'Festival is standing from the stage back to the sound desk; VIP is numbered chairs on the floor behind it. Diamond is the stand facing the stage, Platinum the first tier and Gold the second tier along both sides.',
      'Prices as announced by the promoter, before the government tax, the platform fee and other fees. Sold on nancyajramjakarta.com and Traveloka, not on tiket.com. Traveloka lists the gates open at 15:00 and the event running to 22:00 WIB; on 21 November 2026 it offered VIP, Diamond, Festival and Platinum, Gold no longer.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'NANCY AJRAM', sub: 'LIVE IN JAKARTA', band: ['NANCY AJRAM', 'LIVE IN JAKARTA', 'ISTORA SENAYAN', 'JAKARTA'] },
    theme: 'nancy',
    // The singer and her band.
    lineup: [{ role: 'vocals', female: true }, { role: 'keys' }, { role: 'keys' }, { role: 'guitar' }, { role: 'bass' }, { role: 'drums' }],
    // Gold was no longer offered on Traveloka on 21 November 2026.
    soldOut: ['gold'],
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
      'Prices as announced by the promoter, before the 10% tax, the 6% platform fee and the convenience fee. tiket.com is the official ticketing partner (maroon5jakarta2027.com links to it); on 21 November 2026 its general sale page offered the Early Entry Package and Festival. Up to six tickets per account; no under-14s or anyone under 140 cm on the Festival floor, and no under-3s at all.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'MAROON 5', sub: 'ASIA 2027', band: ['MAROON 5', 'ASIA 2027', 'JAKARTA INTERNATIONAL STADIUM', 'JAKARTA'] },
    theme: 'maroon5',
    // Six-piece: lead vocals, two guitars, bass, keys, drums.
    lineup: [{ role: 'vocals' }, { role: 'guitar' }, { role: 'guitar' }, { role: 'bass' }, { role: 'keys' }, { role: 'drums' }],
    place: JIS,
    sale: { opens: '2026-08-29T10:00', tiket: true },
    official: { name: 'tiket.com', url: 'https://www.tiket.com/en-id/to-do/maroon5asia2027-generalonsale' },
    photo: 'event-stadium-end-1', image: 'maroon5-jakarta-live',
  },
  {
    id: 'evt-thescript-jakarta', venue: 'ina-script',
    title: 'The Script', subtitle: 'Man in the Arena Tour 2027',
    dateISO: '2027-04-03T19:15', time: '19:15', doors: 'TBA', ends: '22:00', age: '',
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
    // Sold out on TipTip on 21 November 2026.
    soldOut: ['festival', 'bronze', 'silver', 'gold'],
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
    // No longer offered on Loket.com on 21 November 2026.
    soldOut: ['cat4a', 'cat4b'],
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
      'Prices as announced by the promoter, before tax and the admin fee. Sold on Loket.com through simpleplanindonesia.com, not on tiket.com. The Jakarta show was sold out on 21 November 2026; the Surabaya show (28 Nov, Jatim Expo) is on the same site.',
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
    // Sold out: the promoter's site and Loket.com, 21 November 2026.
    soldOut: ['cat3', 'cat1', 'cat4a', 'cat4b', 'cat2'],
    place: TENNIS,
    sale: { opens: '2026-05-05T10:00', seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://simpleplanindonesia.com/' },
    photo: 'event-concert-1', image: 'simpleplan-jakarta',
  },
  {
    id: 'evt-boynextdoor-jakarta', venue: 'ice-boynextdoor',
    title: 'BOYNEXTDOOR', subtitle: "TOUR 'KNOCK ON Vol.2' in Jakarta",
    dateISO: '2026-12-05T19:00', time: '19:00', doors: 'TBA', ends: '', age: '',
    host: 'PK Entertainment', hostNote: 'Promoter, with HYBE',
    blurb: "BOYNEXTDOOR bring their first world tour, 'KNOCK ON Vol.2', to ICE BSD City Hall 5–6: a runway from the stage down the floor, standing pens either side of it, and numbered seats on a stand across the back.",
    about: [
      'From the promoter’s seat plan: ONEDOOR VIP A (left) and B (right) stand either side of the runway at the front, ORANGE A and B stand behind them up to the sound desk, PINK A and B stand in a strip along each side. CAT 1 and CAT 2 are numbered seats on the stand at the back, CAT 1 in front.',
      'Prices on the plan, before the 10% tax and tiket.com’s 6% fee: ONEDOOR VIP Rp 3,400,000, ORANGE Rp 2,750,000, PINK Rp 1,850,000, CAT 1 Rp 2,750,000, CAT 2 Rp 2,350,000 (on tiket.com, with tax and fee: Rp 3,944,000, Rp 3,190,000, Rp 2,146,000, Rp 3,190,000 and Rp 2,726,000). ORANGE A and PINK A were sold out on 20 November 2026.',
      'Sold only on tiket.com, up to six tickets per transaction. Queue numbers for the standing pens and seat numbers come closer to the day; no under-12s in the standing pens.',
      PRICES,
      MODEL,
    ],
    runs: [],
    branding: { wall: 'BOYNEXTDOOR', sub: "KNOCK ON VOL.2", band: ['BOYNEXTDOOR', 'KNOCK ON VOL.2', 'ICE BSD CITY', 'JAKARTA'] },
    theme: 'enhypen',
    soldOut: ['orangea', 'pinka'],
    place: ICE_BSD,
    sale: { seller: 'tiket', tiket: true },
    official: { name: 'tiket.com', url: 'https://www.tiket.com/en-id/to-do/boynextdoor-tour-knock-on-vol2' },
    photo: 'event-concert-1', image: 'boynextdoor-jakarta',
  },
  {
    id: 'evt-jkt48-15th', venue: 'unesa-jkt48',
    title: 'JKT48', subtitle: 'AYO SENYUMLAH · 15th Anniversary Concert',
    dateISO: '2026-12-19T18:30', time: '18:30', doors: 'TBA', ends: '20:30', age: '',
    host: 'JKT48', hostNote: 'Organiser',
    blurb: 'JKT48 mark fifteen years, and their 28th single “Ayo Senyumlah”, with an anniversary concert at Graha UNESA in Surabaya: a main stage, a runway to an island stage on the floor, and a numbered seat in every category.',
    about: [
      'From JKT48’s seat plan: CAT 1 on the floor beside the main stage, CAT 2 along both sides of the runway, CAT 3 round the island stage and CAT 5 round CAT 3; in the stands CAT 4 on both sides near the stage, CAT 6 round the back and CAT 7 above it. Every category is a numbered seat; numbers show on the e-voucher at the latest six days before the show.',
      'General sale on Loket.com: CAT 3 Rp 1,200,000, CAT 4 Rp 1,000,000, CAT 5 Rp 750,000, CAT 6 Rp 550,000, CAT 7 Rp 450,000; CAT 1 (Rp 3,500,000) and CAT 2 (Rp 2,200,000) went in the members’ presale. Before the 10% tax, 5% service fee and platform fee. On 21 November 2026 only CAT 4 was still available.',
      'Up to four tickets per transaction. The organiser asks wheelchair users to pick a floor category, not the stands.',
      'Prices as announced by the organiser. Sold on Loket.com, not on tiket.com: Loket.com has the live price and stock.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'JKT48', sub: 'AYO SENYUMLAH', band: ['JKT48', 'AYO SENYUMLAH', '15TH ANNIVERSARY', 'GRAHA UNESA'] },
    theme: 'maroon5',
    soldOut: ['cat1', 'cat2', 'cat3', 'cat5', 'cat6', 'cat7'],
    place: GRAHA_UNESA,
    sale: { opens: '2026-11-16T12:00', seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://www.loket.com/event/jkt48-ayosenyumlah-concert' },
    photo: 'event-concert-1', image: 'jkt48-15th',
  },
  {
    id: 'evt-westlife-jakarta', venue: 'gbk-westlife',
    title: 'Westlife', subtitle: '25: The Anniversary World Tour',
    dateISO: '2027-01-23T00:00', time: 'TBA', doors: 'TBA', ends: '', age: '',
    host: 'Sound Rhythm', hostNote: 'Promoter, with Folago Pro',
    blurb: 'Westlife mark 25 years at Gelora Bung Karno Main Stadium. Every category is a numbered seat, and all of them are sold out.',
    about: [
      'From the promoter’s layout: VIP in the middle of the field in front of the stage, CAT 1 A (left) and B (right) either side of it, CAT 2 A and B behind them either side of the sound desk, with a delay tower in each. In the lower tier CAT 3 A and B face the stage and CAT 4 A and B run along the sides; in the upper tier CAT 5 A and B face the stage and CAT 6 A and B the sides. The stand straight opposite the stage is restricted view.',
      'VIP Package Rp 2,750,000, CAT 1 Rp 2,500,000, CAT 2 Rp 2,250,000, CAT 3 Rp 1,850,000, CAT 4 Rp 1,450,000, CAT 5 Rp 1,250,000, CAT 6 Rp 850,000, before tax and the platform fee. Every category was sold out on 21 November 2026.',
      'Up to six tickets per transaction in one category, one transaction per email, ID and phone number; tickets are in the buyer’s name. Seat numbers come closer to the day.',
      'Prices as announced by the promoter. Sold on Loket.com (westlifestadiumshowjkt.com), not on tiket.com.',
      MODEL,
    ],
    runs: [],
    branding: { wall: 'WESTLIFE', sub: '25 · THE ANNIVERSARY WORLD TOUR', band: ['WESTLIFE', '25 YEARS OF HITS', 'GELORA BUNG KARNO', 'JAKARTA'] },
    theme: 'westlife',
    soldOut: ['vip', 'cat1a', 'cat1b', 'cat2a', 'cat2b', 'cat3a', 'cat3b', 'cat4a', 'cat4b', 'cat5a', 'cat5b', 'cat6a', 'cat6b'],
    place: GBK,
    sale: { opens: '2026-05-23T10:00', seller: 'loket', tiket: false },
    official: { name: 'Loket.com', url: 'https://westlifestadiumshowjkt.com/' },
    photo: 'event-stadium-end-1', image: 'westlife-25',
  },
  ...FILMS,
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
// Ticket classes of one showing (a film's Reguler, IMAX and Premiere studios):
// events sharing a `group` list as one card; the page offers each `option` with its own 3D
// studio. The first in EVENTS is the card.
// Every film is one card, whatever the cinema or class: its group is its title.
const groupOf = e => e?.group || (e?.type === 'cinema' ? `film:${e.title}` : null);
export const optionsOf = e => (groupOf(e) ? EVENTS.filter(x => groupOf(x) === groupOf(e)) : [e]);
export const isCard = e => !groupOf(e) || optionsOf(e)[0] === e;
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
