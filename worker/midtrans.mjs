// Midtrans, the payment provider: Snap, its hosted payment page, and the status API.
//
// It needs one secret, MIDTRANS_SERVER_KEY, from the Midtrans dashboard (Settings, Access
// keys). A Sandbox key (SB-Mid-server-…) talks to the Sandbox, where nothing is charged;
// any other key to production. MIDTRANS_ENV ('sandbox' or 'production') overrides that
// guess. The key only ever travels to Midtrans, in the Authorization header, and is never
// logged or sent to the browser.
const HOSTS = {
  sandbox: { snap: 'https://app.sandbox.midtrans.com', api: 'https://api.sandbox.midtrans.com' },
  production: { snap: 'https://app.midtrans.com', api: 'https://api.midtrans.com' },
};

// The key and the environment it belongs to, or null when payments are not switched on.
export function paymentsOf(env) {
  const key = String(env?.MIDTRANS_SERVER_KEY ?? '').trim();
  if (!/^[A-Za-z0-9_:-]{10,200}$/.test(key)) return null;
  const mode = String(env?.MIDTRANS_ENV ?? '').trim().toLowerCase();
  return { key, sandbox: mode ? mode !== 'production' : key.startsWith('SB-') };
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
  async function call(url, init = {}) {
    let r;
    try {
      r = await fetch(url, {
        ...init,
        headers: { accept: 'application/json', 'content-type': 'application/json', authorization: auth },
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
    // A Snap transaction: Midtrans keeps the order and returns its payment page.
    async createPayment(order) {
      const { status, data } = await call(`${host.snap}/snap/v1/transactions`, { method: 'POST', body: JSON.stringify(order) });
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
