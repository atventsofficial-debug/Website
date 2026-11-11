// API and security tests against a real Postgres database.
//
//   TEST_DATABASE_URL=postgres://seatsight:seatsight@localhost/seatsight_test npm test
//
// The test database is wiped at the start of the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadConfig } from '../server/config.mjs';
import { createApp } from '../server/app.mjs';
import { createPool } from '../server/db.mjs';
import { MAX_REPORT_ROWS } from '../js/rules.js';

const DB = process.env.TEST_DATABASE_URL || 'postgres://seatsight:seatsight@localhost/seatsight_test';
const EVENT = 'evt-bocelli-jakarta', OTHER = 'evt-mcr-jakarta';
const ADMIN = 'a'.repeat(32);
const AFFILIATE = 'https://invol.co/aff_m?offer_id=1&aff_id=2&url={url}&aff_sub={sub}&aff_sub2={src}&aff_sub3={event}';

let pool;
const apps = [];
let n = 0;
// Fresh click ids and order IDs for each test, so tests never share a booking.
const clickId = () => crypto.randomBytes(6).toString('hex');
const orderRef = () => `${1000000000 + ++n}`;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

async function startApp(env = {}) {
  const cfg = loadConfig({ DATABASE_URL: DB, PORT: '0', RATE_LIMITS: 'off', ADMIN_TOKEN: ADMIN, ...env });
  const app = await createApp(cfg, { pool, log: false });
  const port = await app.listen(0);
  const base = `http://127.0.0.1:${port}`;
  apps.push(app);
  const api = async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, {
      method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
  };
  const asAdmin = (method, path, body) => api(method, path, body, { authorization: `Bearer ${ADMIN}` });
  return { app, api, asAdmin, base, cfg };
}

const claimBody = (over = {}) => ({ eventId: EVENT, cat: 'gold', qty: 2, orderRef: orderRef(), email: 'rani@example.com', consent: true, clicks: [], ...over });
const claimRow = async id => (await pool.query('SELECT * FROM claims WHERE id = $1', [id])).rows[0];

before(async () => {
  const admin = new pg.Client({ connectionString: DB });
  await admin.connect();
  await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await admin.end();
  pool = createPool(DB, 20);
});

after(async () => {
  for (const a of apps) await a.close();
  await pool.end();
});

// ------------------------------------------------------------------ config

test('config: the affiliate link reaches the page only when it is a valid template', async () => {
  const { api } = await startApp();
  assert.deepEqual((await api('GET', '/api/config')).body, { mode: 'server', affiliateLink: '' });
  const withLink = await startApp({ AFFILIATE_LINK: AFFILIATE });
  assert.equal((await withLink.api('GET', '/api/config')).body.affiliateLink, AFFILIATE);
  for (const bad of ['http://invol.co/?url={url}&sub={sub}', 'https://invol.co/?url={url}', 'https://x.co/?u={url}&s={sub}"><script>']) {
    assert.throws(() => loadConfig({ DATABASE_URL: DB, AFFILIATE_LINK: bad }), /AFFILIATE_LINK/, bad);
  }
});

test('production refuses to start without a strong admin token, https and rate limits', () => {
  const prod = { DATABASE_URL: DB, NODE_ENV: 'production', PUBLIC_URL: 'https://seatsight.id', ADMIN_TOKEN: 'b'.repeat(24) };
  assert.doesNotThrow(() => loadConfig(prod));
  assert.throws(() => loadConfig({ ...prod, ADMIN_TOKEN: 'short' }), /ADMIN_TOKEN/);
  assert.throws(() => loadConfig({ ...prod, PUBLIC_URL: 'http://seatsight.id' }), /PUBLIC_URL/);
  assert.throws(() => loadConfig({ ...prod, RATE_LIMITS: 'off' }), /RATE_LIMITS/);
  assert.throws(() => loadConfig({ NODE_ENV: 'development' }), /DATABASE_URL/);
});

// ------------------------------------------------------------------ clicks

test('clicks: stored once, without personal data; unknown concerts and demos refused', async () => {
  const { api } = await startApp();
  const id = clickId();
  assert.equal((await api('POST', '/api/clicks', { id, eventId: EVENT, src: 'TikTok!' })).status, 200);
  assert.equal((await api('POST', '/api/clicks', { id, eventId: EVENT })).status, 200);
  const rows = (await pool.query('SELECT * FROM clicks WHERE id = $1', [id])).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['created_at', 'event_id', 'id', 'src']);
  assert.equal(rows[0].src, 'tiktok');
  for (const bad of [{ id: 'short', eventId: EVENT }, { id: 'ABCDEFGHIJKL', eventId: EVENT }, { id: clickId(), eventId: 'evt-nope' }, { id: clickId(), eventId: 'demo-concert' }, { id: clickId() }]) {
    assert.equal((await api('POST', '/api/clicks', bad)).status, 400, JSON.stringify(bad));
  }
});

// ------------------------------------------------------------------ 3D passes

test('a claim opens a pass at once; its key is returned once and stored only as a hash', async () => {
  const { api } = await startApp();
  const body = claimBody({ email: '  Rani@Example.COM ', orderRef: ` ${orderRef()}.9 ` });
  const r = await api('POST', '/api/claims', body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.id, /^P-[0-9A-F]{10}$/);
  assert.match(r.body.token, /^[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(Object.keys(r.body).sort(), ['cat', 'createdAt', 'eventId', 'id', 'qty', 'status', 'token']);
  assert.equal(r.body.status, 'checking');
  const row = await claimRow(r.body.id);
  assert.equal(row.email, 'rani@example.com');
  assert.equal(row.order_ref, body.orderRef.trim().replace('.', ''));
  assert.deepEqual(row.token_hashes, [sha(r.body.token)]);
  assert.ok(!JSON.stringify(row).includes(r.body.token), 'the key itself is not stored');

  const status = await api('GET', `/api/claims/${r.body.id}`, undefined, { 'x-pass-token': r.body.token });
  assert.equal(status.status, 200);
  assert.deepEqual(Object.keys(status.body).sort(), ['cat', 'createdAt', 'eventId', 'id', 'qty', 'status']);
  // A wrong, missing or malformed key, or an unknown pass: the same 404.
  for (const [id, token] of [[r.body.id, 'x'.repeat(32)], [r.body.id, ''], [r.body.id, "' OR 1=1 --"], ['P-0000000000', r.body.token], ["P-1' OR '1'='1", r.body.token]]) {
    const bad = await api('GET', `/api/claims/${encodeURIComponent(id)}`, undefined, token ? { 'x-pass-token': token } : {});
    assert.equal(bad.status, 404, `${id} ${token}`);
  }
});

test('one booking, one pass: the same email gets a new key to it, another email is refused', async () => {
  const { api } = await startApp();
  const body = claimBody();
  const first = (await api('POST', '/api/claims', body)).body;
  const again = await api('POST', '/api/claims', { ...body, email: 'RANI@example.com', cat: 'pearl', qty: 1 });
  assert.equal(again.status, 200);
  assert.equal(again.body.id, first.id);
  assert.equal(again.body.cat, 'gold', 'the pass keeps its category');
  assert.notEqual(again.body.token, first.token);
  for (const t of [first.token, again.body.token]) assert.equal((await api('GET', `/api/claims/${first.id}`, undefined, { 'x-pass-token': t })).status, 200);
  const other = await api('POST', '/api/claims', { ...body, email: 'someone@example.com' });
  assert.equal(other.status, 409);
  assert.ok(!JSON.stringify(other.body).includes('rani'), 'the 409 does not reveal the first email');
  // The same order ID for another concert is another booking.
  assert.equal((await api('POST', '/api/claims', { ...body, eventId: OTHER, cat: 'festival', email: 'someone@example.com' })).status, 200);
});

test('a closed pass frees its booking for the right email, and its old keys stop working', async () => {
  const { api, asAdmin } = await startApp();
  const body = claimBody();
  const wrong = (await api('POST', '/api/claims', { ...body, email: 'squatter@example.com' })).body;
  assert.equal((await api('POST', '/api/claims', body)).status, 409);
  assert.equal((await asAdmin('POST', `/api/admin/claims/${wrong.id}`, { status: 'rejected' })).status, 200);
  const right = await api('POST', '/api/claims', body);
  assert.equal(right.status, 200);
  assert.notEqual(right.body.id, wrong.id);
  assert.equal(right.body.status, 'checking');
  assert.equal((await api('GET', `/api/claims/${wrong.id}`, undefined, { 'x-pass-token': wrong.token })).status, 404);
  assert.equal((await api('GET', `/api/claims/${right.body.id}`, undefined, { 'x-pass-token': wrong.token })).status, 404);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM claims WHERE event_id = $1 AND order_ref = $2', [EVENT, body.orderRef])).rows[0].n, 1);
});

test('two devices claiming the same booking at once get one pass', async () => {
  const { api } = await startApp();
  const body = claimBody();
  const all = await Promise.all(Array.from({ length: 12 }, () => api('POST', '/api/claims', body)));
  assert.deepEqual([...new Set(all.map(r => r.status))], [200]);
  assert.equal(new Set(all.map(r => r.body.id)).size, 1);
  assert.equal((await claimRow(all[0].body.id)).token_hashes.length, 10, 'the last ten keys are kept');
});

test('bad claims are refused with the field at fault', async () => {
  const { api } = await startApp();
  const cases = [
    [{ eventId: 'evt-nope' }, 'eventId'], [{ eventId: 'demo-concert' }, 'eventId'], [{ cat: 'nope' }, 'cat'], [{ cat: 'festival' }, 'cat'],
    [{ qty: 0 }, 'qty'], [{ qty: 9 }, 'qty'], [{ qty: '2' }, 'qty'], [{ qty: 1.5 }, 'qty'],
    [{ orderRef: '123' }, 'orderRef'], [{ orderRef: "1234567'; DROP TABLE claims; --" }, 'orderRef'], [{ orderRef: 'x'.repeat(30) }, 'orderRef'],
    [{ email: 'nope' }, 'email'], [{ email: `${'a'.repeat(150)}@example.com` }, 'email'], [{ consent: 'yes' }, 'consent'], [{ consent: undefined }, 'consent'],
  ];
  for (const [over, field] of cases) {
    const r = await api('POST', '/api/claims', claimBody(over));
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.equal(r.body.field, field, JSON.stringify(over));
  }
  assert.equal((await api('POST', '/api/claims', claimBody({ clicks: 'abcdefghijkl' }))).status, 200, 'malformed clicks are dropped, not refused');
});

test('clicks recorded for another concert do not count towards a pass', async () => {
  const { api } = await startApp();
  const mine = clickId(), elsewhere = clickId(), unknown = clickId();
  await api('POST', '/api/clicks', { id: mine, eventId: EVENT });
  await api('POST', '/api/clicks', { id: elsewhere, eventId: OTHER });
  const r = await api('POST', '/api/claims', claimBody({ clicks: [mine, elsewhere, unknown, 'NOT-A-CLICK', 7] }));
  assert.deepEqual((await claimRow(r.body.id)).click_ids.sort(), [mine, unknown].sort());
});

// ------------------------------------------------------------------ the affiliate report

test('the conversion report confirms and closes passes by their clicks', async () => {
  const { api, asAdmin } = await startApp();
  const [a, b, c, d, e, f] = Array.from({ length: 6 }, clickId);
  const pa = (await api('POST', '/api/claims', claimBody({ clicks: [a] }))).body;
  const pb = (await api('POST', '/api/claims', claimBody({ clicks: [b] }))).body;
  const pcd = (await api('POST', '/api/claims', claimBody({ clicks: [c, d] }))).body;
  const pf = (await api('POST', '/api/claims', claimBody({ clicks: [f] }))).body;
  const none = (await api('POST', '/api/claims', claimBody())).body;
  // The admin confirmed this one by hand: a later report does not change it.
  await asAdmin('POST', `/api/admin/claims/${pf.id}`, { status: 'confirmed' });
  const r = await asAdmin('POST', '/api/admin/conversions', {
    rows: [{ sub: a, status: 'approved' }, { sub: b, status: 'rejected' }, { sub: c, status: 'rejected' }, { sub: d, status: 'pending' }, { sub: f, status: 'rejected' }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { imported: 5, confirmed: 2, rejected: 1 });
  const st = async p => (await api('GET', `/api/claims/${p.id}`, undefined, { 'x-pass-token': p.token })).body.status;
  assert.equal(await st(pa), 'confirmed');
  assert.equal(await st(pb), 'rejected');
  assert.equal(await st(pcd), 'confirmed', 'one sale still standing confirms the pass');
  assert.equal(await st(pf), 'confirmed');
  assert.equal(await st(none), 'checking');
  // A report imported before the claim: the pass is confirmed as it opens.
  await asAdmin('POST', '/api/admin/conversions', { rows: [{ sub: e, status: 'approved' }] });
  assert.equal((await api('POST', '/api/claims', claimBody({ clicks: [e] }))).body.status, 'confirmed');
});

test('a report with the same click twice keeps its last row', async () => {
  const { api, asAdmin } = await startApp();
  const g = clickId();
  const p = (await api('POST', '/api/claims', claimBody({ clicks: [g] }))).body;
  const r = await asAdmin('POST', '/api/admin/conversions', { rows: [{ sub: g, status: 'approved' }, { sub: g, status: 'rejected' }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await claimRow(p.id)).status, 'rejected');
});

test('bad reports are refused whole', async () => {
  const { asAdmin } = await startApp();
  const ok = { sub: clickId(), status: 'approved' };
  for (const rows of [[], 'x', [ok, { sub: 'nope', status: 'approved' }], [ok, { sub: clickId(), status: 'maybe' }], [{ sub: 123456789012, status: 'approved' }],
    Array.from({ length: MAX_REPORT_ROWS + 1 }, () => ok)]) {
    assert.equal((await asAdmin('POST', '/api/admin/conversions', { rows })).status, 400, Array.isArray(rows) ? `${rows.length} rows` : rows);
  }
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM conversions WHERE sub = $1', [ok.sub])).rows[0].n, 0);
  const huge = await asAdmin('POST', '/api/admin/conversions', { rows: [ok], pad: 'x'.repeat(1.1 * 1024 * 1024) });
  assert.equal(huge.status, 413);
});

// ------------------------------------------------------------------ admin

test('admin routes need the token, checked before the body is read', async () => {
  const { api, asAdmin } = await startApp();
  const routes = [['GET', '/api/admin/summary'], ['GET', '/api/admin/claims'], ['GET', '/api/admin/leads'], ['GET', '/api/admin/subscribers'],
    ['POST', '/api/admin/claims/P-0000000000', { status: 'confirmed' }], ['POST', '/api/admin/conversions', { rows: [] }]];
  for (const [m, p, b] of routes) {
    assert.equal((await api(m, p, b)).status, 401, `${m} ${p}`);
    assert.equal((await api(m, p, b, { authorization: 'Bearer wrong' })).status, 401, `${m} ${p}`);
    assert.equal((await api(m, p, b, { authorization: `Bearer ${ADMIN}x` })).status, 401, `${m} ${p}`);
  }
  // A body over the limit without the token is refused as unauthorised: it was never read.
  assert.equal((await api('POST', '/api/admin/conversions', { pad: 'x'.repeat(1.1 * 1024 * 1024) })).status, 401);
  assert.equal((await asAdmin('GET', '/api/admin/summary')).status, 200);
  assert.equal((await asAdmin('POST', '/api/admin/claims/P-0000000000', { status: 'confirmed' })).status, 404);
  assert.equal((await asAdmin('POST', '/api/admin/claims/P-0000000000', { status: 'paid' })).status, 400);
  // A server started without a token keeps the admin closed, even to an empty token.
  const open = await startApp({ ADMIN_TOKEN: '' });
  for (const auth of [undefined, 'Bearer ', `Bearer ${ADMIN}`]) {
    assert.equal((await open.api('GET', '/api/admin/claims', undefined, auth ? { authorization: auth } : {})).status, 401);
  }
});

test('the admin summary counts clicks by concert and source, and passes by status', async () => {
  const { api, asAdmin } = await startApp();
  const before = (await asAdmin('GET', '/api/admin/summary')).body;
  const row = (s, id) => s.events.find(e => e.eventId === id) || { clicks: 0, clicks30: 0, checking: 0, confirmed: 0, rejected: 0 };
  const src = (s, name) => s.sources.find(x => x.src === name)?.clicks || 0;
  const ids = Array.from({ length: 3 }, clickId);
  await api('POST', '/api/clicks', { id: ids[0], eventId: OTHER, src: 'instagram' });
  await api('POST', '/api/clicks', { id: ids[1], eventId: OTHER, src: 'instagram' });
  await api('POST', '/api/clicks', { id: ids[2], eventId: OTHER });
  await api('POST', '/api/claims', claimBody({ eventId: OTHER, cat: 'festival', clicks: [ids[0]] }));
  const after = (await asAdmin('GET', '/api/admin/summary')).body;
  assert.equal(row(after, OTHER).clicks - row(before, OTHER).clicks, 3);
  assert.equal(row(after, OTHER).clicks30 - row(before, OTHER).clicks30, 3);
  assert.equal(row(after, OTHER).checking - row(before, OTHER).checking, 1);
  assert.equal(src(after, 'instagram') - src(before, 'instagram'), 2);
  assert.equal(typeof after.leads, 'number');
  assert.equal(typeof after.subscribers, 'number');
  const claims = (await asAdmin('GET', '/api/admin/claims')).body.claims;
  assert.deepEqual(Object.keys(claims[0]).sort(), ['cat', 'clicks', 'createdAt', 'email', 'eventId', 'id', 'orderRef', 'qty', 'status']);
});

// ------------------------------------------------------------------ partners and sign-ups

const lead = (over = {}) => ({ name: 'Dewi Lestari', company: 'Tiket Nusantara', email: 'dewi@example.com', phone: '+62 812 3456 7890',
  website: 'tiketnusantara.id', kind: 'ticketing', volume: '10k-100k', message: 'Two stadium shows in March.\nBoth at GBK.', consent: true, ...over });

test('partner requests: stored as plain text, the website made a link, bad fields refused', async () => {
  const { api, asAdmin } = await startApp();
  const r = await api('POST', '/api/partners', lead({ name: '<script>alert(1)</script>', message: 'Line one\r\nLine two\u0000‮' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.id, /^L-[0-9A-F]{10}$/);
  const saved = (await asAdmin('GET', '/api/admin/leads')).body.leads.find(l => l.id === r.body.id);
  assert.equal(saved.name, '<script>alert(1)</script>', 'stored as text; the admin page escapes it');
  assert.equal(saved.website, 'https://tiketnusantara.id/');
  assert.equal(saved.message, 'Line one\nLine two');
  for (const [over, field] of [[{ name: 'D' }, 'name'], [{ company: '' }, 'company'], [{ email: 'dewi@' }, 'email'], [{ phone: 'call me' }, 'phone'],
    [{ website: 'javascript:alert(1)' }, 'website'], [{ website: 'https://user:pw@evil.example' }, 'website'], [{ kind: 'casino' }, 'kind'],
    [{ volume: 'lots' }, 'volume'], [{ message: 'x'.repeat(2001) }, 'message'], [{ consent: false }, 'consent']]) {
    const bad = await api('POST', '/api/partners', lead(over));
    assert.equal(bad.status, 400, JSON.stringify(over));
    assert.equal(bad.body.field, field);
  }
});

test('the news list and concert alerts keep one row per address', async () => {
  const { api } = await startApp();
  const sub = body => api('POST', '/api/subscribe', body);
  const count = async () => (await pool.query(`SELECT count(*)::int AS n FROM subscribers WHERE email = 'fan@example.com'`)).rows[0].n;
  assert.equal((await sub({ kind: 'newsletter', email: 'Fan@Example.com' })).status, 200);
  assert.equal((await sub({ kind: 'newsletter', email: ' fan@example.com ', eventId: EVENT })).status, 200);
  assert.equal((await sub({ kind: 'alerts', email: 'fan@example.com', eventId: EVENT })).status, 200);
  assert.equal((await sub({ kind: 'alerts', email: 'fan@example.com', eventId: EVENT })).status, 200);
  assert.equal(await count(), 2);
  for (const bad of [{ kind: 'newsletter', email: 'nope' }, { kind: 'spam', email: 'fan@example.com' }, { kind: 'waitlist', email: 'fan@example.com', eventId: EVENT },
    { kind: 'alerts', email: 'fan@example.com' }, { kind: 'alerts', email: 'fan@example.com', eventId: 'demo-concert' }]) {
    assert.equal((await sub(bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal(await count(), 2);
});

// ------------------------------------------------------------------ the web layer

test('bodies must be JSON objects of a sensible size', async () => {
  const { api } = await startApp();
  assert.equal((await api('POST', '/api/partners', 'name=x', { 'content-type': 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await api('POST', '/api/partners', '{bad json')).status, 400);
  assert.equal((await api('POST', '/api/partners', '[1,2]')).status, 400);
  assert.equal((await api('POST', '/api/partners', lead({ message: 'x'.repeat(40 * 1024) }))).status, 413);
  assert.equal((await api('DELETE', '/api/claims')).status, 404);
  assert.equal((await api('POST', '/', {})).status, 405);
});

test('rate limits answer 429 with retry-after', async () => {
  const { api } = await startApp({ RATE_LIMITS: 'on' });
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await api('POST', '/api/partners', lead())).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
  const claims = [];
  for (let i = 0; i < 12; i++) claims.push((await api('POST', '/api/claims', claimBody())).status);
  assert.deepEqual(claims.slice(9), [200, 429, 429]);
  const r = await api('POST', '/api/claims', claimBody());
  assert.ok(+r.headers.get('retry-after') > 0);
});

test('cross-site POSTs are refused; the site’s own origin is fine', async () => {
  const { api, base } = await startApp();
  for (const p of ['/api/clicks', '/api/claims', '/api/partners', '/api/subscribe']) {
    assert.equal((await api('POST', p, {}, { origin: 'https://evil.example' })).status, 403, p);
  }
  assert.equal((await api('POST', '/api/clicks', { id: clickId(), eventId: EVENT }, { origin: base })).status, 200);
});

test('security headers and the static file allow-list', async () => {
  const { api, base } = await startApp();
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  const csp = r.headers.get('content-security-policy');
  for (const h of ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy']) assert.ok(r.headers.get(h), h);
  assert.match(csp, /frame-ancestors 'none'/);
  // Scripts from elsewhere: only the three.js folders the import map names, at their version.
  assert.match(csp, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+' https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/build\/ https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/examples\/jsm\/;/);
  assert.match(csp, /connect-src 'self';/);
  assert.ok(!/unsafe-inline[^;]*script|script-src[^;]*unsafe/.test(csp), 'no inline scripts');
  assert.ok(!/midtrans/i.test(csp));
  assert.match(r.headers.get('permissions-policy'), /payment=\(\)/);
  assert.equal((await fetch(base + '/', { method: 'HEAD' })).status, 200);
  for (const p of ['/js/app.js', '/css/styles.css', '/assets/events/bocelli-romanza.webp']) assert.equal((await fetch(base + p)).status, 200, p);
  for (const p of ['/server/config.mjs', '/server/schema.sql', '/.env', '/.env.example', '/package.json', '/README.md', '/node_modules/pg/package.json',
    '/test/api.test.mjs', '/%2e%2e/etc/passwd', '/js/../server/app.mjs', '/js/%2e%2e/server/app.mjs', '/dist/preview.html', '/scripts/build-preview.mjs']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
  assert.ok((await api('GET', '/api/config')).headers.get('x-content-type-options'));
  assert.equal((await api('GET', '/api/config')).headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/js/app.js')).headers.get('access-control-allow-origin'), null, 'no CORS');
});

test('logs never contain emails, order IDs, phone numbers, names or pass keys', async () => {
  const lines = [];
  const orig = [console.log, console.error];
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  let token;
  const body = claimBody({ email: 'secret.fan@example.com' });
  try {
    const app = await createApp(loadConfig({ DATABASE_URL: DB, RATE_LIMITS: 'off', ADMIN_TOKEN: ADMIN }), { pool, log: true });
    apps.push(app);
    const port = await app.listen(0);
    const call = (method, p, b, h = {}) => fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { 'content-type': 'application/json', ...h }, body: b && JSON.stringify(b) }).then(r => r.json());
    ({ token } = await call('POST', '/api/claims', body));
    await call('POST', '/api/claims', { ...body, email: 'other.fan@example.com' });   // 409
    await call('GET', `/api/claims/P-0000000000`, undefined, { 'x-pass-token': token });   // 404
    await call('POST', '/api/partners', lead({ name: 'Secret Name', email: 'secret.lead@example.com' }));
    await call('POST', '/api/partners', lead({ name: 'Secret Name', email: 'bad' }));   // 400
    await call('POST', '/api/subscribe', { kind: 'newsletter', email: 'secret.sub@example.com' });
  } finally {
    [console.log, console.error] = orig;
  }
  assert.ok(lines.length >= 6, 'requests are logged');
  const all = lines.join('\n');
  for (const pii of ['secret.fan', 'other.fan', body.orderRef, token, 'Secret Name', 'secret.lead', '3456 7890', 'secret.sub']) assert.ok(!all.includes(pii), `log leaked ${pii}`);
});

// ------------------------------------------------------------------ the demo store agrees

test('the demo store in the browser gives the same answers as the server', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  globalThis.sessionStorage = globalThis.localStorage;
  const { LocalStore, ApiStore } = await import('../js/store.js');
  const { base } = await startApp();
  const run = async store => {
    const out = [];
    const tryIt = async fn => { try { const r = await fn(); out.push(r.status ?? r.ok ?? r.imported); return r; } catch (e) { out.push(e.status); return null; } };
    const [x, y] = [clickId(), clickId()];
    const ref = orderRef();
    await tryIt(() => store.click({ id: x, eventId: EVENT }));
    await tryIt(() => store.click({ id: y, eventId: OTHER }));
    await tryIt(() => store.click({ id: 'bad', eventId: EVENT }));
    const p = await tryIt(() => store.claim(claimBody({ orderRef: ref, clicks: [x, y] })));
    await tryIt(() => store.claim(claimBody({ orderRef: ref, email: 'b@example.com' })));
    await tryIt(() => store.claim(claimBody({ orderRef: ref, qty: 0 })));
    await tryIt(() => store.importConversions([{ sub: y, status: 'approved' }]));
    out.push((await store.claimStatus(p.id, p.token)).status);   // y was for another concert: still checking
    await tryIt(() => store.importConversions([{ sub: x, status: 'rejected' }]));
    out.push((await store.claimStatus(p.id, p.token)).status);
    await tryIt(() => store.claim(claimBody({ orderRef: ref, email: 'b@example.com' })));   // closed: free again
    await tryIt(() => store.subscribe({ kind: 'alerts', email: 'a@example.com' }));
    await tryIt(() => store.partnerLead(lead({ kind: 'casino' })));
    await tryIt(() => store.partnerLead(lead()));
    await tryIt(() => store.setClaim(p.id, 'nope'));
    return out;
  };
  const local = await run(new LocalStore());
  const api = new ApiStore(`${base}/`);
  api.adminToken = ADMIN;
  const server = await run(api);
  assert.deepEqual(server, local);
  assert.deepEqual(local, [true, true, 400, 'checking', 409, 400, 1, 'checking', 1, 'rejected', 'checking', 400, 400, true, 400]);
});
