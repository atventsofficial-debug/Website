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
