// The security headers of the static build (scripts/build-site.mjs writes them into _headers).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function securityHeaders(root, isHttps, { midtrans = false, analytics = false } = {}) {
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
  // Concert tickets are bought from the official seller, in its own tab. The 3D pass is paid
  // through Midtrans, only on the static build, which pays through the Worker: then, and
  // only then, Midtrans' two app hosts may load the card form's script and the frame it
  // opens (js/snap.js), and its two API hosts may serve the QRIS and GoPay codes as images.
  // Nothing on the page fetches from Midtrans itself.
  const pay = midtrans ? 'https://app.midtrans.com https://app.sandbox.midtrans.com' : '';
  const qr = midtrans ? ' https://api.midtrans.com https://api.sandbox.midtrans.com' : '';
  // Google Tag Manager and the Analytics tag it loads (js/gtm.js), on the static build only:
  // the hosts Google lists for GA4 through GTM. Its tags are Google's own templates, so no
  // 'unsafe-inline' or 'unsafe-eval' is needed (a Custom HTML tag in GTM would not run).
  const gt = analytics ? ' https://*.googletagmanager.com' : '';
  const ga = analytics ? ' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com' : '';
  const gaImg = analytics ? ' https://*.google-analytics.com https://*.googletagmanager.com' : '';
  // Cloudflare Web Analytics, switched on for the site in the dashboard: Cloudflare adds its
  // beacon to the page it serves, and the beacon reports to cloudflareinsights.com. Cookieless.
  const cf = analytics ? ' https://static.cloudflareinsights.com' : '';
  const cfReport = analytics ? ' https://cloudflareinsights.com' : '';
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${mapHash} ${cdn}${pay ? ` ${pay}` : ''}${gt}${cf}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: blob:${qr}${gaImg}`,
    // The story video plays in its sheet straight from the recording in memory (js/story.js).
    "media-src 'self' blob:",
    `connect-src 'self'${ga}${cfReport}`,
    `frame-src ${pay || "'none'"}`,
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
