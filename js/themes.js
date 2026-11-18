// Each show's look in 3D: the colours of its moving beams, the wash on the stage, the glow
// behind it, the screens' own colours under the poster, and the accent on the LED bands.
// Taken from the tour's artwork, so the venue on the night reads like the show's poster.
// An event names its theme (`theme` in events.js); anything else gets the house look.
export const THEMES = {
  default: { beams: ['#fff4e0', '#ffd7a8', '#e8eeff'], wash: '#ffe0bf', glow: '#ff9d5c', screen: { a: '#0e1018', b: '#7a4a35', c: '#ffd9b0' }, band: '#ec5446' },
  // `seat`: the seats' colour in the show's look, for a hall whose own seat colour we do not
  // know (events.js); a building whose seats we know keeps them.
  // Guns N' Roses: fire red, gold and white, as on the Jakarta poster.
  gnr: { beams: ['#ff2a14', '#ffb21e', '#fff0d2'], wash: '#ffd08a', glow: '#ff3a12', screen: { a: '#140403', b: '#8f1c0c', c: '#ffcf6b' }, band: '#e0a526', seat: '#8f1c0c' },
  // My Chemical Romance: black, blood red and stark white.
  mcr: { beams: ['#ffffff', '#d0102a', '#f0f0f0'], wash: '#f4f4f4', glow: '#b8001c', screen: { a: '#050505', b: '#4c0812', c: '#f5f5f5' }, band: '#d0102a', seat: '#1c1c1f' },
  // BTS ARIRANG: black and white with one red.
  bts: { beams: ['#ffffff', '#e0102f', '#f2f2f2'], wash: '#f6f6f6', glow: '#c8102e', screen: { a: '#050505', b: '#5a0a16', c: '#f5f5f5' }, band: '#d4142f', seat: '#b5122c' },
  // BIGBANG XX: COSMOS: sepia, khaki and old gold.
  bigbang: { beams: ['#f3e6c4', '#c9a86a', '#ffffff'], wash: '#f0dfb8', glow: '#b08a4a', screen: { a: '#0a0906', b: '#4a3e26', c: '#e6dcc4' }, band: '#c9a25a', seat: '#7d6a46' },
  // ENHYPEN Blood Saga: deep teal and bronze.
  enhypen: { beams: ['#7fb6bf', '#c8945a', '#e8efe6'], wash: '#cfe0d8', glow: '#2f7f8c', screen: { a: '#071214', b: '#1f4a52', c: '#d8dccb' }, band: '#b07d45', seat: '#2f6f78' },
  // Westlife 25: near black, warm maroon and candlelight.
  westlife: { beams: ['#ffe7c2', '#c46a4a', '#fff6ea'], wash: '#ffe2c0', glow: '#8a3a2a', screen: { a: '#0d0a0b', b: '#4a2620', c: '#e8cdb8' }, band: '#b0573e', seat: '#5a2a2a' },
  // 5 Seconds of Summer: ice white, pale blue and plum.
  '5sos': { beams: ['#e8f2ff', '#9fc6ff', '#d06a8a'], wash: '#eaf3ff', glow: '#7aa8e8', screen: { a: '#14171c', b: '#3d4a66', c: '#eef4fb' }, band: '#8fb8f0', seat: '#4a6f9c' },
  // Boyz II Men with Dewa 19: gold and brown.
  b2m: { beams: ['#ffd68a', '#e0a040', '#fff2d8'], wash: '#ffdca0', glow: '#c07a20', screen: { a: '#120c05', b: '#5a4218', c: '#e8d8b0' }, band: '#d49a35', seat: '#7a5a26' },
  // N.Flying into REM: indigo and violet.
  nflying: { beams: ['#9a86ff', '#5a40d0', '#e6e0ff'], wash: '#d6ccff', glow: '#4a32b0', screen: { a: '#0b0920', b: '#2c2266', c: '#d8d2ee' }, band: '#6a52e0', seat: '#3a2c80' },
  // Nancy Ajram: black and deep teal.
  nancy: { beams: ['#5fc0c0', '#0a8aa8', '#e8f6f6'], wash: '#d8f0f0', glow: '#0d6f80', screen: { a: '#000305', b: '#0b3a44', c: '#cfe6e6' }, band: '#1aa0b0', seat: '#1f5a62' },
  // Maroon 5 Asia: crimson and maroon.
  maroon5: { beams: ['#ff4a5e', '#b0182c', '#ffe6ea'], wash: '#ffd8de', glow: '#a0101e', screen: { a: '#14030a', b: '#5a0c18', c: '#f2e2e4' }, band: '#c8203a', seat: '#6e1622' },
  // The Script, Man in the Arena: terracotta and night blue.
  script: { beams: ['#ffd0b0', '#c06a4a', '#9ab0d0'], wash: '#ffe0c8', glow: '#a04a30', screen: { a: '#06080c', b: '#3a2420', c: '#d8cfc6' }, band: '#c0704f', seat: '#8a4a36' },
  // M2M Two: dusk purple.
  m2m: { beams: ['#d8b8f0', '#8a5aa8', '#f4eaff'], wash: '#ecdcf6', glow: '#6a3a8a', screen: { a: '#160c1a', b: '#3e2a4a', c: '#e2d6e6' }, band: '#9a6ab8', seat: '#5a3f6b' },
  // Andrea Bocelli, Romanza: amber and gold.
  bocelli: { beams: ['#fff1d6', '#e8b46a', '#ffe4b8'], wash: '#ffe6c2', glow: '#c88a3a', screen: { a: '#0c0906', b: '#4a3420', c: '#f0e0c4' }, band: '#c8964a', seat: '#5a3a22' },
};

export const themeOf = venue => THEMES[venue?.meta?.theme] || THEMES.default;
