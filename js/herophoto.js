// The home page hero's arena: one photo, taken from the middle of the audience, with the
// show's poster put on its three stage screens. Each screen is a canvas warped onto the
// screen's corners in the photo (a CSS matrix3d), with a soft glow of itself spilling into
// the haze, so a new slide only redraws three canvases. Replaces the 3D arena the hero used
// to build: the picture is real, it costs one image, and it never holds the page up.
import { IMAGES } from './media.js';

// The photo and where its screens are, in the photo's own pixels: corners top left, top
// right, bottom right, bottom left. `aspect` is the shape the poster is drawn at (the real
// screen's width over its height), so a screen seen at an angle still shows it undistorted.
// `kind`: the stage's main screen, a side screen, or the phone a fan holds up in front,
// whose own small picture of the stage shows the poster too. `frame`: a black edge drawn
// over the photo, as [how far it reaches outside the screen, how wide it is]. `cab`: a
// screen the photo does not have, hung in front of it (and of the truss) in a black
// cabinet of this outline, its side included.
export const ARENA = {
  // The side screens are painted out of this photo, the wall and the truss left whole, so
  // the page can hang its own lower down, clear of the header's logo and links.
  src: 'assets/hero/arena-v2.webp', haze: 'assets/hero/arena-haze.webp',
  w: 2400, h: 2241,
  screens: [
    // Its edge in the photo still has a few pixels of the screen's old blue: a hairline covers it.
    { kind: 'main', aspect: 30 / 13, frame: [5, 6], pts: [[666, 485], [1702, 494], [1713, 940], [654, 938]] },
    // Where the photo had them, 80 pixels lower, in a cabinet like the one it showed.
    { kind: 'side', aspect: 16 / 9, pts: [[33, 488], [335, 530], [335, 743], [33, 727]],
      cab: [[0, 493], [26, 481], [342, 523], [342, 750], [26, 734], [0, 718]] },
    { kind: 'side', aspect: 16 / 9, pts: [[2020, 553], [2367, 518], [2367, 746], [2020, 757]],
      cab: [[2013, 546], [2374, 511], [2399, 521], [2399, 768], [2374, 753], [2013, 764]] },
    { kind: 'phone', aspect: 2, pts: [[1104, 1289], [1209, 1291], [1209, 1343], [1102, 1343]] },
  ],
  // Rows above this one are filler painted in over the rig, soft and blurred. They are never
  // shown, so the site's header sits over the real photo.
  clear: 300,
  // The rig, for the live light: the moving heads on the top truss sweep their beams down
  // into the haze, and the lamps up the columns beside the main screen flash in turn. The
  // columns stand in front of the screen: the four lamps lit in each (all but the lowest)
  // throw their glare over its edge, as the photo shows it over the wall beside them.
  rig: {
    heads: [[680, 332], [910, 332], [1480, 340], [1712, 350]],
    columns: [
      [[634, 490], [629, 590], [626, 694], [619, 797], [630, 910]],
      [[1727, 505], [1728, 602], [1738, 704], [1742, 800], [1745, 910]],
    ],
    lit: 4,
  },
};

// The beams' colours, as on the 3D rig: warm white, amber, cool white.
const BEAM_COLORS = ['rgba(255, 244, 224, 0.85)', 'rgba(255, 215, 168, 0.85)', 'rgba(232, 238, 255, 0.85)'];

// The light layer over the photo. Each piece is placed in the photo's pixels and moved by
// CSS alone (styles.css, "live light"), so it costs no script while it runs.
function rigLayer(rig, screen) {
  if (!rig) return '';
  const n = rig.heads.length;
  // Each head points outwards from the middle and sweeps at its own pace.
  const beams = rig.heads.map(([x, y], i) => {
    const a = (0.5 - (i + 0.5) / n) * 100;
    return `<i class="hs-beam" style="left:${x}px;top:${y}px;--a:${a.toFixed(1)}deg;--c:${BEAM_COLORS[i % 3]};--d:${(7 + i * 1.3).toFixed(1)}s;--t:-${(i * 2.1).toFixed(1)}s"></i>`;
  }).join('');
  const heads = rig.heads.map(([x, y], i) => `<i class="hs-head" style="left:${x}px;top:${y}px;--t:-${(i * 0.9).toFixed(1)}s"></i>`).join('');
  const lamps = rig.columns.flatMap((col, k) => col.map(([x, y], i) =>
    `<i class="hs-lamp" style="left:${x}px;top:${y}px;--t:${(i * 0.16 + k * 0.08).toFixed(2)}s"></i>`)).join('');
  return `<div class="hs-fx" aria-hidden="true">${beams}${heads}${lamps}${glare(rig, screen)}<i class="hs-wash"></i><i class="hs-wash"></i></div>`;
}

// What sets the main screen back behind the rig, kept to the screen and its frame: the lit
// lamps' glare over it, and the haze between it and the crowd, thicker lower down.
function glare(rig, screen) {
  if (!screen || !rig.lit) return '';
  const pts = outset(screen.pts, screen.frame ? screen.frame[0] : 0), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  const clip = pts.map(([px, py]) => `${px}px ${py}px`).join(',');
  const lamps = rig.columns.flatMap(col => col.slice(0, rig.lit))
    .map(([lx, ly]) => `<i class="hs-flare" style="left:${lx}px;top:${ly}px"></i>`).join('');
  return `<div class="hs-glare" style="clip-path:polygon(${clip})">
    <i class="hs-veil" style="left:${x}px;top:${y}px;width:${Math.max(...xs) - x}px;height:${Math.max(...ys) - y}px"></i>${lamps}</div>`;
}

// The poster's own colour, for the light washing over the crowd: its average, brightened
// and kept a little warm so a grey poster still gives a stage-like light.
function posterTint(img) {
  if (!img) return '';
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
    const top = Math.max(1, ...sum);
    const [r, gr, b] = sum.map((v, i) => Math.round(255 * (0.7 * v / top) + [255, 190, 130][i] * 0.3));
    return `rgb(${r}, ${gr}, ${b})`;
  } catch { return ''; }
}

// How bright a poster may be before it is dimmed, as on the 3D screens: a light poster
// would turn the wall into a white glare against the dark hall.
const POSTER_LIGHT = 0.22;

// Phones (the flat version) draw the screens from the 640 px copy: the main screen is about
// that wide on a phone, and the full file is three times the download.
let smallPosters = false;
const posterSrc = meta => {
  const c = IMAGES[meta?.image];
  if (!c?.src) return '';
  return smallPosters && !c.w ? c.src.replace(/\.webp$/, '-640.webp') : c.src;
};
// The part of the poster a wide screen keeps (`screen` in media.js), as fractions.
const posterFocus = meta => (IMAGES[meta?.image]?.screen || '50% 50%').split(' ').map(v => parseFloat(v) / 100);
const images = new Map();
// A show's poster, fetched and decoded: drawing it then costs nothing, so its slide swaps
// at once. Resolves when it is ready (or could not be had).
export const preloadPoster = meta => { const src = posterSrc(meta); return src ? loadImage(src) : Promise.resolve(null); };
function loadImage(src) {
  if (!images.has(src)) {
    images.set(src, new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img));
      img.onerror = () => { images.delete(src); resolve(null); };
      img.src = src;
    }));
  }
  return images.get(src);
}

function meanLight(c) {
  try {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4) / 255;
  } catch { return 0; }
}

// The poster on a screen of that shape, filling it edge to edge: cropped around `focus`
// (x, y as fractions) where its shape differs from the screen's.
function drawPoster(canvas, img, aspect, [fx, fy] = [0.5, 0.5]) {
  const w = canvas.width = 1024, h = canvas.height = Math.round(1024 / aspect);
  const g = canvas.getContext('2d');
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, w, h);
  if (!img) return;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const f = Math.max(w / iw, h / ih);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, (w - iw * f) * fx, (h - ih * f) * fy, iw * f, ih * f);
  const small = document.createElement('canvas');
  small.width = 32; small.height = Math.max(8, Math.round(32 / aspect));
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  const light = meanLight(small);
  if (light > POSTER_LIGHT) {
    g.fillStyle = `rgba(0, 0, 0, ${1 - POSTER_LIGHT / light})`;
    g.fillRect(0, 0, w, h);
  }
}

// The CSS matrix3d that takes a w x h box (origin at its top left) onto four corners.
function warp(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  // Unit square to the quad (Heckbert), then the box to the unit square.
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map(v => +v.toFixed(8)).join(',')})`;
}

// Each edge moved `px` outwards (for a quad that is nearly a rectangle, as the screens are).
function outset([[x0, y0], [x1, y1], [x2, y2], [x3, y3]], px) {
  return [[x0 - px, y0 - px], [x1 + px, y1 - px], [x2 + px, y2 + px], [x3 - px, y3 + px]];
}

// Corners moved `px` away from their centre, so a poster reaches under the cut-out's soft edge.
function grow(pts, px) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / 4, cy = pts.reduce((a, p) => a + p[1], 0) / 4;
  return pts.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + (x - cx) / d * px, y + (y - cy) / d * px]; });
}

export class HeroPhoto {
  constructor(root, arena = ARENA) {
    this.root = root;
    this.arena = arena;
    this.token = null;
    root.classList.add('hs-photo');
    // A screen's poster sits under the photo, seen through its cut-out, unless the page
    // hangs the screen itself (the side screens, over the truss): then it is drawn over
    // the photo, in its cabinet. The black edges come next, then the haze over the stage,
    // the screens' own glow and the rig's moving light.
    const box = (s, pts = grow(s.pts, 3)) => { const h = Math.round(1024 / s.aspect); return `width:1024px;height:${h}px;transform:${warp(1024, h, pts)}`; };
    const kind = s => s.kind || 'main';
    const scr = (s, i) => `<div class="hs-scr" data-i="${i}" data-kind="${kind(s)}" style="${box(s)}"><canvas></canvas><canvas></canvas></div>`;
    const frame = s => {
      if (!s.frame) return '';
      // The edge's width is given in the photo's pixels; the box it is drawn in is 1024
      // wide, so its border is scaled to that box, across and down.
      const [out, width] = s.frame, pts = outset(s.pts, out), h = Math.round(1024 / s.aspect);
      const span = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
      const across = width * 1024 / ((span(pts[0], pts[1]) + span(pts[3], pts[2])) / 2);
      const down = width * h / ((span(pts[0], pts[3]) + span(pts[1], pts[2])) / 2);
      return `<i class="hs-frame" style="${box(s, pts)};border-width:${down.toFixed(1)}px ${across.toFixed(1)}px"></i>`;
    };
    const cab = s => {
      const xs = s.cab.map(p => p[0]), ys = s.cab.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys);
      const poly = s.cab.map(([px, py]) => `${px - x}px ${py - y}px`).join(',');
      return `<i class="hs-cab" style="left:${x}px;top:${y}px;width:${Math.max(...xs) - x}px;height:${Math.max(...ys) - y}px;clip-path:polygon(${poly})"></i>`;
    };
    // The screens seen through the photo's cut-outs go under it; those the page hangs, over it.
    const list = hung => arena.screens.map((s, i) => (!!s.cab === hung ? (hung ? cab(s) : '') + scr(s, i) : '')).join('');
    root.innerHTML = `<div class="hs-room"><div class="hs-room-in">
      ${list(false)}
      <img class="hs-room-img" alt="" decoding="async">
      ${list(true)}
      ${arena.screens.map(frame).join('')}
      ${arena.haze ? '<img class="hs-haze" alt="" decoding="async">' : ''}
      ${arena.clear ? `<i class="hs-ceil" style="height:${arena.clear + 10}px"></i>` : ''}
      ${arena.screens.map((s, i) => `<div class="hs-glow" data-i="${i}" data-kind="${kind(s)}" style="${box(s)}"><canvas></canvas></div>`).join('')}
      ${rigLayer(arena.rig, arena.screens.find(s => kind(s) === 'main'))}
    </div></div>`;
    // Each screen's parts, in the order of arena.screens (the page's order differs).
    this.screens = arena.screens.map((s, i) => ({
      el: root.querySelector(`.hs-scr[data-i="${i}"]`),
      glow: root.querySelector(`.hs-glow[data-i="${i}"] canvas`),
    }));
    this.room = root.querySelector('.hs-room');
    this.room.style.width = `${arena.w}px`;
    this.room.style.height = `${arena.h}px`;
    this.img = root.querySelector('.hs-room-img');
    this.haze = root.querySelector('.hs-haze');
  }

  // Resolves true once the photo is decoded and showing.
  async load() {
    this.img.src = this.arena.src;
    if (this.haze) this.haze.src = this.arena.haze;
    try { await this.img.decode(); } catch { return false; }
    this.root.classList.add('is-ready');
    return true;
  }

  // Places the photo on a w x h stage so its screens sit whole in the part the card and the
  // controls leave open (`top` to `bottom`, from the stage's top): all three on a wide
  // stage, the main one large on a narrow one. Never smaller than covering the stage, and
  // showing as little as it can of the filler above `clear`.
  layout(w, h, top = 0, bottom = h) {
    const { w: W, h: H, screens, clear = 0 } = this.arena;
    const open = Math.max(1, bottom - top);
    const box = list => {
      const xs = list.flatMap(s => s.pts.map(p => p[0])), ys = list.flatMap(s => s.pts.map(p => p[1]));
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    const wide = w / open > 1.45;
    const stage = screens.filter(s => s.kind !== 'phone');
    const b = wide ? box(stage) : box(stage.slice(0, 1));
    let s = wide ? Math.min(open * 0.84 / b.h, w * 0.96 / b.w) : Math.min(open * 0.66 / b.h, w * 0.74 / b.w);
    s = Math.max(s, w / W, h / (H - clear));
    const x = Math.min(0, Math.max(w - W * s, w / 2 - b.cx * s));
    // Lifted to hide the filler, but not so far that the main screen slips under the header
    // (on a phone): what is left of the filler then fades into the dark (.hs-ceil).
    const mainTop = Math.min(...screens[0].pts.map(p => p[1]));
    const y = Math.min(0, Math.max(h - H * s, top + open / 2 - b.cy * s), Math.max(-clear * s, top + 8 - mainTop * s));
    this.room.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(5)})`;
    // The LED grid's pitch, in each screen's own pixels: about 2.5 of the visitor's, whatever
    // the screen's size on the page, so a small or far screen shows no moiré.
    this.screens.forEach(({ el }, i) => {
      const [a, b] = screens[i].pts, perPx = Math.hypot(b[0] - a[0], b[1] - a[1]) / 1024 * s;
      el.style.setProperty('--led', `${Math.max(4, 2.5 / perPx).toFixed(1)}px`);
    });
  }

  // Draws the show's poster on every screen and fades it in over the last one. Resolves
  // false when a later call took over.
  async setPoster(meta) {
    const token = this.token = {};
    const src = posterSrc(meta);
    const img = src ? await loadImage(src) : null;
    if (this.token !== token) return false;
    const tint = posterTint(img), focus = posterFocus(meta);
    if (tint) this.root.style.setProperty('--hs-tint', tint);
    else this.root.style.removeProperty('--hs-tint');
    this.arena.screens.forEach((s, i) => {
      const scr = this.screens[i].el;
      const [a, b] = scr.querySelectorAll('canvas');
      const next = a.classList.contains('is-on') ? b : a, prev = next === a ? b : a;
      drawPoster(next, img, s.aspect, focus);
      next.classList.add('is-on');
      prev.classList.remove('is-on');
      const glow = this.screens[i].glow;
      glow.width = 128; glow.height = Math.round(128 / s.aspect);
      glow.getContext('2d').drawImage(next, 0, 0, glow.width, glow.height);
    });
    return true;
  }

  dispose() {
    this.token = null;
    this.root.classList.remove('hs-photo', 'is-ready');
    this.root.style.removeProperty('--hs-tint');
    this.root.innerHTML = '';
  }
}

// ---------------------------------------------------------------- the light version

// Phones and tablets get the same picture drawn flat into one canvas the size of the hero:
// the photo, the posters warped onto its screens, the haze over them. The full version
// above stacks dozens of layers (3D-warped screens, blend modes, filters, moving light) over
// a 2400 px photo; that costs more graphics memory than an in-app browser such as
// Instagram's gives a page, and the page was killed and reloaded until it gave up. This one
// holds two canvases of the hero's own size and nothing moves but the fade between posters.

// The point (u, v) of the unit square on the quad, as warp() maps it.
function quadPoint([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
  return (u, v) => { const k = g * u + h * v + 1; return [(a * u + b * v + x0) / k, (d * u + e * v + y0) / k]; };
}

// `src` drawn onto the quad `pts` in small affine triangles, close enough to the true
// perspective at this size. `px` is how many device pixels one photo pixel covers: a screen
// small on the phone takes fewer triangles (each one is a clip and a draw of the whole
// poster, and 8 by 8 on every screen kept a phone's CPU busy for half a second a slide).
function drawQuad(g, src, pts, px = 1) {
  const span = Math.max(...pts.map(([x, y]) => Math.hypot(x - pts[0][0], y - pts[0][1]))) * px;
  const n = Math.max(2, Math.min(8, Math.ceil(span / 90)));
  const at = quadPoint(pts), W = src.width, H = src.height;
  const tri = (s, d) => {
    // The affine map taking the source triangle s onto d.
    const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = s, [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = d;
    const den = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
    if (!den) return;
    const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / den;
    const c = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / den;
    const b = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / den;
    const dd = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / den;
    const e = dx0 - a * sx0 - c * sy0, f = dy0 - b * sx0 - dd * sy0;
    // Each triangle reaches a little past its edges, so no hairline seams show between them.
    const cx = (dx0 + dx1 + dx2) / 3, cy = (dy0 + dy1 + dy2) / 3;
    const out = ([x, y]) => { const l = Math.hypot(x - cx, y - cy) || 1; return [x + (x - cx) / l * 0.8, y + (y - cy) / l * 0.8]; };
    g.save();
    g.beginPath();
    d.map(out).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.clip();
    g.transform(a, b, c, dd, e, f);
    g.drawImage(src, 0, 0);
    g.restore();
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
      const s = [[u0 * W, v0 * H], [u1 * W, v0 * H], [u1 * W, v1 * H], [u0 * W, v1 * H]];
      const d = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
      tri([s[0], s[1], s[2]], [d[0], d[1], d[2]]);
      tri([s[0], s[2], s[3]], [d[0], d[2], d[3]]);
    }
  }
}

export class FlatHeroPhoto {
  constructor(root, arena = ARENA) {
    this.root = root;
    this.arena = arena;
    this.token = null;
    this.view = null;
    this.posters = null;
    this.tint = '';
    smallPosters = true;
    root.classList.add('hs-photo', 'hs-flat');
    root.innerHTML = '<canvas></canvas><canvas></canvas>';
    this.canvases = [...root.querySelectorAll('canvas')];
  }

  async load() {
    const [img, haze] = await Promise.all([loadImage(this.arena.src), this.arena.haze ? loadImage(this.arena.haze) : null]);
    if (!img) return false;
    this.img = img;
    this.haze = haze;
    this.draw();
    // The arena shows only once it has a poster on its screens, never as an empty frame.
    if (this.posters) this.root.classList.add('is-ready');
    return true;
  }

  // The same placing as the full version, kept to redraw with.
  layout(w, h, top = 0, bottom = h) {
    const { w: W, h: H, screens, clear = 0 } = this.arena;
    const open = Math.max(1, bottom - top);
    const box = list => {
      const xs = list.flatMap(q => q.pts.map(p => p[0])), ys = list.flatMap(q => q.pts.map(p => p[1]));
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    const wide = w / open > 1.45;
    const stage = screens.filter(q => q.kind !== 'phone');
    const b = wide ? box(stage) : box(stage.slice(0, 1));
    let s = wide ? Math.min(open * 0.84 / b.h, w * 0.96 / b.w) : Math.min(open * 0.66 / b.h, w * 0.74 / b.w);
    s = Math.max(s, w / W, h / (H - clear));
    const x = Math.min(0, Math.max(w - W * s, w / 2 - b.cx * s));
    const mainTop = Math.min(...screens[0].pts.map(p => p[1]));
    const y = Math.min(0, Math.max(h - H * s, top + open / 2 - b.cy * s), Math.max(-clear * s, top + 8 - mainTop * s));
    const key = [w, h, x, y, s].map(v => v.toFixed(2)).join();
    if (this.view?.key === key) return;
    this.view = { w, h, x, y, s, key };
    this.draw(true);
  }

  async setPoster(meta) {
    const token = this.token = {};
    const src = posterSrc(meta);
    const img = src ? await loadImage(src) : null;
    if (this.token !== token) return false;
    const focus = posterFocus(meta);
    this.tint = posterTint(img);
    if (this.tint) this.root.style.setProperty('--hs-tint', this.tint);
    else this.root.style.removeProperty('--hs-tint');
    this.posters = this.arena.screens.map(s => { const c = document.createElement('canvas'); drawPoster(c, img, s.aspect, focus); return c; });
    this.draw();
    if (this.img) this.root.classList.add('is-ready');
    return true;
  }

  // The photo and the haze at the size the canvas draws them (`px` device pixels a photo
  // pixel), scaled by the browser off the main thread. Scaling the 2400 px photo down inside
  // each draw held a phone's main thread for a quarter of a second or more. Null until the
  // first copies are ready, then the last ones made while a new size is on its way.
  scaledFor(px) {
    const w = Math.round(this.arena.w * px), h = Math.round(this.arena.h * px);
    if (this.scaled?.w === w || this.flatOnly) return this.scaled;
    if (this.scaling !== w) {
      this.scaling = w;
      const opt = { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' };
      // From the file (in the cache by now), not from the <img>: browsers decode and scale a
      // file in the background, an <img> on the main thread.
      const bitmap = src => fetch(src).then(r => (r.ok ? r.blob() : Promise.reject())).then(b => createImageBitmap(b, opt));
      Promise.all([bitmap(this.arena.src), this.arena.haze && this.haze ? bitmap(this.arena.haze) : null])
        .then(([img, haze]) => {
          if (this.scaling !== w) return;
          this.scaled = { w, img, haze };
          this.draw(!!this.canvases.find(c => c.classList.contains('is-on')));
        })
        .catch(() => { this.flatOnly = true; this.draw(); });
    }
    return this.scaled;
  }

  // Draws into the canvas not showing and fades it in; `same` redraws the one showing
  // (a resize), with no fade.
  draw(same = false) {
    const v = this.view;
    if (!v || !this.img || !this.posters || !v.w || !v.h) return;
    const on = this.canvases.find(c => c.classList.contains('is-on'));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (typeof createImageBitmap !== 'function') this.flatOnly = true;
    const scaled = this.scaledFor(dpr * v.s);
    // The first picture waits the few milliseconds for its scaled copies.
    if (!scaled && !this.flatOnly && !on) return;
    const photo = scaled?.img || this.img, haze = scaled ? scaled.haze : this.haze;
    const c = same && on ? on : this.canvases.find(x => x !== on) || this.canvases[0];
    c.width = Math.round(v.w * dpr);
    c.height = Math.round(v.h * dpr);
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0f0d0d';
    g.fillRect(0, 0, c.width, c.height);
    g.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y);
    g.imageSmoothingQuality = 'high';
    const { screens, w: W, h: H } = this.arena;
    // The screens seen through the photo's cut-outs, then the photo, then those hung in front.
    const px = dpr * v.s;
    screens.forEach((s, i) => { if (!s.cab) drawQuad(g, this.posters[i], grow(s.pts, 3), px); });
    g.drawImage(photo, 0, 0, W, H);
    screens.forEach((s, i) => {
      if (!s.cab) return;
      g.fillStyle = '#0e0e0f';
      g.beginPath();
      s.cab.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
      drawQuad(g, this.posters[i], grow(s.pts, 3), px);
    });
    screens.forEach(s => {
      if (!s.frame) return;
      const pts = outset(s.pts, s.frame[0]);
      g.strokeStyle = '#0b0b0c';
      g.lineWidth = s.frame[1];
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.stroke();
    });
    g.globalCompositeOperation = 'screen';
    if (haze) { g.globalAlpha = 0.85; g.drawImage(haze, 0, 0, W, H); }
    // The main screen's light spilling into the haze, in the poster's colour.
    const m = screens[0].pts, cx = m.reduce((a, p) => a + p[0], 0) / 4, cy = m.reduce((a, p) => a + p[1], 0) / 4;
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, 900);
    const tint = (this.tint || 'rgb(255, 176, 112)').replace('rgb(', 'rgba(').replace(')', ', ');
    glow.addColorStop(0, `${tint}0.22)`);
    glow.addColorStop(1, `${tint}0)`);
    g.globalAlpha = 1;
    g.fillStyle = glow;
    g.fillRect(cx - 900, cy - 900, 1800, 1800);
    g.globalCompositeOperation = 'source-over';
    // The new picture fades in over the old one, which stays fully drawn underneath until
    // the fade is over: never two half-faded pictures, so nothing of the old slide lingers.
    if (c !== on) {
      c.classList.remove('is-prev');
      on?.classList.replace('is-on', 'is-prev');
      c.classList.add('is-on');
      clearTimeout(this.fading);
      this.fading = setTimeout(() => this.canvases.forEach(x => x.classList.remove('is-prev')), 600);
    }
  }

  dispose() {
    this.token = null;
    this.root.classList.remove('hs-photo', 'hs-flat', 'is-ready');
    this.root.style.removeProperty('--hs-tint');
    this.root.innerHTML = '';
  }
}
