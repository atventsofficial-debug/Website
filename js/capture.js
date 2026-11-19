// "Capture this moment": the fan's own view from their seat, kept as a photo or a short
// screen recording. The stage goes fullscreen with every panel hidden, like a camera: a
// Photo / Video switch and one shutter. Frames come from the 3D canvas right after each
// render (scene.afterRender), drawn on a 2D canvas with a small caption of the show and the
// seat, so the picture never depends on the WebGL buffer being kept. Nothing on it can open
// the pass: no name, pass id or key. Then the fan saves or shares it, or takes another.
import { $, esc, icon, toast } from './ui.js';

const MAX_REC = 30; // seconds
const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const pickType = () => TYPES.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
const slug = t => (t || 'concert').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let cap = null;

export const canRecord = () => !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);

export function startCapture(scene, { title = '', seat = '' } = {}) {
  if (!scene || cap) return;
  const stage = $('#stage');
  cap = { scene, stage, title, seat, mode: 'photo', rec: null, url: '' };
  stage.classList.add('is-min', 'is-capture');
  const ui = document.createElement('div');
  ui.className = 'cap';
  ui.innerHTML = `
    <div class="cap-top">
      <span class="cap-hint">Drag to frame your view</span>
      <button class="cap-x" type="button" data-cap="close" aria-label="Close the camera">${icon('i-x')}</button>
    </div>
    <span class="cap-rec" hidden><i></i><b>0:00</b></span>
    <div class="cap-bar">
      <div class="cap-modes" role="tablist" aria-label="Capture">
        <button type="button" role="tab" data-cap-mode="photo" aria-selected="true">Photo</button>
        <button type="button" role="tab" data-cap-mode="video" aria-selected="false"${canRecord() ? '' : ' disabled title="This browser cannot record the screen"'}>Video</button>
      </div>
      <button class="cap-shutter" type="button" data-cap="shoot" aria-label="Take a photo"><i></i></button>
    </div>
    <div class="cap-flash"></div>
    <div class="cap-sheet" hidden></div>`;
  stage.appendChild(ui);
  cap.ui = ui;
  ui.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', onFs);
  stage.requestFullscreen?.().catch(() => {});
}

function onKey(e) { if (e.key === 'Escape' && cap && !document.fullscreenElement) stopCapture(); }
// Leaving fullscreen with the browser's own control (or Esc) closes the camera too, unless a
// shot is being reviewed.
function onFs() { if (cap && !document.fullscreenElement && cap.ui.querySelector('.cap-sheet').hidden && !cap.rec) stopCapture(); }

function onClick(e) {
  const mode = e.target.closest('[data-cap-mode]')?.dataset.capMode;
  if (mode && !cap.rec) setMode(mode);
  const act = e.target.closest('[data-cap]')?.dataset.cap;
  if (act === 'close') stopCapture();
  if (act === 'shoot') cap.mode === 'photo' ? photo() : cap.rec ? stopRec() : startRec();
  if (act === 'again') closeSheet();
  if (act === 'share') shareShot();
}

function setMode(mode) {
  cap.mode = mode;
  cap.ui.querySelectorAll('[data-cap-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.capMode === mode));
  const sh = cap.ui.querySelector('.cap-shutter');
  sh.classList.toggle('is-video', mode === 'video');
  sh.setAttribute('aria-label', mode === 'video' ? 'Start recording' : 'Take a photo');
}

// A 2D copy of the 3D view, at most 1600 px on its long side, with the caption drawn in.
function frameCanvas(gl) {
  const k = Math.min(1, 1600 / Math.max(gl.width, gl.height));
  const c = document.createElement('canvas');
  c.width = Math.round(gl.width * k); c.height = Math.round(gl.height * k);
  return c;
}

function drawFrame(ctx, gl) {
  const { width: w, height: h } = ctx.canvas;
  ctx.drawImage(gl, 0, 0, w, h);
  const u = Math.max(w, h) / 100, pad = u * 2.4;
  const g = ctx.createLinearGradient(0, h - u * 16, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g; ctx.fillRect(0, h - u * 16, w, u * 16);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${u * 2.6}px "Inter Tight", Inter, system-ui, sans-serif`;
  ctx.fillText(cap.title.toUpperCase(), pad, h - pad - u * 2.4, w * 0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `500 ${u * 1.7}px Inter, system-ui, sans-serif`;
  ctx.fillText(cap.seat, pad, h - pad, w * 0.7);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff6a3d';
  ctx.font = `800 ${u * 2}px "Inter Tight", Inter, system-ui, sans-serif`;
  ctx.fillText('atvents', w - pad, h - pad);
  ctx.textAlign = 'left';
}

function flash() {
  const f = cap.ui.querySelector('.cap-flash');
  f.classList.remove('is-on'); void f.offsetWidth; f.classList.add('is-on');
}

function photo() {
  const { scene } = cap;
  scene.afterRender = gl => {
    scene.afterRender = null;
    const c = frameCanvas(gl);
    drawFrame(c.getContext('2d'), gl);
    flash();
    c.toBlob(b => b ? review(b, 'image') : toast('The photo could not be taken. Please try again.'), 'image/jpeg', 0.92);
  };
}

function startRec() {
  const type = pickType();
  const gl = cap.scene.renderer.domElement, c = frameCanvas(gl), ctx = c.getContext('2d');
  let rec;
  try {
    rec = new MediaRecorder(c.captureStream(30), { ...(type && { mimeType: type }), videoBitsPerSecond: 8e6 });
  } catch { toast('This browser cannot record the screen.'); return; }
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => review(new Blob(chunks, { type: rec.mimeType || type || 'video/webm' }), 'video');
  cap.scene.afterRender = g => drawFrame(ctx, g);
  drawFrame(ctx, gl);
  rec.start(500);
  const t0 = performance.now(), badge = cap.ui.querySelector('.cap-rec');
  badge.hidden = false;
  cap.ui.classList.add('is-rec');
  cap.ui.querySelector('.cap-shutter').setAttribute('aria-label', 'Stop recording');
  cap.rec = { rec, timer: setInterval(() => {
    const s = Math.floor((performance.now() - t0) / 1000);
    badge.querySelector('b').textContent = `0:${String(s).padStart(2, '0')}`;
    if (s >= MAX_REC) stopRec();
  }, 250) };
}

function stopRec() {
  if (!cap?.rec) return;
  const { rec, timer } = cap.rec;
  clearInterval(timer);
  cap.rec = null;
  cap.scene.afterRender = null;
  cap.ui.classList.remove('is-rec');
  cap.ui.querySelector('.cap-rec').hidden = true;
  cap.ui.querySelector('.cap-shutter').setAttribute('aria-label', 'Start recording');
  if (rec.state !== 'inactive') rec.stop();
}

function review(blob, kind) {
  if (!cap) return;
  URL.revokeObjectURL(cap.url);
  const ext = kind === 'image' ? 'jpg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
  cap.url = URL.createObjectURL(blob);
  cap.file = new File([blob], `atvents-${slug(cap.title)}-my-view.${ext}`, { type: blob.type });
  const media = kind === 'image'
    ? `<img src="${cap.url}" alt="Your view from your seat">`
    : `<video src="${cap.url}" autoplay loop muted playsinline controls></video>`;
  const canShare = !!navigator.canShare?.({ files: [cap.file] });
  const sheet = cap.ui.querySelector('.cap-sheet');
  sheet.innerHTML = `
    <div class="cap-shot">${media}</div>
    <div class="cap-acts">
      <button class="btn btn-line" type="button" data-cap="again">${icon('i-reset', 'lead')}<span>Take another</span></button>
      ${canShare ? `<button class="btn btn-coral" type="button" data-cap="share">${icon('i-share', 'lead')}<span>Share</span></button>` : ''}
      <a class="btn ${canShare ? 'btn-line' : 'btn-coral'}" href="${cap.url}" download="${esc(cap.file.name)}">${icon('i-download', 'lead')}<span>Save</span></a>
    </div>`;
  sheet.hidden = false;
  cap.ui.classList.add('is-review');
}

function closeSheet() {
  const sheet = cap.ui.querySelector('.cap-sheet');
  sheet.hidden = true; sheet.innerHTML = '';
  cap.ui.classList.remove('is-review');
}

async function shareShot() {
  try { await navigator.share({ files: [cap.file], title: cap.title }); } catch { /* the fan closed the share sheet */ }
}

export function stopCapture() {
  if (!cap) return;
  stopRec();
  cap.scene.afterRender = null;
  URL.revokeObjectURL(cap.url);
  cap.ui.remove();
  cap.stage.classList.remove('is-capture');
  // The panels come back unless the fan had hidden them with the button before.
  if ($('#t-min')?.getAttribute('aria-pressed') !== 'true') cap.stage.classList.remove('is-min');
  document.removeEventListener('keydown', onKey);
  document.removeEventListener('fullscreenchange', onFs);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  cap = null;
}
