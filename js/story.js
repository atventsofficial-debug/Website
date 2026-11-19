// The story a fan posts once their pass is paid: a 14-second vertical film, with sound, for
// an Instagram or TikTok story. No slogans: the venue in the dark, the fan's seat lit red
// and a sight line drawn from it to the stage, the camera's flight into the seat as the
// show's lights come up, the seat's numbers ticking in, and the paper pass. The look is the
// brand book's (dark house, one seat red, amber for the countdown, ticket paper, Archivo and
// JetBrains Mono); the sound is made in the browser (sfx.js).
//
// The film is a second, hidden copy of the venue at 720 x 1280; the marks are drawn over
// each frame on a 2D canvas, and picture and sound are recorded together with
// MediaRecorder. Nothing on it can open the pass: no pass id, key or link of the fan's.
import { getEvent } from './events.js';
import { crowdSeats } from './layouts.js';
import { whenOf } from './when.js';
import { placeSeat, numberingOf } from './seatflip.js';
import { loadScene3d } from './viewer.js';
import { createSfx } from './sfx.js';
import { $, esc, icon, toast, state } from './ui.js';

const W = 720, H = 1280;
const wait = ms => new Promise(r => setTimeout(r, ms));
// MP4 first: Instagram and TikTok take it everywhere. WebM where the browser records no MP4.
const TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const pickType = () => TYPES.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
const slug = t => (t || 'concert').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// When each beat began, in ms on the film's clock, and the sounds cued: read by the frame
// painter, and by the offline render of the preview (scripts are not part of the site).
export const clock = { t0: 0, at: {}, cues: [] };
const now = () => performance.now() - clock.t0;

let busy = false;

export async function makeStory(pass) {
  if (busy || !pass) return;
  const type = pickType();
  if (!type || !HTMLCanvasElement.prototype.captureStream) { toast('This browser cannot record video. Try Chrome or Safari on your phone.'); return; }
  const venue = getEvent(pass.eventId), i = venue?.seatById.get(pass.seat);
  if (i === undefined) return;
  busy = true;
  // The ticket's seat is what the marks say; `at` is where it is in the model when the
  // fan set the venue's numbering the other way (seatflip.js).
  const seat = venue.seats[i], at = placeSeat(venue, seat, numberingOf(venue, pass)), cat = venue.catById[pass.cat];
  // Sound starts from the fan's tap, which is what lets a page make it.
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = AC ? new AC() : null;
  ac?.resume?.().catch(() => {});
  const sheet = openSheet();
  let scene = null, rec = null;
  try {
    const font = loadFonts();
    const logo = loadImage('assets/brand/atvents-logo-light.svg');
    const { SeatScene } = await loadScene3d();
    await font;
    // The flight's turn towards the stage starts the cut to black (see paint).
    let onTurn = null;
    scene = new SeatScene(sheet.stage, { quality: 'medium', interactive: false, labels: false, fps: 30, drift: 0.05, onMode: m => { if (m === 'turning') onTurn?.(); } });
    scene.renderer.setPixelRatio(W / sheet.stage.clientWidth);
    scene.resize();
    const crowd = crowdSeats(venue);
    crowd.delete(at.id);
    if (!(await scene.load(venue, crowd))) throw new Error('load');
    scene.setCrowd(true);
    scene.setLabels(false);
    await waitShown(scene);
    // The venue as it is (its own seat colours), the fan's seat in red, from above.
    scene.realColors = true;
    scene.setMine([at.id]);
    scene.resetView();
    await scene.settled();
    sheet.progress(0.15, 'Lights down');

    const look = lookOf(venue, seat, at, cat, scene, { logo: await logo });
    const out = sheet.canvas, ctx = out.getContext('2d');
    Object.assign(clock, { t0: performance.now(), at: {}, cues: [] });
    scene.afterRender = gl => paint(ctx, gl, now(), look);

    // Picture and sound, into one recording.
    const stream = out.captureStream(30);
    let sfx = null;
    if (ac) {
      const dest = ac.createMediaStreamDestination();
      sfx = createSfx(ac, dest);
      dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
    }
    const cue = (name, ...args) => { clock.cues.push([name, now(), args]); if (sfx) sfx[name](ac.currentTime + 0.02, ...args); };
    const mark = name => { clock.at[name] = now(); };

    const chunks = [];
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6, audioBitsPerSecond: 160e3 });
    rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start(250);

    // 1. The house in the dark, turning slowly; the seat lights up and the sight line runs
    // to the stage.
    cue('room', 15);
    // A slow push in, turning, towards the space between the seat and the stage.
    scene.orbit(30, 4.4, { push: 0.6, toward: look.seatAt.map((v, k) => (v + look.focus[k]) / 2) });
    await wait(900); mark('dot'); cue('seat');
    await wait(500); mark('line');
    await wait(1200); mark('tag');
    for (let k = 0; k < 4; k++) setTimeout(() => cue('flap', 0.18), k * 45);
    sheet.progress(0.35, 'Your seat');
    await scene.settled();
    // 2. Into the seat. The show's lights come up on the turn.
    // The flight starts wide and ends in the dark: the close pass over the seats and the
    // turn happen unseen, and the picture comes back on the stage as its lights switch on.
    mark('fly'); cue('near', 4);
    onTurn = () => { mark('turn'); setTimeout(() => { mark('up'); cue('lights', 3); cue('cheer', 3.2); }, 1150); };
    scene.flyToSeat(at);
    look.flyMs = (scene.flyDur || 2) * 1000;
    await scene.settled();
    mark('seat');
    sheet.progress(0.65, 'The view from your seat');
    await wait(600); mark('ticker');
    look.ticker.split('').forEach((ch, k) => { if (ch !== ' ') setTimeout(() => cue('flap', 0.15), k * 38); });
    await wait(2200);
    // 3. The pass.
    mark('pass'); setTimeout(() => cue('stamp'), 560);
    sheet.progress(0.85, 'Your pass');
    await wait(3000);
    mark('end');
    await wait(600);
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
    ac?.close?.().catch(() => {});
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

const C = { house: '#161414', seat: '#ec5446', amber: '#ff9a3c', paper: '#fbf8f6', text: '#f4f0ee', muted: '#a29895', ink: '#141212' };
const CON = '"Atvents Condensed", "Archivo", "Arial Narrow", sans-serif';
const MONO = '"Atvents Mono", "JetBrains Mono", ui-monospace, Menlo, monospace';
const LOGO_AR = 4724 / 900;   // assets/brand/atvents-logo-light.svg's viewBox

// The brand's type, from the site's own files (assets/fonts, SIL Open Font License). One
// variable Archivo serves both widths: each face pins the width axis.
export async function loadFonts() {
  if (!window.FontFace || !document.fonts) return;
  const faces = [
    new FontFace('Atvents Condensed', 'url(assets/fonts/archivo-latin-wdth-wght.woff2)', { weight: '100 900', stretch: '62%' }),
    new FontFace('Atvents Mono', 'url(assets/fonts/jetbrains-mono-latin-wght.woff2)', { weight: '100 800' }),
  ];
  await Promise.all(faces.map(f => f.load().then(x => document.fonts.add(x)).catch(() => {})));
}

// "H-4": days to the show on the fan's calendar, as Indonesian fans count them.
export function countdown(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  const day = t => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const n = Math.round((day(ms) - day(now)) / 864e5);
  return n > 1 ? `H-${n}` : n === 1 ? 'H-1' : '';
}

// Everything the frames draw, worked out once.
function lookOf(venue, seat, at, cat, scene, { logo = null } = {}) {
  const e = venue.meta, when = whenOf(e), d = new Date(when.ms);
  const focus = scene.focus ? [scene.focus.x, scene.focus.y, scene.focus.z] : [venue.stageX ?? -40, 2, 0];
  const metres = Math.max(1, Math.round(Math.hypot(at.x - focus[0], at.z - focus[2])));
  const cells = seat.standing ? [['AREA', seat.secName]] : [['BLOK', String(seat.sec || seat.secName)], ['BARIS', String(seat.row)], ['KURSI', String(seat.num)]];
  return {
    e, seat, cat, place: venue.place, logo, scene, focus, metres, cells,
    seatAt: [at.x, at.y + 0.5, at.z],
    count: countdown(when.ms),
    date: Number.isFinite(when.ms) ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : '',
    ticker: cells.map(([k, v]) => `${k} ${v}`.toUpperCase()).join('   '),
  };
}

// ---------------------------------------------------------------- the frame

let grain = null;

export function paint(ctx, gl, t, look) {
  const A = clock.at;
  ctx.save();
  ctx.drawImage(gl, 0, 0, W, H);
  vignette(ctx);
  // Over the venue, before the flight: the seat, the sight line, the show.
  const away = A.fly != null ? ease((t - A.fly) / 500) : 0;
  if (away < 1) {
    ctx.globalAlpha = 1 - away;
    sightline(ctx, t, look);
    show(ctx, t, look);
    ctx.globalAlpha = 1;
  }
  // In the seat: its numbers ticking in.
  if (A.ticker != null) ticker(ctx, t - A.ticker, look, A.pass != null ? 1 - ease((t - A.pass) / 400) : 1);
  if (A.pass != null) passCard(ctx, gl, t - A.pass, look);
  film(ctx, t);
  // In from black, out to it, and the cut in the flight: down to black on the way into the
  // stands, back up when the lights switch on.
  const cut = A.fly == null ? 0 : A.up != null ? 1 - ease((t - A.up) / 320) : ease((t - A.fly - Math.max(500, look.flyMs - 1000)) / 400);
  const black = Math.max(1 - ease(t / 700), cut, A.end != null ? ease((t - A.end) / 550) : 0);
  if (black > 0) { ctx.fillStyle = `rgba(0,0,0,${black})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// The seat's red dot and the dashed line from it to the stage, both placed in the 3D view.
function sightline(ctx, t, look) {
  const A = clock.at;
  if (A.dot == null) return;
  const s = project(look.scene.camera, look.seatAt), f = project(look.scene.camera, look.focus);
  if (!s) return;
  if (A.line != null && f) {
    const k = ease((t - A.line) / 1100);
    ctx.save();
    ctx.strokeStyle = C.seat; ctx.lineWidth = 3; ctx.setLineDash([10, 9]); ctx.lineDashOffset = -t / 40;
    ctx.shadowColor = 'rgba(236,84,70,0.8)'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + (f.x - s.x) * k, s.y + (f.y - s.y) * k); ctx.stroke();
    ctx.setLineDash([]);
    if (k >= 1) { ctx.beginPath(); ctx.arc(f.x, f.y, 4, 0, Math.PI * 2); ctx.fillStyle = C.paper; ctx.fill(); }
    ctx.restore();
    // The distance, ticking in beside the line's middle.
    if (A.tag != null) {
      const txt = `${look.metres} M`, n = Math.min(txt.length, Math.floor((t - A.tag) / 45));
      if (n > 0) {
        const mx = (s.x + f.x) / 2, my = (s.y + f.y) / 2;
        ctx.save();
        ctx.font = `600 22px ${MONO}`;
        const w = ctx.measureText(txt).width + 22;
        ctx.fillStyle = 'rgba(22,20,20,0.82)'; round(ctx, mx + 14, my - 18, w, 34, 6); ctx.fill();
        ctx.fillStyle = C.text; ctx.textBaseline = 'middle';
        ctx.fillText(txt.slice(0, n), mx + 25, my);
        ctx.restore();
      }
    }
  }
  const dk = pop((t - A.dot) / 420);
  pulse(ctx, s.x, s.y, 9, t - A.dot);
  ctx.beginPath(); ctx.arc(s.x, s.y, 9 * dk, 0, Math.PI * 2);
  ctx.fillStyle = C.seat; ctx.shadowColor = 'rgba(236,84,70,0.9)'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
}

// The show, small and low: its name, then the date and the venue in mono.
function show(ctx, t, look) {
  const k = ease((t - 600) / 900);
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha *= k;
  ctx.translate(0, (1 - k) * 14);
  ctx.fillStyle = C.text;
  ctx.font = `800 60px ${CON}`;
  ctx.fillText(look.e.title.toUpperCase(), 56, H - 150, W - 112);
  ctx.font = `500 21px ${MONO}`; ctx.fillStyle = 'rgba(244,240,238,0.7)';
  ctx.fillText(`${look.date}  ·  ${look.place.name.toUpperCase()}`, 56, H - 108, W - 112);
  ctx.restore();
}

// The seat's numbers, typed in mono along the bottom.
function ticker(ctx, lt, look, alpha) {
  if (alpha <= 0) return;
  const n = Math.floor(lt / 38);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 26px ${MONO}`; ctx.fillStyle = C.text;
  const txt = look.ticker.slice(0, Math.max(0, n));
  ctx.fillText(txt, 56, H - 100, W - 112);
  if (n < look.ticker.length + 6 && Math.floor(lt / 260) % 2 === 0) {
    const w = ctx.measureText(txt).width;
    ctx.fillStyle = C.seat; ctx.fillRect(56 + w + 4, H - 124, 12, 28);
  }
  ctx.restore();
}

// The paper pass, rising over the view as it dims.
function passCard(ctx, gl, lt, look) {
  const k = ease(lt / 750);
  ctx.fillStyle = `rgba(14,12,12,${0.58 * k})`; ctx.fillRect(0, 0, W, H);
  const tw = 560, th = 600, tx = (W - tw) / 2, ty = (H - th) / 2 + (1 - k) * 260;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 1.4);
  ctx.translate(tx + tw / 2, ty + th / 2);
  ctx.rotate((1 - k) * 0.05);
  ctx.translate(-tw / 2, -th / 2);
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 26;
  ticket(ctx, 0, 0, tw, th, 250);
  ctx.shadowColor = 'transparent';
  const p = 40;
  if (look.logo) ctx.drawImage(look.logo, p, 40, 24 * LOGO_AR, 24);
  if (look.count) chip(ctx, look.count, tw - p, 52, C.amber, C.ink);
  ctx.fillStyle = C.ink; ctx.font = `800 60px ${CON}`;
  ctx.fillText(look.e.title.toUpperCase(), p, 160, tw - p * 2);
  ctx.font = `500 19px ${MONO}`; ctx.fillStyle = 'rgba(20,18,18,0.6)';
  ctx.fillText(`${look.date}  ·  ${look.place.name.toUpperCase()}`, p, 198, tw - p * 2);
  // Below the tear: the category, then the seat's numbers.
  ctx.beginPath(); ctx.arc(p + 8, 304, 8, 0, Math.PI * 2); ctx.fillStyle = look.cat.color || C.seat; ctx.fill();
  ctx.font = `800 30px ${CON}`; ctx.fillStyle = C.ink;
  ctx.fillText(look.cat.name.toUpperCase(), p + 26, 315, tw - p * 2 - 26);
  const widths = look.cells.length === 3 ? [0.44, 0.28, 0.28] : [1];
  let x = p;
  look.cells.forEach(([label, v], i) => {
    const w = (tw - p * 2) * widths[i];
    ctx.font = `600 14px ${MONO}`; ctx.fillStyle = 'rgba(20,18,18,0.5)';
    ctx.fillText(label, x, 372);
    const big = look.cells.length === 3 && i > 0;
    ctx.font = `800 ${big ? 92 : 46}px ${CON}`; ctx.fillStyle = C.ink;
    ctx.fillText(v.toUpperCase(), x - (big ? 3 : 0), big ? 456 : 424, w - 12);
    x += w;
  });
  // The sight line, small, and how far it runs.
  const ly = 530;
  ctx.beginPath(); ctx.arc(p + 8, ly, 8, 0, Math.PI * 2); ctx.fillStyle = C.seat; ctx.fill();
  ctx.strokeStyle = C.seat; ctx.lineWidth = 3; ctx.setLineDash([8, 7]);
  ctx.beginPath(); ctx.moveTo(p + 24, ly); ctx.lineTo(tw - p - 120, ly); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = C.ink; ctx.fillRect(tw - p - 118, ly - 12, 6, 24);
  ctx.font = `700 26px ${MONO}`; ctx.textAlign = 'right';
  ctx.fillText(`${look.metres} M`, tw - p, ly + 9);
  ctx.restore();
}

// ---------------------------------------------------------------- drawing kit

// A point in the venue to a point on the frame, through the 3D camera. Null behind it.
function project(cam, [x, y, z]) {
  if (!cam) return null;
  cam.updateMatrixWorld();
  const v = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
  const vx = v[0] * x + v[4] * y + v[8] * z + v[12], vy = v[1] * x + v[5] * y + v[9] * z + v[13], vz = v[2] * x + v[6] * y + v[10] * z + v[14];
  const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12], cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13], cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
  if (cw <= 0.01) return null;
  return { x: (cx / cw + 1) / 2 * W, y: (1 - cy / cw) / 2 * H };
}

// The paper ticket: rounded, a notch cut each side at the tear, the tear dashed.
function ticket(ctx, x, y, w, h, tear) {
  const r = 20, n = 16, ty = y + tear;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, ty - n, r);
  ctx.lineTo(x + w, ty - n); ctx.arc(x + w, ty, n, -Math.PI / 2, Math.PI / 2, true);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, ty + n, r);
  ctx.lineTo(x, ty + n); ctx.arc(x, ty, n, Math.PI / 2, -Math.PI / 2, true);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  ctx.fillStyle = C.paper; ctx.fill();
  ctx.save(); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(20,18,18,0.22)'; ctx.lineWidth = 2; ctx.setLineDash([7, 8]);
  ctx.beginPath(); ctx.moveTo(x + 28, ty); ctx.lineTo(x + w - 28, ty); ctx.stroke();
  ctx.restore();
}

// A small chip of mono caps, its right edge at x, centred on y.
function chip(ctx, text, x, y, bg, fg) {
  ctx.save();
  ctx.font = `700 18px ${MONO}`;
  const w = ctx.measureText(text).width + 22;
  ctx.fillStyle = bg; round(ctx, x - w, y - 16, w, 32, 16); ctx.fill();
  ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, x - w + 11, y + 1);
  ctx.restore();
}

// Rings spreading from the seat dot.
function pulse(ctx, x, y, r, lt) {
  for (let i = 0; i < 2; i++) {
    const b = ((lt / 1400) + i * 0.5) % 1;
    if (lt < i * 700) continue;
    ctx.beginPath(); ctx.arc(x, y, r + b * 34, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(236,84,70,${0.55 * (1 - b)})`; ctx.lineWidth = 2; ctx.stroke();
  }
}

function vignette(ctx) {
  const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const b = ctx.createLinearGradient(0, H - 380, 0, H);
  b.addColorStop(0, 'rgba(14,12,12,0)'); b.addColorStop(1, 'rgba(14,12,12,0.85)');
  ctx.fillStyle = b; ctx.fillRect(0, H - 380, W, 380);
}

// Film grain, a little, moving every frame.
function film(ctx, t) {
  if (!grain) {
    grain = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const g = grain.getContext('2d'), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay';
  const ox = (Math.floor(t / 41) * 97) % 256, oy = (Math.floor(t / 41) * 57) % 256;
  ctx.fillStyle = ctx.createPattern(grain, 'repeat');
  ctx.translate(-ox, -oy); ctx.fillRect(ox, oy, W, H);
  ctx.restore();
}

const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const pop = t => { t = Math.min(1, Math.max(0, t)); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

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
          <p id="story-note">About 14 seconds, with sound. Keep this tab open.</p>
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
