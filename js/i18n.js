// English and Indonesian. The site is written in English; with Indonesian chosen, every text
// on the page (and the placeholders, labels and titles) is swapped for its Indonesian line
// from js/i18n-id.js as it appears, whatever renders it. Lines that carry names, dates or
// prices are matched by pattern. Switching back to English reloads the page as written.
import { EXACT, PATTERNS } from './i18n-id.js';

const KEY = 'atvents-lang';
export const lang = (() => {
  try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'id') return v; } catch {}
  return /^(id|in)\b/i.test(navigator.language || '') ? 'id' : 'en';
})();

export function setLang(v) {
  if (v === lang) return;
  try { localStorage.setItem(KEY, v); } catch {}
  location.reload();
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
function doText(n) {
  const p = n.parentElement;
  if (!p || p.closest('script,style,[data-no-i18n]')) return;
  if (done.get(n) === n.nodeValue) return;
  const out = t(n.nodeValue);
  if (out != null) { n.nodeValue = out; done.set(n, out); }
}
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
function doAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a), k = `i18n${a.replace('-', '')}`;
    if (!v || !el.dataset || el.dataset[k] === v) continue;
    const out = t(v);
    if (out != null) { el.dataset[k] = out; el.setAttribute(a, out); }
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

export function startI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-lang]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });
  if (lang !== 'id') return;
  walk(document.body);
  const title = t(document.title); if (title) document.title = title;
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
    const tt = t(document.title); if (tt) document.title = tt;
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
