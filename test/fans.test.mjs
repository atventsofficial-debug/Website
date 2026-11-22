// The seat mates' list under a crowd (worker/fans.mjs): one small read per check while
// nothing changes, a full read only after a change, and each category's answer built once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fansList, catView, saveFan, dropFan, forgetFans, FRESH } from '../worker/fans.mjs';

// A stand-in for D1 that knows the few statements fans.mjs runs, and counts the reads.
function fakeDb() {
  const rows = [], meta = new Map(), reads = { list: 0, meta: 0 };
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    run: async () => exec(sql, args),
    first: async () => {
      if (/FROM fans_meta/.test(sql)) { reads.meta++; return meta.has(args[0]) ? { ver: meta.get(args[0]) } : null; }
      if (/SELECT order_id FROM fans WHERE event_id = \? AND seat/.test(sql)) return rows.find(r => r.event_id === args[0] && r.seat === args[1] && r.order_id !== args[2]) || null;
      return null;
    },
    all: async () => { reads.list++; return { results: rows.filter(r => r.event_id === args[0]) }; },
  });
  function exec(sql, a) {
    if (/^INSERT INTO fans \(/.test(sql.trim())) {
      const old = rows.find(r => r.order_id === a[0]);
      if (old) Object.assign(old, { name: a[4], instagram: a[5] });
      else rows.push({ order_id: a[0], event_id: a[1], cat: a[2], seat: a[3], name: a[4], instagram: a[5] });
    } else if (/^INSERT INTO fans_meta/.test(sql)) meta.set(a[0], (meta.get(a[0]) || 0) + 1);
    else if (/^DELETE FROM fans WHERE order_id/.test(sql)) rows.splice(rows.findIndex(r => r.order_id === a[0]), 1);
  }
  return { prepare: sql => stmt(sql), batch: async list => { for (const s of list) exec(s.sql, s.args); }, rows, reads };
}

const pass = (id, cat, seat) => ({ id, eventId: 'evt-1', cat, seat });

test('a quiet list costs one small read per check, not the whole list', async () => {
  const DB = fakeDb(), env = { DB };
  await saveFan(env, pass('A', 'cat1', 'L01-A1'), { name: 'Ana', instagram: 'ana' });
  await saveFan(env, pass('B', 'cat2', 'L02-B3'), { name: 'Budi', instagram: 'budi' });
  let now = 1e6;
  const first = await fansList(env, 'evt-1', now);
  assert.equal(first.rows.length, 2);
  assert.equal(DB.reads.list, 1);
  for (let i = 1; i <= 5; i++) await fansList(env, 'evt-1', now + i * (FRESH + 1));
  assert.equal(DB.reads.list, 1, 'no full read while nothing changed');
  assert.ok(DB.reads.meta >= 5);
  now += 10 * (FRESH + 1);
  await saveFan(env, pass('C', 'cat1', 'L01-A2'), { name: 'Cici', instagram: 'cici' });
  const after = await fansList(env, 'evt-1', now);
  assert.equal(after.rows.length, 3);
  assert.equal(DB.reads.list, 2, 'a change is read again');
  await dropFan(env, 'C', 'evt-1');
  await forgetFans(env, 'evt-1');
  assert.equal((await fansList(env, 'evt-1', now + 1)).rows.length, 2);
});

test('a category sees its own names and only a count per block of the others', async () => {
  const DB = fakeDb(), env = { DB };
  await saveFan(env, pass('A', 'cat1', 'L01-A1'), { name: 'Ana', instagram: 'ana' });
  await saveFan(env, pass('B', 'cat2', 'L02-B3'), { name: 'Budi', instagram: 'budi' });
  await saveFan(env, pass('D', 'cat2', 'L02-C9'), { name: 'Dewi', instagram: 'dewi' });
  const list = await fansList(env, 'evt-1', 5e6);
  const v = await catView(list, 'cat1');
  assert.deepEqual(JSON.parse(v.fans), [{ seat: 'L01-A1', cat: 'cat1', name: 'Ana', instagram: 'ana' }]);
  assert.deepEqual(JSON.parse(v.others), [{ seat: 'L02-B3', cat: 'cat2', n: 2 }]);
  assert.ok(!v.others.includes('Budi') && !v.others.includes('budi'));
  assert.equal(v.byOrder.get('A').seat, 'L01-A1');
  assert.equal(await catView(list, 'cat1'), v, 'built once per list');
  // Another category renaming itself changes nothing this category is sent.
  await saveFan(env, pass('B', 'cat2', 'L02-B3'), { name: 'Bambang', instagram: 'bambang' });
  await forgetFans(env, 'evt-1');
  const v2 = await catView(await fansList(env, 'evt-1', 6e6), 'cat1');
  assert.equal(v2.version, v.version);
});
