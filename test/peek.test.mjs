import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scramble } from '../js/peekcode.js';

const root = new URL('..', import.meta.url).pathname;

test('a clip unscrambles to the bytes it was made from', () => {
  const src = Uint8Array.from({ length: 1003 }, (_, i) => (i * 37) & 255);
  const s = scramble(src.slice(), 'tour');
  assert.notDeepEqual(s, src);
  assert.deepEqual(scramble(s, 'tour'), src);
  assert.notDeepEqual(scramble(src.slice(), 'show'), s, 'each clip has its own stream');
});

test('every line of the price list with a clip has its file, and the file is no plain MP4', () => {
  const html = fs.readFileSync(`${root}index.html`, 'utf8');
  const list = html.slice(html.indexOf('id="price-list"'), html.indexOf('</aside>', html.indexOf('id="price-list"')));
  const names = [...list.matchAll(/data-peek="([a-z0-9-]+)"/g)].map(m => m[1]);
  assert.ok(names.length >= 13);
  for (const n of names) {
    const f = `${root}assets/peek/${n}.bin`;
    assert.ok(fs.existsSync(f), `assets/peek/${n}.bin`);
    const b = new Uint8Array(fs.readFileSync(f));
    assert.notEqual(String.fromCharCode(...b.slice(4, 8)), 'ftyp', `${n}.bin is scrambled`);
    assert.equal(String.fromCharCode(...scramble(b.slice(0, 8), n).slice(4, 8)), 'ftyp', `${n}.bin unscrambles to an MP4`);
  }
});
