// The story as a trailer of the show: 16 seconds cut to a beat, in the show's own colours,
// from the promoter's own material (the poster and the event's details as listed), then
// the view from the fan's seat with its block, row and seat, and Atvents last.
//
// Only what the promoter published goes on it: the artist, the tour, the date, the venue,
// the time. No slogans. The look of each show comes from its theme (themes.js), taken from
// the tour's artwork; the type is the brand's (Archivo Condensed, JetBrains Mono).
//
// paint() draws one frame at a time `t` (ms) onto a 720 x 1280 canvas; `kit` holds the
// pictures, made once by makeKit(), and `seat` is the view from the seat at that moment (the
// live 3D canvas in the page, a rendered frame in a preview).

export const W = 720, H = 1280;
export const BEAT = 500;            // 120 bpm
export const LENGTH = 16000;
// The sections, in ms.
export const T = { date: 1000, poster: 3000, tape: 5000, info: 7000, seat: 9000, recap: 13000, end: 14000 };

const CON = '"Atvents Condensed", "Archivo", "Arial Narrow", sans-serif';
const MONO = '"Atvents Mono", "JetBrains Mono", ui-monospace, Menlo, monospace';
const LOGO_AR = 4724 / 900;

// ---------------------------------------------------------------- the kit

// The poster in two forms: whole, as the promoter made it (the panel, in colour and in
// black and white), and as a field of its colours, blurred past reading and put in the
// show's duotone, behind everything.
export function makeKit({ poster, logo, theme }) {
  const dark = theme?.screen?.a || '#0a0a0a', accent = theme?.band || '#ec5446', light = '#f6f2ee';
  const field = mapped(blurred(poster), duoMap(dark, accent, light, 0.7));
  const panel = panelOf(poster), panelMono = panel && mapped(panel, monoMap(), panel.width, panel.height);
  return { field, panel, panelMono, logo, accent, dark, light };
}

function blurred(img) {
  const c = canvas(), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (!img) return c;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.max(W / iw, H / ih) * 1.4;
  g.filter = 'blur(38px)';
  g.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
  return c;
}

// The poster at its own shape, 600 px across (at most 820 tall).
function panelOf(img) {
  if (!img) return null;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.min(600 / iw, 820 / ih), w = Math.round(iw * k), h = Math.round(ih * k);
  const c = canvas(w, h); c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c;
}

function canvas(w = W, h = H) { return Object.assign(document.createElement('canvas'), { width: w, height: h }); }

// The poster covering the frame, a little larger than it so the punch-ins have room.
function fitted(img, over) {
  const c = canvas(), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (!img) return c;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.max(W / iw, H / ih) * over;
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

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// Shadows to the show's dark, mids to its accent, highlights to paper; contrast pushed.
function duoMap(dark, accent, light, top = 1) {
  const a = hex(dark), b = hex(accent), c = hex(light);
  return l => {
    const x = Math.min(top, Math.max(0, (l - 0.08) * 1.35));
    const s = x < 0.55 ? x / 0.55 : (x - 0.55) / 0.45, p = x < 0.55 ? a : b, q = x < 0.55 ? b : c;
    return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s, p[2] + (q[2] - p[2]) * s];
  };
}
function monoMap() {
  return l => { const x = Math.min(1, Math.max(0, (l - 0.12) * 1.5)); const v = 255 * x * x * (3 - 2 * x); return [v, v, v]; };
}
// ---------------------------------------------------------------- the frame

let grain = null, still = null;

let lastT = Infinity;

export function paint(ctx, t, look, kit, seat) {
  // The last frame before the seat, kept for the glass to break.
  if (t >= T.seat && lastT < T.seat) { still ??= canvas(); still.getContext('2d').drawImage(ctx.canvas, 0, 0); }
  if (t < T.seat) still = null;
  lastT = t;
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (t < T.date) intro(ctx, t, look, kit);
  else if (t < T.poster) dates(ctx, t - T.date, look, kit);
  else if (t < T.tape) poster(ctx, t - T.poster, look, kit);
  else if (t < T.info) tapes(ctx, t - T.tape, look, kit);
  else if (t < T.seat) info(ctx, t - T.info, look, kit);
  else if (t < T.recap) seatView(ctx, t - T.seat, look, kit, seat);
  else if (t < T.end) recap(ctx, t - T.recap, look, kit, seat);
  else end(ctx, t - T.end, look, kit);
  film(ctx, t);
  // A white frame on the hits that open a section.
  for (const at of [T.date, T.poster, T.info, T.recap]) {
    const k = (t - at) / 90;
    if (k >= 0 && k < 1) { ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - k)})`; ctx.fillRect(0, 0, W, H); }
  }
  const fade = Math.max(1 - t / 300, (t - (LENGTH - 500)) / 500, 0);
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// Since the last beat, in ms, and which beat.
const beatOf = lt => ({ n: Math.floor(lt / BEAT), at: lt % BEAT });
const punch = at => 1 + 0.06 * Math.exp(-at / 120);

// 0–1 s: the dark, and the poster seen in two flickers.
function intro(ctx, t, look, kit) {
  for (const at of [380, 760]) {
    if (t >= at && t < at + 70) { ctx.globalAlpha = 0.6; ctx.drawImage(kit.field, 0, 0); ctx.globalAlpha = 1; panel(ctx, kit, kit.panelMono, 1.04, 0, 0); }
  }
}

// The colour field behind, drifting slowly, brighter on each beat.
function field(ctx, kit, t, k = 1) {
  const s = 1.06 + 0.03 * Math.sin(t / 1300);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.rotate(Math.sin(t / 2100) * 0.02);
  ctx.drawImage(kit.field, -W / 2, -H / 2);
  ctx.restore();
}

// 1–3 s: the date, stacked, a line landing on each half beat.
function dates(ctx, lt, look, kit) {
  field(ctx, kit, lt, 0.55);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 0, W, H);
  const lines = 7, size = 196, step = 172, top = (H - step * (lines - 1)) / 2 + size * 0.36;
  ctx.font = `800 ${size}px ${CON}`; ctx.textAlign = 'center';
  for (let i = 0; i < lines; i++) {
    const at = lt - i * (BEAT / 2);
    if (at < 0) break;
    const k = ease(at / 220), dir = i % 2 ? 1 : -1;
    const x = W / 2 + dir * (1 - k) * 420 + dir * (lt / 40), y = top + i * step;
    if (i === 3) { ctx.fillStyle = kit.accent; ctx.fillText(look.dateBig, x, y); }
    else { ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(look.dateBig, x, y); }
  }
}

// 3–5 s: the poster itself, punching in on each beat, the title building up under it.
function poster(ctx, lt, look, kit) {
  const { n, at } = beatOf(lt);
  field(ctx, kit, lt + 2000, 0.85 + 0.15 * Math.exp(-at / 150));
  shade(ctx, 0.2, 0.85);
  panel(ctx, kit, kit.panel, punch(at) * (0.96 + lt / 60000), glitchOf(n, at), -0.025, 0.42);
  const lines = look.titleLines;
  ctx.textAlign = 'left'; ctx.fillStyle = kit.light;
  const size = Math.min(look.titleSize, 120), y0 = H - 170 - (lines.length - 1) * size * 0.9;
  lines.forEach((w, i) => {
    if (i > n) return;
    const k = ease((lt - i * BEAT) / 160);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.font = `800 ${size}px ${CON}`;
    ctx.translate(56, y0 + i * size * 0.9);
    ctx.scale(1 + (1 - k) * 0.25, 1 + (1 - k) * 0.25);
    ctx.fillText(w, 0, 0);
    ctx.restore();
  });
  ctx.font = `600 22px ${MONO}`; ctx.fillStyle = kit.accent; ctx.textAlign = 'left';
  ctx.fillText(look.subtitle.toUpperCase(), 58, H - 116, W - 116);
}

// 5–7 s: the poster trading colour for black and white on each beat, two tapes across it.
function tapes(ctx, lt, look, kit) {
  const { n, at } = beatOf(lt);
  const bw = n % 2 === 1;
  field(ctx, kit, lt + 4000, bw ? 0.35 : 0.8);
  if (bw) { ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  panel(ctx, kit, bw ? kit.panelMono : kit.panel, punch(at) * 1.08, glitchOf(n + 3, at), [0.03, -0.02, 0.015, -0.03][n % 4], 0.47);
  const run = `${look.title.toUpperCase()}  —  ${look.subtitle.toUpperCase()}  —  `;
  tape(ctx, H * 0.3, -0.13, kit.accent, '#0b0b0b', run, lt / 9, ease(lt / 260));
  tape(ctx, H * 0.7, 0.09, kit.light, '#0b0b0b', `${look.dateBig}  ·  ${look.place.toUpperCase()}  ·  `, -lt / 7, ease((lt - BEAT) / 260));
}

// 7–9 s: the show's details as the promoter lists them, one line a half beat.
function info(ctx, lt, look, kit) {
  field(ctx, kit, lt + 6000, 0.45);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
  const rows = look.info;
  const x = 56, y0 = 420;
  rows.forEach(([label, value], i) => {
    const k = ease((lt - i * (BEAT / 2)) / 200);
    if (k <= 0) return;
    const y = y0 + i * 170;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate((1 - k) * -30, 0);
    ctx.font = `600 20px ${MONO}`; ctx.fillStyle = kit.accent; ctx.textAlign = 'left';
    ctx.fillText(label, x, y);
    const big = value.length > 16 ? 70 : 104;
    ctx.font = `800 ${big}px ${CON}`; ctx.fillStyle = kit.light;
    ctx.fillText(value.toUpperCase(), x - 3, y + big * 0.95, W - 112);
    ctx.restore();
  });
  if (look.count) {
    const k = pop((lt - 4 * (BEAT / 2)) / 260);
    if (k > 0) {
      ctx.save();
      ctx.translate(W - 56, 280); ctx.scale(k, k); ctx.rotate(-0.06);
      ctx.font = `800 72px ${CON}`;
      const w = ctx.measureText(look.count).width + 44;
      ctx.fillStyle = '#ff9a3c'; ctx.fillRect(-w, -50, w, 100);
      ctx.fillStyle = '#141212'; ctx.textAlign = 'right'; ctx.fillText(look.count, -22, 26);
      ctx.restore();
    }
  }
}

// 9–13 s: through the glass to the view from the seat, and its numbers.
function seatView(ctx, lt, look, kit, seat) {
  const s = 1.0 + lt / 4000 * 0.07;
  if (seat) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.drawImage(seat, -W / 2, -H / 2, W, H); ctx.restore(); }
  grade(ctx, kit);
  shade(ctx, 0.35, 0.92);
  // The seat's numbers on a tape across the bottom, and the category and distance above.
  const k = ease((lt - 700) / 260);
  if (k > 0) {
    ctx.save();
    ctx.translate(0, (1 - k) * 60); ctx.globalAlpha = k;
    ctx.fillStyle = kit.accent; ctx.font = `600 20px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillText(look.catLine, 56, H - 300);
    ctx.restore();
    const cells = look.cells;
    const y = H - 230, cw = (W - 112) / cells.length;
    cells.forEach(([label, v], i) => {
      const ki = pop((lt - 700 - i * (BEAT / 2)) / 240);
      if (ki <= 0) return;
      ctx.save();
      ctx.translate(56 + i * cw, y);
      ctx.globalAlpha = Math.min(1, ki);
      ctx.font = `600 18px ${MONO}`; ctx.fillStyle = 'rgba(246,242,238,0.7)';
      ctx.fillText(label, 0, 0);
      ctx.font = `800 ${cells.length === 1 ? 84 : 120}px ${CON}`; ctx.fillStyle = kit.light;
      ctx.translate(0, 112); ctx.scale(ki, ki);
      ctx.fillText(v.toUpperCase(), -4, 0, cw - 10);
      ctx.restore();
    });
  }
  // The break: cracks over the last frame, then its pieces falling away.
  const p = lt / 520;
  if (p < 1 && still) shatter(ctx, still, p);
  if (p >= 1) still = null;
}

// 13–14 s: the film again in half beats, fast: poster, seat, date, seat.
function recap(ctx, lt, look, kit, seat) {
  const q = Math.floor(lt / (BEAT / 2)), at = lt % (BEAT / 2);
  if (q % 2 === 1 && seat) { ctx.drawImage(seat, 0, 0, W, H); grade(ctx, kit); }
  else { field(ctx, kit, lt + 8000, 0.7); }
  if (q === 0) panel(ctx, kit, kit.panel, punch(at) * 1.1, 0, 0.02, 0.45);
  if (q === 2) {
    ctx.textAlign = 'center'; ctx.fillStyle = kit.accent; ctx.font = `800 230px ${CON}`;
    ctx.fillText(look.dateBig, W / 2, H / 2 + 80, W - 60);
  }
  if (q % 2 === 1) {
    ctx.textAlign = 'center'; ctx.fillStyle = kit.light; ctx.font = `800 64px ${CON}`;
    ctx.fillText(look.cells.map(([, v]) => v).join(' · ').toUpperCase(), W / 2, H - 200, W - 80);
  }
}

// 14–16 s: Atvents.
function end(ctx, lt, look, kit) {
  ctx.fillStyle = '#161414'; ctx.fillRect(0, 0, W, H);
  const k = ease(lt / 500);
  if (kit.logo) {
    const w = 330, h = w / LOGO_AR;
    ctx.globalAlpha = k;
    ctx.drawImage(kit.logo, (W - w) / 2, H / 2 - h / 2 - 20 + (1 - k) * 16, w, h);
  }
  ctx.globalAlpha = ease((lt - 250) / 500);
  ctx.font = `500 20px ${MONO}`; ctx.fillStyle = 'rgba(244,240,238,0.6)'; ctx.textAlign = 'center';
  ctx.fillText('ATVENTS.COM', W / 2, H / 2 + 60);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- drawing kit

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

// Three bands shifted for the first 120 ms after a beat, the same each time for a beat `n`.
function glitchOf(n, at) {
  if (at > 120) return null;
  let seed = 31 + n * 7919; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const k = 1 - at / 120;
  return [0, 1, 2].map(() => [r(), 0.02 + r() * 0.06, (r() - 0.5) * 60 * k]);
}

// Darker at the top and the bottom, for the type.
function shade(ctx, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(0,0,0,${top})`); g.addColorStop(0.35, 'rgba(0,0,0,0)');
  g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${bottom})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// The seat's view in the show's colours, a little: its accent into the shadows.
function grade(ctx, kit) {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.35;
  ctx.fillStyle = kit.accent; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// A strip of tape across the frame at `angle`, its text running by `shift`.
function tape(ctx, y, angle, bg, fg, text, shift, k) {
  if (k <= 0) return;
  ctx.save();
  ctx.translate(W / 2, y); ctx.rotate(angle);
  const len = 1500, h = 64, x0 = -len / 2 + (1 - k) * (angle < 0 ? -len : len);
  ctx.fillStyle = bg; ctx.fillRect(x0, -h / 2, len, h);
  ctx.beginPath(); ctx.rect(x0, -h / 2, len, h); ctx.clip();
  ctx.font = `700 28px ${MONO}`; ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const w = ctx.measureText(text).width, start = x0 + ((shift % w) + w) % w - w;
  for (let x = start; x < x0 + len; x += w) ctx.fillText(text, x, 2);
  ctx.restore();
}

// Glass: cracks from a point, then the pieces of `img` falling and turning away.
const SHARDS = (() => {
  const cx = W * 0.58, cy = H * 0.44, n = 11, pts = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) pts.push((i / n) * Math.PI * 2 + rnd() * 0.35);
  const edge = a => { const dx = Math.cos(a), dy = Math.sin(a); const k = Math.min(Math.abs((dx > 0 ? W - cx : cx) / (dx || 1e-6)), Math.abs((dy > 0 ? H - cy : cy) / (dy || 1e-6))); return [cx + dx * k * 1.02, cy + dy * k * 1.02]; };
  return pts.map((a, i) => {
    const b = pts[(i + 1) % n] + (i === n - 1 ? Math.PI * 2 : 0), m = (a + b) / 2;
    return { poly: [[cx, cy], edge(a), edge(m), edge(b)], dir: [Math.cos(m), Math.sin(m)], spin: (rnd() - 0.5) * 0.6, speed: 0.7 + rnd() * 0.6, cx, cy };
  });
})();

function shatter(ctx, img, p) {
  const crack = p < 0.22, fall = Math.max(0, (p - 0.22) / 0.78);
  for (const s of SHARDS) {
    ctx.save();
    const d = fall * fall * 900 * s.speed;
    ctx.translate(s.dir[0] * d, s.dir[1] * d + fall * fall * 600);
    ctx.translate(s.cx, s.cy); ctx.rotate(s.spin * fall); ctx.translate(-s.cx, -s.cy);
    ctx.beginPath(); s.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.save(); ctx.clip(); ctx.globalAlpha = 1 - fall * 0.6; ctx.drawImage(img, 0, 0); ctx.restore();
    ctx.strokeStyle = `rgba(255,255,255,${crack ? 0.9 : 0.5 * (1 - fall)})`; ctx.lineWidth = crack ? 2 : 1.5; ctx.stroke();
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

// What the frames say, worked out once: the promoter's details, and the fan's seat.
export function lookOf({ e, place, when, seat, cat, metres, count }) {
  const d = new Date(when.ms), ok = Number.isFinite(when.ms);
  const pad = n => String(n).padStart(2, '0');
  const title = e.title || '';
  // The title in lines of a few words, as big as the longest lets it be.
  const words = title.toUpperCase().split(/\s+/), lines = [];
  for (const w of words) { const last = lines.at(-1); if (last && (last + ' ' + w).length <= 9) lines[lines.length - 1] = last + ' ' + w; else lines.push(w); }
  const longest = Math.max(...lines.map(l => l.length), 1);
  const cells = seat.standing ? [['AREA', seat.secName]] : [['BLOK', String(seat.sec || seat.secName)], ['BARIS', String(seat.row)], ['KURSI', String(seat.num)]];
  const days = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
  return {
    title, subtitle: e.subtitle || '', place: place.name, titleLines: lines,
    titleSize: Math.min(150, Math.floor(1000 / longest)),
    dateBig: ok ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` : '',
    info: [
      ['TANGGAL', ok ? `${days[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : 'TBA'],
      ['VENUE', place.name],
      ['KOTA', place.city || ''],
      ...(e.time && e.time !== 'TBA' ? [['MULAI', e.time]] : []),
    ].filter(([, v]) => v),
    count, cells, catLine: `${cat.name.toUpperCase()}  ·  ${metres} M KE PANGGUNG`,
  };
}
