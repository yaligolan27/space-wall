// The ribbon-cutting opening, in 3D (three.js, the copy in /vendor; the emblem's HDR bloom pipeline). ceremony.js runs the
// clock, the video and the sound; this draws the picture: CerStage.create(host, { texts, en }) → { render(t, ft), dispose() }.
//   t   seconds from "go" (the opening, up to the video); ft  seconds since the video ended (the closing), else null
// The story: a dark hangar, the new home's great doors at its end with the office's emblem across their seam. The lights
// come on toward the doors; a red ribbon with a bow across them; the seal around the emblem counts 10…1; a blade of light
// cuts the ribbon; the locks release and the doors part onto space: the sun rising over the Earth's limb, "a new era", and
// a dive toward Israel's lights into the promo video. After the video the Earth pulls back from Israel and comes to rest
// where the wall's emblem globe is, as the wall assembles around it.
// Deterministic: every frame is a function of (t, ft) only (the ribbon's fall is simulated once, ahead), so a recording
// can step it at any rate.
(() => {
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const seg = (t, a, b) => cl((t - a) / (b - a));
  const ss = (a, b, x) => { const u = seg(x, a, b); return u * u * (3 - 2 * u); };
  const inOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const out3 = (u) => 1 - Math.pow(1 - u, 3), in3 = (u) => u * u * u, outE = (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  /** Hermite through keys [{t, v:[..]}], Catmull-Rom tangents (time-aware, softened), flat at both ends */
  const track = (keys, t) => {
    const n = keys.length;
    if (t <= keys[0].t) return keys[0].v.slice();
    if (t >= keys[n - 1].t) return keys[n - 1].v.slice();
    let i = 0; while (t > keys[i + 1].t) i++;
    const k0 = keys[i], k1 = keys[i + 1], dt = k1.t - k0.t, s = (t - k0.t) / dt;
    const tan = (j) => { if (j <= 0 || j >= n - 1) return k0.v.map(() => 0); const a = keys[j - 1], b = keys[j + 1]; return a.v.map((x, c) => 0.85 * (b.v[c] - x) / (b.t - a.t)); };
    const m0 = tan(i), m1 = tan(i + 1), s2 = s * s, s3 = s2 * s;
    return k0.v.map((x, c) => (2 * s3 - 3 * s2 + 1) * x + (s3 - 2 * s2 + s) * dt * m0[c] + (-2 * s3 + 3 * s2) * k1.v[c] + (s3 - s2) * dt * m1[c]);
  };

  // ---- the timeline (seconds from "go"; ceremony.js keeps the same numbers) ----------------------------------------
  const K = {
    LIGHTS: 0.9, DOOR_ON: 3.6, EYEBROW: 4.8, TITLE: 5.3, LINE: 6.3, TITLE_OUT: 10.6, SPOT: 11.4, HONOR: 11.9, HONOR_OUT: 14.3,
    COUNT: 15, CUT: 25, UNLOCK: 25.9, OPEN: 27.7, OPEN_DUR: 4.4, SUN: 28.5, EXIT: 30.2, OUTSIDE: 32.6, TAG: 33.4, TAG_OUT: 37.3,
    PLUNGE: 37.0, FLASH: 40.4, VIDEO: 40.8,
    // the closing, from the video's end
    F_TXT: 1.6, F_TXT_OUT: 5.0, WAKE: 6.6, LAND: 8.0, DONE: 11.1,
  };
  const BEATS = Array.from({ length: 10 }, (_, i) => K.COUNT + i);
  const pulseAt = (t, list, k) => list.reduce((s, b) => s + (t >= b ? Math.exp(-(t - b) * (k || 5)) : 0), 0);

  // ---- the hangar's measures (metres) -------------------------------------------------------------------------------
  const HW = 9, HH = 11, HL = 44;              // half width, height, length of the hall (doors at z = 0, the hall toward +z)
  const DW = 6, DHT = 7.5, DT = 0.36;          // one door leaf: width, height, thickness
  const SEAL = { y: 4.75, r: 2.0 };            // the seal round the emblem, on the seam
  const RIB = { y: 2.3, z: 2.3, half: 5.0, w: 0.4, sag: 0.1 };   // the ribbon: height, depth, half span, width, sag
  const CLAMPS = [1.05, 6.9];                  // the two lock bars across the seam

  const DEF = {
    eyebrow: ['טקס חנוכת המשרדים החדשים', 'INAUGURATION CEREMONY'], title: ['מנהלת החלל', 'SPACE PROGRAM OFFICE'], line: ['הבית החדש במידטאון', 'OUR NEW HOME IN MIDTOWN'],
    honor: ['במעמד ראש מפא״ת', 'IN THE PRESENCE OF THE HEAD OF DDR&D'], tag: ['עידן חדש', 'A NEW ERA'], tagLine: ['לחלל הישראלי', 'FOR ISRAELI SPACE'],
    welcome: ['ברוכים הבאים', 'WELCOME'], welcomeLine: ['לבית החדש של מנהלת החלל', 'TO OUR NEW HOME'] };
  const OPT = { eyebrow: 1, line: 1, honor: 1, tagLine: 1, welcomeLine: 1 };
  const txt = (texts, en, k) => { const v = texts && texts[k]; if (typeof v === 'string') { if (v.trim() && !en) return v.trim(); if (!v.trim() && OPT[k]) return ''; } return DEF[k][en ? 1 : 0]; };

  // what the picture needs from the network, fetched once (the standby screen starts it, so "go" finds it ready)
  let assetsP = null;
  const assets = () => assetsP || (assetsP = (async () => {
    const THREE = await import((window.__resources && window.__resources.threeModule) || '/vendor/three.module.js');
    const loader = new THREE.TextureLoader();
    const loadTex = (url, srgb) => new Promise((res) => loader.load(url, (tx) => { if (srgb) tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; res(tx); }, undefined, () => res(null)));
    const loadImg = (url) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
    const fontsReady = document.fonts && document.fonts.load ? Promise.all(['700 100px Heebo', '300 100px Heebo', '300 100px Lexend', '500 40px "IBM Plex Mono"'].map((f) => document.fonts.load(f).catch(() => {}))) : Promise.resolve();
    const TX = '/assets/textures/';
    const [logo, dayT, nightT, cloudT, specT] = await Promise.all([loadImg('/assets/logo-mark.png'), loadTex(TX + 'earth_atmos_2048.jpg', true), loadTex(TX + 'earth_lights_2048.png', true),
      loadTex(TX + 'earth_clouds_1024.png', false), loadTex(TX + 'earth_specular_2048.jpg', false), fontsReady]);
    return { THREE, logo, dayT, nightT, cloudT, specT };
  })().catch((e) => { assetsP = null; throw e; }));

  async function create(host, opts) {
    opts = opts || {};
    const en = !!opts.en, texts = opts.texts || null;
    const { THREE, logo, dayT, nightT, cloudT, specT } = await assets();
    const V3 = THREE.Vector3, Q = THREE.Quaternion;

    // ---------- renderer and the post chain (HDR, MSAA, bloom, anamorphic streak, ACES; as the emblem's) ----------
    const W = 1920, H = 1080;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: !!opts.keep, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(renderer.domElement);
    let scale = Math.min(1.25, Math.max(0.5, opts.scale || 1));
    const gl2 = renderer.capabilities.isWebGL2, ftype = gl2 && renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const post = (() => {
      const sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: ftype, samples: gl2 ? 4 : 0 });
      const o = { type: ftype, depthBuffer: false }, LV = 6, down = [], up = [];
      for (let i = 0; i < LV; i++) { down.push(new THREE.WebGLRenderTarget(4, 4, o)); if (i < LV - 1) up.push(new THREE.WebGLRenderTarget(4, 4, o)); }
      const stA = new THREE.WebGLRenderTarget(4, 4, o), stB = new THREE.WebGLRenderTarget(4, 4, o);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
      const quad = new THREE.Mesh(geo); quad.frustumCulled = false;
      const qs = new THREE.Scene(); qs.add(quad); const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending });
      const v2 = () => ({ value: new THREE.Vector2() }), tx = () => ({ value: null });
      const bright = mk(`uniform sampler2D tSrc; uniform vec2 uTx; uniform float uTh, uKnee; varying vec2 vUv;
vec3 pre(vec2 o){ vec3 c = texture2D(tSrc, vUv + o).rgb; if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0); c = min(c, vec3(64.0)); float br = max(c.r, max(c.g, c.b)); float s = clamp(br - uTh + uKnee, 0.0, 2.0 * uKnee); s = s * s / (4.0 * uKnee + 1e-4); return c * max(s, br - uTh) / max(br, 1e-4); }
void main(){ vec2 o = uTx * 0.5; gl_FragColor = vec4((pre(-o) + pre(o) + pre(vec2(o.x, -o.y)) + pre(vec2(-o.x, o.y))) * 0.25, 1.0); }`, { tSrc: tx(), uTx: v2(), uTh: { value: 0.85 }, uKnee: { value: 0.5 } });
      const dn = mk(`uniform sampler2D tSrc; uniform vec2 uTx; varying vec2 vUv;
void main(){ vec2 o = uTx * 0.5; vec4 s = texture2D(tSrc, vUv) * 4.0; s += texture2D(tSrc, vUv - o); s += texture2D(tSrc, vUv + o); s += texture2D(tSrc, vUv + vec2(o.x, -o.y)); s += texture2D(tSrc, vUv - vec2(o.x, -o.y)); gl_FragColor = s / 8.0; }`, { tSrc: tx(), uTx: v2() });
      const upm = mk(`uniform sampler2D tSrc, tAdd; uniform vec2 uTx; varying vec2 vUv;
void main(){ vec2 o = uTx * 0.5; vec4 s = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)); s += texture2D(tSrc, vUv + vec2(-o.x, o.y)) * 2.0; s += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)); s += texture2D(tSrc, vUv + vec2(o.x, o.y)) * 2.0;
 s += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)); s += texture2D(tSrc, vUv + vec2(o.x, -o.y)) * 2.0; s += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)); s += texture2D(tSrc, vUv + vec2(-o.x, -o.y)) * 2.0;
 gl_FragColor = s / 12.0 + texture2D(tAdd, vUv); }`, { tSrc: tx(), tAdd: tx(), uTx: v2() });
      const stk = mk(`uniform sampler2D tSrc; uniform vec2 uTx; uniform float uStep, uTh; varying vec2 vUv;
void main(){ vec3 s = vec3(0.0); float ws = 0.0; for (int i = -7; i <= 7; i++) { float fi = float(i); float w = exp(-abs(fi) * 0.3); s += max(texture2D(tSrc, vUv + vec2(fi * uStep * uTx.x, 0.0)).rgb - uTh, 0.0) * w; ws += w; } gl_FragColor = vec4(s / ws, 1.0); }`, { tSrc: tx(), uTx: v2(), uStep: { value: 1 }, uTh: { value: 0 } });
      const comp = mk(`uniform sampler2D tScene, tBloom, tStreak; uniform float uBloom, uStreak, uExpo, uFade, uCA, uOpaque, uVig, uGrain, uTime, uZoom, uFlash, uSat; uniform vec3 uFlashCol; varying vec2 vUv;
vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){ const mat3 IM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
 const mat3 OM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
 c *= uExpo / 0.6; c = OM * rrt(IM * c); return clamp(c, 0.0, 1.0); }
vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 safe(vec3 c){ return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : min(c, vec3(64.0)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){ vec2 d = vUv - 0.5; vec4 sc = texture2D(tScene, vUv); if (isnan(sc.a)) sc.a = 0.0;
 vec3 col;
 if (uZoom > 0.0005) { vec3 acc = vec3(0.0); for (int i = 0; i < 12; i++) { float k = 1.0 - uZoom * float(i) / 11.0; acc += safe(texture2D(tScene, 0.5 + d * k).rgb); } col = acc / 12.0; }
 else col = safe(vec3(texture2D(tScene, vUv + d * uCA).r, sc.g, texture2D(tScene, vUv - d * uCA).b));
 col += safe(texture2D(tBloom, vUv).rgb) * uBloom + safe(texture2D(tStreak, vUv).rgb) * vec3(0.55, 0.75, 1.0) * uStreak;
 vec3 o = srgb(aces(max(col, 0.0)));
 float l = dot(o, vec3(0.2126, 0.7152, 0.0722)); o = mix(vec3(l), o, uSat);
 o *= 1.0 - uVig * smoothstep(0.3, 0.95, length(d * vec2(1.0, 0.8)));
 o += (hash(vUv * 1371.0 + fract(uTime) * 91.0) - 0.5) * uGrain;
 o = mix(o, uFlashCol, uFlash);
 o = clamp(o, 0.0, 1.0) * uFade;
 float a = mix(clamp(max(sc.a * uFade, max(o.r, max(o.g, o.b))), 0.0, 1.0), uFade, uOpaque);
 gl_FragColor = vec4(o, a); }`,
        { tScene: tx(), tBloom: tx(), tStreak: tx(), uBloom: { value: 0.16 }, uStreak: { value: 0.18 }, uExpo: { value: 1.0 }, uFade: { value: 1 }, uCA: { value: 0.0018 }, uOpaque: { value: 1 },
          uVig: { value: 0.55 }, uGrain: { value: 0.025 }, uTime: { value: 0 }, uZoom: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uSat: { value: 1 } });
      const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(qs, qc); };
      const texel = (m, rt) => m.uniforms.uTx.value.set(1 / rt.width, 1 / rt.height);
      const set = (w, h) => { sceneRT.setSize(w, h); let a = w, b = h; for (let i = 0; i < LV; i++) { a = Math.max(1, a >> 1); b = Math.max(1, b >> 1); down[i].setSize(a, b); if (i < LV - 1) up[i].setSize(a, b); } stA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 4)); stB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 4)); };
      const finish = () => {
        bright.uniforms.tSrc.value = sceneRT.texture; texel(bright, sceneRT); pass(bright, down[0]);
        for (let i = 1; i < LV; i++) { dn.uniforms.tSrc.value = down[i - 1].texture; texel(dn, down[i - 1]); pass(dn, down[i]); }
        let src = down[LV - 1];
        for (let i = LV - 2; i >= 0; i--) { upm.uniforms.tSrc.value = src.texture; upm.uniforms.tAdd.value = down[i].texture; texel(upm, src); pass(upm, up[i]); src = up[i]; }
        stk.uniforms.tSrc.value = down[1].texture; texel(stk, down[1]); stk.uniforms.uStep.value = 1.5; stk.uniforms.uTh.value = 0.6; pass(stk, stA);
        stk.uniforms.tSrc.value = stA.texture; texel(stk, stA); stk.uniforms.uStep.value = 5; stk.uniforms.uTh.value = 0; pass(stk, stB);
        comp.uniforms.tScene.value = sceneRT.texture; comp.uniforms.tBloom.value = up[0].texture; comp.uniforms.tStreak.value = stB.texture; pass(comp, null);
      };
      const dispose = () => { [sceneRT, stA, stB, ...down, ...up].forEach((r) => r.dispose()); [bright, dn, upm, stk, comp].forEach((m) => m.dispose()); geo.dispose(); };
      return { sceneRT, set, finish, comp, dispose };
    })();
    let bw = 0, bh = 0;
    const fit = () => {
      const r = host.getBoundingClientRect(), cssW = host.clientWidth || W, cssH = host.clientHeight || H;
      const shown = r.width && cssW ? r.width / cssW : 1;                 // the stage's scale on the screen
      const k = Math.min(1.25, Math.max(0.35, shown * (window.devicePixelRatio || 1))) * scale;
      const w = Math.round(cssW * k), h = Math.round(cssH * k);
      if (w === bw && h === bh) return;
      bw = w; bh = h; renderer.setPixelRatio(1); renderer.setSize(w, h, false); post.set(w, h);
      cam.aspect = cssW / cssH; cam.updateProjectionMatrix(); scam.aspect = cam.aspect; scam.updateProjectionMatrix();
    };

    // ---------- small makers ----------
    const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
    const ctex = (c, srgb, rep) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
    /** a tangent-space normal map from a height canvas (white = high) */
    const normalMap = (hc, k, rep) => {
      const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
      const outc = document.createElement('canvas'); outc.width = w; outc.height = h; const og = outc.getContext('2d'), img = og.createImageData(w, h), d = img.data;
      const H_ = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (H_(x + 1, y) - H_(x - 1, y)) * k, dy = (H_(x, y + 1) - H_(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
        d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
      og.putImageData(img, 0, 0); return ctex(outc, false, rep);
    };
    const additive = (m) => { m.transparent = true; m.depthWrite = false; m.blending = THREE.AdditiveBlending; m.toneMapped = false; return m; };
    const glowTex = ctex(canvas(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }), false);
    const sprite = (tex, color, size, opacity) => { const m = additive(new THREE.SpriteMaterial({ map: tex, color, opacity: opacity === undefined ? 1 : opacity })); const s = new THREE.Sprite(m); s.scale.setScalar(size); return s; };
    const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
    const R = mulberry(0x5ACE);

    // ---------- the hall ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070c18, 0.021);
    const cam = new THREE.PerspectiveCamera(38, W / H, 0.05, 220);
    const hall = new THREE.Group(); scene.add(hall);
    const envMats = [];   // materials whose reflections come up with the lights
    const std = (o) => { const m = new THREE.MeshStandardMaterial(o); envMats.push(m); return m; };
    // studio of the hall for reflections: dark, with strips like the hall's lights
    (() => {
      const env = new THREE.Scene();
      env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 24, 60), new THREE.MeshBasicMaterial({ color: 0x0b111e, side: THREE.BackSide })));
      const strip = (w, h, d, x, y, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); env.add(m); };
      for (let z = -24; z <= 24; z += 6) { strip(0.4, 18, 0.4, -15, 0, z, hdr(0x9fdcff, 3)); strip(0.4, 18, 0.4, 15, 0, z, hdr(0x9fdcff, 3)); strip(30, 0.4, 0.4, 0, 11, z, hdr(0xe8f4ff, 3.5)); }
      strip(2, 0.3, 50, 0, 11.5, 0, hdr(0xffffff, 4)); strip(30, 14, 0.2, 0, 0, -29, hdr(0x1d2c4a, 1)); strip(6, 8, 0.2, 0, 2, 29.5, hdr(0xfff1dc, 2.5));
      const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, 0.035).texture; pm.dispose();
    })();
    const PXM = 170.67;  // texture pixels a metre on the doors
    // wall / ceiling panels (one tile = 4 m)
    const panelSet = (() => {
      const S = 512, hc = canvas(S, S, (g) => {
        g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, S, S);
        const panel = (x, y, w, h) => { g.fillStyle = '#9a9a9a'; g.fillRect(x + 6, y + 6, w - 12, h - 12); g.fillStyle = '#8a8a8a'; g.fillRect(x + 14, y + 14, w - 28, h - 28); };
        panel(0, 0, 256, 256); panel(256, 0, 256, 128); panel(256, 128, 256, 128); panel(0, 256, 512, 96); panel(0, 352, 170, 160); panel(170, 352, 342, 160);
        g.fillStyle = '#c8c8c8'; for (let i = 0; i < 26; i++) { const x = 20 + (i % 13) * 37, y = i < 13 ? 262 : 344; g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); }
      });
      const ac = canvas(S, S, (g) => {
        g.fillStyle = '#2a3140'; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + R() * 0.03})`; g.fillRect(R() * S, R() * S, 2 + R() * 60, 1); }
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(256, 0, 256, 128); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 256, 512, 96);
        g.fillStyle = 'rgba(212,242,92,0.35)'; g.font = '500 18px "IBM Plex Mono"'; g.fillText('SPO · BAY 01', 28, 300);
      });
      const rc = canvas(256, 256, (g) => { g.fillStyle = '#7d7d7d'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},0.06)`; g.fillRect(R() * 256, R() * 256, 4 + R() * 30, 2 + R() * 8); } });
      return { map: (rep) => ctex(ac, true, rep), normal: (rep) => normalMap(hc, 3, rep), rough: (rep) => ctex(rc, false, rep) };
    })();
    // floor: 2 m plates, guide lines, the threshold's stripes
    const floorMat = (() => {
      const S = 1024, per = 8;   // 8 plates a tile, tile = 16 m
      const ac = canvas(S, S, (g) => {
        g.fillStyle = '#161b25'; g.fillRect(0, 0, S, S);
        const p = S / per; for (let i = 0; i < per; i++) for (let j = 0; j < per; j++) { const v = 18 + R() * 10; g.fillStyle = `rgb(${v},${v + 4},${v + 12})`; g.fillRect(i * p + 2, j * p + 2, p - 4, p - 4); }
        for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${0.012 + R() * 0.02})`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3); }
      });
      const hc = canvas(S, S, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.fillStyle = '#000'; const p = S / per; for (let i = 0; i <= per; i++) { g.fillRect(i * p - 2, 0, 4, S); g.fillRect(0, i * p - 2, S, 4); } });
      const rc = canvas(512, 512, (g) => { g.fillStyle = '#4a4a4a'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 300; i++) { const v = 40 + R() * 70; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.beginPath(); g.ellipse(R() * 512, R() * 512, 8 + R() * 40, 4 + R() * 20, R() * 3, 0, TAU); g.fill(); } });
      return std({ map: ctex(ac, true, [18 / 16, HL / 16]), normalMap: normalMap(hc, 5, [18 / 16, HL / 16]), roughnessMap: ctex(rc, false, [2, 5]), roughness: 0.55, metalness: 0.6, envMapIntensity: 0 });
    })();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW, HL + 2), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, HL / 2 - 1); floor.receiveShadow = true; hall.add(floor);
    const wallMat = std({ map: panelSet.map([HL / 4, HH / 4]), normalMap: panelSet.normal([HL / 4, HH / 4]), roughnessMap: panelSet.rough([HL / 8, HH / 8]), roughness: 0.6, metalness: 0.7, envMapIntensity: 0 });
    [-1, 1].forEach((s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(HL, HH), wallMat); m.rotation.y = -s * Math.PI / 2; m.position.set(s * HW, HH / 2, HL / 2); m.receiveShadow = true; hall.add(m); });
    const ceilMat = std({ map: panelSet.map([2 * HW / 4, HL / 4]), normalMap: panelSet.normal([2 * HW / 4, HL / 4]), roughness: 0.7, metalness: 0.6, envMapIntensity: 0, color: 0x9aa3b5 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW, HL), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, HH, HL / 2); hall.add(ceil);
    // the far end: a wall with the doorway (the leaves slide behind it), and the heavy frame round the doorway
    const endShape = new THREE.Shape(); endShape.moveTo(-HW, 0); endShape.lineTo(HW, 0); endShape.lineTo(HW, HH); endShape.lineTo(-HW, HH); endShape.lineTo(-HW, 0);
    const hole = new THREE.Path(); hole.moveTo(-DW, 0); hole.lineTo(-DW, DHT); hole.lineTo(DW, DHT); hole.lineTo(DW, 0); hole.lineTo(-DW, 0); endShape.holes.push(hole);
    const endGeo = new THREE.ShapeGeometry(endShape);
    { const p = endGeo.attributes.position, uv = endGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + HW) / 4, p.getY(i) / 4); }
    const endMat = std({ map: panelSet.map([1, 1]), normalMap: panelSet.normal([1, 1]), roughness: 0.6, metalness: 0.7, envMapIntensity: 0, color: 0x8d97aa });
    const endWall = new THREE.Mesh(endGeo, endMat); endWall.position.z = 0.03; endWall.receiveShadow = true; hall.add(endWall);
    // rounded, bevelled bars (frame, ribs)
    const bar = (w, h, d, r) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001); s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - 0.08), bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 4 }); g.translate(0, 0, -(d - 0.08) / 2); return g; };
    const frameMat = std({ color: 0x5b6578, metalness: 0.9, roughness: 0.3, envMapIntensity: 0 });
    const darkMetal = std({ color: 0x252b36, metalness: 0.85, roughness: 0.4, envMapIntensity: 0 });
    const emis = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), toneMapped: false });
    const frame = new THREE.Group(); hall.add(frame);
    const FT = 1.2;
    [[-DW - FT / 2, (DHT + FT) / 2, FT, DHT + FT], [DW + FT / 2, (DHT + FT) / 2, FT, DHT + FT], [0, DHT + FT / 2, 2 * DW + 2 * FT, FT]].forEach(([x, y, w, h]) => {
      const m = new THREE.Mesh(bar(w, h, 0.7, 0.12), frameMat); m.position.set(x, y, 0.38); m.castShadow = true; frame.add(m);
    });
    // light lines in the frame (they come on with the doors)
    const frameGlow = [], frameGlowMat = emis(0x000000);
    [[-DW - 0.08, DHT / 2, 0.06, DHT], [DW + 0.08, DHT / 2, 0.06, DHT], [0, DHT + 0.08, 2 * DW + 0.22, 0.06]].forEach(([x, y, w, h]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frameGlowMat); m.position.set(x, y, 0.74); frame.add(m); frameGlow.push(m); });
    // the plate over the doors: the office's name
    const plate = (() => {
      const c = canvas(2048, 160, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#fff'; g.font = '700 92px Heebo'; g.direction = 'rtl'; g.fillText('מנהלת החלל', w * 0.5, h * 0.52);
        g.direction = 'ltr'; g.font = '500 40px "IBM Plex Mono"'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText('SPACE PROGRAM OFFICE', w * 0.2, h * 0.52); g.fillText('ISRAEL · MOD · DDR&D', w * 0.8, h * 0.52);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 1.0), additive(new THREE.MeshBasicMaterial({ map: ctex(c, true), color: 0x000000 })));
      m.position.set(0, DHT + FT / 2, 0.75); frame.add(m); return m;
    })();
    // ribs: a frame across the hall every 4 m, with light strips facing in
    const ribs = [];
    for (let i = 0; i < 10; i++) {
      const z = 4 + i * 4, g = new THREE.Group(); g.position.z = z; hall.add(g);
      const col = (s) => { const m = new THREE.Mesh(bar(0.7, HH, 0.9, 0.08), darkMetal); m.position.set(s * (HW - 0.35), HH / 2, 0); m.castShadow = true; g.add(m); };
      col(-1); col(1);
      const beam = new THREE.Mesh(bar(2 * HW, 0.8, 0.9, 0.08), darkMetal); beam.position.set(0, HH - 0.4, 0); g.add(beam);
      [-1, 1].forEach((s) => { const b = new THREE.Mesh(bar(2.6, 0.5, 0.7, 0.06), darkMetal); b.position.set(s * (HW - 1.3), HH - 1.3, 0); b.rotation.z = s * Math.PI / 4; g.add(b); });
      const lm = emis(0x000000), strips = [];
      [-1, 1].forEach((s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, HH - 2.2, 0.16), lm); m.position.set(s * (HW - 0.72), (HH - 2.2) / 2 + 0.3, 0); g.add(m); strips.push(m); });
      const top = new THREE.Mesh(new THREE.BoxGeometry(2 * HW - 3.6, 0.07, 0.16), lm); top.position.set(0, HH - 0.82, 0); g.add(top);
      ribs.push({ z, mat: lm, on: K.LIGHTS + (40 - z) / 36 * 2.3, seed: i });
    }
    // floor guide lines toward the doors, and the ceiling's long light
    const guideMat = emis(0x000000);
    [-3.2, 3.2].forEach((x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, HL - 1.5), guideMat); m.position.set(x, 0.006, HL / 2 + 0.9); hall.add(m); });
    for (let z = 1.5; z < HL; z += 1.6) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.7), guideMat); m.position.set(0, 0.006, z); hall.add(m); }
    const ceilLineMat = emis(0x000000);
    { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, HL), ceilLineMat); m.position.set(0, HH - 0.03, HL / 2); hall.add(m); }
    // the threshold stripes
    { const c = canvas(1024, 64, (g, w, h) => { g.fillStyle = '#16120a'; g.fillRect(0, 0, w, h); g.fillStyle = '#b38a1c'; for (let x = -64; x < w + 64; x += 64) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 32, 0); g.lineTo(x + 64, 0); g.lineTo(x + 32, h); g.fill(); } });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * DW + 2 * FT, 0.6), std({ map: ctex(c, true), roughness: 0.7, metalness: 0.2, envMapIntensity: 0 })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.008, 1.0); m.receiveShadow = true; hall.add(m); }

    // the flag of Israel hanging either side of the doorway
    {
      const c = canvas(512, 1536, (g, w, h) => {
        g.fillStyle = '#f2f4f8'; g.fillRect(0, 0, w, h); g.fillStyle = '#0038b8'; g.fillRect(w * 0.1, 0, w * 0.12, h); g.fillRect(w * 0.78, 0, w * 0.12, h);
        g.strokeStyle = '#0038b8'; g.lineWidth = w * 0.034; g.lineJoin = 'miter'; const cx = w / 2, cy = h * 0.42, r = w * 0.2;
        [0, Math.PI].forEach((a0) => { g.beginPath(); for (let k = 0; k < 3; k++) { const a = a0 + k * TAU / 3; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.stroke(); });
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.03})`; g.fillRect(R() * w, 0, 2 + R() * 6, h); }
      });
      const mat = std({ map: ctex(c, true), roughness: 0.85, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0 });
      [-1, 1].forEach((s) => {
        const geo = new THREE.PlaneGeometry(1.45, 5.6, 12, 40), p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.07 * Math.sin(x * 7.5 + 0.6) + 0.04 * Math.sin(y * 1.1 + x * 2) * (0.5 - y / 5.6)); }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, mat); m.position.set(s * 8.15, 9.7 - 2.8, 0.3); m.castShadow = true; m.receiveShadow = true; hall.add(m);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 12), frameMat); rod.rotation.z = Math.PI / 2; rod.position.set(s * 8.15, 9.72, 0.32); hall.add(rod);
      });
    }

    // ---------- the doors ----------
    const doorTex = (side) => {   // side -1: left leaf (seam on its right edge), 1: right
      const w = Math.round(DW * PXM), h = Math.round(DHT * PXM), X = (m) => m * PXM, Y = (m) => (DHT - m) * PXM, seamX = side < 0 ? w : 0;
      const ac = canvas(w, h, (g) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b3342'); gr.addColorStop(1, '#1f2531'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 3500; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.015 + R() * 0.03})`; g.fillRect(R() * w, R() * h, 4 + R() * 120, 1); }
        g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(X(0.35), Y(7.1), X(5.3), X(1.9)); g.fillRect(X(0.35), Y(2.6), X(5.3), X(2.2));
        // the band along the seam
        g.fillStyle = 'rgba(160,180,210,0.10)'; g.fillRect(side < 0 ? w - X(0.5) : 0, 0, X(0.5), h);
        // stripes at the foot
        g.save(); g.beginPath(); g.rect(0, Y(0.42), w, X(0.42)); g.clip(); g.fillStyle = '#1a1408'; g.fillRect(0, Y(0.42), w, X(0.42)); g.fillStyle = '#a7811b';
        for (let x = -X(0.5); x < w + X(0.5); x += X(0.5)) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + X(0.25), Y(0.42)); g.lineTo(x + X(0.5), Y(0.42)); g.lineTo(x + X(0.25), h); g.fill(); } g.restore();
        // stencils
        g.fillStyle = 'rgba(220,228,240,0.55)'; g.font = `500 ${X(0.16)}px "IBM Plex Mono"`; g.textAlign = side < 0 ? 'left' : 'right';
        g.fillText(side < 0 ? 'BAY DOOR · A' : 'BAY DOOR · B', side < 0 ? X(0.55) : w - X(0.55), Y(0.75));
        g.fillText('SPO-01 · PRESSURE SEAL', side < 0 ? X(0.55) : w - X(0.55), Y(7.0));
        // the emblem: half on each leaf
        if (logo) { const lh = X(3.1), lw = lh * logo.width / logo.height; g.save(); g.filter = 'brightness(1.25) saturate(0.9)'; g.drawImage(logo, seamX - lw / 2, Y(SEAL.y) - lh * 0.47, lw, lh); g.restore(); }
      });
      const hc = canvas(w, h, (g) => {
        g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
        const inset = (x0, y0, x1, y1, v) => { g.fillStyle = '#5a5a5a'; g.fillRect(X(x0) - 4, Y(y1) - 4, X(x1 - x0) + 8, X(y1 - y0) + 8); g.fillStyle = v; g.fillRect(X(x0), Y(y1), X(x1 - x0), X(y1 - y0)); };
        inset(0.3, 5.2, 5.7, 7.2, '#8c8c8c'); inset(0.3, 0.5, 5.7, 2.7, '#8c8c8c');
        // X braces in the lower panel
        g.strokeStyle = '#a0a0a0'; g.lineWidth = X(0.12); g.beginPath(); g.moveTo(X(0.5), Y(0.7)); g.lineTo(X(5.5), Y(2.5)); g.moveTo(X(0.5), Y(2.5)); g.lineTo(X(5.5), Y(0.7)); g.stroke();
        // horizontal ribs
        g.fillStyle = '#a8a8a8'; [2.85, 5.05].forEach((y) => g.fillRect(0, Y(y) - X(0.06), w, X(0.12)));
        // rivets
        g.fillStyle = '#c0c0c0'; for (let x = 0.2; x < DW; x += 0.3) [0.15, 2.85, 5.05, 7.35].forEach((y) => { g.beginPath(); g.arc(X(x), Y(y), X(0.028), 0, TAU); g.fill(); });
        // the seam's lip
        g.fillStyle = '#9a9a9a'; g.fillRect(side < 0 ? w - X(0.18) : 0, 0, X(0.18), h);
        if (logo) { const lh = X(3.1), lw = lh * logo.width / logo.height; g.save(); g.filter = 'grayscale(1) brightness(2.2)'; g.globalAlpha = 0.55; g.drawImage(logo, seamX - lw / 2, Y(SEAL.y) - lh * 0.47, lw, lh); g.restore(); }
      });
      const rc = canvas(w >> 1, h >> 1, (g, ww, hh) => {
        g.fillStyle = '#6e6e6e'; g.fillRect(0, 0, ww, hh);
        for (let i = 0; i < 600; i++) { const v = 70 + R() * 90; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(R() * ww, R() * hh, 6 + R() * 50, 2 + R() * 6); }
        if (logo) { const lh = X(3.1) / 2, lw = lh * logo.width / logo.height; g.save(); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.6; g.drawImage(logo, seamX / 2 - lw / 2, Y(SEAL.y) / 2 - lh * 0.47, lw, lh); g.restore(); }
      });
      const ec = canvas(w >> 1, h >> 1, (g, ww, hh) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, ww, hh); const x2 = (m) => m * PXM / 2, y2 = (m) => (DHT - m) * PXM / 2;
        g.strokeStyle = '#7fd0ff'; g.lineWidth = 2.2; g.strokeRect(x2(0.3), y2(7.2), x2(5.4), x2(2.0)); g.strokeRect(x2(0.3), y2(2.7), x2(5.4), x2(2.2));
        g.fillStyle = '#d4f25c'; for (let i = 0; i < 6; i++) g.fillRect(side < 0 ? x2(0.6 + i * 0.22) : ww - x2(0.6 + i * 0.22) - 6, y2(6.6), 6, 3);
        if (logo) { const lh = X(3.1) / 2, lw = lh * logo.width / logo.height; g.save(); g.shadowColor = '#6fc4ff'; g.shadowBlur = 18; g.filter = 'brightness(0.55) saturate(1.4)'; g.drawImage(logo, seamX / 2 - lw / 2, Y(SEAL.y) / 2 - lh * 0.47, lw, lh); g.restore(); }
      });
      return { map: ctex(ac, true), normalMap: normalMap(hc, 4), roughnessMap: ctex(rc, false), emissiveMap: ctex(ec, true) };
    };
    const leaves = [-1, 1].map((side) => {
      const tx = doorTex(side), mat = std({ map: tx.map, normalMap: tx.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughnessMap: tx.roughnessMap, roughness: 0.9, metalness: 0.8, emissiveMap: tx.emissiveMap, emissive: 0x000000, envMapIntensity: 0 });
      const edge = std({ color: 0x3a4252, metalness: 0.9, roughness: 0.35, envMapIntensity: 0 });
      const geo = new THREE.BoxGeometry(DW, DHT, DT);
      const leaf = new THREE.Mesh(geo, [edge, edge, edge, edge, mat, edge]); leaf.castShadow = true; leaf.receiveShadow = true;
      const g = new THREE.Group(); g.add(leaf); leaf.position.set(side * DW / 2, DHT / 2, -DT / 2);
      scene.add(g);
      return { side, g, mat };
    });
    // light at the seam (from outside), behind the leaves
    const seamLight = new THREE.Mesh(new THREE.PlaneGeometry(0.16, DHT), additive(new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000 })));
    seamLight.position.set(0, DHT / 2, 0.05); scene.add(seamLight);
    // the seal: a ring of 60 marks round the emblem, half on each leaf; the countdown fills it a second at a time
    const sealMat = new THREE.ShaderMaterial({
      uniforms: { uProg: { value: 0 }, uOn: { value: 0 }, uPulse: { value: 0 }, uGreen: { value: 0 }, uRot: { value: 0 }, uWarm: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uProg, uOn, uPulse, uGreen, uRot, uWarm; varying vec2 vP;
void main(){ float r = length(vP); float a = atan(vP.x, vP.y) + uRot; a = mod(a, 6.28318); float u = a / 6.28318;
 float tick = fract(u * 60.0); float mark = smoothstep(0.38, 0.32, abs(tick - 0.5)) ;
 float big = step(0.5, fract(u * 6.0 + 0.0001) < 0.0167 ? 1.0 : 0.0);
 float inner = smoothstep(${(SEAL.r - 0.02).toFixed(2)}, ${(SEAL.r + 0.02).toFixed(2)}, r) * smoothstep(${(SEAL.r + 0.3).toFixed(2)}, ${(SEAL.r + 0.26).toFixed(2)}, r);
 float lit = step(u, uProg);
 vec3 off = vec3(0.02, 0.035, 0.06) * uOn; vec3 on = mix(mix(vec3(0.45, 0.85, 1.6), vec3(1.6, 0.55, 0.22), uWarm), vec3(1.0, 1.35, 0.45), uGreen) * (2.2 + uPulse * 2.5);
 vec3 col = mix(off, on, lit) * mark * inner;
 float rim = smoothstep(0.05, 0.0, abs(r - ${(SEAL.r + 0.4).toFixed(2)})) * (0.25 + uPulse * 1.5 + uGreen * 1.5) * uOn;
 col += mix(vec3(0.4, 0.7, 1.2), vec3(0.9, 1.2, 0.4), uGreen) * rim;
 gl_FragColor = vec4(col, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    leaves.forEach((L) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(SEAL.r - 0.05, SEAL.r + 0.48, 160, 1, L.side < 0 ? 0 : Math.PI, Math.PI), sealMat);
      ring.position.set(0, SEAL.y, 0.012); L.g.add(ring);
      const metal = new THREE.Mesh(new THREE.TorusGeometry(SEAL.r + 0.62, 0.09, 12, 96, Math.PI), frameMat); metal.rotation.z = L.side < 0 ? Math.PI / 2 : -Math.PI / 2; metal.position.set(0, SEAL.y, 0.05); metal.castShadow = true; L.g.add(metal);
    });
    // the locks: a bar across the seam with a hub; they turn, pull in and let go before the doors move
    const lockOnMat = emis(0x000000);
    const clamps = CLAMPS.map((y) => {
      const g = new THREE.Group(); g.position.set(0, y, 0.12); scene.add(g);
      const barM = new THREE.Mesh(bar(2.4, 0.36, 0.2, 0.1), frameMat); barM.castShadow = true; g.add(barM);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.3, 40), frameMat); hub.rotation.x = Math.PI / 2; hub.position.z = 0.06; g.add(hub);
      const ringL = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 8, 48), lockOnMat); ringL.position.z = 0.22; g.add(ringL);
      const notch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), lockOnMat); notch.position.z = 0.22; g.add(notch);
      return { g, barM, hub, notch };
    });

    // ---------- the ribbon ----------
    const satin = new THREE.MeshPhysicalMaterial({ color: 0x9c0d1c, roughness: 0.34, metalness: 0, sheen: 1, sheenRoughness: 0.32, sheenColor: new THREE.Color(0xff5a6a), clearcoat: 0.35, clearcoatRoughness: 0.25, side: THREE.DoubleSide, envMapIntensity: 0 });
    envMats.push(satin);
    /** a strip of ribbon along points P (V3[]) with width directions Wd (V3[]) and widths (numbers) */
    const strip = (n) => {
      const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
      for (let i = 0; i < n; i++) { uv.set([i / (n - 1), 0, i / (n - 1), 1], i * 4); if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
      const m = new THREE.Mesh(g, satin); m.castShadow = true; m.frustumCulled = false;
      m.set = (P, Wd, wid) => { for (let i = 0; i < n; i++) { const p = P[i], d = Wd[i], hw = (typeof wid === 'number' ? wid : wid[i]) / 2; pos.set([p.x - d.x * hw, p.y - d.y * hw, p.z - d.z * hw, p.x + d.x * hw, p.y + d.y * hw, p.z + d.z * hw], i * 6); } g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); };
      return m;
    };
    const NR = 161, ribbon = strip(NR); scene.add(ribbon);
    const ribP = Array.from({ length: NR }, () => new V3()), ribW = Array.from({ length: NR }, () => new V3());
    const ribbonAt = (x, t, out, wout) => {   // the stretched ribbon before the cut
      const e = 1 - (x / RIB.half) * (x / RIB.half);
      out.set(x, RIB.y - RIB.sag * e + 0.025 * Math.sin(1.7 * x + 1.3 * t) * e, RIB.z + 0.05 * Math.sin(1.1 * x - 0.9 * t) * e);
      const tw = 0.14 * Math.sin(0.8 * x + 0.7 * t) * e; wout.set(0, Math.cos(tw), Math.sin(tw));
    };
    // the bow: two flattened loops, two tails, a knot
    const bow = new THREE.Group(); scene.add(bow);
    const loopPts = (dir) => {   // a flattened loop out to one side and back
      const pts = [], N = 70;
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1), a = u * TAU;                       // round the loop
        const along = (1 - Math.cos(a)) / 2;                    // 0 → 1 → 0
        const lx = dir * along * 0.78, ly = along * 0.26 + Math.sin(a) * 0.02;
        const lz = Math.sin(a) * 0.075 * (0.3 + along);
        pts.push(new V3(lx, ly, lz));
      }
      return pts;
    };
    const mkBowPart = (pts, widthFn, normalHint) => {
      const n = pts.length, s = strip(n), Wd = [];
      for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tng = b.clone().sub(a).normalize(); Wd.push(new V3().crossVectors(tng, normalHint).normalize()); }
      s.set(pts, Wd, pts.map((_, i) => widthFn(i / (n - 1)))); bow.add(s); return s;
    };
    [-1, 1].forEach((d) => {
      mkBowPart(loopPts(d), (u) => RIB.w * (0.55 + 0.45 * Math.sin(Math.PI * u) ** 0.5), new V3(0, 0, 1));
      const tail = []; for (let i = 0; i < 30; i++) { const u = i / 29; tail.push(new V3(d * (0.05 + u * 0.42), -u * 0.95 - Math.sin(u * 3) * 0.04, 0.05 + Math.sin(u * 4) * 0.04)); }
      mkBowPart(tail, (u) => RIB.w * (0.6 + 0.4 * u), new V3(0, 0, 1));
    });
    { const knot = new THREE.Mesh(bar(0.2, 0.32, 0.2, 0.08), satin); knot.castShadow = true; knot.position.z = 0.03; bow.add(knot); }
    bow.position.set(0, RIB.y - RIB.sag, RIB.z + 0.08);
    // stanchions: chrome posts with a light ring at the top
    const chrome = std({ color: 0xdfe6f2, metalness: 1, roughness: 0.12, envMapIntensity: 0 });
    const capMat = emis(0x000000);
    [-1, 1].forEach((s) => {
      const g = new THREE.Group(); g.position.set(s * (RIB.half + 0.05), 0, RIB.z); scene.add(g);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, RIB.y + 0.05, 24), chrome); post.position.y = (RIB.y + 0.05) / 2; post.castShadow = true; g.add(post);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.06, 40), chrome); base.position.y = 0.03; base.castShadow = true; g.add(base);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), chrome); cap.position.y = RIB.y + 0.08; g.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 32), capMat); ring.rotation.x = Math.PI / 2; ring.position.y = RIB.y + 0.02; g.add(ring);
    });
    // the fall after the cut: each half hangs from its post (a rope of points, simulated once at 240 Hz)
    const SIM = (() => {
      const N = 81, steps = 240 * 7, store = 60, frames = [], dt = 1 / 240;
      const halves = [-1, 1].map((s) => {
        const P = [], O = [];
        for (let i = 0; i < N; i++) { const x = s * RIB.half * (1 - i / (N - 1)), p = new V3(), w = new V3(); ribbonAt(x, K.CUT, p, w); P.push(p); O.push(p.clone().add(new V3(s * 0.004 * i / N, 0, (hash(i + s) - 0.5) * 0.002))); }
        const rest = []; for (let i = 0; i < N - 1; i++) rest.push(P[i].distanceTo(P[i + 1]) * 0.985);
        return { s, P, O, rest };
      });
      const g = new V3(0, -9.8, 0);
      for (let k = 0; k <= steps; k++) {
        const t = k * dt;
        halves.forEach((hf) => {
          const { P, O, rest } = hf;
          for (let i = 1; i < N; i++) { const p = P[i], o = O[i], v = p.clone().sub(o).multiplyScalar(0.994); o.copy(p); p.add(v).addScaledVector(g, dt * dt);
            // air: a little flutter sideways
            p.z += Math.sin(t * 9 + i * 0.35 + hf.s) * 0.00003 * i / N; if (p.y < 0.015) { p.y = 0.015; o.y = p.y + (o.y - p.y) * 0.0; } }
          for (let it = 0; it < 24; it++) for (let i = 0; i < N - 1; i++) { const a = P[i], b = P[i + 1], d = b.clone().sub(a), l = d.length(), diff = (l - rest[i]) / l; if (i === 0) b.addScaledVector(d, -diff); else { a.addScaledVector(d, diff * 0.5); b.addScaledVector(d, -diff * 0.5); } }
        });
        if (k % (240 / store) === 0) frames.push(halves.map((hf) => hf.P.map((p) => p.clone())));
      }
      return { N, frames, store };
    })();
    const halves = [strip(SIM.N), strip(SIM.N)]; halves.forEach((m) => { m.visible = false; scene.add(m); });
    const hP = Array.from({ length: SIM.N }, () => new V3()), hW = Array.from({ length: SIM.N }, () => new V3());
    const setHalf = (m, k, tau) => {
      const f = Math.min(SIM.frames.length - 1.001, Math.max(0, tau * SIM.store)), i0 = Math.floor(f), u = f - i0, A = SIM.frames[i0][k], B = SIM.frames[i0 + 1][k];
      for (let i = 0; i < SIM.N; i++) hP[i].lerpVectors(A[i], B[i], u);
      for (let i = 0; i < SIM.N; i++) { const a = hP[Math.max(0, i - 1)], b = hP[Math.min(SIM.N - 1, i + 1)], tg = b.clone().sub(a).normalize(); const w = new V3().crossVectors(tg, new V3(0, 0, 1)); if (w.lengthSq() < 1e-6) w.set(0, 1, 0); w.normalize(); const tw = 0.25 * Math.sin(i * 0.12 + tau * 3 + k) * Math.min(1, tau * 2); w.applyAxisAngle(tg, tw); if (w.y < 0 && Math.abs(tg.y) < 0.7) w.negate(); hW[i].copy(w); }
      m.set(hP, hW, RIB.w);
    };

    // ---------- the countdown: numbers projected in the seal ----------
    const digitTex = Array.from({ length: 11 }, (_, n) => ctex(canvas(512, 512, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.font = `300 ${n === 10 ? 300 : 380}px Lexend`; g.fillText(String(n), 256, 270);
    }), false));
    const digitMat = new THREE.ShaderMaterial({ uniforms: { tMap: { value: digitTex[10] }, uA: { value: 0 }, uTime: { value: 0 }, uCol: { value: hdr(0x9fdcff, 3.2) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tMap; uniform float uA, uTime; uniform vec3 uCol; varying vec2 vUv;
void main(){ float m = texture2D(tMap, vUv).r; float scan = 0.82 + 0.18 * sin(vUv.y * 420.0 - uTime * 12.0); float fl = 0.92 + 0.08 * sin(uTime * 53.0) * sin(uTime * 17.0);
 vec3 c = uCol * m * scan * fl * uA; gl_FragColor = vec4(c, 1.0); }`, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const digit = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.3), digitMat); digit.position.set(0, SEAL.y, 0.5); scene.add(digit);
    const veil = new THREE.Mesh(new THREE.CircleGeometry(SEAL.r - 0.08, 64), new THREE.MeshBasicMaterial({ color: 0x01040a, transparent: true, opacity: 0, depthWrite: false }));
    veil.position.set(0, SEAL.y, 0.3); scene.add(veil);

    // ---------- the cut: a blade of light, a burst, sparks, a ring ----------
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 3.2), additive(new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000 }))); blade.position.set(0, RIB.y + 1.6, RIB.z + 0.12); scene.add(blade);
    const bladeCore = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 3.2), additive(new THREE.MeshBasicMaterial({ color: 0x000000 }))); bladeCore.position.copy(blade.position); scene.add(bladeCore);
    const burst = sprite(glowTex, hdr(0xffffff, 1), 1, 0); burst.position.set(0, RIB.y, RIB.z + 0.15); scene.add(burst);
    const shockMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float ring = exp(-pow((r - 0.9) * 34.0, 2.0)); gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * ring * uA * 3.0, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const shock = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shockMat); shock.position.copy(burst.position); scene.add(shock);
    const cutLight = new THREE.PointLight(0xffe2c0, 0, 14, 2); cutLight.position.set(0, RIB.y + 0.2, RIB.z + 0.6); scene.add(cutLight);
    const sparks = (() => {
      const N = 420, base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
      g.index = base.index; g.setAttribute('position', base.attributes.position); g.instanceCount = N;
      const v0 = new Float32Array(N * 3), info = new Float32Array(N * 3), rnd = mulberry(99);
      for (let i = 0; i < N; i++) {
        const th = rnd() * TAU, up = rnd() * 2 - 0.6, sp = 2.5 + rnd() * rnd() * 9;
        const dir = new V3(Math.cos(th), up, Math.sin(th) * 0.8 + 0.35).normalize();
        v0.set([dir.x * sp, dir.y * sp, dir.z * sp], i * 3); info.set([0.35 + rnd() * 1.4, rnd(), rnd() * 0.06], i * 3);
      }
      g.setAttribute('v0', new THREE.InstancedBufferAttribute(v0, 3)); g.setAttribute('info', new THREE.InstancedBufferAttribute(info, 3));
      const m = new THREE.ShaderMaterial({ uniforms: { uT: { value: -1 }, uO: { value: burst.position.clone() } },
        vertexShader: `attribute vec3 v0; attribute vec3 info; uniform float uT; uniform vec3 uO; varying float vA; varying vec2 vQ; varying float vHeat;
void main(){ float tt = uT - info.z; float life = info.x; vA = 0.0; vQ = position.xy;
 if (tt <= 0.0 || tt > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
 vec3 g = vec3(0.0, -9.8, 0.0); float drag = 1.6; float e = (1.0 - exp(-drag * tt)) / drag;
 vec3 p = uO + v0 * e + g * (tt - e) / drag; vec3 v = v0 * exp(-drag * tt) + g * (1.0 - exp(-drag * tt)) / drag;
 if (p.y < 0.02) { p.y = 0.02 + abs(p.y) * 0.25; v.y = abs(v.y) * 0.3; }
 vec4 c = modelViewMatrix * vec4(p, 1.0); vec3 vv = (modelViewMatrix * vec4(v, 0.0)).xyz; vec2 d = normalize(vv.xy + 1e-5); vec2 n = vec2(-d.y, d.x);
 float len = 0.012 + length(vv) * 0.022; float wid = 0.0075;
 c.xy += d * position.y * len + n * position.x * wid;
 float u = tt / life; vA = (1.0 - u) * (1.0 - u); vHeat = 1.0 - u; gl_Position = projectionMatrix * c; }`,
        fragmentShader: `varying float vA; varying vec2 vQ; varying float vHeat; void main(){ float f = (1.0 - smoothstep(0.0, 0.5, abs(vQ.x))) ; vec3 c = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.85, 0.6), vHeat) * 9.0 * vHeat + vec3(0.3); gl_FragColor = vec4(c * f * vA, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; scene.add(mesh); return m;
    })();

    // ---------- lights ----------
    const hemi = new THREE.HemisphereLight(0x6f86b8, 0x0a0d14, 0); scene.add(hemi);
    const ceilLights = [6, 14, 22, 30, 38].map((z) => { const l = new THREE.PointLight(0xcfe6ff, 0, 22, 1.6); l.position.set(0, HH - 1.4, z); scene.add(l); return { l, z }; });
    const spots = [[-4.2, 0.15], [4.2, -0.15], [0, 0]].map(([x, tw], i) => {
      const s = new THREE.SpotLight(i === 2 ? 0xfff2e2 : 0xe8f2ff, 0, 34, i === 2 ? 0.32 : 0.42, 0.6, 1.4); s.position.set(x, HH - 0.6, 9 + i * 1.5);
      s.target.position.set(x * 0.4, i === 2 ? RIB.y : 3.6, i === 2 ? RIB.z : 0); scene.add(s); scene.add(s.target); return s;
    });
    // sunlight through the doorway, with shadows
    const sun = new THREE.DirectionalLight(0xfff0dc, 0); sun.position.set(-3, 9, -30); sun.target.position.set(0, 0, 12); scene.add(sun); scene.add(sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 14, bottom: -14, near: 1, far: 70 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    // shafts of light under the spots: soft cones, and dust in the air
    const shaftMat = (col) => new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uCol: { value: new THREE.Color(col) } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform float uA; uniform vec3 uCol; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(uCol * f * pow(vY, 1.6) * uA, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const shafts = spots.map((s, i) => {
      const len = s.position.distanceTo(s.target.position), geo = new THREE.ConeGeometry(Math.tan(s.angle) * len * 0.9, len, 48, 1, true);
      geo.translate(0, -len / 2, 0); const m = new THREE.Mesh(geo, shaftMat(i === 2 ? 0xfff0dc : 0xcfe2ff)); m.position.copy(s.position);
      m.quaternion.setFromUnitVectors(new V3(0, -1, 0), s.target.position.clone().sub(s.position).normalize()); scene.add(m); return m;
    });
    const dust = (() => {
      const N = 1600, pos = new Float32Array(N * 3), rnd = mulberry(7);
      for (let i = 0; i < N; i++) pos.set([(rnd() * 2 - 1) * (HW - 1), 0.2 + rnd() * (HH - 1.2), 0.5 + rnd() * 30], i * 3);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 }, uBeam: { value: 0 }, uPx: { value: 1 } },
        vertexShader: `uniform float uT, uPx, uBeam; varying float vA; void main(){ vec3 p = position; p.x += sin(uT * 0.21 + p.z * 0.7) * 0.25; p.y += sin(uT * 0.17 + p.x * 0.9) * 0.18; p.z += sin(uT * 0.13 + p.y) * 0.2;
 vec4 c = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * c; float b = uBeam * smoothstep(7.0, 1.0, abs(p.x)) * smoothstep(26.0, 2.0, p.z); vA = 0.25 + b * 0.8; gl_PointSize = uPx * (1.0 + 1.2 * fract(sin(dot(position.xy, vec2(12.9, 78.2))) * 437.5)) * (6.0 / max(1.0, -c.z)); }`,
        fragmentShader: 'uniform float uA; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * smoothstep(0.5, 0.0, r) * uA * vA, 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return m;
    })();
    // the beam from the doorway once the doors part: a volume that thins toward the hall
    const beamMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uGap: { value: 0 }, uT: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uA, uGap, uT; varying vec3 vW;
float nearFade(){ return smoothstep(1.0, 6.0, abs(vW.z - cameraPosition.z)); }
float n1(float x){ return fract(sin(x * 91.7) * 4375.85); }
float vn(float x){ float i = floor(x), f = fract(x); return mix(n1(i), n1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main(){ float z = vW.z; float spread = 1.0 + z * 0.045; float hx = uGap * 0.5 * spread; float edge = smoothstep(hx + 0.6 * spread, hx - 0.4, abs(vW.x));
 float hy = smoothstep(${DHT.toFixed(1)} * spread + 0.6, ${DHT.toFixed(1)} * spread - 1.4, vW.y + z * 0.12);
 float fall = pow(clamp(1.0 - z / 26.0, 0.0, 1.0), 2.2); float rays = 0.65 + 0.35 * vn(vW.x / spread * 2.3 + 3.0) * vn(vW.y / spread * 0.7 + 9.0);
 gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * edge * hy * fall * rays * uA * 0.018 * nearFade(), 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const beam = new THREE.Group(); scene.add(beam);
    for (let i = 0; i < 26; i++) { const z = 0.2 + i * 1.0, sp = 1 + z * 0.045, m = new THREE.Mesh(new THREE.PlaneGeometry(2 * DW * sp + 3, DHT * sp + 3), beamMat); m.position.set(0, DHT * sp / 2 - z * 0.12, z); beam.add(m); }

    // ---------- space: the Earth, the sun, the stars (its own scene and camera, drawn first) ----------
    const space = new THREE.Scene(), scam = new THREE.PerspectiveCamera(38, W / H, 0.01, 2000);
    const ER = 10, EC = new V3(0, -11.0, -8.0);
    const llToLocal = (lat, lon) => { const u = (lon + 180) / 360, th = (90 - lat) * D2R, ph = u * TAU; return new V3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)); };
    const sunU = { value: new V3(0, 0, -1) };
    const earthMat = new THREE.ShaderMaterial({
      uniforms: { tDay: { value: dayT }, tNight: { value: nightT }, tCloud: { value: cloudT }, tSpec: { value: specT }, uSun: sunU, uT: { value: 0 }, uLights: { value: 1 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vW; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D tDay, tNight, tCloud, tSpec; uniform vec3 uSun; uniform float uT, uLights; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
vec4 cw(float a){ float a2 = a * a, a3 = a2 * a; return vec4(-a3 + 3.0 * a2 - 3.0 * a + 1.0, 3.0 * a3 - 6.0 * a2 + 4.0, -3.0 * a3 + 3.0 * a2 + 3.0 * a + 1.0, a3) / 6.0; }
vec3 cubic(sampler2D tx, vec2 uv){ vec2 sz = vec2(2048.0, 1024.0); vec2 p = uv * sz - 0.5; vec2 f = fract(p); p -= f; vec4 xw = cw(f.x), yw = cw(f.y);
 vec4 c = p.xxyy + vec2(-0.5, 1.5).xyxy; vec4 s = vec4(xw.xz + xw.yw, yw.xz + yw.yw); vec4 o = c + vec4(xw.yw, yw.yw) / s; o /= sz.xxyy;
 float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
 return mix(mix(texture2D(tx, o.yw).rgb, texture2D(tx, o.xw).rgb, sx), mix(texture2D(tx, o.yz).rgb, texture2D(tx, o.xz).rgb, sx), sy); }
void main(){ vec3 N = normalize(vN), L = normalize(uSun), V = normalize(cameraPosition - vW); float ndl = dot(N, L);
 vec3 day = texture2D(tDay, vUv).rgb; float cl = texture2D(tCloud, vUv + vec2(uT * 0.0015, 0.0)).a; float ocean = texture2D(tSpec, vUv).r;
 float lit = smoothstep(-0.08, 0.35, ndl);
 vec3 dcol = mix(day, vec3(0.95), cl * 0.8) * (0.012 + 1.45 * max(ndl, 0.0));
 vec3 Hh = normalize(L + V); float spec = pow(max(dot(N, Hh), 0.0), 60.0) * ocean * (1.0 - cl) * 2.2 * step(0.0, ndl);
 float nl = dot(cubic(tNight, vUv), vec3(0.3, 0.59, 0.11)); float grain = 0.35 + 1.3 * vn2(vUv * vec2(9000.0, 4500.0)) * vn2(vUv * vec2(3100.0, 1550.0) + 7.0);
 vec3 night = vec3(1.0, 0.72, 0.42) * pow(smoothstep(0.05, 0.85, nl), 1.35) * grain * 6.5 * uLights * (1.0 - smoothstep(-0.18, 0.06, ndl)) * (1.0 - cl * 0.75);
 float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0); float tw = smoothstep(-0.35, 0.1, ndl) * (1.0 - smoothstep(0.1, 0.7, ndl));
 vec3 atm = mix(vec3(0.25, 0.5, 1.0), vec3(1.0, 0.45, 0.15), tw * 0.8) * fr * (smoothstep(-0.3, 0.25, ndl) * 1.6) * (1.0 + 4.0 * pow(max(dot(-V, L), 0.0), 6.0)) + vec3(0.01, 0.02, 0.05) * fr;
 vec3 col = dcol * lit + spec * vec3(1.0, 0.9, 0.75) + night + atm;
 gl_FragColor = vec4(col, 1.0); }`, toneMapped: false });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(ER, 128, 96), earthMat); earth.position.copy(EC); space.add(earth);
    const atmMat = new THREE.ShaderMaterial({ uniforms: { uSun: sunU, uC: { value: EC }, uR: { value: ER }, uRa: { value: ER * 1.07 }, uA: { value: 1 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uSun, uC; uniform float uR, uRa, uA; varying vec3 vW;
void main(){ vec3 rd = normalize(vW - cameraPosition); vec3 oc = uC - cameraPosition; float tca = dot(oc, rd); vec3 cp = cameraPosition + rd * tca; float h = length(cp - uC);
 if (h < uR) discard; float k = clamp((h - uR) / (uRa - uR), 0.0, 1.0); float g = pow(1.0 - k, 3.0) * 1.3 + pow(1.0 - k, 12.0) * 2.5;
 vec3 n = normalize(cp - uC); float ndl = dot(n, normalize(uSun)); float day = smoothstep(-0.3, 0.25, ndl);
 vec3 c = mix(vec3(1.0, 0.42, 0.12), vec3(0.32, 0.6, 1.0), smoothstep(-0.05, 0.45, ndl)) * day + vec3(0.02, 0.05, 0.08) * (1.0 - day);
 float fwd = pow(max(dot(rd, normalize(uSun)), 0.0), 18.0) * 8.0 + pow(max(dot(rd, normalize(uSun)), 0.0), 4.0) * 1.2;
 gl_FragColor = vec4(c * g * (1.0 + fwd) * uA, 1.0); }`, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, toneMapped: false });
    const atm = new THREE.Mesh(new THREE.SphereGeometry(ER * 1.07, 96, 64), atmMat); atm.position.copy(EC); space.add(atm);
    // the sun: a core the Earth can hide, a glow and a streak that fade as it does
    const sunCore = sprite(glowTex, hdr(0xfff4e6, 70), 1, 1); sunCore.material.depthTest = true; space.add(sunCore);
    const sunGlow = sprite(glowTex, hdr(0xffe0b8, 3.5), 1, 1); sunGlow.material.depthTest = false; space.add(sunGlow);
    const sunStreak = sprite(glowTex, hdr(0xbfdcff, 2.2), 1, 1); sunStreak.material.depthTest = false; space.add(sunStreak);
    const raysTex = ctex(canvas(512, 512, (g) => { g.translate(256, 256); const rr = mulberry(31); for (let i = 0; i < 48; i++) { const a = rr() * TAU, l = 120 + rr() * 130, w = 0.004 + rr() * 0.012; const gr = g.createLinearGradient(0, 0, Math.cos(a) * l, Math.sin(a) * l); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a - w) * l, Math.sin(a - w) * l); g.lineTo(Math.cos(a + w) * l, Math.sin(a + w) * l); g.fill(); } }), false);
    const sunRays = sprite(raysTex, hdr(0xffffff, 1), 1, 1); sunRays.material.depthTest = false; space.add(sunRays);
    const ghosts = [0.35, 0.62, 1.25, 1.6].map((k, i) => { const s = sprite(glowTex, hdr([0x6fa8ff, 0xffb070, 0x8cffd8, 0xb08cff][i], 0.12), 1, 1); s.material.depthTest = false; s.userData.k = k; space.add(s); return s; });
    // stars and the band of the Milky Way, round the space camera
    const sky = new THREE.Group(); space.add(sky);
    const stars = (() => {
      const N = 7000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N), rnd = mulberry(4242), bandN = new V3(0.3, 0.85, 0.42).normalize();
      for (let i = 0; i < N; i++) {
        let v = new V3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); while (v.lengthSq() > 1 || v.lengthSq() < 0.01) v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); v.normalize();
        if (i < N * 0.45) { const d = v.dot(bandN); v.addScaledVector(bandN, -d * 0.82).normalize(); }   // crowd toward the band
        pos.set([v.x * 900, v.y * 900, v.z * 900], i * 3);
        const tk = rnd(), c = tk < 0.12 ? [1.0, 0.82, 0.6] : tk < 0.3 ? [0.75, 0.85, 1.0] : [1, 1, 1], b = Math.pow(rnd(), 3.2) * 2.2 + 0.12;
        col.set([c[0] * b, c[1] * b, c[2] * b], i * 3); sz[i] = 0.7 + Math.pow(rnd(), 6) * 2.6;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
      const m = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 1 }, uA: { value: 1 }, uT: { value: 0 } },
        vertexShader: 'attribute vec3 color; attribute float size; uniform float uPx, uT; varying vec3 vC; void main(){ vC = color * (0.85 + 0.15 * sin(uT * 2.0 + position.x)); vec4 c = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * c; gl_PointSize = size * uPx * 1.6; }',
        fragmentShader: 'uniform float uA; varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC * smoothstep(0.5, 0.05, r) * uA, 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const p = new THREE.Points(g, m); p.frustumCulled = false; sky.add(p); return m;
    })();
    const milky = (() => {
      const m = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 } }, side: THREE.BackSide, depthWrite: false, toneMapped: false,
        vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uA; varying vec3 vD;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y), mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.07; a *= 0.5; } return s; }
void main(){ vec3 d = normalize(vD); vec3 bn = normalize(vec3(0.3, 0.85, 0.42)); float b = dot(d, bn); float band = exp(-b * b * 18.0);
 float f = fbm(d * 3.2); float dark = smoothstep(0.45, 0.75, fbm(d * 7.0 + 3.1)) * exp(-b * b * 120.0);
 vec3 c = mix(vec3(0.16, 0.2, 0.42), vec3(0.55, 0.42, 0.36), smoothstep(0.4, 0.8, f)) * band * (0.25 + f * 0.9) * (1.0 - dark * 0.8);
 c += vec3(0.05, 0.03, 0.09) * smoothstep(0.55, 0.9, fbm(d * 2.0 + 7.0));
 gl_FragColor = vec4(c * 0.42 * uA, 0.0); }` });
      const s = new THREE.Mesh(new THREE.SphereGeometry(950, 48, 32), m); sky.add(s); return m;
    })();
    // Light that adds (the glows, the stars, the atmosphere) leaves the picture's alpha alone, and the sky writes none: when
    // the closing turns transparent over the waking wall, only the Earth covers it.
    space.traverse((o) => { const m = o.material; if (m && m.blending === THREE.AdditiveBlending) Object.assign(m, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }); });
    // the Earth turned so that Israel faces the dive: its point under the camera's line at 25° down, north away from us
    const ISR = { lat: 31.6, lon: 34.9 };
    const aimEarth = (dir, northHint) => {
      const nl = llToLocal(ISR.lat, ISR.lon), northL = llToLocal(ISR.lat + 1, ISR.lon).sub(nl.clone()).projectOnPlane(nl).normalize(), eastL = new V3().crossVectors(northL, nl).normalize();
      // where the ray hits the globe
      const ro = new V3(0, 0, 0), oc = EC.clone().sub(ro), tca = oc.dot(dir), d2 = oc.lengthSq() - tca * tca, thc = Math.sqrt(Math.max(0, ER * ER - d2)), X = ro.clone().addScaledVector(dir, tca - thc);
      const n = X.clone().sub(EC).normalize(), north = northHint.clone().projectOnPlane(n).normalize(), east = new V3().crossVectors(north, n).normalize();
      const mL = new THREE.Matrix4().makeBasis(eastL, northL, nl), mT = new THREE.Matrix4().makeBasis(east, north, n);
      earth.quaternion.setFromRotationMatrix(mT.multiply(mL.invert()));
      return { X, n };
    };
    const diveDir = new V3(0.04, -Math.sin(24 * D2R), -Math.cos(24 * D2R)).normalize();
    const DIVE = aimEarth(diveDir, new V3(0, 0.25, -1));
    const ISRW = () => llToLocal(ISR.lat, ISR.lon).applyQuaternion(earth.quaternion).multiplyScalar(ER).add(EC);

    // ---------- words on the screen (HTML over the canvas, set every frame) ----------
    const ov = document.createElement('div'); ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;direction:' + (en ? 'ltr' : 'rtl'); host.appendChild(ov);
    const HEB = "Heebo, sans-serif", LEX = "'Lexend', sans-serif";
    const word = (text, css, maxW) => { if (!text) return null; const d = document.createElement('div'), sp = document.createElement('span'); sp.textContent = text; d.appendChild(sp); d.dir = 'auto'; d.style.cssText = 'position:absolute;left:0;right:0;text-align:center;white-space:nowrap;opacity:0;will-change:opacity,transform,filter;' + css; ov.appendChild(d);
      const fs = parseFloat(d.style.fontSize), w = sp.offsetWidth; if (maxW && w > maxW) d.style.fontSize = Math.floor(fs * maxW / w) + 'px'; return d; };
    const fam = (s) => (/[֐-׿]/.test(s) ? HEB : LEX);
    const T = (k) => txt(texts, en, k);
    const W_ = {
      eyebrow: word(T('eyebrow'), `top:748px;font-family:${fam(T('eyebrow'))};font-weight:300;font-size:32px;letter-spacing:.2em;color:#bfe3ff;text-shadow:0 0 18px rgba(120,190,255,.6)`, 590),
      title: word(T('title'), `top:800px;font-family:${fam(T('title'))};font-weight:700;font-size:128px;letter-spacing:.02em;color:#fbfdff;text-shadow:0 0 30px rgba(170,215,255,.55),0 0 90px rgba(90,150,255,.35)`),
      line: word(T('line'), `top:972px;font-family:${fam(T('line'))};font-weight:300;font-size:42px;letter-spacing:.12em;color:#e2ecfa;text-shadow:0 0 18px rgba(0,0,0,.6)`, 590),
      honor: word(T('honor'), `top:960px;font-family:${fam(T('honor'))};font-weight:300;font-size:44px;letter-spacing:.14em;color:#f0deb0;text-shadow:0 0 22px rgba(255,200,120,.45)`, 590),
      tag: word(T('tag'), `top:118px;font-family:${fam(T('tag'))};font-weight:700;font-size:150px;color:#fffaf0;text-shadow:0 0 40px rgba(255,220,170,.6),0 0 120px rgba(255,170,90,.35)`),
      tagLine: word(T('tagLine'), `top:290px;font-family:${fam(T('tagLine'))};font-weight:300;font-size:44px;letter-spacing:.2em;color:#f2dfae;text-shadow:0 0 22px rgba(255,190,110,.5)`, 590),
      welcome: word(T('welcome'), `top:110px;font-family:${fam(T('welcome'))};font-weight:700;font-size:140px;color:#fbfdff;text-shadow:0 0 34px rgba(170,215,255,.6),0 0 100px rgba(90,150,255,.35)`, 600),
      welcomeLine: word(T('welcomeLine'), `top:276px;font-family:${fam(T('welcomeLine'))};font-weight:300;font-size:44px;letter-spacing:.1em;color:#d8e8ff;text-shadow:0 0 22px rgba(0,0,0,.6)`, 600),
    };
    /** in at a (rising out of a blur, letters closing up), out at b (drifting up into a blur) */
    const showWord = (el, t, a, b, o) => {
      if (!el) return; o = o || {};
      const i = out3(seg(t, a, a + (o.inDur || 1.6))), x = b == null ? 0 : inOut(seg(t, b, b + (o.outDur || 1.1)));
      const op = i * (1 - x);
      if (op <= 0.001) { if (el.style.opacity !== '0') el.style.opacity = '0'; return; }
      el.style.opacity = op.toFixed(3);
      el.style.transform = `translateY(${((1 - i) * (o.rise || 26) - x * (o.lift || 30)).toFixed(1)}px) scale(${(1 + (1 - i) * 0.04 + x * (o.grow || 0.02)).toFixed(4)})`;
      el.style.filter = `blur(${((1 - i) * 14 + x * 10).toFixed(1)}px)`;
      if (o.track) el.style.letterSpacing = (o.track[0] + (o.track[1] - o.track[0]) * i).toFixed(3) + 'em';
    };

    // ---------- the camera's way ----------
    const CAMK = [
      { t: 0, v: [-0.9, 1.75, 34.5, 0, 3.2, 0] }, { t: 3.6, v: [-0.85, 1.8, 33.6, 0, 3.2, 0] },
      { t: 9.2, v: [-0.4, 2.3, 23.5, 0, 3.4, 0] }, { t: 14.6, v: [0, 2.9, 14.4, 0, 4.15, 0] },
      { t: 24.9, v: [0, 3.0, 12.4, 0, 4.1, 0] }, { t: 28.4, v: [0, 3.05, 11.4, 0, 3.9, -4] },
      { t: 30.6, v: [0, 3.25, 7.6, 0, 3.6, -14] }, { t: 32.8, v: [0, 3.75, 0.2, 0, 3.0, -30] },
      { t: 35.2, v: [0, 3.9, -7.0, 0, 1.0, -40] }, { t: 37.2, v: [0, 3.9, -9.0, 0, 0.0, -40] }];
    const tmpM = new THREE.Matrix4(), qa = new Q(), qb = new Q();
    const look = (c, p, at, roll) => { c.position.set(p[0], p[1], p[2]); c.up.set(Math.sin(roll || 0), Math.cos(roll || 0), 0); c.lookAt(at[0], at[1], at[2]); };
    const shake = (t, amp) => [amp * (Math.sin(t * 37.1) * 0.6 + Math.sin(t * 61.7) * 0.4), amp * (Math.sin(t * 41.3 + 1) * 0.6 + Math.sin(t * 73.1) * 0.4)];

    // ---------- one frame ----------
    const fx = post.comp.uniforms;
    let lastPx = 0;
    const drawHall = (t) => {
      const lightOf = (on, seed) => { if (t < on) return 0; const u = t - on; if (u > 0.5) return 1; const f = [1, 0.15, 1, 0.3, 1][Math.min(4, Math.floor(u / 0.1))]; return f * (0.6 + 0.4 * hash(seed + Math.floor(u * 40))); };
      const allOn = ss(K.LIGHTS, K.DOOR_ON + 0.6, t), beat = pulseAt(t, BEATS, 6), cutK = t >= K.CUT ? Math.exp(-(t - K.CUT) * 3) : 0;
      const openU = inOut(seg(t, K.OPEN, K.OPEN + K.OPEN_DUR)), gap = openU * 2 * (DW + 0.3);
      // the hall's lights: the ribs from the near end toward the doors, then the doors
      ribs.forEach((r) => { const k = lightOf(r.on, r.seed * 7); r.mat.color.copy(hdr(0xbfe6ff, 5.5 * k * (1 - 0.35 * openU) + beat * 0.6)); });
      const doorOn = lightOf(K.DOOR_ON, 99);
      frameGlowMat.color.copy(hdr(0x9fdcff, 7 * doorOn + beat * 5 + cutK * 6));
      plate.material.color.copy(hdr(0xdcefff, 2.2 * doorOn));
      guideMat.color.copy(hdr(0x8fd6ff, 3.2 * lightOf(K.LIGHTS + 0.15, 3)));
      ceilLineMat.color.copy(hdr(0xeaf4ff, 3.0 * lightOf(K.LIGHTS + 1.0, 5)));
      capMat.color.copy(hdr(0xff3048, 4 * doorOn));
      envMats.forEach((m) => { m.envMapIntensity = 0.06 + 0.8 * allOn; });
      hemi.intensity = 0.05 + 0.35 * allOn;
      ceilLights.forEach(({ l, z }) => { l.intensity = 34 * lightOf(K.LIGHTS + (40 - z) / 36 * 2.3, z) * (1 - 0.4 * openU); });
      const spotK = lightOf(K.DOOR_ON - 0.2, 11);
      spots[0].intensity = spots[1].intensity = 150 * spotK * (1 - 0.5 * openU); spots[2].intensity = 300 * lightOf(K.SPOT, 13) * (1 - 0.7 * openU);
      shafts.forEach((m, i) => { m.material.uniforms.uA.value = (i === 2 ? 0.05 * lightOf(K.SPOT, 13) : 0.035 * spotK) * (1 - 0.6 * openU); });
      dust.uniforms.uT.value = t; dust.uniforms.uA.value = 0.5 * allOn + 0.2; dust.uniforms.uBeam.value = openU; dust.uniforms.uPx.value = lastPx;
      const veilK = ss(K.COUNT - 0.8, K.COUNT, t) * (1 - ss(K.CUT, K.CUT + 0.6, t));
      leaves.forEach((L) => { L.mat.emissive.copy(hdr(0xffffff, (1.3 * doorOn + beat * 0.5) * (1 - 0.8 * veilK) + cutK * 2.5)); L.g.position.x = L.side * openU * (DW + 0.4); });
      // the seal and the countdown
      const ct = t - K.COUNT;
      sealMat.uniforms.uOn.value = doorOn; sealMat.uniforms.uPulse.value = beat; sealMat.uniforms.uProg.value = ct < 0 ? 0 : t >= K.CUT ? 1.001 : Math.min(1, Math.floor(ct + 1) / 10);
      sealMat.uniforms.uGreen.value = ss(K.UNLOCK + 0.9, K.UNLOCK + 1.4, t); sealMat.uniforms.uRot.value = -inOut(seg(t, K.UNLOCK + 0.9, K.UNLOCK + 1.6)) * 0.52;
      if (ct >= 0 && t < K.CUT) {
        const i = Math.floor(ct), u = ct - i, n = 10 - i;
        digitMat.uniforms.tMap.value = digitTex[n]; digitMat.uniforms.uTime.value = t;
        const a = out3(seg(u, 0, 0.3)) * (1 - ss(0.72, 0.98, u)); digitMat.uniforms.uA.value = a * (n <= 3 ? 1.25 : 1);
        digitMat.uniforms.uCol.value.copy(n <= 3 ? hdr(0xffb27a, 3.6) : hdr(0x9fdcff, 3.0));
        digit.scale.setScalar(1.18 - 0.18 * out3(seg(u, 0, 0.35)) - 0.05 * seg(u, 0.7, 1)); digit.visible = true;
      } else digit.visible = false;
      veil.material.opacity = 0.94 * ss(K.COUNT - 0.8, K.COUNT, t) * (1 - ss(K.CUT, K.CUT + 0.6, t));
      sealMat.uniforms.uWarm.value = ss(K.COUNT + 6.8, K.COUNT + 7.2, t) * (1 - ss(K.CUT, K.CUT + 0.3, t));
      // the cut
      const bu = seg(t, K.CUT - 0.2, K.CUT);
      blade.visible = bladeCore.visible = t > K.CUT - 0.2 && t < K.CUT + 0.45;
      if (blade.visible) { const y = RIB.y + 3.4 - bu * 3.4, fade = 1 - seg(t, K.CUT, K.CUT + 0.45); blade.position.y = bladeCore.position.y = y + 1.6; blade.scale.set(1 + bu * 2, 1, 1); blade.material.color.copy(hdr(0xbfe8ff, 6 * fade)); bladeCore.material.color.copy(hdr(0xffffff, 18 * fade)); }
      const bt = t - K.CUT;
      burst.visible = shock.visible = bt > -0.02 && bt < 1.4;
      if (burst.visible) { burst.material.color.copy(hdr(0xfff1dc, 22 * Math.exp(-Math.max(0, bt) * 7))); burst.scale.setScalar(0.4 + 2.2 * outE(cl(bt / 0.3))); shock.scale.setScalar(0.2 + 5.5 * out3(cl(bt / 0.8))); shockMat.uniforms.uA.value = 0.55 * Math.pow(1 - cl(bt / 0.8), 2); shock.quaternion.copy(cam.quaternion); }
      cutLight.intensity = bt > 0 ? 420 * Math.exp(-bt * 4.5) : 0;
      sparks.uniforms.uT.value = bt;
      // the ribbon: whole until the cut, then the two halves fall from their posts and the bow drops
      if (t < K.CUT) {
        ribbon.visible = true; halves.forEach((m) => (m.visible = false));
        for (let i = 0; i < NR; i++) ribbonAt(-RIB.half + 2 * RIB.half * i / (NR - 1), t, ribP[i], ribW[i]);
        ribbon.set(ribP, ribW, RIB.w);
        bow.position.set(0, RIB.y - RIB.sag + 0.025 * Math.sin(1.3 * t), RIB.z + 0.08); bow.rotation.set(0.05 * Math.sin(0.9 * t), 0, 0.02 * Math.sin(1.1 * t));
      } else {
        ribbon.visible = false; halves.forEach((m, k) => { m.visible = true; setHalf(m, k, bt); });
        const fall = Math.max(0, bt - 0.05), y0 = RIB.y - RIB.sag, land = Math.sqrt(2 * (y0 - 0.3) / 9.8), yy = fall < land ? y0 - 4.9 * fall * fall : 0.3 + Math.abs(Math.sin((fall - land) * 7)) * 0.25 * Math.exp(-(fall - land) * 5);
        bow.position.set(0.15 * Math.min(fall, land), yy, RIB.z + 0.08 + 0.4 * Math.min(fall, land)); bow.rotation.set(-Math.min(fall, land) * 2.2 - (fall > land ? 1.0 : 0), 0, Math.min(fall, land) * 1.1);
      }
      // the locks
      clamps.forEach((c, i) => {
        const a = K.UNLOCK + i * 0.5, turn = inOut(seg(t, a, a + 0.32)), pull = inOut(seg(t, a + 0.3, a + 0.62));
        c.g.position.x = -openU * (DW + 0.4); c.hub.rotation.y = turn * Math.PI / 2; c.notch.rotation.z = turn * Math.PI / 2; c.barM.scale.x = 1 - 0.85 * pull; c.g.position.z = 0.12 - pull * 0.16;
      });
      lockOnMat.color.copy(t < K.UNLOCK ? hdr(0x9fdcff, 4 * doorOn) : hdr(0xd4f25c, 6));
      // light from outside: the seam, the beam, the sun on the floor
      const leak = ss(K.UNLOCK + 1.1, K.OPEN + 0.2, t) * (1 - openU * 0.6);
      seamLight.material.color.copy(hdr(0xfff3e0, 14 * leak * (1 - ss(0.0, 0.18, openU)))); seamLight.scale.x = 1 + gap * 2;
      beamMat.uniforms.uA.value = Math.max(leak * 0.5, ss(0, 0.5, openU) * 1.0) * (1 - ss(K.OUTSIDE - 1.5, K.OUTSIDE, t)); beamMat.uniforms.uGap.value = Math.max(0.15, gap);
      sun.intensity = 9 * ss(0.05, 0.6, openU); if (sun.intensity > 0) renderer.shadowMap.needsUpdate = true;
      return { openU, beat, cutK };
    };
    let shadowsOnce = false, outU = 0;
    const frameAt = (t, ft) => {
      fx.uTime.value = (ft == null ? t : 100 + ft);
      const outro = ft != null;
      let hallVis = !outro && t < K.OUTSIDE + 0.4, st = { openU: 0, beat: 0, cutK: 0 };
      // ---- the main camera ----
      if (!outro) {
        const v = track(CAMK, t), amp = 0.006 * st.beat + (t >= K.CUT ? 0.07 * Math.exp(-(t - K.CUT) * 3.5) : 0) + (t > K.OPEN && t < K.OPEN + 1.5 ? 0.02 * Math.sin(seg(t, K.OPEN, K.OPEN + 1.5) * Math.PI) : 0);
        const sh = shake(t, amp + 0.004 * pulseAt(t, BEATS, 8));
        look(cam, [v[0] + sh[0], v[1] + sh[1], v[2]], [v[3], v[4], v[5]], 0);
        cam.fov = 38 + 3 * ss(K.OPEN, K.OUTSIDE, t); cam.updateProjectionMatrix();
      }
      if (hallVis) st = drawHall(t);
      if (!shadowsOnce) { renderer.shadowMap.needsUpdate = true; shadowsOnce = true; }
      // ---- space ----
      let spaceVis = outro || t > K.UNLOCK + 1.0;
      let sunUp, sunAz, sunVisBoost = 1, lightsK = 1;
      if (!outro) {
        // the space camera turns with the hall's camera and drifts a little; after the doorway it dives toward Israel
        qa.copy(cam.quaternion);
        const dive = in3(seg(t, K.PLUNGE, K.FLASH));
        const pos = new V3(0, 0, -0.08 * Math.max(0, 9.4 - cam.position.z) * 0.05);
        const target = DIVE.X.clone().addScaledVector(DIVE.n, 1.6);
        pos.lerp(target, dive * 0.985);
        scam.position.copy(pos);
        tmpM.lookAt(pos, ISRW(), new V3(0, 1, 0)); qb.setFromRotationMatrix(tmpM);
        scam.quaternion.copy(qa).slerp(qb, ss(K.OUTSIDE - 0.6, K.PLUNGE + 1.2, t));
        scam.fov = cam.fov + 18 * in3(seg(t, K.PLUNGE, K.FLASH)); scam.clearViewOffset(); scam.updateProjectionMatrix();
        sunUp = -11.2 + 5.0 * out3(seg(t, K.SUN, K.TAG + 4)); sunAz = 24;
        fx.uZoom.value = 0.22 * in3(seg(t, K.PLUNGE + 0.6, K.FLASH));
      } else {
        // the closing: back from over Israel to the emblem's place, the sun swinging round to light the face of the Earth
        const u = 0.1 * ss(0.2, 4.6, ft) + 0.9 * inOut(seg(ft, 4.4, K.LAND)), far = 58.9; outU = u;   // (lingers over Israel while "welcome" is up)
        const n0 = DIVE.n.clone().multiplyScalar(0.7).add(DIVE.X.clone().negate().normalize().multiplyScalar(0.5)).normalize(), p0 = DIVE.X.clone().addScaledVector(n0, 5.5);
        const faceL = llToLocal(24, 22).applyQuaternion(earth.quaternion).normalize();
        const p1 = EC.clone().addScaledVector(faceL, far);
        const dir = p0.clone().sub(EC).normalize().lerp(faceL, ss(0.05, 0.85, u)).normalize(), dist = THREE.MathUtils.lerp(EC.distanceTo(p0), far, Math.pow(u, 1.4));
        scam.position.copy(EC).addScaledVector(dir, dist);
        if (u > 0.999) scam.position.copy(p1); else if (u < 0.001) scam.position.copy(p0);
        const northW = llToLocal(90, 0).applyQuaternion(earth.quaternion);
        const away = new V3(0, 0, -1).projectOnPlane(DIVE.n).normalize(), lookAt = ISRW().addScaledVector(away, 7).lerp(EC, ss(0.0, 0.6, u));
        tmpM.lookAt(scam.position, lookAt, northW.clone().lerp(new V3(0, 1, 0), 0.0)); scam.quaternion.setFromRotationMatrix(tmpM);
        scam.fov = 38; const ko = ss(0.35, 1, u); scam.setViewOffset(W, H, -20 * ko, 88 * ko, W, H); scam.updateProjectionMatrix();
        sunUp = null; fx.uZoom.value = 0.06 * (1 - ss(0, 1.2, ft));
        lightsK = 1;
      }
      // sun direction
      if (sunUp != null) { const e = sunUp * D2R, a = sunAz * D2R; sunU.value.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize(); }
      else {
        const u = ss(0.05, 0.9, outU), fc = llToLocal(24, 22).applyQuaternion(earth.quaternion).normalize(), np = llToLocal(90, 0).applyQuaternion(earth.quaternion).normalize();
        const east = new V3().crossVectors(np, fc).normalize(), north = new V3().crossVectors(fc, east).normalize();
        const sF = fc.clone().multiplyScalar(-0.35).addScaledVector(east, -0.75).addScaledVector(north, 0.55).normalize();
        const e = -6.2 * D2R, a = 24 * D2R, s0 = new V3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)); sunU.value.copy(s0.lerp(sF, u).normalize()); }
      earthMat.uniforms.uT.value = (outro ? 60 + ft : t); earthMat.uniforms.uLights.value = lightsK;
      sky.position.copy(scam.position);
      // the sun's sprites at a great distance along its direction, hidden as the limb covers it
      const sd = sunU.value.clone(), sunPos = scam.position.clone().addScaledVector(sd, 400);
      const toC = EC.clone().sub(scam.position), sep = Math.acos(Math.min(1, Math.max(-1, sd.dot(toC.clone().normalize())))) - Math.asin(Math.min(1, ER / toC.length()));
      const vis = ss(-0.004, 0.012, sep), soft = ss(-0.06, 0.01, sep);
      sunCore.position.copy(sunPos); sunCore.scale.setScalar(4.2); sunCore.material.opacity = 1;
      sunGlow.position.copy(sunPos); sunGlow.scale.setScalar(70); sunGlow.material.color.copy(hdr(0xffd2a0, 0.9 * soft + 1.2 * vis));
      sunRays.position.copy(sunPos); sunRays.scale.setScalar(120); sunRays.material.color.copy(hdr(0xfff0e0, 1.6 * vis)); sunRays.material.rotation = (outro ? ft : t) * 0.03;
      sunStreak.position.copy(sunPos); sunStreak.scale.set(380, 4, 1); sunStreak.material.color.copy(hdr(0xc8e0ff, 1.6 * vis));
      // lens ghosts along the line from the sun through the middle of the picture
      const sp = sunPos.clone().project(scam); const onScreen = Math.abs(sp.x) < 1.3 && Math.abs(sp.y) < 1.3 && sp.z < 1;
      ghosts.forEach((g, i) => { const k = g.userData.k, ndc = new V3(-sp.x * (k - 0.0) * (i % 2 ? 1 : 0.6), -sp.y * k * (i % 2 ? 1 : 0.6), 0.5).unproject(scam); g.position.copy(ndc.sub(scam.position).normalize().multiplyScalar(30).add(scam.position)); g.scale.setScalar([1.4, 0.8, 2.2, 1.1][i]); g.material.opacity = onScreen ? vis * 1.0 : 0; });
      stars.uniforms.uT.value = outro ? ft : t; stars.uniforms.uPx.value = lastPx; stars.uniforms.uA.value = 1;
      atmMat.uniforms.uA.value = 1;
      // ---- the post ----
      if (!outro) {
        const blast = ss(K.OPEN + 0.2, K.OPEN + 2.2, t) * (1 - ss(K.OPEN + 2.2, K.OUTSIDE + 0.5, t));
        fx.uExpo.value = (0.55 + 0.55 * ss(K.LIGHTS - 0.5, K.DOOR_ON, t)) * (1 - 0.3 * blast) + 0.15 * st.beat * 0.2;
        fx.uBloom.value = 0.15 + 0.08 * blast + 0.1 * st.cutK; fx.uStreak.value = 0.16 + 0.08 * blast;
        fx.uFlash.value = Math.max(t >= K.CUT ? 0.55 * Math.exp(-(t - K.CUT) * 9) : 0, ss(K.FLASH - 0.4, K.FLASH, t)); fx.uFlashCol.value.setRGB(1, 0.98, 0.95);
        fx.uFade.value = ss(0.0, 0.6, t) * 0 + 1; fx.uOpaque.value = 1; fx.uVig.value = 0.6; fx.uSat.value = 1;
      } else {
        fx.uExpo.value = 1.0; fx.uBloom.value = 0.18; fx.uStreak.value = 0.15;
        fx.uFlash.value = 0.0; fx.uOpaque.value = 1 - ss(K.WAKE, K.WAKE + 1.2, ft); fx.uVig.value = 0.6 * (1 - ss(K.WAKE, K.WAKE + 1.2, ft));
        fx.uFade.value = 1 - ss(K.LAND + 0.5, K.LAND + 1.8, ft); fx.uSat.value = 1;
        stars.uniforms.uA.value = 1 - ss(K.WAKE - 0.5, K.WAKE + 0.8, ft); milky.uniforms.uA.value = stars.uniforms.uA.value;
      }
      // ---- draw ----
      renderer.setRenderTarget(post.sceneRT); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, true);
      if (spaceVis) { renderer.autoClear = false; renderer.render(space, scam); }
      if (hallVis) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, cam); }
      renderer.autoClear = true;
      post.finish();
      // ---- words ----
      if (!outro) {
        showWord(W_.eyebrow, t, K.EYEBROW, K.TITLE_OUT, { track: [0.6, 0.32] }); showWord(W_.title, t, K.TITLE, K.TITLE_OUT + 0.1, { inDur: 2.0, track: [0.25, 0.02] }); showWord(W_.line, t, K.LINE, K.TITLE_OUT + 0.2, { track: [0.4, 0.12] });
        showWord(W_.honor, t, K.HONOR, K.HONOR_OUT, { track: [0.4, 0.14] });
        showWord(W_.tag, t, K.TAG, K.TAG_OUT, { inDur: 2.2, track: [0.3, 0.02], grow: 0.18, lift: -10 }); showWord(W_.tagLine, t, K.TAG + 0.8, K.TAG_OUT, { track: [0.5, 0.2], grow: 0.1, lift: -10 });
        ['welcome', 'welcomeLine'].forEach((k) => showWord(W_[k], -1, 0, null));
      } else {
        ['eyebrow', 'title', 'line', 'honor', 'tag', 'tagLine'].forEach((k) => showWord(W_[k], -1, 0, null));
        showWord(W_.welcome, ft, K.F_TXT, K.F_TXT_OUT, { inDur: 1.8, track: [0.25, 0.02] }); showWord(W_.welcomeLine, ft, K.F_TXT + 0.5, K.F_TXT_OUT, { track: [0.4, 0.1] });
      }
    };
    const LANDOFF = 0;
    fit();
    lastPx = bh / H;
    try { renderer.compile(scene, cam); renderer.compile(space, scam); } catch (e) { /* compiled on first use instead */ }
    const api = {
      K,
      render(t, ft) { fit(); lastPx = bh / H; frameAt(t, ft == null ? null : ft); },
      setScale(k) { scale = Math.min(1.25, Math.max(0.5, k)); bw = 0; },
      get scale() { return scale; },
      dispose() { try { post.dispose(); renderer.dispose(); renderer.forceContextLoss(); } catch (e) {} renderer.domElement.remove(); ov.remove(); },
    };
    return api;
  }
  window.CerStage = { create, K, preload: () => assets().then(() => true, () => false) };
})();
