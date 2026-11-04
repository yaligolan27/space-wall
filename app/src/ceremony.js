// The ribbon-cutting opening (טקס גזירת הסרט): a long, scored sequence for the inauguration of the Space Program
// Office's new home, started from the remote (lib/remote-ops.ts `ceremony`). The picture is a 3D film drawn live
// (ceremony3d.js, window.CerStage); this file runs its clock, the promo video, the sound and the standby screen.
//   0 s      a dark hangar; its lights come on rib by rib toward the great doors at its end, the office's emblem across
//            their seam, a red ribbon with a bow in front; the title, then the guest of honour
//   15 s     the seal around the emblem counts 10…1
//   25 s     a blade of light cuts the ribbon; the locks release and the doors part onto space: the sun rising over the
//            Earth's limb, "a new era", and a dive toward Israel's lights into a white flash
//   40.8 s   the promo video (the remote's choice, else /assets/ceremony/promo-v9-1080.mp4), full screen, with its sound
//   its end  the Earth pulls back from over Israel, "welcome", and comes to rest where the wall's emblem globe is as the
//            home wall assembles around it (wall.js: onWake, then onDone)
// Made for the lobby's video wall (nine TVs fed one 1920×1080 picture): every word fits one TV's width.
// Sound: synthesized here (Web Audio) on the same clock as the picture, so nothing to download and every hit lands on its
// frame. A browser plays sound only after someone clicked or pressed a key on the page (or when Chrome runs with
// --autoplay-policy=no-user-gesture-required): the standby screen says which, and a click on it is enough.
// The standby screen builds the 3D stage ahead (hidden), so "start" finds its shaders compiled and its first second smooth.
(() => {
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // The timeline lives with the picture (ceremony3d.js); these are what the clock needs if that script did not load.
  const KK = () => (window.CerStage && window.CerStage.K) || { LIGHTS: 0.9, DOOR_ON: 3.6, EYEBROW: 4.8, TITLE: 5.3, LINE: 6.3, SPOT: 11.4, HONOR: 11.9, COUNT: 15, CUT: 25,
    UNLOCK: 25.9, OPEN: 27.7, OPEN_DUR: 4.4, SUN: 28.5, EXIT: 30.2, OUTSIDE: 32.6, TAG: 33.4, PLUNGE: 37.0, FLASH: 40.4, VIDEO: 40.8, F_TXT: 1.6, WAKE: 6.6, LAND: 8.0, DONE: 11.1 };
  const E = { E1: 41.2, B1: 61.74, E2: 82.41, B2: 123.47, E3: 164.81, Gs3: 207.65, B3: 246.94, E4: 329.63, Fs4: 369.99, Gs4: 415.3, B4: 493.88,
    E5: 659.25, Fs5: 739.99, Gs5: 830.61, B5: 987.77, Cs6: 1108.73, E6: 1318.51, Gs6: 1661.22, B6: 1975.53, E7: 2637.02 };
  const ss = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

  // ---- sound: one AudioContext for the page, let in by the first click or key on it ------------------------------------
  let AC = null;
  function ctxOf() {
    if (AC) return AC;
    const K = window.AudioContext || window.webkitAudioContext;
    if (!K) return null;
    try { AC = new K({ latencyHint: 'playback' }); } catch (e) { try { AC = new K(); } catch (e2) { return null; } }
    return AC;
  }
  const unlock = () => { const c = ctxOf(); if (c && c.state === 'suspended') c.resume().catch(() => {}); };
  ['pointerdown', 'keydown', 'touchend'].forEach((t) => addEventListener(t, unlock, true));

  /** A small synthesizer: a compressor on the way out, a hall (a generated impulse response) on a send, and the few
   *  voices the score is written in. Everything is scheduled ahead on the context's clock. stop() fades it out. */
  function makeSynth(ctx) {
    const rnd = mulberry(0xC0FFEE);
    const master = ctx.createGain(); master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.3;
    master.connect(comp); comp.connect(ctx.destination);
    const sr = ctx.sampleRate;
    // the hall: 3.6 s of noise that darkens as it decays
    const ir = ctx.createBuffer(2, Math.floor(sr * 3.6), sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch), n = d.length; let y = 0;
      for (let i = 0; i < n; i++) { const x = i / n, a = 0.55 - 0.47 * x; y += a * ((rnd() * 2 - 1) - y); d[i] = y * Math.pow(1 - x, 3) * (i < sr * 0.015 ? i / (sr * 0.015) : 1) * 2.2; }
    }
    const verb = ctx.createConvolver(); verb.buffer = ir; const verbOut = ctx.createGain(); verbOut.gain.value = 0.8; verb.connect(verbOut); verbOut.connect(master);
    const nb = ctx.createBuffer(2, sr * 3, sr);
    for (let ch = 0; ch < 2; ch++) { const d = nb.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
    const nodes = [];
    const chan = (pan, wet, pan1, t, dur) => {
      const g = ctx.createGain(); let n = g;
      if ((pan || pan1 !== undefined) && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner(); p.pan.value = pan || 0;
        if (pan1 !== undefined) { p.pan.setValueAtTime(pan || 0, t); p.pan.linearRampToValueAtTime(pan1, t + dur); }
        g.connect(p); n = p;
      }
      n.connect(master);
      if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; n.connect(w); w.connect(verb); }
      return g;
    };
    const play = (node, t0, t1) => { node.start(t0); node.stop(t1); nodes.push(node); return node; };
    const noise = (t0, t1) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(t0, rnd() * 2); s.stop(t1); nodes.push(s); return s; };
    const Z = 0.0001;
    /** attack to peak, hold, then an exponential release */
    const env = (p, t, a, peak, hold, rel) => { p.setValueAtTime(Z, t); p.linearRampToValueAtTime(peak, t + a); p.setValueAtTime(peak, t + a + hold); p.exponentialRampToValueAtTime(Z, t + a + hold + rel); };
    const filt = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q === undefined ? 0.7 : q; return b; };
    const S = {
      /** a low hit: a sine falling in pitch, with a short knock */
      boom(t, o) {
        const { f0 = 70, f1 = 32, dur = 1.2, gain = 0.8, pan = 0, wet = 0.15 } = o || {};
        const c = chan(pan, wet), g = ctx.createGain(); g.connect(c);
        const os = ctx.createOscillator(); os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
        os.connect(g); env(g.gain, t, 0.006, gain, 0, dur); play(os, t, t + dur + 0.1);
        const n = noise(t, t + 0.1), lp = filt('lowpass', 1300), ng = ctx.createGain(); n.connect(lp); lp.connect(ng); ng.connect(c); env(ng.gain, t, 0.002, gain * 0.3, 0, 0.07);
      },
      /** a bell-like tone with a faint octave */
      ping(t, o) {
        const { f = 880, dur = 1.5, gain = 0.08, pan = 0, wet = 0.6, type = 'sine' } = o || {};
        const c = chan(pan, wet);
        [[f, 1], [f * 2.005, 0.22], [f * 3.01, 0.06]].forEach(([fr, k]) => { const os = ctx.createOscillator(); os.type = type; os.frequency.value = fr; const g = ctx.createGain(); os.connect(g); g.connect(c); env(g.gain, t, 0.004, gain * k, 0, dur * (k < 1 ? 0.6 : 1)); play(os, t, t + dur + 0.1); });
      },
      /** a click: noise through a band */
      click(t, o) {
        const { f = 3000, q = 1.5, dur = 0.03, gain = 0.2, pan = 0, wet = 0.1 } = o || {};
        const c = chan(pan, wet), n = noise(t, t + dur + 0.05), b = filt('bandpass', f, q), g = ctx.createGain(); n.connect(b); b.connect(g); g.connect(c); env(g.gain, t, 0.001, gain, 0, dur);
      },
      /** filtered noise whose band moves from f0 to f1, swelling to `peak` at `at` (0..1) of its length */
      sweep(t, dur, o) {
        const { type = 'bandpass', f0 = 400, f1 = 3000, q = 1, peak = 0.1, at = 0.5, pan = 0, pan1, wet = 0.3 } = o || {};
        const c = chan(pan, wet, pan1, t, dur), n = noise(t, t + dur + 0.05), b = filt(type, f0, q), g = ctx.createGain();
        b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + dur);
        n.connect(b); b.connect(g); g.connect(c);
        const tp = t + Math.max(0.003, at * dur);
        g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(peak, tp); g.gain.exponentialRampToValueAtTime(Z, Math.max(tp + 0.02, t + dur));
      },
      /** a voice gliding from f0 to f1 (lowpassed), its level rising over `a` */
      glide(t, dur, f0, f1, o) {
        const { type = 'sine', gain = 0.1, a = 0.05, r = 0.3, lp0 = 8000, lp1 = 8000, pan = 0, wet = 0.2 } = o || {};
        const c = chan(pan, wet), lp = filt('lowpass', lp0), g = ctx.createGain(); lp.connect(g); g.connect(c);
        lp.frequency.setValueAtTime(lp0, t); lp.frequency.exponentialRampToValueAtTime(lp1, t + dur);
        [-6, 6].forEach((det) => { const os = ctx.createOscillator(); os.type = type; os.detune.value = det; os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(f1, t + dur); os.connect(lp); play(os, t, t + dur + r + 0.05); });
        g.gain.setValueAtTime(Z, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.max(0.01, a)); g.gain.setValueAtTime(gain, t + Math.max(a, dur)); g.gain.exponentialRampToValueAtTime(Z, t + Math.max(a, dur) + r);
      },
      /** a chord of detuned voices through a lowpass that opens from cut0 to cut1 */
      pad(t, dur, freqs, o) {
        const { type = 'sawtooth', det = 8, cut0 = 400, cut1 = 1200, q = 0.7, gain = 0.08, a = 2, r = 2, wet = 0.5, pan = 0 } = o || {};
        const c = chan(pan, wet), lp = filt('lowpass', cut0, q), g = ctx.createGain(); lp.connect(g); g.connect(c);
        lp.frequency.setValueAtTime(cut0, t); lp.frequency.exponentialRampToValueAtTime(cut1, t + Math.max(0.1, dur));
        const k = 1 / Math.sqrt(freqs.length);
        freqs.forEach((f) => (type === 'sine' ? [0] : [-det, det]).forEach((d) => { const os = ctx.createOscillator(); os.type = type; os.frequency.value = f; os.detune.value = d; const vg = ctx.createGain(); vg.gain.value = k; os.connect(vg); vg.connect(lp); play(os, t, t + dur + r + 0.1); }));
        env(g.gain, t, Math.min(a, dur), gain, Math.max(0, dur - a), r);
      },
      /** a soft "choir": triangles with a slow vibrato, mostly in the hall */
      choir(t, dur, freqs, o) {
        const { gain = 0.03, a = 3, r = 1, wet = 0.9 } = o || {};
        const c = chan(0, wet), g = ctx.createGain(); g.connect(c); env(g.gain, t, Math.min(a, dur), gain, Math.max(0, dur - a), r);
        freqs.forEach((f, i) => { const os = ctx.createOscillator(); os.type = 'triangle'; os.frequency.value = f; const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6 + i * 0.37; const lg = ctx.createGain(); lg.gain.value = f * 0.004; lfo.connect(lg); lg.connect(os.frequency); os.connect(g); play(os, t, t + dur + r + 0.1); play(lfo, t, t + dur + r + 0.1); });
      },
      /** sparkles: quick high bells one after another */
      shimmer(t, notes, o) {
        const { step = 0.1, gain = 0.03, dur = 1.8, wet = 0.8 } = o || {};
        notes.forEach((f, i) => S.ping(t + i * step, { f, gain, dur, wet, pan: (i % 3 - 1) * 0.45 }));
      },
      /** a metallic ring (the scissors' blades) */
      metal(t, freqs, o) {
        const { dur = 0.8, gain = 0.04, wet = 0.5 } = o || {};
        const c = chan(0, wet); freqs.forEach((f, i) => { const os = ctx.createOscillator(); os.frequency.value = f; const g = ctx.createGain(); os.connect(g); g.connect(c); env(g.gain, t, 0.002, gain / (1 + i * 0.4), 0, dur / (1 + i * 0.3)); play(os, t, t + dur + 0.1); });
      },
      rnd,
      /** fades everything out over `sec` and stops it */
      stop(sec = 0.4) {
        const t = ctx.currentTime;
        try { master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + sec); } catch (e) {}
        setTimeout(() => { nodes.forEach((n) => { try { n.stop(); } catch (e) {} }); try { master.disconnect(); } catch (e) {} }, (sec + 0.2) * 1000);
      },
    };
    return S;
  }

  /** The score up to the video: timeline `from` (seconds from "go") plays at context time c0. A sound that began before
   *  `from` (a late start) comes in from there; a hit that is over is left out. */
  function scoreIntro(S, from, c0) {
    const C = KK();
    const T = (tl) => c0 + (tl - from);
    const one = (tl, fn) => { if (tl >= from - 0.03) fn(T(Math.max(tl, from))); };
    const long = (tl, dur, fn) => { if (tl + dur <= from + 0.05) return; const s = Math.max(tl, from); fn(T(s), dur - (s - tl)); };
    // the dark hall: a sub drone and a low pad that slowly open, a crescendo from near silence to the cut
    long(0.1, C.CUT - 0.1, (t, d) => S.pad(t, d, [E.E1], { type: 'sine', gain: 0.16, a: Math.max(0.5, d - 2), r: 0.25, cut0: 300, cut1: 300, wet: 0.05 }));
    long(0.3, C.CUT - 0.35, (t, d) => S.pad(t, d, [E.E1, E.B1, E.E2, E.B2], { gain: 0.045, a: Math.max(0.5, d - 4), r: 0.3, cut0: 140, cut1: 900, det: 9, wet: 0.35 }));
    // the lights come on rib by rib from us toward the doors: a breaker's knock each (farther, softer, more hall), and
    // the hall's hum under them
    for (let i = 0; i < 10; i++) one(C.LIGHTS + i * 2.3 / 9, (t) => {
      const k = i / 9;
      S.boom(t, { f0: 120 - 30 * k, f1: 48, dur: 0.34, gain: 0.42 - 0.18 * k, wet: 0.25 + 0.4 * k, pan: (i % 2 ? 0.3 : -0.3) * (1 - k) });
      S.click(t, { f: 1500 + i * 110, q: 1.4, dur: 0.05, gain: 0.13 - 0.06 * k, wet: 0.3 + 0.4 * k, pan: (i % 2 ? 0.3 : -0.3) * (1 - k) });
    });
    long(C.LIGHTS + 0.1, C.CUT - C.LIGHTS - 0.1, (t, d) => S.glide(t, d, E.B1, E.B1, { type: 'sawtooth', gain: 0.022, a: 2.4, r: 0.3, lp0: 170, lp1: 260, wet: 0.15 }));
    // the doors light up
    one(C.DOOR_ON - 0.25, (t) => S.sweep(t, 0.5, { f0: 700, f1: 4200, q: 4, peak: 0.045, at: 0.85, wet: 0.3 }));
    one(C.DOOR_ON, (t) => {
      S.boom(t, { f0: 60, f1: 28, dur: 2.8, gain: 0.6, wet: 0.5 }); S.click(t, { f: 900, q: 0.8, dur: 0.08, gain: 0.16, wet: 0.5 });
      S.shimmer(t + 0.15, [E.E6, E.Gs6, E.B6, E.E7, E.B6, E.Gs6, E.E7], { step: 0.12, gain: 0.024 });
    });
    // the words, and warmth under them until the countdown
    one(C.EYEBROW, (t) => S.ping(t, { f: E.E5, dur: 2.4, gain: 0.04, wet: 0.8 }));
    one(C.TITLE, (t) => S.boom(t, { f0: 58, f1: 29, dur: 2.6, gain: 0.5, wet: 0.45 }));
    one(C.LINE, (t) => S.ping(t, { f: E.B5, dur: 2.4, gain: 0.035, wet: 0.8 }));
    long(C.TITLE, C.COUNT - C.TITLE + 0.3, (t, d) => S.pad(t, d, [E.E2, E.B2, E.E3, E.Gs3, E.B3, E.Fs4], { gain: 0.05, a: 2.5, r: 1.2, cut0: 320, cut1: 1100, det: 8, wet: 0.55 }));
    long(C.TITLE + 1, C.COUNT - C.TITLE - 1, (t, d) => S.choir(t, d, [E.E4, E.Gs4, E.B4], { gain: 0.02, a: 3, r: 1 }));
    // the spotlight on the ribbon, and the guest of honour
    one(C.SPOT, (t) => { S.boom(t, { f0: 140, f1: 60, dur: 0.42, gain: 0.4, wet: 0.45 }); S.click(t, { f: 950, q: 0.8, dur: 0.08, gain: 0.2, wet: 0.5 }); });
    one(C.HONOR, (t) => [E.E5, E.Gs5, E.B5].forEach((f, i) => S.ping(t + i * 0.2, { f, dur: 2.2, gain: 0.04, wet: 0.8, pan: (i - 1) * 0.35 })));
    // the countdown: a riser for all ten seconds, a heartbeat and a bell on every second, heavier and warmer on 3, 2, 1
    long(C.COUNT, C.CUT - C.COUNT, (t, d) => S.sweep(t, d, { f0: 220, f1: 6500, q: 1.1, peak: 0.15, at: 0.995, wet: 0.25 }));
    long(C.COUNT, C.CUT - C.COUNT, (t, d) => S.glide(t, d, E.E2, E.E3, { type: 'sawtooth', gain: 0.05, a: d * 0.98, r: 0.03, lp0: 280, lp1: 2600 }));
    for (let i = 0; i < 10; i++) one(C.COUNT + i, (t) => {
      const k = i / 9;
      S.boom(t, { f0: 70, f1: 38, dur: 0.5, gain: 0.5 + 0.3 * k, wet: 0.15 }); S.boom(t + 0.17, { f0: 58, f1: 34, dur: 0.45, gain: 0.3 + 0.2 * k, wet: 0.15 });
      S.ping(t, { f: i >= 7 ? E.Gs6 : E.E6, dur: 1.3, gain: 0.04 + 0.03 * k, wet: 0.65 });
      S.click(t, { f: 5200, q: 3, dur: 0.025, gain: 0.08 });
      if (i >= 7) { S.boom(t, { f0: 120, f1: 55, dur: 0.45, gain: 0.32 }); S.click(t, { f: 700, q: 0.8, dur: 0.09, gain: 0.2 }); }
    });
    // the cut: the blade comes down (a swish and a ring), then the impact, sparks, and the two halves of the ribbon falling
    one(C.CUT - 0.24, (t) => S.sweep(t, 0.26, { f0: 1300, f1: 7500, q: 1.4, peak: 0.26, at: 0.85, wet: 0.2 }));
    one(C.CUT, (t) => {
      S.metal(t, [3120, 4470, 6230, 7900], { dur: 1.3, gain: 0.04, wet: 0.5 });
      S.boom(t, { f0: 62, f1: 24, dur: 3.4, gain: 1.0, wet: 0.3 });
      S.sweep(t, 3.0, { type: 'lowpass', f0: 9000, f1: 380, q: 0.5, peak: 0.45, at: 0.004, wet: 0.65 });
      for (let i = 0; i < 26; i++) S.click(t + 0.02 + Math.pow(S.rnd(), 1.6) * 0.9, { f: 3500 + S.rnd() * 5000, q: 2, dur: 0.012, gain: 0.05 + S.rnd() * 0.05, pan: S.rnd() * 1.6 - 0.8, wet: 0.3 });
      for (let i = 0; i < 12; i++) S.ping(t + S.rnd() * 0.7, { f: 2000 + S.rnd() * 4500, dur: 0.5 + S.rnd() * 0.6, gain: 0.018, pan: S.rnd() * 1.6 - 0.8, wet: 0.8 });
      [-0.6, 0.6].forEach((p) => S.sweep(t + 0.08, 1.1, { f0: 1600, f1: 420, q: 0.9, peak: 0.06, at: 0.3, pan: p * 0.4, pan1: p, wet: 0.35 }));
      S.boom(t + 0.67, { f0: 170, f1: 90, dur: 0.18, gain: 0.16, wet: 0.3 });   // the bow lands
    });
    // the locks: each turns (a servo), knocks open and pulls back; then the seal turns, goes green, and air hisses in
    [0, 0.5].forEach((d, i) => {
      one(C.UNLOCK + d, (t) => S.glide(t, 0.32, 260, 520, { type: 'sawtooth', gain: 0.03, a: 0.04, r: 0.05, lp0: 900, lp1: 1600, wet: 0.2, pan: 0 }));
      one(C.UNLOCK + d + 0.32, (t) => { S.boom(t, { f0: 130, f1: 60, dur: 0.3, gain: 0.38, wet: 0.35 }); S.click(t, { f: 1250, q: 1.2, dur: 0.06, gain: 0.16, wet: 0.35 }); });
      one(C.UNLOCK + d + 0.62, (t) => S.click(t, { f: 2200 - i * 300, q: 2, dur: 0.04, gain: 0.1, wet: 0.3 }));
    });
    one(C.UNLOCK + 0.9, (t) => { S.glide(t, 0.7, 95, 72, { type: 'sawtooth', gain: 0.06, a: 0.08, r: 0.1, lp0: 500, lp1: 300, wet: 0.3 }); S.sweep(t, 0.7, { f0: 1800, f1: 900, q: 6, peak: 0.03, at: 0.5, wet: 0.3 }); });
    one(C.UNLOCK + 1.4, (t) => { S.ping(t, { f: E.E5, dur: 2.4, gain: 0.05, wet: 0.7 }); S.ping(t + 0.09, { f: E.B5, dur: 2.4, gain: 0.04, wet: 0.7 }); });
    one(C.UNLOCK + 1.15, (t) => S.sweep(t, 2.2, { type: 'highpass', f0: 7000, f1: 2600, q: 0.6, peak: 0.1, at: 0.15, wet: 0.35 }));
    // the doors: the motors, a rumble, the air of outside, and the stop
    long(C.OPEN, C.OPEN_DUR, (t, d) => {
      S.sweep(t, d, { type: 'lowpass', f0: 110, f1: 190, q: 0.9, peak: 0.3, at: 0.45, wet: 0.2 });
      S.glide(t, d, E.E1, E.B1 * 0.9, { type: 'sawtooth', gain: 0.07, a: 0.8, r: 0.6, lp0: 180, lp1: 240, wet: 0.2 });
      S.sweep(t + 0.3, Math.max(0.5, d - 0.6), { type: 'highpass', f0: 3200, f1: 800, q: 0.6, peak: 0.1, at: 0.3, wet: 0.35 });
    });
    one(C.OPEN + C.OPEN_DUR - 0.15, (t) => { S.boom(t, { f0: 72, f1: 38, dur: 0.9, gain: 0.34, wet: 0.35 }); S.click(t, { f: 850, q: 1, dur: 0.08, gain: 0.12, wet: 0.4 }); });
    // space: a deep floor, the sunrise swells, a choir, sparkles; through the doorway, a breath of wind
    long(C.OPEN + 0.4, C.FLASH - C.OPEN - 0.4, (t, d) => S.pad(t, d, [E.E1], { type: 'sine', gain: 0.2, a: 2, r: 0.2, cut0: 300, cut1: 300, wet: 0 }));
    long(C.OPEN + 0.6, C.FLASH - C.OPEN - 0.6, (t, d) => S.pad(t, d, [E.E3, E.B3, E.E4, E.Gs4], { type: 'triangle', gain: 0.035, a: 3, r: 0.3, cut0: 1400, cut1: 1400, det: 5, wet: 0.8 }));
    long(C.SUN, C.FLASH - C.SUN, (t, d) => S.pad(t, d, [E.E2, E.B2, E.E3, E.Gs3, E.B3, E.E4, E.Fs4, E.B4], { gain: 0.085, a: 5.5, r: 0.25, cut0: 260, cut1: 4200, det: 11, wet: 0.55 }));
    long(C.SUN + 1, C.FLASH - C.SUN - 1, (t, d) => S.choir(t, d, [E.E4, E.Gs4, E.B4, E.E5], { gain: 0.03, a: 4, r: 0.25 }));
    one(C.SUN + 1.6, (t) => S.shimmer(t, [E.E6, E.B5, E.Gs6, E.E6, E.B6, E.Gs6, E.E7], { step: 0.32, gain: 0.02 }));
    long(C.EXIT, C.OUTSIDE - C.EXIT + 0.4, (t, d) => [-0.75, 0.75].forEach((p) => S.sweep(t, d, { f0: 300, f1: 2400, q: 0.8, peak: 0.08, at: 0.75, pan: 0, pan1: p, wet: 0.3 })));
    one(C.TAG, (t) => { S.boom(t, { f0: 66, f1: 31, dur: 2.4, gain: 0.5, wet: 0.5 }); S.ping(t, { f: E.E5, dur: 3, gain: 0.05, wet: 0.8 }); S.ping(t, { f: E.B5, dur: 3, gain: 0.035, wet: 0.8 }); S.ping(t + 0.06, { f: E.E6, dur: 3, gain: 0.025, wet: 0.8 }); });
    // the dive, into the flash; then a breath of silence before the video
    long(C.PLUNGE, C.FLASH - C.PLUNGE, (t, d) => { S.sweep(t, d, { f0: 180, f1: 7500, q: 0.7, peak: 0.3, at: 0.99, wet: 0.3 }); S.glide(t, d, 55, 440, { type: 'sawtooth', gain: 0.08, a: d * 0.97, r: 0.05, lp0: 300, lp1: 5000 }); });
    one(C.FLASH, (t) => { S.boom(t, { f0: 52, f1: 24, dur: 1.6, gain: 0.85, wet: 0.45 }); S.sweep(t, 1.4, { type: 'lowpass', f0: 7000, f1: 300, peak: 0.3, at: 0.004, wet: 0.7 }); });
  }
  /** The score of the closing, from its start (c0): air as the Earth pulls back, "welcome", the wall waking, the landing. */
  function scoreFinale(S, c0) {
    const C = KK(), T = (tl) => c0 + tl;
    S.sweep(T(0.2), 2.6, { f0: 2600, f1: 480, q: 0.7, peak: 0.06, at: 0.45, wet: 0.5 });
    S.glide(T(0), 1.3, 45, 110, { gain: 0.1, a: 0.9, r: 0.5 });
    S.pad(T(0.5), C.LAND - 0.2, [E.E2, E.B2, E.E3, E.Gs3, E.B3, E.E4, E.B4], { gain: 0.06, a: 1.8, r: 2.2, cut0: 450, cut1: 1800, wet: 0.55 });
    S.boom(T(C.F_TXT), { f0: 66, f1: 31, dur: 2.6, gain: 0.5, wet: 0.5 });
    S.shimmer(T(C.F_TXT + 0.1), [E.E6, E.Gs6, E.B6, E.E7], { step: 0.13, gain: 0.024 });
    S.choir(T(C.F_TXT + 0.3), C.LAND - C.F_TXT, [E.E4, E.Gs4, E.B4, E.E5], { gain: 0.026, a: 2.5, r: 1.5 });
    S.sweep(T(C.WAKE - 0.2), 1.6, { f0: 500, f1: 4200, q: 1.1, peak: 0.07, at: 0.8, wet: 0.35 });
    S.boom(T(C.LAND), { f0: 64, f1: 30, dur: 3, gain: 0.55, wet: 0.5 });
    S.pad(T(C.LAND), 3.2, [E.E3, E.B3, E.E4, E.Gs4, E.B4, E.E5], { type: 'triangle', gain: 0.05, a: 0.08, r: 3.6, cut0: 5000, cut1: 2000, wet: 0.7 });
    S.shimmer(T(C.LAND + 0.1), [E.E6, E.B6, E.E7, E.Gs6, E.B6, E.E7], { step: 0.09, gain: 0.022 });
  }

  // The page's sound, for the wall (ready: the browser lets it play) and for a recording (render: the whole score, offline).
  window.cerSound = {
    ctx: ctxOf,
    ready: () => !!AC && AC.state === 'running',
    /** WAV bytes of the score: the intro from 0, the closing at `fin` seconds (a preview recording; no video sound). */
    async render(secs, fin) {
      const K = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 48000, ctx = new K(2, Math.ceil(secs * sr), sr);
      const S = makeSynth(ctx); scoreIntro(S, 0, 0); if (fin != null) scoreFinale(makeSynth(ctx), fin);
      const buf = await ctx.startRendering(), n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
      const out = new DataView(new ArrayBuffer(44 + n * 4)), w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
      out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
      return new Uint8Array(out.buffer);
    },
  };

  // ---- the 3D stage, built ahead by the standby screen (hidden) and handed to the ceremony when it starts ----------
  // One at a time: { key (its words and language), p (a promise of { stage, el }), taken }.
  let PRE = null;
  const stageKey = (texts, en) => JSON.stringify([texts || null, !!en]);
  const build = (texts, en, parent) => {
    const el = document.createElement('div'); el.style.cssText = 'position:absolute;inset:0;overflow:hidden';
    parent.appendChild(el);
    return window.CerStage.create(el, { texts, en }).then((stage) => ({ stage, el }), (e) => { el.remove(); throw e; });
  };
  const drop = (pre) => { pre.p.then((x) => { try { x.stage.dispose(); } catch (e) {} x.el.remove(); if (x.park) x.park.remove(); }, () => {}); };
  function prepare(texts, en) {
    const key = stageKey(texts, en);
    if (PRE && PRE.key === key && !PRE.taken) return;
    if (PRE && !PRE.taken) drop(PRE);
    if (!window.CerStage) { PRE = null; return; }
    // a 1920×1080 box off to the side, not shown: the stage compiles there and draws its first frames once, so every
    // shader and buffer is ready
    const park = document.createElement('div');
    park.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;visibility:hidden;pointer-events:none;z-index:-1;overflow:hidden';
    document.body.appendChild(park);
    const p = build(texts, en, park).then((x) => { try { x.stage.render(30, null); x.stage.render(0, null); } catch (e) {} x.park = park; return x; }, (e) => { park.remove(); throw e; });
    p.catch(() => {});
    PRE = { key, p, taken: false };
  }
  /** the stage built ahead for these words, if there is one (the ceremony takes it) */
  const claim = (texts, en) => { if (!PRE || PRE.taken || PRE.key !== stageKey(texts, en)) return null; PRE.taken = true; return PRE.p; };
  const release = (texts, en) => { const k = stageKey(texts, en); setTimeout(() => { if (PRE && !PRE.taken && PRE.key === k) { drop(PRE); PRE = null; } }, 4000); };

  // ---- the video, fetched whole by the standby screen, so the ceremony plays it from memory (a slow or busy network
  // can't stall it mid-film). One at a time: { src, url (an object URL once all of it is here), ctl, taken }.
  let VID = null;
  const vidSrc = (video) => video || '/assets/ceremony/promo-v9-1080.mp4';
  const dropVideo = () => { if (!VID) return; try { VID.ctl.abort(); } catch (e) {} if (VID.url) URL.revokeObjectURL(VID.url); VID = null; };
  function fetchVideo(video) {
    const src = vidSrc(video);
    if (VID && VID.src === src && !VID.taken) return;
    if (VID && !VID.taken) dropVideo();
    if (!window.fetch || !window.AbortController || !window.URL || !URL.createObjectURL) return;
    const v = { src, url: null, ctl: new AbortController(), taken: false };
    VID = v;
    fetch(src, { signal: v.ctl.signal }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((b) => { if (VID === v && !v.taken && b.size > 100e3) v.url = URL.createObjectURL(b); }).catch(() => {});
  }
  /** what the ceremony plays: the copy in memory if all of it is here, else the link itself (and the fetch stops, so
   *  the video gets the whole network) */
  const claimVideo = (video) => {
    const src = vidSrc(video);
    if (!VID || VID.src !== src || VID.taken) return { src, mine: null };
    if (!VID.url) { dropVideo(); return { src, mine: null }; }
    VID.taken = true; return { src: VID.url, mine: VID };
  };
  window.__cerVid = () => VID && { src: VID.src, ready: !!VID.url, taken: VID.taken };   // (for a test: is it all here)
  const releaseVideo = (video) => { const src = vidSrc(video); setTimeout(() => { if (VID && !VID.taken && VID.src === src) dropVideo(); }, 4000); };

  window.makeCeremony = (React) => {
    const h = React.createElement, { useState, useEffect, useRef } = React;
    const C = KK();
    const LEX = "'Lexend',sans-serif", MONO = "'IBM Plex Mono',monospace", HEB = 'Heebo, sans-serif';
    const EN = () => window.wallLang === 'en';
    const rate = () => window.__cerRate || 1;   // a preview recording plays slowed down (the frames are then sped up)
    const abs = (x, y, w, hh, extra) => Object.assign({ position: 'absolute', left: x, top: y, width: w, height: hh }, extra);
    const full = (extra) => Object.assign({ position: 'absolute', inset: 0 }, extra);

    // The standby screen's words: the remote's (design.ceremony.texts; Hebrew, so the English wall keeps these) or these.
    const DEF = { eyebrow: ['טקס חנוכת המשרדים החדשים', 'INAUGURATION CEREMONY'], title: ['מנהלת החלל', 'SPACE PROGRAM OFFICE'], line: ['הבית החדש במידטאון', 'OUR NEW HOME IN MIDTOWN'],
      soon: ['הטקס יתחיל בקרוב', 'THE CEREMONY WILL BEGIN SHORTLY'] };
    const OPT = { eyebrow: 1, line: 1 };
    const txt = (texts, k) => { const v = texts && texts[k]; if (typeof v === 'string') { if (v.trim() && !EN()) return v.trim(); if (!v.trim() && OPT[k]) return ''; } return DEF[k][EN() ? 1 : 0]; };
    // the largest size up to `max` at which `text` fits `width` (a TV is 640 wide: words stay inside one)
    const mc = document.createElement('canvas').getContext('2d');
    const fit = (text, weight, family, max, width, track) => { mc.font = `${weight} ${max}px ${family}`; const w = mc.measureText(text).width * (1 + (track || 0)); return w > width ? Math.max(16, Math.floor(max * width / w)) : max; };
    const titleFont = (s) => (/[֐-׿]/.test(s) ? { family: 'Heebo', css: HEB, weight: 800, track: 0, ls: '0' } : { family: 'Lexend', css: LEX, weight: 500, track: 0.04, ls: '.04em' });
    // the standby screen's stars: one tile, drawn once
    const starTile = () => window.__cerStars || (window.__cerStars = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), rnd = mulberry(77);
      for (let i = 0; i < 230; i++) { const r = rnd() < 0.1 ? 1.3 : 0.7; g.fillStyle = `rgba(225,236,255,${(0.12 + rnd() * 0.5).toFixed(2)})`; g.beginPath(); g.arc(rnd() * 512, rnd() * 512, r, 0, 6.283); g.fill(); }
      return c.toDataURL();
    })());
    const SKY = () => `url(${starTile()}) 0 0/512px 512px repeat, radial-gradient(ellipse 1300px 860px at 960px 520px, #10295a 0%, #081430 52%, #030812 100%)`;
    // The directorate's emblem in a glowing disc (the realistic 3D emblem's still, like the Yizkor screen's).
    const Seal = ({ d, style }) => h('div', { style: Object.assign({ position: 'absolute', width: d, height: d, borderRadius: '50%' }, style) },
      h('div', { style: { position: 'absolute', inset: -d * 0.35, borderRadius: '50%', background: 'radial-gradient(circle closest-side, rgba(110,180,255,.30), rgba(70,130,230,.10) 55%, transparent)' } }),
      h('img', { src: '/assets/emblem-3d.png', alt: '', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 0 24px rgba(110,180,255,.35))' } }));

    /** props: start (performance.now() of second 0; may be past), video (url), texts, preview, end (performance.now() of
     *  the remote's "end": straight to the closing), onWake (the home wall should wake under the closing), onDone. */
    const Ceremony = (props) => {
      const { start, video, texts, preview } = props;
      const T = useRef(() => (performance.now() - start) / 1000 * rate()).current;
      window.__cerClock = T;   // (where the sequence is: for a preview recording's sync)
      const host = useRef(null), vid = useRef(null), flash = useRef(null), cb = useRef(props); cb.current = props;
      const r = useRef({ fin: null, finAt: 0, cutAt: 0, synth: null, played: false, stage: null, failed: false }).current;
      const vs = useRef(null); if (!vs.current) vs.current = preview ? { src: vidSrc(video), mine: null } : claimVideo(video);
      useEffect(() => () => { const m = vs.current.mine; if (m) setTimeout(() => { URL.revokeObjectURL(m.url); if (VID === m) VID = null; }, 1500); }, []);
      const [st, setSt] = useState(() => ({ base: true, fin: null, vidOn: T() >= C.VIDEO }));
      const ftOf = () => (r.fin == null ? null : (performance.now() - r.finAt) / 1000 * rate());
      // without the 3D stage (no WebGL), the video at once and a short closing
      const KW = () => (r.failed ? 0.4 : C.WAKE), KD = () => (r.failed ? 2.2 : C.DONE);
      const finish = (why) => {
        if (r.fin != null) return;
        r.fin = T(); r.finAt = performance.now(); window.__cerFinAt = r.fin;
        if (why === 'end' && r.fin < C.VIDEO) r.cutAt = performance.now();   // ended before the video: a cut through white
        if (r.synth && why === 'end') r.synth.stop(0.6);
        const c = window.cerSound.ready() && rate() === 1 && !preview ? ctxOf() : null;
        if (c && !r.failed) { const S = makeSynth(c); scoreFinale(S, c.currentTime + 0.03); r.finSynth = S; }
        const v = vid.current;
        if (v) { try { v.animate([{ opacity: 1 }, { opacity: 0 }], { delay: r.failed ? 0 : 900, duration: 1100, fill: 'forwards', easing: 'ease-in-out' }); } catch (e) {} if (v.volume) { const t0 = performance.now(), fade = () => { const k = 1 - (performance.now() - t0) / 1500; if (!vid.current) return; v.volume = Math.max(0, k); if (k > 0) requestAnimationFrame(fade); else v.pause(); }; requestAnimationFrame(fade); } }
        setSt((s) => Object.assign({}, s, { fin: r.fin }));
      };
      // the picture: the stage the standby screen built (or a new one), drawn every frame on the clock
      useEffect(() => {
        if (preview) return;
        let dead = false, raf = 0, n = 0, acc = 0, last = 0, settle = 40, mine = null;
        const box = host.current, en = EN();
        const got = claim(texts, en) || (window.CerStage ? build(texts, en, box) : Promise.reject(new Error('no stage')));
        const loop = () => {
          raf = requestAnimationFrame(loop);
          const now = performance.now(), t = T(), ft = ftOf();
          // the white over the cut to the video (and over an early "end")
          const fo = Math.max(ft == null ? ss(C.FLASH - 0.05, C.FLASH, t) * (1 - ss(C.VIDEO + 0.1, C.VIDEO + 1.3, t)) : 0,
            r.cutAt ? Math.max(0, 1 - (now - r.cutAt) * rate() / 700) : 0);
          if (flash.current) flash.current.style.opacity = fo.toFixed(3);
          const S = r.stage;
          if (!S) return;
          if (ft == null && t > C.VIDEO + 0.3) { box.style.visibility = 'hidden'; last = 0; return; }   // under the video
          if (ft != null && ft > C.DONE + 0.3) { box.style.visibility = 'hidden'; return; }
          box.style.visibility = 'visible';
          S.render(ft == null ? t : 0, ft);
          // a computer that cannot keep up draws at a lower resolution (never below 60%) instead of stuttering
          if (last && rate() === 1 && settle-- <= 0) {
            acc += now - last; n++;
            if (n >= 30) { if (acc / n > 40 && S.scale > 0.62) { S.setScale(S.scale * 0.85); settle = 40; } n = 0; acc = 0; }
          }
          last = now;
        };
        got.then((x) => {
          mine = x;
          if (dead) { drop({ p: Promise.resolve(x) }); return; }
          if (x.el.parentNode !== box) box.appendChild(x.el);
          if (x.park) { x.park.remove(); x.park = null; }
          r.stage = x.stage;
        }, () => { if (!dead) r.failed = true; });
        raf = requestAnimationFrame(loop);
        return () => { dead = true; cancelAnimationFrame(raf); if (mine) drop({ p: Promise.resolve(mine) }); r.stage = null; };
      }, []);
      // the score, from where the picture is (now, or once the browser lets sound play)
      useEffect(() => {
        if (preview || rate() !== 1) return;
        const c = ctxOf();
        const go = () => { if (r.synth || r.fin != null || r.failed || !c || c.state !== 'running') return; const t = T(); if (t > C.FLASH) return; r.synth = makeSynth(c); scoreIntro(r.synth, t, c.currentTime + 0.03); };
        go();
        if (c && c.state !== 'running') { c.addEventListener('statechange', go); c.resume().catch(() => {}); }
        return () => { if (c) c.removeEventListener('statechange', go); if (r.synth) r.synth.stop(0.3); if (r.finSynth) r.finSynth.stop(0.3); };
      }, []);
      // the video starts at its second; the closing wakes the wall and ends
      useEffect(() => {
        const id = setInterval(() => {
          const t = T(), fin = r.fin, ft = ftOf();
          const due = fin == null && (t >= C.VIDEO || r.failed);
          setSt((s) => {
            const n = { base: fin == null || ft < 2.6, fin: s.fin, vidOn: s.vidOn || due };
            return n.base === s.base && n.vidOn === s.vidOn ? s : n;
          });
          if (due && !r.played) {
            r.played = true; const v = vid.current;
            if (!v || preview) { finish('novideo'); return; }
            try { if (!r.failed && t > C.VIDEO + 0.5 && v.duration) v.currentTime = Math.min(v.duration - 0.5, t - C.VIDEO); } catch (e) {}
            v.playbackRate = rate(); v.muted = false; v.volume = 1;
            const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => finish('novideo')); });
            r.vidWatch = setTimeout(() => { if (v.paused || v.currentTime < 0.05) finish('novideo'); }, 6000 / rate());
          }
          if (fin != null) {
            if (ft >= KW() && !r.woke) { r.woke = true; cb.current.onWake && cb.current.onWake(); }
            if (ft >= KD() && !r.done) { r.done = true; cb.current.onDone && cb.current.onDone(); }
          }
        }, 50);
        return () => { clearInterval(id); clearTimeout(r.vidWatch); };
      }, []);
      // "end" from the remote: the closing now, from wherever it is
      useEffect(() => { if (props.end) finish('end'); }, [props.end]);
      if (preview) return h('div', { style: full({ zIndex: 50, background: 'radial-gradient(ellipse at 50% 45%, #10295a, #030812 70%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, fontFamily: HEB, color: '#e6f1ff', direction: EN() ? 'ltr' : 'rtl' }) },
        h(Seal, { d: 240, style: { position: 'relative' } }),
        h('div', { style: { fontSize: 72, fontWeight: 800 } }, EN() ? 'Ribbon-cutting opening' : 'פתיחת טקס גזירת הסרט'),
        h('div', { style: { fontSize: 40, color: '#9fdcff' } }, EN() ? 'Playing on the wall' : 'מוצגת עכשיו בצג'));
      // under the video until its end, then over it (the video fades out over the Earth pulling back)
      return h('div', { style: { position: 'absolute', inset: 0, zIndex: 50, overflow: 'hidden', direction: 'ltr', pointerEvents: 'none', fontFamily: HEB, color: '#e6f1ff', animation: 'ovIn .9s ease both' } },
        st.base ? h('div', { key: 'base', style: full({ background: '#000' }) }) : null,
        h('div', { key: 'stage', ref: host, style: full() }),
        st.base ? h('video', { key: 'v', ref: vid, src: vs.current.src, preload: 'auto', playsInline: true, onEnded: () => finish('ended'), onError: () => { if (r.played) finish('novideo'); },
          style: full({ width: '100%', height: '100%', objectFit: 'cover', background: '#000', visibility: st.vidOn ? 'visible' : 'hidden' }) }) : null,
        h('div', { key: 'flash', ref: flash, style: full({ background: '#fffaf2', opacity: 0 }) }));
    };

    /** Before the ceremony: the emblem, the title, "it will begin shortly", and whether the browser lets sound play. It
     *  also builds the 3D stage, hidden, so the opening starts smooth, and fetches the video whole (video: its link). */
    const Standby = ({ texts, video, preview }) => {
      const [snd, setSnd] = useState(() => window.cerSound.ready());
      const was = useRef(snd);
      useEffect(() => {
        if (preview) return;
        const en = EN();
        prepare(texts, en);
        const c = ctxOf(); if (c && c.state === 'suspended') c.resume().catch(() => {});
        const id = setInterval(() => {
          const ok = window.cerSound.ready();
          if (ok && !was.current && c) { const S = makeSynth(c), t = c.currentTime + 0.05; S.ping(t, { f: E.E5, dur: 2.2, gain: 0.06, wet: 0.7 }); S.ping(t + 0.18, { f: E.B5, dur: 2.6, gain: 0.05, wet: 0.7 }); }
          was.current = ok; setSnd(ok);
        }, 400);
        return () => { clearInterval(id); release(texts, en); };
      }, [JSON.stringify(texts || null)]);
      useEffect(() => { if (preview) return; fetchVideo(video); return () => releaseVideo(video); }, [video || '']);
      const eyebrow = txt(texts, 'eyebrow'), title = txt(texts, 'title'), line = txt(texts, 'line'), soon = txt(texts, 'soon');
      const tf = titleFont(title), rise = (i) => ({ animation: `cerRise 1400ms cubic-bezier(.16,1,.3,1) ${600 + i * 280}ms both` });
      return h('div', { style: { position: 'absolute', inset: 0, zIndex: 50, overflow: 'hidden', direction: 'ltr', pointerEvents: 'none', fontFamily: HEB, color: '#e6f1ff', background: SKY(), backgroundSize: '512px 512px, 1920px 1080px', animation: 'ovIn 1.2s ease both' } },
        // the title in the top middle TV
        h('div', { style: abs(640, 0, 640, 360, { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }) },
          eyebrow ? h('div', { dir: 'auto', style: Object.assign({ fontFamily: /[֐-׿]/.test(eyebrow) ? HEB : MONO, fontSize: /[֐-׿]/.test(eyebrow) ? 24 : 17, fontWeight: 500, letterSpacing: /[֐-׿]/.test(eyebrow) ? '.06em' : '.32em', color: '#9fdcff', whiteSpace: 'nowrap' }, rise(0)) }, eyebrow) : null,
          h('div', { dir: 'auto', style: Object.assign({ fontFamily: tf.css, fontSize: fit(title, tf.weight, tf.family, 84, 560, tf.track), fontWeight: tf.weight, letterSpacing: tf.ls, lineHeight: 1.05, color: '#f3f8ff', whiteSpace: 'nowrap', textShadow: '0 0 34px rgba(111,190,255,.45), 0 2px 18px rgba(0,0,0,.6)' }, rise(1)) }, title),
          line ? h('div', { dir: 'auto', style: Object.assign({ fontFamily: HEB, fontSize: fit(line, 300, 'Heebo', 32, 560), fontWeight: 300, color: '#cfe0f7', whiteSpace: 'nowrap', letterSpacing: '.02em' }, rise(2)) }, line) : null),
        // the emblem in the middle TV
        h('div', { style: abs(810, 390, 300, 300, { animation: 'cerIn 1600ms ease 300ms both' }) }, h(Seal, { d: 260, style: { left: 20, top: 20, animation: 'cerFloat 6s ease-in-out infinite alternate' } })),
        h('div', { dir: 'auto', style: abs(640, 760, 640, 60, { textAlign: 'center', fontSize: fit(soon, 300, 'Heebo', 36, 560), fontWeight: 300, color: '#cfe0f7', letterSpacing: '.04em', whiteSpace: 'nowrap', animation: 'cerRise 1400ms cubic-bezier(.16,1,.3,1) 1500ms both' }) },
          h('span', { style: { animation: 'breathe 4s ease-in-out infinite' } }, soon)),
        // whether sound will play: a click (or a key) on this screen lets it; "ready" goes away by itself
        preview ? null : h('div', { key: snd ? 'ok' : 'no', dir: EN() ? 'ltr' : 'rtl', style: abs(640, 900, 640, 60, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 22, fontWeight: 500, color: snd ? '#d4f25c' : '#9fdcff',
          animation: snd ? 'cerIn .5s ease both, cerOut 1s ease 6s forwards' : 'cerIn .5s ease both' }) },
          h('span', { style: { width: 10, height: 10, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 12px currentColor', animation: snd ? 'none' : 'breathe 1.6s ease-in-out infinite' } }),
          snd ? (EN() ? 'Sound is on' : 'הסאונד מוכן') : (EN() ? 'One click on this screen turns the sound on' : 'לחיצה אחת על המסך הזה מפעילה את הסאונד')));
    };

    return { Ceremony, Standby, C };
  };
})();
