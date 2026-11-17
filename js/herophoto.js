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
// whose own small picture of the stage shows the poster too.
export const ARENA = {
  src: 'assets/hero/arena.webp', haze: 'assets/hero/arena-haze.webp',
  w: 2400, h: 2241,
  screens: [
    { kind: 'main', aspect: 30 / 13, pts: [[666, 485], [1702, 494], [1713, 940], [654, 938]] },
    { kind: 'side', aspect: 16 / 9, pts: [[33, 408], [335, 450], [335, 663], [33, 647]] },
    { kind: 'side', aspect: 16 / 9, pts: [[2020, 473], [2367, 438], [2367, 666], [2020, 677]] },
    { kind: 'phone', aspect: 2, pts: [[1104, 1289], [1209, 1291], [1209, 1343], [1102, 1343]] },
  ],
  // Rows above this one are filler painted in over the rig, soft and blurred. They are never
  // shown, so the site's header sits over the real photo.
  clear: 300,
  // The rig, for the live light: the moving heads on the top truss sweep their beams down
  // into the haze, and the lamps up the columns beside the main screen flash in turn.
  rig: {
    heads: [[680, 332], [910, 332], [1480, 340], [1712, 350]],
    columns: [
      [[630, 490], [630, 590], [630, 690], [630, 800], [630, 910]],
      [[1735, 490], [1735, 600], [1735, 700], [1735, 810], [1745, 910]],
    ],
  },
};

// The beams' colours, as on the 3D rig: warm white, amber, cool white.
const BEAM_COLORS = ['rgba(255, 244, 224, 0.85)', 'rgba(255, 215, 168, 0.85)', 'rgba(232, 238, 255, 0.85)'];

// The light layer over the photo. Each piece is placed in the photo's pixels and moved by
// CSS alone (styles.css, "live light"), so it costs no script while it runs.
function rigLayer(rig) {
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
  return `<div class="hs-fx" aria-hidden="true">${beams}${heads}${lamps}<i class="hs-wash"></i><i class="hs-wash"></i></div>`;
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

const posterSrc = meta => IMAGES[meta?.image]?.src || '';
// The part of the poster a wide screen keeps (`screen` in media.js), as fractions.
const posterFocus = meta => (IMAGES[meta?.image]?.screen || '50% 50%').split(' ').map(v => parseFloat(v) / 100);
const images = new Map();
function loadImage(src) {
  if (!images.has(src)) {
    images.set(src, new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
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
    // Each screen's poster sits under the photo, whose screens are cut out, so the truss in
    // front of a side screen stays in front; the haze over the stage, the screens' own glow
    // and the rig's moving light are added on top.
    const box = (s, pts = grow(s.pts, 3)) => { const h = Math.round(1024 / s.aspect); return `width:1024px;height:${h}px;transform:${warp(1024, h, pts)}`; };
    // The main screen's edge: a thin dark line over the cut-out's edge, which in the photo
    // is a few pixels of the screen's old blue. Nothing stands in front of it; the
    // side screens, with the truss in front, keep the photo's own black frame.
    const frame = s => (s.kind || 'main') === 'main' ? `<i class="hs-frame" style="${box(s, outset(s.pts, 5))}"></i>` : '';
    root.innerHTML = `<div class="hs-room"><div class="hs-room-in">
      ${arena.screens.map(s => `<div class="hs-scr" data-kind="${s.kind || 'main'}" style="${box(s)}"><canvas></canvas><canvas></canvas></div>`).join('')}
      <img class="hs-room-img" alt="" decoding="async">
      ${arena.screens.map(frame).join('')}
      ${arena.haze ? '<img class="hs-haze" alt="" decoding="async">' : ''}
      ${arena.clear ? `<i class="hs-ceil" style="height:${arena.clear + 10}px"></i>` : ''}
      ${arena.screens.map(s => `<div class="hs-glow" data-kind="${s.kind || 'main'}" style="${box(s)}"><canvas></canvas></div>`).join('')}
      ${rigLayer(arena.rig)}
    </div></div>`;
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
    this.root.querySelectorAll('.hs-scr').forEach((el, i) => {
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
      const scr = this.root.querySelectorAll('.hs-scr')[i];
      const [a, b] = scr.querySelectorAll('canvas');
      const next = a.classList.contains('is-on') ? b : a, prev = next === a ? b : a;
      drawPoster(next, img, s.aspect, focus);
      next.classList.add('is-on');
      prev.classList.remove('is-on');
      const glow = this.root.querySelectorAll('.hs-glow canvas')[i];
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
