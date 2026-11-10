// 3D seat viewer: renderer, lighting moods, seats and crowd, picking, and the
// "walk to the seat, turn round, sit down" camera move.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildConcert, buildCinema, buildCombat, buildStadium, prepareVenue, preparePoster, posterArt, seatGeometry, crowdGeometries, nearGeometries, mats } from './venues3d.js';

const SEATED_EYE = 1.2;
const STANDING_EYE = 1.72;
const STAND_LIFT = 0.42;   // a standing person's hips sit this much higher than a seated one's
const SEAT_FOV = 50;
const MAP_FOV = 42;

// Seat-map palette: neutral seats, one accent for the visitor's own seat.
const MAP = {
  free: new THREE.Color('#f2f1ed'),
  dim: new THREE.Color('#5b5a56'),
  mine: new THREE.Color('#ff5a1f'),
  hover: new THREE.Color('#121214'),
};

// Treads under zone-coloured seats: concrete in the seat view, faded when filtered out.
// Without zone colours the treads keep their concrete material: white leaves it as it is, `shade` darkens it.
const STEP = { concrete: new THREE.Color('#9a9994'), dim: new THREE.Color('#6a6965'), plain: new THREE.Color('#ffffff'), shade: new THREE.Color('#3d3c39') };

const TAG_POS = new THREE.Vector3();

// The last touch of a camera: corners a little darker and a trace of grain. `uAmount` is 0
// for venues that do not ask for it.
const LensShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmount, uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uAmount * 0.3 * smoothstep(0.3, 1.0, dot(d, d) * 2.0);
      c.rgb += (h(gl_FragCoord.xy) - 0.5) * 0.035 * uAmount;
      gl_FragColor = c;
    }`,
};

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = t => 1 - (1 - t) ** 3;
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const BUILDERS = { concert: buildConcert, cinema: buildCinema, combat: buildCombat, stadium: buildStadium };

export class SeatScene {
  // maxLevel and fps keep a decorative scene (the home page hero) cheap: it never asks for
  // more than that quality level or frame rate, whatever the device could do. `drift`: how
  // far (radians) a seat view slowly looks round on its own, so a still shot feels alive.
  constructor(container, { onHover, onSelect, onMode, onArrive, quality = 'auto', labels = true, interactive = true, maxLevel = 2, fps = 60, drift = 0 } = {}) {
    this.container = container;
    this.cb = { onHover, onSelect, onMode, onArrive };
    this.labelsOn = labels;
    this.labelsShown = true;
    this.interactive = interactive;
    this.drift = drift;
    this.lens = { at: 0, to: 0 };   // see setShift
    this.frameGap = 1000 / fps;
    this.lastFrame = 0;
    this.ready = false;
    this.running = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'scene-canvas';
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'scene-labels';
    container.appendChild(this.labelRenderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(MAP_FOV, 1, 0.1, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = 1.36;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.8;
    this.controls.screenSpacePanning = false;
    this.controls.enabled = interactive;

    this.clock = new THREE.Clock();
    this.mode = 'overview';
    this.anim = null;
    this.look = { yaw: 0, pitch: 0, cy: 0, cp: 0, baseYaw: 0, basePitch: 0, fov: SEAT_FOV };
    this.hovered = -1;
    this.current = -1;
    this.mine = new Set();
    this.occupied = new Set();
    this.filterCat = null;
    this.showCrowd = true;

    this.qualityMode = quality;
    this.level = Math.min(maxLevel, quality === 'low' ? 0 : quality === 'medium' ? 1 : 2);
    this.perf = { frames: 0, time: 0, checks: 0 };
    this._applyQuality();

    if (interactive) this._bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    // Nothing is drawn while the canvas is scrolled out of view or its page is hidden.
    this.onScreen = true;
    this.intersection = new IntersectionObserver(([e]) => { this.onScreen = e.isIntersecting; this._loop(); });
    this.intersection.observe(container);
    this._loop();
  }

  _loop() {
    const run = this.onScreen && !this.disposed;
    if (run === this.running) return;
    this.running = run;
    if (run) this.clock.getDelta();   // a pause is not elapsed animation time
    this.renderer.setAnimationLoop(run ? now => this.frame(now) : null);
  }

  // ---------- builder context ----------

  mood(target, key, house, live) {
    this.rig.push({ target, key, house, live });
    target[key] = house + (live - house) * this.moodValue;
  }

  onTick(fn) { this.ticks.push(fn); }

  cutaway(obj) { this.cutaways.push(obj); obj.visible = this.moodValue > 0.5; }

  setAtmosphere({ house, live, fogNear, fogFar, exposure = [1, 1], sky = false, bloom = 0.5, lens = 0 }) {
    this.atmo = { house: new THREE.Color(house), live: new THREE.Color(live), fogNear, fogFar, exposure, sky, bloom, lens };
    if (!sky) this.scene.background = new THREE.Color(house);
    if (fogNear) this.scene.fog = new THREE.Fog(house, fogNear[0], fogFar[0]);
  }

  addKeyLight({ pos, target, half, house, live, size = 2048 }) {
    const l = new THREE.DirectionalLight('#ffffff', house);
    l.position.set(...pos);
    l.target.position.set(...target);
    l.castShadow = true;
    if (this.level < 2) size /= 2;
    l.shadow.mapSize.set(size, size);
    const c = l.shadow.camera;
    c.left = c.bottom = -half; c.right = c.top = half;
    c.near = 1; c.far = Math.hypot(...pos) + half * 2;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.03;
    this.mood(l, 'intensity', house, live);
    this.scene.add(l, l.target);
    this.keyLight = l;
    return l;
  }

  // ---------- lifecycle ----------

  // Resolves true once the venue is built and its shaders are compiled, false if the scene
  // was disposed or asked for another venue meanwhile. `occupied`: seats with a person in them.
  async load(venue, occupied) {
    const token = this.loadToken = {};
    await Promise.all([prepareVenue(venue.kind), preparePoster(venue.meta)]);
    if (this.disposed || this.loadToken !== token) return false;
    this.ready = this.shown = false;
    this.container.classList.remove('scene-ready');
    this.disposeScene();
    this.venue = venue;
    this.occupied = new Set(occupied);
    this.mine = new Set();
    this.hovered = this.current = -1;
    this.mode = 'overview';
    this.anim = null;
    this.ticks = [];
    this.rig = [];
    this.cutaways = [];
    this.moodValue = 0;
    this.moodTarget = 0;
    this.realColors = false;
    this._savedCrowd = null;
    // A venue drawn from a seller's plan shows each free seat in its category's colour there.
    this.zones = venue.zoneColors ? Object.fromEntries(venue.categories.map(c => [c.id, new THREE.Color(c.color)])) : null;
    this.scene = new THREE.Scene();
    this.scene.environment = this.envMap;
    this.focus = new THREE.Vector3(...venue.focus);

    BUILDERS[venue.kind](this, venue);
    this.buildSeats(venue);
    this.buildLabels(venue);

    // Reflections fade out with the house lights so the show reads dark.
    this.scene.traverse(o => {
      if (o.isMesh && o.material?.isMeshStandardMaterial && !o.material.userData.envMood) {
        o.material.userData.envMood = true;
        this.mood(o.material, 'envMapIntensity', o.material.envMapIntensity * 0.55, 0.06);
      }
      if (o.isMesh && !o.userData.noShadow) o.receiveShadow = true;
    });
    this._applyQuality();

    const o = venue.overview;
    this.controls.target.set(...o.target);
    const aspect = this.camera.aspect || 1;
    const pull = aspect < 1.2 ? Math.min(2.2, (1.2 / aspect) ** 0.8) : 1;
    this.camera.position.set(...o.pos).sub(this.controls.target).multiplyScalar(pull * 1.08).add(this.controls.target);
    this.controls.minDistance = o.min;
    this.controls.maxDistance = o.max * pull;
    this.controls.enabled = this.interactive;
    this.camera.fov = MAP_FOV;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this._applyMood(0);
    this.perf = { frames: 0, time: 0, checks: 0 };
    await this._compile();
    if (this.disposed || this.loadToken !== token) return false;
    this.cb.onMode?.('overview');
    return true;
  }

  // Compiles every shader in the background (KHR_parallel_shader_compile) instead of
  // freezing the page on the first frame. Frames are held until it is done; the canvas
  // keeps showing the last one meanwhile.
  async _compile() {
    this.ready = false;
    if (this.renderer.extensions.has('KHR_parallel_shader_compile')) {
      try { await this.renderer.compileAsync(this.scene, this.camera); } catch { /* compiles on the first frame instead */ }
    }
    if (this.disposed || !this.scene) return;
    if (this.pendingRatio) {
      this.renderer.setPixelRatio(this.pendingRatio);
      this.pendingRatio = 0;
      this.resize();
    }
    this.ready = true;
  }

  disposeScene() {
    this.photoToken = null;
    if (!this.scene) return;
    this.scene.traverse(o => {
      if (o.isCSS2DObject) o.element.remove();
      o.geometry?.dispose();
      const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      list.forEach(m => {
        m.map?.dispose();
        // Screen artwork lives in shader uniforms, which dispose() leaves on the GPU.
        for (const u of Object.values(m.uniforms || {})) if (u.value?.isTexture) u.value.dispose();
        m.dispose();
      });
    });
    this.scene = null;
  }

  dispose() {
    this.disposed = true;
    this._loop();
    this.intersection.disconnect();
    this.resizeObserver.disconnect();
    this.container.classList.remove('scene-ready');
    this._unbind?.();
    this.disposeScene();
    this.composer?.dispose();
    this.controls.dispose();
    this.envMap.dispose();
    this.renderer.dispose();
    // Frees the GPU context now rather than at garbage collection: browsers allow only a
    // few at a time, and the hero and the viewer each make one per visit.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
    this.labels?.forEach(l => { l.userData.box = null; });
    if (this.tagView) this.tagView.ok = false;
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this._lens();
    this.camera.updateProjectionMatrix();
    if (this.fit && this.mode === 'seat') this.look.fov = this._fitFov();
  }

  // Moves the picture up by `k` of its height, as a shift lens would, with the camera kept
  // level: the hero's card covers the bottom of its canvas, so what the camera looks at
  // belongs in the middle of the part left open. Eases there once the 3D is showing.
  setShift(k) {
    this.lens.to = k;
    if (!this.shown) this.lens.at = k;
    this._lens();
  }

  _lens() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    if (this.lens.at) this.camera.setViewOffset(w, h, 0, h * this.lens.at, w, h);
    else this.camera.clearViewOffset();
  }

  // Puts another show's poster on the stage screens and keeps everything else, so the home
  // page hero changes show without building a venue again. Resolves false when the poster
  // could not load, the scene went, or a later call took over.
  async setPoster(meta) {
    const token = this.posterToken = {};
    await preparePoster(meta);
    if (this.disposed || !this.scene || this.posterToken !== token) return false;
    const made = new Map(), old = new Set();
    this.scene.traverse(o => {
      const u = o.material?.uniforms?.uTex;
      const aspect = u?.value?.userData.screen;
      if (!aspect) return;
      if (!made.has(aspect)) made.set(aspect, posterArt(meta, aspect));
      if (!made.get(aspect)) return;
      old.add(u.value);
      u.value = made.get(aspect);
    });
    old.forEach(t => t.dispose());
    return [...made.values()].some(Boolean);
  }

  // ---------- quality ----------

  // With `defer`, the new pixel ratio waits for the recompiled shaders, so a downgrade
  // never shows a cleared canvas.
  _applyQuality({ defer = false } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const lv = this.level;
    const ratio = lv === 2 ? Math.min(dpr, 1.5) : lv === 1 ? Math.min(dpr, 1.25) : 1;
    const shadows = lv >= 1;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene?.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
    }
    // Image-based reflections are the costliest per-pixel term; weak devices get the hemisphere lights only.
    if (this.scene) {
      const env = lv === 0 ? null : this.envMap;
      if (this.scene.environment !== env) {
        this.scene.environment = env;
        this.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
      }
    }
    const heavyCast = lv === 2 && (this.venue?.seats.length || 0) < 40000;
    [this.seatMesh, this.bodyMesh, this.standMesh, this.headMesh, this.hairMesh].forEach(m => { if (m) m.castShadow = heavyCast; });
    if (lv >= 1 && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(null, this.camera);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.85);
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.lensPass = new ShaderPass(LensShader);
      this.composer.addPass(this.lensPass);
    }
    if (defer) { this.pendingRatio = ratio; return; }
    this.renderer.setPixelRatio(ratio);
    this.resize();
  }

  _watchPerf(dt) {
    if (this.qualityMode !== 'auto' || this.level === 0 || this.anim) return;
    const p = this.perf;
    p.frames++;
    if (p.frames < 30) return;
    p.time += dt;
    if (p.frames < 120) return;
    const avg = p.time / (p.frames - 30);
    // Step down when frames run 30% over the target interval.
    if (avg > 1.3 * this.frameGap / 1000) { this.level--; this._applyQuality({ defer: true }); this._compile(); }
    this.perf = { frames: 0, time: 0, checks: p.checks + 1 };
    if (this.perf.checks > 3) this.qualityMode = 'settled';
  }

  // ---------- seats & crowd ----------

  buildSeats(venue) {
    const seats = venue.seats, n = seats.length;
    const style = venue.seatStyle;
    const seatMat = style === 'cinema'
      ? new THREE.MeshPhysicalMaterial({ roughness: 0.85, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff8a8a') })
      : new THREE.MeshStandardMaterial({ roughness: style === 'shell' ? 0.38 : 0.82, metalness: 0.0 });
    this.seatMesh = new THREE.InstancedMesh(seatGeometry(style), seatMat, n);
    this.seatMesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    // A standing spot is the seat squashed flat: a coloured floor marker that still picks.
    const flat = new THREE.Vector3(0.95, 0.05, 0.95);
    this.seatPos = new Float32Array(n * 3);
    const raised = [];
    for (let i = 0; i < n; i++) {
      const s = seats[i];
      q.setFromAxisAngle(up, s.yaw);
      m.compose(v.set(s.x, s.y, s.z), q, s.standing ? flat : one);
      this.seatMesh.setMatrixAt(i, m);
      this.seatPos[i * 3] = s.x; this.seatPos[i * 3 + 1] = s.y + 0.55; this.seatPos[i * 3 + 2] = s.z;
      if (s.y > 0.05) raised.push(i);
    }
    this.seatMesh.instanceMatrix.needsUpdate = true;
    this.seatMesh.computeBoundingSphere();
    this.scene.add(this.seatMesh);

    // Stepped tiers under raked rows. With zone colours the treads take them too (white
    // material, tinted per instance), so blocks read as on the seller's plan.
    this.steps = null;
    if (raised.length && !venue.ownTiers) {
      const stepMat = venue.kind === 'cinema'
        ? new THREE.MeshStandardMaterial({ color: '#3a171d', roughness: 1 })
        : mats.concrete();
      if (this.zones) stepMat.color.set('#ffffff');
      const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stepMat, raised.length);
      if (venue.kind !== 'cinema') { this.steps = steps; this.stepSeat = raised; }
      raised.forEach((i, k) => {
        const s = seats[i];
        q.setFromAxisAngle(up, s.yaw);
        // A slab per tread rather than a column to the floor: same look, a fraction of the overdraw.
        const th = Math.min(s.y, 0.9);
        m.compose(v.set(s.x, s.y - th / 2, s.z), q, new THREE.Vector3(s.width + 0.04, th, s.rowDepth + 0.02));
        steps.setMatrixAt(k, m);
      });
      steps.receiveShadow = true;
      this.scene.add(steps);
    }

    // The crowd, on the occupied seats.
    this.lite = n > 40000;
    this.near = null;
    this.photo = this.photoToken = null;
    const g = crowdGeometries(this.lite);
    const takenIdx = [];
    for (let i = 0; i < n; i++) if (this.occupied.has(seats[i].id)) takenIdx.push(i);
    const cnt = takenIdx.length;
    this.bodyMesh = new THREE.InstancedMesh(g.body, new THREE.MeshStandardMaterial({ roughness: 0.92 }), cnt);
    this.headMesh = new THREE.InstancedMesh(g.head, new THREE.MeshStandardMaterial({ roughness: 0.6 }), cnt);
    this.hairMesh = new THREE.InstancedMesh(g.hair, new THREE.MeshStandardMaterial({ roughness: 0.75 }), cnt);
    // People on a standing floor: raised by STAND_LIFT, with legs down to the floor. Both body
    // meshes keep every crowd slot; the one that does not apply holds a zero-size instance.
    const standing = takenIdx.some(i => seats[i].standing);
    this.standMesh = standing ? new THREE.InstancedMesh(g.stand, this.bodyMesh.material, cnt) : null;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const palettes = {
      stadium: ['#c8102e', '#c8102e', '#b10e28', '#c8102e', '#f4f4f2', '#1b1c20', '#c8102e', '#2b3a55', '#e9e6df', '#c8102e'],
      concert: ['#16171b', '#1d1e22', '#f1efe9', '#2a2c33', '#4a4f5a', '#121214', '#d8d2c4', '#5b4636', '#1f2a3d', '#0f0f11'],
      default: ['#1b1d24', '#2c3140', '#e8e4dc', '#30455e', '#3d3a35', '#5a1f27', '#1f3a33', '#8a6a2c', '#26262b', '#6b6f78'],
    };
    const shirts = venue.crowd || palettes[venue.show ? 'concert' : venue.kind] || palettes.default;
    const skins = ['#8d5a3b', '#a86b47', '#c68a62', '#6e4630', '#b97c55', '#d9a07a'];
    const hair = ['#0f0b09', '#1c140f', '#2a1d14', '#0b0b0c', '#3b2a1c', '#151312'];
    const c = new THREE.Color();
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const raisedArms = [];
    const this_ = this;
    takenIdx.forEach((i, k) => {
      const s = seats[i];
      q.setFromAxisAngle(up, s.yaw + (rnd() - 0.5) * 0.35);
      const sc = 0.9 + rnd() * 0.2;
      m.compose(v.set(s.x + (rnd() - 0.5) * 0.04, s.y + (s.standing ? STAND_LIFT : 0), s.z), q, new THREE.Vector3(sc, sc, sc));
      this.bodyMesh.setMatrixAt(k, s.standing ? zero : m);
      this.standMesh?.setMatrixAt(k, s.standing ? m : zero);
      this.headMesh.setMatrixAt(k, m);
      this.hairMesh.setMatrixAt(k, m);
      this.bodyMesh.setColorAt(k, c.set(shirts[Math.floor(rnd() * shirts.length)]));
      this.standMesh?.setColorAt(k, c);
      this.headMesh.setColorAt(k, c.set(skins[Math.floor(rnd() * skins.length)]));
      this.hairMesh.setColorAt(k, c.set(hair[Math.floor(rnd() * hair.length)]));
      if ((venue.kind === 'concert' || venue.show) && rnd() < (s.standing ? 0.25 : 0.1)) raisedArms.push(m.clone());
    });
    this.crowdSlot = new Map(takenIdx.map((i, k) => [i, k]));
    this.crowd = [this.bodyMesh, this.standMesh, this.headMesh, this.hairMesh].filter(Boolean);
    if (raisedArms.length) {
      const arms = new THREE.InstancedMesh(g.raised, this.bodyMesh.material, raisedArms.length);
      arms.userData.liveOnly = true;
      raisedArms.forEach((mm, k) => { arms.setMatrixAt(k, mm); arms.setColorAt(k, c.set(skins[k % skins.length])); });
      // Arms only go up once the show starts.
      this.mood({ set on(v) { arms.visible = v > 0.5 && this_.showCrowd; } }, 'on', 0, 1);
      this.crowd.push(arms);
      // Phone screens in a few raised hands.
      const phones = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.13), new THREE.MeshBasicMaterial({ color: '#dfe8ff', toneMapped: false }), Math.ceil(raisedArms.length / 3));
      const pm = new THREE.Matrix4();
      for (let k = 0; k < phones.count; k++) {
        const base = raisedArms[k * 3];
        pm.makeTranslation(0.22, 1.62, -0.06).premultiply(base);
        phones.setMatrixAt(k, pm);
      }
      this.mood(phones.material, 'opacity', 0, 1);
      phones.material.transparent = true;
      this.crowd.push(phones);
    }
    this.crowd.forEach(mesh => { this.scene.add(mesh); mesh.visible = this.showCrowd && !mesh.userData.liveOnly; });

    this.realBase = new Float32Array(n * 3);
    const base = new THREE.Color(venue.seatColor);
    for (let i = 0; i < n; i++) {
      c.copy(venue.seatTint ? base.set(venue.seatTint(seats[i])) : base).offsetHSL(0, 0, (rnd() - 0.5) * 0.03);
      this.realBase.set([c.r, c.g, c.b], i * 3);
    }
    this.refreshColors();
  }

  buildLabels(venue) {
    const secs = new Map();
    for (const s of venue.seats) {
      const a = secs.get(s.sec) || { x: 0, z: 0, y: 0, n: 0, name: s.secName, code: s.sec };
      a.x += s.x; a.z += s.z; a.y = Math.max(a.y, s.y); a.n++;
      secs.set(s.sec, a);
    }
    this.labels = [];
    this.tagView = null;
    if (!this.labelsOn || secs.size < 2) return;
    for (const a of secs.values()) {
      const el = document.createElement('div');
      el.className = 'sec-tag';
      el.textContent = a.code.replace(/^(RS|CS)-/, '$1 ').replace(/^VIP-/, 'VIP ').replace(/^FA-/, 'FA ');
      const obj = new CSS2DObject(el);
      obj.position.set(a.x / a.n, a.y + 1.6, a.z / a.n);
      this.scene.add(obj);
      this.labels.push(obj);
    }
  }

  seatColor(i, out) {
    const s = this.venue.seats[i];
    if (this.realColors) {
      out.setRGB(this.realBase[i * 3], this.realBase[i * 3 + 1], this.realBase[i * 3 + 2]);
      if (this.mine.has(s.id)) out.lerp(MAP.mine, 0.8);
      if (i === this.hovered) out.lerp(MAP.free, 0.75);
      return out;
    }
    if (i === this.hovered) return out.copy(MAP.hover);
    if (this.mine.has(s.id)) return out.copy(MAP.mine);
    if (this.filterCat && this.filterCat !== s.cat) return out.copy(MAP.dim);
    return out.copy(this.zones?.[s.cat] || MAP.free);
  }

  refreshColors() {
    if (!this.seatMesh) return;
    const c = new THREE.Color();
    for (let i = 0; i < this.venue.seats.length; i++) this.seatMesh.setColorAt(i, this.seatColor(i, c));
    this.seatMesh.instanceColor.needsUpdate = true;
    this.near?.seatAt.forEach((k, i) => this.near.seat.setColorAt(k, this.seatColor(i, c)));
    if (this.near?.seat.instanceColor) this.near.seat.instanceColor.needsUpdate = true;
    if (this.steps) {
      const seats = this.venue.seats;
      this.stepSeat.forEach((i, k) => {
        const cat = seats[i].cat;
        const out = this.filterCat && this.filterCat !== cat && !this.realColors;
        this.steps.setColorAt(k, this.zones ? (this.realColors ? STEP.concrete : out ? STEP.dim : this.zones[cat]) : out ? STEP.shade : STEP.plain);
      });
      this.steps.instanceColor.needsUpdate = true;
    }
  }

  refreshSeat(i) {
    if (i < 0 || !this.seatMesh) return;
    this.seatMesh.setColorAt(i, this.seatColor(i, new THREE.Color()));
    this.seatMesh.instanceColor.needsUpdate = true;
    const k = this.near?.seatAt.get(i);
    if (k !== undefined) { this.near.seat.setColorAt(k, this.seatColor(i, new THREE.Color())); this.near.seat.instanceColor.needsUpdate = true; }
  }

  setMine(ids) { this.mine = new Set(ids); this.refreshColors(); }
  setFilter(cat) { this.filterCat = cat; this.refreshColors(); }

  setCrowd(on) {
    this.showCrowd = on;
    this.crowd?.forEach(m => { m.visible = on && (!m.userData.liveOnly || this.moodValue > 0.5); });
    this.near?.meshes.forEach(m => { if (m.userData.person) m.visible = on; });
  }

  setLabels(on) {
    this.labelsShown = on;
    this.labelRenderer.domElement.style.display = on ? '' : 'none';
  }

  // A tag that would cover a nearer one fades out, so a phone shows fewer, readable block
  // numbers instead of a pile; zooming in brings the rest back. Runs only when the camera
  // has moved since the last pass.
  _declutter() {
    const cam = this.camera, last = this.tagView ||= { m: new THREE.Matrix4(), p: new THREE.Matrix4(), ok: false };
    if (last.ok && last.m.equals(cam.matrixWorld) && last.p.equals(cam.projectionMatrix)) return;
    const { width, height } = this.labelRenderer.getSize();
    const v = TAG_POS, tags = [], shown = [];
    let measured = true;
    for (const l of this.labels) {
      if (!l.visible) continue;
      v.copy(l.position).project(cam);
      if (v.z < -1 || v.z > 1) continue;
      const el = l.element;
      l.userData.box ||= el.offsetWidth ? { w: el.offsetWidth / 2 + 2, h: el.offsetHeight / 2 + 1 } : null;
      if (l.userData.box) tags.push({ el, x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2, z: v.z, ...l.userData.box });
      else measured = false;
    }
    tags.sort((a, b) => a.z - b.z);
    for (const t of tags) {
      const hit = shown.some(s => Math.abs(s.x - t.x) < s.w + t.w && Math.abs(s.y - t.y) < s.h + t.h);
      t.el.classList.toggle('sec-tag-off', hit);
      if (!hit) shown.push(t);
    }
    last.m.copy(cam.matrixWorld);
    last.p.copy(cam.projectionMatrix);
    last.ok = measured;
  }

  resetView() {
    if (this.mode !== 'overview' || !this.scene) return;
    const o = this.venue.overview;
    const aspect = this.camera.aspect || 1;
    const pull = aspect < 1.2 ? Math.min(2.2, (1.2 / aspect) ** 0.8) : 1;
    const target = new THREE.Vector3(...o.target);
    const end = new THREE.Vector3(...o.pos).sub(target).multiplyScalar(pull * 1.08).add(target);
    const start = this.camera.position.clone(), t0 = this.controls.target.clone();
    this.controls.enabled = false;
    this.anim = {
      t: 0, dur: 1.2,
      step: t => {
        const k = ease(t / 1.2);
        this.camera.position.lerpVectors(start, end, k);
        this.controls.target.lerpVectors(t0, target, k);
        this.camera.lookAt(this.controls.target);
      },
      done: () => { this.controls.enabled = this.interactive; this.controls.update(); },
    };
  }

  _occupy(i, hidden) {
    const k = this.crowdSlot?.get(i);
    if (k === undefined) return;
    const meshes = [this.bodyMesh, this.standMesh, this.headMesh, this.hairMesh].filter(Boolean);
    if (hidden) {
      this._savedCrowd = { k, m: meshes.map(mesh => { const x = new THREE.Matrix4(); mesh.getMatrixAt(k, x); return x; }) };
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      meshes.forEach(mesh => mesh.setMatrixAt(k, zero));
    } else if (this._savedCrowd?.k === k) {
      meshes.forEach((mesh, j) => mesh.setMatrixAt(k, this._savedCrowd.m[j]));
    } else return;
    meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  }

  // ---------- near detail ----------

  // In a bowl too big to draw every person and seat in full, the ones within a few rows of
  // seat `i` are: their plain stand-ins are hidden and detailed ones put in their place.
  _buildNear(i) {
    this._clearNear();
    if (!this.lite || i < 0) return;
    const seats = this.venue.seats, me = seats[i], R = 11, zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const idx = [];
    for (let j = 0; j < seats.length; j++) {
      const s = seats[j], dy = s.y - me.y;
      if (Math.abs(dy) < 7 && (s.x - me.x) ** 2 + (s.z - me.z) ** 2 + dy * dy < R * R) idx.push(j);
    }
    const g = this.nearGeo ||= nearGeometries();
    const mesh = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = m.receiveShadow = true; this.scene.add(m); return m; };
    const env = this.seatMesh.material.envMapIntensity;
    const seat = mesh(g.seat, new THREE.MeshStandardMaterial({ roughness: 0.42, envMapIntensity: env }), idx.length);
    const frame = mesh(g.frame, new THREE.MeshStandardMaterial({ color: '#4b4f55', metalness: 0.6, roughness: 0.45, envMapIntensity: env }), idx.length);
    const seatAt = new Map(), saved = [], m = new THREE.Matrix4(), c = new THREE.Color();
    idx.forEach((j, k) => {
      this.seatMesh.getMatrixAt(j, m);
      seat.setMatrixAt(k, m); frame.setMatrixAt(k, m);
      seat.setColorAt(k, this.seatColor(j, c));
      saved.push([j, m.clone()]);
      this.seatMesh.setMatrixAt(j, zero);
      seatAt.set(j, k);
    });
    this.seatMesh.instanceMatrix.needsUpdate = true;
    const people = idx.filter(j => j !== i && this.crowdSlot.has(j));
    const cloth = () => new THREE.MeshStandardMaterial({ roughness: 0.9, envMapIntensity: env });
    const parts = {
      shirt: mesh(g.shirt, cloth(), people.length), skin: mesh(g.skin, new THREE.MeshStandardMaterial({ roughness: 0.62, envMapIntensity: env }), people.length),
      legs: mesh(g.legs, cloth(), people.length), hair: mesh(g.hair, new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: env }), people.length),
      hijab: mesh(g.hijab, cloth(), people.length),
    };
    const trousers = ['#1d2433', '#22252b', '#2f3b55', '#3a3632', '#15161a', '#4a4f5a'], scarves = ['#f1efe9', '#1b1c20', '#c8102e', '#d8c7b0', '#f1efe9', '#7a1f2b', '#3d4a5c'];
    const crowdSaved = [];
    people.forEach((j, k) => {
      const slot = this.crowdSlot.get(j), covered = (slot * 2654435761 >>> 0) % 100 < 22;
      this.bodyMesh.getMatrixAt(slot, m);
      crowdSaved.push([slot, m.clone()]);
      for (const p of Object.values(parts)) p.setMatrixAt(k, m);
      parts[covered ? 'hair' : 'hijab'].setMatrixAt(k, zero);
      this.bodyMesh.getColorAt(slot, c); parts.shirt.setColorAt(k, c);
      this.headMesh.getColorAt(slot, c); parts.skin.setColorAt(k, c);
      this.hairMesh.getColorAt(slot, c); parts.hair.setColorAt(k, c);
      parts.legs.setColorAt(k, c.set(trousers[slot % trousers.length]));
      parts.hijab.setColorAt(k, c.set(scarves[slot % scarves.length]));
      for (const far of [this.bodyMesh, this.headMesh, this.hairMesh]) far.setMatrixAt(slot, zero);
    });
    for (const far of [this.bodyMesh, this.headMesh, this.hairMesh]) far.instanceMatrix.needsUpdate = true;
    const meshes = [seat, frame, ...Object.values(parts)];
    meshes.forEach(x => { x.visible = x === seat || x === frame || this.showCrowd; x.userData.person = x !== seat && x !== frame; });
    this.near = { seat, seatAt, saved, crowdSaved, meshes };
  }

  _clearNear() {
    const n = this.near;
    if (!n) return;
    this.near = null;
    if (!this.scene) return;
    n.saved.forEach(([j, m]) => this.seatMesh.setMatrixAt(j, m));
    this.seatMesh.instanceMatrix.needsUpdate = true;
    for (const far of [this.bodyMesh, this.headMesh, this.hairMesh]) {
      n.crowdSaved.forEach(([slot, m]) => far.setMatrixAt(slot, m));
      far.instanceMatrix.needsUpdate = true;
    }
    n.meshes.forEach(x => { this.scene.remove(x); x.material.dispose(); });
  }

  // ---------- photo views ----------

  // The photo view that covers a seat: the nearest one taken on the same tier, if it is
  // within its `reach` (metres along the ground).
  _photoFor(seat) {
    let best = null, at = Infinity;
    for (const p of this.venue.photos || []) {
      const d = Math.hypot(seat.x - p.eye[0], seat.z - p.eye[2]);
      if (p.tier === seat.tier && d < p.reach && d < at) { best = p; at = d; }
    }
    return best;
  }

  // Hangs the picture in front of the seated camera, facing it, and fades it in over the
  // model. Looking round and zooming stay inside the picture (see frame()).
  _showPhoto(view, eye, ang) {
    this._hidePhoto();
    if (!view) return;
    const token = this.photoToken = {};
    new THREE.TextureLoader().load(view.src, tex => {
      if (this.photoToken !== token || !this.scene || this.mode !== 'seat') { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const aspect = tex.image.width / tex.image.height, d = 40, h = 2 * d * Math.tan(THREE.MathUtils.degToRad(view.fov / 2));
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false, depthTest: false, depthWrite: false, transparent: true, opacity: 0 }));
      mesh.rotation.set(ang.pitch, ang.yaw, 0, 'YXZ');
      mesh.position.copy(eye).add(new THREE.Vector3(0, 0, -d).applyEuler(mesh.rotation));
      mesh.renderOrder = 999;
      mesh.userData.noShadow = true;
      this.scene.add(mesh);
      this.photo = { mesh, halfV: THREE.MathUtils.degToRad(view.fov / 2), halfH: Math.atan(Math.tan(THREE.MathUtils.degToRad(view.fov / 2)) * aspect) };
    });
  }

  _hidePhoto() {
    this.photoToken = null;
    const p = this.photo;
    if (!p) return;
    this.photo = null;
    this.scene?.remove(p.mesh);
    p.mesh.material.map.dispose(); p.mesh.material.dispose(); p.mesh.geometry.dispose();
  }

  // ---------- picking ----------

  _bindPointer() {
    const el = this.renderer.domElement;
    let down = null, drag = null;
    const pick = e => {
      const r = el.getBoundingClientRect();
      return this.pickSeat(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1));
    };
    const onDown = e => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (this.mode === 'seat' && !this.anim) {
        drag = { x: e.clientX, y: e.clientY, yaw: this.look.yaw, pitch: this.look.pitch };
        el.setPointerCapture?.(e.pointerId);
      }
    };
    const onMove = e => {
      if (drag) {
        const k = (this.camera.fov / SEAT_FOV) * 0.0045;
        this.look.yaw = THREE.MathUtils.clamp(drag.yaw + (e.clientX - drag.x) * k, -1.9, 1.9);
        this.look.pitch = THREE.MathUtils.clamp(drag.pitch + (e.clientY - drag.y) * k, -0.7, 0.55);
      }
      if (e.pointerType === 'touch' || this.anim) return;
      this._lastMove = e;
      if (this._hoverQueued) return;
      this._hoverQueued = true;
      requestAnimationFrame(() => {
        this._hoverQueued = false;
        if (!this.scene || drag) return;
        this.setHover(pick(this._lastMove), this._lastMove);
      });
    };
    const onUp = e => {
      drag = null;
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (moved > 7 || !quick || this.anim) return;
      const i = pick(e);
      if (i >= 0) this.cb.onSelect?.(this.venue.seats[i]);
    };
    const onLeave = () => this.setHover(-1);
    const onWheel = e => {
      if (this.mode !== 'seat') return;
      e.preventDefault();
      this.zoomSeatView(e.deltaY * 0.03);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    this._unbind = () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
    };
  }

  // Ray versus seat centres: far cheaper than triangle tests on 15k instances.
  pickSeat(ndc) {
    if (!this.seatPos) return -1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction, P = this.seatPos;
    let best = -1, bestT = Infinity;
    for (let i = 0, n = P.length / 3; i < n; i++) {
      if (i === this.current && this.mode === 'seat') continue;
      const px = P[i * 3] - o.x, py = P[i * 3 + 1] - o.y, pz = P[i * 3 + 2] - o.z;
      const t = px * d.x + py * d.y + pz * d.z;
      if (t < 0.3 || t > bestT) continue;
      const dx = px - d.x * t, dy = py - d.y * t, dz = pz - d.z * t;
      const r = 0.3 + t * 0.0022;
      if (dx * dx + dy * dy + dz * dz < r * r) { bestT = t; best = i; }
    }
    return best;
  }

  setHover(i, e) {
    if (i === this.hovered) { if (i >= 0) this.cb.onHover?.(this.venue.seats[i], e); return; }
    const prev = this.hovered;
    this.hovered = i;
    this.refreshSeat(prev);
    this.refreshSeat(i);
    this.renderer.domElement.style.cursor = i >= 0 ? 'pointer' : '';
    this.cb.onHover?.(i >= 0 ? this.venue.seats[i] : null, e);
  }

  // ---------- camera moves ----------

  _angles(dir) {
    return { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) };
  }
  _lookAngles(from, to) { return this._angles(new THREE.Vector3().subVectors(to, from).normalize()); }
  _currentAngles() { return this._angles(this.camera.getWorldDirection(new THREE.Vector3())); }
  _applyAngles(yaw, pitch) { this.camera.rotation.set(pitch, yaw, 0, 'YXZ'); }

  flyToSeat(seat, { quick = false } = {}) {
    const i = this.venue.seatById.get(seat.id);
    if (i === undefined || !this.scene) return;
    this._hidePhoto();
    const view = this._photoFor(seat);
    this._clearNear();
    if (this.current >= 0) this._occupy(this.current, false);
    this.current = i;
    this._occupy(i, true);
    this._buildNear(i);
    this.setHover(-1);
    if (this.mode === 'overview') this.savedOverview = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.controls.enabled = false;
    this.mode = 'flying';
    this.cb.onMode?.('flying', seat);

    const seatBase = new THREE.Vector3(seat.x, seat.y, seat.z);
    const fwd = new THREE.Vector3(-Math.sin(seat.yaw), 0, -Math.cos(seat.yaw));
    // Arrive standing in the row in front of the seat, facing it; then turn round and sit.
    const stand = seatBase.clone().addScaledVector(fwd, 0.48).add(new THREE.Vector3(0, STANDING_EYE, 0));
    const chest = seatBase.clone().add(new THREE.Vector3(0, 0.7, 0));
    const eye = seatBase.clone().addScaledVector(fwd, -0.05).add(new THREE.Vector3(0, seat.standing ? SEATED_EYE + STAND_LIFT : SEATED_EYE, 0));

    const start = this.camera.position.clone();
    const startAng = this._currentAngles();
    const dist = start.distanceTo(stand);
    const lift = Math.min(22, 2 + dist * 0.3);
    const ctrl = start.clone().lerp(stand, 0.6).add(new THREE.Vector3(0, lift, 0));
    const startLook = start.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(Math.max(8, dist * 0.5)));
    const standAng = this._lookAngles(stand, chest);
    const seatedAng = view ? this._lookAngles(new THREE.Vector3(...view.eye), new THREE.Vector3(...view.look)) : this._lookAngles(eye, this.focus);
    const fovStart = this.camera.fov;

    const flyDur = quick ? 1.0 : THREE.MathUtils.clamp(1.4 + dist / 50, 1.6, 3.0);
    const turnDur = quick ? 1.0 : 1.9;
    const qa = new THREE.Vector3(), qb = new THREE.Vector3(), target = new THREE.Vector3();
    let turning = false;
    this.labels?.forEach(l => { l.visible = false; });

    this.anim = {
      t: 0,
      dur: flyDur + turnDur,
      step: t => {
        if (t < flyDur) {
          const k = ease(t / flyDur);
          qa.lerpVectors(start, ctrl, k); qb.lerpVectors(ctrl, stand, k);
          this.camera.position.lerpVectors(qa, qb, k);
          target.copy(startLook).lerp(chest, Math.min(1, k * 1.2));
          const look = this._lookAngles(this.camera.position, target);
          const blend = Math.min(1, (t / flyDur) * 2.5);
          this._applyAngles(startAng.yaw + wrapAngle(look.yaw - startAng.yaw) * blend, startAng.pitch + (look.pitch - startAng.pitch) * blend);
          this.camera.fov = fovStart + (SEAT_FOV - fovStart) * k;
        } else {
          if (!turning) {
            turning = true;
            this.realColors = true;
            this.refreshColors();
            this.moodTarget = 1;
            this.cb.onMode?.('turning', seat);
          }
          const k = ease((t - flyDur) / turnDur);
          // Rise slightly mid-turn, then sit: reads as a body, not a drone.
          const sit = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.06;
          this.camera.position.lerpVectors(stand, eye, k).y += sit;
          this._applyAngles(standAng.yaw + wrapAngle(seatedAng.yaw - standAng.yaw) * k, standAng.pitch + (seatedAng.pitch - standAng.pitch) * k);
        }
        this.camera.updateProjectionMatrix();
      },
      done: () => {
        this.mode = 'seat';
        this.look = { yaw: 0, pitch: 0, cy: 0, cp: 0, baseYaw: seatedAng.yaw, basePitch: seatedAng.pitch, fov: SEAT_FOV };
        this.eye = eye;
        this.realColors = true;
        this.moodTarget = 1;
        this.refreshColors();
        this.cb.onMode?.('seat', seat);
        this.cb.onArrive?.(seat, eye.distanceTo(this.focus), !!view);
        this._showPhoto(view, eye, seatedAng);
      },
    };
  }

  backToOverview() {
    if (this.mode === 'overview' || !this.scene) return;
    this._hidePhoto();
    const o = this.savedOverview || { pos: new THREE.Vector3(...this.venue.overview.pos), target: new THREE.Vector3(...this.venue.overview.target) };
    const start = this.camera.position.clone();
    const startAng = this._currentAngles();
    const end = o.pos.clone();
    const ctrl = start.clone().lerp(end, 0.4).add(new THREE.Vector3(0, start.distanceTo(end) * 0.25, 0));
    const endAng = this._lookAngles(end, o.target);
    const fovStart = this.camera.fov;
    this.realColors = false;
    this.refreshColors();
    this.moodTarget = 0;
    this.mode = 'flying';
    this.cb.onMode?.('leaving');
    const qa = new THREE.Vector3(), qb = new THREE.Vector3();
    this.anim = {
      t: 0, dur: 2.0,
      step: t => {
        const k = ease(t / 2.0);
        qa.lerpVectors(start, ctrl, k); qb.lerpVectors(ctrl, end, k);
        this.camera.position.lerpVectors(qa, qb, k);
        this._applyAngles(startAng.yaw + wrapAngle(endAng.yaw - startAng.yaw) * k, startAng.pitch + (endAng.pitch - startAng.pitch) * k);
        this.camera.fov = fovStart + (MAP_FOV - fovStart) * k;
        this.camera.updateProjectionMatrix();
      },
      done: () => {
        this._clearNear();
        if (this.current >= 0) this._occupy(this.current, false);
        this.current = -1;
        this.controls.target.copy(o.target);
        this.controls.enabled = this.interactive;
        this.controls.update();
        this.labels?.forEach(l => { l.visible = true; });
        this.mode = 'overview';
        this.cb.onMode?.('overview');
      },
    };
  }

  // The middle step of a fan's seat tour: the camera moves from the overview to look down on
  // one category, from the side of the venue the category is on, close enough to tell its
  // rows apart. `seat`, when given, keeps that seat in the middle of the picture.
  frameCategory(cat, { seat = null, dur = 1.8 } = {}) {
    if (!this.scene) return;
    const list = this.venue.seats.filter(s => s.cat === cat);
    if (!list.length) return;
    if (this.mode !== 'overview') return;
    const c = new THREE.Vector3();
    for (const s of list) c.add(new THREE.Vector3(s.x, s.y, s.z));
    c.divideScalar(list.length);
    let spread = 0;
    for (const s of list) spread = Math.max(spread, Math.hypot(s.x - c.x, s.z - c.z));
    const target = (seat ? new THREE.Vector3(seat.x, seat.y, seat.z).lerp(c, 0.35) : c.clone()).lerp(new THREE.Vector3(this.focus.x, c.y, this.focus.z), 0.12);
    // From the stage's side of the category, outward and up, so the camera looks across it
    // towards the stage the way its seats face.
    const out = new THREE.Vector3(c.x - this.focus.x, 0, c.z - this.focus.z);
    if (out.lengthSq() < 1) out.set(0, 0, 1);
    out.normalize();
    const aspect = this.camera.aspect || 1;
    const dist = THREE.MathUtils.clamp(spread * (aspect < 1 ? 2.3 : 1.6) + 18, 26, 150);
    const end = target.clone().addScaledVector(out, dist * 0.7).add(new THREE.Vector3(0, dist * 0.62, 0));
    const start = this.camera.position.clone(), t0 = this.controls.target.clone(), fov0 = this.camera.fov;
    this.controls.enabled = false;
    this.anim = {
      t: 0, dur,
      step: t => {
        const k = ease(t / dur);
        this.camera.position.lerpVectors(start, end, k);
        this.controls.target.lerpVectors(t0, target, k);
        this.camera.fov = fov0 + (MAP_FOV - fov0) * k;
        this.camera.lookAt(this.controls.target);
        this.camera.updateProjectionMatrix();
      },
      done: () => { this.controls.enabled = this.interactive; this.controls.update(); },
    };
  }

  // A slow turn round the overview's target, `deg` degrees in `dur` seconds: the opening
  // shot of a story video.
  orbit(deg = 30, dur = 3) {
    if (!this.scene || this.mode !== 'overview') return;
    const target = this.controls.target.clone();
    const off = this.camera.position.clone().sub(target);
    const a0 = Math.atan2(off.x, off.z), r = Math.hypot(off.x, off.z), y = off.y;
    const turn = THREE.MathUtils.degToRad(deg);
    this.controls.enabled = false;
    this.anim = {
      t: 0, dur,
      step: t => {
        const a = a0 + turn * (t / dur);
        this.camera.position.set(target.x + Math.sin(a) * r, target.y + y, target.z + Math.cos(a) * r);
        this.camera.lookAt(target);
      },
      done: () => { this.controls.enabled = this.interactive; this.controls.update(); },
    };
  }

  // Resolves when the camera move under way ends.
  settled() {
    return new Promise(resolve => {
      const check = () => (this.anim || this.disposed ? setTimeout(check, 50) : resolve());
      check();
    });
  }

  // The home page hero's shot: the camera comes down into a seat from above and a little
  // behind it while the house lights go down, then stays there looking at `look` (the
  // stage). `lift` raises it over the seat's eye height, as a phone held up to film; `fit`
  // is the least the view keeps across and `fov` top to bottom (degrees), so a tall phone
  // and a wide screen both see the stage. `beams` scales the light beams' strength, so the
  // show's poster on the screens reads through them.
  showFrom(seat, { look = this.focus.toArray(), dur = 2.6, lift = 0, fit = 0, fov = SEAT_FOV, beams = 1 } = {}) {
    const i = this.venue.seatById.get(seat.id);
    if (i === undefined || !this.scene) return;
    const haze = new Set();
    this.scene.traverse(o => { if (o.material?.userData?.beam) haze.add(o.material.uniforms.uOpacity); });
    for (const r of this.rig) if (haze.has(r.target)) r.live = (r.full ??= r.live) * beams;
    this._hidePhoto();
    this._clearNear();
    if (this.current >= 0) this._occupy(this.current, false);
    this.current = i;
    this._occupy(i, true);
    this._buildNear(i);
    const target = new THREE.Vector3(...look);
    const eye = new THREE.Vector3(seat.x, seat.y + (seat.standing ? SEATED_EYE + STAND_LIFT : SEATED_EYE) + lift, seat.z);
    const rise = eye.clone().sub(target).setY(0).normalize().multiplyScalar(0.3).setY(1).normalize();
    // Starts lower when something solid is overhead (a roof, the deck of an upper tier).
    const above = new THREE.Raycaster(eye, rise, 0, 8.5).intersectObjects(this.scene.children, true)
      .find(h => h.object.visible && !h.object.material?.transparent);
    const start = eye.clone().addScaledVector(rise, above ? Math.max(0, above.distance - 1.5) : 7);
    const seated = this._lookAngles(eye, target);
    this.fit = fit;
    this.minFov = fov;
    this.controls.enabled = false;
    this.mode = 'flying';
    this.seatSince = null;
    this.realColors = true;
    this.refreshColors();
    this._applyMood(0.4);
    this.moodTarget = 1;
    this.anim = {
      t: 0, dur,
      step: t => {
        this.camera.position.lerpVectors(start, eye, dur > 0 ? easeOut(t / dur) : 1);
        const a = this._lookAngles(this.camera.position, target);
        this._applyAngles(a.yaw, a.pitch);
        this.camera.fov = this._fitFov();
        this.camera.updateProjectionMatrix();
      },
      done: () => {
        this.mode = 'seat';
        this.eye = eye;
        this.look = { yaw: 0, pitch: 0, cy: 0, cp: 0, baseYaw: seated.yaw, basePitch: seated.pitch, fov: this._fitFov() };
        this.seatSince = this.clock.elapsedTime;
      },
    };
    this.anim.step(0);
  }

  // The vertical field of view that keeps at least `fit` degrees across (see showFrom).
  _fitFov() {
    const across = THREE.MathUtils.degToRad(this.fit || 0) / 2;
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(across) / (this.camera.aspect || 1)));
    return THREE.MathUtils.clamp(fov, this.minFov || SEAT_FOV, 84);
  }

  zoomSeatView(delta) {
    this.look.fov = THREE.MathUtils.clamp(this.look.fov + delta, 16, 70);
  }

  // ---------- mood & render loop ----------

  _applyMood(m) {
    this.moodValue = m;
    for (const r of this.rig) r.target[r.key] = r.house + (r.live - r.house) * m;
    const a = this.atmo;
    if (a) {
      const col = new THREE.Color().copy(a.house).lerp(a.live, m);
      if (!a.sky) this.scene.background = col;
      if (this.scene.fog) {
        this.scene.fog.color.copy(col);
        this.scene.fog.near = a.fogNear[0] + (a.fogNear[1] - a.fogNear[0]) * m;
        this.scene.fog.far = a.fogFar[0] + (a.fogFar[1] - a.fogFar[0]) * m;
      }
      this.renderer.toneMappingExposure = a.exposure[0] + (a.exposure[1] - a.exposure[0]) * m;
    }
    for (const c of this.cutaways) c.visible = m > 0.35;
    if (this.bloom) this.bloom.strength = 0.25 + (a?.bloom ?? 0.5) * m;
    if (this.lensPass) this.lensPass.uniforms.uAmount.value = (a?.lens || 0) * m;
  }

  frame(now) {
    if (!this.scene || !this.ready) return;
    // Skip display refreshes beyond the frame-rate cap (120 Hz screens, the 30 fps hero).
    if (now - this.lastFrame < this.frameGap - 4) return;
    this.lastFrame = now;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;
    if (Math.abs(this.moodTarget - this.moodValue) > 0.001) {
      const step = dt * 0.9;
      this._applyMood(this.moodValue + THREE.MathUtils.clamp(this.moodTarget - this.moodValue, -step, step));
    }
    for (const fn of this.ticks) fn(time, dt);
    if (this.lens.at !== this.lens.to) {
      const d = this.lens.to - this.lens.at;
      this.lens.at = Math.abs(d) < 0.001 ? this.lens.to : this.lens.at + d * Math.min(1, dt * 4);
      this._lens();
    }
    if (this.anim) {
      this.anim.t += dt;
      this.anim.step(Math.min(this.anim.t, this.anim.dur));
      if (this.anim.t >= this.anim.dur) { const a = this.anim; this.anim = null; a.done(); }
    } else if (this.mode === 'seat') {
      const L = this.look;
      if (this.photo) {
        // Stay inside the picture: no wider than it, and no further round than its edges.
        const P = this.photo, asp = this.camera.aspect || 1, rad = THREE.MathUtils.degToRad;
        P.mesh.material.opacity = Math.min(1, P.mesh.material.opacity + dt * 1.6);
        L.fov = Math.min(L.fov, THREE.MathUtils.radToDeg(2 * Math.min(P.halfV, Math.atan(Math.tan(P.halfH) / asp))) * 0.98);
        const cv = rad(L.fov / 2), ch = Math.atan(Math.tan(cv) * asp);
        const yawMax = Math.max(0, P.halfH - ch) * 0.9, pitchMax = Math.max(0, P.halfV - cv) * 0.9;
        L.yaw = THREE.MathUtils.clamp(L.yaw, -yawMax, yawMax);
        L.pitch = THREE.MathUtils.clamp(L.pitch, -pitchMax, pitchMax);
      }
      L.cy += (L.yaw - L.cy) * Math.min(1, dt * 10);
      L.cp += (L.pitch - L.cp) * Math.min(1, dt * 10);
      // Breathing: a few millimetres of drift so the view feels like a person sitting. With
      // `drift`, the gaze also wanders slowly, easing in from where the camera came to rest.
      this.camera.position.copy(this.eye).add(new THREE.Vector3(Math.sin(time * 0.31) * 0.006, Math.sin(time * 1.1) * 0.006, 0));
      const since = this.seatSince == null ? 0 : time - this.seatSince, d = this.drift * Math.min(1, since / 3);
      this._applyAngles(L.baseYaw - L.cy + Math.sin(time * 0.23) * 0.003 + Math.sin(since * 0.16) * d,
        L.basePitch + L.cp + Math.sin(time * 0.37) * 0.002 + Math.sin(since * 0.11) * d * 0.3);
      if (Math.abs(this.camera.fov - L.fov) > 0.01) {
        this.camera.fov += (L.fov - this.camera.fov) * Math.min(1, dt * 8);
        this.camera.updateProjectionMatrix();
      }
    } else if (this.mode === 'overview') {
      this.controls.update();
    }
    if (this.composer && this.level >= 1 && !this.photo) {
      this.renderPass.scene = this.scene;
      this.renderPass.camera = this.camera;
      if (this.lensPass) this.lensPass.uniforms.uTime.value = time % 10;
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.afterRender?.(this.renderer.domElement);
    if (this.labels?.length && this.labelsShown) {
      this.labelRenderer.render(this.scene, this.camera);
      if (this.mode === 'overview') this._declutter();
    }
    if (!this.shown) { this.shown = true; this.container.classList.add('scene-ready'); }
    this._watchPerf(dt);
  }
}
