// Seat templates for the real venues the concerts on sale play, each laid out after the
// venue's own plan and the promoter's seat plan for the show. Pure data like layouts.js,
// which registers them.
//
// Conventions shared with the other templates: metres, x along the long axis, the stage at
// the -x end facing +x. "Left" and "Right" are as the audience sees them facing the stage,
// as on the promoters' plans: Left is +z. Row A is the front row of a block; seats number
// from the block's left end as its row faces the stage or the field. The promoters give the
// seat numbers only near the show, so rows and numbers inside a block are our estimate: the
// pass lets the fan turn the numbering round (js/seatflip.js).
import { gridRows, bowl } from './seatgeo.js';

const pad = n => String(n).padStart(2, '0');

// ------------------------------------------------------------------ Stadion Madya GBK

// An athletics stadium: a 400 m, eight-lane track round the field, and two straight covered
// grandstands along the straights (about 8,000 seats in all; 9,170 with the field). Nothing
// stands round the two bends. https://en.wikipedia.org/wiki/Gelora_Bung_Karno_Madya_Stadium
export const MADYA = {
  straight: 84.39, bend: 36.5, lanes: 8, lane: 1.22,
  standFront: 49.5,   // the first row, from the centre line
  blocks: 10, blockSeats: 22, rows: 18, spacing: 0.5, rowDepth: 0.8, rise: 0.4, baseY: 1.4, aisle: 1.2,
  stageFront: -58,    // the stage's front edge, in the south bend, level with the stands' ends
};
// The front-of-house desk on the field (centre and half sizes), kept clear of standing spots:
// a third of the way down the floor, as on the plan.
export const MADYA_FOH = { x: MADYA.stageFront + 36, halfW: 4.2, halfD: 3.2 };
const madyaBlockX = b => (b - (MADYA.blocks + 1) / 2) * (MADYA.blockSeats * MADYA.spacing + MADYA.aisle);

// Guns N' Roses, 21 Nov 2026, after Rajawali Indonesia's seat plan: Festival A, B and C
// standing on the field, front to back; in both grandstands VIP by the stage, then Tribune
// A, then Tribune B for the rest of the stand.
function madyaEnd() {
  const seats = [], M = MADYA;
  for (const [side, sz] of [['L', 1], ['R', -1]]) {
    const name = side === 'L' ? 'Left' : 'Right';
    for (let b = 1; b <= M.blocks; b++) {
      const cat = b === 1 ? 'vip' : b <= 3 ? 'triba' : 'tribb';
      // Numbered from the block's left end as its rows face the field.
      gridRows(seats, { sec: `${side}${pad(b)}`, secName: `${name} stand, block ${b}`, cat, tier: 1,
        x0: madyaBlockX(b), z0: sz * M.standFront, rows: M.rows, cols: M.blockSeats, sx: M.spacing, sz: M.rowDepth,
        dir: [0, -sz], baseY: M.baseY, rise: M.rise });
    }
  }
  // The field: two halves either side of the centre aisle, the front-of-house desk in B. The
  // floor runs the whole field, from the stage to level with the grandstands' far ends, in
  // the plan's proportions: A about an eighth of it, B a third, C the back half.
  const floor = (sec, secName, cat, x0, rows) => {
    for (const [half, z] of [['L', 14.6], ['R', -14.6]]) {
      gridRows(seats, { sec: `${sec}-${half}`, secName: `${secName} ${half === 'L' ? 'Left' : 'Right'}`, cat, standing: true,
        x0, z0: z, rows, cols: 30, sx: 0.9, sz: 0.9, dir: [-1, 0] });
    }
  };
  floor('FA', 'Festival A', 'fesa', M.stageFront + 2.2, 15);
  floor('FB', 'Festival B', 'fesb', M.stageFront + 17, 46);
  floor('FC', 'Festival C', 'fesc', M.stageFront + 58.4, 66);
  // The front-of-house desk stands in the middle of Festival B: no one stands there.
  const foh = s => s.sec.startsWith('FB') && Math.abs(s.z) < MADYA_FOH.halfW && Math.abs(s.x - MADYA_FOH.x) < MADYA_FOH.halfD;
  for (let i = seats.length - 1; i >= 0; i--) if (foh(seats[i])) seats.splice(i, 1);
  return {
    key: 'madya-end',
    kind: 'stadium',
    arch: 'madya',
    show: 'end',
    stageX: M.stageFront,
    foh: [MADYA_FOH.x, 0],
    label: 'Stadion Madya, end stage',
    event: { title: 'Stadium concert', venue: 'Stadion Madya GBK' },
    focus: [M.stageFront - 10, 7, 0],
    overview: { pos: [56, 88, 104], target: [-14, 0, 0], min: 40, max: 230 },
    hero: { along: 30, look: [M.stageFront - 10, 9, 0], fov: 54 },
    seatStyle: 'shell',
    seatColor: '#9aa1a9',
    // Seats and treads in their category's colour on the map, as on the promoter's plan.
    zoneColors: true,
    occupancy: { vip: 0.7, triba: 0.6, tribb: 0.55, fesa: 0.94, fesb: 0.9, fesc: 0.88 },
    categories: [
      { id: 'vip', name: 'VIP', price: 7500000, color: '#ff8a3d' },
      { id: 'fesa', name: 'Festival A', price: 3750000, color: '#f5c451' },
      { id: 'triba', name: 'Tribune A', price: 4250000, color: '#3fb4e8' },
      { id: 'fesb', name: 'Festival B', price: 2750000, color: '#8a6cf0' },
      { id: 'tribb', name: 'Tribune B', price: 2250000, color: '#e83f6f' },
      { id: 'fesc', name: 'Festival C', price: 1750000, color: '#2fbf8f' },
    ],
    seats,
  };
}

// ------------------------------------------------------------------ Jakarta International Stadium

// A football stadium of three tiers all round a 105 x 68 m pitch, under a roof that opens
// over the pitch (82,000 seats). Modelled lighter than the real thing: fewer rows in each
// tier, at the real distances. At a concert the stands behind an end stage are closed: each
// tier stops where its front row reaches `cut` metres behind the centre spot, so all three
// end in line, by the stage, as on the promoters' plans. Blocks number 101 up in the lower
// tier, 201 in the middle and 301 in the upper, from the stage end of the left side round to
// the right side. https://en.wikipedia.org/wiki/Jakarta_International_Stadium
export const JIS = {
  p: 0.42,
  lower: { rx0: 64, rz0: 46, rows: 14, gap: 0.85, rise: 0.45, baseY: 1.2, blocks: 18 },
  middle: { rx0: 78, rz0: 60, rows: 8, gap: 0.9, rise: 0.6, baseY: 10.2, blocks: 21 },
  upper: { rx0: 87.5, rz0: 69.5, rows: 12, gap: 0.92, rise: 0.72, baseY: 19, blocks: 22 },
  cut: 50,
};
const JIS_TIERS = [['lower', 100, 1], ['middle', 200, 2], ['upper', 300, 3]];
const tierName = { lower: 'Lower', middle: 'Middle', upper: 'Upper' };
// The angle (radians, 0 at the far end) where a tier's front row reaches the cut.
export const jisEnd = t => Math.PI - Math.acos((JIS.cut / t.rx0) ** (1 / JIS.p));

// The bowl, open behind the stage. `zone({ tier, block, blocks })` gives each block its
// category: `tier` 1 to 3, `block` its place from the right side's stage end (0 up), so the
// far end's middle is at blocks / 2.
function jisBowl(seats, zone) {
  for (const [key, first, tier] of JIS_TIERS) {
    const T = JIS[key], end = jisEnd(T);
    bowl(seats, { ...T, p: JIS.p, cx: 0, cz: 0, from: -end, to: end, sections: T.blocks, even: true, aisle: 1.1,
      spacing: 0.6, tier, reverse: true,
      name: s => {
        const n = first + T.blocks - s;   // numbered from the left side's stage end
        return { code: `${n}`, label: `${tierName[key]} ${n}`, cat: zone({ tier, block: s, blocks: T.blocks }) };
      } });
  }
}

// Standing floor in two halves either side of the centre aisle, `rows` deep from just in
// front of the stage (x0), with the front-of-house desk and any pen in front of the stage
// kept clear. Spots come off the aisle end of their rows, so every row still numbers
// without gaps.
function jisFloor(seats, { sec, secName, cat, x0, rows, cols, foh, pen }) {
  const from = seats.length;
  const fes = { cat, standing: true, rows, cols, sx: 0.85, sz: 0.85, dir: [-1, 0], x0 };
  const halfW = (cols - 1) * 0.85 / 2 + 1.2;
  gridRows(seats, { ...fes, sec: `${sec}-L`, secName: `${secName} Left`, z0: halfW });
  gridRows(seats, { ...fes, sec: `${sec}-R`, secName: `${secName} Right`, z0: -halfW });
  const inside = (s, r) => r && Math.abs(s.z) < r.halfW && Math.abs(s.x - r.x) < r.halfD;
  for (let i = seats.length - 1; i >= from; i--) if (inside(seats[i], foh) || inside(seats[i], pen)) seats.splice(i, 1);
}

// My Chemical Romance, 22 Nov 2026, after Ravel Entertainment's plan (prices as reported by
// IDX Channel, 1 Feb 2026): a small VVIP pen in
// front of the stage, the standing Festival floor round it and back past the sound desk;
// CAT 1 in the lower tier, CAT 2 in the middle and CAT 3 in the upper, each split into
// Center (the blocks across the far end, facing the stage) and Left and Right (the sides).
// Center widens as the tiers climb: 4 blocks in CAT 1, 5 in CAT 2, 6 in CAT 3.
export const JIS_STAGE = -46;
// The sound desk halfway down the floor, level with the delay towers, as on the plan.
export const JIS_MCR_FOH = { x: JIS_STAGE + 48, halfW: 4.2, halfD: 3.2 };
const JIS_MCR_PEN = { x: JIS_STAGE + 5.4, halfW: 5.6, halfD: 3.6 };
function jisMcr() {
  const seats = [];
  const centre = { 1: 4, 2: 5, 3: 6 };
  jisBowl(seats, ({ tier, block, blocks }) => {
    const c = centre[tier], lo = (blocks - c) / 2;
    return `cat${tier}${block >= Math.floor(lo) && block < Math.floor(lo) + c ? 'c' : 's'}`;
  });
  // Festival fills the pitch from the stage to the far goal line, under CAT 1 Center.
  jisFloor(seats, { sec: 'FES', secName: 'Festival', cat: 'festival', x0: JIS_STAGE + 2.2, rows: 112, cols: 34, foh: JIS_MCR_FOH, pen: JIS_MCR_PEN });
  gridRows(seats, { sec: 'VVIP', secName: 'VVIP', cat: 'vvip', standing: true, rows: 7, cols: 12, sx: 0.85, sz: 0.85, dir: [-1, 0],
    x0: JIS_MCR_PEN.x - 2.55, z0: 0 });
  return {
    key: 'jis-mcr',
    kind: 'stadium',
    arch: 'jis',
    show: 'end',
    stageX: JIS_STAGE,
    foh: [JIS_MCR_FOH.x, 0],
    pen: JIS_MCR_PEN,
    tiers: JIS,
    label: 'Jakarta International Stadium, end stage',
    event: { title: 'Stadium concert', venue: 'Jakarta International Stadium' },
    focus: [JIS_STAGE - 10, 7, 0],
    overview: { pos: [100, 130, 160], target: [-6, 0, 0], min: 50, max: 320 },
    hero: { along: 46, look: [JIS_STAGE - 10, 10, 0], fov: 54 },
    seatStyle: 'shell',
    seatColor: '#c8202f',
    zoneColors: true,
    occupancy: { vvip: 0.94, festival: 0.9, cat1c: 0.6, cat1s: 0.55, cat2c: 0.55, cat2s: 0.5, cat3c: 0.5, cat3s: 0.45 },
    categories: [
      { id: 'vvip', name: 'VVIP', price: 5199000, color: '#ff3b3b', note: 'Standing pen in front of the stage' },
      { id: 'festival', name: 'Festival', price: 3099000, color: '#e9e9ec' },
      { id: 'cat1c', name: 'CAT 1 Center', code: 'CAT 1 C', price: 3299000, color: '#5ccf4a' },
      { id: 'cat1s', name: 'CAT 1 Left & Right', code: 'CAT 1 L/R', price: 3099000, color: '#ef4f9c' },
      { id: 'cat2c', name: 'CAT 2 Center', code: 'CAT 2 C', price: 2399000, color: '#f08a24' },
      { id: 'cat2s', name: 'CAT 2 Left & Right', code: 'CAT 2 L/R', price: 2099000, color: '#4fc6e0' },
      { id: 'cat3c', name: 'CAT 3 Center', code: 'CAT 3 C', price: 1299000, color: '#f5d33a' },
      { id: 'cat3s', name: 'CAT 3 Left & Right', code: 'CAT 3 L/R', price: 1059000, color: '#7b4bc4' },
    ],
    seats,
  };
}

export const REAL_BUILDERS = { 'madya-end': madyaEnd, 'jis-mcr': jisMcr };
