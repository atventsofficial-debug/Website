// The trailer's music: a beat made in the browser with Web Audio, written for the trailer's
// cuts (trailer.js), so every cut, flash and the glass breaking land on a drum. No samples,
// nothing licensed. Two kits: `rock` (drums, a distorted bass on a riff) and `pop` (a tight
// four-on-the-floor kick, claps, a round synth bass). At 122 bpm, like the licensed track it
// stands in for, a beat is about 0.49 s.
//
// score(ac, out, t0, style) schedules the whole film from t0 on the context's clock,
// so the same call makes the live track and an offline one.

const B = 60 / 122, BAR = 4 * B;

export function score(ac, out, t0, style = 'rock') {
  const bus = ac.createGain();
  bus.gain.value = 0.8;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.15; comp.knee.value = 6;
  bus.connect(comp).connect(out);
  const room = ac.createConvolver();
  room.buffer = impulse(ac, 1.1);
  const wet = ac.createGain(); wet.gain.value = 0.22;
  room.connect(wet).connect(bus);
  const noise = noiseBuffer(ac, 2);
  const to = (node, verb = 0.3) => { node.connect(bus); if (verb) { const s = ac.createGain(); s.gain.value = verb; node.connect(s).connect(room); } };
  const n = (t, dur, rate = 1) => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = rate; s.start(t, Math.random()); s.stop(t + dur + 0.02); return s; };
  const env = (g, t, peak, d, a = 0.002) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };

  const rock = style === 'rock';
  const kit = {
    kick(t, v = 1) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(rock ? 130 : 150, t); o.frequency.exponentialRampToValueAtTime(rock ? 48 : 42, t + 0.09);
      env(g, t, 0.95 * v, rock ? 0.32 : 0.42);
      o.connect(g); to(g, 0.05); o.start(t); o.stop(t + 0.5);
      const c = n(t, 0.01), cg = ac.createGain(), hp = ac.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2500; env(cg, t, 0.25 * v, 0.008, 0.0005);
      c.connect(hp).connect(cg); to(cg, 0);
    },
    snare(t, v = 1) {
      const s = n(t, 0.25), bp = ac.createBiquadFilter(), g = ac.createGain();
      bp.type = 'bandpass'; bp.frequency.value = rock ? 2200 : 3000; bp.Q.value = 0.7;
      env(g, t, 0.55 * v, rock ? 0.2 : 0.14);
      s.connect(bp).connect(g); to(g, rock ? 0.6 : 0.35);
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(170, t + 0.05);
      env(og, t, 0.35 * v, 0.08);
      o.connect(og); to(og, 0.3); o.start(t); o.stop(t + 0.2);
    },
    // Pop's clap: three quick bursts and a tail.
    clap(t, v = 1) {
      [0, 0.011, 0.023].forEach((d, i) => {
        const s = n(t + d, i === 2 ? 0.15 : 0.012), bp = ac.createBiquadFilter(), g = ac.createGain();
        bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
        env(g, t + d, 0.5 * v, i === 2 ? 0.13 : 0.008, 0.0008);
        s.connect(bp).connect(g); to(g, 0.5);
      });
    },
    hat(t, v = 1, open = false) {
      const s = n(t, open ? 0.3 : 0.05), hp = ac.createBiquadFilter(), g = ac.createGain();
      hp.type = 'highpass'; hp.frequency.value = 7500;
      env(g, t, 0.16 * v, open ? 0.25 : 0.035, 0.0008);
      s.connect(hp).connect(g); to(g, 0.1);
    },
    // A cymbal: six detuned squares at metal's uneven ratios (as drum machines make it),
    // high-passed, over a little noise for the wash.
    crash(t, v = 1) {
      const hp = ac.createBiquadFilter(), g = ac.createGain();
      hp.type = 'highpass'; hp.frequency.value = 5200; hp.Q.value = 0.5;
      env(g, t, 0.12 * v, 1.3, 0.001);
      hp.connect(g); to(g, 0.35);
      [205.3, 369.6, 304.4, 522.7, 540, 800].forEach(f => {
        const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f * 1.7;
        o.connect(hp); o.start(t); o.stop(t + 1.4);
      });
      const s = n(t, 0.9, 0.9), nh = ac.createBiquadFilter(), ng = ac.createGain();
      nh.type = 'highpass'; nh.frequency.value = 6000;
      env(ng, t, 0.07 * v, 0.8, 0.001);
      s.connect(nh).connect(ng); to(ng, 0.3);
    },
    tom(t, f = 110, v = 1) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      env(g, t, 0.6 * v, 0.28);
      o.connect(g); to(g, 0.4); o.start(t); o.stop(t + 0.4);
    },
  };

  // The bass: rock's a saw an octave up and down, through a fuzz and a low-pass; pop's a
  // rounder square, its filter opening on each note.
  const bassOut = ac.createGain(); bassOut.gain.value = rock ? 0.32 : 0.38;
  const fuzz = ac.createWaveShaper(); fuzz.curve = shaper(rock ? 18 : 3); fuzz.oversample = '2x';
  const blp = ac.createBiquadFilter(); blp.type = 'lowpass'; blp.frequency.value = rock ? 1100 : 700; blp.Q.value = 0.8;
  fuzz.connect(blp).connect(bassOut); to(bassOut, 0.05);
  const note = (t, f, dur, v = 1) => {
    [1, 2].forEach(m => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = rock ? 'sawtooth' : 'square'; o.frequency.value = f * m;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime((m === 1 ? 0.5 : 0.18) * v, t + 0.006);
      g.gain.setValueAtTime((m === 1 ? 0.5 : 0.18) * v, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(fuzz); o.start(t); o.stop(t + dur + 0.02);
    });
  };
  const E = 41.2, G = 49.0, A = 55.0, D = 36.7;
  const riff = rock ? [E, E, E, E, E, E, G, A] : [E, E, E, E, D, D, G, G];

  const at = k => t0 + k * B;     // beat k
  // 0: the drop, crash and kick together, and the groove under both flyers.
  kit.crash(at(0), 1.1);
  for (let k = 0; k < 18; k++) groove(k);
  kit.crash(at(8), 0.8);
  // 18: a fill on the toms. 19: the break, nothing; the glass cracks in the silence.
  [0, 0.25, 0.5, 0.75].forEach((d, i) => kit.tom(at(18) + d * B, [140, 120, 100, 82][i], 0.8));
  note(at(18), riff[6], B * 0.45); note(at(18) + B / 2, riff[7], B * 0.45);
  // 20: back in on the seat, crash and kick together, the groove again.
  kit.crash(at(20), 1.1);
  for (let k = 20; k < 32; k++) groove(k);
  // 32: the last hit, left to ring under the logo.
  kit.kick(at(32), 1.1); kit.crash(at(32), 1.1); note(at(32), E, 2.2, 1);

  function groove(k) {
    const inBar = k % 4;
    kit.kick(at(k));
    if (rock && inBar === 2) kit.kick(at(k) + B / 2, 0.75);
    if (inBar === 1 || inBar === 3) (rock ? kit.snare : kit.clap)(at(k));
    kit.hat(at(k), 0.8); kit.hat(at(k) + B / 2, 0.6, !rock && inBar === 3);
    note(at(k), riff[(k * 2) % 8], B / 2 * 0.92); note(at(k) + B / 2, riff[(k * 2 + 1) % 8], B / 2 * 0.92);
  }
  void BAR;
  return bus;
}

function shaper(k) {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}

function noiseBuffer(ac, secs) {
  const b = ac.createBuffer(1, Math.floor(ac.sampleRate * secs), ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function impulse(ac, secs) {
  const len = Math.floor(ac.sampleRate * secs), b = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4); }
  return b;
}
