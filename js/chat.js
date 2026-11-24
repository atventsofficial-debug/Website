// Live chat in the 3D view: the chat button in the bar opens a column on the left, over the
// venue with no box behind it, as live comments on TikTok or YouTube. Each message shows the
// sender's category and section (worker/chat.mjs sends them with it), so the chat reads like
// the stadium. Only a paid pass gets in; the server side is worker/chat.mjs.
//
// Light on a phone that is already drawing the venue: the server sends two packets a second
// at most, the column keeps the last CAP messages and drops the rest, new ones come in one per
// frame, only by moving and fading (no blur), and nothing is drawn while the tab is hidden.
import { $, esc, icon, state } from './ui.js';
import { mates } from './fans.js';

export const CAP = 25;
const NAME_KEY = 'atv-chat-name';
const MAX_WAIT = 30000;

// opts: { pass() → the paid pass in the view or null, chip(cat, seat) → { label, color } }
let opts = null;
const chat = { open: false, ws: null, passId: '', status: 'idle', error: '', unread: 0, more: 0, every: 3000, sentAt: 0, wait: 1000, timer: 0, queue: [], mine: new Set() };

const paidPass = () => {
  const p = opts?.pass();
  return p && p.status === 'confirmed' && p.route === 'paid' && p.token ? p : null;
};
const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const saveName = v => { try { localStorage.setItem(NAME_KEY, v); } catch { /* this visit only */ } };

// Dark text on a light category colour, light text on a dark one.
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#141212';
  const n = parseInt(m[1], 16), lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? '#141212' : '#fff';
}

export function messageHtml(m, chip) {
  const c = chip(m.cat, m.seat) || {};
  const tag = c.label ? `<span class="lc-chip" style="background:${esc(c.color || '#fff')};color:${inkOn(c.color)}">${esc(c.label)}</span>` : '';
  return `<div class="lc-who">${tag}<b>${esc(m.name)}</b></div><p class="lc-tx">${esc(m.text)}</p>`;
}

// ---------------------------------------------------------------- the column

function paintBtn() {
  const btn = $('#chat-btn');
  if (!btn) return;
  btn.setAttribute('aria-expanded', String(chat.open));
  btn.classList.toggle('is-on', chat.open);
  btn.classList.toggle('is-locked', !paidPass());
  const b = btn.querySelector('.chat-badge');
  if (b) { b.hidden = chat.open || !chat.unread; b.textContent = chat.unread > 99 ? '99+' : String(chat.unread); }
  $('#stage')?.classList.toggle('chat-open', chat.open);
}

function paint() {
  const box = $('#live-chat');
  if (!box) return;
  box.hidden = !chat.open;
  paintBtn();
  if (!chat.open) return;
  const p = paidPass(), v = state.venue;
  const head = `<div class="lc-head"><span class="lc-live"><i></i>Live chat</span><button class="lc-x" type="button" data-chat="close" aria-label="Close the chat" title="Close">${icon('i-x')}</button></div>`;
  if (!p) {
    box.innerHTML = `${head}<div class="lc-note"><p>Talk with the other fans at this concert while you look round from your seat. The live chat is for fans with a paid 3D pass.</p>${v?.eventId ? `<a class="btn btn-coral btn-sm" href="#unlock-${esc(v.eventId)}">Get a 3D pass</a>` : ''}</div>`;
    return;
  }
  if (!state.store?.chatTicket) {
    box.innerHTML = `${head}<div class="lc-note"><p>The live chat opens on the live site.</p></div>`;
    return;
  }
  if (chat.status === 'closed') {
    box.innerHTML = `${head}<div class="lc-note"><p>${esc(chat.error || 'The live chat is closed.')}</p></div>`;
    return;
  }
  if (!savedName()) {
    box.innerHTML = `${head}<form class="lc-name" data-chat="name" novalidate>
      <label for="lc-name">Your name in the chat</label>
      <div class="lc-row"><input id="lc-name" name="name" maxlength="24" autocomplete="nickname" placeholder="A first name or nickname" value="${esc(mates.data?.me?.name || '')}"><button class="lc-send" type="submit" aria-label="Join the chat">${icon('i-arrow')}</button></div>
      <p class="lc-fine">Other fans of this concert see it, with your category and section.</p>
    </form>`;
    return;
  }
  // The list stays as it is between paints: messages are only ever added to it.
  if (!box.querySelector('.lc-list')) {
    box.innerHTML = `${head}<div class="lc-list" id="lc-list" role="log" aria-live="off" data-no-i18n></div>
      <p class="lc-more" id="lc-more" hidden></p>
      <form class="lc-row lc-say" data-chat="say" autocomplete="off"><input id="lc-text" name="text" maxlength="150" placeholder="Say something…" aria-label="Your message"><button class="lc-send" type="submit" aria-label="Send">${icon('i-arrow')}</button></form>`;
  }
  const more = $('#lc-more');
  if (more) { more.hidden = !(chat.status !== 'live' || chat.more); more.textContent = chat.status === 'live' ? `+${chat.more} more messages` : 'Connecting…'; }
}

// One message a frame; a backlog keeps only the newest.
let frame = 0;
function drip() {
  frame = 0;
  const list = $('#lc-list');
  if (!list || document.hidden) return;
  if (chat.queue.length > CAP) chat.queue = chat.queue.slice(-CAP);
  const m = chat.queue.shift();
  if (m) {
    const el = document.createElement('div');
    el.className = `lc-m${m.mine ? ' is-mine' : ''}`;
    el.innerHTML = messageHtml(m, opts.chip);
    list.appendChild(el);
    while (list.childElementCount > CAP) list.firstElementChild.remove();
  }
  if (chat.queue.length) frame = requestAnimationFrame(drip);
}
function add(msgs, { count = true } = {}) {
  if (!msgs.length) return;
  chat.queue.push(...msgs);
  if (chat.queue.length > CAP) chat.queue = chat.queue.slice(-CAP);
  if (!chat.open && count) { chat.unread += msgs.length; paintBtn(); }
  if (chat.open && !frame) frame = requestAnimationFrame(drip);
}

// ---------------------------------------------------------------- the socket

function stop() {
  clearTimeout(chat.timer);
  const ws = chat.ws;
  chat.ws = null;
  if (ws) { ws.onclose = ws.onmessage = ws.onerror = null; try { ws.close(1000); } catch { /* gone */ } }
  clearInterval(chat.ping);
}
function retryLater() {
  if (chat.status === 'closed' || !chat.passId) return;
  chat.status = 'waiting';
  paint();
  chat.timer = setTimeout(connect, Math.round(chat.wait * (0.8 + Math.random() * 0.4)));
  chat.wait = Math.min(MAX_WAIT, chat.wait * 2);
}

async function connect() {
  stop();
  const p = paidPass(), name = savedName();
  if (!p || !name || !state.store?.chatTicket) return;
  chat.passId = p.id;
  chat.status = 'connecting';
  paint();
  let d;
  try {
    d = await state.store.chatTicket(p, name);
  } catch (err) {
    if (chat.passId !== p.id) return;
    if (err?.field === 'name') { saveName(''); chat.status = 'idle'; paint(); return; }
    if ([403, 404, 410, 503].includes(err?.status) && err?.code !== 'device') { chat.status = 'closed'; chat.error = err.message; paint(); return; }
    if (err?.retryAfter) chat.wait = Math.max(chat.wait, err.retryAfter * 1000);
    retryLater();
    return;
  }
  if (chat.passId !== p.id) return;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/chat/${encodeURIComponent(d.eventId)}?ticket=${encodeURIComponent(d.ticket)}`);
  chat.ws = ws;
  ws.onmessage = e => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'hello') {
      chat.status = 'live'; chat.wait = 1000; chat.every = m.every || chat.every;
      const list = $('#lc-list');
      if (list) list.textContent = '';
      chat.queue = [];
      add(m.msgs || [], { count: false });
      paint();
    } else if (m.t === 'msgs') {
      chat.more = m.more || 0;
      add((m.msgs || []).filter(x => !chat.mine.has(x.k)));
      paint();
    } else if (m.t === 'mine') {
      chat.mine.add(m.msg.k);
      if (chat.mine.size > 50) chat.mine = new Set([...chat.mine].slice(-20));
      add([{ ...m.msg, mine: true }], { count: false });
    } else if (m.t === 'slow') {
      chat.sentAt = Date.now() - chat.every + (m.wait || 1000);
      sayState();
    }
  };
  ws.onclose = () => { if (chat.ws === ws) { chat.ws = null; clearInterval(chat.ping); retryLater(); } };
  // A word now and then keeps proxies from closing a quiet socket; the room answers it
  // without waking (worker/chat.mjs).
  chat.ping = setInterval(() => { if (ws.readyState === 1 && !document.hidden) ws.send('{"t":"ping"}'); }, 45000);
}

// The send button rests for a moment after each message: one every few seconds.
function sayState() {
  const btn = $('#live-chat .lc-say .lc-send');
  if (!btn) return;
  const left = chat.every - (Date.now() - chat.sentAt);
  btn.disabled = left > 0;
  if (left > 0) setTimeout(sayState, left + 30);
}

// ---------------------------------------------------------------- open, close, bind

function setOpen(open) {
  chat.open = open;
  if (open) { chat.unread = 0; }
  paint();
  if (open) {
    const p = paidPass();
    if (p && p.id !== chat.passId) resetChat();
    if (p && !chat.ws && chat.status !== 'closed' && savedName()) connect();
    if (chat.queue.length && !frame) frame = requestAnimationFrame(drip);
    (savedName() ? $('#lc-text') : $('#lc-name'))?.focus({ preventScroll: true });
  }
}

export function resetChat() {
  stop();
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  Object.assign(chat, { ws: null, passId: '', status: 'idle', error: '', unread: 0, more: 0, queue: [], mine: new Set(), wait: 1000 });
  const list = $('#lc-list');
  if (list) list.textContent = '';
}

// Leaving the 3D view: the socket goes, the column closes.
export function closeChat() {
  resetChat();
  chat.open = false;
  const box = $('#live-chat');
  if (box) { box.hidden = true; box.innerHTML = ''; }
  paintBtn();
}

// The pass in the view changed (or got paid): the button's lock, and a fresh start.
export function syncChat() {
  const p = paidPass();
  if (chat.passId && (!p || p.id !== chat.passId)) { resetChat(); if (chat.open) setOpen(true); }
  paintBtn();
}

export function bindChat(o) {
  opts = o;
  const btn = $('#chat-btn'), box = $('#live-chat');
  if (!btn || !box) return;
  btn.addEventListener('click', () => setOpen(!chat.open));
  box.addEventListener('click', e => {
    if (e.target.closest('[data-chat="close"]')) { setOpen(false); btn.focus(); }
  });
  box.addEventListener('submit', e => {
    const f = e.target.closest('form');
    if (!f) return;
    e.preventDefault();
    if (f.dataset.chat === 'name') {
      const v = String(f.elements.name.value || '').trim().replace(/\s+/g, ' ');
      if ([...v].length < 2) { f.elements.name.focus(); return; }
      saveName([...v].slice(0, 24).join(''));
      paint();
      connect();
      $('#lc-text')?.focus();
    }
    if (f.dataset.chat === 'say') {
      const input = f.elements.text, text = String(input.value || '').trim();
      if (!text || chat.ws?.readyState !== 1 || Date.now() - chat.sentAt < chat.every) return;
      chat.ws.send(JSON.stringify({ t: 'say', text }));
      chat.sentAt = Date.now();
      input.value = '';
      sayState();
    }
  });
  // Back on the tab: what came in while it was hidden, newest first in line.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && chat.open && chat.queue.length && !frame) frame = requestAnimationFrame(drip); });
  paintBtn();
}
