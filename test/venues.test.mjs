// Venue layouts and the events that use them. No database needed.
//
//   node --test test/venues.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getVenue, heroSeat, VENUE_KEYS } from '../js/layouts.js';
import { getEvent, EVENTS, DEMOS, isConcert, demoFor } from '../js/events.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${a + i}`);

test('every layout has unique seat ids and only its own categories', () => {
  for (const key of VENUE_KEYS) {
    const v = getVenue(key);
    assert.ok(v.seats.length > 0, key);
    assert.equal(v.seatById.size, v.seats.length, `${key}: two seats share an id`);
    for (const s of v.seats) assert.ok(v.catById[s.cat], `${key}: ${s.id} is in unknown category ${s.cat}`);
  }
});

test('every event’s seats fall in one of its categories', () => {
  for (const e of EVENTS) {
    const v = getEvent(e.id);
    for (const s of v.seats) assert.ok(v.catById[s.cat], `${e.id}: ${s.id} is in unknown category ${s.cat}`);
  }
});

test('Tottenham Hotspur Stadium has the plan’s blocks, tiers and colours', () => {
  const v = getVenue('stadium-tottenham');
  const blocks = new Map();
  for (const s of v.seats) {
    const b = blocks.get(s.sec) || { n: 0, cats: new Set(), tiers: new Set() };
    b.n++; b.cats.add(s.cat); b.tiers.add(s.tier);
    blocks.set(s.sec, b);
  }
  const want = [...range(101, 124), ...range(248, 260), ...range(301, 321), ...range(416, 424), ...range(501, 530)];
  assert.deepEqual([...blocks.keys()].sort(), want.sort());
  for (const [code, b] of blocks) {
    assert.equal(b.cats.size, 1, `block ${code} is one colour`);
    assert.equal(b.tiers.size, 1, `block ${code} is on one tier`);
    assert.ok(b.n >= 100, `block ${code} has ${b.n} seats`);
  }
  const cat = code => [...blocks.get(`${code}`).cats][0];
  const tier = code => [...blocks.get(`${code}`).tiers][0];
  assert.deepEqual(['120', '121'].map(cat), ['centre', 'centre']);
  assert.deepEqual(['312', '313', '314', '315'].map(cat), ['corner', 'corner', 'middle', 'middle']);
  for (const b of range(509, 521)) assert.equal(cat(b), 'north', b);
  for (const b of [...range(501, 508), ...range(522, 530)]) assert.equal(cat(b), 'upper', b);
  for (const b of ['101', '119', '122', '248', '260', '301', '316', '416']) assert.equal(cat(b), 'other', b);
  // The South Stand is one tall tier; the other three stands have three.
  assert.deepEqual([tier(248), tier(110), tier(416), tier(515)], [1, 1, 2, 3]);
  assert.ok(v.seats.length > 20000 && v.seats.length < 26000, `${v.seats.length} seats`);
});

test('concerts link to their seller and price every category; demos cover every layout', () => {
  for (const e of EVENTS) {
    assert.ok(isConcert(e.id), e.id);
    // tiket.com, or for a show tiket.com does not sell, the seller that does.
    if (e.official.name === 'tiket.com') assert.match(e.official.url, /^https:\/\/www\.tiket\.com\//, e.id);
    else assert.match(e.official.url, /^https:\/\/(www\.loket\.com|tiptip\.id|www\.traveloka\.com)\//, e.id);
    if (e.sale?.opens) assert.ok(!Number.isNaN(Date.parse(e.sale.opens.length === 7 ? `${e.sale.opens}-01` : e.sale.opens)), `${e.id}: sale date`);
    const v = getEvent(e.id);
    // Shows on a stand-in layout have no per-category prices yet; the rest price every category.
    if (e.standIn) assert.ok(v.categories.every(c => c.price == null) && (e.from == null || e.from > 0), `${e.id}: stand-in prices`);
    else assert.ok(v.categories.every(c => c.price > 0), `${e.id}: every category has its announced price`);
    for (const c of e.soldOut || []) assert.ok(v.catById[c], `${e.id}: sold-out category ${c} exists`);
  }
  assert.deepEqual(DEMOS.map(d => d.venue).sort(), [...VENUE_KEYS].sort());
  for (const d of DEMOS) {
    assert.equal(d.id, `demo-${d.venue}`);
    assert.equal(isConcert(d.id), false, `${d.id} is open to all, never claimed`);
    assert.equal(demoFor(d.venue), d);
  }
});

test('seat counts in the demo copy match the models', () => {
  const seats = key => getVenue(key).seats.length.toLocaleString('en-US');
  assert.equal(demoFor('concert').place.capacity, `${seats('concert')} seats`);
  assert.equal(demoFor('combat').place.capacity, `${seats('combat')} seats`);
  assert.equal(demoFor('cinema').place.capacity, `${seats('cinema')} seats per studio`);
});

test('the home page hero sits on each concert’s centre line, as far from the stage as asked', () => {
  for (const e of EVENTS) {
    const v = getEvent(e.id), s = heroSeat(v);
    const [fx, , fz] = v.focus;
    // The halls are symmetric about the line through the stage: x = 0, or z = 0 when the
    // stage is at a goal end.
    assert.ok(Math.abs(v.show === 'end' ? s.z : s.x) < 2.5, `${e.id}: ${s.id} is off the centre line`);
    assert.ok(Math.abs(Math.hypot(s.x - fx, s.z - fz) - v.hero.along) < 3, `${e.id}: ${s.id} is not ${v.hero.along} m from the stage`);
  }
});
