// The live chat (worker/chat.mjs): what may be said, the ticket, and the rooms under a crowd:
// a message goes from its shard to the hub, which sends one packet per BATCH_MS to each shard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatRoom, cleanText, cleanName, shardOf, sample, signTicket, readTicket, SHARDS, MAX_BATCH, MAX_TEXT, EVERY_MS, TICKET_MS, roomName } from '../worker/chat.mjs';

test('links come out, rude words are masked, long text is cut', () => {
  assert.equal(cleanText('  Jimin lewat!!  '), 'Jimin lewat!!');
  assert.equal(cleanText('beli di https://scam.example/x sekarang'), 'beli di sekarang');
  assert.equal(cleanText('cek www.spam.com ya'), 'cek ya');
  assert.equal(cleanText('promo tiketmurah.id/bts'), 'promo');
  assert.equal(cleanText('dasar anjing'), 'dasar a*****');
  assert.equal(cleanText('Fuck yes'), 'F*** yes');
  assert.equal(cleanText('babies are cute'), 'babies are cute');   // whole words only
  assert.equal([...cleanText('💜'.repeat(400))].length, MAX_TEXT);
  assert.equal(cleanText('https://only.a/link'), '');
  assert.equal(cleanText('‮abc\u0000'), 'abc');
});

test('a chat name is 2 to 24 characters, without links', () => {
  assert.equal(cleanName(' Nadia '), 'Nadia');
  assert.equal(cleanName('x'), '');
  assert.equal(cleanName('a'.repeat(40)).length, 24);
  assert.equal(cleanName('www.spam.com'), '');
});

test('a pass always lands on the same shard, and the shards share the load', () => {
  assert.equal(shardOf('PAY-ABC'), shardOf('PAY-ABC'));
  const count = new Array(SHARDS).fill(0);
  for (let i = 0; i < 16000; i++) count[shardOf(`PAY-${i.toString(36).toUpperCase()}`)]++;
  assert.ok(Math.min(...count) > 700 && Math.max(...count) < 1300, String(count));
});

test('a busy packet keeps MAX_BATCH messages, in the order they came', () => {
  const list = Array.from({ length: 50 }, (_, i) => i);
  const s = sample(list);
  assert.equal(s.length, MAX_BATCH);
  assert.deepEqual(s, [...s].sort((a, b) => a - b));
  assert.equal(sample([1, 2, 3]).length, 3);
});

test('a ticket opens one concert for a short while, and cannot be changed', async () => {
  const key = 'SB-Mid-server-test', who = { id: 'PAY-1', eventId: 'bts-jakarta', cat: 'cat1', seat: 'S1', name: 'Nadia' };
  const t = await signTicket(key, who, 1000);
  assert.deepEqual(await readTicket(key, t, 1000 + 5000), who);
  assert.equal(await readTicket(key, t, 1000 + TICKET_MS + 1), null);
  assert.equal(await readTicket('another-key', t, 1000), null);
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify(['PAY-1', 'bts-jakarta', 'vip', 'S1', 'Nadia', 1e15])).toString('base64url');
  assert.equal(await readTicket(key, `${forged}.${sig}`, 1000), null);
  assert.equal(await readTicket(key, body, 1000), null);
});

// ---------------------------------------------------------------- the rooms, in Node

function fakeWs(attachment) {
  return {
    sent: [], att: attachment,
    send(s) { this.sent.push(JSON.parse(s)); },
    serializeAttachment(a) { this.att = structuredClone(a); },
    deserializeAttachment() { return structuredClone(this.att); },
    close() {},
  };
}
function world() {
  const rooms = new Map(), alarms = new Map();
  const env = {
    CHAT: {
      idFromName: name => name,
      get: name => ({ fetch: (url, init = {}) => room(name).fetch(new Request(url, init)) }),
    },
  };
  function room(name) {
    if (!rooms.has(name)) {
      const store = new Map(), sockets = [];
      const state = {
        storage: { get: async k => store.get(k), put: async (k, v) => { store.set(k, v); }, setAlarm: async at => { alarms.set(name, at); } },
        getWebSockets: () => sockets,
        acceptWebSocket: ws => sockets.push(ws),
        sockets,
      };
      const r = new ChatRoom(state, env);
      r.sockets = sockets;
      rooms.set(name, r);
    }
    return rooms.get(name);
  }
  // A fan on shard n: the socket as connect() would leave it, and the shard joined.
  async function fan(eventId, n, who) {
    const shard = room(roomName(eventId, n));
    await env.CHAT.get(roomName(eventId, 'hub')).fetch(`https://chat/${eventId}/hub/join?n=${n}`, { method: 'POST' });
    shard.joined = true;
    const ws = fakeWs({ ...who, eventId, n, last: 0 });
    shard.sockets.push(ws);
    return ws;
  }
  async function tick(eventId) {
    const hub = room(roomName(eventId, 'hub'));
    if (alarms.delete(roomName(eventId, 'hub'))) await hub.alarm();
  }
  return { room, fan, tick, alarms };
}

test('a message reaches every shard as one packet, and its sender at once', async () => {
  const w = world(), ev = 'bts-jakarta';
  const a = await w.fan(ev, 0, { id: 'PAY-A', name: 'Nadia', cat: 'cat1', seat: 'S1' });
  const b = await w.fan(ev, 5, { id: 'PAY-B', name: 'Rizky', cat: 'vip', seat: 'S2' });
  await w.room(roomName(ev, 0)).webSocketMessage(a, JSON.stringify({ t: 'say', text: 'halo ARMY https://x.com/a', k: 'k1' }));
  assert.equal(a.sent[0].t, 'mine');
  assert.equal(a.sent[0].msg.text, 'halo ARMY');
  assert.equal(a.sent[0].mine, 'k1');
  assert.equal(b.sent.length, 0);   // not before the packet
  await w.tick(ev);
  const pb = b.sent.at(-1);
  assert.equal(pb.t, 'msgs');
  assert.deepEqual(pb.msgs.map(m => [m.name, m.cat, m.seat, m.text]), [['Nadia', 'cat1', 'S1', 'halo ARMY']]);
  assert.equal(a.sent.at(-1).t, 'msgs');
});

test('one message every EVERY_MS per fan', async () => {
  const w = world(), ev = 'e1';
  const a = await w.fan(ev, 1, { id: 'PAY-A', name: 'Nadia', cat: 'cat1', seat: 'S1' });
  const shard = w.room(roomName(ev, 1));
  await shard.webSocketMessage(a, JSON.stringify({ t: 'say', text: 'satu' }));
  await shard.webSocketMessage(a, JSON.stringify({ t: 'say', text: 'dua' }));
  assert.deepEqual(a.sent.map(m => m.t), ['mine', 'slow']);
  assert.ok(a.sent[1].wait > 0 && a.sent[1].wait <= EVERY_MS);
});

test('a full stadium: two packets a second, at most MAX_BATCH messages each', async () => {
  const w = world(), ev = 'gbk';
  const fans = [];
  for (let i = 0; i < 400; i++) fans.push(await w.fan(ev, i % SHARDS, { id: `PAY-${i}`, name: `fan${i}`, cat: 'cat1', seat: `S${i}` }));
  // 400 fans each say something within the same half second.
  await Promise.all(fans.map((ws, i) => w.room(roomName(ev, i % SHARDS)).webSocketMessage(ws, JSON.stringify({ t: 'say', text: `pesan ${i}` }))));
  await w.tick(ev);
  const got = fans[7].sent.filter(m => m.t === 'msgs');
  assert.equal(got.length, 1);
  assert.equal(got[0].msgs.length, MAX_BATCH);
  assert.equal(got[0].more, 400 - MAX_BATCH);
  // Every fan got the very same packet.
  assert.ok(fans.every(f => JSON.stringify(f.sent.at(-1)) === JSON.stringify(got[0])));
});

test('a shard nobody is left on stops getting packets; a new fan gets the last messages', async () => {
  const w = world(), ev = 'e2';
  const a = await w.fan(ev, 2, { id: 'PAY-A', name: 'Nadia', cat: 'cat1', seat: 'S1' });
  await w.fan(ev, 3, { id: 'PAY-B', name: 'Rizky', cat: 'cat1', seat: 'S2' });
  w.room(roomName(ev, 3)).sockets.length = 0;
  await w.room(roomName(ev, 2)).webSocketMessage(a, JSON.stringify({ t: 'say', text: 'halo' }));
  await w.tick(ev);
  assert.deepEqual([...w.room(roomName(ev, 'hub')).shards], [2]);
  const r = await w.room(roomName(ev, 'hub')).join(4);
  assert.deepEqual((await r.json()).recent.map(m => m.text), ['halo']);
});
