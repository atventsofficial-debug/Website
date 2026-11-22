// Asking Instagram about an account, for its picture (worker/igcheck.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { igExists } from '../worker/igcheck.mjs';

const answer = (status, body) => async () => new Response(body == null ? null : JSON.stringify(body), { status });

test('an account Instagram knows is there; one it does not know is refused', async () => {
  assert.equal(await igExists('real.fan', { fetchImpl: answer(200, { data: { user: { username: 'real.fan' } } }), now: 1 }), true);
  assert.equal(await igExists('nobody.here', { fetchImpl: answer(404), now: 1 }), false);
  assert.equal(await igExists('also.nobody', { fetchImpl: answer(200, { data: { user: null } }), now: 1 }), false);
});

test('no clear answer (blocked, rate limited, down) is neither yes nor no', async () => {
  assert.equal(await igExists('maybe.one', { fetchImpl: answer(429, { message: 'Please wait a few minutes' }), now: 1 }), null);
  assert.equal(await igExists('maybe.two', { fetchImpl: answer(401, { require_login: true }), now: 1 }), null);
  assert.equal(await igExists('maybe.three', { fetchImpl: async () => { throw new Error('network'); }, now: 1 }), null);
  assert.equal(await igExists('maybe.four', { fetchImpl: answer(302), now: 1 }), null);
});

test('answers are kept, so the same name is not asked again', async () => {
  let asked = 0;
  const f = async () => { asked++; return new Response(JSON.stringify({ data: { user: { username: 'kept.one' } } }), { status: 200 }); };
  await igExists('kept.one', { fetchImpl: f, now: 100 });
  await igExists('Kept.One', { fetchImpl: f, now: 200 });
  assert.equal(asked, 1);
});
