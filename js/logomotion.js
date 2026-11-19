// The Atvents logo coming together as it does when the site opens (the intro in index.html,
// from the same paths and timings): the arena mark's tiers fill as rows of seats sweeping
// round, the seats grow into the solid mark and the star opens, then the mark slides into its
// place as the wordmark is uncovered. Drawn on a 2D canvas, for the end of the story trailer.
//
// logoMotion(ctx, t, cx, cy, width): the logo at `t` seconds into its motion (formed by 1.9 s),
// centred on (cx, cy), `width` px across.

const TIERS = "M264.2 686.4A320 320 0 0 1 182.1 433.5L261.6 442.6A240 240 0 0 0 323.2 632.3ZM338.3 611.7A215 215 0 0 1 285.9 450.4L350.6 456.3A150 150 0 0 0 387.2 568.9ZM186.4 406.4A320 320 0 0 1 342.6 191.4L382 261A240 240 0 0 0 264.8 422.3ZM290.3 422.5A215 215 0 0 1 390 285.3L423.3 341.1A150 150 0 0 0 353.7 436.9ZM367.1 178.9A320 320 0 0 1 632.9 178.9L599.7 251.7A240 240 0 0 0 400.3 251.7ZM415.2 272.4A215 215 0 0 1 584.8 272.4L559.2 332.2A150 150 0 0 0 440.8 332.2ZM657.4 191.4A320 320 0 0 1 813.6 406.4L735.2 422.3A240 240 0 0 0 618 261ZM610 285.3A215 215 0 0 1 709.7 422.5L646.3 436.9A150 150 0 0 0 576.7 341.1ZM817.9 433.5A320 320 0 0 1 735.8 686.4L676.8 632.3A240 240 0 0 0 738.4 442.6ZM714.1 450.4A215 215 0 0 1 661.7 611.7L612.8 568.9A150 150 0 0 0 649.4 456.3Z";
const ROWS = [
  "M400.3 597.7A162 162 0 1 1 599.7 597.7",
  "M387.3 614.2A183 183 0 1 1 612.7 614.2",
  "M374.4 630.8A204 204 0 1 1 625.6 630.8",
  "M344.9 668.6A252 252 0 1 1 655.1 668.6",
  "M332.5 684.3A272 272 0 1 1 667.5 684.3",
  "M320.2 700.1A292 292 0 1 1 679.8 700.1",
  "M308.5 715.1A311 311 0 1 1 691.5 715.1",
];
const STAR = "M500 375Q500 470 595 470Q500 470 500 565Q500 470 405 470Q500 470 500 375Z";
const WORDMARK = "M257 10Q190 10 137.5 -23.0Q85 -56 54.5 -113.0Q24 -170 24 -243Q24 -316 54.5 -373.0Q85 -430 137.5 -463.0Q190 -496 257 -496Q306 -496 345.5 -477.0Q385 -458 410.0 -424.5Q435 -391 438 -348V-138Q435 -95 410.5 -61.5Q386 -28 346.0 -9.0Q306 10 257 10ZM288 -128Q337 -128 367.0 -160.5Q397 -193 397 -243Q397 -277 383.5 -303.0Q370 -329 345.5 -343.5Q321 -358 289 -358Q257 -358 232.5 -343.5Q208 -329 193.5 -303.0Q179 -277 179 -243Q179 -210 193.0 -184.0Q207 -158 232.0 -143.0Q257 -128 288 -128ZM391 0V-131L414 -249L391 -367V-486H541V0ZM708 0V-687H861V0ZM598 -356V-486H971V-356ZM1181 0 975 -486H1140L1280 -81H1208L1348 -486H1510L1304 0ZM1795 11Q1716 11 1654.5 -21.5Q1593 -54 1558.0 -112.0Q1523 -170 1523 -243Q1523 -316 1557.5 -373.5Q1592 -431 1651.0 -464.0Q1710 -497 1784 -497Q1856 -497 1911.0 -466.0Q1966 -435 1997.5 -380.0Q2029 -325 2029 -254Q2029 -241 2027.5 -226.5Q2026 -212 2022 -193L1603 -192V-297L1957 -298L1891 -254Q1890 -296 1878.0 -323.5Q1866 -351 1842.5 -365.5Q1819 -380 1785 -380Q1749 -380 1722.5 -363.5Q1696 -347 1681.5 -317.0Q1667 -287 1667 -244Q1667 -201 1682.5 -170.5Q1698 -140 1726.5 -123.5Q1755 -107 1794 -107Q1830 -107 1859.0 -119.5Q1888 -132 1910 -157L1994 -73Q1958 -31 1907.0 -10.0Q1856 11 1795 11ZM2414 0V-277Q2414 -315 2390.5 -338.5Q2367 -362 2331 -362Q2306 -362 2287.0 -351.5Q2268 -341 2257.0 -321.5Q2246 -302 2246 -277L2187 -306Q2187 -363 2212.0 -406.0Q2237 -449 2281.5 -472.5Q2326 -496 2382 -496Q2436 -496 2477.5 -470.5Q2519 -445 2543.0 -403.0Q2567 -361 2567 -311V0ZM2093 0V-486H2246V0ZM2724 0V-687H2877V0ZM2614 -356V-486H2987V-356ZM3221 12Q3178 12 3136.5 1.0Q3095 -10 3059.5 -30.5Q3024 -51 2999 -78L3086 -166Q3110 -140 3143.0 -125.5Q3176 -111 3215 -111Q3242 -111 3256.5 -119.0Q3271 -127 3271 -141Q3271 -159 3253.5 -168.5Q3236 -178 3209.0 -185.5Q3182 -193 3152.0 -202.0Q3122 -211 3095.0 -227.0Q3068 -243 3051.0 -271.5Q3034 -300 3034 -344Q3034 -391 3058.0 -425.5Q3082 -460 3126.0 -480.0Q3170 -500 3229 -500Q3291 -500 3343.5 -478.5Q3396 -457 3429 -415L3342 -327Q3319 -354 3290.5 -365.0Q3262 -376 3235 -376Q3209 -376 3196.0 -368.5Q3183 -361 3183 -347Q3183 -332 3200.0 -323.0Q3217 -314 3244.0 -307.0Q3271 -300 3301.0 -290.0Q3331 -280 3358.0 -263.0Q3385 -246 3402.0 -217.5Q3419 -189 3419 -143Q3419 -72 3365.5 -30.0Q3312 12 3221 12Z";

let P = null;
const paths = () => (P ??= { tiers: new Path2D(TIERS), rows: ROWS.map(d => new Path2D(d)), star: new Path2D(STAR), wm: new Path2D(WORDMARK) });

// CSS's cubic-bezier() timing functions.
function bezier(x1, y1, x2, y2) {
  const at = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 10; i++) {
      const e = at(x1, x2, t) - x, d = 3 * x1 * (1 - t) * (1 - t) + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
      if (Math.abs(e) < 1e-5) break;
      t = Math.min(1, Math.max(0, t - e / (d || 1e-6)));
    }
    return at(y1, y2, t);
  };
}
const E = {
  sweep: bezier(0.4, 0, 0.3, 1), grow: bezier(0.5, 0, 0.3, 1), ease: bezier(0.25, 0.1, 0.25, 1),
  star: bezier(0.22, 1, 0.36, 1), mark: bezier(0.65, 0, 0.25, 1), wipe: bezier(0.45, 0, 0.2, 1),
};
const step = (t, delay, dur, ease) => ease(Math.min(1, Math.max(0, (t - delay) / dur)));

let off = null;

export function logoMotion(ctx, t, cx, cy, width) {
  const p = paths(), lw = width, lh = width * 818 / 4635, lx = cx - lw / 2, ly = cy - lh / 2;
  const grad = ctx.createLinearGradient(180, 150, 820, 696);
  [[0, '#f4b173'], [0.35, '#f37a2a'], [0.7, '#e8480f'], [1, '#b81d08']].forEach(([o, c]) => grad.addColorStop(o, c));

  // The wordmark, uncovered left to right by a soft edge.
  const w = step(t, 1.3, 0.585, E.wipe);
  if (w > 0) {
    off ??= document.createElement('canvas');
    off.width = Math.ceil(lw); off.height = Math.ceil(lh);
    const g = off.getContext('2d'), dx = -4000 * (1 - w);
    g.setTransform(lw / 4635, 0, 0, lh / 818, 1180 * lw / 4635, 766 * lh / 818);
    g.fillStyle = '#f4f0ee'; g.fill(p.wm);
    const m = g.createLinearGradient(3450 + dx, 0, 3950 + dx, 0);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = m; g.fillRect(-1400 + dx, -800, 5400, 900);
    g.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(off, lx, ly);
  }

  // The mark: from the middle of the logo at 1.9 times, to its place at the left.
  const mw = 914.3 / 4635 * lw, mh = 767.2 / 818 * lh, mx = lx + 26 / 4635 * lw, my = ly + 26 / 818 * lh;
  const k = step(t, 1.07, 0.546, E.mark), s = 1.9 - 0.9 * k;
  ctx.save();
  ctx.translate(mx + mw / 2 + 2.006 * mw * (1 - k), my + mh / 2);
  ctx.scale(s, s);
  ctx.translate(-mw / 2, -mh / 2);
  ctx.scale(mw / 640, mh / 537);
  ctx.translate(-180, -150);
  ctx.save();
  ctx.clip(p.tiers);
  // The rows of seats, uncovered by a sweep round the centre, each seat growing.
  const f = step(t, 0.104, 0.806, E.sweep);
  if (f > 0) {
    ctx.save();
    const a0 = 118 * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(500, 470); ctx.arc(500, 470, 420, a0, a0 + f * Math.PI * 2); ctx.closePath(); ctx.clip();
    ctx.lineCap = 'round'; ctx.setLineDash([0, 18]); ctx.strokeStyle = grad;
    p.rows.forEach((row, r) => { ctx.lineWidth = 9 + 17 * step(t, 0.806 + r * 0.0195, 0.416, E.grow); ctx.stroke(row); });
    ctx.restore();
  }
  const so = step(t, 1.09, 0.286, E.ease);
  if (so > 0) { ctx.globalAlpha = so; ctx.fillStyle = grad; ctx.fill(p.tiers); ctx.globalAlpha = 1; }
  ctx.restore();
  const sk = step(t, 0.91, 0.52, E.star);
  if (sk > 0) {
    ctx.globalAlpha = Math.min(1, sk);
    ctx.translate(500, 470); ctx.scale(0.3 + 0.7 * sk, 0.3 + 0.7 * sk); ctx.translate(-500, -470);
    ctx.fillStyle = grad; ctx.fill(p.star);
  }
  ctx.restore();
}
