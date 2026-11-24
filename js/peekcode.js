// The price list's clips are kept scrambled, so a clip's file on the site is not a video
// anyone can open or save from its link: every byte is mixed with a stream drawn from the
// clip's name. The same call scrambles (scripts/peek-clips.mjs) and unscrambles (js/peek.js).
// Pure data, no browser.
const SEED = 0x6a7e5f21;

function seedOf(name) {
  let h = SEED;
  for (const c of String(name)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h || SEED;
}

// xorshift32, four bytes of stream per step. Works in place and returns the same bytes.
export function scramble(bytes, name) {
  let x = seedOf(name);
  for (let i = 0; i < bytes.length; i += 4) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    for (let k = 0; k < 4 && i + k < bytes.length; k++) bytes[i + k] ^= (x >>> (k * 8)) & 255;
  }
  return bytes;
}
