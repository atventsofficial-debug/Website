// Gelora Bung Karno Main Stadium, built to look like the place rather than a diagram: the
// oval bowl in two tiers, the running track round the pitch, the ring roof on its columns
// with the steel trusses showing underneath, the lamps along the roof's inner edge, the
// stair mouths in the upper tier and Jakarta's towers beyond the open gap under the roof.
// Radii and heights come from the layout (`venue.gbk`); every ring keeps the same rx - rz.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { superPoint } from './layouts.js';
import { ribbon, loft, box, canvasTex, grime, merge, bandTexture, screenMaterial, scoreTexture, groundName } from './venues3d.js';

const SEGS = 288, TAU = Math.PI * 2;
let D = 38; // rx - rz of every ring, taken from the layout when the bowl is built
const ROOF = { inner: 107, outer: 172, yInner: 46, yOuter: 40.5, column: 152, depth: 3 };
const roofY = r => ROOF.yOuter + (ROOF.outer - r) / (ROOF.outer - ROOF.inner) * (ROOF.yInner - ROOF.yOuter);
const ell = (t, r) => superPoint(t, r, r - D, 1);

// Seeded noise, so the model is the same on every visit.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// The stepped concrete of one tier: a riser and a tread per row, all the way round.
function tierGeometry(T) {
  const pos = [], uv = [], idx = [];
  const strip = (r0, y0, r1, y1) => {
    const base = pos.length / 3, len = Math.hypot(r1 - r0, y1 - y0);
    for (let j = 0; j <= SEGS; j++) {
      const t = j / SEGS * TAU, [xa, za] = ell(t, r0), [xb, zb] = ell(t, r1);
      pos.push(xa, y0, za, xb, y1, zb);
      uv.push(j * 0.9, 0, j * 0.9, len / 2);
      if (j < SEGS) { const a = base + j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  };
  let r = T.rx0 - T.gap / 2;
  for (let i = 0; i < T.rows; i++) {
    const y = T.baseY + i * T.rise;
    strip(r, y - (i ? T.rise : 0.6), r, y);
    strip(r, y, r + T.gap, y);
    r += T.gap;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// The floor of the bowl: the tartan apron, the eight lanes, the grass round the pitch.
function fieldTexture(w, d) {
  const W = 4096, H = Math.round(W * d / w), s = W / w;
  return canvasTex(W, H, g => {
    const cx = W / 2, cz = H / 2;
    g.fillStyle = '#a4513c'; g.fillRect(0, 0, W, H);
    const rnd = rng(7);
    // Worn patches and seams in the tartan.
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '70,28,20' : '205,120,95'},${0.03 + rnd() * 0.05})`;
      const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 160;
      g.fillRect(x, y, r, r * (0.2 + rnd() * 0.6));
    }
    const oval = (R, half = 42.2) => {
      g.beginPath();
      g.moveTo(cx - half * s, cz - R * s);
      g.lineTo(cx + half * s, cz - R * s);
      g.arc(cx + half * s, cz, R * s, -Math.PI / 2, Math.PI / 2);
      g.lineTo(cx - half * s, cz + R * s);
      g.arc(cx - half * s, cz, R * s, Math.PI / 2, Math.PI * 1.5);
      g.closePath();
    };
    // The track itself, a shade redder than the apron.
    oval(36.5 + 8 * 1.22); g.fillStyle = '#b3523a'; g.fill();
    oval(36.5); g.fillStyle = '#9c4a37'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = Math.max(1.5, 0.06 * s);
    for (let k = 0; k <= 8; k++) { oval(36.5 + k * 1.22); g.stroke(); }
    // Start and finish lines across the home straight.
    for (const x of [42.2, -42.2, 0]) { g.beginPath(); g.moveTo(cx + x * s, cz + 36.5 * s); g.lineTo(cx + x * s, cz + (36.5 + 9.76) * s); g.stroke(); }
    // Grass round the pitch.
    g.fillStyle = '#3f8a3c';
    g.beginPath(); g.roundRect(cx - 57 * s, cz - 35.8 * s, 114 * s, 71.6 * s, 3 * s); g.fill();
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) { const k = (rnd() - 0.5) * 12; img.data[i] += k; img.data[i + 1] += k * 0.8; img.data[i + 2] += k * 0.7; }
    g.putImageData(img, 0, 0);
  });
}

// One roof truss, a metre deep in z per unit: two chords with posts and diagonals between.
function trussGeometry(length, depth) {
  const parts = [box(0.34, 0.34, length, 0, -0.3, length / 2), box(0.3, 0.3, length, 0, -0.3 - depth, length / 2)];
  const panels = 12, step = length / panels, diag = Math.hypot(step, depth), lean = Math.atan2(step, depth);
  for (let k = 0; k <= panels; k++) parts.push(box(0.16, depth, 0.16, 0, -0.3 - depth / 2, k * step));
  for (let k = 0; k < panels; k++) parts.push(box(0.14, diag, 0.14, 0, -0.3 - depth / 2, (k + 0.5) * step, k % 2 ? lean : -lean));
  const g = merge(parts);
  g.scale(1, 1, 1 / length);
  return g;
}

// Lattice of a ring truss, drawn once and repeated round the roof.
function latticeTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineCap = 'butt';
    g.lineWidth = 12; g.beginPath(); g.moveTo(0, 7); g.lineTo(w, 7); g.moveTo(0, h - 7); g.lineTo(w, h - 7); g.stroke();
    g.lineWidth = 7; g.beginPath(); g.moveTo(0, 0); g.lineTo(w / 2, h); g.lineTo(w, 0); g.moveTo(1, 0); g.lineTo(1, h); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  }, { repeat: [1, 1] });
}

function lampTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#2b2d31'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
      const x = 16 + i * 32, y = 16 + j * 32;
      const grd = g.createRadialGradient(x, y, 0, x, y, 13);
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.55, '#fff3d6'); grd.addColorStop(1, '#2b2d31');
      g.fillStyle = grd; g.fillRect(x - 16, y - 16, 32, 32);
    }
  }, { repeat: [1, 1] });
}

// Roof sheeting: long panels with seams, a little weathered.
function sheetTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9dbdc'; g.fillRect(0, 0, w, h);
    const rnd = rng(31);
    for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(90,96,104,${0.05 + rnd() * 0.12})`; g.fillRect(i * 16, 0, 15, h); g.fillStyle = 'rgba(40,44,50,0.35)'; g.fillRect(i * 16 + 15, 0, 1, h); }
    for (let j = 0; j < 4; j++) { g.fillStyle = 'rgba(40,44,50,0.3)'; g.fillRect(0, j * 64, w, 2); }
  }, { repeat: [1, 1] });
}

// The white front of the upper tier with red and white bunting hung along it.
function fasciaTexture() {
  return canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#e6e5e1'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 8, w, 8);
    for (const x of [90, 420, 760]) {
      g.fillStyle = '#c8102e'; g.fillRect(x, 34, 150, 32);
      g.fillStyle = '#f8f8f6'; g.fillRect(x, 66, 150, 32);
    }
    for (let x = 0; x < w; x += 128) { g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(x, 0, 2, h); }
  }, { repeat: [1, 1] });
}

export function gbkBowl(ctx, venue, brand) {
  const { scene } = ctx, { lower, upper } = venue.gbk;
  D = lower.rx0 - lower.rz0;
  const add = (geo, mat, cast = false) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; scene.add(m); return m; };
  const band = (r, y0, y1, mat, uRepeat) => add(ribbon({ rx: r, rz: r - D, p: 1, y0, y1, segs: SEGS, ...(uRepeat ? { uRepeat } : {}) }), mat);
  const slab = (r0, y0, r1, y1, mat) => add(loft({ rx: r0, rz: r0 - D, p: 1, y: y0 }, { rx: r1, rz: r1 - D, p: 1, y: y1 }, SEGS), mat);
  const back = t => t.rx0 + (t.rows - 0.5) * t.gap, top = t => t.baseY + (t.rows - 1) * t.rise;
  const tex = (t, x, y) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(x, y); c.needsUpdate = true; return c; };

  const concrete = new THREE.MeshStandardMaterial({ color: '#a9a7a1', map: tex(grime(), 1, 1), roughness: 0.96, side: THREE.DoubleSide });
  const paleConcrete = new THREE.MeshStandardMaterial({ color: '#cfcdc6', map: tex(grime(), 1, 1), roughness: 0.92, side: THREE.DoubleSide });
  const shade = new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 1, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: '#8f959c', metalness: 0.55, roughness: 0.5 });

  // ---- the floor of the bowl
  const wall = lower.rx0 - lower.gap / 2;
  const field = new THREE.Mesh(new THREE.CircleGeometry(1, 128), new THREE.MeshStandardMaterial({ map: fieldTexture(wall * 2, (wall - D) * 2), roughness: 0.93 }));
  field.rotation.x = -Math.PI / 2;
  field.scale.set(wall, wall - D, 1);
  field.position.y = -0.07;
  scene.add(field);
  const adTex = bandTexture([brand.home, 'GELORA BUNG KARNO', brand.away, 'JAKARTA', groundName(venue)], { bg: '#0a0a0c', fg: '#ffffff', accent: '#e21e35' });
  adTex.repeat.set(8, 1);
  // The boards face the pitch; from behind they are a dark frame.
  const boards = ribbon({ rx: 57.2, rz: 35.9, p: 0.2, y0: -0.07, y1: 0.95, uRepeat: 1, segs: SEGS });
  add(boards, new THREE.MeshBasicMaterial({ map: adTex, toneMapped: false, side: THREE.FrontSide }));
  add(boards, new THREE.MeshStandardMaterial({ color: '#26282c', roughness: 0.7, side: THREE.BackSide }));

  // ---- beside the pitch: the two team benches under their clear roofs on the west side,
  // and the grey equipment boxes lined up at the foot of both long stands
  const benchZ = 49.2, kit = [];
  for (const x of [-16, 16]) {
    kit.push(box(11, 0.5, 1.1, x, 0.25, benchZ + 0.5), box(11, 0.08, 2.4, x, 2.25, benchZ + 0.2), box(11, 2.2, 0.08, x, 1.1, benchZ + 1.4));
    for (const dx of [-5.5, 5.5]) kit.push(box(0.08, 2.2, 2.4, x + dx, 1.1, benchZ + 0.2));
  }
  add(merge(kit), new THREE.MeshStandardMaterial({ color: '#dfe3e6', roughness: 0.35, metalness: 0.2 }), true);
  const crates = [], rc = rng(11), wz = wall - D - 2.2;
  for (const sz of [-1, 1]) for (let x = -44; x <= 44; x += 2.9) {
    if (Math.abs(x) < 5 || rc() < 0.12) continue;
    crates.push(box(2.5, 1.15 + rc() * 0.2, 1.3, x, 0.6, sz * (wz - (rc() < 0.3 ? 1.5 : 0))));
  }
  add(merge(crates), new THREE.MeshStandardMaterial({ color: '#8d949b', roughness: 0.8 }), true);

  // ---- lower tier, the walkway behind it, the shaded concourse under the upper tier
  band(wall, 0, lower.baseY + 0.55, paleConcrete);
  const hoard = bandTexture(['GELORA BUNG KARNO', 'JAKARTA', 'SENAYAN', 'INDONESIA'], { bg: '#f1f0ec', fg: '#c8102e', accent: '#1b1c20' });
  hoard.repeat.set(14, 1);
  band(wall - 0.06, 0.25, 1.45, new THREE.MeshStandardMaterial({ map: hoard, roughness: 0.8, side: THREE.DoubleSide }), 1);
  add(tierGeometry(lower), concrete, true);
  const walk = top(lower), front = upper.rx0 - upper.gap / 2;
  slab(back(lower), walk, front + 2.6, walk, concrete);
  band(back(lower) + 0.25, walk, walk + 1.05, steel);
  band(front + 2.6, walk, upper.baseY - 1.1, shade);
  slab(front, upper.baseY - 1.1, front + 2.6, upper.baseY - 1.1, shade);
  const fascia = fasciaTexture();
  fascia.repeat.set(30, 1);
  band(front, upper.baseY - 1.1, upper.baseY + 0.9, new THREE.MeshStandardMaterial({ map: fascia, roughness: 0.85, side: THREE.DoubleSide }), 1);
  // handrail on the parapet
  band(front + 0.02, upper.baseY + 0.9, upper.baseY + 1.02, steel);

  // ---- upper tier, the wall behind its last row, the outer wall of the stadium
  add(tierGeometry(upper), concrete, true);
  const rim = back(upper), rimY = top(upper);
  band(rim + 0.1, rimY, rimY + 1.2, paleConcrete);
  slab(rim + 0.1, rimY, ROOF.column + 0.4, rimY, concrete);
  const facade = band(ROOF.column + 0.4, 0, rimY, new THREE.MeshStandardMaterial({ color: '#bdbbb4', map: tex(grime(), 60, 6), roughness: 0.95, side: THREE.DoubleSide }));
  facade.castShadow = true;

  // ---- stair mouths: the opening, its side walls and the wall across its top
  const slope = Math.atan2(upper.rise, upper.gap), run = 4 * upper.gap, climb = 4 * upper.rise, len = Math.hypot(run, climb);
  const hole = new THREE.PlaneGeometry(3.7, len).rotateX(Math.PI / 2 - slope).translate(0, 1.5 * upper.rise + 0.06, 0);
  const side = x => new THREE.BoxGeometry(0.16, 1.0, len).rotateX(-slope).translate(x, 1.5 * upper.rise + 0.5, 0);
  const walls = mergeGeometries([side(-1.95), side(1.95), new THREE.BoxGeometry(4.06, 1.15, 0.16).translate(0, 3.5 * upper.rise + 0.55, run / 2)]);
  const holes = new THREE.InstancedMesh(hole, new THREE.MeshBasicMaterial({ color: '#0b0b0c', side: THREE.DoubleSide }), venue.mouths.length);
  const rails = new THREE.InstancedMesh(walls, paleConcrete, venue.mouths.length);
  const o3 = new THREE.Object3D();
  venue.mouths.forEach((m, i) => {
    o3.position.set(m.x, m.y, m.z); o3.rotation.set(0, m.yaw, 0); o3.scale.set(1, 1, 1); o3.updateMatrix();
    holes.setMatrixAt(i, o3.matrix); rails.setMatrixAt(i, o3.matrix);
  });
  scene.add(holes, rails);

  // ---- the ring roof: sheeting, trusses, ring lattices, columns, the lamp ring
  const cut = [];
  const sheet = sheetTexture();
  sheet.repeat.set(1, 3);
  const roof = add(loft({ rx: ROOF.inner, rz: ROOF.inner - D, p: 1, y: ROOF.yInner }, { rx: ROOF.outer, rz: ROOF.outer - D, p: 1, y: ROOF.yOuter }, SEGS),
    new THREE.MeshStandardMaterial({ color: '#e4e5e6', map: sheet, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide }), true);
  cut.push(roof);
  const N = 96, span = Math.hypot(ROOF.outer - ROOF.inner, ROOF.yInner - ROOF.yOuter);
  const trusses = new THREE.InstancedMesh(trussGeometry(span, ROOF.depth), steel, N);
  const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.7, 1, 10).translate(0, 0.5, 0), paleConcrete, N);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N * TAU, [x0, z0] = ell(t, ROOF.inner), [x1, z1] = ell(t, ROOF.outer), [xc, zc] = ell(t, ROOF.column);
    o3.position.set(x1, ROOF.yOuter, z1); o3.scale.set(1, 1, Math.hypot(x1 - x0, z1 - z0, ROOF.yInner - ROOF.yOuter));
    o3.lookAt(x0, ROOF.yInner, z0); o3.updateMatrix();
    trusses.setMatrixAt(i, o3.matrix);
    o3.position.set(xc, rimY, zc); o3.rotation.set(0, 0, 0); o3.scale.set(1, roofY(ROOF.column) - ROOF.depth - 0.3 - rimY, 1); o3.updateMatrix();
    columns.setMatrixAt(i, o3.matrix);
  }
  trusses.castShadow = true;
  scene.add(trusses, columns);
  cut.push(trusses, columns);
  const lattice = new THREE.MeshStandardMaterial({ color: '#8f959c', map: latticeTexture(), alphaTest: 0.5, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide });
  for (let r = ROOF.inner + 1; r <= ROOF.outer; r += 10.6) cut.push(band(r, roofY(r) - ROOF.depth - 0.45, roofY(r) - 0.15, lattice, Math.round(r * 5.4 / ROOF.depth / 2)));
  cut.push(band(ROOF.inner, ROOF.yInner - 0.5, ROOF.yInner + 1.3, paleConcrete));
  cut.push(band(ROOF.outer, ROOF.yOuter - 1.2, ROOF.yOuter + 0.6, paleConcrete));
  const lamps = band(ROOF.inner + 0.3, ROOF.yInner - 1.7, ROOF.yInner - 0.5, new THREE.MeshBasicMaterial({ map: lampTexture(), toneMapped: false, side: THREE.DoubleSide }), 150);
  cut.push(lamps);
  // Red and white flags hung under the roof's inner edge.
  const flagTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#d0142c'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f6f6f3'; g.fillRect(0, h / 2, w, h / 2); });
  const flags = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.2, 2.8), new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.9, side: THREE.DoubleSide }), 16);
  for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) / 16 * TAU, [x, z] = ell(t, ROOF.inner - 0.6);
    o3.position.set(x, ROOF.yInner - 3.6, z); o3.scale.set(1, 1, 1); o3.lookAt(0, ROOF.yInner - 3.6, 0); o3.updateMatrix();
    flags.setMatrixAt(i, o3.matrix);
  }
  scene.add(flags);
  cut.push(flags);

  // ---- screens at the two ends, hung under the roof behind the last row
  const score = scoreTexture(brand);
  for (const sx of [-1, 1]) {
    const m = screenMaterial({ a: '#06080d', b: '#14213d', c: '#8fb3ff', tex: score, pixel: 80 });
    const s = add(new THREE.PlaneGeometry(27, 10.5), m);
    s.position.set(sx * (rim + 0.5), rimY + 6.2, 0);
    s.rotation.y = -sx * Math.PI / 2;
    const frame = add(new THREE.BoxGeometry(0.6, 11.3, 27.8), new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.7 }));
    frame.position.set(sx * (rim + 0.85), rimY + 6.2, 0);
    ctx.onTick(tt => { m.uniforms.uTime.value = tt; });
    cut.push(s, frame);
  }
  cut.forEach(m => ctx.cutaway(m));

  // ---- Jakarta beyond the stadium: towers seen through the gap under the roof
  const rnd = rng(2018), towers = 110;
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 }), towers);
  const c = new THREE.Color();
  for (let i = 0; i < towers; i++) {
    const a = rnd() * TAU, r = 560 + rnd() * 500, tall = rnd() ** 2.6;
    o3.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.9);
    o3.rotation.set(0, rnd() * Math.PI, 0);
    o3.scale.set(22 + rnd() * 30, 45 + tall * 150, 22 + rnd() * 30);
    o3.updateMatrix();
    city.setMatrixAt(i, o3.matrix);
    city.setColorAt(i, c.setHSL(0.58 + rnd() * 0.06, 0.06 + rnd() * 0.1, 0.5 + rnd() * 0.25));
  }
  city.userData.noShadow = true;
  scene.add(city);

  ctx.onTick((t, dt) => { adTex.offset.x = (adTex.offset.x + dt * 0.02) % 1; });
}
