// How the venue numbers its seats on the night. Promoters publish blocks, not seat numbers,
// so our rows and numbers inside a block are an estimate: row A at the front, every letter
// used, seat 1 at the block's left end as its rows face the stage or the field
// (js/realvenues.js). A venue may count another way. The event can say how, once the
// promoter or the venue confirms it (`numbering` in events.js), and a fan who finds out can
// set it on the pass. The 3D view then puts them in the seat their ticket means: the same
// row letter and number, counted the venue's way. Where no rule fits, the fan points at the
// seat themselves, inside the ticket's block. Pure data, no browser.
//
//   seats    left       seat 1 at the left end, counting right
//            right      seat 1 at the right end, counting left
//            odd-left   from the middle out: odd numbers to the left, even to the right
//            odd-right  from the middle out: odd numbers to the right, even to the left
//   rows     front | back     where row A is
//   letters  all | no-io      'no-io': the rows skip I and O (… H, J, K … N, P …)
//   pick     a seat id in the ticket's block, set by the fan; it wins over the rest

const SEATS = ['left', 'right', 'odd-left', 'odd-right'];
const SEAT_ID = /^[A-Za-z0-9-]{1,40}$/;

// Only what this module knows is kept, so a pass never carries anything else under this key.
export function cleanNumbering(n) {
  const seats = SEATS.includes(n?.seats) ? n.seats : 'left';
  const rows = n?.rows === 'back' ? 'back' : 'front';
  const letters = n?.letters === 'no-io' ? 'no-io' : 'all';
  const pick = typeof n?.pick === 'string' && SEAT_ID.test(n.pick) ? n.pick : '';
  return pick ? { seats, rows, letters, pick } : { seats, rows, letters };
}
export const isDefault = n => {
  const c = cleanNumbering(n);
  return c.seats === 'left' && c.rows === 'front' && c.letters === 'all' && !c.pick;
};

// The numbering a pass's tour uses: the fan's own, else the event's (never the event's pick,
// which only a fan can make).
export function numberingOf(venue, pass) {
  if (pass?.numbering) return cleanNumbering(pass.numbering);
  const { pick, ...rule } = cleanNumbering(venue?.meta?.numbering);
  return rule;
}
// Where that numbering came from, for the words beside the buttons.
export const numberingSource = (venue, pass) =>
  cleanNumbering(pass?.numbering).pick ? 'pick' : pass?.numbering ? 'fan' : venue?.meta?.numbering ? 'event' : 'none';

// A section's rows: row index -> its seats in number order. Built once per venue object.
const sections = new WeakMap();
function rowsOf(venue, sec) {
  let bySec = sections.get(venue);
  if (!bySec) {
    bySec = new Map();
    for (const s of venue.seats) {
      if (s.standing) continue;
      let rows = bySec.get(s.sec);
      if (!rows) bySec.set(s.sec, rows = new Map());
      if (!rows.has(s.ri)) rows.set(s.ri, []);
      rows.get(s.ri).push(s);
    }
    for (const rows of bySec.values()) for (const list of rows.values()) list.sort((a, b) => a.num - b.num);
    sections.set(venue, bySec);
  }
  return bySec.get(sec);
}

const clamp = (x, hi) => Math.min(hi, Math.max(0, x));

// How far from the front a row letter is: the k-th letter of the alphabet is the k-th row,
// or, where the venue skips I and O, one row less after H and two less after N.
const rowPlace = (k, letters) => (letters === 'no-io' ? k - (k > 8 ? 1 : 0) - (k > 14 ? 1 : 0) : k);

// Where along a row of `len` seats (0 = its left end) the venue puts seat number `num`.
function seatPlace(num, len, seats) {
  if (seats === 'right') return len - 1 - (num - 1);
  if (seats === 'left') return num - 1;
  // From the middle out: the odd numbers take the larger half, 1 next to the middle.
  const half = Math.ceil(len / 2);
  const fromLeft = num % 2 ? half - 1 - (num - 1) / 2 : half + num / 2 - 1;
  return seats === 'odd-left' ? fromLeft : len - 1 - fromLeft;
}

// The seat in the model that the ticket's `seat` is when the venue numbers the `numbering`
// way. Rows of a block run A, B, C … from the front in the model (k-th row, k-th letter);
// numbers run 1 … n from the left. A row shorter than the place reached takes its end seat.
// Standing spots have no row or number and stay as they are.
export function placeSeat(venue, seat, numbering) {
  if (!seat || seat.standing || isDefault(numbering)) return seat;
  const n = cleanNumbering(numbering), rows = rowsOf(venue, seat.sec);
  if (n.pick) {
    const i = venue.seatById.get(n.pick), s = i === undefined ? null : venue.seats[i];
    if (s && s.sec === seat.sec && !s.standing) return s;
  }
  if (!rows?.has(seat.ri)) return seat;
  const order = [...rows.keys()].sort((a, b) => a - b), last = order.length - 1;
  const fromFront = clamp(rowPlace(order.indexOf(seat.ri), n.letters), last);
  const row = rows.get(order[n.rows === 'back' ? last - fromFront : fromFront]);
  const num = seat.num - rows.get(seat.ri)[0].num + 1;   // the ticket's number, from 1
  return row[clamp(seatPlace(num, row.length, n.seats), row.length - 1)];
}
