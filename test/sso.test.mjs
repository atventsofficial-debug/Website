// "Continue with Google / Microsoft" (js/sso.js): which ID tokens the form takes a name and an
// email from, and which client ids /api/config may hand out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimsOf, clientsOf } from '../js/sso.js';

const GOOGLE = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
const MICROSOFT = '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0';
const PERSONAL = '9188040d-6c67-4c5b-b112-36a304b66dad';   // Microsoft's directory for personal accounts
const NOW = Date.parse('2026-11-18T04:00:00Z');
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = claims => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.c2lnbmF0dXJl`;
const google = (more = {}) => ({ iss: 'https://accounts.google.com', aud: GOOGLE, nonce: 'n-1', exp: NOW / 1000 + 600, email: 'rani.putri@gmail.com', email_verified: true, name: 'Rani Putri', ...more });
const microsoft = (more = {}) => ({ iss: `https://login.microsoftonline.com/${PERSONAL}/v2.0`, tid: PERSONAL, aud: MICROSOFT, nonce: 'n-2', exp: NOW / 1000 + 600, email: 'rani@outlook.com', name: 'Rani Putri', ...more });
const asGoogle = claims => claimsOf(token(claims), { provider: 'google', clientId: GOOGLE, nonce: 'n-1', now: NOW });
const asMicrosoft = claims => claimsOf(token(claims), { provider: 'microsoft', clientId: MICROSOFT, nonce: 'n-2', now: NOW });

test('a Google sign-in gives the name and the verified email', () => {
  assert.deepEqual(asGoogle(google()), { provider: 'google', name: 'Rani Putri', email: 'rani.putri@gmail.com' });
  assert.equal(asGoogle(google({ iss: 'accounts.google.com' }))?.email, 'rani.putri@gmail.com');
  assert.deepEqual(asGoogle(google({ name: '  Rani \n Putri ' }))?.name, 'Rani Putri');
  assert.equal(asGoogle(google({ name: undefined }))?.name, '', 'no name: the fan types it');
});

test('a Google token for another app, another sign-in, out of time or unverified is refused', () => {
  assert.equal(asGoogle(google({ aud: '999-other.apps.googleusercontent.com' })), null);
  assert.equal(asGoogle(google({ nonce: 'n-other' })), null);
  assert.equal(asGoogle(google({ nonce: undefined })), null);
  assert.equal(asGoogle(google({ exp: NOW / 1000 - 3600 })), null);
  assert.equal(asGoogle(google({ email_verified: false })), null);
  assert.equal(asGoogle(google({ iss: 'https://evil.example' })), null);
  assert.equal(asGoogle(google({ email: 'not an email' })), null);
  assert.equal(claimsOf(token(google()), { provider: 'google', clientId: GOOGLE, nonce: '', now: NOW }), null, 'no nonce asked: nothing taken');
});

test('a Microsoft sign-in gives the name and the email, or the sign-in name when that is the address', () => {
  assert.deepEqual(asMicrosoft(microsoft()), { provider: 'microsoft', name: 'Rani Putri', email: 'rani@outlook.com' });
  assert.equal(asMicrosoft(microsoft({ email: undefined, preferred_username: 'rani@company.co.id' }))?.email, 'rani@company.co.id');
  assert.equal(asMicrosoft(microsoft({ email: undefined, preferred_username: '+6281234567890' })), null, 'a phone number is no email');
  assert.equal(asMicrosoft(microsoft({ iss: 'https://login.microsoftonline.com/common/v2.0' })), null);
  assert.equal(asMicrosoft(microsoft({ tid: '00000000-0000-0000-0000-000000000000' })), null, 'the issuer names another directory');
  assert.equal(asMicrosoft(microsoft({ aud: GOOGLE })), null);
});

test('anything that is not a token is refused', () => {
  for (const t of ['', 'abc', 'a.b.c', `x.${'A'.repeat(9000)}.y`, null, 42]) {
    assert.equal(claimsOf(t, { provider: 'google', clientId: GOOGLE, nonce: 'n-1', now: NOW }), null);
  }
  assert.equal(claimsOf(token(google()), { provider: 'facebook', clientId: GOOGLE, nonce: 'n-1', now: NOW }), null);
});

test('only client ids shaped like Google and Microsoft ones are handed to the page', () => {
  assert.deepEqual(clientsOf({ google: ` ${GOOGLE} `, microsoft: MICROSOFT }), { google: GOOGLE, microsoft: MICROSOFT });
  assert.deepEqual(clientsOf({ google: 'GOCSPX-a-client-secret', microsoft: 'not-a-guid' }), {});
  assert.deepEqual(clientsOf({ google: undefined }), {});
  assert.deepEqual(clientsOf(null), {});
});
