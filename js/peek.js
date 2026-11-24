// The price list on #unlock (index.html, #price-list): each line with a clip (data-peek) plays a
// few seconds of that feature, filmed in the 3D view, in a card beside it. A mouse shows it on
// hover, the keyboard on focus, a phone on a tap (a second tap, or a tap anywhere else, closes it).
//
// A clip is not a file to keep. Its file (assets/peek/<name>.bin, from scripts/peek-clips.mjs)
// is scrambled, so its link opens nothing playable; it is unscrambled here, in memory, and
// played from a blob URL in a <video> with no controls, no download, no picture-in-picture or
// casting, and no menu of its own (the card lets every click through to the page). Nothing
// can stop a screen recording; this stops the easy ways to save it.
import { scramble } from './peekcode.js';

const DELAY = 90;   // ms under the pointer before the card opens, so a pass over the list does not flash it
const GAP = 12;
const clips = new Map();   // name -> Promise<blob URL>

function load(name) {
  if (!clips.has(name)) {
    const p = fetch(`assets/peek/${encodeURIComponent(name)}.bin`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(buf => URL.createObjectURL(new Blob([scramble(new Uint8Array(buf), name)], { type: 'video/mp4' })));
    p.catch(() => clips.delete(name));   // a failed load tries again next time
    clips.set(name, p);
  }
  return clips.get(name);
}

let card = null, video = null, on = null, timer = 0;

function makeCard() {
  card = document.createElement('div');
  card.className = 'peek';
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML = '<span class="spinner"></span>';
  video = document.createElement('video');
  Object.assign(video, { muted: true, defaultMuted: true, loop: true, playsInline: true, autoplay: true, controls: false, disablePictureInPicture: true, disableRemotePlayback: true, preload: 'auto' });
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('controlslist', 'nodownload nofullscreen noplaybackrate noremoteplayback');
  video.setAttribute('disablepictureinpicture', '');
  video.setAttribute('disableremoteplayback', '');
  video.draggable = false;
  for (const ev of ['contextmenu', 'dragstart']) card.addEventListener(ev, e => e.preventDefault());
  card.append(video);
  document.body.append(card);
}

// Beside the line when there is room (right, then left), else above or below it.
function place(li) {
  const r = li.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const clampY = y => Math.max(GAP, Math.min(vh - h - GAP, y));
  const clampX = x => Math.max(GAP, Math.min(vw - w - GAP, x));
  let x, y;
  if (r.right + GAP + w <= vw - GAP) { x = r.right + GAP; y = clampY(r.top + r.height / 2 - h / 2); }
  else if (r.left - GAP - w >= GAP) { x = r.left - GAP - w; y = clampY(r.top + r.height / 2 - h / 2); }
  else { x = clampX(r.left + 30); y = r.top - GAP - h >= GAP ? r.top - GAP - h : r.bottom + GAP; }
  card.style.transform = '';
  card.style.left = `${Math.round(x)}px`;
  card.style.top = `${Math.round(y)}px`;
}

function show(li) {
  const name = li?.dataset.peek;
  if (!name) return;
  if (!card) makeCard();
  if (on && on !== li) on.classList.remove('is-peek');
  on = li;
  li.classList.add('is-peek');
  card.classList.remove('is-ready');
  video.removeAttribute('src');
  place(li);
  card.classList.add('is-on');
  load(name).then(url => {
    if (on !== li) return;
    video.src = url;
    video.play().then(() => { if (on === li) card.classList.add('is-ready'); }).catch(() => {});
  }).catch(() => { if (on === li) hide(); });
}

function hide() {
  clearTimeout(timer);
  if (!on) return;
  on.classList.remove('is-peek');
  on = null;
  card?.classList.remove('is-on', 'is-ready');
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
}

export function bindPeek(root) {
  if (!root) return;
  const lineOf = t => t?.closest?.('li[data-peek]');
  root.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const li = lineOf(e.target);
    if (!li || li === on) return;
    clearTimeout(timer);
    timer = setTimeout(() => show(li), DELAY);
  });
  root.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse') return;
    const li = lineOf(e.target);
    if (li && !li.contains(e.relatedTarget)) { clearTimeout(timer); if (li === on) hide(); }
  });
  // A tap opens the line's clip, or closes it; with a mouse the pointer already did.
  // The keyboard opens it on focus.
  let by = 'key';
  document.addEventListener('pointerdown', e => { by = e.pointerType || 'mouse'; }, { capture: true, passive: true });
  document.addEventListener('keydown', () => { by = 'key'; }, { capture: true });
  root.addEventListener('click', e => {
    const li = lineOf(e.target);
    if (!li || by === 'mouse' || by === 'key') return;
    if (li === on) hide(); else show(li);
  });
  root.addEventListener('focusin', e => { const li = lineOf(e.target); if (by === 'key' && li && li !== on) show(li); });
  root.addEventListener('focusout', e => { const li = lineOf(e.target); if (by === 'key' && li === on) hide(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  document.addEventListener('pointerdown', e => { if (on && !lineOf(e.target)) hide(); }, { passive: true });
  window.addEventListener('scroll', () => { if (on) place(on); }, { passive: true });
  window.addEventListener('resize', hide);
  window.addEventListener('hashchange', hide);
}
