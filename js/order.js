// A 3D pass order: its price, its id, and the buyer's details. Pure and with no imports, so
// the payment Worker (worker/) checks a buyer exactly the way the page does (rules.js),
// without loading the venues.

// The price of one 3D seat view, for one concert, the id of an order, and how long it waits.
export const ACCESS_FEE = 25000;
export const formatFee = (n = ACCESS_FEE) => `Rp${n.toLocaleString('id-ID')}`;

// The two passes. 'seat' is the view from one seat (ACCESS_FEE). 'plus' opens every seat of
// the concert, with the show mode and the way to the venue, at PLUS_FEE; a fan who has a paid
// seat pass for the concert upgrades it for the difference (UPGRADE_FEE). A pass key made
// before there were plans carries no plan: it is a 'seat' pass.
export const PLUS_FEE = 50000;
export const UPGRADE_FEE = PLUS_FEE - ACCESS_FEE;
export const PLANS = ['seat', 'plus'];
export const planOf = v => (v === 'plus' ? 'plus' : 'seat');
// What an order costs: a seat pass, a Plus pass, or a Plus pass bought as an upgrade.
export const feeOf = (plan, upgrade = false) => (planOf(plan) === 'plus' ? (upgrade ? UPGRADE_FEE : PLUS_FEE) : ACCESS_FEE);
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
