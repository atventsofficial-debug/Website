// Seat geometry for the venue templates: rows along a line or round a superellipse, and
// bowls cut into sections. Pure data, no browser or three.js: the Node server and the build
// import it through layouts.js.

export const rowLabel = i =>
  i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));

// Superellipse: p = 1 is an ellipse, p < 1 squares the corners off like a stadium bowl.
export function superPoint(t, rx, rz, p) {
  const c = Math.cos(t), s = Math.sin(t);
  return [rx * Math.sign(c) * Math.abs(c) ** p, rz * Math.sign(s) * Math.abs(s) ** p];
}

// While `dryRun` runs a venue builder, the seat helpers place nothing: the builder returns its
// categories, prices and settings at once, without the tens of thousands of seats that take a
// phone's CPU seconds to lay out (layouts.js venueInfo). Pages that only list a venue use that.
let dry = 0;
export function dryRun(build) {
  dry++;
  try { return build(); } finally { dry--; }
}

// `ri` is the row index from the front of the section; `standing` marks a spot on a
// standing floor rather than a seat.
export function pushSeat(out, o, row, num, x, y, z, fx, fz) {
  if (dry) return;
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
export function gridRows(out, o) {
  if (dry) return;
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
// keeps at least that many metres clear at the two ends of every row (an aisle). Seats
// number from the t0 end, or from the t1 end with `reverse`.
export function arcRows(out, o) {
  if (dry) return;
  const { cx = 0, cz = 0, rx0, rz0 = rx0, p = 1, rows, gap = 0.9, t0, t1, spacing = 0.56,
    baseY = 0, rise = 0, rowStart = 0, trim = 0, reverse = false } = o;
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
      pushSeat(out, o, rowStart + i, reverse ? n - s : s + 1, x, baseY + i * rise, z, nx, nz);
    }
  }
}

// Splits a bowl into sections with aisles between them. catOf(midAngle, row) picks the
// category, or name() gives each section its own `cat`; `skip` leaves out sections (behind
// an end stage). Sections span equal angles, so on a squared-off bowl the ones mid-stand
// come out longer than those in the corners; with `even` they are equal in length along
// the front row, and `aisle` is in metres instead of radians.
export function bowl(out, o) {
  if (dry) return;
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
export function evenCuts(rx, rz, p, from, to, n) {
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

export const deg = d => d * Math.PI / 180;
export const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
