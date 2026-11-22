// English and Indonesian. The site is written in English and opens in English unless the
// visitor picked Indonesian on the toggle (kept in localStorage). With Indonesian chosen, every
// text on the page (and the placeholders, labels and titles) is swapped for its Indonesian line
// from js/i18n-id.js as it appears, whatever renders it. Lines that carry names, dates or
// prices are matched by pattern. Each swapped text keeps its English, so switching back puts
// it back in place: no reload either way, the page just fades across.
import { EXACT, PATTERNS } from './i18n-id.js';

const KEY = 'atvents-lang';
export let lang = (() => {
  try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'id') return v; } catch {}
  return 'en';
})();

// A quick fade out, the words swapped while the page is faint, a fade back in.
let switching = null;
export function setLang(v) {
  if ((v !== 'en' && v !== 'id') || v === lang) return;
  try { localStorage.setItem(KEY, v); } catch {}
  lang = v;
  paintToggles();
  const root = document.documentElement;
  const still = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('lang-swap');
  // A second tap before the first has finished: the last one wins.
  clearTimeout(switching);
  switching = setTimeout(() => {
    switching = null;
    apply();
    requestAnimationFrame(() => { if (!switching) root.classList.remove('lang-swap'); });
  }, still ? 0 : 140);
}
function paintToggles() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.querySelectorAll('.lang').forEach(g => { g.dataset.cur = lang; });
}

const DAYS = { Mon: 'Sen', Tue: 'Sel', Wed: 'Rab', Thu: 'Kam', Fri: 'Jum', Sat: 'Sab', Sun: 'Min' };
const MONTHS = { May: 'Mei', Aug: 'Agu', Oct: 'Okt', Dec: 'Des', January: 'Januari', February: 'Februari', March: 'Maret', June: 'Juni', July: 'Juli', August: 'Agustus', October: 'Oktober', December: 'Desember' };
const WORDS = { ...DAYS, ...MONTHS };
const caseLike = (src, out) => (src === src.toUpperCase() ? out.toUpperCase() : out);
// Day and month names in a date, in either case.
export const dates = s => s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|May|Aug|Oct|Dec|January|February|March|June|July|August|October|December|MON|TUE|WED|THU|FRI|SAT|SUN|MAY|AUG|OCT|DEC)\b/g, w => {
  const k = Object.keys(WORDS).find(x => x.toUpperCase() === w.toUpperCase() && (w === x || w === x.toUpperCase()));
  return k ? caseLike(w, WORDS[k]) : w;
}).replace(/\btime TBA\b/g, 'jam belum diumumkan').replace(/\bstarts (\d)/g, 'mulai $1').replace(/\bends (\d)/g, 'selesai $1');
const DATE_START = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|MON|TUE|WED|THU|FRI|SAT|SUN),? )?\d{1,2}(?:[\d ,&]*)? (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|January|February|March|April|May|June|July|August|September|October|November|December)\b/;

export function t(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  let out = EXACT[s];
  if (out == null) {
    for (const [re, rep] of PATTERNS) {
      if (re.test(s)) { out = s.replace(re, typeof rep === 'function' ? rep : (...m) => rep.replace(/\$(\d)/g, (_, i) => dates(m[+i] ?? ''))); break; }
    }
  }
  if (out == null && DATE_START.test(s)) out = dates(s);
  if (out == null || out === s) return null;
  const lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0];
  return lead + out + tail;
}

const done = new WeakMap(); // text node -> the Indonesian we set, so our own change is not done again
const orig = new WeakMap(); // text node -> its English, to put back
function doText(n) {
  const p = n.parentElement;
  if (!p || p.closest('script,style,[data-no-i18n]')) return;
  if (done.get(n) === n.nodeValue) return;
  // An element can carry its own Indonesian in data-id, where word order differs.
  const out = p.dataset.id != null && n.nodeValue.trim() ? n.nodeValue.replace(/\S.*\S|\S/s, p.dataset.id) : t(n.nodeValue);
  if (out != null) { orig.set(n, n.nodeValue); n.nodeValue = out; done.set(n, out); }
}
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const origAttr = new WeakMap(); // element -> { attribute: its English }
function doAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a), k = `i18n${a.replace('-', '')}`;
    if (!v || !el.dataset || el.dataset[k] === v) continue;
    const out = t(v);
    if (out != null) {
      const o = origAttr.get(el) || {};
      o[a] = v;
      origAttr.set(el, o);
      el.dataset[k] = out;
      el.setAttribute(a, out);
    }
  }
}
// Back to English: every text and attribute we swapped, as it was written.
function undo(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) {
      if (orig.has(n) && done.get(n) === n.nodeValue) n.nodeValue = orig.get(n);
      orig.delete(n); done.delete(n);
    } else {
      const o = origAttr.get(n);
      if (!o) continue;
      for (const [a, v] of Object.entries(o)) {
        const k = `i18n${a.replace('-', '')}`;
        if (n.getAttribute(a) === n.dataset[k]) n.setAttribute(a, v);
        delete n.dataset[k];
      }
      origAttr.delete(n);
    }
  }
}
function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (root.closest('script,style,[data-no-i18n]')) return; doAttrs(root); }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode())) n.nodeType === 3 ? doText(n) : doAttrs(n);
}

let observer = null, titleEn = '';
let applied = 'en';
function apply() {
  if (applied === lang) return;
  applied = lang;
  if (lang === 'id') {
    titleEn = document.title;
    walk(document.body);
    const title = t(document.title); if (title) document.title = title;
    observer ||= new MutationObserver(list => {
      if (lang !== 'id') return;
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
      const tt = t(document.title); if (tt) { titleEn = document.title; document.title = tt; }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  } else {
    observer?.disconnect();
    undo(document.body);
    if (titleEn) document.title = titleEn;
  }
}

export function startI18n() {
  paintToggles();
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  if (lang === 'id') apply();
}
