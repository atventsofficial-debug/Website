// Midtrans, the payment provider: the Core API charge for each way to pay but the card
// (js/paymethods.js), Snap for the card, and the status and cancel APIs.
//
// It needs one secret, MIDTRANS_SERVER_KEY, from the Midtrans dashboard (Settings, Access
// keys). A Sandbox key (SB-Mid-server-…) talks to the Sandbox, where nothing is charged;
// any other key to production. MIDTRANS_ENV ('sandbox' or 'production') overrides that
// guess. The key only ever travels to Midtrans, in the Authorization header, and is never
// logged or sent to the browser.
//
// MIDTRANS_CLIENT_KEY (Mid-client-…, from the same page, not a secret) lets Midtrans' card
// form open inside the site's own page (Snap embed). Without it a card payment goes to
// Midtrans' payment page and comes back.
//
// MIDTRANS_SIGNATURE_KEY (a Secret, also from Access keys) is what Midtrans signs its
// notifications with once a server key has been made on the newer Access keys page; until
// then it is the server key itself, and a notification signed with either one counts.
import { payDetails } from '../js/paymethods.js';

const HOSTS = {
  sandbox: { snap: 'https://app.sandbox.midtrans.com', api: 'https://api.sandbox.midtrans.com' },
  production: { snap: 'https://app.midtrans.com', api: 'https://api.midtrans.com' },
};

// What a Midtrans key may be made of. Keys from the newer Access keys page carry a '~'
// between their two halves; the older ones are letters, digits, '-' and '_'.
const KEY_CHARS = /^[A-Za-z0-9_:~.+/=-]{10,300}$/;

// The key and the environment it belongs to, or null when payments are not switched on.
export function paymentsOf(env) {
  const key = String(env?.MIDTRANS_SERVER_KEY ?? '').trim();
  if (!KEY_CHARS.test(key)) return null;
  const mode = String(env?.MIDTRANS_ENV ?? '').trim().toLowerCase();
  const sandbox = mode ? mode !== 'production' : key.startsWith('SB-');
  // A Sandbox client key with a production server key would open a form that cannot pay:
  // left out. Newer Sandbox accounts have client keys without the 'SB-', so a key without
  // it says nothing about its environment.
  const client = String(env?.MIDTRANS_CLIENT_KEY ?? '').trim();
  const clientKey = KEY_CHARS.test(client) && (sandbox || !client.startsWith('SB-')) ? client : '';
  const signature = String(env?.MIDTRANS_SIGNATURE_KEY ?? '').trim();
  const signKeys = KEY_CHARS.test(signature) && signature !== key ? [signature, key] : [key];
  return { key, sandbox, clientKey, signKeys };
}

// Snap's expiry.start_time: "2026-11-18 09:30:00 +0700", in Jakarta time.
export function jakartaTime(ms) {
  const d = new Date(ms + 7 * 36e5).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 19)} +0700`;
}

// The payment page's address, checked before the browser is sent there.
export const isPaymentPage = (url, sandbox) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.origin === HOSTS[sandbox ? 'sandbox' : 'production'].snap;
  } catch { return false; }
};

export class MidtransError extends Error {}
// Midtrans answered and said no: most often a channel not switched on for this account.
export class PaymentRefused extends MidtransError {}

// What the Core API charge needs beyond the order, for each way to pay but the card. GoPay
// and ShopeePay send the fan back from their app to /pay/done, like Snap's finish address.
export function chargeOf(method, origin) {
  const back = `${origin}/pay/done`, what = '3D seat view, Atvents';
  switch (method) {
    case 'qris': return { payment_type: 'qris', qris: { acquirer: 'gopay' } };
    case 'gopay': return { payment_type: 'gopay', gopay: { enable_callback: true, callback_url: back } };
    case 'shopeepay': return { payment_type: 'shopeepay', shopeepay: { callback_url: back } };
    case 'bca': case 'bni': case 'bri': case 'cimb': return { payment_type: 'bank_transfer', bank_transfer: { bank: method } };
    case 'permata': return { payment_type: 'permata' };
    // Mandiri's bill lines: at most 10 and 30 characters.
    case 'mandiri': return { payment_type: 'echannel', echannel: { bill_info1: 'Payment:', bill_info2: what } };
    case 'alfamart': return { payment_type: 'cstore', cstore: { store: 'alfamart', alfamart_free_text_1: what } };
    case 'indomaret': return { payment_type: 'cstore', cstore: { store: 'indomaret', message: what } };
    default: return null;
  }
}

// What the fan pays with, out of Midtrans' answer to the charge, checked as the page checks
// it (payDetails in js/paymethods.js). Null when the answer lacks what the way to pay needs.
const actionOf = (data, name) => [].concat(data.actions || []).find(a => a?.name === name)?.url;
export function payDetailsOf(method, data) {
  if (!data || typeof data !== 'object') return null;
  const vas = [].concat(data.va_numbers || []);
  return payDetails(method, {
    va: method === 'permata' ? data.permata_va_number : (vas.find(v => v?.bank === method) || vas[0])?.va_number,
    billerCode: data.biller_code, billKey: data.bill_key,
    qr: actionOf(data, 'generate-qr-code'), app: actionOf(data, 'deeplink-redirect'),
    code: data.payment_code,
  });
}

export function midtrans({ key, sandbox }) {
  const host = HOSTS[sandbox ? 'sandbox' : 'production'];
  const auth = `Basic ${btoa(`${key}:`)}`;
  // Midtrans out of reach (network, a 10 s timeout) is a MidtransError too: the fan is told
  // to try again, and the log says which call failed.
  async function call(url, init = {}, extra = {}) {
    let r;
    try {
      r = await fetch(url, {
        ...init,
        headers: { accept: 'application/json', 'content-type': 'application/json', ...extra, authorization: auth },
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      const p = new URL(url).pathname, what = p.startsWith('/snap') ? 'Snap' : p.endsWith('/charge') ? 'Charge' : p.endsWith('/cancel') ? 'Cancel' : 'Status';
      throw new MidtransError(`${what} unreachable: ${err?.name || 'Error'}`);
    }
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  }
  return {
    sandbox,
    // A Snap transaction: Midtrans keeps the order and returns its payment page. `notify`
    // is where Midtrans tells us how it went, on top of any address set in its dashboard.
    async createPayment(order, { notify } = {}) {
      const { status, data } = await call(`${host.snap}/snap/v1/transactions`, { method: 'POST', body: JSON.stringify(order) }, notify ? { 'x-append-notification': notify } : {});
      if (status !== 201 || !data.token || !isPaymentPage(data.redirect_url, sandbox)) {
        throw new MidtransError(`Snap ${status}: ${[].concat(data.error_messages || []).join('; ').slice(0, 300)}`);
      }
      return { token: data.token, url: data.redirect_url };
    },
    // A Core API charge: Midtrans makes the virtual account, the QR code or the store code
    // at once. A refusal (the channel is off, say) is a PaymentRefused; Midtrans down or out
    // of reach a MidtransError.
    async charge(body, { notify } = {}) {
      const { status, data } = await call(`${host.api}/v2/charge`, { method: 'POST', body: JSON.stringify(body) }, notify ? { 'x-append-notification': notify } : {});
      const code = String(data.status_code ?? status), why = `Charge ${status}/${code}: ${String(data.status_message || '').slice(0, 200)}`;
      if (code === '201' || code === '200') return data;
      throw status >= 500 || code.startsWith('5') ? new MidtransError(why) : new PaymentRefused(why);
    },
    // Closes an order nobody paid, so its account number or code stops taking money. '200'
    // cancelled, '404' no transaction to cancel, '412' too late (paid, or already closed).
    async cancel(orderId) {
      const { status, data } = await call(`${host.api}/v2/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' });
      const code = String(data.status_code ?? status);
      if (status >= 500 || code.startsWith('5')) throw new MidtransError(`Cancel ${status}/${code}`);
      return code;
    },
    // The order as Midtrans has it, or null while it has no transaction yet: the fan has
    // not picked a way to pay on the payment page.
    async status(orderId) {
      const { status, data } = await call(`${host.api}/v2/${encodeURIComponent(orderId)}/status`);
      if (status === 404 || data.status_code === '404') return null;
      if (status !== 200 || !data.transaction_status) throw new MidtransError(`Status ${status}: ${String(data.status_message || '').slice(0, 200)}`);
      return data;
    },
  };
}

// What a Midtrans transaction means for a pass: 'confirmed' once paid, 'rejected' when it
// failed, expired or was refunded, otherwise 'checking'. A paid order must be the one we
// made: same order id, the access fee, in rupiah.
const CLOSED = new Set(['deny', 'cancel', 'expire', 'failure', 'refund', 'partial_refund', 'chargeback', 'partial_chargeback']);
export function passStateOf(t, { id, amount }) {
  if (!t) return 'checking';
  const s = t.transaction_status;
  if (CLOSED.has(s)) return 'rejected';
  const paid = s === 'settlement' || (s === 'capture' && (t.fraud_status ?? 'accept') === 'accept');
  if (!paid) return 'checking';
  const ours = t.order_id === id && Number(t.gross_amount) === amount && (t.currency ?? 'IDR') === 'IDR';
  return ours ? 'confirmed' : 'rejected';
}

// A notification is Midtrans' own when its signature_key is
// SHA-512(order_id + status_code + gross_amount + key), as hex, with one of the keys given
// (the signature key, then the server key).
export async function signedByMidtrans(n, keys) {
  const parts = [n?.order_id, n?.status_code, n?.gross_amount];
  if (!parts.every(p => typeof p === 'string' && p.length > 0 && p.length <= 64)) return false;
  const sig = String(n.signature_key ?? '').toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(sig)) return false;
  let ok = false;
  for (const key of [].concat(keys)) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(parts.join('') + key)));
    const want = [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
    let diff = 0;
    for (let i = 0; i < 128; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
    ok ||= diff === 0;
  }
  return ok;
}
