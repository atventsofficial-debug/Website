// The key that opens a paid pass, signed so the Worker needs no database of its own.
//
// A key carries the order id, the concert, the category, the seat, when the order was made,
// the plan ('seat' or 'plus', js/order.js) and the amount the order is paid at, with an
// HMAC-SHA256 over them. The HMAC key is derived from the Midtrans server key, so a new server key (Sandbox to production, say) retires every earlier pass key;
// passes already open on a device stay as they are. Midtrans holds the rest: the buyer's
// name and email, and whether the order was paid.
import { ACCESS_FEE, planOf } from '../js/order.js';

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const keys = new Map();
async function signingKey(serverKey) {
  if (!keys.has(serverKey)) {
    keys.set(serverKey, (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(serverKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const derived = await crypto.subtle.sign('HMAC', base, enc.encode('atvents pass key v1'));
      return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    })());
  }
  return keys.get(serverKey);
}

export async function signPass(serverKey, { id, eventId, cat, seat, createdAt, plan = 'seat', amount = ACCESS_FEE }) {
  const body = b64url(enc.encode(JSON.stringify([id, eventId, cat, seat, createdAt, planOf(plan), amount])));
  const sig = await crypto.subtle.sign('HMAC', await signingKey(serverKey), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

// The pass a key opens, or null when it is not one of ours. crypto.subtle.verify compares
// in constant time.
export async function readPass(serverKey, token) {
  const m = /^([A-Za-z0-9_-]{8,400})\.([A-Za-z0-9_-]{43})$/.exec(String(token ?? ''));
  if (!m) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await signingKey(serverKey), unb64url(m[2]), enc.encode(m[1])))) return null;
    // Keys made before there were plans have five fields: a seat pass at the access fee.
    const [id, eventId, cat, seat, createdAt, plan, amount] = JSON.parse(new TextDecoder().decode(unb64url(m[1])));
    return { id, eventId, cat, seat, createdAt, plan: planOf(plan), amount: Number.isInteger(amount) ? amount : ACCESS_FEE };
  } catch { return null; }
}
