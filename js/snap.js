// Midtrans' payment form (Snap) inside our own page: snap.js from Midtrans, then
// snap.embed(token) into a box on the checkout. The fan picks QRIS, an e-wallet, a bank
// transfer or a card there, and Midtrans handles the payment itself: card, wallet and bank
// details never reach this site.
//
// The script comes only from Midtrans' host for the environment the Worker names; the
// site's CSP (server/http.mjs, static build) allows exactly these two hosts.
const HOST = { sandbox: 'https://app.sandbox.midtrans.com', production: 'https://app.midtrans.com' };

let loading = null;
export function loadSnap({ sandbox, clientKey }) {
  if (!clientKey) return Promise.reject(new Error('Payments run without a client key'));
  if (window.snap?.embed) return Promise.resolve(window.snap);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${HOST[sandbox ? 'sandbox' : 'production']}/snap/snap.js`;
    s.async = true;
    s.setAttribute('data-client-key', clientKey);
    let settled = false;
    const done = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok && window.snap?.embed) return resolve(window.snap);
      s.remove();
      loading = null;
      reject(new Error('The payment form did not load'));
    };
    const timer = setTimeout(() => done(false), 15000);
    s.onload = () => done(true);
    s.onerror = () => done(false);
    document.head.append(s);
  });
  return loading;
}

// Snap allows one form at a time: the one on screen is hidden before another opens. Snap
// calls onClose when we hide it ourselves, which is not the fan closing anything.
let open = null;
export function embedSnap(snap, token, embedId, { onSuccess, onPending, onError, onClose } = {}) {
  hideSnap();
  const mine = {};
  open = mine;
  const live = fn => (...a) => { if (open === mine) fn?.(...a); };
  snap.embed(token, {
    embedId,
    language: /^id\b/i.test(navigator.language || '') ? 'id' : 'en',
    onSuccess: live(onSuccess), onPending: live(onPending), onError: live(onError), onClose: live(onClose),
  });
}

export function hideSnap() {
  if (!open) return;
  open = null;
  try { window.snap?.hide(); } catch { /* already gone */ }
}
