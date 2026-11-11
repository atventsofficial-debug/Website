// Venue templates as pure data: seat positions, categories and prices.
// No browser or three.js dependency, so the Node server imports the same file
// to check event ids and categories.

const rowLabel = i =>
  i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));

// Superellipse: p = 1 is an ellipse, p < 1 squares the corners off like a stadium bowl.
export function superPoint(t, rx, rz, p) {
  const c = Math.cos(t), s = Math.sin(t);
  return [rx * Math.sign(c) * Math.abs(c) ** p, rz * Math.sign(s) * Math.abs(s) ** p];
}

// `ri` is the row index from the front of the section; `standing` marks a spot on a
// standing floor rather than a seat.
function pushSeat(out, o, row, num, x, y, z, fx, fz) {
  const label = rowLabel(row);
  out.push({
    id: `${o.sec}-${label}${num}`,
    sec: o.sec,
    secName: o.secName || o.sec,
    cat: o.catAt ? o.catAt(row) : o.cat,
    row: label,
    ri: row,
    num,
    ...(o.standing ? { standing: true } : {}),
    x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3),
    yaw: +Math.atan2(-fx, -fz).toFixed(4),
    tier: o.tier || 0,
    rowDepth: o.sz || o.gap || 0.9,
    width: o.sx || o.spacing || 0.56,
  });
}

// Straight (optionally bowed) rows. dir is the direction the audience faces.
function gridRows(out, o) {
  const { x0, z0, rows, cols, sx = 0.56, sz = 0.92, dir = [0, -1], baseY = 0, rise = 0, riseFrom = 0,
    curve = 0, focus, rowStart = 0, numStart = 1, reverse = false } = o;
  const [fx, fz] = dir, rx = -fz, rz = fx;
  for (let i = 0; i < rows; i++) {
    for (let c = 0; c < cols; c++) {
      const u = (c - (cols - 1) / 2) * sx;
      const bow = curve * u * u;
      const x = x0 + rx * u - fx * i * sz + fx * bow;
      const z = z0 + rz * u - fz * i * sz + fz * bow;
      const y = baseY + Math.max(0, i - riseFrom) * rise;
      let dx = fx, dz = fz;
      if (focus) { dx = focus[0] - x; dz = focus[1] - z; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
      pushSeat(out, o, rowStart + i, numStart + (reverse ? cols - 1 - c : c), x, y, z, dx, dz);
    }
  }
}

// Rows that follow a superellipse arc between angles t0 and t1 around (cx, cz). `trim`
// keeps at least that many metres clear at the two ends of every row (an aisle).
function arcRows(out, o) {
  const { cx = 0, cz = 0, rx0, rz0 = rx0, p = 1, rows, gap = 0.9, t0, t1, spacing = 0.56,
    baseY = 0, rise = 0, rowStart = 0, trim = 0 } = o;
  const N = 240;
  for (let i = 0; i < rows; i++) {
    const rx = rx0 + i * gap, rz = rz0 + i * gap;
    const pts = [], cum = [0];
    for (let k = 0; k <= N; k++) {
      const [x, z] = superPoint(t0 + (t1 - t0) * k / N, rx, rz, p);
      pts.push([cx + x, cz + z]);
      if (k) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    }
    const L = cum[N];
    const n = Math.floor((L - trim) / spacing);
    const start = (L - n * spacing) / 2;
    let seg = 0;
    for (let s = 0; s < n; s++) {
      const d = start + (s + 0.5) * spacing;
      while (seg < N - 1 && cum[seg + 1] < d) seg++;
      const a = pts[seg], b = pts[seg + 1];
      const f = (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
      const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      let nx = -tz, nz = tx;
      if (nx * (cx - x) + nz * (cz - z) < 0) { nx = -nx; nz = -nz; }
      pushSeat(out, o, rowStart + i, s + 1, x, baseY + i * rise, z, nx, nz);
    }
  }
}

// Splits a bowl into sections with aisles between them. catOf(midAngle, row) picks the
// category, or name() gives each section its own `cat`; `skip` leaves out sections (behind
// an end stage). Sections span equal angles, so on a squared-off bowl the ones mid-stand
// come out longer than those in the corners; with `even` they are equal in length along
// the front row, and `aisle` is in metres instead of radians.
function bowl(out, o) {
  const { from, to, sections, aisle = 0.022, name, catOf, skip, even } = o;
  const cuts = even && evenCuts(o.rx0, o.rz0 ?? o.rx0, o.p ?? 1, from, to, sections);
  const span = (to - from) / sections;
  for (let s = 0; s < sections; s++) {
    if (skip?.includes(s)) continue;
    const t0 = even ? cuts[s] : from + s * span + aisle / 2, t1 = even ? cuts[s + 1] : from + (s + 1) * span - aisle / 2;
    const mid = (t0 + t1) / 2;
    const sec = name(s, mid);
    arcRows(out, { ...o, t0, t1, trim: even ? aisle : 0, sec: sec.code, secName: sec.label, cat: sec.cat || o.cat,
      catAt: catOf ? row => catOf(mid, row) : null });
  }
}

// Angles that cut a superellipse arc from `from` to `to` into n stretches of equal length.
function evenCuts(rx, rz, p, from, to, n) {
  const N = 720, cum = [0];
  let [px, pz] = superPoint(from, rx, rz, p);
  for (let k = 1; k <= N; k++) {
    const [x, z] = superPoint(from + (to - from) * k / N, rx, rz, p);
    cum.push(cum[k - 1] + Math.hypot(x - px, z - pz));
    px = x; pz = z;
  }
  const cuts = [from];
  for (let s = 1, k = 0; s < n; s++) {
    const d = cum[N] * s / n;
    while (cum[k + 1] < d) k++;
    cuts.push(from + (to - from) * (k + (d - cum[k]) / (cum[k + 1] - cum[k])) / N);
  }
  return [...cuts, to];
}

const deg = d => d * Math.PI / 180;
const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

function concert() {
  const seats = [];
  const vip = { cat: 'vip', rows: 8, cols: 16, sx: 0.58, sz: 0.95 };
  gridRows(seats, { ...vip, sec: 'VIP-L', secName: 'VIP Left', x0: -5.45, z0: -29 });
  gridRows(seats, { ...vip, sec: 'VIP-R', secName: 'VIP Right', x0: 5.45, z0: -29 });
  const fl = { cat: 'floor', rows: 12, cols: 16, sx: 0.58, sz: 0.95 };
  gridRows(seats, { ...fl, sec: 'FA-L', secName: 'Floor A Left', x0: -5.45, z0: -19.6 });
  gridRows(seats, { ...fl, sec: 'FA-R', secName: 'Floor A Right', x0: 5.45, z0: -19.6 });
  const common = { cx: 0, cz: -10, p: 0.62, from: deg(-38), to: deg(218), sections: 10, spacing: 0.56 };
  bowl(seats, { ...common, rx0: 24, rz0: 30, rows: 12, gap: 0.9, rise: 0.42, baseY: 1.6, cat: 'lower', tier: 1,
    name: s => ({ code: `T1${String(s + 1).padStart(2, '0')}`, label: `Section ${101 + s}` }) });
  bowl(seats, { ...common, rx0: 37.4, rz0: 43.4, rows: 10, gap: 0.92, rise: 0.56, baseY: 9.9, cat: 'upper', tier: 2,
    name: s => ({ code: `T2${String(s + 1).padStart(2, '0')}`, label: `Section ${201 + s}` }) });
  return {
    key: 'concert',
    kind: 'concert',
    label: 'Concert',
    event: { title: 'Nada Senja Live: Arena Tour 2026', venue: 'Nusantara Arena, Jakarta' },
    focus: [0, 5, -40],
    overview: { pos: [0, 40, 52], target: [0, 0, -12], min: 25, max: 110 },
    // The home page hero: its seat is on the centre line, `along` metres from the stage
    // (heroSeat); the camera looks at `look` (default: the focus) with at least `fov`
    // degrees top to bottom, enough for the stage and the top of the screens.
    hero: { along: 29, look: [0, 6, -40], fov: 56 },
    seatStyle: 'theater',
    seatColor: '#8e1626',
    occupancy: { vip: 0.55, floor: 0.6, lower: 0.45, upper: 0.35 },
    categories: [
      { id: 'vip', name: 'VIP Floor', price: 3500000, color: '#f5c451' },
      { id: 'floor', name: 'Floor A', price: 1750000, color: '#ff7a6b' },
      { id: 'lower', name: 'Lower Tier', price: 1100000, color: '#56b6ff' },
      { id: 'upper', name: 'Upper Tier', price: 650000, color: '#a993ff' },
    ],
    seats,
  };
}

function cinema() {
  const seats = [];
  const base = { sec: 'S3', secName: 'Studio 3', sx: 0.62, sz: 1.12, rise: 0.36, riseFrom: 2, curve: 0.012, focus: [0, -40] };
  const rowsSpec = [
    { from: 0, rows: 5, cat: 'reg' },
    { from: 5, rows: 8, cat: 'prem' },
  ];
  for (const r of rowsSpec) {
    const z0 = -7.2 + r.from * base.sz;
    const baseY = Math.max(0, r.from - base.riseFrom) * base.rise;
    const riseFrom = Math.max(0, base.riseFrom - r.from);
    const o = { ...base, cat: r.cat, rows: r.rows, rowStart: r.from, z0, baseY, riseFrom };
    gridRows(seats, { ...o, cols: 4, x0: -6.1, numStart: 1 });
    gridRows(seats, { ...o, cols: 12, x0: 0, numStart: 5 });
    gridRows(seats, { ...o, cols: 4, x0: 6.1, numStart: 17 });
  }
  const sweetZ = -7.2 + 13 * base.sz + 0.25;
  gridRows(seats, { ...base, cat: 'sweet', rows: 1, cols: 10, sx: 0.74, x0: 0, z0: sweetZ, rowStart: 13,
    baseY: (13 - base.riseFrom) * base.rise + 0.05, riseFrom: 0 });
  return {
    key: 'cinema',
    kind: 'cinema',
    label: 'Cinema',
    event: { title: 'Langit Jingga (2026)', venue: 'Cakrawala Cinema, Studio 3' },
    focus: [0, 5.2, -15.4],
    overview: { pos: [15, 19, 21], target: [0, 1.5, -2], min: 8, max: 45 },
    seatStyle: 'cinema',
    seatColor: '#9a1325',
    occupancy: { reg: 0.35, prem: 0.55, sweet: 0.4 },
    categories: [
      { id: 'reg', name: 'Regular', price: 50000, color: '#56b6ff' },
      { id: 'prem', name: 'Premium', price: 65000, color: '#f5c451' },
      { id: 'sweet', name: 'Sweetbox', price: 150000, color: '#ff86b4' },
    ],
    seats,
  };
}

// Four blocks of rows facing the cage, one per side.
// Four blocks of floor seats round the ring; a UFC studio calls them cageside.
function ringside(seats, rows, word = 'Ringside') {
  const ring = { cat: 'ring', rows, cols: 18, sx: 0.58, sz: 0.95 }, c = word[0];
  gridRows(seats, { ...ring, sec: `${c}S-N`, secName: `${word} North`, x0: 0, z0: -7.8, dir: [0, 1] });
  gridRows(seats, { ...ring, sec: `${c}S-S`, secName: `${word} South`, x0: 0, z0: 7.8, dir: [0, -1] });
  gridRows(seats, { ...ring, sec: `${c}S-E`, secName: `${word} East`, x0: 7.8, z0: 0, dir: [-1, 0] });
  gridRows(seats, { ...ring, sec: `${c}S-W`, secName: `${word} West`, x0: -7.8, z0: 0, dir: [1, 0] });
}
const combatBowl = { cx: 0, cz: 0, p: 0.55, from: deg(-22.5 + 90), to: deg(337.5 + 90), sections: 8 };

function combat() {
  const seats = [];
  ringside(seats, 4);
  const common = combatBowl;
  bowl(seats, { ...common, rx0: 15.5, rows: 13, gap: 0.9, rise: 0.45, baseY: 1.4, cat: 'lower', tier: 1,
    name: s => ({ code: `L${s + 1}`, label: `Lower ${s + 1}` }) });
  bowl(seats, { ...common, rx0: 30, rows: 10, gap: 0.92, rise: 0.56, baseY: 10.2, cat: 'upper', tier: 2,
    name: s => ({ code: `U${s + 1}`, label: `Upper ${s + 1}` }) });
  return {
    key: 'combat',
    kind: 'combat',
    label: 'Combat Sport',
    event: { title: 'Garuda Fight Night 12', venue: 'Satria Hall, Surabaya' },
    focus: [0, 2.2, 0],
    overview: { pos: [0, 38, 42], target: [0, 0, 0], min: 15, max: 95 },
    seatStyle: 'shell',
    seatColor: '#2b2d33',
    occupancy: { ring: 0.6, lower: 0.5, upper: 0.4 },
    categories: [
      { id: 'ring', name: 'Ringside', price: 2500000, color: '#f5c451' },
      { id: 'lower', name: 'Lower Tier', price: 900000, color: '#ff7a6b' },
      { id: 'upper', name: 'Upper Tier', price: 400000, color: '#56b6ff' },
    ],
    seats,
  };
}

// A fight studio (as at Meta APEX, about 1,000 seats): cageside rows and one short
// riser all round, under a low roof. `compact` tells the 3D builder to shrink the hall.
function combatStudio() {
  const seats = [];
  ringside(seats, 3, 'Cageside');
  bowl(seats, { ...combatBowl, rx0: 15.5, rows: 4, gap: 0.9, rise: 0.45, baseY: 1.4, cat: 'lower', tier: 1,
    name: s => ({ code: `S${s + 1}`, label: `Stand ${s + 1}` }) });
  return {
    key: 'combat-studio',
    kind: 'combat',
    compact: true,
    label: 'Fight studio',
    event: { title: 'Fight night', venue: 'Studio' },
    focus: [0, 2.2, 0],
    overview: { pos: [0, 24, 27], target: [0, 0, 0], min: 12, max: 60 },
    seatStyle: 'shell',
    seatColor: '#2b2d33',
    occupancy: { ring: 0.7, lower: 0.6 },
    categories: [
      { id: 'ring', name: 'Cageside', price: 1500000, color: '#f5c451' },
      { id: 'lower', name: 'Stand', price: 600000, color: '#ff7a6b' },
    ],
    seats,
  };
}

function stadium() {
  const seats = [];
  // t = 90° is the main (west) stand nearest the default camera.
  const catOf = t => {
    const a = norm(t) * 180 / Math.PI;
    if (a > 72 && a < 108) return 'vip';
    if (a >= 40 && a <= 140) return 'west';
    if (a >= 220 && a <= 320) return 'east';
    return 'goal';
  };
  const sideName = t => {
    const a = norm(t) * 180 / Math.PI;
    if (a >= 40 && a <= 140) return 'West';
    if (a >= 220 && a <= 320) return 'East';
    return a < 40 || a > 320 ? 'North' : 'South';
  };
  lowerBowl(seats, { catOf, name: (s, mid) => ({ code: `${s + 1}`.padStart(2, '0'), label: `${sideName(mid)} Stand ${s + 1}` }) });
  const uppers = [[32, 148, 'West', 5], [212, 328, 'East', 5]];
  upperTiers(seats, uppers, () => 'upper');
  return {
    key: 'stadium',
    kind: 'stadium',
    uppers,
    label: 'Stadium',
    event: { title: 'Elang FC vs Banteng United', venue: 'Gelora Samudra Stadium' },
    focus: [0, 0.5, 0],
    overview: { pos: [0, 105, 112], target: [0, 0, 6], min: 40, max: 230 },
    seatStyle: 'shell',
    seatColor: '#b8162b',
    occupancy: { vip: 0.5, west: 0.55, east: 0.5, goal: 0.65, upper: 0.4 },
    categories: [
      { id: 'vip', name: 'VIP West', price: 750000, color: '#f5c451' },
      { id: 'west', name: 'West Stand', price: 300000, color: '#ff7a6b' },
      { id: 'east', name: 'East Stand', price: 250000, color: '#56b6ff' },
      { id: 'goal', name: 'Behind Goal', price: 120000, color: '#6ee39a' },
      { id: 'upper', name: 'Upper Tier', price: 150000, color: '#a993ff' },
    ],
    seats,
  };
}

// The stadium bowl shared by the football and concert layouts: 16 lower sections all
// round, and upper tiers over the angle ranges given in degrees.
function lowerBowl(seats, o) {
  bowl(seats, { cx: 0, cz: 0, p: 0.5, rx0: 61, rz0: 43, from: deg(-11.25), to: deg(348.75), sections: 16,
    aisle: 0.012, rows: 14, gap: 0.86, rise: 0.42, baseY: 1.1, spacing: 0.62, tier: 1, ...o });
}
function upperTiers(seats, uppers, catOf) {
  for (const [from, to, side, sections] of uppers) {
    bowl(seats, { cx: 0, cz: 0, p: 0.5, rx0: 76, rz0: 58, from: deg(from), to: deg(to), sections, aisle: 0.012, rows: 12, gap: 0.92,
      rise: 0.58, baseY: 9.6, spacing: 0.62, tier: 2, catOf: (mid, row) => catOf(mid, row),
      name: s => ({ code: `A${side[0]}${s + 1}`, label: `Upper ${side} ${s + 1}` }) });
  }
}

// Stadium concert, end stage (as at Jakarta International Stadium): stage at the west
// goal end, a standing festival floor in front of it, seated stands split into Center
// (facing the stage) and Left/Right. The three sections behind the stage are closed.
function stadiumEnd() {
  const seats = [];
  const side = t => {
    const a = norm(t) * 180 / Math.PI;
    if (a < 42 || a > 318) return 'Center';
    return a < 180 ? 'Left' : 'Right';
  };
  const band = (t, n) => `cat${n}${side(t) === 'Center' ? 'c' : 's'}`;
  lowerBowl(seats, { skip: [7, 8, 9], catOf: (t, row) => band(t, row < 7 ? 1 : 2),
    name: (s, mid) => ({ code: `${s + 1}`.padStart(2, '0'), label: `${side(mid)} ${s + 1}` }) });
  const uppers = [[-30, 30, 'Center', 3], [36, 140, 'Left', 5], [220, 324, 'Right', 5]];
  upperTiers(seats, uppers, t => band(t, 3));
  const fes = { cat: 'festival', standing: true, rows: 48, cols: 34, sx: 0.75, sz: 0.75, dir: [-1, 0] };
  gridRows(seats, { ...fes, sec: 'FES-L', secName: 'Festival Left', x0: -37, z0: 14.1 });
  gridRows(seats, { ...fes, sec: 'FES-R', secName: 'Festival Right', x0: -37, z0: -14.1 });
  return {
    key: 'stadium-end',
    kind: 'stadium',
    show: 'end',
    uppers,
    label: 'Stadium concert',
    event: { title: 'Stadium concert', venue: 'Stadium' },
    focus: [-50, 6, 0],
    overview: { pos: [70, 95, 105], target: [-8, 0, 0], min: 40, max: 230 },
    hero: { along: 42, look: [-50, 9, 0], fov: 54 },
    seatStyle: 'shell',
    seatColor: '#b8162b',
    occupancy: { festival: 0.55, cat1c: 0.6, cat1s: 0.5, cat2c: 0.55, cat2s: 0.45, cat3c: 0.5, cat3s: 0.4 },
    categories: [
      { id: 'festival', name: 'Festival', price: 3099000, color: '#f5c451' },
      { id: 'cat1c', name: 'CAT 1 Center', code: 'CAT 1 C', price: 3299000, color: '#ff7a6b' },
      { id: 'cat1s', name: 'CAT 1 Left & Right', code: 'CAT 1 L/R', price: 3099000, color: '#ff86b4' },
      { id: 'cat2c', name: 'CAT 2 Center', code: 'CAT 2 C', price: 2399000, color: '#56b6ff' },
      { id: 'cat2s', name: 'CAT 2 Left & Right', code: 'CAT 2 L/R', price: 2099000, color: '#a993ff' },
      { id: 'cat3c', name: 'CAT 3 Center', code: 'CAT 3 C', price: 1299000, color: '#6ee39a' },
      { id: 'cat3s', name: 'CAT 3 Left & Right', code: 'CAT 3 L/R', price: 1059000, color: '#c9d36a' },
    ],
    seats,
  };
}

// Stadium concert, 360-degree centre stage (as at Gelora Bung Karno): seated floor blocks
// on four sides of the stage, the full bowl and upper tiers all round.
function stadiumRound() {
  const seats = [];
  const floor = { rows: 0, cols: 19, sx: 0.56, sz: 0.95, focus: [0, 0], catAt: row => (row < 6 ? 'vip' : 'plat') };
  for (const [sec, name, dir, rows, along] of [
    ['FW', 'Floor West', [1, 0], 30, 'z'], ['FE', 'Floor East', [-1, 0], 30, 'z'],
    ['FN', 'Floor North', [0, 1], 20, 'x'], ['FS', 'Floor South', [0, -1], 20, 'x'],
  ]) {
    for (const [half, off] of [['A', -5.8], ['B', 5.8]]) {
      const x0 = along === 'z' ? -dir[0] * 12 : off, z0 = along === 'z' ? off : -dir[1] * 12;
      gridRows(seats, { ...floor, rows, dir, x0, z0, sec: `${sec}${half}`, secName: `${name} ${half}` });
    }
  }
  lowerBowl(seats, { catOf: (t, row) => (row < 4 ? 'plat' : 'cat1'), name: s => ({ code: `${s + 1}`.padStart(2, '0'), label: `Section ${s + 1}` }) });
  const uppers = [[-38, 38, 'East', 4], [52, 128, 'South', 4], [142, 218, 'West', 4], [232, 308, 'North', 4]];
  upperTiers(seats, uppers, (t, row) => (row < 6 ? 'cat2' : 'cat3'));
  return {
    key: 'stadium-round',
    kind: 'stadium',
    show: 'round',
    uppers,
    label: 'Stadium concert, 360 stage',
    event: { title: 'Stadium concert', venue: 'Stadium' },
    focus: [0, 5, 0],
    overview: { pos: [0, 100, 108], target: [0, 0, 4], min: 40, max: 230 },
    // Looks a little up and wider, so the screens hung over the stage are in the picture too.
    hero: { along: 49, look: [0, 13, 0], fov: 62 },
    seatStyle: 'shell',
    seatColor: '#b8162b',
    occupancy: { vip: 0.7, plat: 0.6, cat1: 0.55, cat2: 0.5, cat3: 0.45 },
    categories: [
      { id: 'vip', name: 'VIP Package', price: 4500000, color: '#f5c451' },
      { id: 'plat', name: 'Platinum', price: 3650000, color: '#ff7a6b' },
      { id: 'cat1', name: 'CAT 1', price: 2800000, color: '#56b6ff' },
      { id: 'cat2', name: 'CAT 2', price: 2300000, color: '#a993ff' },
      { id: 'cat3', name: 'CAT 3', price: 1800000, color: '#6ee39a' },
    ],
    seats,
  };
}

// Tottenham Hotspur Stadium, after a ticket seller's seating plan of the ground. The South
// Stand behind one goal is a single tier; the West, North and East have three, the lower
// tier running round both north corners. Blocks carry the plan's numbers, counted the plan's
// way round from the south end of the West Stand. `tiers` gives the 3D builder the radii and
// heights to build concourses, walls and roof round; every tier keeps rx - rz = 18, so the two
// seams between the South Stand and the rest are straight lines.
const SPURS = {
  edge: 50,   // the South Stand runs from -50° to 50°, the three-tier stands from 50° to 310°
  south: { rx0: 61, rz0: 43, rows: 38, gap: 0.86, rise: 0.62, baseY: 1.1 },
  lower: { rx0: 61, rz0: 43, rows: 13, gap: 0.86, rise: 0.45, baseY: 1.1 },
  middle: { rx0: 74.5, rz0: 56.5, rows: 7, gap: 0.9, rise: 0.55, baseY: 9.2 },
  upper: { rx0: 81.5, rz0: 63.5, rows: 13, gap: 0.92, rise: 0.68, baseY: 17.6 },
};
// [tier, first block, blocks, from°, to°, stand]
const SPURS_STANDS = [
  ['south', 248, 13, -50, 50, 'South Stand'],
  ['lower', 101, 9, 50, 138, 'West lower'], ['lower', 110, 7, 138, 222, 'North lower'], ['lower', 117, 8, 222, 310, 'East lower'],
  ['middle', 301, 11, 50, 145, 'West middle'], ['middle', 416, 9, 145, 215, 'North middle'], ['middle', 312, 10, 215, 310, 'East middle'],
  ['upper', 501, 8, 50, 125, 'West upper'], ['upper', 509, 13, 125, 235, 'North upper'], ['upper', 522, 9, 235, 310, 'East upper'],
];
// The plan's colours: one per ticket category, everything else grey.
const spursZone = b => (b >= 509 && b <= 521 ? 'north' : b >= 501 ? 'upper' : b === 120 || b === 121 ? 'centre'
  : b === 314 || b === 315 ? 'middle' : b === 312 || b === 313 ? 'corner' : 'other');

function stadiumTottenham() {
  const seats = [];
  for (const [tier, first, sections, from, to, stand] of SPURS_STANDS) {
    bowl(seats, { ...SPURS[tier], p: 0.5, from: deg(from), to: deg(to), sections, even: true, aisle: 1.1, spacing: 0.62,
      tier: tier === 'upper' ? 3 : tier === 'middle' ? 2 : 1,
      name: s => ({ code: `${first + s}`, label: `${stand}, block ${first + s}`, cat: spursZone(first + s) }) });
  }
  return {
    key: 'stadium-tottenham',
    kind: 'stadium',
    tiers: SPURS,
    zoneColors: true,
    label: 'Tottenham Hotspur Stadium',
    event: { title: 'Football', venue: 'Tottenham Hotspur Stadium' },
    focus: [0, 0.5, 0],
    overview: { pos: [0, 165, 122], target: [0, 0, 2], min: 45, max: 300 },
    seatStyle: 'shell',
    seatColor: '#1d2849',
    crowd: ['#f4f4f2', '#132257', '#f4f4f2', '#1b2a52', '#e9e6df', '#132257', '#0f1530', '#f4f4f2', '#2b3a55', '#c9ccd3'],
    // A thin crowd, so the colours read from the overview.
    occupancy: { upper: 0.3, north: 0.3, centre: 0.3, middle: 0.3, corner: 0.3, other: 0.35 },
    categories: [
      { id: 'upper', name: 'East and West upper', code: 'Upper', price: null, color: '#f4cf5d' },
      { id: 'north', name: 'North upper', code: 'North', price: null, color: '#8cc47a' },
      { id: 'centre', name: 'East lower, halfway', code: 'Halfway', price: null, color: '#d98cbf' },
      { id: 'middle', name: 'East middle', code: 'Middle', price: null, color: '#9f8fe0' },
      { id: 'corner', name: 'North-east corner', code: 'Corner', price: null, color: '#79b0ec' },
      { id: 'other', name: 'Other blocks', code: 'Other', price: null, color: '#e4e4e8', note: 'Grey on the seating plan' },
    ],
    seats,
  };
}

// Gelora Bung Karno Main Stadium, Jakarta: an oval bowl round a football pitch and an
// eight-lane running track, a lower and an upper tier all the way round under the ring roof.
// Sizes are estimated from photos and the stadium's published capacity, not from drawings.
// `tiers` gives the 3D builder the radii and heights; every ring keeps the same rx - rz.
// The track is a standard 400 m oval (177 m by 93 m over the outer lane); the front wall stands
// about 11 m beyond it at the ends and 15 m at the sides.
const GBK_BOWL = {
  lower: { rx0: 100, rz0: 62, rows: 22, gap: 0.82, rise: 0.4, baseY: 3.2 },
  upper: { rx0: 121, rz0: 83, rows: 36, gap: 0.82, rise: 0.56, baseY: 14.2 },
};

function stadiumGbk() {
  const all = [];
  // t = 90° is the west (main) stand, nearest the default camera; the goals are at 0° and 180°.
  const side = t => {
    const a = norm(t) * 180 / Math.PI;
    if (a >= 40 && a <= 140) return 'West';
    if (a >= 220 && a <= 320) return 'East';
    return a < 40 || a > 320 ? 'North' : 'South';
  };
  const cat = (t, upper) => {
    const a = norm(t) * 180 / Math.PI, s = side(t);
    if (s === 'North' || s === 'South') return 'cat3';
    if (upper) return 'cat2';
    return a > 74 && a < 106 ? 'vip' : 'cat1';
  };
  const ring = (tier, sections, first, upper) => bowl(all, { ...GBK_BOWL[tier], p: 1, from: deg(-90 / sections * 2), to: deg(360 - 90 / sections * 2), sections,
    even: true, aisle: 1.3, spacing: 0.55, tier: upper ? 2 : 1,
    name: (s, mid) => ({ code: `${first + s}`, label: `${upper ? 'Upper' : 'Lower'} ${side(mid)}, sector ${first + s}`, cat: cat(mid, upper) }) });
  ring('lower', 24, 101, false);
  ring('upper', 36, 201, true);

  // Stair mouths in the upper tier: a gap mid-block, rows K to N, where the stairs come up
  // from the concourse. The 3D builder draws the opening where the seats are left out.
  const blocks = new Map();
  for (const s of all) if (s.tier === 2) { const b = blocks.get(s.sec) || []; b.push(s); blocks.set(s.sec, b); }
  const gone = new Set(), mouths = [];
  for (const list of blocks.values()) {
    const cut = [];
    for (let row = 10; row <= 13; row++) {
      const r = list.filter(s => s.ri === row), mid = (r.length + 1) / 2;
      for (const s of r) if (Math.abs(s.num - mid) <= 3.5) cut.push(s);
    }
    cut.forEach(s => gone.add(s.id));
    const c = cut.reduce((a, s) => ({ x: a.x + s.x / cut.length, y: Math.min(a.y, s.y), z: a.z + s.z / cut.length, yaw: s.yaw }), { x: 0, y: Infinity, z: 0, yaw: 0 });
    const m = cut[cut.length >> 1];
    mouths.push({ x: +c.x.toFixed(2), y: c.y, z: +c.z.toFixed(2), yaw: m.yaw });
  }
  const seats = all.filter(s => !gone.has(s.id));

  // Red at the top of the bowl thinning out to white at the pitch, as the seats were laid
  // out in the 2018 renovation.
  const top = GBK_BOWL.upper.baseY + (GBK_BOWL.upper.rows - 1) * GBK_BOWL.upper.rise;
  const seatTint = s => {
    const h = (s.y - GBK_BOWL.lower.baseY) / (top - GBK_BOWL.lower.baseY);
    const n = (hash(s.id) % 1000) / 1000;
    return h + (n - 0.5) * 0.3 > 0.42 ? '#c4161c' : '#e9e8e4';
  };
  return {
    key: 'stadium-gbk',
    kind: 'stadium',
    gbk: GBK_BOWL,
    mouths,
    ownTiers: true,
    // Photo views: a photographic picture of the stadium from one point in the stands, shown
    // in place of the 3D model from every seat of the same tier within `reach` metres of it.
    // `eye` and `look` are where the picture was taken from and towards, `fov` its height in degrees.
    photos: [
      { id: 'upper-west', src: 'assets/views/gbk-upper-west.jpg', tier: 2, eye: [-2.32, 30.52, 105.13], look: [0, 6, 0], fov: 72, reach: 70 },
      { id: 'upper-north', src: 'assets/views/gbk-upper-north.jpg', tier: 2, eye: [143.1, 30.52, 2.46], look: [0, 6, 0], fov: 72, reach: 70 },
      { id: 'upper-east', src: 'assets/views/gbk-upper-east.jpg', tier: 2, eye: [2.32, 30.52, -105.13], look: [0, 6, 0], fov: 72, reach: 70 },
      { id: 'upper-south', src: 'assets/views/gbk-upper-south.jpg', tier: 2, eye: [-143.1, 30.52, -2.46], look: [0, 6, 0], fov: 72, reach: 70 },
    ],
    seatTint,
    label: 'Gelora Bung Karno Main Stadium',
    event: { title: 'Football', venue: 'Gelora Bung Karno Main Stadium' },
    focus: [0, 0.5, 0],
    overview: { pos: [0, 250, 215], target: [0, 0, 6], min: 60, max: 520 },
    seatStyle: 'flip',
    seatColor: '#c4161c',
    crowd: ['#c8102e', '#c8102e', '#d21a2c', '#b10e28', '#c8102e', '#f4f4f2', '#f4f4f2', '#e9e6df', '#1b1c20', '#c8102e', '#a50f24', '#2b3a55'],
    occupancy: { vip: 0.55, cat1: 0.6, cat2: 0.5, cat3: 0.5 },
    categories: [
      { id: 'vip', name: 'VIP West', code: 'VIP', price: null, color: '#f5c451' },
      { id: 'cat1', name: 'Category 1, lower East and West', code: 'CAT 1', price: null, color: '#ff7a6b' },
      { id: 'cat2', name: 'Category 2, upper East and West', code: 'CAT 2', price: null, color: '#56b6ff' },
      { id: 'cat3', name: 'Category 3, North and South', code: 'CAT 3', price: null, color: '#6ee39a' },
    ],
    seats,
  };
}

const builders = { concert, cinema, combat, 'combat-studio': combatStudio, stadium, 'stadium-end': stadiumEnd, 'stadium-round': stadiumRound, 'stadium-tottenham': stadiumTottenham, 'stadium-gbk': stadiumGbk };
export const VENUE_KEYS = Object.keys(builders);
const cache = {};

export function getVenue(key) {
  if (!builders[key]) throw new Error(`Unknown template: ${key}`);
  if (!cache[key]) {
    const v = builders[key]();
    v.eventId = `tpl-${v.key}`;
    v.catById = Object.fromEntries(v.categories.map(c => [c.id, c]));
    v.seatById = new Map(v.seats.map((s, i) => [s.id, i]));
    cache[key] = v;
  }
  return cache[key];
}

// Seats with someone in them on the night, the same for every visitor: the 3D crowd.
// It is atmosphere, not availability (tiket.com has the live stock). A category the
// seller lists as sold out is full.
// The seat the home page hero shows the stage from: on the line from the stage through the
// middle of the audience (the south side, round a centre stage), `hero.along` metres from
// the stage, or halfway down that line without a hint.
export function heroSeat(venue) {
  const [fx, , fz] = venue.focus;
  let ax = 0, az = 0;
  for (const s of venue.seats) { ax += s.x - fx; az += s.z - fz; }
  const len = Math.hypot(ax, az);
  [ax, az] = len / venue.seats.length < 5 ? [0, 1] : [ax / len, az / len];
  const line = [];
  let closest = Infinity;
  for (const s of venue.seats) {
    const dx = s.x - fx, dz = s.z - fz, along = dx * ax + dz * az, off = Math.abs(dx * az - dz * ax);
    if (along <= 0) continue;
    line.push({ s, along, off });
    closest = Math.min(closest, off);
  }
  const centre = line.filter(o => o.off < Math.max(2.5, closest + 1.2)).sort((a, b) => a.along - b.along);
  const want = venue.hero?.along ?? centre[centre.length >> 1].along;
  // Nearest that distance, and nearest the line itself: a metre off it counts double.
  const miss = o => Math.abs(o.along - want) + 2 * o.off;
  return centre.reduce((best, o) => (miss(o) < miss(best) ? o : best)).s;
}

export function crowdSeats(venue) {
  const taken = new Set();
  const rnd = mulberry32(hash(venue.eventId));
  const full = new Set(venue.meta?.soldOut || []);
  // Clusters: whole runs of seats fill together, like groups of friends.
  let streak = 0, streakTaken = false;
  for (const s of venue.seats) {
    if (streak <= 0) {
      streak = 1 + Math.floor(rnd() * 6);
      streakTaken = rnd() < (venue.occupancy[s.cat] ?? 0.4);
    }
    if (streakTaken || full.has(s.cat)) taken.add(s.id);
    streak--;
  }
  return taken;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatRp(n) {
  return 'Rp ' + Math.round(n).toLocaleString('en-US');
}

// Short form for tight spots: Rp 1.58B, Rp 3.5M, Rp 650K.
export function formatRpShort(n) {
  if (n >= 1e9) return `Rp ${+(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `Rp ${+(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `Rp ${+(n / 1e3).toFixed(0)}K`;
  return `Rp ${n}`;
}
