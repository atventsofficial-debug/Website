// A 3D pass order: its price, its id, and the buyer's details. Pure and with no imports, so
// the payment Worker (worker/) checks a buyer exactly the way the page does (rules.js),
// without loading the venues.

// The price of one 3D seat view, for one concert, the id of an order, and how long it waits.
export const ACCESS_FEE = 25000;
export const formatFee = (n = ACCESS_FEE) => `Rp${n.toLocaleString('id-ID')}`;
export const PAYMENT_ID = /^PAY-[A-Z0-9]{6,24}$/;
// How long the payment form stays open, as on a ticket shop's checkout.
export const PAY_MINUTES = 60;

export const EMAIL = /^[^\s@<>()"',;:]{1,64}@[^\s@<>()"',;:]{1,190}\.[a-z]{2,24}$/i;

// Typed text on one line: control characters and invisible direction marks become spaces,
// so a name cannot reorder what the admin reads.
const LINE_JUNK = /[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g;
export const line = v => String(v ?? '').replace(LINE_JUNK, ' ').trim();
export const email = v => line(v).toLowerCase();
export const isEmail = v => v.length <= 160 && EMAIL.test(v);

// The buyer: a name, an email for the pass and the receipt, and consent to the terms.
export function checkBuyer(d = {}) {
  const name = line(d.name).slice(0, 120), mail = email(d.email);
  if (name.length < 2 || name.length > 80) return { field: 'name', error: 'Please enter your name.' };
  if (!isEmail(mail)) return { field: 'email', error: 'Please enter a valid email. Your pass and receipt go there.' };
  if (d.consent !== true) return { field: 'consent', error: 'Please accept the terms and the privacy policy.' };
  return { buyer: { name, email: mail } };
}
