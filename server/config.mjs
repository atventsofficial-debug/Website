// Settings from the environment (or .env in the project root). Secrets live only here,
// never in the front-end bundle or the repository.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validAffiliate } from '../js/rules.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function loadConfig(env = process.env) {
  if (env === process.env) loadDotEnv(path.join(ROOT, '.env'));
  const isProd = env.NODE_ENV === 'production';
  const port = +(env.PORT || 8080);
  const cfg = {
    isProd,
    port,
    databaseUrl: env.DATABASE_URL || '',
    publicUrl: (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ''),
    adminToken: env.ADMIN_TOKEN || '',
    // tiket.com's deeplink from the affiliate network, with {url} and {sub} in it. Empty: the
    // buttons go straight to tiket.com (or use the one in js/config.js).
    affiliateLink: (env.AFFILIATE_LINK || '').trim(),
    trustProxy: env.TRUST_PROXY === 'true',
    rateLimits: env.RATE_LIMITS !== 'off',
  };

  const problems = [];
  if (!cfg.databaseUrl) problems.push('DATABASE_URL is required (Postgres keeps the clicks, passes and requests).');
  if (cfg.affiliateLink && !validAffiliate(cfg.affiliateLink)) problems.push('AFFILIATE_LINK must be an https link with {url} and {sub} in it (see .env.example).');
  if (isProd && cfg.adminToken.length < 24) problems.push('ADMIN_TOKEN of at least 24 characters is required in production.');
  if (isProd && !cfg.publicUrl.startsWith('https://')) problems.push('PUBLIC_URL must be https in production.');
  if (isProd && !cfg.rateLimits) problems.push('RATE_LIMITS=off is for tests only, not production.');
  if (problems.length) throw new Error(`Configuration error:\n- ${problems.join('\n- ')}`);
  return cfg;
}
