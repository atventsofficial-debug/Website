// Who is playing, for the story trailer (trailer.js): what the act is and where from, in two
// short lines, and where their official poster shows their faces, which part of it does.
// Keyed by the show's theme (themes.js), which is one per act.
//
// photo.src is the picture; photo.box the part of it with the act in it, as shares of its
// width and height [left, top, right, bottom], kept clear of any type on it; photo.credit the
// line its licence asks for, if it is not the promoter's own (a Creative Commons photo:
// 'Name / CC BY 4.0'), shown on it. Without a photo, the second scene is set in type.
//
// shots: photos of the act on stage at earlier shows, cut together on the beat in the second
// scene in place of photo; each { src, box, credit } as photo's. Only photos whose licence
// lets them be changed and used to promote the show (CC BY or CC0, never NC, ND or SA), each
// credited as its licence asks.
export const ARTISTS = {
  mcr: {
    about: ['Rock band from New Jersey, USA', 'Since 2001'],
    shots: [
      // commons.wikimedia.org/wiki/File:My_Chemical_Romance_rain.jpg (Memphis, 2008)
      { src: 'assets/artists/mcr-1-live.webp', box: [0.38, 0.32, 1.0, 1.0], credit: 'NBStwo / CC BY 2.0 / Wikimedia Commons' },
      // commons.wikimedia.org/wiki/File:My_Chemical_Romance_lights.jpg (Newcastle, 2007)
      { src: 'assets/artists/mcr-2-live.webp', box: [0.08, 0.42, 0.92, 1.0], credit: 'mojo-jo-jo / CC BY 2.0 / Wikimedia Commons' },
      // commons.wikimedia.org/wiki/File:Wikimcrnotts.jpg (Nottingham, 2011)
      { src: 'assets/artists/mcr-3-live.webp', box: [0.16, 0.0, 0.7, 1.0], credit: 'Jimack32 / CC BY 3.0 / Wikimedia Commons' },
    ],
  },
  gnr: { about: ['Hard rock band from Los Angeles, USA', 'Since 1985'] },
  '5sos': {
    about: ['Pop rock band from Sydney, Australia', 'Since 2011'],
    photo: { src: 'assets/events/5sos-jakarta-official.webp', box: [0.05, 0.1, 0.92, 0.8] },
    shots: [
      // commons.wikimedia.org/wiki/File:5sosWWAT.jpg (2014)
      { src: 'assets/artists/5sos-1-live.webp', box: [0.06, 0.42, 0.98, 1.0], credit: 'Ianthebush / CC BY 2.0 / Wikimedia Commons' },
      // commons.wikimedia.org/wiki/File:5_Seconds_Of_Summer,_Hammersmith_Apollo,_London_(47449942151).jpg (London, 2018)
      { src: 'assets/artists/5sos-2-live.webp', box: [0.18, 0.12, 0.85, 1.0], credit: 'Drew de F Fawkes / CC BY 2.0 / Wikimedia Commons' },
      // commons.wikimedia.org/wiki/File:5_Seconds_Of_Summer,_Hammersmith_Apollo,_London_(32508146567).jpg (London, 2018)
      { src: 'assets/artists/5sos-3-live.webp', box: [0.05, 0.08, 0.8, 1.0], credit: 'Drew de F Fawkes / CC BY 2.0 / Wikimedia Commons' },
    ],
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
