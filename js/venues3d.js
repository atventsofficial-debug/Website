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
import { superPoint, formatRpShort } from './layouts.js';
import { lang } from './i18n.js';
import { IMAGES } from './media.js';
import { themeOf } from './themes.js';
import { MADYA, jisEnd } from './realvenues.js';
import { buildArenaDetail, concreteNormalMap } from './arena-detail.js';

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

// Ground layers a few millimetres apart (grass, track, lines, the deck over the pitch) fight
// over the same pixels from afar. Pushed back by k steps, the lower layer always loses.
const below = (mat, k) => Object.assign(mat, { polygonOffset: true, polygonOffsetFactor: k, polygonOffsetUnits: k });

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

// The concert stage in metres: Indonesia Arena's 36 m deck by default, or the hall's own.
// `k` scales the screens, trusses and lights drawn for the 36 m stage; the band's risers
// stand `riserZ` back from the front edge as they do there.
export function concertStage(venue) {
  const st = venue.hall?.stage;
  const w = st?.w ?? 36, k = w / 36;
  const front = st?.front ?? -34, d = st?.d ?? 13 * k, h = st?.h ?? 1.8;
  return { w, d, h, front, k, riserZ: front - d * 10 / 13 };
}

// A hall's stands (realvenues.js): under each tier's rows a raked concrete slab, closed at its
// two ends, a front wall with a glass balustrade, and between two tiers a concourse.
function hallStands(scene, hall, frontMat) {
  const slab = mats.darkConcrete();
  slab.side = THREE.DoubleSide;
  const at = (t, r, T, y) => {
    const [x, z] = superPoint(t, T.rx0 + r * T.gap, T.rz0 + r * T.gap, hall.p);
    return [hall.cx + x, y, hall.cz + z];
  };
  for (const [from, to] of hall.segments) {
    hall.tiers.forEach((T, ti) => {
      const last = T.rows - 1, below = 0.14 + T.rise / 2;
      const yF = T.baseY - below, yB = T.baseY + last * T.rise - below;
      // The rake: from half a row in front of the first row to half a row behind the last.
      const a = { rx: T.rx0 - T.gap / 2, rz: T.rz0 - T.gap / 2, p: hall.p, y: yF - T.rise / 2, from, to };
      const b = { rx: T.rx0 + (last + 0.5) * T.gap, rz: T.rz0 + (last + 0.5) * T.gap, p: hall.p, y: yB + T.rise / 2, from, to };
      scene.add(new THREE.Mesh(loft(a, b), slab));
      // Its back wall down to the floor, and the two ends.
      scene.add(new THREE.Mesh(ribbon({ cx: hall.cx, cz: hall.cz, p: hall.p, from, to, rx: b.rx, rz: b.rz, y0: 0, y1: b.y }), slab));
      for (const t of [from, to]) {
        const p0 = at(t, -0.5, T, 0), p1 = at(t, -0.5, T, a.y), p2 = at(t, last + 0.5, T, b.y), p3 = at(t, last + 0.5, T, 0);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p0, ...p2, ...p3], 3));
        g.computeVertexNormals();
        scene.add(new THREE.Mesh(g, slab));
      }
      // Front wall and balustrade.
      const fr = { cx: hall.cx, cz: hall.cz, p: hall.p, from, to, rx: T.rx0 - 0.6, rz: T.rz0 - 0.6 };
      scene.add(new THREE.Mesh(ribbon({ ...fr, y0: ti ? T.baseY - 3 : 0, y1: T.baseY + 0.1 }), frontMat));
      scene.add(new THREE.Mesh(ribbon({ ...fr, y0: T.baseY + 0.1, y1: T.baseY + 1.0 }), mats.glass()));
      // A walkway from the tier below to this tier's front wall.
      const prev = hall.tiers[ti - 1];
      if (prev) {
        const y = prev.baseY + (prev.rows - 1) * prev.rise + 0.02;
        scene.add(new THREE.Mesh(loft(
          { rx: prev.rx0 + (prev.rows - 0.5) * prev.gap, rz: prev.rz0 + (prev.rows - 0.5) * prev.gap, p: hall.p, y, from, to },
          { rx: T.rx0 - 0.6, rz: T.rz0 - 0.6, p: hall.p, y, from, to }), slab));
      }
    });
  }
}

export function buildConcert(ctx, venue) {
  const brand = { wall: 'NADA SENJA', sub: 'LIVE · ARENA TOUR 2026', band: ['NADA SENJA LIVE', 'ARENA TOUR 2026', 'NUSANTARA ARENA', 'ENJOY THE SHOW'], ...venue.branding };
  const { scene } = ctx, theme = themeOf(venue);
  ctx.setAtmosphere({ house: '#3a3b40', live: '#050608', fogNear: [90, 50], fogFar: [220, 150], exposure: [1.0, 1.05] });

  const hemi = new THREE.HemisphereLight('#f3f1ec', '#3c3b38', 1);
  ctx.mood(hemi, 'intensity', 1.1, 0.05);
  scene.add(hemi);
  const key = ctx.addKeyLight({ pos: [18, 44, 26], target: [0, 0, -6], half: 60, house: 2.2, live: 0.05 });
  key.color.set('#fff6ea');

  // Hall shell: dark acoustic walls, concrete floor. Indonesia Arena's by default; GBK's
  // smaller halls (realvenues.js) bring their own room, stands and stage.
  const HALL = venue.hall, R = HALL?.room;
  const W = R?.W ?? 108, D = R?.D ?? 120, H = R?.H ?? 44, CZ = R?.CZ ?? -4;
  const wallMat = new THREE.MeshStandardMaterial({ color: '#2b2c30', roughness: 0.95, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
  room.position.set(0, H / 2 - 0.02, CZ);
  room.receiveShadow = true;
  scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#4a4a4c', map: grime(), roughness: 0.42, metalness: 0.05 }));
  floor.material.map = grime().clone(); floor.material.map.repeat.set(12, 12); floor.material.map.needsUpdate = true;
  if (ctx.realistic) {
    // Polished concrete with relief, and the shading the tiers, the stage and the seat blocks
    // cast on the floor, baked in Blender (Cycles ambient occlusion) from this same model.
    floor.material.normalMap = concreteNormalMap().clone();
    floor.material.normalMap.repeat.set(30, 30);
    floor.material.normalScale.set(0.35, 0.35);
    if (!HALL) new THREE.TextureLoader().load(`assets/venues/${venue.aoKey || venue.key}-floor-ao.jpg`, t => {
      t.flipY = false;
      floor.material.aoMap = t;
      floor.material.aoMapIntensity = 1;
      floor.material.needsUpdate = true;
    });
  }
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = CZ;
  floor.receiveShadow = true;
  scene.add(floor);
  // The floor blocks in their categories' colours, with their names, on the map.
  floorZones(ctx, venue);

  // Roof grid of trusses and house lights.
  const steel = mats.steel();
  const roofTruss = trussGeometry(D * 0.94, 0.9);
  const nx = Math.floor((W / 2 - 4) / 14), nz = Math.round((D - 20) / 12.5) + 1;
  for (let i = -nx; i <= nx; i++) {
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
  for (let i = -nx; i <= nx; i++) for (let j = 0; j < nz; j++) lampPts.push([i * 14, H - 3.8, CZ - D / 2 + 10 + j * 12.5]);
  const lamps = instanceAlong(lampGeo, lampMat, lampPts);
  scene.add(lamps);
  ctx.cutaway(lamps);

  // Stage: the deck, its risers and any catwalk in metres (performers stand on them); the
  // screens, trusses and lights in a rig drawn for Indonesia Arena's 36 m stage and scaled to
  // this one (S.k), standing on its deck.
  const S = concertStage(venue);
  const rig = new THREE.Group();
  rig.scale.setScalar(S.k);
  rig.position.set(0, S.h - 1.8 * S.k, S.front + 34 * S.k);
  scene.add(rig);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(S.w, S.h, S.d), new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 0.3 }));
  deck.position.set(0, S.h / 2, S.front - S.d / 2);
  deck.receiveShadow = deck.castShadow = true;
  scene.add(deck);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.9 }));
  skirt.position.set(0, S.h / 2, S.front + 0.01);
  scene.add(skirt);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(S.w, 0.04, 0.06), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  lip.position.set(0, S.h + 0.02, S.front);
  scene.add(lip);
  // A catwalk from the middle of the stage into the floor, where the show's plan has one.
  const walk = venue.stage?.catwalk;
  if (walk) {
    const cw = new THREE.Mesh(new THREE.BoxGeometry(walk.w, S.h, walk.len), deck.material);
    cw.position.set(0, S.h / 2, S.front + walk.len / 2);
    cw.receiveShadow = cw.castShadow = true;
    scene.add(cw);
    for (const sx of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, walk.len), lip.material);
      edge.position.set(sx * walk.w / 2, S.h + 0.02, S.front + walk.len / 2);
      scene.add(edge);
    }
    const tip = new THREE.Mesh(new THREE.BoxGeometry(walk.w, 0.04, 0.06), lip.material);
    tip.position.set(0, S.h + 0.02, S.front + walk.len);
    scene.add(tip);
    // A round island stage at its end, where the plan has one.
    if (walk.island) {
      const r = walk.island, isl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, S.h, 40), deck.material);
      isl.position.set(0, S.h / 2, S.front + walk.len + r - 0.5);
      isl.receiveShadow = isl.castShadow = true;
      scene.add(isl);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 4, 64), lip.material);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, S.h + 0.02, S.front + walk.len + r - 0.5);
      scene.add(ring);
    }
  }
  // Risers for the band.
  for (const [x, w] of [[-8, 5], [0, 6], [8, 5]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w * S.k, 0.6, 3), mats.matteBlack());
    r.position.set(x * S.k, S.h + 0.3, S.riserZ);
    r.castShadow = r.receiveShadow = true;
    scene.add(r);
  }
  // Drum kit stand-in and mic stands, when the show has no line-up of its own (crowd3d.js Band
  // brings the real gear for each member).
  const kit = new THREE.Group();
  kit.visible = !venue.lineup?.length;
  [[0, 0.45], [-0.8, 0.35], [0.8, 0.35], [-0.4, 0.3], [0.4, 0.3]].forEach(([x, r], i) => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, i ? 0.25 : 0.55, 20), new THREE.MeshStandardMaterial({ color: i ? '#d9d7d2' : '#1a1a1d', roughness: 0.4 }));
    d.rotation.x = i ? 0.3 : Math.PI / 2;
    d.position.set(x, i ? 0.9 : 0.5, i ? -0.3 : 0);
    kit.add(d);
  });
  kit.position.set(0, S.h + 0.6, S.riserZ);
  scene.add(kit);
  for (const x of venue.lineup?.length ? [] : [-6, 0, 6]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), mats.blackMetal());
    m.position.set(x * S.k, S.h + 0.8, S.front - 2.5);
    scene.add(m);
  }

  // Video wall and IMAG screens with the show's poster, or the tour name.
  const art = screenArt(brand, venue);
  const wallMatLed = screenMaterial({ ...theme.screen, tex: art(30 / 13), pixel: 120 });
  ctx.mood(wallMatLed.uniforms.uLevel, 'value', 0.7, 1.05);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 13), wallMatLed);
  wall.position.set(0, 9.2, -46.6);
  rig.add(wall);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(30.6, 13.6, 0.5), mats.matteBlack());
  frame.position.set(0, 9.2, -46.9);
  rig.add(frame);
  for (const sx of [-1, 1]) {
    const imag = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.06), screenMaterial({ ...theme.screen, tex: art(9 / 5.06), pixel: 60 }));
    ctx.mood(imag.material.uniforms.uLevel, 'value', 0.7, 1.35);
    imag.position.set(sx * 24, 11, -38);
    imag.rotation.y = -sx * 0.32;
    rig.add(imag);
    ctx.onTick(t => { imag.material.uniforms.uTime.value = t; });
    const back = new THREE.Mesh(new THREE.BoxGeometry(9.4, 5.4, 0.3), mats.matteBlack());
    back.position.copy(imag.position).add(new THREE.Vector3(sx * 0.05, 0, -0.17));
    back.rotation.y = imag.rotation.y;
    rig.add(back);
    // Line arrays: twelve cabinets curving down, flown left and right of the stage.
    for (let k = 0; k < 12; k++) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 0.9), mats.matteBlack());
      cab.position.set(sx * 19.2, 16.5 - k * 0.44, -35.6 + Math.pow(k / 11, 2) * 0.6);
      cab.rotation.x = Math.pow(k / 11, 2) * 0.5;
      cab.castShadow = true;
      rig.add(cab);
    }
  }

  // Ground-supported truss towers and the lighting rig.
  const span = new THREE.Mesh(trussGeometry(38, 0.5), steel);
  span.position.set(0, 17.6, -36);
  rig.add(span);
  const back = new THREE.Mesh(trussGeometry(38, 0.5), steel);
  back.position.set(0, 19, -45.5);
  rig.add(back);
  for (const sx of [-1, 1]) for (const z of [-36, -45.5]) {
    const tower = new THREE.Mesh(trussGeometry(z === -36 ? 17.6 : 19, 0.5), steel);
    tower.rotation.z = Math.PI / 2;
    tower.position.set(sx * 18.8, (z === -36 ? 17.6 : 19) / 2, z);
    rig.add(tower);
  }
  const beamColors = theme.beams;
  const beams = [];
  const headGeo = merge([box(0.45, 0.35, 0.45, 0, 0.15, 0), new THREE.CylinderGeometry(0.2, 0.24, 0.45, 12).translate(0, -0.2, 0)]);
  for (let i = 0; i < 12; i++) {
    const x = -16.5 + i * 3;
    const head = new THREE.Mesh(headGeo, mats.matteBlack());
    head.position.set(x, 17.0, -36);
    rig.add(head);
    const b = beam(beamColors[i % beamColors.length], 34, 2.6);
    b.position.set(x, 16.7, -36);
    rig.add(b);
    ctx.mood(b.material.uniforms.uOpacity, 'value', 0.0, 0.32);
    beams.push(b);
  }
  // Real stage lighting, in the rig: a smaller rig's lights sit closer, so they shine less
  // (k to the power of each light's decay keeps the light on the deck as it is at full size).
  const wash = new THREE.SpotLight(theme.wash, 1, 70 * S.k, 0.55, 0.6, 1.2);
  wash.position.set(0, 24, -20);
  wash.target.position.set(0, 2, -42);
  ctx.mood(wash, 'intensity', 0, 2600 * S.k ** 1.2);
  rig.add(wash, wash.target);
  const back1 = new THREE.PointLight(theme.glow, 1, 40 * S.k, 1.5);
  back1.position.set(0, 14, -44);
  ctx.mood(back1, 'intensity', 0, 260 * S.k ** 1.5);
  rig.add(back1);
  const audience = new THREE.HemisphereLight('#3a3f5c', '#000000', 1);
  ctx.mood(audience, 'intensity', 0, 0.35);
  scene.add(audience);
  // Light spilling off the stage onto the crowd, pulsing gently with the music: the backs of
  // heads stay dark, shoulders and the tiers facing the stage catch it.
  const spill = new THREE.SpotLight('#ffcf9e', 1, 120 * S.k, 1.05, 0.9, 1.4);
  spill.position.set(0, 15, -33);
  spill.target.position.set(0, 3, 12);
  const spillRig = { base: 0 };
  ctx.mood(spillRig, 'base', 0, 1300 * S.k ** 1.4);
  rig.add(spill, spill.target);
  ctx.onTick(t => { spill.intensity = spillRig.base * (0.85 + 0.15 * Math.max(0, Math.sin(t * 118 / 60 * Math.PI * 2))); });

  // Barricade and front-of-house mix position.
  const barrierLen = venue.stage?.barrier || 30;
  if (walk) {
    // Round the catwalk: the front line either side of it, its two sides and its tip.
    const gap = walk.w / 2 + 1.2, side = (barrierLen / 2 - gap);
    for (const sx of [-1, 1]) {
      const front = new THREE.Mesh(crowdBarrier(side), mats.steel());
      front.position.set(sx * (gap + side / 2), 0, S.front + 2.6);
      const along = new THREE.Mesh(crowdBarrier(walk.len - 1.4), mats.steel());
      along.rotation.y = Math.PI / 2;
      along.position.set(sx * gap, 0, S.front + 2.6 + (walk.len - 1.4) / 2);
      scene.add(front, along);
    }
    const end = new THREE.Mesh(crowdBarrier(gap * 2), mats.steel());
    end.position.set(0, 0, S.front + walk.len + 1.2);
    scene.add(end);
  } else {
    const barrier = new THREE.Mesh(crowdBarrier(barrierLen), mats.steel());
    barrier.position.set(0, 0, S.front + 2.6);
    scene.add(barrier);
  }
  const foh = new THREE.Group();
  const deckF = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 4), mats.matteBlack()); deckF.position.y = 0.25;
  const desk = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1), new THREE.MeshStandardMaterial({ color: '#222326', roughness: 0.5 })); desk.position.set(0, 1, 0.3);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.12, 4.2), new THREE.MeshStandardMaterial({ color: '#1b1b1d' })); roof.position.y = 3.4;
  foh.add(deckF, desk, roof);
  for (const [x, z] of [[-3.4, -1.9], [3.4, -1.9], [-3.4, 1.9], [3.4, 1.9]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), mats.steel()); leg.position.set(x, 1.8, z); foh.add(leg);
  }
  foh.position.set(0, 0, venue.fohZ ?? 15);   // behind the last floor row (layouts.js, realvenues.js)
  foh.traverse(o => { o.castShadow = o.receiveShadow = true; });
  // A plan without a sound desk on it (fohZ: false) gets none.
  if (venue.fohZ !== false) scene.add(foh);

  // Tier front walls with glass balustrade and a ribbon board on the upper tier.
  const front = new THREE.MeshStandardMaterial({ color: '#3b3c40', map: grime(), roughness: 0.9, side: THREE.DoubleSide });
  let bandTex = null;
  if (HALL) hallStands(scene, HALL, front);
  else {
    const opts = { cx: 0, cz: -10, p: 0.62, from: -38 * Math.PI / 180, to: 218 * Math.PI / 180 };
    scene.add(new THREE.Mesh(ribbon({ ...opts, rx: 23.4, rz: 29.4, y0: 0, y1: 1.7 }), front));
    scene.add(new THREE.Mesh(ribbon({ ...opts, rx: 23.4, rz: 29.4, y0: 1.7, y1: 2.7 }), mats.glass()));
    scene.add(new THREE.Mesh(ribbon({ ...opts, rx: 36.8, rz: 42.8, y0: 6.9, y1: 9.9 }), front));
    scene.add(new THREE.Mesh(ribbon({ ...opts, rx: 36.8, rz: 42.8, y0: 9.9, y1: 10.9 }), mats.glass()));
    bandTex = bandTexture(brand.band, { fg: '#f4f1ea', accent: '#d9b48a' });
    bandTex.repeat.set(6, 1);
    const band = new THREE.Mesh(ribbon({ ...opts, rx: 36.75, rz: 42.75, y0: 8.6, y1: 9.5, uRepeat: 1 }), new THREE.MeshBasicMaterial({ map: bandTex, toneMapped: false, side: THREE.DoubleSide }));
    scene.add(band);
  }

  if (ctx.realistic) buildArenaDetail(ctx, venue);

  ctx.onTick((t, dt) => {
    wallMatLed.uniforms.uTime.value = t;
    if (bandTex) bandTex.offset.x = (bandTex.offset.x + dt * 0.01) % 1;
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

  // A studio from XXI's seat map carries its own room (cinemas.js); the demo has this one.
  const R = venue.room || {};
  const W = R.W || 18.6, D = R.D || 27, H = R.H || 10, CZ = R.CZ ?? -2.5;
  const SW = R.screenW || 16.4, SH = R.screenH || 6.86, SY = R.screenY || 5.3, SZ = R.screenZ ?? -15.6;
  const back = R.back ?? CZ + D / 2;
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
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), movie);
  screen.position.set(0, SY, SZ);
  scene.add(screen);
  const mask = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: '#050505', roughness: 1 }));
  mask.position.set(0, H / 2, SZ - 0.1);
  scene.add(mask);
  const stage = new THREE.Mesh(new THREE.BoxGeometry(W, 0.9, 1.4), mats.matteBlack());
  stage.position.set(0, 0.45, SZ + 0.5);
  scene.add(stage);
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(curtain(Math.max(1, Math.min(2.2, (W - SW) / 2)), Math.min(8.8, H - 1.2)), new THREE.MeshStandardMaterial({ color: '#5a0d18', roughness: 0.85, side: THREE.DoubleSide }));
    c.position.set(sx * (W / 2 - Math.max(0.5, Math.min(1.1, (W - SW) / 4))), Math.min(4.8, (H - 0.4) / 2), SZ + 0.3);
    scene.add(c);
  }
  const screenLight = new THREE.RectAreaLight('#ffc89a', 1, SW, SH);
  screenLight.position.set(0, SY, SZ + 0.2);
  screenLight.lookAt(0, 3, 10);
  ctx.mood(screenLight, 'intensity', 0.6, 4.5);
  scene.add(screenLight);

  // Red LED lines on the side walls, as in the reference.
  const red = new THREE.MeshStandardMaterial({ color: '#2a0004', emissive: '#ff1e3c', emissiveIntensity: 2.2 });
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 7), red);
    s.position.set(sx * (W / 2 - 0.04), 2.2 + i * 0.95, SZ + Math.min(4.4, D * 0.3));
    s.rotation.x = (i - 3) * 0.05;
    scene.add(s);
  }
  // Ceiling: small downlights (house) and pin-prick stars.
  const down = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffe6c4', emissiveIntensity: 1 });
  ctx.mood(down, 'emissiveIntensity', 2.5, 0.15);
  const pts = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) pts.push([(i - 2) * (W - 4.6) / 4, H - 0.05, SZ + 3.6 + j * (back - SZ - 5) / 5]);
  scene.add(instanceAlong(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16), down, pts));
  const houseKey = ctx.addKeyLight({ pos: [3, 18, 8], target: [0, 0, -2], half: 16, house: 1.6, live: 0.0 });
  houseKey.color.set('#ffe9cf');
  const hemi = new THREE.HemisphereLight('#ffe8d6', '#2a1416', 1);
  ctx.mood(hemi, 'intensity', 0.9, 0.04);
  scene.add(hemi);

  // Aisle step lights.
  const amber = new THREE.MeshStandardMaterial({ color: '#2a1a05', emissive: '#ffb547', emissiveIntensity: 2 });
  const steps = R.steps ? R.steps.slice() : [];
  if (!R.steps) for (let r = 0; r < 14; r++) for (const x of [-3.95, 3.95, -8.6, 8.6]) steps.push([x, Math.max(0, r - 2) * 0.36 + 0.03, -7.2 + r * 1.12 - 0.55]);
  if (steps.length) scene.add(instanceAlong(new THREE.BoxGeometry(0.5, 0.03, 0.03), amber, steps));
  // Stadium risers wall to wall under the raked rows, aisles and cross aisles included.
  if (R.risers?.length) {
    const riserMat = new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 });
    const rs = R.risers, d = rs.length > 1 ? rs[1][0] - rs[0][0] : 1;
    for (const [z, y] of rs) {
      if (y <= 0) continue;
      // The last line's riser runs on to the back wall.
      const deep = z === rs[rs.length - 1][0] ? Math.max(d, back - z + d / 2) : d;
      const box = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, y, deep), riserMat);
      box.position.set(0, y / 2, z - d / 2 + deep / 2);
      box.receiveShadow = true;
      scene.add(box);
    }
  }
  // Exit signs.
  const exitTex = textTexture(256, 96, (g, w, h) => {
    g.fillStyle = '#0d7a3e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = '700 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', w / 2, h / 2 + 2);
  });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: exitTex, toneMapped: false }));
    e.position.set(sx * (W / 2 - 0.02), Math.min(7.4, H - 1), back - 2);
    e.rotation.y = -sx * Math.PI / 2;
    scene.add(e);
  }
  ctx.onTick(t => { movie.uniforms.uTime.value = t; });
}

// A hard court with its run-off, lines, net and umpire's chair, along x. 23.77 x 10.97 m
// inside a 36.6 x 18.3 m surround; the logo is painted behind each baseline.
function tennisCourt(scene, brand) {
  const L = 23.77, Wd = 10.97, S = 8.23, SL = 6.4;
  const tex = canvasTex(2048, 1024, (g, w, h) => {
    const k = w / 36.6, X = x => w / 2 + x * k, Z = z => h / 2 + z * k;
    g.fillStyle = '#2c5f8a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f7fb6'; g.fillRect(X(-L / 2), Z(-Wd / 2), L * k, Wd * k);
    g.strokeStyle = '#ffffff'; g.lineWidth = 0.05 * k;
    g.strokeRect(X(-L / 2), Z(-Wd / 2), L * k, Wd * k);
    g.strokeRect(X(-L / 2), Z(-S / 2), L * k, S * k);
    g.beginPath();
    g.moveTo(X(-SL), Z(-S / 2)); g.lineTo(X(-SL), Z(S / 2));
    g.moveTo(X(SL), Z(-S / 2)); g.lineTo(X(SL), Z(S / 2));
    g.moveTo(X(-SL), Z(0)); g.lineTo(X(SL), Z(0));
    g.moveTo(X(-L / 2), Z(0)); g.lineTo(X(-L / 2 + 0.15), Z(0));
    g.moveTo(X(L / 2), Z(0)); g.lineTo(X(L / 2 - 0.15), Z(0));
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `500 ${0.9 * k}px "Urbanist", "Helvetica Neue", Arial, sans-serif`;
    for (const sgn of [-1, 1]) { g.save(); g.translate(X(sgn * (L / 2 + 3.2)), Z(0)); g.rotate(sgn * Math.PI / 2); g.fillText(brand.mark, 0, 0); g.restore(); }
  });
  const court = new THREE.Mesh(new THREE.PlaneGeometry(36.6, 18.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
  court.rotation.x = -Math.PI / 2;
  court.position.y = 0.02;
  court.receiveShadow = true;
  scene.add(court);
  // The net between two posts, a little outside the doubles lines.
  const postMat = new THREE.MeshStandardMaterial({ color: '#1d2a36', roughness: 0.5, metalness: 0.4 });
  for (const z of [-6.4, 6.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.07, 10), postMat);
    post.position.set(0, 0.535, z);
    post.castShadow = true;
    scene.add(post);
  }
  const mesh = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(20,20,22,1)'; g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
  }, { repeat: [120, 9] });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 0.95), new THREE.MeshStandardMaterial({ map: mesh, alphaTest: 0.3, side: THREE.DoubleSide, color: '#222' }));
  net.rotation.y = Math.PI / 2;
  net.position.set(0, 0.5, 0);
  scene.add(net);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 12.8), new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.6 }));
  tape.position.set(0, 0.96, 0);
  scene.add(tape);
  // The umpire's chair at the net, on the south side, and the players' benches.
  const dark = new THREE.MeshStandardMaterial({ color: '#16232f', roughness: 0.6 });
  const chair = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.8), dark);
  chair.position.set(0, 1.1, 7.2);
  chair.castShadow = true;
  scene.add(chair);
  for (const x of [-1.8, 1.8]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.6), dark);
    bench.position.set(x, 0.25, 7.4);
    scene.add(bench);
  }
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

  // A tennis court (venue.court) in place of the cage; else the octagon.
  if (venue.court === 'tennis') tennisCourt(scene, brand);
  else {
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
    const [top, big] = venue.court === 'tennis' ? ['SET 2', '4 – 3'] : ['ROUND 2', '3:42'];
    g.font = '300 96px "Urbanist", Arial, sans-serif'; g.fillText(top, w / 2, 210);
    g.font = '500 150px "Urbanist", Arial, sans-serif'; g.fillText(big, w / 2, 400);
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
  // The walls follow the bowl: round for a cage, longer than wide round a tennis court.
  const lw = venue.walls?.lower || { rx: 15, rz: 15 }, uw = venue.walls?.upper || { rx: 29.4, rz: 29.4 };
  const wp = venue.walls ? 0.6 : 0.55;
  scene.add(new THREE.Mesh(ribbon({ rx: lw.rx, rz: lw.rz, p: wp, y0: 0, y1: 1.6 }), wallMat));
  scene.add(new THREE.Mesh(ribbon({ rx: lw.rx, rz: lw.rz, p: wp, y0: 1.6, y1: 2.5 }), mats.glass()));
  // The ad band runs along the upper tier's front, or in a studio along the wall behind the stand.
  const band = compact ? { rx: 20.4, rz: 20.4, y0: 4.2, y1: 5.0 } : { rx: uw.rx - 0.05, rz: uw.rz - 0.05, y0: 9.1, y1: 9.9 };
  if (compact) scene.add(new THREE.Mesh(ribbon({ rx: 20.45, rz: 20.45, p: 0.55, y0: 0, y1: 7 }), wallMat));
  else scene.add(new THREE.Mesh(ribbon({ rx: uw.rx, rz: uw.rz, p: wp, y0: 7, y1: 10.2 }), wallMat));
  const bandTex = bandTexture([brand.title, brand.hall, 'LIVE ON ATVENTS', venue.court ? 'CENTRE COURT' : 'MAIN CARD'], { fg: '#f4f1ea', accent: '#e23a3a' });
  bandTex.repeat.set(compact ? 3 : 5, 1);
  scene.add(new THREE.Mesh(ribbon({ rx: band.rx, rz: band.rz, p: wp, y0: band.y0, y1: band.y1, uRepeat: 1 }), new THREE.MeshBasicMaterial({ map: bandTex, toneMapped: false, side: THREE.DoubleSide })));
  if (!compact) scene.add(new THREE.Mesh(ribbon({ rx: uw.rx, rz: uw.rz, p: wp, y0: 10.2, y1: 11.1 }), mats.glass()));

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

  // The ground outside: well under the grass, track and deck, and behind them in depth too.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), below(new THREE.MeshStandardMaterial({ color: show ? '#3a3a3c' : '#6c6b66', map: grime(), roughness: 1 }), 8));
  ground.material.map = grime().clone(); ground.material.map.repeat.set(80, 80); ground.material.map.needsUpdate = true;
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);
  if (!venue.arch) {
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(122, 86), new THREE.MeshStandardMaterial({ color: show ? '#2c2d30' : '#3f7a3e', roughness: 1 }));
    apron.rotation.x = -Math.PI / 2;
    apron.receiveShadow = true;
    scene.add(apron);
  }

  const tick = show ? stadiumShow(ctx, venue, brand) : football(ctx, brand);
  const arch = { madya: madyaStadium, jis: jisStadium }[venue.arch] || (venue.tiers ? threeTierBowl : standsAndRoof);
  arch(ctx, venue, brand, show);
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

// LED boards round the pitch, or along the part of it `range` gives (from, to in radians).
// They face the pitch; from the nearest stand one sees their plain black backs, not the
// words the wrong way round. Returns their texture, which the caller scrolls.
function pitchBoards(scene, words, accent, range = {}) {
  const tex = bandTexture(words, { bg: '#0a0a0c', fg: '#ffffff', accent });
  tex.repeat.set(10, 1);
  const geo = ribbon({ rx: 57.5, rz: 39.5, p: 0.42, y0: 0, y1: 0.95, uRepeat: 1, ...range });
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.8, side: THREE.BackSide })));
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

// ------------------------------------------------------------------ Stadion Madya GBK

// A running track's outline at radius r (two straights and two bends), as points (x, z)
// going round once.
function trackLoop(half, r, segs) {
  const pts = [];
  for (let i = 0; i <= segs; i++) { const a = -Math.PI / 2 + (Math.PI * i) / segs; pts.push([half + r * Math.cos(a), r * Math.sin(a)]); }
  for (let i = 0; i <= segs; i++) { const a = Math.PI / 2 + (Math.PI * i) / segs; pts.push([-half + r * Math.cos(a), r * Math.sin(a)]); }
  return pts;
}
// The flat band between two track outlines, facing up.
function trackRing(half, r0, r1, segs = 48) {
  const a = trackLoop(half, r0, segs), b = trackLoop(half, r1, segs), n = a.length, pos = [], idx = [];
  for (let i = 0; i < n; i++) pos.push(a[i][0], 0, a[i][1], b[i][0], 0, b[i][1]);
  for (let i = 0; i < n; i++) { const k = i * 2, l = ((i + 1) % n) * 2; idx.push(k, l, k + 1, k + 1, l, l + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// The ground inside a track outline, facing up.
function trackDisc(half, r, segs = 48) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(trackLoop(half, r, segs).map(([x, z]) => new THREE.Vector2(x, -z))));
  g.rotateX(-Math.PI / 2);
  return g;
}

// A solid of constant section along x, from x0 to x1: `pts` are [z, y] corners in order.
function prismX(pts, x0, x1) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(x0, 0, 0);
  return g;
}

// A floodlight tower: a lattice mast and a head of lamps turned to the field.
function floodTower(scene, x, z, h, look = [0, 0, 0]) {
  const mast = new THREE.Mesh(trussGeometry(h, 1.1), mats.steel());
  mast.rotation.z = Math.PI / 2;
  mast.position.set(x, h / 2, z);
  scene.add(mast);
  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.BoxGeometry(9, 6, 1), mats.blackMetal()));
  const lamps = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 5.6), new THREE.MeshBasicMaterial({ map: lampGridTexture(), toneMapped: false }));
  lamps.position.z = 0.52;
  head.add(lamps);
  head.position.set(x, h + 2, z);
  head.lookAt(...look);
  scene.add(head);
  return [mast, head];
}

// Stadion Madya: the red track and its lane lines round the field, the two grandstands on
// the straights (a stepped concrete raker, a back wall, and a flat roof hung from a row of
// raked steel masts), the covered walkway round the north bend that joins them, and four
// floodlight towers. https://en.wikipedia.org/wiki/Gelora_Bung_Karno_Madya_Stadium
function madyaStadium(ctx, venue, brand, show) {
  const { scene } = ctx, M = MADYA, half = M.straight / 2;
  const outer = M.bend + M.lanes * M.lane;
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); scene.add(m); return m; };

  // Track, lane lines, the infield and the apron round it.
  add(trackRing(half, outer, outer + 6.5), below(new THREE.MeshStandardMaterial({ color: show ? '#4a4b4f' : '#8d8c86', map: grime(), roughness: 1 }), 4));
  add(trackRing(half, M.bend, outer), below(new THREE.MeshStandardMaterial({ color: '#b04a35', roughness: 0.92 }), 3)).position.y = 0.01;
  const lines = [];
  for (let k = 0; k <= M.lanes; k++) {
    const r = M.bend + k * M.lane;
    lines.push(trackRing(half, r - 0.03, r + 0.03, 32));
  }
  add(mergeGeometries(lines), below(new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.9 }), 2)).position.y = 0.02;
  add(trackDisc(half, M.bend), below(new THREE.MeshStandardMaterial({ color: '#4d7f3a', roughness: 1 }), 4)).position.y = 0.005;

  // The grandstands. Rows run from the front row back; the raker sits just under the seats.
  const concrete = new THREE.MeshStandardMaterial({ color: '#b3b2ac', map: grime(), roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: '#e8e9eb', roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
  const under = new THREE.MeshStandardMaterial({ color: '#5d6066', roughness: 0.8, side: THREE.DoubleSide });
  const len = M.blocks * (M.blockSeats * M.spacing + M.aisle) + 3, x0 = -len / 2, x1 = len / 2;
  const front = M.standFront - M.rowDepth / 2, back = M.standFront + (M.rows - 0.5) * M.rowDepth;
  const top = M.baseY + (M.rows - 1) * M.rise;
  const roofs = [];
  for (const sz of [1, -1]) {
    const z = v => sz * v;
    const raker = [[front - 0.3, 0], [front - 0.3, 1.25], [front, M.baseY - 0.42], [back, top - 0.42], [back + 0.6, top + 1.1], [back + 0.6, 0]];
    // Solid, and casting its shadow: the seats' own shadows would show through it.
    add(prismX(sz > 0 ? raker : raker.map(([a, b]) => [-a, b]).reverse(), x0, x1), concrete).castShadow = true;
    // Back wall with its windows, and the concourse block under the stand.
    add(box(len, 3.2, 0.4, 0, top + 2.6, z(back + 0.8)), white);
    add(box(len, top - 0.4, 6, 0, (top - 0.4) / 2, z(back + 3.6)), under).castShadow = true;
    // The roof: a flat plate from behind the back wall to just past the front row, hung
    // from raked masts along the back.
    const roofBack = back + 4, roofFront = front - 2.5, yBack = top + 9.5, yFront = top + 8.2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(len + 4, 0.35, roofBack - roofFront), white);
    plate.position.set(0, (yBack + yFront) / 2, z((roofBack + roofFront) / 2));
    plate.rotation.x = sz * Math.atan2(yBack - yFront, roofBack - roofFront);
    plate.castShadow = true;
    scene.add(plate);
    const masts = [], ties = [];
    for (let i = 0; i <= 15; i++) {
      const x = x0 - 1 + i * (len + 2) / 15;
      masts.push(box(0.5, yBack + 6, 0.5, x, (yBack + 6) / 2, z(roofBack - 0.6)));
      // A tie from the mast head down to the roof's front edge.
      const a = new THREE.Vector3(x, yBack + 6, z(roofBack - 0.6)), b = new THREE.Vector3(x, yFront + 0.3, z(roofFront + 0.6));
      const g = new THREE.BoxGeometry(0.22, 0.22, a.distanceTo(b));
      const o = new THREE.Object3D();
      o.position.copy(a).add(b).multiplyScalar(0.5);
      o.lookAt(b);
      o.updateMatrix();
      g.applyMatrix4(o.matrix);
      ties.push(g);
    }
    const steel = add(mergeGeometries([...masts, ...ties]), mats.steel());
    roofs.push(plate, steel);
  }

  // The covered walkway round the north bend, joining the two stands.
  const walkR = outer + 9, bend = { from: -Math.PI / 2, to: Math.PI / 2 };
  const arcGeo = (r, h, y) => {
    const g = new THREE.CylinderGeometry(r, r, h, 48, 1, true, Math.PI / 2 + bend.from, bend.to - bend.from);
    g.translate(half, y, 0);
    return g;
  };
  add(arcGeo(walkR + 4, 4.2, 2.1), white);
  add(arcGeo(walkR, 1.1, 0.55), concrete);
  const walkRoof = new THREE.RingGeometry(walkR - 0.5, walkR + 4.4, 48, 1, bend.from, bend.to - bend.from);
  walkRoof.rotateX(-Math.PI / 2);
  walkRoof.translate(half, 4.3, 0);
  roofs.push(add(walkRoof, white));

  // Floodlight towers by the four corners.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    roofs.push(...floodTower(scene, sx * (half + 26), sz * (back + 9), 44, [sx * 12, 0, sz * 6]));
  }

  // LED boards on the fronts of the stands: the show's name, or the stadium's.
  const words = show ? brand.band : [groundName(venue), 'GELORA BUNG KARNO', 'JAKARTA'];
  const tex = bandTexture(words, { bg: '#0a0a0c', fg: '#ffffff', accent: themeOf(venue).band });
  tex.repeat.set(5, 1);
  for (const sz of [1, -1]) {
    const board = add(new THREE.PlaneGeometry(len - 4, 0.9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    board.position.set(0, 0.75, sz * (front - 0.33));
    board.rotation.y = sz > 0 ? Math.PI : 0;   // facing the field
  }
  roofs.forEach(m => ctx.cutaway(m));
  ctx.onTick((t, dt) => { tex.offset.x = (tex.offset.x + dt * 0.02) % 1; });
}

// ------------------------------------------------------------------ Jakarta International Stadium

// A flat superellipse with rz = rx - 18, laid on the ground.
function superDisc(rx, p, segs = 180) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const [x, z] = superPoint((i / segs) * Math.PI * 2, rx, rx - 18, p);
    pts.push(new THREE.Vector2(x, -z));
  }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  g.rotateX(-Math.PI / 2);
  return g;
}

// A round bar from a to b.
function rod(a, b, r) {
  const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// The height of JIS's roof trusses along x: an arch from the two ends up to the middle.
const archY = (x, span, yEnd, yMid) => yEnd + (yMid - yEnd) * (1 - (x / span) ** 2);

// One long roof truss, arched along x at z: two planes of chords, posts and diagonals,
// tied across.
function roofTruss(z, span, yEnd, yMid, depth = 5, width = 3.2) {
  const parts = [], n = 26;
  const node = (i, up, side) => {
    const x = -span + (2 * span * i) / n;
    return new THREE.Vector3(x, archY(x, span, yEnd, yMid) + (up ? depth : 0), z + side * width / 2);
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      parts.push(rod(node(i, 0, side), node(i + 1, 0, side), 0.55), rod(node(i, 1, side), node(i + 1, 1, side), 0.55));
      parts.push(rod(node(i, 0, side), node(i, 1, side), 0.22));
      parts.push(i % 2 ? rod(node(i, 1, side), node(i + 1, 0, side), 0.2) : rod(node(i, 0, side), node(i + 1, 1, side), 0.2));
    }
    parts.push(rod(node(n, 0, side), node(n, 1, side), 0.22));
  }
  for (let i = 0; i <= n; i += 2) parts.push(rod(node(i, 0, -1), node(i, 0, 1), 0.18), rod(node(i, 1, -1), node(i, 1, 1), 0.18));
  return merge(parts);
}

// The skin: white fins over dark glass, with an orange line round the stadium.
function finTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1a1f26'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e2e5e8' : '#f0f1f3'; g.fillRect(i * 32 + 5, 0, 22, h); }
    g.fillStyle = '#ef6a2a'; g.fillRect(0, Math.round(h * 0.6), w, 5);
  }, { repeat: [1, 1] });
}

// Jakarta International Stadium: three tiers all round a football pitch, the concourses and
// the glass boxes between them, a white skin of fins, and a roof over every seat round an
// opening the size of the pitch. Two long arched trusses span the opening from end to end:
// the roof that closes it slides along them, and stands open here, parked over the ends.
// At a concert the stands behind the stage are closed under black covers. `venue.tiers` is
// JIS (realvenues.js), the same numbers the seats are laid out with.
function jisStadium(ctx, venue, brand, show) {
  const { scene } = ctx, T = venue.tiers, p = T.p, theme = themeOf(venue);
  const tiers = [T.lower, T.middle, T.upper], [lower, middle, upper] = tiers;
  const front = t => t.rx0 - t.gap / 2, back = t => t.rx0 + (t.rows - 0.5) * t.gap, top = t => t.baseY + (t.rows - 1) * t.rise;
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); scene.add(m); return m; };
  const ring = r => ({ rx: r, rz: r - 18, p });
  const band = (r, y0, y1, range, mat, uRepeat) => add(ribbon({ ...ring(r), y0, y1, ...range, ...(uRepeat ? { uRepeat } : {}) }), mat);
  const slab = (r0, y0, r1, y1, range, mat) => add(loft({ ...ring(r0), y: y0, ...range }, { ...ring(r1), y: y1 }), mat);

  const concrete = new THREE.MeshStandardMaterial({ color: '#aaa9a4', map: grime(), roughness: 0.95, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: '#eceef0', roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide });
  const cover = new THREE.MeshStandardMaterial({ color: '#121315', roughness: 0.92, side: THREE.DoubleSide });
  const boxGlass = new THREE.MeshStandardMaterial({ color: '#1d242d', metalness: 0.4, roughness: 0.12, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide });

  // Grass round the pitch, the pitch wall and the LED boards (not behind an end stage).
  add(superDisc(front(lower) - 0.2, p), below(new THREE.MeshStandardMaterial({ color: show ? '#2e4a2b' : '#3f7a3e', roughness: 1 }), 4)).position.y = 0.004;
  band(front(lower) - 0.2, 0, lower.baseY - 0.1, {}, concrete);
  const words = show ? brand.band : [groundName(venue), 'JAKARTA', 'WELCOME'];
  const adTex = pitchBoards(scene, words, theme.band, show === 'end' ? { from: -Math.PI * 5 / 6, to: Math.PI * 5 / 6 } : {});

  // Each tier: the raker its treads stand on, and behind it a wall down to the floor below.
  const under = [0, top(lower), top(middle)];
  tiers.forEach((t, i) => {
    // Casting its shadow, so the seats' own shadows do not show through it.
    slab(front(t), t.baseY - 0.9, back(t), top(t) - 0.9, {}, concrete).castShadow = true;
    if (i < 2) band(back(t) + 0.05, under[i], top(t) + 1.1, {}, concrete).castShadow = true;
  });
  // The concourse between the lower and middle tiers, and the middle tier's front.
  slab(back(lower), top(lower), front(middle), top(lower), {}, concrete);
  band(front(middle) - 0.05, top(lower), middle.baseY + 0.95, {}, white);
  // The boxes between the middle and upper tiers, and the upper tier's front.
  const glassR = front(upper) - 0.35;
  slab(back(middle), top(middle), glassR, top(middle), {}, concrete);
  band(glassR, top(middle), upper.baseY - 1.4, {}, boxGlass);
  band(glassR, upper.baseY - 1.4, upper.baseY + 0.95, {}, white);
  // LED ribbons along the two tier fronts.
  const ribbonTex = bandTexture(words, { bg: '#0b0b0d', fg: '#ffffff', accent: theme.band });
  ribbonTex.repeat.set(9, 1);
  const led = new THREE.MeshBasicMaterial({ map: ribbonTex, toneMapped: false });   // facing the pitch
  band(front(middle) - 0.12, middle.baseY + 0.15, middle.baseY + 0.9, {}, led, 1);
  band(glassR - 0.07, upper.baseY + 0.12, upper.baseY + 0.88, {}, led, 1);

  // Behind an end stage the stands are closed: black covers over the rows nobody sells.
  if (show === 'end') {
    for (const t of tiers) {
      const e = jisEnd(t);
      slab(front(t), t.baseY + 0.05, back(t), top(t) + 0.05, { from: e, to: Math.PI * 2 - e }, cover);
    }
  }

  // Back wall, skin and roof: hidden on the map so the top rows stay in view.
  const eaves = 33.5, inner = 62, innerY = 42, outer = back(upper) + 5;
  const skin = new THREE.MeshStandardMaterial({ map: finTexture(), roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#f2f3f5', roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
  const cut = [
    band(back(upper) + 0.1, top(upper) - 0.9, eaves, {}, concrete),
    band(outer, 0, eaves, {}, skin, 150),
    slab(inner, innerY, outer + 0.6, eaves, {}, roofMat),
  ];
  cut[0].castShadow = cut[2].castShadow = true;
  // Floodlights along the roof's inner edge, turned to the pitch.
  const lampPts = [];
  for (let i = 0; i < 64; i++) {
    const [x, z] = superPoint((i / 64) * Math.PI * 2, inner + 0.6, inner - 17.4, p);
    lampPts.push([x, innerY - 0.6, z]);
  }
  const lamps = instanceAlong(new THREE.PlaneGeometry(4.2, 1.5), new THREE.MeshBasicMaterial({ map: lampGridTexture(), toneMapped: false, side: THREE.DoubleSide }), lampPts, { look: new THREE.Vector3(0, 0, 0) });
  scene.add(lamps);
  // The two long trusses over the opening, and the roof that closes it, open: its panels
  // (translucent ETFE) parked over the two ends.
  const span = outer + 2, yEnd = eaves + 2, yMid = innerY + 10, tz = inner - 18;
  const trusses = add(mergeGeometries([roofTruss(tz, span, yEnd, yMid), roofTruss(-tz, span, yEnd, yMid)]), new THREE.MeshStandardMaterial({ color: '#f4f5f7', roughness: 0.45, metalness: 0.35 }));
  trusses.castShadow = true;
  const etfe = new THREE.MeshStandardMaterial({ color: '#eef3f7', roughness: 0.3, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
  const panels = [];
  for (const sx of [-1, 1]) {
    const x0 = inner - 4, x1 = span - 4;
    const g = new THREE.PlaneGeometry(x1 - x0, tz * 2 - 3, 12, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(sx * (x0 + x1) / 2, 0, 0);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setY(k, archY(pos.getX(k), span, yEnd, yMid) + 0.4);
    g.computeVertexNormals();
    panels.push(add(g, etfe));
  }
  [...cut, lamps, trusses, ...panels].forEach(m => ctx.cutaway(m));

  // A screen over the back of the far end, under the roof: the show's poster, or the score.
  const art = show ? screenArt(brand, venue)(22 / 6.2) : scoreTexture(brand);
  const sm = screenMaterial({ ...(show ? theme.screen : { a: '#06080d', b: '#14213d', c: '#8fb3ff' }), tex: art, pixel: 80 });
  const scr = add(new THREE.PlaneGeometry(22, 6.2), sm);
  scr.position.set(back(upper) - 0.2, top(upper) + 4, 0);
  scr.rotation.y = -Math.PI / 2;
  const scrBack = add(box(22.4, 6.6, 0.5, 0, 0, 0), mats.matteBlack());
  scrBack.position.set(back(upper) + 0.1, top(upper) + 4, 0);
  scrBack.rotation.y = -Math.PI / 2;

  ctx.onTick((t, dt) => {
    sm.uniforms.uTime.value = t;
    adTex.offset.x = (adTex.offset.x + dt * 0.02) % 1;
    ribbonTex.offset.x = (ribbonTex.offset.x - dt * 0.01) % 1;
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
  const { scene } = ctx, theme = themeOf(venue), stageX = venue.stageX ?? -40;
  const deckMat = new THREE.MeshStandardMaterial({ color: '#3b3c40', map: grime(), roughness: 0.75 });
  deckMat.map = grime().clone(); deckMat.map.repeat.set(20, 14); deckMat.map.needsUpdate = true;
  // The deck over the grass: the pitch, or at a real venue the standing floor and 2 m round it.
  let [cx0, cx1, cz] = [-52.5, 52.5, 34];
  // The floor: standing spots and chairs set out on the pitch (no tier).
  const floor = venue.arch && venue.seats.filter(s => s.standing || !s.tier);
  if (floor?.length) {
    cx0 = Math.min(...floor.map(s => s.x)) - 2; cx1 = Math.max(...floor.map(s => s.x)) + 2;
    cz = Math.max(...floor.map(s => Math.abs(s.z))) + 2;
  }
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(cx1 - cx0, cz * 2), deckMat);
  cover.rotation.x = -Math.PI / 2;
  cover.position.set((cx0 + cx1) / 2, 0.02, 0);
  cover.receiveShadow = true;
  scene.add(cover);
  // On the map, each floor block in its category's colour with its name on it (zoneColors).
  floorZones(ctx, venue);
  const art = screenArt(brand, venue);
  const screens = [];
  const screen = (w, h, pixel) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMaterial({ ...theme.screen, tex: art(w / h), pixel }));
    ctx.mood(m.material.uniforms.uLevel, 'value', 0.7, 1.35);
    screens.push(m.material);
    return m;
  };
  const beams = [];
  const beamAt = (parent, x, y, z, i) => {
    const b = beam(theme.beams[i % theme.beams.length], 46, 3.2);
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
    // Walkways out into the field and a B-stage, where the show's plan has them: in the
    // stage's own frame, x across it and z out from its front edge.
    for (const t of venue.stage?.thrust || []) {
      const len = Math.hypot(t.x1 - t.x0, t.z1 - t.z0), h = t.h ?? 2.0;
      const walk = new THREE.Mesh(new THREE.BoxGeometry(t.w, h, len), deck.material);
      walk.position.set((t.x0 + t.x1) / 2, h / 2, (t.z0 + t.z1) / 2);
      walk.rotation.y = Math.atan2(t.x1 - t.x0, t.z1 - t.z0);
      walk.castShadow = walk.receiveShadow = true;
      g.add(walk);
      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, len), lip.material);
        edge.position.set(side * t.w / 2, h / 2 + 0.03, 0);
        walk.add(edge);
      }
    }
    for (const b of venue.stage?.bstage || []) {
      const h = b.h ?? 2.0;
      const plat = new THREE.Mesh(b.round ? new THREE.CylinderGeometry(b.w / 2, b.w / 2, h, 8) : new THREE.BoxGeometry(b.w, h, b.d), deck.material);
      plat.position.set(b.x, h / 2, b.z);
      plat.castShadow = plat.receiveShadow = true;
      g.add(plat);
    }
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
    const wash = new THREE.SpotLight(theme.wash, 1, 90, 0.6, 0.6, 1.2);
    wash.position.set(0, 30, 22);
    wash.target.position.set(0, 2, -8);
    ctx.mood(wash, 'intensity', 0, 4200);
    g.add(wash, wash.target);
    const backLight = new THREE.PointLight(theme.glow, 1, 60, 1.5);
    backLight.position.set(0, 16, -12);
    ctx.mood(backLight, 'intensity', 0, 420);
    g.add(backLight);
    g.rotation.y = Math.PI / 2;
    g.position.set(stageX, 0, 0);
    scene.add(g);
    const barrier = new THREE.Mesh(crowdBarrier(venue.stage?.barrier || 56), mats.steel());
    barrier.rotation.y = Math.PI / 2;
    barrier.position.set(stageX + 1.6, 0, 0);
    scene.add(barrier);
    // Delay towers down the field, where the show's plan has them (d out from the stage's
    // front edge, z across), else halfway down either side of the crowd; and the sound desk.
    if (venue.arch) {
      for (const [d, z] of venue.towers || [[52, -31.5], [52, 31.5]]) {
        const tower = new THREE.Mesh(trussGeometry(16, 0.5), steel);
        tower.rotation.z = Math.PI / 2;
        tower.position.set(stageX + d, 8, z);
        scene.add(tower);
        for (let k = 0; k < 8; k++) {
          const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.9), mats.matteBlack());
          cab.position.set(stageX + d - 0.8, 15 - k * 0.44, z);
          cab.rotation.y = Math.PI / 2;
          scene.add(cab);
        }
      }
    }
    // A pen in front of the stage (VVIP), railed off on its other three sides.
    if (venue.pen) {
      const { x, halfW, halfD } = venue.pen;
      const rail = (len, px, pz, ry) => { const b = new THREE.Mesh(crowdBarrier(len), steel); b.position.set(px, 0, pz); b.rotation.y = ry; scene.add(b); };
      rail(halfW * 2, x + halfD, 0, Math.PI / 2);
      for (const sz of [-1, 1]) rail(halfD * 2, x, sz * halfW, 0);
    }
    if (venue.foh) {
      const [fx, fz] = venue.foh;
      const desk = new THREE.Group();
      desk.add(new THREE.Mesh(box(5.2, 1.0, 7.2, 0, 0.5, 0), mats.darkConcrete()));
      desk.add(new THREE.Mesh(box(5.6, 0.12, 7.6, 0, 3.6, 0), mats.matteBlack()));
      for (const [cx, cz] of [[-2.6, -3.6], [2.6, -3.6], [-2.6, 3.6], [2.6, 3.6]]) desk.add(new THREE.Mesh(box(0.12, 2.6, 0.12, cx, 2.3, cz), steel));
      desk.add(new THREE.Mesh(box(1.4, 0.5, 6, 0.6, 1.25, 0), mats.blackMetal()));
      desk.position.set(fx, 0, fz);
      scene.add(desk);
    }
  } else {
    if (venue.stage?.arm) spin = roundStage(ctx, venue, { screen, beamAt, steel, theme });
    else {
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
    const wash = new THREE.SpotLight(theme.wash, 1, 90, 0.5, 0.6, 1.2);
    wash.position.set(0, 46, 0);
    wash.target.position.set(0, 2, 0);
    ctx.mood(wash, 'intensity', 0, 4200);
    scene.add(wash, wash.target);
    const glow = new THREE.PointLight(theme.glow, 1, 50, 1.5);
    glow.position.set(0, 18, 0);
    ctx.mood(glow, 'intensity', 0, 380);
    scene.add(glow);
    }
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

// ------------------------------------------------------------------ floor plan on the map

// Each floor block (seats or standing spots off the tiers) drawn on the map in its category's
// colour, row by row so the block keeps its real outline (stepped edges, aisles), with the
// block's name in big letters over it, upright to the people in it looking at the stage.
// Shown from above only: scene3d.js hides ctx.zoneFloors from a seat.
function floorZones(ctx, venue) {
  if (!venue.zoneColors) return;
  const floor = venue.seats.filter(s => !s.tier);
  if (!floor.length) return;
  const secs = new Map();
  for (const s of floor) {
    if (!secs.has(s.sec)) secs.set(s.sec, { name: s.secName || s.sec, cat: s.cat, yaw: s.yaw, rows: new Map(), cats: new Map() });
    const b = secs.get(s.sec);
    b.cats.set(s.cat, (b.cats.get(s.cat) || 0) + 1);
    if (!b.rows.has(s.row)) b.rows.set(s.row, []);
    b.rows.get(s.row).push(s);
  }
  const out = [];
  for (const [sec, b] of secs) {
    const cat = [...b.cats].sort((p, q) => q[1] - p[1])[0][0];
    // Facing f (towards the stage) and across r, from the block's first seat.
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = -fz, rz = fx;
    const strips = [];
    let y = 0, minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const row of b.rows.values()) {
      const w = row[0].width || 0.56, depth = row[0].rowDepth || 0.9;
      const pts = row.map(s => ({ u: s.x * rx + s.z * rz, v: s.x * fx + s.z * fz })).sort((p, q) => p.u - q.u);
      const v = pts.reduce((a, p) => a + p.v, 0) / pts.length;
      y = Math.max(y, row[0].y);
      // A gap wider than two seats is an aisle: the strip breaks there.
      let start = pts[0].u, prev = pts[0].u;
      const flush = end => {
        const len = end - start + w, mid = (start + end) / 2;
        const g = new THREE.PlaneGeometry(len, depth * 1.02);
        g.rotateX(-Math.PI / 2);
        g.rotateY(b.yaw);
        g.translate(rx * mid + fx * v, 0, rz * mid + fz * v);
        strips.push(g);
      };
      for (let k = 1; k < pts.length; k++) {
        if (pts[k].u - prev > w * 2.2) { flush(prev); start = pts[k].u; }
        prev = pts[k].u;
      }
      flush(prev);
      minU = Math.min(minU, pts[0].u - w / 2); maxU = Math.max(maxU, prev + w / 2);
      minV = Math.min(minV, v - depth / 2); maxV = Math.max(maxV, v + depth / 2);
    }
    const color = venue.catById[cat]?.color || '#888888';
    const mat = below(new THREE.MeshStandardMaterial({ color, roughness: 0.85, transparent: true, opacity: 0.5, depthWrite: false }), -2);
    const m = new THREE.Mesh(mergeGeometries(strips), mat);
    strips.forEach(g => g.dispose());
    m.position.y = y + 0.04;
    m.userData.cat = cat;
    ctx.scene.add(m);
    out.push(m);
    // The name, over the heads of the crowd, across the block's middle.
    const across = maxU - minU, deep = maxV - minV;
    if (across < 4 || deep < 3) continue;
    // Two lines: the block's name, and under it what a fan wants next: the price and how many
    // seats (or spots) it holds, or that it is sold out, so the map answers "where can I sit
    // and what does it cost" without opening the list.
    const words = b.name.toUpperCase();
    const c = venue.catById[cat], id = lang === 'id';
    const count = [...b.rows.values()].reduce((a, r) => a + r.length, 0);
    const sold = venue.meta?.soldOut?.includes(cat);
    const unit = floor.find(q => q.sec === sec)?.standing ? (id ? 'tempat berdiri' : 'standing') : (id ? 'kursi' : 'seats');
    const info = sold ? (id ? 'HABIS TERJUAL' : 'SOLD OUT') : `${c?.price ? (id ? `Rp ${+(c.price / 1e6).toFixed(2)} jt`.replace('.', ',') : formatRpShort(c.price)) + '  ·  ' : ''}${count.toLocaleString(id ? 'id-ID' : 'en-US')} ${unit}`;
    const TW = 1024, TH = 288;
    const tex = textTexture(TW, TH, (g, w, h) => {
      let size = 150;
      const font = (px, wt = 800) => `${wt} ${px}px "Inter", "Helvetica Neue", Arial, sans-serif`;
      g.font = font(size);
      while (g.measureText(words).width > w - 40 && size > 40) { size -= 6; g.font = font(size); }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = size * 0.2; g.strokeStyle = 'rgba(12,12,16,0.92)';
      g.strokeText(words, w / 2, h * 0.36);
      g.fillStyle = '#ffffff';
      g.fillText(words, w / 2, h * 0.36);
      // The info line on a pill in the category's colour (dark when sold out).
      const small = Math.round(size * 0.52);
      g.font = font(small, 700);
      const pw = g.measureText(info).width + small * 1.2, ph = small * 1.5, px = (w - pw) / 2, py = h * 0.78 - ph / 2;
      g.fillStyle = sold ? 'rgba(20,20,24,0.92)' : (c?.color || '#888888');
      g.beginPath(); g.roundRect(px, py, pw, ph, ph / 2); g.fill();
      g.lineWidth = 4; g.strokeStyle = 'rgba(12,12,16,0.85)'; g.stroke();
      g.fillStyle = sold ? '#ff6b6b' : '#111114';
      g.fillText(info, w / 2, h * 0.78 + 2);
    });
    const lw = Math.min(across * 0.85, deep * 2.6, 40), lh = lw * TH / TW;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.95 }));
    label.rotation.order = 'YXZ';
    // Upright to the people in the block; turned round where that would read upside down
    // from the map's usual side (the camera starts south, at +z).
    label.rotation.set(-Math.PI / 2, fz > 0.3 ? b.yaw + Math.PI : b.yaw, 0);
    const mu = (minU + maxU) / 2, mv = (minV + maxV) / 2;
    label.position.set(rx * mu + fx * mv, y + 2.7, rz * mu + fz * mv);
    label.renderOrder = 5;
    label.userData = { cat, label: true };
    (ctx.floorNamed ||= new Set()).add(sec);
    ctx.scene.add(label);
    out.push(label);
  }
  ctx.zoneFloors = [...(ctx.zoneFloors || []), ...out];
}

// A pavilion over the main stage after Gyeonghoeru, the royal banquet hall the ARIRANG stage
// takes its look from: red-lacquered columns round the towers, a band of dancheong (the
// painted green and red beams under a Korean roof), and a hipped roof of dark tiles whose
// eaves sweep up at the corners, with a ridge on top. Built over the truss roof, which still
// carries the lights and speakers under it.
function pavilion(ctx, S, R, ROOF) {
  const { scene } = ctx, H = S.half;
  const red = new THREE.MeshStandardMaterial({ color: '#8e1b1b', roughness: 0.55 });
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    for (const [ax, az] of [[R, H - 3], [H - 3, R]]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, ROOF - 0.6, 16), red);
      col.position.set(ax * sx, (ROOF - 0.6) / 2, az * sz);
      col.castShadow = true;
      scene.add(col);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.6, 16), mats.concrete());
      base.position.set(ax * sx, 0.3, az * sz);
      scene.add(base);
    }
  }
  // Dancheong: a frieze round all four sides just under the eaves.
  const dan = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#1f6b52'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c23a2b'; g.fillRect(0, h * 0.72, w, h * 0.28);
    for (let i = 0; i < 16; i++) {
      const x = (i + 0.5) * w / 16;
      g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(x, h * 0.38, h * 0.22, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2b4c9b'; g.beginPath(); g.arc(x, h * 0.38, h * 0.12, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(x, h * 0.38, h * 0.05, 0, Math.PI * 2); g.fill();
    }
  }, { repeat: [3, 1] });
  const span = R * 2 + 1.6;
  for (const [x, z, ry] of [[0, R + 0.8, 0], [0, -R - 0.8, 0], [R + 0.8, 0, Math.PI / 2], [-R - 0.8, 0, Math.PI / 2]]) {
    const beamM = new THREE.Mesh(new THREE.BoxGeometry(span, 1.4, 0.5), [mats.matteBlack(), mats.matteBlack(), mats.matteBlack(), mats.matteBlack(), new THREE.MeshStandardMaterial({ map: dan, roughness: 0.7 }), new THREE.MeshStandardMaterial({ map: dan, roughness: 0.7 })]);
    beamM.position.set(x, ROOF + 0.9, z);
    beamM.rotation.y = ry;
    scene.add(beamM);
  }
  // The eaves: a wide skirt of tiles, flat in the middle of each side and sweeping up to the
  // corners, the way a Korean roof's line curves.
  const E = R + 3.5, n = 48;
  const eave = new THREE.PlaneGeometry(E * 2, E * 2, n, n);
  eave.rotateX(-Math.PI / 2);
  const pos = eave.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const m = Math.max(Math.abs(x), Math.abs(z)) / E;
    const corner = (Math.abs(x) / E) * (Math.abs(z) / E);
    pos.setY(i, (1 - m) * 2.4 + Math.pow(corner, 3) * 2.8);
  }
  eave.computeVertexNormals();
  const tiles = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2d2f33'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#3a3c41' : '#25272b'; g.fillRect(i * w / 16, 0, w / 32, h); }
  }, { repeat: [24, 24] });
  const roofMat = new THREE.MeshStandardMaterial({ map: tiles, color: '#9aa0a8', roughness: 0.8, side: THREE.DoubleSide });
  const skirt = new THREE.Mesh(eave, roofMat);
  skirt.position.y = ROOF + 1.6;
  skirt.castShadow = true;
  scene.add(skirt);
  // The hipped roof above, and its ridge.
  const hip = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, (R - 1) * Math.SQRT2, 3.6, 4, 1), roofMat);
  hip.rotation.y = Math.PI / 4;
  hip.position.y = ROOF + 1.6 + 2.4 + 1.8 - 0.3;
  hip.castShadow = true;
  scene.add(hip);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(R * 0.72 * 2, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: '#1c1d20', roughness: 0.6 }));
  ridge.position.y = hip.position.y + 2.0;
  scene.add(ridge);
  // LED flags on poles round the stage (the ARIRANG segment's flags), lit on the night.
  const flagMat = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide, map: canvasTex(128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#ff4058'); grd.addColorStop(1, '#2b5bd7');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }) });
  ctx.mood(flagMat.color, 'r', 0.35, 1); ctx.mood(flagMat.color, 'g', 0.35, 1); ctx.mood(flagMat.color, 'b', 0.35, 1);
  for (const [x, z] of [[-H + 2, H + 0.6], [H - 2, H + 0.6], [-H + 2, -H - 0.6], [H - 2, -H - 0.6], [H + 0.6, -H + 2], [H + 0.6, H - 2], [-H - 0.6, -H + 2], [-H - 0.6, H - 2]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 8), mats.steel());
    pole.position.set(x, 1.9 + 3.5, z);
    scene.add(pole);
    // Facing out from the stage, hung beside its pole.
    const l = Math.hypot(x, z), ox = x / l, oz = z / l;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.6), flagMat);
    flag.position.set(x + oz * 0.6, 1.9 + 5.4, z - ox * 0.6);
    flag.rotation.y = Math.atan2(ox, oz);
    scene.add(flag);
  }
}

// BTS's 360 stage (venue.stage, layouts.js BTS_STAGE): a square main stage with a round lift,
// four runways out along the diagonals to end stages with steps down, barriers along them,
// eight truss towers round the main stage holding a square roof of truss, moving heads and
// line arrays hung from it, the screen cube in the middle, and delay towers in the field.
// Returns the cube, which turns slowly.
function roundStage(ctx, venue, { screen, beamAt, steel, theme }) {
  const { scene } = ctx, S = venue.stage, H = S.half, A = S.arm, TOP = 1.9;
  const deckMat = new THREE.MeshStandardMaterial({ color: '#111116', roughness: 0.35, metalness: 0.2 });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const tint = new THREE.MeshBasicMaterial({ color: theme.glow || '#9d7bff', toneMapped: false });
  const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
  const edge = (len, x, z, ry, y = TOP + 0.02) => { const e = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.08), glowMat); e.position.set(x, y, z); e.rotation.y = ry; scene.add(e); };

  // Main stage, its lit edge and the floor's markings: two rings round the lift and spokes.
  add(new THREE.Mesh(box(H * 2, TOP, H * 2, 0, TOP / 2, 0), deckMat));
  for (const [x, z, ry] of [[0, H, 0], [0, -H, 0], [H, 0, Math.PI / 2], [-H, 0, Math.PI / 2]]) edge(H * 2, x, z, ry);
  const marks = canvasTex(1024, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const c = w / 2, k = w / (H * 2);
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 6;
    for (const r of [S.lift + 0.4, S.lift + 2.6]) { g.beginPath(); g.arc(c, c, r * k, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 3; g.strokeStyle = 'rgba(200,185,255,0.8)';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * (S.lift + 0.4) * k, c + Math.sin(a) * (S.lift + 0.4) * k); g.lineTo(c + Math.cos(a) * (S.lift + 2.6) * k, c + Math.sin(a) * (S.lift + 2.6) * k); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    g.strokeRect(0.6 * k, 0.6 * k, w - 1.2 * k, h - 1.2 * k);
  });
  const deckTop = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), new THREE.MeshBasicMaterial({ map: marks, transparent: true, depthWrite: false, toneMapped: false }));
  deckTop.rotation.x = -Math.PI / 2;
  deckTop.position.y = TOP + 0.015;
  scene.add(deckTop);
  // The lift, painted with a taegeuk where the show's design has one (S.korean): the red and
  // blue swirl of the Korean flag, which the ARIRANG stage floor takes up.
  const liftSide = new THREE.MeshStandardMaterial({ color: '#1b1a24', roughness: 0.25, metalness: 0.3 });
  const liftTop = S.korean ? new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, map: canvasTex(1024, 1024, (g, w) => {
    const c = w / 2, r = w / 2 - 4;
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, w);
    g.fillStyle = '#c60c30'; g.beginPath(); g.arc(c, c, r, Math.PI, 0); g.fill();
    g.fillStyle = '#003478'; g.beginPath(); g.arc(c, c, r, 0, Math.PI); g.fill();
    g.fillStyle = '#c60c30'; g.beginPath(); g.arc(c - r / 2, c, r / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#003478'; g.beginPath(); g.arc(c + r / 2, c, r / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f4f1ea'; g.lineWidth = 10; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
  }) }) : liftSide;
  const lift = add(new THREE.Mesh(new THREE.CylinderGeometry(S.lift, S.lift, 0.3, 64), [liftSide, liftTop, liftSide]));
  if (S.korean) lift.rotation.y = -Math.PI / 4;
  lift.position.y = TOP + 0.05;
  const liftRim = new THREE.Mesh(new THREE.TorusGeometry(S.lift, 0.06, 6, 96), tint);
  liftRim.rotation.x = Math.PI / 2;
  liftRim.position.y = TOP + 0.21;
  scene.add(liftRim);

  // Runways and end stages, with steps down at the far end and barriers along both sides.
  const rail = (len, x, z, ry) => { const b = new THREE.Mesh(crowdBarrier(len), steel); b.position.set(x, 0, z); b.rotation.y = ry; scene.add(b); };
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const len = (A.to - A.from) * Math.SQRT2, mid = (A.from + A.to) / 2;
    const ry = Math.atan2(sx, sz), ux = sx / Math.SQRT2, uz = sz / Math.SQRT2, px = uz, pz = -ux;
    const walk = add(new THREE.Mesh(new THREE.BoxGeometry(A.w, TOP, len), deckMat));
    walk.position.set(mid * sx, TOP / 2, mid * sz);
    walk.rotation.y = ry;
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, len), glowMat);
      e.position.set(mid * sx + px * side * A.w / 2, TOP + 0.02, mid * sz + pz * side * A.w / 2);
      e.rotation.y = ry;
      scene.add(e);
      const lights = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, len), tint);
      lights.position.set(mid * sx + px * side * (A.w / 2 + 0.01), TOP - 0.3, mid * sz + pz * side * (A.w / 2 + 0.01));
      lights.rotation.y = ry;
      scene.add(lights);
      const off = A.w / 2 + 1.4;
      rail(len - 2, mid * sx + px * side * off, mid * sz + pz * side * off, ry + Math.PI / 2);
    }
    const bx = A.to * sx, bz = A.to * sz, B = S.bHalf;
    add(new THREE.Mesh(box(B * 2, TOP, B * 2, bx, TOP / 2, bz), deckMat));
    for (const [x, z, r] of [[bx, bz + B, 0], [bx, bz - B, 0], [bx + B, bz, Math.PI / 2], [bx - B, bz, Math.PI / 2]]) edge(B * 2, x, z, r);
    // Logo-free emblem on the end stage: a lit ring.
    if (S.korean) {
      // The flag's four trigrams, one on each end stage as on the flag's corners: geon (three
      // whole bars), gon (three broken), gam (broken, whole, broken), ri (whole, broken, whole).
      const tri = { '-1,-1': [1, 1, 1], '1,1': [0, 0, 0], '1,-1': [0, 1, 0], '-1,1': [1, 0, 1] }[`${sx},${sz}`];
      const tex = textTexture(512, 512, (g, w) => {
        g.fillStyle = '#f4f1ea';
        tri.forEach((whole, k) => {
          const y = w * (0.3 + k * 0.2) - w * 0.06;
          if (whole) g.fillRect(w * 0.18, y, w * 0.64, w * 0.12);
          else { g.fillRect(w * 0.18, y, w * 0.28, w * 0.12); g.fillRect(w * 0.54, y, w * 0.28, w * 0.12); }
        });
      });
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(B * 1.8, B * 1.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
      mark.rotation.order = 'YXZ';
      mark.rotation.set(-Math.PI / 2, ry + Math.PI / 4, 0);
      mark.position.set(bx, TOP + 0.03, bz);
      scene.add(mark);
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(B * 0.62, 0.05, 6, 64), glowMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(bx, TOP + 0.03, bz);
      scene.add(ring);
    }
    for (let k = 0; k < 3; k++) {
      const h = TOP * (3 - k) / 4, d = B * Math.SQRT2 + 0.5 + k * 0.5;
      const step = add(new THREE.Mesh(new THREE.BoxGeometry(2.6, h, 0.5), deckMat));
      step.position.set(bx + ux * d, h / 2, bz + uz * d);
      step.rotation.y = ry;
    }
  }
  // Barriers along the main stage's four sides.
  for (const [x, z, ry] of [[0, H + 1.4, 0], [0, -H - 1.4, 0], [H + 1.4, 0, Math.PI / 2], [-H - 1.4, 0, Math.PI / 2]]) rail(H * 2 - 3, x, z, ry);

  // Eight towers, two at each corner either side of the runway, up to the roof.
  const ROOF = 27, R = H + 1;
  const towerGeo = trussGeometry(ROOF, 0.8);
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    for (const [ax, az] of [[R, H - 3], [H - 3, R]]) {
      const t = new THREE.Mesh(towerGeo, steel);
      t.rotation.z = Math.PI / 2;
      t.position.set(ax * sx, ROOF / 2, az * sz);
      t.castShadow = true;
      scene.add(t);
      const foot = new THREE.Mesh(box(1.4, 0.2, 1.4, ax * sx, 0.1, az * sz), mats.blackMetal());
      scene.add(foot);
    }
  }
  // The roof: a square frame of truss, cross members, and an inner ring of truss.
  const frame = trussGeometry(R * 2 + 1, 0.9), inner = trussGeometry(R * 1.2, 0.6);
  for (const y of [ROOF]) {
    for (const [x, z, ry] of [[0, R, 0], [0, -R, 0], [R, 0, Math.PI / 2], [-R, 0, Math.PI / 2], [0, 0, 0], [0, 0, Math.PI / 2]]) {
      const t = new THREE.Mesh(frame, mats.blackMetal()); t.position.set(x, y, z); t.rotation.y = ry; t.castShadow = true; scene.add(t);
    }
    for (const [x, z, ry] of [[0, R * 0.6, 0], [0, -R * 0.6, 0], [R * 0.6, 0, Math.PI / 2], [-R * 0.6, 0, Math.PI / 2]]) {
      const t = new THREE.Mesh(inner, mats.blackMetal()); t.position.set(x, y - 0.9, z); t.rotation.y = ry; scene.add(t);
    }
  }
  // Moving heads all round the frame, every other one throwing a beam.
  const head = merge([box(0.5, 0.35, 0.4, 0, -0.2, 0), new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10).rotateX(Math.PI / 2).translate(0, -0.6, 0)]);
  const heads = [];
  const per = 9;
  let n = 0;
  for (const [x0, z0, dx, dz] of [[-R, R, 1, 0], [R, R, 0, -1], [R, -R, -1, 0], [-R, -R, 0, 1]]) {
    for (let k = 0; k < per; k++) {
      const x = x0 + dx * (k + 0.5) * (R * 2 / per), z = z0 + dz * (k + 0.5) * (R * 2 / per);
      heads.push(new THREE.Matrix4().makeTranslation(x, ROOF - 0.45, z));
      if (k % 2 === 0) beamAt(scene, x, ROOF - 1, z, n++);
    }
  }
  const im = new THREE.InstancedMesh(head, mats.matteBlack(), heads.length);
  heads.forEach((mtx, i) => im.setMatrixAt(i, mtx));
  scene.add(im);
  // Line arrays: one in the middle of each side, one off each corner over the runway.
  const cab = new THREE.BoxGeometry(1.4, 0.48, 1.0);
  const hang = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, r = i % 2 ? R * Math.SQRT2 - 1.5 : R + 0.9;
    for (let k = 0; k < 12; k++) {
      const out = Math.pow(k / 11, 2) * 0.7;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.sin(a) * (r + out), ROOF - 2 - k * 0.5, Math.cos(a) * (r + out)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.pow(k / 11, 2) * 0.5, a, 0, 'YXZ')),
        new THREE.Vector3(1, 1, 1));
      hang.push(m);
    }
  }
  const arrays = new THREE.InstancedMesh(cab, mats.matteBlack(), hang.length);
  hang.forEach((m, i) => arrays.setMatrixAt(i, m));
  arrays.castShadow = true;
  scene.add(arrays);

  if (S.korean) pavilion(ctx, S, R, ROOF);

  // The screen cube under the roof.
  const cube = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const sc = screen(12, 6.8, 80);
    const a = (i / 4) * Math.PI * 2;
    sc.position.set(Math.sin(a) * 6.05, 0, Math.cos(a) * 6.05);
    sc.rotation.y = a;
    cube.add(sc);
  }
  cube.add(new THREE.Mesh(new THREE.BoxGeometry(12, 7.2, 12), mats.matteBlack()));
  cube.position.y = ROOF - 7;
  scene.add(cube);

  // Delay towers in the field.
  for (const [x, z] of S.towers || []) {
    const t = new THREE.Mesh(trussGeometry(16, 0.5), steel);
    t.rotation.z = Math.PI / 2;
    t.position.set(x, 8, z);
    scene.add(t);
    const face = Math.atan2(-x, -z);
    for (let k = 0; k < 8; k++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.9), mats.matteBlack());
      c.position.set(x, 15 - k * 0.44, z);
      c.rotation.y = face;
      scene.add(c);
    }
  }

  const wash = new THREE.SpotLight(theme.wash, 1, 90, 0.55, 0.6, 1.2);
  wash.position.set(0, 46, 0);
  wash.target.position.set(0, 2, 0);
  ctx.mood(wash, 'intensity', 0, 4200);
  scene.add(wash, wash.target);
  const glow = new THREE.PointLight(theme.glow, 1, 60, 1.5);
  glow.position.set(0, 14, 0);
  ctx.mood(glow, 'intensity', 0, 420);
  scene.add(glow);
  return cube;
}

// ------------------------------------------------------------------ seats & crowd geometry

// Seats face -z; backrest on +z.
// Flip-up arena seat (the moulded plastic seats of Indonesia Arena's tiers): a contoured back
// and a seat pan on a hinge, between two painted steel standards bolted to the tread. Vertex
// colour tells plastic (white, tinted per seat) from steel; `aPan` marks the pan, which the
// seat material folds up about SEAT_HINGE when nobody sits there.
export const SEAT_HINGE = { y: 0.415, z: 0.1 };
function surfaceGrid(nu, nv, at, flip = false) {
  const pos = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...at(i / nu * 2 - 1, j / nv));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(...(flip ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// A shell from a centre surface: front and back faces `th` apart, and a rim joining them.
function shellPanel(nu, nv, at, th, flipFront) {
  const front = surfaceGrid(nu, nv, at, flipFront);
  const off = (u, v) => {
    const p = new THREE.Vector3(...at(u, v));
    const du = new THREE.Vector3(...at(Math.min(1, u + 0.01), v)).sub(new THREE.Vector3(...at(Math.max(-1, u - 0.01), v)));
    const dv = new THREE.Vector3(...at(u, Math.min(1, v + 0.01))).sub(new THREE.Vector3(...at(u, Math.max(0, v - 0.01))));
    const n = du.cross(dv).normalize().multiplyScalar(flipFront ? -th : th);
    return p.sub(n).toArray();
  };
  const back = surfaceGrid(nu, nv, off, !flipFront);
  // The rim: a strip round the outline, from the front face to the back face.
  const ring = [];
  for (let i = 0; i <= nu; i++) ring.push([i / nu * 2 - 1, 0]);
  for (let j = 1; j <= nv; j++) ring.push([1, j / nv]);
  for (let i = nu - 1; i >= 0; i--) ring.push([i / nu * 2 - 1, 1]);
  for (let j = nv - 1; j >= 1; j--) ring.push([-1, j / nv]);
  const pos = [];
  for (let k = 0; k < ring.length; k++) {
    const [u0, v0] = ring[k], [u1, v1] = ring[(k + 1) % ring.length];
    const a = at(u0, v0), b = at(u1, v1), c = off(u0, v0), d = off(u1, v1);
    pos.push(...(flipFront ? [...a, ...b, ...c, ...b, ...d, ...c] : [...a, ...c, ...b, ...b, ...c, ...d]));
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rim.computeVertexNormals();
  return [front, back, rim];
}
function tag(g, rgb, pan) {
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(rgb).flat(), 3));
  g.setAttribute('aPan', new THREE.Float32BufferAttribute(new Array(n).fill(pan), 1));
  return g;
}
function flipUpSeat() {
  const plastic = [1, 1, 1], steel = [0.32, 0.33, 0.35], H = SEAT_HINGE;
  // Back: reclined, with lumbar support, its sides curving round the sitter, an arched top.
  const back = shellPanel(10, 8, (u, v) => {
    const y = 0.47 + 0.39 * v - 0.028 * u ** 4 * v ** 3;
    const z = 0.165 + 0.075 * v - 0.016 * Math.sin(Math.PI * Math.min(1, v * 1.25)) - 0.032 * u * u;
    return [u * (0.226 - 0.012 * v), y, z];
  }, 0.022, false);
  // Seat pan: dished, the front edge rolled down (the waterfall), sides turned up a little.
  const pan = shellPanel(10, 7, (u, v) => {
    const zf = -0.27 + (H.z - 0.008 + 0.27) * v;
    const roll = v < 0.12 ? -0.03 * (1 - v / 0.12) ** 2 : 0;
    const y = H.y + 0.02 + 0.016 * (1 - v) - 0.01 * Math.sin(Math.PI * v) + 0.009 * u * u + roll;
    return [u * 0.222, y, zf];
  }, 0.03, true);
  // Standards: steel plates from the tread up to the hinge and the back's foot.
  const std = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Shape();
    const P = [[-0.05, 0], [0.2, 0], [0.205, 0.04], [0.19, 0.6], [0.15, 0.62], [0.13, 0.47], [0.04, 0.43], [-0.03, 0.4], [-0.06, 0.05]];
    P.forEach(([z, y], i) => (i ? sh.lineTo(-z, y) : sh.moveTo(-z, y)));
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: false, curveSegments: 1 });
    g.rotateY(Math.PI / 2).translate(sx * 0.262 - 0.008, 0, 0);
    std.push(tag(g.toNonIndexed(), steel, 0));
  }
  // The bar the back and the pan hang on.
  const bar = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6).rotateZ(Math.PI / 2).translate(0, H.y, H.z + 0.02);
  return merge([
    ...back.map(g => tag(g, plastic, 0)),
    ...pan.map(g => tag(g, plastic, 1)),
    ...std,
    tag(bar, steel, 0),
  ]);
}

// `lite` (phones): the stadium shell with a three-point profile and no stem, about a third
// of the triangles. Tens of thousands of seats are drawn, most under a person, so on a
// phone the difference is felt in every frame and not seen.
export function seatGeometry(style, { lite = false } = {}) {
  if (style === 'flipup') return flipUpSeat();
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
  const pts = lite ? [[-0.21, 0.4], [0.12, 0.44], [0.2, 0.58], [0.235, 0.8]]
    : [[-0.21, 0.4], [-0.1, 0.425], [0.08, 0.43], [0.15, 0.46], [0.19, 0.55], [0.22, 0.7], [0.235, 0.8]];
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
  return lite ? shell : merge([shell, box(0.06, 0.4, 0.06, 0, 0.2, 0.1)]);
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
