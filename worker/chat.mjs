// Live chat in the 3D view (js/chat.js): paid passes of a concert talk while they look round
// from their seats. Each message carries the sender's category and section, so the chat
// reads like the stadium itself.
//
// Built for a full stadium without falling over:
//
//   - One Durable Object per concert is the hub; the fans' WebSockets sit on SHARDS other
//     objects of the same class (a pass always lands on the same one), so no single object
//     holds every connection. The sockets hibernate: a quiet chat costs nothing.
//   - A message goes from its fan's shard to the hub. The hub collects for BATCH_MS and sends
//     one packet to each shard with fans in it, which sends that one packet to its sockets. A
//     phone gets two packets a second however busy the chat is.
//   - In a packet at most MAX_BATCH messages, picked at random when more came in (the rest
//     only count, as `more`), as YouTube's top chat does.
//   - A fan says at most one thing every EVERY_MS, of up to MAX_TEXT characters, with links
//     taken out and a few rude words masked. Only a paid pass gets a ticket in (index.mjs).
//
// The class has no import from cloudflare:workers, so the tests run it in Node.
import { line } from '../js/order.js';

export const SHARDS = 16, BATCH_MS = 500, MAX_BATCH = 12, MAX_TEXT = 150, EVERY_MS = 3000;
export const KEEP = 20, MAX_PENDING = 300;
export const TICKET_MS = 2 * 6e4;
const NAME_MIN = 2, NAME_MAX = 24;

// ---------------------------------------------------------------- what may be said

const URLISH = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|id|co|io|me|ly|gg|xyz|link|site|online|shop|store|app|tv|info|biz)(?:\/\S*)?/gi;
// A short list, matched as whole words: the worst of it in Indonesian and English.
const RUDE = ['anjing', 'anjir', 'bangsat', 'bajingan', 'kontol', 'memek', 'ngentot', 'goblok', 'tolol', 'babi', 'jancok', 'jancuk', 'asu', 'pepek', 'fuck', 'fucking', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'nigga', 'nigger'];
const RUDE_RE = new RegExp(`(^|[^\\p{L}\\p{N}])(${RUDE.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu');

const cut = (s, n) => [...s].slice(0, n).join('');

// The text as it will show, or '' when nothing is left to say.
export function cleanText(v) {
  let s = line(v).replace(URLISH, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(RUDE_RE, (m, pre, word) => pre + word[0] + '*'.repeat([...word].length - 1));
  return cut(s, MAX_TEXT);
}

// The name other fans see beside the message.
export function cleanName(v) {
  const s = cut(line(v).replace(URLISH, ' ').replace(/\s+/g, ' ').trim(), NAME_MAX);
  return [...s].length >= NAME_MIN ? s : '';
}

// The shard a pass's socket sits on: always the same one.
export function shardOf(id) {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % SHARDS;
}

// At most `max` of the messages, picked at random, in the order they came.
export function sample(list, max = MAX_BATCH, rnd = Math.random) {
  if (list.length <= max) return list;
  const idx = list.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(0, max).sort((a, b) => a - b).map(i => list[i]);
}

// ---------------------------------------------------------------- the ticket
//
// A paid pass asks for a ticket with its key (POST /api/passes/<id>/chat), and opens the
// socket with it: a browser cannot put the key in a header on a WebSocket. A ticket is good
// for TICKET_MS, for one concert, and carries who is talking.

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const keys = new Map();
function ticketKey(serverKey) {
  if (!keys.has(serverKey)) {
    keys.set(serverKey, (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(serverKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const derived = await crypto.subtle.sign('HMAC', base, enc.encode('atvents chat ticket v1'));
      return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    })());
  }
  return keys.get(serverKey);
}

export async function signTicket(serverKey, { id, eventId, cat, seat, name }, now = Date.now()) {
  const body = b64url(enc.encode(JSON.stringify([id, eventId, cat, seat, name, now + TICKET_MS])));
  const sig = await crypto.subtle.sign('HMAC', await ticketKey(serverKey), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function readTicket(serverKey, token, now = Date.now()) {
  const m = /^([A-Za-z0-9_-]{8,600})\.([A-Za-z0-9_-]{43})$/.exec(String(token ?? ''));
  if (!m) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await ticketKey(serverKey), unb64url(m[2]), enc.encode(m[1])))) return null;
    const [id, eventId, cat, seat, name, exp] = JSON.parse(new TextDecoder().decode(unb64url(m[1])));
    if (!(exp > now)) return null;
    return { id, eventId, cat, seat, name };
  } catch { return null; }
}

// ---------------------------------------------------------------- the rooms
//
// Addresses inside the class (never from a browser: the Worker builds them):
//   /<event>/<n>/ws        a fan's socket, on shard n (header x-chat-who: the ticket's fan)
//   /<event>/<n>/deliver   the hub's packet, for shard n's sockets
//   /<event>/hub/post      a fan's message, for the hub
//   /<event>/hub/join      shard n has fans: the hub sends it packets, and the last messages
export const roomName = (eventId, part) => `${eventId}:${part}`;
const stub = (env, eventId, part) => env.CHAT.get(env.CHAT.idFromName(roomName(eventId, part)));
const inner = (eventId, part, what) => `https://chat/${encodeURIComponent(eventId)}/${part}/${what}`;
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // Hub: messages waiting for the next packet, how many were left out, the last ones sent,
    // and the shards with fans. Shard: the last messages, for a fan who just came in.
    this.pending = [];
    this.recent = [];
    this.shards = null;
    this.eventId = '';
    // A fan's keep-alive is answered without waking the room.
    if (typeof WebSocketRequestResponsePair === 'function') state.setWebSocketAutoResponse?.(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  async fetch(request) {
    const m = /^\/([^/]+)\/(hub|\d{1,2})\/(ws|deliver|post|join)$/.exec(new URL(request.url).pathname);
    if (!m) return new Response('Not found', { status: 404 });
    const eventId = decodeURIComponent(m[1]), part = m[2], what = m[3];
    this.eventId = eventId;
    if (part === 'hub') {
      if (what === 'post') return this.post(await request.json());
      if (what === 'join') return this.join(Number(new URL(request.url).searchParams.get('n')));
    } else {
      if (what === 'ws') return this.connect(request, eventId, Number(part));
      if (what === 'deliver') return this.deliver(await request.text());
    }
    return new Response('Not found', { status: 404 });
  }

  // ---- shard

  async connect(request, eventId, n) {
    let who;
    try { who = JSON.parse(request.headers.get('x-chat-who') || ''); } catch { who = null; }
    if (!who?.id || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id: who.id, name: who.name, cat: who.cat, seat: who.seat, eventId, n, last: 0 });
    // The first fan since this shard woke: tell the hub, and take its last messages.
    // (Also the first fan after a quiet spell: the hub forgets a shard that had nobody.)
    if (!this.joined || this.state.getWebSockets().length === 1) {
      try {
        const r = await stub(this.env, eventId, 'hub').fetch(inner(eventId, 'hub', `join?n=${n}`), { method: 'POST' });
        this.recent = (await r.json()).recent || [];
        this.joined = true;
      } catch { /* the next fan tries again */ }
    }
    server.send(JSON.stringify({ t: 'hello', msgs: this.recent, every: EVERY_MS, max: MAX_TEXT }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 2000) return;
    let d;
    try { d = JSON.parse(raw); } catch { return; }
    if (d?.t === 'ping') { ws.send('{"t":"pong"}'); return; }
    if (d?.t !== 'say') return;
    const who = ws.deserializeAttachment() || {};
    const now = Date.now();
    if (now - (who.last || 0) < EVERY_MS) { ws.send(JSON.stringify({ t: 'slow', wait: EVERY_MS - (now - who.last) })); return; }
    const text = cleanText(d.text);
    if (!text) return;
    who.last = now;
    ws.serializeAttachment(who);
    const msg = { k: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`, name: who.name, cat: who.cat, seat: who.seat, text, at: now };
    // The fan sees their own message at once; the packet may leave it out when it is busy.
    ws.send(JSON.stringify({ t: 'mine', msg, mine: d.k ? String(d.k).slice(0, 20) : '' }));
    try {
      await stub(this.env, who.eventId, 'hub').fetch(inner(who.eventId, 'hub', 'post'), { method: 'POST', body: JSON.stringify(msg), headers: { 'content-type': 'application/json' } });
    } catch { /* lost in a busy moment: the fan saw it, the others will not */ }
  }

  webSocketClose(ws, code, reason) {
    try { ws.close(code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code) ? code : 1000, reason); } catch { /* already closed */ }
  }
  webSocketError() { /* the socket is gone; nothing to keep */ }

  deliver(payload) {
    let n = 0;
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(payload); n++; } catch { /* closing */ }
    }
    try {
      const d = JSON.parse(payload);
      this.recent = [...this.recent, ...(d.msgs || [])].slice(-KEEP);
    } catch { /* ours, always JSON */ }
    return jsonRes({ n });
  }

  // ---- hub

  async loadShards() {
    if (!this.shards) this.shards = new Set((await this.state.storage.get('shards')) || []);
    return this.shards;
  }

  async join(n) {
    if (!(Number.isInteger(n) && n >= 0 && n < SHARDS)) return jsonRes({ error: 'shard' }, 400);
    const s = await this.loadShards();
    if (!s.has(n)) { s.add(n); await this.state.storage.put('shards', [...s]); }
    return jsonRes({ recent: this.recent });
  }

  async post(msg) {
    this.pending.push(msg);
    if (this.pending.length > MAX_PENDING) { this.dropped = (this.dropped || 0) + this.pending.length - MAX_PENDING; this.pending = this.pending.slice(-MAX_PENDING); }
    if (!this.alarmSet) {
      this.alarmSet = true;
      await this.state.storage.setAlarm(Date.now() + BATCH_MS);
    }
    return jsonRes({ ok: true });
  }

  async alarm() {
    this.alarmSet = false;
    const all = this.pending, eventId = this.eventId;
    this.pending = [];
    const more = all.length - Math.min(all.length, MAX_BATCH) + (this.dropped || 0);
    this.dropped = 0;
    if (!all.length || !eventId) return;
    const msgs = sample(all);
    this.recent = [...this.recent, ...msgs].slice(-KEEP);
    const payload = JSON.stringify({ t: 'msgs', msgs, more });
    const shards = await this.loadShards();
    const empty = [];
    await Promise.allSettled([...shards].map(async n => {
      const r = await stub(this.env, eventId, n).fetch(inner(eventId, n, 'deliver'), { method: 'POST', body: payload });
      if (((await r.json()).n || 0) === 0) empty.push(n);
    }));
    // A shard with nobody left gets no more packets until a fan comes in again.
    if (empty.length) { for (const n of empty) shards.delete(n); await this.state.storage.put('shards', [...shards]); }
  }
}
