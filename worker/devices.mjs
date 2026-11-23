// The devices a paid pass opens on. A pass link works like a key, and a key can be passed
// round a WhatsApp group; so a paid pass opens on MAX_DEVICES devices at most. The device
// that paid is the first, the phone that opens the email is usually the second. Any other
// device asks for a code, which goes to the buyer's email: with it, that device gets in and
// the device used least recently is signed out.
//
// A device is a random id the browser keeps (js/passes.js, header x-device). Only its
// SHA-256 is kept here. The tables live in the order book (orders.mjs); without the book
// every pass opens on any device, as before.
import { db } from './orders.mjs';

export const MAX_DEVICES = 2;
export const CODE_MINUTES = 15, CODE_TRIES = 5, CODE_GAP = 60e3;
// Seen again: written at most this often, so a fan with the 3D view open costs no writes.
const SEEN_EVERY = 60 * 6e4;

const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;
const hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

// The device asking, hashed, or null when the request names none.
export async function deviceOf(request) {
  const d = request.headers.get('x-device') || '';
  return DEVICE.test(d) ? (await hex(`atvents device v1:${d}`)).slice(0, 40) : null;
}

// Lets the device in when it is one of the pass's devices, or the pass has room for one
// more: 'ok'. 'full' when the pass is open on MAX_DEVICES others already. One statement
// adds the device only while there is room, so two devices at once never make three.
export async function admit(env, id, device, now = Date.now()) {
  const d = await db(env);
  if (!d) return 'ok';
  const row = await d.prepare('SELECT seen_at FROM pass_devices WHERE order_id = ? AND device = ?').bind(id, device).first();
  if (row) {
    if (now - row.seen_at > SEEN_EVERY) await d.prepare('UPDATE pass_devices SET seen_at = ? WHERE order_id = ? AND device = ?').bind(now, id, device).run();
    return 'ok';
  }
  const r = await d.prepare(`INSERT INTO pass_devices (order_id, device, added_at, seen_at)
    SELECT ?1, ?2, ?3, ?3 WHERE (SELECT COUNT(*) FROM pass_devices WHERE order_id = ?1) < ?4
    ON CONFLICT DO NOTHING`).bind(id, device, now, MAX_DEVICES).run();
  if (r?.meta?.changes) return 'ok';
  // Added by a request of the same device a moment ago?
  return (await d.prepare('SELECT 1 AS x FROM pass_devices WHERE order_id = ? AND device = ?').bind(id, device).first()) ? 'ok' : 'full';
}

// A new 6-digit code for this device, replacing any earlier one: { code } or { wait: seconds }
// while the last code is less than a minute old.
export async function newCode(env, id, device, now = Date.now()) {
  const d = await db(env);
  if (!d) return null;
  const last = await d.prepare('SELECT sent_at FROM pass_codes WHERE order_id = ?').bind(id).first();
  if (last && now - last.sent_at < CODE_GAP) return { wait: Math.ceil((CODE_GAP - (now - last.sent_at)) / 1000) };
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1e6;
  const code = String(n).padStart(6, '0');
  await d.prepare('INSERT OR REPLACE INTO pass_codes (order_id, device, code, sent_at, tries) VALUES (?, ?, ?, ?, 0)')
    .bind(id, device, await hex(`${id}:${code}`), now).run();
  return { code };
}

// The code back from the device that asked for it: 'ok' lets that device in, signing out
// the least recently used one when the pass is full. 'wrong' (a try used), 'expired' (no
// code, an old one, or too many tries: ask for a new one).
export async function useCode(env, id, device, code, now = Date.now()) {
  const d = await db(env);
  if (!d) return 'expired';
  const row = await d.prepare('SELECT device, code, sent_at, tries FROM pass_codes WHERE order_id = ?').bind(id).first();
  if (!row || now - row.sent_at > CODE_MINUTES * 6e4 || row.tries >= CODE_TRIES) {
    if (row) await d.prepare('DELETE FROM pass_codes WHERE order_id = ?').bind(id).run();
    return 'expired';
  }
  const ok = row.device === device && /^\d{6}$/.test(String(code)) && (await hex(`${id}:${code}`)) === row.code;
  if (!ok) {
    await d.prepare('UPDATE pass_codes SET tries = tries + 1 WHERE order_id = ?').bind(id).run();
    return row.tries + 1 >= CODE_TRIES ? 'expired' : 'wrong';
  }
  await d.prepare('DELETE FROM pass_codes WHERE order_id = ?').bind(id).run();
  await takeOver(env, id, device, now);
  return 'ok';
}

// Lets this device in, signing out the least recently used one when the pass is full: for a
// device that proved it holds the buyer's email (the code above, or signing in, account.mjs).
export async function takeOver(env, id, device, now = Date.now()) {
  const d = await db(env);
  if (!d) return;
  // Keep the newest MAX_DEVICES - 1 others, then this one.
  await d.prepare(`DELETE FROM pass_devices WHERE order_id = ?1 AND device <> ?2 AND device NOT IN (
    SELECT device FROM pass_devices WHERE order_id = ?1 AND device <> ?2 ORDER BY seen_at DESC LIMIT ?3)`)
    .bind(id, device, MAX_DEVICES - 1).run();
  await d.prepare(`INSERT INTO pass_devices (order_id, device, added_at, seen_at) VALUES (?1, ?2, ?3, ?3)
    ON CONFLICT (order_id, device) DO UPDATE SET seen_at = ?3`).bind(id, device, now).run();
}

// The buyer's email as the code sheet shows it: r***@example.com.
export const maskEmail = e => {
  const [user, host] = String(e || '').split('@');
  return host ? `${user.slice(0, 1)}***@${host}` : '';
};
