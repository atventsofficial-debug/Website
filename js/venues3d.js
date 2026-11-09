// Venue architecture for each template: rooms, stages, rigs, pitch, roofs.
// Builders receive the SeatScene as `ctx` and register:
//   ctx.mood(target, key, houseValue, liveValue)  values that blend from "house lights on"
//                                                 (seat map) to "show mode" (seat view)
//   ctx.onTick(fn)                                per-frame animation
//   ctx.cutaway(obj)                              hidden on the map so seats stay visible
//   ctx.keyLight                                  the shadow-casting light
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { superPoint } from './layouts.js';
import { IMAGES } from './media.js';

// ------------------------------------------------------------------ helpers

export function box(w, h, d, x = 0, y = 0, z = 0, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

// Letter-spaced caps for screen artwork.
const spaced = t => t.split('').join(' ').replace(/   /g, '   ');

// mergeGeometries needs matching attributes: drop UVs and indices.
function clean(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n.attributes.uv) n.deleteAttribute('uv');
  return n;
}

function merge(list) {
  // Re-index after merging: instanced seats and crowd are vertex-bound on weak GPUs.
  return mergeVertices(mergeGeometries(list.map(clean)));
}

// Points a downward-facing beam/cone (built along -y) at a world target.
function aim(obj, target) {
  const dir = new THREE.Vector3().subVectors(target, obj.position).normalize();
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
}

function rbox(w, h, d, r, seg, x = 0, y = 0, z = 0, rx = 0) {
  const g = new RoundedBoxGeometry(w, h, d, seg, r);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// Speckled grime for concrete and floors, so large surfaces don't read as flat CG.
let grimeTex;
function grime() {
  if (grimeTex) return grimeTex;
  grimeTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d8d8d6'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    let s = 9;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = 200 + r() * 55 - (r() < 0.02 ? 60 : 0);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: [1, 1] });
  return grimeTex;
}

export const mats = {
  concrete: () => new THREE.MeshStandardMaterial({ color: '#9a9994', map: grime(), roughness: 0.95 }),
  darkConcrete: () => new THREE.MeshStandardMaterial({ color: '#55565a', map: grime(), roughness: 0.95 }),
  steel: () => new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 0.85, roughness: 0.32 }),
  blackMetal: () => new THREE.MeshStandardMaterial({ color: '#16171a', metalness: 0.5, roughness: 0.45 }),
  matteBlack: () => new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.8 }),
  glass: () => new THREE.MeshStandardMaterial({ color: '#c9d4dc', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2, depthWrite: false }),
};

// A vertical strip that follows a superellipse.
export function ribbon({ rx, rz, p, y0, y1, from = 0, to = Math.PI * 2, segs = 180, cx = 0, cz = 0, uRepeat = 24 }) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const [x, z] = superPoint(from + (to - from) * i / segs, rx, rz, p);
    pos.push(cx + x, y0, cz + z, cx + x, y1, cz + z);
    uv.push(i / segs * uRepeat, 0, i / segs * uRepeat, 1);
    if (i < segs) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Surface between two superellipses (roofs, concourse slabs).
export function loft(a, b, segs = 180) {
  const pos = [], uv = [], idx = [];
  const from = a.from ?? 0, to = a.to ?? Math.PI * 2;
  for (let i = 0; i <= segs; i++) {
    const t = from + (to - from) * i / segs;
    const [x0, z0] = superPoint(t, a.rx, a.rz, a.p);
    const [x1, z1] = superPoint(t, b.rx, b.rz, b.p);
    pos.push(x0, a.y, z0, x1, b.y, z1);
    uv.push(i / segs * 40, 0, i / segs * 40, 1);
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function instanceAlong(geo, mat, points, { y = 0, look = null } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, points.length);
  const o = new THREE.Object3D();
  points.forEach((p, i) => {
    o.position.set(p[0], p[1] ?? y, p[2]);
    o.rotation.set(0, p[3] ?? 0, 0);
    if (look) o.lookAt(look);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  return mesh;
}

// Box truss: four chords plus zig-zag lacing, the stock aluminium rig at every show.
function trussGeometry(length, size = 0.42) {
  const parts = [];
  const r = 0.025, h = size / 2;
  for (const [y, z] of [[h, h], [h, -h], [-h, h], [-h, -h]]) {
    const c = new THREE.CylinderGeometry(r, r, length, 5);
    c.rotateZ(Math.PI / 2);
    c.translate(0, y, z);
    parts.push(c);
  }
  const n = Math.max(2, Math.round(length / size));
  const step = length / n;
  const diag = Math.hypot(step, size);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i + 0.5) * step;
    for (const [face, sgn] of [[h, 1], [-h, -1]]) {
      const d = new THREE.CylinderGeometry(r * 0.6, r * 0.6, diag, 4);
      d.rotateZ(Math.atan2(step, size) * (i % 2 ? 1 : -1));
      d.translate(x, 0, face);
      parts.push(d);
      const d2 = new THREE.CylinderGeometry(r * 0.6, r * 0.6, diag, 4);
      d2.rotateX(Math.PI / 2);
      d2.rotateY(Math.atan2(step, size) * (i % 2 ? 1 : -1) * sgn);
      d2.translate(x, face, 0);
      parts.push(d2);
    }
  }
  return merge(parts);
}

// Soft volumetric beam: fades along its length and towards its edges. `userData.beam`
// lets a scene soften all of them (SeatScene.showFrom).
function beamMaterial(color) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    // Clamped: on the cone's long, thin triangles the interpolated values can overshoot. One
    // such pixel went past what the bloom's half-float buffers hold, and the bloom spread it
    // into a black box over the picture.
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uOpacity;
      void main(){ float along = pow(clamp(vUv.y, 0.0, 1.0), 1.6); float edge = pow(min(abs(dot(vN, vV)), 1.0), 1.4);
        gl_FragColor = vec4(uColor, along * edge * uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  m.userData.beam = true;
  return m;
}

function beam(color, length, radius) {
  const g = new THREE.CylinderGeometry(0.08, radius, length, 28, 1, true);
  g.translate(0, -length / 2, 0);
  return new THREE.Mesh(g, beamMaterial(color));
}

// LED screen: content shader with an optional texture (logo, scoreboard) composited on top.
function screenMaterial({ a = '#1b1f2e', b = '#c9a27a', c = '#f2efe9', tex = null, pixel = 140 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uLevel: { value: 1 },
      uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uC: { value: new THREE.Color(c) },
      uTex: { value: tex }, uHasTex: { value: tex ? 1 : 0 }, uPix: { value: pixel },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime, uLevel, uHasTex, uPix; uniform vec3 uA, uB, uC; uniform sampler2D uTex;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){
        vec2 p = vUv;
        float g = smoothstep(0.0, 1.0, p.y + 0.15 * sin(p.x * 3.0 + uTime * 0.35));
        vec3 col = mix(uA, uB, g * 0.85);
        float streak = smoothstep(0.02, 0.0, abs(fract(p.y * 3.0 - uTime * 0.08) - 0.5) - 0.46);
        col += uC * streak * 0.25;
        if (uHasTex > 0.5) { vec4 t = texture2D(uTex, p); col = mix(col, t.rgb, t.a); }
        vec2 cell = fract(p * vec2(uPix * 1.8, uPix));
        float led = smoothstep(0.0, 0.18, cell.x) * smoothstep(1.0, 0.82, cell.x) * smoothstep(0.0, 0.18, cell.y) * smoothstep(1.0, 0.82, cell.y);
        col *= 0.75 + 0.25 * led;
        col *= 0.96 + 0.04 * hash(floor(p * uPix) + floor(uTime * 8.0));
        gl_FragColor = vec4(col * uLevel, 1.0);
      }`,
    toneMapped: false,
  });
}

function textTexture(w, h, draw) {
  return canvasTex(w, h, (g, W, H) => { g.clearRect(0, 0, W, H); draw(g, W, H); });
}

// Tour artwork for LED walls: the name shrinks until it fits, so long names stay whole.
function logoTexture(brand) {
  return textTexture(1024, 512, (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.textAlign = 'center';
    let size = 118;
    do { g.font = `300 ${size}px "Urbanist", "Helvetica Neue", Arial, sans-serif`; size -= 4; } while (size > 40 && g.measureText(brand.wall).width > w * 0.9);
    g.fillText(brand.wall, w / 2, h / 2 - 10);
    g.font = '500 30px "Urbanist", "Helvetica Neue", Arial, sans-serif';
    g.fillText(spaced(brand.sub), w / 2, h / 2 + 60);
  });
}

// ------------------------------------------------------------------ the show's poster

// A concert with its own artwork shows it on the stage screens. The image is fetched before
// the venue is built (SeatScene.load), so the first frame already has it; without it the
// screens show the tour name. `meta`: the concert (an entry of EVENTS).
const posters = new Map(), posterImgs = new Map();
const posterSrc = meta => IMAGES[meta?.image]?.src || '';

export function preparePoster(meta) {
  const src = posterSrc(meta);
  if (!src) return null;
  if (!posters.has(src)) {
    posters.set(src, new Promise(resolve => {
      const img = new Image();
      img.onload = () => { posterImgs.set(src, img); resolve(img); };
      img.onerror = () => { posters.delete(src); resolve(null); };
      img.src = src;
    }));
  }
  // A slow image never holds the venue back for long.
  return Promise.race([posters.get(src), new Promise(r => setTimeout(r, 4000))]);
}

// The poster on a screen of the given shape: whole, as large as it fits, over a dark soft
// copy of itself (drawn tiny, then stretched) that fills the rest. A light poster is dimmed
// to about the brightness of a dark one, or the bloom turns the screen into a white glare.
function posterTexture(img, aspect) {
  return canvasTex(1024, Math.round(1024 / aspect), (g, w, h) => {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const soft = document.createElement('canvas');
    soft.width = 24; soft.height = Math.max(6, Math.round(24 / aspect));
    const k = Math.max(soft.width / iw, soft.height / ih);
    soft.getContext('2d').drawImage(img, (soft.width - iw * k) / 2, (soft.height - ih * k) / 2, iw * k, ih * k);
    g.imageSmoothingQuality = 'high';
    g.drawImage(soft, 0, 0, w, h);
    g.fillStyle = 'rgba(0, 0, 0, 0.5)';
    g.fillRect(0, 0, w, h);
    const f = Math.min(w / iw, h / ih);
    g.drawImage(img, (w - iw * f) / 2, (h - ih * f) / 2, iw * f, ih * f);
    const light = meanLight(soft);
    if (light > POSTER_LIGHT) {
      g.fillStyle = `rgba(0, 0, 0, ${1 - POSTER_LIGHT / light})`;
      g.fillRect(0, 0, w, h);
    }
  });
}

// Mean lightness (0 to 1) of a small canvas; 0 when the browser will not read it back.
const POSTER_LIGHT = 0.22;
function meanLight(c) {
  try {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4) / 255;
  } catch { return 0; }
}

// Artwork for a venue's screens, one texture per screen shape: the poster once it has
// loaded, else the tour name. Each is marked with its screen's shape, so another show's
// poster can take its place (posterArt, SeatScene.setPoster).
function screenArt(brand, venue) {
  const img = posterImgs.get(posterSrc(venue.meta));
  const made = new Map();
  return aspect => {
    const key = aspect.toFixed(2);
    if (!made.has(key)) {
      const t = img ? posterTexture(img, aspect) : logoTexture(brand);
      t.userData.screen = aspect;
      made.set(key, t);
    }
    return made.get(key);
  };
}

// A show's poster for a screen of that shape, once preparePoster has fetched it; else null.
export function posterArt(meta, aspect) {
  const img = posterImgs.get(posterSrc(meta));
  if (!img) return null;
  const t = posterTexture(img, aspect);
  t.userData.screen = aspect;
  return t;
}

// Scrolling LED band (ad boards, ribbon boards).
function bandTexture(words, { bg = '#0b0b0d', fg = '#ffffff', accent = '#d21f2f' } = {}) {
  const t = canvasTex(2048, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = '600 38px "Urbanist", "Helvetica Neue", Arial, sans-serif';
    g.textBaseline = 'middle';
    let x = 20, i = 0;
    while (x < w) {
      const word = words[i % words.length];
      g.fillStyle = i % 3 === 1 ? accent : fg;
      g.fillText(word, x, h / 2 + 2);
      x += g.measureText(word).width + 90;
      i++;
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function crowdBarrier(length) {
  const parts = [];
  const n = Math.round(length / 1.0);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i + 0.5) * (length / n);
    parts.push(box(0.98, 0.05, 0.05, x, 1.15, 0), box(0.04, 1.15, 0.04, x - 0.47, 0.58, 0), box(0.98, 0.9, 0.02, x, 0.6, 0.02));
    parts.push(box(0.06, 0.04, 0.9, x - 0.47, 0.02, 0.4));
  }
  return merge(parts);
}

function curtain(width, height, folds = 14) {
  const g = new THREE.PlaneGeometry(width, height, folds * 6, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / width) * folds * Math.PI * 2) * 0.12);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ concert

export function buildConcert(ctx, venue) {
  const brand = { wall: 'NADA SENJA', sub: 'LIVE · ARENA TOUR 2026', band: ['NADA SENJA LIVE', 'ARENA TOUR 2026', 'NUSANTARA ARENA', 'ENJOY THE SHOW'], ...venue.branding };
  const { scene } = ctx;
  ctx.setAtmosphere({ house: '#3a3b40', live: '#050608', fogNear: [90, 50], fogFar: [220, 150], exposure: [1.0, 1.05] });

  const hemi = new THREE.HemisphereLight('#f3f1ec', '#3c3b38', 1);
  ctx.mood(hemi, 'intensity', 1.1, 0.05);
  scene.add(hemi);
  const key = ctx.addKeyLight({ pos: [18, 44, 26], target: [0, 0, -6], half: 60, house: 2.2, live: 0.05 });
  key.color.set('#fff6ea');

  // Hall shell: dark acoustic walls, concrete floor.
  const W = 108, D = 120, H = 44, CZ = -4;
  const wallMat = new THREE.MeshStandardMaterial({ color: '#2b2c30', roughness: 0.95, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
  room.position.set(0, H / 2 - 0.02, CZ);
  room.receiveShadow = true;
  scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#4a4a4c', map: grime(), roughness: 0.42, metalness: 0.05 }));
  floor.material.map = grime().clone(); floor.material.map.repeat.set(12, 12); floor.material.map.needsUpdate = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = CZ;
  floor.receiveShadow = true;
  scene.add(floor);

  // Roof grid of trusses and house lights.
  const steel = mats.steel();
  const roofTruss = trussGeometry(D * 0.94, 0.9);
  for (let i = -3; i <= 3; i++) {
    const t = new THREE.Mesh(roofTruss, mats.blackMetal());
    t.rotation.y = Math.PI / 2;
    t.position.set(i * 14, H - 3, CZ);
    scene.add(t);
    ctx.cutaway(t); // the map camera flies at roof height
  }
  const lampGeo = new THREE.CylinderGeometry(0.45, 0.6, 0.6, 12);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#202124', emissive: '#fff1d6', emissiveIntensity: 1 });
  ctx.mood(lampMat, 'emissiveIntensity', 2.2, 0.05);
  const lampPts = [];
  for (let i = -3; i <= 3; i++) for (let j = 0; j < 9; j++) lampPts.push([i * 14, H - 3.8, CZ - D / 2 + 10 + j * 12.5]);
  const lamps = instanceAlong(lampGeo, lampMat, lampPts);
  scene.add(lamps);
  ctx.cutaway(lamps);

  // Stage.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(36, 1.8, 13), new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 0.3 }));
  deck.position.set(0, 0.9, -40.5);
  deck.receiveShadow = deck.castShadow = true;
  scene.add(deck);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(36, 1.8), new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.9 }));
  skirt.position.set(0, 0.9, -33.99);
  scene.add(skirt);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(36, 0.04, 0.06), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  lip.position.set(0, 1.82, -34);
  scene.add(lip);
  // Risers for the band.
  for (const [x, w] of [[-8, 5], [0, 6], [8, 5]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, 3), mats.matteBlack());
    r.position.set(x, 2.1, -44);
    r.castShadow = r.receiveShadow = true;
    scene.add(r);
  }
  // Drum kit stand-in and mic stands.
  const kit = new THREE.Group();
  [[0, 0.45], [-0.8, 0.35], [0.8, 0.35], [-0.4, 0.3], [0.4, 0.3]].forEach(([x, r], i) => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, i ? 0.25 : 0.55, 20), new THREE.MeshStandardMaterial({ color: i ? '#d9d7d2' : '#1a1a1d', roughness: 0.4 }));
    d.rotation.x = i ? 0.3 : Math.PI / 2;
    d.position.set(x, i ? 0.9 : 0.5, i ? -0.3 : 0);
    kit.add(d);
  });
  kit.position.set(0, 2.4, -44);
  scene.add(kit);
  for (const x of [-6, 0, 6]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), mats.blackMetal());
    m.position.set(x, 2.6, -36.5);
    scene.add(m);
  }

  // Video wall and IMAG screens with the show's poster, or the tour name.
  const art = screenArt(brand, venue);
  const wallMatLed = screenMaterial({ a: '#0e1018', b: '#7a4a35', c: '#ffd9b0', tex: art(30 / 13), pixel: 120 });
  ctx.mood(wallMatLed.uniforms.uLevel, 'value', 0.7, 1.35);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 13), wallMatLed);
  wall.position.set(0, 9.2, -46.6);
  scene.add(wall);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(30.6, 13.6, 0.5), mats.matteBlack());
  frame.position.set(0, 9.2, -46.9);
  scene.add(frame);
  for (const sx of [-1, 1]) {
    const imag = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.06), screenMaterial({ a: '#0e1018', b: '#7a4a35', c: '#ffd9b0', tex: art(9 / 5.06), pixel: 60 }));
    ctx.mood(imag.material.uniforms.uLevel, 'value', 0.7, 1.35);
    imag.position.set(sx * 24, 11, -38);
    imag.rotation.y = -sx * 0.32;
    scene.add(imag);
    ctx.onTick(t => { imag.material.uniforms.uTime.value = t; });
    const back = new THREE.Mesh(new THREE.BoxGeometry(9.4, 5.4, 0.3), mats.matteBlack());
    back.position.copy(imag.position).add(new THREE.Vector3(sx * 0.05, 0, -0.17));
    back.rotation.y = imag.rotation.y;
    scene.add(back);
    // Line arrays: twelve cabinets curving down, flown left and right of the stage.
    for (let k = 0; k < 12; k++) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 0.9), mats.matteBlack());
      cab.position.set(sx * 19.2, 16.5 - k * 0.44, -35.6 + Math.pow(k / 11, 2) * 0.6);
      cab.rotation.x = Math.pow(k / 11, 2) * 0.5;
      cab.castShadow = true;
      scene.add(cab);
    }
  }

  // Ground-supported truss towers and the lighting rig.
  const span = new THREE.Mesh(trussGeometry(38, 0.5), steel);
  span.position.set(0, 17.6, -36);
  scene.add(span);
  const back = new THREE.Mesh(trussGeometry(38, 0.5), steel);
  back.position.set(0, 19, -45.5);
  scene.add(back);
  for (const sx of [-1, 1]) for (const z of [-36, -45.5]) {
    const tower = new THREE.Mesh(trussGeometry(z === -36 ? 17.6 : 19, 0.5), steel);
    tower.rotation.z = Math.PI / 2;
    tower.position.set(sx * 18.8, (z === -36 ? 17.6 : 19) / 2, z);
    scene.add(tower);
  }
  const beamColors = ['#fff4e0', '#ffd7a8', '#e8eeff'];
  const beams = [];
  const headGeo = merge([box(0.45, 0.35, 0.45, 0, 0.15, 0), new THREE.CylinderGeometry(0.2, 0.24, 0.45, 12).translate(0, -0.2, 0)]);
  for (let i = 0; i < 12; i++) {
    const x = -16.5 + i * 3;
    const head = new THREE.Mesh(headGeo, mats.matteBlack());
    head.position.set(x, 17.0, -36);
    scene.add(head);
    const b = beam(beamColors[i % 3], 34, 2.6);
    b.position.set(x, 16.7, -36);
    scene.add(b);
    ctx.mood(b.material.uniforms.uOpacity, 'value', 0.0, 0.32);
    beams.push(b);
  }
  // Real stage lighting.
  const wash = new THREE.SpotLight('#ffe0bf', 1, 70, 0.55, 0.6, 1.2);
  wash.position.set(0, 24, -20);
  wash.target.position.set(0, 2, -42);
  ctx.mood(wash, 'intensity', 0, 2600);
  scene.add(wash, wash.target);
  const back1 = new THREE.PointLight('#ff9d5c', 1, 40, 1.5);
  back1.position.set(0, 14, -44);
  ctx.mood(back1, 'intensity', 0, 260);
  scene.add(back1);
  const audience = new THREE.HemisphereLight('#3a3f5c', '#000000', 1);
  ctx.mood(audience, 'intensity', 0, 0.35);
  scene.add(audience);

  // Barricade and front-of-house mix position.
  const barrier = new THREE.Mesh(crowdBarrier(30), mats.steel());
  barrier.position.set(0, 0, -31.4);
  scene.add(barrier);
  const foh = new THREE.Group();
  const deckF = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 4), mats.matteBlack()); deckF.position.y = 0.25;
  const desk = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1), new THREE.MeshStandardMaterial({ color: '#222326', roughness: 0.5 })); desk.position.set(0, 1, 0.3);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.12, 4.2), new THREE.MeshStandardMaterial({ color: '#1b1b1d' })); roof.position.y = 3.4;
  foh.add(deckF, desk, roof);
  for (const [x, z] of [[-3.4, -1.9], [3.4, -1.9], [-3.4, 1.9], [3.4, 1.9]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), mats.steel()); leg.position.set(x, 1.8, z); foh.add(leg);
  }
  foh.position.set(0, 0, -4.5);
  foh.traverse(o => { o.castShadow = o.receiveShadow = true; });
  scene.add(foh);

  // Tier front walls with glass balustrade and a ribbon board on the upper tier.
  const opts = { cx: 0, cz: -10, p: 0.62, from: -38 * Math.PI / 180, to: 218 * Math.PI / 180 };
  const front = new THREE.MeshStandardMaterial({ color: '#3b3c40', map: grime(), roughness: 0.9, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(ribbon({ ...opts, rx: 23.4, rz: 29.4, y0: 0, y1: 1.7 }), front));
  scene.add(new THREE.Mesh(ribbon({ ...opts, rx: 23.4, rz: 29.4, y0: 1.7, y1: 2.7 }), mats.glass()));
  scene.add(new THREE.Mesh(ribbon({ ...opts, rx: 36.8, rz: 42.8, y0: 6.9, y1: 9.9 }), front));
  scene.add(new THREE.Mesh(ribbon({ ...opts, rx: 36.8, rz: 42.8, y0: 9.9, y1: 10.9 }), mats.glass()));
  const bandTex = bandTexture(brand.band, { fg: '#f4f1ea', accent: '#d9b48a' });
  bandTex.repeat.set(6, 1);
  const band = new THREE.Mesh(ribbon({ ...opts, rx: 36.75, rz: 42.75, y0: 8.6, y1: 9.5, uRepeat: 1 }), new THREE.MeshBasicMaterial({ map: bandTex, toneMapped: false, side: THREE.DoubleSide }));
  scene.add(band);

  ctx.onTick((t, dt) => {
    wallMatLed.uniforms.uTime.value = t;
    bandTex.offset.x = (bandTex.offset.x + dt * 0.01) % 1;
    beams.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.45 + i * 0.7) * 0.42;
      b.rotation.x = 0.42 + Math.sin(t * 0.33 + i * 1.3) * 0.22;
    });
  });
}

// ------------------------------------------------------------------ cinema

// The screen glow is a rect-area light, whose lookup tables weigh about 300 KB. They are
// fetched only when a cinema is opened.
let areaLights = false;
export async function prepareVenue(kind) {
  if (kind !== 'cinema' || areaLights) return;
  const { RectAreaLightUniformsLib } = await import('three/addons/lights/RectAreaLightUniformsLib.js');
  RectAreaLightUniformsLib.init();
  areaLights = true;
}

export function buildCinema(ctx, venue) {
  const { scene } = ctx;
  if (!areaLights) throw new Error('call prepareVenue("cinema") first');
  ctx.setAtmosphere({ house: '#121012', live: '#040304', exposure: [1.0, 1.1] });

  const W = 18.6, D = 27, H = 10, CZ = -2.5;
  // Acoustic wall panels.
  const panels = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#2a2224'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) {
      const grd = g.createLinearGradient(x, 0, x + 64, 0);
      grd.addColorStop(0, '#231c1e'); grd.addColorStop(0.5, '#33292b'); grd.addColorStop(1, '#1d1718');
      g.fillStyle = grd; g.fillRect(x + 2, 0, 60, h);
    }
  }, { repeat: [8, 1] });
  const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshStandardMaterial({ map: panels, roughness: 0.95, side: THREE.BackSide }));
  room.position.set(0, H / 2, CZ);
  room.receiveShadow = true;
  scene.add(room);
  const carpet = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3a141b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},${20 + Math.random() * 20},${30},0.25)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, { repeat: [10, 14] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.01, CZ);
  floor.receiveShadow = true;
  scene.add(floor);

  // Screen, masking and the light it throws on the audience.
  const movie = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime, uLevel;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n(p); p *= 2.0; a *= 0.5; } return v; }
      void main(){
        vec2 p = vUv; float hz = 0.4;
        vec3 sky = mix(vec3(1.0,0.62,0.36), vec3(0.18,0.2,0.36), smoothstep(hz, 1.0, p.y));
        float cl = fbm(vec2(p.x * 3.0 + uTime * 0.02, p.y * 6.0));
        sky = mix(sky, vec3(0.95,0.7,0.6), smoothstep(0.55, 0.8, cl) * smoothstep(hz, 0.9, p.y) * 0.6);
        vec3 sea = mix(vec3(0.03,0.04,0.08), vec3(0.45,0.26,0.2), smoothstep(0.0, hz, p.y));
        sea += vec3(1.0,0.6,0.3) * smoothstep(0.06, 0.0, abs(p.x - 0.55)) * fbm(vec2(p.x*40.0, p.y*80.0 - uTime)) * 0.6 * step(p.y, hz);
        vec3 col = p.y > hz ? sky : sea;
        col += vec3(1.0,0.75,0.45) * smoothstep(0.09, 0.0, length((p - vec2(0.55, hz + 0.08)) * vec2(2.4, 1.0)));
        col *= 0.9 + 0.1 * h(p * 400.0 + uTime);
        col *= smoothstep(0.0, 0.25, p.x) * smoothstep(1.0, 0.75, p.x) * 0.35 + 0.65;
        gl_FragColor = vec4(col * uLevel, 1.0);
      }`,
    toneMapped: false,
  });
  ctx.mood(movie.uniforms.uLevel, 'value', 0.45, 1.0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(16.4, 6.86), movie);
  screen.position.set(0, 5.3, -15.6);
  scene.add(screen);
  const mask = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: '#050505', roughness: 1 }));
  mask.position.set(0, H / 2, -15.7);
  scene.add(mask);
  const stage = new THREE.Mesh(new THREE.BoxGeometry(W, 0.9, 1.4), mats.matteBlack());
  stage.position.set(0, 0.45, -15.1);
  scene.add(stage);
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(curtain(2.2, 8.8), new THREE.MeshStandardMaterial({ color: '#5a0d18', roughness: 0.85, side: THREE.DoubleSide }));
    c.position.set(sx * 8.4, 4.8, -15.3);
    scene.add(c);
  }
  const screenLight = new THREE.RectAreaLight('#ffc89a', 1, 16, 6.8);
  screenLight.position.set(0, 5.3, -15.4);
  screenLight.lookAt(0, 3, 10);
  ctx.mood(screenLight, 'intensity', 0.6, 4.5);
  scene.add(screenLight);

  // Red LED lines on the side walls, as in the reference.
  const red = new THREE.MeshStandardMaterial({ color: '#2a0004', emissive: '#ff1e3c', emissiveIntensity: 2.2 });
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 7), red);
    s.position.set(sx * (W / 2 - 0.04), 2.2 + i * 0.95, -11.2);
    s.rotation.x = (i - 3) * 0.05;
    scene.add(s);
  }
  // Ceiling: small downlights (house) and pin-prick stars.
  const down = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffe6c4', emissiveIntensity: 1 });
  ctx.mood(down, 'emissiveIntensity', 2.5, 0.15);
  const pts = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) pts.push([-7 + i * 3.5, H - 0.05, -12 + j * 4.2]);
  scene.add(instanceAlong(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16), down, pts));
  const houseKey = ctx.addKeyLight({ pos: [3, 18, 8], target: [0, 0, -2], half: 16, house: 1.6, live: 0.0 });
  houseKey.color.set('#ffe9cf');
  const hemi = new THREE.HemisphereLight('#ffe8d6', '#2a1416', 1);
  ctx.mood(hemi, 'intensity', 0.9, 0.04);
  scene.add(hemi);

  // Aisle step lights.
  const amber = new THREE.MeshStandardMaterial({ color: '#2a1a05', emissive: '#ffb547', emissiveIntensity: 2 });
  const steps = [];
  for (let r = 0; r < 14; r++) for (const x of [-3.95, 3.95, -8.6, 8.6]) steps.push([x, Math.max(0, r - 2) * 0.36 + 0.03, -7.2 + r * 1.12 - 0.55]);
  scene.add(instanceAlong(new THREE.BoxGeometry(0.5, 0.03, 0.03), amber, steps));
  // Exit signs.
  const exitTex = textTexture(256, 96, (g, w, h) => {
    g.fillStyle = '#0d7a3e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = '700 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', w / 2, h / 2 + 2);
  });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: exitTex, toneMapped: false }));
    e.position.set(sx * (W / 2 - 0.02), 7.4, 7.5);
    e.rotation.y = -sx * Math.PI / 2;
    scene.add(e);
  }
  ctx.onTick(t => { movie.uniforms.uTime.value = t; });
}

// ------------------------------------------------------------------ combat

export function buildCombat(ctx, venue) {
  const brand = { mark: 'GARUDA', sub: 'FIGHT NIGHT 12', hall: 'SATRIA HALL', title: 'GARUDA FIGHT NIGHT 12', ...venue.branding };
  const { scene } = ctx;
  ctx.setAtmosphere({ house: '#34353a', live: '#040405', fogNear: [70, 40], fogFar: [190, 130], exposure: [1.0, 1.1] });
  const hemi = new THREE.HemisphereLight('#f2f0ea', '#33322f', 1);
  ctx.mood(hemi, 'intensity', 1.05, 0.04);
  scene.add(hemi);
  ctx.addKeyLight({ pos: [16, 44, 20], target: [0, 0, 0], half: 50, house: 2.0, live: 0.0 });

  // A compact venue is a studio: smaller, lower hall, no upper tier.
  const compact = venue.compact;
  const W = compact ? 52 : 104, H = compact ? 20 : 44, lampStep = compact ? 7 : 13;
  const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, W), new THREE.MeshStandardMaterial({ color: '#28292d', roughness: 0.95, side: THREE.BackSide }));
  room.position.y = H / 2 - 0.02;
  scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshStandardMaterial({ color: '#2f3034', roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#202124', emissive: '#fff1d6', emissiveIntensity: 1 });
  ctx.mood(lampMat, 'emissiveIntensity', compact ? 0.8 : 2.2, 0.03);
  // The studio's lamps sit flush with its low ceiling, smaller and dimmer, so they do
  // not bloom across the view from the overview camera just above them.
  const lampPts = [], lampY = compact ? H - 0.4 : H - 3.8;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (Math.abs(i) > 1 || Math.abs(j) > 1) lampPts.push([i * lampStep, lampY, j * lampStep]);
  scene.add(instanceAlong(compact ? new THREE.CylinderGeometry(0.26, 0.34, 0.3, 12) : new THREE.CylinderGeometry(0.45, 0.6, 0.6, 12), lampMat, lampPts));

  // Octagon: printed canvas, skirt, padded posts and chain-link fence.
  const mat = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#c8c6be'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d6d3cb'; g.lineWidth = 3;
    g.beginPath(); g.arc(w / 2, h / 2, 330, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#16171a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '300 92px "Urbanist", "Helvetica Neue", Arial, sans-serif';
    g.fillText(brand.mark, w / 2, h / 2 - 34);
    g.font = '500 34px "Urbanist", "Helvetica Neue", Arial, sans-serif';
    g.fillText(spaced(brand.sub), w / 2, h / 2 + 46);
    g.font = '500 26px Arial'; g.fillStyle = '#9a978f';
    for (let i = 0; i < 8; i++) { g.save(); g.translate(w / 2, h / 2); g.rotate(i * Math.PI / 4 + Math.PI / 8); g.fillText(brand.hall, 0, -410); g.restore(); }
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.35, 5.5, 1.1, 8), new THREE.MeshStandardMaterial({ color: '#111114', roughness: 0.6 }));
  base.rotation.y = Math.PI / 8;
  base.position.y = 0.55;
  base.castShadow = base.receiveShadow = true;
  scene.add(base);
  const top = new THREE.Mesh(new THREE.CircleGeometry(5.3, 8), new THREE.MeshStandardMaterial({ map: mat, roughness: 0.85 }));
  top.rotation.x = -Math.PI / 2;
  top.rotation.z = Math.PI / 8;
  top.position.y = 1.11;
  top.receiveShadow = true;
  scene.add(top);
  const link = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(25,25,28,1)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke();
  }, { repeat: [26, 10] });
  const fenceMat = new THREE.MeshStandardMaterial({ map: link, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4, color: '#2a2a2e' });
  const padMat = new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.55 });
  const r = 5.2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, a2 = a + Math.PI / 4;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.1, 10), padMat);
    post.position.set(Math.cos(a) * r, 2.15, Math.sin(a) * r);
    post.castShadow = true;
    scene.add(post);
    const mid = new THREE.Vector3((Math.cos(a) + Math.cos(a2)) * r / 2, 2.15, (Math.sin(a) + Math.sin(a2)) * r / 2);
    const len = 2 * r * Math.sin(Math.PI / 8);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.85), fenceMat);
    panel.position.copy(mid);
    panel.lookAt(0, 2.15, 0);
    panel.castShadow = true;
    scene.add(panel);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len, 10), padMat);
    pad.position.set(mid.x, 3.15, mid.z);
    pad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a2) - Math.cos(a), 0, Math.sin(a2) - Math.sin(a)).normalize());
    scene.add(pad);
  }
  // Judges' tables.
  for (const [x, z, ry] of [[0, 6.4, 0], [6.4, 0, Math.PI / 2], [-6.4, 0, -Math.PI / 2]]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.7), new THREE.MeshStandardMaterial({ color: '#1a1a1d', roughness: 0.6 }));
    t.position.set(x, 0.4, z);
    t.rotation.y = ry;
    t.castShadow = true;
    scene.add(t);
  }

  // Square lighting truss over the cage with downlights.
  const steel = mats.steel();
  for (const [x, z, ry] of [[0, -7, 0], [0, 7, 0], [-7, 0, Math.PI / 2], [7, 0, Math.PI / 2]]) {
    const t = new THREE.Mesh(trussGeometry(14.4, 0.5), steel);
    t.position.set(x, 12, z);
    t.rotation.y = ry;
    scene.add(t);
  }
  const par = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#fff8ea', emissiveIntensity: 1 });
  ctx.mood(par, 'emissiveIntensity', 0.4, 4);
  const parPts = [];
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) { parPts.push([i * 2, 11.6, s * 7]); parPts.push([s * 7, 11.6, i * 2]); }
  scene.add(instanceAlong(new THREE.CylinderGeometry(0.18, 0.22, 0.4, 10), par, parPts));
  const cageLight = new THREE.SpotLight('#fff6e8', 1, 40, 0.6, 0.45, 1.3);
  cageLight.position.set(0, 13, 0);
  cageLight.target.position.set(0, 1, 0);
  cageLight.castShadow = true;
  cageLight.shadow.mapSize.set(1024, 1024);
  ctx.mood(cageLight, 'intensity', 260, 420);
  scene.add(cageLight, cageLight.target);
  const beams = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const b = beam('#fff3dd', 13, 3.8);
    b.position.set(Math.cos(a) * 5, 12, Math.sin(a) * 5);
    aim(b, new THREE.Vector3(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5));
    ctx.mood(b.material.uniforms.uOpacity, 'value', 0.0, 0.16);
    scene.add(b);
    beams.push(b);
  }
  const fill = new THREE.HemisphereLight('#4a4c5c', '#000', 1);
  ctx.mood(fill, 'intensity', 0, 0.3);
  scene.add(fill);

  // Centre-hung scoreboard.
  const sb = textTexture(1024, 576, (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.textAlign = 'center';
    g.font = '300 96px "Urbanist", Arial, sans-serif'; g.fillText('ROUND 2', w / 2, 210);
    g.font = '500 150px "Urbanist", Arial, sans-serif'; g.fillText('3:42', w / 2, 400);
    g.font = '500 34px Arial'; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText(brand.title, w / 2, 500);
  });
  const sbMat = screenMaterial({ a: '#08090c', b: '#2a1012', c: '#ff6b6b', tex: sb, pixel: 70 });
  ctx.mood(sbMat.uniforms.uLevel, 'value', 0.8, 1.2);
  const cube = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.94), sbMat);
    const a = (i / 4) * Math.PI * 2;
    s.position.set(Math.sin(a) * 3.52, 0, Math.cos(a) * 3.52);
    s.rotation.y = a;
    cube.add(s);
  }
  cube.add(new THREE.Mesh(new THREE.BoxGeometry(7, 4.3, 7), mats.matteBlack()));
  cube.position.set(0, compact ? 16.5 : 19.5, 0);
  scene.add(cube);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#3a3b40', map: grime(), roughness: 0.9, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(ribbon({ rx: 15, rz: 15, p: 0.55, y0: 0, y1: 1.6 }), wallMat));
  scene.add(new THREE.Mesh(ribbon({ rx: 15, rz: 15, p: 0.55, y0: 1.6, y1: 2.5 }), mats.glass()));
  // The ad band runs along the upper tier's front, or in a studio along the wall behind the stand.
  const band = compact ? { r: 20.4, y0: 4.2, y1: 5.0 } : { r: 29.35, y0: 9.1, y1: 9.9 };
  if (compact) scene.add(new THREE.Mesh(ribbon({ rx: 20.45, rz: 20.45, p: 0.55, y0: 0, y1: 7 }), wallMat));
  else scene.add(new THREE.Mesh(ribbon({ rx: 29.4, rz: 29.4, p: 0.55, y0: 7, y1: 10.2 }), wallMat));
  const bandTex = bandTexture([brand.title, brand.hall, 'LIVE ON ATVENTS', 'MAIN CARD'], { fg: '#f4f1ea', accent: '#e23a3a' });
  bandTex.repeat.set(compact ? 3 : 5, 1);
  scene.add(new THREE.Mesh(ribbon({ rx: band.r, rz: band.r, p: 0.55, y0: band.y0, y1: band.y1, uRepeat: 1 }), new THREE.MeshBasicMaterial({ map: bandTex, toneMapped: false, side: THREE.DoubleSide })));
  if (!compact) scene.add(new THREE.Mesh(ribbon({ rx: 29.4, rz: 29.4, p: 0.55, y0: 10.2, y1: 11.1 }), mats.glass()));

  ctx.onTick((t, dt) => {
    sbMat.uniforms.uTime.value = t;
    cube.rotation.y = t * 0.05;
    bandTex.offset.x = (bandTex.offset.x + dt * 0.012) % 1;
  });
}

// ------------------------------------------------------------------ stadium

// Football by day; with `venue.show` ('end' or 'round') the same bowl hosts a night
// concert: the pitch is covered, and a touring stage stands at one end or in the middle.
export function buildStadium(ctx, venue) {
  const show = venue.show;
  const brand = show
    ? { wall: 'LIVE', sub: 'STADIUM SHOW', band: ['LIVE'], ...venue.branding }
    : { home: 'ELANG FC', away: 'BANTENG UTD', ...venue.branding };
  const { scene } = ctx;
  if (show) ctx.setAtmosphere({ house: '#2a2c33', live: '#040506', fogNear: [260, 220], fogFar: [900, 700], exposure: [1.0, 1.05] });
  else ctx.setAtmosphere({ house: '#c9cdd3', live: '#9aa3b4', fogNear: [220, 200], fogFar: [700, 600], exposure: [1.0, 0.95], sky: true });

  if (!show) scene.add(daySky());
  const hemi = new THREE.HemisphereLight('#dfe8ff', '#5b5a4c', 1);
  ctx.mood(hemi, 'intensity', show ? 1.15 : 1.25, show ? 0.05 : 1.0);
  scene.add(hemi);
  const sun = ctx.addKeyLight({ pos: [-90, 70, -120], target: [0, 0, 0], half: 110, house: show ? 2.2 : 2.6, live: show ? 0.03 : 2.4, size: 4096 });
  sun.color.set(show ? '#f1f3ff' : '#ffe8cc');
  if (show) {
    const fill = new THREE.HemisphereLight('#3a3f5c', '#000000', 1);
    ctx.mood(fill, 'intensity', 0, 0.35);
    scene.add(fill);
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: show ? '#3a3a3c' : '#6c6b66', map: grime(), roughness: 1 }));
  ground.material.map = grime().clone(); ground.material.map.repeat.set(80, 80); ground.material.map.needsUpdate = true;
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(122, 86), new THREE.MeshStandardMaterial({ color: show ? '#2c2d30' : '#3f7a3e', roughness: 1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.receiveShadow = true;
  scene.add(apron);

  const tick = show ? stadiumShow(ctx, venue, brand) : football(ctx, brand);
  (venue.tiers ? threeTierBowl : standsAndRoof)(ctx, venue, brand, show);
  ctx.onTick(tick);
}

function daySky() {
  return new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: new THREE.Vector3(-0.55, 0.22, -0.8).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 uSun;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vP); float y = max(d.y, 0.0);
        vec3 top = vec3(0.30, 0.43, 0.66), mid = vec3(0.67, 0.74, 0.84), low = vec3(0.93, 0.83, 0.74);
        vec3 col = mix(low, mid, smoothstep(0.0, 0.18, y)); col = mix(col, top, smoothstep(0.18, 0.7, y));
        vec2 uv = d.xz / (d.y + 0.12) * 1.6;
        float c = fbm(uv * 0.9);
        float cover = smoothstep(0.48, 0.8, c) * smoothstep(0.02, 0.2, y);
        col = mix(col, mix(vec3(1.0), vec3(0.78,0.8,0.86), smoothstep(0.6, 0.9, c)), cover * 0.85);
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.85, 0.6) * (pow(s, 600.0) * 4.0 + pow(s, 8.0) * 0.25);
        if (d.y < 0.0) col = mix(low, vec3(0.42,0.43,0.45), smoothstep(0.0, -0.1, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
}

// Pitch, goals, players and dugouts. Returns the per-frame animation.
function football(ctx, brand) {
  const { scene } = ctx;
  const pitchTex = canvasTex(2048, 1326, (g, w, h) => {
    for (let i = 0; i < 20; i++) { g.fillStyle = i % 2 ? '#4f9a49' : '#468f41'; g.fillRect(i * w / 20, 0, w / 20 + 1, h); }
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) { const k = (Math.random() - 0.5) * 14; img.data[i] += k; img.data[i + 1] += k; img.data[i + 2] += k * 0.5; }
    g.putImageData(img, 0, 0);
    const sx = w / 105, sz = h / 68;
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 9.15 * sx, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, 5, 0, Math.PI * 2); g.fill();
    for (const side of [0, 1]) {
      g.strokeRect(side ? w - 16.5 * sx : 0, h / 2 - 20.16 * sz, 16.5 * sx, 40.32 * sz);
      g.strokeRect(side ? w - 5.5 * sx : 0, h / 2 - 9.16 * sz, 5.5 * sx, 18.32 * sz);
      g.beginPath(); g.arc(side ? w - 11 * sx : 11 * sx, h / 2, 9.15 * sx, side ? Math.PI * 0.705 : -Math.PI * 0.295, side ? Math.PI * 1.295 : Math.PI * 0.295); g.stroke();
      g.beginPath(); g.arc(side ? w - 11 * sx : 11 * sx, h / 2, 5, 0, Math.PI * 2); g.fill();
    }
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(105, 68), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.02;
  pitch.receiveShadow = true;
  scene.add(pitch);

  // Goals with nets.
  const net = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); }, { repeat: [20, 8] });
  const netMat = new THREE.MeshStandardMaterial({ map: net, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: '#f6f6f4', roughness: 0.4 });
  for (const sx of [-1, 1]) {
    const gx = sx * 52.5;
    const goal = new THREE.Group();
    for (const z of [-3.66, 3.66]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.44, 10), white); p.position.set(0, 1.22, z); goal.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.44, 10), white); bar.rotation.x = Math.PI / 2; bar.position.y = 2.44; goal.add(bar);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(7.32, 2.44), netMat); back.position.set(sx * 2, 1.22, 0); back.rotation.y = Math.PI / 2; goal.add(back);
    const roofN = new THREE.Mesh(new THREE.PlaneGeometry(2, 7.32), netMat); roofN.rotation.x = -Math.PI / 2; roofN.position.set(sx, 2.44, 0); goal.add(roofN);
    for (const z of [-3.66, 3.66]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.44), netMat); s.position.set(sx, 1.22, z); goal.add(s); }
    goal.position.x = gx;
    goal.traverse(o => { o.castShadow = true; });
    scene.add(goal);
  }
  // Players, referee, ball.
  const playerGeo = merge([
    new THREE.CapsuleGeometry(0.2, 0.55, 4, 8).translate(0, 1.25, 0),
    new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.75, 0),
    new THREE.CapsuleGeometry(0.09, 0.7, 3, 6).translate(-0.1, 0.45, 0),
    new THREE.CapsuleGeometry(0.09, 0.7, 3, 6).translate(0.1, 0.45, 0),
  ]);
  const kits = [new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: '#f2f2f0', roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.7 })];
  const players = [];
  const form = [[-48, 0], [-34, -18], [-36, -6], [-36, 6], [-34, 18], [-20, -12], [-22, 0], [-20, 12], [-8, -20], [-6, 0], [-8, 20]];
  for (let i = 0; i < 23; i++) {
    const team = i === 22 ? 2 : i % 2;
    const [fx, fz] = i === 22 ? [4, 6] : form[Math.floor(i / 2)];
    const p = new THREE.Mesh(playerGeo, kits[team]);
    p.castShadow = true;
    p.userData = { bx: team === 1 ? -fx : fx, bz: fz * (team === 1 ? -1 : 1), ph: i * 1.7 };
    scene.add(p);
    players.push(p);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), white);
  ball.castShadow = true;
  scene.add(ball);

  // Dugouts.
  for (const sx of [-1, 1]) {
    const d = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(8, 0.08, 2), new THREE.MeshStandardMaterial({ color: '#d7dde2', transparent: true, opacity: 0.55 }));
    shell.position.y = 2.1;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: '#1d3f8a' }));
    bench.position.set(0, 0.45, 0.4);
    d.add(shell, bench);
    d.position.set(sx * 9, 0, 39.5);
    d.traverse(o => { o.castShadow = true; });
    scene.add(d);
  }
  return (t, dt) => {
    const bx = Math.sin(t * 0.13) * 30, bz = Math.sin(t * 0.21) * 18;
    ball.position.set(bx, 0.11, bz);
    players.forEach(p => {
      const u = p.userData;
      const tx = u.bx * 0.6 + bx * 0.4 + Math.sin(t * 0.5 + u.ph) * 3, tz = u.bz * 0.7 + bz * 0.3 + Math.cos(t * 0.4 + u.ph) * 2;
      const dx = tx - p.position.x, dz = tz - p.position.z;
      p.position.x += dx * Math.min(1, dt * 0.8); p.position.z += dz * Math.min(1, dt * 0.8);
      p.rotation.y = Math.atan2(dx, dz);
    });
  };
}

// The stadium's name for its LED boards: the real venue's, or the demo ground's.
const groundName = venue => (venue.place?.name || 'Gelora Samudra').toUpperCase();

// LED boards round the pitch. Returns their texture, which the caller scrolls.
function pitchBoards(scene, words, accent) {
  const tex = bandTexture(words, { bg: '#0a0a0c', fg: '#ffffff', accent });
  tex.repeat.set(10, 1);
  scene.add(new THREE.Mesh(ribbon({ rx: 57.5, rz: 39.5, p: 0.42, y0: 0, y1: 0.95, uRepeat: 1 }), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })));
  return tex;
}

function lampGridTexture() {
  return canvasTex(256, 192, (g, w, h) => {
    g.fillStyle = '#4a4b4f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) {
      const grd = g.createRadialGradient(16 + i * 32, 16 + j * 32, 0, 16 + i * 32, 16 + j * 32, 14);
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.6, '#fff6dc'); grd.addColorStop(1, '#4a4b4f');
      g.fillStyle = grd; g.fillRect(i * 32, j * 32, 32, 32);
    }
  });
}

// Scoreboard artwork for the big screens.
function scoreTexture(brand) {
  return textTexture(1024, 400, (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.textAlign = 'center';
    g.font = '500 70px "Urbanist", Arial, sans-serif'; g.fillText(`${brand.home}   1 – 0   ${brand.away}`, w / 2, 180);
    g.font = '400 44px Arial'; g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillText("34'", w / 2, 270);
  });
}

// Pitch-side boards, tiers, facade, roof, floodlights and the end screens.
function standsAndRoof(ctx, venue, brand, show) {
  const { scene } = ctx;
  const ground = groundName(venue);
  const adTex = pitchBoards(scene, show ? brand.band : [brand.home, 'NUSANTARA AIR', 'KOPI SENJA', 'BANK SAMUDRA', ground], show ? '#ec5446' : '#e21e35');

  const concrete = new THREE.MeshStandardMaterial({ color: '#a5a49f', map: grime(), roughness: 0.95, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(ribbon({ rx: 60.6, rz: 42.6, p: 0.5, y0: 0, y1: 1.6 }), concrete));
  scene.add(new THREE.Mesh(loft({ rx: 72.6, rz: 54.6, p: 0.5, y: 7.1 }, { rx: 76.2, rz: 58.2, p: 0.5, y: 7.1 }), concrete));
  for (const [f, t] of venue.uppers) {
    scene.add(new THREE.Mesh(ribbon({ rx: 75.6, rz: 57.6, p: 0.5, y0: 7.1, y1: 9.6, from: f * Math.PI / 180, to: t * Math.PI / 180 }), concrete));
    scene.add(new THREE.Mesh(ribbon({ rx: 75.55, rz: 57.55, p: 0.5, y0: 9.6, y1: 10.4, from: f * Math.PI / 180, to: t * Math.PI / 180 }), mats.glass()));
  }
  // Outer facade, cantilever roof with ribs, red LED fascia (as in the stadium reference).
  const facade = new THREE.Mesh(ribbon({ rx: 88, rz: 70, p: 0.5, y0: 0, y1: 25, uRepeat: 90 }), new THREE.MeshStandardMaterial({ color: '#d9dadc', roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }));
  facade.castShadow = true;
  scene.add(facade);
  const roofMat = new THREE.MeshStandardMaterial({ color: '#e9eaec', roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(loft({ rx: 70, rz: 52, p: 0.5, y: 30.5 }, { rx: 90, rz: 72, p: 0.5, y: 25 }), roofMat);
  roof.castShadow = true;
  scene.add(roof);
  const ribs = [];
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const [x0, z0] = superPoint(t, 70, 52, 0.5), [x1, z1] = superPoint(t, 90, 72, 0.5);
    const len = Math.hypot(x1 - x0, z1 - z0, 5.5);
    ribs.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, len, yaw: Math.atan2(x1 - x0, z1 - z0) });
  }
  const ribMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 1.2, 1), mats.steel(), ribs.length);
  const o3 = new THREE.Object3D();
  ribs.forEach((r, i) => {
    o3.position.set(r.x, 27.1, r.z); o3.rotation.set(0, r.yaw, 0); o3.rotateX(-Math.atan2(5.5, Math.hypot(20, 20)) * 0.8);
    o3.scale.set(1, 1, r.len); o3.updateMatrix(); ribMesh.setMatrixAt(i, o3.matrix);
  });
  scene.add(ribMesh);
  const fasciaTex = show
    ? bandTexture(brand.band, { bg: '#0b0b0d', fg: '#ffffff', accent: '#ec5446' })
    : bandTexture([ground, brand.home, 'MATCHDAY', 'WELCOME'], { bg: '#c8102e', fg: '#ffffff', accent: '#ffe1e5' });
  fasciaTex.repeat.set(8, 1);
  const fascia = new THREE.Mesh(ribbon({ rx: 70, rz: 52, p: 0.5, y0: 28.9, y1: 30.6, uRepeat: 1 }), new THREE.MeshBasicMaterial({ map: fasciaTex, toneMapped: false, side: THREE.DoubleSide }));
  scene.add(fascia);
  ctx.cutaway(roof); ctx.cutaway(ribMesh); ctx.cutaway(fascia); ctx.cutaway(facade);

  // Floodlight masts with lamp grids.
  const lampGrid = lampGridTexture();
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const mx = sx * 84, mz = sz * 66;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 50, 14), new THREE.MeshStandardMaterial({ color: '#eceef0', roughness: 0.5 }));
    mast.position.set(mx, 25, mz);
    mast.castShadow = true;
    scene.add(mast);
    const head = new THREE.Group();
    head.add(new THREE.Mesh(new THREE.BoxGeometry(10, 7.5, 1.2), new THREE.MeshStandardMaterial({ color: '#8a4b25', roughness: 0.6 })));
    const lamps = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 7), new THREE.MeshBasicMaterial({ map: lampGrid, toneMapped: false }));
    lamps.position.z = 0.62;
    head.add(lamps);
    head.position.set(mx, 52, mz);
    head.lookAt(0, 0, 0);
    scene.add(head);
  }
  // Big screens at both ends: the score, or the show's poster at a concert.
  const score = show ? screenArt(brand, venue)(22 / 8.6) : scoreTexture(brand);
  for (const sx of [-1, 1]) {
    if (show === 'end' && sx < 0) continue;   // behind the stage
    const m = show ? screenMaterial({ a: '#0e1018', b: '#7a4a35', c: '#ffd9b0', tex: score, pixel: 80 }) : screenMaterial({ a: '#06080d', b: '#14213d', c: '#8fb3ff', tex: score, pixel: 80 });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(22, 8.6), m);
    s.position.set(sx * 82, 26, 0);
    s.rotation.y = -sx * Math.PI / 2;
    scene.add(s);
    ctx.onTick(t => { m.uniforms.uTime.value = t; });
  }

  ctx.onTick((t, dt) => {
    adTex.offset.x = (adTex.offset.x + dt * 0.02) % 1;
    fasciaTex.offset.x = (fasciaTex.offset.x - dt * 0.006) % 1;
  });
}

// A real ground modelled from its seating plan (Tottenham Hotspur Stadium): three tiers on
// three sides, glass boxes between the middle and upper tiers, one tall tier behind the
// south goal, and a roof all round carrying the floodlights, with screens in the corners.
// The tiers' radii and heights come from the template (`venue.tiers`); every ring keeps
// rz = rx - 18, as the seats do.
function threeTierBowl(ctx, venue, brand) {
  const { scene } = ctx, T = venue.tiers, p = 0.5;
  const rad = d => d * Math.PI / 180;
  const sides = { from: rad(T.edge), to: rad(360 - T.edge) }, end = { from: rad(-T.edge), to: rad(T.edge) };
  // A tier's front and back edges (x radius) and the height of its last row.
  const front = t => t.rx0 - t.gap / 2, back = t => t.rx0 + (t.rows - 0.5) * t.gap, top = t => t.baseY + (t.rows - 1) * t.rise;
  const { south, lower, middle, upper } = T;
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); scene.add(m); return m; };
  const band = (r, y0, y1, range, mat, uRepeat) => add(ribbon({ rx: r, rz: r - 18, p, y0, y1, ...range, ...(uRepeat ? { uRepeat } : {}) }), mat);
  const slab = (r0, r1, y, range, mat) => add(loft({ rx: r0, rz: r0 - 18, p, y, ...range }, { rx: r1, rz: r1 - 18, p, y }), mat);

  const ground = groundName(venue);
  const adTex = pitchBoards(scene, [brand.home, 'NUSANTARA AIR', 'KOPI SENJA', 'BANK SAMUDRA', ground], '#e21e35');
  const concrete = new THREE.MeshStandardMaterial({ color: '#a5a49f', map: grime(), roughness: 0.95, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: '#e6e7e9', roughness: 0.6, side: THREE.DoubleSide });
  const boxGlass = new THREE.MeshStandardMaterial({ color: '#1f2733', metalness: 0.4, roughness: 0.12, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  // LED ribbons along the tier fronts.
  const ribbonTex = bandTexture([ground, brand.home, 'MATCHDAY', 'WELCOME'], { bg: '#0d1733', fg: '#ffffff', accent: '#9db8ff' });
  ribbonTex.repeat.set(9, 1);
  const led = new THREE.MeshBasicMaterial({ map: ribbonTex, toneMapped: false, side: THREE.DoubleSide });

  band(60.6, 0, 1.6, {}, concrete);                                                  // pitch wall
  slab(back(lower), front(middle), top(lower), sides, concrete);                      // concourse behind the lower tier
  band(front(middle) - 0.05, top(lower), middle.baseY + 0.95, sides, white);          // middle tier front
  band(front(middle) - 0.1, middle.baseY + 0.15, middle.baseY + 0.9, sides, led, 1);
  slab(back(middle), back(upper), top(middle), sides, concrete);                      // floor of the boxes
  const glassR = front(upper) - 0.35;
  band(glassR, top(middle), upper.baseY - 1.6, sides, boxGlass);                      // glass fronts of the boxes
  band(glassR, upper.baseY - 1.6, upper.baseY + 0.95, sides, white);                  // upper tier front
  band(glassR - 0.05, upper.baseY + 0.1, upper.baseY + 0.85, sides, led, 1);

  // Upright walls on the two seams between the South Stand and the three-tier stands: the
  // top follows whichever side stands higher there, so neither stand shows its cut end.
  const surface = (t, r) => (r < front(t) || r > back(t) ? 0 : t.baseY + Math.max(0, (r - t.rx0) / t.gap) * t.rise);
  const seamTop = r => 1.1 + Math.max(0.5, surface(south, r), surface(lower, r), surface(middle, r), surface(upper, r),
    r > back(lower) && r < front(middle) ? top(lower) : 0, r > back(middle) && r < front(upper) ? upper.baseY : 0);
  for (const t of [end.from, end.to]) add(seamWall(t, 60.6, Math.max(back(upper), back(south)) + 0.1, seamTop, p), concrete);

  // Back walls, facade and roof: hidden on the map so the top rows stay in view.
  const eaves = 31.5, inner = 75;
  const cut = [
    band(back(upper) + 0.1, top(upper), eaves, sides, concrete),
    band(back(south) + 0.1, top(south), eaves, end, concrete),
    band(96.6, 0, eaves, {}, new THREE.MeshStandardMaterial({ color: '#d9dadc', roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }), 90),
    add(loft({ rx: inner + 6, rz: inner - 12, p, y: 36.4 }, { rx: 97, rz: 79, p, y: eaves }), new THREE.MeshStandardMaterial({ color: '#e9eaec', roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide })),
    // the clear inner ring of the roof
    add(loft({ rx: inner, rz: inner - 18, p, y: 37.6 }, { rx: inner + 6, rz: inner - 12, p, y: 36.4 }), new THREE.MeshStandardMaterial({ color: '#f4f6f8', transparent: true, opacity: 0.5, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide })),
  ];
  cut[0].castShadow = cut[1].castShadow = cut[3].castShadow = true;
  // Steel ribs from the inner edge to the eaves, and the floodlights along the inner edge.
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 1.2, 1), mats.steel(), 96);
  const lampPts = [];
  const o3 = new THREE.Object3D();
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const [x0, z0] = superPoint(t, inner, inner - 18, p), [x1, z1] = superPoint(t, 97, 79, p);
    o3.position.set((x0 + x1) / 2, (37.6 + eaves) / 2 - 0.4, (z0 + z1) / 2);
    o3.rotation.set(0, Math.atan2(x1 - x0, z1 - z0), 0);
    o3.rotateX(Math.atan2(37.6 - eaves, Math.hypot(x1 - x0, z1 - z0)));
    o3.scale.set(1, 1, Math.hypot(x1 - x0, z1 - z0, 37.6 - eaves));
    o3.updateMatrix();
    ribs.setMatrixAt(i, o3.matrix);
    if (i % 2) lampPts.push([x0 * 1.01, 36.6, z0 * 1.01]);
  }
  scene.add(ribs);
  const lamps = instanceAlong(new THREE.PlaneGeometry(4.2, 1.6), new THREE.MeshBasicMaterial({ map: lampGridTexture(), toneMapped: false, side: THREE.DoubleSide }), lampPts, { look: new THREE.Vector3(0, 0, 0) });
  scene.add(lamps);
  const fasciaTex = bandTexture([ground, brand.home, 'MATCHDAY', 'WELCOME'], { bg: '#0d1733', fg: '#ffffff', accent: '#9db8ff' });
  fasciaTex.repeat.set(8, 1);
  const fascia = band(inner - 0.05, 37.1, 38.6, {}, new THREE.MeshBasicMaterial({ map: fasciaTex, toneMapped: false, side: THREE.DoubleSide }), 1);
  [...cut, ribs, lamps, fascia].forEach(m => ctx.cutaway(m));

  // Screens under the roof in the four corners, showing the score.
  const score = scoreTexture(brand);
  for (const t of [45, 135, 225, 315]) {
    const [x, z] = superPoint(rad(t), inner + 2, inner - 16, p);
    const m = screenMaterial({ a: '#06080d', b: '#14213d', c: '#8fb3ff', tex: score, pixel: 80 });
    const s = add(new THREE.PlaneGeometry(16, 6.25), m);
    s.position.set(x, 31.2, z);
    s.lookAt(0, 6, 0);
    ctx.onTick(tt => { m.uniforms.uTime.value = tt; });
  }

  ctx.onTick((t, dt) => {
    adTex.offset.x = (adTex.offset.x + dt * 0.02) % 1;
    ribbonTex.offset.x = (ribbonTex.offset.x - dt * 0.01) % 1;
    fasciaTex.offset.x = (fasciaTex.offset.x - dt * 0.006) % 1;
  });
}

// Upright wall along the straight line where a superellipse angle t meets every ring with
// rz = rx - 18, from x radius r0 to r1, its top at height h(r).
function seamWall(t, r0, r1, h, p) {
  const pos = [], uv = [], idx = [], n = Math.ceil((r1 - r0) / 0.5);
  for (let i = 0; i <= n; i++) {
    const r = r0 + (r1 - r0) * i / n, [x, z] = superPoint(t, r, r - 18, p);
    pos.push(x, 0, z, x, h(r), z);
    uv.push(i / 4, 0, i / 4, 1);
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ stadium shows

// Covered pitch and the stage for a stadium concert. Returns the per-frame animation.
function stadiumShow(ctx, venue, brand) {
  const { scene } = ctx;
  const deckMat = new THREE.MeshStandardMaterial({ color: '#3b3c40', map: grime(), roughness: 0.75 });
  deckMat.map = grime().clone(); deckMat.map.repeat.set(20, 14); deckMat.map.needsUpdate = true;
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(105, 68), deckMat);
  cover.rotation.x = -Math.PI / 2;
  cover.position.y = 0.02;
  cover.receiveShadow = true;
  scene.add(cover);
  const art = screenArt(brand, venue);
  const screens = [];
  const screen = (w, h, pixel) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMaterial({ a: '#0e1018', b: '#7a4a35', c: '#ffd9b0', tex: art(w / h), pixel }));
    ctx.mood(m.material.uniforms.uLevel, 'value', 0.7, 1.35);
    screens.push(m.material);
    return m;
  };
  const beams = [];
  const beamAt = (parent, x, y, z, i) => {
    const b = beam(['#fff4e0', '#ffd7a8', '#e8eeff'][i % 3], 46, 3.2);
    b.position.set(x, y, z);
    ctx.mood(b.material.uniforms.uOpacity, 'value', 0.0, 0.3);
    parent.add(b);
    beams.push(b);
  };
  const steel = mats.steel();
  let spin = null;

  if (venue.show === 'end') {
    // Built facing +z with its front edge at z = 0, then turned to face the field from the west end.
    const g = new THREE.Group();
    const W = 52, D = 16;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 2.2, D), new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 0.3 }));
    deck.position.set(0, 1.1, -D / 2);
    deck.castShadow = deck.receiveShadow = true;
    g.add(deck);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
    lip.position.set(0, 2.22, 0);
    g.add(lip);
    const wall = screen(40, 16, 120);
    wall.position.set(0, 12, -D + 0.6);
    g.add(wall);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(41, 17, 0.6), mats.matteBlack());
    frame.position.set(0, 12, -D + 0.2);
    g.add(frame);
    for (const sx of [-1, 1]) {
      const imag = screen(13, 7.3, 60);
      imag.position.set(sx * 33, 15, -3);
      imag.rotation.y = -sx * 0.3;
      g.add(imag);
      const back = new THREE.Mesh(new THREE.BoxGeometry(13.4, 7.7, 0.4), mats.matteBlack());
      back.position.copy(imag.position).add(new THREE.Vector3(0, 0, -0.25));
      back.rotation.y = imag.rotation.y;
      g.add(back);
      for (let k = 0; k < 14; k++) {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.1), mats.matteBlack());
        cab.position.set(sx * 24, 23 - k * 0.52, -0.5 + Math.pow(k / 13, 2) * 0.8);
        cab.rotation.x = Math.pow(k / 13, 2) * 0.5;
        g.add(cab);
      }
      // Roof towers.
      for (const z of [-1, -D + 1]) {
        const tower = new THREE.Mesh(trussGeometry(26, 0.6), steel);
        tower.rotation.z = Math.PI / 2;
        tower.position.set(sx * (W / 2 - 1), 13, z);
        g.add(tower);
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 0.6, D + 2), mats.matteBlack());
    roof.position.set(0, 26.3, -D / 2);
    g.add(roof);
    for (const z of [-1, -D + 1]) {
      const span = new THREE.Mesh(trussGeometry(W, 0.6), steel);
      span.position.set(0, 25.6, z);
      g.add(span);
    }
    for (let i = 0; i < 16; i++) beamAt(g, -22.5 + i * 3, 25, -1, i);
    const wash = new THREE.SpotLight('#ffe0bf', 1, 90, 0.6, 0.6, 1.2);
    wash.position.set(0, 30, 22);
    wash.target.position.set(0, 2, -8);
    ctx.mood(wash, 'intensity', 0, 4200);
    g.add(wash, wash.target);
    const backLight = new THREE.PointLight('#ff9d5c', 1, 60, 1.5);
    backLight.position.set(0, 16, -12);
    ctx.mood(backLight, 'intensity', 0, 420);
    g.add(backLight);
    g.rotation.y = Math.PI / 2;
    g.position.set(-40, 0, 0);
    scene.add(g);
    const barrier = new THREE.Mesh(crowdBarrier(56), mats.steel());
    barrier.rotation.y = Math.PI / 2;
    barrier.position.set(-38.4, 0, 0);
    scene.add(barrier);
  } else {
    // 360-degree centre stage: round deck, a four-sided screen cube and a ring of lights above.
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.8, 2, 48), new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 0.3 }));
    deck.position.y = 1;
    deck.castShadow = deck.receiveShadow = true;
    scene.add(deck);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(9.62, 0.05, 6, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 2.02;
    scene.add(rim);
    const cube = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const sc = screen(15, 8.4, 90);
      const a = (i / 4) * Math.PI * 2;
      sc.position.set(Math.sin(a) * 7.55, 0, Math.cos(a) * 7.55);
      sc.rotation.y = a;
      cube.add(sc);
    }
    cube.add(new THREE.Mesh(new THREE.BoxGeometry(15, 8.8, 15), mats.matteBlack()));
    cube.position.y = 24;
    scene.add(cube);
    spin = cube;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 0.45, 8, 96), steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 31;
    scene.add(ring);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      beamAt(scene, Math.sin(a) * 14, 30.6, Math.cos(a) * 14, i);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4 + 0.125) * Math.PI * 2;
      for (let k = 0; k < 12; k++) {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.1), mats.matteBlack());
        cab.position.set(Math.sin(a) * 12, 26 - k * 0.52, Math.cos(a) * 12);
        cab.rotation.y = a;
        scene.add(cab);
      }
    }
    for (const [x, z, ry] of [[-11.2, 0, Math.PI / 2], [11.2, 0, Math.PI / 2], [0, -11.2, 0], [0, 11.2, 0]]) {
      const barrier = new THREE.Mesh(crowdBarrier(19), mats.steel());
      barrier.rotation.y = ry;
      barrier.position.set(x, 0, z);
      scene.add(barrier);
    }
    const wash = new THREE.SpotLight('#ffe0bf', 1, 90, 0.5, 0.6, 1.2);
    wash.position.set(0, 46, 0);
    wash.target.position.set(0, 2, 0);
    ctx.mood(wash, 'intensity', 0, 4200);
    scene.add(wash, wash.target);
    const glow = new THREE.PointLight('#ff9d5c', 1, 50, 1.5);
    glow.position.set(0, 18, 0);
    ctx.mood(glow, 'intensity', 0, 380);
    scene.add(glow);
  }

  return t => {
    screens.forEach(m => { m.uniforms.uTime.value = t; });
    if (spin) spin.rotation.y = t * 0.05;
    beams.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.45 + i * 0.7) * 0.42;
      b.rotation.x = 0.42 + Math.sin(t * 0.33 + i * 1.3) * 0.22;
    });
  };
}

// ------------------------------------------------------------------ seats & crowd geometry

// Seats face -z; backrest on +z.
export function seatGeometry(style) {
  if (style === 'cinema') {
    return merge([
      rbox(0.54, 0.16, 0.5, 0.06, 3, 0, 0.44, -0.04),
      rbox(0.56, 0.78, 0.16, 0.07, 3, 0, 0.84, 0.22, -0.14),
      rbox(0.08, 0.2, 0.56, 0.035, 2, -0.31, 0.62, 0),
      rbox(0.08, 0.2, 0.56, 0.035, 2, 0.31, 0.62, 0),
      box(0.07, 0.58, 0.42, -0.31, 0.29, 0.02),
      box(0.07, 0.58, 0.42, 0.31, 0.29, 0.02),
    ]);
  }
  if (style === 'theater') {
    return merge([
      box(0.48, 0.12, 0.44, 0, 0.44, -0.04, 0.08),
      box(0.5, 0.6, 0.1, 0, 0.8, 0.2, -0.12),
      box(0.05, 0.62, 0.44, -0.27, 0.31, 0.02),
      box(0.05, 0.62, 0.44, 0.27, 0.31, 0.02),
    ]);
  }
  // Moulded plastic stadium shell: an L-shaped profile extruded across the seat width.
  const pts = [[-0.21, 0.4], [-0.1, 0.425], [0.08, 0.43], [0.15, 0.46], [0.19, 0.55], [0.22, 0.7], [0.235, 0.8]];
  const th = 0.028;
  const outer = [], inner = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny); nx /= l; ny /= l;
    outer.push([p[0] + nx * th, p[1] + ny * th]);
    inner.push([p[0] - nx * th, p[1] - ny * th]);
  });
  const shape = new THREE.Shape();
  // Shape x = -z so that after rotateY(+90°) the seat faces -z.
  outer.forEach(([z, y], i) => (i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
  inner.reverse().forEach(([z, y]) => shape.lineTo(-z, y));
  shape.closePath();
  const shell = new THREE.ExtrudeGeometry(shape, { depth: 0.44, bevelEnabled: false, curveSegments: 1 });
  shell.rotateY(Math.PI / 2);
  shell.translate(-0.22, 0, 0);
  return merge([shell, box(0.06, 0.4, 0.06, 0, 0.2, 0.1)]);
}

export function crowdGeometries() {
  const torso = new THREE.CapsuleGeometry(0.17, 0.36, 2, 7);
  torso.scale(1.18, 1, 0.72);
  torso.translate(0, 0.86, 0.06);
  const armL = new THREE.CapsuleGeometry(0.055, 0.42, 1, 4).rotateX(-0.5).translate(-0.24, 0.72, -0.05);
  const armR = armL.clone().translate(0.48, 0, 0);
  const thighs = box(0.36, 0.15, 0.44, 0, 0.53, -0.18);
  const shins = box(0.3, 0.42, 0.12, 0, 0.24, -0.4);
  const neck = new THREE.CylinderGeometry(0.05, 0.06, 0.1, 5, 1, true).translate(0, 1.13, 0.04);
  const body = merge([torso, armL, armR, thighs, shins, neck]);
  const head = new THREE.SphereGeometry(0.105, 8, 6);
  head.scale(0.9, 1.1, 1);
  head.translate(0, 1.26, 0.02);
  // Hair cap: upper and back of the skull, so the crowd reads correctly from behind.
  const hair = new THREE.SphereGeometry(0.112, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.55);
  hair.scale(0.92, 1.1, 1.05);
  hair.rotateX(0.5);
  hair.translate(0, 1.27, 0.03);
  const raised = merge([
    new THREE.CapsuleGeometry(0.05, 0.5, 2, 5).rotateZ(0.25).translate(-0.27, 1.32, 0.02),
    new THREE.CapsuleGeometry(0.05, 0.5, 2, 5).rotateZ(-0.25).translate(0.27, 1.32, 0.02),
  ]);
  // Standing: the same upper body, placed 0.42 m higher by its instance, with straight legs
  // reaching back down to the floor.
  const legs = [-0.09, 0.09].map(x => new THREE.CapsuleGeometry(0.075, 0.78, 2, 6).translate(x, 0.05, 0.04));
  const stand = merge([torso.clone(), armL.clone(), armR.clone(), neck.clone(), ...legs]);
  return { body, stand, head, hair, raised };
}
