// v7: launch theatre = space launchers + satellites only (emblem-launch.js); no rocket scan band; render resolution never below native device pixels.
// v6: calmer — no sun flare / hex shield / radar clock, launches with names that break out of the frame, logo seams + scan restored. <space-emblem-v6 pad-top="px" speed="90" globe="holo|real" sway="on|off" fx="full|calm"> — Space Directorate emblem, v5 = v3 look + emblem-kit.js detailed satellites and flying models (launches, jets, UAVs).
// Geometry identical to v2 (measured from the logo; globe R = 1; front objects scaled by (D-z)/D so the frontal projection keeps the logo's proportions).
// v3: HDR + 4×MSAA render target with a custom bloom / anamorphic streak / ACES pass (core three only); render resolution follows the real on-screen size;
// lacquer detail (panel seams, flake, fresnel rim, scan band), energy pulses along the ridges, data-flow orbit rails, detailed satellites,
// day/night terminator with golden city lights, LEO traffic swarm, hex shield ripple from Israel, uplink beams, sun at the limb, HUD text ring, boot-up intro.
// Space Wall (app/src/emblem-v7/): the files from the Claude Design bundle "מנהלת החלל - לוגו תלת מימדי", loaded from the
// site (three, textures, the world atlas), plus what the wall needs of its emblem, as in emblem-v2.js: word="…" (the
// wordmark; English mode), paused (keeps its last frame and draws nothing), 'emblem-ready' / 'emblem-frame' (the first
// frame drawn after a pause) / 'emblem-error' events, the drawing resolution following the remote's preview frame and a
// phone's page zoom (never above what the screen shows: a phone ran out of memory with a full-size picture), and the
// WebGL context released when it leaves the page. The remote's switches (design: traffic, rate, sats, stack) are read
// from the attributes traffic, launch-rate, max-sats and stack-size on every frame, so they apply live.
(() => {
  const TEXDIR = '/assets/textures/';
  const res = (f) => (window.__resources && window.__resources[f.replace(/\W/g, '_')]) || (TEXDIR + f);
  class SpaceEmblemV7 extends HTMLElement {
    static get observedAttributes() { return ['speed', 'sway', 'paused']; }
    connectedCallback() { if (this._started) return; this._started = true; this.style.display = 'block'; this._init().catch((e) => { console.error('space-emblem-v7', e); this.dispatchEvent(new Event('emblem-error')); }); }
    disconnectedCallback() {
      this._alive = false; this._started = false; this._gen = (this._gen || 0) + 1;
      if (this._ro) this._ro.disconnect(); clearInterval(this._prTimer);
      if (this._renderer) { this._renderer.dispose(); this._renderer.forceContextLoss(); this._renderer.domElement.remove(); this._renderer = null; }
    }
    attributeChangedCallback() { this._speed = Number(this.getAttribute('speed')) || 90; this._sway = this.getAttribute('sway') !== 'off'; this._paused = this.hasAttribute('paused'); }
    async _init() {
      this.attributeChangedCallback();
      const gen = this._gen = (this._gen || 0) + 1;
      const mode = this.getAttribute('globe') === 'real' ? 'real' : 'holo';
      const FULL = this.getAttribute('fx') !== 'calm';
      const THREE = await import((window.__resources && window.__resources.threeModule) || '/vendor/three.module.js');
      if (gen !== this._gen) return;
      const TAU = Math.PI * 2, deg = THREE.MathUtils.degToRad, V3 = THREE.Vector3, MU = THREE.MathUtils;
      const D = 11, YC = -0.2, HALF_H = 1.62, HALF_W = 1.62;
      const persp = (z) => (D - z) / D;
      const SUN = new V3(-0.95, 0.3, 0.12).normalize();
      const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
      let camHalf = HALF_H; const KIT = window.EmblemKit; if (!KIT) throw new Error('emblem-kit.js must load before emblem-3d-v7.js');

      // ---------- renderer: resolution = on-screen size (stage transform × DPR) × 1.5 supersampling, capped ----------
      const cssW = () => this.clientWidth || 800, cssH = () => this.clientHeight || 800, PADT = Number(this.getAttribute('pad-top')) || 0;
      const pickPR = () => { const r = this.getBoundingClientRect(), z = this.currentCSSZoom || 1, kr = this.clientWidth && r.width ? r.width / this.clientWidth : 1; let k = Math.max(kr, z, 0.25); try { const f = window.frameElement; if (f && innerWidth) k *= f.getBoundingClientRect().width / innerWidth; } catch (e) { /* not ours */ } if (window.__pageScale) k *= window.__pageScale(); const small = k < 0.99, nat = (window.devicePixelRatio || 1) * k, ssf = (this.getAttribute('quality') === 'ultra' ? MU.clamp(2 * (this._prScale || 1), 1, 2) : MU.clamp(1.5 * (this._prScale || 1), 1, 1.5)), cw = cssW(), ch = cssH(); return MU.clamp(small ? nat : nat * ssf, small ? 0.35 : 1, Math.min((this.getAttribute('quality') === 'ultra' ? 7680 : 4608) / Math.max(cw, ch), Math.sqrt((this.getAttribute('quality') === 'ultra' ? 26e6 : 14e6) / (cw * ch)))); };
      let PR = pickPR();
      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      this._renderer = renderer;
      renderer.setPixelRatio(PR); renderer.setSize(cssW(), cssH(), false); renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
      this.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 100);
      camera.position.set(0, YC, D); camera.lookAt(0, YC, 0);
      const U = { time: { value: 0 }, sweep: { value: 99 }, scan: { value: 99 }, rscan: { value: 99 }, size: { value: 2 }, reveal: { value: 0 }, sun: { value: SUN }, px: { value: 200 } };

      // ---------- post: HDR MSAA scene → bright pass → dual-kawase mip bloom → anamorphic streak → ACES + sRGB → premultiplied alpha ----------
      const post = (() => {
        const gl2 = renderer.capabilities.isWebGL2, type = gl2 && renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
        const sceneRT = new THREE.WebGLRenderTarget(4, 4, { type, samples: gl2 ? 4 : 0, stencilBuffer: true });
        const o = { type, depthBuffer: false }, LV = 6, down = [], up = [];
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
vec3 pre(vec2 o){ vec3 c = texture2D(tSrc, vUv + o).rgb; if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0); c = min(c, vec3(48.0)); float br = max(c.r, max(c.g, c.b)); float s = clamp(br - uTh + uKnee, 0.0, 2.0 * uKnee); s = s * s / (4.0 * uKnee + 1e-4); return c * max(s, br - uTh) / max(br, 1e-4); }
void main(){ vec2 o = uTx * 0.5; gl_FragColor = vec4((pre(-o) + pre(o) + pre(vec2(o.x, -o.y)) + pre(vec2(-o.x, o.y))) * 0.25, 1.0); }`, { tSrc: tx(), uTx: v2(), uTh: { value: 0.9 }, uKnee: { value: 0.45 } });
        const dn = mk(`uniform sampler2D tSrc; uniform vec2 uTx; varying vec2 vUv;
void main(){ vec2 o = uTx * 0.5; vec4 s = texture2D(tSrc, vUv) * 4.0; s += texture2D(tSrc, vUv - o); s += texture2D(tSrc, vUv + o); s += texture2D(tSrc, vUv + vec2(o.x, -o.y)); s += texture2D(tSrc, vUv - vec2(o.x, -o.y)); gl_FragColor = s / 8.0; }`, { tSrc: tx(), uTx: v2() });
        const upm = mk(`uniform sampler2D tSrc, tAdd; uniform vec2 uTx; varying vec2 vUv;
void main(){ vec2 o = uTx * 0.5; vec4 s = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)); s += texture2D(tSrc, vUv + vec2(-o.x, o.y)) * 2.0; s += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)); s += texture2D(tSrc, vUv + vec2(o.x, o.y)) * 2.0;
 s += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)); s += texture2D(tSrc, vUv + vec2(o.x, -o.y)) * 2.0; s += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)); s += texture2D(tSrc, vUv + vec2(-o.x, -o.y)) * 2.0;
 gl_FragColor = s / 12.0 + texture2D(tAdd, vUv); }`, { tSrc: tx(), tAdd: tx(), uTx: v2() });
        const stk = mk(`uniform sampler2D tSrc; uniform vec2 uTx; uniform float uStep, uTh; varying vec2 vUv;
void main(){ vec3 s = vec3(0.0); float ws = 0.0; for (int i = -7; i <= 7; i++) { float fi = float(i); float w = exp(-abs(fi) * 0.3); s += max(texture2D(tSrc, vUv + vec2(fi * uStep * uTx.x, 0.0)).rgb - uTh, 0.0) * w; ws += w; } gl_FragColor = vec4(s / ws, 1.0); }`, { tSrc: tx(), uTx: v2(), uStep: { value: 1 }, uTh: { value: 0 } });
        const comp = mk(`uniform sampler2D tScene, tBloom, tStreak; uniform float uBloom, uStreak, uExpo, uFade, uCA; varying vec2 vUv;
vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){ const mat3 IM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
 const mat3 OM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
 c *= uExpo / 0.6; c = OM * rrt(IM * c); return clamp(c, 0.0, 1.0); }
vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 safe(vec3 c){ return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : min(c, vec3(64.0)); }
void main(){ vec2 d = vUv - 0.5; vec4 sc = texture2D(tScene, vUv); if (isnan(sc.a)) sc.a = 0.0;
 vec3 col = safe(vec3(texture2D(tScene, vUv + d * uCA).r, sc.g, texture2D(tScene, vUv - d * uCA).b));
 col += safe(texture2D(tBloom, vUv).rgb) * uBloom + safe(texture2D(tStreak, vUv).rgb) * vec3(0.45, 0.7, 1.0) * uStreak;
 vec3 o = srgb(aces(max(col, 0.0))) * uFade;
 gl_FragColor = vec4(o, clamp(max(sc.a * uFade, max(o.r, max(o.g, o.b))), 0.0, 1.0)); }`,
          { tScene: tx(), tBloom: tx(), tStreak: tx(), uBloom: { value: 0.1 }, uStreak: { value: 0.12 }, uExpo: { value: 1.08 }, uFade: { value: 0 }, uCA: { value: 0.0025 } });
        const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(qs, qc); };
        const texel = (m, rt) => m.uniforms.uTx.value.set(1 / rt.width, 1 / rt.height);
        const set = (W, H) => { sceneRT.setSize(W, H); let w = W, h = H; for (let i = 0; i < LV; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); down[i].setSize(w, h); if (i < LV - 1) up[i].setSize(w, h); } stA.setSize(Math.max(1, W >> 2), Math.max(1, H >> 4)); stB.setSize(Math.max(1, W >> 2), Math.max(1, H >> 4)); };
        const render = () => {
          renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
          bright.uniforms.tSrc.value = sceneRT.texture; texel(bright, sceneRT); pass(bright, down[0]);
          for (let i = 1; i < LV; i++) { dn.uniforms.tSrc.value = down[i - 1].texture; texel(dn, down[i - 1]); pass(dn, down[i]); }
          let src = down[LV - 1];
          for (let i = LV - 2; i >= 0; i--) { upm.uniforms.tSrc.value = src.texture; upm.uniforms.tAdd.value = down[i].texture; texel(upm, src); pass(upm, up[i]); src = up[i]; }
          stk.uniforms.tSrc.value = down[1].texture; texel(stk, down[1]); stk.uniforms.uStep.value = 1.5; stk.uniforms.uTh.value = 0.35; pass(stk, stA);
          stk.uniforms.tSrc.value = stA.texture; texel(stk, stA); stk.uniforms.uStep.value = 5; stk.uniforms.uTh.value = 0; pass(stk, stB);
          comp.uniforms.tScene.value = sceneRT.texture; comp.uniforms.tBloom.value = up[0].texture; comp.uniforms.tStreak.value = stB.texture; pass(comp, null);
        };
        return { set, render, comp, bright };
      })();
      const fit = () => {
        const LH = Math.max(1, cssH() - PADT); camera.aspect = cssW() / LH;
        const half = Math.max(HALF_H, HALF_W / camera.aspect);
        camera.fov = 2 * Math.atan(half / D) * 180 / Math.PI; const Z = Math.max(1, this._zoom || 1), cw = cssW(), ch = cssH();
        if (PADT) camera.setViewOffset(cw, LH, 0, -PADT, cw, ch); else if (Z > 1.0001) { const vw = cw / Z, vh = ch / Z; camera.setViewOffset(cw, ch, (cw - vw) * (0.5 + (this._panX || 0)), (ch - vh) * (0.5 + (this._panY || 0)), vw, vh); } else camera.clearViewOffset(); camera.updateProjectionMatrix();
        const pxH = renderer.domElement.height * LH / cssH(); U.size.value = 0.0072 * (pxH / (2 * half)) * Z; U.px.value = pxH / (2 * half) * Z; camHalf = half / Z;
        post.set(renderer.domElement.width, renderer.domElement.height);
      };
      fit();

      // studio environment for clearcoat reflections
      (() => {
        const env = new THREE.Scene();
        env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: 0x080c18, side: THREE.BackSide })));
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const g = c.getContext('2d'); const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
        grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.55, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
        const soft = new THREE.CanvasTexture(c); soft.colorSpace = THREE.SRGBColorSpace;
        const panel = (pw, ph, hex, power, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: soft, transparent: true, color: new THREE.Color(hex).multiplyScalar(power), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
        panel(9, 7, 0xfff6ec, 5, -9, 4, 6); panel(3, 10, 0x9cc8ff, 3.4, 9, 1, 3); panel(14, 1.6, 0xe4eeff, 5, 0, 9, -2); panel(6, 6, 0x3f7dff, 2.6, -3, -5, -7); panel(10, 1, 0x8fe0ff, 2.2, 0, -8, 5);
        const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(env, 0.03).texture; pmrem.dispose();
        scene.environmentIntensity = 1.25;
      })();
      const additive = (mat) => { mat.transparent = true; mat.depthWrite = false; mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneFactor; mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.OneFactor; if (mat.isShaderMaterial) mat.extensions.derivatives = true; return mat; };
      const canvasTex = (size, draw) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
      const glowTex = canvasTex(128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(210,236,255,0.8)'); gr.addColorStop(0.45, 'rgba(120,185,255,0.2)'); gr.addColorStop(1, 'rgba(60,120,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
      const flareTex = canvasTex(256, (g) => {
        const gr = g.createRadialGradient(128, 128, 0, 128, 128, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(200,235,255,0.5)'); gr.addColorStop(1, 'rgba(120,180,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        const streak = (horiz) => { const lg = horiz ? g.createLinearGradient(0, 0, 256, 0) : g.createLinearGradient(0, 0, 0, 256); lg.addColorStop(0, 'rgba(160,210,255,0)'); lg.addColorStop(0.5, 'rgba(235,248,255,0.95)'); lg.addColorStop(1, 'rgba(160,210,255,0)'); g.fillStyle = lg; if (horiz) g.fillRect(0, 126, 256, 4); else g.fillRect(126, 0, 4, 256); };
        streak(true); streak(false);
      });
      // lacquer: diagonal light sweep, fine flake, fresnel rim, optional panel seams + holographic scan band (rocket local Y)
      const lacquer = (mat, o) => {
        mat.customProgramCacheKey = () => 'lacq' + (o.seams ? 1 : 0) + (o.scan ? 1 : 0);
        mat.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, { uSweepY: U.sweep, uRScan: U.rscan, uSweepC: { value: hdr(o.sweep, o.sweepK) }, uRimC: { value: hdr(o.rim, o.rimK) } });
          sh.vertexShader = 'varying vec3 vWP; varying vec3 vLP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vLP = transformed;');
          let fs = 'uniform float uSweepY, uRScan; uniform vec3 uSweepC, uRimC; varying vec3 vWP; varying vec3 vLP;\n' +
            'float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }\n' +
            'float aaLine(float d, float w){ float fw = fwidth(d) * 1.2 + 1e-5; return 1.0 - smoothstep(w, w + fw, abs(d)); }\n' +
            'float aaGrid(float x, float w){ float fw = fwidth(x) * 1.2 + 1e-5; return 1.0 - smoothstep(w, w + fw, abs(fract(x) - 0.5)); }\n' + sh.fragmentShader;
          if (o.seams) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n float seam = max(aaLine(vLP.y - 0.72, 0.0022), aaLine(vLP.y - 0.18, 0.0022)); diffuseColor.rgb *= 1.0 - 0.6 * seam;');
          fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + (h31(floor(vLP * 110.0)) - 0.5) * 0.07, 0.03, 1.0);');
          fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 float swp = vWP.y + vWP.x * 0.4 - uSweepY; totalEmissiveRadiance += uSweepC * exp(-swp * swp * 26.0);
 float frs = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0); totalEmissiveRadiance += uRimC * frs;
 ${o.scan ? 'float rb = exp(-pow((vLP.y - uRScan) * 10.0, 2.0)); float grid = max(aaGrid(vLP.y * 36.0, 0.03), aaGrid((vLP.x + vLP.z) * 36.0, 0.03)); totalEmissiveRadiance += vec3(0.32, 0.78, 1.0) * rb * (0.3 + 2.8 * grid);' : ''}
 ${o.seams ? 'totalEmissiveRadiance += vec3(0.35, 0.8, 1.0) * max(aaLine(vLP.y - 0.708, 0.0011), aaLine(vLP.y - 0.168, 0.0011)) * 1.8;' : ''}`);
          sh.fragmentShader = fs;
        };
        return mat;
      };
      // day / night on the globe surface (sun direction in world space)
      const dayNight = (mat, k) => {
        mat.customProgramCacheKey = () => 'dn' + mode;
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uSun = U.sun;
          sh.vertexShader = 'varying vec3 vWN;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vWN = normalize(mat3(modelMatrix) * objectNormal);');
          sh.fragmentShader = 'uniform vec3 uSun; varying vec3 vWN;\n' + sh.fragmentShader
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 float sunF = dot(normalize(vWN), uSun); float dayF = smoothstep(-0.15, 0.25, sunF);
 totalEmissiveRadiance *= mix(${k.eNight}, ${k.eDay}, dayF);
 totalEmissiveRadiance += vec3(0.95, 0.55, 0.3) * exp(-sunF * sunF * 50.0) * ${k.tw};`)
            .replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', `vec3 outgoingLight = (totalDiffuse + totalSpecular) * mix(${k.lNight}, 1.0, dayF) + totalEmissiveRadiance;`);
        };
        return mat;
      };

      const M = {
        navy: lacquer(new THREE.MeshPhysicalMaterial({ color: 0x1d1c66, metalness: 0.12, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.2, envMapIntensity: 0.18, flatShading: true }), { sweep: 0x6f86ff, sweepK: 0.9, rim: 0x4f7dff, rimK: 0.22, seams: true, scan: true }),
        sky: lacquer(new THREE.MeshPhysicalMaterial({ color: 0x8cbde6, metalness: 0.05, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.35, specularIntensity: 0.3, envMapIntensity: 0.18, flatShading: true }), { sweep: 0xbfe6ff, sweepK: 0.55, rim: 0x9fdcff, rimK: 0.15, seams: true, scan: true }),
        ring: new THREE.MeshStandardMaterial({ color: 0xc4d2ea, metalness: 1, roughness: 0.16, emissive: 0x2c5ca8, emissiveIntensity: 0.6 }),
        ringGlow: additive(new THREE.MeshBasicMaterial({ color: 0x3f8fff, opacity: 0.16 })),
        typeFront: lacquer(new THREE.MeshPhysicalMaterial({ color: 0xa9d2f2, metalness: 0.15, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x1d4a80, emissiveIntensity: 0.45, envMapIntensity: 0.6 }), { sweep: 0xcfeaff, sweepK: 0.8, rim: 0x9fdcff, rimK: 0.12 }),
        typeSide: lacquer(new THREE.MeshPhysicalMaterial({ color: 0x2a2f86, metalness: 0.6, roughness: 0.3, clearcoat: 0.6 }), { sweep: 0x6f86ff, sweepK: 0.5, rim: 0x5f8fff, rimK: 0.3 }),
        hud: additive(new THREE.MeshBasicMaterial({ color: 0x6fb4ff, opacity: 0.3, side: THREE.DoubleSide })),
      };

      // ---------- Globe ----------
      const EARTH0 = -2.48; // Israel just left of centre at t=0
      const globeG = new THREE.Group(); globeG.rotation.z = deg(-10); scene.add(globeG);
      const spinG = new THREE.Group(); spinG.rotation.y = EARTH0; globeG.add(spinG);
      const globeMat = mode === 'holo'
        ? dayNight(new THREE.MeshPhysicalMaterial({ color: 0x0a1834, roughness: 0.72, metalness: 0.1, clearcoat: 0, clearcoatRoughness: 0.6, specularIntensity: 0.25, emissive: 0x2e68a8, emissiveIntensity: 0 }), { eNight: '0.55', eDay: '1.25', tw: '0.05', lNight: '0.8' })
        : dayNight(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 }), { eNight: '1.6', eDay: '0.0', tw: '0.04', lNight: '0.24' });
      spinG.add(new THREE.Mesh(new THREE.SphereGeometry(1, 384, 256), globeMat));
      const loadImg = (f) => new Promise((r) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => r(im); im.onerror = () => r(null); im.src = res(f); });
      const pixels = (img, W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H); return { c, g, d: g.getImageData(0, 0, W, H).data }; };
      const cities = [];

      if (mode === 'real') {
        const loader = new THREE.TextureLoader();
        const lt = (f, srgb) => new Promise((r) => loader.load(res(f), (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); r(t); }, undefined, () => r(null)));
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 256, 192), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.85, depthWrite: false, roughness: 1 })); spinG.add(clouds); this._clouds = clouds;
        lt('earth_atmos_2048.jpg', true).then((t) => { if (t) { globeMat.map = t; globeMat.needsUpdate = true; } });
        lt('earth_normal_2048.jpg').then((t) => { if (t) { globeMat.normalMap = t; globeMat.normalScale.set(0.55, 0.55); globeMat.needsUpdate = true; } });
        lt('earth_lights_2048.png', true).then((t) => { if (t) { globeMat.emissiveMap = t; globeMat.emissive.set(0xffd9a0); globeMat.emissiveIntensity = 0.6; globeMat.needsUpdate = true; } });
        lt('earth_clouds_1024.png', true).then((t) => { if (t) { clouds.material.map = t; clouds.material.needsUpdate = true; } else clouds.visible = false; });
      }
      // point-cloud continents — land mask from the specular map (2048), city brightness from night lights; gold cities on the night side
      Promise.all([loadImg('earth_specular_2048.jpg'), loadImg('earth_lights_2048.png')]).then(([spec, lights]) => {
        if (!spec || gen !== this._gen) return;
        const W = 2048, H = 1024;
        let S, L = null;
        try { S = pixels(spec, W, H); if (lights) L = pixels(lights, W, H).d; } catch (e) { return; }
        const land = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) land[i] = 255 - S.d[i * 4];
        if (mode === 'holo') {
          const img = S.g.createImageData(W, H);
          for (let i = 0; i < W * H; i++) { const v = land[i] > 120 ? 255 : 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
          S.g.putImageData(img, 0, 0); S.g.filter = 'blur(2px)'; S.g.drawImage(S.c, 0, 0);
          const t = new THREE.CanvasTexture(S.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
          globeMat.emissiveMap = t; globeMat.emissiveIntensity = 0.42; globeMat.needsUpdate = true;
        }
        const N = mode === 'holo' ? 90000 : 40000, ga = Math.PI * (3 - Math.sqrt(5));
        const pos = [], br = [], rn = [];
        for (let i = 0; i < N; i++) {
          const y = 1 - 2 * (i + 0.5) / N, th = Math.acos(y), ph = (i * ga) % TAU;
          const px = Math.min(W - 1, (ph / TAU * W) | 0), py = Math.min(H - 1, (th / Math.PI * H) | 0), k = py * W + px;
          if (land[k] < 140) continue;
          const s = Math.sin(th), r = 1.004;
          pos.push(-Math.cos(ph) * s * r, y * r, Math.sin(ph) * s * r);
          const b = L ? Math.min(1, (L[k * 4] / 255) * 1.8) : 0;
          br.push(b); rn.push(Math.random());
          if (b > 0.75 && Math.random() < 0.12) cities.push(new V3(-Math.cos(ph) * s, y, Math.sin(ph) * s));
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('aB', new THREE.Float32BufferAttribute(br, 1));
        g.setAttribute('aR', new THREE.Float32BufferAttribute(rn, 1));
        const mat = additive(new THREE.ShaderMaterial({
          uniforms: { uSize: U.size, uScan: U.scan, uTime: U.time, uReveal: U.reveal, uSun: U.sun, uGain: { value: mode === 'holo' ? 1 : 0.35 }, uC1: { value: new THREE.Color(0x7fb8f0) }, uC2: { value: new THREE.Color(0xf2fbff) }, uGold: { value: new THREE.Color(0xffb866) } },
          vertexShader: `attribute float aB; attribute float aR; uniform float uSize, uScan, uTime, uReveal; uniform vec3 uSun; varying float vA, vB, vS, vDay, vTw;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix) * position); float f = dot(n, normalize(cameraPosition - wp.xyz));
 float ry = 1.15 - uReveal * 2.4; vA = smoothstep(-0.02, 0.4, f) * smoothstep(ry - 0.04, ry + 0.04, wp.y);
 float d = wp.y - uScan; vS = exp(-d * d * 60.0) + exp(-pow((wp.y - ry) * 14.0, 2.0)) * step(uReveal, 0.999);
 vB = aB * (1.0 + 0.25 * sin(uTime * 2.3 + aR * 40.0));
 float sf = dot(n, uSun); vDay = smoothstep(-0.12, 0.2, sf); vTw = exp(-sf * sf * 70.0);
 gl_PointSize = uSize * (0.8 + 0.35 * aB + 0.8 * aB * (1.0 - vDay) + vS * 0.9) * (0.55 + 0.45 * f); gl_Position = projectionMatrix * viewMatrix * wp; }`,
          fragmentShader: `uniform vec3 uC1, uC2, uGold; uniform float uGain; varying float vA, vB, vS, vDay, vTw;
void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.06, d);
 vec3 dayC = mix(uC1, uC2, clamp(vB + vS, 0.0, 1.0)) * (0.5 + vB * 1.4 + vS * 1.8);
 vec3 nightC = vec3(0.16, 0.3, 0.6) * 0.5 + uGold * vB * 2.6 + uC2 * vS * 1.8;
 vec3 col = (mix(nightC, dayC, vDay) + vec3(1.0, 0.62, 0.32) * vTw * (0.35 + vB)) * uGain;
 gl_FragColor = vec4(col, a * vA); }`,
        }));
        spinG.add(new THREE.Points(g, mat));
      });
      // lat / long grid
      (() => {
        const p = [], R = 1.006, seg = 160;
        const ll = (lat, lon) => { const th = deg(90 - lat), ph = deg(lon + 180); return [-Math.cos(ph) * Math.sin(th) * R, Math.cos(th) * R, Math.sin(ph) * Math.sin(th) * R]; };
        for (const lat of [-60, -30, 0, 30, 60]) for (let i = 0; i < seg; i++) p.push(...ll(lat, i / seg * 360), ...ll(lat, (i + 1) / seg * 360));
        for (let lon = 0; lon < 360; lon += 30) for (let i = 0; i < seg / 2; i++) p.push(...ll(-84 + i / (seg / 2) * 168, lon), ...ll(-84 + (i + 1) / (seg / 2) * 168, lon));
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        spinG.add(new THREE.LineSegments(g, additive(new THREE.LineBasicMaterial({ color: 0x5aa2ff, opacity: mode === 'holo' ? 0.2 : 0.1 }))));
      })();
      // atmosphere — brighter, whiter limb on the sun side, warm twilight band
      const atmoVert = 'varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vW = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * mv; }';
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.12, 128, 96), additive(new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { uC: { value: new THREE.Color(0x3a86ff) }, uSun: U.sun }, vertexShader: atmoVert,
        fragmentShader: 'uniform vec3 uC, uSun; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ float d = max(-dot(vN, vV), 0.0); float a = pow(smoothstep(0.0, 0.5, d), 1.7); float s = max(dot(vW, uSun), 0.0); vec3 c = mix(uC, vec3(0.78, 0.9, 1.0), s * s * 0.6) * (0.55 + 0.45 * s * s); gl_FragColor = vec4(c * a * 1.05, 1.0); }' }))));
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.02, 128, 96), additive(new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(0x7cc4ff) }, uSun: U.sun }, vertexShader: atmoVert,
        fragmentShader: 'uniform vec3 uC, uSun; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ float f = 1.0 - max(dot(vN, vV), 0.0); float s = dot(vW, uSun); float day = smoothstep(-0.3, 0.45, s); gl_FragColor = vec4(uC * pow(f, 3.2) * (0.3 + 1.0 * day) + vec3(1.0, 0.62, 0.35) * pow(f, 2.0) * exp(-s * s * 25.0) * 0.22, 1.0); }' }))));
      // scanning latitude ring
      const scanRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.004, 6, 256), additive(new THREE.MeshBasicMaterial({ color: 0xbfe8ff, opacity: 0 })));
      scanRing.rotation.x = Math.PI / 2; scene.add(scanRing);

      // Israel ground station + pulses
      const nI = (() => { const ph = (35 + 180) / 360 * TAU, th = (90 - 31.5) / 180 * Math.PI; return new V3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)); })();
      const station = new THREE.Group(); station.position.copy(nI).multiplyScalar(1.01); station.quaternion.setFromUnitVectors(new V3(0, 0, 1), nI); spinG.add(station);
      const stGlow = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0xaee6ff, 0.9) }))); stGlow.scale.setScalar(0.09); station.add(stGlow);
      const pulseGeo = new THREE.RingGeometry(0.86, 1, 64);
      const pulses = [0, 1, 2].map(() => { const m = new THREE.Mesh(pulseGeo, additive(new THREE.MeshBasicMaterial({ color: 0x8fd8ff, opacity: 0, side: THREE.DoubleSide }))); station.add(m); return m; });

      // hex shield — faint lattice on the limb, plus a ripple that expands from Israel every ~15 s
      const shield = false ? (() => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.055, 160, 120), additive(new THREE.ShaderMaterial({
          uniforms: { uR: { value: 9 }, uK: { value: 0 }, uO: { value: nI.clone() } },
          vertexShader: 'varying vec3 vL; varying vec3 vN; varying vec3 vV; void main(){ vL = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
          fragmentShader: `uniform float uR, uK; uniform vec3 uO; varying vec3 vL; varying vec3 vN; varying vec3 vV;
float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
void main(){ vec3 n = normalize(vL); float lat = asin(clamp(n.y, -1.0, 1.0)), lon = (abs(n.x) + abs(n.z) < 1e-4) ? 0.0 : atan(n.x, n.z);
 vec2 uv = vec2(lon * 11.140846, lat * 12.5);
 vec2 r = vec2(1.0, 1.7320508), hh = r * 0.5; vec2 a = mod(uv, r) - hh, b = mod(uv - hh, r) - hh; vec2 gv = dot(a, a) < dot(b, b) ? a : b; vec2 id = uv - gv;
 float e = 0.5 - hexDist(gv); float fw = fwidth(e) * 1.3 + 1e-4; float edge = 1.0 - smoothstep(0.012, 0.012 + fw, e);
 float ang = acos(clamp(dot(n, uO), -1.0, 1.0));
 float wave = exp(-pow((ang - uR) * 7.0, 2.0)), inner = smoothstep(uR + 0.05, 0.0, ang) * 0.22;
 float cr = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453), cell = step(0.72, cr) * wave * 0.35;
 float pole = 1.0 - smoothstep(1.0, 1.3, abs(lat)), fr = pow(1.0 - abs(dot(vN, vV)), 3.0);
 vec3 col = vec3(0.35, 0.78, 1.0) * ((edge * (wave * 1.8 + inner) + cell) * uK + edge * fr * 0.1) * pole;
 gl_FragColor = vec4(col, 1.0); }`,
        })));
        spinG.add(m); return m;
      })() : null;

      // LEO traffic — thousands of objects on inertial orbits (Starlink-like 53°, sun-synchronous 97.5°, equatorial, random); glints, Earth shadow
      if (FULL) {
        const N = 4200, aO = new Float32Array(N * 4), aM = new Float32Array(N * 2);
        for (let i = 0; i < N; i++) {
          const q = Math.random(), inc = q < 0.42 ? deg(53 + (Math.random() - 0.5) * 4) : q < 0.66 ? deg(97.5 + (Math.random() - 0.5) * 3) : q < 0.8 ? deg(Math.random() * 12) : Math.acos(1 - 2 * Math.random());
          const r = 1.035 + Math.pow(Math.random(), 2.2) * 0.17;
          aO.set([r, inc, Math.random() * TAU, Math.random() * TAU], i * 4);
          aM.set([(Math.random() < 0.06 ? -1 : 1) * 0.15 * Math.pow(1.035 / r, 1.5) * (0.9 + Math.random() * 0.2), (Math.random() < 0.06 ? 1 : 0) + Math.random() * 0.999], i * 2);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
        g.setAttribute('aOrb', new THREE.BufferAttribute(aO, 4)); g.setAttribute('aMisc', new THREE.BufferAttribute(aM, 2));
        const swarm = new THREE.Points(g, additive(new THREE.ShaderMaterial({ uniforms: { uT: U.time, uSize: U.size, uReveal: U.reveal, uSun: U.sun },
          vertexShader: `attribute vec4 aOrb; attribute vec2 aMisc; uniform float uT, uSize, uReveal; uniform vec3 uSun; varying float vBr;
void main(){ float an = aOrb.w + uT * aMisc.x; vec3 p = vec3(cos(an), 0.0, sin(an)) * aOrb.x;
 float ci = cos(aOrb.y), si = sin(aOrb.y); p = vec3(p.x, -p.z * si, p.z * ci);
 float cr = cos(aOrb.z), sr = sin(aOrb.z); p = vec3(p.x * cr + p.z * sr, p.y, -p.x * sr + p.z * cr);
 vec4 wp = modelMatrix * vec4(p, 1.0); vec3 n = normalize(wp.xyz);
 float bright = step(1.0, aMisc.y), ph = fract(aMisc.y), lit = smoothstep(-0.3, 0.05, dot(n, uSun));
 float gli = bright * pow(max(sin(uT * 0.8 + ph * 40.0), 0.0), 30.0);
 float f = abs(dot(n, normalize(cameraPosition - wp.xyz)));
 vBr = (0.1 + 0.14 * ph + gli * 1.2) * mix(0.25, 1.0, lit) * (0.5 + 0.5 * (1.0 - f)) * uReveal;
 gl_PointSize = uSize * (0.5 + gli * 1.1); gl_Position = projectionMatrix * viewMatrix * wp; }`,
          fragmentShader: 'varying float vBr; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(0.62, 0.82, 1.0) * vBr, smoothstep(0.5, 0.0, d)); }' })));
        swarm.frustumCulled = false; globeG.add(swarm);
      }

      // sun peeking over the left limb (behind the globe — the globe's depth occludes it)
      let sun = null;
      if (false) {
        const c0 = hdr(0xfff1dc, 7);
        const core = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: c0.clone() }))); core.position.set(-1.125, 0.579, -3); core.scale.setScalar(0.2); scene.add(core);
        const haze = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0x9cc8ff, 0.6), opacity: 0.55 }))); haze.position.copy(core.position); haze.scale.setScalar(1.1); scene.add(haze);
        sun = { core, haze, c0 };
      }

      // ---------- HUD behind the globe ----------
      const HZ = -1.4;
      const hud = new THREE.Group(); hud.position.set(0, 0, HZ); hud.scale.setScalar((D - HZ) / D); scene.add(hud);
      const ringMesh = (r0, r1, a0 = 0, len = TAU, op = 0.3) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 256, 1, a0, len), M.hud.clone()); m.material.opacity = op; return m; };
      hud.add(ringMesh(1.15, 1.156, 0, TAU, 0.16));
      const ticks = (() => { const p = []; for (let i = 0; i < 180; i++) { const a = i / 180 * TAU, r1 = i % 15 === 0 ? 1.255 : i % 5 === 0 ? 1.23 : 1.215; p.push(Math.cos(a) * 1.19, Math.sin(a) * 1.19, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return new THREE.LineSegments(g, additive(new THREE.LineBasicMaterial({ color: 0x7fc0ff, opacity: 0.14 }))); })();
      hud.add(ticks);
      const arcs = new THREE.Group(); [[0.2, 0.9], [1.5, 0.35], [2.3, 1.2], [4.1, 0.6], [5.0, 0.8]].forEach(([a, l]) => arcs.add(ringMesh(1.29, 1.3, a, l, 0.45))); arcs.visible = false; hud.add(arcs);
      const radar = new THREE.Mesh(new THREE.CircleGeometry(1.34, 160), additive(new THREE.ShaderMaterial({ uniforms: { uAng: { value: 0 } }, vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uAng; varying vec2 vP; void main(){ float r = length(vP); float a = atan(vP.y, vP.x); float d = mod(uAng - a, 6.28318); float trail = exp(-d * 2.6) + 0.9 * exp(-d * 60.0); float band = smoothstep(1.0, 1.1, r) * (1.0 - smoothstep(1.26, 1.34, r)); gl_FragColor = vec4(vec3(0.3, 0.62, 1.0) * trail * band * 0.5, 1.0); }' })));
      radar.visible = false; hud.add(radar);
      let textRing = null;
      (async () => {
        try { await Promise.race([document.fonts.load("500 30px 'IBM Plex Mono'"), new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
        if (gen !== this._gen) return;
        const S = 2048, R0 = 1.44, ppu = S / (2 * R0), rr = 1.372 * ppu;
        const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
        g.translate(S / 2, S / 2); g.font = "500 30px 'IBM Plex Mono', monospace"; g.fillStyle = '#c4defa'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const phrase = 'STATE OF ISRAEL  ·  SPACE PROGRAM OFFICE  ·  ORBITAL PICTURE  ·  SPACE DOMAIN AWARENESS  ·  LEO  ·  MEO  ·  GEO  ·  ';
        const circ = TAU * rr; let txt = phrase; while (g.measureText(txt + phrase).width < circ * 0.97) txt += phrase;
        const k = circ / g.measureText(txt).width; let acc = 0;
        for (const ch of txt) { const cw = g.measureText(ch).width * k; g.save(); g.rotate((acc + cw / 2) / rr); g.translate(0, -rr); g.fillText(ch, 0, 0); g.restore(); acc += cw; }
        g.strokeStyle = '#a0cdff'; g.lineWidth = 3;
        for (let i = 0; i < 120; i++) { const a0 = i / 120 * TAU; g.beginPath(); g.arc(0, 0, 1.405 * ppu, a0, a0 + TAU / 120 * 0.55); g.stroke(); }
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        textRing = new THREE.Mesh(new THREE.PlaneGeometry(2 * R0, 2 * R0), additive(new THREE.MeshBasicMaterial({ map: tex, color: 0x9cc8ff, opacity: 0.14 })));
        hud.add(textRing);
      })();

      const KC = { cfg: () => ({ traffic: this.getAttribute('traffic') !== 'off', rate: this.getAttribute('launch-rate') || 'normal', maxSats: Number(this.getAttribute('max-sats')) || 24, stack: Number(this.getAttribute('stack-size')) || 8 }), THREE, V3, MU, TAU, deg, scene, spinG, globeG, camera, U, SUN, hdr, additive, glowTex, flareTex, canvasTex, renderer, FULL, mode, res, D, globeMat, nI, station, cssH: () => cssH() - PADT, half: () => camHalf, isAlive: () => gen === this._gen, flyOnly: true, flyOut: true };
      // ---------- Orbits — fitted to the logo pixels: centre 0.11R above the globe centre, a = 1.45R, b/a ≈ 0.19, tilt ±30°, LOWER edge passes in front ----------
      // Motion: circular orbits → constant angular speed; one shared period; ring B mirrors ring A a quarter-period later (no collisions at the crossings).
      const ORB = { cy: 0.11, r: 1.45, open: -79, tube: 0.0075, trailArc: 0.85, period: 48 };
      const W0 = TAU / ORB.period, PHI0 = deg(25);
      const RINGS = [{ tilt: -30, dir: 1, phase: PHI0 }, { tilt: 30, dir: -1, phase: Math.PI / 2 - PHI0 }];
      const foilTex = canvasTex(256, (g, s) => { g.fillStyle = '#b8862e'; g.fillRect(0, 0, s, s); for (let i = 0; i < 520; i++) { const x = Math.random() * s, y = Math.random() * s, r = 5 + Math.random() * 20; g.fillStyle = `hsl(${36 + Math.random() * 12},${55 + Math.random() * 30}%,${34 + Math.random() * 38}%)`; g.beginPath(); g.moveTo(x, y); for (let q = 0; q < 3; q++) g.lineTo(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 2); g.closePath(); g.fill(); } });
      const panelTex = canvasTex(512, (g, s) => {
        const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#1d3378'); gr.addColorStop(0.5, '#0d1b4a'); gr.addColorStop(1, '#183372'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
        const nx = 12, ny = 5, cw = s / nx, chh = s / ny;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { g.fillStyle = `rgba(${50 + Math.random() * 30},${80 + Math.random() * 40},${170 + Math.random() * 60},0.28)`; g.fillRect(i * cw + 4, j * chh + 4, cw - 8, chh - 8); }
        g.strokeStyle = 'rgba(180,205,240,0.5)'; g.lineWidth = 2;
        for (let i = 1; i < nx; i++) { g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, s); g.stroke(); }
        for (let j = 1; j < ny; j++) { g.beginPath(); g.moveTo(0, j * chh); g.lineTo(s, j * chh); g.stroke(); }
        g.strokeStyle = 'rgba(228,234,246,0.95)'; g.lineWidth = 12; g.strokeRect(0, 0, s, s);
      });
      const SM = {
        panel: new THREE.MeshPhysicalMaterial({ map: panelTex, color: 0xffffff, metalness: 0.6, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x0b1c4a, emissiveIntensity: 0.5, iridescence: 0.6, iridescenceIOR: 1.6 }),
        gold: new THREE.MeshStandardMaterial({ map: foilTex, bumpMap: foilTex, bumpScale: 0.8, color: 0xffffff, metalness: 1, roughness: 0.32, emissive: 0x3a2508, emissiveIntensity: 0.35 }),
        silver: new THREE.MeshStandardMaterial({ color: 0xe3e8f0, metalness: 1, roughness: 0.2, side: THREE.DoubleSide }),
        dish: new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide }),
        dark: new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.9, roughness: 0.4, side: THREE.DoubleSide }),
      };
      // body frame: X = orbit normal (array boom), Y = velocity, Z = radial out
      const makeSat = KIT.satFactory(KC);
      const SAT_SCALE = 1.3, sunW = new V3(-6, 5, 7).normalize(), basis = new THREE.Matrix4(), tX = new V3(), tY = new V3(), tZ = new V3(), tQ = new THREE.Quaternion();
      const makeTrail = (reverse) => { const seg = 64; const geo = new THREE.TorusGeometry(ORB.r, 0.011, 6, seg, ORB.trailArc); const n = geo.attributes.position.count; const col = new Float32Array(n * 3); for (let v = 0; v < n; v++) { let k = (v % (seg + 1)) / seg; if (reverse) k = 1 - k; col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = Math.pow(k, 2.4); } geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return new THREE.Mesh(geo, additive(new THREE.MeshBasicMaterial({ color: hdr(0xa6dcff, 1.3), vertexColors: true, opacity: 0.9 }))); };
      const flowMat = (dir) => additive(new THREE.ShaderMaterial({ uniforms: { uT: U.time, uDir: { value: dir } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uT, uDir; varying vec2 vUv; void main(){ float f = fract(vUv.x * 240.0 - uT * 2.0 * uDir); float dash = smoothstep(0.0, 0.15, f) * (1.0 - smoothstep(0.3, 0.45, f)); float pk = pow(max(cos((vUv.x * 2.0 - uT * 0.05 * uDir) * 6.28318), 0.0), 80.0); gl_FragColor = vec4(vec3(0.5, 0.8, 1.0) * (dash * 0.12 + pk * (0.5 + dash * 2.5)), 1.0); }' }));
      const orbits = [];
      for (const r of RINGS) {
        const pivot = new THREE.Group(); pivot.position.y = ORB.cy;
        pivot.quaternion.setFromAxisAngle(new V3(0, 0, 1), deg(r.tilt)).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), deg(ORB.open)));
        pivot.add(new THREE.Mesh(new THREE.TorusGeometry(ORB.r, ORB.tube, 16, 720), M.ring));
        pivot.add(new THREE.Mesh(new THREE.TorusGeometry(ORB.r, 0.03, 8, 360), M.ringGlow));
        pivot.add(new THREE.Mesh(new THREE.TorusGeometry(ORB.r, 0.0105, 6, 720), flowMat(r.dir)));
        const sats = [0, 1].map((k) => {
          const s = makeSat(); pivot.add(s.g);
          const trail = makeTrail(r.dir < 0); pivot.add(trail);
          return Object.assign(s, { k, trail, seed: Math.random() * 10 });
        });
        scene.add(pivot); orbits.push({ r, pivot, sats });
      }
      const allSats = orbits.flatMap((o) => o.sats);
      // inter-satellite crosslinks (appear when satellites on different rings pass near each other)
      const xlinks = [];
      for (const a of orbits[0].sats) for (const b of orbits[1].sats) { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); const ln = new THREE.Line(gg, additive(new THREE.LineBasicMaterial({ color: hdr(0x9fe6ff, 1.5), opacity: 0 }))); scene.add(ln); xlinks.push({ a, b, ln, seed: Math.random() * 10 }); }
      // ground-station → satellite link
      const beamGeo = new THREE.BufferGeometry(); beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const beam = new THREE.Line(beamGeo, additive(new THREE.LineBasicMaterial({ color: hdr(0xa6e2ff, 1.6), opacity: 0 }))); scene.add(beam);
      const packet = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0xdff4ff, 3), opacity: 0 }))); packet.scale.setScalar(0.06); scene.add(packet);
      let link = null, linkOp = 0, linkLast = null, nextLink = 0; const stN = new V3(), gCW = new V3();

      // ---------- Rocket (logo coordinates, R = 1) ----------
      const ZR = 1.85, sR = persp(ZR);
      const rocket = new THREE.Group(); rocket.position.set(0, YC * (1 - sR), ZR); rocket.scale.setScalar(sR); scene.add(rocket);
      const hd = 0.17;
      const A = [0, 1.26, 0], T = [0, -1.172, 0], Lw = [-0.28, -0.6, 0], Rw = [0.28, -0.6, 0], Fw = [0, -0.6, hd], Bw = [0, -0.6, -hd];
      const facetGeo = (tris, center) => {
        const p = [];
        for (const [a, b, c] of tris) {
          const va = new V3(...a), vb = new V3(...b), vc = new V3(...c);
          const n = new V3().subVectors(vb, va).cross(new V3().subVectors(vc, va));
          const cen = va.clone().add(vb).add(vc).divideScalar(3); const ctr = center(cen);
          if (n.dot(cen.sub(ctr)) < 0) p.push(...a, ...c, ...b); else p.push(...a, ...b, ...c);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
      };
      const axis = (c) => new V3(0, c.y, 0);
      rocket.add(new THREE.Mesh(facetGeo([[A, Lw, Fw], [A, Bw, Lw], [T, Lw, Fw], [T, Bw, Lw]], axis), M.navy));
      rocket.add(new THREE.Mesh(facetGeo([[A, Fw, Rw], [A, Rw, Bw], [T, Fw, Rw], [T, Rw, Bw]], axis), M.sky));
      const finPts = (sx) => [[0.28 * sx, -0.6, 0], [0.862 * sx, -1.16, 0], [0.12 * sx, -0.932, 0]];
      const fin = (sx, mat) => {
        const [P1, P2, P3] = finPts(sx);
        const cx = (P1[0] + P2[0] + P3[0]) / 3, cy = (P1[1] + P2[1] + P3[1]) / 3, Mf = [cx, cy, 0.05], Mb = [cx, cy, -0.05];
        const ctr = () => new V3(cx, cy, 0);
        return new THREE.Mesh(facetGeo([[P1, P2, Mf], [P2, P3, Mf], [P3, P1, Mf], [P1, P2, Mb], [P2, P3, Mb], [P3, P1, Mb]], ctr), mat);
      };
      rocket.add(fin(-1, M.sky), fin(1, M.navy));
      rocket.children.forEach((o) => { if (!o.isMesh) return; o.renderOrder = -100; const m = o.material; m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.AlwaysStencilFunc; m.stencilZPass = THREE.ReplaceStencilOp; });
      // energy edges: a pulse runs from the nose down every ridge and branches into the fins (s = path length / 2.5)
      const edgeMat = (s0, s1, base) => additive(new THREE.ShaderMaterial({ uniforms: { uT: U.time, uS0: { value: s0 }, uS1: { value: s1 }, uOp: { value: base }, uC: { value: new THREE.Color(0xdff3ff) } },
        vertexShader: 'uniform float uS0, uS1; varying float vS; void main(){ vS = mix(uS0, uS1, uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uT, uOp; uniform vec3 uC; varying float vS; void main(){ float ph = mod(uT + 3.0, 7.0) / 1.7; float hd = ph * 1.6 - 0.1; float p = (exp(-pow((vS - hd) * 18.0, 2.0)) + 0.4 * exp(-pow((vS - hd) * 5.0, 2.0)) * step(vS, hd)) * step(ph, 1.0); gl_FragColor = vec4(uC * (uOp + p * 3.2), 1.0); }' }));
      const chain = (pts, rad, base, s0 = 0) => { let s = s0; for (let i = 0; i < pts.length - 1; i++) { const a = new V3(...pts[i]), b = new V3(...pts[i + 1]), L = a.distanceTo(b), s1 = s + L / 2.5; const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, L, 8, 1, true), edgeMat(s, s1, base[i] ?? base[0])); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize()); rocket.add(m); s = s1; } return s; };
      chain([[0, 1.26, 0.002], [0, -0.6, hd + 0.003], [0, -1.172, 0.002]], 0.0034, [0.75, 0.6]);
      const sL = Math.hypot(0.28, 1.86) / 2.5;
      chain([A, Lw, T], 0.0024, [0.25, 0.16]); chain([A, Rw, T], 0.0024, [0.4, 0.2]);
      chain(finPts(-1), 0.002, [0.18, 0.12], sL); chain(finPts(1), 0.002, [0.22, 0.14], sL);
      const glint = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: flareTex, color: hdr(0xeaf6ff, 2.2), opacity: 0.2 }))); glint.position.set(0, 1.265, 0.02); glint.scale.setScalar(0.3); rocket.add(glint);

      // ---------- Wordmark: condensed ExtraBold (Open Sans Hebrew Condensed), traced at 360px, fitted to the logo's box ----------
      const ZW = 0.9, sW = persp(ZW);
      const wordG = new THREE.Group(); wordG.position.set(0, YC * (1 - sW), ZW); wordG.scale.setScalar(sW); scene.add(wordG);
      const wordmark = async (text, BW, BH) => {
        const fam = "'Open Sans'", spec = '800 condensed 360px ' + fam;
        try { await Promise.race([document.fonts.load(spec, text), new Promise((r) => setTimeout(r, 3000))]); } catch (e) {}
        const c = document.createElement('canvas'); const g = c.getContext('2d', { willReadFrequently: true });
        const setFont = () => { g.font = spec + ", 'Arial Narrow', Arial, sans-serif"; try { g.fontStretch = 'condensed'; } catch (e) {} g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle'; };
        setFont(); const inkW = g.measureText(text).width;
        const cw = Math.ceil(inkW) + 140, ch = 560; c.width = cw; c.height = ch;
        g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); setFont(); g.fillStyle = '#000'; g.fillText(text, cw / 2, ch / 2);
        const dd = g.getImageData(0, 0, cw, ch).data;
        const ink = (x, y) => (x < 0 || y < 0 || x >= cw || y >= ch) ? 0 : 1 - dd[(y * cw + x) * 4] / 255;
        const pt = {}; const adj = new Map();
        const lerp = (x0, y0, x1, y1) => { const a = ink(x0, y0), b = ink(x1, y1); const t = Math.min(1, Math.max(0, (0.5 - a) / ((b - a) || 1e-9))); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; };
        const lnk = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
        const TABLE = { 1: [['L', 'B']], 2: [['B', 'R']], 3: [['L', 'R']], 4: [['T', 'R']], 5: [['L', 'T'], ['B', 'R']], 6: [['T', 'B']], 7: [['L', 'T']], 8: [['T', 'L']], 9: [['T', 'B']], 10: [['T', 'R'], ['B', 'L']], 11: [['T', 'R']], 12: [['L', 'R']], 13: [['B', 'R']], 14: [['L', 'B']] };
        for (let y = -1; y < ch; y++) for (let x = -1; x < cw; x++) {
          const idx = (ink(x, y) >= 0.5 ? 8 : 0) | (ink(x + 1, y) >= 0.5 ? 4 : 0) | (ink(x + 1, y + 1) >= 0.5 ? 2 : 0) | (ink(x, y + 1) >= 0.5 ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const E = { T: 'h' + x + ',' + y, B: 'h' + x + ',' + (y + 1), L: 'v' + x + ',' + y, R: 'v' + (x + 1) + ',' + y };
          pt[E.T] ??= lerp(x, y, x + 1, y); pt[E.B] ??= lerp(x, y + 1, x + 1, y + 1); pt[E.L] ??= lerp(x, y, x, y + 1); pt[E.R] ??= lerp(x + 1, y, x + 1, y + 1);
          for (const [a, b] of TABLE[idx]) lnk(E[a], E[b]);
        }
        const seen = new Set(); const loops = [];
        for (const start of adj.keys()) { if (seen.has(start)) continue; const loop = []; let prev = null, cur = start; for (let guard = 0; guard < 4e6; guard++) { seen.add(cur); loop.push(pt[cur]); const nb = adj.get(cur); const next = nb[0] === prev ? nb[1] : nb[0]; if (next === undefined || next === start) break; prev = cur; cur = next; } if (loop.length > 20) loops.push(loop); }
        const dp = (p, eps) => { if (p.length < 3) return p; const [ax, ay] = p[0], [bx, by] = p[p.length - 1]; const Ln = Math.hypot(bx - ax, by - ay) || 1e-9; let md = 0, mi = 0; for (let i = 1; i < p.length - 1; i++) { const q = Math.abs((bx - ax) * (ay - p[i][1]) - (ax - p[i][0]) * (by - ay)) / Ln; if (q > md) { md = q; mi = i; } } return md > eps ? dp(p.slice(0, mi + 1), eps).slice(0, -1).concat(dp(p.slice(mi), eps)) : [p[0], p[p.length - 1]]; };
        const simp = loops.map((loop) => { let far = 0, fd = 0; for (let i = 1; i < loop.length; i++) { const q = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]); if (q > fd) { fd = q; far = i; } } return dp(loop.slice(0, far + 1), 0.45).slice(0, -1).concat(dp(loop.slice(far).concat([loop[0]]), 0.45).slice(0, -1)); });
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const l of simp) for (const [x, y] of l) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const kx = BW / (x1 - x0), ky = BH / (y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const polys = simp.map((l) => l.map(([x, y]) => [(x - mx) * kx, -(y - my) * ky]));
        const inside = (q, poly) => { let c2 = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > q[1]) !== (yj > q[1]) && q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi) c2 = !c2; } return c2; };
        const area = (p) => Math.abs(p.reduce((a, [x, y], i) => { const [nx, ny] = p[(i + 1) % p.length]; return a + x * ny - nx * y; }, 0) / 2);
        const nest = polys.map((p, i) => polys.filter((q, j) => j !== i && inside(p[0], q)).length);
        const outers = polys.map((p, i) => nest[i] % 2 === 0 ? { p, shape: new THREE.Shape(p.map(([x, y]) => new THREE.Vector2(x, y))) } : null).filter(Boolean);
        polys.forEach((p, i) => { if (nest[i] % 2 === 0) return; let best = null; for (const o of outers) if (inside(p[0], o.p) && (!best || area(o.p) < area(best.p))) best = o; if (best) best.shape.holes.push(new THREE.Path(p.map(([x, y]) => new THREE.Vector2(x, y)))); });
        const geo = new THREE.ExtrudeGeometry(outers.map((o) => o.shape), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.0042, bevelSegments: 4 });
        geo.translate(0, 0, -0.035);
        return new THREE.Mesh(geo, [M.typeFront, M.typeSide]);
      };
      wordmark(this.getAttribute('word') || 'מנהלת החלל', 1.66, 0.27).then((m) => { if (gen !== this._gen) return; m.position.set(0, -1.508, 0); m.rotation.x = deg(-6); wordG.add(m); }).catch((e) => console.warn('wordmark', e));

      // ---------- Random events: city-to-city data arcs, target-lock reticles, uplink beams ----------
      const arcFx = [], upFx = []; let nextArc = 2.5, lock = null, nextLock = 6, nextUp = 4;
      const RSEG = 64, RRAD = 5;
      const tmpC = new V3();
      const pickVisible = (minZ) => { for (let i = 0; i < 30; i++) { const p = cities[(Math.random() * cities.length) | 0]; if (spinG.localToWorld(tmpC.copy(p)).z > minZ) return p; } return null; };
      const spawnArc = () => {
        for (let tries = 0; tries < 25; tries++) {
          const p1 = pickVisible(0.35), p2 = pickVisible(0.3); if (!p1 || !p2) return;
          const ang = p1.angleTo(p2); if (ang < 0.3 || ang > 1.2) continue;
          const mid = p1.clone().add(p2).normalize().multiplyScalar(1.1 + ang * 0.2);
          const curve = new THREE.QuadraticBezierCurve3(p1.clone().multiplyScalar(1.004), mid, p2.clone().multiplyScalar(1.004));
          const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, RSEG, 0.003, RRAD, false), additive(new THREE.MeshBasicMaterial({ color: hdr(0x9fdcff, 1.4), opacity: 0.9 })));
          mesh.geometry.setDrawRange(0, 0); spinG.add(mesh);
          const head = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0xeaf8ff, 3) }))); head.scale.setScalar(0.06); spinG.add(head);
          arcFx.push({ mesh, head, curve, t0: t }); return;
        }
      };
      const labelTex = (txt) => { const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d'); g.font = "500 30px 'IBM Plex Mono', monospace"; g.fillStyle = 'rgba(190,228,255,0.95)'; g.textBaseline = 'middle'; g.fillText(txt, 6, 34); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; };
      const bracketGeo = (() => { const p = [], s = 0.045, l = 0.018; for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) p.push(sx * s, sy * s, 0, sx * (s - l), sy * s, 0, sx * s, sy * s, 0, sx * s, sy * (s - l), 0); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g; })();
      const spawnLock = () => {
        const p = pickVisible(0.5); if (!p) return;
        const n = p.clone().normalize(), grp = new THREE.Group(); grp.position.copy(n).multiplyScalar(1.012); grp.quaternion.setFromUnitVectors(new V3(0, 0, 1), n); spinG.add(grp);
        const br = new THREE.LineSegments(bracketGeo, additive(new THREE.LineBasicMaterial({ color: hdr(0xbfe8ff, 1.4), opacity: 0 }))); grp.add(br);
        const dot = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0xffffff, 2), opacity: 0 }))); dot.scale.setScalar(0.04); grp.add(dot);
        const lat = 90 - Math.acos(n.y) * 180 / Math.PI; let lon = Math.atan2(n.z, -n.x) / TAU * 360; if (lon < 0) lon += 360; lon -= 180;
        const id = 'TRK-' + String(100 + ((Math.random() * 900) | 0));
        const txt = id + '  ' + Math.abs(lat).toFixed(2) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' + String(Math.abs(lon).toFixed(2)).padStart(6, '0') + '°' + (lon >= 0 ? 'E' : 'W');
        const label = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: labelTex(txt), opacity: 0 }))); label.center.set(0, 0.5); label.scale.set(0.4, 0.05, 1); label.position.set(0.06, 0.055, 0); grp.add(label);
        lock = { grp, br, dot, label, t0: t };
      };
      const upGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 1, 8, 1, true); upGeo.translate(0, 0.5, 0);
      const upRingGeo = new THREE.RingGeometry(0.8, 1, 48);
      const spawnUplink = () => {
        const p = pickVisible(0.4); if (!p) return;
        const n = p.clone().normalize(), grp = new THREE.Group(); grp.position.copy(n).multiplyScalar(1.004); grp.quaternion.setFromUnitVectors(new V3(0, 1, 0), n); spinG.add(grp);
        const bm = additive(new THREE.ShaderMaterial({ uniforms: { uL: { value: 0 }, uC: { value: hdr(0xbfe8ff, 2.2) } },
          vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'uniform float uL; uniform vec3 uC; varying float vY; void main(){ float head = smoothstep(0.0, 0.35, uL), fade = 1.0 - smoothstep(0.55, 1.0, uL); float a = step(vY, head) * (1.0 - vY) * fade * (0.6 + 1.8 * exp(-pow((vY - head) * 20.0, 2.0))); gl_FragColor = vec4(uC * a, 1.0); }' }));
        const bmesh = new THREE.Mesh(upGeo, bm); bmesh.scale.set(1, 0.34, 1); grp.add(bmesh);
        const rm = additive(new THREE.MeshBasicMaterial({ color: hdr(0x9fdcff, 1.4), opacity: 0, side: THREE.DoubleSide })); const ring = new THREE.Mesh(upRingGeo, rm); ring.rotation.x = -Math.PI / 2; grp.add(ring);
        upFx.push({ grp, bm, rm, ring, t0: t });
      };
      const events = (t) => {
        if (false) {
          if (t > nextArc) { if (arcFx.length < 3) spawnArc(); nextArc = t + 1.2 + Math.random() * 3.8; }
          if (!lock && t > nextLock) { spawnLock(); nextLock = t + 7 + Math.random() * 6; }
          if (FULL && t > nextUp) { if (upFx.length < 2) spawnUplink(); nextUp = t + 3 + Math.random() * 5; }
        }
        for (let i = arcFx.length - 1; i >= 0; i--) {
          const f = arcFx[i], life = t - f.t0, per = RRAD * 6;
          const grow = MU.smootherstep(life / 1.3, 0, 1), tail = MU.smootherstep((life - 1.7) / 1.0, 0, 1);
          const s0 = Math.floor(tail * RSEG) * per, s1 = Math.floor(grow * RSEG) * per; f.mesh.geometry.setDrawRange(s0, Math.max(0, s1 - s0));
          f.curve.getPoint(Math.min(1, grow), f.head.position); f.head.material.opacity = 1 - tail;
          f.head.scale.setScalar(0.06 + (grow >= 1 ? 0.05 * Math.sin((life - 1.3) * 12) ** 2 : 0));
          if (life > 2.9) { spinG.remove(f.mesh, f.head); f.mesh.geometry.dispose(); f.mesh.material.dispose(); f.head.material.dispose(); arcFx.splice(i, 1); }
        }
        for (let i = upFx.length - 1; i >= 0; i--) {
          const f = upFx[i], life = (t - f.t0) / 1.8;
          f.bm.uniforms.uL.value = life; f.ring.scale.setScalar(0.01 + 0.06 * life); f.rm.opacity = 0.9 * (1 - life);
          if (life > 1) { spinG.remove(f.grp); f.bm.dispose(); f.rm.dispose(); upFx.splice(i, 1); }
        }
        if (lock) {
          const life = t - lock.t0, inK = MU.smoothstep(life, 0, 0.45), outK = MU.smoothstep(life, 3.6, 4.3);
          const op = inK * (1 - outK); lock.grp.scale.setScalar(1 + 1.4 * (1 - inK));
          lock.br.material.opacity = op * (life < 0.9 ? (Math.sin(life * 40) > 0 ? 1 : 0.3) : 0.9);
          lock.dot.material.opacity = op * (0.6 + 0.4 * Math.sin(life * 6)); lock.label.material.opacity = op * MU.smoothstep(life, 0.5, 0.8);
          if (life > 4.4) { spinG.remove(lock.grp); lock.br.material.dispose(); lock.dot.material.dispose(); lock.label.material.map.dispose(); lock.label.material.dispose(); lock = null; }
        }
      };

      let TH = null; try { TH = window.EmblemLaunch.theatre(Object.assign(KC, { allSats })); } catch (e) { console.error('emblem launch init', e); }
      // ---------- Lights ----------
      const key = new THREE.DirectionalLight(0xfff0dc, 2.1); key.position.set(-6, 5, 7); scene.add(key);
      const rim = new THREE.DirectionalLight(0x6fa8ff, 1.5); rim.position.set(5, 1.5, -4); scene.add(rim);
      const under = new THREE.DirectionalLight(0x4fb6ff, 0.3); under.position.set(0, -6, 3); scene.add(under);
      scene.add(new THREE.AmbientLight(0x2a3a6a, 0.4));
      scene.add(new THREE.HemisphereLight(0x9cc4e4, 0x0a0e20, 0.3));

      // ---------- Loop ----------
      this._alive = true;
      const stW = new V3(), tmpA = new V3(), tmpB = new V3(), tipW = new V3();
      let last = performance.now(), t = this._paused ? 3 : 0, rip0 = -99, nextRip = 4.5, wasPaused = false, frames = 0;
      const loop = (now) => {
        if (!this._alive || gen !== this._gen) return;
        if (this._paused && !this._noSched) { wasPaused = true; last = now; setTimeout(() => loop(performance.now()), 200); return; }
        const dt0 = Math.min(0.1, (now - last) / 1000), dt = dt0 * (this._warp || 1); last = now; t += dt;
        this._ft = (this._ft || 0.016) * 0.95 + dt0 * 0.05;
        if (t > 6 && !document.hidden && this._ft > 0.036 && now - (this._lastAdapt || 0) > 3000 && (this._prScale || 1) > 0.7) { this._prScale = (this._prScale || 1) * 0.85; this._lastAdapt = now; PR = pickPR(); resize(); }
        U.time.value = t;
        // boot-up: fade in, continents revealed top→bottom, rings settle, rocket rises into place
        post.comp.uniforms.uFade.value = MU.smoothstep(t, 0, 1.4);
        U.reveal.value = MU.smoothstep(t, 0.25, 2.8);
        const ringIn = 1 - Math.pow(1 - MU.smoothstep(t, 0.5, 2.1), 3), rocketIn = 1 - Math.pow(1 - MU.smoothstep(t, 0.7, 2.4), 3);
        spinG.rotation.y = EARTH0 + TAU / this._speed * t + (this._spinOff || 0);
        if (this._clouds) this._clouds.rotation.y = TAU / this._speed * 0.06 * t;
        // scan ring: top→bottom in 5s, every 11s
        const sc = t % 11;
        if (sc < 5) { const y = 1.02 - sc / 5 * 2.04; U.scan.value = y; const rr = Math.sqrt(Math.max(0, 1 - y * y)); scanRing.position.y = y; scanRing.scale.set(rr * 1.012 + 0.001, rr * 1.012 + 0.001, 1); scanRing.material.opacity = 0.75 * rr; }
        else { U.scan.value = 99; scanRing.material.opacity = 0; }
        // lacquer light sweep every 9s; holographic scan band up the rocket every 13s
        const sw = (t + 4) % 9; U.sweep.value = sw < 2.6 ? -2.4 + sw / 2.6 * 4.4 : 99;
        U.rscan.value = 99;
        rocket.localToWorld(tipW.set(0, 1.26, 0));
        const gd = tipW.y + tipW.x * 0.4 - U.sweep.value;
        glint.visible = false; void gd;
        // HUD
        ticks.rotation.z = t * 0.03; arcs.rotation.z = -t * 0.06; radar.material.uniforms.uAng.value = t * 0.7;
        if (textRing) textRing.rotation.z = -t * 0.012;
        if (sun) { const k = 0.88 + 0.12 * Math.sin(t * 0.45); sun.core.material.color.copy(sun.c0).multiplyScalar(k); sun.haze.material.opacity = 0.45 + 0.12 * Math.sin(t * 0.45 + 0.6); }
        // orbits
        for (const o of orbits) {
          o.pivot.scale.setScalar(0.88 + 0.12 * ringIn);
          for (const s of o.sats) {
            const dir = o.r.dir, a = o.r.phase + s.k * Math.PI + dir * W0 * t, ca = Math.cos(a), sa = Math.sin(a);
            s.g.position.set(ca * ORB.r, sa * ORB.r, 0);
            basis.makeBasis(tX.set(0, 0, -dir), tY.set(-sa * dir, ca * dir, 0), tZ.set(ca, sa, 0)); s.g.quaternion.setFromRotationMatrix(basis);
            tQ.copy(o.pivot.quaternion).multiply(s.g.quaternion).invert(); tY.copy(sunW).applyQuaternion(tQ);
            s.panels.rotation.x = Math.atan2(-tY.y, tY.z); // solar arrays track the sun
            s.g.getWorldPosition(tmpB);
            const depth = MU.clamp(tmpB.z / ORB.r, -1, 1);
            s.g.scale.setScalar(SAT_SCALE * (1 + 0.14 * depth));
            s.halo.material.opacity = 0.07 + 0.06 * (depth + 1) / 2; s.w.copy(tmpB);
            { const dd = tmpB.dot(SUN), pp = tmpA.copy(tmpB).addScaledVector(SUN, -dd).length(), lit = dd > 0 ? 1 : MU.smoothstep(pp, 0.97, 1.08); s.su.lit.value += (lit - s.su.lit.value) * Math.min(1, dt * 3); const lk = s.su.lit.value, bl = 1.6 * (0.55 + 0.45 * Math.sin(t * 3 + s.seed * 7)); s.led.material.color.setRGB((0.35 + 0.65 * (1 - lk)) * bl, (0.95 * lk + 0.55 * (1 - lk)) * bl, (0.75 * lk + 0.12 * (1 - lk)) * bl); }
            const ph = (t + s.seed) % 2.4; s.strobe.material.opacity = (ph < 0.08 || (ph > 0.22 && ph < 0.3)) ? 1 : 0;
            s.trail.rotation.z = dir > 0 ? a - ORB.trailArc : a;
          }
        }
        for (const x of xlinks) {
          x.a.g.getWorldPosition(tmpA); x.b.g.getWorldPosition(tmpB); const dd = tmpA.distanceTo(tmpB);
          const op = (1 - MU.smoothstep(dd, 0.35, 0.9)) * 0.6 * (0.6 + 0.4 * Math.sin(t * 13 + x.seed));
          x.ln.material.opacity = op; if (op > 0.01) { x.ln.geometry.attributes.position.array.set([tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z]); x.ln.geometry.attributes.position.needsUpdate = true; }
        }
        events(t);
        // station pulses, shield ripple, link
        pulses.forEach((p, i) => { const k = (t * 0.45 + i / 3) % 1; p.scale.setScalar(0.015 + 0.15 * k); p.material.opacity = 0.9 * Math.pow(1 - k, 1.6); });
        station.getWorldPosition(stW);
        const facing = stW.z > 0.3;
        if (shield) {
          if (t > nextRip) { if (stW.z > 0.25) { rip0 = t; nextRip = t + 14 + Math.random() * 6; } else nextRip = t + 1; }
          const p = (t - rip0) / 3.8, u = shield.material.uniforms;
          if (p >= 0 && p <= 1) { u.uR.value = p * 2.3; u.uK.value = Math.sin(Math.min(1, p * 6) * Math.PI / 2) * (1 - MU.smoothstep(p, 0.55, 1)); } else u.uK.value = 0;
        }
        spinG.getWorldPosition(gCW); stN.copy(stW).sub(gCW).normalize();
        const valid = (s, m) => { s.g.getWorldPosition(tmpB); if (tmpB.z < 0.15) return false; tmpA.subVectors(tmpB, stW); const L = tmpA.length(); return L < 2.1 && tmpA.dot(stN) / L > m; };
        if (link && (!facing || !valid(link, 0.16))) { link = null; nextLink = t + 1.2; }
        if (!link && facing && linkOp < 0.02 && t > nextLink) { let best = 9; for (const s of allSats) if (valid(s, 0.3)) { const dd = tmpB.distanceTo(stW); if (dd < best) { best = dd; link = s; } } if (link) linkLast = link; else nextLink = t + 0.5; }
        linkOp += ((link ? 0.55 : 0) - linkOp) * Math.min(1, dt * (link ? 2.5 : 6));
        const showL = linkLast && linkOp > 0.004; beam.visible = packet.visible = !!showL;
        if (showL) { linkLast.g.getWorldPosition(tmpB); beamGeo.attributes.position.array.set([stW.x, stW.y, stW.z, tmpB.x, tmpB.y, tmpB.z]); beamGeo.attributes.position.needsUpdate = true; packet.position.lerpVectors(stW, tmpB, (t * 0.9) % 1); }
        beam.material.opacity = linkOp * (0.75 + 0.25 * Math.sin(t * 9)); packet.material.opacity = Math.min(1, linkOp * 1.6);
        // life
        rocket.position.y = YC * (1 - sR) + 0.014 * Math.sin(t * 0.8) - 0.12 * (1 - rocketIn);
        if (this._sway) { camera.position.x = 0.45 * Math.sin(t * 0.11); camera.position.y = YC + 0.14 * Math.sin(t * 0.083); }
        else { camera.position.x = 0; camera.position.y = YC; }
        camera.lookAt(0, YC, 0);
        if (TH) { try { TH.frame(dt, t); } catch (e) { if (!this._thErr) { this._thErr = 1; console.error('emblem theatre', e); } } }
        post.render();
        if (++frames === 1) { this.ready = true; this.dispatchEvent(new Event('emblem-ready')); }
        if (wasPaused || frames === 1) { wasPaused = false; this.dispatchEvent(new Event('emblem-frame')); }
        if (this._noSched) return; if (document.hidden) setTimeout(() => loop(performance.now()), 250); else requestAnimationFrame(loop);
      };
      setTimeout(() => loop(performance.now()), 0);
      this.renderOnce = () => post.render(); this.setView = (z, px, py) => { this._zoom = z; this._panX = px; this._panY = py; fit(); }; this.step = (n = 1, dtS = 1 / 30) => { this._noSched = true; try { for (let i = 0; i < n; i++) { last = performance.now() - dtS * 1000; loop(performance.now()); } } finally { this._noSched = false; } }; this._dbg = { scene, spinG, camera, THREE, TH }; this.spawn = (k) => TH && TH.spawn(k); this.events = () => TH && TH.events(); this.warp = (k) => { this._warp = k; };
      const resize = () => { if (!this._renderer) return; renderer.setPixelRatio(PR); renderer.setSize(cssW(), cssH(), false); fit(); };
      this._ro = new ResizeObserver(() => { if (!this.clientWidth || !this.clientHeight) return; PR = pickPR(); resize(); });
      this._ro.observe(this);
      this._prTimer = setInterval(() => { const p = pickPR(); if (Math.abs(p - PR) / PR > 0.12) { PR = p; resize(); } }, 2000);
    }
  }
  if (!customElements.get('space-emblem-v7')) customElements.define('space-emblem-v7', SpaceEmblemV7);
})();
