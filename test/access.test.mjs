import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEvent, DEMOS, PLACES, EVENTS } from '../js/events.js';
import { ACCESS, accessOf, wayIn } from '../js/access.js';

const demo = getEvent(DEMOS[0].id);
const seat = (v, id) => v.seats[v.seatById.get(id)];

test('every concert venue has travel notes, keyed by its real name', () => {
  for (const name of Object.keys(ACCESS)) assert.ok(PLACES.some(p => p.name === name), name);
  for (const e of EVENTS) if (!e.demo && e.place.name !== 'Cinema XXI') assert.ok(accessOf(getEvent(e.id)), e.place.name);
});

test('the way in runs from outside the venue to the seat', () => {
  for (const id of ['T108-F1', 'T206-D7', 'VIP-L-C17']) {
    const s = seat(demo, id), w = wayIn(demo, s);
    const last = w.points.at(-1);
    assert.deepEqual([last[0], last[2]], [s.x, s.z]);
    assert.equal(w.points[0][1], 0.3);
    assert.ok(w.metres > 0 && w.minutes >= 2);
  }
});

test('the floor is entered from behind, away from the stage', () => {
  const s = seat(demo, 'VIP-L-C17'), [, , fz] = demo.focus, start = wayIn(demo, s).points[0];
  assert.ok(Math.abs(start[2] - fz) > Math.abs(s.z - fz));
});

test('a seat further up takes longer than one lower in the same block', () => {
  const lower = demo.seats.find(s => s.sec === 'T206' && s.row === 'A'), upper = demo.seats.filter(s => s.sec === 'T206').at(-1);
  assert.ok(wayIn(demo, upper).metres >= wayIn(demo, lower).metres - 1);
});
