// The story video at the end of a seat tour: a vertical 9:16 clip, about 14 seconds, of the
// same three steps the fan just took (the whole venue, their category, the view from their
// seat), with the concert and the seat written on it. It is rendered from a second, hidden
// copy of the venue at 720 x 1280, drawn onto a 2D canvas with the captions and recorded with
// MediaRecorder. Phones get it through the share sheet (Instagram and TikTok take it from
// there as a story); everywhere else it downloads.
import { getEvent } from './events.js';
import { crowdSeats } from './layouts.js';
import { whenOf } from './when.js';
import { loadScene3d } from './viewer.js';
import { $, esc, icon, toast, state } from './ui.js';

const W = 720, H = 1280;
const wait = ms => new Promise(r => setTimeout(r, ms));
// MP4 first: Instagram and TikTok take it everywhere. WebM where the browser records no MP4.
const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
const pickType = () => TYPES.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';

let busy = false;

export async function makeStory(pass) {
  if (busy || !pass) return;
  const type = pickType();
  if (!type || !HTMLCanvasElement.prototype.captureStream) { toast('This browser cannot record video. Try Chrome or Safari on your phone.'); return; }
  const venue = getEvent(pass.eventId), i = venue?.seatById.get(pass.seat);
  if (i === undefined) return;
  busy = true;
  const seat = venue.seats[i], cat = venue.catById[pass.cat], e = venue.meta;
  const sheet = openSheet();
  let scene = null, rec = null;
  try {
    const { SeatScene } = await loadScene3d();
    scene = new SeatScene(sheet.stage, { quality: 'medium', interactive: false, labels: false, fps: 30, drift: 0.05 });
    scene.renderer.setPixelRatio(W / sheet.stage.clientWidth);
    scene.resize();
    const crowd = crowdSeats(venue);
    crowd.delete(seat.id);
    if (!(await scene.load(venue, crowd))) throw new Error('load');
    scene.setCrowd(true);
    scene.setLabels(false);
    await waitShown(scene);

    // Captions drawn over each frame, the moment the frame is drawn.
    const out = sheet.canvas, ctx = out.getContext('2d');
    const cap = { step: 1, title: venue.place.name, sub: e.title, end: 0 };
    scene.afterRender = gl => paint(ctx, gl, cap, { e, seat, cat });

    const chunks = [];
    rec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 });
    rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start(250);
    sheet.progress(0.05, 'The venue');

    // 1. The whole venue.
    scene.resetView();
    await scene.settled();
    scene.orbit(28, 3.2);
    await scene.settled();
    // 2. The fan's category, their seat marked.
    Object.assign(cap, { step: 2, title: cat.name, sub: venue.place.name });
    sheet.progress(0.35, cat.name);
    scene.setFilter(cat.id);
    scene.setMine([seat.id]);
    scene.frameCategory(cat.id, { seat, dur: 2.4 });
    await scene.settled();
    await wait(1100);
    // 3. Into the seat, then a few seconds of the view.
    Object.assign(cap, { step: 3, title: seat.standing ? `${seat.secName}` : `Row ${seat.row} · Seat ${seat.num}`, sub: seat.standing ? `${cat.name} · standing` : `${seat.secName} · ${cat.name}` });
    sheet.progress(0.6, 'Your seat');
    scene.flyToSeat(seat);
    await scene.settled();
    await wait(2600);
    cap.end = performance.now();
    sheet.progress(0.92, 'Finishing');
    await wait(1800);
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
    const name = `atvents-${(e.title || 'concert').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-seat.${ext}`;
    sheet.done(new File([blob], name, { type: blob.type }), e);
  } catch (err) {
    if (rec?.state === 'recording') rec.stop();
    sheet.fail();
  } finally {
    if (scene) { scene.afterRender = null; scene.dispose(); }
    busy = false;
  }
}

const waitShown = scene => new Promise(r => { const t = () => (scene.shown || scene.disposed ? r() : setTimeout(t, 60)); t(); });

// ---------------------------------------------------------------- the frame

function paint(ctx, gl, cap, { e, seat, cat }) {
  ctx.drawImage(gl, 0, 0, W, H);
  // Shade top and bottom so the type reads over a bright stage.
  let g = ctx.createLinearGradient(0, 0, 0, 340);
  g.addColorStop(0, 'rgba(17,17,17,0.85)'); g.addColorStop(1, 'rgba(17,17,17,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 340);
  g = ctx.createLinearGradient(0, H - 460, 0, H);
  g.addColorStop(0, 'rgba(17,17,17,0)'); g.addColorStop(1, 'rgba(17,17,17,0.92)');
  ctx.fillStyle = g; ctx.fillRect(0, H - 460, W, 460);

  const coral = '#f04a2c', font = '"Inter Tight", "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'alphabetic';
  // Top: the brand and the show.
  ctx.fillStyle = '#fff';
  ctx.font = `600 30px ${font}`;
  ctx.fillText('ATVENTS', 56, 92);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `500 24px ${font}`;
  ctx.textAlign = 'right';
  ctx.fillText(whenOf(e).date.toUpperCase(), W - 56, 92);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `500 56px ${font}`;
  wrap(ctx, e.title.toUpperCase(), 56, 172, W - 112, 58, 2);

  // Bottom: the three steps, the caption of the one on screen.
  const y0 = H - 300;
  ['Venue', 'Category', 'Seat'].forEach((t, i) => {
    const x = 56 + i * 140, on = i + 1 === cap.step, done = i + 1 < cap.step;
    ctx.fillStyle = on ? coral : done ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, y0, 124, 6);
    ctx.font = `500 22px ${font}`;
    ctx.fillText(`${i + 1} ${t.toUpperCase()}`, x, y0 + 40);
  });
  ctx.fillStyle = '#fff';
  ctx.font = `500 64px ${font}`;
  wrap(ctx, cap.title.toUpperCase(), 56, y0 + 124, W - 112, 64, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = `400 28px ${font}`;
  ctx.fillText(cap.sub, 56, H - 76);
  ctx.fillStyle = coral;
  ctx.font = `600 24px ${font}`;
  ctx.textAlign = 'right';
  ctx.fillText('atvents.com', W - 56, H - 76);
  ctx.textAlign = 'left';

  // The last beat: the seat, as a ticket stub in the middle.
  if (cap.end) {
    const k = Math.min(1, (performance.now() - cap.end) / 500);
    ctx.globalAlpha = k;
    const bw = W - 160, bh = 230, bx = 80, by = H / 2 - bh / 2 - 40;
    ctx.fillStyle = '#fff';
    round(ctx, bx, by, bw, bh, 28); ctx.fill();
    ctx.fillStyle = coral;
    ctx.font = `600 22px ${font}`;
    ctx.fillText('MY SEAT', bx + 40, by + 58);
    ctx.fillStyle = '#111';
    ctx.font = `500 50px ${font}`;
    ctx.fillText((seat.standing ? seat.secName : `${seat.secName}`).toUpperCase(), bx + 40, by + 122, bw - 80);
    ctx.fillStyle = '#555';
    ctx.font = `400 30px ${font}`;
    ctx.fillText(seat.standing ? `${cat.name} · standing` : `${cat.name} · Row ${seat.row} · Seat ${seat.num}`, bx + 40, by + 178, bw - 80);
    ctx.globalAlpha = 1;
  }
}

function wrap(ctx, text, x, y, max, lh, lines) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) {
      ctx.fillText(line, x, y + n * lh);
      if (++n >= lines) return;
      line = w;
    } else line = t;
  }
  if (line) ctx.fillText(line, x, y + n * lh, max);
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
    <div class="story" id="story" role="dialog" aria-modal="true" aria-label="Story video">
      <div class="story-card">
        <div class="story-frame"><div class="story-stage" id="story-stage"></div><canvas id="story-canvas" width="${W}" height="${H}"></canvas><video id="story-video" playsinline loop muted hidden></video></div>
        <div class="story-side">
          <p class="eyebrow">Story video</p>
          <h2 id="story-title">Making your video</h2>
          <p id="story-note">From the whole venue to your seat, about 14 seconds. Keep this tab open.</p>
          <div class="story-bar"><i id="story-bar"></i></div>
          <div class="row-btns" id="story-actions"><button class="btn btn-line btn-sm" type="button" data-story="close">Cancel</button></div>
        </div>
      </div>
    </div>`);
  const root = $('#story');
  let file = null, url = '';
  root.addEventListener('click', async ev => {
    const act = ev.target.closest('[data-story]')?.dataset.story;
    if (act === 'close') { if (url) URL.revokeObjectURL(url); root.remove(); }
    if (act === 'share' && file) {
      try { await navigator.share({ files: [file], title: 'My seat', text: 'My seat, in 3D. atvents.com' }); } catch { /* closed the share sheet */ }
    }
  });
  return {
    stage: $('#story-stage'),
    canvas: $('#story-canvas'),
    progress(k, label) { $('#story-bar').style.transform = `scaleX(${k})`; $('#story-note').textContent = `${label}…`; },
    done(f, e) {
      file = f;
      url = URL.createObjectURL(f);
      const v = $('#story-video');
      v.src = url; v.hidden = false; v.play().catch(() => {});
      $('#story-canvas').hidden = true;
      $('#story-bar').style.transform = 'scaleX(1)';
      $('#story-title').textContent = 'Your video is ready';
      const canShare = !!navigator.canShare?.({ files: [f] });
      $('#story-note').textContent = canShare
        ? 'Share it and pick Instagram or TikTok, then Story.'
        : 'Save it, then post it as a story from Instagram or TikTok on your phone.';
      $('#story-actions').innerHTML = `
        ${canShare ? `<button class="btn btn-coral btn-sm" type="button" data-story="share">${icon('i-share')}Share to story</button>` : ''}
        <a class="btn ${canShare ? 'btn-line' : 'btn-coral'} btn-sm" href="${url}" download="${esc(f.name)}">${icon('i-down')}Save video</a>
        <button class="btn btn-line btn-sm" type="button" data-story="close">Close</button>`;
      state.lastStory = { name: f.name, size: f.size, type: f.type, event: e.id };
    },
    fail() {
      $('#story-title').textContent = 'The video could not be made';
      $('#story-note').textContent = 'Your device ran out of memory or stopped the recording. Close other tabs and try again.';
      $('#story-actions').innerHTML = '<button class="btn btn-line btn-sm" type="button" data-story="close">Close</button>';
    },
  };
}
