// The team: the owner and the people they name, who open every 3D pass without paying, to
// watch the live site and check changes (README, The team).
//
// Who is on the team is ADMIN_EMAILS, a Cloudflare variable: Google addresses, comma-
// separated. A member signs in with Google on #admin. The page sends the ID token Google
// gave it to POST /api/team/session, and the Worker checks it here, on the server, where it
// cannot be faked: Google's signature (its published keys), that Google made it for this
// site's client id, that it is still in time, and that Google has verified the email. Only
// then, and only for an address on the list, the Worker hands back a team key: the email
// and an end date, HMAC-signed with a key derived from the Midtrans server key, like the
// pass key (passkey.mjs). The key is checked again, list included, on every use: an address
// taken off ADMIN_EMAILS stops working at once, and a new server key ends every team key.
const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const jsonOf = s => JSON.parse(new TextDecoder().decode(unb64url(s)));

export const TEAM_DAYS = 30;
const GOOGLE_KEYS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

// The addresses on ADMIN_EMAILS, lower case. Gmail ignores dots and case in the name, but
// only case is folded here: write each address the way the member's Google account shows it.
export function teamOf(env) {
  return new Set(String(env?.ADMIN_EMAILS || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(s => EMAIL.test(s)));
}
export const onTeam = (env, email) => typeof email === 'string' && teamOf(env).has(email.trim().toLowerCase());

// ---------------------------------------------------------------- Google's ID token

// Google's signing keys, kept as long as Google says (its Cache-Control), at most a day.
let googleKeys = { at: 0, until: 0, keys: new Map() };
async function googleKey(kid, now) {
  const fresh = now < googleKeys.until;
  // A key not seen yet: Google may have just added it. Fetch again, at most once a minute.
  if (!fresh || (!googleKeys.keys.has(kid) && now - googleKeys.at >= 60e3)) {
    const r = await fetch(GOOGLE_KEYS, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`Google keys: HTTP ${r.status}`);
    const { keys = [] } = await r.json();
    const age = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') || '')?.[1]) || 3600;
    const map = new Map();
    for (const k of keys) {
      if (k?.kty !== 'RSA' || typeof k.kid !== 'string') continue;
      map.set(k.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
    }
    googleKeys = { at: now, until: now + Math.min(age, 86400) * 1000, keys: map };
  }
  return googleKeys.keys.get(kid) || null;
}

// The verified email in a Google ID token made for `clientId`, or null. The signature is
// RS256 by one of Google's published keys; nothing in the token counts before it is checked.
export async function googleEmail(token, clientId, now = Date.now()) {
  const m = /^([A-Za-z0-9_-]{10,2000})\.([A-Za-z0-9_-]{10,8000})\.([A-Za-z0-9_-]{100,1000})$/.exec(String(token ?? ''));
  if (!m || !clientId) return null;
  let head, c;
  try { head = jsonOf(m[1]); c = jsonOf(m[2]); } catch { return null; }
  if (head?.alg !== 'RS256' || typeof head.kid !== 'string') return null;
  const key = await googleKey(head.kid, now);
  if (!key) return null;
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64url(m[3]), enc.encode(`${m[1]}.${m[2]}`)).catch(() => false);
  if (!ok || !c || typeof c !== 'object') return null;
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!GOOGLE_ISSUERS.has(c.iss) || !aud.includes(clientId)) return null;
  if (!(Number(c.exp) * 1000 > now) || Number(c.iat) * 1000 > now + 5 * 6e4) return null;
  if (c.email_verified !== true && c.email_verified !== 'true') return null;
  return typeof c.email === 'string' && EMAIL.test(c.email) ? c.email.trim().toLowerCase() : null;
}

// For the tests: start again with no keys kept.
export const forgetGoogleKeys = () => { googleKeys = { at: 0, until: 0, keys: new Map() }; };

// ---------------------------------------------------------------- the team key

const keys = new Map();
async function signingKey(serverKey) {
  if (!keys.has(serverKey)) {
    keys.set(serverKey, (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(serverKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const derived = await crypto.subtle.sign('HMAC', base, enc.encode('atvents team key v1'));
      return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    })());
  }
  return keys.get(serverKey);
}

export async function signTeam(serverKey, email, now = Date.now()) {
  const until = now + TEAM_DAYS * 864e5;
  const body = b64url(enc.encode(JSON.stringify(['team', email, until])));
  const sig = await crypto.subtle.sign('HMAC', await signingKey(serverKey), enc.encode(body));
  return { key: `${body}.${b64url(sig)}`, email, expiresAt: new Date(until).toISOString() };
}

// The member a team key belongs to, or null: a key we did not sign, one out of time, or one
// for an address no longer on ADMIN_EMAILS.
export async function readTeam(env, serverKey, key, now = Date.now()) {
  const m = /^([A-Za-z0-9_-]{8,600})\.([A-Za-z0-9_-]{43})$/.exec(String(key ?? ''));
  if (!m) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await signingKey(serverKey), unb64url(m[2]), enc.encode(m[1])))) return null;
    const [kind, email, until] = jsonOf(m[1]);
    if (kind !== 'team' || !(until > now) || !onTeam(env, email)) return null;
    return { email, expiresAt: new Date(until).toISOString() };
  } catch { return null; }
}
