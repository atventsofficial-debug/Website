// HTTP plumbing: errors, JSON bodies, security headers, rate limits, admin auth,
// and static files. No framework, so every rule here is visible in one place.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const MAX_BODY = 32 * 1024;

export function readJson(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const type = (req.headers['content-type'] || '').split(';')[0].trim();
    const hasBody = +(req.headers['content-length'] || 0) > 0 || !!req.headers['transfer-encoding'];
    if (!hasBody) { req.resume(); return resolve({}); }
    if (type !== 'application/json') { req.resume(); return reject(new HttpError(415, 'Send JSON with content-type application/json')); }
    let size = 0, over = false;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > max) { over = true; chunks.length = 0; return; } // keep draining so the 413 reaches the client
      chunks.push(c);
    });
    req.on('end', () => {
      if (over) return reject(new HttpError(413, 'Request too large'));
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        const v = raw ? JSON.parse(raw) : {};
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        resolve(v);
      } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

export function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

export const clientIp = (req, trustProxy) =>
  (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

// Fixed-window counters per client and bucket. In-process: with several instances
// behind a load balancer, also rate-limit at the proxy.
export function createRateLimiter(rules) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, 60000);
  timer.unref();
  return function check(bucket, key) {
    const rule = rules[bucket] || rules.default;
    const k = `${bucket}:${key}`;
    const now = Date.now();
    let h = hits.get(k);
    if (!h || h.reset < now) { h = { n: 0, reset: now + rule.windowMs }; hits.set(k, h); }
    h.n++;
    if (h.n > rule.max) throw new HttpError(429, 'Too many requests. Please wait a moment.', { retryAfter: Math.ceil((h.reset - now) / 1000) });
  };
}

export const sha256 = s => crypto.createHash('sha256').update(String(s)).digest();

export function requireAdmin(req, token) {
  // No token set: the admin stays closed, so a server started without NODE_ENV=production
  // never shows fans' details to anyone who asks.
  if (!token) throw new HttpError(401, 'Admin token required');
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!crypto.timingSafeEqual(sha256(got), sha256(token))) throw new HttpError(401, 'Admin token required');
}

// Browsers send Origin on cross-site requests; refuse state changes from other sites.
export function checkOrigin(req, publicUrl) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers.host;
  const ok = origin === new URL(publicUrl).origin || (host && (origin === `http://${host}` || origin === `https://${host}`));
  if (!ok) throw new HttpError(403, 'Cross-site request refused');
}

export function securityHeaders(root, isHttps) {
  // Hash the inline import map so the CSP can stay free of 'unsafe-inline' for scripts, and
  // allow only the folders it maps to (three.js at its exact version), not the whole CDN.
  let mapHash = '', cdn = '';
  try {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    if (m) {
      mapHash = `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`;
      cdn = [...new Set(Object.values(JSON.parse(m[1]).imports).map(u => u.slice(0, u.lastIndexOf('/') + 1)))].join(' ');
    }
  } catch { /* no index.html */ }
  // Buying happens on tiket.com, in its own tab: nothing here loads or frames a payment page.
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${mapHash} ${cdn}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    ...(isHttps ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
// Only these paths are public. Server code, data, .env and node_modules never are.
const PUBLIC = [/^\/index\.html$/, /^\/css\/[\w.-]+\.css$/, /^\/js\/[\w.-]+\.js$/, /^\/assets\/[\w/.-]+\.(png|jpe?g|webp|svg)$/, /^\/favicon\.ico$/];

export function serveStatic(root, req, res, headers) {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, { error: 'Bad path' }, headers); }
  if (rel === '/') rel = '/index.html';
  if (rel.includes('..') || rel.includes('\0') || !PUBLIC.some(re => re.test(rel))) return send(res, 404, { error: 'Not found' }, headers);
  const file = path.join(root, rel);
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'Not found' }, headers);
    const ext = path.extname(file);
    res.writeHead(200, {
      ...headers,
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}
