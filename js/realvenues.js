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
import { gridRows, bowl, pushSeat, superPoint, deg } from './seatgeo.js';

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


// ------------------------------------------------------------------ Indonesia Arena GBK

// The concert hall's bowl (layouts.js concert, buildConcert in venues3d.js) set up the way
// Indonesia Arena plays an end-stage show (16,088 seats for basketball; Kompas, GoodStats):
// the telescopic first tier wraps the floor on three sides, the skybox ring above it, and
// the fixed upper tiers above that, all closed behind the stage. Ten blocks a tier, 101 to
// 110 and 201 to 210 from the right side's stage end round to the left side's. Promoters
// sell by block and category; the seat numbers inside a block are our estimate.
export const INA = {
  cx: 0, cz: -10, p: 0.62, from: deg(-38), to: deg(218), sections: 10, spacing: 0.56,
  lower: { rx0: 24, rz0: 30, rows: 12, gap: 0.9, rise: 0.42, baseY: 1.6 },
  upper: { rx0: 37.4, rz0: 43.4, rows: 16, gap: 0.92, rise: 0.56, baseY: 9.9 },
  stageFront: -34,  // the stage deck's front edge (venues3d.js buildConcert)
  fohZ: 15,         // the sound desk, behind the floor
  aisle: 1.6,       // kept clear between the floor and the first tier
};
// Where a block sits on the plans: 'end' by the stage (restricted view), 'side' along the
// floor, 'back' facing the stage. `side` is 'L' or 'R' as the audience faces the stage
// (Left is -x here, the plans' "A" side).
export function inaBlock(s) {
  const pos = s === 0 || s === 9 ? 'end' : s >= 3 && s <= 6 ? 'back' : 'side';
  const t = INA.from + (s + 0.5) * (INA.to - INA.from) / INA.sections;
  return { pos, side: Math.cos(t) < 0 ? 'L' : 'R' };
}
// The standing floor: rows across the hall from the stage front back to the sound desk,
// as wide as the first tier allows less an aisle along it. `zones(x, z)` names each spot's
// pen ({ sec, secName, cat }) or null to leave it clear (a catwalk, the desk).
function inaFloor(seats, zones, step = 0.66) {
  const { cx, cz, p, lower } = INA, e = 2 / p;
  const inside = (x, z) => (Math.abs(x - cx) / (lower.rx0 - INA.aisle)) ** e + (Math.abs(z - cz) / (lower.rz0 - INA.aisle)) ** e < 1;
  const rows = new Map(), counts = new Map();
  for (let z = INA.stageFront + 3.3; z < INA.fohZ - 2.6; z += step) {
    for (const dir of [-1, 1]) {
      for (let x = dir * step / 2; inside(x, z); x += dir * step) {
        const pen = zones(x, z);
        if (!pen) continue;
        const key = `${pen.sec}`;
        if (!rows.has(key)) rows.set(key, { z: null, row: -1 });
        const r = rows.get(key);
        if (r.z !== z) { r.z = z; r.row++; counts.set(key, 0); }
        const num = counts.get(key) + 1; counts.set(key, num);
        const dx = 0 - x, dz = -40 - z, l = Math.hypot(dx, dz);
        pushSeat(seats, { ...pen, standing: true, sx: step, sz: step }, r.row, num, x, 0, z, dx / l, dz / l);
      }
    }
  }
}
// One show's plan on the bowl: `lower(block, row)` and `upper(block, row)` give each seat's
// category id (block 0..9), `floor(x, z)` each standing spot's pen.
function inaArena({ key, label, lower, upper, floor, stage, categories, occupancy }) {
  const seats = [];
  const common = { cx: INA.cx, cz: INA.cz, p: INA.p, from: INA.from, to: INA.to, sections: INA.sections, spacing: INA.spacing };
  inaFloor(seats, floor);
  bowl(seats, { ...common, ...INA.lower, tier: 1, cat: 'x',
    name: s => ({ code: `${101 + s}`, label: `Block ${101 + s}` }),
    catOf: (mid, row) => lower(Math.round((mid - INA.from) / ((INA.to - INA.from) / INA.sections) - 0.5), row) });
  bowl(seats, { ...common, ...INA.upper, tier: 2, cat: 'x',
    name: s => ({ code: `${201 + s}`, label: `Block ${201 + s}` }),
    catOf: (mid, row) => upper(Math.round((mid - INA.from) / ((INA.to - INA.from) / INA.sections) - 0.5), row) });
  return {
    key,
    kind: 'concert',
    arch: 'ina',
    aoKey: 'concert',
    label,
    event: { title: 'Arena concert', venue: 'Indonesia Arena' },
    focus: [0, 5, -40],
    overview: { pos: [0, 46, 60], target: [0, 0, -10], min: 25, max: 130 },
    hero: { along: 29, look: [0, 6, -40], fov: 56 },
    stage,
    fohZ: INA.fohZ,
    seatStyle: 'flipup',
    seatColor: '#8a8e94',
    zoneColors: true,
    occupancy,
    categories,
    seats,
  };
}

// 5 Seconds of Summer, 6 Dec 2026, after Chakra Live Asia's plan (5sosjakarta.com; prices
// as reported by Popbela): GA standing on the whole floor, the GA VIP package's pen at its
// front, the sound desk at the back. CAT 1 all round the first tier, with a CAT 1 VIP block
// on each side towards the stage; the VIP Box seats in a ring above it; CAT 2 round the
// upper tier, CAT 3 at its sides by the stage and CAT 4 in the end blocks beside the stage.
function ina5sos() {
  return inaArena({
    key: 'ina-5sos',
    label: 'Indonesia Arena, 5 Seconds of Summer',
    floor: (x, z) => z < INA.stageFront + 7
      ? { sec: 'GAVIP', secName: 'GA VIP', cat: 'gavip' }
      : { sec: x < 0 ? 'GA-L' : 'GA-R', secName: x < 0 ? 'GA Left' : 'GA Right', cat: 'ga' },
    lower: (b, row) => (b === 1 || b === 8) && row < 6 ? 'cat1vip' : 'cat1',
    upper: (b, row) => {
      const { pos } = inaBlock(b);
      if (pos === 'end') return 'cat4';
      if (row < 2) return 'vipbox';
      return b === 1 || b === 8 ? 'cat3' : 'cat2';
    },
    stage: { w: 36, d: 13, barrier: 40 },
    occupancy: { gavip: 0.97, ga: 0.95, cat1vip: 0.9, cat1: 0.9, vipbox: 0.85, cat2: 0.9, cat3: 0.88, cat4: 0.85 },
    categories: [
      { id: 'vipbox', name: "VIP Box 'No.1 Obsession'", code: 'VIP Box', price: 5000000, color: '#c9cbd0', note: 'Seat package with soundcheck and Q&A' },
      { id: 'cat1vip', name: "CAT 1 VIP 'No.1 Obsession'", code: 'CAT 1 VIP', price: 4140000, color: '#7d1d1d', note: 'Numbered seat in CAT 1, with the VIP package' },
      { id: 'gavip', name: "GA VIP 'No.1 Obsession'", code: 'GA VIP', price: 3950000, color: '#c4552a', note: 'Standing at the front of the floor' },
      { id: 'cat1', name: 'CAT 1', price: 2140000, color: '#e2463a' },
      { id: 'ga', name: 'GA', price: 1950000, color: '#ef8a4a', note: 'Standing' },
      { id: 'cat2', name: 'CAT 2', price: 1630000, color: '#8a55b8' },
      { id: 'cat3', name: 'CAT 3', price: 1320000, color: '#e2648e' },
      { id: 'cat4', name: 'CAT 4', price: 910000, color: '#4ab7cf', note: 'Side view by the stage' },
    ],
  });
}

// Boyz II Men + Dewa19 feat. Ari Lasso & Virzha, 9 Dec 2026, after Rajawali Indonesia's
// plan (prices from Loket.com): standing Festival on the floor round a catwalk from the
// stage, the sound desk at the back. In the first tier VIP in the front rows (A on the
// left, B on the right, C facing the stage), Diamond A and B behind it along the sides and
// Platinum at the back; the VIP Box ring above; Silver A and B along the upper sides and
// Gold at the back. Bronze (first tier) and Pearl (upper) in the end blocks by the stage,
// sold as restricted view.
const B2M_CATWALK = { halfW: 1.3, len: 13 };
function inaB2m() {
  const ab = b => (inaBlock(b).side === 'L' ? 'a' : 'b');
  return inaArena({
    key: 'ina-b2m',
    label: 'Indonesia Arena, Boyz II Men + Dewa19',
    floor: (x, z) => {
      if (Math.abs(x) < B2M_CATWALK.halfW + 1.6 && z < INA.stageFront + B2M_CATWALK.len + 1.8) return null;
      return { sec: x < 0 ? 'FES-L' : 'FES-R', secName: x < 0 ? 'Festival Left' : 'Festival Right', cat: 'festival' };
    },
    lower: (b, row) => {
      const { pos } = inaBlock(b);
      if (pos === 'end') return `bronze${ab(b)}`;
      if (row < 6) return pos === 'back' ? 'vipc' : `vip${ab(b)}`;
      return pos === 'back' ? 'platinum' : `diamond${ab(b)}`;
    },
    upper: (b, row) => {
      const { pos } = inaBlock(b);
      if (pos === 'end') return `pearl${ab(b)}`;
      if (row < 2) return pos === 'back' ? 'vipboxc' : `vipbox${ab(b)}`;
      return pos === 'back' ? 'gold' : `silver${ab(b)}`;
    },
    stage: { w: 36, d: 13, barrier: 40, catwalk: { w: B2M_CATWALK.halfW * 2, len: B2M_CATWALK.len } },
    occupancy: { festival: 0.94, vipa: 0.85, vipb: 0.85, vipc: 0.85, diamonda: 0.85, diamondb: 0.85, platinum: 0.85,
      vipboxa: 1, vipboxb: 1, vipboxc: 1, gold: 0.88, silvera: 1, silverb: 1, bronzea: 1, bronzeb: 1, pearla: 1, pearlb: 1 },
    categories: [
      { id: 'vipboxa', name: 'VIP Box A', code: 'VIP Box A', price: 7500000, color: '#e0352b' },
      { id: 'vipboxb', name: 'VIP Box B', code: 'VIP Box B', price: 7500000, color: '#e0352b' },
      { id: 'vipboxc', name: 'VIP Box C', code: 'VIP Box C', price: 7500000, color: '#e0352b' },
      { id: 'vipa', name: 'VIP A', price: 5000000, color: '#8f5bd9' },
      { id: 'vipb', name: 'VIP B', price: 5000000, color: '#8f5bd9' },
      { id: 'vipc', name: 'VIP C', price: 5000000, color: '#8f5bd9' },
      { id: 'diamonda', name: 'Diamond A', price: 3250000, color: '#ee8a2d' },
      { id: 'diamondb', name: 'Diamond B', price: 3250000, color: '#ee8a2d' },
      { id: 'platinum', name: 'Platinum', price: 2500000, color: '#4a7be0' },
      { id: 'festival', name: 'Festival', price: 1750000, color: '#f08cc8', note: 'Standing' },
      { id: 'gold', name: 'Gold', price: 1000000, color: '#c9a24a' },
      { id: 'silvera', name: 'Silver A', price: 750000, color: '#5f9a3a' },
      { id: 'silverb', name: 'Silver B', price: 750000, color: '#5f9a3a' },
      { id: 'bronzea', name: 'Bronze A', price: 500000, color: '#8a5a4a', note: 'Restricted view' },
      { id: 'bronzeb', name: 'Bronze B', price: 500000, color: '#8a5a4a', note: 'Restricted view' },
      { id: 'pearla', name: 'Pearl A', price: 300000, color: '#a9abb0', note: 'Restricted view' },
      { id: 'pearlb', name: 'Pearl B', price: 300000, color: '#a9abb0', note: 'Restricted view' },
    ],
  });
}


// ------------------------------------------------------------------ JIS: other shows

// A show's floor on the pitch, from its plan: pens in front of the stage, numbered chairs
// or standing floor, kept off the walkways, the B-stage and the sound desk. `pens` in order
// of priority, each { sec, secName, cat, standing, step, at(d, z) } where d is the distance
// out from the stage's front edge and z across the field (Left +z); the first pen whose `at`
// holds takes the spot. `clear(d, z)` keeps a spot empty.
function jisPitch(seats, pens, clear) {
  for (const pen of pens) {
    const sx = pen.standing ? (pen.step || 0.8) : 0.55, sz = pen.standing ? (pen.step || 0.8) : 0.9;
    let row = -1;
    for (let d = 2.4; d < 96; d += sz) {
      let num = 0, started = false;
      for (let z = 33; z > -33; z -= sx) {
        if (clear(d, z)) continue;
        const owner = pens.find(p => p.at(d, z));
        if (owner !== pen) continue;
        if (!started) { row++; started = true; }
        const x = JIS_STAGE + d, dx = JIS_STAGE - 6 - x, dz = -z, l = Math.hypot(dx, dz);
        pushSeat(seats, { ...pen, sx, sz, ...(pen.standing ? { standing: true } : {}) }, row, ++num, x, 0, z, dx / l, dz / l);
      }
    }
  }
}
// Distance from (d, z) to a walkway from (d0, z0) to (d1, z1).
const segDist = (d, z, [d0, z0, d1, z1]) => {
  const vx = d1 - d0, vz = z1 - z0, t = Math.max(0, Math.min(1, ((d - d0) * vx + (z - z0) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(d - (d0 + vx * t), z - (z0 + vz * t));
};
// The stage's walkways in its own frame (x across = -z on the field, z out = d).
const toThrust = ([d0, z0, d1, z1], w) => ({ x0: -z0, z0: d0, x1: -z1, z1: d1, w });

function jisShow({ key, label, zone, pens, clear, stage, foh, categories, occupancy }) {
  const seats = [];
  jisBowl(seats, zone);
  jisPitch(seats, pens, clear);
  return {
    key,
    kind: 'stadium',
    arch: 'jis',
    show: 'end',
    stageX: JIS_STAGE,
    foh: [JIS_STAGE + foh, 0],
    tiers: JIS,
    stage,
    label,
    event: { title: 'Stadium concert', venue: 'Jakarta International Stadium' },
    focus: [JIS_STAGE - 10, 7, 0],
    overview: { pos: [100, 130, 160], target: [-6, 0, 0], min: 50, max: 320 },
    hero: { along: 46, look: [JIS_STAGE - 10, 10, 0], fov: 54 },
    seatStyle: 'shell',
    seatColor: '#c8202f',
    zoneColors: true,
    occupancy,
    categories,
    seats,
  };
}
const ab = (block, blocks) => (block >= blocks / 2 ? 'a' : 'b');   // A on the left (+z) as on the plans

// BIGBANG 2026-2027 World Tour <XX : COSMOS>, 16 and 17 Jan 2027, after the plan on
// bigbanginjakarta.com (PK Entertainment, AEG Presents Asia, Sound Rhythm): an X-shaped
// thrust from the stage with the Ultimate VIP standing pens inside it, Diamond VIP chairs
// round the X and Gold VIP chairs behind with the sound desk; the first tier CAT 2 with
// CAT 1 A/B along the sides by the stage and CAT 6 A/B (restricted view) at its stage ends;
// the middle tier CAT 3; the upper tier CAT 4, with CAT 5 A/B along its sides by the stage
// and CAT 7 A/B (restricted view) at its stage ends.
const BB_ARMS = [[0, 15, 34, -15], [0, -15, 34, 15]];   // the X's two arms: (d, z) to (d, z), crossing 17 m out
const BB_SPINE = [0, 0, 17, 0];
const BB_FOH = 56;
function jisBigbang() {
  const onX = (d, z, m) => BB_ARMS.some(a => segDist(d, z, a) < 1.6 + m) || segDist(d, z, BB_SPINE) < 1.1 + m;
  return jisShow({
    key: 'jis-bigbang',
    label: 'Jakarta International Stadium, BIGBANG',
    zone: ({ tier, block, blocks }) => {
      const fromEnd = Math.min(block, blocks - 1 - block), side = ab(block, blocks);
      if (tier === 1) return fromEnd === 0 ? `cat6${side}` : fromEnd <= 2 ? `cat1${side}` : 'cat2';
      if (tier === 2) return 'cat3';
      return fromEnd === 0 ? `cat7${side}` : fromEnd <= 3 ? `cat5${side}` : 'cat4';
    },
    pens: [
      { sec: 'UVIP-A', secName: 'Ultimate VIP A', cat: 'uvip', standing: true, step: 0.75, at: (d, z) => z > 0 && d < 16 && Math.abs(z) < (17 - d) * 15 / 17 },
      { sec: 'UVIP-B', secName: 'Ultimate VIP B', cat: 'uvip', standing: true, step: 0.75, at: (d, z) => z < 0 && d < 16 && Math.abs(z) < (17 - d) * 15 / 17 },
      { sec: 'DVIP-A', secName: 'Diamond VIP Left', cat: 'dvip', at: (d, z) => z >= 0 && d < 46 && Math.abs(z) < 29 },
      { sec: 'DVIP-B', secName: 'Diamond VIP Right', cat: 'dvip', at: (d, z) => z < 0 && d < 46 && Math.abs(z) < 29 },
      { sec: 'GVIP-A', secName: 'Gold VIP Left', cat: 'gvip', at: (d, z) => z >= 0 && d >= 47.5 && d < 90 && Math.abs(z) < 29 },
      { sec: 'GVIP-B', secName: 'Gold VIP Right', cat: 'gvip', at: (d, z) => z < 0 && d >= 47.5 && d < 90 && Math.abs(z) < 29 },
    ],
    clear: (d, z) => onX(d, z, 0.4) || (Math.abs(d - BB_FOH) < 4.2 && Math.abs(z) < 5) || Math.abs(z) < 0.9 && d > 34,
    stage: { thrust: [...BB_ARMS.map(a => toThrust(a, 3.2)), toThrust(BB_SPINE, 2.2)] },
    foh: BB_FOH,
    occupancy: { uvip: 0.97, dvip: 0.92, gvip: 0.9, cat1a: 0.9, cat1b: 0.9, cat2: 0.9, cat3: 0.9, cat4: 0.88, cat5a: 0.88, cat5b: 0.88, cat6a: 0.85, cat6b: 0.85, cat7a: 0.85, cat7b: 0.85 },
    categories: [
      { id: 'uvip', name: 'Ultimate VIP', price: 6500000, color: '#e8392f', note: 'Standing, inside the X' },
      { id: 'dvip', name: 'Diamond VIP', price: 6000000, color: '#f08fc9', note: 'Numbered chairs on the floor round the X' },
      { id: 'gvip', name: 'Gold VIP', price: 5500000, color: '#f0943a', note: 'Numbered chairs on the floor, by the sound desk' },
      { id: 'cat1a', name: 'CAT 1 A', price: 4750000, color: '#ec7a72' },
      { id: 'cat1b', name: 'CAT 1 B', price: 4750000, color: '#ec7a72' },
      { id: 'cat2', name: 'CAT 2', price: 3750000, color: '#3f5fd6' },
      { id: 'cat3', name: 'CAT 3', price: 2850000, color: '#f2d24a' },
      { id: 'cat4', name: 'CAT 4', price: 2550000, color: '#72e08a' },
      { id: 'cat5a', name: 'CAT 5 A', price: 2250000, color: '#8b35c9' },
      { id: 'cat5b', name: 'CAT 5 B', price: 2250000, color: '#8b35c9' },
      { id: 'cat6a', name: 'CAT 6 A', price: 1850000, color: '#e33fe0', note: 'Restricted view' },
      { id: 'cat6b', name: 'CAT 6 B', price: 1850000, color: '#e33fe0', note: 'Restricted view' },
      { id: 'cat7a', name: 'CAT 7 A', price: 1550000, color: '#5fb7ec', note: 'Restricted view' },
      { id: 'cat7b', name: 'CAT 7 B', price: 1550000, color: '#5fb7ec', note: 'Restricted view' },
    ],
  });
}

// Maroon 5 Asia 2027, 5 Feb 2027, after TEM Presents and Live Nation's plan on
// maroon5jakarta2027.com: a runway from the stage to a B-stage on the Festival floor, the
// sound desk and the delay towers at its back; CAT 1 the first tier's blocks facing the stage
// behind the desk, CAT 2 the rest of the first tier, CAT 4 A/B its blocks by the stage
// (restricted view); the middle tier CAT 3 with CAT 6 A/B by the stage; the upper tier CAT 5
// with CAT 7 A/B by the stage (both restricted view).
const M5_RUNWAY = [0, 0, 21, 0];
const M5_B = { d: 25, half: 4 };
const M5_FOH = 66;
function jisMaroon5() {
  return jisShow({
    key: 'jis-maroon5',
    label: 'Jakarta International Stadium, Maroon 5',
    zone: ({ tier, block, blocks }) => {
      const fromEnd = Math.min(block, blocks - 1 - block), side = ab(block, blocks);
      if (tier === 1) return fromEnd === 0 ? `cat4${side}` : Math.abs(block - (blocks - 1) / 2) < 2.1 ? 'cat1' : 'cat2';
      if (tier === 2) return fromEnd === 0 ? `cat6${side}` : 'cat3';
      return fromEnd <= 1 ? `cat7${side}` : 'cat5';
    },
    pens: [
      { sec: 'FES-A', secName: 'Festival Left', cat: 'festival', standing: true, at: (d, z) => z >= 0 && Math.abs(z) < 30 },
      { sec: 'FES-B', secName: 'Festival Right', cat: 'festival', standing: true, at: (d, z) => z < 0 && Math.abs(z) < 30 },
    ],
    clear: (d, z) => segDist(d, z, M5_RUNWAY) < 2.6 || (Math.abs(d - M5_B.d) < M5_B.half + 1.2 && Math.abs(z) < M5_B.half + 1.2)
      || (Math.abs(d - M5_FOH) < 4.2 && Math.abs(z) < 5) || (Math.abs(d - (M5_FOH - 2)) < 1.6 && Math.abs(Math.abs(z) - 14) < 1.6) || Math.abs(z) < 0.8 && d > M5_B.d + 6,
    stage: { thrust: [toThrust(M5_RUNWAY, 3)], bstage: [{ x: 0, z: M5_B.d, w: M5_B.half * 2, d: M5_B.half * 2 }] },
    foh: M5_FOH,
    occupancy: { festival: 0.94, cat1: 0.9, cat2: 0.9, cat3: 0.9, cat4a: 0.85, cat4b: 0.85, cat5: 0.88, cat6a: 0.85, cat6b: 0.85, cat7a: 0.85, cat7b: 0.85 },
    categories: [
      { id: 'festival', name: 'Festival', price: 2750000, color: '#dfe3e6', note: 'Free standing; the Early Entry Package (Rp 4.9M) is a Festival ticket with early entry' },
      { id: 'cat1', name: 'CAT 1', price: 3500000, color: '#9b97a8' },
      { id: 'cat2', name: 'CAT 2', price: 2550000, color: '#6fd64a' },
      { id: 'cat3', name: 'CAT 3', price: 2250000, color: '#e83ce0' },
      { id: 'cat4a', name: 'CAT 4 A', price: 2050000, color: '#f08a3a', note: 'Restricted view' },
      { id: 'cat4b', name: 'CAT 4 B', price: 2050000, color: '#f08a3a', note: 'Restricted view' },
      { id: 'cat5', name: 'CAT 5', price: 1850000, color: '#2a3fe0' },
      { id: 'cat6a', name: 'CAT 6 A', price: 1450000, color: '#6fe9ea', note: 'Restricted view' },
      { id: 'cat6b', name: 'CAT 6 B', price: 1450000, color: '#6fe9ea', note: 'Restricted view' },
      { id: 'cat7a', name: 'CAT 7 A', price: 1250000, color: '#f2ef4a', note: 'Restricted view' },
      { id: 'cat7b', name: 'CAT 7 B', price: 1250000, color: '#f2ef4a', note: 'Restricted view' },
    ],
  });
}

export const REAL_BUILDERS = { 'madya-end': madyaEnd, 'jis-mcr': jisMcr, 'ina-5sos': ina5sos, 'ina-b2m': inaB2m, 'jis-bigbang': jisBigbang, 'jis-maroon5': jisMaroon5 };
