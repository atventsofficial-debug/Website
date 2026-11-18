// Venue layouts and the events that use them. No database needed.
//
//   node --test test/venues.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getVenue, heroSeat, VENUE_KEYS, REAL_KEYS } from '../js/layouts.js';
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
  // A demo for every generic layout; the real venues are only seen with their show.
  assert.deepEqual(DEMOS.map(d => d.venue).sort(), VENUE_KEYS.filter(k => !REAL_KEYS.includes(k)).sort());
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

test('Stadion Madya for Guns N’ Roses has the promoter’s plan', () => {
  const v = getVenue('madya-end');
  const mean = (f, key) => { const l = v.seats.filter(f); return l.reduce((a, s) => a + s[key], 0) / l.length; };
  // Grandstands: VIP by the stage, then Tribune A, then Tribune B; Left is +z, as the
  // audience faces the stage at -x.
  for (const side of ['L', 'R']) {
    assert.ok(v.seats.filter(s => s.sec === `${side}01`).every(s => s.cat === 'vip'), side);
    assert.ok(v.seats.filter(s => s.sec === `${side}02` || s.sec === `${side}03`).every(s => s.cat === 'triba'), side);
    assert.ok(v.seats.filter(s => /^[LR](0[4-9]|10)$/.test(s.sec) && s.sec[0] === side).every(s => s.cat === 'tribb'), side);
  }
  assert.ok(mean(s => s.sec.startsWith('L'), 'z') > 40 && mean(s => s.sec.startsWith('R') && !s.standing, 'z') < -40);
  // The floor, front to back: Festival A, B, C.
  const xa = mean(s => s.cat === 'fesa', 'x'), xb = mean(s => s.cat === 'fesb', 'x'), xc = mean(s => s.cat === 'fesc', 'x');
  assert.ok(v.stageX < xa && xa < xb && xb < xc, `${xa} ${xb} ${xc}`);
  // Nobody stands on the sound desk.
  const [fx] = v.foh;
  assert.ok(!v.seats.some(s => s.standing && Math.abs(s.z) < 3.5 && Math.abs(s.x - fx) < 2.5));
});

test('Jakarta International Stadium for My Chemical Romance has the promoter’s plan', () => {
  const v = getVenue('jis-mcr');
  const block = n => v.seats.filter(s => s.sec === `${n}`);
  const mean = (l, key) => l.reduce((a, s) => a + s[key], 0) / l.length;
  // Each tier is one CAT, split Center (across the far end) and Left & Right (the sides).
  for (const s of v.seats.filter(x => !x.standing)) {
    assert.equal(s.cat.slice(0, 4), `cat${s.tier}`, s.id);
    const far = s.x > 45 && Math.abs(s.z) < 60;
    if (s.cat.endsWith('c')) assert.ok(far, `${s.id} is Center but not across the far end`);
  }
  // Blocks number from the left side's stage end: 101 left (+z) by the stage, the last one right.
  assert.ok(mean(block(101), 'z') > 30 && mean(block(101), 'x') < -20);
  assert.ok(mean(block(118), 'z') < -30 && mean(block(118), 'x') < -20);
  // Behind the stage the stands are closed: no seat beyond the stage's back.
  assert.ok(v.seats.every(s => s.x > v.stageX - 16), 'a seat behind the stage');
  // The VVIP pen in front of the stage; Festival round it and back past the sound desk,
  // never inside the pen or on the desk.
  const { pen } = v, [fx] = v.foh;
  const inPen = s => Math.abs(s.z) < pen.halfW && Math.abs(s.x - pen.x) < pen.halfD;
  assert.ok(v.seats.filter(s => s.cat === 'vvip').every(inPen));
  assert.ok(!v.seats.some(s => s.cat === 'festival' && inPen(s)));
  assert.ok(!v.seats.some(s => s.standing && Math.abs(s.z) < 3.5 && Math.abs(s.x - fx) < 2.5));
  assert.ok(mean(v.seats.filter(s => s.cat === 'festival'), 'x') > pen.x);
});

test('every show has its own look, and no two shows in one hall share a seat colour', async () => {
  const { THEMES } = await import('../js/themes.js');
  const byHall = new Map();
  for (const e of EVENTS) {
    assert.ok(THEMES[e.theme], `${e.id} has no theme`);
    const v = getEvent(e.id), key = JSON.stringify(v.seatColor);
    assert.ok(v.seatColor, `${e.id} has no seat colour`);
    // Halls whose seats we know keep them for every show; the rest take the show's colour.
    if (!e.place.seatColor) {
      const seen = byHall.get(e.place.name) || new Map();
      const other = seen.get(key);
      assert.ok(!other || THEMES[other] === THEMES[e.theme], `${e.id} shares its seats' colour with ${other}`);
      seen.set(key, e.theme);
      byHall.set(e.place.name, seen);
    }
  }
});
