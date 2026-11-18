// The venue's numbering, counted another way (js/seatflip.js). No browser needed.
//
//   node --test test/seatflip.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getVenue } from '../js/layouts.js';
import { placeSeat, cleanNumbering, isDefault, numberingOf, numberingSource } from '../js/seatflip.js';

const seat = (v, id) => v.seats[v.seatById.get(id)];
const at = (v, id, n) => placeSeat(v, seat(v, id), n).id;

test('the default numbering leaves every seat where it is', () => {
  const v = getVenue('madya-end'), s = seat(v, 'L04-C5');
  assert.equal(placeSeat(v, s, undefined), s);
  assert.equal(placeSeat(v, s, { seats: 'left', rows: 'front', letters: 'all' }), s);
  assert.ok(isDefault({}) && isDefault({ seats: 'odd' }) && !isDefault({ rows: 'back' }) && !isDefault({ letters: 'no-io' }) && !isDefault({ pick: 'L04-A1' }));
});

test('a pass keeps only what the numbering knows', () => {
  assert.deepEqual(cleanNumbering({ seats: 'right', rows: 'sideways', extra: 1 }), { seats: 'right', rows: 'front', letters: 'all' });
  assert.deepEqual(cleanNumbering({ seats: 'odd-left', letters: 'no-io', pick: 'L04-C5' }), { seats: 'odd-left', rows: 'front', letters: 'no-io', pick: 'L04-C5' });
  assert.equal(cleanNumbering({ pick: '<img src=x>' }).pick, undefined);
  assert.equal(cleanNumbering({ pick: 42 }).pick, undefined);
});

test('seat 1 on the right counts the number from the row’s other end', () => {
  const v = getVenue('madya-end');
  // A grandstand block has 22 seats a row: seat 5 from the right is seat 18 from the left.
  assert.equal(at(v, 'L04-C5', { seats: 'right' }), 'L04-C18');
  assert.equal(at(v, 'R10-A1', { seats: 'right' }), 'R10-A22');
  // Turning it round twice is where it started.
  const once = placeSeat(v, seat(v, 'L04-C5'), { seats: 'right' });
  assert.equal(placeSeat(v, once, { seats: 'right' }).id, 'L04-C5');
});

test('odd and even from the middle: 1 and 2 meet in the middle, the ends are the highest', () => {
  const v = getVenue('madya-end');
  // 22 seats: the odd numbers take the left 11 (1 next to the middle), the even the right 11.
  assert.equal(at(v, 'L04-C1', { seats: 'odd-left' }), 'L04-C11');
  assert.equal(at(v, 'L04-C2', { seats: 'odd-left' }), 'L04-C12');
  assert.equal(at(v, 'L04-C3', { seats: 'odd-left' }), 'L04-C10');
  assert.equal(at(v, 'L04-C21', { seats: 'odd-left' }), 'L04-C1');
  assert.equal(at(v, 'L04-C22', { seats: 'odd-left' }), 'L04-C22');
  // The mirror: odd to the right.
  assert.equal(at(v, 'L04-C1', { seats: 'odd-right' }), 'L04-C12');
  assert.equal(at(v, 'L04-C2', { seats: 'odd-right' }), 'L04-C11');
  assert.equal(at(v, 'L04-C21', { seats: 'odd-right' }), 'L04-C22');
  // Every number lands on its own seat.
  for (const seats of ['odd-left', 'odd-right']) {
    const ids = new Set(Array.from({ length: 22 }, (_, i) => at(v, `L04-C${i + 1}`, { seats })));
    assert.equal(ids.size, 22, seats);
  }
});

test('row A at the back counts the row from the block’s last row', () => {
  const v = getVenue('madya-end');
  // 18 rows, A to R: row C from the back is row P from the front.
  assert.equal(at(v, 'L04-C5', { rows: 'back' }), 'L04-P5');
  assert.equal(at(v, 'L04-C5', { rows: 'back', seats: 'right' }), 'L04-P18');
});

test('rows that skip I and O: from J on, the ticket’s row is one nearer the front, from P two', () => {
  const v = getVenue('madya-end');
  assert.equal(at(v, 'L04-H5', { letters: 'no-io' }), 'L04-H5');
  assert.equal(at(v, 'L04-J5', { letters: 'no-io' }), 'L04-I5');   // the 9th row, which we letter I
  assert.equal(at(v, 'L04-N5', { letters: 'no-io' }), 'L04-M5');
  assert.equal(at(v, 'L04-P5', { letters: 'no-io' }), 'L04-N5');
  assert.equal(at(v, 'L04-R5', { letters: 'no-io' }), 'L04-P5');
  // With row A at the back as well: J is the 9th row from the back.
  assert.equal(at(v, 'L04-J5', { letters: 'no-io', rows: 'back' }), 'L04-J5');
});

test('in a bowl, rows of different lengths keep the ticket’s number where they can', () => {
  const v = getVenue('jis-mcr'), s = seat(v, '110-A3');
  const back = placeSeat(v, s, { rows: 'back' });
  assert.equal(back.sec, '110');
  assert.equal(back.ri, Math.max(...v.seats.filter(x => x.sec === '110').map(x => x.ri)));
  assert.equal(back.num, 3);
  // From the right, in the longer back row, it is that row's third seat from the end.
  const last = Math.max(...v.seats.filter(x => x.sec === '110' && x.ri === back.ri).map(x => x.num));
  assert.equal(placeSeat(v, s, { rows: 'back', seats: 'right' }).num, last - 2);
});

test('a seat the fan pointed at wins, but only inside the ticket’s block', () => {
  const v = getVenue('madya-end');
  assert.equal(at(v, 'L04-C5', { pick: 'L04-K9' }), 'L04-K9');
  assert.equal(at(v, 'L04-C5', { seats: 'right', pick: 'L04-K9' }), 'L04-K9');
  // Another block, a standing spot or a seat that is not there: the rule applies instead.
  assert.equal(at(v, 'L04-C5', { pick: 'L05-K9' }), 'L04-C5');
  assert.equal(at(v, 'L04-C5', { seats: 'right', pick: 'L05-K9' }), 'L04-C18');
  assert.equal(at(v, 'L04-C5', { pick: 'L04-Z99' }), 'L04-C5');
  const spot = v.seats.find(x => x.standing);
  assert.equal(at(v, 'L04-C5', { pick: spot.id }), 'L04-C5');
});

test('the event’s confirmed numbering is every pass’s, until the fan sets their own', () => {
  const v = getVenue('madya-end'), meta = { ...v.meta, numbering: { seats: 'right', pick: 'L04-A1' } }, ev = { ...v, meta };
  assert.deepEqual(numberingOf(ev, {}), { seats: 'right', rows: 'front', letters: 'all' });   // never the event's pick
  assert.equal(numberingSource(ev, {}), 'event');
  assert.deepEqual(numberingOf(ev, { numbering: { rows: 'back' } }), { seats: 'left', rows: 'back', letters: 'all' });
  assert.equal(numberingSource(ev, { numbering: { rows: 'back' } }), 'fan');
  assert.equal(numberingSource(ev, { numbering: { pick: 'L04-A1' } }), 'pick');
  assert.equal(numberingSource(v, {}), 'none');
});

test('standing spots have no row or number to turn round', () => {
  const v = getVenue('jis-mcr'), s = v.seats.find(x => x.standing);
  assert.equal(placeSeat(v, s, { seats: 'right', rows: 'back', letters: 'no-io' }), s);
});
