// The concert look, as two full-screen passes around the bloom.
//
// LensPass (scene-linear, before bloom) reads the depth of the frame and adds what a camera
// in a dark, hazy hall would see: soft shadow where things meet (ambient occlusion from
// depth), haze that thickens with distance and glows near the stage, and depth of field
// that blurs the heads right in front of you while the stage stays sharp.
// GradePass (display, last) smooths edges (FXAA), grades the colour, darkens the corners,
// fringes them a little and adds grain, like a phone camera at night.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const LENS_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tDiffuse; uniform sampler2D tDepth;
uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uTime;
uniform float uLive; uniform float uAO; uniform float uDof; uniform float uFocus; uniform float uAperture;
uniform vec2 uStage; uniform vec3 uHazeNear; uniform vec3 uHazeStage; uniform float uHaze; uniform int uTaps;
varying vec2 vUv;

float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0., a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
// Circle of confusion in pixels: how blurred a point at depth z is.
float coc(float z) { return clamp(abs(1. / uFocus - 1. / max(z, 0.05)) * uAperture * uRes.y, 0., 9.) * uDof; }

void main() {
  float z = viewZ(vUv);
  vec4 base = texture2D(tDiffuse, vUv);
  vec3 col = base.rgb;

  // Depth of field: a gather over a golden-angle spiral, each sample weighed by its own blur
  // so sharp things in front do not smear into the background.
  float c0 = coc(z);
  if (uDof > 0.01 && c0 > 0.6) {
    vec3 acc = col; float wsum = 1.;
    for (int i = 1; i < 24; i++) {
      if (i > uTaps) break;
      float r = sqrt(float(i) / float(uTaps)) * c0;
      float a = float(i) * 2.39996;
      vec2 o = vec2(cos(a), sin(a)) * r / uRes;
      float zs = viewZ(vUv + o);
      float w = smoothstep(r - 1., r + 1., max(coc(zs), zs > z ? c0 : 0.));
      acc += texture2D(tDiffuse, vUv + o).rgb * w; wsum += w;
    }
    col = acc / wsum;
  }

  // Ambient occlusion from depth alone: nearby samples that sit in front of this point
  // (within a metre) shade it.
  if (uAO > 0.01 && z < 120.) {
    float occ = 0., rad = clamp(0.55 / z, 0.002, 0.06);
    float rot = hash(vUv * uRes) * 6.283;
    for (int i = 0; i < 10; i++) {
      float a = rot + float(i) * 2.39996, r = rad * (0.3 + 0.7 * fract(float(i) * 0.618));
      float zs = viewZ(vUv + vec2(cos(a), sin(a) * uRes.x / uRes.y) * r);
      float d = z - zs;
      occ += smoothstep(0.03, 0.12, d) * (1. - smoothstep(0.6, 1.4, d));
    }
    col *= 1. - uAO * clamp(occ / 10., 0., 1.) * 0.85;
  }

  // Haze: thickens with distance, lit warm towards the stage, cool elsewhere, drifting.
  if (uHaze > 0.01) {
    float dist = min(z, 160.);
    float amt = 1. - exp(-dist * 0.01 * uHaze);
    vec2 d = (vUv - uStage) * vec2(uRes.x / uRes.y, 1.);
    float glow = exp(-dot(d, d) * 4.0);
    float drift = fbm(vUv * vec2(3., 5.) + vec2(uTime * 0.015, -uTime * 0.01));
    vec3 h = mix(uHazeNear, uHazeStage, glow * glow) * (0.5 + 1.0 * drift);
    col = col * (1. - amt * 0.12) + h * amt * 0.09 * (0.4 + 0.6 * uLive);
  }
  gl_FragColor = vec4(col, base.a);
}`;

const GRADE_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime; uniform float uLive;
uniform float uGrain; uniform float uVignette; uniform float uFringe;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 fxaa(vec2 uv) {
  vec2 px = 1. / uRes;
  vec3 m = texture2D(tDiffuse, uv).rgb;
  float lM = luma(m), lN = luma(texture2D(tDiffuse, uv + vec2(0., -px.y)).rgb), lS = luma(texture2D(tDiffuse, uv + vec2(0., px.y)).rgb);
  float lE = luma(texture2D(tDiffuse, uv + vec2(px.x, 0.)).rgb), lW = luma(texture2D(tDiffuse, uv + vec2(-px.x, 0.)).rgb);
  float lo = min(lM, min(min(lN, lS), min(lE, lW))), hi = max(lM, max(max(lN, lS), max(lE, lW)));
  if (hi - lo < max(0.04, hi * 0.15)) return m;
  vec2 dir = vec2(-(lN - lS), lE - lW);
  float rcp = 1. / (min(abs(dir.x), abs(dir.y)) + 0.02);
  dir = clamp(dir * rcp, -4., 4.) * px;
  vec3 a = 0.5 * (texture2D(tDiffuse, uv - dir * 0.17).rgb + texture2D(tDiffuse, uv + dir * 0.17).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, uv - dir * 0.5).rgb + texture2D(tDiffuse, uv + dir * 0.5).rgb);
  float lb = luma(b);
  return (lb < lo || lb > hi) ? a : b;
}
void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  // A little colour fringe towards the corners.
  vec2 f = c * r2 * uFringe;
  vec3 col = fxaa(vUv);
  col.r = mix(col.r, texture2D(tDiffuse, vUv + f).r, 0.6);
  col.b = mix(col.b, texture2D(tDiffuse, vUv - f).b, 0.6);
  // Grade: deeper blacks, cool shadows, warm highlights, a touch more saturation once the
  // show is on.
  float l = luma(col);
  col = mix(col, col * col * (3. - 2. * col), 0.25 * uLive);
  vec3 shadowTint = vec3(0.92, 0.97, 1.12), lightTint = vec3(1.06, 1.0, 0.92);
  col *= mix(shadowTint, lightTint, smoothstep(0.15, 0.75, l)) * uLive + (1. - uLive);
  col = mix(vec3(luma(col)), col, 1. + 0.12 * uLive);
  // Vignette and grain.
  col *= 1. - uVignette * smoothstep(0.12, 0.62, r2 * 1.6);
  float g = hash(vUv * uRes + fract(uTime * 7.3) * 91.7) - 0.5;
  col += g * uGrain * (0.35 + 0.65 * (1. - l));
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export class LensPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 }, uFar: { value: 2000 }, uTime: { value: 0 }, uLive: { value: 0 },
      uAO: { value: 0.7 }, uDof: { value: 0 }, uFocus: { value: 30 }, uAperture: { value: 0.012 }, uTaps: { value: 16 },
      uStage: { value: new THREE.Vector2(0.5, 0.6) }, uHaze: { value: 0 },
      uHazeNear: { value: new THREE.Color('#0d1222') }, uHazeStage: { value: new THREE.Color('#ffb070') },
    };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: LENS_FRAG, depthTest: false, depthWrite: false }));
  }
  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uNear.value = this.camera.near; u.uFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.quad.material.dispose(); this.quad.dispose(); }
}

export class GradePass extends Pass {
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uLive: { value: 0 },
      uGrain: { value: 0.035 }, uVignette: { value: 0.45 }, uFringe: { value: 0.006 },
    };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: GRADE_FRAG, depthTest: false, depthWrite: false }));
  }
  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.quad.material.dispose(); this.quad.dispose(); }
}

// A render target for the composer that keeps the frame's depth, for LensPass.
export function depthTarget(renderer) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
  rt.depthTexture.type = THREE.UnsignedIntType;
  return rt;
}
