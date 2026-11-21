// The team (worker/team.mjs): Google's ID token checked on the server, the team key, and the
// passes the team opens without paying. Google, Midtrans and Resend played by stand-ins, D1
// by an in-memory SQLite. No network.
//
//   node --test test/team.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { writeWorkerCatalog } from '../scripts/worker-catalog.mjs';
import { EVENTS, getEvent, isConcert } from '../js/events.js';

writeWorkerCatalog(path.resolve(new URL('..', import.meta.url).pathname));
const { default: worker } = await import('../worker/index.mjs');
const { concert } = await import('../worker/catalog.mjs');
const { forgetGoogleKeys, signTeam } = await import('../worker/team.mjs');

const KEY = 'SB-Mid-server-TESTKEY0123456789abcdef';
const ORIGIN = 'https://atvents.com';
const GOOGLE = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
const OWNER = 'owner@gmail.com', FRIEND = 'Teman.Baik@gmail.com';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: sql => stmt(sql), rows: () => db.prepare('SELECT * FROM orders').all() };
}

// Google's signing key, and one that is not Google's.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'g1', alg: 'RS256', use: 'sig' };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(claims = {}, { key = privateKey, kid = 'g1', alg = 'RS256' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg, kid, typ: 'JWT' })}.${b64({ iss: 'https://accounts.google.com', aud: GOOGLE, sub: '1', email: OWNER, email_verified: true, iat: now, exp: now + 3600, ...claims })}`;
  return `${body}.${crypto.sign('sha256', Buffer.from(body), key).toString('base64url')}`;
}

let db, calls, mails;
const env = (more = {}) => ({ MIDTRANS_SERVER_KEY: KEY, GOOGLE_CLIENT_ID: GOOGLE, ADMIN_EMAILS: `${OWNER}, ${FRIEND}`, DB: db, RESEND_API_KEY: 're_test', ASSETS: { fetch: async () => new Response('static', { status: 200, headers: { 'content-type': 'text/html' } }) }, ...more });
const realFetch = globalThis.fetch, realLog = console.log, realError = console.error;
beforeEach(() => {
  db = fakeD1(); calls = []; mails = [];
  forgetGoogleKeys();
  console.log = () => {}; console.error = () => {};
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    if (String(url) === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [JWK] }, { headers: { 'cache-control': 'public, max-age=20000' } });
    if (String(url) === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return Response.json({ id: 'm' }); }
    throw new Error(`unexpected fetch ${url}`);
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.log = realLog; console.error = realError; });

const ctx = { waitUntil: () => {} };
const DEVICE = 'device-aaaaaaaaaaaaaaaa';
const req = (p, init = {}) => worker.fetch(new Request(`${ORIGIN}${p}`, { ...init, headers: { 'x-device': DEVICE, origin: ORIGIN, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } }), init.env || env(), ctx);
const session = (token, more) => req('/api/team/session', { method: 'POST', body: JSON.stringify({ idToken: token }), ...more });

const live = EVENTS.find(e => isConcert(e.id) && concert(e.id) && concert(e.id).start > Date.now());
const venue = getEvent(live.id), seat = venue.seats[Math.floor(venue.seats.length / 2)];

test('the team sign-in shows only with a list, Google\'s client id and the order book', async () => {
  const cfg = async more => (await (await req('/api/config', { env: env(more) })).json());
  assert.equal((await cfg()).team, true);
  assert.equal((await cfg({ ADMIN_EMAILS: '' })).team, undefined);
  assert.equal((await cfg({ GOOGLE_CLIENT_ID: '' })).team, undefined);
  assert.equal((await cfg({ DB: undefined })).team, undefined);
  assert.equal((await cfg()).staging, undefined);
  assert.equal((await cfg({ STAGING: '1' })).staging, true);
});

test('a Google account on the list gets a team key; the friend too, whatever the case', async () => {
  const r = await session(idToken());
  assert.equal(r.status, 200);
  const t = await r.json();
  assert.equal(t.email, OWNER);
  assert.ok(Date.parse(t.expiresAt) > Date.now() + 29 * 864e5);
  const me = await req('/api/team/me', { headers: { 'x-team-key': t.key } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).email, OWNER);
  assert.equal((await session(idToken({ email: 'teman.baik@gmail.com' }))).status, 200);
});

test('anything Google did not sign for this site and this person is refused', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const [why, token] of [
    ['not on the list', idToken({ email: 'stranger@gmail.com' })],
    ['signed by someone else', idToken({}, { key: other })],
    ['made for another app', idToken({ aud: '999-other.apps.googleusercontent.com' })],
    ['another issuer', idToken({ iss: 'https://evil.example' })],
    ['out of time', idToken({ exp: now - 10 })],
    ['email not verified', idToken({ email_verified: false })],
    ['a key Google does not have', idToken({}, { kid: 'nope' })],
    ['not RS256', idToken({}, { alg: 'none' })],
    ['payload changed', (() => { const [h, , s] = idToken().split('.'); return `${h}.${b64({ iss: 'https://accounts.google.com', aud: GOOGLE, email: OWNER, email_verified: true, exp: now + 3600, iat: now })}.${s}`; })()],
    ['not a token', 'hello'],
  ]) assert.equal((await session(token)).status, 403, why);
  assert.equal((await session(idToken(), { headers: { origin: 'https://evil.example' } })).status, 403, 'another site');
  assert.equal((await session(idToken(), { env: env({ ADMIN_EMAILS: '' }) })).status, 503);
});

test('a team key stops when it is forged, out of time, signed by another server key, or the address leaves the list', async () => {
  const { key } = await (await session(idToken())).json();
  const me = (k, more) => req('/api/team/me', { headers: { 'x-team-key': k }, ...more });
  assert.equal((await me(key)).status, 200);
  assert.equal((await me(key, { env: env({ ADMIN_EMAILS: FRIEND }) })).status, 401);
  assert.equal((await me(key, { env: env({ MIDTRANS_SERVER_KEY: 'Mid-server-OTHERKEY0123456789' }) })).status, 401);
  assert.equal((await me(`${key.split('.')[0]}.${'A'.repeat(43)}`)).status, 401);
  const old = await signTeam(KEY, OWNER, Date.now() - 31 * 864e5);
  assert.equal((await me(old.key)).status, 401);
  assert.equal((await me('')).status, 401);
});

test('a team pass opens like a paid one, with no Midtrans and no email', async () => {
  const { key } = await (await session(idToken())).json();
  const body = JSON.stringify({ eventId: live.id, cat: seat.cat, seat: seat.id, name: 'Organoo' });
  assert.equal((await req('/api/team/passes', { method: 'POST', body })).status, 401, 'no key');
  const r = await req('/api/team/passes', { method: 'POST', body, headers: { 'x-team-key': key } });
  assert.equal(r.status, 201);
  const p = await r.json();
  assert.equal(p.status, 'confirmed');
  assert.equal(p.amount, 0);
  const [row] = db.rows();
  assert.equal(row.status, 'confirmed');
  assert.equal(row.method, 'team');
  assert.equal(row.email, OWNER);
  const st = await req(`/api/passes/${p.id}`, { headers: { 'x-pass-token': p.token } });
  assert.equal(st.status, 200);
  assert.equal((await st.json()).status, 'confirmed');
  assert.equal(mails.length, 0);
  assert.ok(!calls.some(u => u.includes('midtrans')), 'Midtrans is never asked');
  const bad = await req('/api/team/passes', { method: 'POST', body: JSON.stringify({ eventId: live.id, cat: seat.cat, seat: 'nope' }), headers: { 'x-team-key': key } });
  assert.equal(bad.status, 400);
});

test('the staging copy tells search engines to leave it out; the live site does not', async () => {
  assert.equal((await req('/', { env: env({ STAGING: '1' }) })).headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal((await req('/')).headers.get('x-robots-tag'), null);
});
