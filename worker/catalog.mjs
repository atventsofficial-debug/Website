// The concerts and seats the Worker sells passes for, from worker/catalog.json (written by
// the build, see scripts/worker-catalog.mjs). Looking a seat up here gives the same answer
// as checkClaim in js/rules.js, without building the venue.
import catalog from './catalog.json' with { type: 'json' };

const DAY = 864e5;
const own = (o, k) => Object.hasOwn(o, k);

export const concert = id => (typeof id === 'string' && own(catalog.events, id) ? catalog.events[id] : null);
// A concert sells passes until the day after the show, as long as it is on the site's lists.
export const onSale = (e, now = Date.now()) => e.start + DAY > now;

// The seat, as the pass and the payment page name it, or null when the concert has no such
// seat in that category.
export function seatOf(e, cat, id) {
  const m = /^(.{1,24})-([A-Z]{1,3})(\d{1,4})$/.exec(String(id ?? ''));
  if (!m) return null;
  const map = catalog.maps[e.map], [, sec, row, n] = m, num = Number(n);
  const s = own(map, sec) ? map[sec] : null, r = s && own(s.rows, row) ? s.rows[row] : null;
  if (!r || r[0] !== cat || num < r[1] || num > r[2]) return null;
  return { id, secName: s.name, row, num, standing: !!s.standing };
}
