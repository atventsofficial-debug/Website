// Who is playing, for the story trailer (trailer.js): what the act is and where from, in two
// short lines, and where their official poster shows their faces, which part of it does.
// Keyed by the show's theme (themes.js), which is one per act.
//
// photo.src is the picture; photo.box the part of it with the act in it, as shares of its
// width and height [left, top, right, bottom], kept clear of any type on it; photo.credit the
// line its licence asks for, if it is not the promoter's own (a Creative Commons photo:
// 'Name / CC BY 4.0'), shown on it. Without a photo, the second scene is set in type.
//
// shots: photos of the act on stage at earlier shows (for a match, the athlete or both teams
// playing), cut together on the beat in the second scene in place of photo; each { src, box, credit } as photo's. Only photos whose licence
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
  gnr: {
    about: ['Hard rock band from Los Angeles, USA', 'Since 1985'],
    shots: [
      // commons.wikimedia.org/wiki/File:GunsNRoses160617-61_(35271773841).jpg (London, 2017)
      { src: 'assets/artists/gnr-1-live.webp', box: [0.24, 0.06, 0.84, 0.92], credit: 'Raph_PH / CC BY 2.0 / Wikimedia Commons' },
      // commons.wikimedia.org/wiki/File:GNRChorzow090718-76_(30169034758).jpg (Chorzów, 2018)
      { src: 'assets/artists/gnr-2-live.webp', box: [0.05, 0.04, 0.95, 0.9], credit: 'Raph_PH / CC BY 2.0 / Wikimedia Commons' },
      // commons.wikimedia.org/wiki/File:GunsNRoses160617_(35362031566).jpg (London, 2017)
      { src: 'assets/artists/gnr-3-live.webp', box: [0.46, 0.03, 0.9, 1.0], credit: 'Raph_PH / CC BY 2.0 / Wikimedia Commons' },
    ],
  },
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
  b2m: {
    about: ['Boyz II Men: R&B group from Philadelphia, USA', 'Dewa 19: rock band from Surabaya, Indonesia'],
    // Boyz II Men only: Commons has no CC BY or CC0 photo of Dewa 19 on stage yet.
    shots: [
      // commons.wikimedia.org/wiki/File:2022_Gershwin_Prize_for_Popular_Song_(51930552139).jpg (Washington, D.C., 2022)
      { src: 'assets/artists/b2m-1-live.webp', box: [0.12, 0.2, 0.92, 1.0], credit: 'Library of Congress / CC0 / Wikimedia Commons' },
      // commons.wikimedia.org/wiki/File:Nathan_Morris.jpg (2008)
      { src: 'assets/artists/b2m-2-live.webp', box: [0.1, 0.18, 0.95, 1.0], credit: 'Luis Avilesortiz / CC BY 2.0 / Wikimedia Commons' },
      // commons.wikimedia.org/wiki/File:Wanya_Morris.jpg (2008)
      { src: 'assets/artists/b2m-3-live.webp', box: [0.2, 0.14, 1.0, 1.0], credit: 'Luis Avilesortiz / CC BY 2.0 / Wikimedia Commons' },
    ],
  },
  nflying: { about: ['Rock band from Seoul, South Korea', 'Debut 2015'] },
  bigbang: {
    about: ['K-pop group from Seoul, South Korea', 'Debut 2006'],
    // G-Dragon on his own tour: Commons has no CC BY or CC0 photo of today's line-up on stage.
    shots: [
      // commons.wikimedia.org/wiki/File:G-Dragon_-_M.O.T.T.E_World_Tour_in_Sydney_2017_-_7.jpg (Sydney, 2017)
      { src: 'assets/artists/bigbang-1-live.webp', box: [0.18, 0.06, 0.74, 1.0], credit: 'Black Flower / CC BY 2.0 / Wikimedia Commons' },
    ],
  },
  enhypen: {
    about: ['K-pop group from Seoul, South Korea', 'Debut 2020'],
    photo: { src: 'assets/events/enhypen-bloodsaga-official.webp', box: [0.27, 0.0, 0.81, 0.56] },
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
  maroon5: {
    about: ['Pop rock band from Los Angeles, USA', 'Since 1994'],
    shots: [
      // commons.wikimedia.org/wiki/File:Adam_Levine_2013_August.jpg (2013)
      { src: 'assets/artists/maroon5-1-live.webp', box: [0.0, 0.0, 0.85, 1.0], credit: 'karina3094 / CC BY 2.0 / Wikimedia Commons' },
    ],
  },
  script: {
    about: ['Rock band from Dublin, Ireland', 'Since 2001'],
    photo: { src: 'assets/events/thescript-arena-official.webp', box: [0.3, 0.04, 0.85, 1.0] },
  },
  m2m: { about: ['Pop duo from Norway', ''] },
  bocelli: { about: ['Tenor from Tuscany, Italy', ''] },
};
