// The ribbon-cutting opening (טקס גזירת הסרט): a long, scored sequence for the inauguration of the Space Program
// Office's new home, started from the remote (lib/remote-ops.ts `ceremony`). Made for the lobby's video wall, nine TVs fed
// one 1920×1080 picture (3×3, 640×360 each): every TV is one armoured door, and words never cross a seam between two TVs.
//   0 s      the wall goes dark; light runs along the seams, the nine doors power up one by one, a red ribbon unrolls
//            across the bottom row and the title comes up
//   16 s     10…1 in the medallion in the middle, a door unlocking with every second
//   26 s     the cut: the ribbon parts at the centre and springs away, sparks, a shock ring, and all nine doors open
//   then     night over the Earth, the sun rises on its limb, "a new era", and a warp into the light
//   40.8 s   the promo video (the remote's choice, else /assets/promo.mp4), full screen, with its sound
//   its end  light runs along the seams again, a closing card comes up, and its nine tiles turn away one by one onto the
//            home wall assembling behind them (wall.js: onWake, then onDone)
// Sound: synthesized here (Web Audio) on the same clock as the picture, so nothing to download and every hit lands on its
// frame. A browser plays sound only after someone clicked or pressed a key on the page (or when Chrome runs with
// --autoplay-policy=no-user-gesture-required): the standby screen says which, and a click on it is enough.
// Light on purpose (the lobby computer is weak): at most two 2D canvases at a time; everything else is CSS animation on
// transform and opacity, scheduled once at mount from one clock, so React does not re-render while it plays.
(() => {
  // ---- the timeline, in seconds from "go" -------------------------------------------------------------------------
  const C = { GRID: 0.6, POWER: 2.2, STEP: 0.5, RIBBON: 7.2, TITLE: 9.4, COUNT: 16, CUT: 26, OPEN: 26.5, RISE: 26.9, SUN: 29.8, TAG: 32,
    WARP: 37.4, FLASH: 40.4, VIDEO: 40.8,
    // the closing, from the video's end (or the remote's "end"): the wall wakes under the card at WAKE, the tiles turn from
    // FLIP and the ceremony is over at DONE
    WAKE: 4.6, FLIP: 5.2, DONE: 9.8 };
  const P = [-0.55, 0, 0.55];   // a column's place in the stereo picture: left, centre, right
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // The nine TVs: power-up spirals out from the middle; the countdown unlocks the outer eight right to left from the top
  // right (English: left to right); the doors open from the middle out.
  const POWER = [[1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0], [0, 0]];
  const UNLOCK = [[0, 2], [0, 1], [0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2]];
  const RING = (r, c) => (r === 1 && c === 1 ? 0 : r === 1 || c === 1 ? 1 : 2);
  const FLIPD = { 4: 0, 3: 0.3, 5: 0.3, 1: 0.5, 7: 0.62, 0: 0.8, 2: 0.8, 6: 0.95, 8: 0.95 };   // the closing card's tiles turn: middle first
  const E = { E1: 41.2, B1: 61.74, E2: 82.41, B2: 123.47, E3: 164.81, Gs3: 207.65, B3: 246.94, E4: 329.63, Fs4: 369.99, Gs4: 415.3, B4: 493.88,
    E5: 659.25, Fs5: 739.99, Gs5: 830.61, B5: 987.77, Cs6: 1108.73, E6: 1318.51, Gs6: 1661.22, B6: 1975.53, E7: 2637.02 };

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
    const T = (tl) => c0 + (tl - from);
    const one = (tl, fn) => { if (tl >= from - 0.03) fn(T(Math.max(tl, from))); };
    const long = (tl, dur, fn) => { if (tl + dur <= from + 0.05) return; const s = Math.max(tl, from); fn(T(s), dur - (s - tl)); };
    // the dark: a sub drone and a low pad that slowly opens, until the cut
    // (a crescendo from near silence: the attacks run most of the way to the cut)
    long(0.1, C.CUT - 0.1, (t, d) => S.pad(t, d, [E.E1], { type: 'sine', gain: 0.16, a: Math.max(0.5, d - 2), r: 0.25, cut0: 300, cut1: 300, wet: 0.05 }));
    long(0.3, C.CUT - 0.35, (t, d) => S.pad(t, d, [E.E1, E.B1, E.E2, E.B2], { gain: 0.045, a: Math.max(0.5, d - 4), r: 0.3, cut0: 140, cut1: 900, det: 9, wet: 0.35 }));
    // the seams light up
    one(C.GRID, (t) => { S.glide(t, 2.0, 36, 120, { gain: 0.12, a: 1.4, r: 0.6 }); S.sweep(t, 2.2, { f0: 700, f1: 3600, q: 7, peak: 0.035, at: 0.7 }); });
    for (let k = 0; k < 8; k++) one(C.GRID + 0.12 + k * 0.17, (t) => S.click(t, { f: 2600 + k * 300, q: 4, dur: 0.03, gain: 0.06, pan: k % 2 ? 0.5 : -0.5 }));
    // the nine doors power up, a rising line of bells
    const MEL = [E.E4, E.Gs4, E.B4, E.E5, E.Fs5, E.Gs5, E.B5, E.Cs6, E.E6];
    POWER.forEach(([, c], i) => one(C.POWER + i * C.STEP, (t) => {
      S.boom(t, { f0: 92, f1: 44, dur: 0.38, gain: 0.5, pan: P[c], wet: 0.12 });
      S.click(t + 0.004, { f: 3400, q: 2, dur: 0.04, gain: 0.15, pan: P[c] });
      S.ping(t + 0.02, { f: MEL[i], dur: 1.6, gain: 0.05, pan: P[c], wet: 0.7 });
    }));
    // the ribbon unrolls to both sides
    one(C.RIBBON, (t) => {
      S.sweep(t, 2.6, { f0: 380, f1: 2800, q: 0.9, peak: 0.08, at: 0.35, pan: 0, pan1: -0.8, wet: 0.35 });
      S.sweep(t + 0.03, 2.6, { f0: 400, f1: 2900, q: 0.9, peak: 0.08, at: 0.35, pan: 0, pan1: 0.8, wet: 0.35 });
      S.shimmer(t + 0.25, [E.E6, E.Gs6, E.B6, E.E7, E.B6, E.Gs6, E.E7], { step: 0.11, gain: 0.026 });
    });
    // the title, and warmth under it until the countdown
    one(C.TITLE, (t) => S.boom(t, { f0: 58, f1: 29, dur: 2.6, gain: 0.55, wet: 0.45 }));
    long(C.TITLE, C.COUNT - C.TITLE + 0.3, (t, d) => S.pad(t, d, [E.E2, E.B2, E.E3, E.Gs3, E.B3, E.Fs4], { gain: 0.05, a: 2.5, r: 1.2, cut0: 320, cut1: 1100, det: 8, wet: 0.55 }));
    // the countdown: a riser for all ten seconds, a hit on every second, heavier on 3, 2, 1
    long(C.COUNT, C.CUT - C.COUNT, (t, d) => S.sweep(t, d, { f0: 220, f1: 6500, q: 1.1, peak: 0.15, at: 0.995, wet: 0.25 }));
    long(C.COUNT, C.CUT - C.COUNT, (t, d) => S.glide(t, d, E.E2, E.E3, { type: 'sawtooth', gain: 0.05, a: d * 0.98, r: 0.03, lp0: 280, lp1: 2600 }));
    for (let i = 0; i < 10; i++) one(C.COUNT + i, (t) => {
      const k = i / 9;
      S.boom(t, { f0: 78, f1: 38, dur: 0.95, gain: 0.5 + 0.3 * k, wet: 0.18 });
      S.ping(t, { f: i >= 7 ? E.Gs6 : E.E6, dur: 1.3, gain: 0.04 + 0.03 * k, wet: 0.65 });
      S.click(t, { f: 5200, q: 3, dur: 0.025, gain: 0.08 });
      if (i >= 7) { S.boom(t, { f0: 120, f1: 55, dur: 0.45, gain: 0.32 }); S.click(t, { f: 700, q: 0.8, dur: 0.09, gain: 0.2 }); }
    });
    UNLOCK.forEach(([, c], k) => one(C.COUNT + 2 + k + 0.08, (t) => S.click(t, { f: 1800, q: 3, dur: 0.05, gain: 0.09, pan: P[c] })));
    // the cut: the blades, then the impact, sparks of sound
    one(C.CUT - 0.13, (t) => { S.sweep(t, 0.1, { type: 'highpass', f0: 5000, f1: 3000, q: 0.7, peak: 0.3, at: 0.2, wet: 0.1 }); S.metal(t + 0.07, [3120, 4470, 6230, 7900], { dur: 1.1, gain: 0.035, wet: 0.5 }); });
    one(C.CUT, (t) => {
      S.boom(t, { f0: 62, f1: 24, dur: 3.4, gain: 1.0, wet: 0.3 });
      S.sweep(t, 3.0, { type: 'lowpass', f0: 9000, f1: 380, q: 0.5, peak: 0.45, at: 0.004, wet: 0.65 });
      for (let i = 0; i < 16; i++) S.ping(t + S.rnd() * 0.7, { f: 2000 + S.rnd() * 4500, dur: 0.5 + S.rnd() * 0.6, gain: 0.02, pan: S.rnd() * 1.6 - 0.8, wet: 0.8 });
    });
    // the doors: air, a rumble, and the stop
    one(C.OPEN, (t) => {
      S.sweep(t, 1.9, { type: 'highpass', f0: 2600, f1: 900, q: 0.6, peak: 0.12, at: 0.25, wet: 0.3 });
      S.sweep(t, 2.4, { type: 'lowpass', f0: 180, f1: 90, q: 0.8, peak: 0.28, at: 0.3, wet: 0.2 });
      S.boom(t + 1.75, { f0: 75, f1: 40, dur: 0.7, gain: 0.38, wet: 0.3 }); S.click(t + 1.75, { f: 900, q: 1, dur: 0.08, gain: 0.14 });
    });
    // space, then the sunrise swells, and the new era
    long(C.OPEN + 0.4, C.FLASH - C.OPEN - 0.4, (t, d) => S.pad(t, d, [E.E1], { type: 'sine', gain: 0.2, a: 2, r: 0.2, cut0: 300, cut1: 300, wet: 0 }));
    long(C.OPEN + 0.6, C.FLASH - C.OPEN - 0.6, (t, d) => S.pad(t, d, [E.E3, E.B3, E.E4, E.Gs4], { type: 'triangle', gain: 0.035, a: 3, r: 0.3, cut0: 1400, cut1: 1400, det: 5, wet: 0.8 }));
    long(C.SUN, C.FLASH - C.SUN, (t, d) => S.pad(t, d, [E.E2, E.B2, E.E3, E.Gs3, E.B3, E.E4, E.Fs4, E.B4], { gain: 0.085, a: 5.5, r: 0.25, cut0: 260, cut1: 4200, det: 11, wet: 0.55 }));
    long(C.SUN + 1, C.FLASH - C.SUN - 1, (t, d) => S.choir(t, d, [E.E4, E.Gs4, E.B4, E.E5], { gain: 0.03, a: 4, r: 0.25 }));
    one(C.SUN + 1.6, (t) => S.shimmer(t, [E.E6, E.B5, E.Gs6, E.E6, E.B6, E.Gs6, E.E7], { step: 0.32, gain: 0.02 }));
    one(C.TAG, (t) => { S.boom(t, { f0: 66, f1: 31, dur: 2.4, gain: 0.5, wet: 0.5 }); S.ping(t, { f: E.E5, dur: 3, gain: 0.05, wet: 0.8 }); S.ping(t, { f: E.B5, dur: 3, gain: 0.035, wet: 0.8 }); });
    // the warp, into the flash; then a breath of silence before the video
    long(C.WARP, C.FLASH - C.WARP, (t, d) => { S.sweep(t, d, { f0: 180, f1: 7500, q: 0.7, peak: 0.3, at: 0.99, wet: 0.3 }); S.glide(t, d, 55, 440, { type: 'sawtooth', gain: 0.08, a: d * 0.97, r: 0.05, lp0: 300, lp1: 5000 }); });
    one(C.FLASH, (t) => { S.boom(t, { f0: 52, f1: 24, dur: 1.6, gain: 0.85, wet: 0.45 }); S.sweep(t, 1.4, { type: 'lowpass', f0: 7000, f1: 300, peak: 0.3, at: 0.004, wet: 0.7 }); });
  }
  /** The score of the closing, from its start (c0). */
  function scoreFinale(S, c0) {
    const T = (tl) => c0 + tl;
    S.glide(T(0), 1.3, 45, 110, { gain: 0.1, a: 0.9, r: 0.5 }); S.sweep(T(0), 1.4, { f0: 600, f1: 3200, q: 6, peak: 0.03, at: 0.7 });
    S.boom(T(0.6), { f0: 70, f1: 32, dur: 2.6, gain: 0.5, wet: 0.5 });
    S.pad(T(0.6), 6.4, [E.E2, E.B2, E.E3, E.Gs3, E.B3, E.E4, E.B4], { gain: 0.06, a: 1.6, r: 2.8, cut0: 500, cut1: 1800, wet: 0.55 });
    S.shimmer(T(1.0), [E.E6, E.Gs6, E.B6, E.E7], { step: 0.13, gain: 0.024 });
    const FMEL = [E.E5, E.Gs5, E.B5, E.Cs6, E.E6, E.Gs6, E.B6, E.E7, E.E7];
    Object.keys(FLIPD).sort((a, b) => FLIPD[a] - FLIPD[b]).forEach((n, i) => {
      const c = n % 3, t = T(C.FLIP + FLIPD[n]);
      S.sweep(t, 0.32, { f0: 1400, f1: 5200, q: 1.4, peak: 0.07, at: 0.5, pan: P[c], wet: 0.2 });
      S.click(t + 0.3, { f: 2400, q: 2, dur: 0.04, gain: 0.07, pan: P[c] });
      S.ping(t + 0.3, { f: FMEL[i], dur: 1.6, gain: 0.035, pan: P[c], wet: 0.7 });
    });
    S.boom(T(6.5), { f0: 64, f1: 30, dur: 3, gain: 0.55, wet: 0.5 });
    S.pad(T(6.5), 3.4, [E.E3, E.B3, E.E4, E.Gs4, E.B4, E.E5], { type: 'triangle', gain: 0.05, a: 0.08, r: 3.8, cut0: 5000, cut1: 2000, wet: 0.7 });
    S.shimmer(T(6.6), [E.E6, E.B6, E.E7, E.Gs6, E.B6, E.E7], { step: 0.09, gain: 0.022 });
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

  window.makeCeremony = (React) => {
    const h = React.createElement, { useState, useEffect, useRef } = React;
    const LEX = "'Lexend',sans-serif", MONO = "'IBM Plex Mono',monospace", HEB = 'Heebo, sans-serif';
    const EN = () => window.wallLang === 'en';
    const rate = () => window.__cerRate || 1;   // a preview recording plays slowed down (the frames are then sped up)
    const abs = (x, y, w, hh, extra) => Object.assign({ position: 'absolute', left: x, top: y, width: w, height: hh }, extra);
    const full = (extra) => Object.assign({ position: 'absolute', inset: 0 }, extra);
    /** a CSS animation at timeline second `at`, for an element mounted at timeline second T0 */
    const A = (name, dur, at, T0, ease, fill) => `${name} ${Math.round(dur * 1000)}ms ${ease || 'cubic-bezier(.16,1,.3,1)'} ${Math.round((at - T0) * 1000)}ms ${fill || 'both'}`;
    const ALL = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ r, c, n: r * 3 + c, x: c * 640, y: r * 360 })));

    // The words: the remote's (design.ceremony.texts, carried in the takeover; Hebrew, so the English wall keeps these) or
    // these. A line in OPT the remote left empty is not shown (the guest of honour, say).
    const DEF = {
      eyebrow: ['טקס חנוכת המשרדים החדשים', 'INAUGURATION CEREMONY'], title: ['מנהלת החלל', 'SPACE PROGRAM OFFICE'], line: ['הבית החדש במידטאון', 'OUR NEW HOME IN MIDTOWN'],
      honor: ['במעמד ראש מפא״ת', 'IN THE PRESENCE OF THE HEAD OF DDR&D'], tag: ['עידן חדש', 'A NEW ERA'], tagLine: ['לחלל הישראלי', 'FOR ISRAELI SPACE'],
      welcome: ['ברוכים הבאים', 'WELCOME'], welcomeLine: ['לבית החדש של מנהלת החלל', 'TO OUR NEW HOME'], soon: ['הטקס יתחיל בקרוב', 'THE CEREMONY WILL BEGIN SHORTLY'] };
    const OPT = { eyebrow: 1, line: 1, honor: 1, tagLine: 1, welcomeLine: 1 };
    const txt = (texts, k) => { const v = texts && texts[k]; if (typeof v === 'string') { if (v.trim() && !EN()) return v.trim(); if (!v.trim() && OPT[k]) return ''; } return DEF[k][EN() ? 1 : 0]; };
    // the largest size up to `max` at which `text` fits `width` (a TV is 640 wide: words stay inside one)
    const mc = document.createElement('canvas').getContext('2d');
    const fit = (text, weight, family, max, width, track) => { mc.font = `${weight} ${max}px ${family}`; const w = mc.measureText(text).width * (1 + (track || 0)); return w > width ? Math.max(16, Math.floor(max * width / w)) : max; };
    const dateStr = () => { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(window.wallNow ? window.wallNow() : Date.now())).forEach((x) => (p[x.type] = x.value)); return p.day + ' · ' + p.month + ' · ' + p.year; };
    const titleFont = (s) => (/[֐-׿]/.test(s) ? { family: 'Heebo', css: HEB, weight: 800, track: 0, ls: '0' } : { family: 'Lexend', css: LEX, weight: 500, track: 0.04, ls: '.04em' });
    // the stars of the closing card and the standby screen: one tile, drawn once
    const starTile = () => window.__cerStars || (window.__cerStars = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), rnd = mulberry(77);
      for (let i = 0; i < 230; i++) { const r = rnd() < 0.1 ? 1.3 : 0.7; g.fillStyle = `rgba(225,236,255,${(0.12 + rnd() * 0.5).toFixed(2)})`; g.beginPath(); g.arc(rnd() * 512, rnd() * 512, r, 0, 6.283); g.fill(); }
      return c.toDataURL();
    })());
    const SKY = () => `url(${starTile()}) 0 0/512px 512px repeat, radial-gradient(ellipse 1300px 860px at 960px 520px, #10295a 0%, #081430 52%, #030812 100%)`;
    const SKY_SIZE = '512px 512px, 1920px 1080px';
    const corners = (inset, col, size) => [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => h('span', { key: 'k' + i, style: Object.assign({ position: 'absolute', width: size, height: size, borderColor: col, borderStyle: 'solid', borderWidth: `${y ? 0 : 1.5}px ${x ? 1.5 : 0}px ${y ? 1.5 : 0}px ${x ? 0 : 1.5}px` },
      x ? { right: inset } : { left: inset }, y ? { bottom: inset } : { top: inset }) }));
    // The directorate's emblem in a glowing disc (the realistic 3D emblem's still, like the Yizkor screen's).
    const Seal = ({ d, style }) => h('div', { style: Object.assign({ position: 'absolute', width: d, height: d, borderRadius: '50%' }, style) },
      h('div', { style: { position: 'absolute', inset: -d * 0.35, borderRadius: '50%', background: 'radial-gradient(circle closest-side, rgba(110,180,255,.30), rgba(70,130,230,.10) 55%, transparent)' } }),
      h('img', { src: '/assets/emblem-3d.png', alt: '', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 0 24px rgba(110,180,255,.35))' } }));
    // The title block of a TV in the top row: eyebrow, title, line, centred in its 640×360.
    const TitleBlock = ({ eyebrow, title, line, anim, x, size }) => {
      const tf = titleFont(title), ts = fit(title, tf.weight, tf.family, size || 84, 560, tf.track), ls = fit(line, 300, 'Heebo', 32, 560);
      return h('div', { style: abs(x === undefined ? 640 : x, 0, 640, 360, { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }) },
        eyebrow ? h('div', { dir: 'auto', style: Object.assign({ fontFamily: /[֐-׿]/.test(eyebrow) ? HEB : MONO, fontSize: /[֐-׿]/.test(eyebrow) ? 24 : 17, fontWeight: 500, letterSpacing: /[֐-׿]/.test(eyebrow) ? '.06em' : '.32em', color: '#9fdcff', whiteSpace: 'nowrap' }, anim(0)) }, eyebrow) : null,
        h('div', { dir: 'auto', style: Object.assign({ fontFamily: tf.css, fontSize: ts, fontWeight: tf.weight, letterSpacing: tf.ls, lineHeight: 1.05, color: '#f3f8ff', whiteSpace: 'nowrap', textShadow: '0 0 34px rgba(111,190,255,.45), 0 2px 18px rgba(0,0,0,.6)' }, anim(1)) }, title),
        line ? h('div', { dir: 'auto', style: Object.assign({ fontFamily: HEB, fontSize: ls, fontWeight: 300, color: '#cfe0f7', whiteSpace: 'nowrap', letterSpacing: '.02em' }, anim(2)) }, line) : null);
    };

    // ---------- act I–II: the nine doors, the seams, the medallion, the words ----------
    const PANEL_BG = 'repeating-linear-gradient(90deg, rgba(255,255,255,.014) 0 2px, transparent 2px 7px), linear-gradient(180deg, #13284d 0%, #0b1834 55%, #081227 100%)';
    // One door's face, 640×360, drawn once for each half (each half shows its own side of it, so the face parts in two).
    const Face = ({ p, T0, un, lockRing }) => {
      const textPanel = p.n === 1 || p.n === 7, center = p.n === 4, num = '0' + (p.r * 3 + (EN() ? p.c : 2 - p.c) + 1);
      const status = (word, col, show) => h('span', { style: { position: 'absolute', right: 0, top: 0, color: col, animation: show } }, word);
      return h('div', { style: full({ background: PANEL_BG }) },
        h('div', { style: full({ background: 'radial-gradient(ellipse 520px 300px at 50% 40%, rgba(70,130,220,.16), transparent 70%)' }) }),
        h('div', { style: abs(14, 14, 612, 332, { border: '1px solid rgba(150,190,240,.2)', borderRadius: 12, boxSizing: 'border-box' }) }),
        corners(24, 'rgba(159,220,255,.6)', 20),
        // the labels (not where the title, the medallion or the ribbon's words are)
        !center && !textPanel ? h('div', { style: abs(48, 38, 544, 20, { fontFamily: MONO, fontSize: 15, letterSpacing: '.24em', color: 'rgba(159,220,255,.62)' }) },
          'SECTOR ' + num,
          h('span', { style: { position: 'absolute', right: 0, top: 0, width: 160, height: 20 } },
            status('LOCKED', '#e9b872', un ? A('cerOut', 0.3, un, T0, 'linear', 'forwards') : 'none'),
            un ? status('UNLOCKED', '#d4f25c', A('cerIn', 0.3, un, T0, 'linear')) : null)) : null,
        !center && !textPanel ? h('div', { style: abs(48, 70, 544, 1, { background: 'linear-gradient(90deg, rgba(159,220,255,.35), rgba(159,220,255,.06))' }) }) : null,
        // a big faint sector number behind the lock
        !center && !textPanel ? h('div', { style: abs(0, 92, 640, 200, { textAlign: 'center', fontFamily: LEX, fontSize: 176, fontWeight: 200, lineHeight: '200px', color: 'rgba(159,220,255,.07)' }) }, num) : null,
        // the lock: a ring across the doors' seam, amber until its second of the countdown
        lockRing ? h('div', { style: abs(320 - 52, 192 - 52, 104, 104, { borderRadius: '50%', border: '3px solid rgba(233,184,114,.85)', boxShadow: '0 0 18px rgba(233,184,114,.35), inset 0 0 14px rgba(233,184,114,.2)', boxSizing: 'border-box' }) },
          h('div', { style: full({ borderRadius: '50%', margin: -3, border: '3px solid #d4f25c', boxShadow: '0 0 26px rgba(212,242,92,.6), inset 0 0 16px rgba(212,242,92,.35)', animation: A('cerIn', 0.25, un, T0, 'linear') }) }),
          h('div', { style: abs(40, 40, 18, 18, { borderRadius: '50%', background: '#e9b872', boxShadow: '0 0 12px #e9b872' }) },
            h('div', { style: full({ borderRadius: '50%', background: '#d4f25c', boxShadow: '0 0 14px #d4f25c', animation: A('cerIn', 0.25, un, T0, 'linear') }) }))) : null,
        // the bar that fills as the door unlocks
        !center && p.n !== 7 ? h('div', { style: abs(48, 312, 544, 3, { background: 'rgba(150,190,240,.14)', borderRadius: 3, overflow: 'hidden' }) },
          un ? h('div', { style: full({ background: 'linear-gradient(90deg,#6fd6ea,#d4f25c)', transformOrigin: 'left center', animation: A('grow', 0.8, un, T0, 'cubic-bezier(.3,0,.2,1)') }) }) : null) : null,
        // the seam between the two halves
        h('div', { style: abs(319, 14, 1, 332, { background: 'rgba(159,220,255,.22)' }) }), h('div', { style: abs(320, 14, 1, 332, { background: 'rgba(0,0,0,.55)' }) }));
    };
    const Door = ({ p, T0, on, un, open }) => {
      const lockRing = p.r < 2 && p.c !== 1;
      const half = (L) => h('div', { key: L ? 'l' : 'r', style: abs(L ? 0 : 320, 0, 320, 360, { overflow: 'hidden', animation: A(L ? 'cerOpenL' : 'cerOpenR', 1.7, open, T0, 'cubic-bezier(.75,0,.2,1)') }) },
        h('div', { style: full({ animation: un ? A(L ? 'cerNudgeL' : 'cerNudgeR', 0.5, un, T0, 'cubic-bezier(.3,1.6,.5,1)') : 'none' }) },
          h('div', { style: abs(L ? 0 : -320, 0, 640, 360) }, h(Face, { p, T0, un, lockRing }))));
      return h('div', { style: abs(p.x, p.y, 640, 360, { overflow: 'hidden', animation: A('cerPanelOn', 1.0, on, T0, 'linear') }) },
        half(true), half(false),
        // light from the other side, through the seam, just before the doors part
        h('div', { style: abs(318, 0, 4, 360, { background: 'linear-gradient(180deg, transparent, #f4faff 18%, #f4faff 82%, transparent)', boxShadow: '0 0 26px 8px rgba(170,220,255,.75)',
          animation: [A('cerIn', 0.35, open - 0.38, T0, 'ease-in'), A('cerOut', 0.9, open + 0.25, T0, 'ease-out', 'forwards')].join(', ') }) }));
    };
    // The light along the seams between the TVs (exactly where the video wall's bezels are): drawn out from the middle.
    const Seams = ({ T0, at, dimAt, outAt }) => [[0, 359, 1920, 2], [0, 719, 1920, 2], [639, 0, 2, 1080], [1279, 0, 2, 1080]].map(([x, y, w, hh], i) =>
      h('div', { key: 's' + i, style: abs(x, y, w, hh, { background: w > hh ? 'linear-gradient(90deg, rgba(212,242,92,0), #d4f25c 30%, #e8f7ff 50%, #9fdcff 70%, rgba(159,220,255,0))' : 'linear-gradient(180deg, rgba(212,242,92,0), #d4f25c 30%, #e8f7ff 50%, #9fdcff 70%, rgba(159,220,255,0))',
        boxShadow: '0 0 16px 2px rgba(159,220,255,.65)', transformOrigin: 'center',
        animation: [A(w > hh ? 'cerDrawX' : 'cerDrawY', 1.5, at + (w > hh ? 0 : 0.35), T0), dimAt ? A('cerDim', 1.2, dimAt, T0, 'ease', 'forwards') : null, A('cerOut', 0.5, outAt, T0, 'ease', 'forwards')].filter(Boolean).join(', ') }) }));

    const Doors = ({ T0, texts }) => {
      const on = {}, un = {};
      POWER.forEach(([r, c], i) => { on[r * 3 + c] = C.POWER + i * C.STEP; });
      UNLOCK.forEach(([r, c], k) => { un[r * 3 + (EN() ? 2 - c : c)] = C.COUNT + 2 + k; });
      const openAt = (p) => C.OPEN + [0, 0.14, 0.28][RING(p.r, p.c)];
      const rise = (base) => (i) => ({ animation: [A('cerRise', 1.4, base + i * 0.28, T0), A('cerOut', 0.6, C.CUT + 0.1, T0, 'ease', 'forwards')].join(', ') });
      // the medallion: ten segments (one a second), the emblem, the digits
      const SEG = Array.from({ length: 10 }, (_, i) => { const a0 = (-90 + i * 36 + 3) * Math.PI / 180, a1 = (-90 + (i + 1) * 36 - 3) * Math.PI / 180, R = 136;
        return `M${150 + R * Math.cos(a0)} ${150 + R * Math.sin(a0)} A${R} ${R} 0 0 1 ${150 + R * Math.cos(a1)} ${150 + R * Math.sin(a1)}`; });
      const ticks = Array.from({ length: 60 }, (_, i) => { const a = i * 6 * Math.PI / 180, r0 = i % 5 ? 147 : 143; return `M${150 + r0 * Math.cos(a)} ${150 + r0 * Math.sin(a)} L${150 + 151 * Math.cos(a)} ${150 + 151 * Math.sin(a)}`; }).join(' ');
      const medOut = A('cerMedOut', 1.1, C.OPEN + 0.05, T0, 'cubic-bezier(.5,0,.75,0)', 'forwards');
      return h('div', { style: full() },
        ALL.map((p) => h(Door, { key: p.n, p, T0, on: on[p.n], un: un[p.n] || (p.n === 4 ? C.CUT : 0), open: openAt(p) })),
        h(Seams, { T0, at: C.GRID, dimAt: C.POWER + 4.6, outAt: C.CUT + 0.15 }),
        // the words of act I: the title in the top middle TV, the date and the guest of honour around the ribbon
        h(TitleBlock, { eyebrow: txt(texts, 'eyebrow'), title: txt(texts, 'title'), line: txt(texts, 'line'), anim: rise(C.TITLE) }),
        h('div', { style: abs(640, 742, 640, 40, { textAlign: 'center', fontFamily: MONO, fontSize: 20, letterSpacing: '.3em', color: 'rgba(159,220,255,.75)', animation: [A('cerRise', 1.4, C.TITLE + 1, T0), A('cerOut', 0.6, C.CUT + 0.1, T0, 'ease', 'forwards')].join(', ') }) }, dateStr()),
        txt(texts, 'honor') && h('div', { dir: 'auto', style: abs(640, 972, 640, 50, { textAlign: 'center', fontFamily: /[֐-׿]/.test(txt(texts, 'honor')) ? HEB : LEX, fontSize: fit(txt(texts, 'honor'), 400, 'Heebo', 30, 560), fontWeight: 400, color: '#e9d7a8', letterSpacing: '.03em', whiteSpace: 'nowrap',
          animation: [A('cerRise', 1.4, C.TITLE + 1.3, T0), A('cerOut', 0.6, C.CUT + 0.1, T0, 'ease', 'forwards')].join(', ') }) }, txt(texts, 'honor')),
        // the medallion
        h('div', { style: abs(810, 390, 300, 300, { animation: [A('cerIn', 0.8, C.POWER + 0.1, T0, 'ease'), medOut].join(', ') }) },
          h('div', { style: abs(-110, -110, 520, 520, { borderRadius: '50%', background: 'radial-gradient(circle closest-side, rgba(110,180,255,.22), rgba(70,130,230,.07) 55%, transparent)', animation: 'breathe 4s ease-in-out infinite' }) }),
          h('div', { style: full({ borderRadius: '50%', background: 'radial-gradient(circle at 50% 32%, #1a3262 0%, #0a1530 62%, #050b1c 100%)', border: '2px solid rgba(233,196,106,.8)', boxShadow: '0 0 40px rgba(111,190,255,.3), inset 0 0 34px rgba(0,0,0,.65)', boxSizing: 'border-box' }) }),
          h('svg', { width: 300, height: 300, viewBox: '0 0 300 300', style: abs(0, 0, 300, 300, { overflow: 'visible' }) },
            h('g', { style: { transformOrigin: '150px 150px', animation: 'spin 60s linear infinite' } }, h('path', { d: ticks, stroke: 'rgba(233,196,106,.55)', strokeWidth: 1.5, fill: 'none' })),
            SEG.map((d, i) => h('path', { key: 'b' + i, d, stroke: 'rgba(150,190,240,.16)', strokeWidth: 7, fill: 'none', strokeLinecap: 'round' })),
            SEG.map((d, i) => h('path', { key: 'l' + i, d, stroke: i >= 7 ? '#ffd27a' : '#d4f25c', strokeWidth: 7, fill: 'none', strokeLinecap: 'round', style: { filter: 'drop-shadow(0 0 6px rgba(212,242,92,.8))', animation: A('cerIn', 0.2, C.COUNT + i, T0, 'linear') } }))),
          h(Seal, { d: 190, style: { left: 55, top: 55, animation: [A('cerIn', 1.2, C.POWER + 0.4, T0, 'ease'), A('cerOut', 0.5, C.COUNT - 0.6, T0, 'ease', 'forwards'), A('cerPop', 0.9, C.CUT, T0, 'cubic-bezier(.2,1.5,.4,1)', 'forwards')].join(', ') } }),
          h('div', { style: abs(0, 58, 300, 20, { textAlign: 'center', fontFamily: MONO, fontSize: 15, letterSpacing: '.3em', color: '#d4f25c', animation: [A('cerIn', 0.5, C.COUNT - 0.4, T0, 'ease'), A('cerOut', 0.3, C.CUT - 0.05, T0, 'ease', 'forwards')].join(', ') }) }, 'T-MINUS'),
          Array.from({ length: 10 }, (_, i) => h('div', { key: 'd' + i, dir: 'ltr', style: abs(0, 0, 300, 300, { display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 18, boxSizing: 'border-box', fontFamily: LEX, fontSize: i === 0 ? 132 : 150, fontWeight: 300, letterSpacing: '-.02em', color: i >= 7 ? '#fff4dc' : '#ffffff',
            textShadow: i >= 7 ? '0 0 36px rgba(255,200,120,.75)' : '0 0 30px rgba(159,220,255,.65)', animation: A('cerDigit', 1.0, C.COUNT + i, T0, 'linear') }) }, String(10 - i)))),
        // the cut: a flash on the medallion and two shock rings across the wall
        h('div', { style: abs(960 - 380, 540 - 380, 760, 760, { borderRadius: '50%', background: 'radial-gradient(circle closest-side, rgba(255,255,255,.95), rgba(190,230,255,.45) 35%, transparent 70%)', animation: A('cerFlash', 0.9, C.CUT, T0, 'ease-out') }) }),
        [0, 0.14].map((d, i) => h('div', { key: 'r' + i, style: abs(960 - 160, 540 - 160, 320, 320, { borderRadius: '50%', border: (i ? 2 : 3) + 'px solid rgba(220,240,255,.9)', boxShadow: '0 0 30px rgba(159,220,255,.6)', boxSizing: 'border-box', animation: A('cerShock', 1.7, C.CUT + d, T0, 'cubic-bezier(.1,.6,.3,1)') }) })));
    };

    // ---------- the ribbon, the sparks and the gold that falls: one canvas in front ----------
    const RY = 905, RW = 74;   // the ribbon's middle line (the bottom row of TVs) and its width
    const Front = ({ T, T0 }) => {
      const ref = useRef(null);
      useEffect(() => {
        const cv = ref.current, g = cv.getContext('2d');
        const st = (cv.getBoundingClientRect().width / 1920 || 1) * (window.__pageScale ? window.__pageScale() : 1);
        const k = Math.min(1.5, Math.max(0.5, st * (window.devicePixelRatio || 1)));
        cv.width = Math.round(1920 * k); cv.height = Math.round(1080 * k);
        const rnd = mulberry(0x51B), N = 46;
        let ropes = null, sparks = [], gold = [], simT = C.CUT, raf = 0;
        const wave = (x, t, amp) => RY + amp * (3.2 * Math.sin(x * 0.0062 - t * 1.7) + 2 * Math.sin(x * 0.013 + t * 1.15));
        const shade = (b, back) => { const k2 = back ? 0.62 : 1, l = Math.max(0, Math.min(1, b)); return `rgb(${Math.round((70 + 175 * l) * k2)},${Math.round((6 + 70 * l * l) * k2)},${Math.round((16 + 70 * l * l) * k2)})`; };
        const goldOf = (b) => { const l = Math.max(0.25, Math.min(1, b)); return `rgb(${Math.round(150 + 105 * l)},${Math.round(110 + 100 * l)},${Math.round(40 + 70 * l)})`; };
        // a band through the points (x, y, half-width w, brightness b, back side), in quads, gold along its edges
        const band = (pts) => {
          const n = pts.length, nx = [], ny = [];
          for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; nx[i] = -dy / l; ny[i] = dx / l; }
          for (let i = 0; i < n - 1; i++) {
            const p = pts[i], q = pts[i + 1];
            g.fillStyle = shade((p.b + q.b) / 2, p.back); g.strokeStyle = g.fillStyle; g.lineWidth = 1;
            g.beginPath(); g.moveTo(p.x + nx[i] * p.w, p.y + ny[i] * p.w); g.lineTo(q.x + nx[i + 1] * q.w, q.y + ny[i + 1] * q.w); g.lineTo(q.x - nx[i + 1] * q.w, q.y - ny[i + 1] * q.w); g.lineTo(p.x - nx[i] * p.w, p.y - ny[i] * p.w); g.closePath(); g.fill(); g.stroke();
          }
          g.lineWidth = 3;
          for (const s of [1, -1]) for (let i = 0; i < n - 1; i++) {
            const p = pts[i], q = pts[i + 1], ew = Math.max(0, p.w - 4);
            if (p.w < 6) continue;
            g.strokeStyle = goldOf((p.b + q.b) / 2 * (p.back ? 0.7 : 1)); g.beginPath(); g.moveTo(p.x + s * nx[i] * ew, p.y + s * ny[i] * ew); g.lineTo(q.x + s * nx[i + 1] * Math.max(0, q.w - 4), q.y + s * ny[i + 1] * Math.max(0, q.w - 4)); g.stroke();
          }
        };
        // after the cut: two ropes (verlet), pinned at the wall's edges, shorter at rest than when taut, so they spring away
        const cutRopes = (t) => [[-60, 958, -1], [1980, 962, 1]].map(([x0, x1, s]) => {
          const pts = [];
          for (let i = 0; i < N; i++) { const x = x0 + (x1 - x0) * i / (N - 1), y = wave(x, t, 0.35); pts.push({ x, y, px: x, py: y }); }
          const last = pts[N - 1]; last.px = last.x - s * 13; last.py = last.y + 4; pts[N - 2].px = pts[N - 2].x - s * 9;
          return { pts, rest: Math.abs(x1 - x0) / (N - 1) * 0.8, s, pinned: true };
        });
        const step = (t) => {
          for (const R of ropes) {
            if (R.pinned && t > C.CUT + 1.9) R.pinned = false;
            for (let i = 0; i < N; i++) { const p = R.pts[i]; if (i === 0 && R.pinned) continue; const vx = (p.x - p.px) * 0.988, vy = (p.y - p.py) * 0.988; p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + 0.42; }
            for (let it = 0; it < 10; it++) for (let i = 0; i < N - 1; i++) {
              const a = R.pts[i], b = R.pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, diff = (d - R.rest) / d;
              if (i === 0 && R.pinned) { b.x -= dx * diff; b.y -= dy * diff; } else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
            }
            if (R.pinned) { R.pts[0].x = R.s < 0 ? -60 : 1980; R.pts[0].y = RY; }
          }
          for (const s of sparks) { s.x += s.vx; s.y += s.vy; s.vx *= 0.975; s.vy = s.vy * 0.975 + 0.17; s.life -= s.decay; }
          sparks = sparks.filter((s) => s.life > 0);
          for (const p of gold) { p.y += p.vy; p.x += p.vx + Math.sin((t - C.CUT) * 2.2 + p.ph) * 0.7; p.r += p.vr; }
        };
        const burst = () => {
          const COLS = ['#ffd27a', '#fff6e0', '#ffe9b0', '#bfe8ff', '#ffffff'];
          for (let i = 0; i < 190; i++) { const a = rnd() * Math.PI * 2, sp = 3 + rnd() * 12; sparks.push({ x: 960 + (rnd() - 0.5) * 20, y: RY + (rnd() - 0.5) * 50, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 - 3, life: 1, decay: 1 / (60 * (0.9 + rnd() * 1.3)), c: COLS[(rnd() * COLS.length) | 0] }); }
          const GC = ['#e9c46a', '#ffd98a', '#f6e7b8', '#cfe6ff', '#ffffff'];
          for (let i = 0; i < 110; i++) gold.push({ x: rnd() * 1920, y: -20 - rnd() * 900, vy: 1.6 + rnd() * 2.2, vx: (rnd() - 0.5) * 0.8, r: rnd() * 6.28, vr: (rnd() - 0.5) * 0.18, w: 5 + rnd() * 7, hh: 3 + rnd() * 5, ph: rnd() * 6.28, c: GC[(rnd() * GC.length) | 0] });
        };
        const draw = () => {
          const t = T(); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, 1920, 1080);
          if (t >= C.RIBBON - 0.1 && t < C.CUT) {
            // unrolling from the middle out, then taut and breathing; pulled still over the last seconds, a light where it will part
            const u = Math.max(0, Math.min(1, (t - C.RIBBON) / 2.6)), L = 1010 * (1 - Math.pow(1 - u, 3)), amp = t > C.CUT - 3 ? Math.max(0.3, (C.CUT - t) / 3) : 1;
            const sheenX = -300 + ((t * 520) % 2600), pts = [];
            for (let x = 960 - L; x <= 960 + L + 0.1; x += 24) {
              const y = wave(x, t, amp), sl = (wave(x + 6, t, amp) - y) / 6;
              pts.push({ x, y, w: RW / 2, b: 0.55 + sl * 4.5 + 0.45 * Math.exp(-Math.pow((x - sheenX) / 130, 2)) });
            }
            if (pts.length > 1) band(pts);
            if (u < 1) for (const ex of [960 - L, 960 + L]) { const gr = g.createRadialGradient(ex, RY, 0, ex, RY, 70); gr.addColorStop(0, 'rgba(255,240,220,.9)'); gr.addColorStop(1, 'rgba(255,200,150,0)'); g.fillStyle = gr; g.fillRect(ex - 70, RY - 70, 140, 140); }
            if (t > C.COUNT) { const a = 0.25 + 0.35 * Math.max(0, (t - C.COUNT) / 10) * (0.6 + 0.4 * Math.sin(t * 9)); const gr = g.createRadialGradient(960, RY, 0, 960, RY, 90); gr.addColorStop(0, `rgba(255,236,200,${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(255,220,170,0)'); g.fillStyle = gr; g.fillRect(870, RY - 90, 180, 180); }
          } else if (t >= C.CUT) {
            if (!ropes) { ropes = cutRopes(C.CUT); burst(); simT = C.CUT; }
            let n = 0; while (simT < t && n++ < 900) { simT += 1 / 60; step(simT); }
            for (const R of ropes) {
              const free = t - C.CUT, pts = R.pts.map((p, i) => {
                const f = i / (N - 1), phi = Math.pow(f, 1.6) * free * 4.2 * R.s + Math.sin(free * 3.4 + i * 0.28) * 0.45 * f, cs = Math.cos(phi);
                return { x: p.x, y: p.y, w: (RW / 2) * Math.max(0.1, Math.abs(cs)), b: 0.35 + 0.65 * Math.abs(cs) * (0.75 + 0.25 * Math.sin(i * 0.5 + free * 2)), back: cs < 0 };
              });
              band(pts);
            }
            g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
            for (const s of sparks) { g.globalAlpha = Math.min(1, s.life * 1.3); g.strokeStyle = s.c; g.lineWidth = 2.2; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * 1.8, s.y - s.vy * 1.8); g.stroke(); }
            g.globalCompositeOperation = 'source-over';
            const ga = t < C.CUT + 5 ? 1 : Math.max(0, 1 - (t - C.CUT - 5) / 2);
            for (const p of gold) { if (p.y < -20 || p.y > 1100) continue; g.globalAlpha = 0.85 * ga; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.cos((t - C.CUT) * 4 + p.ph)); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh); g.restore(); }
            g.globalAlpha = 1;
          }
        };
        const loop = () => { draw(); if (T() < C.CUT + 7.5) raf = requestAnimationFrame(loop); else raf = 0; };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
      }, []);
      return h('canvas', { ref, style: full({ width: '100%', height: '100%', pointerEvents: 'none' }) });
    };

    // ---------- act III: space behind the doors, the Earth, the sunrise, the warp ----------
    const V = { x: 960, y: 640 };   // where the warp flies to: the sun on the limb
    const Stars = ({ T }) => {
      const ref = useRef(null);
      useEffect(() => {
        const cv = ref.current, g = cv.getContext('2d');
        const st = (cv.getBoundingClientRect().width / 1920 || 1) * (window.__pageScale ? window.__pageScale() : 1);
        const k = Math.min(1.25, Math.max(0.5, st * (window.devicePixelRatio || 1)));
        cv.width = Math.round(1920 * k); cv.height = Math.round(1080 * k);
        const rnd = mulberry(0x57A2), N = 1100, F = 700;
        const sx = new Float32Array(N), sy = new Float32Array(N), sz = new Float32Array(N), pz = new Float32Array(N), tw = new Float32Array(N), col = new Uint8Array(N);
        const spawn = (i, far) => { const z = far ? 5 + rnd() * 1.5 : 0.7 + rnd() * 5.6; sz[i] = pz[i] = z; sx[i] = (rnd() * 2 - 1) * 1.45 * (far ? 1.2 : z); sy[i] = (rnd() * 2 - 1) * 0.95 * (far ? 1.2 : z); tw[i] = rnd() * 6.28; col[i] = rnd() < 0.82 ? 0 : rnd() < 0.6 ? 1 : 2; };
        for (let i = 0; i < N; i++) spawn(i, false);
        const COLS = ['230,240,255', '200,226,255', '255,236,205'];
        let raf = 0, last = T();
        const loop = () => {
          const t = T(), dt = Math.max(0, Math.min(0.1, t - last)); last = t;
          if (t > C.VIDEO + 1.4) { raf = 0; return; }
          raf = requestAnimationFrame(loop);
          if (t < C.OPEN - 0.3) return;   // behind closed doors
          g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, 1920, 1080);
          const u = t < C.WARP ? 0 : Math.min(1, (t - C.WARP) / (C.FLASH - C.WARP)), v = 0.04 + 26 * u * u * u;
          const fade = Math.min(1, (t - C.OPEN + 0.3) / 1.4) * (t > C.SUN ? 1 - 0.35 * Math.min(1, (t - C.SUN) / 3) : 1);
          for (let i = 0; i < N; i++) { pz[i] = sz[i]; sz[i] -= v * dt; sx[i] -= (u ? 0 : 0.012) * dt * sz[i]; if (sz[i] < 0.12) spawn(i, true); }
          g.lineCap = 'round';
          for (let b = 0; b < 3; b++) {
            g.strokeStyle = g.fillStyle = `rgb(${COLS[b]})`;
            for (let q = 0; q < 4; q++) {
              const a0 = q / 4, a1 = (q + 1) / 4; g.globalAlpha = fade * (a0 + a1) / 2; g.beginPath(); let any = false;
              for (let i = 0; i < N; i++) {
                if (col[i] !== b) continue;
                let a = Math.min(1, 0.25 + 1.6 / sz[i]) * (0.8 + 0.2 * Math.sin(t * 2.3 + tw[i]));
                if (a < a0 || a >= a1) { if (!(q === 3 && a >= 1)) continue; }
                const x = V.x + sx[i] * F / sz[i], y = V.y + sy[i] * F / sz[i];
                if (x < -40 || x > 1960 || y < -40 || y > 1120) continue;
                const r = Math.min(3.2, 0.6 + 1.4 / sz[i]);
                if (u > 0.02) { const ox = V.x + sx[i] * F / pz[i], oy = V.y + sy[i] * F / pz[i]; g.moveTo(ox, oy); g.lineTo(x, y); } else g.rect(x - r / 2, y - r / 2, r, r);
                any = true;
              }
              if (!any) continue;
              if (u > 0.02) { g.lineWidth = 1.6; g.stroke(); } else g.fill();
            }
          }
          g.globalAlpha = 1;
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
      }, []);
      return h('canvas', { ref, style: full({ width: '100%', height: '100%' }) });
    };
    // The Earth's night side under us, its city lights, and the blue line of the atmosphere on its limb: drawn once.
    const EARTH = { x: -140, y: 600, w: 2200, h: 900, R: 2300 };
    const Earth = ({ style }) => {
      const ref = useRef(null);
      useEffect(() => {
        const cv = ref.current, g = cv.getContext('2d'), { w: W, h: H, R } = EARTH, cx = W / 2, cy = 50 + R;
        const k = Math.min(1.25, (window.devicePixelRatio || 1) * (window.__pageScale ? window.__pageScale() : 1) * (cv.getBoundingClientRect().width / W || 1));
        cv.width = Math.round(W * k); cv.height = Math.round(H * k);
        const draw = (img) => {
          g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, W, H);
          g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
          const base = g.createLinearGradient(0, 50, 0, H); base.addColorStop(0, '#0a1a38'); base.addColorStop(0.25, '#050e22'); base.addColorStop(1, '#02060f'); g.fillStyle = base; g.fillRect(0, 0, W, H);
          if (img && img.naturalWidth) {
            // the lights over the eastern Mediterranean, foreshortened toward the horizon: rows of the map stretched onto
            // rows of a canvas of their own (each row once, so no seams), fainter toward the limb, warm-tinted
            const iw = img.naturalWidth, ih = img.naturalHeight, lon0 = 5, lon1 = 65, latTop = 47, latBot = 18, LW = 1100, LH = Math.round((H - 50) / 2);
            const lc = document.createElement('canvas'); lc.width = LW; lc.height = LH; const lg = lc.getContext('2d');
            lg.imageSmoothingEnabled = true; lg.imageSmoothingQuality = 'high';
            for (let y = 0; y < LH; y++) {
              const f0 = y / LH, f1 = (y + 1) / LH, l0 = latTop - (latTop - latBot) * Math.pow(f0, 0.55), l1 = latTop - (latTop - latBot) * Math.pow(f1, 0.55);
              lg.globalAlpha = 0.3 + 0.7 * Math.pow(f0, 0.5);
              lg.drawImage(img, (lon0 + 180) / 360 * iw, (90 - l0) / 180 * ih, (lon1 - lon0) / 360 * iw, Math.max(0.35, (l0 - l1) / 180 * ih), 0, y, LW, 1);
            }
            // contrast (the map's faint background squared away), then a warm tint; a soft glow drawn small and scaled up
            lg.globalAlpha = 1; lg.globalCompositeOperation = 'multiply'; lg.drawImage(lc, 0, 0); lg.fillStyle = '#ffc890'; lg.fillRect(0, 0, LW, LH);
            const gc = document.createElement('canvas'); gc.width = LW / 2; gc.height = LH / 2; const gg = gc.getContext('2d');
            if ('filter' in gg) gg.filter = 'blur(3px)';
            gg.drawImage(lc, 0, 0, LW / 2, LH / 2);
            g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
            g.globalAlpha = 0.5; g.drawImage(gc, 0, 50, W, H - 50);
            g.globalAlpha = 1; g.drawImage(lc, 0, 50, W, H - 50);
            g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
          }
          // haze toward the horizon
          const hz = g.createRadialGradient(cx, cy, R - 520, cx, cy, R); hz.addColorStop(0, 'rgba(10,30,70,0)'); hz.addColorStop(0.85, 'rgba(20,50,110,.35)'); hz.addColorStop(1, 'rgba(70,130,220,.55)'); g.fillStyle = hz; g.fillRect(0, 0, W, H);
          g.restore();
          // the atmosphere: a thin bright line and its glow
          const at = g.createRadialGradient(cx, cy, R - 4, cx, cy, R + 70); at.addColorStop(0, 'rgba(150,205,255,.95)'); at.addColorStop(0.06, 'rgba(110,180,255,.75)'); at.addColorStop(0.3, 'rgba(70,140,255,.25)'); at.addColorStop(1, 'rgba(50,110,255,0)');
          g.fillStyle = at; g.beginPath(); g.arc(cx, cy, R + 70, 0, Math.PI * 2); g.arc(cx, cy, R - 4, 0, Math.PI * 2, true); g.fill();
        };
        draw(null);
        const img = new Image(); img.onload = () => draw(img); img.src = '/assets/textures/earth_lights_2048.png';
      }, []);
      return h('canvas', { ref, style: abs(EARTH.x, EARTH.y, EARTH.w, EARTH.h, style) });
    };
    const Space = ({ T, T0, texts }) => {
      const sun = { x: 960, y: 650 };
      const tag = txt(texts, 'tag'), tf = titleFont(tag), ts = fit(tag, tf.weight, tf.family, 124, 580, tf.track), tl = txt(texts, 'tagLine');
      const warpOut = (extra) => A('cerOut', 0.6, C.WARP - 0.2, T0, 'ease', 'forwards') + (extra ? ', ' + extra : '');
      return h('div', { style: full() },
        h('div', { style: full({ background: 'radial-gradient(ellipse 1500px 900px at 50% 72%, #0b1b3c 0%, #050c1f 50%, #02050c 100%)' }) }),
        h(Stars, { T }),
        // the sun behind the Earth: it rises from behind the limb
        h('div', { style: abs(sun.x - 380, sun.y - 380, 760, 760, { borderRadius: '50%', background: 'radial-gradient(circle closest-side, rgba(255,246,228,.9), rgba(255,214,160,.35) 22%, rgba(255,190,120,.08) 50%, transparent)', animation: A('cerSunUp', 4.5, C.SUN - 0.4, T0, 'cubic-bezier(.2,.7,.2,1)') }) }),
        h('div', { style: abs(sun.x - 46, sun.y - 46, 92, 92, { borderRadius: '50%', background: 'radial-gradient(circle closest-side, #fff 0 45%, #fff3d6 62%, rgba(255,220,160,.6) 80%, transparent)', animation: A('cerSunUp', 4.5, C.SUN - 0.4, T0, 'cubic-bezier(.2,.7,.2,1)') }) }),
        // the Earth: rising into view, then falling away in the warp
        h('div', { style: full({ animation: [A('cerEarthRise', 3.6, C.RISE, T0, 'cubic-bezier(.2,.8,.2,1)'), A('cerEarthDrop', C.FLASH - C.WARP, C.WARP, T0, 'cubic-bezier(.6,0,.9,.5)', 'forwards')].join(', ') }) },
          h(Earth, {}),
          // the sunlight caught in the atmosphere along the limb
          h('div', { style: abs(sun.x - 900, sun.y - 70, 1800, 140, { background: 'radial-gradient(ellipse closest-side, rgba(255,236,200,.95), rgba(255,170,90,.55) 25%, rgba(120,170,255,.22) 60%, transparent)', animation: A('cerIn', 2.6, C.SUN + 0.1, T0, 'ease') }) })),
        // in front: the glare, the rays and the anamorphic streak (they grow into the flash in the warp)
        h('div', { style: full({ animation: A('cerGlareWarp', C.FLASH - C.WARP, C.WARP, T0, 'cubic-bezier(.6,0,.9,.4)', 'forwards'), transformOrigin: `${sun.x}px ${sun.y}px` }) },
          h('div', { style: abs(sun.x - 800, sun.y - 800, 1600, 1600, { borderRadius: '50%', background: 'radial-gradient(circle closest-side, rgba(255,250,240,.6), rgba(200,230,255,.18) 30%, rgba(120,180,255,.05) 60%, transparent)', animation: A('cerIn', 3, C.SUN + 0.6, T0, 'ease') }) }),
          h('div', { style: abs(sun.x - 900, sun.y - 900, 1800, 1800, { animation: A('cerIn', 3, C.SUN + 1, T0, 'ease') }) },
            h('div', { style: full({ borderRadius: '50%', background: 'repeating-conic-gradient(from 0deg, rgba(255,242,220,.10) 0deg 1.6deg, transparent 1.6deg 8deg)', WebkitMaskImage: 'radial-gradient(circle closest-side, #000 0%, rgba(0,0,0,.5) 30%, transparent 70%)', maskImage: 'radial-gradient(circle closest-side, #000 0%, rgba(0,0,0,.5) 30%, transparent 70%)', animation: 'spin 140s linear infinite' }) })),
          h('div', { style: abs(sun.x - 1500, sun.y - 40, 3000, 80, { background: 'radial-gradient(ellipse closest-side, rgba(170,215,255,.28), transparent)', transformOrigin: 'center', animation: A('cerStreak', 2.8, C.SUN + 0.4, T0, 'cubic-bezier(.2,.8,.2,1)') }) }),
          h('div', { style: abs(sun.x - 1500, sun.y - 2, 3000, 4, { background: 'linear-gradient(90deg, transparent, rgba(150,205,255,.35) 25%, rgba(250,252,255,.95) 50%, rgba(150,205,255,.35) 75%, transparent)', transformOrigin: 'center', animation: A('cerStreak', 2.6, C.SUN + 0.3, T0, 'cubic-bezier(.2,.8,.2,1)') }) })),
        // "a new era", in the top middle TV
        h('div', { style: abs(640, 0, 640, 360, { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center' }) },
          h('div', { dir: 'auto', style: { fontFamily: tf.css, fontSize: ts, fontWeight: tf.weight, letterSpacing: tf.ls, lineHeight: 1, color: '#fbfdff', whiteSpace: 'nowrap', textShadow: '0 0 40px rgba(255,230,190,.55), 0 0 90px rgba(140,190,255,.35)', animation: warpOut(A('cerTitleIn', 2.2, C.TAG, T0)) } }, tag),
          tl && h('div', { dir: 'auto', style: { fontFamily: /[֐-׿]/.test(tl) ? HEB : MONO, fontSize: fit(tl, 300, 'Heebo', 36, 560), fontWeight: 300, letterSpacing: /[֐-׿]/.test(tl) ? '.08em' : '.3em', color: '#e9d7a8', whiteSpace: 'nowrap', animation: warpOut(A('cerRise', 1.6, C.TAG + 0.7, T0)) } }, tl)));
    };

    // ---------- the closing: a card in nine tiles over the end of the video, turning away onto the home wall ----------
    const Finale = ({ T0, texts }) => {
      const title = txt(texts, 'welcome'), line = txt(texts, 'welcomeLine');
      return h('div', { style: full() },
        ALL.map((p) => {
          const d = FLIPD[p.n], dist = RING(p.r, p.c);
          return h('div', { key: p.n, style: abs(p.x, p.y, 640, 360, { overflow: 'hidden', background: SKY(), backgroundSize: SKY_SIZE, backgroundPosition: `${-p.x}px ${-p.y}px`, transformOrigin: '50% 50%', backfaceVisibility: 'hidden',
            animation: [A('cerTileIn', 1.3, 0.7 + dist * 0.1, 0, 'cubic-bezier(.2,.8,.2,1)'), A('cerFlip', 0.95, C.FLIP + d, 0, 'cubic-bezier(.55,.05,.75,.3)', 'forwards')].join(', ') }) },
            h('div', { style: abs(14, 14, 612, 332, { border: '1px solid rgba(150,190,240,.2)', borderRadius: 12, boxSizing: 'border-box' }) }),
            corners(24, 'rgba(212,242,92,.55)', 20),
            p.n === 4 ? h(Seal, { d: 250, style: { left: 195, top: 55, animation: 'cerFloat 6s ease-in-out infinite alternate' } }) : null,
            p.n === 1 ? h(TitleBlock, { x: 0, eyebrow: 'SPACE PROGRAM OFFICE', title, line, anim: (i) => ({ animation: A('cerRise', 1.4, 1.2 + i * 0.3, 0) }) }) : null,
            p.n === 7 ? h('div', { style: full({ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }) },
              h('div', { style: { width: 120, height: 2, background: 'linear-gradient(90deg, transparent, #d4f25c, transparent)', animation: A('cerDrawX', 1.2, 1.8, 0) } }),
              h('div', { style: { fontFamily: MONO, fontSize: 22, letterSpacing: '.3em', color: 'rgba(159,220,255,.8)', animation: A('cerRise', 1.4, 2, 0) } }, dateStr())) : null,
            // the glint of the tile as it turns
            h('div', { style: full({ background: 'linear-gradient(100deg, transparent 20%, rgba(220,240,255,.45) 50%, transparent 80%)', animation: A('cerGlint', 0.6, C.FLIP + d - 0.1, 0, 'ease-out') }) }));
        }),
        h(Seams, { T0: 0, at: 0, outAt: C.FLIP - 0.2 }),
        // a line of light down the wall as the last tiles go
        h('div', { style: abs(0, 0, 1920, 2, { background: 'linear-gradient(90deg, rgba(212,242,92,0), #d4f25c 20%, #9fdcff 80%, rgba(159,220,255,0))', boxShadow: '0 0 18px rgba(159,220,255,.55)', animation: A('mvSweepDown', 1.4, C.FLIP + 0.9, 0, 'cubic-bezier(.65,0,.35,1)') }) }));
    };

    /** props: start (performance.now() of second 0; may be past or ahead), video (url), texts, preview, end (performance.now()
     *  of the remote's "end": straight to the closing), onWake (the home wall should wake under the closing card), onDone. */
    const Ceremony = (props) => {
      const { start, video, texts, preview } = props;
      const T = useRef(() => (performance.now() - start) / 1000 * rate()).current;
      const T0 = useRef(T()).current;
      window.__cerClock = T;   // (where the sequence is: for a preview recording's sync)
      const vid = useRef(null), cb = useRef(props); cb.current = props;
      const [st, setSt] = useState(() => ({ doors: T0 < C.OPEN + 2.6, space: T0 < C.VIDEO + 1.4, base: true, fin: null, vidOn: T0 >= C.VIDEO }));
      const r = useRef({ fin: null, synth: null, played: false }).current;
      const finish = (why) => {
        if (r.fin != null) return;
        r.fin = T(); r.finAt = performance.now(); window.__cerFinAt = r.fin;
        if (r.synth && why === 'end') r.synth.stop(0.6);
        const c = window.cerSound.ready() && rate() === 1 && !preview ? ctxOf() : null;
        if (c) { const S = makeSynth(c); scoreFinale(S, c.currentTime + 0.03); r.finSynth = S; }
        const v = vid.current;
        if (v) { try { v.animate([{ opacity: 1 }, { opacity: 0 }], { delay: 900, duration: 1100, fill: 'forwards', easing: 'ease-in-out' }); } catch (e) {} if (v.volume) { const t0 = performance.now(), fade = () => { const k = 1 - (performance.now() - t0) / 1500; if (!vid.current) return; v.volume = Math.max(0, k); if (k > 0) requestAnimationFrame(fade); else v.pause(); }; requestAnimationFrame(fade); } }
        setSt((s) => Object.assign({}, s, { fin: r.fin }));
      };
      // the score, from where the picture is (now, or once the browser lets sound play)
      useEffect(() => {
        if (preview || rate() !== 1) return;
        const c = ctxOf();
        const go = () => { if (r.synth || r.fin != null || !c || c.state !== 'running') return; const t = T(); if (t > C.FLASH) return; r.synth = makeSynth(c); scoreIntro(r.synth, t, c.currentTime + 0.03); };
        go();
        if (c && c.state !== 'running') { c.addEventListener('statechange', go); c.resume().catch(() => {}); }
        return () => { if (c) c.removeEventListener('statechange', go); if (r.synth) r.synth.stop(0.3); if (r.finSynth) r.finSynth.stop(0.3); };
      }, []);
      // the acts come and go on the clock; the video starts at its second
      useEffect(() => {
        const id = setInterval(() => {
          const t = T(), fin = r.fin, ft = fin == null ? 0 : (performance.now() - r.finAt) / 1000 * rate();
          setSt((s) => {
            const n = { doors: fin == null ? t < C.OPEN + 2.6 : ft < 2.4 && s.doors, space: fin == null ? t < C.VIDEO + 1.4 : ft < 2.4 && s.space, base: fin == null || ft < 2.6, fin: s.fin, vidOn: s.vidOn || (fin == null && t >= C.VIDEO) };
            return n.doors === s.doors && n.space === s.space && n.base === s.base && n.vidOn === s.vidOn ? s : n;
          });
          if (fin == null && t >= C.VIDEO && !r.played) {
            r.played = true; const v = vid.current;
            if (!v || preview) { finish('novideo'); return; }
            try { if (t > C.VIDEO + 0.5 && v.duration) v.currentTime = Math.min(v.duration - 0.5, t - C.VIDEO); } catch (e) {}
            v.playbackRate = rate(); v.muted = false; v.volume = 1;
            const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => finish('novideo')); });
            r.vidWatch = setTimeout(() => { if (v.paused || v.currentTime < 0.05) finish('novideo'); }, 6000 / rate());
          }
          if (fin != null) {
            if (ft >= C.WAKE && !r.woke) { r.woke = true; cb.current.onWake && cb.current.onWake(); }
            if (ft >= C.DONE && !r.done) { r.done = true; cb.current.onDone && cb.current.onDone(); }
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
      return h('div', { style: { position: 'absolute', inset: 0, zIndex: 50, overflow: 'hidden', direction: 'ltr', pointerEvents: 'none', fontFamily: HEB, color: '#e6f1ff', animation: 'ovIn .9s ease both' } },
        st.base ? h('div', { key: 'base', style: full({ background: '#02050c' }) }) : null,
        st.space ? h(Space, { key: 'space', T, T0, texts }) : null,
        st.doors ? h(Doors, { key: 'doors', T0, texts }) : null,
        st.doors ? h(Front, { key: 'front', T, T0 }) : null,
        st.base ? h('video', { key: 'v', ref: vid, src: video || '/assets/promo.mp4', preload: 'auto', playsInline: true, onEnded: () => finish('ended'), onError: () => { if (r.played) finish('novideo'); },
          style: full({ width: '100%', height: '100%', objectFit: 'cover', background: '#000', visibility: st.vidOn ? 'visible' : 'hidden' }) }) : null,
        st.base ? h('div', { key: 'flash', style: full({ background: 'radial-gradient(circle at 50% 60%, #ffffff 0%, #eef7ff 45%, #d5eaff 100%)', opacity: 0, animation: [A('cerFlashIn', 0.45, C.FLASH - 0.45, T0, 'ease-in'), A('cerOut', 1.2, C.VIDEO + 0.15, T0, 'ease-out', 'forwards')].join(', ') }) }) : null,
        st.fin != null ? h(Finale, { key: 'fin', T0: 0, texts }) : null);
    };

    /** Before the ceremony: the emblem, the title, "it will begin shortly", and whether the browser lets sound play. */
    const Standby = ({ texts, preview }) => {
      const [snd, setSnd] = useState(() => window.cerSound.ready());
      const was = useRef(snd);
      useEffect(() => {
        if (preview) return;
        const c = ctxOf(); if (c && c.state === 'suspended') c.resume().catch(() => {});
        const id = setInterval(() => {
          const ok = window.cerSound.ready();
          if (ok && !was.current && c) { const S = makeSynth(c), t = c.currentTime + 0.05; S.ping(t, { f: E.E5, dur: 2.2, gain: 0.06, wet: 0.7 }); S.ping(t + 0.18, { f: E.B5, dur: 2.6, gain: 0.05, wet: 0.7 }); }
          was.current = ok; setSnd(ok);
        }, 400);
        return () => clearInterval(id);
      }, []);
      const soon = txt(texts, 'soon');
      return h('div', { style: { position: 'absolute', inset: 0, zIndex: 50, overflow: 'hidden', direction: 'ltr', pointerEvents: 'none', fontFamily: HEB, color: '#e6f1ff', background: SKY(), backgroundSize: SKY_SIZE, animation: 'ovIn 1.2s ease both' } },
        h(TitleBlock, { eyebrow: txt(texts, 'eyebrow'), title: txt(texts, 'title'), line: txt(texts, 'line'), anim: (i) => ({ animation: `cerRise 1400ms cubic-bezier(.16,1,.3,1) ${600 + i * 280}ms both` }) }),
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
