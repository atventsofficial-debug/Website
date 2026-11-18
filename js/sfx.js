// The story video's sound, made in the browser with Web Audio: no sample files, nothing
// licensed, and no stock "cinematic" effects (no whooshes, risers or trailer booms). Only
// what a fan hears in the venue: the air of a big room, the people in it talking, a
// stadium seat folding down, the clack of a split-flap board, the light banks switching on
// with a clunk, the crowd's applause, and a ticket stamped. Each sound is scheduled at a
// time on the context's clock, so the same calls make the live track (AudioContext, into
// the recording) and an offline one (OfflineAudioContext).

export function createSfx(ac, out) {
  const master = ac.createGain();
  master.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
  // Make-up gain after the compressor, then a hard limit just under full scale.
  const makeup = ac.createGain(), limit = ac.createDynamicsCompressor();
  makeup.gain.value = 1.3;
  limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.08;
  master.connect(comp).connect(makeup).connect(limit).connect(out);

  // The bowl: a long convolution reverb from a decaying noise burst, darker as it fades.
  const verb = ac.createConvolver();
  verb.buffer = impulse(ac, 3.2);
  const wet = ac.createGain();
  wet.gain.value = 0.38;
  verb.connect(wet).connect(master);

  const noise = noiseBuffer(ac, 5);
  const src = (t, dur, rate = 1) => {
    const s = ac.createBufferSource();
    s.buffer = noise; s.loop = true; s.playbackRate.value = rate;
    s.start(t, Math.random() * 4); s.stop(t + dur + 0.05);
    return s;
  };
  const env = (g, t, a, peak, d) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  const send = (node, amount = 1, pan = 0) => {
    let n = node;
    if (pan) { const p = ac.createStereoPanner(); p.pan.value = pan; node.connect(p); n = p; }
    n.connect(master);
    if (amount) { const s = ac.createGain(); s.gain.value = amount; n.connect(s).connect(verb); }
  };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // The crowd's talk, heard from far until the camera comes close: the voices go through
  // one low-pass that opens as it nears, into a level that rises with it.
  const crowdLp = ac.createBiquadFilter(), crowdGain = ac.createGain();
  crowdLp.type = 'lowpass'; crowdLp.frequency.value = 900; crowdLp.Q.value = 0.4;
  crowdGain.gain.value = 0.0001;
  crowdLp.connect(crowdGain); send(crowdGain, 0.7);

  return {
    master,

    // The room, for `dur` seconds from t: the low air of a stadium, and people talking.
    room(t, dur) {
      const air = src(t, dur, 0.35), lp = ac.createBiquadFilter(), ag = ac.createGain();
      lp.type = 'bandpass'; lp.frequency.value = 110; lp.Q.value = 0.5;
      ag.gain.setValueAtTime(0.0001, t); ag.gain.exponentialRampToValueAtTime(0.07, t + 1.2);
      ag.gain.setValueAtTime(0.07, t + dur - 0.7); ag.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      air.connect(lp).connect(ag); send(ag, 0);
      // Twenty-two voices, each a band of noise at a vowel's formant, spoken in syllables of
      // uneven length and loudness, with pauses between phrases.
      for (let v = 0; v < 22; v++) {
        const s = src(t, dur, rnd(0.9, 1.1)), f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(), g = ac.createGain(), p = ac.createStereoPanner();
        f1.type = 'bandpass'; f1.frequency.value = rnd(320, 820); f1.Q.value = rnd(2.5, 5);
        f2.type = 'peaking'; f2.frequency.value = rnd(1300, 2400); f2.Q.value = 2; f2.gain.value = 9;
        p.pan.value = rnd(-0.85, 0.85);
        g.gain.setValueAtTime(0.0001, t);
        let k = t + rnd(0, 1.2);
        while (k < t + dur - 0.3) {
          const words = Math.floor(rnd(3, 9));
          for (let w = 0; w < words && k < t + dur - 0.3; w++) {
            const len = rnd(0.07, 0.2), lvl = rnd(0.25, 1);
            g.gain.setTargetAtTime(lvl, k, 0.018);
            g.gain.setTargetAtTime(lvl * 0.15, k + len, 0.03);
            f1.frequency.setTargetAtTime(rnd(320, 820), k, 0.04);
            k += len + rnd(0.02, 0.09);
          }
          g.gain.setTargetAtTime(0.0001, k, 0.05);
          k += rnd(0.3, 1.4);
        }
        s.connect(f1).connect(f2).connect(g).connect(p).connect(crowdLp);
      }
      const cg = crowdGain.gain;
      cg.setValueAtTime(0.0001, t); cg.exponentialRampToValueAtTime(0.14, t + 1.5);
      cg.setValueAtTime(0.14, t + dur - 1); cg.exponentialRampToValueAtTime(0.0001, t + dur);
      this.roomEnd = t + dur;
    },

    // The camera coming down into the stands: the talk gets nearer and clearer.
    near(t, dur) {
      crowdLp.frequency.setValueAtTime(900, t);
      crowdLp.frequency.exponentialRampToValueAtTime(3400, t + dur);
      crowdGain.gain.setValueAtTime(0.14, t);
      crowdGain.gain.linearRampToValueAtTime(0.3, t + dur);
    },

    // A plastic stadium seat folding down: the latch, then the seat landing.
    seat(t, gain = 0.5) {
      const n = src(t, 0.04, 1), bp = ac.createBiquadFilter(), g = ac.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 3;
      env(g, t, 0.001, gain * 0.5, 0.025);
      n.connect(bp).connect(g); send(g, 0.25);
      const at = t + 0.07, b = src(at, 0.12, 0.7), lp = ac.createBiquadFilter(), bg = ac.createGain();
      lp.type = 'bandpass'; lp.frequency.value = 420; lp.Q.value = 1.6;
      env(bg, at, 0.002, gain, 0.09);
      b.connect(lp).connect(bg); send(bg, 0.35);
      // The shell's ring: two short, inharmonic modes.
      [[310, 1], [737, 0.5]].forEach(([f, k]) => {
        const o = ac.createOscillator(), og = ac.createGain();
        o.frequency.value = f; env(og, at, 0.001, gain * 0.16 * k, 0.07);
        o.connect(og); send(og, 0.3); o.start(at); o.stop(at + 0.12);
      });
    },

    // One flap of a split-flap board.
    flap(t, gain = 0.2) {
      const n = src(t, 0.025, 1), bp = ac.createBiquadFilter(), g = ac.createGain();
      bp.type = 'bandpass'; bp.frequency.value = rnd(2400, 3400); bp.Q.value = 5;
      env(g, t, 0.0008, gain, 0.018);
      n.connect(bp).connect(g); send(g, 0.12, rnd(-0.2, 0.2));
      const d = src(t + 0.012, 0.02, 0.8), dl = ac.createBiquadFilter(), dg = ac.createGain();
      dl.type = 'bandpass'; dl.frequency.value = 1100; dl.Q.value = 3;
      env(dg, t + 0.012, 0.0008, gain * 0.5, 0.015);
      d.connect(dl).connect(dg); send(dg, 0);
    },

    // The light banks switching on, one after another across the bowl: each a contactor's
    // clunk, far off, and the hum of the lamps after it.
    lights(t, banks = 3) {
      for (let i = 0; i < banks; i++) {
        const at = t + i * 0.21 + rnd(0, 0.03), pan = [-0.5, 0.45, 0, -0.2, 0.3][i % 5];
        const b = src(at, 0.2, 0.5), lp = ac.createBiquadFilter(), g = ac.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 260;
        env(g, at, 0.002, 0.9, 0.16);
        b.connect(lp).connect(g); send(g, 1.1, pan);
        const c = src(at, 0.05, 1), hp = ac.createBiquadFilter(), cg = ac.createGain();
        hp.type = 'bandpass'; hp.frequency.value = 1500; hp.Q.value = 2;
        env(cg, at, 0.001, 0.22, 0.04);
        c.connect(hp).connect(cg); send(cg, 1.2, pan);
      }
      // The mains hum of the lamps, low under everything until the end.
      const end = this.roomEnd || t + 6;
      [100, 200, 300].forEach((f, k) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012 / (k + 1), t + 0.6);
        g.gain.setValueAtTime(0.012 / (k + 1), end - 0.8); g.gain.exponentialRampToValueAtTime(0.0001, end);
        o.connect(g); send(g, 0.2); o.start(t); o.stop(end + 0.05);
      });
    },

    // The crowd as the lights come up: hands clapping, thick at first and thinning out,
    // over talk that gets louder.
    cheer(t, dur = 3) {
      const cg = crowdGain.gain;
      cg.cancelScheduledValues(t); cg.setValueAtTime(0.3, t);
      cg.linearRampToValueAtTime(0.55, t + 0.5);
      cg.exponentialRampToValueAtTime(0.26, t + dur + 1);
      if (this.roomEnd > t + dur + 1.2) { cg.setValueAtTime(0.26, this.roomEnd - 1); cg.exponentialRampToValueAtTime(0.0001, this.roomEnd); }
      let k = t + 0.05;
      while (k < t + dur) {
        const x = (k - t) / dur, rate = 30 + 120 * Math.pow(1 - x, 1.6) * Math.min(1, (k - t) / 0.35);
        const n = src(k, 0.03, rnd(0.8, 1.25)), bp = ac.createBiquadFilter(), g = ac.createGain();
        bp.type = 'bandpass'; bp.frequency.value = rnd(900, 2600); bp.Q.value = rnd(1, 2.2);
        env(g, k, 0.0015, rnd(0.1, 0.3) * (1 - x * 0.6), rnd(0.012, 0.03));
        n.connect(bp).connect(g); send(g, 0.9, rnd(-0.9, 0.9));
        k += rnd(0.3, 1.7) / rate;
      }
    },

    // A ticket stamped: the rubber's thud on the counter, and the paper under it.
    stamp(t, gain = 0.4) {
      const b = src(t, 0.12, 0.6), lp = ac.createBiquadFilter(), g = ac.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 520;
      env(g, t, 0.0015, gain, 0.08);
      b.connect(lp).connect(g); send(g, 0.25);
      const p = src(t, 0.05, 1.3), hp = ac.createBiquadFilter(), pg = ac.createGain();
      hp.type = 'highpass'; hp.frequency.value = 3000;
      env(pg, t + 0.002, 0.002, gain * 0.18, 0.04);
      p.connect(hp).connect(pg); send(pg, 0.2);
    },
  };
}

function noiseBuffer(ac, secs) {
  const b = ac.createBuffer(2, Math.floor(ac.sampleRate * secs), ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return b;
}

function impulse(ac, secs) {
  const len = Math.floor(ac.sampleRate * secs), b = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len, decay = Math.pow(1 - k, 3.6);
      // Darker as it fades: a one-pole low-pass that closes over the tail.
      const a = 0.3 + 0.65 * k;
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      // A first reflection off the far stands, 70 ms in.
      const early = i > ac.sampleRate * 0.07 && i < ac.sampleRate * 0.075 ? 0.5 : 0;
      d[i] = (lp + early * (Math.random() - 0.5)) * decay * (i < ac.sampleRate * 0.02 ? i / (ac.sampleRate * 0.02) : 1);
    }
  }
  return b;
}
