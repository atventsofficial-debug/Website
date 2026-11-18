// The concerts as the payment Worker needs them: title, start, the date, venue and poster as
// the pass email shows them, categories, and every seat, packed small. Building a venue's
// seats takes the page about 100 ms, too long for a Worker request, so the build does it once
// (scripts/build-site.mjs writes worker/catalog.json) and the Worker only looks seats up.
//
// A seat id is `<section>-<row><number>` (FWA-A1, FES-R-AV34). Each row is one category and
// numbers its seats from its first to its last without gaps, so a row packs to
// [category, first, last]. The build stops if any seat does not fit that, rather than ship
// a catalog that refuses real seats. Concerts on the same layout share one seat map.
import fs from 'node:fs';
import path from 'node:path';
import { EVENTS, isConcert, getEvent, placeOf } from '../js/events.js';
import { startOf, whenOf } from '../js/when.js';
import { IMAGES } from '../js/media.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

// The concert's poster for the pass email: the JPEG copy of its picture (scripts/mail-art.py),
// with the picture's alt text and credit. None when the copy has not been drawn.
function posterOf(e) {
  const img = e.image && Object.hasOwn(IMAGES, e.image) ? IMAGES[e.image] : null;
  if (!img) return null;
  const src = `assets/mail/${path.basename(img.src, path.extname(img.src))}.jpg`;
  return fs.existsSync(path.join(ROOT, src)) ? { src, alt: img.alt, credit: img.credit } : null;
}

export function workerCatalog() {
  const maps = [], mapIndex = new Map(), events = {};
  for (const e of EVENTS) {
    if (!isConcert(e.id)) continue;
    const venue = getEvent(e.id), secs = {};
    for (const s of venue.seats) {
      const m = /^(.+)-([A-Z]+)(\d+)$/.exec(s.id);
      if (!m || m[1] !== s.sec || m[2] !== s.row || Number(m[3]) !== s.num) throw new Error(`${e.id}: seat id ${s.id} is not <section>-<row><number>`);
      const sec = (secs[s.sec] ||= { name: s.secName, ...(s.standing ? { standing: true } : {}), rows: {} });
      const r = (sec.rows[s.row] ||= { cat: s.cat, first: s.num, last: s.num, n: 0 });
      if (r.cat !== s.cat) throw new Error(`${e.id}: row ${s.sec} ${s.row} has two categories`);
      r.first = Math.min(r.first, s.num);
      r.last = Math.max(r.last, s.num);
      r.n++;
    }
    for (const [sec, v] of Object.entries(secs)) {
      for (const [row, r] of Object.entries(v.rows)) {
        if (r.n !== r.last - r.first + 1) throw new Error(`${e.id}: row ${sec} ${row} has gaps in its numbers`);
        v.rows[row] = [r.cat, r.first, r.last];
      }
    }
    const key = JSON.stringify(secs);
    if (!mapIndex.has(key)) { mapIndex.set(key, maps.length); maps.push(secs); }
    const w = whenOf(e), p = placeOf(e);
    events[e.id] = {
      title: e.title, start: startOf(e),
      when: w.time ? `${w.date}, ${w.time}` : w.date,
      venue: [p.name, p.city].filter(Boolean).join(', '),
      cats: Object.fromEntries(venue.categories.map(c => [c.id, c.name])),
      map: mapIndex.get(key),
    };
    const poster = posterOf(e);
    if (poster) events[e.id].poster = poster;
  }
  return { events, maps };
}

export function writeWorkerCatalog(root) {
  fs.writeFileSync(path.join(root, 'worker', 'catalog.json'), `${JSON.stringify(workerCatalog())}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeWorkerCatalog(ROOT);
  console.log('worker/catalog.json ready');
}
