// The live crowd for the concert seat view: people that move on the GPU.
//
// Every person is one instance of a real human body (the MakeHuman base mesh, CC0, built
// offline into assets/crowd/body.bin): young-adult male proportions, with the female and the
// heavier shapes stored per vertex as offsets, so each instance is its own blend of the two.
// Clothes are regions of the body (shirt, sleeves, trousers, shoes) coloured per person;
// hair, caps and hijabs are shells over the head, shown by style. Ambient occlusion baked in
// Blender is stored per vertex.
//
// The body carries a small rig: hips, torso, head, upper arms, forearms, thighs and shins,
// each vertex weighted to two of them. The vertex shader poses the rig from a few numbers per
// instance (what the person is doing, their own rhythm and energy, sitting or standing), so
// thousands of people sway, clap, wave light sticks and hold up phones without one draw call
// more and without touching the CPU per frame.
//
// Two copies share the material: a detailed body (about 1,900 triangles) for the people near
// the seat you sit in, and a coarse one (about 170) for everyone else.
import * as THREE from 'three';

// Materials, as tagged on the vertices.
const MAT = { shirt: 0, skin: 1, hair: 2, pants: 3, shoes: 4, screen: 5, glow: 6, plastic: 7, sleeve: 8, eye: 9, brow: 10 };
// What a person does once the show is on (the house lights keep everyone at rest).
export const ACT = { watch: 0, clap: 1, stick: 2, phone: 3, handsUp: 4, dance: 5 };
// Rig bones (as weighted in the body file).
const BONE = { hips: 0, torso: 1, head: 2, hair: 3, upperL: 4, upperR: 5, foreL: 6, foreR: 7, thighL: 8, thighR: 9, shinL: 10, shinR: 11 };

// Joints in a person's own frame (facing -z; hip sockets 0.48 m up, where a seated
// person's are; a standing person stands STAND_LIFT lower). M: the male body, F: the female.
const J = {
  M: { shoulderL: [-0.1807, 0.9248, -0.0252], shoulderR: [0.1807, 0.9248, -0.0252], elbowL: [-0.2122, 0.6827, -0.0301], elbowR: [0.2122, 0.6827, -0.0301], wristR: [0.2324, 0.4309, -0.0703], hipL: [-0.1048, 0.48, 0], hipR: [0.1048, 0.48, 0], kneeL: [-0.1293, 0.0732, -0.0081], kneeR: [0.1293, 0.0732, -0.0081], pelvis: [0, 0.5701, 0.0205], neck: [0, 1.027, -0.0192] },
  F: { shoulderL: [-0.1483, 0.8138, -0.032], shoulderR: [0.1483, 0.8138, -0.032], elbowL: [-0.1773, 0.5907, -0.0364], elbowR: [0.1773, 0.5907, -0.0364], wristR: [0.1934, 0.3904, -0.0685], hipL: [-0.0909, 0.3806, -0.0286], hipR: [0.0909, 0.3806, -0.0286], kneeL: [-0.1123, 0.0233, -0.0358], kneeR: [0.1123, 0.0233, -0.0358], pelvis: [0, 0.4618, 0.0101], neck: [0, 0.8946, -0.0102] },
};

// Arm angles for the poses that hold something: shoulder [forward/up, inward, outward] and
// elbow bend. The props are made in these poses and turned back to the rest pose, so the
// shader's turn brings them up the right way round.
const POSE_PHONE = { a: [1.5, -0.3, 0], e: 0.7 };
const POSE_STICK = { a: [2.55, 0, 0], e: 0.3 };

// ------------------------------------------------------------------ the body

let bodyFile = null;
// The body file: two levels of detail, each positions, normals, rig (bone, bone, weight of
// the second, ambient occlusion), tag (material, prop), female and heavier offsets, indices.
export function loadBody(url = 'assets/crowd/body.bin') {
  bodyFile ||= fetch(url).then(r => {
    if (!r.ok) throw new Error(`crowd body: ${r.status}`);
    return r.arrayBuffer();
  }).then(buf => {
    const dv = new DataView(buf), lods = [];
    let o = 0;
    for (let l = 0; l < 2; l++) {
      const nv = dv.getUint32(o, true), ni = dv.getUint32(o + 4, true);
      o += 8;
      const take = n => { const a = new Float32Array(buf, o, n); o += n * 4; return a; };
      const lod = { P: take(nv * 3), N: take(nv * 3), rig: take(nv * 4), tag: take(nv * 2), fem: take(nv * 3), fat: take(nv * 3) };
      lod.idx = new Uint16Array(buf, o, ni);
      o += ni * 2 + (ni % 2 ? 2 : 0);
      lods.push(lod);
    }
    return lods;
  });
  return bodyFile;
}

const v3 = a => new THREE.Vector3(...a);
const rotXYZ = ([x, y, z]) => new THREE.Matrix4().makeRotationZ(z).multiply(new THREE.Matrix4().makeRotationY(y)).multiply(new THREE.Matrix4().makeRotationX(x));

// A prop in the right hand: made in the pose that holds it, then turned back through the elbow
// and the shoulder to the rest pose (the inverse of what the shader does).
function unposeRight(points, pose) {
  const S = v3(J.M.shoulderR), E = v3(J.M.elbowR);
  const Ainv = rotXYZ(pose.a).invert(), Einv = new THREE.Matrix4().makeRotationX(-pose.e);
  return points.map(p => {
    const u = p.clone().sub(S).applyMatrix4(Ainv).add(S);
    return u.sub(E).applyMatrix4(Einv).add(E);
  });
}
function posedRight(p, pose) {
  const S = v3(J.M.shoulderR), E = v3(J.M.elbowR);
  const e = p.clone().sub(E).applyMatrix4(new THREE.Matrix4().makeRotationX(pose.e)).add(E);
  return e.sub(S).applyMatrix4(rotXYZ(pose.a)).add(S);
}

// Props as plain triangles (positions, normals), each tagged with a material and a prop id.
function props(detail) {
  const out = [];
  const add = (geo, mat, prop, pose) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = [], N = [];
    for (let i = 0; i < g.attributes.position.count; i++) {
      P.push(new THREE.Vector3().fromBufferAttribute(g.attributes.position, i));
      N.push(new THREE.Vector3().fromBufferAttribute(g.attributes.normal, i));
    }
    const Pu = unposeRight(P, pose);
    const Ninv = rotXYZ(pose.a).invert().premultiply(new THREE.Matrix4().makeRotationX(-pose.e));
    out.push({ P: Pu, N: N.map(n => n.clone().applyMatrix4(Ninv).normalize()), mat, prop });
  };
  {
    // Phone held up to film the stage: upright, its screen facing the holder.
    const w = posedRight(v3(J.M.wristR), POSE_PHONE);
    const screen = new THREE.PlaneGeometry(0.068, 0.142).translate(w.x - 0.01, w.y + 0.07, w.z - 0.02);
    add(screen, MAT.screen, 1, POSE_PHONE);
    if (detail) add(new THREE.BoxGeometry(0.076, 0.152, 0.009).translate(w.x - 0.01, w.y + 0.07, w.z - 0.026), MAT.plastic, 1, POSE_PHONE);
  }
  {
    // Light stick held up, along the forearm: a handle and a glowing head.
    const E = posedRight(v3(J.M.elbowR), POSE_STICK), W = posedRight(v3(J.M.wristR), POSE_STICK);
    const dir = W.clone().sub(E).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const at = (g, d) => g.applyQuaternion(q).translate(W.x + dir.x * d, W.y + dir.y * d, W.z + dir.z * d);
    add(at(new THREE.CylinderGeometry(0.022, 0.026, 0.14, detail ? 8 : 4, 1, !detail), 0.2), MAT.glow, 2, POSE_STICK);
    if (detail) add(at(new THREE.CylinderGeometry(0.016, 0.016, 0.15, 6, 1, true), 0.07), MAT.plastic, 2, POSE_STICK);
  }
  return out;
}

// A three.js geometry for one level of detail: the body plus the props.
function bodyGeometry(lod, detail) {
  const extra = props(detail);
  const nb = lod.P.length / 3, ne = extra.reduce((s, p) => s + p.P.length, 0), n = nb + ne;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), rig = new Float32Array(n * 4), tag = new Float32Array(n * 2), fem = new Float32Array(n * 3), fat = new Float32Array(n * 3);
  P.set(lod.P); N.set(lod.N); rig.set(lod.rig); tag.set(lod.tag); fem.set(lod.fem); fat.set(lod.fat);
  // The props move with the right hand, and with it between the two body shapes.
  const handFem = v3(J.F.wristR).sub(v3(J.M.wristR));
  let k = nb;
  const idx = Array.from(lod.idx);
  for (const p of extra) {
    p.P.forEach((v, i) => {
      P.set([v.x, v.y, v.z], k * 3); N.set([p.N[i].x, p.N[i].y, p.N[i].z], k * 3);
      rig.set([BONE.foreR, BONE.foreR, 0, 1], k * 4); tag.set([p.mat, p.prop], k * 2);
      fem.set([handFem.x, handFem.y, handFem.z], k * 3);
      idx.push(k);
      k++;
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('aRig', new THREE.BufferAttribute(rig, 4));
  g.setAttribute('aTag', new THREE.BufferAttribute(tag, 2));
  g.setAttribute('aFem', new THREE.BufferAttribute(fem, 3));
  g.setAttribute('aFat', new THREE.BufferAttribute(fat, 3));
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.boundingSphere.radius += 0.8;
  return g;
}

// ------------------------------------------------------------------ the shader

const glv = a => `vec3(${a.map(x => x.toFixed(4)).join(', ')})`;
const JOINTS = ['shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'pelvis', 'neck'];

const VERTEX_HEAD = /* glsl */`
attribute vec4 aRig;    // bone, second bone, weight of the second, ambient occlusion
attribute vec2 aTag;    // material, prop (1 phone, 2 light stick, 16+ hair styles as bits)
attribute vec3 aFem; attribute vec3 aFat;
// Per person. Few attributes, packed (phones allow 16 in all, and three.js takes four for
// the instance matrix).
attribute vec4 aAnim;   // action, phase, tempo, energy
attribute vec4 aCol;    // shirt, skin, hair, trousers: each an sRGB colour as one 24-bit number
attribute vec4 aLook;   // hair style + 8 long sleeves + 16 standing + 32 female; light stick hue; lean; heavier
uniform float uTime; uniform float uLive; uniform float uBpm;
varying vec3 vCrowdCol; varying vec3 vGlowCol; varying float vRimK; varying float vAO;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
vec3 rgb(float f) {
  float r = floor(f / 65536.), g = floor((f - r * 65536.) / 256.), b = f - r * 65536. - g * 256.;
  return pow(vec3(r, g, b) / 255., vec3(2.2));
}
vec3 hue(float h) { return clamp(abs(mod(h * 6. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.); }
// The pose, worked out once per vertex in main() and read by the bone functions.
mat3 gMs, gMh, gMaL, gMaR, gMeL, gMeR, gMtL, gMtR, gMkL, gMkR;
${JOINTS.map(j => `vec3 g_${j};`).join(' ')}
vec3 boneMove(float b, vec3 p) {
  if (b > 7.5) {
    bool L = mod(b, 2.) < 0.5;
    if (b > 9.5) { vec3 k = L ? g_kneeL : g_kneeR; p = k + (L ? gMkL : gMkR) * (p - k); }
    vec3 h = L ? g_hipL : g_hipR;
    return h + (L ? gMtL : gMtR) * (p - h);
  }
  if (b > 3.5) {
    bool L = mod(b, 2.) < 0.5;
    if (b > 5.5) { vec3 e = L ? g_elbowL : g_elbowR; p = e + (L ? gMeL : gMeR) * (p - e); }
    vec3 s = L ? g_shoulderL : g_shoulderR;
    p = s + (L ? gMaL : gMaR) * (p - s);
  } else if (b > 1.5) p = g_neck + gMh * (p - g_neck);
  if (b > 0.5) p = g_pelvis + gMs * (p - g_pelvis);
  return p;
}
vec3 boneTurn(float b, vec3 n) {
  if (b > 7.5) {
    bool L = mod(b, 2.) < 0.5;
    if (b > 9.5) n = (L ? gMkL : gMkR) * n;
    return (L ? gMtL : gMtR) * n;
  }
  if (b > 3.5) {
    bool L = mod(b, 2.) < 0.5;
    if (b > 5.5) n = (L ? gMeL : gMeR) * n;
    n = (L ? gMaL : gMaR) * n;
  } else if (b > 1.5) n = gMh * n;
  if (b > 0.5) n = gMs * n;
  return n;
}
`;

// Works out the pose and turns the normal; begin_vertex then moves the position the same way.
const POSE = /* glsl */`
float act = aAnim.x, ph = aAnim.y, en = aAnim.w;
float flags = aLook.x, style = mod(flags, 8.), sleeves = mod(floor(flags / 8.), 2.);
float stand = mod(floor(flags / 16.), 2.), fem = floor(flags / 32.), heavy = aLook.w;
float mat = aTag.x, prop = aTag.y;
${JOINTS.map(j => `g_${j} = mix(${glv(J.M[j])}, ${glv(J.F[j])}, fem);`).join('\n')}
float live = uLive;
float beat = uTime * uBpm / 60. * aAnim.z + ph;
float pi = 3.14159265;
float on = smoothstep(0.15, 0.85, live);
// Spine: a slow sway always, a bounce on the beat once the show is on.
float dance = act == 5. ? 1.6 : 1.0;
float roll = sin(uTime * 0.37 + ph * 6.3) * 0.012 + on * en * dance * 0.05 * sin(beat * pi);
float bob = on * en * dance * 0.035 * max(0., sin(beat * 2. * pi)) + aLook.z;
gMs = rotZ(roll) * rotX(-bob);
// Head: looks about a little, nods with the music.
float nod = on * en * 0.07 * sin(beat * 2. * pi + 0.7) + sin(uTime * 0.5 + ph * 3.) * 0.015;
float turn = sin(uTime * 0.11 + ph * 9.) * 0.12 * (1. - on * 0.6);
gMh = rotY(turn) * rotX(nod);
// Arms: shoulder [forward/up, inward, outward] and elbow bend. At rest a seated person's
// forearms lie on the thighs; a standing person's arms hang.
vec3 restL = stand > 0.5 ? vec3(0.06, 0., -0.05) : vec3(0.42, -0.05, 0.);
vec3 restR = stand > 0.5 ? vec3(0.06, 0., 0.05) : vec3(0.42, 0.05, 0.);
float restE = stand > 0.5 ? 0.25 : 1.05;
vec3 aL = restL, aR = restR; float eL = restE, eR = restE;
float clap = abs(sin(beat * pi));
if (act == 1.) { aL = vec3(1.0, -0.35 - 0.25 * clap, 0.); aR = vec3(1.0, 0.35 + 0.25 * clap, 0.); eL = eR = 1.25; }
else if (act == 2.) { aR = vec3(${POSE_STICK.a[0].toFixed(3)} + 0.08 * sin(beat * 2. * pi), 0., 0.38 * sin(beat * pi)); eR = ${POSE_STICK.e.toFixed(3)}; }
else if (act == 3.) { aR = vec3(${POSE_PHONE.a[0].toFixed(3)} + 0.02 * sin(uTime * 1.7 + ph), ${POSE_PHONE.a[1].toFixed(3)}, 0.); eR = ${POSE_PHONE.e.toFixed(3)}; }
else if (act == 4.) { float pump = 0.2 * max(0., sin(beat * 2. * pi)); aL = vec3(2.75 + pump, 0., 0.28); aR = vec3(2.75 + pump, 0., -0.28); eL = eR = 0.2; }
else if (act == 5.) { float sw = sin(beat * pi); aL = vec3(0.75 + 0.4 * sw, -0.2, 0.); aR = vec3(0.75 - 0.4 * sw, 0.2, 0.); eL = eR = 1.45; }
aL = mix(restL, aL, on); aR = mix(restR, aR, on); eL = mix(restE, eL, on); eR = mix(restE, eR, on);
gMaL = rotZ(aL.z) * rotY(aL.y) * rotX(aL.x);
gMaR = rotZ(aR.z) * rotY(aR.y) * rotX(aR.x);
gMeL = rotX(eL); gMeR = rotX(eR);
// Legs: seated, thighs forward and shins down; standing, a bounce in the knees on the beat.
float bounce = on * en * max(0., sin(beat * 2. * pi)) * (act == 5. ? 1. : 0.5);
float thigh = stand > 0.5 ? 0.06 * bounce : 1.5;
float knee = stand > 0.5 ? -0.13 * bounce : -1.47;
float splay = stand > 0.5 ? 0. : 0.07;
gMtL = rotY(-splay) * rotX(thigh); gMtR = rotY(splay) * rotX(thigh);
gMkL = rotX(knee); gMkR = rotX(knee);
// Props show only in the hand that holds them, once the show is on; hair pieces by style.
float keep = 1.;
if (prop == 1.) keep = act == 3. && on > 0.3 ? 1. : 0.;
if (prop == 2.) keep = act == 2. && on > 0.3 ? 1. : 0.;
if (prop >= 16.) keep = mod(floor((prop - 16.) / exp2(style)), 2.) > 0.5 ? 1. : 0.;
vec3 nrm = mix(boneTurn(aRig.x, objectNormal), boneTurn(aRig.y, objectNormal), aRig.z);
// A few vertices of the coarse body have no normal of their own.
objectNormal = dot(nrm, nrm) > 1e-8 ? normalize(nrm) : vec3(0., 1., 0.);
// Colour by material.
vGlowCol = vec3(0.); vRimK = 1.; vAO = aRig.w;
if (mat == 0.) vCrowdCol = rgb(aCol.x);
else if (mat == 1.) vCrowdCol = rgb(aCol.y);
else if (mat == 2.) vCrowdCol = rgb(aCol.z);
else if (mat == 3.) vCrowdCol = rgb(aCol.w);
else if (mat == 4.) vCrowdCol = vec3(0.05);
else if (mat == 8.) vCrowdCol = rgb(sleeves > 0.5 ? aCol.x : aCol.y);
else if (mat == 9.) vCrowdCol = vec3(0.02);
else if (mat == 10.) vCrowdCol = vec3(0.012, 0.009, 0.007);
else if (mat == 5.) { vCrowdCol = vec3(0.02); vRimK = 0.; vAO = 1.;
  float flick = 0.75 + 0.25 * sin(uTime * 2.3 + ph * 11.) * sin(uTime * 0.7 + ph * 5.);
  vGlowCol = vec3(0.72, 0.8, 1.0) * 1.25 * flick * on; }
else if (mat == 6.) { vCrowdCol = vec3(0.1); vRimK = 0.; vAO = 1.;
  vGlowCol = mix(vec3(1.), hue(aLook.y), 0.7) * (1.5 + 0.7 * max(0., sin(beat * 2. * pi))) * on; }
else vCrowdCol = vec3(0.035);
`;

const BEGIN = /* glsl */`
vec3 rest = position + fem * aFem + heavy * aFat;
vec3 transformed = mix(boneMove(aRig.x, rest), boneMove(aRig.y, rest), aRig.z);
// Seated, a smaller body still sits on the seat.
transformed.y += (1. - stand) * fem * ${(J.M.hipL[1] - J.F.hipL[1]).toFixed(4)};
if (keep < 0.5) transformed = g_shoulderR;
`;

// The crowd's material: a standard material whose colour, glow and rim light come from the
// shader above. `rim`: the stage's light catching the edges of heads and shoulders.
export function crowdMaterial() {
  const uniforms = {
    uTime: { value: 0 }, uLive: { value: 0 }, uBpm: { value: 118 },
    uRimDir: { value: new THREE.Vector3(0, 0, -1) }, uRimCol: { value: new THREE.Color('#ffb98a') },
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  mat.userData.crowd = uniforms;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = VERTEX_HEAD + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + POSE)
      .replace('#include <begin_vertex>', BEGIN);
    sh.fragmentShader = 'uniform float uLive; uniform vec3 uRimDir; uniform vec3 uRimCol;\nvarying vec3 vCrowdCol; varying vec3 vGlowCol; varying float vRimK; varying float vAO;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCrowdCol * mix(1.0, 0.6, uLive) * mix(1.0, vAO, 0.85);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vGlowCol;
        {
          vec3 V = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 2.4);
          float side = clamp(dot(normal, uRimDir) * 0.9 + 0.25, 0.0, 1.0);
          totalEmissiveRadiance += uRimCol * fr * side * uLive * vRimK * vAO * 0.9;
        }`);
  };
  mat.customProgramCacheKey = () => 'atv-crowd-2';
  return mat;
}

// ------------------------------------------------------------------ the crowd

const SHIRTS = ['#111214', '#17181c', '#1d1f24', '#f0eee8', '#e6e2d8', '#2a2d35', '#3c4352', '#20304a', '#5a2a2e', '#3f3529', '#6b6f78', '#0d0d0f', '#2f3b2e', '#8a7a64', '#b9b3a6', '#7a1f2b', '#1f4a6b', '#c9a13b'];
const PANTS = ['#1a1c22', '#23262e', '#2c3a52', '#1b2333', '#3b3a36', '#0f1012', '#4a4d55', '#2b2f3a', '#3a4a66', '#c9c2b2'];
const SKINS = ['#8d5a3b', '#a86b47', '#c68a62', '#6e4630', '#b97c55', '#d9a07a', '#9b6544', '#c4936b'];
const HAIRS = ['#0f0b09', '#1c140f', '#2a1d14', '#0b0b0c', '#3b2a1c', '#151312', '#5a3a22', '#7b4a2a'];
const HIJABS = ['#1b1b1f', '#e9e3d6', '#c9b49a', '#7a5c58', '#2b3247', '#d6c7d8', '#4a4f43', '#a9a39a'];
const CAPS = ['#111214', '#efece4', '#22283a', '#6b1f26'];
// Hair styles (bits in the hair pieces' prop): 0 short, 1 long, 2 cap, 3 hijab, 4 bun.
const STYLE = { short: 0, long: 1, cap: 2, hijab: 3, bun: 4 };

export class Crowd {
  // `spots`: [{ x, y, z, yaw, standing }] where people are. `rnd`: a seeded random source.
  constructor(scene, spots, rnd) {
    this.scene = scene;
    this.n = spots.length;
    this.material = crowdMaterial();
    this.uniforms = this.material.userData.crowd;
    const n = this.n;
    this.data = { matrix: new Float32Array(n * 16), anim: new Float32Array(n * 4), col: new Float32Array(n * 4), look: new Float32Array(n * 4) };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const pick = list => list[Math.floor(rnd() * list.length)];
    const hex = h => parseInt(h.slice(1), 16);
    spots.forEach((p, k) => {
      // A standing crowd is no grid: people drift off their spots and turn more freely.
      const loose = p.standing ? 0.42 : 0.05, turn = p.standing ? 0.7 : 0.3;
      q.setFromAxisAngle(up, p.yaw + (rnd() - 0.5) * turn);
      const female = rnd() < 0.5;
      const h = (female ? 1.0 : 0.97) + rnd() * 0.1, w = h * (0.94 + rnd() * 0.1);
      m.compose(v.set(p.x + (rnd() - 0.5) * loose, p.y, p.z + (rnd() - 0.5) * loose * 0.9), q, s.set(w, h, w));
      m.toArray(this.data.matrix, k * 16);
      const r = rnd();
      // A standing floor moves more: fewer just watching, more hands up and dancing.
      const act = p.standing
        ? (r < 0.14 ? ACT.watch : r < 0.26 ? ACT.clap : r < 0.46 ? ACT.stick : r < 0.68 ? ACT.phone : r < 0.84 ? ACT.handsUp : ACT.dance)
        : (r < 0.3 ? ACT.watch : r < 0.42 ? ACT.clap : r < 0.64 ? ACT.stick : r < 0.84 ? ACT.phone : r < 0.92 ? ACT.handsUp : ACT.dance);
      this.data.anim.set([act, rnd() * 2, 0.5 * (rnd() < 0.8 ? 1 : 2), 0.4 + rnd() * 0.6], k * 4);
      const hr = rnd();
      const style = female
        ? (hr < 0.4 ? STYLE.long : hr < 0.65 ? STYLE.hijab : hr < 0.85 ? STYLE.bun : STYLE.short)
        : (hr < 0.72 ? STYLE.short : hr < 0.92 ? STYLE.cap : STYLE.long);
      const hair = style === STYLE.hijab ? pick(HIJABS) : style === STYLE.cap ? pick(CAPS) : pick(HAIRS);
      this.data.col.set([hex(pick(SHIRTS)), hex(pick(SKINS)), hex(hair), hex(pick(PANTS))], k * 4);
      // Light sticks mostly in the show's colours (cool white, blue, violet), a few others.
      const stickHue = rnd() < 0.7 ? 0.6 + rnd() * 0.15 : rnd();
      const flags = style + (rnd() < 0.3 ? 8 : 0) + (p.standing ? 16 : 0) + (female ? 32 : 0);
      this.data.look.set([flags, stickHue, (rnd() - 0.5) * 0.08, rnd() ** 2 * 2.2], k * 4);
    });
    this.near = null;
    this.nearSlots = [];
    this.hidden = -1;
    this.meshes = [];
    this.visible = true;
    // The body arrives from its file; until then there is nobody, and a focus asked for in
    // the meantime is applied when it does.
    this.ready = loadBody().then(lods => {
      if (this.disposed) return;
      this.lods = lods;
      this.far = this._mesh(bodyGeometry(lods[1], false), n);
      this.far.visible = this.visible;
      this._fill(this.far, null);
      this.meshes.push(this.far);
      scene.add(this.far);
      if (this.pendingFocus) this.focusOn(...this.pendingFocus);
    });
  }

  _mesh(geo, count) {
    const mesh = new THREE.InstancedMesh(geo, this.material, Math.max(1, count));
    mesh.count = count;
    mesh.frustumCulled = false;
    const N = Math.max(1, count);
    for (const name of ['aAnim', 'aCol', 'aLook']) geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4));
    mesh.userData.src = { anim: 'aAnim', col: 'aCol', look: 'aLook' };
    return mesh;
  }

  // Copies people into a mesh: all of them (`slots` null) or the listed ones.
  _fill(mesh, slots) {
    if (!mesh) return;
    const d = this.data, geo = mesh.geometry;
    const list = slots || Array.from({ length: this.n }, (_, k) => k);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0).elements;
    const near = new Set(slots ? [] : this.nearSlots);
    list.forEach((k, j) => {
      const hide = (!slots && near.has(k)) || k === this.hidden || this.skip?.has(k);
      mesh.instanceMatrix.array.set(hide ? zero : d.matrix.subarray(k * 16, k * 16 + 16), j * 16);
      for (const [key, name] of Object.entries(mesh.userData.src)) {
        const a = geo.attributes[name], sz = a.itemSize;
        a.array.set(d[key].subarray(k * sz, k * sz + sz), j * sz);
      }
      if (slots && this.calm?.has(k) && [ACT.stick, ACT.phone, ACT.handsUp].includes(d.anim[k * 4])) {
        geo.attributes.aAnim.array[j * 4] = k % 2 ? ACT.clap : ACT.dance;
      }
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    for (const name of Object.values(mesh.userData.src)) geo.attributes[name].needsUpdate = true;
  }

  // Detailed figures for everyone within `radius` metres of `eye` (closest first, at most
  // `max`); everyone else stays cheap. `look`: where the camera will face. Null brings
  // everyone back to the cheap figure.
  // around: a 360° photo, where the people beside and behind you are part of the picture.
  focusOn(eye, look = null, radius = 24, max = 900, around = false) {
    if (!this.far) { this.pendingFocus = [eye, look, radius, max, around]; return; }
    this.pendingFocus = null;
    if (!eye) { this.nearSlots = []; this.skip = null; this._fill(this.far, null); if (this.near) this.near.visible = false; return; }
    const d = this.data, cand = [];
    for (let k = 0; k < this.n; k++) {
      const dx = d.matrix[k * 16 + 12] - eye.x, dy = d.matrix[k * 16 + 13] - eye.y, dz = d.matrix[k * 16 + 14] - eye.z;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < radius * radius) cand.push([dist, k]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    this.nearSlots = cand.slice(0, Math.min(max, 900)).map(c => c[1]);
    // The people right next to you keep their hands down: an arm up a metre from the camera
    // would fill the picture and say nothing about the view from the seat.
    this.calm = new Set(cand.filter(c => c[0] < 3.2 * 3.2).map(c => c[1]));
    // Your neighbours in the same row sit beside the camera, not in front of it: drawn, they
    // would fill the edge of the picture as a dark wall.
    // Likewise anyone close by who is beside or behind you rather than in front.
    const fx = look ? look.x - eye.x : 0, fz = look ? look.z - eye.z : -1, fl = Math.hypot(fx, fz) || 1;
    this.skip = new Set(cand.filter(([, k]) => {
      const dx = d.matrix[k * 16 + 12] - eye.x, dz = d.matrix[k * 16 + 14] - eye.z, dy = d.matrix[k * 16 + 13] - eye.y;
      const h = Math.hypot(dx, dz), ahead = (dx * fx + dz * fz) / fl;
      return (h < 0.85 && dy < -0.9) || (!around && h < 1.8 && ahead < 0.55);
    }).map(c => c[1]));
    if (!this.near) {
      this.near = this._mesh(bodyGeometry(this.lods[0], true), 900);
      this.scene.add(this.near);
      this.meshes.push(this.near);
    }
    this.near.visible = this.visible !== false;
    this._fill(this.near, this.nearSlots);
    this._fill(this.far, null);
  }

  // Hides (or shows again) the person in one slot: the seat you sit in.
  hide(k) {
    this.hidden = k;
    this._fill(this.far, null);
    if (this.near?.visible) this._fill(this.near, this.nearSlots);
  }

  setVisible(on) {
    this.visible = on;
    if (this.far) this.far.visible = on;
    if (this.near) this.near.visible = on && this.nearSlots.length > 0;
  }

  // Per frame: time, how live the show is, and the direction of the stage in view space
  // (for the rim light).
  update(time, live, camera, stage) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uLive.value = live;
    u.uRimDir.value.copy(stage).sub(camera.position).normalize().transformDirection(camera.matrixWorldInverse);
  }

  dispose() {
    this.disposed = true;
    for (const mesh of this.meshes) { mesh.geometry.dispose(); this.scene.remove(mesh); }
    this.material.dispose();
  }
}
