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
const MAT = { shirt: 0, skin: 1, hair: 2, pants: 3, shoes: 4, screen: 5, glow: 6, plastic: 7, sleeve: 8, eye: 9, brow: 10, wood: 11, chrome: 12 };
// What a person does once the show is on (the house lights keep everyone at rest).
export const ACT = { watch: 0, clap: 1, stick: 2, phone: 3, handsUp: 4, dance: 5,
  // On stage: singing into a handheld microphone, playing guitar or bass, drums (seated), keys,
  // and a dance routine for groups. Performers show only once the house lights are down.
  sing: 6, guitar: 7, drums: 8, keys: 9, routine: 10 };
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
// The performers' arms (solved offline for the male body's joints): the microphone at the
// mouth, the hands on a guitar's neck and strings, the sticks over the snare, the hands on
// the keys.
const POSE_MIC = { a: [1.081, 0.568, 0.707], e: 2.065 };
const POSE_FRET = { a: [-0.01, 0.1, -0.519], e: 1.638 };
const POSE_STRUM = { a: [-0.173, 0.785, 0.002], e: 1.327 };
const POSE_DRUM_L = { a: [0.356, -0.177, 0.006], e: 0.902 };
const POSE_DRUM_R = { a: [0.23, 0, -0.145], e: 1.239 };
const POSE_KEYS_L = { a: [0.77, -0.02, 0.07], e: 0.15 };
const POSE_KEYS_R = { a: [0.77, 0.05, -0.04], e: 0.15 };
const glv3 = a => `vec3(${a.map(x => x.toFixed(3)).join(', ')})`;
// How far a standing person's origin sits above the floor (scene3d.js STAND_LIFT).
const STAND_LIFT_LOCAL = 0.42;

// ------------------------------------------------------------------ the body

let bodyFile = null;
// The body file: levels of detail one after another (detailed, light, lightest), each positions, normals, rig (bone, bone, weight of
// the second, ambient occlusion), tag (material, prop), female and heavier offsets, indices.
// `?v=` changes with the file, past the day the browser may keep it (_headers).
export function loadBody(url = 'assets/crowd/body.bin?v=3') {
  bodyFile ||= fetch(url).then(r => {
    if (!r.ok) throw new Error(`crowd body: ${r.status}`);
    return r.arrayBuffer();
  }).then(buf => {
    const dv = new DataView(buf), lods = [];
    let o = 0;
    while (o + 8 <= buf.byteLength) {
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
function unposeArm(points, pose, side = 'R') {
  const S = v3(J.M['shoulder' + side]), E = v3(J.M['elbow' + side]);
  const Ainv = rotXYZ(pose.a).invert(), Einv = new THREE.Matrix4().makeRotationX(-pose.e);
  return points.map(p => {
    const u = p.clone().sub(S).applyMatrix4(Ainv).add(S);
    return u.sub(E).applyMatrix4(Einv).add(E);
  });
}
function posedArm(p, pose, side = 'R') {
  const S = v3(J.M['shoulder' + side]), E = v3(J.M['elbow' + side]);
  const e = p.clone().sub(E).applyMatrix4(new THREE.Matrix4().makeRotationX(pose.e)).add(E);
  return e.sub(S).applyMatrix4(rotXYZ(pose.a)).add(S);
}
const unposeRight = (points, pose) => unposeArm(points, pose, 'R');
const posedRight = (p, pose) => posedArm(p, pose, 'R');
const wristL = () => v3([-J.M.wristR[0], J.M.wristR[1], J.M.wristR[2]]);

// Props as plain triangles (positions, normals), each tagged with a material and a prop id.
// `side` is the hand that holds it ('R' or 'L'), or 'torso' for a prop strapped to the body.
function props(detail, band = false) {
  const out = [];
  const add = (geo, mat, prop, pose, side = 'R') => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = [], N = [];
    for (let i = 0; i < g.attributes.position.count; i++) {
      P.push(new THREE.Vector3().fromBufferAttribute(g.attributes.position, i));
      N.push(new THREE.Vector3().fromBufferAttribute(g.attributes.normal, i));
    }
    if (side === 'torso') { out.push({ P, N, mat, prop, side }); return; }
    const Pu = unposeArm(P, pose, side);
    const Ninv = rotXYZ(pose.a).invert().premultiply(new THREE.Matrix4().makeRotationX(-pose.e));
    out.push({ P: Pu, N: N.map(n => n.clone().applyMatrix4(Ninv).normalize()), mat, prop, side });
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
  if (!band) return out;
  {
    // Handheld microphone: the handle in the fist, the grille at the mouth.
    const W = posedRight(v3(J.M.wristR), POSE_MIC), E = posedRight(v3(J.M.elbowR), POSE_MIC);
    const fore = W.clone().sub(E).normalize();
    const hand = W.clone().addScaledVector(fore, 0.06);
    const dir = new THREE.Vector3(0, 1.11, -0.13).sub(hand).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const at = (g, d) => g.applyQuaternion(q).translate(hand.x + dir.x * d, hand.y + dir.y * d, hand.z + dir.z * d);
    add(at(new THREE.CylinderGeometry(0.019, 0.014, 0.17, 8), 0.02), MAT.plastic, 4, POSE_MIC);
    add(at(new THREE.SphereGeometry(0.03, 8, 6), 0.12), MAT.chrome, 4, POSE_MIC);
  }
  {
    // Guitar on its strap: the body across the hips, the neck up to the left hand.
    const lower = new THREE.CylinderGeometry(0.185, 0.185, 0.075, 16).rotateX(Math.PI / 2);
    const upper = new THREE.CylinderGeometry(0.145, 0.145, 0.075, 14).rotateX(Math.PI / 2).translate(-0.2, 0, 0);
    const neck = new THREE.BoxGeometry(0.62, 0.052, 0.03).translate(-0.56, 0, -0.03);
    const head = new THREE.BoxGeometry(0.17, 0.085, 0.02).translate(-0.95, 0, -0.03);
    const tilt = Math.atan2(0.2, 0.39);   // the neck rises to the fretting hand
    const place = g => g.rotateZ(-tilt).translate(0.05, 0.6, -0.215);
    add(place(lower), MAT.wood, 3, null, 'torso');
    add(place(upper), MAT.wood, 3, null, 'torso');
    add(place(neck), MAT.plastic, 3, null, 'torso');
    add(place(head), MAT.plastic, 3, null, 'torso');
  }
  {
    // Drumsticks, one in each hand, tips to the snare.
    for (const [side, pose] of [['L', POSE_DRUM_L], ['R', POSE_DRUM_R]]) {
      const W = posedArm(side === 'R' ? v3(J.M.wristR) : wristL(), pose, side);
      const E = posedArm(v3(J.M['elbow' + side]), pose, side);
      const fore = W.clone().sub(E).normalize();
      const hand = W.clone().addScaledVector(fore, 0.06);
      const dir = new THREE.Vector3(0, 0.55, -0.55).sub(hand).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const g = new THREE.CylinderGeometry(0.008, 0.006, 0.4, 5).applyQuaternion(q).translate(hand.x + dir.x * 0.15, hand.y + dir.y * 0.15, hand.z + dir.z * 0.15);
      add(g, MAT.wood, 5, pose, side);
    }
  }
  return out;
}

// A three.js geometry for one level of detail: the body plus the props.
function bodyGeometry(lod, detail, band = false) {
  const extra = props(detail, band);
  const nb = lod.P.length / 3, ne = extra.reduce((s, p) => s + p.P.length, 0), n = nb + ne;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), rig = new Float32Array(n * 4), tag = new Float32Array(n * 2), fem = new Float32Array(n * 3), fat = new Float32Array(n * 3);
  P.set(lod.P); N.set(lod.N); rig.set(lod.rig); tag.set(lod.tag); fem.set(lod.fem); fat.set(lod.fat);
  // The props move with the hand that holds them (or the torso), and with it between the two
  // body shapes.
  const handFem = v3(J.F.wristR).sub(v3(J.M.wristR));
  const torsoFem = v3(J.F.pelvis).sub(v3(J.M.pelvis));
  const boneOf = { R: BONE.foreR, L: BONE.foreL, torso: BONE.torso };
  let k = nb;
  const idx = Array.from(lod.idx);
  for (const p of extra) {
    p.P.forEach((v, i) => {
      P.set([v.x, v.y, v.z], k * 3); N.set([p.N[i].x, p.N[i].y, p.N[i].z], k * 3);
      const bone = boneOf[p.side || 'R'], f = p.side === 'torso' ? torsoFem : p.side === 'L' ? new THREE.Vector3(-handFem.x, handFem.y, handFem.z) : handFem;
      rig.set([bone, bone, 0, 1], k * 4); tag.set([p.mat, p.prop], k * 2);
      fem.set([f.x, f.y, f.z], k * 3);
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
// Show mode (viewer.js): the light sticks' colour and how much of it, the effect (0 on the
// beat, 1 steady, 2 a wave round the stage), the share of the crowd holding one up, the stage.
uniform vec3 uStickCol; uniform float uStickMix; uniform float uStickFx; uniform float uStickAll; uniform vec2 uStage;
uniform vec3 uPick; uniform float uPickOn; varying float vPicked;
varying vec3 vCrowdCol; varying vec3 vGlowCol; varying float vRimK; varying float vAO; varying float vSpec;
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
// A light-stick ocean: that share of the crowd (never the act on stage) holds one up.
if (act < 5.5 && act != 2. && fract(ph * 7.31 + 0.17) < uStickAll) act = 2.;
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
else if (act == 6.) {
  // Singing: the microphone at the mouth, the free arm reaching out to the crowd and back.
  aR = ${glv3(POSE_MIC.a)}; eR = ${POSE_MIC.e.toFixed(3)};
  float reach = 0.5 + 0.5 * sin(uTime * 0.55 + ph * 4.);
  aL = vec3(0.25 + 1.45 * reach, 0.35 * reach, -0.12 - 0.25 * reach); eL = 0.9 - 0.7 * reach;
}
else if (act == 7.) {
  // Guitar or bass: fretting hand on the neck, the strumming hand on the beat.
  aL = ${glv3(POSE_FRET.a)} + vec3(0.04 * sin(uTime * 1.3 + ph), 0., 0.); eL = ${POSE_FRET.e.toFixed(3)};
  aR = ${glv3(POSE_STRUM.a)}; eR = ${POSE_STRUM.e.toFixed(3)} + 0.16 * sin(beat * 4. * pi);
}
else if (act == 8.) {
  // Drums: the sticks come down in turn, harder on the backbeat.
  float h1 = max(0., sin(beat * 2. * pi)), h2 = max(0., sin(beat * 2. * pi + pi * 0.5));
  aL = ${glv3(POSE_DRUM_L.a)} + vec3(0.32 * h1, 0., 0.); eL = ${POSE_DRUM_L.e.toFixed(3)} - 0.35 * h1;
  aR = ${glv3(POSE_DRUM_R.a)} + vec3(0.32 * h2, 0., 0.); eR = ${POSE_DRUM_R.e.toFixed(3)} - 0.35 * h2;
}
else if (act == 9.) {
  // Keys: both hands on the keyboard, playing.
  aL = ${glv3(POSE_KEYS_L.a)} + vec3(0.03 * sin(uTime * 6.1 + ph), 0.04 * sin(uTime * 2.3 + ph), 0.); eL = ${POSE_KEYS_L.e.toFixed(3)};
  aR = ${glv3(POSE_KEYS_R.a)} + vec3(0.03 * sin(uTime * 6.7 + ph * 2.), 0.04 * sin(uTime * 2.9 + ph), 0.); eR = ${POSE_KEYS_R.e.toFixed(3)};
}
else if (act == 10.) {
  // A dance routine: a new arm shape every two beats, everyone in time.
  float step8 = mod(floor(beat / 2.), 4.), f = smoothstep(0., 0.35, fract(beat / 2.));
  vec3 L0 = vec3(0.2, 0., -0.3), R0 = vec3(0.2, 0., 0.3);
  vec3 L1 = vec3(2.7, 0., 0.3), R1 = vec3(2.7, 0., -0.3);
  vec3 L2 = vec3(1.4, -0.9, 0.), R2 = vec3(1.4, 0.9, 0.);
  vec3 L3 = vec3(0.6, 0., -1.3), R3 = vec3(0.6, 0., 1.3);
  vec3 Lp = step8 < 0.5 ? L3 : step8 < 1.5 ? L0 : step8 < 2.5 ? L1 : L2;
  vec3 Ln = step8 < 0.5 ? L0 : step8 < 1.5 ? L1 : step8 < 2.5 ? L2 : L3;
  vec3 Rp = step8 < 0.5 ? R3 : step8 < 1.5 ? R0 : step8 < 2.5 ? R1 : R2;
  vec3 Rn = step8 < 0.5 ? R0 : step8 < 1.5 ? R1 : step8 < 2.5 ? R2 : R3;
  aL = mix(Lp, Ln, f); aR = mix(Rp, Rn, f); eL = eR = 0.4 + 0.5 * f;
}
// Walking the stage (Band.update, 3D Pass Plus): aLook.y above 1 is how far into a stride a
// performer is. The arms swing against the legs.
float walk = act > 5.5 ? clamp(aLook.y - 1., 0., 1.) : 0.;
float stride = sin(uTime * 5.4 + ph * 6.283);
if (walk > 0.001) {
  // A singer keeps the microphone up, a singer at the guitar keeps playing it.
  if (act != 7.) { aL = mix(aL, vec3(0.06 - 0.38 * stride, 0., -0.06), walk); eL = mix(eL, 0.35, walk); }
  if (act != 6. && act != 7.) { aR = mix(aR, vec3(0.06 + 0.38 * stride, 0., 0.06), walk); eR = mix(eR, 0.35, walk); }
}
aL = mix(restL, aL, on); aR = mix(restR, aR, on); eL = mix(restE, eL, on); eR = mix(restE, eR, on);
gMaL = rotZ(aL.z) * rotY(aL.y) * rotX(aL.x);
gMaR = rotZ(aR.z) * rotY(aR.y) * rotX(aR.x);
gMeL = rotX(eL); gMeR = rotX(eR);
// Legs: seated, thighs forward and shins down; standing, a bounce in the knees on the beat.
float bounce = on * en * max(0., sin(beat * 2. * pi)) * (act == 5. ? 1. : 0.5);
float thigh = stand > 0.5 ? 0.06 * bounce : 1.5;
float knee = stand > 0.5 ? -0.13 * bounce : -1.47;
float splay = stand > 0.5 ? 0. : 0.07;
gMtL = rotY(-splay) * rotX(mix(thigh, 0.42 * stride, walk)); gMtR = rotY(splay) * rotX(mix(thigh, -0.42 * stride, walk));
gMkL = rotX(mix(knee, -0.75 * max(0., -stride), walk)); gMkR = rotX(mix(knee, -0.75 * max(0., stride), walk));
// Props show only in the hand that holds them, once the show is on; hair pieces by style.
float keep = 1.;
if (prop == 1.) keep = act == 3. && on > 0.3 ? 1. : 0.;
if (prop == 2.) keep = act == 2. && on > 0.3 ? 1. : 0.;
if (prop == 3.) keep = act == 7. ? 1. : 0.;
if (prop == 4.) keep = act == 6. ? 1. : 0.;
if (prop == 5.) keep = act == 8. ? 1. : 0.;
if (prop >= 16.) keep = mod(floor((prop - 16.) / exp2(style)), 2.) > 0.5 ? 1. : 0.;
// The act takes the stage once the house lights are down.
if (act > 5.5 && on < 0.25) keep = 0.;
vec3 nrm = mix(boneTurn(aRig.x, objectNormal), boneTurn(aRig.y, objectNormal), aRig.z);
// A few vertices of the coarse body have no normal of their own.
objectNormal = dot(nrm, nrm) > 1e-8 ? normalize(nrm) : vec3(0., 1., 0.);
// Colour by material.
vGlowCol = vec3(0.); vRimK = 1.; vAO = aRig.w; vSpec = 1.;
if (mat == 0.) vCrowdCol = rgb(aCol.x);
else if (mat == 1.) vCrowdCol = rgb(aCol.y);
else if (mat == 2.) vCrowdCol = rgb(aCol.z);
else if (mat == 3.) vCrowdCol = rgb(aCol.w);
else if (mat == 4.) vCrowdCol = vec3(0.018);
else if (mat == 8.) vCrowdCol = rgb(sleeves > 0.5 ? aCol.x : aCol.y);
else if (mat == 9.) vCrowdCol = vec3(0.02);
else if (mat == 10.) vCrowdCol = vec3(0.012, 0.009, 0.007);
else if (mat == 11.) vCrowdCol = vec3(0.16, 0.035, 0.02);
else if (mat == 12.) vCrowdCol = vec3(0.3);
else if (mat == 5.) { vCrowdCol = vec3(0.02); vRimK = 0.; vAO = 1.;
  float flick = 0.75 + 0.25 * sin(uTime * 2.3 + ph * 11.) * sin(uTime * 0.7 + ph * 5.);
  vGlowCol = vec3(0.72, 0.8, 1.0) * 1.25 * flick * on; }
else if (mat == 6.) { vCrowdCol = vec3(0.1); vRimK = 0.; vAO = 1.;
  float pulse = 1.5 + 0.7 * max(0., sin(beat * 2. * pi));
  #ifdef USE_INSTANCING
  if (uStickFx > 1.5) { vec3 wp = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
    pulse = 0.35 + 2.1 * pow(0.5 + 0.5 * sin(atan(wp.z - uStage.y, wp.x - uStage.x) * 2. - uTime * 2.4), 3.); }
  #endif
  if (uStickFx > 0.5 && uStickFx < 1.5) pulse = 1.85;
  vGlowCol = mix(mix(vec3(1.), hue(aLook.y), 0.7), uStickCol * 1.15, uStickMix) * pulse * on; }
else vCrowdCol = vec3(0.035);
// Performers are lit by the stage's own lights: no stand-in rim light from the stage, and
// colours scaled for the wash, which on the deck is many times what reaches the floor.
if (act > 5.5) { vRimK = 0.; vSpec = 0.08; vCrowdCol *= 0.4; }
`;

const BEGIN = /* glsl */`
vec3 rest = position + fem * aFem + heavy * aFat;
vec3 transformed = mix(boneMove(aRig.x, rest), boneMove(aRig.y, rest), aRig.z);
// Seated, a smaller body still sits on the seat.
transformed.y += (1. - stand) * fem * ${(J.M.hipL[1] - J.F.hipL[1]).toFixed(4)};
if (keep < 0.5) transformed = g_shoulderR;
// One fan picked from the list: they light up, everyone else fades back.
vPicked = 0.;
#ifdef USE_INSTANCING
if (uPickOn > 0.5) vPicked = 1. - step(0.22, distance((modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz, uPick));
#endif
transformed *= 1. + 0.3 * vPicked;
`;

// The crowd's material: a standard material whose colour, glow and rim light come from the
// shader above. `rim`: the stage's light catching the edges of heads and shoulders.
// `share`: another crowd material whose clock and lights this one follows (the band), with
// its own pick, so the band never fades with the crowd.
export function crowdMaterial(share = null) {
  const uniforms = share ? { ...share.userData.crowd, uPick: { value: new THREE.Vector3() }, uPickOn: { value: 0 } } : {
    uTime: { value: 0 }, uLive: { value: 0 }, uBpm: { value: 118 },
    uStickCol: { value: new THREE.Color('#ffffff') }, uStickMix: { value: 0 }, uStickFx: { value: 0 }, uStickAll: { value: 0 }, uStage: { value: new THREE.Vector2() },
    uRimDir: { value: new THREE.Vector3(0, 0, -1) }, uRimCol: { value: new THREE.Color('#ffb98a') },
    uPick: { value: new THREE.Vector3() }, uPickOn: { value: 0 },
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  mat.userData.crowd = uniforms;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = VERTEX_HEAD + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + POSE)
      .replace('#include <begin_vertex>', BEGIN);
    sh.fragmentShader = 'uniform float uTime; uniform float uLive; uniform float uPickOn; uniform vec3 uRimDir; uniform vec3 uRimCol;\nvarying float vPicked; varying vec3 vCrowdCol; varying vec3 vGlowCol; varying float vRimK; varying float vAO; varying float vSpec;\n' + sh.fragmentShader
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        { float dimK = uPickOn * (1.0 - vPicked);
          vec3 g = vec3(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, g * 0.2, dimK * 0.92); }`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular *= vSpec;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCrowdCol * mix(1.0, 0.6, uLive) * mix(1.0, vAO, 0.85);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.95, 0.35), vPicked * 0.85);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vGlowCol;
        {
          vec3 V = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 2.4);
          float side = clamp(dot(normal, uRimDir) * 0.9 + 0.25, 0.0, 1.0);
          totalEmissiveRadiance += uRimCol * fr * side * uLive * vRimK * vAO * 0.9;
          totalEmissiveRadiance *= 1.0 - 0.85 * uPickOn * (1.0 - vPicked);
          totalEmissiveRadiance += vec3(0.25, 1.0, 0.3) * vPicked * (1.4 + 0.5 * sin(uTime * 4.0) + fr * 2.5);
        }`);
  };
  mat.customProgramCacheKey = () => 'atv-crowd-6';
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

// Copies `n` numbers between typed arrays, without making views of them.
function copy(from, i, to, j, n) { for (let t = 0; t < n; t++) to[j + t] = from[i + t]; }

export class Crowd {
  // Above this many people the overview draws everyone in the lightest figure; from a seat,
  // the light figure goes to the nearest MID_MAX within MID_R metres.
  static BIG = 16000;
  static MID_MAX = 6000;
  static MID_R = 70;

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
    this.seatedIdx = spots.flatMap((p, k) => (p.standing ? [] : [k]));
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
    this.midSlots = null;
    this.hidden = -1;
    this.meshes = [];
    this.visible = true;
    // The body arrives from its file; until then there is nobody, and a focus asked for in
    // the meantime is applied when it does. Three figures: the detailed body for the people
    // round the seat, a light one for the rest of the hall, and for a stadium's far stands a
    // lighter one still.
    this.ready = loadBody().then(lods => {
      if (this.disposed) return;
      this.lods = lods;
      this.far = this._mesh(bodyGeometry(lods[1], false), n);
      this.tiny = lods[2] ? this._mesh(bodyGeometry(lods[2], false), n) : null;
      for (const m of [this.far, this.tiny]) if (m) { m.visible = this.visible; this.meshes.push(m); scene.add(m); }
      this._assign();
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

  // Copies the listed people into a mesh.
  _fill(mesh, list, calm = false) {
    if (!mesh) return;
    const d = this.data, geo = mesh.geometry, mat = mesh.instanceMatrix.array, M = d.matrix;
    const src = Object.entries(mesh.userData.src).map(([key, name]) => [d[key], geo.attributes[name].array, geo.attributes[name].itemSize]);
    const hidden = this.hidden, skip = this.skip, calmSet = calm ? this.calm : null;
    const quiet = [ACT.stick, ACT.phone, ACT.handsUp];
    for (let j = 0; j < list.length; j++) {
      const k = list[j], o = j * 16;
      if (k === hidden || skip?.has(k)) { mat.fill(0, o, o + 16); mat[o + 15] = 1; } else copy(M, k * 16, mat, o, 16);
      for (const [from, to, sz] of src) copy(from, k * sz, to, j * sz, sz);
      if (calmSet?.has(k) && quiet.includes(d.anim[k * 4])) geo.attributes.aAnim.array[j * 4] = k % 2 ? ACT.clap : ACT.dance;
    }
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    for (const name of Object.values(mesh.userData.src)) geo.attributes[name].needsUpdate = true;
  }

  // Who gets which figure: `nearSlots` the detailed one, `midSlots` the light one (null:
  // everyone not near, in a hall), everyone else the lightest.
  _assign() {
    if (!this.far) return;
    const near = new Uint8Array(this.n);
    for (const k of this.nearSlots) near[k] = 1;
    let mid = [], far = [];
    if (this.tiny && this.midSlots) {
      for (const k of this.midSlots) if (!near[k]) near[k] = 2;
      for (let k = 0; k < this.n; k++) if (near[k] === 2) mid.push(k); else if (!near[k]) far.push(k);
    } else if (this.tiny && this.n > Crowd.BIG) {
      // A stadium seen from above: everyone in the lightest figure.
      for (let k = 0; k < this.n; k++) if (!near[k]) far.push(k);
    } else {
      for (let k = 0; k < this.n; k++) if (!near[k]) mid.push(k);
    }
    this._fill(this.far, mid);
    this._fill(this.tiny, far);
    if (this.tiny) this.tiny.visible = this.visible && far.length > 0;
  }

  // Detailed figures for everyone within `radius` metres of `eye` (closest first, at most
  // `max`); the light figure for the next ones out to `midRadius` (at most `midMax`); the
  // lightest for everyone else. `look`: where the camera will face. Null brings everyone
  // back to the overview's figures.
  // around: a 360° photo, where the people beside and behind you are part of the picture.
  focusOn(eye, look = null, radius = 24, max = 900, around = false) {
    if (!this.far) { this.pendingFocus = [eye, look, radius, max, around]; return; }
    this.pendingFocus = null;
    // A new seat (or none): the people in front of the last one go back to their own height.
    this._restoreAhead();
    if (!eye) { this.nearSlots = []; this.midSlots = null; this.skip = null; this._assign(); if (this.near) this.near.visible = false; return; }
    // One pass over everyone, keeping only those within the light figure's reach, then a
    // sort of just those: the whole crowd sorted made a hitch as the flight to a seat began.
    const d = this.data, M = d.matrix, R2 = Crowd.MID_R * Crowd.MID_R, r2 = radius * radius;
    const ex = eye.x, ey = eye.y, ez = eye.z;
    let dist = this._dist, ids = this._ids;
    if (!dist || dist.length < this.n) { dist = this._dist = new Float32Array(this.n); ids = this._ids = new Int32Array(this.n); }
    let m = 0;
    for (let k = 0; k < this.n; k++) {
      const o = k * 16, dx = M[o + 12] - ex, dy = M[o + 13] - ey, dz = M[o + 14] - ez, q = dx * dx + dy * dy + dz * dz;
      if (q < R2) { dist[k] = q; ids[m++] = k; }
    }
    const near = Array.from(ids.subarray(0, m)).sort((a, b) => dist[a] - dist[b]);
    const cand = near.map(k => [dist[k], k]);
    const within = [];
    for (const c of cand) { if (c[0] < r2) within.push(c); else break; }
    this.nearSlots = within.slice(0, Math.min(max, 900)).map(c => c[1]);
    this.midSlots = cand.slice(this.nearSlots.length).slice(0, this.midMax ?? Crowd.MID_MAX).map(c => c[1]);
    // The people right next to you keep their hands down: an arm up a metre from the camera
    // would fill the picture and say nothing about the view from the seat.
    this.calm = new Set(within.filter(c => c[0] < 3.2 * 3.2).map(c => c[1]));
    // Your neighbours in the same row sit beside the camera, not in front of it: drawn, they
    // would fill the edge of the picture as a dark wall.
    // Likewise anyone close by who is beside or behind you rather than in front.
    const fx = look ? look.x - eye.x : 0, fz = look ? look.z - eye.z : -1, fl = Math.hypot(fx, fz) || 1;
    this.skip = new Set(within.filter(([, k]) => {
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
    this._fill(this.near, this.nearSlots, true);
    this._assign();
  }

  // 3D Pass Plus: the people in front of the seat at another height. `o`: { eye, look, f, depth }:
  // everyone near whose spot is up to `depth` metres ahead of the eye (towards `look`), and
  // not far to the side, is scaled by `f` where they are. Seated, the hips stay on the seat;
  // standing, the feet stay on the floor. Null: everyone back to their own height.
  setAhead(o) {
    if (!this.far) return;
    this._restoreAhead();
    if (o) {
      const M = this.data.matrix, L = this.data.look, { eye, look, f, depth } = o;
      const fx = look ? look.x - eye.x : 0, fz = look ? look.z - eye.z : -1, fl = Math.hypot(fx, fz) || 1;
      const ux = fx / fl, uz = fz / fl;
      const saved = this._ahead = new Map();
      for (const k of this.nearSlots) {
        const o16 = k * 16, dx = M[o16 + 12] - eye.x, dz = M[o16 + 14] - eye.z, dy = M[o16 + 13] - eye.y;
        const ahead = dx * ux + dz * uz, side = Math.abs(dx * uz - dz * ux);
        if (ahead < 0.3 || ahead > depth || side > 0.9 + ahead * 0.45 || dy > 1.5) continue;
        saved.set(k, M.slice(o16, o16 + 16));
        const h = M[o16 + 5], standing = (Math.floor(L[k * 4]) & 16) !== 0;
        for (const j of [0, 1, 2, 4, 5, 6, 8, 9, 10]) M[o16 + j] *= f;
        M[o16 + 13] += standing ? STAND_LIFT_LOCAL * h * (f - 1) : 0.48 * h * (1 - f);
      }
    }
    if (this.near) this._fill(this.near, this.nearSlots, true);
    this._assign();
  }

  // Show mode's Standing: everyone in a seat gets up and stands a step in front of their
  // chair (and back down). The people in front (setAhead) are let go first; the scene sets
  // them again for the new height.
  setStanding(on) {
    on = !!on;
    if (on === !!this.allUp) return;
    this._restoreAhead();
    this.allUp = on;
    const M = this.data.matrix, L = this.data.look, s = on ? 1 : -1;
    for (const k of this.seatedIdx) {
      const o = k * 16, w = Math.hypot(M[o + 8], M[o + 10]) || 1;
      L[k * 4] += 16 * s;
      M[o + 12] -= (M[o + 8] / w) * 0.3 * s;
      M[o + 13] += STAND_LIFT_LOCAL * s;
      M[o + 14] -= (M[o + 10] / w) * 0.3 * s;
    }
    if (!this.far) return;
    if (this.near) this._fill(this.near, this.nearSlots, true);
    this._assign();
  }

  _restoreAhead() {
    if (!this._ahead) return;
    for (const [k, m] of this._ahead) this.data.matrix.set(m, k * 16);
    this._ahead = null;
  }

  // Hides (or shows again) the person in one slot: the seat you sit in.
  hide(k) {
    this.hidden = k;
    this._assign();
    if (this.near?.visible) this._fill(this.near, this.nearSlots, true);
  }

  // Lights up the person in one slot and fades everyone else; -1 brings the crowd back.
  pick(k) {
    const u = this.uniforms;
    if (k == null || k < 0 || k >= this.n) { u.uPickOn.value = 0; this.picked = -1; return; }
    const m = this.data.matrix;
    u.uPick.value.set(m[k * 16 + 12], m[k * 16 + 13], m[k * 16 + 14]);
    u.uPickOn.value = 1;
    this.picked = k;
  }

  // One figure on its own, lit green, for a layer drawn over the faded picture: the person in
  // slot `k`, or (nobody drawn there) someone like slot 0 put in `place` (x, y, z, yaw).
  soloMesh(k, place) {
    if (!this.lods) return null;
    this._soloGeo ||= bodyGeometry(this.lods[0], true);
    this._soloMat ||= crowdMaterial(this.material);
    const geo = this._soloGeo, src = k >= 0 && k < this.n ? k : 0, d = this.data;
    const mesh = new THREE.InstancedMesh(geo, this._soloMat, 1);
    mesh.frustumCulled = false;
    for (const [key, name] of [['anim', 'aAnim'], ['col', 'aCol'], ['look', 'aLook']]) {
      geo.setAttribute(name, new THREE.InstancedBufferAttribute(d[key].slice(src * 4, src * 4 + 4), 4));
    }
    const m = new THREE.Matrix4();
    if (k >= 0 && k < this.n) m.fromArray(d.matrix, k * 16);
    else m.compose(new THREE.Vector3(place.x, place.y, place.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), place.yaw || 0), new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(0, m);
    const u = this._soloMat.userData.crowd;
    u.uPick.value.setFromMatrixPosition(m);
    u.uPickOn.value = 1;
    return mesh;
  }

  setVisible(on) {
    this.visible = on;
    if (this.far) this.far.visible = on;
    if (this.tiny) this.tiny.visible = on && this.tiny.count > 0;
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

// ------------------------------------------------------------------ the act on stage

// Performers from the same body as the crowd, each posed for a role, with the gear round
// them: no likeness of the real artists, just how many there are and what they play.
// `lineup`: [{ role, female }] with role 'vocals' (handheld microphone), 'vocals-guitar'
// (singing at a stand with a guitar on), 'guitar', 'bass', 'drums', 'keys' or 'dancer'.
// `stage`: the deck's top (y), its front edge (front) and the band risers (riserY, riserZ).
const STAGE_WEAR = ['#0c0c0e', '#121215', '#e8e4dc', '#1c1d22', '#3a1216', '#20252f', '#2b2b2e', '#5a4a3a', '#0f1a2e'];
const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const smooth = u => u * u * (3 - 2 * u);

// Who walks the stage (3D Pass Plus): in a band only the singers, never the players, and with
// no singer out front the one singing at the guitar takes it along. A group without
// instruments (a boy or girl group, dancers) walks it all together.
export function walkersOf(lineup) {
  const front = lineup.map((m, k) => [m, k]).filter(([m]) => m.role === 'vocals' || m.role === 'dancer');
  return (front.length ? front : lineup.map((m, k) => [m, k]).filter(([m]) => m.role === 'vocals-guitar')).map(([, k]) => k);
}

// Where the walkers stand round the middle of their group as it walks an end stage: one row
// of up to five, else two (three past ten), a step and a half apart, each row a pace behind.
export function formation(n) {
  const per = n <= 5 ? n : n <= 10 ? Math.ceil(n / 2) : Math.ceil(n / 3), out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / per), inRow = Math.min(per, n - r * per), c = i - r * per;
    out.push([(c - (inRow - 1) / 2) * 1.6, -r * 1.5]);
  }
  return out;
}

// The walk round a stage, in the band's own frame, as a closed loop of [x, z] points with its
// running length, and the distances along it where the walkers stop to sing (`stops`).
// An end stage (`mode` 'group'): the middle of the group goes from the centre out to the front
// corner on one side, back up the wing to the back corner, back to the centre and the same on
// the other side; `half` is the group's half width, so its outside walker reaches the edge.
// A 360 stage (`mode` 'line'): round the main stage's edge, out along each runway to its end
// and back, the members one behind the other; they stop at every corner and runway end.
export function stageRoute({ front = -34, spread = 1, deckHalf = null, deckDepth = null, riserZ = null, half = 0, runway = null, round = null }) {
  let pts, stopAt;
  if (round) {
    const { half: h, arm } = round, e = h - 1.2, [tx, tz] = arm.tip;
    const k = (L => (L - 2.2) / L)(Math.hypot(tx, tz));
    // Where each runway's centre line leaves the main stage's edge.
    const exitZ = e * tz / tx;
    pts = []; stopAt = [];
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      // up this side to the runway, out to its end, back, on to the corner
      pts.push([sx * e, sz * exitZ], [sx * tx * k, sz * tz * k], [sx * e, sz * exitZ], [sx * e, sz * e]);
      stopAt.push(pts.length - 3, pts.length - 1);
      // the next corner along (counter-clockwise), down to the next runway
      if (sx === 1 && sz === 1) pts.push([-e, e]);
      else if (sx === -1 && sz === 1) pts.push([-e, -e]);
      else if (sx === -1 && sz === -1) pts.push([e, -e]);
      else pts.push([e, e]);
      stopAt.push(pts.length - 1);
    }
    // Drop repeats so every leg has a length (and keep the stops on the points they name).
    const keep = pts.map((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01);
    const idx = []; let j = -1;
    pts.forEach((p, i) => { if (keep[i]) j++; idx.push(j); });
    pts = pts.filter((p, i) => keep[i]);
    stopAt = [...new Set(stopAt.map(i => idx[i]))].sort((a, b) => a - b);
  } else {
    const X = Math.max(0, (deckHalf ?? 18 * Math.max(spread, 0.55)) - 1.4 - half), zF = front - 2.4;
    // The wings run back beside the band to the deck's back corners, short of the screen.
    const zB = front - (deckDepth ? Math.max(3.5, deckDepth - 5) : riserZ == null ? 5.5 : Math.min(7, Math.max(3.5, (front - riserZ) * 0.6)));
    if (runway) {
      // A runway or catwalk down the middle (`runway`: how far its end is from the front edge):
      // after the first side, out to its end and back, one behind the other (`file`).
      pts = [[0, zF], [-X, zF], [-X, zB], [-X, zF], [0, zF], [0, front + runway], [0, zF], [X, zF], [X, zB], [X, zF]];
      stopAt = [0, 1, 2, 4, 5, 7, 8];
    } else {
      pts = [[0, zF], [-X, zF], [-X, zB], [-X, zF], [0, zF], [X, zF], [X, zB], [X, zF]];
      stopAt = [0, 1, 2, 4, 5, 6];
    }
  }
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { pts, cum, length: cum[pts.length], stops: stopAt.map(i => cum[i]), mode: round ? 'line' : 'group', file: !round && runway ? [cum[4], cum[6]] : null, runwayEnd: !round && runway ? pts[5][1] : null };
}

// A group (two walkers or more, as a boy or girl group) does not walk as one crowd: it splits
// into small squads, two or so each, that go out to the stage's sides (the wings and the
// runway of an end stage, the runways of a 360 stage) and sing there, then all walk to the
// middle at the front and sing together; next time round every squad takes the next side.
// Keyframes: where each walker stands (x, z and a lift `y`), how long they stay, and which
// way they face there ('crowd' for an end stage, 'out' from the middle for a 360 stage).
export const SPLIT_HOLD = 6, TOGETHER_HOLD = 7;
export function squadSizes(n, max) {
  const k = Math.max(1, Math.min(max, Math.ceil(n / 2))), base = Math.floor(n / k), extra = n % k;
  return Array.from({ length: k }, (_, j) => base + (j < extra ? 1 : 0));
}
export function groupPlan(n, R, round = null) {
  const sizes = squadSizes(n, round ? 4 : (R.runwayEnd ? 5 : 4));
  const frames = [];
  if (round) {
    // Out on each runway's tip lift (venues3d.js: 1.4 m round, 0.955 of the way out, 0.1 m
    // over the deck); together on the big lift in the middle (0.2 m over the deck).
    const { arm: { tip: [tx, tz] } } = round, L = Math.hypot(tx, tz), k = 0.955;
    const arms = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    const ringR = n <= 4 ? 1.8 : 2.6;
    for (let c = 0; c < arms.length; c++) {
      const spread = [], together = [];
      sizes.forEach((size, j) => {
        const [sx, sz] = arms[(j + c) % arms.length], ux = sx * tx / L, uz = sz * tz / L, ang = Math.atan2(ux, uz);
        for (let m = 0; m < size; m++) {
          const off = (m - (size - 1) / 2) * 1.1;
          spread.push({ x: sx * tx * k - uz * off, z: sz * tz * k + ux * off, y: 0.1 });
          const a = ang + (m - (size - 1) / 2) * 0.5;
          together.push({ x: Math.sin(a) * ringR, z: Math.cos(a) * ringR, y: 0.2 });
        }
      });
      frames.push({ at: spread, hold: SPLIT_HOLD, face: 'out' }, { at: together, hold: TOGETHER_HOLD, face: 'out' });
    }
  } else {
    const [[, zF], [X], [, zB]] = [R.pts[0], [Math.abs(R.pts[1][0])], R.pts[2]];
    const spots = [[-X, zF, 'x'], [X, zF, 'x'], ...(R.runwayEnd ? [[0, R.runwayEnd - 0.8, 'z']] : []), [-X, zB, 'x'], [X, zB, 'x']];
    const F = formation(n);
    for (let c = 0; c < spots.length; c++) {
      const spread = [];
      sizes.forEach((size, j) => {
        const [x, z, axis] = spots[(j + c) % spots.length];
        for (let m = 0; m < size; m++) {
          const off = (m - (size - 1) / 2) * 1.5;
          spread.push(axis === 'x' ? { x: x + off, z, y: 0 } : { x, z: z - m * 1.5, y: 0 });
        }
      });
      frames.push({ at: spread, hold: SPLIT_HOLD, face: 'crowd' }, { at: F.map(([ox, oz]) => ({ x: ox, z: zF + oz, y: 0 })), hold: TOGETHER_HOLD, face: 'crowd' });
    }
  }
  // Each walk takes as long as the longest of its paths at an easy pace.
  const legs = frames.map((f, i) => {
    const g = frames[(i + 1) % frames.length];
    const far = Math.max(...f.at.map((p, w) => Math.hypot(g.at[w].x - p.x, g.at[w].z - p.z)));
    return { ...f, walk: Math.max(2.5, far / WALK_SPEED) };
  });
  // On and off a runway, by its root at the middle of the front edge, never across the air.
  const gate = !round && R.runwayEnd ? { x: 0, z: R.pts[0][1] + 2.4 - 0.6, front: R.pts[0][1] + 2.4 } : null;
  if (gate) legs.forEach((f, i) => {
    const g = legs[(i + 1) % legs.length];
    const far = Math.max(...f.at.map((p, w) => pathOf(p, g.at[w], gate).len));
    f.walk = Math.max(2.5, far / WALK_SPEED);
  });
  return { frames: legs, length: legs.reduce((a, l) => a + l.hold + l.walk, 0), gate };
}

// The way from a to b: straight, or by the runway's root when one end is out on it.
function pathOf(a, b, gate) {
  const pts = gate && (a.z > gate.front) !== (b.z > gate.front) ? [a, gate, b] : [a, b];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { pts, len };
}

// Where walker `w` of a group plan is `t` seconds in: standing at a keyframe, or on the way
// to the next one.
export function planAt(P, w, t) {
  let r = ((Math.max(0, t) % P.length) + P.length) % P.length;
  for (let i = 0; i < P.frames.length; i++) {
    const f = P.frames[i], g = P.frames[(i + 1) % P.frames.length], a = f.at[w], b = g.at[w];
    if (r < f.hold) return { x: a.x, z: a.z, y: a.y, step: 0, face: f.face, dx: 0, dz: 0 };
    r -= f.hold;
    if (r < f.walk) {
      const u = r / f.walk, e = smooth(u), { pts, len } = pathOf(a, b, P.gate);
      let d = e * len, j = 1;
      for (; j < pts.length - 1; j++) { const s = Math.hypot(pts[j].x - pts[j - 1].x, pts[j].z - pts[j - 1].z); if (d <= s) break; d -= s; }
      const p0 = pts[j - 1], p1 = pts[j], s = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1, q = Math.min(1, d / s);
      return { x: p0.x + (p1.x - p0.x) * q, z: p0.z + (p1.z - p0.z) * q, y: a.y + (b.y - a.y) * e, step: Math.min(1, 6 * u * (1 - u)), face: g.face, dx: p1.x - p0.x, dz: p1.z - p0.z };
    }
    r -= f.walk;
  }
  const a = P.frames[0].at[w];
  return { x: a.x, z: a.z, y: a.y, step: 0, face: P.frames[0].face, dx: 0, dz: 0 };
}

// The point `d` metres along a stage route (round and round), and the way it is going.
export function routeAt(R, d) {
  const L = R.length;
  let s = ((d % L) + L) % L, i = 0;
  while (i < R.pts.length - 1 && R.cum[i + 1] <= s) i++;
  const a = R.pts[i], b = R.pts[(i + 1) % R.pts.length], seg = R.cum[i + 1] - R.cum[i] || 1, f = (s - R.cum[i]) / seg;
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, dx: b[0] - a[0], dz: b[1] - a[1] };
}

// How far along its route the group is `t` seconds into the walk, and how much in its stride
// (0 standing, 1 full pace): from one stop to the next at an easy walk, then a pause to sing.
export const WALK_SPEED = 1.4, WALK_PAUSE = 4.5;
export function walkAt(R, t) {
  const S = R.stops?.length ? R.stops : [0], L = R.length;
  const legs = S.map((s, i) => { const len = ((i + 1 < S.length ? S[i + 1] : S[0] + L) - s); return { s, len, walk: Math.max(1.2, len / WALK_SPEED) }; });
  const T = legs.reduce((a, l) => a + l.walk + WALK_PAUSE, 0);
  if (t <= 0) return { d: S[0], step: 0, stopped: true };
  let r = t % T;
  const lap = Math.floor(t / T) * L;
  for (const l of legs) {
    // The pause comes first: at this stop, singing.
    if (r < WALK_PAUSE) return { d: lap + l.s, step: 0, stopped: true };
    r -= WALK_PAUSE;
    if (r < l.walk) {
      const u = r / l.walk;
      return { d: lap + l.s + l.len * smooth(u), step: Math.min(1, 6 * u * (1 - u)), stopped: false };
    }
    r -= l.walk;
  }
  return { d: lap + L + S[0], step: 0, stopped: true };
}

export class Band {
  constructor(scene, material, lineup, { y = 1.8, front = -34, riserY = 2.4, riserZ = -44, risers = false, spread = 1, deckHalf = null, deckDepth = null, runway = null, runwayDy = 0, round = null, rnd = Math.random } = {}) {
    this.scene = scene;
    // Out on a runway the deck may be lower or higher than the stage's (runwayDy, metres).
    this.front = front;
    this.runwayDy = round ? 0 : runwayDy;
    this.material = material;
    this.group = new THREE.Group();
    scene.add(this.group);
    const spots = round ? this._placeRound(lineup, y, round) : this._place(lineup, { y, front, riserY, riserZ, spread });
    this.spots = spots;
    // The walk round the stage (setRoam): who walks it (walkersOf), where each stands in the
    // group (formation, an end stage) and the way round the deck.
    this.walkers = walkersOf(spots);
    this.offsets = formation(this.walkers.length);
    const half = this.offsets.reduce((a, [x]) => Math.max(a, Math.abs(x)), 0);
    this.route = stageRoute(round ? { round } : { front, spread, deckHalf, deckDepth, riserZ, half, runway });
    this.round = !!round;
    // Two walkers or more split up across the stage and come together (groupPlan).
    this.plan = this.walkers.length >= 2 ? groupPlan(this.walkers.length, this.route, round) : null;
    this.roam = false;
    // A stage without band risers of its own gets them under the drums and keys.
    if (risers) {
      const mat = new THREE.MeshLambertMaterial({ color: '#08080a' });
      for (const [x, w] of [[0, 6], [-8, 5], [8, 5]]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(w * spread, riserY - y, 3), mat);
        r.position.set(x * spread, (riserY + y) / 2, riserZ);
        this.group.add(r);
      }
    }
    if (!round) this._gear(spots);
    loadBody().then(lods => {
      if (this.disposed) return;
      const n = spots.length;
      const geo = bodyGeometry(lods[0], true, true);
      for (const name of ['aAnim', 'aCol', 'aLook']) geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
      const mesh = new THREE.InstancedMesh(geo, material, n);
      mesh.frustumCulled = false;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      const pick = list => list[Math.floor(rnd() * list.length)];
      const hex = h => parseInt(h.slice(1), 16);
      spots.forEach((p, k) => {
        q.setFromAxisAngle(up, Math.PI + p.turn);
        const h = (p.female ? 1.02 : 1.04) + rnd() * 0.04;
        p.h = h;
        m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(h, h, h));
        mesh.setMatrixAt(k, m);
        const act = { vocals: ACT.sing, 'vocals-guitar': ACT.guitar, guitar: ACT.guitar, bass: ACT.guitar, drums: ACT.drums, keys: ACT.keys, dancer: ACT.routine }[p.role];
        // Everyone on the beat: the band together, a dance group exactly in step.
        geo.attributes.aAnim.array.set([act, p.role === 'dancer' ? 0 : rnd() * 0.3, p.role === 'drums' ? 1 : 0.5, 1], k * 4);
        const style = p.female ? (rnd() < 0.6 ? STYLE.long : STYLE.bun) : (rnd() < 0.7 ? STYLE.short : STYLE.long);
        const shirt = pick(STAGE_WEAR);
        geo.attributes.aCol.array.set([hex(shirt), hex(pick(SKINS)), hex(pick(HAIRS)), hex(pick(['#0c0c0e', '#16171b', '#22252c', '#2c3a52']))], k * 4);
        const flags = style + (rnd() < 0.5 ? 8 : 0) + (p.seated ? 0 : 16) + (p.female ? 32 : 0);
        geo.attributes.aLook.array.set([flags, 0.6, 0, rnd() * 0.3], k * 4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.mesh = mesh;
      this.group.add(mesh);
    });
  }

  // 3D Pass Plus: the act walks the stage. In a band only the singer goes, out to the
  // corners of the deck and up the wings; a group without instruments goes together, in
  // its formation, and round a 360 stage one behind the other out to every runway's end.
  // They stop at each corner to sing to that side. Off, everyone is back on their own spot.
  // The band's own clock (seconds) drives it, from SeatScene's tick.
  setRoam(on) {
    const was = this.roam;
    this.roam = !!on && this.route.length > 0 && this.walkers.length > 0;
    if (this.roam && !was) this.t0 = null;
    if (!this.roam) this._home();
  }

  // Where walker `i` of the group is `t` seconds into the walk, which way it faces, and how
  // much in its stride.
  walkerAt(i, t) {
    if (this.plan) {
      const p = planAt(this.plan, i, t);
      // Standing: to the crowd (an end stage, a little in toward its middle) or out from the
      // middle (a 360 stage); walking, the way they go.
      const out = p.face === 'out' ? Math.atan2(p.x, p.z) : Math.atan2(-p.x, 40);
      const along = p.step > 0 ? Math.atan2(p.dx, p.dz) : out;
      return { x: p.x, z: p.z, y: this.round ? p.y : this._runwayY(p.z), turn: out + angleDiff(out, along) * Math.min(1, p.step * 1.6), step: p.step };
    }
    const R = this.route, w = walkAt(R, t);
    if (R.mode === 'line') {
      // One behind the other, a couple of paces apart.
      const at = routeAt(R, w.d - i * 1.9);
      const out = Math.atan2(at.x, at.z), along = Math.atan2(at.dx, at.dz);
      return { x: at.x, z: at.z, turn: out + angleDiff(out, along) * Math.min(1, w.step * 1.6), step: w.step };
    }
    const at = routeAt(R, w.d), [ox, oz] = this.offsets[i];
    let x = at.x + ox, z = at.z + oz, dx = at.dx, dz = at.dz;
    // Out along a runway the group goes one behind the other, then spreads out again once
    // the last of them is back on the deck.
    if (R.file) {
      const GAP = 1.6, back = (this.walkers.length - 1) * GAP, s = ((w.d % R.length) + R.length) % R.length;
      const [a, b] = R.file;
      const f = s < a ? 0 : s < a + 3 ? smooth((s - a) / 3) : s < b + back ? 1 : s < b + back + 3 ? 1 - smooth((s - b - back) / 3) : 0;
      if (f > 0) {
        const me = routeAt(R, w.d - i * GAP);
        // Keeping to the right on the runway, so the way out and the way back pass each other.
        const zC = R.pts[4][1], zT = R.pts[5][1], dl = Math.hypot(me.dx, me.dz) || 1;
        const lane = 0.5 * Math.max(0, Math.min(1, (zT - me.z) / 1.5, (me.z - zC) / 1.5));
        me.x += (me.dz / dl) * lane; me.z -= (me.dx / dl) * lane;
        x += (me.x - x) * f; z += (me.z - z) * f;
        if (f > 0.5) { dx = me.dx; dz = me.dz; }
      }
    }
    // Standing: to the crowd, a little in toward its middle from a corner.
    const out = Math.atan2(-x, 40), along = Math.atan2(dx, dz);
    return { x, z, y: this._runwayY(z), turn: out + angleDiff(out, along) * Math.min(1, w.step * 1.6), step: w.step };
  }

  update(t) {
    const mesh = this.mesh;
    if (!this.roam || !mesh) return;
    // Turned on: everyone walks over from their own spot to their place in the group first,
    // then the walk starts from the middle of the stage.
    if (this.t0 == null) this.t0 = t;
    const GATHER = 2.5, g0 = Math.min(1, (t - this.t0) / GATHER), gather = smooth(g0);
    const tw = t - this.t0 - GATHER;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const look = mesh.geometry.attributes.aLook;
    this.walkers.forEach((k, i) => {
      const p = this.spots[k], at = this.walkerAt(i, Math.max(0, tw));
      const far = Math.hypot(at.x - p.x, at.z - p.z) > 0.3;
      const step = gather < 1 ? (far ? Math.min(1, 4 * g0 * (1 - g0) + 0.3) : 0) : at.step;
      const turn = gather < 1 ? (far ? Math.atan2(at.x - p.x, at.z - p.z) : p.turn) : at.turn;
      q.setFromAxisAngle(up, Math.PI + turn);
      pos.set(p.x + (at.x - p.x) * gather, p.y + (at.y || 0) * gather, p.z + (at.z - p.z) * gather);
      sc.setScalar(p.h || 1.04);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(k, m);
      look.array[k * 4 + 1] = 1 + step;
    });
    mesh.instanceMatrix.needsUpdate = true;
    look.needsUpdate = true;
  }

  // Everyone back on their own spot, standing still.
  // Off the front edge of an end stage, out on its runway: that deck's height.
  _runwayY(z) { return this.runwayDy && z > (this.front ?? 0) + 0.05 ? this.runwayDy : 0; }

  _home() {
    const mesh = this.mesh;
    if (!mesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), look = mesh.geometry.attributes.aLook;
    for (const k of this.walkers) {
      const p = this.spots[k];
      q.setFromAxisAngle(up, Math.PI + p.turn);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3().setScalar(p.h || 1.04));
      mesh.setMatrixAt(k, m);
      look.array[k * 4 + 1] = 0.6;
    }
    mesh.instanceMatrix.needsUpdate = true;
    look.needsUpdate = true;
  }

  // A 360 stage (BTS): the line-up in a ring round the lift, facing out.
  _placeRound(lineup, y, { half }) {
    // Just outside the lift in the middle, on the deck.
    const r = Math.min(half - 3, 7.6);
    return lineup.map((m, i) => {
      const a = (i / lineup.length) * Math.PI * 2 + Math.PI / 4;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      return { ...m, role: m.role === 'drums' || m.role === 'keys' ? 'dancer' : m.role, x, y: y + STAND_LIFT_LOCAL, z, turn: a };
    });
  }

  // Where each member stands: singers and dancers along the front, guitars and bass at the
  // sides, drums on the middle riser, keys on a side riser. `spread` narrows the band to a
  // stage smaller than the 36 m one these are set out for.
  _place(lineup, { y, front, riserY, riserZ, spread = 1 }) {
    const out = [];
    const frontLine = lineup.filter(m => ['vocals', 'vocals-guitar', 'dancer'].includes(m.role));
    // A dance group, or any front line too long for one row, stands in two.
    const dancers = (frontLine.every(m => m.role === 'dancer') && frontLine.length > 4) || frontLine.length > 6;
    const rows = dancers ? [frontLine.slice(0, Math.ceil(frontLine.length / 2)), frontLine.slice(Math.ceil(frontLine.length / 2))] : [frontLine];
    rows.forEach((row, r) => {
      const gapX = row.length > 3 ? 2.1 : 2.6;
      row.forEach((m, i) => out.push({ ...m, x: (i - (row.length - 1) / 2) * gapX + (r ? gapX / 2 : 0), y: y + STAND_LIFT_LOCAL, z: front - 3.2 - r * 1.9, turn: 0 }));
    });
    const strings = lineup.filter(m => m.role === 'guitar' || m.role === 'bass');
    const sideX = [-6.4, 6.4, -9.6, 9.6].map(x => x * Math.max(spread, 0.7));
    strings.forEach((m, i) => out.push({ ...m, x: sideX[i % 4], y: y + STAND_LIFT_LOCAL, z: front - 4.6 * Math.max(spread, 0.85), turn: (sideX[i % 4] < 0 ? 0.25 : -0.25) }));
    lineup.filter(m => m.role === 'keys').forEach((m, i) => {
      const x = (i % 2 ? 8 : -8) * spread;
      out.push({ ...m, x, y: riserY + STAND_LIFT_LOCAL, z: riserZ - 0.2, turn: x < 0 ? 0.35 : -0.35 });
    });
    lineup.filter(m => m.role === 'drums').forEach((m, i) => out.push({ ...m, seated: true, x: i ? 4 * spread : 0, y: riserY + 0.55 - 0.48, z: riserZ - 0.75, turn: 0 }));
    return out;
  }

  // Microphone stands, amplifiers, monitors, the drum kit and keyboards: plain shapes.
  _gear(spots) {
    // Matte (Lambert) for the gear: under the stage wash a glossy black would read grey.
    const metal = new THREE.MeshLambertMaterial({ color: '#0a0a0b' });
    const black = new THREE.MeshLambertMaterial({ color: '#050506' });
    const shell = new THREE.MeshLambertMaterial({ color: '#2a0709' });
    const brass = new THREE.MeshStandardMaterial({ color: '#6a5222', roughness: 0.35, metalness: 0.9 });
    const head = new THREE.MeshLambertMaterial({ color: '#3a3833' });
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; this.group.add(m); return m; };
    for (const p of spots) {
      const floorY = p.seated ? p.y + 0.48 - 0.55 : p.y - STAND_LIFT_LOCAL;
      const tz = p.z + 0.0;
      if (p.role === 'vocals-guitar' || p.role === 'guitar' || p.role === 'bass') {
        // A stand with its microphone at the mouth.
        const sz = tz + 0.42 * Math.cos(p.turn), sx = p.x + 0.42 * Math.sin(p.turn);
        add(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 12), metal, sx, floorY + 0.01, sz);
        add(new THREE.CylinderGeometry(0.012, 0.012, 1.55, 6), metal, sx, floorY + 0.78, sz);
        add(new THREE.SphereGeometry(0.03, 8, 6), metal, sx, floorY + 1.6, sz - 0.03);
        // The amp behind.
        if (p.role !== 'vocals-guitar') {
          add(new THREE.BoxGeometry(0.78, 0.78, 0.38), black, p.x, floorY + 0.39, tz - 1.5);
          add(new THREE.BoxGeometry(0.78, 0.26, 0.3), black, p.x, floorY + 0.92, tz - 1.5);
        }
      }
      if (!p.seated && p.role !== 'keys') {
        // A wedge monitor in front.
        const w = add(new THREE.BoxGeometry(0.62, 0.32, 0.45), black, p.x, floorY + 0.16, tz + 1.35);
        w.rotation.x = -0.45;
      }
      if (p.role === 'keys') {
        add(new THREE.BoxGeometry(1.25, 0.09, 0.36), black, p.x, floorY + 0.92, tz + 0.42);
        add(new THREE.BoxGeometry(1.15, 0.012, 0.14), head, p.x, floorY + 0.97, tz + 0.36);
        for (const sx of [-0.45, 0.45]) {
          const leg = add(new THREE.BoxGeometry(0.04, 0.9, 0.04), metal, p.x + sx, floorY + 0.45, tz + 0.42);
          leg.rotation.x = 0.35;
          const leg2 = add(new THREE.BoxGeometry(0.04, 0.9, 0.04), metal, p.x + sx, floorY + 0.45, tz + 0.42);
          leg2.rotation.x = -0.35;
        }
      }
      if (p.role === 'drums') {
        const fy = floorY;   // the riser's top
        const kick = add(new THREE.CylinderGeometry(0.28, 0.28, 0.42, 20), shell, p.x, fy + 0.29, tz + 0.95);
        kick.rotation.x = Math.PI / 2;
        add(new THREE.CylinderGeometry(0.27, 0.27, 0.005, 20).rotateX(Math.PI / 2), head, p.x, fy + 0.29, tz + 1.165);
        add(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 16), head, p.x - 0.18, fy + 0.62, tz + 0.5);
        for (const [dx, r, h, dz] of [[-0.14, 0.13, 0.18, 0.78], [0.16, 0.14, 0.2, 0.8]]) {
          const t = add(new THREE.CylinderGeometry(r, r, h, 14), shell, p.x + dx, fy + 0.78, tz + dz);
          t.rotation.x = 0.35;
        }
        add(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 16), shell, p.x + 0.45, fy + 0.4, tz + 0.45);
        for (const [dx, h, dz, r] of [[-0.5, 1.05, 0.55, 0.18], [-0.45, 1.45, 0.95, 0.24], [0.55, 1.5, 0.95, 0.26], [0.75, 1.3, 0.55, 0.22]]) {
          add(new THREE.CylinderGeometry(0.008, 0.008, h, 5), metal, p.x + dx, fy + h / 2, tz + dz);
          const c = add(new THREE.CylinderGeometry(r, r * 0.95, 0.008, 18), brass, p.x + dx, fy + h, tz + dz);
          c.rotation.x = 0.18;
        }
        add(new THREE.CylinderGeometry(0.18, 0.2, 0.08, 12), black, p.x, p.y + 0.44, p.z + 0.02);
        add(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), metal, p.x, fy + 0.25, p.z + 0.02);
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.mesh?.geometry.dispose();
    this.scene.remove(this.group);
  }
}
