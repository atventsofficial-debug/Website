// Seats side by side (3D Pass Plus). Two seats of one venue, measured from the venue's own
// geometry: how far the eye is from the stage, how far round to the side, how high, and the
// category's price. Then a plain verdict on which seat sees more, and what each one wins on.
//
// The numbers need no pass: anyone can compare two seats from above, and a link carries the
// pair (#seats-<event>@<seat>~<seat>). Sitting in them to look is what Plus opens.

const EYE = { seated: 1.2, standing: 1.62 };
const axes = new WeakMap();

// Where the audience sits as a whole, seen from the stage: the venue's centre line.
function axisOf(venue) {
  if (axes.has(venue)) return axes.get(venue);
  const [fx, , fz] = venue.focus;
  let x = 0, z = 0;
  for (const s of venue.seats) { x += s.x - fx; z += s.z - fz; }
  const len = Math.hypot(x, z);
  // A venue in the round has no front: every seat counts as straight on.
  const a = len > venue.seats.length * 0.5 ? Math.atan2(z, x) : null;
  axes.set(venue, a);
  return a;
}

export function seatStats(venue, seat) {
  const [fx, fy, fz] = venue.focus;
  const eye = seat.y + (seat.standing ? EYE.standing : EYE.seated);
  const dx = seat.x - fx, dz = seat.z - fz;
  const flat = Math.hypot(dx, dz);
  const axis = axisOf(venue);
  let side = 0;
  if (axis !== null && flat > 0.01) {
    side = Math.abs(Math.atan2(dz, dx) - axis);
    if (side > Math.PI) side = 2 * Math.PI - side;
  }
  const cat = venue.catById?.[seat.cat];
  return {
    dist: Math.hypot(flat, eye - fy),
    side: side * 180 / Math.PI,
    // How steeply the seat looks down on the stage: a little rake sees over heads.
    rake: Math.atan2(eye - fy, Math.max(flat, 0.01)) * 180 / Math.PI,
    height: eye,
    price: cat?.price ?? null,
    standing: !!seat.standing,
    round: axis === null,
  };
}

// A score out of 100 for the view alone: near, straight on, and looking a little down.
export function viewScore(st) {
  const near = Math.max(0, 1 - st.dist / 120);
  const straight = Math.max(0, 1 - st.side / 110);
  const rake = st.rake < 0 ? 0.55 : st.rake <= 22 ? 0.75 + st.rake / 88 : Math.max(0.5, 1 - (st.rake - 22) / 60);
  // On the floor you stand behind other people's heads.
  const floor = st.standing ? 0.92 : 1;
  return Math.round(100 * (0.55 * near + 0.3 * straight + 0.15 * rake) * floor);
}

const fmtRp = n => `Rp${Math.round(n).toLocaleString('id-ID')}`;

// The verdict on two seats: the better view, and what each seat wins on.
export function compareSeats(venue, a, b) {
  const sa = seatStats(venue, a), sb = seatStats(venue, b);
  const score = [viewScore(sa), viewScore(sb)];
  const wins = [[], []];
  const win = (cond, i, text) => { if (cond) wins[i].push(text); };
  const dd = sb.dist - sa.dist;
  win(Math.abs(dd) >= 2, dd > 0 ? 0 : 1, `${Math.round(Math.abs(dd))} m closer to the stage`);
  const ds = sb.side - sa.side;
  win(Math.abs(ds) >= 8, ds > 0 ? 0 : 1, `${Math.round(Math.abs(ds))}° more straight on`);
  const dh = sb.height - sa.height;
  win(Math.abs(dh) >= 1.5, dh > 0 ? 1 : 0, `${Math.abs(dh).toFixed(1)} m higher up`);
  if (sa.price != null && sb.price != null && sa.price !== sb.price) win(true, sa.price < sb.price ? 0 : 1, `${fmtRp(Math.abs(sa.price - sb.price))} cheaper`);
  const best = Math.abs(score[0] - score[1]) < 3 ? -1 : score[0] > score[1] ? 0 : 1;
  // Value: points of view per Rp100.000, when both have a price.
  let value = -1;
  if (sa.price && sb.price) {
    const va = score[0] / sa.price, vb = score[1] / sb.price;
    value = Math.abs(va - vb) / Math.max(va, vb) < 0.08 ? -1 : va > vb ? 0 : 1;
  }
  return { stats: [sa, sb], score, wins, best, value };
}

// The pair in a link: two seat ids joined by ~ (seat ids never hold one).
export const pairOf = v => String(v || '').split('~').filter(Boolean).slice(0, 2);
export const pairText = ids => ids.join('~');
