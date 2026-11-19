// The story a fan posts once their pass is paid: a 19-second trailer of their show, cut to
// the music like an event flyer in motion: the act (artists.js) with the show's details as
// the promoter lists them, then the view from the fan's own seat with its block, row and
// seat, and the Atvents logo last (trailer.js draws it; the music is the licensed track in
// TRACK, else beat.js; sfx.js adds the crowd).
//
// The seat's view is a second, hidden copy of the venue at 720 x 1280, flown into the seat
// with the show's lights up before recording starts; the trailer is drawn over its frames
// on a 2D canvas, each frame encoded as it is drawn into an ordinary MP4 (see TYPES below for
// the browsers that only record). Nothing on
// it can open the pass: no name, pass id, key or link of the fan's. The film keeps a clock of
// its own: each 3D frame is copied to a picture the film draws, so a slow or stalled frame of
// the venue never holds the film. When it is done the fan watches it in the sheet before
// sharing or saving it.
import { getEvent } from './events.js';
import { crowdSeats } from './layouts.js';
import { whenOf } from './when.js';
import { placeSeat, numberingOf } from './seatflip.js';
import { loadScene3d } from './viewer.js';
import { THEMES } from './themes.js';
import { IMAGES } from './media.js';
import { ARTISTS } from './artists.js';
import { createSfx } from './sfx.js';
import { score } from './beat.js';
import { paint, makeKit, lookOf, LENGTH, T } from './trailer.js';
import { $, esc, icon, state } from './ui.js';
import { Muxer, ArrayBufferTarget } from './mp4-muxer.js';

const W = 720, H = 1280, FPS = 30, BUDGET = 40;
const wait = ms => new Promise(r => setTimeout(r, ms));
// The file. Where the browser has WebCodecs with H.264 and AAC (Chrome and Edge on computers
// and Android, recent Safari), every frame and the sound are encoded and written into a
// standard MP4 with its index at the front: the file a phone's gallery, Instagram and TikTok
// all open. MediaRecorder's MP4 from Chrome is cut into fragments that phones refuse to open
// once it is saved. Elsewhere MediaRecorder records the canvas and the sound as they play,
// H.264 and AAC first, WebM where the browser records no MP4.
const VIDEO = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42001f'];
const TYPES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d0028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const pickType = () => TYPES.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
async function encoderPlan() {
  if (!window.VideoEncoder || !window.AudioEncoder || !window.VideoFrame || !window.AudioData || !window.OfflineAudioContext) return null;
  try {
    let video = null, audio = null;
    for (const codec of VIDEO) {
      const c = { codec, width: W, height: H, bitrate: 8e6, framerate: FPS, avc: { format: 'avc' } };
      if ((await VideoEncoder.isConfigSupported(c)).supported) { video = c; break; }
    }
    for (const sampleRate of [48000, 44100]) {
      const c = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 160000 };
      if ((await AudioEncoder.isConfigSupported(c)).supported) { audio = c; break; }
    }
    return video && audio ? { video, audio } : null;
  } catch { return null; }
}
const slug = t => (t || 'concert').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// The beat for each show's music: the rock bands get drums and a fuzz bass, the rest a pop kit.
const ROCK = new Set(['mcr', 'gnr', '5sos']);
// The track the trailer is cut to (licensed by Atvents), from its drop: the cuts are on its
// 122 bpm grid (trailer.js). The file is edited to the cuts: the glass cracks on its break
// (beat 19), the seat comes in with it on 20, and its last hit lands on the logo (beat 32)
// and rings under it. `from` is the second of the drop in the file. Without it (TRACK null,
// or the file not loading), the beat made in the browser (beat.js) plays to the same grid.
const TRACK = { src: 'assets/audio/story-track.m4a', from: 0 };

let busy = false;

export async function makeStory(pass) {
  if (busy || !pass) return;
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
  sheet.progress(0.02, '', 0.12);   // under the sheet's first note: keep this tab open
  let scene = null, rec = null, raf = 0, venc = null;
  try {
    const plan = await encoderPlan();
    const type = plan ? '' : pickType();
    if (!plan && (!type || !HTMLCanvasElement.prototype.captureStream)) { sheet.fail('This browser cannot make videos. Try Chrome or Safari on your phone.'); return; }
    const font = loadFonts();
    const art = e.image && IMAGES[e.image] ? loadImage(IMAGES[e.image].src) : Promise.resolve(null);
    const artist = ARTISTS[e.theme] || null;
    const shot = artist?.photo ? loadImage(artist.photo.src) : Promise.resolve(null);
    const logo = loadImage('assets/brand/atvents-logo-dark.svg');
    const track = TRACK && ac ? fetch(TRACK.src).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).catch(() => null) : null;
    const { SeatScene } = await loadScene3d();
    await font;
    sheet.progress(0.12, 'Building the venue', 0.24);
    scene = new SeatScene(sheet.stage, { quality: 'medium', interactive: false, labels: false, fps: 30, drift: 0.05 });
    scene.renderer.setPixelRatio(W / sheet.stage.clientWidth);
    scene.resize();
    const crowd = crowdSeats(venue);
    crowd.delete(at.id);
    if (!(await scene.load(venue, crowd))) throw new Error('load');
    scene.setCrowd(true);
    scene.setLabels(false);
    await waitShown(scene);
    sheet.progress(0.24, 'Finding your seat', 0.3);
    // Into the seat, and the show's lights all the way up, before the film starts.
    scene.realColors = true;
    scene.setMine([at.id]);
    scene.flyToSeat(at, { quick: true });
    const style = ROCK.has(e.theme) ? 'rock' : 'pop';
    // For the file, the sound is made first, offline and to the sample, while the lights come up.
    const muxer = plan && new Muxer({ target: new ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'offset',
      video: { codec: 'avc', width: W, height: H, frameRate: FPS }, audio: { codec: 'aac', numberOfChannels: 2, sampleRate: plan.audio.sampleRate } });
    const sound = plan && (async () => {
      const rate = plan.audio.sampleRate, oc = new OfflineAudioContext(2, Math.ceil(LENGTH / 1000 * rate), rate);
      mix(oc, oc.destination, 0, await track, style);
      await encodeSound(await oc.startRendering(), plan.audio, muxer);
    })();
    sound?.catch(() => {});
    await scene.settled();
    await wait(1800);

    const focus = scene.focus ? [scene.focus.x, scene.focus.z] : [venue.stageX ?? -40, 0];
    const metres = Math.max(1, Math.round(Math.hypot(at.x - focus[0], at.z - focus[1])));
    const when = whenOf(e);
    const look = lookOf({ e, place: venue.place, when, seat, cat, metres, artist });
    const theme = THEMES[e.theme] || THEMES.default;
    const photo = await shot;
    const kit = makeKit({ poster: await art, photo: photo && { img: photo, box: artist.photo.box }, logo: await logo, theme });
    const out = sheet.canvas, ctx = out.getContext('2d');

    // The seat's view as a picture, renewed by every frame the scene draws.
    const view = picture(), vctx = view.getContext('2d');
    vctx.drawImage(scene.renderer.domElement, 0, 0, W, H);
    scene.afterRender = gl => vctx.drawImage(gl, 0, 0, W, H);
    // The film's frame at its cover moment, for the preview while the video loads.
    const cover = picture();

    let chunks = [], stopped = null, encErr = null;
    if (plan) {
      await sound;
      venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: err => { encErr = err; } });
      venc.configure(plan.video);
    } else {
      // Picture and sound, into one recording, as they play.
      const stream = out.captureStream(FPS);
      if (ac) {
        const dest = ac.createMediaStreamDestination();
        const music = await track;
        const t0 = ac.currentTime + 0.1;
        mix(ac, dest, t0, music, style);
        dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
        // The picture starts when the sound does.
        await wait(Math.max(0, (t0 - ac.currentTime) * 1000));
      }
      rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6, audioBitsPerSecond: 160e3 });
      rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
      stopped = new Promise(r => { rec.onstop = r; });
    }

    // Frame k is the film at k / 30 s, drawn when the clock reaches it. For the file every frame
    // is drawn and encoded with its time, a few at a time on a tick when the clock has run
    // ahead (BUDGET ms at most, so the page keeps answering): a slow device takes longer, and
    // the film stays whole. The recording takes the frame of the moment.
    const step = 1000 / FPS, frames = Math.ceil(LENGTH / step);
    let drawn = -1, covered = false;
    const frame = k => {
      const t = k * step;
      try { paint(ctx, t, look, kit, view); } catch (err) { console.error(err); }
      if (!covered && t >= COVER) { covered = true; cover.getContext('2d').drawImage(out, 0, 0); }
      if (venc && venc.encodeQueueSize < 10) {
        const f = new VideoFrame(out, { timestamp: Math.round(t * 1000), duration: Math.round(step * 1000) });
        venc.encode(f, { keyFrame: k % (FPS * 2) === 0 });
        f.close();
      }
      drawn = k;
    };
    const start = performance.now();
    await new Promise(finish => {
      const tick = now => {
        const k = Math.min(frames - 1, Math.floor((now - start) / step));
        if (venc) {
          const begin = performance.now();
          while (drawn < k && venc.encodeQueueSize < 10) { frame(drawn + 1); if (performance.now() - begin > BUDGET) break; }
          if (drawn >= frames - 1 || encErr) { finish(); return; }
        } else {
          if (now - start >= LENGTH) { finish(); return; }
          if (k > drawn) frame(k);
        }
        raf = requestAnimationFrame(tick);
        const t = drawn * step;
        sheet.progress(0.3 + 0.66 * t / LENGTH, t < T.s3 ? 'Cutting your trailer' : t < T.end ? 'The view from your seat' : 'Almost done');
      };
      frame(0);
      rec?.start(250);
      raf = requestAnimationFrame(tick);
    });
    let blob;
    if (venc) {
      sheet.progress(0.97, 'Saving the file');
      await venc.flush();
      venc.close(); venc = null;
      if (encErr) throw encErr;
      muxer.finalize();
      blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    } else {
      try { paint(ctx, LENGTH, look, kit, view); } catch { /* the last frame is the fade's black */ }
      await wait(120);
      rec.stop();
      await stopped;
      blob = new Blob(chunks, { type: type.split(';')[0] });
    }
    const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
    // Where the browser cannot play back what it recorded, the sheet plays the film again
    // on the canvas, with the seat's last frame for its view.
    const replay = live => {
      const from = performance.now();
      const step = now => {
        if (!live()) return;
        try { paint(ctx, (now - from) % LENGTH, look, kit, view); } catch { /* the next frame */ }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    sheet.done(new File([blob], `atvents-${slug(e.title)}-my-seat.${ext}`, { type: blob.type }), e, seat, { cover, replay });
  } catch (err) {
    cancelAnimationFrame(raf);
    if (rec?.state === 'recording') rec.stop();
    try { venc?.close(); } catch { /* already closed */ }
    sheet.fail();
  } finally {
    if (scene) { scene.afterRender = null; scene.dispose(); }
    ac?.close?.().catch(() => {});
    busy = false;
  }
}

// The sound: the room and the crowd (sfx.js) under the music, or the beat made here when the
// track does not load, faded out at the end. From t0 on the context's clock, into `out`: the
// same call makes the file's sound offline and the recording's live.
function mix(ac, out, t0, music, style) {
  const sfx = createSfx(ac, out);
  sfx.room(t0, LENGTH / 1000 + 0.5); sfx.cheer(t0 + T.s3 / 1000, 3.5); sfx.out(t0 + (LENGTH - 600) / 1000, 0.6);
  let bus;
  if (music) {
    const src = ac.createBufferSource();
    src.buffer = music; bus = ac.createGain(); bus.gain.value = 0.9;
    src.connect(bus).connect(out); src.start(t0, TRACK.from, LENGTH / 1000 + 0.2);
  } else bus = score(ac, out, t0, style);
  const level = bus.gain.value;
  bus.gain.setValueAtTime(level, t0 + (LENGTH - 600) / 1000); bus.gain.linearRampToValueAtTime(0, t0 + (LENGTH - 50) / 1000);
}

// The rendered sound, encoded to AAC in blocks of 1024 samples and handed to the file.
async function encodeSound(buffer, config, muxer) {
  let failed = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: err => { failed = err; } });
  enc.configure(config);
  const left = buffer.getChannelData(0), right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  for (let i = 0; i < buffer.length; i += 1024) {
    const n = Math.min(1024, buffer.length - i), data = new Float32Array(n * 2);
    data.set(left.subarray(i, i + n), 0); data.set(right.subarray(i, i + n), n);
    const a = new AudioData({ format: 'f32-planar', sampleRate: buffer.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / buffer.sampleRate * 1e6), data });
    enc.encode(a);
    a.close();
  }
  await enc.flush();
  enc.close();
  if (failed) throw failed;
}

// The frame the preview shows before the video plays: the first flyer, all of it in.
const COVER = 3600;
const picture = () => Object.assign(document.createElement('canvas'), { width: W, height: H });

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
// variable Archivo serves every width: each face pins the width axis.
export async function loadFonts() {
  if (!window.FontFace || !document.fonts) return;
  const faces = [
    new FontFace('Atvents Condensed', 'url(assets/fonts/archivo-latin-wdth-wght.woff2)', { weight: '100 900', stretch: '62%' }),
    new FontFace('Atvents Expanded', 'url(assets/fonts/archivo-latin-wdth-wght.woff2)', { weight: '100 900', stretch: '125%' }),
    new FontFace('Atvents Mono', 'url(assets/fonts/jetbrains-mono-latin-wght.woff2)', { weight: '100 800' }),
  ];
  await Promise.all(faces.map(f => f.load().then(x => document.fonts.add(x)).catch(() => {})));
}

// ---------------------------------------------------------------- the sheet

function openSheet() {
  $('#story')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="story" id="story" role="dialog" aria-modal="true" aria-label="Story">
      <div class="story-card">
        <div class="story-frame"><div class="story-stage" id="story-stage"></div><canvas id="story-canvas" width="${W}" height="${H}"></canvas><video id="story-video" playsinline loop muted preload="auto" hidden></video></div>
        <div class="story-side">
          <p class="eyebrow">Your story</p>
          <h2 id="story-title">Making your seat pass</h2>
          <p id="story-note">About 20 seconds. Keep this tab open.</p>
          <div class="story-meter" id="story-meter"><div class="story-bar"><i id="story-bar"></i></div><span class="story-pct" id="story-pct" aria-live="off">0%</span></div>
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
  // The share in hundredths: it creeps toward the end of each step while the step runs, so
  // the number keeps moving through the long ones (loading the venue).
  let shown = 0, aim = 0, upto = 0, creep = 0;
  const show = k => {
    shown = Math.min(1, Math.max(shown, k));
    $('#story-bar').style.transform = `scaleX(${shown})`;
    $('#story-pct').textContent = `${Math.floor(shown * 100 + 1e-6)}%`;
  };
  const close = () => { clearInterval(creep); urls.forEach(u => URL.revokeObjectURL(u)); root.remove(); };
  root.addEventListener('click', async ev => {
    const act = ev.target.closest('[data-story]')?.dataset.story;
    if (act === 'close') close();
    if (act === 'share' && files.share) {
      try { await navigator.share({ files: [files[act]], title: 'My seat', text }); } catch { /* closed the share sheet */ }
    }
  });
  return {
    stage: $('#story-stage'),
    canvas: $('#story-canvas'),
    progress(k, label, to = k) {
      if (!root.isConnected) return;
      aim = k; upto = Math.max(k, to);
      show(k);
      if (label) $('#story-note').textContent = `${label}…`;
      if (!creep) creep = setInterval(() => { if (upto > shown) show(shown + (aim + (upto - aim) * 0.92 - shown) * 0.06); }, 200);
    },
    done(video, e, seat, { cover, replay }) {
      clearInterval(creep);
      if (!root.isConnected) return;
      const vurl = URL.createObjectURL(video);
      urls = [vurl];
      files = { share: video };
      // What WhatsApp, X and the like post with it; Instagram takes the file alone.
      const where = seat.standing ? seat.secName : `Row ${seat.row}, Seat ${seat.num}`;
      text = `I'm going to ${e.title}! ${where}. Where are you sitting? ${location.origin}/#event-${e.id}`;
      // The preview: the video itself, muted until the fan turns the sound on, over its cover
      // frame until its first frame is in. If this browser cannot play what it recorded, the
      // film plays again on the canvas instead.
      const v = $('#story-video'), c = $('#story-canvas');
      c.getContext('2d').drawImage(cover, 0, 0);
      cover.toBlob(b => { if (b && root.isConnected) { const u = URL.createObjectURL(b); urls.push(u); v.poster = u; } }, 'image/jpeg', 0.85);
      let settled = false;
      const fallback = () => {
        if (settled) return;
        settled = true;
        v.hidden = true; v.removeAttribute('src'); v.load();
        replay(() => root.isConnected);
      };
      v.addEventListener('loadeddata', () => {
        if (settled) return;
        if (!v.videoWidth) { fallback(); return; }
        settled = true;
        v.play().catch(() => {});
      }, { once: true });
      v.addEventListener('error', fallback, { once: true });
      // A recording with no length in its header plays once and stops on its last frame,
      // the fade's black: it starts over from here.
      v.addEventListener('ended', () => { v.currentTime = 0; v.play().catch(() => {}); });
      setTimeout(() => { if (!settled && v.readyState < 2) fallback(); }, 5000);
      v.controls = true;
      v.src = vurl; v.hidden = false; v.load();
      $('#story-meter').hidden = true;
      $('#story-title').textContent = 'Your seat pass is ready';
      const canShare = !!navigator.canShare?.({ files: [video] });
      $('#story-note').textContent = canShare
        ? 'Watch it here first; the speaker button turns the sound on. Then post it to your story and let your friends answer where they are sitting.'
        : 'Watch it here first; the speaker button turns the sound on. Then save it and post it as a story from Instagram or TikTok on your phone.';
      $('#story-actions').innerHTML = `
        ${canShare ? `<button class="btn btn-coral" type="button" data-story="share">${icon('i-share', 'lead')}<span>Share video to story</span></button>` : `<a class="btn btn-coral" href="${vurl}" download="${esc(video.name)}">${icon('i-down', 'lead')}<span>Save video</span></a>`}
        ${canShare ? `<a class="link" href="${vurl}" download="${esc(video.name)}">Save the video to this device</a>` : ''}
        <button class="link" type="button" data-story="close">Close</button>`;
      state.lastStory = { name: video.name, size: video.size, type: video.type, event: e.id };
    },
    fail(note) {
      clearInterval(creep);
      if (!root.isConnected) return;
      $('#story-meter').hidden = true;
      $('#story-title').textContent = 'The video could not be made';
      $('#story-note').textContent = note || 'Your device ran out of memory or stopped the recording. Close other tabs and try again.';
      $('#story-actions').innerHTML = '<button class="btn btn-line btn-sm" type="button" data-story="close">Close</button>';
    },
  };
}
