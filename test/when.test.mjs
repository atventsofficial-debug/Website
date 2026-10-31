// Time zones. No database needed.
//
//   node --test test/when.test.mjs
//
// The fan's own zone is set to London before the modules load; everything else passes its
// zone explicitly. Shows here are made up, so the tests outlive the catalogue.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/London';
const { EVENTS, eventMeta } = await import('../js/events.js');
const { whenOf, venueWhen, startOf, atVenue, gapText, zoneName, instant, VIEWER_TZ } = await import('../js/when.js');
const { formatRpShort } = await import('../js/layouts.js');

const JKT = 'Asia/Jakarta';
const show = (city, dateISO, more = {}) => ({ id: `t-${city}-${dateISO}`, place: { name: 'Test hall', city }, dateISO, time: dateISO.slice(11), ...more });
const london = show('London', '2026-11-20T19:30');
const jakarta = show('Jakarta', '2026-11-21T19:30');

test('a show abroad reads on the fan’s clock, with the venue’s beside it', () => {
  const w = whenOf(london, JKT);
  assert.equal(w.date, 'Sat, 21 Nov 2026');
  assert.equal(w.time, '02:30 WIB');
  assert.equal(w.local, '19:30 Friday in London');
  assert.deepEqual(w.block, { day: 21, mon: 'NOV', dow: 'SAT' });
  const there = whenOf(london, 'Europe/London');
  assert.equal(there.date, 'Fri, 20 Nov 2026');
  assert.equal(there.time, '19:30 GMT');
  assert.equal(there.local, '');
  assert.equal(gapText(london, JKT), 'London is 7 hours behind you');
  assert.equal(gapText(london, 'Europe/London'), '');
});

test('a fan in Singapore sees a Jakarta show an hour later, on the same day', () => {
  const w = whenOf(jakarta, 'Asia/Singapore');
  assert.equal(w.time, '20:30 SGT');
  assert.equal(w.local, '19:30 in Jakarta');
  assert.equal(gapText(jakarta, 'Asia/Singapore'), 'Jakarta is 1 hour behind you');
});

test('daylight saving: London changes its clocks between two shows', () => {
  // British summer time ends on 25 October 2026.
  const summer = show('London', '2026-10-24T19:30');
  assert.equal(whenOf(summer, JKT).time, '01:30 WIB');
  assert.equal(gapText(summer, JKT), 'London is 6 hours behind you');
  assert.equal(zoneName(startOf(summer), 'Europe/London'), 'BST');
  assert.equal(zoneName(startOf(london), 'Europe/London'), 'GMT');
  assert.equal(new Date(instant('2026-10-31T15:00', 'Europe/London')).toISOString(), '2026-10-31T15:00:00.000Z');
  assert.equal(new Date(instant('2026-10-24T15:00', 'Europe/London')).toISOString(), '2026-10-24T14:00:00.000Z');
});

test('a show without announced times keeps the venue’s date and no time', () => {
  const bocelli = eventMeta('evt-bocelli-jakarta');
  for (const tz of [JKT, 'America/Los_Angeles', 'Pacific/Auckland']) {
    const w = whenOf(bocelli, tz);
    assert.equal(w.known, false);
    assert.equal(w.date, 'Tue, 3 Nov 2026');
    assert.equal(w.time, '');
  }
  for (const e of EVENTS) assert.match(whenOf(e, 'Pacific/Auckland').date, new RegExp(`^\\w{3}, ${+e.dateISO.slice(8, 10)} `), e.id);
});

test('tickets print the venue’s clock wherever the fan is', () => {
  const garuda = show('Jakarta', '2026-11-21T18:00');
  assert.equal(venueWhen(garuda).date, 'Sat, 21 Nov 2026');
  assert.equal(venueWhen(garuda).time, '18:00 WIB');
  assert.equal(venueWhen(london).time, '19:30 GMT');
  assert.equal(whenOf(garuda, 'Europe/London').time, '11:00 GMT');
});

test('a time well before the start belongs to the night after midnight', () => {
  const late = show('Jakarta', '2026-11-20T23:00', { ends: '01:10' });
  assert.equal(new Date(atVenue(late, '01:10')).toISOString(), '2026-11-20T18:10:00.000Z');
  assert.equal(new Date(atVenue(late, '22:30')).toISOString(), '2026-11-20T15:30:00.000Z');
});

test('the fan’s zone comes from the browser', () => {
  assert.equal(VIEWER_TZ, 'Europe/London');
  assert.equal(whenOf(london).time, '19:30 GMT');
});

test('short rupiah prices', () => {
  assert.equal(formatRpShort(10e6), 'Rp 10M');
  assert.equal(formatRpShort(13950000), 'Rp 13.95M');
  assert.equal(formatRpShort(1059000), 'Rp 1.06M');
});
