// The story a fan posts once their pass is paid: a 16-second trailer of their show, cut to
// a beat, from the promoter's own material (the poster and the show's details as listed),
// then the view from the fan's own seat with its block, row and seat, and Atvents last
// (trailer.js draws it; beat.js and sfx.js make its sound).
//
// The seat's view is a second, hidden copy of the venue at 720 x 1280, flown into the seat
// with the show's lights up before recording starts; the trailer is drawn over its frames
// on a 2D canvas, and picture and sound are recorded together with MediaRecorder. Nothing on
// it can open the pass: no name, pass id, key or link of the fan's.
import { getEvent } from './events.js';
import { crowdSeats } from './layouts.js';
import { whenOf } from './when.js';
import { placeSeat, numberingOf } from './seatflip.js';
import { loadScene3d } from './viewer.js';
import { THEMES } from './themes.js';
import { IMAGES } from './media.js';
import { createSfx } from './sfx.js';
import { score } from './beat.js';
import { paint, makeKit, lookOf, LENGTH, T } from './trailer.js';
import { $, esc, icon, toast, state } from './ui.js';

const W = 720, H = 1280;
const wait = ms => new Promise(r => setTimeout(r, ms));
// MP4 first: Instagram and TikTok take it everywhere. WebM where the browser records no MP4.
const TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const pickType = () => TYPES.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
const slug = t => (t || 'concert').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// The beat for each show's music: the rock bands get drums and a fuzz bass, the rest a pop kit.
const ROCK = new Set(['mcr', 'gnr', '5sos']);

let busy = false;

export async function makeStory(pass) {
  if (busy || !pass) return;
  const type = pickType();
  if (!type || !HTMLCanvasElement.prototype.captureStream) { toast('This browser cannot record video. Try Chrome or Safari on your phone.'); return; }
  const venue = getEvent(pass.eventId), i = venue?.seatById.get(pass.seat);
  if (i === undefined) return;
  busy = true;
  // The ticket's seat is what the frames say; `at` is where it is in the model when the
  // fan set the venue's numbering the other way (seatflip.js).
  const seat = venue.seats[i], at = placeSeat(venue, seat, numberingOf(venue, pass)), cat = venue.catById[pass.cat];
  const e = venue.meta;
  // Sound starts from the fan's tap, which is what lets a page make it.
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = AC ? new AC() : null;
  ac?.resume?.().catch(() => {});
  const sheet = openSheet();
  let scene = null, rec = null;
  try {
    const font = loadFonts();
    const art = e.image && IMAGES[e.image] ? loadImage(IMAGES[e.image].src) : Promise.resolve(null);
    const logo = loadImage('assets/brand/atvents-logo-light.svg');
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
    sheet.progress(0.2, 'Finding your seat');
    // Into the seat, and the show's lights all the way up, before the film starts.
    scene.realColors = true;
    scene.setMine([at.id]);
    scene.flyToSeat(at, { quick: true });
    await scene.settled();
    await wait(1800);
    sheet.progress(0.3, 'Cutting your trailer');

    const focus = scene.focus ? [scene.focus.x, scene.focus.z] : [venue.stageX ?? -40, 0];
    const metres = Math.max(1, Math.round(Math.hypot(at.x - focus[0], at.z - focus[1])));
    const when = whenOf(e);
    const look = lookOf({ e, place: venue.place, when, seat, cat, metres, count: countdown(when.ms) });
    const theme = THEMES[e.theme] || THEMES.default;
    const kit = makeKit({ poster: await art, logo: await logo, theme });
    const out = sheet.canvas, ctx = out.getContext('2d');

    // Picture and sound, into one recording.
    const stream = out.captureStream(30);
    if (ac) {
      const dest = ac.createMediaStreamDestination();
      const t0 = ac.currentTime + 0.1;
      const sfx = createSfx(ac, dest);
      sfx.room(t0, LENGTH / 1000 + 0.5); sfx.near(t0 + 1, 7); sfx.cheer(t0 + T.seat / 1000, 3.5); sfx.out(t0 + (LENGTH - 600) / 1000, 0.6);
      const bus = score(ac, dest, t0, ROCK.has(e.theme) ? 'rock' : 'pop');
      bus.gain.setValueAtTime(0.8, t0 + (LENGTH - 800) / 1000); bus.gain.linearRampToValueAtTime(0, t0 + (LENGTH - 50) / 1000);
      dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
      // The picture starts when the sound does.
      await wait(Math.max(0, (t0 - ac.currentTime) * 1000));
    }
    const start = performance.now();
    scene.afterRender = gl => paint(ctx, performance.now() - start, look, kit, gl);

    const chunks = [];
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6, audioBitsPerSecond: 160e3 });
    rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start(250);
    for (let k = 1; k <= 8; k++) { await wait(LENGTH / 8); sheet.progress(0.3 + k * 0.0875, k < 5 ? 'Cutting your trailer' : k < 7 ? 'The view from your seat' : 'Almost done'); }
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
    sheet.done(new File([blob], `atvents-${slug(e.title)}-my-seat.${ext}`, { type: blob.type }), e, seat);
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
  return n >= 1 ? `H-${n}` : '';
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
          <p id="story-note">About 20 seconds. Keep this tab open.</p>
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
