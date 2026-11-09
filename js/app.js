// Boot and routing. Fan pages are drawn by pages.js, the home page's hero by hero.js, the
// partner page by partners.js, the admin by admin.js and the 3D seat view by viewer.js.
import { getEvent, isConcert, demoFor } from './events.js';
import { LocalStore, ApiStore } from './store.js';
import { bindBuyLinks, importPass, passes } from './passes.js';
import { validAffiliate } from './rules.js';
import { renderHome, renderConcerts, renderEvent, renderUnlock, renderPasses, renderFaq, bindPassButtons, navCount } from './pages.js';
import { startHero, stopHero } from './hero.js';
import { renderPartners } from './partners.js';
import { renderAdmin } from './admin.js';
import { openViewer, closeViewer, bindViewer, paintViewer, loadScene3d } from './viewer.js';
import { $, $$, state, on, toast, tickCountdowns, captureCampaign, fitGiants } from './ui.js';

// Two sides of the site. The route decides which one shows; the toggle in the nav switches.
const SIDE = 'atvents:side';
const HOME_ANCHORS = new Set(['how', 'tour', 'venues', 'news-form']);
const PARTNER_ANCHORS = new Set(['partner-why', 'partner-uses', 'partner-how', 'partner-demo', 'partner-pricing', 'partner-faq-sec', 'partner-contact']);
const PAGES = new Set(['concerts', 'unlock', 'passes', 'partners', 'faq', 'about', 'contact', 'privacy', 'terms', 'disclosure', 'admin']);
// Links from the earlier site, which sold the tickets itself, land on their nearest page.
const LEGACY = {
  events: 'concerts', saved: 'concerts', checkout: 'concerts', tickets: 'passes', organisers: 'partners', host: 'partner-contact',
  pricing: 'partner-pricing', templates: 'partner-demo', 'org-how': 'partner-how', features: 'partner-why', dashboard: 'admin', report: 'admin', campaigns: 'admin',
};

// ---------------------------------------------------------------- boot

async function boot() {
  try {
    const r = await fetch('api/config', { headers: { accept: 'application/json' } });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      const c = await r.json();
      if (validAffiliate(c.affiliateLink)) state.cfg.affiliateLink = c.affiliateLink;
      state.store = new ApiStore('');
    }
  } catch { /* static hosting: demo mode, everything stays in this browser */ }
  state.store ||= new LocalStore();
  $$('[data-brand]').forEach(el => { el.textContent = state.cfg.brand; });
  $$('[data-contact]').forEach(el => { const v = state.cfg.contact[el.dataset.contact]; el.textContent = v || ''; const line = el.closest('.contact-line'); if (line) line.hidden = !v; });
  captureCampaign();
  // A returning partner who opens the bare address lands on their own side.
  try { if (!location.hash && localStorage.getItem(SIDE) === 'partners') history.replaceState(null, '', `${location.pathname}${location.search}#partners`); } catch { /* ignore */ }
  const burger = $('#burger');
  burger.addEventListener('click', () => setMenu(!menuOpen()));
  $('#menu').addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen()) { setMenu(false); burger.focus(); } });
  document.addEventListener('pointerdown', e => { if (menuOpen() && !e.target.closest('#menu, #burger')) setMenu(false); });
  setInterval(tickCountdowns, 1000);
  bindBuyLinks();
  bindPassButtons();
  bindViewer();
  navCount();
  on('passes', () => {
    navCount();
    if (state.view === 'passes') renderPasses();
    if (state.view === 'seats') paintViewer();
  });
  window.addEventListener('hashchange', route);
  route();
}

// ---------------------------------------------------------------- routing

// Hash routes are plain tokens: #event-<id>, #seats-<id>--<category>, #seats-<id>@<seat>,
// #demo-<layout>, #unlock-<id>, #pass-<id>-<token>.
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
  const link = location.hash.match(/^#pass-(P-[A-Z0-9]{4,20})-([A-Za-z0-9_-]{16,64})$/);
  if (link) {
    history.replaceState(null, '', `${location.pathname}${location.search}#passes`);
    try { await importPass(link[1], link[2]); toast('Pass added to this device.'); } catch { toast('That pass link did not work. Send your seat again on Unlock 3D.'); }
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
  if (!inApp) closeViewer();

  switch (r.view) {
    case 'home': renderHome(); startHero(); break;
    case 'concerts': renderConcerts(); break;
    case 'event': renderEvent(r.id); loadScene3d().catch(() => {}); break;   // likely next: the 3D venue
    case 'seats': openViewer(r.id, { cat: r.cat, seat: r.seat, back: state.page, tour: r.tour }); break;
    case 'unlock': renderUnlock(r.id); break;
    case 'passes': renderPasses({ check: true }); break;
    case 'partners': renderPartners(); break;
    case 'faq': renderFaq(); break;
    case 'admin': renderAdmin(); break;
    default: break;
  }
  fitGiants($(`[data-view-id="${r.view}"]`) || document);
  if (inApp) return;
  // The viewer's back button returns to the page it was opened from.
  state.page = location.hash || '#home';
  const target = r.anchor && document.getElementById(r.anchor);
  if (target) requestAnimationFrame(() => target.scrollIntoView());
  else if (prev !== r.view || r.view !== 'concerts') window.scrollTo(0, 0);
}

window.atvents = state;   // for the browser console
boot();
