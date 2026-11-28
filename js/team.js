// The team on this device (worker/team.mjs): the owner and the people on ADMIN_EMAILS, who
// open every 3D pass without paying, to watch the live site and check changes. A member
// signs in with Google on #admin; the Worker checks Google's token and hands back a team
// key, kept here for 30 days. The key is only a way to ask: the Worker checks it, and the
// list, on every use, so writing one into this browser by hand opens nothing.
import { signIn } from './sso.js';

const KEY = 'atvents:team';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };

// { key, email, expiresAt } while it is in time, else null.
export function teamKey() {
  const t = read();
  return t && typeof t.key === 'string' && typeof t.email === 'string' && Date.parse(t.expiresAt) > Date.now() ? t : null;
}
export function forgetTeam() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

const post = async (path, body, headers = {}) => {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d?.error || `HTTP ${r.status}`), { status: r.status });
  return d;
};

// Google's window, then the Worker. Must be called from the click itself.
export async function teamSignIn(clientId) {
  const who = await signIn('google', clientId);
  const t = await post('api/team/session', { idToken: who.token });
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* this page view only */ }
  return t;
}

// A Google ID token from the unlock form's own sign-in: a team key if that address is on
// the team, else null. The Worker checks the token and the list, as for #admin.
export async function teamFromToken(idToken) {
  if (!idToken) return null;
  try {
    const t = await post('api/team/session', { idToken });
    try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* this page view only */ }
    return t;
  } catch { return null; }
}

// Still on the team? A key the Worker no longer takes (taken off the list) is forgotten.
export async function teamCheck() {
  const t = teamKey();
  if (!t) return null;
  try { return await post('api/team/me', null, { 'x-team-key': t.key }); } catch (e) {
    if (e.status === 401) forgetTeam();
    return e.status === 401 ? null : t;
  }
}
