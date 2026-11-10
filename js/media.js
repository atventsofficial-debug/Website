// Cover images. An event with its own artwork (`image` in events.js: the promoter's
// poster or the seller's photo) shows it; everything else shows a render of its venue's
// 3D model, picked by the `photo` field, so a card never shows a picture of another place.
//
// The artwork was cropped from the listings on tiket.com. It belongs to the promoters:
// before launch, use the files from their media kits, with permission.
// To add one: put a 3:2 file in assets/events/ and add a line here, then `image: '<key>'`
// on the event. `pos` is the part to keep when a square thumbnail crops it.
export const IMAGES = {
  'bts-arirang': { src: 'assets/events/bts-arirang.jpg', alt: 'BTS World Tour ARIRANG poster', credit: 'Poster · BIGHIT MUSIC, via tiket.com', pos: '42% 40%' },
  'bocelli-romanza': { src: 'assets/events/bocelli-romanza.jpg', alt: 'Andrea Bocelli Romanza 30th anniversary poster', credit: 'Poster · Shoemaker Live, via tiket.com', pos: '30% 50%' },
  'mcr-jakarta': { src: 'assets/events/mcr-jakarta.jpg', alt: 'My Chemical Romance Live in Jakarta poster', credit: 'Poster · Ravel Entertainment, via tiket.com', pos: '50% 30%' },

  // Stand-in artwork made by Atvents until the promoter's poster is out. Swap in the official
  // file with the same name and change the credit.
  'gnr-jakarta': { src: 'assets/events/gnr-jakarta.jpg', alt: "Guns N' Roses World Tour 2026" + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  '5sos-jakarta': { src: 'assets/events/5sos-jakarta.jpg', alt: '5 Seconds of Summer Live in Jakarta' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'boyz2men-dewa19': { src: 'assets/events/boyz2men-dewa19.jpg', alt: 'Boyz II Men with Dewa 19' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'nflying-jakarta': { src: 'assets/events/nflying-jakarta.jpg', alt: "N.Flying LIVE '&CON5: into REM'" + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'bigbang-cosmos': { src: 'assets/events/bigbang-cosmos.jpg', alt: 'BIGBANG World Tour XX: COSMOS' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'enhypen-bloodsaga': { src: 'assets/events/enhypen-bloodsaga.jpg', alt: "ENHYPEN World Tour 'Blood Saga'" + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'westlife-25': { src: 'assets/events/westlife-25.jpg', alt: 'Westlife 25: The Anniversary World Tour' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'nancy-ajram': { src: 'assets/events/nancy-ajram.jpg', alt: 'Nancy Ajram Live in Jakarta' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'maroon5-asia': { src: 'assets/events/maroon5-asia.jpg', alt: 'Maroon 5 Asia 2027' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'thescript-arena': { src: 'assets/events/thescript-arena.jpg', alt: 'The Script Man in the Arena Tour' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
  'm2m-two': { src: 'assets/events/m2m-two.jpg', alt: 'M2M Two Tour' + ' artwork', credit: 'Artwork · Atvents, until the official poster', pos: '50% 50%' },
};

const RENDERS = {
  concert: ['assets/covers/concert-1.jpg', 'assets/covers/concert-2.jpg'],
  cinema: ['assets/covers/cinema-1.jpg', 'assets/covers/cinema-2.jpg'],
  combat: ['assets/covers/combat-1.jpg', 'assets/covers/combat-2.jpg'],
  stadium: ['assets/covers/stadium-1.jpg', 'assets/covers/stadium-2.jpg'],
  'stadium-end': ['assets/covers/stadium-end-1.jpg', 'assets/covers/stadium-end-2.jpg'],
  'stadium-round': ['assets/covers/stadium-round-1.jpg', 'assets/covers/stadium-round-2.jpg'],
  'combat-studio': ['assets/covers/combat-studio-1.jpg', 'assets/covers/combat-studio-2.jpg'],
};

// key: an IMAGES key, or a render: 'venue-<layout>' or 'event-<set>-<n>'. An event render
// picks a set of its own when there is one (say, a branded stage), else the venue's.
export function cover(key, venueKey) {
  if (Object.hasOwn(IMAGES, key)) return { ...IMAGES[key], kind: 'image' };
  const [, set, n = 1] = key.match(/^event-(.+)-(\d)$/) || [];
  return { src: (RENDERS[set] || RENDERS[venueKey] || RENDERS.concert)[(n - 1) % 2], credit: '3D render', kind: 'render' };
}

// Renders also come 640 px wide for cards; the full 1280 px file is for the event page's
// backdrop. `sizes` under-states the phone width on purpose, so 3x phones take the 640 px
// file too: about 1.8 pixels per point on a card is sharp enough and far lighter.
// Artwork is one file of about 500 to 800 px, and carries no label on a card.
export function coverImg(key, venueKey, alt, { eager = false } = {}) {
  const c = cover(key, venueKey);
  const small = c.kind === 'render' && !eager ? c.src.replace(/\.jpg$/, '-640.jpg') : '';
  const srcset = small ? ` srcset="${small} 640w, ${c.src} 1280w" sizes="(max-width: 640px) 50vw, 320px"` : '';
  const pos = c.pos ? ` style="--pos:${c.pos}"` : '';
  return `<img class="cover-img cover-${c.kind}" src="${small || c.src}"${srcset}${pos} alt="${(c.alt || alt).replace(/"/g, '&quot;')}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">${c.kind === 'render' ? `<span class="cover-credit">${c.credit}</span>` : ''}`;
}

// An event's cover: its own artwork when it has some, else the render of its venue.
export const eventImg = (e, alt, opts) => coverImg(e.image || e.photo, e.venue, alt, opts);

// The artwork itself, sharp and uncropped, with its credit: on the event page.
export function posterFig(e) {
  if (!e.image || !Object.hasOwn(IMAGES, e.image)) return '';
  const c = IMAGES[e.image];
  return `<figure class="ev-poster"><img src="${c.src}" alt="${c.alt.replace(/"/g, '&quot;')}" decoding="async"><figcaption>${c.credit}</figcaption></figure>`;
}
