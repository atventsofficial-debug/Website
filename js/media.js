// Cover images. An event with its own artwork (`image` in events.js: the promoter's
// poster or the seller's photo) shows it; everything else shows a render of its venue's
// 3D model, picked by the `photo` field, so a card never shows a picture of another place.
//
// The posters are the promoters' own, from the event listings on indonesia.travel and
// tiket.com. They belong to the promoters: before launch, use the files from their media
// kits, with permission.
// To add one: put a 3:2 file in assets/events/ (1200 px wide, with a -640 copy, or one 480 px
// file marked `w: 480`), a 5:7 one in assets/events/card/ (800 px wide, with a -480 copy, named
// after the key), add a line here, then `image: '<key>'` on the event, and run
// scripts/mail-art.py for the pass email's JPEG copy. A poster of another shape goes whole
// into both, over a blurred copy of itself. `pos` is the part to keep when a square thumbnail
// crops it; `screen` the part to keep on the home hero's wide stage screens, when the middle
// would lose the title. A file that replaces another takes a new name, so a browser that has
// the old one cached fetches it.
export const IMAGES = {
  'bts-arirang': { src: 'assets/events/bts-arirang-official.webp', alt: 'BTS World Tour ARIRANG poster', credit: 'Poster · BIGHIT MUSIC, via indonesia.travel', pos: '42% 40%', screen: '50% 75%' },
  'bocelli-romanza': { w: 480, src: 'assets/events/bocelli-romanza.webp', alt: 'Andrea Bocelli Romanza 30th anniversary poster', credit: 'Poster · Shoemaker Live, via tiket.com', pos: '30% 50%', screen: '50% 55%' },
  'mcr-jakarta': { w: 480, src: 'assets/events/mcr-jakarta.webp', alt: 'My Chemical Romance Live in Jakarta poster', credit: 'Poster · Ravel Entertainment, via tiket.com', pos: '50% 30%', screen: '50% 0%' },
  'gnr-jakarta': { src: 'assets/events/gnr-jakarta-official.webp', alt: "Guns N' Roses Jakarta 2026 poster", credit: 'Poster · via indonesia.travel', pos: '30% 50%' },
  '5sos-jakarta': { src: 'assets/events/5sos-jakarta-official.webp', alt: '5 Seconds of Summer, the band', credit: 'Photo · via indonesia.travel', pos: '50% 50%' },
  'bigbang-cosmos': { src: 'assets/events/bigbang-cosmos-official.webp', alt: 'BIGBANG 2026 world tour poster', credit: 'Poster · YG Entertainment, via indonesia.travel', pos: '50% 50%' },
  'enhypen-bloodsaga': { src: 'assets/events/enhypen-bloodsaga-official.webp', alt: "ENHYPEN World Tour 'Blood Saga' poster", credit: 'Poster · BELIFT LAB, via indonesia.travel', pos: '50% 40%' },
  'westlife-25': { src: 'assets/events/westlife-25-official.webp', alt: 'Westlife 25 anniversary tour poster', credit: 'Poster · via indonesia.travel', pos: '50% 50%' },
  'nancy-ajram': { src: 'assets/events/nancy-ajram-official.webp', alt: 'Nancy Ajram Live in Jakarta poster', credit: 'Poster · via indonesia.travel', pos: '25% 50%' },
  'boynextdoor-jakarta': { src: 'assets/events/boynextdoor-jakarta.webp', alt: "BOYNEXTDOOR TOUR 'KNOCK ON Vol.2' in Jakarta poster", credit: 'Poster · PK Entertainment, via tiket.com', pos: '50% 50%' },
  'simpleplan-jakarta': { src: 'assets/events/simpleplan-jakarta.webp', alt: 'Simple Plan The Bigger Than You Think! Tour Jakarta poster', credit: 'Poster · Akselerasi Entertainment, via simpleplanindonesia.com', pos: '50% 50%' },
  'janice-tjen-live': { w: 480, src: 'assets/events/janice-tjen-live.webp', alt: 'Janice Tjen Live: Game. Set. Celebrate. poster', credit: 'Poster · Tatler Indonesia, via Loket.com', pos: '50% 30%' },
  'jkt48-15th': { src: 'assets/events/jkt48-15th.webp', alt: 'JKT48 AYO SENYUMLAH 15th Anniversary Concert poster with the seating plan', credit: 'Poster · JKT48, via Loket.com', pos: '35% 50%' },
  'dwp-2026': { w: 480, src: 'assets/events/dwp-2026.webp', alt: 'DWP 2026 Jakarta key visual', credit: 'Key visual · Ismaya Live, via Loket.com', pos: '50% 45%' },
  'hunger-games-sunrise': { w: 480, src: 'assets/events/hunger-games-sunrise.webp', alt: 'The Hunger Games: Sunrise on the Reaping Indonesian poster', credit: 'Poster · Lionsgate, via Cinema XXI', pos: '50% 35%' },
  'godzilla-minus-zero': { w: 480, src: 'assets/events/godzilla-minus-zero.webp', alt: 'Godzilla Minus Zero Indonesian poster', credit: 'Poster · Toho, via Cinema XXI', pos: '50% 35%' },
  'thescript-arena': { src: 'assets/events/thescript-arena-official.webp', alt: 'The Script on stage', credit: 'Photo · via indonesia.travel', pos: '55% 50%' },

  // Until a promoter publishes a poster, the event shows a free-licensed photo of the act (or
  // the club) from Wikimedia Commons, credited as its licence asks. Sources:
  // commons.wikimedia.org/wiki/File:2022_Gershwin_Prize_for_Popular_Song_(51930552139).jpg
  // commons.wikimedia.org/wiki/File:180112_엔플라잉.jpg
  // commons.wikimedia.org/wiki/File:Maroon_5_live_in_Jakarta.jpg
  // commons.wikimedia.org/wiki/File:Marit_Larsen_and_Marion_Raven.jpg
  // Swap in the official poster under a new name when it is out.
  'boyz2men-live': { src: 'assets/events/boyz2men-live.webp', alt: 'Boyz II Men performing on stage', credit: 'Photo · Library of Congress Life, CC0, via Wikimedia Commons', pos: '50% 50%' },
  'nflying-band': { src: 'assets/events/nflying-band.webp', alt: 'The members of N.Flying', credit: 'Photo · 뉴스인스타 (NewsInStar), CC BY 3.0, via Wikimedia Commons', pos: '50% 40%' },
  'maroon5-jakarta-live': { src: 'assets/events/maroon5-jakarta-live.webp', alt: 'Maroon 5 live at Jakarta International Stadium', credit: 'Photo · Netaholic13, CC BY-SA 4.0, via Wikimedia Commons', pos: '45% 40%' },
  'm2m-live': { src: 'assets/events/m2m-live.webp', alt: 'Marit Larsen and Marion Raven of M2M performing', credit: 'Photo · Martijn van de Streek and Maxker89, CC BY-SA 2.0, via Wikimedia Commons', pos: '50% 45%' },
};

const RENDERS = {
  concert: ['assets/covers/concert-1.webp', 'assets/covers/concert-2.webp'],
  cinema: ['assets/covers/cinema-1.webp', 'assets/covers/cinema-2.webp'],
  combat: ['assets/covers/combat-1.webp', 'assets/covers/combat-2.webp'],
  stadium: ['assets/covers/stadium-1.webp', 'assets/covers/stadium-2.webp'],
  'stadium-end': ['assets/covers/stadium-end-1.webp', 'assets/covers/stadium-end-2.webp'],
  'stadium-round': ['assets/covers/stadium-round-1.webp', 'assets/covers/stadium-round-2.webp'],
  'combat-studio': ['assets/covers/combat-studio-1.webp', 'assets/covers/combat-studio-2.webp'],
  tennis: ['assets/covers/tennis-1.webp', 'assets/covers/tennis-2.webp'],
  // Venues drawn from the promoter's plan (realvenues.js), in their categories' colours.
  'madya-end': ['assets/covers/madya-end-1.webp', 'assets/covers/madya-end-2.webp'],
  'jis-mcr': ['assets/covers/jis-mcr-1.webp', 'assets/covers/jis-mcr-2.webp'],
};

// key: an IMAGES key, or a render: 'venue-<layout>' or 'event-<set>-<n>'. An event render
// picks a set of its own when there is one (say, a branded stage), else the venue's.
export function cover(key, venueKey) {
  if (Object.hasOwn(IMAGES, key)) return { ...IMAGES[key], kind: 'image' };
  const [, set, n = 1] = key.match(/^event-(.+)-(\d)$/) || [];
  return { src: (RENDERS[set] || RENDERS[venueKey] || RENDERS.concert)[(n - 1) % 2], credit: '3D render', kind: 'render' };
}

// Renders and 1200 px artwork also come 640 px wide for cards; the full file is for the event
// page. `sizes` under-states the phone width on purpose, so 3x phones take the 640 px file
// too: about 1.8 pixels per point on a card is sharp enough and far lighter. Artwork marked
// `w: 480` is one small file.
const smallOf = c => (c.w ? '' : c.src.replace(/\.webp$/, '-640.webp'));
// A cover's two files as a srcset; '' for artwork that is one file.
export const srcsetOf = c => (c.w ? '' : `${smallOf(c)} 640w, ${c.src} ${c.kind === 'render' ? 1280 : 1200}w`);
export function coverImg(key, venueKey, alt, { eager = false } = {}) {
  const c = cover(key, venueKey);
  const small = eager ? '' : smallOf(c);
  const srcset = small ? ` srcset="${srcsetOf(c)}" sizes="(max-width: 640px) 50vw, 320px"` : '';
  const pos = c.pos ? ` style="--pos:${c.pos}"` : '';
  return `<img class="cover-img cover-${c.kind}" src="${small || c.src}"${srcset}${pos} alt="${(c.alt || alt).replace(/"/g, '&quot;')}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">${c.kind === 'render' ? `<span class="cover-credit">${c.credit}</span>` : ''}`;
}

// A venue's card on the home page: its picture (`art` on the place in events.js), an
// illustration of the venue at a concert made for Atvents, with the venue's 3D map inset in
// the corner, since the picture shows the mood and the map what a pass opens. A venue
// without a picture shows the map alone.
const PLACE_ART = 'assets/covers/place';
export function placeCover(place, e, alt) {
  if (!place.art) return coverImg(e.photo, e.venue, alt);
  const map = cover(e.photo, e.venue), q = s => String(s).replace(/"/g, '&quot;');
  const art = `${PLACE_ART}/${q(place.art)}`;
  return `<img class="cover-img" src="${art}-640.webp" srcset="${art}-640.webp 640w, ${art}.webp 1020w" sizes="(max-width: 640px) 100vw, 400px" alt="${q(alt)}, at a concert (illustration)" loading="lazy" decoding="async">
    <span class="venue-3d"><img src="${smallOf(map)}" alt="" loading="lazy" decoding="async"><b>3D view</b></span>`;
}

// A kind of event on the home page (pages.js KINDS): a picture from a seat at that kind of
// venue, one for each kind, in assets/covers/kind/ (with a 640 px copy).
export function kindCover(key, alt) {
  const art = `assets/covers/kind/${key}`;
  return `<img class="cover-img" src="${art}-640.webp" srcset="${art}-640.webp 640w, ${art}.webp 1024w" sizes="(max-width: 640px) 50vw, 320px" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy" decoding="async">`;
}

// An event's cover: its own artwork when it has some, else the render of its venue.
export const eventImg = (e, alt, opts) => coverImg(e.image || e.photo, e.venue, alt, opts);

// The card art is redrawn under the same names, and browsers keep pictures for a while
// (scripts/build-site.mjs, /assets/*): bump this when the cards change, so every visitor
// gets the new ones at once instead of the copy they already have.
const CARD_V = '?v=20261119';

// A ticket card's cover: the event's artwork drawn to the card's 5:7, so nothing is cropped
// away. An event without artwork shows its venue's render, which the card crops.
export function cardImg(e, alt) {
  if (!e.image || !Object.hasOwn(IMAGES, e.image)) return eventImg(e, alt);
  const src = `assets/events/card/${e.image}`, c = IMAGES[e.image], v = CARD_V;
  // A phone shows the poster itself, 3:2 and whole, across the card; the tall card art is for
  // bigger screens. Its `sizes` under-states the card's width like the covers' (smallOf above),
  // so phones take the 640 px file: with 100vw every phone took the 1200 px one, about 1.4 MB
  // for the home page's list.
  const full = c.src.replace(/\.webp$/, '');
  const phone = c.w ? `${c.src} ${c.w}w` : `${full}-640.webp 640w, ${c.src} 1200w`;
  return `<picture><source media="(max-width: 760px)" srcset="${phone}" sizes="50vw"><img class="cover-img cover-image" src="${src}-480.webp${v}" srcset="${src}-480.webp${v} 480w, ${src}.webp${v} 800w" sizes="(max-width: 640px) 92vw, 360px" alt="${c.alt.replace(/"/g, '&quot;')}" loading="lazy" decoding="async"></picture>`;
}

// The poster, small, beside the order in the checkout. Empty for a concert without one.
export function thumbImg(e) {
  if (!e?.image || !Object.hasOwn(IMAGES, e.image)) return '';
  return `<img class="co-poster" src="assets/events/card/${e.image}-480.webp${CARD_V}" alt="" decoding="async">`;
}

// The poster at its own 3:2, for the event picker: whole, never cut, the same size for every event.
export function posterImg(e) {
  if (!e?.image || !Object.hasOwn(IMAGES, e.image)) return '';
  const c = IMAGES[e.image], full = c.src.replace(/\.webp$/, '');
  const set = c.w ? `${c.src} ${c.w}w` : `${full}-640.webp 640w, ${c.src} 1200w`;
  return `<img class="uf-poster" src="${c.w ? c.src : `${full}-640.webp`}" srcset="${set}" sizes="(max-width: 760px) 100vw, 160px" alt="" loading="lazy" decoding="async">`;
}

// The artwork itself, sharp and uncropped, with its credit: on the event page.
export function posterFig(e) {
  if (!e.image || !Object.hasOwn(IMAGES, e.image)) return '';
  const c = IMAGES[e.image];
  return `<figure class="ev-poster"><img src="${c.src}" alt="${c.alt.replace(/"/g, '&quot;')}" decoding="async"><figcaption>${c.credit}</figcaption></figure>`;
}
