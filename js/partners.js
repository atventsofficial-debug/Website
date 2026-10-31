// The partner page: the 3D seat view offered to ticketing apps, promoters, venues, travel
// companies, banks and media. Drawn once; the demo request form is bound once.
import { VENUE_KEYS, getVenue } from './layouts.js';
import { DEMOS, getEvent } from './events.js';
import { USES, PLANS, FAQ_PARTNERS, faqHtml, brandText } from './content.js';
import { dotMap } from './pages.js';
import { checkLead } from './rules.js';
import { $, esc, icon, state } from './ui.js';

const n = x => x.toLocaleString('en-US');
let drawn = false;

export function renderPartners() {
  if (drawn) return;
  drawn = true;
  // Figures from the models themselves, so the page never claims more than is built.
  const sizes = VENUE_KEYS.map(k => ({ key: k, seats: getVenue(k).seats.length }));
  const largest = sizes.reduce((a, b) => (b.seats > a.seats ? b : a));
  const largestName = DEMOS.find(d => d.venue === largest.key)?.place.name || 'Stadium';
  $('#partner-stats').innerHTML = [
    ['Venue layouts', n(VENUE_KEYS.length), 'Arenas, stadiums, halls, cinemas'],
    ['Seats modelled', n(sizes.reduce((a, s) => a + s.seats, 0)), 'Every one a viewpoint'],
    ['Largest model', n(largest.seats), `${largestName}, seat by seat`],
    ['Apps to install', '0', 'It runs in the browser'],
  ].map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}</dd><small>${esc(s)}</small></div>`).join('');

  $('#partner-use-list').innerHTML = USES.map(u => `<li><span class="feat-ic">${icon(u.ic)}</span><h3>${esc(u.title)}</h3><p>${esc(u.text)}</p></li>`).join('');

  $('#partner-demos').innerHTML = DEMOS.map((d, i) => {
    const v = getEvent(d.id);
    return `<a class="venue" href="#demo-${d.venue}">
      ${dotMap(v)}
      <div class="venue-body">
        <span class="venue-n">0${i + 1} · ${n(v.seats.length)} seats</span>
        <h3>${esc(d.title)}</h3>
        <p>${esc(d.blurb)}</p>
        <div class="venue-foot"><span>Open the demo</span><span class="go">${icon('i-arrow')}</span></div>
      </div></a>`;
  }).join('');

  $('#partner-plans').innerHTML = PLANS.map((p, i) => `
    <article class="plan${p.style ? ` plan-${p.style}` : ''}">
      <div class="plan-head">
        <div class="plan-top"><span>Plan 0${i + 1}</span><span class="tag ${p.style ? 'tag-dark' : 'tag-coral'}">${esc(p.tag)}</span></div>
        <h3>${esc(p.name)}</h3>
        <p class="plan-price">${p.from ? '<small>from</small>' : ''}<b>${esc(p.price)}</b><span>${esc(p.per)}</span></p>
      </div>
      <div class="plan-cut"></div>
      <div class="plan-body">
        <p class="plan-for">${esc(p.for)}</p>
        <ul>${p.items.map(it => `<li>${icon('i-check')}<span>${brandText(esc(it))}</span></li>`).join('')}</ul>
        <a class="btn ${p.style ? 'btn-ink' : 'btn-coral'} btn-block" href="#partner-contact" data-plan="${esc(p.name)}">${esc(p.cta)}</a>
      </div>
    </article>`).join('');

  $('#partner-faq').innerHTML = faqHtml(FAQ_PARTNERS);

  const c = state.cfg.contact;
  $('#partner-contact-side').innerHTML = `
    <article class="panel-box contact-card">
      <span class="feat-ic">${icon('i-mail')}</span>
      <h2>Talk to us</h2>
      <p>We reply within one working day, in Indonesian or English.</p>
      <a class="contact-line" href="mailto:${esc(c.email)}">${icon('i-mail')}<span>${esc(c.email)}</span></a>
      <p class="contact-line">${icon('i-people')}<span>WhatsApp ${esc(c.whatsapp)}</span></p>
    </article>
    <ol class="timeline">
      <li><b>Day 1</b><span>We reply and set up a 20-minute call.</span></li>
      <li><b>Days 2 to 6</b><span>You send the seating plan; we build the venue.</span></li>
      <li><b>Then</b><span>A private demo link for your team and your promoter.</span></li>
    </ol>`;

  bindPartnerForm($('#partner-form'));
}

// A plan's button fills in the message, so the request says which plan it is about.
function bindPartnerForm(form) {
  $('#partner-plans').addEventListener('click', e => {
    const plan = e.target.closest('[data-plan]')?.dataset.plan;
    if (plan && !form.message.value.trim()) form.message.value = `About the ${plan} plan: `;
  });
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#partner-error');
    const say = (msg, field) => { err.textContent = msg; err.hidden = false; form.querySelector(`[name="${field}"]`)?.focus(); };
    const d = Object.fromEntries(new FormData(form));
    const { lead, field, error } = checkLead({ ...d, consent: form.consent.checked });
    if (error) return say(error, field);
    err.hidden = true;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    let ref;
    try {
      ref = (await state.store.partnerLead(lead)).id;
    } catch (e) {
      btn.disabled = false;
      return say(e.status === 429 ? 'Too many requests from here. Please try again in a few minutes, or email us.' : e.message || 'Could not send. Please try again, or email us.');
    }
    $('#partner-body').innerHTML = `
      <div class="host-done">
        <article class="tk tk-dark">
          <div class="tk-stub"><p class="tk-ev">Request<small>${esc(lead.company)}</small></p><b class="tk-code">SENT</b><a class="tk-buy" href="#partner-demo">Demos</a></div>
          <div class="tk-body">
            <div class="tk-top"><i class="tk-vinyl"></i><span class="tk-pill">${esc(ref)}</span></div>
            <p class="tk-label">Thanks, ${esc(lead.name.split(' ')[0])}</p>
            <p class="tk-was">We reply to ${esc(lead.email)} within one working day.${state.store.mode === 'server' ? '' : ' (Demo: saved in this browser.)'}</p>
            <div class="tk-meta"><span>Next: a 20-minute call, then your venue built from its seating plan.</span></div>
          </div>
        </article>
        <div class="row-btns"><a class="btn btn-coral" href="#partner-demo">Try a demo venue ${icon('i-arrow')}</a><a class="btn btn-line" href="#partners">Back to the overview</a></div>
      </div>`;
    $('#partner-contact').scrollIntoView();
  });
}
