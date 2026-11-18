// Detail for the concert arena (venues3d.js buildConcert), the things a real hall has and the
// model lacked: stairs in the aisles with a light on every nosing, handrails down the aisles,
// steel caps on the tier fronts, lit EXIT signs above the vomitories, subwoofers and front
// fills on the stage, a concrete surface with relief, and shading where treads meet risers.
// Everything is merged into a handful of meshes so it costs a few draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const strip = g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; };
const mergeAll = list => (list.length ? mergeGeometries(list.map(strip)) : null);

// A box placed and turned about y.
function placed(w, h, d, x, y, z, yaw) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

// A cylinder from a to b.
function rod(a, b, r, seg = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

// Relief for concrete: a normal map from layered value noise, drawn once.
let concreteNormal;
export function concreteNormalMap() {
  if (concreteNormal) return concreteNormal;
  const N = 256, h = new Float32Array(N * N);
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const [cell, amp] of [[32, 0.5], [16, 0.3], [4, 0.2], [1, 0.12]]) {
    const n = N / cell, g = Array.from({ length: (n + 1) * (n + 1) }, r);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
      const at = (i, j) => g[((j % n) * (n + 1)) + (i % n)];
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      h[y * N + x] += amp * ((at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy);
    }
  }
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N]) * 2.2, dy = (h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x]) * 2.2;
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  concreteNormal = new THREE.CanvasTexture(c);
  concreteNormal.wrapS = concreteNormal.wrapT = THREE.RepeatWrapping;
  return concreteNormal;
}

// The tread material's own shading: each tread darkens towards the riser behind it and under
// the seat, as light would bake there, without a texture per step.
export function treadShading(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vLocal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    sh.fragmentShader = 'varying vec3 vLocal;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        // Unit box: z +0.5 is the back of the tread (the riser of the row behind), y +0.5 its top.
        float back = smoothstep(0.05, 0.5, vLocal.z) * step(0.45, vLocal.y);
        float under = (1. - smoothstep(0.0, 0.35, abs(vLocal.z - 0.1))) * step(0.45, vLocal.y) * 0.35;
        float riser = (1. - smoothstep(0.3, 0.5, vLocal.y)) * step(vLocal.y, 0.45) * 0.25;
        diffuseColor.rgb *= 1. - 0.45 * back - under - riser;
      }`);
  };
  mat.customProgramCacheKey = () => 'atv-tread-1';
  return mat;
}

// Seats grouped by section and row.
function rows(venue) {
  const by = new Map();
  for (const s of venue.seats) {
    if (s.standing || !(s.y > 0.05)) continue;
    const key = s.sec;
    if (!by.has(key)) by.set(key, new Map());
    const sec = by.get(key);
    if (!sec.has(s.ri)) sec.set(s.ri, []);
    sec.get(s.ri).push(s);
  }
  return by;
}

export function buildArenaDetail(ctx, venue) {
  const { scene } = ctx;
  const secs = rows(venue);
  const names = [...secs.keys()];
  const stairs = [], nosing = [], rails = [], exits = [];
  const up = new THREE.Vector3(0, 1, 0);
  // Aisles: where a section's row ends close to the next section's row in the same tier.
  for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) {
    const A = secs.get(names[a]), B = secs.get(names[b]);
    let posts = [];
    for (const [ri, rowA] of A) {
      const rowB = B.get(ri);
      if (!rowB) continue;
      let best = null;
      for (const sa of [rowA[0], rowA[rowA.length - 1]]) for (const sb of [rowB[0], rowB[rowB.length - 1]]) {
        const d = Math.hypot(sa.x - sb.x, sa.z - sb.z);
        if (!best || d < best.d) best = { d, sa, sb };
      }
      if (!best || best.d > 3.2 || Math.abs(best.sa.y - best.sb.y) > 0.2) continue;
      const { sa, sb, d } = best;
      const x = (sa.x + sb.x) / 2, z = (sa.z + sb.z) / 2, y = (sa.y + sb.y) / 2;
      const yaw = Math.atan2(Math.sin(sa.yaw) + Math.sin(sb.yaw), Math.cos(sa.yaw) + Math.cos(sb.yaw));
      const w = Math.max(0.6, d - 0.5), depth = sa.rowDepth;
      // Two steps per row: the tread at the row's level and a half step in front of it.
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const prevRow = A.get(ri - 1), rise = prevRow ? y - prevRow[0].y : Math.min(y, 0.42);
      const hb = rise / 2 + 0.05;
      stairs.push(placed(w, hb, depth / 2, x - fwd.x * depth / 4, y - hb / 2, z - fwd.z * depth / 4, yaw));
      stairs.push(placed(w, hb, depth / 2, x + fwd.x * depth / 4, y - rise / 2 - hb / 2, z + fwd.z * depth / 4, yaw));
      for (const [k, top] of [[-0.015, y], [depth / 2 - 0.015, y - rise / 2]]) {
        nosing.push(placed(w - 0.1, 0.012, 0.025, x + fwd.x * k, top + 0.006, z + fwd.z * k, yaw));
      }
      posts.push({ p: new THREE.Vector3(x, y, z), ri });
    }
    // A handrail down the middle of the aisle: a post on every second row, a rail on top.
    if (posts.length > 3) {
      posts.sort((p, q) => p.ri - q.ri);
      const tops = posts.filter((_, i) => i % 2 === 0 || i === posts.length - 1).map(o => o.p.clone().addScaledVector(up, 0.9));
      tops.forEach((t, i) => {
        rails.push(rod(t.clone().addScaledVector(up, -0.9), t, 0.022));
        if (i) rails.push(rod(tops[i - 1], t, 0.025, 8));
      });
      // An EXIT sign above the top of the aisle.
      const last = posts[posts.length - 1].p, prev = posts[posts.length - 2].p;
      const out = last.clone().sub(prev).setY(0).normalize();
      exits.push({ at: last.clone().addScaledVector(out, 1.2).add(new THREE.Vector3(0, 2.6, 0)), facing: out.clone().negate() });
    }
  }

  const concrete = new THREE.MeshStandardMaterial({ color: '#8f8e89', roughness: 0.92, normalMap: concreteNormalMap(), normalScale: new THREE.Vector2(0.6, 0.6) });
  concrete.normalMap.repeat.set(2, 2);
  const stairMesh = new THREE.Mesh(mergeAll(stairs), concrete);
  stairMesh.receiveShadow = true;
  scene.add(stairMesh);
  // Step lights: dim cool LEDs on every nosing, the only light in the aisles during the show.
  const ledMat = new THREE.MeshBasicMaterial({ color: '#cfe0ff', toneMapped: false });
  ctx.mood({ set v(k) { ledMat.color.setRGB(0.55 + 1.1 * k, 0.62 + 1.2 * k, 0.75 + 1.4 * k); } }, 'v', 0, 1);
  scene.add(new THREE.Mesh(mergeAll(nosing), ledMat));
  scene.add(new THREE.Mesh(mergeAll(rails), new THREE.MeshStandardMaterial({ color: '#c7cbd1', metalness: 0.9, roughness: 0.28 })));

  // EXIT signs: green, lit from inside, readable from across the hall.
  const tex = exitTexture();
  const signGeo = [], frameGeo = [];
  for (const { at, facing } of exits) {
    const yaw = Math.atan2(facing.x, facing.z);
    const g = new THREE.PlaneGeometry(0.9, 0.3); g.rotateY(yaw); g.translate(at.x + facing.x * 0.06, at.y, at.z + facing.z * 0.06);
    signGeo.push(g);
    frameGeo.push(placed(0.96, 0.36, 0.1, at.x, at.y, at.z, yaw));
  }
  if (signGeo.length) {
    const sign = new THREE.Mesh(mergeAll(signGeo), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    ctx.mood({ set v(k) { sign.material.color.setScalar(1 + 1.6 * k); } }, 'v', 0, 1);
    scene.add(sign);
    scene.add(new THREE.Mesh(mergeAll(frameGeo), new THREE.MeshStandardMaterial({ color: '#202124', roughness: 0.6 })));
  }

  // Stage sound: subwoofers stacked under the stage lip and front fills on it.
  const black = new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: 0.75 });
  const grill = new THREE.MeshStandardMaterial({ color: '#1a1b1e', roughness: 0.55, metalness: 0.2, normalMap: grilleNormal(), normalScale: new THREE.Vector2(0.8, 0.8) });
  const subs = [], fronts = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) subs.push(placed(1.15, 0.62, 0.9, sx * (13.5 + i * 1.2), 0.31 + j * 0.63, -33.2, 0));
  for (let i = -3; i <= 3; i++) if (i) fronts.push(placed(0.5, 0.25, 0.35, i * 4.2, 1.95, -34.25, 0));
  const subMesh = new THREE.Mesh(mergeAll(subs), grill); subMesh.castShadow = subMesh.receiveShadow = true;
  scene.add(subMesh, new THREE.Mesh(mergeAll(fronts), black));
}

let grilleTex;
function grilleNormal() {
  if (grilleTex) return grilleTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, 64, 64);
  for (let y = 2; y < 64; y += 4) for (let x = 2; x < 64; x += 4) {
    g.fillStyle = 'rgb(100,100,240)'; g.fillRect(x - 1, y - 1, 1, 2);
    g.fillStyle = 'rgb(156,156,240)'; g.fillRect(x + 1, y - 1, 1, 2);
  }
  grilleTex = new THREE.CanvasTexture(c);
  grilleTex.wrapS = grilleTex.wrapT = THREE.RepeatWrapping;
  grilleTex.repeat.set(4, 3);
  return grilleTex;
}

function exitTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 86;
  const g = c.getContext('2d');
  g.fillStyle = '#0a8a3a'; g.fillRect(0, 0, 256, 86);
  g.fillStyle = '#e9fff0';
  g.font = '700 50px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('EXIT', 150, 46);
  // A running figure, as on the standard sign.
  g.beginPath(); g.arc(46, 22, 7, 0, Math.PI * 2); g.fill();
  g.lineWidth = 7; g.strokeStyle = '#e9fff0'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(44, 32); g.lineTo(38, 52); g.lineTo(26, 70); g.moveTo(38, 52); g.lineTo(52, 64); g.lineTo(58, 76); g.moveTo(42, 38); g.lineTo(58, 44); g.moveTo(42, 38); g.lineTo(28, 46); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
