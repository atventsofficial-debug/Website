// Getting there, on the map (3D Pass Plus). The venue's neighbourhood drawn in Atvents' own
// night palette from OpenStreetMap (assets/maps/<area>.json, scripts/bake-maps.mjs): warm
// dark blocks with a lit edge, streets by weight, green, water and rail. Opening it pulls
// back from the venue to the streets round it. The stops (MRT, KRL, TransJakarta, bus,
// parking) sit on it as pins; with one picked the city dims and the walk to the venue's
// nearest door lights up in coral, a spark running along it to the venue.
// Map data © OpenStreetMap contributors (ODbL), credited on the map.
import { makeGraph, doorsOf, fromDoors, walkFrom, centroid } from './walk.js';
import { esc } from './ui.js';

const AREA_OF = {
  'Gelora Bung Karno Main Stadium': 'gbk', 'Stadion Madya GBK': 'gbk', 'Indonesia Arena': 'gbk',
  'Istora Senayan GBK': 'gbk', 'Basket Hall GBK': 'gbk', 'Tennis Indoor GBK': 'gbk',
  'Jakarta International Stadium': 'jis', 'JIExpo Kemayoran': 'jiexpo',
  'ICE BSD City, Hall 5–6': 'icebsd', 'Graha UNESA': 'unesa',
};
export const mapAreaOf = place => AREA_OF[place] || null;

export const KINDS = [
  ['mrt', 'MRT', 'M'], ['krl', 'KRL', 'K'], ['lrt', 'LRT', 'L'],
  ['tj', 'TransJakarta', 'TJ'], ['bus', 'Bus', 'B'], ['parking', 'Parking', 'P'],
];
const KIND = Object.fromEntries(KINDS.map(([k, label, badge]) => [k, { label, badge }]));

// The palette: Atvents' night, not a street map's day.
const C = {
  ground: '#110e0d', green: '#18201a', water: '#0e1a21', park: '#1a1615',
  road: { foot: '#2a2320', service: '#2d2623', street: '#3a312c', main: '#54463d', major: '#6a574b' },
  rail: '#7a6658', block: '#231d1b', blockTall: '#2b2321', blockEdge: '#3b302c', shade: '#0b0908',
  venue: '#3b211d', coral: '#ec5446', coral2: '#ff7d6b',
};

// ---------------------------------------------------------------- the area

const areas = new Map();
export function loadArea(key) {
  if (!areas.has(key)) {
    areas.set(key, fetch(`assets/maps/${key}.json`)
      .then(r => { if (!r.ok) throw new Error(`map ${key}: ${r.status}`); return r.json(); })
      .then(prep)
      .catch(err => { areas.delete(key); throw err; }));
  }
  return areas.get(key);
}

function ringPath(arr, from = 0) {
  const p = new Path2D();
  p.moveTo(arr[from], arr[from + 1]);
  for (let i = from + 2; i < arr.length; i += 2) p.lineTo(arr[i], arr[i + 1]);
  p.closePath();
  return p;
}
function linePath(lines) {
  const p = new Path2D();
  for (const l of lines) { p.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) p.lineTo(l[i], l[i + 1]); }
  return p;
}

function prep(A) {
  const low = new Path2D(), tall = new Path2D();
  for (const b of A.buildings) (b[0] >= 18 ? tall : low).addPath(ringPath(b, 1));
  const polys = list => { const p = new Path2D(); for (const r of list) p.addPath(ringPath(r)); return p; };
  const G = makeGraph(A.graph);
  const venues = Object.fromEntries(Object.entries(A.venues).map(([place, v]) => [place, { ...v, path: ringPath(v.ring), c: centroid(v.ring) }]));
  return {
    ...A, G, venues, fields: new Map(),
    paths: {
      low, tall, green: polys(A.green), water: polys(A.water), park: polys(A.parking),
      rivers: linePath(A.rivers), rail: linePath(A.rail),
      roads: Object.fromEntries(Object.entries(A.roads).map(([k, v]) => [k, linePath(v)])),
    },
  };
}

// Every stop's walk to a venue, nearest first (one search from the venue's doors).
export function walksTo(A, place) {
  const v = A.venues[place];
  if (!v) return [];
  if (!A.fields.has(place)) A.fields.set(place, fromDoors(A.G, doorsOf(A.G, v.ring)));
  const field = A.fields.get(place);
  return A.stops.map((s, i) => ({ ...s, id: i, walk: walkFrom(A.G, field, [[s.x, s.y], ...(s.gates || [])]) }))
    .filter(s => s.walk).sort((a, b) => a.walk.metres - b.walk.metres);
}

// ---------------------------------------------------------------- the view

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class CityMap {
  constructor(host, { onPick } = {}) {
    this.host = host;
    this.onPick = onPick;
    this.el = document.createElement('div');
    this.el.className = 'citymap';
    this.el.hidden = true;
    this.el.innerHTML = `<canvas class="cm-canvas" aria-hidden="true"></canvas>
      <div class="cm-pins"></div>
      <div class="cm-zoom"><button class="sq sq-sm" type="button" data-cm="in" aria-label="Zoom in"><svg><use href="#i-plus"/></svg></button><button class="sq sq-sm" type="button" data-cm="out" aria-label="Zoom out"><svg><use href="#i-minus"/></svg></button></div>
      <p class="cm-attr">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</p>`;
    host.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.pins = this.el.querySelector('.cm-pins');
    this.base = document.createElement('canvas');
    this.view = { x: 0, y: 0, s: 1 };
    this.route = null;
    this.dirty = true;
    this._frame = this._frame.bind(this);
    this._bind();
    this.ro = new ResizeObserver(() => { this._size(); this.dirty = true; });
    this.ro.observe(this.el);
  }

  // Opens on an area and a venue: from the venue filling the screen, back to the streets.
  async open(key, place) {
    this.area = await loadArea(key);
    this.place = place;
    this.venue = this.area.venues[place] || null;
    this.walks = walksTo(this.area, place);
    this.route = null;
    this.el.hidden = false;
    this._size();
    const c = this.venue ? this.venue.c : [0, 0];
    const span = this.venue ? this._span(this.venue.ring) : 200;
    const W = this.W, H = this.H, room = Math.min(W - this.inset.right, H - this.inset.bottom);
    const from = { x: c[0], y: c[1], s: (room * 0.95) / span };
    const to = this._fitAround(c, Math.max(420, ...this.walks.slice(0, 6).map(s => Math.hypot(s.x - c[0], s.y - c[1]) * 1.3)));
    this.view = { ...from };
    this._pinsBuild();
    this.el.classList.remove('is-in');
    requestAnimationFrame(() => this.el.classList.add('is-in'));
    this.flyTo(to, still() ? 0 : 1700);
    this._loop(true);
  }

  close() {
    this.el.hidden = true;
    this.el.classList.remove('is-in');
    this.route = null;
    this._loop(false);
  }

  // The space the panel takes (right on a wide screen, below on a phone), kept clear.
  setInset(inset) { this.inset = inset; this.dirty = true; }

  // Picks a stop (by its id in walks) or none: the city dims, the walk lights up.
  pick(id) {
    const s = this.walks?.find(w => w.id === id) || null;
    this.route = s ? { stop: s, pts: s.walk.pts, len: this._len(s.walk.pts), t0: performance.now() } : null;
    this.dirty = true;
    this._pinsPaint();
    if (s) {
      // The whole walk, the stop itself and the venue in view.
      const xs = [s.x, ...s.walk.pts.map(p => p[0])], ys = [s.y, ...s.walk.pts.map(p => p[1])];
      if (this.venue) this.venue.ring.forEach((v, i) => (i % 2 ? ys : xs).push(v));
      this.flyTo(this._fitBox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)), still() ? 0 : 900);
    }
  }

  flyTo(to, ms) {
    const from = { ...this.view };
    if (!ms) { this.view = { ...to }; this.anim = null; this.dirty = true; return; }
    // Zoom in a logarithmic blend, so it pulls back at an even rate.
    this.anim = { from, to, t0: performance.now(), ms };
  }

  dispose() { this.close(); this.ro.disconnect(); this.el.remove(); }

  // ---------- geometry

  _size() {
    const r = this.el.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height); this.dpr = dpr;
    for (const c of [this.canvas, this.base]) { c.width = Math.round(this.W * dpr); c.height = Math.round(this.H * dpr); }
    this.canvas.style.width = `${this.W}px`; this.canvas.style.height = `${this.H}px`;
    this.inset ||= { right: 0, bottom: 0 };
  }
  _span(ring) { const xs = ring.filter((_, i) => i % 2 === 0), ys = ring.filter((_, i) => i % 2); return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); }
  _len(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
  // The view centred on the clear part of the screen.
  _centreFor(cx, cy, s) { return { x: cx + this.inset.right / 2 / s, y: cy + this.inset.bottom / 2 / s, s }; }
  _fitAround(c, r) { const room = Math.min(this.W - this.inset.right, this.H - this.inset.bottom) - 48; return this._centreFor(c[0], c[1], Math.max(0.08, room / (2 * r))); }
  _fitBox(x0, y0, x1, y1) {
    // Room for the pins' names, which hang to the right of their points.
    const pad = Math.min(96, this.W * 0.14), label = Math.min(130, this.W * 0.2), w = Math.max(60, x1 - x0), h = Math.max(60, y1 - y0);
    const s = Math.max(0.08, Math.min((this.W - this.inset.right - 2 * pad - label) / w, (this.H - this.inset.bottom - 2 * pad) / h, 4));
    const v = this._centreFor((x0 + x1) / 2, (y0 + y1) / 2, s);
    v.x += label / 2 / s;
    return v;
  }
  toScreen(x, y) { const v = this.view; return [(x - v.x) * v.s + this.W / 2, (y - v.y) * v.s + this.H / 2]; }
  toWorld(px, py) { const v = this.view; return [(px - this.W / 2) / v.s + v.x, (py - this.H / 2) / v.s + v.y]; }
  _clamp() {
    const v = this.view, R = this.area?.r || 1500;
    v.s = Math.min(6, Math.max(0.08, v.s));
    v.x = Math.max(-R, Math.min(R, v.x)); v.y = Math.max(-R, Math.min(R, v.y));
  }

  // ---------- input

  _bind() {
    const ptrs = new Map();
    let last = null;
    this.el.addEventListener('pointerdown', e => {
      if (e.target.closest('button, a')) return;
      this.el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      this.anim = null;
      last = null;
    });
    this.el.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      const pts = [...ptrs.values()];
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const spread = pts.length > 1 ? Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) : 0;
      if (last && last.n === pts.length) {
        const v = this.view;
        if (spread && last.spread) this._zoomAt(cx, cy, spread / last.spread);
        v.x -= (cx - last.cx) / v.s; v.y -= (cy - last.cy) / v.s;
        this._clamp(); this.dirty = true;
      }
      last = { cx, cy, spread, n: pts.length };
    });
    const up = e => { ptrs.delete(e.pointerId); last = null; };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    this.el.addEventListener('wheel', e => {
      e.preventDefault();
      this.anim = null;
      this._zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016));
    }, { passive: false });
    this.el.addEventListener('click', e => {
      const z = e.target.closest('[data-cm]')?.dataset.cm;
      if (z) { const r = this.el.getBoundingClientRect(); this._zoomAt(r.left + (this.W - this.inset.right) / 2, r.top + (this.H - this.inset.bottom) / 2, z === 'in' ? 1.6 : 1 / 1.6, true); return; }
      const pin = e.target.closest('[data-stop]');
      if (pin) this.onPick?.(+pin.dataset.stop);
    });
  }
  _zoomAt(clientX, clientY, k, animate = false) {
    const r = this.el.getBoundingClientRect(), px = clientX - r.left, py = clientY - r.top;
    const [wx, wy] = this.toWorld(px, py), v = this.view;
    const s = Math.min(6, Math.max(0.08, v.s * k));
    const to = { s, x: wx - (px - this.W / 2) / s, y: wy - (py - this.H / 2) / s };
    if (animate && !still()) this.flyTo(to, 320); else { this.view = to; this._clamp(); this.dirty = true; }
  }

  // ---------- pins

  _pinsBuild() {
    const near = new Set();
    // The nearest few of each kind; the rest stay off the map to keep it calm.
    for (const [k] of KINDS) this.walks.filter(s => s.kind === k).slice(0, k === 'tj' || k === 'bus' ? 3 : 2).forEach(s => near.add(s.id));
    this.shown = this.walks.filter(s => near.has(s.id));
    const others = Object.entries(this.area.venues).filter(([p]) => p !== this.place);
    this.pins.innerHTML = this.shown.map(s => `<button class="cm-pin" type="button" data-stop="${s.id}" data-kind="${s.kind}"><b>${esc(KIND[s.kind].badge)}</b><span>${esc(s.name)}</span></button>`).join('')
      + (this.venue ? `<span class="cm-venue is-main"><i></i><span>${esc(this.place)}</span></span>` : '')
      + others.map(([p]) => `<span class="cm-venue" data-place="${esc(p)}"><span>${esc(p)}</span></span>`).join('');
    this._pinsPaint();
  }
  _pinsPaint() {
    const id = this.route?.stop.id;
    this.pins.classList.toggle('has-route', id != null);
    this.pins.querySelectorAll('.cm-pin').forEach(b => { const on = +b.dataset.stop === id; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
  }
  _pinsPlace() {
    for (const b of this.pins.querySelectorAll('.cm-pin')) {
      const s = this.walks.find(w => w.id === +b.dataset.stop);
      const [x, y] = this.toScreen(s.x, s.y);
      b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    const main = this.pins.querySelector('.cm-venue.is-main');
    if (main && this.venue) { const [x, y] = this.toScreen(...this.venue.c); main.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
    for (const el of this.pins.querySelectorAll('.cm-venue[data-place]')) {
      const v = this.area.venues[el.dataset.place], [x, y] = this.toScreen(...v.c);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.hidden = this.view.s < 0.5;
    }
  }

  // ---------- drawing

  _loop(on) {
    cancelAnimationFrame(this.raf);
    if (on) this.raf = requestAnimationFrame(this._frame);
  }
  _frame(now) {
    if (this.el.hidden) return;
    if (this.anim) {
      const { from, to, t0, ms } = this.anim, u = Math.min(1, (now - t0) / ms), e = ease(u);
      const ls = Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * e;
      this.view = { s: Math.exp(ls), x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      this.dirty = true;
      if (u >= 1) this.anim = null;
    }
    if (this.dirty) { this._drawBase(); this._pinsPlace(); this.dirty = false; }
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.base, 0, 0);
    if (this.route) this._drawRoute(now);
    else if (this.venue) this._drawPulse(now);
    this.raf = requestAnimationFrame(this._frame);
  }

  _world(c) {
    const v = this.view, d = this.dpr;
    c.setTransform(v.s * d, 0, 0, v.s * d, (this.W / 2 - v.x * v.s) * d, (this.H / 2 - v.y * v.s) * d);
  }

  _drawBase() {
    const c = this.base.getContext('2d'), A = this.area, P = A.paths, v = this.view, px = 1 / v.s;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = C.ground; c.fillRect(0, 0, this.base.width, this.base.height);
    this._world(c);
    c.fillStyle = C.green; c.fill(P.green);
    c.fillStyle = C.park; c.fill(P.park);
    c.fillStyle = C.water; c.fill(P.water);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = C.water; c.lineWidth = Math.max(4, 3 * px); c.stroke(P.rivers);
    // Streets by weight, wider as you come in, never thinner than a hairline.
    const road = (k, metres, minPx) => { c.strokeStyle = C.road[k]; c.lineWidth = Math.max(metres, minPx * px); c.stroke(P.roads[k]); };
    road('foot', 2, 0.6); road('service', 4, 0.8); road('street', 7, 1.1); road('main', 13, 1.8); road('major', 18, 2.4);
    c.setLineDash([6 * px, 6 * px]); c.strokeStyle = C.rail; c.lineWidth = Math.max(2, 1.4 * px); c.stroke(P.rail); c.setLineDash([]);
    // Blocks: a shadow to the south-east, then the roof with a lit edge. Taller ones cast more.
    const shade = (path, m) => { c.save(); c.translate(m, m * 1.2); c.fillStyle = C.shade; c.fill(path); c.restore(); };
    if (v.s > 0.22) { shade(P.low, Math.max(1.5, 2 * px)); shade(P.tall, Math.max(4, 3 * px)); }
    c.fillStyle = C.block; c.fill(P.low);
    c.fillStyle = C.blockTall; c.fill(P.tall);
    if (v.s > 0.6) { c.strokeStyle = C.blockEdge; c.lineWidth = 0.8 * px; c.stroke(P.low); c.stroke(P.tall); }
    // The other venues of the area, faint; this one in coral.
    for (const [p, ven] of Object.entries(A.venues)) {
      const me = p === this.place;
      c.fillStyle = me ? C.venue : '#2a1e1b'; c.fill(ven.path);
      c.strokeStyle = me ? C.coral : 'rgba(236, 84, 70, 0.35)'; c.lineWidth = (me ? 2.2 : 1.2) * px; c.stroke(ven.path);
    }
    // With a route: the city dims, apart from a soft corridor round the walk.
    if (this.route) {
      const veil = this._veil ||= document.createElement('canvas');
      veil.width = this.base.width; veil.height = this.base.height;
      const g = veil.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = 'rgba(6, 4, 4, 0.6)'; g.fillRect(0, 0, veil.width, veil.height);
      g.globalCompositeOperation = 'destination-out';
      this._world(g);
      g.filter = `blur(${Math.round(26 * this.dpr)}px)`;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = '#000'; g.lineWidth = Math.max(90, 80 * px);
      g.stroke(this._routePath());
      if (this.venue) { g.fillStyle = '#000'; g.fill(this.venue.path); }
      g.filter = 'none'; g.globalCompositeOperation = 'source-over';
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(veil, 0, 0);
      this._world(c);
      if (this.venue) { c.strokeStyle = C.coral; c.lineWidth = 2.2 * px; c.stroke(this.venue.path); }
    }
  }

  _routePath() {
    if (this.route._path) return this.route._path;
    const p = new Path2D(), pts = this.route.pts;
    p.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) p.lineTo(...pts[i]);
    return (this.route._path = p);
  }

  _drawRoute(now) {
    const c = this.ctx, px = 1 / this.view.s, path = this._routePath(), r = this.route;
    this._world(c);
    c.lineCap = 'round'; c.lineJoin = 'round';
    // Drawn in, then glowing: a wide soft coral, a brighter core, a white thread.
    const grow = still() ? 1 : Math.min(1, (now - r.t0) / 900);
    const L = r.len;
    c.setLineDash([L * grow, L]);
    c.save(); c.shadowColor = 'rgba(236, 84, 70, 0.9)'; c.shadowBlur = 22 * this.dpr;
    c.strokeStyle = 'rgba(236, 84, 70, 0.55)'; c.lineWidth = 11 * px; c.stroke(path); c.restore();
    c.strokeStyle = C.coral2; c.lineWidth = 4.5 * px; c.stroke(path);
    c.strokeStyle = 'rgba(255, 255, 255, 0.9)'; c.lineWidth = 1.4 * px; c.stroke(path);
    c.setLineDash([]);
    // A spark walking it, stop to door, every few seconds.
    if (grow >= 1) {
      const t = ((now - r.t0 - 900) / 1000 / Math.max(2.4, Math.min(6, L / 140))) % 1;
      const at = this._along(t * L);
      c.save(); c.shadowColor = '#fff'; c.shadowBlur = 16 * this.dpr;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(at[0], at[1], 4.2 * px, 0, Math.PI * 2); c.fill(); c.restore();
    }
    // Out of the station by its nearest exit: a dotted line from the platform to it.
    if (Math.hypot(r.stop.x - r.pts[0][0], r.stop.y - r.pts[0][1]) > 8) {
      c.setLineDash([3 * px, 5 * px]); c.strokeStyle = 'rgba(255, 255, 255, 0.7)'; c.lineWidth = 1.6 * px;
      c.beginPath(); c.moveTo(r.stop.x, r.stop.y); c.lineTo(...r.pts[0]); c.stroke(); c.setLineDash([]);
    }
    // The stop: a ring; the door: a pulse.
    const [sx, sy] = r.pts[0], [dx, dy] = r.pts[r.pts.length - 1], k = (now / 1000) % 1.4 / 1.4;
    c.strokeStyle = '#fff'; c.lineWidth = 2 * px; c.beginPath(); c.arc(sx, sy, 9 * px, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = `rgba(255, 125, 107, ${1 - k})`; c.lineWidth = 2.4 * px; c.beginPath(); c.arc(dx, dy, (6 + 22 * k) * px, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(dx, dy, 4.5 * px, 0, Math.PI * 2); c.fill();
  }

  _drawPulse(now) {
    const c = this.ctx, px = 1 / this.view.s, [x, y] = this.venue.c, k = (now / 1000) % 1.8 / 1.8;
    this._world(c);
    c.strokeStyle = `rgba(236, 84, 70, ${0.8 * (1 - k)})`; c.lineWidth = 2 * px;
    c.beginPath(); c.arc(x, y, this._span(this.venue.ring) * 0.55 + (40 * k) * px, 0, Math.PI * 2); c.stroke();
  }

  _along(d) {
    const pts = this.route.pts;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d <= seg) { const f = seg ? d / seg : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; }
      d -= seg;
    }
    return pts[pts.length - 1];
  }
}
