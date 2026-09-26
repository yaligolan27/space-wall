// <space-emblem-v2 speed="90" globe="holo|real" sway="on|off"> — Space Directorate emblem, v2.
// Geometry is measured from the original logo (globe radius R = 1 unit): rocket, fins, the two crossing orbits, 4 satellites (original sizes), condensed wordmark.
// Objects in front of the globe are scaled by (D-z)/D so the straight-on projection keeps the logo proportions exactly.
// Tech layer: point-cloud continents, lat/long grid, scanning latitude ring, HUD ticks + radar sweep, Israel ground-station pulse with a live satellite link, light sweep across the lacquer.
(() => {
  const TEXDIR = '/assets/textures/';
  const res = (f) => (window.__resources && window.__resources[f.replace(/\W/g, '_')]) || (TEXDIR + f);
  class SpaceEmblemV2 extends HTMLElement {
    static get observedAttributes() { return ['speed', 'sway']; }
    connectedCallback() { if (this._started) return; this._started = true; this.style.display = 'block'; this._init().catch((e) => console.error('space-emblem-v2', e)); }
    disconnectedCallback() {
      this._alive = false; this._started = false; this._gen = (this._gen || 0) + 1;
      if (this._ro) this._ro.disconnect();
      if (this._renderer) { this._renderer.dispose(); this._renderer.domElement.remove(); this._renderer = null; }
    }
    attributeChangedCallback() { this._speed = Number(this.getAttribute('speed')) || 90; this._sway = this.getAttribute('sway') !== 'off'; }
    async _init() {
      this.attributeChangedCallback();
      const gen = this._gen = (this._gen || 0) + 1;
      const mode = this.getAttribute('globe') === 'real' ? 'real' : 'holo';
      const THREE = await import((window.__resources && window.__resources.threeModule) || '/vendor/three.module.js');
      if (gen !== this._gen) return;
      const TAU = Math.PI * 2, deg = THREE.MathUtils.degToRad, V3 = THREE.Vector3;
      const D = 11, YC = -0.2, HALF_H = 1.62, HALF_W = 1.62;
      const persp = (z) => (D - z) / D;

      const w = this.clientWidth || 800, h = this.clientHeight || 800;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
      this._renderer = renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h); renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
      this.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(20, w / h, 0.1, 100);
      camera.position.set(0, YC, D); camera.lookAt(0, YC, 0);
      const U = { time: { value: 0 }, sweep: { value: 99 }, scan: { value: 99 }, size: { value: 2 } };
      const fit = (W, H) => {
        camera.aspect = W / H;
        const half = Math.max(HALF_H, HALF_W / camera.aspect);
        camera.fov = 2 * Math.atan(half / D) * 180 / Math.PI; camera.updateProjectionMatrix();
        U.size.value = 0.0095 * (renderer.domElement.height / (2 * half));
      };
      fit(w, h);

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
      const additive = (mat) => { mat.transparent = true; mat.depthWrite = false; mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneFactor; mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.OneFactor; return mat; };
      const canvasTex = (size, draw) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
      const glowTex = canvasTex(128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(210,236,255,0.8)'); gr.addColorStop(0.45, 'rgba(120,185,255,0.2)'); gr.addColorStop(1, 'rgba(60,120,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
      const flareTex = canvasTex(256, (g) => {
        const gr = g.createRadialGradient(128, 128, 0, 128, 128, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(200,235,255,0.5)'); gr.addColorStop(1, 'rgba(120,180,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        const streak = (horiz) => { const lg = horiz ? g.createLinearGradient(0, 0, 256, 0) : g.createLinearGradient(0, 0, 0, 256); lg.addColorStop(0, 'rgba(160,210,255,0)'); lg.addColorStop(0.5, 'rgba(235,248,255,0.95)'); lg.addColorStop(1, 'rgba(160,210,255,0)'); g.fillStyle = lg; if (horiz) g.fillRect(0, 126, 256, 4); else g.fillRect(126, 0, 4, 256); };
        streak(true); streak(false);
      });
      // diagonal light sweep injected into lacquer / metal materials
      const addSweep = (mat, hex, k) => {
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uSweepY = U.sweep; sh.uniforms.uSweepC = { value: new THREE.Color(hex).multiplyScalar(k) };
          sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          sh.fragmentShader = 'uniform float uSweepY; uniform vec3 uSweepC; varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float swp = vWP.y + vWP.x * 0.4 - uSweepY; totalEmissiveRadiance += uSweepC * exp(-swp * swp * 26.0);');
        };
        return mat;
      };

      const M = {
        navy: addSweep(new THREE.MeshPhysicalMaterial({ color: 0x141350, metalness: 0.25, roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.05, envMapIntensity: 0.35, flatShading: true }), 0x6f86ff, 0.9),
        sky: addSweep(new THREE.MeshPhysicalMaterial({ color: 0x8cc8f2, metalness: 0.05, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.05, envMapIntensity: 0.4, flatShading: true }), 0xbfe6ff, 0.55),
        edge: additive(new THREE.MeshBasicMaterial({ color: 0xdff3ff, opacity: 0.7 })),
        ring: new THREE.MeshStandardMaterial({ color: 0xc4d2ea, metalness: 1, roughness: 0.18, emissive: 0x2c5ca8, emissiveIntensity: 0.55 }),
        ringGlow: additive(new THREE.MeshBasicMaterial({ color: 0x3f8fff, opacity: 0.16 })),
        beacon: new THREE.MeshStandardMaterial({ color: 0xf4fbff, emissive: 0xaee0ff, emissiveIntensity: 3.4, roughness: 0.3 }),
        typeFront: addSweep(new THREE.MeshPhysicalMaterial({ color: 0xa9d2f2, metalness: 0.15, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x1d4a80, emissiveIntensity: 0.45, envMapIntensity: 0.6 }), 0xcfeaff, 0.8),
        typeSide: new THREE.MeshPhysicalMaterial({ color: 0x2a2f86, metalness: 0.6, roughness: 0.3, clearcoat: 0.6 }),
        hud: additive(new THREE.MeshBasicMaterial({ color: 0x6fb4ff, opacity: 0.3, side: THREE.DoubleSide })),
      };

      // ---------- Globe ----------
      const EARTH0 = -2.48; // Israel just left of centre at t=0
      const globeG = new THREE.Group(); globeG.rotation.z = deg(-10); scene.add(globeG);
      const spinG = new THREE.Group(); spinG.rotation.y = EARTH0; globeG.add(spinG);
      const globeMat = mode === 'holo'
        ? new THREE.MeshPhysicalMaterial({ color: 0x0a1834, roughness: 0.4, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.14, emissive: 0x2e68a8, emissiveIntensity: 0 })
        : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
      spinG.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), globeMat));
      const loadImg = (f) => new Promise((r) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => r(im); im.onerror = () => r(null); im.src = res(f); });
      const pixels = (img, W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H); return { c, g, d: g.getImageData(0, 0, W, H).data }; };

      if (mode === 'real') {
        const loader = new THREE.TextureLoader();
        const lt = (f, srgb) => new Promise((r) => loader.load(res(f), (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); r(t); }, undefined, () => r(null)));
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 64), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.85, depthWrite: false, roughness: 1 })); spinG.add(clouds); this._clouds = clouds;
        lt('earth_atmos_2048.jpg', true).then((t) => { if (t) { globeMat.map = t; globeMat.needsUpdate = true; } });
        lt('earth_normal_2048.jpg').then((t) => { if (t) { globeMat.normalMap = t; globeMat.normalScale.set(0.55, 0.55); globeMat.needsUpdate = true; } });
        lt('earth_lights_2048.png', true).then((t) => { if (t) { globeMat.emissiveMap = t; globeMat.emissive.set(0xffd9a0); globeMat.emissiveIntensity = 0.6; globeMat.needsUpdate = true; } });
        lt('earth_clouds_1024.png', true).then((t) => { if (t) { clouds.material.map = t; clouds.material.needsUpdate = true; } else clouds.visible = false; });
      }
      // point-cloud continents (holo) — land mask from the specular map, city brightness from night lights
      Promise.all([loadImg('earth_specular_2048.jpg'), loadImg('earth_lights_2048.png')]).then(([spec, lights]) => {
        if (!spec || gen !== this._gen) return;
        const W = 1024, H = 512;
        let S, L = null;
        try { S = pixels(spec, W, H); if (lights) L = pixels(lights, W, H).d; } catch (e) { return; }
        const land = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) land[i] = 255 - S.d[i * 4];
        if (mode === 'holo') {
          const img = S.g.createImageData(W, H);
          for (let i = 0; i < W * H; i++) { const v = land[i] > 120 ? 255 : 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
          S.g.putImageData(img, 0, 0); S.g.filter = 'blur(1.5px)'; S.g.drawImage(S.c, 0, 0);
          const t = new THREE.CanvasTexture(S.c); t.colorSpace = THREE.SRGBColorSpace;
          globeMat.emissiveMap = t; globeMat.emissiveIntensity = 0.42; globeMat.needsUpdate = true;
        }
        const N = mode === 'holo' ? 46000 : 26000, ga = Math.PI * (3 - Math.sqrt(5));
        const pos = [], br = [], rn = [];
        for (let i = 0; i < N; i++) {
          const y = 1 - 2 * (i + 0.5) / N, th = Math.acos(y), ph = (i * ga) % TAU;
          const px = Math.min(W - 1, (ph / TAU * W) | 0), py = Math.min(H - 1, (th / Math.PI * H) | 0), k = py * W + px;
          if (land[k] < 140) continue;
          const s = Math.sin(th), r = 1.004;
          pos.push(-Math.cos(ph) * s * r, y * r, Math.sin(ph) * s * r);
          br.push(L ? Math.min(1, (L[k * 4] / 255) * 1.8) : 0); rn.push(Math.random());
          if (br[br.length - 1] > 0.75 && Math.random() < 0.25) cities.push(new V3(-Math.cos(ph) * s, y, Math.sin(ph) * s));
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('aB', new THREE.Float32BufferAttribute(br, 1));
        g.setAttribute('aR', new THREE.Float32BufferAttribute(rn, 1));
        const mat = additive(new THREE.ShaderMaterial({
          uniforms: { uSize: U.size, uScan: U.scan, uTime: U.time, uGain: { value: mode === 'holo' ? 1 : 0.35 }, uC1: { value: new THREE.Color(0x7fb8f0) }, uC2: { value: new THREE.Color(0xf2fbff) } },
          vertexShader: 'attribute float aB; attribute float aR; uniform float uSize, uScan, uTime; varying float vA, vB, vS;\n' +
            'void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix) * position); float f = dot(n, normalize(cameraPosition - wp.xyz));\n' +
            ' vA = smoothstep(-0.02, 0.4, f); float d = wp.y - uScan; vS = exp(-d * d * 60.0); vB = aB + 0.25 * aB * sin(uTime * 2.3 + aR * 40.0);\n' +
            ' gl_PointSize = uSize * (0.75 + 0.7 * aB + vS * 0.9) * (0.55 + 0.45 * f); gl_Position = projectionMatrix * viewMatrix * wp; }',
          fragmentShader: 'uniform vec3 uC1, uC2; uniform float uGain; varying float vA, vB, vS;\n' +
            'void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.08, d);\n' +
            ' vec3 col = mix(uC1, uC2, clamp(vB + vS, 0.0, 1.0)) * (0.5 + vB * 1.6 + vS * 1.8) * uGain; gl_FragColor = vec4(col, a * vA);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
        }));
        spinG.add(new THREE.Points(g, mat));
      });
      // lat / long grid
      (() => {
        const p = [], R = 1.006, seg = 128;
        const ll = (lat, lon) => { const th = deg(90 - lat), ph = deg(lon + 180); return [-Math.cos(ph) * Math.sin(th) * R, Math.cos(th) * R, Math.sin(ph) * Math.sin(th) * R]; };
        for (const lat of [-60, -30, 0, 30, 60]) for (let i = 0; i < seg; i++) p.push(...ll(lat, i / seg * 360), ...ll(lat, (i + 1) / seg * 360));
        for (let lon = 0; lon < 360; lon += 30) for (let i = 0; i < seg / 2; i++) p.push(...ll(-84 + i / (seg / 2) * 168, lon), ...ll(-84 + (i + 1) / (seg / 2) * 168, lon));
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        spinG.add(new THREE.LineSegments(g, additive(new THREE.LineBasicMaterial({ color: 0x5aa2ff, opacity: mode === 'holo' ? 0.16 : 0.08 }))));
      })();
      // atmosphere
      const atmoVert = 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
      const outro = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.12, 96, 64), additive(new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { uC: { value: new THREE.Color(0x3a86ff) } }, vertexShader: atmoVert,
        fragmentShader: 'uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float d = max(-dot(vN, vV), 0.0); float a = pow(smoothstep(0.0, 0.5, d), 1.7); gl_FragColor = vec4(uC * a * 1.1, 1.0);' + outro }))));
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.02, 96, 64), additive(new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(0x7cc4ff) } }, vertexShader: atmoVert,
        fragmentShader: 'uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - max(dot(vN, vV), 0.0); gl_FragColor = vec4(uC * pow(f, 3.5) * 0.9, 1.0);' + outro }))));
      // scanning latitude ring
      const scanRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.004, 6, 200), additive(new THREE.MeshBasicMaterial({ color: 0xbfe8ff, opacity: 0 })));
      scanRing.rotation.x = Math.PI / 2; scene.add(scanRing);

      // Israel ground station + pulses
      const nI = (() => { const ph = (35 + 180) / 360 * TAU, th = (90 - 31.5) / 180 * Math.PI; return new V3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)); })();
      const station = new THREE.Group(); station.position.copy(nI).multiplyScalar(1.01); station.quaternion.setFromUnitVectors(new V3(0, 0, 1), nI); spinG.add(station);
      const stGlow = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: 0xaee6ff }))); stGlow.scale.setScalar(0.1); station.add(stGlow);
      const pulseGeo = new THREE.RingGeometry(0.86, 1, 64);
      const pulses = [0, 1, 2].map(() => { const m = new THREE.Mesh(pulseGeo, additive(new THREE.MeshBasicMaterial({ color: 0x8fd8ff, opacity: 0, side: THREE.DoubleSide }))); station.add(m); return m; });

      // ---------- HUD behind the globe ----------
      const HZ = -1.4;
      const hud = new THREE.Group(); hud.position.set(0, 0, HZ); hud.scale.setScalar((D - HZ) / D); scene.add(hud);
      const ringMesh = (r0, r1, a0 = 0, len = TAU, op = 0.3) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 256, 1, a0, len), M.hud.clone()); m.material.opacity = op; return m; };
      hud.add(ringMesh(1.15, 1.156, 0, TAU, 0.34));
      const ticks = (() => { const p = []; for (let i = 0; i < 180; i++) { const a = i / 180 * TAU, r1 = i % 15 === 0 ? 1.255 : i % 5 === 0 ? 1.23 : 1.215; p.push(Math.cos(a) * 1.19, Math.sin(a) * 1.19, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return new THREE.LineSegments(g, additive(new THREE.LineBasicMaterial({ color: 0x7fc0ff, opacity: 0.32 }))); })();
      hud.add(ticks);
      const arcs = new THREE.Group(); [[0.2, 0.9], [1.5, 0.35], [2.3, 1.2], [4.1, 0.6], [5.0, 0.8]].forEach(([a, l]) => arcs.add(ringMesh(1.29, 1.3, a, l, 0.42))); hud.add(arcs);
      const radar = new THREE.Mesh(new THREE.CircleGeometry(1.34, 128), additive(new THREE.ShaderMaterial({ uniforms: { uAng: { value: 0 } }, vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uAng; varying vec2 vP; void main(){ float r = length(vP); float a = atan(vP.y, vP.x); float d = mod(uAng - a, 6.28318); float trail = exp(-d * 2.6) + 0.9 * exp(-d * 60.0); float band = smoothstep(1.0, 1.1, r) * (1.0 - smoothstep(1.26, 1.34, r)); gl_FragColor = vec4(vec3(0.3, 0.62, 1.0) * trail * band * 0.5, 1.0);' + outro })));
      hud.add(radar);

      // ---------- Orbits — fitted to the logo pixels: centre 0.11R above the globe centre, a = 1.45R, b/a ≈ 0.19, tilt ±30°, LOWER edge passes in front ----------
      // Motion: circular orbits → constant angular speed; one shared period; ring B is the mirror of ring A a quarter-period later (no collisions at the crossings).
      const ORB = { cy: 0.11, r: 1.45, open: -79, tube: 0.0075, trailArc: 0.85, period: 48 };
      const W0 = TAU / ORB.period, PHI0 = deg(25);
      const RINGS = [{ tilt: -30, dir: 1, phase: PHI0 }, { tilt: 30, dir: -1, phase: Math.PI / 2 - PHI0 }];
      const panelTex = canvasTex(256, (g, s) => { const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#16275e'); gr.addColorStop(1, '#0a1538'); g.fillStyle = gr; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(150,190,255,0.5)'; g.lineWidth = 3; for (let i = 0; i <= 10; i++) { const p = i / 10 * s; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke(); } for (let j = 0; j <= 4; j++) { const p = j / 4 * s; g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); } g.strokeStyle = 'rgba(210,225,245,0.9)'; g.lineWidth = 8; g.strokeRect(0, 0, s, s); });
      const SM = {
        panel: new THREE.MeshPhysicalMaterial({ map: panelTex, color: 0xffffff, metalness: 0.55, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x0b1c4a, emissiveIntensity: 0.6 }),
        gold: new THREE.MeshStandardMaterial({ color: 0xd6a34a, metalness: 1, roughness: 0.36, emissive: 0x3a2508, emissiveIntensity: 0.4 }),
        silver: new THREE.MeshStandardMaterial({ color: 0xdfe5ee, metalness: 1, roughness: 0.22, side: THREE.DoubleSide }),
      };
      const makeSat = () => {
        const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
        inner.add(new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.036, 0.032), SM.gold));
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.034), SM.silver); cap.position.y = 0.021; inner.add(cap);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.19, 6), SM.silver); arm.rotation.z = Math.PI / 2; inner.add(arm);
        const dish = new THREE.Mesh(new THREE.SphereGeometry(0.016, 20, 8, 0, TAU, 0, 1.0), SM.silver); dish.rotation.x = Math.PI / 2; dish.position.z = -0.036; inner.add(dish);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.02, 5), SM.silver); mast.rotation.x = Math.PI / 2; mast.position.z = -0.024; inner.add(mast);
        const panels = new THREE.Group(); inner.add(panels);
        for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.034, 0.002), SM.panel); p.position.x = sx * 0.058; panels.add(p); }
        const strobe = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: 0xeaf6ff, opacity: 0 }))); strobe.scale.setScalar(0.07); strobe.position.y = 0.028; inner.add(strobe);
        const halo = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fd4ff, opacity: 0.35 }))); halo.scale.setScalar(0.2); inner.add(halo);
        return { g, inner, panels, strobe, halo };
      };
      const SAT_SCALE = 1.05, sunW = new V3(-6, 5, 7).normalize(), basis = new THREE.Matrix4(), tX = new V3(), tY = new V3(), tZ = new V3(), tQ = new THREE.Quaternion();
      const makeTrail = (reverse) => { const seg = 64; const geo = new THREE.TorusGeometry(ORB.r, 0.011, 6, seg, ORB.trailArc); const n = geo.attributes.position.count; const col = new Float32Array(n * 3); for (let v = 0; v < n; v++) { let k = (v % (seg + 1)) / seg; if (reverse) k = 1 - k; col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = Math.pow(k, 2.4); } geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return new THREE.Mesh(geo, additive(new THREE.MeshBasicMaterial({ color: 0xa6dcff, vertexColors: true, opacity: 0.9 }))); };
      const orbits = [];
      for (const r of RINGS) {
        const pivot = new THREE.Group(); pivot.position.y = ORB.cy;
        pivot.quaternion.setFromAxisAngle(new V3(0, 0, 1), deg(r.tilt)).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), deg(ORB.open)));
        pivot.add(new THREE.Mesh(new THREE.TorusGeometry(ORB.r, ORB.tube, 12, 360), M.ring));
        pivot.add(new THREE.Mesh(new THREE.TorusGeometry(ORB.r, 0.03, 8, 360), M.ringGlow));
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
      for (const a of orbits[0].sats) for (const b of orbits[1].sats) { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); const ln = new THREE.Line(gg, additive(new THREE.LineBasicMaterial({ color: 0x9fe6ff, opacity: 0 }))); scene.add(ln); xlinks.push({ a, b, ln, seed: Math.random() * 10 }); }
      // ground-station → satellite link
      const beamGeo = new THREE.BufferGeometry(); beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const beam = new THREE.Line(beamGeo, additive(new THREE.LineBasicMaterial({ color: 0xa6e2ff, opacity: 0 }))); scene.add(beam);
      const packet = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: 0xdff4ff, opacity: 0 }))); packet.scale.setScalar(0.07); scene.add(packet);
      let link = null, linkOp = 0;

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
      const fin = (sx, mat) => {
        const P1 = [0.28 * sx, -0.6, 0], P2 = [0.862 * sx, -1.16, 0], P3 = [0.12 * sx, -0.932, 0];
        const cx = (P1[0] + P2[0] + P3[0]) / 3, cy = (P1[1] + P2[1] + P3[1]) / 3, Mf = [cx, cy, 0.05], Mb = [cx, cy, -0.05];
        const ctr = () => new V3(cx, cy, 0);
        return new THREE.Mesh(facetGeo([[P1, P2, Mf], [P2, P3, Mf], [P3, P1, Mf], [P1, P2, Mb], [P2, P3, Mb], [P3, P1, Mb]], ctr), mat);
      };
      rocket.add(fin(-1, M.sky), fin(1, M.navy));
      const edgeBeam = (p, q, rad, op) => { const a = new V3(...p), b = new V3(...q); const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, a.distanceTo(b), 6, 1, true), M.edge.clone()); m.material.opacity = op; m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize()); return m; };
      const FwO = [0, -0.6, hd + 0.003];
      rocket.add(edgeBeam([0, 1.26, 0.002], FwO, 0.0035, 0.75), edgeBeam(FwO, [0, -1.172, 0.002], 0.0035, 0.6), edgeBeam(A, Lw, 0.0025, 0.25), edgeBeam(A, Rw, 0.0025, 0.4));
      const glint = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: flareTex, color: 0xeaf6ff, opacity: 0.2 }))); glint.position.set(0, 1.265, 0.02); glint.scale.setScalar(0.3); rocket.add(glint);

      // ---------- Wordmark: condensed ExtraBold (Open Sans Hebrew Condensed), fitted to the logo's box ----------
      const ZW = 0.9, sW = persp(ZW);
      const wordG = new THREE.Group(); wordG.position.set(0, YC * (1 - sW), ZW); wordG.scale.setScalar(sW); scene.add(wordG);
      const wordmark = async (text, BW, BH) => {
        const fam = "'Open Sans'", spec = '800 condensed 200px ' + fam;
        try { await Promise.race([document.fonts.load(spec, text), new Promise((r) => setTimeout(r, 3000))]); } catch (e) {}
        const c = document.createElement('canvas'); const g = c.getContext('2d');
        const setFont = () => { g.font = spec + ", 'Arial Narrow', Arial, sans-serif"; try { g.fontStretch = 'condensed'; } catch (e) {} g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle'; };
        setFont(); const inkW = g.measureText(text).width;
        const cw = Math.ceil(inkW) + 80, ch = 320; c.width = cw; c.height = ch;
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
        for (const start of adj.keys()) { if (seen.has(start)) continue; const loop = []; let prev = null, cur = start; for (let guard = 0; guard < 2e6; guard++) { seen.add(cur); loop.push(pt[cur]); const nb = adj.get(cur); const next = nb[0] === prev ? nb[1] : nb[0]; if (next === undefined || next === start) break; prev = cur; cur = next; } if (loop.length > 12) loops.push(loop); }
        const dp = (p, eps) => { if (p.length < 3) return p; const [ax, ay] = p[0], [bx, by] = p[p.length - 1]; const Ln = Math.hypot(bx - ax, by - ay) || 1e-9; let md = 0, mi = 0; for (let i = 1; i < p.length - 1; i++) { const q = Math.abs((bx - ax) * (ay - p[i][1]) - (ax - p[i][0]) * (by - ay)) / Ln; if (q > md) { md = q; mi = i; } } return md > eps ? dp(p.slice(0, mi + 1), eps).slice(0, -1).concat(dp(p.slice(mi), eps)) : [p[0], p[p.length - 1]]; };
        const simp = loops.map((loop) => { let far = 0, fd = 0; for (let i = 1; i < loop.length; i++) { const q = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]); if (q > fd) { fd = q; far = i; } } return dp(loop.slice(0, far + 1), 0.6).slice(0, -1).concat(dp(loop.slice(far).concat([loop[0]]), 0.6).slice(0, -1)); });
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const l of simp) for (const [x, y] of l) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const kx = BW / (x1 - x0), ky = BH / (y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const polys = simp.map((l) => l.map(([x, y]) => [(x - mx) * kx, -(y - my) * ky]));
        const inside = (q, poly) => { let c2 = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > q[1]) !== (yj > q[1]) && q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi) c2 = !c2; } return c2; };
        const area = (p) => Math.abs(p.reduce((a, [x, y], i) => { const [nx, ny] = p[(i + 1) % p.length]; return a + x * ny - nx * y; }, 0) / 2);
        const nest = polys.map((p, i) => polys.filter((q, j) => j !== i && inside(p[0], q)).length);
        const outers = polys.map((p, i) => nest[i] % 2 === 0 ? { p, shape: new THREE.Shape(p.map(([x, y]) => new THREE.Vector2(x, y))) } : null).filter(Boolean);
        polys.forEach((p, i) => { if (nest[i] % 2 === 0) return; let best = null; for (const o of outers) if (inside(p[0], o.p) && (!best || area(o.p) < area(best.p))) best = o; if (best) best.shape.holes.push(new THREE.Path(p.map(([x, y]) => new THREE.Vector2(x, y)))); });
        const geo = new THREE.ExtrudeGeometry(outers.map((o) => o.shape), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.0045, bevelSegments: 3 });
        geo.translate(0, 0, -0.035);
        return new THREE.Mesh(geo, [M.typeFront, M.typeSide]);
      };
      wordmark('מנהלת החלל', 1.66, 0.27).then((m) => { if (gen !== this._gen) return; m.position.set(0, -1.508, 0); m.rotation.x = deg(-6); wordG.add(m); }).catch((e) => console.warn('wordmark', e));

      // ---------- Random events: city-to-city data arcs + target-lock reticles ----------
      const cities = [];
      const arcFx = []; let nextArc = 2.5, lock = null, nextLock = 6;
      const RSEG = 64, RRAD = 5;
      const pickVisible = (minZ) => { for (let i = 0; i < 30; i++) { const p = cities[(Math.random() * cities.length) | 0]; if (spinG.localToWorld(tmpC.copy(p)).z > minZ) return p; } return null; };
      const tmpC = new V3();
      const spawnArc = () => {
        for (let tries = 0; tries < 25; tries++) {
          const p1 = pickVisible(0.35), p2 = pickVisible(0.3); if (!p1 || !p2) return;
          const ang = p1.angleTo(p2); if (ang < 0.3 || ang > 1.2) continue;
          const mid = p1.clone().add(p2).normalize().multiplyScalar(1.1 + ang * 0.2);
          const curve = new THREE.QuadraticBezierCurve3(p1.clone().multiplyScalar(1.004), mid, p2.clone().multiplyScalar(1.004));
          const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, RSEG, 0.003, RRAD, false), additive(new THREE.MeshBasicMaterial({ color: 0x9fdcff, opacity: 0.9 })));
          mesh.geometry.setDrawRange(0, 0); spinG.add(mesh);
          const head = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: 0xeaf8ff }))); head.scale.setScalar(0.07); spinG.add(head);
          arcFx.push({ mesh, head, curve, t0: t }); return;
        }
      };
      const labelTex = (txt) => { const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d'); g.font = "500 30px 'IBM Plex Mono', monospace"; g.fillStyle = 'rgba(190,228,255,0.95)'; g.textBaseline = 'middle'; g.fillText(txt, 6, 34); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; };
      const bracketGeo = (() => { const p = [], s = 0.045, l = 0.018; for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) p.push(sx * s, sy * s, 0, sx * (s - l), sy * s, 0, sx * s, sy * s, 0, sx * s, sy * (s - l), 0); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g; })();
      const spawnLock = () => {
        const p = pickVisible(0.5); if (!p) return;
        const n = p.clone().normalize(), grp = new THREE.Group(); grp.position.copy(n).multiplyScalar(1.012); grp.quaternion.setFromUnitVectors(new V3(0, 0, 1), n); spinG.add(grp);
        const br = new THREE.LineSegments(bracketGeo, additive(new THREE.LineBasicMaterial({ color: 0xbfe8ff, opacity: 0 }))); grp.add(br);
        const dot = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, opacity: 0 }))); dot.scale.setScalar(0.04); grp.add(dot);
        const lat = 90 - Math.acos(n.y) * 180 / Math.PI; let lon = Math.atan2(n.z, -n.x) / TAU * 360; if (lon < 0) lon += 360; lon -= 180;
        const id = 'TRK-' + String(100 + ((Math.random() * 900) | 0));
        const txt = id + '  ' + Math.abs(lat).toFixed(2) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' + String(Math.abs(lon).toFixed(2)).padStart(6, '0') + '°' + (lon >= 0 ? 'E' : 'W');
        const label = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: labelTex(txt), opacity: 0 }))); label.center.set(0, 0.5); label.scale.set(0.4, 0.05, 1); label.position.set(0.06, 0.055, 0); grp.add(label);
        lock = { grp, br, dot, label, t0: t };
      };
      const events = (t) => {
        if (cities.length > 10) {
          if (t > nextArc) { if (arcFx.length < 3) spawnArc(); nextArc = t + 1.2 + Math.random() * 3.8; }
          if (!lock && t > nextLock) { spawnLock(); nextLock = t + 7 + Math.random() * 6; }
        }
        for (let i = arcFx.length - 1; i >= 0; i--) {
          const f = arcFx[i], life = t - f.t0, per = RRAD * 6;
          const grow = THREE.MathUtils.smootherstep(life / 1.3, 0, 1), tail = THREE.MathUtils.smootherstep((life - 1.7) / 1.0, 0, 1);
          const s0 = Math.floor(tail * RSEG) * per, s1 = Math.floor(grow * RSEG) * per; f.mesh.geometry.setDrawRange(s0, Math.max(0, s1 - s0));
          f.curve.getPoint(Math.min(1, grow), f.head.position); f.head.material.opacity = 1 - tail;
          f.head.scale.setScalar(0.07 + (grow >= 1 ? 0.05 * Math.sin((life - 1.3) * 12) ** 2 : 0));
          if (life > 2.9) { spinG.remove(f.mesh, f.head); f.mesh.geometry.dispose(); f.mesh.material.dispose(); f.head.material.dispose(); arcFx.splice(i, 1); }
        }
        if (lock) {
          const life = t - lock.t0, inK = THREE.MathUtils.smoothstep(life, 0, 0.45), outK = THREE.MathUtils.smoothstep(life, 3.6, 4.3);
          const op = inK * (1 - outK); lock.grp.scale.setScalar(1 + 1.4 * (1 - inK));
          lock.br.material.opacity = op * (life < 0.9 ? (Math.sin(life * 40) > 0 ? 1 : 0.3) : 0.9);
          lock.dot.material.opacity = op * (0.6 + 0.4 * Math.sin(life * 6)); lock.label.material.opacity = op * THREE.MathUtils.smoothstep(life, 0.5, 0.8);
          if (life > 4.4) { spinG.remove(lock.grp); lock.br.material.dispose(); lock.dot.material.dispose(); lock.label.material.map.dispose(); lock.label.material.dispose(); lock = null; }
        }
      };

      // ---------- Lights ----------
      const key = new THREE.DirectionalLight(0xfff0dc, 2.1); key.position.set(-6, 5, 7); scene.add(key);
      const rim = new THREE.DirectionalLight(0x6fa8ff, 1.5); rim.position.set(5, 1.5, -4); scene.add(rim);
      const under = new THREE.DirectionalLight(0x4fb6ff, 0.5); under.position.set(0, -6, 3); scene.add(under);
      scene.add(new THREE.AmbientLight(0x2a3a6a, 0.4));
      scene.add(new THREE.HemisphereLight(0x9cc4e4, 0x0a0e20, 0.3));

      // ---------- Loop ----------
      this._alive = true;
      const tmpA = new V3(), tmpB = new V3(), tipW = new V3();
      let last = performance.now(), t = 0;
      const loop = (now) => {
        if (!this._alive || gen !== this._gen) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
        U.time.value = t;
        spinG.rotation.y = EARTH0 + TAU / this._speed * t;
        if (this._clouds) this._clouds.rotation.y = TAU / this._speed * 0.06 * t;
        // scan ring: top→bottom in 5s, every 11s
        const sc = t % 11;
        if (sc < 5) { const y = 1.02 - sc / 5 * 2.04; U.scan.value = y; const rr = Math.sqrt(Math.max(0, 1 - y * y)); scanRing.position.y = y; scanRing.scale.set(rr * 1.012 + 0.001, rr * 1.012 + 0.001, 1); scanRing.material.opacity = 0.75 * rr; }
        else { U.scan.value = 99; scanRing.material.opacity = 0; }
        // lacquer light sweep every 9s
        const sw = (t + 4) % 9; U.sweep.value = sw < 2.6 ? -2.4 + sw / 2.6 * 4.4 : 99;
        rocket.localToWorld(tipW.set(0, 1.26, 0));
        const gd = tipW.y + tipW.x * 0.4 - U.sweep.value;
        glint.material.opacity = 0.18 + 0.1 * Math.sin(t * 1.7) + 1.1 * Math.exp(-gd * gd * 10);
        glint.scale.setScalar(0.24 + 0.3 * Math.exp(-gd * gd * 10));
        // HUD
        ticks.rotation.z = t * 0.03; arcs.rotation.z = -t * 0.06; radar.material.uniforms.uAng.value = t * 0.7;
        // orbits
        for (const o of orbits) for (const s of o.sats) {
          const dir = o.r.dir, a = o.r.phase + s.k * Math.PI + dir * W0 * t, ca = Math.cos(a), sa = Math.sin(a);
          s.g.position.set(ca * ORB.r, sa * ORB.r, 0);
          // body frame: X = orbit normal (panel boom), Y = velocity, Z = radial out (dish faces Earth)
          basis.makeBasis(tX.set(0, 0, -dir), tY.set(-sa * dir, ca * dir, 0), tZ.set(ca, sa, 0)); s.g.quaternion.setFromRotationMatrix(basis);
          tQ.copy(o.pivot.quaternion).multiply(s.g.quaternion).invert(); tY.copy(sunW).applyQuaternion(tQ);
          s.panels.rotation.x = Math.atan2(-tY.y, tY.z); // solar arrays track the sun
          s.g.getWorldPosition(tmpB);
          const depth = THREE.MathUtils.clamp(tmpB.z / ORB.r, -1, 1);
          s.g.scale.setScalar(SAT_SCALE * (1 + 0.14 * depth));
          s.halo.material.opacity = 0.22 + 0.12 * (depth + 1) / 2;
          const ph = (t + s.seed) % 2.4; s.strobe.material.opacity = (ph < 0.08 || (ph > 0.22 && ph < 0.3)) ? 1 : 0;
          s.trail.rotation.z = dir > 0 ? a - ORB.trailArc : a;
        }
        for (const x of xlinks) {
          x.a.g.getWorldPosition(tmpA); x.b.g.getWorldPosition(tmpB); const dd = tmpA.distanceTo(tmpB);
          const op = (1 - THREE.MathUtils.smoothstep(dd, 0.35, 0.9)) * 0.6 * (0.6 + 0.4 * Math.sin(t * 13 + x.seed));
          x.ln.material.opacity = op; if (op > 0.01) { x.ln.geometry.attributes.position.array.set([tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z]); x.ln.geometry.attributes.position.needsUpdate = true; }
        }
        events(t);
        // station pulses + link
        pulses.forEach((p, i) => { const k = (t * 0.45 + i / 3) % 1; p.scale.setScalar(0.015 + 0.15 * k); p.material.opacity = 0.9 * Math.pow(1 - k, 1.6); });
        station.getWorldPosition(tmpA);
        const facing = tmpA.z > 0.3;
        const valid = (s) => { s.g.getWorldPosition(tmpB); return tmpB.z > 0.2 && tmpB.distanceTo(tmpA) < 2.1; };
        if (!link || !facing || !valid(link)) { link = null; if (facing) { let best = 9; for (const s of allSats) if (valid(s)) { const dd = tmpB.distanceTo(tmpA); if (dd < best) { best = dd; link = s; } } } }
        linkOp += ((link ? 0.55 : 0) - linkOp) * Math.min(1, dt * 2.5);
        if (link) { link.g.getWorldPosition(tmpB); const arr = beamGeo.attributes.position.array; arr.set([tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z]); beamGeo.attributes.position.needsUpdate = true; const k = (t * 0.9) % 1; packet.position.lerpVectors(tmpA, tmpB, k); }
        beam.material.opacity = linkOp * (0.75 + 0.25 * Math.sin(t * 9)); packet.material.opacity = linkOp * 1.6;
        // life
        rocket.position.y = YC * (1 - sR) + 0.014 * Math.sin(t * 0.8);
        if (this._sway) { camera.position.x = 0.45 * Math.sin(t * 0.11); camera.position.y = YC + 0.14 * Math.sin(t * 0.083); }
        else { camera.position.x = 0; camera.position.y = YC; }
        camera.lookAt(0, YC, 0);
        renderer.render(scene, camera);
        if (document.hidden) setTimeout(() => loop(performance.now()), 250); else requestAnimationFrame(loop);
      };
      setTimeout(() => loop(performance.now()), 0);
      this.renderOnce = () => renderer.render(scene, camera);
      this._ro = new ResizeObserver(() => { const nw = this.clientWidth, nh = this.clientHeight; if (!nw || !nh || !this._renderer) return; renderer.setSize(nw, nh); fit(nw, nh); });
      this._ro.observe(this);
    }
  }
  if (!customElements.get('space-emblem-v2')) customElements.define('space-emblem-v2', SpaceEmblemV2);
})();
