// Admin: clicks out to tiket.com, 3D pass claims and their check against the affiliate
// report, partner requests and sign-ups. On the server it needs the admin token; in the
// demo it shows what this browser stored.
import { eventMeta, getEvent } from './events.js';
import { parseConversions, MAX_REPORT_ROWS } from './rules.js';
import { STATUS } from './passes.js';
import { $, esc, icon, state, toast } from './ui.js';

const n = x => (x || 0).toLocaleString('en-US');
const day = iso => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const titleOf = id => { const e = eventMeta(id); return e ? `${e.title}${e.subtitle.includes('Day') ? ` · ${e.subtitle.split('·').pop().trim()}` : ''}` : id; };
const catName = (eventId, cat) => getEvent(eventId)?.catById[cat]?.name || cat;
const KIND = { ticketing: 'Ticketing', promoter: 'Promoter', venue: 'Venue', travel: 'Travel', brand: 'Bank / brand', media: 'Media', other: 'Other' };
// Sign-up lists. Waitlists came from the earlier site, which sold tickets itself.
const LIST = { newsletter: 'Concert alerts', alerts: 'One show', waitlist: 'Waitlist (earlier site)' };
const plural = (k, one, many = `${one}s`) => `${n(k)} ${k === 1 ? one : many}`;
// A table's only row while it has nothing to show. The span keeps the words on screen when
// a narrow table scrolls sideways (see .table td.empty).
const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="empty"><span>${text}</span></td></tr>`;
let report = null;   // a conversion report read and waiting to be imported

export async function renderAdmin() {
  const body = $('#admin-body'), st = state.store;
  $('#admin-mode').textContent = st.mode === 'server'
    ? 'Live data from the server.'
    : 'Demo: what this browser stored. On the live server this page shows everyone’s data, behind the admin token.';
  if (st.mode === 'server' && !st.adminToken) return tokenForm();
  body.innerHTML = '<p class="dash-loading"><span class="spinner"></span>Loading</p>';
  let data;
  try {
    const [summary, claims, leads, subscribers] = await Promise.all([st.summary(), st.claims(), st.leads(), st.subscribers()]);
    data = { summary, claims, leads, subscribers };
  } catch (e) {
    if (e.status === 401) { st.setAdminToken(''); return tokenForm('That token was not accepted.'); }
    body.innerHTML = `<div class="empty-state"><h3>Could not load.</h3><p>${esc(e.message || 'The server did not answer.')}</p><button class="btn btn-line" type="button" id="admin-retry">Try again</button></div>`;
    $('#admin-retry').addEventListener('click', renderAdmin);
    return;
  }
  if (state.view !== 'admin') return;
  draw(data);
}

function tokenForm(msg = '') {
  $('#admin-body').innerHTML = `
    <form class="form token-form panel-box" id="admin-login">
      <label>Admin token<input name="token" type="password" autocomplete="current-password" required></label>
      <button class="btn btn-coral" type="submit">Open</button>
      ${msg ? `<p class="form-error" role="alert">${esc(msg)}</p>` : ''}
    </form>`;
  $('#admin-login').addEventListener('submit', ev => {
    ev.preventDefault();
    const t = ev.currentTarget.token.value.trim();
    if (!t) return;
    state.store.setAdminToken(t);
    renderAdmin();
  });
}

// The seat a claim names, as the e-ticket would print it.
function seatName(c) {
  if (!c.seat) return '';
  const v = getEvent(c.eventId), i = v?.seatById.get(c.seat);
  if (i === undefined) return c.seat;
  const s = v.seats[i];
  return s.standing ? `${s.secName}, standing` : `${s.secName} · Row ${s.row} · Seat ${s.num}`;
}

// A claim waiting for a person: what the fan entered next to the e-ticket they sent.
function reviewCard(c) {
  const p = c.proof, img = p?.data && p.type.startsWith('image/');
  return `<article class="review panel-box">
    <a class="review-proof" ${p?.data ? `href="${p.data}" target="_blank" rel="noopener" download="${esc(p.name || 'e-ticket')}"` : ''}>${img ? `<img src="${p.data}" alt="E-ticket sent with ${esc(c.id)}">` : `<span>${p ? `${esc(p.name)}<small>${p.type === 'application/pdf' ? 'PDF' : ''}${p.data ? ' · open' : ' · kept on the server'}</small>` : 'No e-ticket sent'}</span>`}</a>
    <div class="review-body">
      <div class="review-top"><span class="mono">${esc(c.id)}</span><span class="muted">${day(c.createdAt)}</span></div>
      <h3>${esc(titleOf(c.eventId))}</h3>
      <dl class="review-facts">
        <div><dt>Category</dt><dd>${esc(catName(c.eventId, c.cat))}</dd></div>
        <div><dt>Seat</dt><dd>${esc(seatName(c)) || 'Not given'}</dd></div>
        <div><dt>Order ID</dt><dd class="mono">${esc(c.orderRef)}</dd></div>
        <div><dt>Email</dt><dd>${esc(c.email)}</dd></div>
        <div><dt>Access</dt><dd>${c.route === 'outside' ? `Paid Rp25.000 <span class="mono">${esc(c.payment || '')}</span>` : `Our link · ${n(c.clicks?.length)} click${c.clicks?.length === 1 ? '' : 's'}`}</dd></div>
      </dl>
      <div class="row-btns"><button class="btn btn-coral btn-sm" type="button" data-claim="${esc(c.id)}" data-status="confirmed">${icon('i-check')}Approve</button><button class="btn btn-line btn-sm" type="button" data-claim="${esc(c.id)}" data-status="rejected">${icon('i-x')}Reject</button></div>
    </div>
  </article>`;
}

function draw({ summary, claims, leads, subscribers }) {
  const count = s => claims.filter(c => c.status === s).length;
  const queue = claims.filter(c => c.status === 'checking');
  const clicks30 = summary.events.reduce((a, e) => a + e.clicks30, 0);
  const kpi = (label, value, note = '', coral = false) => `<div class="kpi${coral ? ' kpi-coral' : ''}"><span>${label}</span><b>${n(value)}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  const events = summary.events.slice().sort((a, b) => b.clicks - a.clicks);
  $('#admin-body').innerHTML = `
    <div class="kpis">
      ${kpi('Clicks to tiket.com', clicks30, 'Last 30 days', true)}
      ${kpi('3D passes claimed', claims.length, 'All time')}
      ${kpi('Approved', count('confirmed'), 'Seat tour open')}
      ${kpi('To review', count('checking'), 'E-ticket not checked yet')}
      ${kpi('Rejected', count('rejected'), 'Did not match')}
      ${kpi('Partner requests', summary.leads, 'From the partner page')}
      ${kpi('Alert sign-ups', summary.subscribers, 'Home page and shows')}
    </div>

    <section class="dash-block">
      <header class="dash-head"><h2>Concerts</h2><p>Clicks out to tiket.com and the passes claimed for each concert.</p></header>
      <div class="table-wrap panel-box"><table class="table">
        <thead><tr><th>Concert</th><th class="r">Clicks</th><th class="r">Last 30 days</th><th class="r">Waiting</th><th class="r">Confirmed</th><th class="r">Closed</th></tr></thead>
        <tbody>${events.length ? events.map(e => `<tr><td>${esc(titleOf(e.eventId))}</td><td class="r mono">${n(e.clicks)}</td><td class="r mono">${n(e.clicks30)}</td><td class="r mono">${n(e.checking)}</td><td class="r mono">${n(e.confirmed)}</td><td class="r mono">${n(e.rejected)}</td></tr>`).join('')
          : emptyRow(6, 'No clicks yet. They appear when visitors use a Buy on tiket.com button.')}</tbody>
      </table></div>
    </section>

    <div class="dash-2">
      <section class="dash-block">
        <header class="dash-head"><h2>Campaigns</h2><p>Where the clicks came from: the <code>?src=</code> on your links (instagram, tiktok…).</p></header>
        <div class="table-wrap panel-box"><table class="table">
          <thead><tr><th>Source</th><th class="r">Clicks</th></tr></thead>
          <tbody>${summary.sources.length ? summary.sources.map(s => `<tr><td>${esc(s.src || 'Direct')}</td><td class="r mono">${n(s.clicks)}</td></tr>`).join('') : emptyRow(2, 'No clicks yet.')}</tbody>
        </table></div>
      </section>

      <section class="dash-block">
        <header class="dash-head"><h2>Affiliate report</h2><p>Paste or open the conversion report from the network (CSV, with a header row). Passes whose click ids appear in it are confirmed; ids with only rejected sales close their pass.</p></header>
        <form class="form panel-box conv" id="conv-form">
          <label>Report<textarea name="report" rows="5" spellcheck="false" placeholder="aff_sub,status&#10;k3m9x2p7q1zt,approved"></textarea></label>
          <div class="row-btns">
            <label class="btn btn-line btn-sm file-btn">${icon('i-copy')}Open a CSV file<input type="file" name="file" accept=".csv,text/csv,text/plain"></label>
            <button class="btn btn-line btn-sm" type="submit">Check the report</button>
            <button class="btn btn-coral btn-sm" type="button" id="conv-import" disabled>Import</button>
          </div>
          <p class="form-msg" id="conv-msg" role="status" hidden></p>
        </form>
      </section>
    </div>

    <section class="dash-block">
      <header class="dash-head"><h2>To review</h2><p>Check that each e-ticket shows this concert, this category and this seat, under this order ID. Approve opens the fan's seat tour; reject keeps it closed and asks them to send it again.</p></header>
      ${queue.length ? `<div class="review-grid">${queue.map(reviewCard).join('')}</div>` : '<div class="empty-state panel-box"><h3>Nothing to review.</h3><p>New claims appear here with their e-ticket.</p></div>'}
    </section>

    <section class="dash-block">
      <header class="dash-head"><h2>3D passes</h2><p>Every claim, with the seat and the booking the fan entered. A sale in the affiliate report also approves a claim.</p></header>
      <div class="table-wrap panel-box"><table class="table">
        <thead><tr><th>Claimed</th><th>Pass</th><th>Concert</th><th>Category</th><th>Seat</th><th>Access</th><th>Order ID</th><th>Email</th><th class="r">Clicks</th><th>Status</th><th></th></tr></thead>
        <tbody>${claims.length ? claims.map(c => `<tr>
          <td class="muted">${day(c.createdAt)}</td><td class="mono">${esc(c.id)}</td><td>${esc(titleOf(c.eventId))}</td><td>${esc(catName(c.eventId, c.cat))}</td><td>${esc(seatName(c))}</td>
          <td>${c.route === 'outside' ? `Paid Rp25.000<small class="cell-sub mono">${esc(c.payment || '')}</small>` : 'Our link'}</td>
          <td class="mono">${esc(c.orderRef)}</td><td>${esc(c.email)}</td><td class="r mono">${n(c.clicks?.length)}</td>
          <td><span class="pass-pill is-${esc(c.status)}">${esc(STATUS[c.status]?.label || c.status)}</span></td>
          <td class="r">${c.status !== 'confirmed' ? `<button class="link" type="button" data-claim="${esc(c.id)}" data-status="confirmed">Approve</button>` : ''} ${c.status !== 'rejected' ? `<button class="link" type="button" data-claim="${esc(c.id)}" data-status="rejected">Reject</button>` : ''}</td>
        </tr>`).join('') : emptyRow(11, 'No passes claimed yet.')}</tbody>
      </table></div>
    </section>

    <section class="dash-block">
      <header class="dash-head"><h2>Partner requests</h2><p>From the form on the partner page.</p>${leads.length ? '<button class="btn btn-line btn-sm" type="button" data-csv="leads">Download CSV</button>' : ''}</header>
      <div class="table-wrap panel-box"><table class="table">
        <thead><tr><th>Sent</th><th>Name</th><th>Company</th><th>Business</th><th>Tickets a year</th><th>Email</th><th>WhatsApp</th><th>Message</th></tr></thead>
        <tbody>${leads.length ? leads.map(l => `<tr><td class="muted">${day(l.createdAt)}</td><td>${esc(l.name)}</td><td>${esc(l.company)}${l.website ? `<small class="cell-sub">${esc(l.website)}</small>` : ''}</td><td>${esc(KIND[l.kind] || l.kind)}</td><td class="muted">${esc(l.volume || '')}</td><td>${esc(l.email)}</td><td class="mono">${esc(l.phone || '')}</td><td class="wrap-cell">${esc(l.message || '')}</td></tr>`).join('')
          : emptyRow(8, 'No requests yet.')}</tbody>
      </table></div>
    </section>

    <section class="dash-block">
      <header class="dash-head"><h2>Alert sign-ups</h2><p>Concert alerts from the home page and news of one show from its page.</p>${subscribers.length ? '<button class="btn btn-line btn-sm" type="button" data-csv="subscribers">Download CSV</button>' : ''}</header>
      <div class="table-wrap panel-box"><table class="table">
        <thead><tr><th>Signed up</th><th>Email</th><th>List</th><th>Concert</th></tr></thead>
        <tbody>${subscribers.length ? subscribers.map(s => `<tr><td class="muted">${day(s.createdAt)}</td><td>${esc(s.email)}</td><td>${LIST[s.kind] || esc(s.kind)}</td><td>${s.eventId ? esc(titleOf(s.eventId)) : ''}</td></tr>`).join('')
          : emptyRow(4, 'No sign-ups yet.')}</tbody>
      </table></div>
    </section>

    <div class="row-btns dash-foot">
      ${state.store.mode === 'server' ? '<button class="btn btn-line btn-sm" type="button" id="admin-out">Sign out</button>' : '<button class="btn btn-line btn-sm" type="button" id="admin-reset">Clear the demo data</button>'}
    </div>`;
  bindDraw({ claims, leads, subscribers });
}

function bindDraw(data) {
  const body = $('#admin-body');
  body.onclick = async ev => {
    const b = ev.target.closest('[data-claim]');
    if (b) {
      b.disabled = true;
      try { await state.store.setClaim(b.dataset.claim, b.dataset.status); toast(b.dataset.status === 'confirmed' ? 'Approved: the seat tour is open.' : 'Rejected.'); renderAdmin(); } catch (e) { toast(e.message || 'Could not change the pass.'); b.disabled = false; }
      return;
    }
    const csv = ev.target.closest('[data-csv]')?.dataset.csv;
    if (csv === 'leads') download('partner-requests.csv', toCsv(data.leads, ['createdAt', 'name', 'company', 'kind', 'volume', 'email', 'phone', 'website', 'message']));
    if (csv === 'subscribers') download('alert-sign-ups.csv', toCsv(data.subscribers, ['createdAt', 'email', 'kind', 'eventId']));
  };
  $('#admin-out')?.addEventListener('click', () => { state.store.setAdminToken(''); renderAdmin(); });
  $('#admin-reset')?.addEventListener('click', async () => { await state.store.reset(); toast('Demo data cleared.'); renderAdmin(); });

  const form = $('#conv-form'), msg = $('#conv-msg'), importBtn = $('#conv-import');
  const say = (t, cls) => { msg.textContent = t; msg.className = `form-msg ${cls}`; msg.hidden = false; };
  form.file.addEventListener('change', async () => {
    const f = form.file.files[0];
    if (!f) return;
    if (f.size > 2e6) { say('That file is over 2 MB. Export only the conversions you need.', 'is-err'); return; }
    form.report.value = await f.text();
    form.requestSubmit();
  });
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const r = parseConversions(form.report.value);
    report = null;
    importBtn.disabled = true;
    if (r.error) return say(r.error, 'is-err');
    if (!r.rows.length) return say(`No rows with one of our click ids${r.skipped ? ` (${n(r.skipped)} skipped)` : ''}.`, 'is-err');
    if (r.rows.length > MAX_REPORT_ROWS) return say(`Over ${n(MAX_REPORT_ROWS)} rows: import the report in parts.`, 'is-err');
    const by = s => r.rows.filter(x => x.status === s).length;
    report = r.rows;
    importBtn.disabled = false;
    say(`${plural(r.rows.length, 'sale')} with our click ids: ${n(by('approved'))} approved, ${n(by('pending'))} pending, ${n(by('rejected'))} rejected.${r.skipped ? ` ${plural(r.skipped, 'row')} skipped.` : ''}`, 'is-ok');
  });
  importBtn.addEventListener('click', async () => {
    if (!report) return;
    importBtn.disabled = true;
    try {
      const res = await state.store.importConversions(report);
      report = null;
      toast(`Imported ${plural(res.imported, 'sale')}: ${plural(res.confirmed, 'pass', 'passes')} confirmed, ${n(res.rejected)} closed.`);
      renderAdmin();
    } catch (e) { say(e.message || 'Could not import.', 'is-err'); importBtn.disabled = false; }
  });
}

// CSV for a spreadsheet. A cell that starts like a formula is quoted with ' first, so a
// name typed as "=HYPERLINK(...)" stays text when the file is opened.
function toCsv(rows, cols) {
  const cell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(c === 'eventId' && r[c] ? titleOf(r[c]) : r[c])).join(','))].join('\r\n');
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
