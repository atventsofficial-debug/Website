// The walk from a stop to a venue (Getting there, 3D Pass Plus), on the walking graph baked
// from OpenStreetMap (scripts/bake-maps.mjs): footways, streets and service roads, each edge
// with its cost (metres, a little more along big roads) and its street name.
// One search runs out from the venue's doors to every corner of the area, so every stop's
// walk is read off it at once. Pure: no DOM, tested in test/walk.test.mjs.

export const WALK_M_PER_MIN = 75;   // 4.5 km/h, an easy pace in a crowd
export const minutesFor = metres => Math.max(1, Math.round(metres / WALK_M_PER_MIN));

export function makeGraph({ nodes, edges, names = [''] }) {
  const n = nodes.length / 2, m = edges.length / 5;
  const x = new Float32Array(n), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = nodes[2 * i]; y[i] = nodes[2 * i + 1]; }
  const deg = new Int32Array(n + 1);
  for (let e = 0; e < m; e++) { deg[edges[5 * e] + 1]++; deg[edges[5 * e + 1] + 1]++; }
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const head = deg.slice(), fill = deg.slice(0, n);
  const to = new Int32Array(2 * m), w = new Float32Array(2 * m), d = new Float32Array(2 * m), nm = new Int32Array(2 * m);
  for (let e = 0; e < m; e++) {
    const [a, b, cw, cd, cn] = [edges[5 * e], edges[5 * e + 1], edges[5 * e + 2], edges[5 * e + 3], edges[5 * e + 4]];
    for (const [u, v] of [[a, b], [b, a]]) { const k = fill[u]++; to[k] = v; w[k] = cw; d[k] = cd; nm[k] = cn; }
  }
  // A 50 m grid for nearest-node lookups.
  const CELL = 50, grid = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.floor(x[i] / CELL)},${Math.floor(y[i] / CELL)}`;
    (grid.get(key) || grid.set(key, []).get(key)).push(i);
  }
  return { n, x, y, head, to, w, d, nm, names, grid, CELL };
}

// Nodes within r metres of (px, py), nearest first; at least the nearest one there is.
export function nearNodes(G, px, py, r = 40) {
  const out = [];
  for (let reach = r; reach <= 1600 && !out.length; reach *= 2) {
    const c0 = Math.floor((px - reach) / G.CELL), c1 = Math.floor((px + reach) / G.CELL);
    const r0 = Math.floor((py - reach) / G.CELL), r1 = Math.floor((py + reach) / G.CELL);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      for (const i of G.grid.get(`${cx},${cy}`) || []) {
        const dist = Math.hypot(G.x[i] - px, G.y[i] - py);
        if (dist <= reach) out.push([i, dist]);
      }
    }
  }
  return out.sort((a, b) => a[1] - b[1]);
}

// The graph's nodes at a venue's doors: those within reach of its outline (x, y pairs).
export function doorsOf(G, ring, reach = 30) {
  const doors = new Map();
  const k = ring.length / 2;
  for (let i = 0; i < k; i++) {
    const ax = ring[2 * i], ay = ring[2 * i + 1], bx = ring[2 * ((i + 1) % k)], by = ring[2 * ((i + 1) % k) + 1];
    const L = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(L / 15));
    for (let s = 0; s <= steps; s++) {
      const px = ax + (bx - ax) * s / steps, py = ay + (by - ay) * s / steps;
      for (const [node, dist] of nearNodes(G, px, py, reach)) if (dist <= reach && !(doors.get(node) <= dist)) doors.set(node, dist);
    }
  }
  if (!doors.size) { const c = centroid(ring); for (const [node, dist] of nearNodes(G, c[0], c[1], 60).slice(0, 3)) doors.set(node, dist); }
  return [...doors];
}

export const centroid = ring => {
  let sx = 0, sy = 0; const k = ring.length / 2;
  for (let i = 0; i < k; i++) { sx += ring[2 * i]; sy += ring[2 * i + 1]; }
  return [sx / k, sy / k];
};

// Cost from the venue's doors to every node (Dijkstra, many sources), and the way back.
export function fromDoors(G, doors) {
  const cost = new Float64Array(G.n).fill(Infinity), via = new Int32Array(G.n).fill(-1), prev = new Int32Array(G.n).fill(-1);
  const heap = [];   // [cost, node], a binary heap
  const push = (c, v) => { heap.push([c, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; }
    }
    return top;
  };
  for (const [node, dist] of doors) if (dist < cost[node]) { cost[node] = dist; push(dist, node); }
  while (heap.length) {
    const [c, u] = pop();
    if (c > cost[u]) continue;
    for (let k = G.head[u]; k < G.head[u + 1]; k++) {
      const v = G.to[k], nc = c + G.w[k];
      if (nc < cost[v]) { cost[v] = nc; via[v] = k; prev[v] = u; push(nc, v); }
    }
  }
  return { cost, via, prev };
}

// The walk from a point (a stop, or one of its entrances) to the venue: the points along
// it, its length in metres and its legs by street. `from`: [[x, y], ...] the ways out of the stop.
export function walkFrom(G, field, from) {
  let best = null;
  for (const [px, py] of from) {
    for (const [node, dist] of nearNodes(G, px, py, 80).slice(0, 12)) {
      const c = field.cost[node] + dist * 1.2;
      if (Number.isFinite(c) && (!best || c < best.c)) best = { c, node, px, py, dist };
    }
  }
  if (!best) return null;
  const pts = [[best.px, best.py], [G.x[best.node], G.y[best.node]]];
  let metres = best.dist;
  const legs = [];
  const leg = (name, m) => { const last = legs[legs.length - 1]; if (last && last.name === name) last.metres += m; else legs.push({ name, metres: m }); };
  let u = best.node;
  for (let guard = 0; field.prev[u] >= 0 && guard < G.n; guard++) {
    const k = field.via[u];
    metres += G.d[k];
    leg(G.names[G.nm[k]] || '', G.d[k]);
    u = field.prev[u];
    pts.push([G.x[u], G.y[u]]);
  }
  // Short unnamed bits fold into their neighbours, so the legs read as a few steps.
  const tidy = [];
  for (const l of legs) {
    const last = tidy[tidy.length - 1];
    if (last && (l.metres < 40 || (!l.name && last.name === ''))) last.metres += l.metres;
    else if (last && last.metres < 40 && !last.name) { last.name = l.name; last.metres += l.metres; }
    else tidy.push({ ...l });
  }
  for (const l of tidy) l.metres = Math.round(l.metres);
  return { pts, metres: Math.round(metres), minutes: minutesFor(metres), legs: tidy.filter(l => l.metres >= 10) };
}
