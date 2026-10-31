// Dropdowns drawn by the page instead of the browser's own menu, so the list matches the
// site: country headings, event counts, a tick on the current choice. Each is a button and
// a list, after the WAI-ARIA select-only combobox: arrow keys move, Enter or Space picks,
// Escape closes, typing a letter jumps to an option. One is open at a time.
import { esc, icon } from './ui.js';

let openPicker = null;
let seq = 0;

document.addEventListener('pointerdown', e => {
  if (openPicker && !openPicker.root.contains(e.target)) openPicker.close();
});

// `name` is what a screen reader calls it, `label` a word shown before the value ("Sort"),
// `ic` an icon in front. set(items, value) fills it; items are options
// { value, label, short?, note? } or groups { group, tag?, items: [options] }. `short` is
// what the button shows (else the label), `note` a count or code at the end of the row.
// `onPick(value)` runs when the fan chooses a different option.
export function picker(root, { name, label = '', ic = '', onPick }) {
  const id = `dd${++seq}`;
  root.classList.add('dd');
  root.innerHTML = `
    <button type="button" class="dd-btn" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}" aria-label="${esc(name)}">
      ${ic ? icon(ic) : ''}${label ? `<span class="dd-k" aria-hidden="true">${esc(label)}</span>` : ''}<span class="dd-v"></span><svg class="dd-chev" aria-hidden="true"><use href="#i-down"/></svg>
    </button>
    <div class="dd-pop"><div class="dd-list" role="listbox" id="${id}" aria-label="${esc(name)}"></div></div>`;
  const btn = root.querySelector('.dd-btn'), list = root.querySelector('.dd-list'), pop = root.querySelector('.dd-pop');
  let opts = [], value = '', active = -1, typed = '', typedAt = 0;

  const isOpen = () => root.classList.contains('is-open');
  const at = v => opts.findIndex(o => o.value === v);

  function move(i) {
    if (!opts.length) return;
    active = Math.max(0, Math.min(opts.length - 1, i));
    list.querySelectorAll('.dd-opt').forEach((el, k) => el.classList.toggle('is-active', k === active));
    btn.setAttribute('aria-activedescendant', `${id}-${active}`);
    list.querySelector(`#${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  function open(i = at(value)) {
    if (openPicker && openPicker !== api) openPicker.close();
    openPicker = api;
    // Open towards the left when the list would run off the right edge, and upwards when
    // there is no room for it below but there is above, within its own page: the header
    // is drawn over the pages.
    const r = root.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const ceiling = Math.max(0, root.closest('.view')?.getBoundingClientRect().top ?? 0);
    root.classList.toggle('dd-end', r.left + w > document.documentElement.clientWidth - 12);
    root.classList.toggle('dd-up', r.bottom + h + 20 > innerHeight && r.top - h - 20 > ceiling);
    root.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    move(i < 0 ? 0 : i);
  }

  function close() {
    if (openPicker === api) openPicker = null;
    root.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-activedescendant');
  }

  function pick(i) {
    const o = opts[i];
    close();
    if (!o || o.value === value) return;
    show(o.value);
    onPick(o.value);
  }

  // The value shown on the button, and the tick in the list.
  function show(v) {
    value = at(v) < 0 ? opts[0]?.value ?? '' : v;
    const o = opts[at(value)];
    root.querySelector('.dd-v').textContent = o ? o.short || o.label : '';
    list.querySelectorAll('.dd-opt').forEach((el, k) => el.setAttribute('aria-selected', String(opts[k] === o)));
  }

  // Letters typed within a second add up, so "sur" finds Surabaya.
  function typeahead(ch) {
    const now = Date.now();
    typed = now - typedAt > 1000 ? ch : typed + ch;
    typedAt = now;
    const q = typed.toLowerCase(), from = typed.length > 1 ? active : active + 1;
    const order = [...opts.keys()].map(k => (k + from) % opts.length);
    const hit = order.find(k => opts[k].label.toLowerCase().startsWith(q))
      ?? order.find(k => opts[k].label.toLowerCase().includes(q));
    if (hit != null) move(hit);
  }

  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  btn.addEventListener('keydown', e => {
    const k = e.key, letter = k.length === 1 && k !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!isOpen()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(k)) { e.preventDefault(); open(); }
      else if (k === 'Home' || k === 'End') { e.preventDefault(); open(k === 'Home' ? 0 : opts.length - 1); }
      else if (letter) { open(); typeahead(k); }
      return;
    }
    if (k === 'ArrowDown') move(active + 1);
    else if (k === 'ArrowUp') { if (e.altKey) pick(active); else move(active - 1); }
    else if (k === 'Home' || k === 'PageUp') move(k === 'Home' ? 0 : active - 8);
    else if (k === 'End' || k === 'PageDown') move(k === 'End' ? opts.length - 1 : active + 8);
    else if (k === 'Enter' || k === ' ') pick(active);
    else if (k === 'Escape') { e.stopPropagation(); close(); }
    else if (k === 'Tab') { close(); return; }
    else if (letter) typeahead(k);
    else return;
    e.preventDefault();
  });
  // The button keeps the focus while the mouse picks.
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('mousemove', e => { const el = e.target.closest('.dd-opt'); if (el && +el.dataset.i !== active) move(+el.dataset.i); });
  list.addEventListener('click', e => { const el = e.target.closest('.dd-opt'); if (el) pick(+el.dataset.i); });

  const api = {
    root,
    close,
    get value() { return value; },
    set(items, v) {
      opts = [];
      let g = 0;
      const opt = o => {
        const i = opts.push(o) - 1;
        return `<div class="dd-opt" role="option" id="${id}-${i}" data-i="${i}" aria-selected="false"><span class="dd-l">${esc(o.label)}</span>${o.note != null ? `<span class="dd-n">${esc(o.note)}</span>` : ''}<svg class="dd-tick" aria-hidden="true"><use href="#i-check"/></svg></div>`;
      };
      list.innerHTML = items.map(it => {
        if (!it.items) return opt(it);
        const gid = `${id}-g${g++}`;
        return `<div class="dd-group" role="group" aria-labelledby="${gid}"><div class="dd-gh" id="${gid}">${esc(it.group)}${it.tag ? `<b>${esc(it.tag)}</b>` : ''}</div>${it.items.map(opt).join('')}</div>`;
      }).join('');
      show(v);
      if (isOpen()) move(at(value));
    },
  };
  return api;
}
