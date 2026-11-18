// Midtrans, the payment provider: Snap, its hosted payment page, and the status API.
//
// It needs one secret, MIDTRANS_SERVER_KEY, from the Midtrans dashboard (Settings, Access
// keys). A Sandbox key (SB-Mid-server-…) talks to the Sandbox, where nothing is charged;
// any other key to production. MIDTRANS_ENV ('sandbox' or 'production') overrides that
// guess. The key only ever travels to Midtrans, in the Authorization header, and is never
// logged or sent to the browser.
//
// MIDTRANS_CLIENT_KEY (Mid-client-…, from the same page, not a secret) lets the payment
// form open inside the site's own page (Snap embed). Without it the fan goes to Midtrans'
// payment page and comes back.
const HOSTS = {
  sandbox: { snap: 'https://app.sandbox.midtrans.com', api: 'https://api.sandbox.midtrans.com' },
  production: { snap: 'https://app.midtrans.com', api: 'https://api.midtrans.com' },
};

// The key and the environment it belongs to, or null when payments are not switched on.
export function paymentsOf(env) {
  const key = String(env?.MIDTRANS_SERVER_KEY ?? '').trim();
  if (!/^[A-Za-z0-9_:-]{10,200}$/.test(key)) return null;
  const mode = String(env?.MIDTRANS_ENV ?? '').trim().toLowerCase();
  const sandbox = mode ? mode !== 'production' : key.startsWith('SB-');
  // A client key from the other environment would open a form that cannot pay: left out.
  const client = String(env?.MIDTRANS_CLIENT_KEY ?? '').trim();
  const classic = /^(SB-)?Mid-client-/.exec(client);
  const clientKey = /^[A-Za-z0-9_:-]{10,200}$/.test(client) && (!classic || !!classic[1] === sandbox) ? client : '';
  return { key, sandbox, clientKey };
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
      throw new MidtransError(`${new URL(url).pathname.startsWith('/snap') ? 'Snap' : 'Status'} unreachable: ${err?.name || 'Error'}`);
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
// SHA-512(order_id + status_code + gross_amount + server key), as hex.
export async function signedByMidtrans(n, key) {
  const parts = [n?.order_id, n?.status_code, n?.gross_amount];
  if (!parts.every(p => typeof p === 'string' && p.length > 0 && p.length <= 64)) return false;
  const sig = String(n.signature_key ?? '').toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(sig)) return false;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(parts.join('') + key)));
  const want = [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
  let diff = 0;
  for (let i = 0; i < 128; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
