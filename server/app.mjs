// Wires config, database, records and routes into one HTTP server.
// createApp() is what the tests start; server/server.mjs runs it for real.
import http from 'node:http';
import { ROOT } from './config.mjs';
import { createPool, migrate } from './db.mjs';
import { createStore } from './store.mjs';
import { HttpError, readJson, send, clientIp, createRateLimiter, requireAdmin, checkOrigin, securityHeaders, serveStatic } from './http.mjs';

export async function createApp(cfg, { pool: givenPool, log = true } = {}) {
  const pool = givenPool || createPool(cfg.databaseUrl);
  await migrate(pool);
  const store = createStore(pool);
  const limit = createRateLimiter({
    default: { max: 600, windowMs: 60000 },
    clicks: { max: 120, windowMs: 60000 },
    claims: { max: 10, windowMs: 600000 },
    status: { max: 120, windowMs: 60000 },
    partners: { max: 5, windowMs: 600000 },
    subscribe: { max: 10, windowMs: 600000 },
    admin: { max: 60, windowMs: 60000 },
  });
  const headers = securityHeaders(ROOT, cfg.publicUrl.startsWith('https://'));

  // [method, path, rate bucket, handler({ req, body, m }), { admin, maxBody }]
  const routes = [
    ['GET', /^\/api\/config$/, 'default', () => ({ mode: 'server', affiliateLink: cfg.affiliateLink })],

    // Fans: a click out to tiket.com, a 3D pass claim and its status, sign-ups.
    ['POST', /^\/api\/clicks$/, 'clicks', ({ body }) => store.click(body)],
    ['POST', /^\/api\/claims$/, 'claims', ({ body }) => store.claim(body)],
    ['GET', /^\/api\/claims\/([\w-]{1,32})$/, 'status', ({ req, m }) => store.claimStatus(m[0], String(req.headers['x-pass-token'] || ''))],
    ['POST', /^\/api\/subscribe$/, 'subscribe', ({ body }) => store.subscribe(body)],
    ['POST', /^\/api\/partners$/, 'partners', ({ body }) => store.partnerLead(body)],

    // Admin: Authorization: Bearer <ADMIN_TOKEN>, checked before the body is read.
    ['GET', /^\/api\/admin\/summary$/, 'admin', () => store.summary(), { admin: true }],
    ['GET', /^\/api\/admin\/claims$/, 'admin', async () => ({ claims: await store.claims() }), { admin: true }],
    ['POST', /^\/api\/admin\/claims\/([\w-]{1,32})$/, 'admin', ({ m, body }) => store.setClaim(m[0], body.status), { admin: true }],
    ['POST', /^\/api\/admin\/conversions$/, 'admin', ({ body }) => store.importConversions(body.rows), { admin: true, maxBody: 1024 * 1024 }],
    ['GET', /^\/api\/admin\/leads$/, 'admin', async () => ({ leads: await store.leads() }), { admin: true }],
    ['GET', /^\/api\/admin\/subscribers$/, 'admin', async () => ({ subscribers: await store.subscribers() }), { admin: true }],
  ];

  const server = http.createServer(async (req, res) => {
    const t0 = Date.now();
    const url = new URL(req.url, 'http://x');
    res.on('finish', () => {
      // Method, path and status only: bodies carry emails, order IDs and phone numbers.
      if (log && (res.statusCode >= 400 || url.pathname.startsWith('/api/'))) console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`);
    });
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' }, headers);
      return serveStatic(ROOT, req, res, headers);
    }
    const route = routes.find(([mt, re]) => mt === req.method && re.test(url.pathname));
    if (!route) return send(res, 404, { error: 'Not found' }, headers);
    const [, path, bucket, handler, opts = {}] = route;
    try {
      if (cfg.rateLimits) limit(bucket, clientIp(req, cfg.trustProxy));
      if (req.method !== 'GET') checkOrigin(req, cfg.publicUrl);
      if (opts.admin) requireAdmin(req, cfg.adminToken);
      const body = req.method === 'POST' ? await readJson(req, opts.maxBody) : {};
      send(res, 200, await handler({ req, body, m: url.pathname.match(path).slice(1) }), headers);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(`${req.method} ${url.pathname} failed:`, e.code || '', e.message);
      const status = e instanceof HttpError ? e.status : 500;
      if (!req.complete) req.resume();   // an early refusal still drains the body, so the answer arrives
      send(res, status, { error: e instanceof HttpError ? e.message : 'Server error', ...(e.extra || {}) },
        status === 429 ? { ...headers, 'retry-after': String(e.extra.retryAfter) } : headers);
    }
  });

  return {
    server, pool, store,
    listen: (port = cfg.port) => new Promise(r => server.listen(port, () => r(server.address().port))),
    async close() {
      await new Promise(r => server.close(r));
      if (!givenPool) await pool.end();
    },
  };
}
