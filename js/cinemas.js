// Cinema XXI studios, seat for seat from XXI's own seat map (m.21cineplex.com, the
// "Pilih kursi kamu" page of a showing, read 21 November 2026). Pure data like layouts.js.
//
// The seat map is a grid: XXI draws the screen at the top, one row per line and one seat
// per cell, with empty cells for the aisles. Each row below is [letter, line, cells], line
// counted from the screen (a skipped line is a cross aisle) and cells as [first, last]
// column ranges, column 0 on the audience's left. `num(col)` gives XXI's seat number for a
// column: numbers run from the right-hand wall, with the same jumps as on the map. Where a
// row's numbers jump (a gap on the map), the cells after the jump take their own section
// code as a third element, so every section's row still numbers without gaps (the
// payment Worker's catalogue packs a row as first to last).
//
// Metres: the screen is at z = SCREEN_Z facing +z, the audience faces -z (-x is the
// audience's left), the front row `front` metres from the screen.

const SCREEN_Z = -15.6;

function studio({ key, label, venueName, sec, secName, cat, catName, price, color, rows, num,
  seatW = 0.56, rowD = 1.05, rise = 0.36, flat = 2, front = 6.5, screenW, screenH, occupancy = 0.5 }) {
  const seats = [];
  const cols = Math.max(...rows.flatMap(r => r[2].map(c => c[1]))) + 1;
  const mid = (cols - 1) / 2;
  const z0 = SCREEN_Z + front;
  const lineY = line => Math.max(0, line - flat) * rise;
  for (const [row, line, cells] of rows) {
    const z = z0 + line * rowD, y = lineY(line);
    for (const [a, b, part = sec] of cells) {
      for (let c = a; c <= b; c++) {
        const n = num(c);
        seats.push({
          id: `${part}-${row}${n}`, sec: part, ...(part !== sec ? { tag: sec } : {}), secName, cat, row, ri: line, num: n,
          x: +((c - mid) * seatW).toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3),
          yaw: 0, tier: 0, rowDepth: rowD, width: seatW,
        });
      }
    }
  }
  // The room around the seats: walls a metre and a bit outside the outer seats, the back
  // wall behind the last row; the screen fills most of the front wall.
  const lines = rows.map(r => r[1]);
  const lastLine = Math.max(...lines);
  const W = +(cols * seatW + 2.6).toFixed(2);
  const back = z0 + lastLine * rowD + 1.6;
  const top = lineY(lastLine);
  const H = +Math.max(8, top + 4.6).toFixed(2);
  const D = +(back - (SCREEN_Z - 0.3)).toFixed(2);
  // Treads under every line from the first raised one, the cross aisles included, wall to
  // wall; and a step light at each aisle cell of each row.
  const risers = [];
  for (let l = flat + 1; l <= lastLine; l++) {
    const have = lines.filter(x => x <= l);
    risers.push([+(z0 + l * rowD).toFixed(3), +lineY(Math.max(...have)).toFixed(3)]);
  }
  const steps = [];
  for (const [, line, cells] of rows) {
    const used = new Set(cells.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)));
    for (let c = 1; c < cols - 1; c++) {
      if (!used.has(c) && used.has(c - 1) && used.has(c + 1)) steps.push([+((c - mid) * seatW).toFixed(3), +(lineY(line) + 0.03).toFixed(3), +(z0 + line * rowD - rowD / 2).toFixed(3)]);
    }
  }
  const sw = screenW || +Math.min(W - 2, cols * seatW * 0.95).toFixed(2);
  const sh = screenH || +(sw / 2.39).toFixed(2);
  const sy = +(Math.max(sh / 2 + 1.2, top * 0.45 + sh / 2)).toFixed(2);
  return {
    key, kind: 'cinema', label,
    event: { title: label, venue: venueName },
    focus: [0, sy, SCREEN_Z + 0.2],
    overview: { pos: [W * 0.8, top + 9, back + 4], target: [0, top / 2, (SCREEN_Z + back) / 2], min: 6, max: 40 + D },
    room: { W, D, H, CZ: +((SCREEN_Z - 0.3 + back) / 2).toFixed(2), screenW: sw, screenH: sh, screenY: sy, screenZ: SCREEN_Z, back: +back.toFixed(2), risers, steps },
    seatStyle: 'cinema',
    seatColor: '#9a1325',
    occupancy: { [cat]: occupancy },
    categories: [{ id: cat, name: catName, price, color }],
    seats,
  };
}

// Gandaria City XXI, Studio 1 (Reguler 2D): rows P (front) to A (back), no I or O; an
// aisle four seats in from the left wall and one six seats in from the right. Rows A to D
// have three more seats on the left.
function gandariaS1() {
  const letters = ['P', 'N', 'M', 'L', 'K', 'J', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A'];
  const rows = letters.map((r, line) => [r, line, line < 10 ? [[3, 6], [8, 21], [23, 28]] : [[0, 6], [8, 21], [23, 28]]]);
  return studio({
    key: 'xxi-gandaria-s1', label: 'Gandaria City XXI, Studio 1', venueName: 'Gandaria City XXI',
    sec: 'S1', secName: 'Studio 1', cat: 'reguler', catName: 'Reguler 2D', price: 75000, color: '#56b6ff',
    rows, num: c => (c >= 23 ? 29 - c : c >= 8 ? 28 - c : 27 - c), occupancy: 0.55,
  });
}

// Gandaria City XXI, Studio 3 (Reguler 2D): rows N (front) to A (back); rows A to C have
// two more seats on the left.
function gandariaS3() {
  const letters = ['N', 'M', 'L', 'K', 'J', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A'];
  const rows = letters.map((r, line) => [r, line, line < 10 ? [[2, 3], [5, 15], [17, 20]] : [[0, 3], [5, 15], [17, 20]]]);
  return studio({
    key: 'xxi-gandaria-s3', label: 'Gandaria City XXI, Studio 3', venueName: 'Gandaria City XXI',
    sec: 'S3', secName: 'Studio 3', cat: 'reguler', catName: 'Reguler 2D', price: 75000, color: '#56b6ff',
    rows, num: c => (c >= 17 ? 21 - c : c >= 5 ? 20 - c : 19 - c), occupancy: 0.45,
  });
}

// Gandaria City IMAX, Studio 1 (IMAX 2D): rows N, M and L in front of a cross aisle, then
// K to A; K to G are the middle block only. Gaps in L and A are on XXI's map too.
function gandariaImax() {
  const L = 'IMAX-L', R = 'IMAX-R', CL = 'IMAX-CL', CR = 'IMAX-CR';
  const full = [[0, 3, L], [5, 29], [31, 34, R]];
  const rows = [
    ['N', 0, [[2, 3, L], [5, 29], [31, 32, R]]],
    ['M', 1, [[1, 3, L], [5, 29], [31, 33, R]]],
    ['L', 2, [[0, 3, L], [5, 10, CL], [12, 22], [24, 29, CR], [31, 34, R]]],
    ['K', 4, [[5, 29]]], ['J', 5, [[5, 29]]], ['H', 6, [[5, 29]]], ['G', 7, [[5, 29]]],
    ['F', 8, full], ['E', 9, full], ['D', 10, full], ['C', 11, full], ['B', 12, full],
    ['A', 13, [[0, 3, L], [5, 12, CL], [22, 29, CR], [31, 34, R]]],
  ];
  return studio({
    key: 'xxi-gandaria-imax', label: 'Gandaria City IMAX', venueName: 'Gandaria City IMAX',
    sec: 'IMAX', secName: 'IMAX', cat: 'imax', catName: 'IMAX 2D', price: 90000, color: '#f5c451',
    rows, num: c => (c >= 31 ? 35 - c : c >= 5 ? 34 - c : 33 - c),
    rowD: 1.05, rise: 0.42, flat: 3, front: 6, screenW: 20, screenH: 10.6, occupancy: 0.7,
  });
}

// Gandaria City Premiere, Studio 1 (Premiere 2D): five rows, E (front) to A, of three
// pairs of recliners with wide aisles between them.
function gandariaPremiere() {
  const rows = ['E', 'D', 'C', 'B', 'A'].map((r, line) => [r, line, [[0, 1], [3, 4], [6, 7]]]);
  return studio({
    key: 'xxi-gandaria-premiere', label: 'Gandaria City Premiere, Studio 1', venueName: 'Gandaria City Premiere',
    sec: 'P1', secName: 'The Premiere', cat: 'premiere', catName: 'Premiere 2D', price: 250000, color: '#ff86b4',
    rows, num: c => [6, 5, 0, 4, 3, 0, 2, 1][c],
    seatW: 0.95, rowD: 1.9, rise: 0.45, flat: 0, front: 5, screenW: 8, occupancy: 0.6,
  });
}

export const CINEMA_BUILDERS = {
  'xxi-gandaria-s1': gandariaS1,
  'xxi-gandaria-s3': gandariaS3,
  'xxi-gandaria-imax': gandariaImax,
  'xxi-gandaria-premiere': gandariaPremiere,
};
