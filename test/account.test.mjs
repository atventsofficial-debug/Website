// Signing in to My 3D passes (worker/account.mjs): by email code or by Google, only for an
// email with a paid pass. Google and Resend played by stand-ins, D1 by an in-memory SQLite.
//
//   node --test test/account.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { writeWorkerCatalog } from '../scripts/worker-catalog.mjs';

writeWorkerCatalog(path.resolve(new URL('..', import.meta.url).pathname));
const { default: worker } = await import('../worker/index.mjs');
const { forgetGoogleKeys } = await import('../worker/team.mjs');
const { saveOrder, setStatus } = await import('../worker/orders.mjs');
const { readPass } = await import('../worker/passkey.mjs');
const { signFan } = await import('../worker/account.mjs');

const KEY = 'SB-Mid-server-TESTKEY0123456789abcdef';
const ORIGIN = 'https://atvents.com';
const GOOGLE = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
const BUYER = 'Rina.Fan@gmail.com';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: sql => stmt(sql), q: (sql, ...a) => db.prepare(sql).all(...a) };
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'g1', alg: 'RS256', use: 'sig' };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'RS256', kid: 'g1', typ: 'JWT' })}.${b64({ iss: 'https://accounts.google.com', aud: GOOGLE, sub: '1', email: 'rina.fan@gmail.com', email_verified: true, iat: now, exp: now + 3600, ...claims })}`;
  return `${body}.${crypto.sign('sha256', Buffer.from(body), privateKey).toString('base64url')}`;
}

let db, mails;
const env = (more = {}) => ({ MIDTRANS_SERVER_KEY: KEY, GOOGLE_CLIENT_ID: GOOGLE, DB: db, RESEND_API_KEY: 're_test1234567', ASSETS: { fetch: async () => new Response('static') }, ...more });
const realFetch = globalThis.fetch, realLog = console.log, realError = console.error;
beforeEach(async () => {
  db = fakeD1(); mails = [];
  forgetGoogleKeys();
  console.log = () => {}; console.error = () => {};
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [JWK] }, { headers: { 'cache-control': 'public, max-age=20000' } });
    if (String(url) === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return Response.json({ id: 'm' }); }
    throw new Error(`unexpected fetch ${url}`);
  };
  const order = (id, email, status) => saveOrder(env(), { id, eventId: 'evt-x', title: 'X', cat: 'CAT 1', seat: 's1', seatLabel: 'A', name: 'Rina Fan', email, amount: 25000, plan: 'seat', origin: ORIGIN, createdAt: Date.now() }).then(() => setStatus(env(), id, status));
  await order('PAY-AAAAAAAAAAAAAAAA', BUYER, 'confirmed');
  await order('PAY-BBBBBBBBBBBBBBBB', BUYER, 'rejected');
  await order('PAY-CCCCCCCCCCCCCCCC', 'other@mail.com', 'confirmed');
});
afterEach(() => { globalThis.fetch = realFetch; console.log = realLog; console.error = realError; });

const ctx = { waitUntil: () => {} };
const req = (p, init = {}) => worker.fetch(new Request(`${ORIGIN}${p}`, { ...init, headers: { 'x-device': init.device || 'device-aaaaaaaaaaaaaaaa', origin: ORIGIN, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } }), init.env || env(), ctx);
const post = (p, body, more) => req(p, { method: 'POST', body: JSON.stringify(body), ...more });
const codeIn = () => /\b(\d{6})\b/.exec(mails.at(-1).text)[1];

test('config says how a fan can sign in', async () => {
  const cfg = async more => (await (await req('/api/config', { env: env(more) })).json()).account;
  assert.deepEqual(await cfg(), { code: true, google: true });
  assert.deepEqual(await cfg({ GOOGLE_CLIENT_ID: '' }), { code: true, google: false });
  assert.equal(await cfg({ DB: undefined }), undefined);
});

test('an email with no paid pass gets no code', async () => {
  for (const email of ['nobody@mail.com', 'RINA@mail.com']) {
    const r = await post('/api/me/code', { email });
    assert.equal(r.status, 404);
    assert.equal((await r.json()).code, 'not-bought');
  }
  assert.equal(mails.length, 0);
});

test('the code signs the buyer in, whatever the case, and only their paid passes come back', async () => {
  const r = await post('/api/me/code', { email: 'rina.fan@GMAIL.com' });
  assert.equal(r.status, 200);
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, [BUYER]);
  assert.equal((await post('/api/me/code', { email: BUYER })).status, 429, 'one a minute');
  assert.equal((await post('/api/me/session', { email: BUYER, code: '000000' === codeIn() ? '111111' : '000000' })).status, 400);
  assert.equal((await post('/api/me/session', { email: BUYER, code: codeIn() }, { device: 'device-bbbbbbbbbbbbbbbb' })).status, 400, 'another device');
  const s = await post('/api/me/session', { email: BUYER, code: codeIn() });
  assert.equal(s.status, 200);
  const me = await s.json();
  assert.equal(me.email, 'rina.fan@gmail.com');
  assert.deepEqual(me.passes.map(p => p.id), ['PAY-AAAAAAAAAAAAAAAA']);
  assert.equal((await readPass(KEY, me.passes[0].token)).id, 'PAY-AAAAAAAAAAAAAAAA');
  assert.equal((await post('/api/me/session', { email: BUYER, code: codeIn() })).status, 400, 'used once');
  const again = await req('/api/me/passes', { headers: { 'x-fan-key': me.key } });
  assert.equal(again.status, 200);
  assert.deepEqual((await again.json()).passes.map(p => p.id), ['PAY-AAAAAAAAAAAAAAAA']);
});

test('signing in opens the pass on this device, signing out the one used least recently', async () => {
  const pass = 'PAY-AAAAAAAAAAAAAAAA';
  for (const d of ['device-1111111111111111', 'device-2222222222222222']) {
    const { key } = await signFan(KEY, 'rina.fan@gmail.com');
    assert.equal((await req('/api/me/passes', { headers: { 'x-fan-key': key }, device: d })).status, 200);
  }
  assert.equal(db.q('SELECT COUNT(*) AS n FROM pass_devices WHERE order_id = ?', pass)[0].n, 2);
  const s = await post('/api/me/session', { idToken: idToken() }, { device: 'device-3333333333333333' });
  assert.equal(s.status, 200);
  assert.equal(db.q('SELECT COUNT(*) AS n FROM pass_devices WHERE order_id = ?', pass)[0].n, 2);
});

test('Google signs in a buyer, and refuses an account with no paid pass', async () => {
  assert.equal((await post('/api/me/session', { idToken: idToken() })).status, 200);
  const r = await post('/api/me/session', { idToken: idToken({ email: 'stranger@gmail.com' }) });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'not-bought');
  assert.equal((await post('/api/me/session', { idToken: 'nope' })).status, 403);
});

test('a fan key that is forged or out of time is refused', async () => {
  const { key } = await signFan(KEY, 'rina.fan@gmail.com');
  assert.equal((await req('/api/me/passes', { headers: { 'x-fan-key': `${key.split('.')[0]}.${'A'.repeat(43)}` } })).status, 401);
  const old = await signFan(KEY, 'rina.fan@gmail.com', Date.now() - 31 * 864e5);
  assert.equal((await req('/api/me/passes', { headers: { 'x-fan-key': old.key } })).status, 401);
  assert.equal((await req('/api/me/passes')).status, 401);
  assert.equal((await post('/api/me/code', { email: BUYER }, { headers: { origin: 'https://evil.example' } })).status, 403);
});
