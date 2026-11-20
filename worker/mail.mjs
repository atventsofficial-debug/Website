// The email a fan gets once their pass is paid: the concert, the seat, and a button that opens
// the pass (#pass-<id>-<key>) on any phone or laptop. Sent through Resend (resend.com).
//
// It needs one secret, RESEND_API_KEY (re_…), and atvents.com verified as a sending domain
// in Resend. EMAIL_FROM ("Atvents <pass@atvents.com>") and EMAIL_REPLY_TO
// (halo@atvents.com) may change the sender. Without the key nothing is sent, and the pass
// still opens on the device that paid.
//
// It looks like the site: near-black, the concert's poster on top, then the pass as a paper
// ticket. The layout is plain tables and inline styles, the only thing every mail app draws
// the same. Its two pictures, the poster and the logo, are JPEG and PNG copies in
// assets/mail/ (scripts/mail-art.py), served from the site's own address: mail apps show
// neither WebP nor SVG everywhere. With pictures off, the poster's alt text and the wordmark
// in the logo's place keep it readable, and everything the fan needs is text.
import { formatFee } from '../js/order.js';
import { payMethod, wayName } from '../js/paymethods.js';

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
//   order: the orders row (worker/orders.mjs); concert: its catalog entry (worker/catalog.mjs:
//   when, venue, cats, poster); link: the pass link.
export function passEmail({ order, concert, link, wa = {} }) {
  const title = concert?.title || order.title;
  const firstName = order.name.split(' ')[0];
  const category = concert?.cats?.[order.cat] || '';
  const way = payMethod(order.method);
  const paidWith = way ? wayName(way) : '';
  const when = [concert?.when, concert?.venue].filter(Boolean).join(' · ');
  const poster = concert?.poster ? { ...concert.poster, url: `${order.origin}/${concert.poster.src}` } : null;
  const subject = `Your 3D seat view is open: ${title}`.slice(0, 120);
  const details = [
    category && ['Category', category],
    ['Seat', order.seat_label],
    ['Name', order.name],
    paidWith && ['Paid with', paidWith],
  ].filter(Boolean);

  // The site's colours (css/styles.css): the page, the panel, the paper ticket, the orange.
  const page = '#0c0c0c', panel = '#151515', edge = '#262626', light = '#f2f2f2', muted = '#9a9a9a',
    orange = '#ff5a1f', paper = '#f4f3f1', ink = '#0e0e0e', inkMuted = '#6b6b6b', inkLine = '#d9d5cf';
  const font = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif", mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
  const label = `font:700 10px/1.2 ${font};letter-spacing:0.12em;text-transform:uppercase;color:${inkMuted};padding-bottom:5px;`;
  const cell = (k, v) => `<td width="50%" valign="top" style="width:50%;padding:0 12px 16px 0;"><div style="${label}">${esc(k)}</div><div style="font:700 15px/1.3 ${font};color:${ink};">${esc(v)}</div></td>`;
  const grid = [];
  for (let i = 0; i < details.length; i += 2) grid.push(`<tr>${cell(...details[i])}${details[i + 1] ? cell(...details[i + 1]) : '<td width="50%" style="width:50%;"></td>'}</tr>`);
  // The WhatsApp links a paid pass gets (FANBASE_WA): the concert's fanbase group, and the
  // Atvents members' community.
  const waLinks = [
    wa.group && ['Join the fanbase group', wa.group],
    wa.community && ['Join the Atvents community', wa.community],
  ].filter(Boolean);
  const step = (n, head, sub) => `<tr><td width="40" valign="top" style="width:40px;padding:0 0 14px;font:700 13px/1.5 ${mono};color:${orange};">${n}</td><td valign="top" style="padding:0 0 14px;"><div style="font:600 15px/1.5 ${font};color:${light};">${head}</div><div style="font:400 14px/1.5 ${font};color:${muted};">${sub}</div></td></tr>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${esc(subject)}</title>
<style>
  body { margin: 0; padding: 0; background: ${page}; -webkit-text-size-adjust: 100%; }
  @media (max-width: 520px) {
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .tk { padding-left: 18px !important; padding-right: 18px !important; }
    .h1 { font-size: 30px !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:${page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Paid. ${esc(order.seat_label)} at ${esc(title)}, ready to see in 3D.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${page};"><tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="padding:0 6px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><a href="${esc(order.origin)}" style="text-decoration:none;"><img src="${esc(order.origin)}/assets/mail/atvents-logo.png" width="126" height="22" alt="atvents" style="display:block;border:0;width:126px;height:22px;font:800 20px/22px ${font};color:${light};"></a></td>
    <td align="right" style="font:700 10px/1.2 ${font};letter-spacing:0.14em;text-transform:uppercase;color:${muted};">3D seat view pass</td>
  </tr></table></td></tr>
  <tr><td style="background:${panel};border:1px solid ${edge};border-radius:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${poster ? `      <tr><td style="padding:0;"><a href="${esc(link)}" style="text-decoration:none;"><img src="${esc(poster.url)}" width="600" height="400" alt="${esc(poster.alt)}" style="display:block;border:0;width:100%;max-width:600px;height:auto;border-radius:23px 23px 0 0;background:#1f1f1f;font:400 14px/1.4 ${font};color:${muted};"></a></td></tr>
` : ''}      <tr><td class="px" style="padding:30px 36px 34px;">
        <p style="margin:0 0 14px;font:700 11px/1.2 ${font};letter-spacing:0.14em;text-transform:uppercase;color:${orange};">&#9679;&nbsp; Paid &middot; 3D seat view</p>
        <h1 class="h1" style="margin:0 0 12px;font:600 36px/1.08 ${font};letter-spacing:-0.025em;color:${light};">You&rsquo;re in, <span style="color:${muted};">${esc(firstName)}</span></h1>
        <p style="margin:0 0 26px;font:400 16px/1.55 ${font};color:#d6d2cf;">Your payment went through and the view from your seat is open. Take the tour: the whole venue, then your category, then your seat.</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper};border-radius:16px;">
          <tr><td class="tk" style="padding:20px 24px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td><span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#d9efdf;font:700 10px/1 ${font};letter-spacing:0.12em;text-transform:uppercase;color:#1c6e37;">Paid &middot; open</span></td>
              <td align="right" style="font:500 11px/1.2 ${mono};color:${inkMuted};">${esc(order.id)}</td>
            </tr></table>
            <h2 style="margin:16px 0 4px;font:700 24px/1.15 ${font};letter-spacing:-0.015em;color:${ink};">${esc(title)}</h2>
            ${when ? `<p style="margin:0;font:400 14px/1.45 ${font};color:${inkMuted};">${esc(when)}</p>` : ''}
          </td></tr>
          <tr><td class="tk" style="padding:0 24px;"><div style="border-top:1.5px solid ${ink};font-size:0;line-height:0;">&nbsp;</div></td></tr>
          <tr><td class="tk" style="padding:16px 24px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${grid.join('\n              ')}
            </table>
          </td></tr>
          <tr><td style="padding:2px 0 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="12" height="24" style="width:12px;height:24px;background:${panel};border-radius:0 12px 12px 0;font-size:0;line-height:0;">&nbsp;</td>
            <td style="padding:0 8px;"><div style="border-top:2px dashed ${inkLine};font-size:0;line-height:0;">&nbsp;</div></td>
            <td width="12" height="24" style="width:12px;height:24px;background:${panel};border-radius:12px 0 0 12px;font-size:0;line-height:0;">&nbsp;</td>
          </tr></table></td></tr>
          <tr><td class="tk" style="padding:6px 24px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td valign="bottom">
                <div style="font:700 10px/1.2 ${font};letter-spacing:0.14em;text-transform:uppercase;color:${orange};">3D pass</div>
                <div style="margin-top:6px;font:800 26px/1.05 ${font};letter-spacing:-0.01em;text-transform:uppercase;color:${orange};">${esc(category || '1 seat')}</div>
                <div style="margin-top:6px;font:400 13px/1.4 ${font};color:${inkMuted};">Open until the day after the show</div>
              </td>
              <td align="right" valign="bottom">
                <div style="${label}">Access</div>
                <div style="font:700 18px/1.2 ${font};color:${ink};">${esc(formatFee(order.amount))}</div>
                <div style="font:400 13px/1.4 ${font};color:${inkMuted};">paid</div>
              </td>
            </tr></table>
          </td></tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 14px;"><tr><td align="center" bgcolor="${orange}" style="background:${orange};border-radius:999px;">
          <a href="${esc(link)}" style="display:block;padding:17px 24px;font:700 16px/1.2 ${font};color:${ink};text-decoration:none;border-radius:999px;">Open my 3D seat view &rarr;</a>
        </td></tr></table>
        <p style="margin:0 0 28px;font:400 13px/1.55 ${font};color:${muted};text-align:center;">Opens on any phone or laptop, until the day after the show. Keep this email to yourself: the link opens your pass.</p>

${waLinks.length ? `        <div style="border-top:1px solid ${edge};font-size:0;line-height:0;">&nbsp;</div>
        <p style="margin:24px 0 8px;font:700 11px/1.2 ${font};letter-spacing:0.14em;text-transform:uppercase;color:${muted};">Meet other fans</p>
        <p style="margin:0 0 16px;font:400 14px/1.55 ${font};color:#d6d2cf;">Fans going to ${esc(title)} chat on WhatsApp before the show: who is sitting where, how to get there, meeting up on the day.</p>
${waLinks.map(([t, href]) => `        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr><td align="center" style="border:1px solid #25d366;border-radius:999px;">
          <a href="${esc(href)}" style="display:block;padding:14px 22px;font:700 15px/1.2 ${font};color:#25d366;text-decoration:none;border-radius:999px;">${esc(t)} &rarr;</a>
        </td></tr></table>`).join('\n')}
        <p style="margin:6px 0 28px;font:400 13px/1.55 ${font};color:${muted};text-align:center;">In the 3D view you can also show your Instagram on your seat, so fans near you can find you.</p>
` : ''}        <div style="border-top:1px solid ${edge};font-size:0;line-height:0;">&nbsp;</div>
        <p style="margin:24px 0 16px;font:700 11px/1.2 ${font};letter-spacing:0.14em;text-transform:uppercase;color:${muted};">Your seat tour</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${step('01', 'The whole venue', 'The stage, the screens and every section, from above.')}
          ${step('02', category ? `Your category, ${esc(category)}` : 'Your category', 'Where it sits, lit up in the venue.')}
          ${step('03', 'The view from your seat', `From ${esc(order.seat_label)}, with a short video to share.`)}
        </table>
        <p style="margin:10px 0 0;font:400 13px/1.55 ${font};color:${muted};">The 3D view is not a concert ticket. Your ticket comes from the concert&rsquo;s official seller.</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:22px 6px 0;font:400 12px/1.6 ${font};color:#7a7572;">
    Questions? Reply to this email and we will help.<br>
    Atvents &middot; <a href="${esc(order.origin)}" style="color:#7a7572;">${esc(order.origin.replace(/^https?:\/\//, ''))}</a><br>
    ${poster ? `${esc(poster.credit)}<br>` : ''}You got this email because you paid for a 3D seat view with this address.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    `You're in, ${firstName}`,
    '',
    'Your payment went through and the view from your seat is open. Take the tour: the whole venue, then your category, then your seat.',
    '',
    title,
    ...(when ? [when] : []),
    '',
    ...details.map(([k, v]) => `${k}: ${v}`),
    `Pass: ${order.id}`,
    `Access: ${formatFee(order.amount)}, paid`,
    '',
    'Open my 3D seat view:',
    link,
    '',
    'Opens on any phone or laptop, until the day after the show. Keep this email to yourself: the link opens your pass.',
    ...(waLinks.length ? ['', 'Meet other fans on WhatsApp:', ...waLinks.map(([t, href]) => `${t}: ${href}`)] : []),
    '',
    'The 3D view is not a concert ticket. Your ticket comes from the concert’s official seller.',
    '',
    'Questions? Reply to this email and we will help.',
    'Atvents',
  ].join('\n');

  return { subject, html, text };
}

// The code that opens a paid pass on one more device (devices.mjs): { subject, html, text }.
export function codeEmail({ order, concert, code, minutes }) {
  const title = concert?.title || order.title;
  const firstName = order.name.split(' ')[0];
  const subject = `${code} is your Atvents pass code`;
  const text = [
    `Hi ${firstName},`,
    '',
    `Someone asked to open your 3D pass for ${title} on another device. The code is:`,
    '',
    code,
    '',
    `It works for ${minutes} minutes, on the device that asked. Your pass opens on two devices at a time: with this code, the one you used least recently is signed out.`,
    '',
    'If that was not you, ignore this email and do not share the code. Your pass stays as it is.',
    '',
    'Atvents',
  ].join('\n');
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#0c0c0c;color:#f2f2f2;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0c"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td style="font-size:15px;line-height:1.6;color:#f2f2f2">
<p style="margin:0 0 16px">Hi ${esc(firstName)},</p>
<p style="margin:0 0 16px">Someone asked to open your 3D pass for <b>${esc(title)}</b> on another device. The code is:</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:8px;color:#ff5a1f">${esc(code)}</p>
<p style="margin:0 0 16px">It works for ${minutes} minutes, on the device that asked. Your pass opens on two devices at a time: with this code, the one you used least recently is signed out.</p>
<p style="margin:0 0 16px;color:#9a9a9a">If that was not you, ignore this email and do not share the code. Your pass stays as it is.</p>
<p style="margin:0;color:#9a9a9a">Atvents</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
