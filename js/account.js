// Signing in to My 3D passes (worker/account.mjs). With live payments the page shows nothing
// until the fan signs in, with Google or a 6-digit code sent to the email they paid with. An
// email with no paid pass is refused by the Worker. Signed in, every paid pass of that email
// comes to this device, wherever it was bought, and opens here.
//
// The fan key is kept here with the passes it brought. Signing out, by hand or after
// IDLE_MINUTES with no tap, click, key or scroll on the site (in any of its tabs), forgets
// the key and takes those passes off this device again; passes bought on this device stay.
import { signIn } from './sso.js';
import { state, emit } from './ui.js';
import { passes, importPass } from './passes.js';

const KEY = 'atvents:me', SEEN = 'atvents:me-seen';
export const IDLE_MINUTES = 30;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const write = v => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* ignore */ } };
const seenAt = () => { try { return Number(localStorage.getItem(SEEN)) || 0; } catch { return 0; } };

// Sign-in is needed only with live payments and the Worker's order book.
export const accountOn = () => !!(state.store?.live && state.store.account);

// { key, email, expiresAt, ids } while in time and not idle too long, else null.
export function me() {
  const m = read();
  if (!m || typeof m.key !== 'string' || !(Date.parse(m.expiresAt) > Date.now())) return null;
  if (Date.now() - seenAt() > IDLE_MINUTES * 6e4) return null;
  return m;
}

// Signing out: the key goes, and so do the passes it brought that were not here before.
export function signOut({ idle = false } = {}) {
  const m = read();
  write(null);
  for (const id of m?.brought || []) passes.remove(id);
  meNews.idle = idle;
  emit('me');
}
// Why the last sign-out happened, for the page to say so once, and whether the passes of a
// sign-in are still being checked (the page shows them as on their way).
// While the sign-in itself is with the Worker, `signing` is on; then `total` passes are on
// their way and `done` of them have come, for the page's progress (js/pages.js).
export const meNews = { idle: false, loading: 0, signing: false, total: 0, done: 0 };

// The passes of the email come to this device. The ones not here yet are noted, so signing
// out takes them away again. The sign-in is kept first, so the page turns to the passes at
// once; the passes are then checked with the Worker all together, each showing as it comes.
async function take(r) {
  const before = new Set(passes.all().map(p => p.id));
  const old = read();
  const brought = new Set(old?.email === r.email ? old.brought || [] : []);
  const list = r.passes || [];
  for (const p of list) if (!before.has(p.id)) brought.add(p.id);
  touch(true);
  write({ key: r.key ?? old?.key, email: r.email, expiresAt: r.expiresAt, ids: list.map(p => p.id), brought: [...brought] });
  meNews.loading = (meNews.loading || 0) + 1;
  meNews.signing = false;
  meNews.total = list.length; meNews.done = 0;
  emit('me');
  try {
    await Promise.all(list.map(p => importPass(p.id, p.token).catch(() => { /* offline: next visit */ }).finally(() => { meNews.done += 1; })));
  } finally { meNews.loading -= 1; }
  // Signed out while they came: the ones brought go again.
  if (read()?.email !== r.email) for (const id of brought) if (!before.has(id)) passes.remove(id);
  emit('passes');
  return me();
}

export const sendSignCode = email => state.store.meCode(email);
// The Worker checking the sign-in: the page shows its progress until the passes are in.
async function session(body) {
  meNews.signing = true;
  emit('me');
  try { return take(await state.store.meSession(body)); } catch (e) {
    meNews.signing = false;
    emit('me');
    throw e;
  }
}
export const signInWithCode = (email, code) => session({ email, code });
// Google's window, then the Worker. Must be called from the click itself.
export async function signInWithGoogle() {
  const who = await signIn('google', state.store.sso.google);
  return session({ idToken: who.token });
}

// Signed in: the list again, for a pass paid since. A key the Worker no longer takes signs out.
export async function refreshMe() {
  const m = me();
  if (!m) return null;
  try { return await take({ ...(await state.store.mePasses(m.key)), key: m.key }); } catch (e) {
    if (e.status === 401) signOut();
    return me();
  }
}

// Whether a wallet pass belongs to the one signed in: brought by signing in, or bought here
// with that email.
export const isMine = (m, p) => !!m && ((m.ids || []).includes(p.id) || (p.email || '').toLowerCase() === m.email);

// Anything the fan does keeps them signed in; written at most every 15 seconds.
function touch(force = false) {
  const now = Date.now();
  if (!force && now - (touch.at || 0) < 15e3) return;
  touch.at = now;
  try { localStorage.setItem(SEEN, String(now)); } catch { /* ignore */ }
}

// Watches for the fan, and signs out after IDLE_MINUTES without them. Another tab of the site
// that is in use counts too (the time is shared in localStorage).
export function watchIdle() {
  if (watchIdle.on) return;
  watchIdle.on = true;
  // Back after a long time away: signed out before anything shows.
  if (read() && !me()) signOut({ idle: true });
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    window.addEventListener(ev, () => { if (read()) touch(); }, { passive: true, capture: true });
  }
  const check = () => { if (read() && !me()) signOut({ idle: true }); };
  setInterval(check, 30e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('storage', ev => { if (ev.key === KEY) emit('me'); });
}
