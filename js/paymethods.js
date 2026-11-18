// The ways to pay for a 3D pass, as the checkout lists them and the payment Worker charges
// them (worker/midtrans.mjs). Pure and with no imports, so both sides read the same list.
//
// Every way but the card is charged through Midtrans' Core API, and the page shows what to
// pay with (the virtual account number, the QR code, the store code) in its own design. The
// card goes through Midtrans' own card form (Snap), so card numbers never touch this site.
//
// The logos are Midtrans' payment logo kit (github.com/veritrans/logo), which Midtrans gives
// its merchants for their checkouts, trimmed and shrunk into assets/pay/.
//
// MIDTRANS_METHODS (comma-separated ids) narrows the list to the channels switched on in the
// Midtrans dashboard; without it, all of them.
export const PAY_GROUPS = [
  { id: 'wallet', name: 'QRIS and e-wallets' },
  { id: 'va', name: 'Bank transfer (virtual account)' },
  { id: 'card', name: 'Card' },
  { id: 'store', name: 'Pay at a store' },
];

// kind: what the fan pays with. va: a virtual account number; bill: Mandiri's company code
// and bill key; qr: a QR code; app: the wallet app (a QR code on a laptop); store: a code
// for the cashier; card: Midtrans' card form.
export const PAY_METHODS = [
  { id: 'qris', group: 'wallet', kind: 'qr', name: 'QRIS', note: 'Any e-wallet or m-banking app', logos: ['qris'] },
  { id: 'gopay', group: 'wallet', kind: 'app', name: 'GoPay', note: 'GoPay or GoPay Later', logos: ['gopay'] },
  { id: 'shopeepay', group: 'wallet', kind: 'app', name: 'ShopeePay', note: 'ShopeePay or SPayLater', logos: ['shopeepay'], phone: true },
  { id: 'bca', group: 'va', kind: 'va', name: 'BCA', bank: 'BCA', logos: ['bca'] },
  { id: 'mandiri', group: 'va', kind: 'bill', name: 'Mandiri', bank: 'Mandiri', logos: ['mandiri'] },
  { id: 'bni', group: 'va', kind: 'va', name: 'BNI', bank: 'BNI', logos: ['bni'] },
  { id: 'bri', group: 'va', kind: 'va', name: 'BRI', bank: 'BRI', logos: ['bri'] },
  { id: 'permata', group: 'va', kind: 'va', name: 'Permata', bank: 'Permata', logos: ['permata'] },
  { id: 'cimb', group: 'va', kind: 'va', name: 'CIMB Niaga', bank: 'CIMB Niaga', logos: ['cimb'] },
  { id: 'card', group: 'card', kind: 'card', name: 'Credit or debit card', note: 'Visa, Mastercard, JCB, American Express', logos: ['visa', 'mastercard', 'jcb', 'amex'] },
  { id: 'alfamart', group: 'store', kind: 'store', name: 'Alfamart', note: 'Also Alfamidi and Dan+Dan', logos: ['alfamart'] },
  { id: 'indomaret', group: 'store', kind: 'store', name: 'Indomaret', logos: ['indomaret'] },
];

export const payMethod = id => PAY_METHODS.find(m => m.id === id) || null;
// A way to pay as a sentence names it: "BCA virtual account", "Mandiri bill payment", "QRIS".
export const wayName = way => (way.kind === 'va' ? `${way.bank} virtual account` : way.kind === 'bill' ? 'Mandiri bill payment' : way.name);

// The ids switched on, from MIDTRANS_METHODS. Unknown ids are left out; a list with none
// the checkout knows means all of them, so a typo cannot close the checkout.
export function methodsOn(list) {
  const want = String(list ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const on = PAY_METHODS.filter(m => want.includes(m.id)).map(m => m.id);
  return on.length ? on : PAY_METHODS.map(m => m.id);
}

// What the fan pays with, checked before it is shown or kept: numbers are digits, the QR
// code an image on Midtrans' API host, the app link GoPay's own scheme or ShopeePay's
// address. Null when the way to pay lacks what it needs. The Worker checks Midtrans' answer
// with it, and the page what it keeps on the device.
const QR_IMAGE = /^https:\/\/api\.(?:sandbox\.)?midtrans\.com\/v[24]\/(?:qris|gopay)\/(?:gopay\/)?[A-Za-z0-9-]{8,80}\/qr-code$/;
const digits = (v, min = 6, max = 30) => (typeof v === 'string' && /^\d+$/.test(v) && v.length >= min && v.length <= max ? v : '');
const qrOf = v => (typeof v === 'string' && QR_IMAGE.test(v) ? v : '');
function appOf(method, v) {
  if (typeof v !== 'string' || v.length > 1000 || /["'<>\\\s]/.test(v)) return '';
  if (method === 'gopay') return /^gojek:\/\/./.test(v) ? v : '';
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && /(^|\.)(airpay\.co\.id|shopee\.co\.id)$/.test(u.hostname) ? v : '';
  } catch { return ''; }
}
export function payDetails(method, d) {
  const m = payMethod(method);
  if (!m || !d || typeof d !== 'object') return null;
  switch (m.kind) {
    case 'va': { const va = digits(d.va); return va ? { va } : null; }
    case 'bill': {
      const billerCode = digits(d.billerCode, 3, 10), billKey = digits(d.billKey);
      return billerCode && billKey ? { billerCode, billKey } : null;
    }
    case 'qr': { const qr = qrOf(d.qr); return qr ? { qr } : null; }
    case 'app': {
      const qr = m.id === 'gopay' ? qrOf(d.qr) : '', app = appOf(m.id, d.app);
      return qr || app ? { qr, app } : null;
    }
    case 'store': {
      const code = typeof d.code === 'string' && /^[A-Za-z0-9]{4,40}$/.test(d.code) ? d.code : '';
      return code ? { code } : null;
    }
    default: return null;
  }
}
