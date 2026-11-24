// 3D seat viewer: renderer, lighting moods, seats and crowd, picking, and the
// "walk to the seat, turn round, sit down" camera move.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Crowd, Band, crowdMaterial } from './crowd3d.js';
import { LensPass, GradePass, depthTarget } from './post.js';
import { treadShading, concreteNormalMap } from './arena-detail.js';
import { buildConcert, buildCinema, buildCombat, buildStadium, prepareVenue, preparePoster, posterArt, seatGeometry, crowdGeometries, mats, SEAT_HINGE, concertStage } from './venues3d.js';

const PLUMBOB = '<svg viewBox="0 0 24 40" aria-hidden="true"><path class="pb-a" d="M12 1 2 14h10z"/><path class="pb-b" d="M12 1l10 13H12z"/><path class="pb-c" d="M2 14l10 25V14z"/><path class="pb-d" d="M22 14 12 39V14z"/></svg><i class="pb-glow"></i>';

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

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = t => 1 - (1 - t) ** 3;
// Smootherstep: no jolt at either end (its speed and its acceleration both start and end at 0).
const smoother = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));
const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
// Venue kinds drawn with the live crowd, the camera feel and the concert atmosphere
// (crowd3d.js, post.js); the others keep the simpler figures for now.
// Concerts in a hall, and stadium concerts (a stadium with a show on it, not a match).
const isRealistic = v => !!v && (v.kind === 'concert' || (v.kind === 'stadium' && !!v.show));
const BUILDERS = { concert: buildConcert, cinema: buildCinema, combat: buildCombat, stadium: buildStadium };

// The colour of a venue's seats as they are on the night. `seatColor` is one colour, or
// { bands, mix, speckle }: `bands` runs from the lowest rows to the highest, dithered where two
// meet, and a band given as a list is a mosaic of its colours; `mix` scatters its colours at
// random; `speckle` = [colour, share] dots another colour through either.
function seatLook(venue, rnd) {
  const spec = venue.seatColor;
  if (typeof spec === 'string' || !spec) {
    const one = new THREE.Color(spec || '#8e1626');
    return () => one;
  }
  const pick = list => list[Math.floor(rnd() * list.length)];
  const cols = list => [].concat(list).map(x => new THREE.Color(x));
  const bands = (spec.bands || []).map(cols), mix = cols(spec.mix || []);
  const [dot, share = 0] = spec.speckle || [], dotCol = dot ? new THREE.Color(dot) : null;
  let y0 = Infinity, y1 = -Infinity;
  for (const s of venue.seats) if (!s.standing) { y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
  const span = Math.max(1e-3, y1 - y0);
  return s => {
    if (dotCol && rnd() < share) return dotCol;
    if (!bands.length) return pick(mix);
    const t = ((s.y - y0) / span) * bands.length + (rnd() - 0.5) * 0.5;
    return pick(bands[Math.min(bands.length - 1, Math.max(0, Math.floor(t)))]);
  };
}

export class SeatScene {
  // maxLevel and fps keep a decorative scene (the home page hero) cheap: it never asks for
  // more than that quality level or frame rate, whatever the device could do. `drift`: how
  // far (radians) a seat view slowly looks round on its own, so a still shot feels alive.
  constructor(container, { onHover, onSelect, onMode, onArrive, onFan, onPin, quality = 'auto', labels = true, interactive = true, maxLevel = 2, fps = 60, drift = 0 } = {}) {
    this.container = container;
    this.cb = { onHover, onSelect, onMode, onArrive, onFan, onPin };
    this.labelsOn = labels;
    this.labelsShown = true;
    this.interactive = interactive;
    this.drift = drift;
    this.lens = { at: 0, to: 0 };   // see setShift
    this.frameGap = 1000 / fps;
    this.lastFrame = 0;
    this.ready = false;
    this.running = false;

    // Phones and tablets (also below): they draw through the lens and bloom passes from
    // the first frame, which do not use the canvas's own antialiasing, so it would only cost
    // graphics memory there.
    this.small = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.small, powerPreference: 'high-performance' });
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
    this._fovBack = null;
    this.look = { yaw: 0, pitch: 0, cy: 0, cp: 0, baseYaw: 0, basePitch: 0, fov: SEAT_FOV };
    this.hovered = -1;
    this.current = -1;
    this.mine = new Set();
    this.occupied = new Set();
    this.filterCat = null;
    this.showCrowd = true;

    this.qualityMode = quality;
    // Phones and tablets start a level lower: shadows at full size and the reflections cost
    // more graphics memory than an in-app browser (Instagram's, say) gives a page.
    const small = quality === 'auto' && this.small;
    this.level = Math.min(maxLevel, quality === 'low' ? 0 : quality === 'medium' || small ? 1 : 2);
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

  // Stops drawing while something else covers the scene (the 360° photo viewer).
  setPaused(on) { this.paused = on; this._loop(); }

  _loop() {
    const run = this.onScreen && !this.disposed && !this.paused;
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

  setAtmosphere({ house, live, fogNear, fogFar, exposure = [1, 1], sky = false }) {
    this.atmo = { house: new THREE.Color(house), live: new THREE.Color(live), fogNear, fogFar, exposure, sky };
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
    this.zoneFloors = null;
    this.floorNamed = null;
    this._savedCrowd = null;
    // A venue drawn from a seller's plan shows each free seat in its category's colour there.
    this.zones = venue.zoneColors ? Object.fromEntries(venue.categories.map(c => [c.id, new THREE.Color(c.color)])) : null;
    this.scene = new THREE.Scene();
    this.scene.environment = this.envMap;
    this.focus = new THREE.Vector3(...venue.focus);
    this.realistic = isRealistic(venue);

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
      this.composer?.setPixelRatio(this.pendingRatio);
      this.pendingRatio = 0;
      this.resize();
    }
    this.ready = true;
  }

  disposeScene() {
    if (!this.scene) return;
    this.setRoute(null);
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
    if (this.solo) { this.solo.r.dispose(); this.solo.r.forceContextLoss(); this.solo.r.domElement.remove(); this.solo = null; }
    this.labelRenderer.domElement.remove();
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
    this.labels?.forEach(l => { l.userData.box = null; });
    if (this.tagView) this.tagView.ok = false;
    this.composer?.setSize(w, h);
    this._soloSize();
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
    const heavyCast = lv === 2;
    [this.seatMesh, this.bodyMesh, this.standMesh, this.headMesh, this.hairMesh].forEach(m => { if (m) m.castShadow = heavyCast; });
    if (lv >= 1 && !this.composer) {
      // The frame keeps its depth for the lens pass (haze, depth of field, shading).
      this.composer = new EffectComposer(this.renderer, depthTarget(this.renderer));
      // Each buffer needs a depth texture of its own: a clone shares the GPU texture, which
      // the lens pass would then read while drawing into it.
      this.composer.renderTarget2.depthTexture = depthTarget(this.renderer).depthTexture;
      this.renderPass = new RenderPass(null, this.camera);
      this.lensPass = new LensPass(this.camera);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.85);
      this.gradePass = new GradePass();
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.lensPass);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.composer.addPass(this.gradePass);
    }
    if (this.lensPass) {
      const on = isRealistic(this.venue);
      this.lensPass.enabled = this.gradePass.enabled = on;
      this.lensPass.uniforms.uAO.value = lv === 2 ? 0.75 : 0;
      this.lensPass.uniforms.uTaps.value = lv === 2 ? 20 : 10;
    }
    if (defer) { this.pendingRatio = ratio; return; }
    this.renderer.setPixelRatio(ratio);
    this.composer?.setPixelRatio(ratio);
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
      : new THREE.MeshStandardMaterial({ roughness: style === 'shell' ? 0.38 : style === 'flipup' ? 0.5 : 0.82, metalness: 0.0, vertexColors: style === 'flipup' });
    const seatGeo = seatGeometry(style, { lite: this.small });
    // Standing spots are floor markers only while the crowd is hidden (to show the plan); with
    // people on the floor it stays bare, as a festival floor is. They still pick either way.
    // Flip-up seats keep their pan folded up when nobody sits there.
    this.seatUniforms = { uHideFlat: { value: 0 }, uAllUp: { value: 0 } };
    if (style === 'flipup') seatGeo.setAttribute('aUp', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1));
    seatMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.seatUniforms);
      const flip = style === 'flipup';
      sh.vertexShader = (flip ? `attribute float aPan; attribute float aUp;\n` : '') + 'uniform float uHideFlat; uniform float uAllUp;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          ${flip ? `float seatUp = aPan * max(aUp, uAllUp);
          float fc = cos(1.42 * seatUp), fs = sin(1.42 * seatUp);
          mat3 fold = mat3(1., 0., 0., 0., fc, fs, 0., -fs, fc);
          objectNormal = fold * objectNormal;` : ''}
          #ifdef USE_INSTANCING
          if (length(instanceMatrix[1].xyz) < 0.2) objectNormal = vec3(0., 1., 0.);
          #endif`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          ${flip ? `transformed = vec3(0., ${SEAT_HINGE.y}, ${SEAT_HINGE.z}) + fold * (transformed - vec3(0., ${SEAT_HINGE.y}, ${SEAT_HINGE.z}));` : ''}
          #ifdef USE_INSTANCING
          // A standing spot: the seat's footprint pressed flat into a floor marker, or nothing.
          if (length(instanceMatrix[1].xyz) < 0.2) transformed = uHideFlat > 0.5 ? vec3(0.) : vec3(position.x, 0.3, position.z);
          #endif`);
    };
    seatMat.customProgramCacheKey = () => `atv-seat-${style}`;
    this.seatMesh = new THREE.InstancedMesh(seatGeo, seatMat, n);
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
    // A studio with its own risers wall to wall (cinemas.js) needs no tread per seat.
    if (raised.length && !venue.room?.risers) {
      const stepMat = venue.kind === 'cinema'
        ? new THREE.MeshStandardMaterial({ color: '#3a171d', roughness: 1 })
        : mats.concrete();
      if (this.zones) stepMat.color.set('#ffffff');
      if (this.realistic && venue.kind !== 'cinema') {
        treadShading(stepMat);
        stepMat.normalMap = concreteNormalMap();
        stepMat.normalScale.set(0.5, 0.5);
      }
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

    const c = new THREE.Color();
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.people = null;
    if (isRealistic(venue)) this.buildPeople(venue);
    else {
      // The crowd, on the occupied seats.
      const g = crowdGeometries();
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
    }
    this.realBase = new Float32Array(n * 3);
    const colourOf = seatLook(venue, rnd);
    for (let i = 0; i < n; i++) {
      c.copy(colourOf(seats[i])).offsetHSL(0, 0, (rnd() - 0.5) * 0.03);
      this.realBase.set([c.r, c.g, c.b], i * 3);
    }
    this.refreshColors();
  }

  // The live crowd (crowd3d.js): the seats sold for the show plus most of the rest, as a
  // concert is close to full, leaving a few seats empty here and there.
  buildPeople(venue) {
    const seats = venue.seats, spots = [];
    let seed = 97;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.crowdSlot = new Map();
    seats.forEach((s, i) => {
      if (!this.occupied.has(s.id) && rnd() > 0.86) return;
      this.crowdSlot.set(i, spots.length);
      spots.push({ x: s.x, y: s.y + (s.standing ? STAND_LIFT : 0), z: s.z, yaw: s.yaw, standing: !!s.standing });
    });
    let seed2 = 5;
    this.people = new Crowd(this.scene, spots, () => ((seed2 = (seed2 * 16807) % 2147483647) / 2147483647));
    // From a seat on a phone, the light figures stop at the nearest 2,500 people.
    if (this.small) this.people.midMax = 2500;
    this.people.setVisible(this.showCrowd);
    // The bodies arrive from their file after the scene is built, so their material joins the
    // house-lights fade here rather than in load().
    this.people.material.userData.envMood = true;
    this._applyShow();
    this.mood(this.people.material, 'envMapIntensity', 0.55, 0.06);
    // The act on stage, as many as the show's line-up, on the concert stage's deck and risers.
    this.band?.dispose();
    const bandRnd = () => ((seed2 = (seed2 * 16807) % 2147483647) / 2147483647);
    const stadium = venue.kind === 'stadium', S = !stadium && concertStage(venue);
    // A 360 stage (BTS) has the line-up round its middle; its band plays out of sight.
    const round = stadium && venue.show === 'round' && venue.stage?.arm ? venue.stage : null;
    // A runway or catwalk straight out from the middle of an end stage, for the artist's walk:
    // how far its end (or the B-stage or island on it) is from the stage's front edge.
    const mid = v => Math.abs(v) < 0.5;
    const thrust = (venue.stage?.thrust || []).filter(t => mid(t.x0) && mid(t.x1) && t.z0 < 0.5).map(t => t.z1);
    const bstage = (venue.stage?.bstage || []).filter(b => mid(b.x)).map(b => b.z);
    const cw = venue.stage?.catwalk || venue.hall?.stage?.catwalk;
    const runway = stadium
      ? (thrust.length ? Math.max(...thrust, ...bstage) : null)
      : cw ? cw.len + (cw.island ? cw.island - 0.5 : 0) : null;
    this.band = venue.lineup?.length && (!stadium || venue.show === 'end' || round)
      ? new Band(this.scene, this.bandMat(), round ? venue.lineup.filter(m => ['vocals', 'dancer'].includes(m.role)) : venue.lineup, round
        ? { y: 1.9, round, rnd: bandRnd }
        : stadium
        // A stadium's end stage is built facing +z at its front edge, then turned to the field.
          ? { y: 2.2, front: 0, riserY: 2.8, riserZ: -9, risers: true, deckHalf: 26, deckDepth: 16, runway, rnd: bandRnd }
          : { y: S.h, front: S.front, riserY: S.h + 0.6, riserZ: S.riserZ, spread: S.k, deckHalf: S.w / 2, deckDepth: S.d, runway, rnd: bandRnd })
      : null;
    this.band?.setRoam(this.roam);
    if (this.band && stadium) {
      this.band.group.rotation.y = Math.PI / 2;
      this.band.group.position.set(venue.stageX ?? -40, 0, 0);
    }
    // Flip-up seats: the pan is down where somebody sits.
    const upAttr = this.seatMesh?.geometry.attributes.aUp;
    if (upAttr) {
      for (let i = 0; i < seats.length; i++) upAttr.array[i] = this.crowdSlot.has(i) ? 0 : 1;
      upAttr.needsUpdate = true;
    }
    this.crowd = [];
  }

  buildLabels(venue) {
    const secs = new Map();
    for (const s of venue.seats) {
      // `tag`: one label for sections split only to keep seat numbers without gaps (cinemas.js).
      const k = s.tag || s.sec;
      const a = secs.get(k) || { x: 0, z: 0, y: 0, n: 0, name: s.secName, code: k };
      a.x += s.x; a.z += s.z; a.y = Math.max(a.y, s.y); a.n++;
      secs.set(k, a);
    }
    this.labels = [];
    this.tagView = null;
    if (!this.labelsOn || secs.size < 2) return;
    for (const a of secs.values()) {
      // A floor block with its name painted over it on the map needs no tag (venues3d.js floorZones).
      if (this.floorNamed?.has(a.code)) continue;
      const el = document.createElement('div');
      el.className = 'sec-tag';
      el.textContent = a.code.replace(/^(RS|CS)-/, '$1 ').replace(/^VIP-/, 'VIP ').replace(/^FA-/, 'FA ');
      const obj = new CSS2DObject(el);
      obj.position.set(a.x / a.n, a.y + 1.6, a.z / a.n);
      obj.userData.code = a.code;
      this.scene.add(obj);
      this.labels.push(obj);
    }
  }

  // Seat mates by block: one floating plumbob over each block, with the block and how many
  // fans there show their Instagram; green for the fan's category, orange (locked) for the
  // others. A few dozen page elements whatever the crowd, so a sold out venue stays clean
  // and light. `pins`: { sec, label, count, locked, cat, seat }. A tap is the page's (onPin).
  setBlockPins(pins = []) {
    this.fanTags?.forEach(o => { o.element.remove(); o.removeFromParent(); });
    this.fanTags = [];
    if (!this.scene || !this.venue) return;
    const at = new Map();
    for (const s of this.venue.seats) {
      const a = at.get(s.sec) || { x: 0, z: 0, y: -1e9, n: 0 };
      a.x += s.x; a.z += s.z; a.y = Math.max(a.y, s.y + (s.standing ? STAND_LIFT : 0)); a.n++;
      at.set(s.sec, a);
    }
    const covered = new Set();
    for (const pin of pins) {
      const a = at.get(pin.sec);
      if (!a || !pin.count) continue;
      covered.add(pin.sec);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `fan-pin${pin.locked ? ' is-locked' : ''}${pin.on ? ' is-on' : ''}`;
      el.setAttribute('aria-label', pin.locked ? `${pin.count} fans in ${pin.label}, another category` : `${pin.count} fans in ${pin.label}`);
      el.innerHTML = `<span class="fan-bob${pin.locked ? ' is-locked' : ''}">${PLUMBOB}</span><span class="fan-pin-chip">${pin.locked ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" fill="none" stroke="currentColor" stroke-width="2"/></svg>' : ''}<b>${pin.code}</b><span>${pin.count.toLocaleString('id-ID')}</span></span>`;
      el.addEventListener('pointerdown', e => e.stopPropagation());
      el.addEventListener('click', e => { e.stopPropagation(); this.cb.onPin?.(pin); });
      const obj = new CSS2DObject(el);
      obj.position.set(a.x / a.n, a.y + 3.2, a.z / a.n);
      obj.userData.fan = true;
      this.scene.add(obj);
      this.fanTags.push(obj);
    }
    // The block numbers under a pin would repeat it.
    this.labels?.forEach(l => { l.userData.underPin = covered.has(l.userData.code); l.visible = this.labelsShown && !l.userData.underPin && this.mode !== 'seat'; });
    if (this.tagView) this.tagView.ok = false;
  }

  // Seat mates (js/fans.js): a floating marker over each seat whose fan shows their
  // Instagram, green for the fan's category, orange for fans in other categories, bright for
  // the fan's own seat. Drawn as one instanced mesh, not one page element per fan, so a sold
  // out venue (tens of thousands of fans) stays light on a phone. A tap is found by pickFan
  // and handed to the page (onFan).
  setFans(list = []) {
    if (this.fanMesh) { this.fanMesh.removeFromParent(); this.fanMesh.geometry.dispose(); this.fanMesh.material.dispose(); this.fanMesh = null; }
    this.fanList = [];
    this.fanPos = null;
    this.fanSpot = -1;
    this.fanGlow?.removeFromParent();
    if (this.fanU) this.fanU.uHover.value = -1;
    if (!this.scene || !this.venue || !list.length) return;
    const byId = this.venue.seatById, rows = [];
    for (const f of list) {
      const i = byId.get(f.seat);
      if (i !== undefined) rows.push({ f, s: this.venue.seats[i] });
    }
    if (!rows.length) return;
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    geo.scale(1, 1.7, 1);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    // Each marker floats over the fan's head, turning and bobbing (each a little out of step
    // with its neighbours), and keeps a modest size close to the camera so the rows in front
    // never hide the stage. The marker under the pointer grows and glows.
    const U = this.fanU ||= { uTime: { value: 0 }, uHover: { value: -1 } };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uHover;\nvarying float vHot;\nvarying float vShade;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vHot = 1.0 - step(0.5, abs(float(gl_InstanceID) - uHover));
          vec3 fc = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float ph = fc.x * 0.73 + fc.z * 0.51;
          float a = uTime * 1.3 + ph, ca = cos(a), sa = sin(a);
          transformed.xz = mat2(ca, -sa, sa, ca) * transformed.xz;
          vShade = 0.72 + 0.28 * clamp(dot(normalize(mat2(ca, -sa, sa, ca) * normal.xz), vec2(0.6, 0.8)), -1.0, 1.0);
          // About the same size on screen near and far; none right round the camera, so
          // from a seat the fans next to it never fill the view.
          float dc = distance(fc, cameraPosition);
          transformed *= clamp(dc * 0.012, 0.35, 1.2) * smoothstep(9.0, 16.0, dc) * (1.0 + 0.6 * vHot);
          transformed.y += sin(uTime * 2.4 + ph) * 0.16;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vHot;\nvarying float vShade;')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb * vShade, vec3(1.0), 0.45 * vHot);');
    };
    const mesh = new THREE.InstancedMesh(geo, mat, rows.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    const GREEN = new THREE.Color('#5fd35a'), ORANGE = new THREE.Color('#ff8a2a'), MINE = new THREE.Color('#ffffff');
    this.fanPos = new Float32Array(rows.length * 3);
    // Fans of other categories are smaller and darker, so the fan's own category stands out.
    this.fanScale = new Float32Array(rows.length);
    const sc = new THREE.Vector3(), q = new THREE.Quaternion(), pos = new THREE.Vector3();
    rows.forEach(({ f, s }, k) => {
      // Over the head of a fan standing with their arms up.
      const y = s.y + (s.standing ? STAND_LIFT : 0) + (f.spot ? 3.6 : 2.75), b = f.spot ? 2.2 : f.locked ? 0.75 : 1;
      this.fanScale[k] = b;
      mesh.setMatrixAt(k, m.compose(pos.set(s.x, y, s.z), q, sc.setScalar(b)));
      mesh.setColorAt(k, c.copy(f.locked ? ORANGE : f.mine ? MINE : GREEN));
      this.fanPos.set([s.x, y, s.z], k * 3);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.fanList = rows;
    this.fanMesh = mesh;
    this.scene.add(mesh);
    U.uHover.value = -1;
    // The one fan picked from the list: a big marker that glows the whole time.
    this.fanSpot = rows.findIndex(r => r.f.spot);
    this.setFanHover(-1, true);
    if (!this._fanTick) {
      this._fanTick = true;
      this.onTick(t => { U.uTime.value = t; this._glowAt(t); });
    }
  }

  // The glow behind the marker under the pointer: one soft sprite, following its bob.
  // The marker under the pointer glows; with none, the one picked from the list does.
  setFanHover(hover, force = false) {
    const U = this.fanU;
    const i = hover >= 0 ? hover : (this.fanSpot ?? -1);
    if (!U || (U.uHover.value === i && !force)) return;
    U.uHover.value = i;
    this.renderer.domElement.style.cursor = hover >= 0 ? 'pointer' : '';
    if (!this.fanGlow) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      this.fanGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      this.fanGlow.renderOrder = 3;
    }
    if (i < 0 || !this.fanList[i]) { this.fanGlow.removeFromParent(); return; }
    const f = this.fanList[i].f;
    this.fanGlow.material.color.set(f.locked ? '#ff9a3d' : f.mine ? '#ffffff' : '#7dff73');
    this.scene.add(this.fanGlow);
  }
  _glowAt(t) {
    const i = this.fanU?.uHover.value, g = this.fanGlow;
    if (!g?.parent || !(i >= 0) || !this.fanPos) return;
    const x = this.fanPos[i * 3], y = this.fanPos[i * 3 + 1], z = this.fanPos[i * 3 + 2], b = this.fanScale[i];
    const near = THREE.MathUtils.clamp(this.camera.position.distanceTo(g.position.set(x, y, z)) * 0.012, 0.35, 1.2);
    g.position.y += Math.sin(t * 2.4 + x * 0.73 + z * 0.51) * 0.16 * b;
    g.scale.setScalar(2.4 * near * b);
  }

  // The fan marker under a tap, the same cheap ray test as the seats.
  pickFan(ndc) {
    if (!this.fanPos) return -1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction, P = this.fanPos;
    let best = -1, bestT = Infinity;
    for (let i = 0, n = P.length / 3; i < n; i++) {
      const px = P[i * 3] - o.x, py = P[i * 3 + 1] - o.y, pz = P[i * 3 + 2] - o.z;
      const t = px * d.x + py * d.y + pz * d.z;
      if (t < 12 || t > bestT) continue;   // hidden round the camera (setFans)
      const dx = px - d.x * t, dy = py - d.y * t, dz = pz - d.z * t;
      const r = Math.max(0.5, t * 0.014);
      if (dx * dx + dy * dy + dz * dz < r * r) { bestT = t; best = i; }
    }
    return best;
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
    // Standing floors drawn in their category's colour: hidden from a seat, faded when the
    // map shows another category.
    this.zoneFloors?.forEach(m => {
      m.visible = !this.realColors;
      const dim = this.filterCat && this.filterCat !== m.userData.cat;
      m.material.opacity = m.userData.label ? (dim ? 0.2 : 0.95) : dim ? 0.1 : 0.5;
    });
    if (!this.seatMesh) return;
    const c = new THREE.Color();
    for (let i = 0; i < this.venue.seats.length; i++) this.seatMesh.setColorAt(i, this.seatColor(i, c));
    this.seatMesh.instanceColor.needsUpdate = true;
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
  }

  setMine(ids) { this.mine = new Set(ids); this.refreshColors(); }
  setFilter(cat) { this.filterCat = cat; this.refreshColors(); }

  setCrowd(on) {
    this.showCrowd = on;
    this.people?.setVisible(on);
    this.crowd?.forEach(m => { m.visible = on && (!m.userData.liveOnly || this.moodValue > 0.5); });
  }

  // Block numbers on or off. The seat mates' tags stay, so the layer itself stays shown.
  setLabels(on) {
    this.labelsShown = on;
    this.labels?.forEach(l => { l.visible = on && !l.userData.underPin; });
    if (this.tagView) this.tagView.ok = false;
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
    for (const l of [...(this.fanTags || []), ...this.labels]) {
      if (!l.visible) continue;
      v.copy(l.position).project(cam);
      if (v.z < -1 || v.z > 1) continue;
      const el = l.element;
      l.userData.box ||= el.offsetWidth ? { w: el.offsetWidth / 2 + 2, h: el.offsetHeight / 2 + 1 } : null;
      if (l.userData.box) tags.push({ el, fan: l.userData.fan ? 1 : 0, x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2, z: v.z, ...l.userData.box });
      else measured = false;
    }
    tags.sort((a, b) => b.fan - a.fan || a.z - b.z);   // seat mates before block numbers
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
    if (this.people) { this.people.hide(hidden ? k : -1); return; }
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

  // ---------- picking ----------

  _bindPointer() {
    const el = this.renderer.domElement;
    let down = null, drag = null;
    const ndcOf = e => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const pick = e => this.pickSeat(ndcOf(e));
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
        const fi = this.pickFan(ndcOf(this._lastMove));
        this.setFanHover(fi);
        this.setHover(fi >= 0 ? -1 : pick(this._lastMove), this._lastMove);
      });
    };
    const onUp = e => {
      drag = null;
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (moved > 7 || !quick || this.anim) return;
      const fi = this.pickFan(ndcOf(e));
      if (fi >= 0) { const { f, s } = this.fanList[fi]; this.cb.onFan?.(f, s); return; }
      const i = pick(e);
      if (i >= 0) this.cb.onSelect?.(this.venue.seats[i]);
    };
    const onLeave = () => { this.setHover(-1); this.setFanHover(-1); };
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
  _applyAngles(yaw, pitch, roll = 0) { this.camera.rotation.set(pitch, yaw, roll, 'YXZ'); }

  // While the camera flies, what is invisible in motion rests, and the frames it frees keep
  // the flight smooth: the lens's ambient occlusion (the costliest pass), the key light's
  // shadow map (redrawn every frame otherwise: every seat and person once more), and on a
  // sharp screen a third of the pixels. All come back on arrival, once the camera is still.
  _lite(on) {
    const u = this.lensPass?.uniforms;
    if (on) {
      if (u) { this._liteAO ??= u.uAO.value; u.uAO.value = 0; }
      if (this.renderer.shadowMap.enabled) this.renderer.shadowMap.autoUpdate = false;
      const r = this.renderer.getPixelRatio();
      if (this._liteRatio == null && r > 1.01 && !this.pendingRatio) {
        this._liteRatio = r;
        this._setRatio(Math.max(1, r * 0.67));
      }
      return;
    }
    if (this._liteRatio != null) { this._setRatio(this._liteRatio); this._liteRatio = null; }
    if (u && this._liteAO != null) { u.uAO.value = this._liteAO; this._liteAO = null; }
    this.renderer.shadowMap.autoUpdate = true;
  }
  _setRatio(r) {
    this.renderer.setPixelRatio(r);
    this.composer?.setPixelRatio(r);
    this.resize();
  }

  flyToSeat(seat, { quick = false } = {}) {
    const i = this.venue.seatById.get(seat.id);
    if (i === undefined || !this.scene) return;
    if (this.current >= 0) this._occupy(this.current, false);
    this.current = i;
    this._occupy(i, true);
    this.setHover(-1);
    if (this.mode === 'overview') this.savedOverview = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.controls.enabled = false;
    this.mode = 'flying';
    this.cb.onMode?.('flying', seat);

    const seatBase = new THREE.Vector3(seat.x, seat.y, seat.z);
    const fwd = new THREE.Vector3(-Math.sin(seat.yaw), 0, -Math.cos(seat.yaw));
    // Arrive standing in the row in front of the seat, facing it; then turn round and sit.
    const stand = seatBase.clone().addScaledVector(fwd, 0.55).add(new THREE.Vector3(0, STANDING_EYE + 0.2, 0));
    const chest = seatBase.clone().add(new THREE.Vector3(0, 0.7, 0));
    // The flight looks at the top of the seat, not into its back, so the last metres are not a close-up of upholstery.
    const over = seatBase.clone().add(new THREE.Vector3(0, 1.05, 0));
    const eye = seatBase.clone().addScaledVector(fwd, -0.05).add(new THREE.Vector3(0, seat.standing ? SEATED_EYE + STAND_LIFT : SEATED_EYE, 0));
    // The people around the seat get their detailed figures before the camera gets there.
    this.people?.focusOn(eye, this.focus, this.level === 2 ? 24 : 14, this.level === 2 ? 900 : 320);

    const start = this.camera.position.clone();
    const startAng = this._currentAngles();
    const dist = start.distanceTo(stand);
    const lift = Math.min(22, 2 + dist * 0.3);
    const ctrl = start.clone().lerp(stand, 0.6).add(new THREE.Vector3(0, lift, 0));
    const startLook = start.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(Math.max(8, dist * 0.5)));
    const seatedAng = this._lookAngles(eye, this.focus);
    const fovStart = this.camera.fov;

    const flyDur = quick ? 1.0 : THREE.MathUtils.clamp(1.2 + dist / 65, 1.4, 2.5);
    const turnDur = quick ? 0.9 : 1.5;
    // One movement, not two: the turn to the stage and the sit begin while the flight is still
    // slowing down, so the camera never stops between them.
    const overlap = quick ? 0.45 : 0.9, turnFrom = flyDur - overlap, total = turnFrom + turnDur;
    this.flyDur = flyDur;   // read by the story video, to cut before the close pass
    const qa = new THREE.Vector3(), qb = new THREE.Vector3(), target = new THREE.Vector3(), at = new THREE.Vector3();
    const down = new THREE.Vector3().subVectors(eye, stand);
    // Where the flight is at time t, and where it looks: a pure function of t, so a slow frame
    // moves the camera on along the same path instead of jolting it.
    const flightAt = (t, out) => {
      const k = smoother(clamp01(t / flyDur));
      qa.lerpVectors(start, ctrl, k); qb.lerpVectors(ctrl, stand, k);
      return out.lerpVectors(qa, qb, k);
    };
    const flightLook = t => {
      const k = smoother(clamp01(t / flyDur));
      flightAt(t, at);
      target.copy(startLook).lerp(over, smoother(clamp01(k * 1.25)));
      const look = this._lookAngles(at, target), blend = smoother(clamp01((t / flyDur) * 1.6));
      return { yaw: startAng.yaw + wrapAngle(look.yaw - startAng.yaw) * blend, pitch: startAng.pitch + (look.pitch - startAng.pitch) * blend };
    };
    this.labels?.forEach(l => { l.visible = false; });
    this._lite(true);
    // The heavy recolouring now, before the camera moves, not as it turns: a hitch mid-flight
    // shows; one on the click does not. The show's lights come up during the flight.
    this.realColors = true;
    this.refreshColors();
    this.moodTarget = 1;
    let turning = false;

    this.anim = {
      t: 0,
      dur: total,
      step: t => {
        if (!turning && t >= turnFrom) { turning = true; this.cb.onMode?.('turning', seat); }
        const w = smoother(clamp01((t - turnFrom) / turnDur));
        // Position: the flight, and the step down into the seat on top of its last part.
        flightAt(t, this.camera.position).addScaledVector(down, w);
        this.camera.position.y += Math.sin(Math.min(1, w * 1.4) * Math.PI) * 0.05;
        // Looking: the flight's own heading, turning to the stage as the camera sits.
        const f = flightLook(t);
        // Bank into the turn, as a body or a drone does, from the path's own rate of turn
        // (not frame to frame, which jitters), level again before landing.
        let roll = 0;
        if (this.realistic && t < flyDur) {
          const rate = wrapAngle(flightLook(Math.min(flyDur, t + 0.04)).yaw - flightLook(Math.max(0, t - 0.04)).yaw) / 0.08;
          roll = THREE.MathUtils.clamp(-rate * 0.05, -0.09, 0.09) * Math.sin(Math.PI * clamp01(t / flyDur)) * (1 - w);
        }
        this._applyAngles(f.yaw + wrapAngle(seatedAng.yaw - f.yaw) * w, f.pitch + (seatedAng.pitch - f.pitch) * w, roll);
        this.camera.fov = fovStart + (SEAT_FOV - fovStart) * smoother(clamp01(t / flyDur));
        this.camera.updateProjectionMatrix();
      },
      done: () => {
        this._lite(false);
        this.mode = 'seat';
        this.settleAt = this.clock.elapsedTime;
        this._fovBack = null;
        this.look = { yaw: 0, pitch: 0, cy: 0, cp: 0, baseYaw: seatedAng.yaw, basePitch: seatedAng.pitch, fov: SEAT_FOV };
        this.eye = eye;
        this.realColors = true;
        this.moodTarget = 1;
        this.cb.onMode?.('seat', seat);
        this.cb.onArrive?.(seat, eye.distanceTo(this.focus));
      },
    };
  }

  backToOverview() {
    if (this.mode === 'overview' || !this.scene) return;
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
    this._lite(true);
    this.cb.onMode?.('leaving');
    const qa = new THREE.Vector3(), qb = new THREE.Vector3();
    this.anim = {
      t: 0, dur: 1.6,
      step: t => {
        const k = ease(t / 1.6);
        qa.lerpVectors(start, ctrl, k); qb.lerpVectors(ctrl, end, k);
        this.camera.position.lerpVectors(qa, qb, k);
        this._applyAngles(startAng.yaw + wrapAngle(endAng.yaw - startAng.yaw) * k, startAng.pitch + (endAng.pitch - startAng.pitch) * k);
        this.camera.fov = fovStart + (MAP_FOV - fovStart) * k;
        this.camera.updateProjectionMatrix();
      },
      done: () => {
        this._lite(false);
        if (this.current >= 0) this._occupy(this.current, false);
        this.current = -1;
        this.controls.target.copy(o.target);
        this.controls.enabled = this.interactive;
        this.controls.update();
        this.labels?.forEach(l => { l.visible = !l.userData.underPin; });
        this.people?.focusOn(null);
        this.mode = 'overview';
        this.cb.onMode?.('overview');
      },
    };
  }

  // The middle step of a fan's seat tour: the camera moves from the overview to look down on
  // one category, from the side of the venue the category is on, close enough to tell its
  // rows apart. `seat`, when given, keeps that seat in the middle of the picture; `sec`
  // frames only that block of it, for a fan pointing at their own seat.
  frameCategory(cat, { seat = null, sec = null, dur = 1.8, done = null } = {}) {
    if (!this.scene) return;
    const list = this.venue.seats.filter(s => s.cat === cat && (!sec || s.sec === sec));
    if (!list.length) return;
    if (this.mode !== 'overview') return;
    const c = new THREE.Vector3();
    for (const s of list) c.add(new THREE.Vector3(s.x, s.y, s.z));
    c.divideScalar(list.length);
    let spread = 0;
    for (const s of list) spread = Math.max(spread, Math.hypot(s.x - c.x, s.z - c.z));
    // A whole category leans towards the stage; one block sits in the middle, so a tap in the
    // middle of the picture lands on it.
    const target = sec ? c.clone()
      : (seat ? new THREE.Vector3(seat.x, seat.y, seat.z).lerp(c, 0.35) : c.clone()).lerp(new THREE.Vector3(this.focus.x, c.y, this.focus.z), 0.12);
    // From the stage's side of the category, outward and up, so the camera looks across it
    // towards the stage the way its seats face.
    const out = new THREE.Vector3(c.x - this.focus.x, 0, c.z - this.focus.z);
    if (out.lengthSq() < 1) out.set(0, 0, 1);
    out.normalize();
    const aspect = this.camera.aspect || 1;
    const dist = THREE.MathUtils.clamp(spread * (aspect < 1 ? 2.3 : 1.6) + 18, 26, 150);
    // A block is seen from higher up, nearly over it, so its rows and seats are easy to tell apart.
    const end = target.clone().addScaledVector(out, dist * (sec ? 0.4 : 0.7)).add(new THREE.Vector3(0, dist * (sec ? 0.85 : 0.62), 0));
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
      done: () => { this.controls.enabled = this.interactive; this.controls.update(); done?.(); },
    };
  }

  // The band's own copy of the crowd's material: same clock and lights, never faded.
  bandMat() {
    return (this._bandMat ||= crowdMaterial(this.people.material));
  }

  // One fan picked from the list: the whole picture turns grey and dim, and that one person
  // is drawn again on a layer of their own above it, lit green, with a tag of their name and
  // seat. The layer draws only that figure, so it costs next to nothing; seen through anyone
  // standing in front of them. `tag`: { name, sub }.
  focusPerson(seat, tag = {}) {
    if (!this.scene || !seat) return false;
    const i = this.venue.seatById.get(seat.id);
    const k = i === undefined ? undefined : this.crowdSlot?.get(i);
    const mesh = this.people?.soloMesh?.(k ?? -1, seat);
    if (!mesh) return false;
    this.clearPerson(true);
    // One more GPU context: a phone short of them says no, and the fan is then shown by the
    // tag alone over the grey picture.
    let r = null;
    if (this.solo == null) try { r = new THREE.WebGLRenderer({ alpha: true, antialias: true }); } catch { this.solo = false; }
    if (r) {
      r.setClearColor(0x000000, 0);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.domElement.className = 'solo-layer';
      this.container.insertBefore(r.domElement, this.labelRenderer.domElement);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#eaffea', '#103010', 1.6));
      const sun = new THREE.DirectionalLight('#ffffff', 1.4);
      sun.position.set(0.3, 1, 0.5);
      scene.add(sun);
      this.solo = { r, scene, mesh: null };
      this._soloSize();
    }
    if (this.solo) {
      this.solo.mesh = mesh;
      this.solo.scene.add(mesh);
      this.solo.r.domElement.hidden = false;
    }
    // The name over their head, still in colour.
    const el = document.createElement('div');
    el.className = 'solo-tag';
    el.innerHTML = '<b></b><span></span>';
    el.firstChild.textContent = tag.name || '';
    el.lastChild.textContent = tag.sub || '';
    const obj = new CSS2DObject(el);
    obj.position.set(seat.x, seat.y + (seat.standing ? 2.45 : 2.05), seat.z);
    obj.userData.fan = true;
    this.scene.add(obj);
    this.soloTag = obj;
    this.container.classList.add('is-solo');
    this.labels?.forEach(l => { l.visible = false; });
    if (this.fanTags) this.fanTags.forEach(t => { t.visible = false; });
    return true;
  }

  clearPerson(keep = false) {
    if (this.solo && this.solo.mesh) { this.solo.scene.remove(this.solo.mesh); this.solo.mesh = null; }
    if (this.soloTag) { this.scene.remove(this.soloTag); this.soloTag.element.remove(); this.soloTag = null; }
    if (keep) return;
    if (this.solo) this.solo.r.domElement.hidden = true;
    if (this.container.classList.contains('is-solo')) {
      this.container.classList.remove('is-solo');
      this.setLabels(this.labelsShown);
      this.fanTags?.forEach(t => { t.visible = true; });
    }
    if (this._minD != null) { this.controls.minDistance = this._minD; this._minD = null; }
  }

  _soloSize() {
    if (!this.solo) return;
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.solo.r.setPixelRatio(this.renderer.getPixelRatio());
    this.solo.r.setSize(w, h, false);
  }

  // From the seat, turns the view towards a seat elsewhere (as far as a head turns).
  lookToward(seat) {
    if (this.mode !== 'seat' || !seat) return;
    const L = this.look, eye = this.eye || this.camera.position;
    const dx = seat.x - eye.x, dz = seat.z - eye.z, dy = seat.y + 1.1 - eye.y;
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    let rel = L.baseYaw - yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    L.yaw = THREE.MathUtils.clamp(rel, -1.9, 1.9);
    L.pitch = THREE.MathUtils.clamp(pitch - L.basePitch, -0.7, 0.55);
    // Zoomed in on someone far off, so they are more than a speck.
    this._fovBack ??= L.fov;
    const dist = Math.hypot(dx, dy, dz);
    L.fov = THREE.MathUtils.clamp(this._fovBack * 22 / Math.max(dist, 1), 14, this._fovBack);
  }

  // Back to looking ahead from the seat, at the zoom from before.
  lookAhead() {
    if (this.mode !== 'seat') { this._fovBack = null; return; }
    const L = this.look;
    L.yaw = 0; L.pitch = 0;
    if (this._fovBack != null) L.fov = this._fovBack;
    this._fovBack = null;
  }

  // Flies the overview's camera to one seat, close enough to pick the person out among their
  // neighbours, from the stage's side so they face it.
  lookAtPerson(seat, { dur = 1.8, done = null } = {}) {
    if (!this.scene || this.mode !== 'overview' || !seat) return;
    const target = new THREE.Vector3(seat.x, seat.y + 1, seat.z);
    const out = new THREE.Vector3(seat.x - this.focus.x, 0, seat.z - this.focus.z);
    if (out.lengthSq() < 1) out.set(0, 0, 1);
    out.normalize();
    // In front of them (towards the stage) and up, looking down at them.
    const end = target.clone().addScaledVector(out, -11).add(new THREE.Vector3(0, 12, 0));
    // The overview keeps the camera further out than this; close in only while a fan is shown.
    this._minD ??= this.controls.minDistance;
    this.controls.minDistance = Math.min(this._minD, 10);
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
      done: () => { this.controls.enabled = this.interactive; this.controls.update(); done?.(); },
    };
  }

  // A slow turn round the overview's target, `deg` degrees in `dur` seconds: the opening
  // shot of a story video. `push` brings the camera in to that share of its distance as it
  // turns, and `toward` (x, y, z) moves what it looks at there, both easing out.
  orbit(deg = 30, dur = 3, { push = 1, toward = null } = {}) {
    if (!this.scene || this.mode !== 'overview') return;
    const t0 = this.controls.target.clone(), t1 = toward ? new THREE.Vector3(...toward) : t0.clone();
    const off = this.camera.position.clone().sub(t0);
    const a0 = Math.atan2(off.x, off.z), r = Math.hypot(off.x, off.z), y = off.y;
    const turn = THREE.MathUtils.degToRad(deg), target = new THREE.Vector3();
    this.controls.enabled = false;
    this.anim = {
      t: 0, dur,
      step: t => {
        const k = t / dur, e = 1 - (1 - k) ** 2, a = a0 + turn * k, d = 1 + (push - 1) * e;
        target.lerpVectors(t0, t1, e);
        this.camera.position.set(target.x + Math.sin(a) * r * d, target.y + y * d, target.z + Math.cos(a) * r * d);
        this.camera.lookAt(target);
        this.controls.target.copy(target);
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
    if (this.current >= 0) this._occupy(this.current, false);
    this.current = i;
    this._occupy(i, true);
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
        this._lite(false);
        this.mode = 'seat';
        this.eye = eye;
        this._fovBack = null;
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

  // The zoom buttons: in the seat they narrow the view; above the venue they move the camera
  // in or out towards what it looks at, a quarter at a time, within the overview's own limits.
  zoomBy(delta) {
    if (this.mode === 'seat') { this.zoomSeatView(delta); return; }
    const c = this.controls;
    if (this.mode !== 'overview' || this.anim || !c?.enabled) return;
    const tgt = c.target.clone(), off = this.camera.position.clone().sub(tgt), d0 = off.length();
    const d1 = THREE.MathUtils.clamp(d0 * (delta < 0 ? 0.75 : 1 / 0.75), c.minDistance, c.maxDistance);
    if (!(d0 > 0) || Math.abs(d1 - d0) < 0.01) return;
    const dur = 0.35;
    c.enabled = false;
    this.anim = {
      t: 0, dur,
      step: t => {
        this.camera.position.copy(tgt).addScaledVector(off, (d0 + (d1 - d0) * smoother(clamp01(t / dur))) / d0);
        this.camera.lookAt(tgt);
      },
      done: () => { c.enabled = this.interactive; c.update(); },
    };
  }

  // ---------- getting there ----------

  // The way in to a seat (access.js): a coral path from the outside of the venue to the seat,
  // with a light running along it. null takes it away.
  setRoute(points) {
    if (this.route) {
      this.scene?.remove(this.route.group);
      this.route.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      this.ticks = this.ticks.filter(f => f !== this.route.tick);
      this.route = null;
    }
    if (!points?.length || !this.scene) return;
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.2);
    const group = new THREE.Group();
    const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xec5446, transparent: true, opacity: 0.85, depthTest: false }));
    const spark = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    const gate = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.4, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false }));
    gate.rotation.x = -Math.PI / 2;
    gate.position.copy(curve.getPoint(0)).y += 0.1;
    for (const m of [line, spark, gate]) { m.renderOrder = 20; group.add(m); }
    this.scene.add(group);
    const tick = t => { spark.position.copy(curve.getPointAt((t * 0.18) % 1)); gate.scale.setScalar(1 + 0.25 * Math.sin(t * 4)); };
    this.onTick(tick);
    this.route = { group, tick };
  }

  // ---------- show mode ----------

  // The light sticks round the seat (viewer.js): `color` a CSS colour, `mix` how much of the
  // crowd's sticks take it (0 their own colours, 1 all of them), `fx` 'beat', 'steady' or
  // 'wave', `ocean` the share of the crowd holding one up (0 as they came).
  setShow(opts = {}) {
    this.show = { ...(this.show || { color: '#ffffff', mix: 0, fx: 'beat', ocean: 0 }), ...opts };
    this._applyShow();
  }

  _applyShow() {
    const u = this.people?.uniforms, o = this.show;
    if (!u?.uStickCol || !o) return;
    u.uStickCol.value.set(o.color);
    u.uStickMix.value = o.mix;
    u.uStickFx.value = { beat: 0, steady: 1, wave: 2 }[o.fx] ?? 0;
    u.uStickAll.value = o.ocean;
    u.uStage.value.set(this.focus?.x || 0, this.focus?.z || 0);
  }

  // 3D Pass Plus: the singers and dancers walk the whole stage (crowd3d.js Band.setRoam).
  setRoam(on) {
    this.roam = !!on;
    this.band?.setRoam(this.roam);
  }

  // From a seat: the show's lights (true) or the house lights up to see the venue (false).
  setShowLights(on) {
    if (this.mode === 'seat') this.moodTarget = on ? 1 : 0;
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
    if (this.bloom) this.bloom.strength = 0.25 + 0.5 * m;
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
    this.people?.update(time, this.moodValue, this.camera, this.focus);
    this.band?.update(time);
    if (this.seatUniforms) {
      this.seatUniforms.uHideFlat.value = this.showCrowd ? 1 : 0;
      this.seatUniforms.uAllUp.value = this.showCrowd ? 0 : 1;
    }
    if (this.lens.at !== this.lens.to) {
      const d = this.lens.to - this.lens.at;
      this.lens.at = Math.abs(d) < 0.001 ? this.lens.to : this.lens.at + d * Math.min(1, dt * 4);
      this._lens();
    }
    if (this.anim) {
      // A slow frame moves the camera on by the time it took, so the flight keeps its pace.
      this.anim.t += Math.min(this.clock.elapsedTime - (this._animAt ?? this.clock.elapsedTime - dt), 0.1);
      this.anim.step(Math.min(this.anim.t, this.anim.dur));
      this._animAt = this.clock.elapsedTime;
      if (this.anim.t >= this.anim.dur) { const a = this.anim; this.anim = null; this._animAt = null; a.done(); }
    } else if (this.mode === 'seat') {
      const L = this.look;
      L.cy += (L.yaw - L.cy) * Math.min(1, dt * 10);
      L.cp += (L.pitch - L.cp) * Math.min(1, dt * 10);
      // Breathing: a few millimetres of drift so the view feels like a person sitting. With
      // `drift`, the gaze also wanders slowly, easing in from where the camera came to rest.
      const since = this.seatSince == null ? 0 : time - this.seatSince, d = this.drift * Math.min(1, since / 3);
      if (this.realistic) {
        // Held by a person: breathing lifts the view a few millimetres, the hands wander a
        // little on three axes, and the turn to the stage settles with a small overshoot.
        const n = (f, p) => Math.sin(time * f + p) * 0.6 + Math.sin(time * f * 2.13 + p * 1.7) * 0.3 + Math.sin(time * f * 4.71 + p * 0.3) * 0.1;
        // The hands come in gently after the flight lands (no snap from still to moving).
        const st = this.settleAt == null ? 9 : time - this.settleAt, h = smoother(clamp01(st / 1.2));
        const settle = Math.exp(-st * 2.6) * Math.sin(st * 6.5) * (1 - Math.exp(-st * 6));
        this.camera.position.copy(this.eye).add(TAG_POS.set(n(0.37, 1) * 0.005 * h, (Math.sin(time * 1.55) * 0.004 + n(0.6, 4) * 0.002) * h, n(0.29, 7) * 0.004 * h));
        this._applyAngles(L.baseYaw - L.cy + n(0.33, 2) * 0.0045 * h + settle * 0.012 + Math.sin(since * 0.16) * d,
          L.basePitch + L.cp + n(0.47, 5) * 0.003 * h - settle * 0.004 + Math.sin(since * 0.11) * d * 0.3, n(0.27, 9) * 0.004 * h);
      } else {
        const h = smoother(clamp01((this.settleAt == null ? 9 : time - this.settleAt) / 1.2));
        this.camera.position.copy(this.eye).add(TAG_POS.set(Math.sin(time * 0.31) * 0.006 * h, Math.sin(time * 1.1) * 0.006 * h, 0));
        this._applyAngles(L.baseYaw - L.cy + Math.sin(time * 0.23) * 0.003 * h + Math.sin(since * 0.16) * d,
          L.basePitch + L.cp + Math.sin(time * 0.37) * 0.002 * h + Math.sin(since * 0.11) * d * 0.3);
      }
      if (Math.abs(this.camera.fov - L.fov) > 0.01) {
        this.camera.fov += (L.fov - this.camera.fov) * Math.min(1, dt * 8);
        this.camera.updateProjectionMatrix();
      }
    } else if (this.mode === 'overview') {
      this.controls.update();
    }
    if (this.lensPass?.enabled && this.level >= 1) {
      const u = this.lensPass.uniforms, m = this.moodValue;
      u.uTime.value = time; u.uLive.value = m; u.uHaze.value = m;
      u.uDof.value += ((this.mode === 'seat' ? 1 : 0) - u.uDof.value) * Math.min(1, dt * 1.5);
      u.uFocus.value = this.camera.position.distanceTo(this.focus);
      const p = TAG_POS.copy(this.focus).project(this.camera);
      u.uStage.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
      this.gradePass.uniforms.uTime.value = time;
      this.gradePass.uniforms.uLive.value = m;
    }
    if (this.composer && this.level >= 1) {
      this.renderPass.scene = this.scene;
      this.renderPass.camera = this.camera;
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    if (this.solo?.mesh) this.solo.r.render(this.solo.scene, this.camera);
    this.afterRender?.(this.renderer.domElement);
    if ((this.labels?.length && this.labelsShown) || this.fanTags?.length || this.soloTag) {
      this.labelRenderer.render(this.scene, this.camera);
      if (this.mode === 'overview') this._declutter();
    }
    if (!this.shown) { this.shown = true; this.container.classList.add('scene-ready'); }
    this._watchPerf(dt);
  }
}
