// The story a fan posts once their pass is paid: "Seat Drop", a 12-second vertical video
// made for an Instagram or TikTok story. Every fan's story is the same loud template, so
// the stories of one concert read as a set, the way shared story templates spread: I GOT MY
// SEAT! slammed in, the artist and the countdown, a holographic seat pass that drops in and
// flips over to the live view from the seat, then a nickname of the fan's own that spins in
// like a slot reel, and a poster that holds: the nickname, the view, the numbers (as Strava
// shows a run) and the question for the next fan, "KAMU DAPET JULUKAN APA?".
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
const LENGTH = 12000;
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
    // The font (css/styles.css) and the logos: a canvas fetches neither by itself.
    const font = Promise.all(['500', '700', '800', '900'].map(w => document.fonts?.load(`${w} 30px Inter`))).catch(() => {});
    const logos = Promise.all(['web', 'light'].map(n => loadImage(`assets/brand/atvents-logo-${n}.svg`)));
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

    const [logo, logoInk] = await logos;
    const look = lookOf(venue, seat, cat, pass, { logo, logoInk });
    const out = sheet.canvas, ctx = out.getContext('2d');
    const t0 = performance.now();
    scene.afterRender = gl => paint(ctx, gl, performance.now() - t0, look);

    const chunks = [];
    rec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 8e6 });
    rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start(250);
    for (let k = 0; k < 10; k++) {
      sheet.progress(0.2 + k * 0.075, k < 2 ? 'I got my seat' : k < 3 ? look.e.title : k < 5 ? 'Your seat pass' : k < 8 ? 'Your nickname' : 'Your poster');
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
// One loud template for every fan, like a shared story template: Atvents' pop palette, fat
// outlined 3D type, starbursts and a frame of small print round the edge. What changes from
// fan to fan is what they want to show: their show, their seat, the view from it, and a
// nickname of their own, drawn from the pass so every fan gets one and keeps it.

const FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';
// The logos' viewBoxes (assets/brand): an SVG without a size has none to read.
const LOGO_AR = { web: 4635 / 818, light: 4724 / 900 };
const POP = { blue: '#2140ff', deep: '#0c1a8f', cyan: '#3fd8ff', yellow: '#ffe14a', coral: '#ff4a2c', pink: '#ff5fa2', ink: '#0b0a0a', paper: '#fffaf2' };
const INK = POP.ink, MUTED = 'rgba(11,10,10,0.6)';

// The beats, in ms from the start.
const T = { artist: 1300, drop: 3500, flip: 5100, open: 5700, nick: 6500, land: 8000, poster: 9300 };

// Nicknames. The seat picks the pool, the pass picks the name: the same pass always gets the
// same one, so it cannot be rolled again. One fan in four gets a rare one, one in twenty a
// legendary one; the odds printed on the story are these.
const NICKS = {
  pit: ['Si Paling Barikade', 'Penguasa Moshpit', 'Pejuang Barisan Depan', 'Anak Festival Garis Keras', 'Atlet Lompat Moshpit'],
  front: ['Sultan Barisan Depan', 'Si Paling Dekat Panggung', 'Bos Kursi Depan', 'Tamu VIP Sang Idola', 'Penerima Kontak Mata'],
  high: ['Penonton Mata Elang', 'Si Paling Full View', 'Komandan Tribun Atas', 'Pemandang Lautan Lightstick', 'Penjaga Langit Stadion'],
  mid: ['Pawang Sing-Along', 'Juri Setlist', 'Si Paling Fancam', 'Penjaga Lightstick', 'Dirigen Tribun'],
  rare: ['Suhu War Tiket', 'Dukun Setlist', 'Kolektor Momen', 'Arsitek Fancam', 'Pemburu Encore', 'Hafal Lirik Sampai Adlib'],
  legend: ['Main Character Konser', 'Sang Legenda Encore', 'Jiwa Rockstar', 'Pemegang Kursi Takdir'],
};
const RARITY = { classic: 'CLASSIC', rare: 'RARE · 1 DARI 4 FANS', legend: 'LEGENDARY · 1 DARI 20 FANS' };

// FNV-1a: a steady number from a string.
function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function nicknameOf(venue, seat, cat, passId) {
  const h = hash(`${passId}|${seat.id}`), roll = h % 100, pick = list => list[Math.floor(h / 100) % list.length];
  if (roll < 5) return { name: pick(NICKS.legend), rarity: 'legend' };
  if (roll < 30) return { name: pick(NICKS.rare), rarity: 'rare' };
  const rank = venue.categories.findIndex(c => c.id === cat.id);
  const pool = seat.standing ? NICKS.pit : /v?vip|platinum|diamond|gold/i.test(cat.name) || rank === 0 ? NICKS.front : (seat.tier || 0) >= 2 ? NICKS.high : NICKS.mid;
  return { name: pick(pool), rarity: 'classic' };
}

// Metres from the seat to the front of the stage, from the model: "±48 M".
export function toStage(venue, seat) {
  const sx = venue.show === 'round' ? 0 : (venue.stageX ?? -40);
  const d = Math.hypot(seat.x - sx, seat.z);
  return Number.isFinite(d) ? Math.max(1, Math.round(d)) : 0;
}

// Everything the frames draw, worked out once.
export function lookOf(venue, seat, cat, pass, { logo = null, logoInk = null } = {}) {
  const e = venue.meta, when = whenOf(e);
  return {
    e, seat, cat, place: venue.place, when, logo, logoInk,
    count: countdown(when.ms), owner: firstName(pass.name),
    nick: nicknameOf(venue, seat, cat, pass.id), metres: toStage(venue, seat),
    year: new Date(when.ms || Date.now()).getFullYear(),
  };
}

// "H-4": days to the show on the fan's calendar, as Indonesian fans count them.
export function countdown(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  const day = t => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const n = Math.round((day(ms) - day(now)) / 864e5);
  return n > 1 ? `H-${n}` : n === 1 ? 'BESOK' : n === 0 ? 'HARI INI' : 'I WAS THERE';
}

// ---------------------------------------------------------------- the frame

let cardCanvas = null, stripes = null;

export function paint(ctx, gl, t, look) {
  ctx.save();
  if (t < T.artist) slam(ctx, t, look);
  else if (t < T.drop) artist(ctx, t, look);
  else if (t < T.nick) drop(ctx, gl, t, look);
  else if (t < T.poster) nick(ctx, gl, t, look);
  else poster(ctx, gl, t, look);
  ctx.restore();
}

// 1. I GOT MY SEAT! slammed in over a starburst.
function slam(ctx, t, look) {
  popBg(ctx, t);
  const k = ease(t / 380), s = 2.6 - 1.6 * k;
  const shake = t > 380 && t < 620 ? Math.sin(t / 12) * 10 * (1 - (t - 380) / 240) : 0;
  burst(ctx, W / 2, H / 2, 420 * k, 360 * k, 16, POP.yellow, t / 2400);
  ctx.save();
  ctx.translate(W / 2 + shake, H / 2 + shake * 0.6);
  ctx.scale(s, s);
  ctx.rotate(-0.06);
  big(ctx, 'I GOT', 0, -40, 150, { fill: '#fff', center: true });
  big(ctx, 'MY SEAT!', 0, 110, 150, { fill: POP.coral, stripe: true, center: true, max: W - 80 });
  ctx.restore();
  chrome(ctx, look, t);
  if (t > 380 && t < 460) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - (t - 380) / 80)})`; ctx.fillRect(0, 0, W, H); }
}

// 2. The artist, big and fat, with the countdown.
function artist(ctx, t, look) {
  const lt = t - T.artist;
  popBg(ctx, t, POP.ink);
  const lines = splitTitle(look.e.title);
  const size = Math.min(...lines.map(l => fit(ctx, l, W - 120, 170)));
  let y = 330;
  lines.forEach((l, i) => {
    const k = ease((lt - i * 120) / 380);
    ctx.save();
    ctx.translate((1 - k) * -W, 0);
    big(ctx, l, 56, y, size, { fill: i % 2 ? POP.yellow : '#fff', stripe: i % 2 === 1 });
    ctx.restore();
    y += size * 0.98;
  });
  // The date and place on a tag.
  const tk = ease((lt - 400) / 350);
  ctx.globalAlpha = tk;
  tag(ctx, `${look.when.date} · ${look.place.name}`.toUpperCase(), 56, y + 10, POP.cyan, INK);
  ctx.globalAlpha = 1;
  // The countdown, like a poster's "7 DAYS TO GO".
  if (look.count) {
    const ck = pop((lt - 650) / 450);
    ctx.save();
    ctx.translate(56, H - 150);
    ctx.scale(ck, ck);
    ctx.rotate(-0.04);
    const cs = look.count.length > 4 ? 120 : 210;
    big(ctx, look.count, 0, 0, cs, { fill: POP.coral, stripe: true });
    ctx.restore();
    if (look.count.startsWith('H-')) {
      ctx.globalAlpha = Math.max(0, ck);
      big(ctx, 'MENUJU', W - 60, H - 250, 46, { fill: '#fff', right: true, depth: 5 });
      big(ctx, 'SHOW!', W - 60, H - 196, 46, { fill: POP.yellow, right: true, depth: 5 });
      ctx.globalAlpha = 1;
    }
    burst(ctx, W - 120, 210, 70 * ck, 52 * ck, 10, POP.yellow, t / 1600);
  }
  chrome(ctx, look, t);
}

// 3. The seat pass drops in, shines, and flips to the view from the seat, which then opens
// to fill the frame.
function drop(ctx, gl, t, look) {
  popBg(ctx, t);
  const cw = 540, ch = 800, lt = t - T.drop;
  const k = bounce(lt / 700);
  let cy = -ch + (H / 2 + 20 + ch) * k, s = 1;
  const rot = (1 - ease(lt / 900)) * -0.25 + 0.04;
  const fk = ease((t - T.flip) / (T.open - T.flip)), ang = Math.PI * fk;
  const ok = ease((t - T.open) / (T.nick - T.open));
  if (t >= T.open) { cy = H / 2 + 20 - 20 * ok; s = 1 + (Math.max(W / cw, H / ch) * 1.1 - 1) * ok; }
  burst(ctx, W / 2, H / 2, 470, 400, 18, POP.yellow, t / 3000);
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.rotate(rot * (1 - ok));
  ctx.scale(s * Math.max(0.02, Math.abs(Math.cos(ang))), s);
  if (ang <= Math.PI / 2) {
    ctx.fillStyle = INK; round(ctx, -cw / 2 + 14, -ch / 2 + 16, cw, ch, 30); ctx.fill();
    ctx.drawImage(front(cw, ch, t, look), -cw / 2, -ch / 2);
  } else {
    const r = 30 * (1 - ok);
    ctx.save(); round(ctx, -cw / 2, -ch / 2, cw, ch, r); ctx.clip();
    cover(ctx, gl, -cw / 2, -ch / 2, cw, ch);
    ctx.restore();
    ctx.lineWidth = 8 * (1 - ok); ctx.strokeStyle = INK; round(ctx, -cw / 2, -ch / 2, cw, ch, r); ctx.stroke();
  }
  ctx.restore();
  chrome(ctx, look, t);
}

// 4. The nickname: names spin like a slot reel, slow down and land on the fan's own.
function nick(ctx, gl, t, look) {
  const lt = t - T.nick, landT = T.land - T.nick;
  ctx.drawImage(gl, 0, 0, W, H);
  ctx.fillStyle = 'rgba(12,26,143,0.62)'; ctx.fillRect(0, 0, W, H);
  const landed = lt >= landT;
  if (landed) burst(ctx, W / 2, H / 2 + 10, 380 * pop((lt - landT) / 400), 320 * pop((lt - landT) / 400), 18, POP.yellow, t / 2600);
  // The label.
  ctx.save(); ctx.translate(W / 2, H / 2 - 230); ctx.rotate(-0.05);
  tag(ctx, 'JULUKANKU DI ATVENTS', 0, 0, POP.yellow, INK, true, 30);
  ctx.restore();
  // The reel: fast at first, slowing to a stop.
  let name = look.nick.name;
  if (!landed) {
    const all = [...NICKS.mid, ...NICKS.front, ...NICKS.high, ...NICKS.pit, ...NICKS.rare, ...NICKS.legend];
    const p = lt / landT, step = Math.floor(p * p * 0 + Math.pow(p, 0.55) * 22);
    name = all[(step * 7 + 3) % all.length];
  }
  const lines = wrapWords(ctx, name.toUpperCase(), W - 110, 2, 84);
  const size = Math.min(...lines.map(l => fit(ctx, l, W - 110, 104)));
  const sk = landed ? 1 + 0.25 * (1 - ease((lt - landT) / 300)) : 1;
  ctx.save();
  ctx.translate(W / 2, H / 2 + 10);
  ctx.scale(sk, sk);
  ctx.rotate(-0.04);
  lines.forEach((l, i) => big(ctx, l, 0, (i - (lines.length - 1) / 2) * size * 1.02 + size * 0.35, size, { fill: landed ? (i % 2 ? POP.coral : '#fff') : 'rgba(255,255,255,0.85)', stripe: landed && i % 2 === 1, center: true, depth: landed ? 12 : 6 }));
  ctx.restore();
  // The rarity, stamped on once it lands.
  if (landed && look.nick.rarity !== 'classic') {
    const rk = pop((lt - landT - 200) / 400);
    ctx.save(); ctx.translate(W / 2, H / 2 + 230); ctx.scale(rk, rk); ctx.rotate(0.04);
    const col = look.nick.rarity === 'legend' ? POP.pink : look.nick.rarity === 'rare' ? POP.cyan : '#fff';
    tag(ctx, RARITY[look.nick.rarity], 0, 0, col, INK, true, 26);
    ctx.restore();
  }
  if (landed) {
    if (lt - landT < 90) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - (lt - landT) / 90)})`; ctx.fillRect(0, 0, W, H); }
  }
  chrome(ctx, look, t);
}

// 5. The poster that stays: the nickname, the view in its case, the numbers, the question.
function poster(ctx, gl, t, look) {
  const lt = t - T.poster;
  popBg(ctx, t);
  // The nickname, top.
  ctx.save(); ctx.translate(48, 150); ctx.rotate(-0.03);
  tag(ctx, 'JULUKANKU', 0, 0, POP.yellow, INK, false, 22);
  ctx.restore();
  const lines = wrapWords(ctx, look.nick.name.toUpperCase(), W - 100, 2, 80);
  const ns = Math.min(...lines.map(l => fit(ctx, l, W - 100, 92)));
  lines.forEach((l, i) => big(ctx, l, 50, 200 + ns * 0.85 + i * ns, ns, { fill: i % 2 ? POP.coral : '#fff', stripe: i % 2 === 1, depth: 9 }));
  const top = 200 + ns * 0.85 + (lines.length - 1) * ns + 44;
  // The case: the view from the seat, framed like a collectible.
  const k = ease(lt / 500);
  const cw = 560, chh = Math.min(560, H - top - 330);
  ctx.save();
  ctx.translate(W / 2, top + chh / 2 + (1 - k) * 80);
  ctx.rotate(0.035);
  ctx.globalAlpha = k;
  ctx.fillStyle = INK; round(ctx, -cw / 2 + 14, -chh / 2 + 16, cw, chh, 22); ctx.fill();
  ctx.fillStyle = POP.paper; round(ctx, -cw / 2, -chh / 2, cw, chh, 22); ctx.fill();
  ctx.save(); round(ctx, -cw / 2 + 14, -chh / 2 + 62, cw - 28, chh - 130, 12); ctx.clip();
  cover(ctx, gl, -cw / 2 + 14, -chh / 2 + 62, cw - 28, chh - 130);
  // A glossy streak across the case.
  const gx = ((t % 3000) / 3000) * (cw + 400) - cw / 2 - 200;
  const g = ctx.createLinearGradient(gx, -chh / 2, gx + 160, chh / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(-cw / 2, -chh / 2, cw, chh);
  ctx.restore();
  ctx.lineWidth = 6; ctx.strokeStyle = INK; round(ctx, -cw / 2, -chh / 2, cw, chh, 22); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = `900 30px ${FONT}`; track(ctx, -0.5); ctx.textBaseline = 'alphabetic';
  ctx.fillText(look.e.title.toUpperCase(), -cw / 2 + 18, -chh / 2 + 44, cw - 170);
  if (look.logoInk) ctx.drawImage(look.logoInk, cw / 2 - 18 - 22 * LOGO_AR.light, -chh / 2 + 22, 22 * LOGO_AR.light, 22);
  const { seat } = look;
  ctx.font = `900 30px ${FONT}`;
  ctx.fillText(seat.standing ? `${seat.secName.toUpperCase()} · STANDING` : `ROW ${seat.row} · SEAT ${seat.num}`, -cw / 2 + 18, chh / 2 - 26, cw - 220);
  ctx.textAlign = 'right'; ctx.fillStyle = MUTED; ctx.font = `700 20px ${FONT}`;
  ctx.fillText(look.cat.name, cw / 2 - 18, chh / 2 - 28, 190);
  ctx.textAlign = 'left';
  ctx.restore();
  // The numbers, Strava-style.
  const sy = top + chh + 74;
  const stats = [[look.metres ? `±${look.metres} M` : '—', 'KE PANGGUNG'], [seat.standing ? 'FESTIVAL' : `${seat.row}·${seat.num}`, seat.standing ? 'AREA' : 'ROW·SEAT'], [look.count || '—', 'MENUJU SHOW']];
  stats.forEach(([v, l], i) => {
    const x = 50 + i * ((W - 100) / 3), sk = ease((lt - 200 - i * 120) / 400);
    ctx.globalAlpha = sk;
    big(ctx, v, x, sy, Math.min(56, fit(ctx, v, (W - 100) / 3 - 16, 56)), { fill: '#fff', depth: 5 });
    ctx.fillStyle = POP.yellow; ctx.font = `800 18px ${FONT}`; track(ctx, 2.5);
    ctx.fillText(l, x, sy + 34);
    ctx.globalAlpha = 1;
  });
  // The question that passes it on.
  const qk = pop((lt - 600) / 450);
  if (qk > 0) {
    ctx.save();
    ctx.translate(W / 2, H - 132);
    ctx.rotate(-0.035 + Math.sin(t / 380) * 0.012);
    ctx.scale(qk, qk);
    ctx.font = `900 40px ${FONT}`; track(ctx, -1);
    const q = 'KAMU DAPET JULUKAN APA?', qw = ctx.measureText(q).width + 60;
    ctx.fillStyle = INK; round(ctx, -qw / 2 + 8, -40, qw, 84, 42); ctx.fill();
    ctx.fillStyle = '#fff'; round(ctx, -qw / 2, -46, qw, 84, 42); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(q, 0, -2);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, (lt - 950) / 400));
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `800 24px ${FONT}`; track(ctx, 1);
    ctx.fillText('CEK PUNYAMU DI ATVENTS.COM', W / 2, H - 50);
    ctx.restore();
  }
  chrome(ctx, look, t);
}

// The seat pass, face up: holographic foil, the show, the seat.
function front(cw, ch, t, look) {
  cardCanvas ||= Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const c = cardCanvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cw, ch);
  c.save();
  round(c, 0, 0, cw, ch, 30); c.clip();
  const shift = (t / 2400) % 1;
  const g = c.createLinearGradient(-cw * shift, 0, cw * 2 - cw * shift, ch);
  ['#ffd9ec', '#d3f3ff', '#e7ffd9', '#fff1c9', '#e9dcff', '#ffd9ec', '#d3f3ff'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
  c.fillStyle = g; c.fillRect(0, 0, cw, ch);
  c.globalAlpha = 0.18;
  for (let x = -ch; x < cw; x += 14) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + ch, ch); c.strokeStyle = '#fff'; c.lineWidth = 5; c.stroke(); }
  c.globalAlpha = 1;
  const sweep = ((t % 2600) / 2600) * (cw + ch) * 1.6 - ch;
  const sh = c.createLinearGradient(sweep, 0, sweep + 260, 160);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.75)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sh; c.fillRect(0, 0, cw, ch);
  c.restore();
  c.lineWidth = 8; c.strokeStyle = INK; round(c, 4, 4, cw - 8, ch - 8, 28); c.stroke();
  const p = 36;
  c.textBaseline = 'alphabetic';
  if (look.logoInk) c.drawImage(look.logoInk, p, 36, 26 * LOGO_AR.light, 26);
  c.fillStyle = INK; c.textAlign = 'right';
  c.font = `800 17px ${FONT}`; track(c, 3);
  c.fillText('3D SEAT PASS', cw - p, 56);
  c.textAlign = 'left';
  const lines = splitTitle(look.e.title);
  let y = 130;
  lines.slice(0, 3).forEach(l => {
    const s = Math.min(fit(c, l, cw - p * 2, 104), 104);
    y += s * 0.9;
    c.font = `900 ${s}px ${FONT}`; track(c, -s * 0.045);
    c.fillStyle = INK; c.fillText(l, p - 3, y);
  });
  y += 44;
  c.fillStyle = MUTED; c.font = `600 22px ${FONT}`; track(c, 0);
  c.fillText(`${look.when.date} · ${look.place.name}`, p, y, cw - p * 2);
  y += 36;
  c.strokeStyle = 'rgba(11,10,10,0.3)'; c.lineWidth = 2; c.setLineDash([8, 9]);
  c.beginPath(); c.moveTo(p, y); c.lineTo(cw - p, y); c.stroke(); c.setLineDash([]);
  const { seat, cat } = look;
  y += 44;
  label(c, seat.standing ? 'AREA' : 'SECTION', p, y);
  c.fillStyle = INK; c.font = `900 38px ${FONT}`; track(c, -1);
  c.fillText(seat.secName.toUpperCase(), p, y + 42, cw - p * 2);
  y += 84;
  if (seat.standing) {
    label(c, 'ENTRY', p, y);
    c.fillStyle = INK; c.font = `900 64px ${FONT}`; track(c, -2);
    c.fillText('STANDING', p - 3, y + 64);
  } else {
    label(c, 'ROW', p, y); label(c, 'SEAT', p + 240, y);
    c.fillStyle = INK; c.font = `900 110px ${FONT}`; track(c, -5);
    c.fillText(String(seat.row), p - 5, y + 104, 220);
    c.fillText(String(seat.num), p + 235, y + 104, 230);
  }
  const by = ch - 40;
  c.beginPath(); c.arc(p + 10, by - 8, 10, 0, Math.PI * 2); c.fillStyle = cat.color || POP.coral; c.fill();
  c.strokeStyle = 'rgba(11,10,10,0.3)'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = INK; c.font = `800 22px ${FONT}`; track(c, 0);
  c.fillText(cat.name, p + 30, by, cw * 0.55);
  if (look.owner) { c.textAlign = 'right'; c.font = `900 22px ${FONT}`; track(c, 2); c.fillText(look.owner, cw - p, by); c.textAlign = 'left'; }
  return cardCanvas;
}

// ---------------------------------------------------------------- drawing kit

// Fat display type: a hard 3D extrusion in ink, a thick ink outline, and a face that can
// carry diagonal stripes. y is the baseline.
function big(ctx, text, x, y, size, { fill = '#fff', stripe = false, depth = 10, center = false, right = false, max = 0 } = {}) {
  ctx.save();
  ctx.font = `900 ${size}px ${FONT}`; track(ctx, -size * 0.03);
  ctx.textAlign = center ? 'center' : right ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const m = max || undefined;
  const d = Math.max(3, depth * size / 120);
  ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = size * 0.11;
  for (let i = d; i > 0; i -= 1.5) { ctx.strokeText(text, x + i, y + i, m); ctx.fillText(text, x + i, y + i, m); }
  ctx.strokeText(text, x, y, m);
  ctx.fillStyle = fill; ctx.fillText(text, x, y, m);
  if (stripe) {
    stripes ||= makeStripes();
    ctx.fillStyle = ctx.createPattern(stripes, 'repeat');
    ctx.globalAlpha *= 0.9;
    ctx.fillText(text, x, y, m);
  }
  ctx.restore();
}

function makeStripes() {
  const c = Object.assign(document.createElement('canvas'), { width: 28, height: 28 });
  const x = c.getContext('2d');
  x.strokeStyle = POP.ink; x.lineWidth = 6;
  for (let i = -28; i <= 56; i += 28) { x.beginPath(); x.moveTo(i, 28); x.lineTo(i + 28, 0); x.stroke(); }
  return c;
}

// A tag: a box of bold small caps with a hard shadow. Left-aligned at x, or centred.
function tag(ctx, text, x, y, bg, fg, center = false, size = 24) {
  ctx.save();
  ctx.font = `900 ${size}px ${FONT}`; track(ctx, size * 0.08);
  const w = Math.min(W - 80, ctx.measureText(text).width + size * 1.3), h = size * 1.9;
  const x0 = center ? x - w / 2 : x;
  ctx.fillStyle = INK; ctx.fillRect(x0 + 6, y - h / 2 + 6, w, h);
  ctx.fillStyle = bg; ctx.fillRect(x0, y - h / 2, w, h);
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(x0, y - h / 2, w, h);
  ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, x0 + w / 2, y + 2, w - size);
  ctx.restore();
}

// A starburst: n spikes between radii r and ri, turning with a.
function burst(ctx, x, y, r, ri, n, col, a = 0) {
  if (r <= 1) return;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? ri * (0.92 + 0.08 * Math.sin(i * 3.1)) : r, an = (i / (n * 2)) * Math.PI * 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(an) * rr, Math.sin(an) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = Math.max(3, r * 0.02); ctx.strokeStyle = INK; ctx.stroke();
  ctx.restore();
}

// The pop background: deep blue with slow waves running across it.
function popBg(ctx, t, base = POP.blue) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.lineWidth = 18;
  ctx.strokeStyle = base === POP.ink ? 'rgba(33,64,255,0.45)' : 'rgba(255,255,255,0.09)';
  for (let row = -1; row < 16; row++) {
    const y0 = row * 92 + ((t / 40) % 92);
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += 20) ctx.lineTo(x, y0 + Math.sin(x / 70 + row * 0.7 + t / 700) * 22);
    ctx.stroke();
  }
  ctx.restore();
}

// The frame of small print round the edge, as on a record sleeve.
function chrome(ctx, look, t) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.fillStyle = INK; ctx.fillRect(22, 22, W - 44, 76);
  ctx.strokeRect(22, 22, W - 44, 76);
  if (look.logo) ctx.drawImage(look.logo, 40, 46, 26 * LOGO_AR.web, 26);
  ctx.fillStyle = '#fff'; ctx.font = `800 15px ${FONT}`; track(ctx, 2.5); ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText('SEAT DROP', W - 140, 50);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`ST_01 · ${look.year}`, W - 140, 72);
  // A live dot.
  const b = (t % 1000) / 1000;
  ctx.beginPath(); ctx.arc(W - 108, 60, 7 + b * 7, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,74,44,${0.5 * (1 - b)})`; ctx.fill();
  ctx.beginPath(); ctx.arc(W - 108, 60, 7, 0, Math.PI * 2); ctx.fillStyle = POP.coral; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `900 15px ${FONT}`;
  ctx.fillText(look.count || 'LIVE', W - 92, 61);
  ctx.restore();
}

function label(c, text, x, y) { c.fillStyle = MUTED; c.font = `800 16px ${FONT}`; track(c, 2.5); c.fillText(text, x, y); }

// The 3D frame, cropped to fill a box.
// The renderer's canvas can be any size behind the 9:16 frame, so its own size is read.
function cover(ctx, img, x, y, w, h) {
  const iw = img.width || W, ih = img.height || H;
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

// A title as display lines: one word a line, short words kept together ("GUNS N' / ROSES").
function splitTitle(title) {
  const out = [];
  for (const w of String(title).toUpperCase().split(/\s+/)) {
    const last = out[out.length - 1];
    if (last && (last.length + w.length < 8 || w.length <= 2)) out[out.length - 1] = `${last} ${w}`; else out.push(w);
  }
  return out.slice(0, 4);
}

// Words into at most `max` lines that fit width w at the given size.
function wrapWords(ctx, text, w, max, size) {
  ctx.font = `900 ${size}px ${FONT}`; track(ctx, -size * 0.03);
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > w && line && out.length < max - 1) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

// The largest size, up to max, at which text fits in width w.
function fit(ctx, text, w, max) {
  ctx.font = `900 100px ${FONT}`; track(ctx, -3);
  return Math.max(20, Math.min(max, Math.floor((100 * w) / Math.max(1, ctx.measureText(text).width + 12))));
}

const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const pop = t => { t = Math.min(1, Math.max(0, t)); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function bounce(t) {
  t = Math.min(1, Math.max(0, t));
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

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
          <p id="story-note">A 12-second reveal of your seat, made for your story. Keep this tab open.</p>
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
