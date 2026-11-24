import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BTS_STAGE } from '../js/layouts.js';
import { EVENTS } from '../js/events.js';
import { setlistFor } from '../js/setlists.js';

let crowd = null;
try { crowd = await import('../js/crowd3d.js'); } catch { /* three.js only in the browser */ }

test('the walk round the 360 stage stays on the deck and reaches every runway end', { skip: !crowd }, () => {
  const R = crowd.stageRoute({ round: BTS_STAGE });
  const { half, arm: { tip: [tx, tz], w } } = BTS_STAGE;
  const onDeck = (x, z) => {
    if (Math.abs(x) <= half && Math.abs(z) <= half) return true;
    // on a runway: near the line from the middle to its tip, not past the tip
    const ax = Math.abs(x), az = Math.abs(z), L = Math.hypot(tx, tz);
    const along = (ax * tx + az * tz) / L, across = Math.abs(ax * tz - az * tx) / L;
    return along <= L && across <= w / 2;
  };
  for (let d = 0; d < R.length; d += 0.5) { const p = crowd.routeAt(R, d); assert.ok(onDeck(p.x, p.z), `${d}: ${p.x.toFixed(1)},${p.z.toFixed(1)}`); }
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    assert.ok(R.pts.some(([x, z]) => Math.hypot(x - sx * tx, z - sz * tz) < 3), `runway ${sx},${sz}`);
  }
});

test('the walk on an end stage runs out to both wings', { skip: !crowd }, () => {
  const R = crowd.stageRoute({ front: -34, spread: 1 });
  const xs = R.pts.map(p => p[0]);
  assert.ok(Math.min(...xs) < -12 && Math.max(...xs) > 12);
  assert.ok(R.pts.every(([, z]) => z < -34));
});

test('a band sends only its singer out; a group without instruments walks together', { skip: !crowd }, () => {
  const roles = l => crowd.walkersOf(l.map(role => ({ role })));
  assert.deepEqual(roles(['vocals', 'guitar', 'guitar', 'bass', 'keys', 'drums']), [0]);
  assert.deepEqual(roles(['vocals-guitar', 'guitar', 'bass', 'drums']), [0]);
  assert.deepEqual(roles(['vocals-guitar', 'vocals', 'guitar', 'bass', 'drums']), [1]);
  assert.deepEqual(roles(['vocals', 'vocals', 'vocals', 'dancer', 'dancer']), [0, 1, 2, 3, 4]);
  assert.deepEqual(roles(['guitar', 'drums']), []);
  // Every lineup on the site has somebody to walk.
  for (const e of EVENTS.filter(e => e.lineup)) assert.ok(crowd.walkersOf(e.lineup).length, e.id);
});

test('the group walks to every corner of an end stage, stops there, and stays on the deck', { skip: !crowd }, () => {
  for (const n of [1, 4, 7, 12]) {
    const F = crowd.formation(n), half = Math.max(...F.map(([x]) => Math.abs(x)));
    const R = crowd.stageRoute({ front: -34, spread: 1, riserZ: -44, half });
    const seen = new Set();
    let t = 0, lap = 0;
    const T = R.stops.reduce((a, s, i) => a + crowd.WALK_PAUSE + Math.max(1.2, ((R.stops[i + 1] ?? R.stops[0] + R.length) - s) / crowd.WALK_SPEED), 0);
    for (; t < T; t += 0.25) {
      const w = crowd.walkAt(R, t), at = crowd.routeAt(R, w.d);
      for (const [ox, oz] of F) {
        const x = at.x + ox, z = at.z + oz;
        assert.ok(Math.abs(x) <= 18 - 1.4 + 1e-6 && z < -34 && z > -44, `${n} at ${t}: ${x.toFixed(1)},${z.toFixed(1)}`);
      }
      if (w.stopped) seen.add(`${Math.sign(Math.round(at.x))},${at.z < -37 ? 'back' : 'front'}`);
      lap = Math.max(lap, w.d);
    }
    for (const c of ['-1,front', '1,front', '-1,back', '1,back', '0,front']) assert.ok(seen.has(c), `${n}: stops at ${c}`);
  }
});

test('out along a runway the group goes one behind the other and keeps to it', { skip: !crowd }, () => {
  const F = crowd.formation(9), half = Math.max(...F.map(([x]) => Math.abs(x)));
  const R = crowd.stageRoute({ front: 0, deckHalf: 26, deckDepth: 16, riserZ: -9, half, runway: 17 });
  const band = Object.assign(Object.create(crowd.Band.prototype), { route: R, offsets: F, walkers: F.map((_, i) => i) });
  let out = 0;
  for (let t = 0; t < 400; t += 0.25) {
    for (let i = 0; i < F.length; i++) {
      const p = band.walkerAt(i, t);
      // In front of the deck there is only the 2.2 m runway, out to its end.
      if (p.z > 0.05) { out++; assert.ok(Math.abs(p.x) <= 1.1 && p.z <= 17.01, `${i} at ${t}: ${p.x.toFixed(2)},${p.z.toFixed(2)}`); }
      else assert.ok(Math.abs(p.x) <= 26 && p.z > -16, `${i} at ${t}`);
    }
  }
  assert.ok(out > 100, 'they go out on the runway');
});

test('round the 360 stage the members follow each other out to every runway end', { skip: !crowd }, () => {
  const R = crowd.stageRoute({ round: BTS_STAGE });
  const { arm: { tip: [tx, tz] } } = BTS_STAGE;
  assert.equal(R.mode, 'line');
  const T = R.stops.reduce((a, s, i) => a + crowd.WALK_PAUSE + Math.max(1.2, ((R.stops[i + 1] ?? R.stops[0] + R.length) - s) / crowd.WALK_SPEED), 0);
  const tips = new Set();
  for (let t = 0; t < T; t += 0.25) {
    const w = crowd.walkAt(R, t), at = crowd.routeAt(R, w.d);
    if (w.stopped && Math.hypot(Math.abs(at.x) - tx, Math.abs(at.z) - tz) < 3) tips.add(`${Math.sign(at.x)},${Math.sign(at.z)}`);
  }
  assert.equal(tips.size, 4);
});

test('every setlist names its source and has songs', () => {
  const ids = EVENTS.filter(e => !e.demo).map(e => e.id);
  const lists = ids.map(setlistFor).filter(Boolean);
  assert.ok(lists.length >= 10);
  for (const l of lists) {
    assert.match(l.url, /^https:\/\//);
    assert.ok(l.from && l.songs.length >= 8 && l.songs.every(s => s.trim() === s && s));
  }
  assert.equal(setlistFor('evt-bts-arirang-2'), setlistFor('evt-bts-arirang-1'));
  assert.equal(setlistFor('nope'), null);
});
