// The setlist's song previews (worker/preview.mjs): the Search API played by a stand-in.
//
//   node --test test/preview.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plain, pickPreview, findPreview, songPreview } from '../worker/preview.mjs';

const song = (artistName, trackName, previewUrl = `https://audio-ssl.itunes.apple.com/p/${encodeURIComponent(trackName)}.m4a`) =>
  ({ artistName, trackName, previewUrl, trackViewUrl: `https://music.apple.com/id/song/${encodeURIComponent(trackName)}` });

test('titles and names compare without brackets, accents or punctuation', () => {
  assert.equal(plain('Run BTS (remix)'), 'run bts');
  assert.equal(plain("Guns N' Roses"), 'guns n roses');
  assert.equal(plain('Con te partirò'), 'con te partiro');
  assert.equal(plain('N.Flying'), 'n flying');
});

test('the same title by the same artist wins over a cover or a longer title', () => {
  const results = [
    song('Glee Cast', 'Dynamite'),
    song('BTS', 'Dynamite (Tropical Remix)'),
    song('BTS', 'Dynamite'),
  ];
  assert.equal(pickPreview(results, 'BTS', 'Dynamite').track, 'Dynamite');
  assert.equal(pickPreview(results, 'BTS', 'Run BTS (remix)'), null);
  assert.equal(pickPreview([song('Someone Else', 'Dynamite')], 'BTS', 'Dynamite'), null);
  assert.equal(pickPreview([{ ...song('BTS', 'Dynamite'), previewUrl: '' }], 'BTS', 'Dynamite'), null);
});

test('tries Indonesia first, then the US store, and only takes Apple-hosted clips', async () => {
  const asked = [];
  const fetchFn = async url => {
    const u = new URL(url);
    asked.push(u.searchParams.get('country'));
    const results = u.searchParams.get('country') === 'ID' ? [] : [song('Simple Plan', 'Welcome to My Life')];
    return new Response(JSON.stringify({ results }), { status: 200 });
  };
  const hit = await findPreview('Simple Plan', 'Welcome to My Life', fetchFn);
  assert.deepEqual(asked, ['ID', 'US']);
  assert.match(hit.url, /^https:\/\/audio-ssl\.itunes\.apple\.com\//);
  assert.match(hit.link, /^https:\/\/music\.apple\.com\//);

  const evil = async () => new Response(JSON.stringify({ results: [song('Simple Plan', 'Perfect', 'https://evil.example/p.m4a')] }));
  assert.equal(await findPreview('Simple Plan', 'Perfect', evil), null);
  assert.equal(await findPreview('Simple Plan', 'Perfect', async () => { throw new Error('offline'); }), null);
});

test('GET /api/preview answers the clip, 404 when there is none, 400 without a song', async () => {
  const json = (status, data, extra) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extra } });
  const fetchFn = async () => new Response(JSON.stringify({ results: [song('Maroon 5', 'Memories')] }));
  const ok = await songPreview(new URL('https://atvents.com/api/preview?artist=Maroon%205&song=Memories'), null, json, fetchFn);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).track, 'Memories');
  assert.match(ok.headers.get('cache-control'), /max-age=604800/);
  const none = await songPreview(new URL('https://atvents.com/api/preview?artist=Maroon%205&song=Nope'), null, json, fetchFn);
  assert.equal(none.status, 404);
  const bad = await songPreview(new URL('https://atvents.com/api/preview?artist=Maroon%205'), null, json, fetchFn);
  assert.equal(bad.status, 400);
});
