// The email a fan gets once their pass is paid: the concert, the seat, and a button that opens
// the pass (#pass-<id>-<key>) on any phone or laptop. Sent through Resend (resend.com).
//
// It needs one secret, RESEND_API_KEY (re_…), and atvents.com verified as a sending domain
// in Resend. EMAIL_FROM ("Atvents <pass@atvents.com>") and EMAIL_REPLY_TO
// (halo@atvents.com) may change the sender. Without the key nothing is sent, and the pass
// still opens on the device that paid.
//
// The layout is plain tables and inline styles, the only thing every mail app draws the
// same, and it carries no pictures: many apps hide them, and the wordmark is type.
import { formatFee } from '../js/order.js';

const FROM = 'Atvents <pass@atvents.com>', REPLY_TO = 'halo@atvents.com';
const ADDRESS = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;
const SENDER = /^(?:[^<>"\r\n]{1,60} )?<?([^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24})>?$/i;

export class MailError extends Error {}

// The sender, or null when email is not switched on.
export function mailerOf(env) {
  const key = String(env?.RESEND_API_KEY ?? '').trim();
  if (!/^re_[A-Za-z0-9_-]{8,200}$/.test(key)) return null;
  const from = String(env?.EMAIL_FROM ?? '').trim(), reply = String(env?.EMAIL_REPLY_TO ?? '').trim();
  return {
    from: SENDER.test(from) ? from : FROM,
    replyTo: ADDRESS.test(reply) ? reply : REPLY_TO,
    async send({ to, subject, html, text }) {
      let r;
      try {
        r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: this.from, to: [to], reply_to: this.replyTo, subject, html, text }),
          signal: AbortSignal.timeout(10000),
        });
      } catch (err) {
        throw new MailError(`Resend unreachable: ${err?.name || 'Error'}`);
      }
      if (!r.ok) throw new MailError(`Resend ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
      return (await r.json().catch(() => ({}))).id || '';
    },
  };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The pass email for a paid order: { subject, html, text }.
//   order: the orders row (worker/orders.mjs); concert: its catalog entry; link: the pass link.
export function passEmail({ order, concert, link }) {
  const title = concert?.title || order.title;
  const firstName = order.name.split(' ')[0];
  const rows = [
    ['Concert', title],
    concert?.when && ['Date', concert.when],
    concert?.venue && ['Venue', concert.venue],
    ['Seat', order.seat_label],
    ['Pass', order.id],
    ['Paid', formatFee(order.amount)],
  ].filter(Boolean);
  const subject = `Your 3D seat view is open: ${title}`.slice(0, 120);
  const ink = '#141212', muted = '#6e6664', line = '#e7e1de', coral = '#ec5446', font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3efed;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Paid. The view from your seat at ${esc(title)} is open.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efed;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="padding:0 4px 20px;font:800 20px/1 ${font};letter-spacing:0.08em;color:${ink};">ATVENTS<span style="color:${coral};">.</span></td></tr>
  <tr><td style="background:#ffffff;border-radius:18px;padding:36px 32px;">
    <p style="margin:0 0 14px;font:700 11px/1.2 ${font};letter-spacing:0.16em;text-transform:uppercase;color:${coral};">3D seat view &middot; paid</p>
    <h1 style="margin:0 0 14px;font:600 34px/1.1 ${font};letter-spacing:-0.02em;color:${ink};">You&rsquo;re in, ${esc(firstName)}</h1>
    <p style="margin:0 0 26px;font:400 16px/1.55 ${font};color:${ink};">Your payment went through. The view from your seat at ${esc(title)} is open: the whole venue, then your category, then your seat.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${line};border-radius:14px;">
      ${rows.map(([k, v], i) => `<tr><td style="padding:12px 16px;${i ? `border-top:1px solid ${line};` : ''}font:400 13px/1.4 ${font};color:${muted};width:84px;vertical-align:top;">${k}</td><td style="padding:12px 16px;${i ? `border-top:1px solid ${line};` : ''}font:600 15px/1.4 ${font};color:${ink};">${esc(v)}</td></tr>`).join('\n      ')}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 22px;"><tr><td style="background:${coral};border-radius:999px;">
      <a href="${esc(link)}" style="display:inline-block;padding:15px 28px;font:700 15px/1 ${font};color:#ffffff;text-decoration:none;">Open my 3D seat view &rarr;</a>
    </td></tr></table>
    <p style="margin:0 0 10px;font:400 13px/1.55 ${font};color:${muted};">The button opens your pass on any phone or laptop until the day after the show. Keep this email to yourself: the link opens your pass.</p>
    <p style="margin:0;font:400 13px/1.55 ${font};color:${muted};">The 3D view is not a concert ticket. Your ticket comes from the concert&rsquo;s official seller.</p>
  </td></tr>
  <tr><td style="padding:20px 4px 0;font:400 12px/1.55 ${font};color:${muted};">Questions? Reply to this email. Atvents &middot; <a href="${esc(order.origin)}" style="color:${muted};">${esc(order.origin.replace(/^https?:\/\//, ''))}</a></td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    `You're in, ${firstName}`,
    '',
    `Your payment went through. The view from your seat at ${title} is open.`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Open my 3D seat view:',
    link,
    '',
    'The link opens your pass on any phone or laptop until the day after the show. Keep this email to yourself: the link opens your pass.',
    'The 3D view is not a concert ticket. Your ticket comes from the concert’s official seller.',
    '',
    'Questions? Reply to this email.',
    'Atvents',
  ].join('\n');

  return { subject, html, text };
}
