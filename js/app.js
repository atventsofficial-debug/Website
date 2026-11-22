// Boot and routing. Fan pages are drawn by pages.js, the home page's hero by hero.js, the
// partner page by partners.js, the admin by admin.js and the 3D seat view by viewer.js.
import { getEvent, isConcert, demoFor } from './events.js';
import { LocalStore, ApiStore, PayStore } from './store.js';
import { bindBuyLinks, importPass, passes, refresh } from './passes.js';
import { bindSoldOut } from './soldpop.js';
import { validAffiliate, formatFee, PAYMENT_ID, PLUS_FEE, UPGRADE_FEE } from './rules.js';
import { stopEventHero, renderHome, renderConcerts, renderEvent, renderUnlock, renderPaid, renderFootage, renderPasses, renderFaq, bindPassButtons, navCount, bindNavSearch } from './pages.js';
import { startHero, stopHero } from './hero.js';
import { renderPartners } from './partners.js';
import { renderAdmin } from './admin.js';
import { openViewer, closeViewer, bindViewer, paintViewer, loadScene3d } from './viewer.js';
import { mobileRoute } from './mobile.js';
import { startI18n } from './i18n.js';
import { teamKey } from './team.js';
import { $, $$, state, on, toast, tickCountdowns, captureCampaign, fitGiants, bindSubscribe, pageToTop } from './ui.js';

// Two sides of the site. The route decides which one shows; the toggle in the nav switches.
const SIDE = 'atvents:side';
const HOME_ANCHORS = new Set(['how', 'tour', 'venues', 'news', 'news-form']);
const PARTNER_ANCHORS = new Set(['partner-why', 'partner-uses', 'partner-how', 'partner-demo', 'partner-pricing', 'partner-faq-sec', 'partner-contact']);
const PAGES = new Set(['concerts', 'unlock', 'footage', 'passes', 'partners', 'faq', 'about', 'contact', 'privacy', 'terms', 'disclosure', 'admin']);
// Links from the earlier site, which sold the tickets itself, land on their nearest page.
const LEGACY = {
  events: 'concerts', saved: 'concerts', checkout: 'concerts', tickets: 'passes', organisers: 'partners', host: 'partner-contact',
  pricing: 'partner-pricing', templates: 'partner-demo', 'org-how': 'partner-how', features: 'partner-why', dashboard: 'admin', report: 'admin', campaigns: 'admin',
};

// ---------------------------------------------------------------- boot

// Sandbox payments are for the owner's tests: they open on a device that has visited
// #paytest (#paytest-off ends them). Everyone else keeps the preview until the Worker has
// the production key.
const PAYTEST = 'atvents:paytest';
function payTestSwitch() {
  const h = location.hash;
  if (h !== '#paytest' && h !== '#paytest-off') return false;
  try { if (h === '#paytest') localStorage.setItem(PAYTEST, '1'); else localStorage.removeItem(PAYTEST); } catch { /* ignore */ }
  history.replaceState(null, '', `${location.pathname}${location.search}#unlock`);
  return true;
}
const payTest = () => { try { return localStorage.getItem(PAYTEST) === '1'; } catch { return false; } };

async function boot() {
  payTestSwitch();
  try {
    const r = await fetch('api/config', { headers: { accept: 'application/json' } });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      const c = await r.json();
      // The Worker on Cloudflare: real payments, everything else in this browser.
      // Sandbox payments open on the staging copy, after #paytest, and for the team.
      if (c.mode === 'pay') {
        state.payCfg = c;
        if (!c.sandbox || c.staging || payTest() || (c.team && teamKey())) state.store = new PayStore(c);
        if (c.staging) stagingBadge();
      }
      else {
        if (validAffiliate(c.affiliateLink)) state.cfg.affiliateLink = c.affiliateLink;
        state.store = new ApiStore('');
      }
    }
  } catch { /* static hosting: demo mode, everything stays in this browser */ }
  state.store ||= new LocalStore();
  // DEMO ONLY (this branch): the whole venue booked out, js/demo-full.js.
  if (window.ATV_DEMO) (await import('./demo-full.js')).startDemo();
  $$('[data-brand]').forEach(el => { el.textContent = state.cfg.brand; });
  $$('[data-fee]').forEach(el => { el.textContent = formatFee(); });
  $$('[data-plan-fee="plus"]').forEach(el => { el.textContent = formatFee(PLUS_FEE); });
  $$('[data-plan-fee="upgrade"]').forEach(el => { el.textContent = formatFee(UPGRADE_FEE); });
  $$('[data-contact]').forEach(el => { const v = state.cfg.contact[el.dataset.contact]; el.textContent = v || ''; const line = el.closest('.contact-line'); if (line) line.hidden = !v; });
  captureCampaign();
  // A returning partner who opens the bare address lands on their own side.
  try { if (!location.hash && localStorage.getItem(SIDE) === 'partners') history.replaceState(null, '', `${location.pathname}${location.search}#partners`); } catch { /* ignore */ }
  const burger = $('#burger');
  burger.addEventListener('click', () => setMenu(!menuOpen()));
  $('#menu').addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen()) { setMenu(false); burger.focus(); } });
  document.addEventListener('pointerdown', e => { if (menuOpen() && !e.target.closest('#menu, #burger, [data-tab="more"]')) setMenu(false); });
  setInterval(tickCountdowns, 1000);
  bindSoldOut();
  bindBuyLinks();
  bindPassButtons();
  bindNavSearch();
  startI18n();
  if ($('#foot-alert')) bindSubscribe($('#foot-alert'), { kind: 'newsletter', done: 'You’re on the list. The next big concert lands in your inbox.' }, $('#foot-alert-msg'));
  bindViewer();
  navCount();
  on('passes', () => {
    navCount();
    if (state.view === 'passes') renderPasses();
    if (state.view === 'seats') paintViewer();
  });
  window.addEventListener('hashchange', () => { if (payTestSwitch()) location.reload(); else route(); });
  route();
  // With live payments, every paid pass on this device is checked with the Worker before it
  // opens (passes.js): the wallet alone opens nothing.
  if (state.store.live) passes.all().filter(p => p.status === 'verifying').forEach(p => refresh(p));
}

// On the staging copy, a badge in the corner, so it is never taken for the live site.
function stagingBadge() {
  const b = document.createElement('a');
  b.className = 'staging-badge';
  b.href = '#admin';
  b.textContent = 'STAGING · Sandbox';
  document.body.append(b);
}

// ---------------------------------------------------------------- routing

// Hash routes are plain tokens: #event-<id>, #seats-<id>--<category>, #seats-<id>@<seat>,
// #demo-<layout>, #unlock-<id>, #plus-<id>, #upgrade-<pass id>, #paid-<order id> (back from the payment page),
// #pass-<id>-<token>.
function parse(hash) {
  let h = hash.split('?')[0];
  if (LEGACY[h]) h = LEGACY[h];
  if (h.startsWith('events-')) h = 'concerts';
  if (h.startsWith('order-')) h = 'passes';
  if (!h || h === 'home' || h === 'top') return { view: 'home' };
  if (HOME_ANCHORS.has(h)) return { view: 'home', anchor: h };
  if (PARTNER_ANCHORS.has(h)) return { view: 'partners', anchor: h };
  if (PAGES.has(h)) return { view: h };
  if (h.startsWith('unlock-') && isConcert(h.slice(7))) return { view: 'unlock', id: h.slice(7) };
  // 3D Pass Plus for a concert, and an upgrade to Plus of a pass on this device.
  if (h.startsWith('plus-') && isConcert(h.slice(5))) return { view: 'unlock', id: h.slice(5), plan: 'plus' };
  if (h.startsWith('upgrade-') && /^[A-Za-z0-9_-]{3,40}$/.test(h.slice(8))) return { view: 'unlock', upgrade: h.slice(8) };
  if (h.startsWith('paid-') && PAYMENT_ID.test(h.slice(5))) return { view: 'unlock', paid: h.slice(5), focus: 'pay-sheet' };
  if (h.startsWith('event-') && isConcert(h.slice(6))) return { view: 'event', id: h.slice(6) };
  if (h.startsWith('tour-')) {
    const p = passes.get(h.slice(5));
    if (p && getEvent(p.eventId)) return { view: 'seats', id: p.eventId, tour: p.id };
    return { view: 'passes' };
  }
  const [path, seat] = h.split('@');
  if (path.startsWith('demo-') && demoFor(path.slice(5))) return { view: 'seats', id: demoFor(path.slice(5)).id, seat };
  if (path.startsWith('seats-')) {
    const [id, cat] = path.slice(6).split('--');
    if (getEvent(id)) return { view: 'seats', id, cat, seat };
  }
  return { view: 'home' };
}

// The menu fades and slides in (see .menu in the stylesheet) and is hidden again once it has
// faded out, so it leaves the tab order. A quick second click turns it round halfway.
let menuTimer = 0;
const menuOpen = () => $('#burger').getAttribute('aria-expanded') === 'true';
function setMenu(open) {
  if (open === menuOpen()) return;
  const menu = $('#menu');
  $('#burger').setAttribute('aria-expanded', open);
  clearTimeout(menuTimer);
  if (open) {
    menu.hidden = false;
    void menu.offsetWidth;   // lay it out closed first, so the opening animates
    menu.classList.add('is-open');
  } else {
    menu.classList.remove('is-open');
    menuTimer = setTimeout(() => { menu.hidden = true; }, 260);
  }
}

function setSide(side) {
  document.body.dataset.mode = side;
  $$('a[data-mode]').forEach(a => { if (a.dataset.mode === side) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  $('#logo').href = side === 'partners' ? '#partners' : '#home';
  try { localStorage.setItem(SIDE, side); } catch { /* ignore */ }
}

async function route() {
  // A pass link from another device. The token is a secret, so it leaves the address bar
  // and the history before anything else happens.
  const link = location.hash.match(/^#pass-((?:P|PAY)-[A-Z0-9]{4,24})-([A-Za-z0-9_.-]{16,400})$/);
  if (link) {
    // A paid pass opens on its own page ("You're in"); an older pass goes to My 3D passes.
    const to = hash => history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
    to(PAYMENT_ID.test(link[1]) ? `paid-${link[1]}` : 'passes');
    try {
      const p = await importPass(link[1], link[2]);
      if (p?.status === 'device') { to('passes'); toast('This pass is already open on two other devices. Get a code by email to open it here.'); } else toast('Pass added to this device.');
    } catch { to('passes'); toast('That pass link did not work. Write to us with your payment reference.'); }
  }
  const r = parse(location.hash.slice(1));
  const prev = state.view;
  state.view = r.view;
  $$('[data-view-id]').forEach(v => { v.hidden = v.dataset.viewId !== r.view; });
  document.body.dataset.view = r.view;
  setSide(r.view === 'partners' ? 'partners' : 'fans');
  setMenu(false);
  const inApp = r.view === 'seats';
  $('#nav').hidden = inApp;
  $('#footer').hidden = inApp;
  document.body.style.overflow = inApp ? 'hidden' : '';
  const key = r.view === 'event' ? 'concerts' : r.anchor || r.view;
  $$('[data-nav]').forEach(a => { if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });

  if (r.view !== 'home') stopHero();
  if (r.view !== 'event') stopEventHero();
  if (!inApp) closeViewer();

  switch (r.view) {
    case 'home': renderHome(); startHero(); break;
    case 'concerts': renderConcerts(); break;
    case 'event': renderEvent(r.id); loadScene3d().catch(() => {}); break;   // likely next: the 3D venue
    case 'seats': openViewer(r.id, { cat: r.cat, seat: r.seat, back: state.page, tour: r.tour }); break;
    case 'unlock': if (r.paid) renderPaid(r.paid); else renderUnlock(r.id, { plan: r.plan || '', upgrade: r.upgrade || '' }); break;
    case 'footage': renderFootage(); break;
    case 'passes': renderPasses({ check: true }); break;
    case 'partners': renderPartners(); break;
    case 'faq': renderFaq(); break;
    case 'admin': renderAdmin(); break;
    default: break;
  }
  fitGiants($(`[data-view-id="${r.view}"]`) || document);
  mobileRoute(r.view);
  if (inApp) return;
  // The viewer's back button returns to the page it was opened from.
  state.page = location.hash || '#home';
  // An anchor in the page, or the part the page is about (the checkout of #paid-<id>).
  const target = document.getElementById(r.anchor || r.focus || '');
  if (target && !target.hidden) requestAnimationFrame(() => target.scrollIntoView());
  else if (prev !== r.view || r.view !== 'concerts') pageToTop();
}

window.atvents = state;   // for the browser console
boot();
