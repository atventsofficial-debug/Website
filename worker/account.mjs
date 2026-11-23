// Signing in to My 3D passes (#passes): a fan proves an email is theirs, with Google or with a
// 6-digit code sent to it, and sees every paid pass bought with that email, on any device.
// Only an email with a paid order in the order book can sign in: any other is refused, so the
// page is for buyers only.
//
// Signed in, the Worker hands back a fan key: the email and an end date, HMAC-signed with a
// key derived from the Midtrans server key, like the pass key (passkey.mjs) and the team key
// (team.mjs). A device that signs in has proved it holds the buyer's email, as the device
// code does (devices.mjs), so each of the email's passes opens on it, signing out the device
// used least recently when a pass is on two already.
import { db } from './orders.mjs';
import { admit, takeOver } from './devices.mjs';

export const FAN_DAYS = 30;
export const SIGN_MINUTES = 15, SIGN_TRIES = 5, SIGN_GAP = 60e3;
export const EMAIL = /^[^\s@,]{1,64}@[^\s@,]{1,190}\.[^\s@,]{2,24}$/;

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

// Addresses are compared in lower case: the order keeps the email as the buyer typed it.
export const emailOf = v => (typeof v === 'string' && EMAIL.test(v.trim()) ? v.trim().toLowerCase() : '');

// One code out per email at a time. Only the code's hash is kept.
const CODES = `CREATE TABLE IF NOT EXISTS sign_codes (
  email TEXT PRIMARY KEY,
  device TEXT NOT NULL,
  code TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
)`;
const made = new WeakMap();
async function book(env) {
  const d = await db(env);
  if (!d) return null;
  if (!made.has(d)) made.set(d, d.prepare(CODES).run().catch(err => { made.delete(d); throw err; }));
  await made.get(d);
  return d;
}

// The email's paid orders, oldest first.
export async function paidOrders(env, email) {
  const d = await book(env);
  if (!d || !email) return [];
  const { results = [] } = await d.prepare(`SELECT id, event_id, cat, seat, created_at, plan, amount, name, email FROM orders
    WHERE lower(email) = ? AND status = 'confirmed' ORDER BY created_at`).bind(email).all();
  return results;
}

// A new code for this email and device: { code }, or { wait: seconds } while the last one is
// less than a minute old.
export async function newSignCode(env, email, device, now = Date.now()) {
  const d = await book(env);
  const last = await d.prepare('SELECT sent_at FROM sign_codes WHERE email = ?').bind(email).first();
  if (last && now - last.sent_at < SIGN_GAP) return { wait: Math.ceil((SIGN_GAP - (now - last.sent_at)) / 1000) };
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0');
  await d.prepare('INSERT OR REPLACE INTO sign_codes (email, device, code, sent_at, tries) VALUES (?, ?, ?, ?, 0)')
    .bind(email, device, await hex(`sign:${email}:${code}`), now).run();
  return { code };
}

// The code back, from the device that asked: 'ok', 'wrong' (a try used) or 'expired'.
export async function useSignCode(env, email, device, code, now = Date.now()) {
  const d = await book(env);
  if (!d) return 'expired';
  const row = await d.prepare('SELECT device, code, sent_at, tries FROM sign_codes WHERE email = ?').bind(email).first();
  if (!row || now - row.sent_at > SIGN_MINUTES * 6e4 || row.tries >= SIGN_TRIES) {
    if (row) await d.prepare('DELETE FROM sign_codes WHERE email = ?').bind(email).run();
    return 'expired';
  }
  const ok = row.device === device && /^\d{6}$/.test(String(code)) && (await hex(`sign:${email}:${code}`)) === row.code;
  if (!ok) {
    await d.prepare('UPDATE sign_codes SET tries = tries + 1 WHERE email = ?').bind(email).run();
    return row.tries + 1 >= SIGN_TRIES ? 'expired' : 'wrong';
  }
  await d.prepare('DELETE FROM sign_codes WHERE email = ?').bind(email).run();
  return 'ok';
}

// Each paid pass of the email opens on this device. Already on it, or room for it: as it is;
// else the device used least recently is signed out.
export async function openAll(env, orders, device, now = Date.now()) {
  for (const o of orders) {
    if ((await admit(env, o.id, device, now)) !== 'ok') await takeOver(env, o.id, device, now);
  }
}

// ---------------------------------------------------------------- the fan key

const keys = new Map();
async function signingKey(serverKey) {
  if (!keys.has(serverKey)) {
    keys.set(serverKey, (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(serverKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const derived = await crypto.subtle.sign('HMAC', base, enc.encode('atvents fan key v1'));
      return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    })());
  }
  return keys.get(serverKey);
}

export async function signFan(serverKey, email, now = Date.now()) {
  const until = now + FAN_DAYS * 864e5;
  const body = b64url(enc.encode(JSON.stringify(['fan', email, until])));
  const sig = await crypto.subtle.sign('HMAC', await signingKey(serverKey), enc.encode(body));
  return { key: `${body}.${b64url(sig)}`, email, expiresAt: new Date(until).toISOString() };
}

// The email a fan key was signed for, or null: one we did not sign, or out of time.
export async function readFan(serverKey, key, now = Date.now()) {
  const m = /^([A-Za-z0-9_-]{8,600})\.([A-Za-z0-9_-]{43})$/.exec(String(key ?? ''));
  if (!m) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await signingKey(serverKey), unb64url(m[2]), enc.encode(m[1])))) return null;
    const [kind, email, until] = JSON.parse(new TextDecoder().decode(unb64url(m[1])));
    return kind === 'fan' && until > now && emailOf(email) === email ? { email, expiresAt: new Date(until).toISOString() } : null;
  } catch { return null; }
}
