// Cover images. An event with its own artwork (`image` in events.js: the promoter's
// poster or the seller's photo) shows it; everything else shows a render of its venue's
// 3D model, picked by the `photo` field, so a card never shows a picture of another place.
//
// The posters are the promoters' own, from the event listings on indonesia.travel and
// tiket.com. They belong to the promoters: before launch, use the files from their media
// kits, with permission.
// To add one: put a 3:2 file in assets/events/ (1200 px wide, with a -640 copy, or one 480 px
// file marked `w: 480`), a 5:7 one in assets/events/card/ (800 px wide, with a -480 copy, named
// after the key), add a line here, then `image: '<key>'` on the event. A poster of another
// shape goes whole into both, over a blurred copy of itself. `pos` is the part to keep when a
// square thumbnail crops it; `screen` the part to keep on the home hero's wide stage screens,
// when the middle would lose the title. A file that replaces another takes a new name, so a
// browser that has the old one cached fetches it.
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
  'thescript-arena': { src: 'assets/events/thescript-arena-official.webp', alt: 'The Script on stage', credit: 'Photo · via indonesia.travel', pos: '55% 50%' },

  // Stand-in artwork made by Atvents until the promoter's poster is out. Swap in the official
  // files under new names and change the credit.
  'boyz2men-dewa19': { src: 'assets/events/boyz2men-dewa19.webp', alt: 'Boyz II Men with Dewa 19' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'nflying-jakarta': { src: 'assets/events/nflying-jakarta.webp', alt: "N.Flying LIVE '&CON5: into REM'" + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'maroon5-asia': { src: 'assets/events/maroon5-asia.webp', alt: 'Maroon 5 Asia 2027' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'm2m-two': { src: 'assets/events/m2m-two.webp', alt: 'M2M Two Tour' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
};

const RENDERS = {
  concert: ['assets/covers/concert-1.webp', 'assets/covers/concert-2.webp'],
  cinema: ['assets/covers/cinema-1.webp', 'assets/covers/cinema-2.webp'],
  combat: ['assets/covers/combat-1.webp', 'assets/covers/combat-2.webp'],
  stadium: ['assets/covers/stadium-1.webp', 'assets/covers/stadium-2.webp'],
  'stadium-end': ['assets/covers/stadium-end-1.webp', 'assets/covers/stadium-end-2.webp'],
  'stadium-round': ['assets/covers/stadium-round-1.webp', 'assets/covers/stadium-round-2.webp'],
  'combat-studio': ['assets/covers/combat-studio-1.webp', 'assets/covers/combat-studio-2.webp'],
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

// An event's cover: its own artwork when it has some, else the render of its venue.
export const eventImg = (e, alt, opts) => coverImg(e.image || e.photo, e.venue, alt, opts);

// A ticket card's cover: the event's artwork drawn to the card's 5:7, so nothing is cropped
// away. An event without artwork shows its venue's render, which the card crops.
export function cardImg(e, alt) {
  if (!e.image || !Object.hasOwn(IMAGES, e.image)) return eventImg(e, alt);
  const src = `assets/events/card/${e.image}`;
  return `<img class="cover-img cover-image" src="${src}-480.webp" srcset="${src}-480.webp 480w, ${src}.webp 800w" sizes="(max-width: 640px) 92vw, 360px" alt="${IMAGES[e.image].alt.replace(/"/g, '&quot;')}" loading="lazy" decoding="async">`;
}

// The artwork itself, sharp and uncropped, with its credit: on the event page.
export function posterFig(e) {
  if (!e.image || !Object.hasOwn(IMAGES, e.image)) return '';
  const c = IMAGES[e.image];
  return `<figure class="ev-poster"><img src="${c.src}" alt="${c.alt.replace(/"/g, '&quot;')}" decoding="async"><figcaption>${c.credit}</figcaption></figure>`;
}
