// The story at the end of a seat tour: a vertical 9:16 clip, about 15 seconds, of the same
// three steps the fan just took (the whole venue, their category, the view from their seat),
// ending on their seat pass. Every fan's story has the same look,
// in the colours of their show, so the stories of one concert read as a set and each one
// asks the next fan where they are sitting. It is rendered from a second, hidden copy of the
// venue at 720 x 1280, drawn onto a 2D canvas with the words and recorded with MediaRecorder.
// Phones get it through the share sheet (Instagram and TikTok take it from there as a
// story); everywhere else it downloads.
import { getEvent } from './events.js';
import { crowdSeats } from './layouts.js';
import { whenOf } from './when.js';
import { placeSeat, numberingOf } from './seatflip.js';
import { themeOf } from './themes.js';
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
  const seat = venue.seats[i], at = placeSeat(venue, seat, numberingOf(venue, pass)), cat = venue.catById[pass.cat], e = venue.meta;
  const sheet = openSheet();
  let scene = null, rec = null;
  try {
    // The font (css/styles.css) and the logo: a canvas fetches neither by itself.
    const font = Promise.all(['500', '700', '800', '900'].map(w => document.fonts?.load(`${w} 30px Inter`))).catch(() => {});
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

    // The words, drawn over each frame the moment the frame is drawn.
    const when = whenOf(e), glow = themeOf(venue).glow || '#e8480f';
    const look = { e, seat, cat, when, place: venue.place, glow, glowText: lift(glow), count: countdown(when.ms), owner: firstName(pass.name), logo: await logo };
    look.beats = beats(look);
    const out = sheet.canvas, ctx = out.getContext('2d');
    const cap = { step: 1, at: performance.now(), end: 0 };
    const go = step => Object.assign(cap, { step, at: performance.now() });
    scene.afterRender = gl => paint(ctx, gl, cap, look);

    const chunks = [];
    rec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 8e6 });
    rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start(250);
    sheet.progress(0.05, 'The venue');

    // 1. The whole venue: I'm going.
    scene.resetView();
    await scene.settled();
    scene.orbit(28, 3.2);
    await scene.settled();
    // 2. The fan's category, their seat marked.
    go(2);
    sheet.progress(0.35, cat.name);
    scene.setFilter(cat.id);
    scene.setMine([at.id]);
    scene.frameCategory(cat.id, { seat: at, dur: 2.4 });
    await scene.settled();
    await wait(900);
    // 3. Into the seat, a few seconds of the view, then the seat pass over it.
    go(3);
    sheet.progress(0.6, 'Your seat');
    scene.flyToSeat(at);
    await scene.settled();
    await wait(2200);
    cap.end = performance.now();
    sheet.progress(0.88, 'Your seat pass');
    await wait(1800);
    await wait(1800);
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
    const name = `atvents-${slug(e.title)}-my-seat`;
    sheet.done(new File([blob], `${name}.${ext}`, { type: blob.type }), e, seat);
  } catch (err) {
    if (rec?.state === 'recording') rec.stop();
    sheet.fail();
  } finally {
    if (scene) { scene.afterRender = null; scene.dispose(); }
    busy = false;
  }
}

function loadImage(src) {
  return new Promise(r => {
    const img = new Image();
    img.onload = () => r(img);
    img.onerror = () => r(null);
    img.src = src;
  });
}

const waitShown = scene => new Promise(r => { const t = () => (scene.shown || scene.disposed ? r() : setTimeout(t, 60)); t(); });

// ---------------------------------------------------------------- the frame
//
// One look for every fan, like a story template everyone fills in: the concert's colours,
// the countdown, three beats (I'm going, my category, my view) and, for the last seconds, the
// seat pass: the view from the seat in a window, the seat in big type, and a sticker that
// asks the next person where they are sitting.

const FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';
// The logo's viewBox (assets/brand/atvents-logo-web.svg): an SVG without a size has none to read.
const LOGO_AR = 4635 / 818;
const PAPER = '#f6f1ea', INK = '#141212', MUTED = '#6e6664', CORAL = '#e8480f';
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const pop = t => { t = Math.min(1, Math.max(0, t)); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// "4 DAYS TO GO", counted in calendar days on the fan's clock.
export function countdown(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  const day = t => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const n = Math.round((day(ms) - day(now)) / 864e5);
  return n > 1 ? `${n} DAYS TO GO` : n === 1 ? 'TOMORROW' : n === 0 ? 'TONIGHT' : 'I WAS THERE';
}

// The words of each beat.
export function beats({ e, seat, cat, place, when }) {
  return {
    1: { kicker: "I'M GOING TO", title: e.title, sub: `${when.date} · ${place.name}` },
    2: { kicker: 'MY CATEGORY', title: cat.name, sub: place.name, dot: cat.color },
    3: seat.standing
      ? { kicker: 'MY SPOT', title: seat.secName, sub: `${cat.name} · standing` }
      : { kicker: 'MY VIEW FROM', title: `Row ${seat.row}\nSeat ${seat.num}`, sub: `${seat.secName} · ${cat.name}` },
  };
}

let blurCanvas = null, cardCanvas = null;

export function paint(ctx, gl, cap, look) {
  const now = performance.now();
  const endK = cap.end ? ease((now - cap.end) / 650) : 0;

  // The 3D view, and over it, once the pass comes in, the same view blurred and darkened.
  ctx.drawImage(gl, 0, 0, W, H);
  if (endK > 0) {
    blurCanvas ||= Object.assign(document.createElement('canvas'), { width: 36, height: 64 });
    const b = blurCanvas.getContext('2d');
    b.drawImage(gl, 0, 0, 36, 64);
    ctx.save();
    ctx.globalAlpha = endK;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(blurCanvas, 0, 0, W, H);
    ctx.fillStyle = 'rgba(10, 8, 8, 0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // The show's glow at the top, and shade top and bottom so the type reads over a bright stage.
  let g = ctx.createRadialGradient(W / 2, -120, 40, W / 2, -120, 760);
  g.addColorStop(0, hexA(look.glow, 0.55)); g.addColorStop(1, hexA(look.glow, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createLinearGradient(0, 0, 0, 260);
  g.addColorStop(0, 'rgba(12,10,10,0.75)'); g.addColorStop(1, 'rgba(12,10,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 260);
  if (endK < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - endK;
    g = ctx.createLinearGradient(0, H - 560, 0, H);
    g.addColorStop(0, 'rgba(12,10,10,0)'); g.addColorStop(0.55, 'rgba(12,10,10,0.72)'); g.addColorStop(1, 'rgba(12,10,10,0.94)');
    ctx.fillStyle = g; ctx.fillRect(0, H - 560, W, 560);
    beat(ctx, look.beats[cap.step], now - cap.at, look);
    ctx.restore();
  }

  // Top: the brand and the countdown, on every frame.
  if (look.logo) ctx.drawImage(look.logo, 52, 62, 30 * LOGO_AR, 30);
  else { ctx.fillStyle = '#fff'; ctx.font = `700 32px ${FONT}`; ctx.fillText('atvents', 52, 90); }
  if (look.count) pill(ctx, look.count, W - 52, 77, look.glow);

  if (endK > 0) pass(ctx, gl, endK, now - cap.end, look);
}

// One beat's words at the bottom, sliding up as the beat starts.
function beat(ctx, b, t, look) {
  if (!b) return;
  const k = ease(t / 520), dy = (1 - k) * 36;
  ctx.save();
  ctx.globalAlpha *= k;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `900 84px ${FONT}`;
  track(ctx, -2.5);
  const lines = lay(ctx, b.title.toUpperCase(), W - 104, 3);
  const lh = 82, y1 = H - 150 - (lines.length - 1) * lh + dy;
  ctx.fillStyle = look.glowText;
  ctx.font = `800 26px ${FONT}`;
  track(ctx, 3);
  let x = 52;
  if (b.dot) { ctx.beginPath(); ctx.arc(x + 9, y1 - 92, 9, 0, Math.PI * 2); ctx.fillStyle = b.dot; ctx.fill(); x += 30; ctx.fillStyle = look.glowText; }
  ctx.fillText(b.kicker, x, y1 - 83);
  ctx.fillStyle = '#fff';
  ctx.font = `900 84px ${FONT}`;
  track(ctx, -2.5);
  lines.forEach((l, i) => ctx.fillText(l, 52, y1 + i * lh, W - 104));
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `500 28px ${FONT}`;
  track(ctx, 0);
  ctx.fillText(b.sub, 52, H - 92 + dy, W - 104);
  ctx.restore();
}

// The seat pass: a ticket with the view from the seat in its window.
function pass(ctx, gl, k, t, look) {
  const cw = 600, ch = 960, cx = 60, cy = 128;
  cardCanvas ||= Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const c = cardCanvas.getContext('2d');
  c.clearRect(0, 0, cw, ch);
  // The window: the live view from the seat, cropped to fill it.
  const wx = 18, wy = 18, ww = cw - 36, wh = 340;
  c.save();
  round(c, wx, wy, ww, wh, 22); c.clip();
  const s = Math.max(ww / W, wh / H), sw = ww / s, sh = wh / s;
  c.drawImage(gl, (W - sw) / 2, (H - sh) * 0.42, sw, sh, wx, wy, ww, wh);
  const wg = c.createLinearGradient(0, wy + wh - 140, 0, wy + wh);
  wg.addColorStop(0, 'rgba(0,0,0,0)'); wg.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = wg; c.fillRect(wx, wy + wh - 140, ww, 140);
  c.restore();
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#fff';
  c.font = `800 20px ${FONT}`; track(c, 3);
  c.fillText('THE VIEW FROM MY SEAT', wx + 24, wy + wh - 26);
  // The show.
  let y = wy + wh + 58;
  c.fillStyle = CORAL;
  c.font = `800 19px ${FONT}`; track(c, 3);
  c.fillText(look.owner ? `${look.owner}'S SEAT · 3D SEAT PASS` : '3D SEAT PASS', 36, y, cw - 72);
  c.fillStyle = INK;
  c.font = `900 50px ${FONT}`; track(c, -1.5);
  const tl = lay(c, look.e.title.toUpperCase(), cw - 72, 2);
  tl.forEach((l, i) => c.fillText(l, 36, y + 54 + i * 50, cw - 72));
  y += 54 + (tl.length - 1) * 50 + 40;
  c.fillStyle = MUTED;
  c.font = `500 23px ${FONT}`; track(c, 0);
  c.fillText(`${look.when.date} · ${look.place.name}`, 36, y, cw - 72);
  // The tear line, with a notch cut from each side.
  y += 34;
  const tear = y;
  c.strokeStyle = 'rgba(20,18,18,0.22)'; c.lineWidth = 2; c.setLineDash([8, 9]);
  c.beginPath(); c.moveTo(30, y); c.lineTo(cw - 30, y); c.stroke(); c.setLineDash([]);
  // The seat, big: the section across, then the row and the seat like a shirt number.
  const { seat, cat } = look;
  y += 46;
  c.fillStyle = MUTED; c.font = `700 17px ${FONT}`; track(c, 2.5);
  c.fillText(seat.standing ? 'AREA' : 'SECTION', 36, y);
  c.fillStyle = INK; c.font = `900 40px ${FONT}`; track(c, -1);
  const sl = lay(c, seat.secName.toUpperCase(), cw - 72, 2);
  sl.forEach((l, i) => c.fillText(l, 36, y + 46 + i * 42, cw - 72));
  y += 46 + (sl.length - 1) * 42 + 46;
  const cols = seat.standing ? [['ENTRY', 'STANDING', 0, 52]] : [['ROW', String(seat.row), 0, 96], ['SEAT', String(seat.num), 270, 96]];
  cols.forEach(([label, v, x, size]) => {
    c.fillStyle = MUTED; c.font = `700 17px ${FONT}`; track(c, 2.5);
    c.fillText(label, 36 + x, y);
    c.fillStyle = INK; c.font = `900 ${size}px ${FONT}`; track(c, size > 60 ? -4 : -1);
    c.fillText(v, 36 + x - (size > 60 ? 5 : 0), y + size * 0.92 + 4, 250);
  });
  y += cols[0][3] * 0.92 + 4;
  // The category, with its colour.
  y += 56;
  c.beginPath(); c.arc(46, y - 8, 10, 0, Math.PI * 2); c.fillStyle = cat.color || CORAL; c.fill();
  c.strokeStyle = 'rgba(20,18,18,0.25)'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = INK; c.font = `700 24px ${FONT}`; track(c, 0);
  c.fillText(cat.name, 66, y, cw - 120);
  // The paper under it all, as tall as what is on it, with a notch cut from each side.
  const used = Math.min(ch, y + 44);
  c.save();
  c.globalCompositeOperation = 'destination-over';
  c.fillStyle = PAPER;
  round(c, 0, 0, cw, used, 34); c.fill();
  c.globalCompositeOperation = 'destination-out';
  [0, cw].forEach(x => { c.beginPath(); c.arc(x, tear, 18, 0, Math.PI * 2); c.fill(); });
  c.restore();

  // In: up from below as it fades in.
  ctx.save();
  ctx.globalAlpha = k;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  ctx.drawImage(cardCanvas, 0, 0, cw, used, cx, cy + (1 - k) * 80, cw, used);
  ctx.restore();

  // The sticker that passes it on: the question every friend answers with their own.
  const sk = pop((t - 550) / 520);
  if (sk <= 0) return;
  ctx.save();
  ctx.translate(W / 2, Math.min(cy + used + 92, H - 150));
  ctx.rotate(-0.045 + Math.sin(t / 380) * 0.012);
  ctx.scale(sk, sk);
  ctx.font = `900 38px ${FONT}`; track(ctx, -1);
  const q = 'WHERE ARE YOU SITTING?', qw = ctx.measureText(q).width + 64;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#fff';
  round(ctx, -qw / 2, -42, qw, 84, 42); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.fillText(q, 0, 14);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, (t - 900) / 400));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `600 25px ${FONT}`; track(ctx, 0);
  ctx.textAlign = 'left';
  const a = 'Find yours in 3D at ', b = 'atvents.com';
  const aw = ctx.measureText(a).width;
  ctx.font = `800 25px ${FONT}`;
  const x0 = (W - aw - ctx.measureText(b).width) / 2;
  ctx.fillStyle = look.glowText;
  ctx.fillText(b, x0 + aw, H - 52);
  ctx.font = `600 25px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(a, x0, H - 52);
  ctx.restore();
}

// The countdown, a pill in the show's colour, its right edge at x.
function pill(ctx, text, x, cy, color) {
  ctx.save();
  ctx.font = `800 22px ${FONT}`; track(ctx, 2);
  const w = ctx.measureText(text).width + 44;
  ctx.fillStyle = color;
  round(ctx, x - w, cy - 24, w, 48, 24); ctx.fill();
  // The dot beats, like a live sign.
  const beatK = (performance.now() % 1000) / 1000;
  ctx.beginPath(); ctx.arc(x - w + 22, cy, 6 + beatK * 8, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - beatK)})`; ctx.fill();
  ctx.beginPath(); ctx.arc(x - w + 22, cy, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x - w + 36, cy + 1);
  ctx.restore();
}

// Letter spacing where the browser draws it (Chrome, Safari 18); plain elsewhere.
function track(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; }

// Words into at most `max` lines of width `w`; the last line takes the rest.
function lay(ctx, text, w, max) {
  const out = [];
  let line = '';
  for (const word of text.replace(/\n/g, ' \n ').split(' ')) {
    if (word === '\n') { if (line && out.length < max - 1) { out.push(line); line = ''; } continue; }
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > w && line && out.length < max - 1) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

// '#rrggbb' at an alpha.
function hexA(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return Number.isNaN(n) ? `rgba(232,72,15,${a})` : `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

// The show's colour, lifted until it reads on a dark frame.
export function lift(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return '#ff7a45';
  let [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.45) { const m = 0.45 / Math.max(lum, 0.05); const t = Math.min(1, (m - 1) / 3); [r, g, b] = [r, g, b].map(v => Math.round(v + (255 - v) * t)); }
  return `rgb(${r},${g},${b})`;
}

function round(ctx, x, y, w, h, r) {
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
          <p id="story-note">From the whole venue to your seat, about 15 seconds, ending on your seat pass. Keep this tab open.</p>
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
