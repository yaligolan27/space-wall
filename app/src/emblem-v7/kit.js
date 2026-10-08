// Emblem kit for <space-emblem-v4>: chrome-shine ring material, detailed satellites, high-res globe extras
// (vector coastlines/borders, aurora, holo clouds + relief) and the miniature defence/space theatre
// (instanced models, particle FX, English labels, ground-station network, satellite imaging).
window.EmblemKit = (() => {
  const K = {};

  // ---------- orbit ring: brushed metal + travelling chrome glint (driven by U.shine) ----------
  K.ringMat = (c, dir, a0) => {
    const { THREE, U } = c;
    const m = new THREE.MeshStandardMaterial({ color: 0xc4d2ea, metalness: 1, roughness: 0.16, emissive: 0x2c5ca8, emissiveIntensity: 0.6 });
    m.customProgramCacheKey = () => 'ringShine';
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uShine = U.shine; sh.uniforms.uDir = { value: dir }; sh.uniforms.uA0 = { value: a0 };
      sh.vertexShader = 'varying vec3 vRP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRP = position;');
      sh.fragmentShader = 'uniform float uShine, uDir, uA0; varying vec3 vRP;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 float ang = atan(vRP.y, vRP.x); float head = uA0 + uDir * (uShine / 1.6) * 6.28318;
 float dd = mod(ang - head + 3.14159, 6.28318) - 3.14159; float on = step(uShine, 1.75);
 float behind = max(-dd * uDir, 0.0); float tail = exp(-behind * 1.8) * step(0.0, -dd * uDir) * (1.0 - smoothstep(0.0, 1.75, uShine));
 totalEmissiveRadiance += vec3(0.85, 0.95, 1.0) * on * (exp(-dd * dd * 90.0) * 9.0 + tail * 0.8);`);
    };
    return m;
  };

  // ---------- satellites ----------
  K.satFactory = (c) => {
    const { THREE, U, TAU, additive, glowTex, canvasTex, hdr } = c, V3 = THREE.Vector3;
    const foil = canvasTex(256, (g, s) => { g.fillStyle = '#b8862e'; g.fillRect(0, 0, s, s); for (let i = 0; i < 700; i++) { const x = Math.random() * s, y = Math.random() * s, r = 4 + Math.random() * 18; g.fillStyle = `hsl(${34 + Math.random() * 14},${55 + Math.random() * 30}%,${30 + Math.random() * 42}%)`; g.beginPath(); g.moveTo(x, y); for (let q = 0; q < 3; q++) g.lineTo(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 2); g.closePath(); g.fill(); } });
    const cells = canvasTex(1024, (g, s) => {
      g.fillStyle = '#0a1230'; g.fillRect(0, 0, s, s);
      const segW = s / 3, gap = 16;
      for (let k = 0; k < 3; k++) {
        const x0 = k * segW + gap / 2, w = segW - gap, y0 = 10, h = s - 20;
        const gr = g.createLinearGradient(x0, 0, x0 + w, s); gr.addColorStop(0, '#22408f'); gr.addColorStop(0.5, '#0f1f55'); gr.addColorStop(1, '#1d397e'); g.fillStyle = gr; g.fillRect(x0, y0, w, h);
        const nx = 10, ny = 4, cw = w / nx, ch = h / ny;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { g.fillStyle = `rgba(${40 + Math.random() * 40},${70 + Math.random() * 50},${160 + Math.random() * 70},0.35)`; g.fillRect(x0 + i * cw + 3, y0 + j * ch + 3, cw - 6, ch - 6); }
        g.strokeStyle = 'rgba(185,205,240,0.55)'; g.lineWidth = 2;
        for (let i = 1; i < nx; i++) { g.beginPath(); g.moveTo(x0 + i * cw, y0); g.lineTo(x0 + i * cw, y0 + h); g.stroke(); }
        for (let j = 1; j < ny; j++) { g.beginPath(); g.moveTo(x0, y0 + j * ch); g.lineTo(x0 + w, y0 + j * ch); g.stroke(); }
        g.fillStyle = 'rgba(222,228,238,0.85)'; g.fillRect(x0, s / 2 - 5, w, 10);
        g.strokeStyle = 'rgba(232,238,248,0.95)'; g.lineWidth = 8; g.strokeRect(x0, y0, w, h);
      }
    });
    const osrT = canvasTex(256, (g, s) => { g.fillStyle = '#c9d6e6'; g.fillRect(0, 0, s, s); const n = 8, cc = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 185 + Math.random() * 55; g.fillStyle = `rgb(${v | 0},${Math.min(255, v + 6) | 0},${Math.min(255, v + 18) | 0})`; g.fillRect(i * cc + 2, j * cc + 2, cc - 4, cc - 4); } });
    const SM = {
      gold: new THREE.MeshStandardMaterial({ map: foil, bumpMap: foil, bumpScale: 0.8, color: 0xffffff, metalness: 1, roughness: 0.3, emissive: 0x3a2508, emissiveIntensity: 0.35 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xe3e8f0, metalness: 1, roughness: 0.18, side: THREE.DoubleSide }),
      dish: new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 0.4, roughness: 0.32, side: THREE.DoubleSide }),
      dark: new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: 0.9, roughness: 0.38, side: THREE.DoubleSide }),
      osr: new THREE.MeshStandardMaterial({ map: osrT, color: 0xffffff, metalness: 1, roughness: 0.06 }),
      back: new THREE.MeshStandardMaterial({ color: 0xd2d7de, metalness: 0.25, roughness: 0.55 }),
      white: new THREE.MeshStandardMaterial({ color: 0xf1f3f6, metalness: 0.1, roughness: 0.4 }),
      lens: new THREE.MeshPhysicalMaterial({ color: 0x0a1630, metalness: 0, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, iridescence: 1, iridescenceIOR: 1.8, envMapIntensity: 3 }),
    };
    const cellMat = (su) => {
      const m = new THREE.MeshPhysicalMaterial({ map: cells, color: 0xffffff, metalness: 0.55, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0x0b1c4a, emissiveIntensity: 0.45, iridescence: 0.7, iridescenceIOR: 1.6 });
      m.customProgramCacheKey = () => 'cellsCharge';
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uLit = su.lit; sh.uniforms.uT = U.time; sh.uniforms.uSeed = su.seed;
        sh.fragmentShader = 'uniform float uLit, uT, uSeed;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 vec2 cuv = vMapUv; float bpos = 1.0 - fract(uT * 0.42 + uSeed); float band = exp(-pow((cuv.x - bpos) * 9.0, 2.0));
 vec2 cid = floor(cuv * vec2(30.0, 4.0)); float tw = step(0.93, fract(sin(dot(cid, vec2(12.9898, 78.233)) + floor(uT * 2.5 + uSeed * 9.0) * 1.37) * 43758.5453));
 totalEmissiveRadiance += (vec3(0.22, 0.55, 1.0) * (band * 0.45 + tw * 0.2) + vec3(0.04, 0.09, 0.22)) * uLit;`);
      };
      return m;
    };
    const armMat = (su) => additive(new THREE.ShaderMaterial({ uniforms: { uT: U.time, uLit: su.lit },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uT, uLit; varying vec2 vUv; void main(){ float d = abs(vUv.y - 0.5) * 2.0; float f = fract(d * 4.0 + uT * 1.6); float pk = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.12, 0.35, f)); gl_FragColor = vec4(vec3(0.35, 1.0, 0.8) * (pk * 0.6 + 0.04) * uLit, 1.0); }' }));
    // body frame: X = orbit normal (array boom), Y = velocity, Z = radial out (−Z = nadir)
    return () => {
      const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
      const su = { lit: { value: 1 }, seed: { value: Math.random() } };
      const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, par = inner) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); par.add(m); return m; };
      add(new THREE.BoxGeometry(0.028, 0.036, 0.032), SM.gold);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.0012, 0.03, 0.026), SM.osr, sx * 0.0146);
      add(new THREE.BoxGeometry(0.031, 0.004, 0.035), SM.silver, 0, 0.02, 0);
      add(new THREE.CylinderGeometry(0.0095, 0.012, 0.005, 24), SM.silver, 0, -0.0205, 0);
      add(new THREE.ConeGeometry(0.0045, 0.009, 16, 1, true), SM.dark, 0, -0.027, 0);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(new THREE.ConeGeometry(0.0016, 0.004, 8), SM.dark, sx * 0.0125, -0.0185, sz * 0.0145, sz * 0.6, 0, -sx * 0.6);
      // nadir: high-gain dish + EO telescope
      add(new THREE.SphereGeometry(0.014, 32, 10, 0, TAU, 0, 1.0), SM.dish, 0, 0.009, -0.034, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.0008, 0.0008, 0.014, 5), SM.silver, 0, 0.009, -0.023, Math.PI / 2);
      add(new THREE.SphereGeometry(0.0019, 10, 8), SM.silver, 0, 0.009, -0.031);
      add(new THREE.CylinderGeometry(0.0068, 0.0072, 0.016, 24), SM.dark, 0, -0.0105, -0.024, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.0074, 0.0074, 0.0016, 24, 1, true), SM.silver, 0, -0.0105, -0.0318, Math.PI / 2);
      add(new THREE.CircleGeometry(0.0058, 24), SM.lens, 0, -0.0105, -0.0312, Math.PI);
      // zenith: star trackers, GPS patch, mast
      for (const sx of [-1, 1]) { add(new THREE.CylinderGeometry(0.0022, 0.0022, 0.005, 12), SM.dark, sx * 0.008, 0.011, 0.0185, Math.PI / 2 - 0.4, 0, sx * 0.3); add(new THREE.CylinderGeometry(0.0034, 0.0024, 0.004, 12, 1, true), SM.silver, sx * 0.0088, 0.0118, 0.0222, Math.PI / 2 - 0.4, 0, sx * 0.3); }
      add(new THREE.CylinderGeometry(0.004, 0.004, 0.0012, 16), SM.white, -0.004, -0.009, 0.0166, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.0007, 0.0007, 0.026, 5), SM.silver, 0.009, -0.006, 0.029, Math.PI / 2);
      // boom + power flow
      add(new THREE.CylinderGeometry(0.0014, 0.0014, 0.062, 8), SM.silver, 0, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.0026, 0.0026, 0.062, 8, 1, true), armMat(su), 0, 0, 0, 0, 0, Math.PI / 2);
      // segmented, sun-tracking wings (cells front, white back)
      const panels = new THREE.Group(); inner.add(panels);
      const wingMats = [SM.silver, SM.silver, SM.silver, SM.silver, cellMat(su), SM.back];
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.084, 0.034, 0.0016), wingMats, sx * 0.073, 0, 0, 0, 0, sx < 0 ? Math.PI : 0, panels);
        for (const hx of [0.0595, 0.0865]) add(new THREE.BoxGeometry(0.0014, 0.036, 0.0024), SM.silver, sx * hx, 0, 0, 0, 0, 0, panels);
        for (const sy of [-1, 1]) add(new THREE.CylinderGeometry(0.0007, 0.0007, 0.022, 5), SM.silver, sx * 0.024, sy * 0.008, 0, 0, 0, sx * (Math.PI / 2 - sy * 0.75), panels);
      }
      const strobe = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0xeaf6ff, 5), opacity: 0 }))); strobe.scale.setScalar(0.06); strobe.position.y = 0.028; inner.add(strobe);
      const halo = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fd4ff, opacity: 0.1 }))); halo.scale.setScalar(0.15); inner.add(halo);
      const led = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0x7dffcf, 2.2) }))); led.scale.setScalar(0.012); led.position.set(0.012, 0.0175, 0.0168); inner.add(led);
      return { g, inner, panels, strobe, halo, led, su, cam: new V3(0, -0.0105, -0.034), w: new V3() };
    };
  };

  // ---------- globe extras ----------
  K.globeExtras = (c) => {
    const { THREE, U, spinG, additive, hdr, res, renderer, mode, deg } = c, V3 = THREE.Vector3;
    const loader = new THREE.TextureLoader(), out = {};
    const lineMat = (col, k) => additive(new THREE.ShaderMaterial({ uniforms: { uC: { value: hdr(col, k) }, uReveal: U.reveal, uScan: U.scan },
      vertexShader: 'uniform float uReveal, uScan; varying float vA; varying float vS; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vec3 n = normalize(wp.xyz); float f = dot(n, normalize(cameraPosition - wp.xyz)); float ry = 1.15 - uReveal * 2.4; vA = smoothstep(0.0, 0.35, f) * smoothstep(ry - 0.04, ry + 0.04, wp.y); float d = wp.y - uScan; vS = exp(-d * d * 60.0); gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform vec3 uC; varying float vA; varying float vS; void main(){ gl_FragColor = vec4(uC * vA * (1.0 + vS * 2.5), 1.0); }' }));
    (async () => {
      try {
        const url = (window.__resources && window.__resources.worldAtlas) || '/assets/world-atlas/countries-50m.json';
        const topo = await (await fetch(url)).json(); if (!c.isAlive()) return;
        const tf = topo.transform;
        const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map((p) => { if (!tf) return p; x += p[0]; y += p[1]; return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]; }); });
        const use = new Uint8Array(arcs.length), isr = new Uint8Array(arcs.length);
        for (const gm of topo.objects.countries.geometries) { const seen = new Set(); const walk = (a) => { if (typeof a === 'number') seen.add(a < 0 ? ~a : a); else if (a) a.forEach(walk); }; walk(gm.arcs); for (const k of seen) { use[k]++; if (String(gm.id) === '376') isr[k] = 1; } }
        const P = (lon, lat, r) => { const th = deg(90 - lat), ph = deg(lon + 180); return [-Math.cos(ph) * Math.sin(th) * r, Math.cos(th) * r, Math.sin(ph) * Math.sin(th) * r]; };
        const coast = [], border = [], il = [];
        arcs.forEach((a, k) => { const o = isr[k] ? il : use[k] > 1 ? border : coast; for (let i = 0; i < a.length - 1; i++) { if (Math.abs(a[i][0] - a[i + 1][0]) > 90) continue; o.push(...P(a[i][0], a[i][1], 1.0045), ...P(a[i + 1][0], a[i + 1][1], 1.0045)); } });
        const gain = mode === 'holo' ? 1 : 0.5;
        const mk = (arr, col, k) => { if (!arr.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); spinG.add(new THREE.LineSegments(g, lineMat(col, k))); };
        mk(coast, 0x8fd0ff, 0.5 * gain); mk(border, 0x6aa6e8, 0.24 * gain); mk(il, 0xcfeeff, 1.5 * gain);
      } catch (e) { console.warn('emblem atlas', e); }
    })();
    // aurora oval around the geomagnetic north pole
    (() => {
      const lat = 80.6, lon = -72.7, th = deg(90 - lat), ph = deg(lon + 180), pole = new V3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)), al = deg(21);
      const g = new THREE.CylinderGeometry(Math.sin(al) * 1.075, Math.sin(al) * 1.012, Math.cos(al) * (1.075 - 1.012), 256, 1, true);
      const m = new THREE.Mesh(g, additive(new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uT: U.time, uSun: U.sun, uReveal: U.reveal },
        vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = normalize((modelMatrix * vec4(position, 1.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uT, uReveal; uniform vec3 uSun; varying vec2 vUv; varying vec3 vW;
void main(){ float x = vUv.x * 6.28318; float b = 0.5 + 0.5 * sin(x * 7.0 + uT * 0.35 + 2.0 * sin(x * 3.0 - uT * 0.21)); b *= 0.55 + 0.45 * sin(x * 23.0 - uT * 0.9 + sin(x * 5.0 + uT * 0.4) * 3.0); b = pow(max(b, 0.0), 1.6);
 float y = vUv.y; float v = smoothstep(0.0, 0.12, y) * pow(1.0 - y, 1.3);
 vec3 col = mix(vec3(0.15, 1.0, 0.55), vec3(0.55, 0.35, 1.0), smoothstep(0.35, 1.0, y));
 float night = 1.0 - smoothstep(-0.25, 0.25, dot(vW, uSun));
 gl_FragColor = vec4(col * b * v * (0.2 + 0.9 * night) * 0.55 * uReveal, 1.0); }` })));
      m.quaternion.setFromUnitVectors(new V3(0, 1, 0), pole); m.position.copy(pole).multiplyScalar(Math.cos(al) * (1.075 + 1.012) / 2);
      spinG.add(m);
    })();
    if (mode === 'holo') {
      loader.load(res('earth_normal_2048.jpg'), (tx) => { tx.anisotropy = renderer.capabilities.getMaxAnisotropy(); c.globeMat.normalMap = tx; c.globeMat.normalScale.set(0.9, 0.9); c.globeMat.needsUpdate = true; });
      const cm = additive(new THREE.ShaderMaterial({ uniforms: { uTex: { value: null }, uSun: U.sun, uReveal: U.reveal, uOn: { value: 0 } },
        vertexShader: 'varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vW = normalize(mat3(modelMatrix) * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform sampler2D uTex; uniform vec3 uSun; uniform float uReveal, uOn; varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vV; void main(){ vec4 cc = texture2D(uTex, vUv); float cl = cc.r * cc.a; float day = smoothstep(-0.2, 0.35, dot(vW, uSun)); float f = smoothstep(0.0, 0.35, dot(vN, vV)); gl_FragColor = vec4(vec3(0.55, 0.78, 1.0) * cl * (0.05 + 0.3 * day) * f * uReveal * uOn, 1.0); }' }));
      const cMesh = new THREE.Mesh(new THREE.SphereGeometry(1.014, 128, 96), cm); spinG.add(cMesh); out.clouds = cMesh;
      loader.load(res('earth_clouds_1024.png'), (tx) => { cm.uniforms.uTex.value = tx; cm.uniforms.uOn.value = 1; }, undefined, () => { cMesh.visible = false; });
    }
    return out;
  };

  // ---------- theatre ----------
  K.theatre = (c) => {
    const { THREE, U, TAU, deg, scene, spinG, hdr, additive, glowTex, canvasTex, FULL, allSats, xlinks, bracketGeo, nI } = c, V3 = THREE.Vector3, MU = THREE.MathUtils;
    let t = 0; const FLY = !!c.flyOnly, OUT = !!c.flyOut, GK = FLY ? 0.35 : 1;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const invSpin = new THREE.Matrix4();
    const toW = (v) => v.applyMatrix4(spinG.matrixWorld), toL = (v) => v.applyMatrix4(invSpin);
    const Y_AXIS = new V3(0, 1, 0), Z_AXIS = new V3(0, 0, 1), NEG_Y = new V3(0, -1, 0), NZ = new V3(0, 0, -1);
    const T1 = new V3(), T2 = new V3(), T3 = new V3(), tA = new V3(), tB = new V3(), tC = new V3(), tq = new V3(), rv = new V3(), rv2 = new V3(), tmpS = new V3(), tmpU = new V3(), tmpW = new V3(), tmpR = new V3(), MT1 = new V3(), MT2 = new V3(), DT1 = new V3(), DT2 = new V3(), NT = new V3(), R1 = new V3();
    const geo = (lat, lon, r = 1) => { const th = deg(90 - lat), ph = deg(lon + 180); return new V3(-Math.cos(ph) * Math.sin(th) * r, Math.cos(th) * r, Math.sin(ph) * Math.sin(th) * r); };
    const east = (n, out) => { out.set(n.z, 0, -n.x); if (out.lengthSq() < 1e-10) out.set(1, 0, 0); return out.normalize(); };
    const north = (n, out) => { east(n, NT); return out.crossVectors(n, NT).normalize(); };
    const dirAt = (n, h, out) => { east(n, DT1); DT2.crossVectors(n, DT1).normalize(); return out.copy(DT2).multiplyScalar(Math.cos(h)).addScaledVector(DT1, Math.sin(h)).normalize(); };
    const move = (n, h, d, out) => { MT1.copy(n).normalize(); dirAt(MT1, h, MT2); return out.copy(MT1).multiplyScalar(Math.cos(d)).addScaledVector(MT2, Math.sin(d)).normalize(); };
    const slerpV = (a, b, s, out) => { const om = Math.acos(MU.clamp(a.dot(b) / (a.length() * b.length()), -1, 1)); if (om < 1e-6) return out.copy(a); const so = Math.sin(om), ka = Math.sin((1 - s) * om) / so, kb = Math.sin(s * om) / so; return out.set(a.x * ka + b.x * kb, a.y * ka + b.y * kb, a.z * ka + b.z * kb); };
    const arcPath = (a, b, H) => { const r0 = a.length(), r1 = b.length(), A = a.clone().normalize(), B = b.clone().normalize(); return (s, out) => slerpV(A, B, s, out).multiplyScalar(r0 + (r1 - r0) * s + H * 4 * s * (1 - s)); };
    const bez = (p0, p1, p2) => (s, out) => { const u = 1 - s; return out.set(p0.x * u * u + p1.x * 2 * s * u + p2.x * s * s, p0.y * u * u + p1.y * 2 * s * u + p2.y * s * s, p0.z * u * u + p1.z * 2 * s * u + p2.z * s * s); };
    const rndDir = (out, k) => out.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(k);

    // ----- materials -----
    const rimify = (mat, k = 0.6, col = 0x8fcaff) => { const rc = hdr(col, k); mat.onBeforeCompile = (sh) => { sh.uniforms.uRimU = { value: rc }; sh.fragmentShader = 'uniform vec3 uRimU;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uRimU * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);'); }; mat.customProgramCacheKey = () => 'rimU'; return mat; };
    const std = (col, m, r, o = {}) => rimify(new THREE.MeshStandardMaterial(Object.assign({ color: col, metalness: m, roughness: r, emissive: col, emissiveIntensity: 0.14 }, o)));
    const UM = {
      olive: std(0x858c58, 0.25, 0.55), sand: std(0xd6c094, 0.15, 0.55), drab: std(0x76815c, 0.3, 0.55),
      jet: std(0xa3aebd, 0.55, 0.34), uav: std(0xe0e4ea, 0.35, 0.4), shahed: std(0x8f96a0, 0.4, 0.48),
      hull: std(0x9ba7b4, 0.45, 0.42), deck: std(0x4c5560, 0.3, 0.72), white: std(0xeef1f5, 0.15, 0.35),
      steel: rimify(new THREE.MeshPhysicalMaterial({ color: 0xc9d0da, metalness: 1, roughness: 0.24, clearcoat: 0.3 })),
      dark: std(0x23272e, 0.6, 0.5), black: std(0x0e1014, 0.3, 0.65), tile: std(0x16181d, 0.15, 0.85),
      glass: rimify(new THREE.MeshPhysicalMaterial({ color: 0x1b2f4f, metalness: 0.3, roughness: 0.05, clearcoat: 1, iridescence: 0.8, iridescenceIOR: 1.7 })),
      red: std(0xa8402f, 0.2, 0.6), blue: std(0x2f5fa0, 0.2, 0.6), orange: std(0xc9782c, 0.2, 0.6), hullRed: std(0x6a2d2a, 0.3, 0.6), conc: std(0x8d9097, 0.1, 0.9),
      dishW: std(0xf2f4f7, 0.3, 0.35, { side: THREE.DoubleSide }),
    };

    // ----- geometry helpers + merge -----
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const Cy = (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
    const CX = (rt, rb, h, seg = 12) => Cy(rt, rb, h, seg).rotateZ(-Math.PI / 2);
    const CZ = (r, h, seg = 12) => Cy(r, r, h, seg).rotateX(Math.PI / 2);
    const Sp = (r, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
    const shp = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const poly = (pts, depth) => new THREE.ExtrudeGeometry(shp(pts), { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
    const planXZ = (pts, th) => poly(pts, th).rotateX(Math.PI / 2);
    const prismY = (pts, h) => new THREE.ExtrudeGeometry(shp(pts), { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const latheX = (prof, seg = 16, p0 = 0, pl = TAU) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg, p0, pl).rotateZ(-Math.PI / 2);
    const rod = (p1, p2, r = 0.006, seg = 5) => { const a = new V3(...p1), b = new V3(...p2), L = a.distanceTo(b); return Cy(r, r, L, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, b.clone().sub(a).normalize())).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); };
    const build = (fn) => {
      const parts = []; fn((g, m, p, r, s) => parts.push({ g, m, p, r, s }));
      const byMat = new Map(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
      for (const q of parts) {
        const g = q.g.index ? q.g.toNonIndexed() : q.g;
        const r = q.r || [0, 0, 0];
        M4.compose(new V3(...(q.p || [0, 0, 0])), Q.setFromEuler(E.set(r[0], r[1], r[2])), new V3(...(q.s || [1, 1, 1])));
        g.applyMatrix4(M4);
        if (!byMat.has(q.m)) byMat.set(q.m, []); byMat.get(q.m).push(g);
      }
      let total = 0; for (const arr of byMat.values()) for (const g of arr) total += g.attributes.position.count;
      const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), out = new THREE.BufferGeometry(), mats = [];
      let off = 0;
      for (const [m, arr] of byMat) { const st = off; for (const g of arr) { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); off += g.attributes.position.count; g.dispose(); } out.addGroup(st, off - st, mats.length); mats.push(m); }
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.computeBoundingSphere();
      return { geo: out, mats };
    };

    // ----- models (forward +X, up +Y; ground vehicles sit on y = 0; rockets/missiles have their origin at the engine end) -----
    const MODELS = {
      tank: (a) => {
        a(B(1.0, 0.2, 0.5), UM.olive, [0, 0.18, 0]); a(B(0.28, 0.1, 0.5), UM.olive, [0.46, 0.21, 0], [0, 0, -0.5]);
        for (const z of [-0.27, 0.27]) { a(B(1.04, 0.15, 0.13), UM.black, [0, 0.085, z]); a(B(0.98, 0.03, 0.16), UM.olive, [0, 0.27, z]); for (let k = 0; k < 6; k++) a(CZ(0.06, 0.03), UM.dark, [-0.38 + k * 0.152, 0.075, z * 1.26]); }
        a(B(0.52, 0.15, 0.4), UM.olive, [-0.06, 0.355, 0]); a(B(0.22, 0.12, 0.36), UM.olive, [-0.39, 0.35, 0]);
        a(CX(0.022, 0.027, 0.62), UM.dark, [0.5, 0.37, 0]); a(CX(0.034, 0.034, 0.06), UM.dark, [0.79, 0.37, 0]);
        a(Cy(0.045, 0.05, 0.05), UM.olive, [-0.12, 0.455, 0.1]); a(B(0.08, 0.04, 0.08), UM.dark, [0.06, 0.45, -0.12]); a(Cy(0.005, 0.005, 0.25), UM.dark, [-0.42, 0.55, -0.14]);
      },
      jet: (a) => {
        a(latheX([[0, -0.5], [0.05, -0.47], [0.068, -0.3], [0.074, 0], [0.062, 0.2], [0.036, 0.37], [0, 0.5]], 14), UM.jet, [0, 0, 0], [0, 0, 0], [1, 0.8, 1.25]);
        a(Sp(1, 12, 8), UM.glass, [0.2, 0.055, 0], [0, 0, 0], [0.13, 0.045, 0.05]);
        a(planXZ([[0.12, 0.07], [-0.2, 0.46], [-0.3, 0.46], [-0.28, 0.07], [-0.28, -0.07], [-0.3, -0.46], [-0.2, -0.46], [0.12, -0.07]], 0.014), UM.jet);
        a(planXZ([[-0.34, 0.06], [-0.47, 0.24], [-0.54, 0.24], [-0.52, 0.06], [-0.52, -0.06], [-0.54, -0.24], [-0.47, -0.24], [-0.34, -0.06]], 0.01), UM.jet, [0, 0.01, 0]);
        for (const z of [-1, 1]) { a(poly([[-0.3, 0], [-0.45, 0.2], [-0.51, 0.2], [-0.49, 0]], 0.01), UM.jet, [0, 0.02, z * 0.07], [z * 0.3, 0, 0]); a(B(0.18, 0.06, 0.04), UM.jet, [0.06, -0.005, z * 0.085]); }
        a(CX(0.042, 0.05, 0.07), UM.dark, [-0.52, 0, 0]);
      },
      uav: (a) => {
        a(latheX([[0, -0.3], [0.035, -0.26], [0.05, -0.05], [0.06, 0.15], [0.052, 0.26], [0, 0.32]], 14), UM.uav);
        a(B(0.1, 0.012, 1.0), UM.uav, [0.03, 0.035, 0]);
        for (const z of [-0.16, 0.16]) { a(B(0.42, 0.016, 0.016), UM.uav, [-0.2, 0.035, z]); a(poly([[-0.38, 0], [-0.44, 0.1], [-0.48, 0.1], [-0.48, 0]], 0.008), UM.uav, [0, 0.035, z]); }
        a(B(0.06, 0.008, 0.34), UM.uav, [-0.46, 0.13, 0]); a(Cy(0.07, 0.07, 0.004, 16), UM.dark, [-0.31, 0, 0], [0, 0, Math.PI / 2]); a(Sp(0.03, 10, 8), UM.glass, [0.2, -0.045, 0]);
      },
      shahed: (a) => {
        a(planXZ([[0.45, 0.04], [-0.2, 0.5], [-0.38, 0.5], [-0.38, -0.5], [-0.2, -0.5], [0.45, -0.04]], 0.03), UM.shahed);
        a(latheX([[0, -0.42], [0.05, -0.36], [0.065, 0.1], [0.045, 0.4], [0, 0.52]], 12), UM.shahed);
        for (const z of [-0.5, 0.5]) a(poly([[-0.2, -0.07], [-0.38, -0.07], [-0.38, 0.09], [-0.28, 0.09]], 0.014), UM.shahed, [0, 0, z]);
        a(Cy(0.09, 0.09, 0.006, 14), UM.dark, [-0.43, 0, 0], [0, 0, Math.PI / 2]);
      },
      quad: (a) => {
        a(B(0.3, 0.1, 0.3), UM.dark, [0, 0.05, 0]); for (const r of [Math.PI / 4, -Math.PI / 4]) a(B(1.0, 0.04, 0.06), UM.dark, [0, 0.05, 0], [0, r, 0]);
        for (const [x, z] of [[0.35, 0.35], [0.35, -0.35], [-0.35, 0.35], [-0.35, -0.35]]) { a(Cy(0.05, 0.05, 0.08, 10), UM.black, [x, 0.07, z]); a(Cy(0.2, 0.2, 0.006, 16), UM.dark, [x, 0.115, z]); }
      },
      destroyer: (a) => {
        const hull = [[0.5, 0], [0.3, 0.065], [-0.44, 0.065], [-0.5, 0.045], [-0.5, -0.045], [-0.44, -0.065], [0.3, -0.065]];
        a(prismY(hull, 0.06), UM.hull); a(prismY(hull.map(([x, z]) => [x * 0.985, z * 0.94]), 0.006), UM.deck, [0, 0.058, 0]);
        a(B(0.2, 0.09, 0.1), UM.hull, [0.1, 0.105, 0]); a(B(0.08, 0.05, 0.11), UM.hull, [0.17, 0.17, 0]);
        a(Cy(0.006, 0.01, 0.16), UM.hull, [0.08, 0.25, 0]); a(B(0.006, 0.006, 0.08), UM.hull, [0.08, 0.29, 0]); a(Sp(0.012, 8, 6), UM.white, [0.08, 0.335, 0]);
        a(B(0.06, 0.07, 0.05), UM.hull, [-0.05, 0.11, 0]); a(B(0.06, 0.07, 0.05), UM.hull, [-0.14, 0.11, 0]); a(B(0.14, 0.07, 0.1), UM.hull, [-0.27, 0.095, 0]);
        a(B(0.05, 0.03, 0.04), UM.hull, [0.33, 0.077, 0]); a(CX(0.004, 0.005, 0.08), UM.dark, [0.39, 0.08, 0]);
        a(B(0.08, 0.004, 0.06), UM.dark, [0.24, 0.065, 0]); a(B(0.07, 0.004, 0.06), UM.dark, [-0.37, 0.065, 0]);
      },
      carrier: (a) => {
        a(prismY([[0.5, 0], [0.38, 0.09], [-0.48, 0.1], [-0.5, 0.08], [-0.5, -0.08], [-0.48, -0.1], [0.38, -0.09]], 0.07), UM.hull);
        a(prismY([[0.5, 0.04], [0.44, 0.13], [-0.5, 0.15], [-0.5, -0.15], [0.44, -0.13], [0.5, -0.04]], 0.012), UM.deck, [0, 0.07, 0]);
        a(B(0.11, 0.09, 0.035), UM.hull, [-0.05, 0.127, 0.11]); a(Cy(0.005, 0.008, 0.07), UM.hull, [-0.05, 0.2, 0.11]);
        a(B(0.92, 0.002, 0.005), UM.white, [0, 0.083, 0]); a(B(0.55, 0.002, 0.005), UM.white, [-0.15, 0.083, -0.04], [0, 0.16, 0]);
        for (let k = 0; k < 4; k++) a(planXZ([[0.03, 0], [-0.03, 0.025], [-0.03, -0.025]], 0.006), UM.jet, [0.3 - k * 0.12, 0.086, -0.07 + (k % 2) * 0.03]);
      },
      cargo: (a) => {
        const hull = [[0.5, 0], [0.36, 0.07], [-0.46, 0.07], [-0.5, 0.05], [-0.5, -0.05], [-0.46, -0.07], [0.36, -0.07]];
        a(prismY(hull, 0.06), UM.hullRed); a(prismY(hull.map(([x, z]) => [x * 0.98, z * 0.92]), 0.004), UM.deck, [0, 0.058, 0]);
        const cols = [UM.red, UM.blue, UM.white, UM.orange];
        for (let k = 0; k < 7; k++) for (let j = 0; j < 2; j++) { a(B(0.07, 0.034, 0.056), cols[(k * 3 + j) % 4], [0.24 - k * 0.08, 0.079, -0.03 + j * 0.06]); if ((k + j) % 3) a(B(0.07, 0.03, 0.056), cols[(k + j * 2 + 1) % 4], [0.24 - k * 0.08, 0.111, -0.03 + j * 0.06]); }
        a(B(0.08, 0.1, 0.12), UM.white, [-0.42, 0.11, 0]); a(B(0.03, 0.05, 0.03), UM.dark, [-0.46, 0.18, 0]);
      },
      dome: (a, col = UM.sand) => {
        a(B(0.9, 0.06, 0.4), col, [0, 0.07, 0]); for (const x of [-0.28, 0.28]) for (const z of [-0.2, 0.2]) a(CZ(0.05, 0.04), UM.black, [x, 0.05, z]);
        a(B(0.6, 0.36, 0.42), col, [-0.02, 0.33, 0], [0, 0, 0.95]); a(B(0.012, 0.32, 0.38), UM.black, [0.155, 0.575, 0], [0, 0, 0.95]);
        a(B(0.04, 0.05, 0.62), UM.dark, [0.32, 0.03, 0]); a(B(0.04, 0.05, 0.62), UM.dark, [-0.32, 0.03, 0]);
      },
      radarBase: (a) => { a(B(0.7, 0.08, 0.36), UM.sand, [0, 0.09, 0]); for (const x of [-0.22, 0.22]) for (const z of [-0.18, 0.18]) a(CZ(0.05, 0.04), UM.black, [x, 0.05, z]); a(Cy(0.04, 0.05, 0.22), UM.sand, [0, 0.24, 0]); },
      radarHead: (a) => { a(B(0.06, 0.5, 0.64), UM.sand, [0, 0.25, 0], [0, 0, -0.3]); a(B(0.008, 0.46, 0.6), UM.dark, [0.036, 0.25, 0], [0, 0, -0.3]); },
      arrow: (a) => {
        a(B(0.9, 0.06, 0.36), UM.sand, [0, 0.07, 0]); a(B(0.22, 0.18, 0.36), UM.sand, [0.42, 0.16, 0]); for (const x of [-0.3, 0, 0.42]) for (const z of [-0.18, 0.18]) a(CZ(0.05, 0.04), UM.black, [x, 0.05, z]);
        for (let i = 0; i < 3; i++) for (const z of [-0.06, 0.06]) a(Cy(0.055, 0.055, 0.62, 12), UM.sand, [-0.3 + i * 0.115, 0.4, z], [0, 0, 0.18]);
      },
      laser: (a) => {
        a(B(0.8, 0.3, 0.36), UM.sand, [0, 0.2, 0]); for (const x of [-0.25, 0.25]) for (const z of [-0.18, 0.18]) a(CZ(0.05, 0.04), UM.black, [x, 0.05, z]);
        a(Cy(0.12, 0.14, 0.08, 16), UM.sand, [0.15, 0.39, 0]); a(Sp(0.11, 16, 12), UM.sand, [0.15, 0.5, 0]); a(CX(0.07, 0.07, 0.03, 20), UM.glass, [0.255, 0.52, 0]); a(B(0.12, 0.08, 0.1), UM.dark, [-0.25, 0.39, 0]);
      },
      tel: (a) => {
        a(B(1.0, 0.1, 0.3), UM.drab, [0, 0.1, 0]); a(B(0.22, 0.2, 0.3), UM.drab, [0.42, 0.2, 0]); for (const x of [-0.35, -0.15, 0.1, 0.38]) for (const z of [-0.16, 0.16]) a(CZ(0.06, 0.05), UM.black, [x, 0.06, z]);
        a(Cy(0.05, 0.05, 0.62, 12), UM.white, [-0.3, 0.48, 0], [0, 0, 0.08]); a(Cy(0, 0.05, 0.14, 12), UM.drab, [-0.325, 0.86, 0], [0, 0, 0.08]); a(B(0.06, 0.4, 0.06), UM.dark, [-0.22, 0.3, 0], [0, 0, 0.5]);
      },
      gsBase: (a) => { a(B(0.26, 0.04, 0.26), UM.deck, [0, 0.02, 0]); a(Cy(0.07, 0.11, 0.34, 14), UM.white, [0, 0.21, 0]); a(B(0.16, 0.1, 0.16), UM.white, [0, 0.38, 0]); },
      gsDish: (a) => {
        a(new THREE.SphereGeometry(0.42, 28, 8, 0, TAU, 0, 0.75).rotateZ(Math.PI / 2).translate(0.38, 0, 0), UM.dishW);
        for (let k = 0; k < 3; k++) { const an = k / 3 * TAU; a(rod([0.073, Math.cos(an) * 0.27, Math.sin(an) * 0.27], [0.2, 0, 0], 0.006), UM.white); }
        a(Cy(0.025, 0.03, 0.08, 10), UM.white, [0.22, 0, 0], [0, 0, Math.PI / 2]); a(B(0.1, 0.12, 0.12), UM.white, [-0.08, 0, 0]);
      },
      tower: (a) => { a(B(0.42, 0.03, 0.42), UM.deck, [0, 0.015, 0]); a(B(0.1, 1.0, 0.1), UM.hull, [0.2, 0.52, 0]); for (let k = 0; k < 10; k++) a(B(0.112, 0.012, 0.112), UM.white, [0.2, 0.08 + k * 0.1, 0]); a(B(0.16, 0.025, 0.04), UM.steel, [0.1, 0.82, 0]); a(B(0.16, 0.025, 0.04), UM.steel, [0.1, 0.62, 0]); a(Cy(0.004, 0.004, 0.2), UM.dark, [0.2, 1.12, 0]); a(B(0.2, 0.06, 0.2), UM.dark, [0, 0.07, 0]); },
      f9b: (a) => {
        a(CX(0.05, 0.05, 0.66, 16), UM.white, [0.33, 0, 0]); a(CX(0.051, 0.051, 0.06, 16), UM.black, [0.69, 0, 0]);
        for (let k = 0; k < 4; k++) { const an = k / 4 * TAU + Math.PI / 4; a(B(0.014, 0.04, 0.04), UM.dark, [0.69, Math.cos(an) * 0.068, Math.sin(an) * 0.068], [an, 0, 0]); a(B(0.17, 0.01, 0.02), UM.black, [0.09, Math.cos(an) * 0.053, Math.sin(an) * 0.053], [an, 0, 0]); }
        a(CX(0.044, 0.052, 0.03, 16), UM.dark, [-0.01, 0, 0]);
      },
      f9u: (a) => { a(CX(0.05, 0.05, 0.14, 16), UM.white, [0.07, 0, 0]); a(CX(0.026, 0.044, 0.04, 14), UM.dark, [-0.02, 0, 0]); a(latheX([[0, 0], [0.062, 0], [0.062, 0.08], [0.044, 0.12], [0, 0.15]], 18), UM.white, [0.14, 0, 0]); },
      ssb: (a) => {
        a(CX(0.05, 0.05, 0.56, 24), UM.steel, [0.28, 0, 0]); a(CX(0.051, 0.051, 0.04, 24), UM.dark, [0.58, 0, 0]);
        for (let k = 0; k < 4; k++) { const an = k / 4 * TAU + Math.PI / 4; a(B(0.012, 0.04, 0.04), UM.dark, [0.53, Math.cos(an) * 0.065, Math.sin(an) * 0.065], [an, 0, 0]); }
        a(CX(0.045, 0.05, 0.02, 24), UM.dark, [-0.008, 0, 0]);
      },
      sss: (a) => {
        a(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 24, 1, false, 0, Math.PI).rotateZ(-Math.PI / 2), UM.steel, [0.17, 0, 0]);
        a(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 24, 1, false, Math.PI, Math.PI).rotateZ(-Math.PI / 2), UM.tile, [0.17, 0, 0]);
        const nose = [[0.05, 0], [0.048, 0.03], [0.038, 0.06], [0.02, 0.085], [0, 0.1]];
        a(latheX(nose, 24, 0, Math.PI), UM.steel, [0.34, 0, 0]); a(latheX(nose, 24, Math.PI, Math.PI), UM.tile, [0.34, 0, 0]);
        for (const z of [-1, 1]) { a(planXZ([[0.0, 0.045 * z], [0.1, 0.045 * z], [0.08, 0.1 * z], [0.01, 0.1 * z]], 0.006), UM.dark); a(planXZ([[0.3, 0.04 * z], [0.37, 0.04 * z], [0.35, 0.075 * z], [0.31, 0.075 * z]], 0.005), UM.dark); }
        for (let k = 0; k < 6; k++) { const an = k / 6 * TAU, rr = k < 3 ? 0.015 : 0.032; a(CX(0.008, 0.012, 0.02, 10), UM.dark, [-0.008, Math.cos(an) * rr, Math.sin(an) * rr]); }
      },
      rocket: (a) => {
        a(CX(0.06, 0.06, 0.8, 16), UM.white, [0.4, 0, 0]); a(CX(0.061, 0.061, 0.03, 16), UM.dark, [0.42, 0, 0]); a(latheX([[0.06, 0], [0.053, 0.08], [0.03, 0.16], [0, 0.2]], 16), UM.white, [0.8, 0, 0]);
        for (let k = 0; k < 4; k++) { const an = k / 4 * TAU; a(B(0.12, 0.06, 0.006), UM.dark, [0.06, Math.cos(an) * 0.08, Math.sin(an) * 0.08], [an, 0, 0]); }
        a(CX(0.03, 0.04, 0.03, 14), UM.dark, [-0.01, 0, 0]);
      },
      lm: (a) => {
        MODELS.rocket(a);
        for (let k = 0; k < 4; k++) { const an = k / 4 * TAU + Math.PI / 4, y = Math.cos(an) * 0.075, z = Math.sin(an) * 0.075; a(CX(0.03, 0.03, 0.42, 12), UM.white, [0.21, y, z]); a(Cy(0, 0.03, 0.1, 12).rotateZ(-Math.PI / 2), UM.white, [0.47, y, z]); a(CX(0.022, 0.03, 0.02, 10), UM.dark, [-0.01, y, z]); }
      },
      missile: (a) => { a(CX(0.05, 0.05, 0.72, 14), UM.white, [0.36, 0, 0]); a(latheX([[0.05, 0], [0.042, 0.1], [0.022, 0.22], [0, 0.28]], 14), UM.dark, [0.72, 0, 0]); for (let k = 0; k < 4; k++) { const an = k / 4 * TAU; a(B(0.1, 0.06, 0.006), UM.dark, [0.05, Math.cos(an) * 0.07, Math.sin(an) * 0.07], [an, 0, 0]); } },
      interceptor: (a) => { a(CX(0.035, 0.035, 0.55, 12), UM.white, [0.275, 0, 0]); a(CX(0.03, 0.03, 0.25, 12), UM.white, [0.675, 0, 0]); a(CX(0.036, 0.036, 0.02, 12), UM.dark, [0.55, 0, 0]); a(latheX([[0.03, 0], [0.02, 0.07], [0, 0.12]], 12), UM.white, [0.8, 0, 0]); for (let k = 0; k < 4; k++) { const an = k / 4 * TAU; a(B(0.09, 0.045, 0.004), UM.dark, [0.05, Math.cos(an) * 0.055, Math.sin(an) * 0.055], [an, 0, 0]); } },
      hgv: (a) => { a(planXZ([[0.5, 0], [-0.5, 0.3], [-0.5, -0.3]], 0.08), UM.black); a(planXZ([[0.45, 0], [-0.5, 0.12], [-0.5, -0.12]], 0.06), UM.dark, [0, 0.05, 0]); },
    };

    // ----- instanced fleets (one InstancedMesh per model type, children of the spinning globe) -----
    const _x = new V3(), _y = new V3(), _z = new V3(), _alt = new V3(), _sv = new V3(), _m4 = new THREE.Matrix4(), ZM = new THREE.Matrix4().makeScale(0, 0, 0);
    const fleet = (fn, max, s) => {
      const b = build(fn), im = new THREE.InstancedMesh(b.geo, b.mats, max); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < max; i++) im.setMatrixAt(i, ZM); spinG.add(im);
      const free = []; for (let i = max - 1; i >= 0; i--) free.push(i);
      const f = { im, s, dirty: true,
        add: () => (free.length ? free.pop() : -1),
        hide: (i) => { if (i >= 0) { im.setMatrixAt(i, ZM); f.dirty = true; } },
        release: (i) => { if (i >= 0) { im.setMatrixAt(i, ZM); f.dirty = true; free.push(i); } },
        place: (i, p, fw, up, sc = s) => { if (i < 0) return; _x.copy(fw).normalize(); _z.crossVectors(_x, up); if (_z.lengthSq() < 1e-10) { _alt.set(0, 1, 0); if (Math.abs(_x.y) > 0.9) _alt.set(1, 0, 0); _z.crossVectors(_x, _alt); } _z.normalize(); _y.crossVectors(_z, _x); _m4.makeBasis(_x, _y, _z).scale(_sv.set(sc, sc, sc)).setPosition(p); im.setMatrixAt(i, _m4); f.dirty = true; },
      };
      return f;
    };
    const F = {
      tank: fleet(MODELS.tank, 9, 0.056), jet: fleet(MODELS.jet, 8, 0.07), uav: fleet(MODELS.uav, 3, 0.068), shahed: fleet(MODELS.shahed, 8, 0.04), quad: fleet(MODELS.quad, 4, 0.03),
      destroyer: fleet(MODELS.destroyer, 7, 0.09), carrier: fleet(MODELS.carrier, 3, 0.11), cargo: fleet(MODELS.cargo, 3, 0.09),
      dome: fleet(MODELS.dome, 1, 0.045), sam: fleet((a) => MODELS.dome(a, UM.drab), 2, 0.042), radarBase: fleet(MODELS.radarBase, 1, 0.042), radarHead: fleet(MODELS.radarHead, 1, 0.042),
      arrow: fleet(MODELS.arrow, 1, 0.048), laser: fleet(MODELS.laser, 1, 0.045), tel: fleet(MODELS.tel, 3, 0.05), gsBase: fleet(MODELS.gsBase, 5, 0.042), gsDish: fleet(MODELS.gsDish, 5, 0.042),
      tower: fleet(MODELS.tower, 5, 0.12), f9b: fleet(MODELS.f9b, 2, 0.12), f9u: fleet(MODELS.f9u, 2, 0.12), ssb: fleet(MODELS.ssb, 1, 0.16), sss: fleet(MODELS.sss, 1, 0.16),
      rocket: fleet(MODELS.rocket, 3, 0.09), lm: fleet(MODELS.lm, 1, 0.1), missile: fleet(MODELS.missile, 3, 0.05), interceptor: fleet(MODELS.interceptor, 9, 0.034), hgv: fleet(MODELS.hgv, 1, 0.036),
    };

    // ----- particles (spinG-local): additive fire/sparks/glows + lit smoke -----
    const smokeTex = canvasTex(128, (g) => { for (let i = 0; i < 16; i++) { const a = Math.random() * TAU, r = Math.random() * 24, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, s = 16 + Math.random() * 22; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, 'rgba(255,255,255,0.34)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); } });
    const fxVS = `attribute vec4 aCol; attribute float aSize; attribute float aRot; uniform float uPx, uD, uLit; uniform vec3 uSun; varying vec4 vCol; varying float vRot;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vec4 mv = viewMatrix * wp;
 float lit = mix(1.0, 0.2 + 0.95 * smoothstep(-0.3, 0.35, dot(normalize(wp.xyz), uSun)), uLit);
 vCol = vec4(aCol.rgb * lit, aCol.a); vRot = aRot;
 gl_PointSize = aSize * uPx * uD / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; if (aSize <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`;
    const fxFS = (add) => `uniform sampler2D uTex; varying vec4 vCol; varying float vRot;
void main(){ vec2 q = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot); q = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y); float m = texture2D(uTex, q + 0.5).a; if (m < 0.004) discard; ${add ? 'gl_FragColor = vec4(vCol.rgb * m, 1.0);' : 'gl_FragColor = vec4(vCol.rgb, vCol.a * m);'} }`;
    const makeFX = (N, add, tex) => {
      const G = 220, TT = N + G;
      const pos = new Float32Array(TT * 3), col = new Float32Array(TT * 4), size = new Float32Array(TT), rot = new Float32Array(TT);
      const vel = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N), s0 = new Float32Array(N), s1 = new Float32Array(N), c0 = new Float32Array(N * 4), drag = new Float32Array(N), grav = new Float32Array(N), alive = new Uint8Array(N);
      for (let i = 0; i < TT; i++) rot[i] = Math.random() * TAU;
      const g = new THREE.BufferGeometry();
      const aP = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), aC = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage), aS = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', aP); g.setAttribute('aCol', aC); g.setAttribute('aSize', aS); g.setAttribute('aRot', new THREE.BufferAttribute(rot, 1));
      const mat = new THREE.ShaderMaterial({ uniforms: { uTex: { value: tex }, uPx: U.px, uD: { value: c.D }, uSun: U.sun, uLit: { value: add ? 0 : 1 } }, vertexShader: fxVS, fragmentShader: fxFS(add), transparent: true, depthWrite: false });
      if (add) additive(mat);
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = add ? 6 : 5; spinG.add(pts);
      let head = 0, gN = 0, gPrev = 0, nAlive = 0;
      return {
        emit(p, v, lf, a, b, r, gg, bb, al = 1, dr = 0, gr = 0) { const i = head; head = (head + 1) % N; const j = i * 3, q = i * 4; pos[j] = p.x; pos[j + 1] = p.y; pos[j + 2] = p.z; if (v) { vel[j] = v.x; vel[j + 1] = v.y; vel[j + 2] = v.z; } else vel[j] = vel[j + 1] = vel[j + 2] = 0; age[i] = 0; life[i] = lf; s0[i] = a; s1[i] = b; const gk = add ? GK : 1; c0[q] = r * gk; c0[q + 1] = gg * gk; c0[q + 2] = bb * gk; c0[q + 3] = al; drag[i] = dr; grav[i] = gr; if (!alive[i]) nAlive++; alive[i] = 1; size[i] = a; },
        glow(p, s, r, gg, bb, al = 1) { if (gN >= G) return; const i = N + gN++, j = i * 3, q = i * 4; pos[j] = p.x; pos[j + 1] = p.y; pos[j + 2] = p.z; size[i] = s; if (add) { col[q] = r * al * GK; col[q + 1] = gg * al * GK; col[q + 2] = bb * al * GK; col[q + 3] = 1; } else { col[q] = r; col[q + 1] = gg; col[q + 2] = bb; col[q + 3] = al; } },
        update(dt) {
          if (nAlive) for (let i = 0; i < N; i++) {
            if (!alive[i]) continue;
            age[i] += dt; const k = age[i] / life[i];
            if (k >= 1) { alive[i] = 0; nAlive--; size[i] = 0; continue; }
            const j = i * 3; let vx = vel[j], vy = vel[j + 1], vz = vel[j + 2], px = pos[j], py = pos[j + 1], pz = pos[j + 2];
            if (grav[i]) { const gk = grav[i] * dt / (Math.hypot(px, py, pz) || 1); vx -= px * gk; vy -= py * gk; vz -= pz * gk; }
            if (drag[i]) { const f = Math.max(0, 1 - drag[i] * dt); vx *= f; vy *= f; vz *= f; }
            px += vx * dt; py += vy * dt; pz += vz * dt;
            const l2 = px * px + py * py + pz * pz; if (l2 < 1.0) { const f = 1.0015 / Math.sqrt(l2); px *= f; py *= f; pz *= f; vx = vy = vz = 0; }
            vel[j] = vx; vel[j + 1] = vy; vel[j + 2] = vz; pos[j] = px; pos[j + 1] = py; pos[j + 2] = pz;
            const q = i * 4;
            if (add) { size[i] = s0[i] + (s1[i] - s0[i]) * k; const f = Math.pow(1 - k, 1.6); col[q] = c0[q] * f; col[q + 1] = c0[q + 1] * f; col[q + 2] = c0[q + 2] * f; col[q + 3] = 1; }
            else { size[i] = s0[i] + (s1[i] - s0[i]) * (1 - (1 - k) * (1 - k)); col[q] = c0[q]; col[q + 1] = c0[q + 1]; col[q + 2] = c0[q + 2]; col[q + 3] = c0[q + 3] * Math.min(1, k * 16) * Math.pow(1 - k, 1.1); }
          }
          for (let i = N + gN; i < N + gPrev; i++) size[i] = 0;
          gPrev = gN; gN = 0;
          aP.needsUpdate = true; aC.needsUpdate = true; aS.needsUpdate = true;
        },
      };
    };
    const FIRE = makeFX(4500, true, glowTex), SMOKE = makeFX(3500, false, smokeTex);
    const engine = (p, v, back, k = 1, sk = 1) => { tA.copy(p).addScaledVector(v, -back); FIRE.glow(tA, 0.014 * k, 6, 3.6, 1.6); FIRE.emit(tA, rv.copy(v).multiplyScalar(-0.14 * k).add(rndDir(rv2, 0.01)), 0.18, 0.011 * k, 0.004, 4.5, 2.2, 0.8); if (sk > 0) { const vac = MU.smoothstep(tA.length(), 1.1, 1.2); SMOKE.emit(tA, rndDir(rv, 0.003), rnd(2.2, 3.4), 0.01 * sk, (0.045 + 0.04 * vac) * sk, 0.86, 0.88, 0.92, 0.5 * (1 - 0.7 * vac), 0.6); } };
    const plume = (base, ex, k, vac, sm = 1) => { FIRE.glow(base, 0.02 * k, 7, 4.2, 2); for (let i = 0; i < 2; i++) FIRE.emit(base, rv.copy(ex).multiplyScalar(0.22 * k).add(rndDir(rv2, 0.025 * k)), rnd(0.14, 0.26), 0.013 * k, 0.004, 5.5, 2.8, 1.1); if (Math.random() < 0.95) SMOKE.emit(base, rv.copy(ex).multiplyScalar(0.03).add(rndDir(rv2, 0.004)), rnd(2.8, 4) * (0.4 + 0.6 * sm), 0.014 * k, (0.06 + 0.09 * vac) * k, 0.88, 0.9, 0.94, 0.5 * (1 - 0.65 * vac) * sm, 0.5); };
    const vplume = (base, ex, k) => { FIRE.glow(base, 0.012 * k, 4, 5, 7); FIRE.emit(base, rv.copy(ex).multiplyScalar(0.12).add(rndDir(rv2, 0.01)), 0.3, 0.01 * k, 0.02 * k, 1.6, 2.4, 3.6); };
    const groundCloud = (P, n, k, cnt) => { east(n, tB); for (let i = 0; i < cnt; i++) { rv.copy(tB).applyAxisAngle(n, rnd(0, TAU)).multiplyScalar(rnd(0.025, 0.06) * k); SMOKE.emit(P, rv, rnd(3, 5), 0.016 * k, rnd(0.07, 0.11) * k, 0.9, 0.9, 0.92, 0.55, 1.4); } };
    const boom = (p, k = 1, sk = 1) => {
      FIRE.emit(p, null, 0.3 + 0.1 * k, 0.04 * k, 0.15 * k, 9, 8, 7);
      FIRE.emit(p, null, 0.75, 0.03 * k, 0.08 * k, 3.6, 1.6, 0.5);
      tB.copy(p).normalize();
      for (let i = 0; i < 14 * k + 4; i++) { rndDir(rv, 1).normalize(); const dd = rv.dot(tB); if (dd < 0) rv.addScaledVector(tB, -1.6 * dd); FIRE.emit(p, rv.multiplyScalar(rnd(0.04, 0.12) * k), rnd(0.5, 1.1), 0.0045, 0.0015, 5, 2.6, 0.9, 1, 1.5, 0.06); }
      for (let i = 0; i < 6; i++) FIRE.emit(p, rndDir(rv, 0.02 * k), rnd(0.4, 0.8), 0.018 * k, 0.045 * k, 3.2, 1.3, 0.35, 1, 2);
      for (let i = 0; i < 8 * sk; i++) SMOKE.emit(p, rndDir(rv, 0.012 * k).addScaledVector(tB, 0.008), rnd(2.5, 4.5), 0.028 * k, rnd(0.08, 0.13) * k, 0.55, 0.53, 0.52, 0.65, 0.7);
      east(tB, tC); tA.crossVectors(tB, tC);
      for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; rv.copy(tC).multiplyScalar(Math.cos(a)).addScaledVector(tA, Math.sin(a)).multiplyScalar(0.16 * k); FIRE.emit(p, rv, 0.35, 0.006 * k, 0.004 * k, 1.4, 2.2, 3.2, 1, 3); }
    };
    const debris = (p, v, n) => { for (let i = 0; i < n; i++) FIRE.emit(p, rv.copy(v).multiplyScalar(0.05).add(rndDir(rv2, 0.05)), rnd(1.2, 2.4), 0.004, 0.002, 4, 2, 0.7, 1, 0.3, 0.05); };
    const flak = (p) => { if (Math.random() > 0.6) return; T3.copy(p).setLength(1.004).add(rndDir(rv2, 0.012)).setLength(1.004); rv.subVectors(p, T3).multiplyScalar(rnd(2.6, 3.4)).add(rndDir(rv2, 0.01)); FIRE.emit(T3, rv, 0.32, 0.0028, 0.002, 5, 2.4, 0.7); };
    const hotStage = (C, V) => { FIRE.emit(C, null, 0.35, 0.03, 0.09, 8, 6, 4); east(V, tB); tC.crossVectors(V, tB).normalize(); for (let i = 0; i < 30; i++) { const a = i / 30 * TAU; rv.copy(tB).multiplyScalar(Math.cos(a)).addScaledVector(tC, Math.sin(a)).multiplyScalar(0.09).addScaledVector(V, -0.02); FIRE.emit(C, rv, 0.4, 0.008, 0.003, 6, 3.4, 1.4, 1, 2); } };
    const FALL = [], BURNS = [];
    const faller = (p, v, k = 1) => { const pp = p.clone(), vv = v.clone().multiplyScalar(0.02).addScaledVector(p, -0.002); FALL.push((dt) => { vv.addScaledVector(pp, -0.06 * dt / pp.length()); pp.addScaledVector(vv, dt); FIRE.glow(pp, 0.005, 4, 1.8, 0.5); if (Math.random() < 0.8) SMOKE.emit(pp, null, 2.4, 0.003, 0.012, 0.35, 0.33, 0.32, 0.45); if (pp.length() <= 1.0045) { boom(pp.setLength(1.0045), 0.32 * k, 0.6); return false; } return true; }); };
    const burn = (p, dur) => BURNS.push({ p: p.clone().setLength(1.0045), until: t + dur });

    // ----- labels (English; max 3, depth-free sprites with leader lines) -----
    const TONES = { threat: '#ff8a6a', defense: '#7fe0ff', launch: '#ffd27a', intel: '#a8f0b8' };
    const LBL = [0, 1, 2].map((k) => {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 160; const g = cv.getContext('2d');
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 })); sp.renderOrder = 30; sp.visible = false; scene.add(sp);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      const ln = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: hdr(0xbfe6ff, 1.1), transparent: true, opacity: 0, depthTest: false, depthWrite: false })); ln.renderOrder = 30; ln.frustumCulled = false; ln.visible = false; scene.add(ln);
      return { k, g, tex, sp, ln, on: false, op: 0, anchor: null, side: 0, tone: TONES.intel, w: new V3(), title: '', sub: '', dirty: false };
    });
    const drawLbl = (L) => {
      const g = L.g, W = 1024, right = L.side < 0; g.clearRect(0, 0, W, 160);
      g.font = "600 46px 'IBM Plex Mono', monospace"; const w1 = g.measureText(L.title).width; g.font = "500 34px 'IBM Plex Mono', monospace"; const w2 = L.sub ? g.measureText(L.sub).width : 0;
      const w = Math.min(W - 20, Math.max(w1, w2) + 52), x0 = right ? W - w : 0, h = L.sub ? 132 : 76; L.tw = w;
      const bg = g.createLinearGradient(x0, 0, x0 + w, 0); bg.addColorStop(right ? 1 : 0, 'rgba(6,16,38,0.82)'); bg.addColorStop(right ? 0 : 1, 'rgba(6,16,38,0.3)'); g.fillStyle = bg; g.fillRect(x0, 14, w, h);
      g.fillStyle = L.tone; g.fillRect(right ? W - 7 : 0, 14, 7, h);
      g.textAlign = right ? 'right' : 'left'; g.textBaseline = 'alphabetic'; const tx = right ? W - 26 : 26;
      g.font = "600 46px 'IBM Plex Mono', monospace"; g.fillStyle = '#eef7ff'; g.fillText(L.title, tx, 70);
      if (L.sub) { g.font = "500 34px 'IBM Plex Mono', monospace"; g.fillStyle = '#a6c8ea'; g.fillText(L.sub, tx, 124); }
      L.tex.needsUpdate = true;
    };
    const label = (anchor, tone, title, sub) => { if (FLY && !OUT) return null; const L = LBL.find((l) => !l.on && l.op < 0.02); if (!L) return null; Object.assign(L, { on: true, anchor, tone: TONES[tone] || tone, title, sub: sub || '', dirty: true, side: 0 }); return { set: (a, b) => { if (a != null) L.title = a; if (b != null) L.sub = b; L.dirty = true; }, close: () => { L.on = false; } }; };
    const lblUpdate = (dt) => {
      const wpc = ((OUT ? 15 : 12) / 46) / (c.cssH() / (2 * c.half()));
      for (const L of LBL) {
        let vis = 0;
        if (L.anchor) { L.anchor(L.w); toW(L.w); vis = MU.smoothstep(L.w.z, 0.05, 0.3); let side = L.w.x > 0.05 ? 1 : -1; const hw = c.half() * c.camera.aspect * 0.97, need = (L.tw || 640) * wpc + 0.12; if (side > 0 && L.w.x + need > hw) side = -1; else if (side < 0 && L.w.x - need < -hw) side = 1; if (side !== L.side) { L.side = side; L.dirty = true; } }
        L.op += ((L.on ? vis : 0) - L.op) * Math.min(1, dt * 5);
        if (!L.on && L.op < 0.02) { L.anchor = null; L.sp.visible = L.ln.visible = false; continue; }
        if (L.dirty) { drawLbl(L); L.dirty = false; }
        L.sp.visible = L.ln.visible = true; L.sp.material.opacity = L.op; L.ln.material.opacity = L.op * 0.8;
        const dy = L.k === 1 ? -0.16 : L.k === 2 ? 0.32 : 0.1, dx = 0.11 * L.side, w = L.w;
        L.sp.center.set(L.side > 0 ? 0 : 1, 0.5); L.sp.position.set(w.x + dx, w.y + dy, w.z + 0.3); L.sp.scale.set(1024 * wpc, 160 * wpc, 1);
        const a = L.ln.geometry.attributes.position.array; a[0] = w.x; a[1] = w.y; a[2] = w.z; a[3] = w.x + dx * 0.5; a[4] = w.y + dy; a[5] = w.z + 0.3; a[6] = w.x + dx; a[7] = w.y + dy; a[8] = w.z + 0.3; L.ln.geometry.attributes.position.needsUpdate = true;
      }
    };

    // ----- flights -----
    const tmpF = new V3();
    class Flight {
      constructor(fl, path, t0, dur, o = {}) { this.fl = fl; this.i = fl ? fl.add() : -1; this.path = path; this.t0 = t0; this.dur = dur; this.o = o; this.p = new V3(); this.q = new V3(); this.v = new V3(0, 1, 0); this.k = 0; this.s = 0; this.done = false; }
      at(tt) {
        if (this.done) return 1;
        const o = this.o, k = MU.clamp((tt - this.t0) / this.dur, 0, 1), s = o.ease ? o.ease(k) : k; this.k = k; this.s = s;
        this.path(s, this.p);
        if (s < 0.995) { this.path(s + 0.005, this.q); this.q.sub(this.p); } else { this.path(s - 0.005, this.q); this.q.subVectors(this.p, this.q); }
        if (this.q.lengthSq() > 1e-14) this.v.copy(this.q).normalize();
        const fl = this.fl, L = fl ? fl.s * (o.sc ?? 1) : 0;
        if (fl) fl.place(this.i, this.p, o.rev ? tmpF.copy(this.v).negate() : this.v, this.p, L * (o.fade ? 1 - MU.smoothstep(k, 0.9, 1) : 1));
        if (o.burn && k < o.burn) engine(this.p, this.v, L * (o.tail ?? 0), o.fire ?? 1, o.smoke ?? 1);
        if (o.glow) FIRE.glow(this.p, o.glow[0], o.glow[1], o.glow[2], o.glow[3]);
        if (o.trail) SMOKE.emit(this.p, null, 1.6, 0.004, 0.016 * o.trail, 0.82, 0.82, 0.85, 0.4);
        if (o.contrail) { tmpS.copy(this.p).addScaledVector(this.v, -0.5 * L); SMOKE.emit(tmpS, null, 1.8, 0.004, 0.016, 0.92, 0.94, 0.98, 0.26); FIRE.glow(tmpS, 0.006, 4.5, 2.2, 1); }
        if (o.plasma) { FIRE.glow(this.p, 0.012 + 0.004 * Math.random(), 6, 3.4, 1.7); FIRE.emit(this.p, tmpS.copy(this.v).multiplyScalar(-0.02), 0.4, 0.006, 0.002, 4.2, 1.9, 0.8); if (Math.random() < 0.6) SMOKE.emit(this.p, null, 1.6, 0.003, 0.01, 0.6, 0.75, 1.0, 0.12); }
        return k;
      }
      kill() { if (this.done) return; this.done = true; if (this.fl) this.fl.release(this.i); }
    }

    // ----- units -----
    const UNITS = [], MOVERS = [], U_ = {};
    const atFn = (u) => (x, y, z, out) => out.copy(u.p).addScaledVector(u.f, x * u.s).addScaledVector(u.n, y * u.s).addScaledVector(tmpR.crossVectors(u.f, u.n).normalize(), z * u.s);
    const unit = (fl, lat, lon, hdg, o = {}) => { const n = geo(lat, lon), u = Object.assign({ fl, n, p: n.clone().multiplyScalar(1.005), f: dirAt(n, deg(hdg), new V3()), s: fl.s, i: fl.add() }, o); u.at = atFn(u); fl.place(u.i, u.p, u.f, u.n, u.s); UNITS.push(u); return u; };
    const ship = (fl, lat, lon, rad, per, o = {}) => {
      const u = Object.assign({ fl, c: geo(lat, lon), R: deg(rad), per, ph: rnd(0, TAU), dir: 1, i: fl.add(), s: fl.s, p: new V3(), f: new V3(1, 0, 0), n: new V3(), wk: 0 }, o); u.at = atFn(u);
      u.update = (tt, dt) => { const a = u.ph + u.dir * tt / u.per * TAU; move(u.c, a, u.R, u.n); move(u.c, a + u.dir * 0.02, u.R, tmpS); u.f.subVectors(tmpS, u.n).normalize(); u.p.copy(u.n).multiplyScalar(1.0028); u.fl.place(u.i, u.p, u.f, u.n, u.s);
        if ((u.wk -= dt) < 0) { u.wk = 0.16; toW(tmpW.copy(u.p)); if (tmpW.z > -0.1) { tmpS.copy(u.p).addScaledVector(u.f, -0.48 * u.s); SMOKE.emit(tmpS, null, 4.2, 0.008, 0.04, 0.86, 0.92, 0.98, 0.3); } } };
      UNITS.push(u); MOVERS.push(u); return u;
    };
    const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0), spotGeo = new THREE.RingGeometry(0.6, 1, 32);
    const cap = (fl, lat, lon, rad, alt, per, ph, o = {}) => {
      const u = Object.assign({ fl, c: geo(lat, lon), R: deg(rad), i: fl.add(), s: fl.s, p: new V3(), f: new V3(1, 0, 0), n: new V3() }, o); u.at = atFn(u);
      if (o.sensor) { u.cone = new THREE.Mesh(coneGeo, additive(new THREE.MeshBasicMaterial({ color: hdr(0x6fd6ff, 1), opacity: 0.05, side: THREE.DoubleSide }))); u.spot = new THREE.Mesh(spotGeo, additive(new THREE.MeshBasicMaterial({ color: hdr(0x9fe6ff, 1.2), opacity: 0.5, side: THREE.DoubleSide }))); spinG.add(u.cone, u.spot); }
      u.update = (tt) => {
        const a = ph + tt / per * TAU; move(u.c, a, u.R, u.n); move(u.c, a + 0.03, u.R, tmpS); u.f.subVectors(tmpS, u.n).normalize(); u.p.copy(u.n).multiplyScalar(1 + alt);
        tmpU.subVectors(u.c, u.n).normalize().multiplyScalar(o.bank ?? 0.45).add(u.n).normalize(); u.fl.place(u.i, u.p, u.f, tmpU, u.s);
        if (u.cone) { u.cone.position.copy(u.p); tmpS.copy(u.c).multiplyScalar(1.004).sub(u.p); const L = tmpS.length(); u.cone.quaternion.setFromUnitVectors(NEG_Y, tmpS.divideScalar(L)); u.cone.scale.set(0.014, L, 0.014); u.spot.position.copy(u.c).multiplyScalar(1.0055); u.spot.quaternion.setFromUnitVectors(Z_AXIS, u.c); u.spot.scale.setScalar(0.012 + 0.004 * Math.sin(tt * 3)); }
        toW(tmpW.copy(u.p)); if (tmpW.z < -0.1) return;
        if (o.trail) { tmpS.copy(u.p).addScaledVector(u.f, -0.5 * u.s); SMOKE.emit(tmpS, null, 1.5, 0.0035, 0.013, 0.92, 0.94, 0.98, 0.24); FIRE.glow(tmpS, 0.005, 4.5, 2.2, 1); }
        if ((tt * 1.1 + ph) % 1 < 0.07) FIRE.glow(u.p, 0.006, 4, 4, 4);
      };
      UNITS.push(u); MOVERS.push(u); return u;
    };
    const fpv = (lat, lon) => {
      const cc = geo(lat, lon), u = { c: cc, i: F.quad.add(), s: F.quad.s, p: new V3(), f: new V3(1, 0, 0), n: cc.clone(), a: rnd(0, TAU), d: rnd(0, 0.012), h: rnd(0, TAU), dive: -1 };
      u.update = (tt, dt) => {
        if (u.dive < 0) { u.h += rnd(-2, 2) * dt; u.a += 0.3 * dt; u.d = MU.clamp(u.d + rnd(-0.04, 0.04) * dt, 0, 0.02); move(cc, u.a, u.d, u.n); u.p.copy(u.n).multiplyScalar(1.008 + 0.002 * Math.sin(tt * 3 + u.h)); if (FULL && Math.random() < dt * 0.12) u.dive = 0; }
        else { u.dive += dt; u.p.lerp(T1.copy(u.n).multiplyScalar(1.004), Math.min(1, dt * 3)); if (u.dive > 0.7) { T1.copy(u.n).multiplyScalar(1.0045); FIRE.emit(T1, null, 0.2, 0.006, 0.015, 6, 4, 2); SMOKE.emit(T1, null, 2.4, 0.004, 0.016, 0.5, 0.48, 0.45, 0.4); u.dive = -1; u.a = rnd(0, TAU); u.d = rnd(0, 0.015); } }
        dirAt(u.n, u.h, u.f); F.quad.place(u.i, u.p, u.f, u.n, u.s); if ((tt * 2 + u.h) % 1 < 0.1) FIRE.glow(u.p, 0.004, 4, 0.8, 0.6);
      };
      MOVERS.push(u); return u;
    };

    // Israel
    U_.laser = unit(F.laser, 33.5, 36.2, 15, { cls: 'LASER' });
    U_.dome = unit(F.dome, 32.35, 34.45, 235, { cls: 'SAM' });
    unit(F.tank, 31.1, 33.7, 245, { cls: 'MBT' });
    U_.arrow = unit(F.arrow, 30.15, 35.25, 80, { cls: 'ABM' });
    const rb = unit(F.radarBase, 29.1, 34.3, 80, { cls: 'RADAR' }), rhI = F.radarHead.add(), rhP = rb.at(0, 0.35, 0, new V3()), rhF = new V3();
    MOVERS.push({ update: (tt) => { dirAt(rb.n, tt * 1.4, rhF); F.radarHead.place(rhI, rhP, rhF, rb.n, F.radarHead.s); } });
    cap(F.uav, 31.42, 34.38, 1.1, 0.028, 30, 0, { cls: 'UAV', sensor: true });
    cap(F.jet, 32.9, 32.2, 1.6, 0.034, 13, 0, { cls: 'FTR', trail: true }); cap(F.jet, 32.9, 32.2, 1.85, 0.036, 13, 0.25, { cls: 'FTR', trail: true });
    ship(F.carrier, 33.6, 30.4, 0.9, 170, { cls: 'CVN' });
    // Iran
    U_.tel_irn = unit(F.tel, 34.3, 47.1, 260, { cls: 'TEL' });
    unit(F.sam, 35.5, 51.0, 250, { cls: 'SAM' });
    // Yemen / Red Sea / Gulf / Arabian Sea
    U_.tel_yem = unit(F.tel, 15.4, 44.2, 290, { cls: 'TEL' });
    U_.ddgRed = ship(F.destroyer, 17.3, 40.3, 0.7, 120, { cls: 'DDG' });
    ship(F.destroyer, 13.9, 42.6, 0.5, 100, { cls: 'DDG', dir: -1 });
    ship(F.cargo, 20.6, 38.4, 1.2, 220, { cls: 'CARGO' });
    ship(F.carrier, 18.8, 62.5, 1.0, 180, { cls: 'CVN', dir: -1 });
    ship(F.destroyer, 26.3, 53.0, 0.8, 140, { cls: 'DDG' });
    // Ukraine / Black Sea
    const TANKS = [unit(F.tank, 47.85, 37.75, 270, { cls: 'MBT' }), unit(F.tank, 48.45, 36.85, 85, { cls: 'MBT' }), unit(F.tank, 47.25, 35.5, 5, { cls: 'MBT' }), unit(F.tank, 48.95, 37.95, 250, { cls: 'MBT' })];
    unit(F.sam, 50.3, 30.3, 90, { cls: 'SAM' });
    cap(F.uav, 48.2, 37.2, 1.0, 0.026, 28, 2.1, { cls: 'UAV', sensor: true });
    fpv(47.9, 37.2); fpv(48.3, 37.5); fpv(47.6, 36.6);
    ship(F.destroyer, 43.6, 34.5, 0.9, 150, { cls: 'FFG' });
    // China / Taiwan / SCS / Korea
    ship(F.carrier, 22.2, 124.0, 1.3, 200, { cls: 'CV' }); ship(F.destroyer, 24.3, 119.6, 0.5, 110, { cls: 'DDG' }); ship(F.destroyer, 14.5, 114.5, 1.1, 160, { cls: 'DDG', dir: -1 });
    cap(F.jet, 24.6, 121.3, 1.4, 0.034, 12, 1.0, { cls: 'FTR', trail: true }); cap(F.jet, 24.6, 121.3, 1.65, 0.036, 12, 1.25, { cls: 'FTR', trail: true });
    U_.tel_prk = unit(F.tel, 39.05, 125.7, 90, { cls: 'TEL' });
    U_.barge = unit(F.cargo, 34.6, 122.3, 150, { cls: 'SHIP' });
    // Sudan
    unit(F.tank, 15.2, 32.0, 200, { cls: 'AFV' }); unit(F.tank, 13.75, 26.0, 95, { cls: 'AFV' });
    const FIRES = [[15.58, 32.53], [13.63, 25.35], [12.05, 24.88]].map(([a, b]) => ({ p: geo(a, b, 1.0045), ph: rnd(0, 9) }));
    // launch pads
    const PAD = { cape: unit(F.tower, 28.49, -80.58, 90), sbase: unit(F.tower, 25.99, -97.15, 90, { s: 0.18 }), vand: unit(F.tower, 34.63, -120.61, 90), kourou: unit(F.tower, 5.24, -52.77, 90, { s: 0.1 }), wench: unit(F.tower, 19.61, 110.95, 90, { s: 0.11 }) };

    if (OUT) { cap(F.jet, 48.8, 33.2, 1.5, 0.034, 14, 0.6, { cls: 'FTR', trail: true }); cap(F.jet, 48.8, 33.2, 1.75, 0.036, 14, 0.85, { cls: 'FTR', trail: true }); cap(F.jet, 18.6, 39.6, 1.4, 0.034, 13, 2.0, { cls: 'FTR', trail: true }); cap(F.jet, 18.6, 39.6, 1.65, 0.036, 13, 2.25, { cls: 'FTR', trail: true }); cap(F.uav, 16.0, 42.2, 1.2, 0.03, 32, 1.2, { cls: 'UAV' }); }
    if (FLY) { const keep = new Set([F.jet, F.uav]); for (const u of UNITS) if (!keep.has(u.fl)) u.fl.hide(u.i); for (let i = MOVERS.length - 1; i >= 0; i--) if (!MOVERS[i].fl || !keep.has(MOVERS[i].fl)) MOVERS.splice(i, 1); for (const u of UNITS) if (u.cone) { u.cone.visible = u.spot.visible = false; u.cone = null; } FIRES.length = 0; }
    // ----- ground-station network: tracking dishes + RF links to the logo satellites -----
    const beamGeo = new THREE.CylinderGeometry(1, 0.32, 1, 16, 1, true).translate(0, 0.5, 0);
    const beamMat = () => additive(new THREE.ShaderMaterial({ uniforms: { uT: U.time, uOp: { value: 0 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uT, uOp; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float cc = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float u = fract(vY * 5.0 - uT * 1.3); float d = fract(vY * 8.0 + uT * 1.9); float pu = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.06, 0.2, u)); float pd = smoothstep(0.0, 0.04, d) * (1.0 - smoothstep(0.04, 0.12, d)); vec3 col = vec3(0.45, 0.8, 1.0) * (0.3 + 1.6 * pu) + vec3(0.6, 1.0, 0.85) * pd * 1.1; gl_FragColor = vec4(col * cc * uOp, 1.0); }' }));
    const STN = FLY ? [] : [{ il: true, n: nI.clone() }].concat([[78.23, 15.4], [-23.7, 133.88], [21.57, -158.26], [37.94, -75.46], [-33.15, -70.67]].map(([la, lo]) => ({ il: false, la, lo })));
    for (const st of STN) {
      Object.assign(st, { w: new V3(), nw: new V3(), lastW: new V3(), link: null, op: 0, next: 0, ph: rnd(0, TAU) });
      st.beam = new THREE.Mesh(beamGeo, beamMat()); st.beam.frustumCulled = false; st.beam.visible = false; scene.add(st.beam);
      if (!st.il) { const b = unit(F.gsBase, st.la, st.lo, rnd(0, 360)); st.n = b.n; st.dp = b.at(0, 0.43, 0, new V3()); st.di = F.gsDish.add(); st.df = st.n.clone(); }
    }
    const stationsUpdate = (dt) => {
      let active = 0;
      for (const st of STN) {
        if (st.il) st.w.copy(st.n).multiplyScalar(1.01); else st.w.copy(st.dp); toW(st.w); st.nw.copy(st.w).normalize();
        const facing = st.w.z > 0.2;
        const ok = (s) => s.w.z > 0.12 && s.w.distanceTo(st.w) < 2.2 && T1.subVectors(s.w, st.w).dot(st.nw) > 0.05;
        if (st.link && (!facing || !ok(st.link))) st.link = null;
        if (!st.link && facing && active < 2 && t > st.next) { let best = 9; for (const s of allSats) if (ok(s)) { const d = s.w.distanceTo(st.w); if (d < best) { best = d; st.link = s; } } st.next = t + 1.2; }
        if (st.link) { active++; st.lastW.copy(st.link.w); }
        st.op += ((st.link ? 1 : 0) - st.op) * Math.min(1, dt * 2.5);
        const b = st.beam;
        if (st.op > 0.01) {
          T2.subVectors(st.lastW, st.w); const L = T2.length(); T2.divideScalar(L);
          b.visible = true; b.position.copy(st.w); b.quaternion.setFromUnitVectors(Y_AXIS, T2); b.scale.set(0.011, L, 0.011); b.material.uniforms.uOp.value = st.op * (st.il ? 1 : 0.75);
          for (const ph of [(t * 0.8) % 1, 1 - ((t * 1.1 + 0.5) % 1)]) { T3.copy(st.w).addScaledVector(T2, L * ph); toL(T3); FIRE.glow(T3, 0.008, 3 * st.op, 4.5 * st.op, 5 * st.op); }
        } else b.visible = false;
        if (!st.il) {
          if (st.link) toL(T3.copy(st.link.w)).sub(st.dp).normalize(); else T3.copy(st.n).multiplyScalar(0.8).addScaledVector(dirAt(st.n, t * 0.15 + st.ph, tq), 0.6).normalize();
          st.df.lerp(T3, Math.min(1, dt * 2.2)).normalize(); F.gsDish.place(st.di, st.dp, st.df, st.n, F.gsDish.s);
        }
      }
    };

    // ----- shared event visuals -----
    const warnGeo = new THREE.BufferGeometry(); warnGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const warnLn = new THREE.Line(warnGeo, additive(new THREE.LineBasicMaterial({ color: hdr(0xffb36b, 1.8), opacity: 0 }))); warnLn.frustumCulled = false; scene.add(warnLn);
    const warnLink = (pLocal, k) => { let best = null; for (const s of allSats) if (!best || s.w.z > best.w.z) best = s; if (!best) return; toW(T3.copy(pLocal)); warnGeo.attributes.position.array.set([best.w.x, best.w.y, best.w.z, T3.x, T3.y, T3.z]); warnGeo.attributes.position.needsUpdate = true; warnLn.material.opacity = 0.85 * MU.clamp(k, 0, 1) * (0.7 + 0.3 * Math.sin(t * 30)); };
    const lzGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0);
    const lzCore = new THREE.Mesh(lzGeo, additive(new THREE.MeshBasicMaterial({ color: hdr(0xfff2f0, 6), opacity: 1 }))), lzGlow = new THREE.Mesh(lzGeo, additive(new THREE.MeshBasicMaterial({ color: hdr(0xff3a4a, 1.6), opacity: 0.5 })));
    lzCore.visible = lzGlow.visible = false; lzCore.frustumCulled = lzGlow.frustumCulled = false; spinG.add(lzCore, lzGlow);
    const laserOn = (a, b, k) => { T2.subVectors(b, a); const L = T2.length(); T2.divideScalar(L); for (const [m, r] of [[lzCore, 0.0011], [lzGlow, 0.0045]]) { m.visible = true; m.position.copy(a); m.quaternion.setFromUnitVectors(Y_AXIS, T2); m.scale.set(r * (0.8 + 0.4 * Math.random()), L, r * (0.8 + 0.4 * Math.random())); } lzGlow.material.opacity = 0.35 + 0.3 * k; FIRE.glow(a, 0.012, 6, 2, 2); FIRE.glow(b, 0.01 + 0.012 * k, 6, 3, 2); };
    const reticle = (p, col = 0xff9a7a) => { const n = p.clone().normalize(), g = new THREE.Group(); g.position.copy(n).multiplyScalar(1.006); g.quaternion.setFromUnitVectors(Z_AXIS, n); const br = new THREE.LineSegments(bracketGeo, additive(new THREE.LineBasicMaterial({ color: hdr(col, 1.6), opacity: 0 }))); g.add(br); spinG.add(g); return { step(lt) { const k = MU.smoothstep(lt, 0, 0.5); g.scale.setScalar(0.9 * (1 + 1.6 * (1 - k))); br.material.opacity = k * (lt < 1.2 ? (Math.sin(lt * 40) > 0 ? 1 : 0.3) : 0.9); }, done() { spinG.remove(g); br.material.dispose(); } }; };

    // ----- events -----
    const evBM = (d) => {
      const T0 = t, L = U_.tel_irn.at(-0.36, 0.92, 0, new V3()), T = geo(32.1, 34.85, 1.004), A = U_.arrow.at(-0.35, 0.72, 0, new V3());
      const path = arcPath(L, T, 0.26), dur = 8.2, sI = 0.56, tI = dur * sI, I = path(sI, new V3());
      const m = new Flight(F.missile, path, T0, dur, { burn: 0.17, fire: 1.3, smoke: 1.3 });
      const it = new Flight(F.interceptor, bez(A, A.clone().multiplyScalar(1.14), I), T0 + tI - 2.4, 2.4, { burn: 0.72, fire: 1, smoke: 1, ease: (k) => k * k * (1.6 - 0.6 * k) });
      let hit = false, ph = 0;
      const lab = label((v) => v.copy(hit ? I : m.p), 'threat', d.title || 'BALLISTIC LAUNCH · IRAN', d.sub || 'SPACE-BASED IR WARNING');
      return (tt) => {
        const lt = tt - T0;
        if (!hit) { m.at(tt); if (lt < 2.4) warnLink(L, Math.min(lt / 0.4, (2.4 - lt) / 0.6)); }
        if (!hit && tt >= it.t0) { it.at(tt); if (it.k > 0.72 && Math.random() < 0.35) FIRE.emit(it.p, rndDir(rv, 0.03), 0.12, 0.004, 0.001, 2, 3, 4); if (!ph) { ph = 1; lab && lab.set('ARROW 3 · LAUNCH', 'EXO-ATMOSPHERIC ENGAGEMENT'); } }
        if (!hit && lt >= tI) { hit = true; m.kill(); it.kill(); boom(I, 1.3, 0.9); debris(I, m.v, 16); lab && lab.set('ARROW 3 · INTERCEPT', 'TARGET DESTROYED · EXO-ATMOSPHERIC'); }
        if (lt > tI + 3.2) { m.kill(); it.kill(); lab && lab.close(); return false; }
        return true;
      };
    };
    const evDome = (d) => {
      const T0 = t, Lp = U_.dome.at(0.16, 0.58, 0, new V3()), N = 4;
      const from = [geo(31.3, 34.05), geo(33.45, 35.75), geo(31.35, 34.2), geo(33.5, 35.5)], to = [geo(32.75, 35.15), geo(32.05, 34.95), geo(32.5, 35.45), geo(31.8, 35.2)];
      const rk = from.map((a, i) => { const path = arcPath(a.setLength(1.004), to[i].setLength(1.004), 0.05), t0 = T0 + 0.3 + i * 0.6, dur = 2.5, sI = rnd(0.55, 0.68), I = path(sI, new V3()); return { t0, dur, sI, I, r: new Flight(null, path, t0, dur, { glow: [0.005, 5, 2.2, 0.8], trail: 0.5 }), it: new Flight(F.interceptor, bez(Lp, Lp.clone().multiplyScalar(1.035), I), t0 + dur * sI - 1.15, 1.15, { burn: 1, fire: 0.75, smoke: 0.9 }), hit: false }; });
      let n = 0; const lab = label((v) => v.copy(Lp), 'defense', d.title || 'IRON DOME · ACTIVE', d.sub || 'ROCKET SALVO · 0/' + N + ' INTERCEPTS');
      return (tt) => {
        let live = false;
        for (const q of rk) { if (q.hit) continue; live = true; if (tt >= q.t0) q.r.at(tt); if (tt >= q.it.t0) q.it.at(tt); if (tt >= q.t0 + q.dur * q.sI) { q.hit = true; q.r.kill(); q.it.kill(); boom(q.I, 0.5, 0.6); n++; lab && lab.set(null, 'ROCKET SALVO · ' + n + '/' + N + ' INTERCEPTS'); } }
        if (!live && tt > T0 + 6.5) { lab && lab.close(); return false; } return true;
      };
    };
    const evLaser = (d) => {
      const T0 = t, ap = U_.laser.at(0.15, 0.52, 0, new V3()), a = geo(34.4, 37.0), b = geo(32.4, 35.0);
      const dr = new Flight(F.shahed, (s, out) => slerpV(a, b, s, out).multiplyScalar(1.03), T0, 6.5, {});
      let st = 0, kt = 0; const lab = label((v) => v.copy(dr.p), 'threat', 'UAV INBOUND · NORTH', 'TRACKING');
      return (tt) => {
        const lt = tt - T0;
        if (st < 2) { dr.at(tt); if ((tt * 2) % 1 < 0.1) FIRE.glow(dr.p, 0.005, 5, 0.8, 0.6); }
        if (st === 0 && lt > 2.4) { st = 1; lab && lab.set(d.title || 'IRON BEAM · LASER ENGAGE', d.sub || 'HIGH-ENERGY LASER'); }
        if (st === 1) { const k = MU.clamp((lt - 2.4) / 1.5, 0, 1); laserOn(ap, dr.p, k); FIRE.glow(dr.p, 0.006 + 0.016 * k, 1 + 6 * k, 3 * k, 0.8 * k); if (Math.random() < 0.5 * k) FIRE.emit(dr.p, rndDir(rv, 0.03), 0.25, 0.004, 0.001, 5, 2.5, 0.8, 1, 1, 0.03); if (k >= 1) { st = 2; kt = lt; boom(dr.p.clone(), 0.45, 0.5); faller(dr.p, dr.v); dr.kill(); lab && lab.set('IRON BEAM · TARGET DOWN', 'LASER INTERCEPT'); } }
        if (st === 2 && lt > kt + 3.2) { lab && lab.close(); return false; }
        return true;
      };
    };
    const evStrike = (d) => {
      const T0 = t, start = geo(32.0, 35.4), tg = [geo(32.65, 51.67), geo(33.72, 51.73), geo(34.9, 50.9)][(Math.random() * 3) | 0], TP = tg.clone().multiplyScalar(1.0045);
      const end = slerpV(start, tg, 1.22, new V3()).normalize(), side = new V3().crossVectors(start, end).normalize();
      const jets = [0, 0.014].map((o, k) => { const a = start.clone().addScaledVector(side, o).normalize(), b = end.clone().addScaledVector(side, o).normalize(); return new Flight(F.jet, (s, out) => slerpV(a, b, s, out).multiplyScalar(1.032), T0 + k * 0.3, 6.4, { contrail: true, fade: true }); });
      const mun = [], ret = reticle(TP); let rel = false, imp = 0;
      const lab = label((v) => v.copy(TP), 'threat', d.title || 'LONG-RANGE STRIKE · IRAN', d.sub || 'TGT ACQUIRED');
      return (tt) => {
        const lt = tt - T0;
        for (const j of jets) if (!j.done && tt >= j.t0) { if (j.at(tt) >= 1) j.kill(); }
        if (!rel && jets[0].s > 0.66) { rel = true; for (const j of jets) for (let q = 0; q < 2; q++) { const p0 = j.p.clone(), p1 = p0.clone().addScaledVector(j.v, 0.035), p2 = TP.clone().add(rndDir(rv, 0.005)).setLength(1.0045); mun.push(new Flight(null, bez(p0, p1, p2), tt + q * 0.25, 1.4, { glow: [0.004, 3, 2, 1.2] })); } lab && lab.set(null, 'WEAPONS RELEASE'); }
        for (const m of mun) if (!m.done && tt >= m.t0) { m.at(tt); if (m.k >= 1) { m.kill(); boom(m.p.clone(), 0.7, 1.1); burn(m.p, 7); imp++; if (imp === 1 && lab) lab.set(null, 'IMPACT CONFIRMED'); } }
        ret.step(lt);
        if (lt > 10.5) { jets.forEach((j) => j.kill()); mun.forEach((m) => m.kill()); ret.done(); lab && lab.close(); return false; }
        return true;
      };
    };
    const evSwarm = (d) => {
      const T0 = t, src = [geo(51.7, 36.4), geo(46.2, 38.3)], dst = [geo(50.45, 30.52), geo(46.48, 30.73), geo(48.46, 35.04), geo(49.6, 28.4)], N = 5, ap = new V3();
      const dr = []; for (let i = 0; i < N; i++) { const a = src[i % 2], b = dst[i % 4], side = new V3().crossVectors(a, b).normalize(), w = rnd(-0.008, 0.008), ph = rnd(0, TAU); dr.push({ f: new Flight(F.shahed, (s, out) => { slerpV(a, b, s, out); out.addScaledVector(side, w + 0.004 * Math.sin(s * 9 + ph)).normalize(); return out.multiplyScalar(1.014); }, T0 + i * 0.6, rnd(8, 9.5), {}), fate: i < 3 ? rnd(0.45, 0.8) : 1, dead: false, ph }); }
      let down = 0; const lab = label((v) => v.copy(ap), 'threat', d.title || 'SHAHED SWARM · ' + N + ' UAV', d.sub || 'DOWNED 0/' + N);
      return (tt) => {
        let live = false, anch = false;
        for (const q of dr) {
          if (q.dead) continue; live = true; if (tt < q.f.t0) continue;
          const k = q.f.at(tt); if (!anch) { ap.copy(q.f.p); anch = true; }
          if ((tt * 1.6 + q.ph) % 1 < 0.1) FIRE.glow(q.f.p, 0.0045, 5, 0.6, 0.4);
          if (q.fate < 1 && k > q.fate - 0.12) flak(q.f.p);
          if (k >= q.fate) { q.dead = true; q.f.kill(); if (q.fate < 1) { boom(q.f.p.clone(), 0.38, 0.5); faller(q.f.p, q.f.v); down++; lab && lab.set(null, 'DOWNED ' + down + '/' + N); } else { const g = q.f.p.clone().setLength(1.0045); boom(g, 0.8, 1.2); burn(g, 6); } }
        }
        if (!live && tt > T0 + 3) { lab && lab.close(); return false; } return true;
      };
    };
    const evRedSea = (d) => {
      const T0 = t, ddg = U_.ddgRed, L = U_.tel_yem.at(-0.36, 0.92, 0, new V3()), Ln = L.clone().normalize(), An = ddg.p.clone().normalize();
      const path = (s, out) => slerpV(Ln, An, s, out).multiplyScalar(1.004 + 0.03 * Math.min(1, s * 6) * (1 - s * 0.7));
      const dur = 4.6, sI = 0.72, tI = dur * sI, I = path(sI, new V3());
      const m = new Flight(F.missile, path, T0, dur, { burn: 1, fire: 0.7, smoke: 0.6, sc: 0.75 });
      let sm = null, hit = false; const lab = label((v) => v.copy(hit ? I : m.p), 'threat', d.title || 'ANTI-SHIP MISSILE · RED SEA', d.sub || 'TRACKED');
      return (tt) => {
        const lt = tt - T0;
        if (!hit) m.at(tt);
        if (!sm && lt > tI - 1.6) { const v0 = ddg.at(0.24, 0.07, 0, new V3()); sm = new Flight(F.interceptor, bez(v0, v0.clone().multiplyScalar(1.045), I), tt, 1.6, { burn: 1, fire: 0.9, smoke: 1 }); lab && lab.set('SM-2 · SHIP DEFENSE', 'DDG ENGAGING'); }
        if (sm && !hit) sm.at(tt);
        if (!hit && lt >= tI) { hit = true; m.kill(); if (sm) sm.kill(); boom(I, 0.7, 0.8); lab && lab.set('RED SEA · INTERCEPT', 'ANTI-SHIP MISSILE DOWN'); }
        if (lt > tI + 3) { m.kill(); if (sm) sm.kill(); lab && lab.close(); return false; } return true;
      };
    };
    const evHGV = (d) => {
      const T0 = t, L = geo(40.6, 100.0), T = geo(23.5, 128.0), Bp = slerpV(L, T, 0.09, new V3()).multiplyScalar(1.115), Bn = Bp.clone().normalize();
      const bst = new Flight(F.rocket, bez(L.clone().multiplyScalar(1.004), L.clone().multiplyScalar(1.09), Bp), T0, 2.0, { burn: 1, fire: 1.2, smoke: 1.2, ease: (k) => k * k });
      const side = new V3().crossVectors(Bn, T).normalize();
      const hv = new Flight(F.hgv, (s, out) => { slerpV(Bn, T, s, out); out.addScaledVector(side, 0.045 * Math.sin(s * Math.PI * 2) * (1 - s)).normalize(); return out.multiplyScalar(1.004 + 0.111 * Math.pow(1 - s, 0.8)); }, T0 + 2.0, 5.2, { plasma: true });
      let st = 0; const lab = label((v) => v.copy(st < 1 ? bst.p : hv.p), 'threat', d.title || 'HYPERSONIC GLIDE TEST', d.sub || 'BOOST PHASE');
      return (tt) => {
        const lt = tt - T0;
        if (st === 0) { bst.at(tt); if (lt >= 2.0) { st = 1; bst.kill(); FIRE.emit(Bp, null, 0.3, 0.02, 0.06, 6, 5, 4); lab && lab.set('HGV · MACH 10+', 'GLIDE · CROSS-RANGE MANEUVER'); } }
        else if (st === 1) { if (hv.at(tt) >= 1) { st = 2; hv.kill(); boom(T.clone().multiplyScalar(1.004), 0.8, 1); lab && lab.set('HGV · IMPACT', 'TARGET AREA · W. PACIFIC'); } }
        else if (lt > 10.5) { lab && lab.close(); return false; }
        return true;
      };
    };
    const evICBM = (d) => {
      const T0 = t, L = U_.tel_prk.at(-0.36, 0.92, 0, new V3()), T = geo(40.5, 137.5, 1.004), m = new Flight(F.missile, arcPath(L, T, 0.34), T0, 9, { burn: 0.15, fire: 1.3, smoke: 1.3 });
      let done = false, l1 = false; const lab = label((v) => v.copy(done ? T : m.p), 'threat', d.title || 'ICBM TEST · LOFTED', d.sub || 'DPRK · BOOST PHASE');
      return (tt) => {
        const lt = tt - T0;
        if (!done) { const k = m.at(tt); if (k > 0.25 && !l1) { l1 = true; lab && lab.set(null, 'MIDCOURSE · TRACKED'); } if (k > 0.85) FIRE.glow(m.p, 0.012, 6, 3, 1.2); if (k >= 1) { done = true; m.kill(); boom(T, 0.7, 0.6); lab && lab.set(null, 'SPLASHDOWN · SEA OF JAPAN'); } }
        else if (lt > 12) { lab && lab.close(); return false; }
        return true;
      };
    };
    const evSudan = (d) => {
      const T0 = t, cc = geo(14.2, 29.0); let nx = 0; const lab = label((v) => v.copy(cc).multiplyScalar(1.004), 'threat', d.title || 'SUDAN · CIVIL WAR', d.sub || 'DARFUR · KHARTOUM');
      return (tt) => { if (tt > nx) { nx = tt + rnd(0.25, 0.7); const p = move(cc, rnd(0, TAU), deg(rnd(0, 3.5)), new V3()).multiplyScalar(1.004); FIRE.emit(p, null, 0.2, 0.006, 0.016, 6, 4, 2); SMOKE.emit(p, null, 3, 0.004, 0.02, 0.45, 0.42, 0.4, 0.45); } if (tt - T0 > 7) { lab && lab.close(); return false; } return true; };
    };
    const LV = {
      f9: { b: 'f9b', u: 'f9u', h1: 0.17, d1: 0.06, tm: 3.8, plume: 1, land: true, ust: 0.72, ret: 5.4 },
      ss: { b: 'ssb', u: 'sss', h1: 0.2, d1: 0.06, tm: 4.6, plume: 1.8, land: true, hot: true, ust: 0.6, ret: 5.6, cat: true },
      rk: { b: 'rocket', h1: 0.2, d1: 0.08, tm: 5.6, plume: 0.75 },
      lm: { b: 'lm', h1: 0.2, d1: 0.08, tm: 5.8, plume: 1.25 },
    };
    const evLaunch = (d, cf) => {
      const lv = LV[cf.lv], fb = F[lv.b], fu = lv.u ? F[lv.u] : null, s = fb.s, ib = fb.add(), iu = fu ? fu.add() : -1;
      if (ib < 0 || (fu && iu < 0)) { fb.release(ib); if (fu) fu.release(iu); return null; }
      const T0 = t, n = (cf.pad ? cf.pad.n : cf.n).clone().normalize(), off = cf.off || (FLY ? [0, 0.01] : [0, 0.1]);
      const P0 = cf.pad ? cf.pad.at(off[0], off[1], 0, new V3()) : n.clone().multiplyScalar(1.004), R0 = P0.length(), H = deg(cf.hdg), nN = north(n, new V3());
      const posAt = (tau, out) => { const k = Math.max(0, tau) / lv.tm; let h, dd; if (k <= 1) { h = lv.h1 * k * k; dd = lv.d1 * k * k * k; } else { h = lv.h1 * (1 + 1.1 * (k - 1)); dd = lv.d1 * (1 + 3.4 * (k - 1)); } return move(n, H, dd, out).multiplyScalar(R0 + h); };
      const P = P0.clone(), V = n.clone(), Pu = new V3(), Vu = new V3(), q1 = new V3(), q2 = new V3(), fwd = new V3();
      let st = 0, tSep = 0, ret = null, landT = 0;
      const lab = label((v) => v.copy(landT ? ret.p : (st >= 3 && fu ? Pu : P)), 'launch', d.title || cf.title, d.sub || cf.sub || 'T-0 · TERMINAL COUNT');
      const stack = (base, f) => { fb.place(ib, base, f, nN, s); if (fu) fu.place(iu, q1.copy(base).addScaledVector(f, lv.ust * s), f, nN, s); };
      return (tt) => {
        const lt = tt - T0;
        if (st === 0) { stack(P0, n); if (Math.random() < 0.5) SMOKE.emit(q2.copy(P0).addScaledVector(n, 0.6 * s), rndDir(rv, 0.004), 1.6, 0.003, 0.012, 0.95, 0.96, 1, 0.25, 0.5); if (lt > 1.3) st = 1; }
        else if (st === 1) { stack(P0, n); plume(P0, q2.copy(n).negate(), lv.plume, 0); groundCloud(P0, n, lv.plume, 3); if (lt > 1.8) { st = 2; lab && lab.set(null, 'LIFTOFF'); } }
        else if (st === 2) {
          const tau = lt - 1.8; posAt(tau, P); posAt(tau + 0.03, V); V.sub(P).normalize(); if (tau < 0.2) V.lerp(n, 1 - tau / 0.2).normalize();
          stack(P, V); plume(P, q2.copy(V).negate(), lv.plume, MU.smoothstep(P.length(), 1.1, 1.2)); if (tau < 0.7) groundCloud(P0, n, lv.plume, 2);
          if (tau >= lv.tm) {
            st = 3; tSep = tt; Pu.copy(P).addScaledVector(V, lv.ust * s);
            if (lv.hot) hotStage(Pu, V); else if (fu) FIRE.emit(Pu, null, 0.25, 0.008, 0.026, 3, 3, 3);
            lab && lab.set(null, lv.hot ? 'HOT STAGING' : fu ? 'MECO · STAGE SEPARATION' : 'ORBIT INSERTION');
            if (lv.land) ret = { path: bez(P.clone(), posAt(lv.tm * 0.8, new V3()).multiplyScalar(1.05), cf.lz ? cf.lz.clone() : P0.clone()), T: tt, p: new V3(), v: new V3(), v0: V.clone() };
          }
        } else {
          const ls = tt - tSep;
          if (fu || !lv.land) {
            const tau = lv.tm + ls; posAt(tau, q2); posAt(tau + 0.03, Vu); Vu.sub(q2).normalize(); const sc = s * (1 - MU.smoothstep(ls, 2.8, 3.8));
            if (fu) { Pu.copy(q2).addScaledVector(Vu, lv.ust * s + 0.01 * ls * ls); if (sc > 0.002) { fu.place(iu, Pu, Vu, nN, sc); if (ls > 0.3) vplume(Pu, q1.copy(Vu).negate(), lv.plume); } else fu.hide(iu); }
            else { P.copy(q2); if (sc > 0.002) { fb.place(ib, P, Vu, nN, sc); plume(P, q1.copy(Vu).negate(), lv.plume * 0.8, 1); } else fb.hide(ib); }
          }
          if (ret) {
            const k = MU.clamp((tt - ret.T) / lv.ret, 0, 1), e = 1 - Math.pow(1 - k, 1.7);
            ret.path(e, ret.p); ret.path(Math.min(1, e + 0.01), ret.v); ret.v.sub(ret.p); if (ret.v.lengthSq() > 1e-12) ret.v.normalize(); else ret.v.copy(n).negate();
            const fl = MU.smoothstep(k, 0, 0.12); fwd.copy(ret.v0).multiplyScalar(1 - fl).addScaledVector(ret.v, -fl); if (fwd.lengthSq() < 1e-6) fwd.copy(n); fwd.normalize();
            if (k > 0.8) fwd.lerp(n, MU.smoothstep(k, 0.8, 0.96)).normalize();
            if (!landT) fb.place(ib, ret.p, fwd, nN, s); else fb.place(ib, ret.p, n, nN, s * (1 - MU.smoothstep(tt - landT, 1.8, 2.3)));
            if (!landT && ((k > 0.04 && k < 0.16) || (k > 0.55 && k < 0.65) || k > 0.85)) plume(ret.p, q1.copy(fwd).negate(), 0.5, MU.smoothstep(ret.p.length(), 1.1, 1.2));
            if (k >= 1 && !landT) { landT = tt; FIRE.emit(ret.p, null, 0.25, 0.01, 0.03, 4, 3.5, 2.5); groundCloud(ret.p, n, 0.6, 14); lab && lab.set(null, lv.cat ? 'BOOSTER CATCH · TOWER' : 'BOOSTER LANDED · ' + (cf.lzName || 'LZ-1')); }
          }
          const bDone = ret ? landT && tt - landT > 2.3 : ls > 3.9, uDone = fu ? ls > 3.9 : true;
          if (bDone && uDone) { fb.release(ib); if (fu) fu.release(iu); lab && lab.close(); return false; }
        }
        return true;
      };
    };
    // fly-out launch: liftoff from the globe, then the vehicle breaks out toward the viewer, growing until it leaves the frame
    const evLaunchOut = (d, cf) => {
      const lv = LV[cf.lv], fb = F[lv.b], fu = lv.u ? F[lv.u] : null, s = fb.s, ib = fb.add(), iu = fu ? fu.add() : -1;
      if (ib < 0 || (fu && iu < 0)) { fb.release(ib); if (fu) fu.release(iu); return null; }
      const T0 = t, n = (cf.pad ? cf.pad.n : cf.n).clone().normalize(), P0 = n.clone().multiplyScalar(1.006), H = deg(cf.hdg), nN = north(n, new V3());
      const TA = 2.2, BO = 3.4, h1 = 0.14, d1 = 0.035;
      const ascent = (tau, out) => { const kk = Math.max(0, tau) / TA; return move(n, H, d1 * kk * kk * kk, out).multiplyScalar(1.006 + h1 * kk * kk); };
      const P = P0.clone(), V = n.clone(), Wp = new V3(), Wv = new V3(), q1 = new V3(), q2 = new V3();
      let st = 0, bo = null;
      const lab = label((v) => v.copy(P0), 'launch', d.title || cf.title, d.sub || cf.sub || 'T-0 · TERMINAL COUNT');
      const stack = (base, f, sc) => { fb.place(ib, base, f, nN, sc); if (fu) fu.place(iu, q1.copy(base).addScaledVector(f, lv.ust * sc), f, nN, sc); };
      return (tt) => {
        const lt = tt - T0;
        if (st === 0) { stack(P0, n, s); if (Math.random() < 0.5) SMOKE.emit(q2.copy(P0).addScaledVector(n, 0.6 * s), rndDir(rv, 0.004), 1.6, 0.003, 0.012, 0.95, 0.96, 1, 0.25, 0.5); if (lt > 1.0) st = 1; }
        else if (st === 1) { stack(P0, n, s); plume(P0, q2.copy(n).negate(), lv.plume, 0); groundCloud(P0, n, lv.plume, 3); if (lt > 1.5) { st = 2; lab && lab.set(null, 'LIFTOFF'); } }
        else if (st === 2) {
          const tau = lt - 1.5; ascent(tau, P); ascent(tau + 0.03, V); V.sub(P).normalize(); if (tau < 0.2) V.lerp(n, 1 - tau / 0.2).normalize();
          stack(P, V, s); plume(P, q2.copy(V).negate(), lv.plume, 0); if (tau < 0.6) groundCloud(P0, n, lv.plume, 2);
          if (tau >= TA) {
            st = 3; const A = toW(P.clone()), dW = toW(q2.copy(P).add(V)).sub(A).normalize(), side = A.x >= 0 ? 1 : -1;
            const C1 = A.clone().addScaledVector(dW, 0.55); C1.z += 1.2;
            bo = { T: tt, path: bez(A, C1, new V3(side * 0.28, 1.6, 6.9)), prev: null };
            lab && lab.set(null, 'ASCENT · MAX-Q');
          }
        } else {
          const kk = MU.clamp((tt - bo.T) / BO, 0, 1), e = kk * kk * (0.6 + 0.4 * kk);
          bo.path(e, Wp); bo.path(Math.min(1, e + 0.01), Wv); Wv.sub(Wp).normalize();
          toL(P.copy(Wp)); toL(q2.copy(Wp).add(Wv)); V.copy(q2).sub(P).normalize();
          stack(P, V, s * (1 + 22 * e * e)); plume(P, q2.copy(V).negate(), lv.plume * (1 + 2 * e), 0, 0.35);
          if (bo.prev) for (let j = 1; j < 4; j++) SMOKE.emit(q1.lerpVectors(bo.prev, P, j / 4), null, rnd(1.1, 1.7), 0.01 * lv.plume, 0.045 * lv.plume, 0.88, 0.9, 0.94, 0.26, 0.5);
          (bo.prev || (bo.prev = new V3())).copy(P);
          if (kk > 0.3 && lab) lab.close();
          if (kk >= 1) { fb.release(ib); if (fu) fu.release(iu); lab && lab.close(); return false; }
        }
        return true;
      };
    };
    const LZ = (pad, h, dd) => move(pad.n, deg(h), deg(dd), new V3()).multiplyScalar(1.0045);
    const LAUNCH = {
      falcon9: { lv: 'f9', pad: PAD.cape, hdg: 50, title: 'FALCON 9 · CAPE CANAVERAL', lz: LZ(PAD.cape, 200, 0.8), lzName: 'LZ-1' },
      vandenberg: { lv: 'f9', pad: PAD.vand, hdg: 185, title: 'FALCON 9 · VANDENBERG', lz: LZ(PAD.vand, 330, 0.6), lzName: 'LZ-4' },
      starship: { lv: 'ss', pad: PAD.sbase, hdg: 95, title: 'STARSHIP · STARBASE', lz: PAD.sbase.at(0, 0.1, 0, new V3()) },
      shavit: { lv: 'rk', n: geo(31.88, 34.68), hdg: 275, title: 'SHAVIT · PALMACHIM', sub: 'RETROGRADE · OFEK' },
      longmarch: { lv: 'lm', pad: PAD.wench, hdg: 100, title: 'LONG MARCH 5 · WENCHANG' },
      vega: { lv: 'rk', pad: PAD.kourou, hdg: 355, title: 'VEGA-C · KOUROU' },
      sealaunch: { lv: 'rk', pad: U_.barge, off: [0.38, 0.064], hdg: 150, title: 'JIELONG-3 · SEA LAUNCH', sub: 'YELLOW SEA' },
    };
    const EVDEF = {
      bm: { at: geo(33.5, 41), w: 2.5, cool: 34, run: evBM }, dome: { at: geo(31.8, 34.8), w: 2.5, cool: 26, run: evDome }, laser: { at: geo(33.2, 35.6), w: 2, cool: 30, run: evLaser },
      strike: { at: geo(32.5, 44), w: 2, cool: 40, run: evStrike }, swarm: { at: geo(49.5, 33.5), w: 2.5, cool: 26, run: evSwarm }, redsea: { at: geo(16.5, 42), w: 2, cool: 30, run: evRedSea },
      hgv: { at: geo(32, 113), w: 1.6, cool: 40, run: evHGV }, icbm: { at: geo(40, 131), w: 1.2, cool: 50, run: evICBM }, sudan: { at: geo(14.2, 29), w: 0.8, cool: 60, run: evSudan },
    };
    if (FLY) { for (const k in EVDEF) delete EVDEF[k]; delete LAUNCH.sealaunch; }
    for (const k in LAUNCH) { const cf = LAUNCH[k]; EVDEF[k] = { at: (cf.pad ? cf.pad.n : cf.n).clone(), w: 1.3, cool: OUT ? 30 : 40, run: (d) => (OUT ? evLaunchOut(d, cf) : evLaunch(d, cf)) }; }
    const IMG = { cur: null, next: 7, hyper: null, inspect: null };
    for (const w of ((window.WALL_DATA && window.WALL_DATA.globeEvents) || [])) { const d = EVDEF[w.type]; if (d) { d.w *= 2; d.title = w.title; d.sub = w.sub; } else if (w.type === 'hyper') IMG.hyper = { n: geo(w.lat, w.lon), title: w.title, sub: w.sub }; else if (w.type === 'inspect') IMG.inspect = { title: w.title, sub: w.sub }; }
    const ACTIVE = []; let nextEv = 5;
    const canRun = (d) => { toW(T1.copy(d.at)); if (OUT) return T1.z > 0.25 && Math.abs(T1.x) > 0.28; return T1.z > 0.3 && ((T1.x > -0.95 && T1.x < -0.6) || (T1.x > 0.3 && T1.x < 0.62)); };
    const spawn = (k) => { const d = EVDEF[k]; if (!d) return false; d.last = t; const st = d.run(d); if (st) ACTIVE.push({ k, step: st }); return !!st; };
    const schedule = () => {
      if (!FULL || t < nextEv || ACTIVE.length >= 2) return;
      const busyLaunch = ACTIVE.some((a) => LAUNCH[a.k]);
      const cands = Object.keys(EVDEF).filter((k) => t - (EVDEF[k].last ?? -999) > EVDEF[k].cool && !ACTIVE.some((a) => a.k === k || EVDEF[a.k].at.distanceTo(EVDEF[k].at) < 0.35) && !(busyLaunch && LAUNCH[k]) && canRun(EVDEF[k]));
      if (!cands.length) { nextEv = t + 1; return; }
      let r = Math.random() * cands.reduce((s, k) => s + EVDEF[k].w, 0), pick = cands[0];
      for (const k of cands) { r -= EVDEF[k].w; if (r <= 0) { pick = k; break; } }
      spawn(pick); nextEv = t + (OUT ? rnd(5, 9) : rnd(3, 6));
    };

    // ----- satellite imaging: slew, footprint, push-broom scan, target ID -----
    const fpMat = additive(new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uK: { value: 0 }, uScan: { value: 0 }, uHyper: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uK, uScan, uHyper; varying vec2 vUv;
float aa(float d, float w){ float fw = fwidth(d) * 1.2 + 1e-5; return 1.0 - smoothstep(w, w + fw, d); }
void main(){ vec2 e = min(vUv, 1.0 - vUv); float edge = aa(min(e.x, e.y), 0.012);
 vec2 g = abs(fract(vUv * vec2(8.0, 6.0)) - 0.5); float grid = aa(0.5 - max(g.x, g.y), 0.02) * 0.25;
 float corner = step(min(e.x, e.y), 0.03) * step(max(e.x, e.y), 0.18);
 float sc = exp(-pow((vUv.y - uScan) * 40.0, 2.0)); float done = step(vUv.y, uScan);
 vec3 hyp = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + vUv.x * 1.3 + vUv.y * 0.7 + sin(vUv.x * 30.0) * 0.05));
 vec3 base = mix(vec3(0.45, 0.85, 1.0), hyp, uHyper);
 vec3 col = base * (edge * 1.4 + grid + sc * 2.2 + done * (0.06 + uHyper * 0.22)) + vec3(0.7, 1.0, 0.9) * corner * 1.2;
 gl_FragColor = vec4(col * uK, 1.0); }` }));
    fpMat.extensions.derivatives = true;
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fpMat); fp.visible = false; spinG.add(fp);
    const frus = (() => {
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3));
      const tri = new THREE.Mesh(tg, additive(new THREE.MeshBasicMaterial({ color: hdr(0x6fc8ff, 1), opacity: 0, side: THREE.DoubleSide })));
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48), 3));
      const ln = new THREE.LineSegments(lg, additive(new THREE.LineBasicMaterial({ color: hdr(0xbfeaff, 1.4), opacity: 0 })));
      tri.frustumCulled = ln.frustumCulled = false; tri.visible = ln.visible = false; scene.add(tri, ln);
      return {
        set(a, cs, k) { const P = tg.attributes.position.array, L = lg.attributes.position.array; for (let i = 0; i < 4; i++) { const b = cs[i], c2 = cs[(i + 1) % 4]; P.set([a.x, a.y, a.z, b.x, b.y, b.z, c2.x, c2.y, c2.z], i * 9); L.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); L.set([b.x, b.y, b.z, c2.x, c2.y, c2.z], 24 + i * 6); } tg.attributes.position.needsUpdate = true; lg.attributes.position.needsUpdate = true; tri.material.opacity = 0; ln.material.opacity = 0.55 * k; tri.visible = false; ln.visible = true; },
        hide() { tri.visible = ln.visible = false; },
      };
    })();
    const tags = [0, 1, 2, 3].map(() => { const g = new THREE.Group(), m = new THREE.LineSegments(bracketGeo, additive(new THREE.LineBasicMaterial({ color: hdr(0x9dffc4, 1.5), opacity: 0 }))); g.add(m); g.visible = false; spinG.add(g); return { g, m }; });
    const QI = new THREE.Quaternion(), qT = new THREE.Quaternion(), qW = new THREE.Quaternion(), _m4b = new THREE.Matrix4();
    const corners = [new V3(), new V3(), new V3(), new V3()], camW = new V3();
    const RCS = [[0.0125, -0.0185, 0.0145], [-0.0125, -0.0185, 0.0145], [0.0125, -0.0185, -0.0145], [-0.0125, -0.0185, -0.0145]].map((a) => new V3(...a));
    const rcsPuff = (s) => { for (const r of RCS) { s.inner.localToWorld(R1.copy(r)); toL(R1); for (let i = 0; i < 4; i++) SMOKE.emit(R1, rndDir(rv, 0.03), rnd(0.4, 0.7), 0.003, 0.014, 0.95, 0.97, 1, 0.5, 2); FIRE.emit(R1, null, 0.12, 0.004, 0.008, 3, 3.5, 4); } };
    const visFrom = (s, wp) => T2.subVectors(s.w, wp).normalize().dot(T3.copy(wp).normalize()) > 0.2;
    const imgPick = () => {
      const r = Math.random();
      if (IMG.inspect && r < 0.25) for (const x of xlinks) if (x.a.w.distanceTo(x.b.w) < 0.75 && x.a.w.z > 0 && x.b.w.z > -0.2) return { s: x.a, sat2: x.b, o: IMG.inspect };
      if (IMG.hyper && r < 0.55) { toW(T1.copy(IMG.hyper.n)); if (T1.z > 0.4 && Math.abs(T1.x) > 0.3) { for (const s of allSats) if (s.w.z > 0.05 && visFrom(s, T1)) return { s, get: (o) => o.copy(IMG.hyper.n).multiplyScalar(1.004), o: { title: IMG.hyper.title, sub: 'SLEW TO TARGET', sub2: IMG.hyper.sub, hyper: true } }; } }
      const sats = allSats.slice().sort(() => Math.random() - 0.5);
      for (const s of sats) { if (s.w.z < 0.05) continue; const cand = UNITS.filter((u) => { if (!u.cls) return false; toW(T1.copy(u.p)); if (T1.z < 0.42 || Math.abs(T1.x) < 0.3) return false; return visFrom(s, T1); }); if (cand.length) { const u = cand[(Math.random() * cand.length) | 0]; return { s, get: (o) => o.copy(u.p), o: {} }; } }
      return null;
    };
    const imgStart = (pk) => {
      const s = pk.s, idx = allSats.indexOf(s) + 1; let near = [], sum = '';
      if (pk.get) { pk.get(T1); near = UNITS.filter((u) => u.cls && u.p.lengthSq() > 0.5 && u.p.angleTo(T1) < 0.07).slice(0, 4); const cnt = {}; near.forEach((u) => { cnt[u.cls] = (cnt[u.cls] || 0) + 1; }); sum = Object.entries(cnt).map(([k, v]) => (v > 1 ? v + '× ' : '') + k).join(' · '); }
      const cc = { s, get: pk.get, sat2: pk.sat2, T0: t, dur: 6.4, hyper: !!pk.o.hyper, near, sum: sum || 'AREA SURVEY', puffed: 0, sub2: pk.o.sub2 };
      cc.lab = label((v) => { if (cc.sat2) toL(v.copy(cc.sat2.w)); else cc.get(v); }, 'intel', pk.o.title || ('EO IMAGING · SAT-' + idx), pk.o.sub || 'SLEW TO TARGET');
      IMG.cur = cc;
    };
    const imgUpdate = () => {
      const cc = IMG.cur;
      if (!cc) { fp.visible = false; frus.hide(); for (const g of tags) g.g.visible = false; if (FULL && !FLY && t > IMG.next) { const pk = imgPick(); if (pk) imgStart(pk); IMG.next = t + rnd(7, 13); } return; }
      const lt = t - cc.T0, s = cc.s;
      if (cc.sat2) tA.copy(cc.sat2.w); else { cc.get(tC); toW(tA.copy(tC)); }
      s.g.getWorldQuaternion(qW).invert(); T1.subVectors(tA, s.w).applyQuaternion(qW).normalize(); qT.setFromUnitVectors(NZ, T1);
      const k = MU.smoothstep(lt, 0.1, 1.1) * (1 - MU.smoothstep(lt, cc.dur - 1.1, cc.dur - 0.1));
      s.inner.quaternion.slerpQuaternions(QI, qT, k);
      if ((lt > 0.1 && cc.puffed === 0) || (lt > cc.dur - 1.1 && cc.puffed === 1)) { cc.puffed++; rcsPuff(s); }
      const v = MU.smoothstep(lt, 1.0, 1.4) * (1 - MU.smoothstep(lt, cc.dur - 1.3, cc.dur - 1.0));
      s.inner.localToWorld(camW.copy(s.cam));
      if (v > 0.001) {
        if (cc.sat2) {
          fp.visible = false; T1.subVectors(tA, camW).normalize(); T2.crossVectors(T1, Y_AXIS).normalize(); T3.crossVectors(T2, T1);
          for (let i = 0; i < 4; i++) { const sx = i === 0 || i === 3 ? -1 : 1, sy = i < 2 ? -1 : 1; corners[i].copy(tA).addScaledVector(T2, sx * 0.035).addScaledVector(T3, sy * 0.035); }
        } else {
          const n = T2.copy(tC).normalize(); east(n, T3); tq.crossVectors(n, T3);
          fp.visible = true; fp.position.copy(n).multiplyScalar(1.0075); _m4b.makeBasis(T3, tq, n); fp.quaternion.setFromRotationMatrix(_m4b); fp.scale.set(0.11, 0.08, 1);
          fpMat.uniforms.uK.value = v; fpMat.uniforms.uScan.value = MU.clamp((lt - 1.3) / 2.4, 0, 1.2); fpMat.uniforms.uHyper.value = cc.hyper ? 1 : 0;
          for (let i = 0; i < 4; i++) { const sx = i === 0 || i === 3 ? -1 : 1, sy = i < 2 ? -1 : 1; corners[i].copy(n).addScaledVector(T3, sx * 0.055).addScaledVector(tq, sy * 0.04).normalize().multiplyScalar(1.0075); toW(corners[i]); }
        }
        frus.set(camW, corners, v);
        if ((lt > 1.5 && lt < 1.56) || (lt > 2.7 && lt < 2.76) || (lt > 3.9 && lt < 3.96)) { toL(T1.copy(camW)); FIRE.glow(T1, 0.03, 6, 7, 8); }
      } else { fp.visible = false; frus.hide(); }
      const tv = MU.smoothstep(lt, 2.2, 2.5) * (1 - MU.smoothstep(lt, cc.dur - 1.4, cc.dur - 1.0));
      tags.forEach((g, i) => { const u = cc.near[i]; if (!u || tv < 0.01) { g.g.visible = false; return; } g.g.visible = true; const n = T2.copy(u.p).normalize(); g.g.position.copy(n).multiplyScalar(1.006); g.g.quaternion.setFromUnitVectors(Z_AXIS, n); g.g.scale.setScalar(u.s * 16 * (1 + 0.6 * (1 - MU.smoothstep(lt, 2.2, 2.6)))); g.m.material.opacity = tv * (lt < 2.9 ? (Math.sin(lt * 38) > 0 ? 1 : 0.35) : 0.85); });
      if (lt > 1.2 && !cc.acq) { cc.acq = true; cc.lab && cc.lab.set(null, cc.sat2 ? 'RPO · RESOLVED IMAGE' : cc.hyper ? 'HYPERSPECTRAL · 240 BANDS' : 'IMAGING · GSD 0.5 M'); }
      if (lt > 2.6 && !cc.idd) { cc.idd = true; if (!cc.sat2) cc.lab && cc.lab.set(null, cc.hyper ? cc.sub2 : 'TGT ID · ' + cc.sum + ' · CONF 0.' + (88 + ((Math.random() * 11) | 0))); }
      if (lt > cc.dur) { s.inner.quaternion.identity(); cc.lab && cc.lab.close(); IMG.cur = null; }
    };

    // ----- ambient life -----
    const FRONT = [geo(47.9, 37.6), geo(48.5, 37.9), geo(47.4, 35.8)]; let nextFront = 2;
    const ambient = (dt) => {
      for (const f of FIRES) { toW(T1.copy(f.p)); if (T1.z < -0.2) continue; FIRE.glow(f.p, 0.006 + 0.0025 * Math.sin(t * 13 + f.ph) + 0.002 * Math.random(), 4, 1.9, 0.6); if (Math.random() < dt * 8) SMOKE.emit(f.p, T2.copy(f.p).multiplyScalar(0.006).add(rndDir(rv, 0.0018)), rnd(4, 6), 0.006, 0.05, 0.42, 0.4, 0.38, 0.5, 0.3); }
      if (!FLY && t > nextFront) {
        nextFront = t + rnd(0.5, 1.6); const cc = FRONT[(Math.random() * FRONT.length) | 0]; toW(T1.copy(cc));
        if (T1.z > 0.1) { const p = move(cc, rnd(0, TAU), deg(rnd(0, 1.3)), new V3()).multiplyScalar(1.0045); FIRE.emit(p, null, 0.18, 0.005, 0.013, 6, 4, 2); SMOKE.emit(p, null, 2.4, 0.004, 0.014, 0.5, 0.48, 0.45, 0.4); if (Math.random() < 0.4) { const tk = TANKS[(Math.random() * TANKS.length) | 0], mz = tk.at(0.85, 0.37, 0, new V3()); FIRE.emit(mz, null, 0.1, 0.005, 0.012, 7, 5, 3); SMOKE.emit(mz, null, 1.6, 0.003, 0.01, 0.6, 0.58, 0.55, 0.35); } }
      }
      for (let i = BURNS.length - 1; i >= 0; i--) { const b = BURNS[i]; if (t > b.until) { BURNS.splice(i, 1); continue; } FIRE.glow(b.p, 0.007 + 0.003 * Math.random(), 4, 1.8, 0.5); if (Math.random() < dt * 14) SMOKE.emit(b.p, T2.copy(b.p).multiplyScalar(0.008).add(rndDir(rv, 0.002)), rnd(3, 5), 0.008, 0.055, 0.3, 0.29, 0.28, 0.6, 0.3); }
      for (let i = FALL.length - 1; i >= 0; i--) if (!FALL[i](dt)) FALL.splice(i, 1);
    };

    const frame = (dt, tt) => {
      t = tt;
      scene.updateMatrixWorld(); invSpin.copy(spinG.matrixWorld).invert();
      warnLn.material.opacity = 0; lzCore.visible = lzGlow.visible = false;
      for (const m of MOVERS) m.update(t, dt);
      stationsUpdate(dt);
      schedule();
      for (let i = ACTIVE.length - 1; i >= 0; i--) { let ok = false; try { ok = ACTIVE[i].step(t, dt); } catch (e) { console.warn('theatre event', ACTIVE[i].k, e); } if (!ok) ACTIVE.splice(i, 1); }
      imgUpdate(); ambient(dt); lblUpdate(dt);
      for (const k in F) if (F[k].dirty) { F[k].im.instanceMatrix.needsUpdate = true; F[k].dirty = false; }
      FIRE.update(dt); SMOKE.update(dt);
    };
    return { frame, spawn, img: () => { const pk = imgPick(); if (pk) imgStart(pk); return !!pk; }, events: () => Object.keys(EVDEF), fx: { FIRE, SMOKE, toL, geo } };
  };
  return K;
})();
