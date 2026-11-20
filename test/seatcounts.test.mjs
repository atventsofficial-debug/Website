// js/seatcounts.js must match the layouts, and venueInfo must match getVenue but for the seats.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VENUE_KEYS, getVenue, venueInfo } from '../js/layouts.js';
import { seatCountsSource } from '../scripts/seat-counts.mjs';

// Taken before any getVenue call: once a venue is built, venueInfo hands back the full one.
const infos = Object.fromEntries(VENUE_KEYS.map(k => [k, venueInfo(k)]));
const plain = o => JSON.parse(JSON.stringify(o));

test('venueInfo has everything getVenue has, without the seats', () => {
  for (const k of VENUE_KEYS) {
    assert.ok(!('seats' in infos[k]) && !('seatById' in infos[k]), k);
    const { seats, seatById, ...full } = getVenue(k);
    assert.ok(seats.length > 0, k);
    assert.deepEqual(plain(infos[k]), plain(full), k);
  }
});

test('js/seatcounts.js is up to date (node scripts/seat-counts.mjs)', () => {
  assert.equal(fs.readFileSync(new URL('../js/seatcounts.js', import.meta.url), 'utf8'), seatCountsSource());
});
