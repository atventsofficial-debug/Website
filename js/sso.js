// "Continue with Google" and "Continue with Microsoft" on the pass form: the fan's name and an
// email that works, without typing them. Nothing loads from Google or Microsoft until the fan
// picks one. Then a small window opens at their sign-in page (OpenID Connect, an ID token
// straight back to /auth, auth.html), and /auth hands the token to this page and closes
// (js/auth.js). Only the name and the email are read from it; nothing is kept but what the
// form already sends. The page checks the token's issuer, that it was made for Atvents, the
// one-time number and the time. Its signature is not checked here: the email is still only
// where the pass goes, as if the fan had typed it.
//
// The apps are registered with Google (Google Cloud, an OAuth client of the web type) and
// Microsoft (Microsoft Entra, an app registration for any Microsoft account, with ID tokens
// on), both with https://atvents.com/auth as the address to come back to. Their client ids
// come from /api/config (GOOGLE_CLIENT_ID, MICROSOFT_CLIENT_ID): without one, its button
// does not show.

export const CHANNEL = 'atvents-sign-in';

// Microsoft's issuer names the account's directory: personal accounts have their own.
const MS_ISSUER = /^https:\/\/login\.microsoftonline\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/v2\.0$/;

export const PROVIDERS = {
  google: {
    name: 'Google',
    url: 'https://accounts.google.com/o/oauth2/v2/auth',
    params: { prompt: 'select_account' },
    issuer: c => c.iss === 'https://accounts.google.com' || c.iss === 'accounts.google.com',
    client: id => /^[0-9]{6,30}-[a-z0-9]{10,60}\.apps\.googleusercontent\.com$/.test(id),
  },
  microsoft: {
    name: 'Microsoft',
    url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    params: { prompt: 'select_account', response_mode: 'fragment' },
    issuer: c => typeof c.iss === 'string' && MS_ISSUER.test(c.iss) && (typeof c.tid !== 'string' || c.iss.includes(c.tid)),
    client: id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id),
  },
};

// The client ids from /api/config that look like client ids, by provider.
export function clientsOf(sso) {
  const out = {};
  for (const [k, p] of Object.entries(PROVIDERS)) {
    const id = typeof sso?.[k] === 'string' ? sso[k].trim() : '';
    if (p.client(id)) out[k] = id;
  }
  return out;
}

const fromBase64Url = s => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return new TextDecoder().decode(Uint8Array.from(b, ch => ch.charCodeAt(0)));
};

// Who the ID token says the fan is, { provider, name, email }, or null if it is not one this
// sign-in asked for. Google says whether the email is verified; Microsoft gives its accounts'
// address as `email` (or, for some, only as the sign-in name).
export function claimsOf(token, { provider, clientId, nonce, now = Date.now() }) {
  const p = PROVIDERS[provider], part = typeof token === 'string' ? token.split('.')[1] : '';
  if (!p || !part || part.length > 8000) return null;
  let c;
  try { c = JSON.parse(fromBase64Url(part)); } catch { return null; }
  if (!c || typeof c !== 'object') return null;
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!p.issuer(c) || !aud.includes(clientId) || !nonce || c.nonce !== nonce) return null;
  if (!(Number(c.exp) * 1000 > now - 60e3)) return null;
  if (provider === 'google' && c.email_verified !== true && c.email_verified !== 'true') return null;
  const email = [c.email, c.preferred_username].find(v => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()));
  if (!email) return null;
  const name = typeof c.name === 'string' ? c.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return { provider, name, email: email.trim() };
}

export class SignInError extends Error {
  // 'blocked': the browser stopped the window; 'failed': no usable answer came back.
  constructor(reason) { super(reason); this.reason = reason; }
}

const random = () => {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let pending = null;

// Opens the provider's sign-in window. Resolves with { provider, name, email } once the fan
// has signed in; a window closed without signing in leaves it waiting, and the next try
// replaces it. Must be called from the click itself, or the browser blocks the window.
export function signIn(provider, clientId) {
  const p = PROVIDERS[provider];
  pending?.stop();
  const state = random(), nonce = random();
  const url = new URL(p.url);
  const params = { client_id: clientId, redirect_uri: `${location.origin}/auth`, response_type: 'id_token', scope: 'openid email profile', state, nonce, ...p.params };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const w = 500, h = 640;
  const left = Math.round(window.screenX + Math.max(0, (window.outerWidth - w) / 2));
  const top = Math.round(window.screenY + Math.max(0, (window.outerHeight - h) / 3));
  const win = window.open(url.href, CHANNEL, `popup,width=${w},height=${h},left=${left},top=${top}`);
  if (!win) return Promise.reject(new SignInError('blocked'));
  return new Promise((resolve, reject) => {
    let channel = null;
    const stop = () => { channel?.close(); window.removeEventListener('message', onMessage); clearTimeout(timer); if (pending?.stop === stop) pending = null; };
    const take = d => {
      if (!d || d.type !== CHANNEL || d.state !== state) return;
      stop();
      const who = d.error ? null : claimsOf(d.token, { provider, clientId, nonce });
      // The token itself goes along for the team sign-in (js/team.js), which the Worker checks.
      if (who) resolve({ ...who, token: d.token }); else reject(new SignInError('failed'));
    };
    // The window answers by the channel between this site's pages, and to its opener when it
    // still knows it (the site's opener policy can cut that link).
    const onMessage = ev => { if (ev.origin === location.origin) take(ev.data); };
    try { channel = new BroadcastChannel(CHANNEL); channel.onmessage = ev => take(ev.data); } catch { channel = null; }
    window.addEventListener('message', onMessage);
    const timer = setTimeout(stop, 15 * 6e4);
    pending = { stop };
  });
}
