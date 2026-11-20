// Phones (up to 760 px wide) get the site as an app: a tab bar at the bottom, a slim top bar
// with a back button on inner pages, and only what it takes to find a concert and pay for the
// seat view (css/mobile.css hides the rest). Wider screens never see any of it.
import { $, $$, pageScrollY, pageToTop } from './ui.js';

// The tab each page belongs to. A concert page and the checkout have a buy bar of their own
// and hide the tab bar, as an app's detail page does.
const TAB_OF = { home: 'home', concerts: 'concerts', event: 'concerts', unlock: 'unlock', passes: 'passes' };
const ROOTS = new Set(['home', 'concerts', 'passes']);
const FOCUS = new Set(['event', 'unlock']);

let bound = false;
let depth = 0;   // pages opened on the site since it loaded, so Back never leaves the site

function bind() {
  bound = true;
  const more = $('#tabbar [data-tab="more"]'), burger = $('#burger');
  // "More" is the site menu, shown as a sheet above the tab bar (app.js opens and closes it).
  more.addEventListener('click', e => { e.stopPropagation(); burger.click(); });
  new MutationObserver(() => more.setAttribute('aria-expanded', burger.getAttribute('aria-expanded')))
    .observe(burger, { attributes: true, attributeFilter: ['aria-expanded'] });
  $('#nav-back').addEventListener('click', () => {
    if (depth > 1) history.back();
    else location.hash = document.body.dataset.view === 'event' ? '#concerts' : '#home';
  });
  // The top bar turns solid once the page moves under it.
  const nav = $('#nav');
  const paint = () => nav.classList.toggle('is-solid', pageScrollY() > 8);
  // Capture: on phones the scroll happens in <body>, whose scroll events do not bubble.
  document.addEventListener('scroll', paint, { passive: true, capture: true });
  paint();
  // Tapping the tab you are on goes back to the top, as apps do.
  $$('#tabbar a').forEach(a => a.addEventListener('click', () => {
    if (a.getAttribute('aria-current') === 'page') pageToTop(true);
  }));
  // On phones only <body> scrolls. When the keyboard opens for a field, iOS scrolls the window
  // itself anyway and can leave it there after the keyboard closes: the page then looks right
  // but every tap lands that far off (a concert card would not open). Put it back.
  const pin = () => {
    const f = document.activeElement;
    if (f && f.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (matchMedia('(max-width: 760px)').matches && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
  };
  document.addEventListener('focusout', () => setTimeout(pin, 60));
  window.addEventListener('scroll', pin, { passive: true });
  window.visualViewport?.addEventListener('resize', () => setTimeout(pin, 60));
  // The home page's search field opens the concert list with its search ready to type in.
  $('#m-find')?.addEventListener('click', () => { findNext = true; });
}

let findNext = false;

// Called by app.js after every route.
export function mobileRoute(view) {
  if (!bound) bind();
  depth++;
  const tab = TAB_OF[view] || '';
  $$('#tabbar [data-tab]').forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  // The checkout hides the tab bar once a concert is chosen; its list of events keeps it.
  const choosing = view === 'unlock' && !/^#(unlock-|paid-)/.test(location.hash);
  document.body.classList.toggle('is-focus', FOCUS.has(view) && !choosing);
  $('#nav-back').hidden = ROOTS.has(view) || choosing || view === 'seats';
  if (view === 'concerts' && findNext) requestAnimationFrame(() => $('#concerts-q')?.focus());
  findNext = false;
}
