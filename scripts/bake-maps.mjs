// Bakes the "Getting there" maps (3D Pass Plus) from OpenStreetMap extracts.
//
//   node scripts/bake-maps.mjs <raw-dir>      raw-dir holds atv-osm-<area>.json (Overpass JSON)
//
// Writes assets/maps/<area>.json: the area in local metres round its centre (x east, y south),
// drawn in Atvents' own style by js/citymap.js: buildings, roads by class, green, water,
// rail, the transit stops round the venues (MRT, KRL, LRT, TransJakarta, parking), each
// venue's footprint, and a walking graph the route is found on at runtime.
// Map data © OpenStreetMap contributors, under the ODbL (shown on the map).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAW = process.argv[2] || 'osm-raw';
const OUT = 'assets/maps';

// Each area: its centre, how far round it to keep, and its venues by OSM name (regex),
// keyed by events.js place.name.
export const AREAS = {
  gbk: { center: [-6.2185, 106.8020], r: 1500, venues: {
    'Gelora Bung Karno Main Stadium': /^Stadion Utama Gelora Bung Karno$/,
    'Stadion Madya GBK': /^Stadion Madya Gelora Bung Karno$/,
    'Indonesia Arena': /^Indonesia Arena$/,
    'Istora Senayan GBK': /^Istana Olahraga Gelora Bung Karno$/,
    'Basket Hall GBK': /^GBK Arena$/,
    'Tennis Indoor GBK': /^Tennis Indoor Stadium$/,
  } },
  jis: { center: [-6.1240, 106.8605], r: 1100, venues: { 'Jakarta International Stadium': /Jakarta International Stadium|^JIS$/i } },
  jiexpo: { center: [-6.1460, 106.8460], r: 1300, venues: { 'JIExpo Kemayoran': /^Hall [A-E] JIExpo$/ } },
  icebsd: { center: [-6.3020, 106.6380], r: 1500, venues: { 'ICE BSD City, Hall 5–6': /^Indonesia Convention Exhibition$/ } },
  unesa: { center: [-7.3009, 112.6660], r: 1100, venues: { 'Graha UNESA': /Graha Unesa/i } },
};

const R_EARTH = 6378137;
const projector = ([lat0, lon0]) => {
  const k = Math.cos(lat0 * Math.PI / 180);
  return (lat, lon) => [(lon - lon0) * Math.PI / 180 * R_EARTH * k, -(lat - lat0) * Math.PI / 180 * R_EARTH];
};
const r1 = v => Math.round(v * 2) / 2;   // half a metre

// Douglas-Peucker on [x, y] points.
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    let best = -1, bd = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const flat = pts => pts.flatMap(([x, y]) => [r1(x), r1(y)]);
const area = pts => { let s = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s / 2); };

const ROAD = {
  motorway: 'major', trunk: 'major', motorway_link: 'major', trunk_link: 'major',
  primary: 'main', primary_link: 'main', secondary: 'main', secondary_link: 'main',
  tertiary: 'street', tertiary_link: 'street', unclassified: 'street', residential: 'street', living_street: 'street',
  service: 'service',
  pedestrian: 'foot', footway: 'foot', path: 'foot', steps: 'foot', cycleway: 'foot', corridor: 'foot', platform: 'foot',
};
// Walking cost per metre: a crossing-free footway is easiest; walking a big road's edge less so.
const WALK = { foot: 1, service: 1.05, street: 1.1, main: 1.25 };

function stopKind(t) {
  const s = Object.values(t).join(' ');
  if (t.amenity === 'parking' || t.amenity === 'parking_entrance') return 'parking';
  if (/transjakarta/i.test(s)) return 'tj';
  if (t.station === 'subway' || /\bMRT\b/i.test(s)) return 'mrt';
  if (/\bLRT\b|light_rail/i.test(s) || t.station === 'light_rail') return 'lrt';
  if (t.railway === 'station' || t.railway === 'halt' || t.train === 'yes' || /\bKRL\b|Commuter/i.test(s)) return 'krl';
  if (t.highway === 'bus_stop' || t.bus === 'yes' || t.amenity === 'bus_station') return 'bus';
  return null;
}

function bake(key, def) {
  const file = join(RAW, `atv-osm-${key}.json`);
  if (!existsSync(file)) { console.log(`${key}: no ${file}, skipped`); return; }
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const P = projector(def.center), R = def.r;
  const inside = ([x, y]) => Math.abs(x) <= R && Math.abs(y) <= R;
  const out = { center: def.center, r: R, buildings: [], roads: { major: [], main: [], street: [], service: [], foot: [] }, green: [], water: [], rivers: [], rail: [], parking: [], venues: {}, stops: [] };
  // walking graph
  const nodeIx = new Map(), nodes = [], edges = [], names = [''], nameIx = new Map([['', 0]]);
  const nameOf = n => { if (!nameIx.has(n)) { nameIx.set(n, names.length); names.push(n); } return nameIx.get(n); };
  const gnode = (id, x, y) => { if (!nodeIx.has(id)) { nodeIx.set(id, nodes.length); nodes.push([r1(x), r1(y)]); } return nodeIx.get(id); };

  for (const el of raw.elements) {
    const t = el.tags || {};
    if (el.type === 'node') {
      const entrance = t.railway === 'subway_entrance' || (t.entrance && /subway|train|station/.test(Object.values(t).join(' ')));
      const kind = entrance ? (t.railway === 'subway_entrance' ? 'mrt' : stopKind(t)) : stopKind(t);
      if (!kind || (!t.name && !entrance)) continue;
      if (t.entrance && !entrance) continue;
      const [x, y] = P(el.lat, el.lon);
      if (!inside([x, y])) continue;
      out.stops.push({ kind, name: t.name || '', x: r1(x), y: r1(y), sub: entrance ? 1 : 0, ref: t.ref || '' });
      continue;
    }
    if (el.type !== 'way' || !el.geometry) continue;
    const pts = el.geometry.map(g => P(g.lat, g.lon));
    if (!pts.some(inside)) continue;
    const closed = el.nodes && el.nodes[0] === el.nodes[el.nodes.length - 1];
    if (t.highway && ROAD[t.highway] && t.area !== 'yes') {
      const cls = ROAD[t.highway];
      out.roads[cls].push(flat(simplify(pts, 1)));
      if (cls !== 'major' && t.foot !== 'no' && t.access !== 'private') {
        for (let i = 1; i < el.nodes.length; i++) {
          const a = gnode(el.nodes[i - 1], ...pts[i - 1]), b = gnode(el.nodes[i], ...pts[i]);
          const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          edges.push([a, b, Math.round(d * WALK[cls] * 10) / 10, Math.round(d * 10) / 10, nameOf(t.name || '')]);
        }
      }
      continue;
    }
    if (t.railway && t.railway !== 'platform') { out.rail.push(flat(simplify(pts, 1.5))); continue; }
    if (t.waterway) { out.rivers.push(flat(simplify(pts, 2))); continue; }
    if (!closed || pts.length < 4) continue;
    const ring = simplify(pts.slice(0, -1), 0.8);
    if (ring.length < 3) continue;
    const name = t.name || '';
    for (const [place, re] of Object.entries(def.venues)) {
      if (name && re.test(name) && (!out.venues[place] || area(ring) > area(out.venues[place].ring))) out.venues[place] = { name, ring };
    }
    if (t.building || t['building:part']) {
      if (!ring.some(inside)) continue;
      // Small houses far out are texture only: keep the bigger ones there.
      const far = Math.min(...ring.map(([x, y]) => Math.hypot(x, y))) > 600;
      if (area(ring) < (far ? 90 : 30)) continue;
      const lv = +t['building:levels'] || 0, h = +String(t.height || '').replace(/[^0-9.]/g, '') || (lv ? lv * 3.2 : 0);
      out.buildings.push([Math.round(h), ...ring.flatMap(([x, y]) => [Math.round(x), Math.round(y)])]);
    } else if (t.natural === 'water') out.water.push(flat(ring));
    else if (t.amenity === 'parking') {
      out.parking.push(flat(ring));
      if (t.name && area(ring) > 400) { const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]); out.stops.push({ kind: 'parking', name: t.name, x: r1(c[0]), y: r1(c[1]), sub: 0, ref: '' }); }
    }
    else if (t.leisure || t.landuse || t.natural) out.green.push(flat(ring));
  }
  for (const v of Object.values(out.venues)) v.ring = flat(v.ring);
  // Stops: keep each name once (the station node, entrances listed under it), the nearest few of each kind.
  const byName = new Map();
  for (const s of out.stops.filter(s => !s.sub)) {
    const k = `${s.kind}|${s.name}`;
    if (!byName.has(k)) byName.set(k, { kind: s.kind, name: s.name, x: s.x, y: s.y, ref: s.ref, gates: [] });
  }
  // A station's entrances (named A, B, ... or not at all) go to the nearest station of their kind.
  for (const s of out.stops.filter(s => s.sub)) {
    let best = null, bd = 400;
    for (const o of byName.values()) { const d = Math.hypot(o.x - s.x, o.y - s.y); if (o.kind === s.kind && d < bd) { bd = d; best = o; } }
    best?.gates.push([s.x, s.y]);
  }
  // A TransJakarta stop is often tagged twice (platform and bus stop): keep it as TransJakarta.
  const tj = new Set([...byName.values()].filter(s => s.kind === 'tj').map(s => s.name));
  for (const [k, s] of byName) if (s.kind === 'bus' && tj.has(s.name)) byName.delete(k);
  const LIMIT = { mrt: 3, krl: 3, lrt: 2, tj: 5, bus: 4, parking: 5 };
  out.stops = Object.keys(LIMIT).flatMap(kind => [...byName.values()].filter(s => s.kind === kind)
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)).slice(0, LIMIT[kind]));
  // Keep the graph's biggest connected part, as flat arrays.
  const adj = nodes.map(() => []);
  edges.forEach(([a, b], i) => { adj[a].push(i); adj[b].push(i); });
  const comp = new Int32Array(nodes.length).fill(-1); let best = -1, bestN = 0;
  for (let s = 0, c = 0; s < nodes.length; s++) {
    if (comp[s] >= 0) continue;
    let n = 0; const st = [s]; comp[s] = c;
    while (st.length) { const u = st.pop(); n++; for (const ei of adj[u]) { const [a, b] = edges[ei], v = a === u ? b : a; if (comp[v] < 0) { comp[v] = c; st.push(v); } } }
    if (n > bestN) { bestN = n; best = c; } c++;
  }
  const remap = new Int32Array(nodes.length).fill(-1), gn = [];
  nodes.forEach((p, i) => { if (comp[i] === best) { remap[i] = gn.length / 2; gn.push(...p); } });
  const ge = [];
  for (const [a, b, w, d, n] of edges) if (remap[a] >= 0 && remap[b] >= 0) ge.push(remap[a], remap[b], w, d, n);
  out.graph = { nodes: gn, edges: ge, names };
  out.attribution = '© OpenStreetMap contributors';
  mkdirSync(OUT, { recursive: true });
  const json = JSON.stringify(out);
  writeFileSync(join(OUT, `${key}.json`), json);
  console.log(`${key}: ${(json.length / 1024).toFixed(0)} KB, ${out.buildings.length} buildings, ${gn.length / 2} walk nodes, venues: ${Object.keys(out.venues).join(', ') || 'none'}; stops: ${out.stops.map(s => `${s.kind}:${s.name}`).join(', ')}`);
}

for (const [k, d] of Object.entries(AREAS)) if (!process.argv[3] || process.argv[3] === k) bake(k, d);
