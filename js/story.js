// The story a fan posts once their pass is paid: a 12-second vertical video for an
// Instagram or TikTok story, in the brand's own look, the same for every fan so the stories
// of one concert read as a set. It opens on the brand's line, SUDAH DI SANA, SEBELUM KE
// SANA, with the show and the countdown; shows the venue from above with the fan's seat dot
// and the sight line to the stage, and how many metres that is; opens on the view from the
// seat; and ends on the paper pass with the seat's coordinates and the question for the
// next fan, KAMU DUDUK DI MANA?
//
// The view is a second, hidden copy of the venue at 720 x 1280, already in the seat when
// recording starts; everything else is drawn over it on a 2D canvas and recorded with
// MediaRecorder. Nothing on it can open the pass: no pass id, key or link of the fan's,
// only their first name, as ticket sellers advise for ticket photos.
import { getEvent } from './events.js';
import { crowdSeats } from './layouts.js';
import { whenOf } from './when.js';
import { placeSeat, numberingOf } from './seatflip.js';
import { loadScene3d } from './viewer.js';
import { $, esc, icon, toast, state } from './ui.js';

const W = 720, H = 1280;
const wait = ms => new Promise(r => setTimeout(r, ms));
// MP4 first: Instagram and TikTok take it everywhere. WebM where the browser records no MP4.
const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
const pickType = () => TYPES.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
const slug = t => (t || 'concert').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const firstName = n => (String(n || '').trim().split(/\s+/)[0] || '').slice(0, 14).toUpperCase();

let busy = false;

export async function makeStory(pass) {
  if (busy || !pass) return;
  const type = pickType();
  if (!type || !HTMLCanvasElement.prototype.captureStream) { toast('This browser cannot record video. Try Chrome or Safari on your phone.'); return; }
  const venue = getEvent(pass.eventId), i = venue?.seatById.get(pass.seat);
  if (i === undefined) return;
  busy = true;
  // The ticket's seat is what the words say; `at` is where it is in the model when the
  // fan set the venue's numbering the other way (seatflip.js).
  const seat = venue.seats[i], at = placeSeat(venue, seat, numberingOf(venue, pass)), cat = venue.catById[pass.cat];
  const sheet = openSheet();
  let scene = null, rec = null;
  try {
    // The brand's fonts and the logo: a canvas fetches neither by itself.
    const font = loadFonts();
    const logo = loadImage('assets/brand/atvents-logo-web.svg');
    const { SeatScene } = await loadScene3d();
    await font;
    scene = new SeatScene(sheet.stage, { quality: 'medium', interactive: false, labels: false, fps: 30, drift: 0.05 });
    scene.renderer.setPixelRatio(W / sheet.stage.clientWidth);
    scene.resize();
    const crowd = crowdSeats(venue);
    crowd.delete(at.id);
    if (!(await scene.load(venue, crowd))) throw new Error('load');
    scene.setCrowd(true);
    scene.setLabels(false);
    await waitShown(scene);
    sheet.progress(0.15, 'Finding your seat');
    // Into the seat before recording: the view is ready the moment the card flips.
    scene.setMine([at.id]);
    scene.flyToSeat(at, { quick: true });
    await scene.settled();
    await wait(600);

    const look = lookOf(venue, seat, cat, pass, { logo: await logo });
    const out = sheet.canvas, ctx = out.getContext('2d');
    const t0 = performance.now();
    scene.afterRender = gl => paint(ctx, gl, performance.now() - t0, look);

    const chunks = [];
    rec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 8e6 });
    rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start(250);
    for (let k = 0; k < 10; k++) {
      sheet.progress(0.2 + k * 0.075, k < 2 ? look.e.title : k < 4 ? 'Your seat on the map' : k < 7 ? 'The view from your seat' : 'Your pass');
      await wait(LENGTH / 10);
    }
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
    sheet.done(new File([blob], `atvents-${slug(look.e.title)}-my-seat.${ext}`, { type: blob.type }), look.e, seat);
  } catch (err) {
    if (rec?.state === 'recording') rec.stop();
    sheet.fail();
  } finally {
    if (scene) { scene.afterRender = null; scene.dispose(); }
    busy = false;
  }
}

const waitShown = scene => new Promise(r => { const t = () => (scene.shown || scene.disposed ? r() : setTimeout(t, 60)); t(); });

function loadImage(src) {
  return new Promise(r => {
    const img = new Image();
    img.onload = () => r(img);
    img.onerror = () => r(null);
    img.src = src;
  });
}

// ---------------------------------------------------------------- the look
//
// The brand book's look (atvents-brand-book): a dark house, one red (the seat dot of the
// logo), amber only for the countdown, ticket paper for the pass; Archivo Expanded for
// headlines, Archivo Condensed on the ticket, JetBrains Mono for seat data. Its motifs carry
// the story: the seat dot, the sight line from the seat to the stage, the ticket's tear and
// the seat's coordinates. What each fan shows off is true and theirs: their seat, how far it
// is from the stage, and the view from it.

const C = { house: '#161414', panel: '#1f1c1c', seat: '#ec5446', amber: '#ff9a3c', paper: '#fbf8f6', text: '#f4f0ee', muted: '#a29895', ink: '#141212', line: '#3a3434' };
const BODY = '"Inter", "Helvetica Neue", Arial, sans-serif';
const EXP = '"Atvents Expanded", "Archivo", "Arial Black", sans-serif';
const CON = '"Atvents Condensed", "Archivo", "Arial Narrow", sans-serif';
const MONO = '"Atvents Mono", "JetBrains Mono", ui-monospace, Menlo, monospace';
// The logos' viewBoxes (assets/brand): an SVG without a size has none to read.
const LOGO_AR = { web: 4635 / 818, light: 4724 / 900 };

// The brand's type, from the site's own files (assets/fonts, SIL Open Font License). One
// variable Archivo serves both widths: each face pins the width axis.
export async function loadFonts() {
  if (!window.FontFace || !document.fonts) return;
  const faces = [
    new FontFace('Atvents Expanded', 'url(assets/fonts/archivo-latin-wdth-wght.woff2)', { weight: '100 900', stretch: '125%' }),
    new FontFace('Atvents Condensed', 'url(assets/fonts/archivo-latin-wdth-wght.woff2)', { weight: '100 900', stretch: '62%' }),
    new FontFace('Atvents Mono', 'url(assets/fonts/jetbrains-mono-latin-wght.woff2)', { weight: '100 800' }),
  ];
  await Promise.all(faces.map(f => f.load().then(x => document.fonts.add(x)).catch(() => {})));
  await Promise.all(['500', '600', '700'].map(w => document.fonts.load(`${w} 30px Inter`))).catch(() => {});
}

// The beats, in ms from the start.
const T = { map: 2300, view: 5300, pass: 8700 };
export const LENGTH = 12500;

// "H-4": days to the show on the fan's calendar, as Indonesian fans count them.
export function countdown(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  const day = t => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const n = Math.round((day(ms) - day(now)) / 864e5);
  return n > 1 ? `H-${n}` : n === 1 ? 'BESOK' : n === 0 ? 'MALAM INI' : '';
}

// Where the stage is in the model: the middle of a round show, else the end stage's front.
const stageAt = venue => (venue.show === 'round' ? { x: 0, z: 0 } : { x: venue.stageX ?? -40, z: 0 });

// Metres from the seat to the stage, from the model.
export function toStage(venue, seat) {
  const s = stageAt(venue), d = Math.hypot(seat.x - s.x, seat.z - s.z);
  return Number.isFinite(d) ? Math.max(1, Math.round(d)) : 0;
}

// The seat as the brand writes it: block, row, seat (the category goes above them).
export function coords(seat, cat) {
  return seat.standing
    ? [['AREA', seat.secName], ['MASUK', 'BERDIRI']]
    : [['BLOK', blockOf(seat)], ['BARIS', String(seat.row)], ['KURSI', String(seat.num)]];
}
const blockOf = seat => String(seat.sec && /^[A-Z0-9-]{1,6}$/i.test(seat.sec) ? seat.sec : seat.secName);

// Everything the frames draw, worked out once, with the venue drawn as a map of dots.
export function lookOf(venue, seat, cat, pass, { logo = null } = {}) {
  const e = venue.meta, when = whenOf(e), d = new Date(when.ms);
  return {
    e, seat, cat, place: venue.place, when, logo,
    count: countdown(when.ms), owner: firstName(pass.name), metres: toStage(venue, seat),
    short: Number.isFinite(when.ms) ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : '',
    coords: coords(seat, cat), map: mapOf(venue, seat),
  };
}

// The venue from above, stage at the top: every seat a grey dot. Drawn once.
function mapOf(venue, seat) {
  const st = stageAt(venue), round = venue.show === 'round';
  const pts = venue.seats;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const s of pts) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
  if (!round) x0 = Math.min(x0, st.x - 6);
  const mw = 640, mh = 640, k = Math.min(mw / (z1 - z0 || 1), mh / (x1 - x0 || 1));
  const ox = (mw - (z1 - z0) * k) / 2, oy = (mh - (x1 - x0) * k) / 2;
  const at = (x, z) => ({ px: ox + (z - z0) * k, py: oy + (x - x0) * k });
  const canvas = Object.assign(document.createElement('canvas'), { width: mw, height: mh });
  const c = canvas.getContext('2d');
  const r = Math.max(0.9, Math.min(2.2, k * 0.32));
  c.fillStyle = '#5e5555';
  for (const s of pts) { const p = at(s.x, s.z); c.fillRect(p.px - r / 2, p.py - r / 2, r, r); }
  // The stage, in ticket paper.
  const sp = at(st.x, st.z);
  c.fillStyle = C.paper;
  if (round) { c.beginPath(); c.arc(sp.px, sp.py, Math.max(10, k * 6), 0, Math.PI * 2); c.fill(); }
  else c.fillRect(sp.px - Math.max(60, k * 22), sp.py - 8, Math.max(120, k * 44), 12);
  return { canvas, w: mw, h: mh, seat: at(seat.x, seat.z), stage: { px: sp.px, py: round ? sp.py : sp.py + 4 } };
}

// ---------------------------------------------------------------- the frame

export function paint(ctx, gl, t, look) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (t < T.map) opening(ctx, t, look);
  else if (t < T.view) map(ctx, t, look);
  else view(ctx, gl, t, look);
  if (t >= T.pass) pass(ctx, gl, t, look);
  logoBar(ctx, look, t);
  ctx.restore();
}

// 1. The red dot, then the line: SUDAH DI SANA, SEBELUM KE SANA. The show and the countdown.
function opening(ctx, t, look) {
  house(ctx);
  const dk = pop(t / 380);
  const lines = ['SUDAH', 'DI SANA,', 'SEBELUM', 'KE SANA.'];
  const size = 92;
  let y = 330;
  lines.forEach((l, i) => {
    const k = ease((t - 350 - i * 140) / 480);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y - size, W, size * 1.08); ctx.clip();
    ctx.font = `900 ${size}px ${EXP}`; track(ctx, -2);
    ctx.fillStyle = i < 2 ? C.text : C.muted;
    ctx.fillText(l, 56, y + (1 - k) * size);
    ctx.restore();
    y += size * 1.02;
  });
  // The seat dot, after the last word.
  ctx.beginPath(); ctx.arc(56 + 18, y + 40, 18 * dk, 0, Math.PI * 2); ctx.fillStyle = C.seat; ctx.fill();
  pulse(ctx, 56 + 18, y + 40, 18, t);
  // The show, in mono, and the countdown in amber.
  const sk = ease((t - 1100) / 500);
  ctx.globalAlpha = sk;
  ctx.font = `800 64px ${CON}`; track(ctx, 0);
  ctx.fillStyle = C.text;
  ctx.fillText(look.e.title.toUpperCase(), 56, H - 250, W - 112);
  ctx.font = `500 26px ${MONO}`; ctx.fillStyle = C.muted;
  ctx.fillText(`${look.short} · ${look.place.name.toUpperCase()}`, 56, H - 200, W - 112);
  if (look.count) chip(ctx, look.count, 56, H - 150, C.amber, C.ink);
  ctx.globalAlpha = 1;
}

// 2. The venue from above: the seat dot drops in and the sight line runs to the stage.
function map(ctx, t, look) {
  house(ctx);
  const lt = t - T.map, m = look.map;
  const mx = (W - m.w) / 2, my = 330;
  // Out to the view: the map grows round the seat and fades.
  const zk = ease((t - (T.view - 600)) / 600);
  const z = 1 + zk * 5;
  ctx.save();
  ctx.globalAlpha = ease(lt / 400) * (1 - zk);
  ctx.translate(mx + m.seat.px, my + m.seat.py);
  ctx.scale(z, z);
  ctx.translate(-(mx + m.seat.px), -(my + m.seat.py));
  ctx.drawImage(m.canvas, mx, my);
  // The sight line, dashed, drawn from the seat to the stage.
  const lk = ease((lt - 700) / 900);
  const sx = mx + m.seat.px, sy = my + m.seat.py, ex = mx + m.stage.px, ey = my + m.stage.py;
  if (lk > 0) {
    ctx.strokeStyle = C.seat; ctx.lineWidth = 4; ctx.setLineDash([12, 10]); ctx.lineDashOffset = -t / 30;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (ex - sx) * lk, sy + (ey - sy) * lk); ctx.stroke();
    ctx.setLineDash([]);
  }
  const dk = pop((lt - 300) / 400);
  ctx.beginPath(); ctx.arc(sx, sy, 13 * dk, 0, Math.PI * 2); ctx.fillStyle = C.seat; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = C.house; ctx.stroke();
  pulse(ctx, sx, sy, 13, t);
  // The distance, on the line.
  if (look.metres && lk >= 1) {
    const k = ease((lt - 1600) / 350);
    ctx.globalAlpha *= k;
    chip(ctx, `${look.metres} M`, (sx + ex) / 2 + 18, (sy + ey) / 2, C.seat, '#fff', 28);
  }
  ctx.restore();
  // Words: the headline above, the coordinates below.
  ctx.save();
  ctx.globalAlpha = 1 - zk;
  ctx.font = `900 66px ${EXP}`; track(ctx, -1.5); ctx.fillStyle = C.text;
  ctx.fillText('INI KURSIKU.', 56, 250, W - 112);
  coordRow(ctx, look, 56, H - 230, ease((lt - 500) / 500), C.text, C.muted);
  ctx.font = `500 24px ${MONO}`; ctx.fillStyle = C.muted;
  if (look.metres) ctx.fillText(`± ${look.metres} M KE PANGGUNG`, 56, H - 120);
  ctx.restore();
}

// 3. The view from the seat, full frame.
function view(ctx, gl, t, look) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const k = ease((t - T.view) / 600);
  ctx.globalAlpha = k;
  ctx.drawImage(gl, 0, 0, W, H);
  ctx.globalAlpha = 1;
  shade(ctx);
  const wk = ease((t - T.view - 400) / 500) * (1 - ease((t - T.pass) / 400));
  if (wk <= 0) return;
  ctx.save();
  ctx.globalAlpha = wk;
  ctx.font = `900 64px ${EXP}`; track(ctx, -1.5); ctx.fillStyle = C.text;
  ctx.fillText('INI', 56, H - 356);
  ctx.fillText('PEMANDANGANKU.', 56, H - 292, W - 112);
  coordRow(ctx, look, 56, H - 150, 1, C.text, 'rgba(244,240,238,0.7)');
  ctx.restore();
}

// 4. The pass: a paper ticket over the view, the seat's numbers, and the question.
function pass(ctx, gl, t, look) {
  const k = ease((t - T.pass) / 650);
  ctx.fillStyle = `rgba(22,20,20,${0.62 * k})`; ctx.fillRect(0, 0, W, H);
  const tw = 600, th = 830, tx = (W - tw) / 2, ty = 136 + (1 - k) * 140;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  ticket(ctx, tx, ty, tw, th, 420);
  ctx.shadowColor = 'transparent';
  // The view, in the ticket's window.
  const wx = tx + 20, wy = ty + 20, ww = tw - 40, wh = 260;
  ctx.save(); round(ctx, wx, wy, ww, wh, 14); ctx.clip(); cover(ctx, gl, wx, wy, ww, wh);
  const g = ctx.createLinearGradient(0, wy + wh - 90, 0, wy + wh);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g; ctx.fillRect(wx, wy + wh - 90, ww, 90);
  ctx.restore();
  ctx.font = `600 18px ${MONO}`; ctx.fillStyle = '#fff';
  ctx.fillText('PEMANDANGAN DARI KURSIKU', wx + 18, wy + wh - 18);
  // The show.
  const p = tx + 36;
  ctx.fillStyle = C.ink;
  ctx.font = `800 58px ${CON}`; track(ctx, 0);
  ctx.fillText(look.e.title.toUpperCase(), p, ty + 352, tw - 72);
  ctx.font = `500 21px ${MONO}`; ctx.fillStyle = 'rgba(20,18,18,0.6)';
  ctx.fillText(`${look.short} · ${look.place.name.toUpperCase()}`, p, ty + 388, tw - 72);
  // The seat: the category, then block, row and seat in a grid.
  ctx.font = `600 15px ${MONO}`; ctx.fillStyle = 'rgba(20,18,18,0.55)';
  ctx.fillText('KATEGORI', p, ty + 470);
  ctx.beginPath(); ctx.arc(p + 9, ty + 496, 9, 0, Math.PI * 2); ctx.fillStyle = look.cat.color || C.seat; ctx.fill();
  ctx.font = `800 34px ${CON}`; ctx.fillStyle = C.ink;
  ctx.fillText(look.cat.name.toUpperCase(), p + 28, ty + 508, tw - 100);
  const cells = look.coords, widths = cells.length === 3 ? [0.5, 0.25, 0.25] : [0.6, 0.4];
  let cx = p;
  cells.forEach(([label, v], i) => {
    const cw = (tw - 72) * widths[i];
    ctx.font = `600 15px ${MONO}`; ctx.fillStyle = 'rgba(20,18,18,0.55)';
    ctx.fillText(label, cx, ty + 552);
    const big = !look.seat.standing && i > 0;
    ctx.font = `800 ${big ? 84 : 44}px ${CON}`; ctx.fillStyle = C.ink;
    ctx.fillText(v.toUpperCase(), cx, ty + (big ? 632 : 602), cw - 14);
    cx += cw;
  });
  // The distance, with its own little sight line.
  const dy = ty + 700;
  ctx.beginPath(); ctx.arc(p + 10, dy - 10, 10, 0, Math.PI * 2); ctx.fillStyle = C.seat; ctx.fill();
  ctx.strokeStyle = C.seat; ctx.lineWidth = 3; ctx.setLineDash([8, 7]);
  ctx.beginPath(); ctx.moveTo(p + 26, dy - 10); ctx.lineTo(p + 150, dy - 10); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = C.ink; ctx.fillRect(p + 152, dy - 22, 8, 24);
  ctx.font = `800 40px ${CON}`; ctx.fillStyle = C.ink;
  ctx.fillText(look.metres ? `${look.metres} M KE PANGGUNG` : 'DEKAT PANGGUNG', p + 180, dy, tw - 230);
  // Whose it is, and the countdown.
  const by = ty + th - 40;
  ctx.font = `700 20px ${MONO}`; ctx.fillStyle = C.ink;
  ctx.fillText(look.owner ? `PASS 3D · ${look.owner}` : 'PASS 3D', p, by);
  if (look.count) chip(ctx, look.count, tx + tw - 36, by - 8, C.amber, C.ink, 20, true);
  ctx.restore();
  // The question, for the next fan.
  const qk = ease((t - T.pass - 700) / 500);
  if (qk <= 0) return;
  ctx.save();
  ctx.globalAlpha = qk;
  const qy = ty + th + 96 + (1 - qk) * 20;
  ctx.font = `900 46px ${EXP}`; track(ctx, -1); ctx.fillStyle = C.text; ctx.textAlign = 'center';
  ctx.fillText('KAMU DUDUK DI MANA?', W / 2, qy, W - 80);
  ctx.font = `500 24px ${BODY}`; track(ctx, 0); ctx.fillStyle = C.muted;
  ctx.fillText('Lihat kursimu sebelum malamnya di atvents.com', W / 2, qy + 52, W - 80);
  ctx.restore();
}

// ---------------------------------------------------------------- drawing kit

// The paper ticket: rounded, with a notch cut each side at the tear and a dashed tear line.
function ticket(ctx, x, y, w, h, tear) {
  ctx.beginPath();
  const r = 22, n = 18, ty = y + tear;
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, ty - n, r);
  ctx.lineTo(x + w, ty - n); ctx.arc(x + w, ty, n, -Math.PI / 2, Math.PI / 2, true);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, ty + n, r);
  ctx.lineTo(x, ty + n); ctx.arc(x, ty, n, Math.PI / 2, -Math.PI / 2, true);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  ctx.fillStyle = C.paper; ctx.fill();
  ctx.save(); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(20,18,18,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
  ctx.beginPath(); ctx.moveTo(x + 30, ty); ctx.lineTo(x + w - 30, ty); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}

// The seat's coordinates in a row: small mono labels over the values.
function coordRow(ctx, look, x, y, k, fg, dim) {
  ctx.save(); ctx.globalAlpha *= Math.max(0, ease(k * 1.6));
  ctx.beginPath(); ctx.arc(x + 8, y - 74, 8, 0, Math.PI * 2); ctx.fillStyle = look.cat.color || C.seat; ctx.fill();
  ctx.font = `600 20px ${MONO}`; ctx.fillStyle = dim; ctx.fillText(look.cat.name.toUpperCase(), x + 26, y - 67, W - 140);
  ctx.restore();
  const cells = look.coords, cw = (W - 112) / cells.length;
  cells.forEach(([label, v], i) => {
    const ck = ease((k * 1.6) - i * 0.15);
    ctx.globalAlpha *= 1; ctx.save(); ctx.globalAlpha *= Math.max(0, ck);
    ctx.font = `600 16px ${MONO}`; ctx.fillStyle = dim; ctx.fillText(label, x + i * cw, y);
    ctx.font = `800 48px ${CON}`; ctx.fillStyle = fg; ctx.fillText(v.toUpperCase(), x + i * cw, y + 52, cw - 14);
    ctx.restore();
  });
}

// A chip of mono caps: left edge at x (right edge when `right`), centred on y.
function chip(ctx, text, x, y, bg, fg, size = 24, right = false) {
  ctx.save();
  ctx.font = `700 ${size}px ${MONO}`; track(ctx, 1);
  const w = ctx.measureText(text).width + size * 1.2, h = size * 1.8, x0 = right ? x - w : x;
  ctx.fillStyle = bg; round(ctx, x0, y - h / 2, w, h, h / 2); ctx.fill();
  ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + size * 0.6, y + 1);
  ctx.restore();
}

// A ring spreading from the seat dot, once a second.
function pulse(ctx, x, y, r, t) {
  const b = (t % 1100) / 1100;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r + b * r * 2.2, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(236,84,70,${0.6 * (1 - b)})`; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
}

// The dark house, warm in the middle like a hall before the lights go down.
function house(ctx) {
  ctx.fillStyle = C.house; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.55, 40, W / 2, H * 0.55, 900);
  g.addColorStop(0, 'rgba(60,40,36,0.55)'); g.addColorStop(1, 'rgba(22,20,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function shade(ctx) {
  let g = ctx.createLinearGradient(0, 0, 0, 220);
  g.addColorStop(0, 'rgba(22,20,20,0.75)'); g.addColorStop(1, 'rgba(22,20,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 220);
  g = ctx.createLinearGradient(0, H - 520, 0, H);
  g.addColorStop(0, 'rgba(22,20,20,0)'); g.addColorStop(1, 'rgba(22,20,20,0.95)');
  ctx.fillStyle = g; ctx.fillRect(0, H - 520, W, 520);
}

// The logo, top left, and the brand's line, top right, on every frame.
function logoBar(ctx, look, t) {
  if (look.logo) ctx.drawImage(look.logo, 56, 62, 28 * LOGO_AR.web, 28);
  ctx.save();
  ctx.font = `500 18px ${MONO}`; ctx.fillStyle = 'rgba(244,240,238,0.7)'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('ATVENTS.COM', W - 56, 77);
  ctx.restore();
}

// The 3D frame, cropped to fill a box. The renderer's canvas can be any size behind the
// 9:16 frame, so its own size is read.
function cover(ctx, img, x, y, w, h) {
  const iw = img.width || W, ih = img.height || H;
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const pop = t => { t = Math.min(1, Math.max(0, t)); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// Letter spacing where the browser draws it (Chrome, Safari 18); plain elsewhere.
function track(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; }

function round(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------------------------------------------------------------- the sheet

function openSheet() {
  $('#story')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="story" id="story" role="dialog" aria-modal="true" aria-label="Story">
      <div class="story-card">
        <div class="story-frame"><div class="story-stage" id="story-stage"></div><canvas id="story-canvas" width="${W}" height="${H}"></canvas><video id="story-video" playsinline loop muted hidden></video></div>
        <div class="story-side">
          <p class="eyebrow">Your story</p>
          <h2 id="story-title">Making your seat pass</h2>
          <p id="story-note">Your seat on the map, the view from it and your pass, about 12 seconds. Keep this tab open.</p>
          <div class="story-bar"><i id="story-bar"></i></div>
          <div class="story-actions" id="story-actions"><button class="btn btn-line btn-sm" type="button" data-story="close">Cancel</button></div>
        </div>
      </div>
    </div>`);
  const root = $('#story');
  // The stage is drawn at 540 × 960 and scaled to the frame. The scale is set from here:
  // dividing one length by another in CSS only works in the newest browsers.
  const frame = root.querySelector('.story-frame');
  const fit = () => frame.style.setProperty('--k', String(frame.clientWidth / 540 || 1));
  fit();
  if (window.ResizeObserver) new ResizeObserver(fit).observe(frame); else window.addEventListener('resize', fit);
  let files = {}, urls = [], text = '';
  root.addEventListener('click', async ev => {
    const act = ev.target.closest('[data-story]')?.dataset.story;
    if (act === 'close') { urls.forEach(u => URL.revokeObjectURL(u)); root.remove(); }
    if (act === 'share' && files.share) {
      try { await navigator.share({ files: [files[act]], title: 'My seat', text }); } catch { /* closed the share sheet */ }
    }
  });
  return {
    stage: $('#story-stage'),
    canvas: $('#story-canvas'),
    progress(k, label) { $('#story-bar').style.transform = `scaleX(${k})`; $('#story-note').textContent = `${label}…`; },
    done(video, e, seat) {
      const vurl = URL.createObjectURL(video);
      urls = [vurl];
      files = { share: video };
      // What WhatsApp, X and the like post with it; Instagram takes the file alone.
      const where = seat.standing ? seat.secName : `Row ${seat.row}, Seat ${seat.num}`;
      text = `I'm going to ${e.title}! ${where}. Where are you sitting? ${location.origin}/#event-${e.id}`;
      const v = $('#story-video');
      v.src = vurl; v.hidden = false; v.play().catch(() => {});
      $('#story-canvas').hidden = true;
      $('#story-bar').style.transform = 'scaleX(1)';
      $('#story-title').textContent = 'Your seat pass is ready';
      const canShare = !!navigator.canShare?.({ files: [video] });
      $('#story-note').textContent = canShare
        ? 'Post it to your story and let your friends answer where they are sitting.'
        : 'Save it, then post it as a story from Instagram or TikTok on your phone.';
      $('#story-actions').innerHTML = `
        ${canShare ? `<button class="btn btn-coral" type="button" data-story="share">${icon('i-share', 'lead')}<span>Share video to story</span></button>` : `<a class="btn btn-coral" href="${vurl}" download="${esc(video.name)}">${icon('i-down', 'lead')}<span>Save video</span></a>`}
        ${canShare ? `<a class="link" href="${vurl}" download="${esc(video.name)}">Save the video to this device</a>` : ''}
        <button class="link" type="button" data-story="close">Close</button>`;
      state.lastStory = { name: video.name, size: video.size, type: video.type, event: e.id };
    },
    fail() {
      $('#story-title').textContent = 'The video could not be made';
      $('#story-note').textContent = 'Your device ran out of memory or stopped the recording. Close other tabs and try again.';
      $('#story-actions').innerHTML = '<button class="btn btn-line btn-sm" type="button" data-story="close">Close</button>';
    },
  };
}
