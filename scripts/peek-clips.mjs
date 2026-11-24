// The price list's clips (js/peek.js): `node scripts/peek-clips.mjs <folder>` takes every
// <name>.mp4 in the folder and writes it scrambled to assets/peek/<name>.bin, the name being
// the line's data-peek in index.html. Only the scrambled files go on the site.
//
// The clips are filmed from the 3D view itself: a few seconds of each feature, 576 px wide,
// H.264 with no sound, about 15 frames a second.
import fs from 'node:fs';
import path from 'node:path';
import { scramble } from '../js/peekcode.js';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/peek-clips.mjs <folder of name.mp4>'); process.exit(1); }
const out = path.resolve(new URL('..', import.meta.url).pathname, 'assets/peek');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).sort()) {
  const name = f.slice(0, -4);
  if (!/^[a-z0-9-]+$/.test(name)) { console.warn(`skipped ${f}: names are lower-case letters, digits and dashes`); continue; }
  const bytes = scramble(new Uint8Array(fs.readFileSync(path.join(dir, f))), name);
  fs.writeFileSync(path.join(out, `${name}.bin`), bytes);
  console.log(`${name}.bin  ${(bytes.length / 1024).toFixed(0)} KB`);
}
