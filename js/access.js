// Getting there (3D Pass Plus, stage 3): how to reach each venue, and the way in from the
// outside of the venue to a seat.
//
// The travel notes are general public information (transport operators, the city's own
// guides and news coverage of past concerts), written as an illustration: on the day the
// promoter's announcement decides gates, parking pockets, shuttles and road closures.
// The way in is measured from the 3D model: from the side of the venue nearest the seat's
// block (seen from the middle of the hall), up or down to the block and along to the seat.

// [label, text]. Keyed by the venue's name (events.js place.name).
const GBK_AREA = [
  ['MRT', 'Istora Mandiri station, about 10 to 15 minutes on foot. Senayan station is the next stop along.'],
  ['KRL', 'Palmerah station, about 15 minutes on foot to the GBK gates.'],
  ['TransJakarta', 'Corridor 1 (Blok M to Kota), the Gelora Bung Karno stop.'],
  ['Parking', 'Little parking inside the complex on big concert days. Public parking pockets round Senayan are announced for each show.'],
  ['Ride-hailing', 'Drop-off and pick-up points are set for each show, and roads round Senayan may close.'],
];

export const ACCESS = {
  'Gelora Bung Karno Main Stadium': GBK_AREA,
  'Stadion Madya GBK': GBK_AREA,
  'Indonesia Arena': GBK_AREA,
  'Istora Senayan GBK': GBK_AREA,
  'Basket Hall GBK': GBK_AREA,
  'Tennis Indoor GBK': GBK_AREA,
  'Jakarta International Stadium': [
    ['KRL', 'JIS station on the Tanjung Priok line, beside the stadium.'],
    ['TransJakarta', 'Routes along Jl. R.E. Martadinata stop near the stadium; extra services run on concert days.'],
    ['Parking', 'The stadium’s own parking building, and extra pockets announced for each show.'],
    ['Ride-hailing', 'Drop-off points are set for each show on the roads round Papanggo.'],
  ],
  'JIExpo Kemayoran': [
    ['KRL', 'Kemayoran station, then a short ride to the halls.'],
    ['TransJakarta', 'Routes to the JIExpo Kemayoran stops.'],
    ['Parking', 'Parking on the JIExpo grounds.'],
    ['Ride-hailing', 'Drop-off at the JIExpo gates.'],
  ],
  'ICE BSD City, Hall 5–6': [
    ['KRL', 'Rawa Buntu station on the Rangkasbitung line, then a short ride to ICE.'],
    ['Bus', 'Premium buses from Jakarta run to BSD City.'],
    ['Parking', 'Parking at ICE, by the halls.'],
    ['Ride-hailing', 'Drop-off at the ICE lobby.'],
  ],
  'Graha UNESA': [
    ['Ride-hailing', 'The easiest way to the Lidah Wetan campus, with drop-off by the hall.'],
    ['Parking', 'Parking on the campus.'],
  ],
};

export const accessOf = venue => ACCESS[venue?.meta?.place?.name] || null;

// Every venue's middle (the middle of its seats, not the stage, which often sits at one
// end) and its outer edge seen from there: the furthest seat, plus a concourse.
const shapes = new WeakMap();
function shapeOf(venue) {
  if (shapes.has(venue)) return shapes.get(venue);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const s of venue.seats) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  let r = 0;
  for (const s of venue.seats) r = Math.max(r, Math.hypot(s.x - cx, s.z - cz));
  const shape = { cx, cz, edge: r + 10 };
  shapes.set(venue, shape);
  return shape;
}

const WALK = 70;   // metres a minute in a concert crowd
const CLIMB = 3;   // a metre up or down a stair counts as three on the flat

// The way in to a seat: points from the outside of the venue to the seat, with how far it
// is on foot and about how long it takes.
export function wayIn(venue, seat) {
  const shape = shapeOf(venue), outer = shape.edge;
  // The floor is entered from behind, away from the stage; a tier from the hall's outside.
  const floor = seat.standing || seat.y < 1.5;
  const fx = floor ? venue.focus[0] : shape.cx, fz = floor ? venue.focus[2] : shape.cz;
  let dx = seat.x - fx, dz = seat.z - fz;
  const flat = Math.hypot(dx, dz);
  if (flat < 0.01) { dx = 0; dz = 1; } else { dx /= flat; dz /= flat; }
  // The back of the seat's block along the same line: where its aisle meets the concourse.
  let back = flat;
  for (const s of venue.seats) if (s.sec === seat.sec) back = Math.max(back, (s.x - fx) * dx + (s.z - fz) * dz);
  const reach = floor ? Math.hypot(shape.cx - fx, shape.cz - fz) + outer : outer;
  const edge = Math.max(reach, back + 6);
  const at = (r, y) => [fx + dx * r, y, fz + dz * r];
  const eye = seat.y + 0.4;
  const pts = [at(edge, 0.3), at(back + 3, Math.max(0.3, seat.standing ? 0.3 : eye)), at(flat + 0.8, eye), [seat.x, eye, seat.z]];
  let metres = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay, az] = pts[i - 1], [bx, by, bz] = pts[i];
    metres += Math.hypot(bx - ax, bz - az) + Math.abs(by - ay) * CLIMB;
  }
  return { points: pts, metres: Math.round(metres), minutes: Math.max(2, Math.round(metres / WALK) + 2) };
}
