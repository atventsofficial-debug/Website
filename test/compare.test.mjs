import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEvent, DEMOS } from '../js/events.js';
import { compareSeats, seatStats, viewScore, pairOf, pairText } from '../js/compare.js';

const venue = getEvent(DEMOS[0].id);
const seat = id => venue.seats[venue.seatById.get(id)];

test('a seat near the stage scores higher than one at the back', () => {
  const near = seatStats(venue, seat('VIP-L-C17')), far = seatStats(venue, seat('T206-D7'));
  assert.ok(near.dist < far.dist);
  assert.ok(viewScore(near) > viewScore(far));
  for (const st of [near, far]) assert.ok(viewScore(st) >= 0 && viewScore(st) <= 100);
});

test('the verdict names the better view and what each seat wins on', () => {
  const r = compareSeats(venue, seat('VIP-L-C17'), seat('T206-D7'));
  assert.equal(r.best, 0);
  assert.equal(r.value, 1);
  assert.match(r.wins[0].join(), /closer to the stage/);
  assert.match(r.wins[1].join(), /cheaper/);
});

test('the same seat twice is a close call with nothing won', () => {
  const r = compareSeats(venue, seat('T206-D7'), seat('T206-D7'));
  assert.equal(r.best, -1);
  assert.deepEqual(r.wins, [[], []]);
});

test('a pair travels in a link as seat~seat', () => {
  assert.deepEqual(pairOf('A-1~B-2'), ['A-1', 'B-2']);
  assert.deepEqual(pairOf('A-1'), ['A-1']);
  assert.deepEqual(pairOf('A-1~B-2~C-3'), ['A-1', 'B-2']);
  assert.deepEqual(pairOf(undefined), []);
  assert.equal(pairText(['A-1', 'B-2']), 'A-1~B-2');
});

test('no seat id holds the ~ a pair is joined with', () => {
  for (const d of DEMOS) assert.ok(!getEvent(d.id).seats.some(s => s.id.includes('~')));
});
