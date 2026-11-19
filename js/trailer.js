// The story as a trailer of the show, cut like an event flyer in motion: 17.4 seconds on the
// track's 100 bpm grid. The official poster with the date, the venue and the promoter; then
// the act's face from their poster (or, where it has none, their name set in type on the
// show's colours) with who they are and the tour; the glass cracking on the music's break and
// falling away to the view from the fan's own seat with its block, row and seat; and the
// Atvents logo coming together as it does when the site opens.
//
// Only facts go on it: the act, the tour, the date, the venue, the promoter, the seat. No
// slogans. Colours come from the show's theme (themes.js). Text is only ever paper or ink: on
// a colour it takes whichever of the two reads better on it (inkOn), and it never sits in the
// accent straight on a picture. Type is the brand's Archivo, at its widest, and JetBrains Mono.
//
// paint() draws one frame at time `t` (ms) onto a 720 x 1280 canvas; `kit` holds the
// pictures, made once by makeKit(), and `seat` is the view from the seat at that moment (the
// live 3D canvas in the page, a rendered frame in a preview).
import { logoMotion } from './logomotion.js';

export const W = 720, H = 1280;
export const BEAT = 600;            // the track's 100 bpm
// The sections, in ms: in on the drop, the glass on the break (beat 15), the seat when the
// music comes back (16), the logo on the last hit (24).
export const T = { s1: 0, s2: 8 * BEAT, crack: 15 * BEAT, s3: 16 * BEAT, end: 24 * BEAT };
export const LENGTH = 29 * BEAT;    // 17.4 s

const EXP = '"Atvents Expanded", "Archivo", "Arial Black", sans-serif';
const MONO = '"Atvents Mono", "JetBrains Mono", ui-monospace, Menlo, monospace';
export const INK = '#0b0a0a', PAPER = '#f6f2ee';
const AMBER = '#ff9a3c';
const LOGO_AR = 4724 / 900;

// ---------------------------------------------------------------- colour

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = h => {
  const [r, g, b] = hex(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Ink or paper, whichever reads better on `bg`.
export const inkOn = bg => (contrast(bg, INK) >= contrast(bg, PAPER) ? INK : PAPER);

// ---------------------------------------------------------------- the kit

// The official poster whole, as the promoter made it; the act's face where the poster has
// one (`photo`: { img, box }, see artists.js), cut to it; a field of the poster's colours,
// blurred past reading and put in the show's duotone; the field as an LED wall; and a crowd's
// silhouettes.
export function makeKit({ poster, photo, logo, theme }) {
  const dark = theme?.screen?.a || '#0a0a0a', accent = theme?.band || '#ec5446';
  const pic = photo?.img ? picOf(photo.img, photo.box) : null;
  const field = mapped(blurred(poster || photo?.img), duoMap(dark, accent, PAPER, 0.62));
  // A light show colour is dimmed behind the type, so paper still reads on it.
  const veil = Math.min(0.55, Math.max(0, (lum(accent) - 0.12) * 1.4));
  if (veil) { const g = field.getContext('2d'); g.fillStyle = `rgba(0,0,0,${veil})`; g.fillRect(0, 0, W, H); }
  return { field, led: ledOf(field), crowd: crowdOf(), panel: panelOf(poster), pic, logo, accent, dark, onAccent: inkOn(accent) };
}

// The poster at its own shape, 720 px across at most (and 960 tall).
function panelOf(img) {
  if (!img) return null;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.min(720 / iw, 960 / ih), w = Math.round(iw * k), h = Math.round(ih * k);
  const c = canvas(w, h), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  return c;
}


// The part of the poster with the act's face, 1040 px tall (and room either side to move).
function picOf(img, box = [0, 0, 1, 1]) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const bx = box[0] * iw, by = box[1] * ih, bw = (box[2] - box[0]) * iw, bh = (box[3] - box[1]) * ih;
  const k = Math.max(1040 / bh, W * 1.2 / bw), w = Math.round(bw * k), h = Math.round(bh * k);
  // A dark photo brought up to a common brightness, so the act can be seen under the type.
  const probe = canvas(32, 32), pg = probe.getContext('2d');
  pg.drawImage(img, bx, by, bw, bh, 0, 0, 32, 32);
  const px = pg.getImageData(0, 0, 32, 32).data;
  let sum = 0; for (let i = 0; i < px.length; i += 4) sum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
  const lift = Math.min(1.9, Math.max(1, 0.42 / (sum / 1024 || 1)));
  const color = canvas(w, h), g = color.getContext('2d');
  g.imageSmoothingQuality = 'high';
  if (lift > 1.02) g.filter = `brightness(${lift.toFixed(2)}) contrast(1.06)`;
  g.drawImage(img, bx, by, bw, bh, 0, 0, w, h);
  return { color };
}

function canvas(w = W, h = H) { return Object.assign(document.createElement('canvas'), { width: w, height: h }); }
function blurred(img) {
  const c = canvas(), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (!img) return c;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.max(W / iw, H / ih) * 1.4;
  g.filter = 'blur(38px)';
  g.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
  return c;
}
function mapped(src, map, w = W, h = H) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
    const [r, gg, b] = map(l);
    p[i] = r; p[i + 1] = gg; p[i + 2] = b;
  }
  g.putImageData(d, 0, 0);
  return c;
}

// Shadows to the show's dark, mids to its accent, highlights towards paper; contrast pushed.
function duoMap(dark, accent, light, top = 1) {
  const a = hex(dark), b = hex(accent), c = hex(light);
  return l => {
    const x = Math.min(top, Math.max(0, (l - 0.08) * 1.35));
    const s = x < 0.55 ? x / 0.55 : (x - 0.55) / 0.45, p = x < 0.55 ? a : b, q = x < 0.55 ? b : c;
    return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s, p[2] + (q[2] - p[2]) * s];
  };
}
// The field as an LED wall: one lamp per 12 px, brightest at the top, gone by the middle.
function ledOf(src) {
  const cols = 60, cell = W / cols, rows = Math.ceil(H / cell);
  const s = canvas(cols, rows), sg = s.getContext('2d');
  sg.drawImage(src, 0, 0, cols, rows);
  const px = sg.getImageData(0, 0, cols, rows).data;
  const c = canvas(), g = c.getContext('2d');
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4, k = 2.2, f = v => Math.min(255, Math.round(v * k + 14));
    g.fillStyle = `rgb(${f(px[i])},${f(px[i + 1])},${f(px[i + 2])})`;
    g.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
  }
  g.globalCompositeOperation = 'destination-in';
  const m = g.createLinearGradient(0, 0, 0, H);
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.25, 'rgba(0,0,0,0.8)'); m.addColorStop(0.6, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, W, H);
  return c;
}

// The front of a crowd against the light: two rows of heads and shoulders.
function crowdOf() {
  const h = 460, c = canvas(W, h), g = c.getContext('2d');
  let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#050404';
  for (const [y0, rad] of [[250, 38], [320, 50]]) {
    for (let x = -30 - r() * 40; x < W + 60; x += rad * 2.2 + r() * 34) {
      const y = y0 + r() * 34;
      g.beginPath(); g.ellipse(x, y, rad * 0.82, rad, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x, y + rad * 2.2, rad * 2.1, rad * 1.5, 0, 0, Math.PI * 2); g.fill();
    }
  }
  g.fillRect(0, 380, W, h - 380);
  return c;
}

// ---------------------------------------------------------------- the frame

let grain = null, still = null, lastT = Infinity;

export function paint(ctx, t, look, kit, seat) {
  // The last frame before the seat, kept for the glass to fall away.
  if (t >= T.s3 && lastT < T.s3) { still ??= canvas(); still.getContext('2d').drawImage(ctx.canvas, 0, 0); }
  if (t < T.s3) still = null;
  lastT = t;
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  if (t < T.s2) flyerOne(ctx, t - T.s1, look, kit);
  else if (t < T.s3) flyerTwo(ctx, t - T.s2, look, kit);
  else if (t < T.end) seatView(ctx, t - T.s3, look, kit, seat);
  else end(ctx, t - T.end, look, kit);
  if (t < T.end) film(ctx, t);
  // A white frame on the two cuts that come on a hit.
  for (const [at, k0] of [[T.s1, 0.85], [T.s2, 0.7]]) {
    const k = (t - at) / 160;
    if (k >= 0 && k < 1) { ctx.fillStyle = `rgba(255,255,255,${k0 * (1 - k) * (1 - k)})`; ctx.fillRect(0, 0, W, H); }
  }
  const fade = (t - (LENGTH - 450)) / 450;
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// In over `d` ms from `at`, eased.
const inn = (t, at, d = 380) => ease((t - at) / d);

// 0–4.8 s. The show: the date stacked and lit like neon over an LED wall, the official
// poster on it, the crowd in front, the name, the details and the promoter, each in its turn.
function flyerOne(ctx, t, look, kit) {
  field(ctx, kit, t, 1);
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5 + 0.12 * Math.sin(t / 300); ctx.drawImage(kit.led, 0, 0); ctx.restore();
  shade(ctx, 0.35, 0);

  const d = stackArt(look, 'date', look.dateStack, kit, 172);
  for (let i = 0; i < 4; i++) {
    const k = inn(t, 80 + i * 110, 520);
    if (k <= 0) continue;
    const dir = i % 2 ? 1 : -1, x = (W - d.w) / 2 + dir * ((1 - k) * 220 + t / 70);
    ctx.globalAlpha = k;
    ctx.drawImage(i === 1 ? d.fill : d.line, x - d.pad, 196 + i * d.step - d.pad);
  }
  ctx.globalAlpha = 1;

  // The poster, settling in and growing very slowly.
  const pk = pop((t - 320) / 560);
  if (pk > 0 && kit.panel) {
    const s = fitIn(kit.panel, 560, 560) * (0.86 + 0.14 * pk) * (1 + t / 40000);
    ctx.globalAlpha = Math.min(1, pk * 1.6);
    panel(ctx, kit, kit.panel, s, t - 320 < 120 ? glitchOf(3, Math.max(0, t - 320)) : null, -0.02, 0.5);
    ctx.globalAlpha = 1;
  }

  // The crowd against the stage's light.
  const glow = ctx.createRadialGradient(W / 2, H - 150, 20, W / 2, H - 150, 520);
  glow.addColorStop(0, kit.accent); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.6;
  ctx.fillStyle = glow; ctx.fillRect(0, H - 700, W, 700); ctx.restore();
  ctx.drawImage(kit.crowd, Math.sin(t / 520) * 8 - 12, H - kit.crowd.height + 12 + Math.sin(t / 260) * 4, W + 24, kit.crowd.height);
  scrim(ctx, 0.6, 0.72);

  const lines = look.nameLines, ns = fitSize(ctx, lines, 900, W - 96, 96), lh = ns * 1.02;
  const base = H - 300 - (lines.length - 1) * lh;
  ctx.textAlign = 'center';
  lines.forEach((s, i) => {
    const k = inn(t, 700 + i * 130, 460);
    if (k <= 0) return;
    const y = base + i * lh;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y - ns * 1.02, W, ns * 1.3); ctx.clip();
    ctx.translate(0, (1 - k) * ns * 1.1);
    ctx.font = `900 ${ns}px ${EXP}`;
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 22;
    ctx.fillStyle = kit.accent; ctx.fillText(s, W / 2 + 5, y + 5);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = PAPER; ctx.fillText(s, W / 2, y);
    ctx.restore();
  });
  const ik = inn(t, 1050);
  if (ik > 0) {
    ctx.globalAlpha = ik;
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10;
    small(ctx, look.line1, W / 2, H - 236, 22, PAPER, 800);
    small(ctx, look.line2, W / 2, H - 204, 18, PAPER, 700);
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
  }
  logos(ctx, look, kit, inn(t, 1250));
}

// 4.8–9.6 s. Who they are: the act's face from the poster, drifting across the frame (or,
// where the poster has none, the name lit in outline), the date in a box, the tour on two
// labels, the act in two lines on torn paper. On the music's break it all holds still and the
// glass cracks.
function flyerTwo(ctx, lt, look, kit) {
  const hold = T.crack - T.s2, t = Math.min(lt, hold + 60), dur = T.s3 - T.s2;
  if (kit.pic) {
    picture(ctx, kit.pic.color, t / dur, 1.04, 1.12, 1);
    grade(ctx, kit, 0.25);
    shade(ctx, 0.45, 0);
    scrim(ctx, 0.46, 0.75);
  } else {
    field(ctx, kit, t + 2600, 0.9);
    gray(ctx);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5; ctx.drawImage(kit.led, 0, 0); ctx.restore();
    shade(ctx, 0.45, 0.6);
    // The name, a line solid and a line lit in outline, each as big as it fits.
    let y = 430;
    look.nameLines.forEach((s, i) => {
      const n = stackArt(look, `name${i}`, s, kit, 150), k = inn(t, 100 + i * 140, 520), dir = i % 2 ? -1 : 1;
      if (k > 0) {
        ctx.globalAlpha = k;
        ctx.drawImage(i % 2 ? n.line : n.fill, (W - n.w) / 2 + dir * ((1 - k) * 200 + t / 70) - n.pad, y - n.pad);
      }
      y += n.step + 6;
    });
    ctx.globalAlpha = 1;
  }

  // The date in a box, top right.
  const bk = pop((t - 150) / 420);
  if (bk > 0 && look.badge) {
    const b = 172;
    ctx.save();
    ctx.translate(W - 54 - b / 2, 296); ctx.rotate(-0.04); ctx.scale(bk, bk);
    ctx.fillStyle = kit.accent; ctx.fillRect(-b / 2, -b / 2, b, b);
    ctx.fillStyle = kit.onAccent; ctx.textAlign = 'center';
    ctx.font = `900 64px ${EXP}`;
    ctx.fillText(look.badge[0], 0, -10); ctx.fillText(look.badge[1], 0, 58);
    ctx.restore();
  }

  // The tour on two labels: ink on paper, then the accent's own ink on the accent.
  const lab = look.labels, ls = fitSize(ctx, lab, 900, W - 170, 66), top = 700;
  lab.forEach((s, i) => {
    const k = inn(t, 340 + i * 140, 460);
    if (k <= 0) return;
    const dir = i % 2 ? 1 : -1, y = top + i * ls * 1.32;
    ctx.save();
    ctx.font = `900 ${ls}px ${EXP}`;
    const w = ctx.measureText(s).width + 40, h = ls * 1.12;
    ctx.translate(W / 2 + dir * (1 - k) * W + dir * 14, y);
    ctx.rotate(i % 2 ? 0.02 : -0.03);
    ctx.fillStyle = i % 2 ? kit.accent : PAPER; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = i % 2 ? kit.onAccent : INK; ctx.textAlign = 'center';
    ctx.fillText(s, 0, ls * 0.36);
    ctx.restore();
  });

  // Who they are, on torn paper.
  const tk = inn(t, 720, 520);
  if (tk > 0) {
    const y = top + lab.length * ls * 1.32 + 64, [a, b] = look.about;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W * tk, H); ctx.clip();
    torn(ctx, W / 2, y, W + 80, b ? 128 : 104, PAPER, 5, -0.015);
    ctx.translate(W / 2, y); ctx.rotate(-0.015);
    small(ctx, a, 0, b ? -6 : 8, 22, INK, 800);
    if (b) small(ctx, b, 0, 28, 18, INK, 700);
    ctx.restore();
  }
  logos(ctx, look, kit, inn(t, 900));

  if (lt >= hold) cracks(ctx, (lt - hold) / 120);
}

// 9.6–14.4 s. The glass falls away to the view from the seat, left clear: the category and
// the distance on a tape across the roof, the days to go on another low across the crowd, and
// the block, row and seat along the bottom.
function seatView(ctx, lt, look, kit, seat) {
  const s = 1.02 + lt / (T.end - T.s3) * 0.06;
  if (seat) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.drawImage(seat, -W / 2, -H / 2, W, H); ctx.restore(); }
  grade(ctx, kit, 0.25);
  shade(ctx, 0.35, 0);
  scrim(ctx, 0.74, 0.7);

  tape(ctx, H * 0.19, -0.06, AMBER, INK, look.catLine, lt / 8, inn(lt, 520, 420), 56, 22);
  if (look.countRun) tape(ctx, H * 0.715, 0.035, INK, PAPER, look.countRun, -lt / 10, inn(lt, 760, 420), 56, 22);

  const cells = look.cells, gap = 40;
  ctx.font = `900 100px ${EXP}`;
  const raw = cells.map(([, v]) => ctx.measureText(v).width);
  const vs = Math.min(92, Math.floor(100 * (W - 112 - gap * (cells.length - 1)) / raw.reduce((a, b) => a + b, 0)));
  const yb = H - 168;
  let x = 56;
  ctx.textAlign = 'left';
  cells.forEach(([label, v], i) => {
    const w = raw[i] * vs / 100, k = pop((lt - 980 - i * 140) / 380);
    if (k > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, k);
      ctx.font = `600 16px ${MONO}`; ctx.fillStyle = PAPER;
      ctx.fillText(label, x + 2, yb - vs * 0.74 - 16);
      ctx.translate(x, yb); ctx.scale(k, k);
      ctx.font = `900 ${vs}px ${EXP}`;
      ctx.fillStyle = kit.accent; ctx.fillText(v, 4, 4);
      ctx.fillStyle = PAPER;
      const g = [2600, 3900].map(at => lt - at).find(a => a >= 0 && a < 120);
      if (g !== undefined) stripes(ctx, v, vs, glitchOf(i * 5 + (lt > 3000 ? 1 : 0), g)); else ctx.fillText(v, 0, 0);
      ctx.restore();
    }
    x += w + gap;
  });

  // The glass: the flyer's last frame in pieces, falling away.
  const p = lt / 620;
  if (p < 1 && still) shatter(ctx, still, p);
  if (p >= 1) still = null;
}

// 14.4–17.4 s. Atvents: the logo coming together as it does when the site opens.
function end(ctx, lt) {
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
  logoMotion(ctx, lt / 1000 + 0.05, W / 2, H / 2, 440);
}

// ---------------------------------------------------------------- drawing kit

const fitIn = (img, mw, mh) => Math.min(mw / img.width, mh / img.height);

// The poster whole, at scale `s` round the point (W/2, H * yk), turned `rot`, with a
// shadow; `glitch` shifts a few bands of it sideways (the hits).
function panel(ctx, kit, img, s, glitch, rot = 0, yk = 0.45) {
  if (!img) return;
  const w = img.width, h = img.height;
  ctx.save();
  ctx.translate(W / 2, H * yk); ctx.rotate(rot); ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
  ctx.drawImage(img, -w / 2, -h / 2);
  ctx.shadowColor = 'transparent';
  if (glitch) {
    for (const [y0, hh, dx] of glitch) {
      const y = Math.floor(y0 * h), bh = Math.max(4, Math.floor(hh * h));
      ctx.drawImage(img, 0, y, w, bh, -w / 2 + dx, -h / 2 + y, w, bh);
      ctx.fillStyle = kit.accent; ctx.globalAlpha = 0.25; ctx.fillRect(-w / 2 + dx, -h / 2 + y, w, bh); ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}


// A photo `c` filling the frame from the top, zoomed from `z0` to `z1` and drifting sideways
// (`dir`) as `k` goes 0–1, with its foot fading into the dark.
function picture(ctx, c, k, z0, z1, dir) {
  const z = z0 + (z1 - z0) * k, w = c.width * z, h = c.height * z;
  const travel = Math.min(w - W, 300), e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
  const x = (W - w) / 2 + dir * travel * (0.5 - e), y = -(h - c.height) * 0.35;
  ctx.drawImage(c, x, y, w, h);
  const foot = y + h, g = ctx.createLinearGradient(0, foot - 260, 0, foot);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g; ctx.fillRect(0, foot - 260, W, 260);
  if (foot < H) { ctx.fillStyle = '#000'; ctx.fillRect(0, foot, W, H - foot); }
}

// A line of type drawn once, as a lit outline and solid, for stacking.
function stackArt(look, key, text, kit, max) {
  const c = look.cache;
  if (c[key]) return c[key];
  const probe = canvas(10, 10).getContext('2d');
  const size = fitSize(probe, [text], 900, W - 70, max), pad = 40;
  probe.font = `900 ${size}px ${EXP}`;
  const w = Math.ceil(probe.measureText(text).width), h = Math.ceil(size * 0.78);
  const make = solid => {
    const cv = canvas(w + pad * 2, h + pad * 2), g = cv.getContext('2d');
    g.font = `900 ${size}px ${EXP}`; g.textBaseline = 'alphabetic';
    if (solid) {
      g.shadowColor = kit.accent; g.shadowBlur = 36; g.fillStyle = PAPER;
      g.fillText(text, pad, pad + h);
    } else {
      g.shadowColor = 'rgba(255,255,255,0.75)'; g.shadowBlur = 16; g.lineWidth = 2.6; g.strokeStyle = PAPER;
      g.strokeText(text, pad, pad + h);
      g.shadowBlur = 0; g.strokeText(text, pad, pad + h);
    }
    return cv;
  };
  c[key] = { line: make(false), fill: make(true), w, pad, step: Math.round(size * 0.84) };
  return c[key];
}

// The largest size (to `max`) at which the longest of `lines` fits in `maxW`.
function fitSize(ctx, lines, weight, maxW, max) {
  ctx.font = `${weight} 100px ${EXP}`;
  const w = Math.max(1, ...lines.map(l => ctx.measureText(l).width));
  return Math.max(18, Math.min(max, Math.floor(100 * maxW / w)));
}

// Small wide type, letter-spaced, squeezed to fit if it must.
function small(ctx, text, x, y, size, color, weight = 700, maxW = W - 96) {
  if (!text) return;
  ctx.font = `${weight} ${size}px ${EXP}`; ctx.fillStyle = color; ctx.textAlign = 'center';
  const ls = 'letterSpacing' in ctx;
  if (ls) ctx.letterSpacing = `${Math.round(size * 0.06)}px`;
  ctx.fillText(text, x, y, maxW);
  if (ls) ctx.letterSpacing = '0px';
}

// The promoter and Atvents, small, along the bottom as a flyer's logos are, and the photo's
// credit above them where its licence asks for one.
function logos(ctx, look, kit, k, y = H - 142) {
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = k;
  if (kit.pic && look.credit) {
    ctx.font = `500 12px ${MONO}`; ctx.fillStyle = 'rgba(246,242,238,0.75)'; ctx.textAlign = 'left';
    ctx.fillText(`PHOTO: ${look.credit}`, 56, y - 46, W - 112);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y - 34, W, 68);
  if (look.host) {
    ctx.font = `600 15px ${MONO}`; ctx.fillStyle = PAPER; ctx.textAlign = 'left';
    ctx.fillText(look.host, 56, y + 5, 400);
  }
  if (kit.logo) { const w = 124, h = w / LOGO_AR; ctx.drawImage(kit.logo, W - 56 - w, y - h / 2, w, h); }
  ctx.restore();
}

// The colour field behind, drifting slowly.
function field(ctx, kit, t, k = 1) {
  const s = 1.06 + 0.03 * Math.sin(t / 1300);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.rotate(Math.sin(t / 2100) * 0.02);
  ctx.drawImage(kit.field, -W / 2, -H / 2);
  ctx.restore();
}

function gray(ctx) {
  ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore();
}

// Three bands shifted for the first 120 ms of a glitch (`at` ms in), the same each time for `n`.
function glitchOf(n, at) {
  if (at > 120) return null;
  let seed = 31 + n * 7919; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const k = 1 - at / 120;
  return [0, 1, 2].map(() => [r(), 0.04 + r() * 0.1, (r() - 0.5) * 60 * k]);
}

// Text cut into bands, each shifted by its own amount (the glitch, on type).
function stripes(ctx, text, size, bands) {
  const rows = bands.map(([y0, hh, dx]) => [-size * 0.8 + y0 * size * 0.8, Math.max(3, hh * size), dx]);
  ctx.save();
  ctx.beginPath(); ctx.rect(-40, -size * 1.1, 2000, size * 1.4);
  for (const [y, bh] of rows) ctx.rect(-40, y, 2000, bh);
  ctx.clip('evenodd');
  ctx.fillText(text, 0, 0);
  ctx.restore();
  for (const [y, bh, dx] of rows) {
    ctx.save();
    ctx.beginPath(); ctx.rect(-40, y, 2000, bh); ctx.clip();
    ctx.fillText(text, dx, 0);
    ctx.restore();
  }
}

// Darker at the top and the bottom, for the type.
function shade(ctx, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(0,0,0,${top})`); g.addColorStop(0.35, 'rgba(0,0,0,0)');
  g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${bottom})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// Dark from `from` (a share of the height) down, for type over a picture.
function scrim(ctx, from, k) {
  const g = ctx.createLinearGradient(0, H * from, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, `rgba(0,0,0,${k})`); g.addColorStop(1, `rgba(0,0,0,${Math.min(1, k + 0.25)})`);
  ctx.fillStyle = g; ctx.fillRect(0, H * from, W, H * (1 - from));
}

// A picture in the show's colours, a little: its accent into the shadows.
function grade(ctx, kit, k = 0.3) {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = k;
  ctx.fillStyle = kit.accent; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// A strip of paper with torn long edges, `w` x `h` round (cx, cy), turned `rot`.
function torn(ctx, cx, cy, w, h, color, seed, rot = 0) {
  let s = seed * 9973 + 1; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const edge = (y, dir) => { const pts = []; for (let x = -w / 2; x <= w / 2 + 1; x += 9 + r() * 10) pts.push([x, y + dir * (r() * 9 + (r() < 0.15 ? r() * 10 : 0))]); return pts; };
  const top = edge(-h / 2, -1), bottom = edge(h / 2, 1).reverse();
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
  ctx.beginPath();
  [...top, ...bottom].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

// A strip of tape across the frame at `angle`, its text running by `shift`.
function tape(ctx, y, angle, bg, fg, text, shift, k, h = 66, size = 27) {
  if (k <= 0 || !text) return;
  const run = `${text}   ·   `;
  ctx.save();
  ctx.translate(W / 2, y); ctx.rotate(angle);
  const len = 1500, x0 = -len / 2 + (1 - k) * (angle < 0 ? -len : len);
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  ctx.fillStyle = bg; ctx.fillRect(x0, -h / 2, len, h);
  ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.rect(x0, -h / 2, len, h); ctx.clip();
  ctx.font = `800 ${size}px ${EXP}`; ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const w = ctx.measureText(run).width, start = x0 + ((shift % w) + w) % w - w;
  for (let x = start; x < x0 + len; x += w) ctx.fillText(run, x, 2);
  ctx.restore();
}

// Glass: the pieces round a point, each between two cracks running to the frame's edge.
const SHARDS = (() => {
  const cx = W * 0.58, cy = H * 0.44, n = 11, pts = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) pts.push((i / n) * Math.PI * 2 + rnd() * 0.35);
  const edge = a => { const dx = Math.cos(a), dy = Math.sin(a); const k = Math.min(Math.abs((dx > 0 ? W - cx : cx) / (dx || 1e-6)), Math.abs((dy > 0 ? H - cy : cy) / (dy || 1e-6))); return [cx + dx * k * 1.02, cy + dy * k * 1.02]; };
  return pts.map((a, i) => {
    const b = pts[(i + 1) % n] + (i === n - 1 ? Math.PI * 2 : 0), m = (a + b) / 2;
    return { poly: [[cx, cy], edge(a), edge(m), edge(b)], dir: [Math.cos(m), Math.sin(m)], spin: (rnd() - 0.5) * 0.6, speed: 0.7 + rnd() * 0.6, ring: [0.1 + rnd() * 0.06, 0.26 + rnd() * 0.1], cx, cy };
  });
})();

// The cracks running out from the point, `p` 0–1, and two rings of them.
function cracks(ctx, p) {
  const k = ease(Math.min(1, p));
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [lw, col] of [[4, 'rgba(0,0,0,0.4)'], [1.6, 'rgba(255,255,255,0.92)']]) {
    ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath();
    SHARDS.forEach((s, i) => {
      const [x, y] = s.poly[1], [nx, ny] = SHARDS[(i + 1) % SHARDS.length].poly[1];
      ctx.moveTo(s.cx, s.cy); ctx.lineTo(s.cx + (x - s.cx) * k, s.cy + (y - s.cy) * k);
      for (const r of s.ring) if (k > r * 1.5) { ctx.moveTo(s.cx + (x - s.cx) * r, s.cy + (y - s.cy) * r); ctx.lineTo(s.cx + (nx - s.cx) * r * 1.06, s.cy + (ny - s.cy) * r * 1.06); }
    });
    ctx.stroke();
  }
  ctx.restore();
}

function shatter(ctx, img, p) {
  const fall = ease(p) * p;
  for (const s of SHARDS) {
    ctx.save();
    const d = fall * 900 * s.speed;
    ctx.translate(s.dir[0] * d, s.dir[1] * d + fall * 700);
    ctx.translate(s.cx, s.cy); ctx.rotate(s.spin * fall); ctx.translate(-s.cx, -s.cy);
    ctx.beginPath(); s.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.save(); ctx.clip(); ctx.globalAlpha = 1 - fall * 0.5; ctx.drawImage(img, 0, 0); ctx.restore();
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - fall)})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
}

function film(ctx, t) {
  if (!grain) {
    grain = canvas(256, 256);
    const g = grain.getContext('2d'), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = 0.07; ctx.globalCompositeOperation = 'overlay';
  const ox = (Math.floor(t / 41) * 97) % 256, oy = (Math.floor(t / 41) * 57) % 256;
  ctx.fillStyle = ctx.createPattern(grain, 'repeat');
  ctx.translate(-ox, -oy); ctx.fillRect(ox, oy, W, H);
  ctx.restore();
}

const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const pop = x => { x = Math.min(1, Math.max(0, x)); const c = 1.70158; return x <= 0 ? 0 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

// ---------------------------------------------------------------- the words

// ---------------------------------------------------------------- the words

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Words in two lines as even as they go (one if short).
function twoLines(s) {
  const w = s.split(/\s+/).filter(Boolean);
  if (w.length < 2 || s.length <= 10) return [s];
  let best = null;
  for (let i = 1; i < w.length; i++) {
    const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), d = Math.max(a.length, b.length);
    if (!best || d < best[0]) best = [d, [a, b]];
  }
  return best[1];
}

// "3 DAYS TO GO": days to the show on the fan's calendar.
export function countdownText(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  const day = t => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const n = Math.round((day(ms) - day(now)) / 864e5);
  return n > 1 ? `${n} DAYS TO GO` : n === 1 ? 'TOMORROW' : n === 0 ? 'TODAY' : '';
}

// What the frames say, worked out once: the promoter's details, the act, and the fan's seat.
export function lookOf({ e, place, when, seat, cat, metres, artist, now = Date.now() }) {
  const d = new Date(when.ms), ok = Number.isFinite(when.ms);
  const pad = n => String(n).padStart(2, '0');
  const title = (e.title || '').toUpperCase(), sub = (e.subtitle || '').toUpperCase();
  const city = (place.city || '').toUpperCase(), venue = (place.name || '').toUpperCase();
  const time = e.time && e.time !== 'TBA' ? String(e.time).toUpperCase() : '';
  const cells = (seat.standing ? [['AREA', seat.secName]] : [['BLOCK', seat.sec || seat.secName], ['ROW', seat.row], ['SEAT', seat.num]])
    .map(([l, v]) => [l, String(v).toUpperCase()]);
  const line1 = [ok ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '', time].filter(Boolean).join('  |  ');
  const line2 = [venue, city && !venue.includes(city) ? city : ''].filter(Boolean).join(', ');
  return {
    title, nameLines: twoLines(title),
    dateStack: ok ? `${pad(d.getDate())}${MONTHS[d.getMonth()]}` : city,
    badge: ok ? [pad(d.getDate()), pad(d.getMonth() + 1)] : null,
    labels: sub ? twoLines(sub.replace(/\s*·\s*/g, ' · ')) : [city].filter(Boolean),
    line1, line2,
    credit: artist?.photo?.credit ? artist.photo.credit.toUpperCase() : '',
    about: artist?.about?.[0] ? artist.about.map(s => (s || '').toUpperCase()) : [line1, line2],
    host: e.host && e.host !== 'TBA' ? e.host.toUpperCase() : '',
    cells,
    countRun: [countdownText(when.ms, now), title].filter(Boolean).join('  ·  '),
    catLine: [cat?.name ? cat.name.toUpperCase() : '', metres ? `${metres} M TO THE STAGE` : ''].filter(Boolean).join('  ·  '),
    cache: {},
  };
}
