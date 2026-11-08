// Background music for the lobby wall: quiet ambient music made live in the browser (Web Audio), so there are no audio
// files, no licences to track and nothing to download; it never repeats and costs almost no memory or CPU.
// Three styles, all in D major, slow and soft, meant to sit under office talk:
//   drift  "מרחב"     — warm pads and a low hum, chords changing every ~18 s
//   stars  "כוכבים"   — the same pads, quieter, with sparse bell-like notes in a soft echo
//   piano  "פסנתר רך" — soft piano-like notes, each repeating on its own slow cycle (they meet in ever-new
//                        combinations, after Brian Eno's "Music for Airports" idea), over a faint pad
// window.SpaceMusic.create() → { set({ on, vol, style }), blocked(), playing() }. vol is 0–100. A browser starts sound
// only after a click or key on the page (or with Chrome's --autoplay-policy=no-user-gesture-required, as in the lobby
// shortcut): until then blocked() is true, and the first click or key starts it.
(() => {
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  // Dadd9 · Bm7(add11) · Gmaj7 · A6/9 — bass and five pad notes each
  const CHORDS = [
    { bass: 38, notes: [57, 62, 64, 66, 69] },
    { bass: 35, notes: [54, 57, 62, 64, 66] },
    { bass: 31, notes: [55, 59, 62, 66, 69] },
    { bass: 33, notes: [57, 61, 64, 66, 69] },
  ];
  const PENTA = [74, 76, 78, 81, 83, 86, 88, 90];        // D major pentatonic, high: the bells
  // the piano's loops: a note and its own cycle in seconds (no two share a common rhythm)
  const LOOPS = [[62, 19.7], [66, 23.3], [69, 29.1], [71, 31.7], [74, 37.9], [78, 41.3], [64, 47.9], [57, 53.3]];
  const STYLES = {
    drift: { chord: 18, pad: 1, bells: false, piano: false },
    stars: { chord: 15, pad: 0.75, bells: true, piano: false },
    piano: { chord: 20, pad: 0.35, bells: false, piano: true },
  };
  const AHEAD = 4;                                        // seconds scheduled ahead (the page's timers may lag)

  /** opts.ctx / opts.ahead: render into a given (offline) context, scheduled that far ahead (scripts/music-preview.mjs). */
  function create(opts = {}) {
    const ahead = opts.ahead || AHEAD;
    let ctx = null, master = null, dry = null, wet = null, echo = null, padF = null, timer = 0, stopT = 0;
    let want = { on: false, vol: 30, style: 'stars' }, running = false, unlockBound = false;
    let nextChord = 0, chordI = 0, nextBell = 0, loopsAt = [];

    function impulse(sec) {
      const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c); let lp = 0;
        for (let i = 0; i < n; i++) { lp += 0.35 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - i / n, 2.6); }
      }
      return buf;
    }
    function build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC && !opts.ctx) return false;
      ctx = opts.ctx || new AC({ latencyHint: 'playback' });
      // nothing is scheduled until the browser lets the page make sound (it warns for every note otherwise)
      ctx.onstatechange = () => { if (ctx.state === 'running' && want.on) apply(); };
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.05; comp.release.value = 0.6;
      master = ctx.createGain(); master.gain.value = 0;
      master.connect(comp); comp.connect(ctx.destination);
      dry = ctx.createGain(); dry.gain.value = 0.55; dry.connect(master);
      const verb = ctx.createConvolver(); verb.buffer = impulse(6.5);
      wet = ctx.createGain(); wet.gain.value = 0.9; wet.connect(verb); verb.connect(master);
      // a soft echo for the bells and the piano, into the reverb
      echo = ctx.createDelay(2); echo.delayTime.value = 0.62;
      const fb = ctx.createGain(), eLp = ctx.createBiquadFilter(); fb.gain.value = 0.33; eLp.type = 'lowpass'; eLp.frequency.value = 2400;
      echo.connect(eLp); eLp.connect(fb); fb.connect(echo); eLp.connect(wet);
      // the pads' shared filter, opening and closing slowly
      padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 900; padF.Q.value = 0.5;
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 1 / 27; lfoG.gain.value = 350;
      lfo.connect(lfoG); lfoG.connect(padF.frequency); lfo.start();
      padF.connect(dry); padF.connect(wet);
      return true;
    }
    const env = (g, t, peak, a, hold, r) => {
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + a + hold); g.gain.linearRampToValueAtTime(0, t + a + hold + r);
      return t + a + hold + r + 0.1;
    };
    function chord(t, S) {
      const c = CHORDS[chordI++ % CHORDS.length], len = S.chord, lvl = 0.055 * S.pad;
      for (const m of c.notes) {
        const g = ctx.createGain(), end = env(g, t, lvl * rnd(0.7, 1), 5, len - 5, 7);
        g.connect(padF);
        for (const [type, det, k] of [['triangle', -7, 1], ['sawtooth', 6, 0.35]]) {
          const o = ctx.createOscillator(), og = ctx.createGain();
          o.type = type; o.frequency.value = mtof(m); o.detune.value = det + rnd(-3, 3); og.gain.value = k;
          o.connect(og); og.connect(g); o.start(t); o.stop(end);
        }
      }
      // a low hum on the chord's root
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'sine'; b.frequency.value = mtof(c.bass + 12);
      b.connect(bg); bg.connect(dry); b.start(t); b.stop(env(bg, t, 0.09 * Math.max(0.5, S.pad), 6, len - 6, 7));
    }
    function bell(t) {
      const f = mtof(pick(PENTA)), o = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; m.frequency.value = f * 3.5;
      mg.gain.setValueAtTime(f * 0.6, t); mg.gain.exponentialRampToValueAtTime(1, t + 2.5);
      m.connect(mg); mg.connect(o.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.028, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
      o.connect(g); g.connect(dry); g.connect(wet); g.connect(echo);
      o.start(t); m.start(t); o.stop(t + 5.2); m.stop(t + 5.2);
    }
    function piano(t, midi) {
      const f = mtof(midi), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(700, t + 4);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.085, t + 0.01); g.gain.exponentialRampToValueAtTime(0.02, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
      lp.connect(g); g.connect(dry); g.connect(wet); g.connect(echo);
      for (const [type, mul, k] of [['triangle', 1, 1], ['sine', 2, 0.3], ['sine', 0.5, 0.25]]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = type; o.frequency.value = f * mul; o.detune.value = rnd(-4, 4); og.gain.value = k;
        o.connect(og); og.connect(lp); o.start(t); o.stop(t + 7.2);
      }
    }
    function pump() {
      if (!running || !ctx) return;
      const S = STYLES[want.style] || STYLES.stars, until = ctx.currentTime + ahead;
      while (nextChord < until) { chord(nextChord, S); nextChord += S.chord; }
      if (S.bells) while (nextBell < until) { bell(nextBell); nextBell += rnd(2.5, 8); }
      else nextBell = until;
      if (S.piano) LOOPS.forEach(([m, p], i) => { while (loopsAt[i] < until) { piano(loopsAt[i], m); loopsAt[i] += p; } });
      else loopsAt = LOOPS.map(() => until);
    }
    function start() {
      if (running) return;
      running = true;
      const t = ctx.currentTime + 0.1;
      nextChord = t; nextBell = t + rnd(3, 6);
      loopsAt = LOOPS.map(([, p]) => t + 1 + rnd(0, p * 0.6));
      pump(); timer = setInterval(pump, 1000);
    }
    function stop() { running = false; clearInterval(timer); timer = 0; }
    const level = () => Math.pow(Math.max(0, Math.min(100, want.vol)) / 100, 1.6) * 0.9;
    function apply() {
      if (!want.on) {
        if (!ctx) return;
        master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 1);
        clearTimeout(stopT); stopT = setTimeout(() => { if (!want.on) { stop(); ctx.suspend().catch(() => {}); } }, 6000);
        return;
      }
      if (!ctx && !build()) return;
      clearTimeout(stopT);
      if (ctx.state !== 'running' && !opts.ctx) { ctx.resume().catch(() => {}); bindUnlock(); return; }
      start();
      master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(level(), ctx.currentTime, 1.5);
    }
    // The first click, touch or key on the page lets the browser make sound.
    function bindUnlock() {
      if (unlockBound) return; unlockBound = true;
      const go = () => {
        if (!ctx) return;
        ctx.resume().then(() => { if (ctx.state === 'running') { unlockBound = false; for (const e of EV) removeEventListener(e, go, true); } }).catch(() => {});
      };
      const EV = ['pointerdown', 'keydown', 'touchend'];
      for (const e of EV) addEventListener(e, go, true);
    }
    return {
      set(o) {
        const n = { on: !!o.on, vol: Number.isFinite(o.vol) ? o.vol : want.vol, style: STYLES[o.style] ? o.style : want.style };
        if (n.on === want.on && n.vol === want.vol && n.style === want.style) return;
        want = n; apply();
      },
      blocked: () => !!(want.on && ctx && ctx.state !== 'running'),
      playing: () => !!(want.on && ctx && ctx.state === 'running'),
    };
  }
  window.SpaceMusic = { create, STYLES: Object.keys(STYLES) };
})();
