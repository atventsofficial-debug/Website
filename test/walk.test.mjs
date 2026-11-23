import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { makeGraph, doorsOf, fromDoors, walkFrom } from '../js/walk.js';

// A small ladder: two streets joined by a footpath, the venue at one end.
test('the walk follows the cheapest way to the venue and names its streets', () => {
  const G = makeGraph({
    nodes: [0, 0, 100, 0, 200, 0, 0, 100, 200, 100],
    edges: [0, 1, 110, 100, 1, 1, 2, 110, 100, 1, 0, 3, 100, 100, 2, 3, 4, 220, 200, 3, 4, 2, 100, 100, 2],
    names: ['', 'Jl. Satu', 'Path', 'Jl. Dua'],
  });
  const venue = [190, -10, 210, -10, 210, 10, 190, 10];
  const field = fromDoors(G, doorsOf(G, venue, 15));
  const w = walkFrom(G, field, [[0, 0]]);
  assert.equal(w.metres, 200);
  assert.deepEqual(w.legs.map(l => l.name), ['Jl. Satu']);
  assert.equal(w.minutes, 3);
});

for (const area of ['gbk', 'jis', 'jiexpo', 'icebsd', 'unesa']) {
  const file = new URL(`../assets/maps/${area}.json`, import.meta.url);
  test(`${area}: every stop reaches every venue on foot, in a sensible walk`, { skip: !existsSync(file) }, () => {
    const A = JSON.parse(readFileSync(file, 'utf8'));
    const G = makeGraph(A.graph);
    assert.ok(Object.keys(A.venues).length, 'a venue outline');
    assert.ok(A.stops.length >= 3, 'stops');
    for (const v of Object.values(A.venues)) {
      const field = fromDoors(G, doorsOf(G, v.ring));
      for (const s of A.stops) {
        const w = walkFrom(G, field, [[s.x, s.y], ...(s.gates || [])]);
        assert.ok(w, `${s.name} to ${v.name}`);
        const crow = Math.hypot(s.x - w.pts.at(-1)[0], s.y - w.pts.at(-1)[1]);
        assert.ok(w.metres >= crow * 0.95 && w.metres < 6000, `${s.name} to ${v.name}: ${w.metres} m, ${Math.round(crow)} m as the crow flies`);
      }
    }
  });
}
