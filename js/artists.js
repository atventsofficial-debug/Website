// Who is playing, for the story trailer (trailer.js): what the act is and where from, in two
// short lines, and a photo of them where Atvents has one from the promoter's own material.
// Keyed by the show's theme (themes.js), which is one per act.
//
// photo.src is the picture; photo.box the part of it with the act in it, as shares of its
// width and height [left, top, right, bottom], kept clear of any type on it; photo.credit the
// line its licence asks for (a Creative Commons photo: 'Name / CC BY 4.0'), shown on it. Without a photo,
// the trailer's first two scenes are set in type on the show's colours.
export const ARTISTS = {
  mcr: { about: ['Rock band from New Jersey, USA', 'Since 2001'] },
  gnr: { about: ['Hard rock band from Los Angeles, USA', 'Since 1985'] },
  '5sos': {
    about: ['Pop rock band from Sydney, Australia', 'Since 2011'],
    photo: { src: 'assets/events/5sos-jakarta-official.webp', box: [0.05, 0.1, 0.92, 0.8] },
  },
  b2m: { about: ['Boyz II Men: R&B group from Philadelphia, USA', 'Dewa 19: rock band from Surabaya, Indonesia'] },
  nflying: { about: ['Rock band from Seoul, South Korea', 'Debut 2015'] },
  bigbang: { about: ['K-pop group from Seoul, South Korea', 'Debut 2006'] },
  enhypen: {
    about: ['K-pop group from Seoul, South Korea', 'Debut 2020'],
    photo: { src: 'assets/events/enhypen-bloodsaga-official.webp', box: [0.22, 0.02, 0.9, 0.46] },
  },
  bts: {
    about: ['K-pop group from Seoul, South Korea', 'Debut 2013'],
    photo: { src: 'assets/events/bts-arirang-official.webp', box: [0.0, 0.06, 1.0, 0.62] },
  },
  westlife: { about: ['Pop vocal group from Ireland', 'Since 1998'] },
  nancy: {
    about: ['Pop singer from Lebanon', ''],
    photo: { src: 'assets/events/nancy-ajram-official.webp', box: [0.0, 0.0, 0.4, 1.0] },
  },
  maroon5: { about: ['Pop rock band from Los Angeles, USA', 'Since 1994'] },
  script: {
    about: ['Rock band from Dublin, Ireland', 'Since 2001'],
    photo: { src: 'assets/events/thescript-arena-official.webp', box: [0.22, 0.2, 0.78, 1.0] },
  },
  m2m: { about: ['Pop duo from Norway', ''] },
  bocelli: { about: ['Tenor from Tuscany, Italy', ''] },
};
