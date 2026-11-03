// Launch theatre for <space-emblem-v7>: space launch vehicles + satellites only.
// Gravity-turn ascent in a frame that blends from Earth-fixed to inertial, staging, fairing sep, orbit insertion,
// payload deployment into persistent orbits, stage deorbit/burn-up, booster RTLS / droneship / tower catch.
window.EmblemLaunch = (() => {
  const theatre = (c) => {
    const { THREE, U, TAU, deg, scene, spinG, hdr, additive, glowTex, canvasTex } = c, V3 = THREE.Vector3, MU = THREE.MathUtils, ss = MU.smoothstep;
    const PRE0 = new Set([...spinG.children, ...scene.children]); let MINE = [], trafficOff = false;
    const FULL = c.FULL !== false, FL = window.EmblemLaunchModels(c, spinG), CFG = () => (c.cfg ? c.cfg() : { rate: 'normal', maxSats: 24, stack: 8 });
    let t = 0;
    const PRE = new Set([...spinG.children, ...scene.children]); let stnN = -1;
    const stencilize = () => { for (const root of [spinG, scene]) for (const ch of root.children) { if (PRE.has(ch)) continue; ch.traverse((x) => { const ms = x.material ? (Array.isArray(x.material) ? x.material : [x.material]) : []; for (const m of ms) if (!m.__stn) { m.__stn = 1; m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.NotEqualStencilFunc; m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp; } }); } };
    const rnd = (a, b) => a + Math.random() * (b - a);
    const invSpin = new THREE.Matrix4();
    const toW = (v) => v.applyMatrix4(spinG.matrixWorld);
    const Y_AXIS = new V3(0, 1, 0), _de = new V3(), _dn = new V3();
    const T1 = new V3(), T2 = new V3(), T3 = new V3(), tA = new V3(), tB = new V3(), tC = new V3(), tT = new V3(), rv = new V3(), rv2 = new V3(), Yb = new V3(), Zb = new V3(), tp = new V3(), tq = new V3();
    const geo = (lat, lon, r = 1) => { const th = deg(90 - lat), ph = deg(lon + 180); return new V3(-Math.cos(ph) * Math.sin(th) * r, Math.cos(th) * r, Math.sin(ph) * Math.sin(th) * r); };
    const east = (n, out) => { out.set(n.z, 0, -n.x); if (out.lengthSq() < 1e-10) out.set(1, 0, 0); return out.normalize(); };
    const north = (n, out) => out.crossVectors(n, east(n, _de)).normalize();
    const dirAt = (n, h, out) => { east(n, _de); _dn.crossVectors(n, _de).normalize(); return out.copy(_dn).multiplyScalar(Math.cos(h)).addScaledVector(_de, Math.sin(h)).normalize(); };
    const gc = (n, h, d, out) => out.copy(n).multiplyScalar(Math.cos(d)).addScaledVector(h, Math.sin(d));
    const gcT = (n, h, d, out) => out.copy(n).multiplyScalar(-Math.sin(d)).addScaledVector(h, Math.cos(d));
    const rotY = (v, a, out) => { const cs = Math.cos(a), sn = Math.sin(a), x = v.x, z = v.z; return out.set(x * cs + z * sn, v.y, -x * sn + z * cs); };
    const rndDir = (out, k) => out.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(k);
    const nlerp = (a, b, k, out) => { out.copy(a).multiplyScalar(1 - k).addScaledVector(b, k); if (out.lengthSq() < 1e-8) out.copy(b); return out.normalize(); };
    const basisOf = (fw, up) => { Yb.copy(up).addScaledVector(fw, -up.dot(fw)); if (Yb.lengthSq() < 1e-9) { Yb.set(0, 1, 0).addScaledVector(fw, -fw.y); if (Yb.lengthSq() < 1e-9) Yb.set(1, 0, 0); } Yb.normalize(); Zb.crossVectors(fw, Yb); };

    // ---------- particles (spinG-local): additive fire + sun-lit smoke ----------
    const smokeTex = canvasTex(128, (g) => { for (let i = 0; i < 16; i++) { const a = Math.random() * TAU, r = Math.random() * 24, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, s2 = 16 + Math.random() * 22; const gr = g.createRadialGradient(x, y, 0, x, y, s2); gr.addColorStop(0, 'rgba(255,255,255,0.34)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); } });
    const fxVS = `attribute vec4 aCol; attribute float aSize; attribute float aRot; uniform float uPx, uD, uLit; uniform vec3 uSun; varying vec4 vCol; varying float vRot;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vec4 mv = viewMatrix * wp;
 float lit = mix(1.0, 0.16 + 0.95 * smoothstep(-0.3, 0.35, dot(normalize(wp.xyz), uSun)), uLit);
 vCol = vec4(aCol.rgb * lit, aCol.a); vRot = aRot;
 gl_PointSize = aSize * uPx * uD / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; if (aSize <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`;
    const fxFS = (add) => `uniform sampler2D uTex; varying vec4 vCol; varying float vRot;
void main(){ vec2 q = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot); q = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y); float m = texture2D(uTex, q + 0.5).a; if (m < 0.004) discard; ${add ? 'gl_FragColor = vec4(vCol.rgb * m, 1.0);' : 'gl_FragColor = vec4(vCol.rgb, vCol.a * m);'} }`;
    const makeFX = (N, add, tex) => {
      const G = 160, TT = N + G;
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
        emit(p, v, lf, a, b, r, gg, bb, al = 1, dr = 0, gr = 0) { const i = head; head = (head + 1) % N; const j = i * 3, q = i * 4; pos[j] = p.x; pos[j + 1] = p.y; pos[j + 2] = p.z; if (v) { vel[j] = v.x; vel[j + 1] = v.y; vel[j + 2] = v.z; } else vel[j] = vel[j + 1] = vel[j + 2] = 0; age[i] = 0; life[i] = lf; s0[i] = a; s1[i] = b; c0[q] = r; c0[q + 1] = gg; c0[q + 2] = bb; c0[q + 3] = al; drag[i] = dr; grav[i] = gr; if (!alive[i]) nAlive++; alive[i] = 1; size[i] = a; },
        glow(p, s, r, gg, bb) { if (gN >= G) return; const i = N + gN++, j = i * 3, q = i * 4; pos[j] = p.x; pos[j + 1] = p.y; pos[j + 2] = p.z; size[i] = s; col[q] = r; col[q + 1] = gg; col[q + 2] = bb; col[q + 3] = 1; },
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
            else { size[i] = s0[i] + (s1[i] - s0[i]) * (1 - (1 - k) * (1 - k)); col[q] = c0[q]; col[q + 1] = c0[q + 1]; col[q + 2] = c0[q + 2]; col[q + 3] = c0[q + 3] * Math.min(1, k * 14) * Math.pow(1 - k, 1.15); }
          }
          for (let i = N + gN; i < N + gPrev; i++) size[i] = 0;
          gPrev = gN; gN = 0; aP.needsUpdate = true; aC.needsUpdate = true; aS.needsUpdate = true;
        },
      };
    };
    const FIRE = makeFX(3500, true, glowTex), SMOKE = makeFX(4500, false, smokeTex);

    // ---------- engine plumes: volumetric cone shader (sea level: shock diamonds; vacuum: wide, faint) ----------
    const PK = {
      kero: { core: [1.0, 0.86, 0.6], outer: [1.0, 0.5, 0.16], ci: 3.4, oi: 1.9, smoke: 1 },
      mlox: { core: [0.86, 0.86, 1.0], outer: [0.62, 0.4, 1.0], ci: 3.2, oi: 1.5, smoke: 0.55 },
      hydro: { core: [0.92, 0.95, 1.0], outer: [0.45, 0.6, 1.0], ci: 2.8, oi: 0.9, smoke: 0.45 },
      solid: { core: [1.0, 0.95, 0.82], outer: [1.0, 0.62, 0.26], ci: 4, oi: 2.4, smoke: 1.6 },
    };
    const plumeGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 14, true).translate(0, 0.5, 0);
    const plumeVS = `uniform float uExp; varying vec2 vUv; varying float vF;
void main(){ vUv = uv; float y = uv.y; vec3 p = position; float rr = mix(1.0, uExp, pow(y, 0.6)) * (1.0 + 0.18 * sin(y * 3.14159)); p.xz *= rr;
 vec4 mv = modelViewMatrix * vec4(p, 1.0); vec3 nv = normalize(normalMatrix * vec3(normal.x, 0.0, normal.z)); vF = pow(abs(dot(nv, normalize(-mv.xyz))), 1.3); gl_Position = projectionMatrix * mv; }`;
    const plumeFS = `uniform vec3 uCore, uOuter; uniform float uT, uAtm, uI, uSeed; varying vec2 vUv; varying float vF;
void main(){ float y = vUv.y;
 float fade = smoothstep(0.0, 0.025, y) * (1.0 - smoothstep(0.55, 1.0, y));
 float body = pow(1.0 - y, 1.5) * fade;
 float core = pow(1.0 - y, 6.0) * smoothstep(0.0, 0.02, y);
 float dia = uAtm * pow(0.5 + 0.5 * cos(y * 34.0 - 0.8), 8.0) * (1.0 - smoothstep(0.12, 0.5, y)) * smoothstep(0.03, 0.08, y);
 float fl = 0.84 + 0.16 * sin(uT * 63.0 + y * 23.0 + uSeed) * sin(uT * 41.0 - y * 17.0 + uSeed * 1.7);
 vec3 col = uOuter * body * (0.35 + 0.65 * vF) * 1.5 + uCore * (core * (0.4 + 0.6 * vF) * 1.6 + dia * pow(vF, 3.0) * 1.6);
 gl_FragColor = vec4(col * fl * uI, 1.0); }`;
    const PLM = []; for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(plumeGeo, additive(new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uCore: { value: new THREE.Color() }, uOuter: { value: new THREE.Color() }, uT: U.time, uAtm: { value: 0 }, uI: { value: 1 }, uSeed: { value: Math.random() * 10 }, uExp: { value: 1.3 } }, vertexShader: plumeVS, fragmentShader: plumeFS }))); m.visible = false; m.frustumCulled = false; m.renderOrder = 7; spinG.add(m); PLM.push(m); }
    let plN = 0; const _pw = new V3(), _pa = new V3(), _pc = new V3();
    const plume = (pos, ex, r, kind, I = 1) => {
      if (plN >= PLM.length || I <= 0.01) return;
      _pw.copy(pos).applyMatrix4(spinG.matrixWorld); _pa.copy(ex).transformDirection(spinG.matrixWorld); const endOn = Math.abs(_pa.dot(_pc.copy(c.camera.position).sub(_pw).normalize())), eo = 1 - ss(endOn, 0.72, 0.96);
      const m = PLM[plN++], vk = kind.endsWith('vac'), K = PK[vk ? kind.slice(0, -3) : kind], vac = vk ? 1 : ss(pos.length(), 1.035, 1.12);
      const u = m.material.uniforms; u.uCore.value.setRGB(K.core[0], K.core[1], K.core[2]).multiplyScalar(K.ci); u.uOuter.value.setRGB(K.outer[0], K.outer[1], K.outer[2]).multiplyScalar(K.oi * (1 - 0.5 * vac));
      u.uAtm.value = 1 - vac; u.uI.value = I * (1 - 0.35 * vac) * eo; u.uExp.value = 1.25 + 3.2 * vac;
      const L = r * (13 + 7 * vac) * (0.94 + 0.12 * Math.random()) * Math.min(1, I * 1.4);
      m.visible = true; m.position.copy(pos); m.quaternion.setFromUnitVectors(Y_AXIS, ex); m.scale.set(r, L, r);
      FIRE.glow(pos, r * (3.2 + 2 * eo), K.outer[0] * 2.6 * I, K.outer[1] * 2.6 * I, K.outer[2] * 2.6 * I);
    };
    const trail = (pos, ex, r, kind, I = 1) => {
      const dens = 1 - ss(pos.length() - 1, 0.03, 0.11); if (dens <= 0.02 || I < 0.2) return; const K = PK[kind.replace('vac', '')], solid = kind.startsWith('solid');
      for (let i = 0; i < (solid ? 3 : 2); i++) { tT.copy(pos).addScaledVector(ex, r * rnd(1.5, 5)); SMOKE.emit(tT, rv.copy(ex).multiplyScalar(0.012).add(rndDir(rv2, 0.003)), rnd(3.5, 5.5), r * 1.3, r * (solid ? 8 : 5.5) * (1 + 1.2 * (1 - dens)), 0.9, 0.91, 0.94, Math.min(0.55, 0.34 * K.smoke) * dens, 0.5); }
    };
    const _ep = new V3(), _ex = new V3();
    const eng = (pos, fw, e, s, I = 1, rk = 1) => { _ex.copy(fw).negate(); _ep.copy(pos).addScaledVector(fw, e[2] * s); plume(_ep, _ex, e[1] * s * rk, e[0], (e[3] || 1) * I); trail(_ep, _ex, e[1] * s * rk, e[0], I); };
    const groundCloud = (P, n, k, cnt) => { east(n, tB); for (let i = 0; i < cnt; i++) { rv.copy(tB).applyAxisAngle(n, rnd(0, TAU)).multiplyScalar(rnd(0.02, 0.05) * k); SMOKE.emit(P, rv, rnd(3, 5), 0.008 * k, rnd(0.03, 0.06) * k, 0.92, 0.93, 0.95, 0.5, 1.6); } };
    const puffRing = (p, fw, rr, n = 10, sp = 0.02) => { east(fw, tB); tC.crossVectors(fw, tB).normalize(); tB.crossVectors(tC, fw).normalize(); for (let i = 0; i < n; i++) { const a = i / n * TAU; rv.copy(tB).multiplyScalar(Math.cos(a)).addScaledVector(tC, Math.sin(a)); T3.copy(p).addScaledVector(rv, rr); SMOKE.emit(T3, rv.multiplyScalar(sp), rnd(0.7, 1.1), rr * 0.3, rr * 1.6, 0.96, 0.97, 1, 0.45, 2.2); } };
    const hotStage = (p, fw, k) => { FIRE.emit(p, null, 0.3, 0.012 * k, 0.05 * k, 6, 4, 3.4); east(fw, tB); tC.crossVectors(fw, tB).normalize(); for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; rv.copy(tB).multiplyScalar(Math.cos(a)).addScaledVector(tC, Math.sin(a)).multiplyScalar(0.07 * k).addScaledVector(fw, -0.01); FIRE.emit(p, rv, 0.35, 0.006 * k, 0.002, 5, 3, 1.4, 1, 2); } };
    const plasma = (p, v, sz, k) => { FIRE.glow(p, sz * (1.4 + 2 * k), 3.6 * k, 1.6 * k, 1.1 * k); if (Math.random() < 0.8) FIRE.emit(p, rv.copy(v).multiplyScalar(-0.04).add(rndDir(rv2, 0.004)), rnd(0.3, 0.5), sz * 0.8, sz * 0.3, 4 * k, 1.8 * k, 1.3 * k); };
    const breakup = (p, v, sz) => { FIRE.emit(p, null, 0.4, sz, sz * 3, 5, 3.4, 2.2); for (let i = 0; i < 18; i++) FIRE.emit(p, rv.copy(v).multiplyScalar(rnd(0.02, 0.06)).add(rndDir(rv2, 0.025)), rnd(0.8, 1.8), sz * 0.25, sz * 0.08, 5, 2.4, 0.9, 1, 0.4); };

    // ---------- labels (English; leader line, depth-free) ----------
    const TONES = { launch: '#ffd27a', recov: '#a8f0b8', orbit: '#7fe0ff', il: '#9fd0ff' };
    const LBL = [0, 1, 2, 3].map((k) => {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 160; const g = cv.getContext('2d');
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 })); sp.renderOrder = 1000; sp.visible = false; scene.add(sp);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      const ln = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: hdr(0xbfe6ff, 1.1), transparent: true, opacity: 0, depthTest: false, depthWrite: false })); ln.renderOrder = 999; ln.frustumCulled = false; ln.visible = false; scene.add(ln);
      return { k, g, tex, sp, ln, on: false, op: 0, anchor: null, side: 0, tone: TONES.launch, w: new V3(), title: '', sub: '', dirty: false, tok: 0 };
    });
    const drawLbl = (L) => {
      const g = L.g, W = 1024, right = L.side < 0; g.clearRect(0, 0, W, 160);
      g.font = "600 46px 'IBM Plex Mono', monospace"; const w1 = g.measureText(L.title).width; g.font = "500 34px 'IBM Plex Mono', monospace"; const w2 = L.sub ? g.measureText(L.sub).width : 0;
      const w = Math.min(W - 20, Math.max(w1, w2) + 52), x0 = right ? W - w : 0, h = L.sub ? 132 : 76; L.wpx = w;
      const bg = g.createLinearGradient(x0, 0, x0 + w, 0); bg.addColorStop(right ? 1 : 0, 'rgba(6,16,38,0.82)'); bg.addColorStop(right ? 0 : 1, 'rgba(6,16,38,0.3)'); g.fillStyle = bg; g.fillRect(x0, 14, w, h);
      g.fillStyle = L.tone; g.fillRect(right ? W - 7 : 0, 14, 7, h);
      g.textAlign = right ? 'right' : 'left'; g.textBaseline = 'alphabetic'; const tx = right ? W - 26 : 26;
      g.font = "600 46px 'IBM Plex Mono', monospace"; g.fillStyle = '#eef7ff'; g.fillText(L.title, tx, 70);
      if (L.sub) { g.font = "500 34px 'IBM Plex Mono', monospace"; g.fillStyle = '#a6c8ea'; g.fillText(L.sub, tx, 124); }
      L.tex.needsUpdate = true;
    };
    let LBLOK = false;
    const label = (anchor, tone, title, sub) => {
      if (!LBLOK) return null;
      const L = LBL.find((l) => !l.on && l.op < 0.02); if (!L) return null; const tok = ++L.tok;
      Object.assign(L, { on: true, anchor, tone: TONES[tone] || tone, title, sub: sub || '', dirty: true, side: 0 });
      return { set: (a, b) => { if (L.tok !== tok) return; if (a != null) L.title = a; if (b != null) L.sub = b; L.dirty = true; }, close: () => { if (L.tok === tok) L.on = false; } };
    };
    const lblUpdate = (dt) => {
      const wpc = (7 / 46) / (c.cssH() / (2 * c.half())), XM = 1.5;
      for (const L of LBL) {
        let vis = 0;
        if (L.anchor) {
          L.anchor(L.w); toW(L.w); vis = ss(L.w.z, 0.05, 0.3); const bw = (L.wpx || 700) * wpc;
          if (!L.side) { L.side = L.w.x > 0 ? 1 : -1; if (L.side > 0 && L.w.x + bw > XM) L.side = -1; else if (L.side < 0 && L.w.x - bw < -XM) L.side = 1; L.dirty = true; L.px = null; }
          else if ((L.side > 0 && L.w.x + 0.04 + bw > XM + 0.15) || (L.side < 0 && L.w.x - 0.04 - bw < -XM - 0.15)) { L.side = -L.side; L.dirty = true; }
        }
        L.op += ((L.on ? vis : 0) - L.op) * Math.min(1, dt * 5);
        if (!L.on && L.op < 0.02) { L.anchor = null; L.side = 0; L.sp.visible = L.ln.visible = false; continue; }
        if (L.dirty) { drawLbl(L); L.dirty = false; }
        const w = L.w, bw = (L.wpx || 700) * wpc, dy = (L.k % 2 ? -1 : 1) * (0.028 + 0.012 * (L.k >> 1)), tx = w.x + 0.035 * L.side, ty = w.y + dy;
        if (L.px == null) { L.px = tx; L.py = ty; } else { const f = Math.min(1, dt * 7); L.px += (tx - L.px) * f; L.py += (ty - L.py) * f; }
        const x0 = L.side > 0 ? L.px : L.px - bw, x1 = x0 + bw, RX = L.py < -0.45 ? 0.68 : 0.3, overR = x1 > -RX && x0 < RX && L.py < 1.35 && L.py > -1.3, ko = overR ? 0.15 : 1;
        L.ko = (L.ko ?? 1) + (ko - (L.ko ?? 1)) * Math.min(1, dt * 6);
        L.sp.visible = L.ln.visible = true; L.sp.material.opacity = L.op * 0.85 * L.ko; L.ln.material.opacity = L.op * 0.5 * L.ko;
        L.sp.center.set(L.side > 0 ? 0 : 1, 0.5); L.sp.position.set(L.px, L.py, w.z + 0.3); L.sp.scale.set(1024 * wpc, 160 * wpc, 1);
        const a = L.ln.geometry.attributes.position.array; a[0] = w.x; a[1] = w.y; a[2] = w.z; a[3] = L.px; a[4] = L.py; a[5] = w.z + 0.3; a[6] = L.px; a[7] = L.py; a[8] = w.z + 0.3; L.ln.geometry.attributes.position.needsUpdate = true;
      }
    };

    // ---------- vehicles (model units; engines: [kind, radius, x-offset, intensity]) ----------
    const VEH = {
      f9: { s: 0.21, b: 'f9b0', bVar: ['f9b0', 'f9b1', 'f9b2'], Lb: 0.62, st: 'f9s', Ls: 0.18, fair: 'f9f', pay: 'slkStk', payload: 'slk', nPay: 8, kMeco: 0.38, kFair: 0.55, eb: ['kero', 0.031, -0.02, 1], es: ['kerovac', 0.025, -0.062, 1], recover: true, tins: [10.5, 11.5] },
      ss: { s: 0.26, b: 'sh', Lb: 0.67, st: 'ss', Ls: 0.5, payload: 'slk', nPay: 6, pez: true, kMeco: 0.36, eb: ['mlox', 0.046, -0.012, 1.1], es: ['mloxvac', 0.034, -0.03, 1], esl: ['mlox', 0.014, -0.012, 1], recover: true, catch: true, hot: true, ship: true, tins: [11, 12] },
      sz: { s: 0.18, b: 'szc', Lb: 0.5, st: 'szs', Ls: 0.14, fair: 'szf', payload: 'prg', nPay: 1, straps: { m: 'szb', n: 4, r: 0.047, k: 0.3, e: ['kero', 0.019, -0.012, 0.9], cross: true }, kMeco: 0.62, kFair: 0.5, eb: ['kero', 0.019, -0.012, 0.9], es: ['kerovac', 0.016, -0.02, 0.9], tins: [11, 12] },
      a6: { s: 0.2, b: 'a6c', Lb: 0.6, st: 'a6u', Ls: 0.14, fair: 'a6f', payload: 'gsat', nPay: 1, straps: { m: 'p120', n: 2, r: 0.054, k: 0.32, e: ['solid', 0.017, -0.024, 1.1] }, kMeco: 0.62, kFair: 0.5, eb: ['hydro', 0.016, -0.034, 1], es: ['hydrovac', 0.014, -0.04, 1], tins: [11, 12] },
      cz5: { s: 0.2, b: 'cz5c', Lb: 0.6, st: 'cz5u', Ls: 0.14, fair: 'cz5f', payload: 'gsat', nPay: 1, straps: { m: 'cz5b', n: 4, r: 0.058, k: 0.36, e: ['kero', 0.018, -0.016, 0.9] }, kMeco: 0.62, kFair: 0.5, eb: ['hydro', 0.022, -0.03, 1], es: ['hydrovac', 0.016, -0.034, 1], tins: [11, 12] },
      shv: { s: 0.18, b: 'shv1', Lb: 0.32, mid: 'shv2', Lm: 0.2, kMid: 0.66, em: ['solid', 0.016, -0.014, 0.9], st: 'shv3', Ls: 0.1, fair: 'shvf', payload: 'ofk', nPay: 1, kMeco: 0.34, kFair: 0.58, eb: ['solid', 0.019, -0.018, 1], es: ['solidvac', 0.013, -0.012, 0.9], tins: [10, 11] },
    };
    Object.assign(VEH, window.EmblemLaunchVeh || {});
    for (const k in VEH) { const V = VEH[k]; V.X = { m: V.Lb, st: V.Lb + (V.Lm || 0), fr: V.Lb + (V.Lm || 0) + V.Ls }; }
    const SAT_S = { orn: 0.032, jw: 0.05, rm: 0.045, slk: 0.028, gsat: 0.028, ofk: 0.028, ofs: 0.028, prg: 0.032, wv: 0.03, pln: 0.03, sky: 0.026 };
    const SITES = [
      { id: 'falconheavy', name: 'FALCON HEAVY · LC-39A', lat: 28.608, lon: -80.604, veh: 'fh', hdg: 90, hj: 4, pad: 'gp', orbit: 'GTO', w: 1, hi: 1, raR: [2.6, 3.2], hiOrbit: 'DIRECT GEO INSERTION', hiPay: 'USSF' },
      { id: 'sls', name: 'SLS · ARTEMIS · LC-39B', lat: 28.627, lon: -80.621, veh: 'sls', hdg: 72, hj: 3, pad: 'gp', orbit: 'TLI', w: 0.7, hi: 1, raR: [3.4, 4.0], hiOrbit: 'TRANS-LUNAR INJECTION', hiPay: 'ORION', payName: 'ORION' },
      { id: 'vulcan', name: 'VULCAN · ULA · SLC-41', lat: 28.583, lon: -80.583, veh: 'vul', hdg: 95, hj: 5, pad: 'gp', orbit: 'MEO', w: 0.9, hiP: 0.6, hiOrbit: 'GTO 185 × 35,786 KM', hiPay: 'GPS III', payName: 'NSSL' },
      { id: 'newglenn', name: 'NEW GLENN · BLUE ORIGIN · LC-36', lat: 28.47, lon: -80.54, veh: 'ng', hdg: 80, hj: 5, pad: 'gp', orbit: 'LEO 630 KM', w: 0.9, hiP: 0.4, hiOrbit: 'GTO', hiPay: 'COMSAT', payName: 'KUIPER' },
      { id: 'electron', name: 'ELECTRON · ROCKET LAB · MAHIA', lat: -39.26, lon: 177.86, veh: 'el', hdg: 185, hj: 6, pad: 'gp', orbit: 'SSO 520 KM', w: 1, payName: 'SMALLSAT' },
      { id: 'lvm3', name: 'LVM3 · ISRO · SRIHARIKOTA', lat: 13.72, lon: 80.23, veh: 'lv', hdg: 102, hj: 4, pad: 'gp', orbit: 'LEO', w: 0.9, hiP: 0.6, hiOrbit: 'GTO', hiPay: 'GSAT', payName: 'BLUEBIRD' },
      { id: 'pslv', name: 'PSLV · ISRO · SRIHARIKOTA', lat: 13.66, lon: 80.26, veh: 'ps', hdg: 150, hj: 4, pad: 'gp', orbit: 'SSO 600 KM', w: 0.8, payName: 'EOS' },
      { id: 'h3', name: 'H3 · JAXA · TANEGASHIMA', lat: 30.4, lon: 130.97, veh: 'h3', hdg: 100, hj: 4, pad: 'gp', orbit: 'SSO', w: 0.8, hiP: 0.5, hiOrbit: 'GTO', hiPay: 'MICHIBIKI', payName: 'ALOS' },
      { id: 'nuri', name: 'NURI · KARI · NARO', lat: 34.43, lon: 127.53, veh: 'nu', hdg: 170, hj: 3, pad: 'gp', orbit: 'SSO 600 KM', w: 0.6, payName: 'CAS500' },
      { id: 'angara', name: 'ANGARA-A5 · PLESETSK', lat: 62.93, lon: 40.57, veh: 'an', hdg: 10, hj: 4, pad: 'gp', orbit: 'LEO', w: 0.8, hiP: 0.4, hiOrbit: 'GTO', hiPay: 'COMSAT', payName: 'KOSMOS' },
      { id: 'cz2f', name: 'LONG MARCH 2F · JIUQUAN', lat: 40.96, lon: 100.28, veh: 'c2', hdg: 135, hj: 3, pad: 'gp', orbit: 'LEO 390 KM · 41.5°', w: 0.9, payName: 'SHENZHOU' },
      { id: 'falcon9', name: 'FALCON 9 · CAPE CANAVERAL', lat: 28.56, lon: -80.577, veh: 'f9', hdg: 48, hj: 10, pad: 'f9', asds: 9, lzName: 'LZ-1', orbit: 'LEO 550 KM', w: 1.4, hiP: 0.5, hiOrbit: 'GTO 185 × 35,786 KM', hiPay: 'COMSAT', deep: ['rm', 'NANCY GRACE ROMAN'] },
      { id: 'vandenberg', name: 'FALCON 9 · VANDENBERG', lat: 34.63, lon: -120.61, veh: 'f9', hdg: 188, hj: 6, pad: 'f9', lzName: 'LZ-4', orbit: 'SSO 560 KM', w: 1, rideP: 0.5, hiP: 0.35, hiOrbit: 'HEO · MOLNIYA-CLASS', hiPay: 'COMSAT' },
      { id: 'starship', name: 'STARSHIP · STARBASE', lat: 25.99, lon: -97.15, veh: 'ss', hdg: 95, hj: 5, pad: 'mz', orbit: 'COAST 200 KM', w: 1.3, hiP: 0.55, hiOrbit: 'HIGH ELLIPTICAL · 400 × 60,000 KM', raR: [3.2, 4.0] },
      { id: 'shavit', name: 'SHAVIT · PALMACHIM', lat: 31.88, lon: 34.68, veh: 'shv', hdg: 272, hj: 4, pad: 'gp', orbit: 'LEO 600 KM · RETROGRADE', payName: 'OFEK', pays: [['ofk', 'OFEK-16 · VISINT'], ['ofk', 'OFEK-11 · VISINT'], ['ofk', 'OFEK-9 · VISINT'], ['ofk', 'OFEK-7 · VISINT'], ['ofs', 'OFEK-10 · SAR'], ['ofs', 'TECSAR · SAR'], ['ofk', 'OFEK-5 · VISINT']], w: 4.5, il: true },
      { id: 'soyuz', name: 'SOYUZ-2 · BAIKONUR', lat: 45.92, lon: 63.34, veh: 'sz', hdg: 62, hj: 4, pad: 'gp', orbit: 'LEO 420 KM', payName: 'PROGRESS MS', w: 1 },
      { id: 'ariane6', name: 'ARIANE 6 · KOUROU', lat: 5.24, lon: -52.77, veh: 'a6', hdg: 90, hj: 6, pad: 'gp', orbit: 'GTO 250 × 35,786 KM', payName: 'COMSAT', w: 1, hi: 1, deep: ['jw', 'JWST'] },
      { id: 'longmarch', name: 'LONG MARCH 5 · WENCHANG', lat: 19.61, lon: 110.95, veh: 'cz5', hdg: 102, hj: 6, pad: 'gp', orbit: 'GTO 200 × 36,000 KM', payName: 'COMSAT', w: 1, hi: 1 },
    ];
    for (const w of ((window.WALL_DATA && window.WALL_DATA.globeEvents) || [])) { const S = SITES.find((x) => x.id === w.type); if (S) { S.w *= 2; if (w.title) S.title = w.title; if (w.sub) S.sub0 = w.sub; } }

    // ---------- rigs: every site owns its vehicle parts; pads / towers / landing zones ----------
    const placeB = (S, v, p, fw, up) => { const V = S.V; S.rig.b.forEach((i, j) => { const f = FL[V.bVar ? V.bVar[j] : V.b]; if (j === v) f.place(i, p, fw, up, S.scl || V.s); else f.hide(i); }); };
    const placeStack = (S, base, fw, up, A) => {
      const V = S.V, R = S.rig, s = S.scl || V.s, X = V.X; basisOf(fw, up);
      if (A.b) placeB(S, 0, base, fw, Yb);
      if (A.m) FL[V.mid].place(R.m, tp.copy(base).addScaledVector(fw, X.m * s), fw, Yb, s);
      if (A.st) FL[V.st].place(R.st, tp.copy(base).addScaledVector(fw, X.st * s), fw, Yb, s);
      if (A.fr) { tp.copy(base).addScaledVector(fw, X.fr * s); FL[V.fair].place(R.fr[0], tp, fw, Yb, s); FL[V.fair].place(R.fr[1], tp, fw, tq.copy(Yb).negate(), s); }
      if (A.pay && R.pay >= 0) FL[V.pay].place(R.pay, tp.copy(base).addScaledVector(fw, (X.fr + 0.004) * s), fw, Yb, s);
      if (A.sp) R.sp.forEach((i, j) => { tq.copy(strapDir(R.sp.length, j)); FL[V.straps.m].place(i, tp.copy(base).addScaledVector(tq, V.straps.r * s), fw, tq, s); });
    };
    const _sd = new V3();
    const strapDir = (n, j) => { const an = j / n * TAU + (n === 2 ? 0 : Math.PI / 4); return _sd.copy(Yb).multiplyScalar(Math.cos(an)).addScaledVector(Zb, Math.sin(an)); };
    const placeTE = (S, q) => { const a = q * deg(16); tA.copy(S.e).multiplyScalar(Math.cos(a)).addScaledVector(S.n, Math.sin(a)); tB.copy(S.n).multiplyScalar(Math.cos(a)).addScaledVector(S.e, -Math.sin(a)); FL.te.place(S.te, S.teP, tA, tB, S.V.s); };
    const placeChop = (S, b) => { const s = S.V.s; for (const [j, i] of [[1, S.chop[0]], [-1, S.chop[1]]]) { tA.copy(S.e).multiplyScalar(-Math.cos(b)).addScaledVector(S.nn, j * Math.sin(b)); FL.chop.place(i, S.P(0.09 * s, j * 0.075 * s, 0.83 * s), tA, S.n, s); } };
    const BODIES = [];
    const arm = (S) => {
      for (let i = BODIES.length - 1; i >= 0; i--) if (BODIES[i].site === S) BODIES.splice(i, 1);
      const V = S.V; S.scl = 0; placeStack(S, S.base, S.n, S.nn, { b: 1, m: !!V.mid, st: 1, fr: !!V.fair, pay: !!V.pay, sp: !!V.straps });
      if (S.te >= 0) placeTE(S, 0); if (S.chop) placeChop(S, 0.55); S.state = 'armed';
    };
    for (const S of SITES) {
      const V = S.V = VEH[S.veh], s = V.s;
      S.n = geo(S.lat, S.lon); S.e = east(S.n, new V3()); S.nn = north(S.n, new V3()); S.te = -1;
      const P = S.P = (dx, dz, h = 0) => S.n.clone().multiplyScalar(1.0012 + h).addScaledVector(S.e, dx).addScaledVector(S.nn, dz);
      let padTop = 0.02;
      if (S.pad === 'f9') {
        FL.twr.place(FL.twr.add(), P(0.09 * s, 0), S.e, S.n, s); S.te = FL.te.add(); S.teP = P(-0.052 * s, 0, 0.02 * s);
        const d = dirAt(S.n, deg(S.hdg + 165), new V3()), lz = S.n.clone().multiplyScalar(Math.cos(0.075)).addScaledVector(d, Math.sin(0.075)).multiplyScalar(1.0016), nl = lz.clone().normalize();
        FL.lz.place(FL.lz.add(), lz, east(nl, new V3()), nl, s); S.lzB = lz.clone().addScaledVector(nl, 0.045 * s);
        if (S.asds) { const hd = dirAt(S.n, deg(S.hdg), new V3()), a = deg(S.asds), p = S.n.clone().multiplyScalar(Math.cos(a)).addScaledVector(hd, Math.sin(a)).multiplyScalar(1.0012), na = p.clone().normalize(); FL.asds.place(FL.asds.add(), p, dirAt(na, deg(S.hdg), new V3()), na, s); S.asdsB = p.clone().addScaledVector(na, (0.0125 + 0.04) * s); }
      } else if (S.pad === 'mz') {
        FL.olm.place(FL.olm.add(), P(0, 0), S.e, S.n, s); FL.mz.place(FL.mz.add(), P(0.14 * s, 0), S.e, S.n, s); S.chop = [FL.chop.add(), FL.chop.add()]; padTop = 0.205; S.catchB = P(0, 0, 0.235 * s);
      } else FL.gp.place(FL.gp.add(), P(0, 0), S.e, S.n, s);
      S.gnd = P(0, 0); S.base = P(0, 0, padTop * s); S.R0 = S.base.length();
      S.rig = { b: (V.bVar || [V.b]).map((k) => FL[k].add()), m: V.mid ? FL[V.mid].add() : -1, st: FL[V.st].add(), fr: V.fair ? [FL[V.fair].add(), FL[V.fair].add()] : null, pay: V.pay ? FL[V.pay].add() : -1, sp: V.straps ? Array.from({ length: V.straps.n }, () => FL[V.straps.m].add()) : [] };
      arm(S);
    }

    // ---------- free bodies: spent stages, strap-ons, fairing halves (ballistic, tumbling) ----------
    const _q = new THREE.Quaternion(), _m4b = new THREE.Matrix4(), _x2 = new V3(), _y2 = new V3(), _z2 = new V3();
    const qFrom = (fw, up, q) => { _x2.copy(fw).normalize(); _z2.crossVectors(_x2, up).normalize(); _y2.crossVectors(_z2, _x2); _m4b.makeBasis(_x2, _y2, _z2); return q.setFromRotationMatrix(_m4b); };
    const body = (site, fl, i, p, v, fw, up, s, o = {}) => { BODIES.push({ site, fl, i, p: p.clone(), v: v.clone(), q: qFrom(fw, up, new THREE.Quaternion()), w: o.w || rndDir(new V3(), 1.2), s, age: 0, life: o.life || 15, vent: o.vent || 0 }); };
    const bodiesUpdate = (dt) => {
      for (let i = BODIES.length - 1; i >= 0; i--) {
        const b = BODIES[i]; b.age += dt; const r = b.p.length();
        b.v.addScaledVector(b.p, -0.045 * dt / (r * r * r)); if (r < 1.1) b.v.multiplyScalar(1 - 0.35 * dt * (1 - ss(r, 1.02, 1.1)));
        b.p.addScaledVector(b.v, dt);
        const wl = b.w.length(); if (wl > 1e-6) { _q.setFromAxisAngle(tA.copy(b.w).divideScalar(wl), wl * dt); b.q.premultiply(_q); }
        if (b.vent && b.age < b.vent && Math.random() < 0.6) SMOKE.emit(b.p, rndDir(rv, 0.004), 0.9, 0.003, 0.012, 0.95, 0.97, 1, 0.3, 1);
        if (b.p.length() < 1.004 || b.age > b.life) { if (b.p.length() < 1.006) { toW(T1.copy(b.p)); if (T1.z > 0) SMOKE.emit(b.p, null, 2.2, 0.004, 0.02, 0.92, 0.94, 0.97, 0.35, 0.5); } b.fl.hide(b.i); BODIES.splice(i, 1); continue; }
        b.fl.placeQ(b.i, b.p, b.q, b.s);
      }
    };

    // ---------- deployed satellites: persistent orbits in the flight's inertial frame ----------
    const SATS = [];
    const orbR = (o, th) => o.p / (1 + o.e * Math.cos(th - o.thp));
    const circ = (th, r, w) => ({ th, p: r, e: 0, thp: 0, h: w * r * r });
    const occl = (pL) => { toW(T3.copy(pL)); spinG.getWorldPosition(tT); const dx = T3.x - tT.x, dy = T3.y - tT.y; return T3.z < tT.z && dx * dx + dy * dy < 0.85; };
    const satSpawn = (fam, F, ob, dz1, dzT, unf, i0, wi0) => { const f = FL[fam], fwg = FL[fam + 'W'], i = i0 ?? f.add(), wi = wi0 ?? fwg.add(); if (i < 0 || wi < 0) { f.release(i); fwg.release(wi); return null; } const sat = { fam, i, wi, F, ob, t0: t, dz1, dzT, born: t, unf, sk: 1, keep: 32 }; SATS.push(sat); return sat; };
    const satPos = (sat, out, outT) => { const F = sat.F, o = sat.ob, d = o.th, r = orbR(o, d), dz = sat.dz1 * ss(t, sat.t0, sat.t0 + sat.dzT), al = F.th - (spinG.rotation.y - F.phi0); gc(F.n, F.h, d, T1).multiplyScalar(r).addScaledVector(F.N, dz); rotY(T1, al, out); if (outT) { const c0 = 1 + o.e * Math.cos(d - o.thp), drd = o.p * o.e * Math.sin(d - o.thp) / (c0 * c0); gc(F.n, F.h, d, T3); gcT(F.n, F.h, d, T2).multiplyScalar(r).addScaledVector(T3, drd).normalize(); rotY(T2, al, outT); } sat.d = d; sat.dz = dz; return out; };
    const mkTag = (txt) => {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const g = cv.getContext('2d');
      g.font = "600 40px 'Open Sans Hebrew Condensed', 'Heebo', 'Assistant', 'Arial Hebrew', sans-serif"; g.direction = /[\u0590-\u05FF]/.test(txt) ? 'rtl' : 'ltr'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = Math.min(506, g.measureText(txt).width + 26); g.fillStyle = 'rgba(6,16,38,0.72)'; g.beginPath(); g.roundRect ? g.roundRect(256 - w / 2, 8, w, 48, 10) : g.rect(256 - w / 2, 8, w, 48); g.fill();
      g.strokeStyle = 'rgba(159,208,255,0.55)'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#dcefff'; g.fillText(txt, 256, 34);
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false, depthWrite: false, opacity: 0 })); sp.renderOrder = 998; sp.center.set(0.5, 0); scene.add(sp); return sp;
    };
    const tagUpdate = (sat, pL) => { const sp = sat.tag; toW(T3.copy(pL)); const wpc = (7 / 26) / (c.cssH() / (2 * c.half())); sp.scale.set(512 * wpc, 64 * wpc, 1); sp.position.set(T3.x, T3.y + 0.025, T3.z + 0.2); const RX = T3.y < -0.45 ? 0.68 : 0.32, overR = Math.abs(T3.x) < RX && T3.y < 1.35 && T3.y > -1.3; sp.material.opacity = (overR || occl(pL)) ? Math.max(0, sp.material.opacity - 0.08) : Math.min(0.9, sp.material.opacity + 0.06); };
    const satsUpdate = (dt) => {
      const fNH = SATS.findIndex((x) => !x.hero), nNH = SATS.reduce((a, x) => a + (x.hero ? 0 : 1), 0);
      for (let i = SATS.length - 1; i >= 0; i--) {
        const sat = SATS[i], f = FL[sat.fam], fwg = FL[sat.fam + 'W'], age = t - sat.born, sc = SAT_S[sat.fam] * (sat.hero && !sat.perm ? 1.25 + 0.65 * (1 - ss(age, 20, 25)) : sat.sk);
        { const o = sat.ob, r = orbR(o, o.th); o.th += o.h / (r * r) * dt; }
        satPos(sat, tA, tB); tC.copy(tA).normalize();
        let fo = 1; if (!sat.hero) { fo = 1 - ss(age, sat.keep, sat.keep + 2.5); if (fo <= 0) { f.release(sat.i); fwg.release(sat.wi); SATS.splice(i, 1); continue; } }
        if (((age > sat.keep || (nNH > CFG().maxSats && i === fNH && !sat.hero)) && occl(tA)) || age > sat.keep + 160 || (nNH > CFG().maxSats + 10 && i === fNH && !sat.hero)) { if (sat.tag) { scene.remove(sat.tag); sat.tag.material.map.dispose(); sat.tag.material.dispose(); } f.release(sat.i); fwg.release(sat.wi); SATS.splice(i, 1); continue; }
        if (sat.tag) tagUpdate(sat, tA);
        const sf = sc * fo; f.place(sat.i, tA, tB, tC, sf); const u = ss(age, sat.unf, sat.unf + (sat.unfD || 3)); fwg.place(sat.wi, tA, tB, tC, sat.fam === 'jw' ? sf * (0.12 + 0.88 * u) : sf, sf, sf * (0.07 + 0.93 * u));
      }
    };
    const TRL = [0, 1, 2, 3].map(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(96 * 3), 3)); const al = new Float32Array(96); for (let i = 0; i < 96; i++) al[i] = 1 - i / 95; g.setAttribute('aA', new THREE.BufferAttribute(al, 1)); const m = new THREE.Line(g, additive(new THREE.ShaderMaterial({ uniforms: { uC: { value: hdr(0x8fd0ff, 1) }, uOp: { value: 0 } }, vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform vec3 uC; uniform float uOp; varying float vA; void main(){ gl_FragColor = vec4(uC * vA * vA * uOp, 1.0); }' }))); m.frustumCulled = false; m.visible = false; spinG.add(m); return { m, g, sat: null, t0: 0 }; });
    const trailAdd = (sat) => { if (!sat || !sat.hero) return; const T = TRL.find((x) => !x.sat) || TRL.filter((x) => !x.hero).reduce((a, b) => (a.t0 < b.t0 ? a : b), TRL.find((x) => !x.hero) || TRL[0]); T.sat = sat; T.t0 = t; };
    const trailsUpdate = () => {
      for (const T of TRL) {
        const sat = T.sat; if (!sat || (sat._ship ? !FLIGHTS.includes(sat.F) : !SATS.includes(sat))) { T.sat = null; T.m.visible = false; continue; } if (sat._ship) { sat.d = sat.F.ob.th; }
        const age = t - T.t0, op = (T.hero ? 0.55 : 0.3) * ss(age, 0, 1.5) * (1 - (T.hero ? ss(age, 40, 60) : ss(age, 14, 26))); if (op <= 0.002) { T.m.visible = false; if (age > (T.hero ? 60 : 26)) { T.sat = null; T.hero = 0; } continue; }
        const F = sat.F, al = F.th - (spinG.rotation.y - F.phi0), a = T.g.attributes.position.array;
        const o = sat.ob; for (let i = 0; i < 96; i++) { const th = o.th - i / 95 * 1.3; gc(F.n, F.h, th, T1).multiplyScalar(orbR(o, th)).addScaledVector(F.N, sat.dz || 0); rotY(T1, al, T2); a[i * 3] = T2.x; a[i * 3 + 1] = T2.y; a[i * 3 + 2] = T2.z; }
        T.g.attributes.position.needsUpdate = true; T.m.material.uniforms.uOp.value = op; T.m.material.uniforms.uC.value.set(T.hero ? 0xa8d8ff : 0x8fd0ff).multiplyScalar(T.hero ? 1.3 : 1); T.m.visible = true;
      }
    };

    const PO = (() => { const N = 240, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 3), 3)); const a = new Float32Array(N + 1); for (let i = 0; i <= N; i++) a[i] = i / N; g.setAttribute('aA', new THREE.BufferAttribute(a, 1));
      const m = new THREE.Line(g, additive(new THREE.ShaderMaterial({ uniforms: { uC: { value: hdr(0x8fd0ff, 0.9) }, uOp: { value: 0 }, uT: U.time }, vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform vec3 uC; uniform float uOp, uT; varying float vA; void main(){ float d = step(0.5, fract(vA * 110.0 - uT * 0.5)); gl_FragColor = vec4(uC * d * uOp, 1.0); }' })));
      m.frustumCulled = false; m.visible = false; spinG.add(m); return { m, g, N }; })();
    const poUpdate = () => { PO.m.visible = false; return;
      const F = FLIGHTS.find((x) => x.hi && x.e.tb && (!x.e.dep || t < x.e.dep + 14));
      if (!F) { PO.m.visible = false; return; }
      const E = F.e, op = 0.34 * ss(t, E.tb, E.tb + 1.6) * (E.dep ? 1 - ss(t, E.dep + 8, E.dep + 14) : 1); if (op < 0.003) { PO.m.visible = false; return; }
      const o = { p: F.Ro * (1 + F.eT), e: F.eT, thp: F.ob.thp }, a = PO.g.attributes.position.array;
      for (let i = 0; i <= PO.N; i++) { const th = o.thp + i / PO.N * TAU; gc(F.n, F.h, th, T1).multiplyScalar(orbR(o, th)); rotY(T1, F.al, T2); a[i * 3] = T2.x; a[i * 3 + 1] = T2.y; a[i * 3 + 2] = T2.z; }
      PO.g.attributes.position.needsUpdate = true; PO.m.material.uniforms.uOp.value = op; PO.m.visible = true;
    };
    const orbStep = (F, k, dt, base, fw) => {
      if (!F.ob) F.ob = { th: F.D + F.wo * (k - 1) * F.Tins, p: F.Ro, e: 0, thp: 0, h: F.wo * F.Ro * F.Ro, mu: F.wo * F.wo * F.Ro * F.Ro * F.Ro };
      const o = F.ob; let r = orbR(o, o.th); o.th += o.h / (r * r) * dt; const r0 = orbR(o, o.th); r = r0; let rdot = 0;
      if (F.deoT) { const q = MU.clamp((t - F.deoT) / F.deoDur, 0, 1); r = r0 - (r0 - 0.985) * Math.pow(q, 1.8); if (q > 0 && q < 1) rdot = -(r0 - 0.985) * 1.8 * Math.pow(q, 0.8) / F.deoDur; }
      const c0 = 1 + o.e * Math.cos(o.th - o.thp), thd = o.h / (r0 * r0), drd = o.p * o.e * Math.sin(o.th - o.thp) / (c0 * c0);
      gc(F.n, F.h, o.th, tA); gcT(F.n, F.h, o.th, tB).multiplyScalar(r * thd).addScaledVector(tA, drd * thd + rdot); tA.multiplyScalar(r);
      rotY(tA, F.al, base); rotY(tB, F.al, fw); fw.normalize();
    };
    const TRK = { sat: null, t0: 0, lab: null, g: new THREE.Group(), m: null };
    { const p = [], s2 = 0.05, l = 0.02; for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) p.push(sx * s2, sy * s2, 0, sx * (s2 - l), sy * s2, 0, sx * s2, sy * s2, 0, sx * s2, sy * (s2 - l), 0); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); TRK.m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: hdr(0x9fd0ff, 1.5), transparent: true, opacity: 0, depthTest: false, depthWrite: false })); TRK.m.renderOrder = 29; TRK.g.add(TRK.m); TRK.g.visible = false; scene.add(TRK.g); }
    const trackSat = (sat, nm) => { if (TRK.lab) TRK.lab.close(); TRK.sat = sat; TRK.t0 = t; TRK.nm = nm; TRK.lab = label((v) => satPos(sat, v), 'il', nm, 'SEPARATION · TRACKING'); TRK.st = 0; };
    const trkUpdate = () => {
      const sat = TRK.sat; if (!sat) { TRK.g.visible = false; return; }
      const age = t - TRK.t0, dur = 22;
      if (!SATS.includes(sat) || age > dur) { TRK.lab && TRK.lab.close(); TRK.lab = null; TRK.sat = null; TRK.g.visible = false; return; }
      satPos(sat, tA); toW(tA); const kk = ss(age, 0, 0.6) * (1 - ss(age, dur - 1.5, dur));
      TRK.g.visible = true; TRK.g.position.copy(tA); TRK.g.position.z += 0.05; TRK.g.scale.setScalar(1 + 0.8 * (1 - ss(age, 0, 0.7))); TRK.g.rotation.z = age < 0.7 ? (1 - age / 0.7) * 0.8 : 0;
      TRK.m.material.opacity = kk * (age < 1.2 ? (Math.sin(age * 36) > 0 ? 1 : 0.35) : 0.85 + 0.15 * Math.sin(age * 4));
      const st = age < 3 ? 0 : age < 7 ? 1 : age < 12 ? 2 : 3;
      if (st !== TRK.st && TRK.lab) { TRK.st = st; const alt = Math.round(600 + (orbR(sat.ob, sat.ob.th) - sat.F.Ro) * 4000); TRK.lab.set(null, ['SEPARATION · TRACKING', /SAR/.test(TRK.nm) ? 'SAR ANTENNA DEPLOY' : 'SOLAR ARRAY DEPLOY', 'ORBIT ' + alt + ' KM · ' + sat.F.inc + '° · RETROGRADE', 'ACQUISITION OF SIGNAL · NOMINAL'][st]); }
    };
    // ---------- flights ----------
    const FLIGHTS = [], TIG = 2.6, TL = 3.2;
    const SF = (F, k, out) => {
      let r, d;
      if (k <= 1) { const kk = Math.max(0, k), u = kk * kk * (2 - kk); r = F.R0 + (F.Ro - F.R0) * (1 - Math.pow(1 - u, 2.2)); d = F.D * Math.pow(u, 2.4); }
      else { r = F.Ro; d = F.D + F.wo * (k - 1) * F.Tins; if (F.deoT) { const q = MU.clamp((t - F.deoT) / F.deoDur, 0, 1); r = F.Ro - (F.Ro - 0.985) * Math.pow(q, 1.8); } }
      return gc(F.n, F.h, d, out).multiplyScalar(r);
    };
    const launch = (S) => {
      const V = S.V, n = S.n.clone(), h = dirAt(n, deg(S.hdg + rnd(-S.hj, S.hj)), new V3()), N = new V3().crossVectors(n, h).normalize();
      const Tins = rnd(V.tins[0], V.tins[1]) * rnd(1.5, 1.95), Ro = rnd(1.28, 1.52), wo = rnd(0.145, 0.165), hi = !!(S.hi || (S.hiP && Math.random() < S.hiP));
      const F = { S, V, n, h, N, Ro, wo, Tins, hi, ob: null, ra: S.raR ? rnd(S.raR[0], S.raR[1]) : rnd(2.3, 3.1), orbT: hi ? (S.hiOrbit || S.orbit) : S.orbit, pay: S.pays ? S.pays[(Math.random() * S.pays.length) | 0] : null, D: wo * Tins / 2.4, R0: S.R0, T0: t, phi0: spinG.rotation.y, phiP: spinG.rotation.y, th: 0, al: 0, k: -1,
        a: { b: 1, m: !!V.mid, st: 1, fr: !!V.fair, pay: !!V.pay, sp: !!V.straps }, e: {}, base: S.base.clone(), pPrev: S.base.clone(), vel: new V3(), fw: n.clone(), up: S.nn.clone(), stP: S.base.clone(), stF: n.clone(), stU: new V3(),
        inc: (Math.acos(MU.clamp(N.y, -1, 1)) * 180 / Math.PI).toFixed(1), ret: null, stDone: false };
      if (!hi && S.rideP && Math.random() < S.rideP) { F.ride = 1; F.orbT = 'SSO · TRANSPORTER RIDESHARE'; }
      if (hi && S.deep && Math.random() < 0.45) { F.pay = S.deep; F.deep = 1; F.ra = rnd(3.3, 3.9); F.orbT = 'L2 TRANSFER · 1.5M KM'; }
      LBLOK = true; F.lab = label((v) => v.copy(F.stP), S.il ? 'il' : 'launch', S.title || S.name, S.sub0 || 'TERMINAL COUNT'); LBLOK = false;
      S.state = 'flying'; FLIGHTS.push(F); return F;
    };
    const startReturn = (F) => {
      const S = F.S, s = F.V.s, kind = F.V.catch ? 'catch' : (S.asdsB && (F.hi || Math.random() < 0.4) ? 'ship' : 'rtls');
      const LZ = kind === 'catch' ? S.catchB : kind === 'ship' ? S.asdsB : S.lzB, nL = LZ.clone().normalize(), P0 = F.base.clone(), vh = F.vel.clone().normalize();
      const loft = Math.random() < 0.5, n0 = P0.clone().normalize(); const axR = new V3().crossVectors(vh, n0); if (axR.lengthSq() < 1e-8) east(n0, axR); axR.normalize(); const r = F.ret = { kind, loft, ax: axR, LZ, nL, P0, P1: P0.clone().addScaledVector(vh, kind === 'ship' ? 0.12 : 0.07).addScaledVector(n0, loft ? 0.22 : 0), P2: LZ.clone().addScaledVector(nL, (kind === 'ship' ? 0.24 : 0.3) + (loft ? 0.3 : 0)), T: t, dur: (kind === 'ship' ? 14 : 15) + (loft ? 5 : 0), vh, p: P0.clone(), fw: F.fw.clone(), up: F.up.clone(), bb: new V3(), bbSet: 0, done: 0, land: 0, s };
      F.blab = label((v) => v.copy(r.p), 'recov', kind === 'catch' ? 'SUPER HEAVY · RETURN' : kind === 'ship' ? 'BOOSTER · DRONESHIP' : 'BOOSTER · RTLS', kind === 'ship' ? 'COAST · ENTRY PREP' : 'BOOSTBACK BURN');
    };
    const RQ = new V3(), RV1 = new V3(), RV2 = new V3(), RV3 = new V3();
    const cub = (P0, P1, P2, P3, s, out) => { const u = 1 - s; return out.set(0, 0, 0).addScaledVector(P0, u * u * u).addScaledVector(P1, 3 * u * u * s).addScaledVector(P2, 3 * u * s * s).addScaledVector(P3, s * s * s); };
    const stepReturn = (F) => {
      const r = F.ret, S = F.S, V = F.V, s = V.s, kS = s / 0.15, lab = F.blab;
      if (r.land) { if (!r.done && t > r.land + 3) { lab && lab.close(); r.done = 1; } return; }
      const k = MU.clamp((t - r.T) / r.dur, 0, 1), e = 1 - Math.pow(1 - k, 1.6);
      cub(r.P0, r.P1, r.P2, r.LZ, e, r.p); cub(r.P0, r.P1, r.P2, r.LZ, Math.min(1, e + 0.004), tA); const vh = tA.sub(r.p); if (vh.lengthSq() > 1e-12) vh.normalize(); else vh.copy(r.nL).negate();
      if (!r.bbSet) { r.bb.subVectors(r.LZ, r.p); T1.copy(r.p).normalize(); r.bb.addScaledVector(T1, -r.bb.dot(T1)).normalize().addScaledVector(T1, 0.25).normalize(); r.bbSet = 1; }
      const ax = r.ax, pj = (v, o) => { o.copy(v).addScaledVector(ax, -v.dot(ax)); if (o.lengthSq() < 1e-10) o.copy(r.nL); return o.normalize(); };
      const rk = (a, b, q, o) => { const an = Math.atan2(ax.dot(RQ.crossVectors(a, b)), a.dot(b)); return o.copy(a).applyAxisAngle(ax, an * q); };
      const dn = pj(tB.copy(vh).negate(), tB), pv = pj(r.vh, RV1), pb = pj(r.bb, RV2), fw = r.fw; let burn = 0;
      if (r.kind !== 'ship') { if (k < 0.07) rk(pv, pb, ss(k, 0, 0.07), fw); else if (k < 0.2) { fw.copy(pb); burn = 1; } else if (k < 0.45) rk(pb, dn, ss(k, 0.2, 0.45), fw); else fw.copy(dn); }
      else { if (k < 0.18) rk(pv, dn, ss(k, 0, 0.18), fw); else fw.copy(dn); }
      if (k > 0.5 && k < 0.58) burn = 2;
      if (k > 0.86) { rk(dn, pj(r.nL, RV3), ss(k, 0.86, 0.97), fw); if (k < 1) burn = 3; }
      const vv = V.bVar ? (k > 0.9 ? 2 : 1) : 0;
      placeB(S, vv, r.p, fw, ax);
      if (burn) { const rk = burn === 3 ? (V.catch ? 0.42 : 0.36) : burn === 1 ? (V.catch ? 0.72 : 0.6) : 0.6; eng(r.p, fw, V.eb, s, burn === 1 ? 0.9 : 1, rk); }
      if (burn === 2 && !r.l2) { r.l2 = 1; lab && lab.set(null, 'ENTRY BURN'); }
      if (burn === 3 && !r.l3) { r.l3 = 1; lab && lab.set(null, V.catch ? 'CATCH APPROACH' : 'LANDING BURN · LEGS DEPLOY'); }
      if (V.catch) placeChop(S, 0.55 * (1 - ss(k, 0.93, 1)));
      if (k >= 1) { r.land = t; FIRE.emit(r.p, null, 0.25, 0.006 * kS, 0.02 * kS, 3, 2.6, 2); groundCloud(V.catch ? S.gnd : tC.copy(r.LZ).addScaledVector(r.nL, -0.04 * s), r.nL, 0.6 * kS, 14); lab && lab.set(null, V.catch ? 'CAUGHT BY THE TOWER' : r.kind === 'ship' ? 'LANDED · DRONESHIP' : 'LANDED · ' + S.lzName); }
    };
    const deploy = (F, dB) => {
      const V = F.V, S = F.S, s = V.s, X = V.X, dP = dB + (X.fr * s + 0.01) / F.Ro, L = F.lab;
      if (V.pay === 'slkStk' && F.a.pay) {
        FL.slkStk.hide(S.rig.pay); F.a.pay = 0; let lead = null;
        const nP = Math.min(V.nPay, F.ride ? 6 : CFG().stack); for (let j = 0; j < nP; j++) { const cc = j - (nP - 1) / 2, sat = satSpawn(F.ride ? 'sky' : 'slk', F, circ(dP + cc * 0.0012, F.Ro + cc * 0.0016, F.wo + cc * 0.0034 + rnd(-0.0005, 0.0005)), rnd(-0.003, 0.003), 4, rnd(2.5, 5)); if (sat) lead = sat; }
        trailAdd(lead); L && L.set(null, F.ride ? 'RIDESHARE · ICEYE SAR (FINLAND) + ' + (nP - 1) + ' SMALLSATS' : 'STARLINK DEPLOY · ' + nP + ' SATS');
      } else if (V.pez) L && L.set(null, F.hi ? 'APOGEE RAISE · COASTING OUT' : 'PEZ DEPLOY · STARLINK');
      else if (F.paySat) { const ps = F.paySat, o = F.ob, ob = F.hi ? { th: dP + 0.002, p: o.p * 1.003, e: o.e, thp: o.thp, h: Math.sqrt(o.mu * o.p * 1.003) } : circ(dP + 0.002, F.Ro + 0.0015, F.wo + 0.004); const sat = satSpawn(ps.fam, F, ob, 0, 1, 1.2, ps.i, ps.wi); F.paySat = null;
        if (sat && F.deep) Object.assign(sat, { keep: 24, unf: 1.2, unfD: 7 });
        if (sat && S.il) { L && L.close(); sat.sk = 1.9; sat.keep = 1e9; sat.hero = 1; sat.join = 1; sat.unf = 1.6; sat.nm = F.pay ? F.pay[1] : 'OFEK'; trackSat(sat, sat.nm); const mm = sat.nm.match(/OFEK-(\d+)/); void mm; const J = SATS.filter((x) => x.join); if (J.length > 4) J[0].keep = 0; }
        trailAdd(sat); if (sat && S.il) { const T = TRL.find((x) => x.sat === sat); if (T) T.hero = 1; } L && L.set(null, 'SPACECRAFT SEP · ' + (F.hi ? (S.hiPay || S.payName || 'PAYLOAD') + ' · GTO' : (F.pay ? F.pay[1] : (S.payName || 'PAYLOAD')))); }
      if (F.deep) L && L.set(F.pay[1], F.pay[0] === 'jw' ? 'SEPARATION · SUNSHIELD + MIRROR DEPLOY' : 'SEPARATION · SOLAR ARRAY DEPLOY');
      basisOf(F.stF, F.up); puffRing(tA.copy(F.stP).addScaledVector(F.stF, V.Ls * s), F.stF, 0.03 * s, 8, 0.01);
    };
    const step = (F, dt) => {
      const S = F.S, V = F.V, R = S.rig, s = V.s * (F.pf || 1), X = V.X, A = F.a, E = F.e, L = F.lab, kS = s / 0.15; S.scl = s;
      const lt = t - F.T0, phi = spinG.rotation.y, dphi = phi - F.phiP; F.phiP = phi;
      const tau = lt - TL, k = tau / F.Tins; F.k = k;
      F.th += dphi * (1 - ss(k, 0.35, 1.0)); F.al = F.th - (phi - F.phi0);
      const base = F.base, fw = F.fw, up = F.up;
      if (k <= 0) { base.copy(S.base); fw.copy(S.n); } else if (k < 1) { SF(F, k, tA); rotY(tA, F.al, base); SF(F, k + 0.003, tB); rotY(tB, F.al, tB); fw.subVectors(tB, base).normalize(); } else orbStep(F, k, dt, base, fw);
      { toW(T3.copy(base)); if (F.wz0 == null) F.wz0 = T3.z; F.pf = Math.min(1.9, 1 + 1.5 * Math.max(0, T3.z - F.wz0)); }
      rotY(F.N, F.al, tC); if (tau < 2) nlerp(S.nn, tC, ss(tau, 0.3, 1.8), up); else up.copy(tC);
      if (lt > 0) F.vel.subVectors(base, F.pPrev).divideScalar(Math.max(dt, 1e-3)); F.pPrev.copy(base);
      if (k < 1) { F.stP.copy(base).addScaledVector(fw, X.st * s); F.stF.copy(fw); }
      if (lt < TL) {
        if (lt < TIG) { const cd = Math.ceil(TIG - lt); if (cd !== E.cd) { E.cd = cd; L && L.set(null, 'T-' + cd + ' · ' + (S.sub0 || F.orbT)); } }
        placeStack(S, base, fw, up, A);
        if (S.te >= 0) placeTE(S, ss(lt, 0.1, 1.1));
        if (lt < TIG) { if (Math.random() < 0.4) { T3.copy(F.stP).addScaledVector(fw, V.Ls * 0.7 * s); east(fw, rv); rv.applyAxisAngle(fw, rnd(0, TAU)); T3.addScaledVector(rv, 0.035 * s); SMOKE.emit(T3, rv.multiplyScalar(0.006), rnd(1, 1.6), 0.002, 0.008 * kS, 0.96, 0.97, 1, 0.3, 1); } }
        else { if (!E.ig) { E.ig = 1; L && L.set(null, 'IGNITION'); } const q = ss(lt, TIG, TL); eng(base, fw, V.eb, s, q); if (A.sp) { basisOf(fw, up); R.sp.forEach((i, j) => eng(tp.copy(base).addScaledVector(strapDir(R.sp.length, j), V.straps.r * s), fw, V.straps.e, s, q)); } groundCloud(S.gnd, S.n, kS * (0.5 + q), 3); }
        return true;
      }
      if (!E.lift) { E.lift = 1; L && L.set(null, 'LIFTOFF'); }
      if (F.lab && lt > TL + 4.5) { F.lab.close(); F.lab = null; }
      if (k < 1) {
        if (A.sp && k >= V.straps.k) {
          A.sp = 0; basisOf(fw, up); const pv = F.vel.clone();
          R.sp.forEach((i, j) => { const o = strapDir(R.sp.length, j).clone(); body(S, FL[V.straps.m], i, tp.copy(base).addScaledVector(o, V.straps.r * s), pv.clone().multiplyScalar(0.95).addScaledVector(o, 0.03 * kS), fw, o, s, { w: new V3().crossVectors(fw, o).multiplyScalar(V.straps.cross ? 1.7 : 0.9).addScaledVector(fw, rnd(-0.3, 0.3)), life: 13, vent: V.straps.cross ? 1.2 : 0 }); });
          L && L.set(null, V.straps.cross ? 'BOOSTER SEP · KOROLEV CROSS' : 'BOOSTER SEP');
        }
        if (!E.mq && k >= 0.17) { E.mq = 1; if (!V.straps || V.straps.k > 0.24) L && L.set(null, 'MAX-Q'); }
        if (A.b && k >= V.kMeco) {
          A.b = 0; E.meco = t; const ip = T3.copy(base).addScaledVector(fw, X.m * s);
          if (V.hot) hotStage(ip, fw, kS); else puffRing(ip, fw, 0.036 * s, 10, 0.02 * kS);
          if (V.recover) startReturn(F); else body(S, FL[V.b], R.b[0], base, F.vel.clone().multiplyScalar(0.9), fw, up, s, { w: rndDir(new V3(), 0.5) });
          L && L.set(null, V.hot ? 'HOT STAGING' : 'MECO · STAGE SEP');
        }
        if (A.m && k >= V.kMid) { A.m = 0; puffRing(T3.copy(base).addScaledVector(fw, X.st * s), fw, 0.02 * s, 8, 0.015 * kS); body(S, FL[V.mid], R.m, tp.copy(base).addScaledVector(fw, X.m * s), F.vel.clone().multiplyScalar(0.92), fw, up, s, { w: rndDir(new V3(), 0.6) }); L && L.set(null, 'STAGE 2 SEP'); }
        if (A.fr && k >= V.kFair) {
          A.fr = 0; basisOf(fw, up); const fp = new V3().copy(base).addScaledVector(fw, X.fr * s), pv = F.vel.clone(), yb = Yb.clone();
          [[R.fr[0], -1, yb.clone()], [R.fr[1], 1, yb.clone().negate()]].forEach(([i, sg, upv]) => { const o = yb.clone().multiplyScalar(sg); body(S, FL[V.fair], i, fp, pv.clone().addScaledVector(o, 0.035 * kS), fw, upv, s, { w: new V3().crossVectors(fw, o).multiplyScalar(1.4).addScaledVector(fw, rnd(-0.5, 0.5)), life: 12 }); });
          puffRing(fp, fw, 0.045 * s, 8, 0.015 * kS);
          if ((!V.pay || F.hi) && !V.pez) { if (V.pay && A.pay) { FL[V.pay].hide(R.pay); A.pay = 0; } const fam = F.pay ? F.pay[0] : (V.pay ? 'gsat' : V.payload), fi = FL[fam].add(), wi = FL[fam + 'W'].add(); if (fi >= 0 && wi >= 0) F.paySat = { fam, i: fi, wi }; else { FL[fam].release(fi); FL[fam + 'W'].release(wi); } }
          L && L.set(null, 'FAIRING SEP');
        }
        if (A.b) { eng(base, fw, V.eb, s); if (k < 0.08) groundCloud(S.gnd, S.n, kS * (1 - k / 0.08), 2); if (k > 0.13 && k < 0.21) { T3.copy(base).addScaledVector(fw, X.fr * s * 0.85); puffRing(T3, fw, 0.05 * s, 3, 0.004); } }
        if (A.sp) { basisOf(fw, up); R.sp.forEach((i, j) => eng(tp.copy(base).addScaledVector(strapDir(R.sp.length, j), V.straps.r * s), fw, V.straps.e, s)); }
        if (V.mid && A.m && k > V.kMeco + 0.03 && k < V.kMid) eng(T3.copy(base).addScaledVector(fw, X.m * s), fw, V.em, s);
        const kIgn = V.mid ? V.kMid + 0.025 : V.kMeco + (V.hot ? 0 : 0.035);
        if (k > kIgn) eng(F.stP, fw, V.es, s);
        placeStack(S, base, fw, up, A);
      } else {
        // orbit: SECO → deploy → deorbit
        const dB = F.ob.th, Tg = fw; T1.copy(base).normalize();
        if (!E.seco) { E.seco = t; L && L.set(null, (F.hi ? 'SECO-1 · PARKING ORBIT · ' : 'SECO · ' + S.orbit + ' · ') + F.inc + '°'); }
        if (F.hi && !E.dep) {
          const b0 = E.seco + 1.6, b1 = b0 + 2.6, o = F.ob;
          if (t > b0 && !E.tb) { E.tb = t; o.thp = o.th + o.h / (F.Ro * F.Ro) * 1.3; F.eT = (F.ra - F.Ro) / (F.ra + F.Ro); L && L.set(null, 'TRANSFER BURN · ' + F.orbT); }
          if (E.tb) { const q = ss(t, b0, b1); o.e = F.eT * q; o.p = F.Ro * (1 + o.e); o.h = Math.sqrt(o.mu * o.p); if (t < b1) eng(F.stP, fw, V.es, s, 0.6 + 0.4 * ss(t, b0, b0 + 0.4)); }
          if (t > b1 + 1.4) { E.dep = t; deploy(F, dB); }
        } else if (!E.dep && t > E.seco + (F.depD || (F.depD = rnd(2.4, 4.5)))) { E.dep = t; deploy(F, dB); }
        if (F.hi && E.dep) {
          if (!E.lc && t > E.dep + 3.4) { E.lc = 1; L && L.close(); }
          if (t > E.dep + 2 && t < E.dep + 4 && Math.random() < 0.5) SMOKE.emit(tq.copy(F.stP), rndDir(rv, 0.006), 1.2, 0.002, 0.012, 0.95, 0.97, 1, 0.3, 1);
          if (V.ship && !E.trl) { E.trl = 1; trailAdd({ F, ob: F.ob, d: F.ob.th, dz: 0, _ship: 1 }); }
          if (!F.stDone && t > E.dep + 6 && (occl(base) || t > E.dep + (V.ship ? 90 : 60))) { FL[V.st].hide(R.st); F.stDone = true; }
        }
        if (V.pez && !F.hi && E.dep && (E.pezN || 0) < Math.min(V.nPay, CFG().stack) && t > E.dep + (E.pezN || 0) * 0.45) { const j = E.pezN = (E.pezN || 0) + 1, sat = satSpawn('slk', F, circ(dB + (X.st + 0.27) * s / F.Ro, F.Ro + 0.001, F.wo + 0.004 - 0.0016 * j), 0.012 + j * 0.0035, 1.6, 2); if (j === Math.min(V.nPay, CFG().stack)) trailAdd(sat); }
        if (E.dep && !E.deo && !F.hi && t > E.dep + (V.pez ? 4.4 : 3.2)) { E.deo = t; F.deoT = t + 1.8; F.deoDur = V.ship ? 13 : 10; }
        if (E.deo && !E.lc && t > E.deo + 2.8) { E.lc = 1; L && L.close(); }
        const sf = F.stF, su = F.stU.copy(up), rr = base.length();
        if (!E.deo) sf.copy(Tg);
        else {
          const fq = ss(t, E.deo, E.deo + 1.2); sf.copy(Tg).multiplyScalar(Math.cos(Math.PI * fq)).addScaledVector(T1, Math.sin(Math.PI * fq)).normalize();
          if (V.ship && t > E.deo + 2.6) { nlerp(sf, tC.copy(Tg).multiplyScalar(0.5).addScaledVector(T1, 0.866), ss(t, E.deo + 2.6, E.deo + 5), sf); su.copy(Tg).negate(); if (rr < 1.035) nlerp(sf, T1, ss(rr, 1.035, 1.012), sf); }
        }
        const Cc = tq.copy(base).addScaledVector(Tg, (X.st + V.Ls / 2) * s); F.stP.copy(Cc).addScaledVector(sf, -V.Ls / 2 * s);
        if (!F.stDone) {
          FL[V.st].place(R.st, F.stP, sf, su, s);
          if (E.deo && t > E.deo + 1.2 && t < E.deo + 2.6) eng(F.stP, sf, V.es, s, 0.9);
          if (rr < 1.09) plasma(Cc, Tg, 0.012 * kS, 1 - ss(rr, 1.03, 1.09));
          if (V.ship) { if (rr < 1.03 && rr > 1.006) eng(F.stP, sf, V.esl, s, 1, 1.6); if (rr <= 1.006) { groundCloud(F.stP, T1, 0.6 * kS, 18); FL[V.st].hide(R.st); F.stDone = true; } }
          else if (rr < 1.028) { breakup(Cc, Tg, 0.012 * kS); FL[V.st].hide(R.st); F.stDone = true; }
        }
        if (F.paySat && !E.dep) { const sc = SAT_S[F.paySat.fam]; tp.copy(F.stP).addScaledVector(sf, V.Ls * s + 0.4 * sc); FL[F.paySat.fam].place(F.paySat.i, tp, sf, su, sc); FL[F.paySat.fam + 'W'].place(F.paySat.wi, tp, sf, su, sc, sc, sc * 0.07); }
        if (A.pay && !E.dep) FL[V.pay].place(R.pay, tp.copy(F.stP).addScaledVector(sf, (V.Ls + 0.004) * s), sf, su, s);
      }
      if (F.paySat && k < 1) { const sc = SAT_S[F.paySat.fam]; tp.copy(F.stP).addScaledVector(fw, V.Ls * s + 0.4 * sc); FL[F.paySat.fam].place(F.paySat.i, tp, fw, up, sc); FL[F.paySat.fam + 'W'].place(F.paySat.wi, tp, fw, up, sc, sc, sc * 0.07); }
      if (F.ret) stepReturn(F);
      return !(F.stDone && (!F.ret || F.ret.done)) && lt < 90;
    };

    [['ofs', 'OFEK-13 · SAR', 0, 0.4], ['ofs', 'OFEK-19 · SAR', 40, 0.4 + Math.PI]].forEach(([fam, nm, dl, ph]) => {
      const n = geo(31.88, 34.68 + dl), h = dirAt(n, deg(268), new V3()), N = new V3().crossVectors(n, h).normalize();
      const sat = satSpawn(fam, { n, h, N, th: 0, phi0: spinG.rotation.y, Ro: 1.23, inc: '141.8' }, circ(ph, 1.23, 0.15), 0, 1, -99);
      if (sat) Object.assign(sat, { keep: 1e9, hero: 1, perm: 1, sk: 1.3, nm, tag: mkTag(nm.startsWith('OFEK-13') ? 'אופק 13' : 'אופק 19') });
    });
    // ---------- notable satellites on front-crossing orbits + deep-space observatories ----------
    scene.updateMatrixWorld(true);
    { const iM = new THREE.Matrix4().copy(spinG.matrixWorld).invert();
      const plane = (thDeg, off) => { const th = deg(thDeg), hw = new V3(Math.cos(th), Math.sin(th), 0), pw = new V3(-Math.sin(th), Math.cos(th), 0), nw = new V3(0, 0, 1).addScaledVector(pw, off).normalize(); hw.addScaledVector(nw, -hw.dot(nw)).normalize(); const n = nw.transformDirection(iM), h = hw.transformDirection(iM); h.addScaledVector(n, -h.dot(n)).normalize(); return { n, h, N: new V3().crossVectors(n, h).normalize(), th: 0, phi0: spinG.rotation.y, Ro: 1.15, inc: '97.5' }; };
      [['wv', 'WORLDVIEW-3 · MAXAR', 1.13, 22, 0.35, 0.3, 0.12], ['wv', 'WORLDVIEW LEGION · MAXAR', 1.14, 118, -0.3, 2.2, 0.115], ['wv', 'WORLDVIEW LEGION · MAXAR', 1.14, 118, -0.3, 2.2 + Math.PI, 0.115], ['pln', 'PLÉIADES NEO · AIRBUS', 1.15, 68, 0.15, 4.1, 0.11], ['pln', 'PLÉIADES NEO · AIRBUS', 1.15, 68, 0.15, 4.1 + Math.PI, 0.11], ['sky', 'SKYSAT · PLANET', 1.12, 160, 0.45, 1.2, 0.125]]
        .forEach(([fam, nm, r, th, off, ph, w]) => { const sat = satSpawn(fam, plane(th, off), circ(ph, r, w), 0, 1, -99); if (sat) Object.assign(sat, { keep: 1e9, hero: 1, perm: 1, sk: 1.25, nm }); });
      const Fs = plane(300, -0.22); for (let j = 0; j < 8; j++) { const sat = satSpawn('slk', Fs, circ(5.0 - j * 0.07, 1.16, 0.13), 0, 1, -99); if (sat) Object.assign(sat, { keep: 1e9, hero: 1, perm: 1, sk: 1.35 }); }
      const Fs2 = plane(240, 0.2); for (let j = 0; j < 7; j++) { const sat = satSpawn('slk', Fs2, circ(2.2 - j * 0.07, 1.18, 0.125), 0, 1, -99); if (sat) Object.assign(sat, { keep: 1e9, hero: 1, perm: 1, sk: 1.35 }); }
    }
    const DEEP = [];
    const qD = new THREE.Quaternion(), qS = new THREE.Quaternion(), eD = new THREE.Euler(), dP = new V3();
    const deepUpdate = () => { spinG.getWorldQuaternion(qS).invert(); for (const d of DEEP) { dP.copy(d.p).add(tq.set(0.03 * Math.sin(t * 0.07 + d.ph), 0.02 * Math.sin(t * 0.05 + d.ph * 1.3), 0)); qD.setFromEuler(eD.set(0.35 + 0.15 * Math.sin(t * 0.03 + d.ph), t * 0.05 + d.ph, 0.25)); dP.applyMatrix4(invSpin); FL[d.fam].placeQ(d.i, dP, qT.copy(qS).multiply(qD), d.s); } };
    // ---------- main-satellite imaging: slew → frustum → push-broom footprint → AOI brackets → downlink ----------
    const SATM = c.allSats || [], NZ = new V3(0, 0, -1), Z_AXIS = new V3(0, 0, 1), QI = new THREE.Quaternion(), qT = new THREE.Quaternion(), qW = new THREE.Quaternion(), camW = new V3(), gcW = new V3(), mB = new THREE.Matrix4();
    const AOI = [['STRAIT OF HORMUZ', 26.6, 56.3], ['BAB-EL-MANDEB', 12.6, 43.4], ['SOUTHERN LEBANON', 33.3, 35.4], ['TEHRAN', 35.7, 51.4], ['SANAA', 15.4, 44.2], ['EASTERN MEDITERRANEAN', 33.6, 32.4], ['RED SEA', 20.5, 38.5], ['PERSIAN GULF', 27.0, 51.5], ['TAIWAN STRAIT', 24.2, 119.6], ['KOREAN DMZ', 38.2, 127.2], ['BLACK SEA', 43.4, 34.0], ['SUEZ CANAL', 30.5, 32.35], ['DAMASCUS', 33.5, 36.3], ['BAGHDAD', 33.3, 44.4], ['CRIMEA', 45.0, 34.1], ['GULF OF ADEN', 12.4, 47.5]].map(([nm, la, lo]) => ({ nm, la, lo, n: geo(la, lo) }))
      .concat([['IRAN · NATANZ', 33.72, 51.73], ['IRAN · FORDOW', 34.88, 50.99], ['IRAN · ISFAHAN', 32.65, 51.67], ['IRAN · PARCHIN', 35.52, 51.77], ['IRAN · ARAK', 34.37, 49.24], ['IRAN · BANDAR ABBAS', 27.18, 56.27], ['IRAN · KHARG ISLAND', 29.25, 50.32], ['IRAN · TABRIZ', 38.08, 46.29], ['IRAN · SHAHROUD', 36.2, 55.33]].map(([nm, la, lo]) => ({ nm, la, lo, n: geo(la, lo), ir: 1 })))
      .concat([['PANAMA CANAL', 9.1, -79.7], ['TAIPEI', 25.03, 121.56], ['KYIV', 50.45, 30.52], ['SEVASTOPOL', 44.6, 33.5], ['PYONGYANG', 39.0, 125.75], ['SOUTH CHINA SEA', 10.0, 114.0], ['GIBRALTAR', 36.0, -5.6], ['CAPE CANAVERAL', 28.5, -80.6], ['SINAI', 29.5, 33.8], ['HORN OF AFRICA', 10.5, 49.0], ['MURMANSK', 68.97, 33.08], ['HAINAN', 19.2, 109.7], ['GUAM', 13.45, 144.8], ['DIEGO GARCIA', -7.3, 72.4], ['KALININGRAD', 54.7, 20.5], ['SVALBARD', 78.2, 15.6]].map(([nm, la, lo]) => ({ nm, la, lo, n: geo(la, lo) })));
    const fpMat = additive(new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uK: { value: 0 }, uScan: { value: 0 }, uSar: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uK, uScan, uSar; varying vec2 vUv; float aa(float d, float w){ float fw = fwidth(d) * 1.2 + 1e-5; return 1.0 - smoothstep(w, w + fw, d); } void main(){ vec2 e = min(vUv, 1.0 - vUv); float edge = aa(min(e.x, e.y), 0.012); vec2 g = abs(fract(vUv * vec2(8.0, 6.0)) - 0.5); float grid = aa(0.5 - max(g.x, g.y), 0.02) * 0.22; float corner = step(min(e.x, e.y), 0.03) * step(max(e.x, e.y), 0.18); float sc = exp(-pow((vUv.y - uScan) * 40.0, 2.0)); float done = step(vUv.y, uScan); vec3 col = mix(vec3(0.45, 0.85, 1.0), vec3(0.75, 0.6, 1.0), uSar) * (edge * 1.3 + grid + sc * 1.8 + done * 0.06) + vec3(0.7, 1.0, 0.9) * corner; gl_FragColor = vec4(col * uK, 1.0); }' }));
    fpMat.extensions = Object.assign(fpMat.extensions || {}, { derivatives: true });
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fpMat); fp.visible = false; spinG.add(fp);
    const frG = new THREE.BufferGeometry(); frG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48), 3));
    const frus = new THREE.LineSegments(frG, additive(new THREE.LineBasicMaterial({ color: hdr(0xbfeaff, 1.3), opacity: 0 }))); frus.frustumCulled = false; frus.visible = false; scene.add(frus);
    const brG = (() => { const p = [], s2 = 0.045, l = 0.018; for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) p.push(sx * s2, sy * s2, 0, sx * (s2 - l), sy * s2, 0, sx * s2, sy * s2, 0, sx * s2, sy * (s2 - l), 0); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g; })();
    const brk = new THREE.Group(), brM = new THREE.LineSegments(brG, additive(new THREE.LineBasicMaterial({ color: hdr(0x9dffc4, 1.4), opacity: 0 }))); brk.add(brM); brk.visible = false; spinG.add(brk);
    const corners = [new V3(), new V3(), new V3(), new V3()], IM = { cur: null, next: 5 };
    const sw = new V3();
    const aoiOk = (pW, maxL, minC) => AOI.filter((a) => { toW(T1.copy(a.n)); if (T1.z - gcW.z < 0.42) return false; T2.subVectors(pW, T1); const L = T2.length(); T3.subVectors(T1, gcW).normalize(); return L < maxL && T2.dot(T3) / L > minC; });
    const pickA = (ok) => { const ir = ok.filter((a) => a.ir); const pool = ir.length && Math.random() < 0.8 ? ir : ok; return pool[(Math.random() * pool.length) | 0]; };
    const imgPick = () => {
      spinG.getWorldPosition(gcW);
      const fromNamed = () => { for (const o of SATS.filter((x) => x.nm).sort(() => Math.random() - 0.5)) { satPos(o, sw); toW(sw); if (sw.z - gcW.z < 0.05) continue; let ok = aoiOk(sw, 1.0, 0.45); if (/OFEK|TECSAR/.test(o.nm)) ok = ok.filter((a) => a.ir); if (ok.length) return { o, a: ok[(Math.random() * ok.length) | 0] }; } return null; };
      const fromMain = () => { for (const s of SATM.slice().sort(() => Math.random() - 0.5)) { if (!s.w || s.w.z < 0.05) continue; const ok = aoiOk(s.w, 1.75, 0.3); if (ok.length) return { s, a: pickA(ok) }; } return null; };
      return Math.random() < 0.6 ? (fromNamed() || fromMain()) : (fromMain() || fromNamed());
    };
    const imgStart = (pk) => { const idx = SATM.indexOf(pk.s) + 1, cc = { s: pk.s, o: pk.o, a: pk.a, T0: t, dur: 7 }; cc.sar = !!(pk.o && /SAR/.test(pk.o.nm)); cc.lab = (!pk.o || LBL.filter((l) => l.on).length > 1) ? null : label((v) => v.copy(cc.a.n).multiplyScalar(1.004), pk.o ? 'il' : 'orbit', pk.o ? pk.o.nm : 'EO IMAGING · SAT-' + idx, pk.o ? 'PASS OVER AOI' : 'SLEW TO AOI'); IM.cur = cc; };
    const imgUpdate = () => {
      const cc = IM.cur;
      if (!cc) { fp.visible = frus.visible = brk.visible = false; if (FULL && t > IM.next) { const pk = imgPick(); if (pk) imgStart(pk); IM.next = t + (pk ? rnd(3.5, 8) : 1.2); } return; }
      const lt = t - cc.T0, s = cc.s, a = cc.a;
      toW(tA.copy(a.n).multiplyScalar(1.004));
      if (s) { s.g.getWorldQuaternion(qW).invert(); T1.subVectors(tA, s.w).applyQuaternion(qW).normalize(); qT.setFromUnitVectors(NZ, T1); s.inner.quaternion.slerpQuaternions(QI, qT, ss(lt, 0.1, 1.2) * (1 - ss(lt, cc.dur - 1.2, cc.dur - 0.1))); }
      else if (!SATS.includes(cc.o)) { cc.lab && cc.lab.close(); IM.cur = null; return; }
      const v = ss(lt, 1.1, 1.5) * (1 - ss(lt, cc.dur - 1.5, cc.dur - 1.15));
      if (s) s.inner.localToWorld(camW.copy(s.cam)); else { satPos(cc.o, camW); toW(camW); }
      if (v > 0.002) {
        const n = T2.copy(a.n).normalize(); east(n, T3); tq.crossVectors(n, T3);
        fp.visible = true; fp.position.copy(n).multiplyScalar(1.0065); mB.makeBasis(T3, tq, n); fp.quaternion.setFromRotationMatrix(mB); fp.scale.set(0.15, 0.11, 1);
        fpMat.uniforms.uK.value = v; fpMat.uniforms.uSar.value = cc.sar ? 1 : 0; fpMat.uniforms.uScan.value = MU.clamp((lt - 1.4) / 2.6, 0, 1.2);
        for (let i = 0; i < 4; i++) { const sx = i === 0 || i === 3 ? -1 : 1, sy = i < 2 ? -1 : 1; corners[i].copy(n).addScaledVector(T3, sx * 0.075).addScaledVector(tq, sy * 0.055).normalize().multiplyScalar(1.0065); toW(corners[i]); }
        const P = frG.attributes.position.array; for (let i = 0; i < 4; i++) { const b = corners[i], c2 = corners[(i + 1) % 4]; P.set([camW.x, camW.y, camW.z, b.x, b.y, b.z], i * 6); P.set([b.x, b.y, b.z, c2.x, c2.y, c2.z], 24 + i * 6); }
        frG.attributes.position.needsUpdate = true; frus.material.opacity = 0.65 * v; frus.visible = true;
        for (const ts of [1.8, 2.7, 3.6]) if (lt > ts && lt < ts + 0.07) FIRE.glow(tB.copy(camW).applyMatrix4(invSpin), 0.022, 2.6, 3, 3.4);
      } else { fp.visible = frus.visible = false; }
      const tv = ss(lt, 2.3, 2.6) * (1 - ss(lt, cc.dur - 1.5, cc.dur - 1.15));
      if (tv > 0.01) { const n = T2.copy(a.n).normalize(); brk.visible = true; brk.position.copy(n).multiplyScalar(1.0072); brk.quaternion.setFromUnitVectors(Z_AXIS, n); brk.scale.setScalar(0.85 * (1 + 0.6 * (1 - ss(lt, 2.3, 2.7)))); brM.material.opacity = tv * (lt < 3 ? (Math.sin(lt * 38) > 0 ? 1 : 0.35) : 0.85); } else brk.visible = false;
      if (lt > 1.3 && !cc.l1) { cc.l1 = 1; cc.lab && cc.lab.set(null, 'AOI · ' + a.nm + (cc.sar ? ' · SAR SPOTLIGHT' : ' · GSD 0.5 M')); }
      if (lt > 4.2 && !cc.l2) { cc.l2 = 1; cc.lab && cc.lab.set(null, (cc.sar ? 'SAR IMAGE ACQUIRED' : 'IMAGE ACQUIRED · 3 FRAMES') + ' · DOWNLINK'); }
      if (lt > cc.dur) { if (s) s.inner.quaternion.identity(); cc.lab && cc.lab.close(); IM.cur = null; }
    };
    const GS = [[78.23, 15.4], [64.86, -147.85], [-23.7, 133.88], [-25.89, 27.69], [67.86, 21.07], [37.94, -75.46], [-29.05, 115.35], [-52.94, -70.86], [19.01, -155.66], [5.25, -52.8], [13.03, 77.51], [35.4, -116.9], [52.2, 4.4], [-35.4, 149.0], [39.9, 116.4], [55.75, 37.6], [31.88, 34.68], [1.35, 103.8]].map(([la, lo]) => geo(la, lo, 1.003));
    const CD = hdr(0x7fd8ff, 1.2), CL = hdr(0x9dffb0, 1.5);
    const LK = [0, 1, 2, 3, 4, 5].map(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); const m = new THREE.LineSegments(g, additive(new THREE.LineBasicMaterial({ color: CD.clone(), opacity: 0 }))); m.frustumCulled = false; m.visible = false; spinG.add(m); return { m, g, a: null, b: null, t0: 0, dur: 0, laser: 0 }; });
    let nextLk = 2; const lA = new V3(), lB = new V3(), lC = new V3();
    const endPos = (e, out) => (e.sat ? satPos(e.sat, out) : out.copy(e.p));
    const linksUpdate = () => {
      if (t > nextLk) {
        nextLk = t + rnd(0.5, 1.6); const L = LK.find((x) => !x.a);
        if (L) { spinG.getWorldPosition(gcW); for (const s of SATS.filter((x) => x.fam !== 'jw' && x.fam !== 'rm').sort(() => Math.random() - 0.5)) {
          satPos(s, lA); toW(lC.copy(lA)); if (lC.z - gcW.z < 0.1) continue;
          if (s.fam === 'slk' && Math.random() < 0.55) { const nb = SATS.find((o) => o !== s && o.fam === 'slk' && o.F === s.F && satPos(o, lB).distanceTo(lA) < 0.14); if (nb) { Object.assign(L, { a: { sat: s }, b: { sat: nb }, t0: t, dur: rnd(1.8, 3.2), laser: 1 }); break; } }
          let best = null, bd = 0.8; for (const g of GS) { toW(lC.copy(g)); if (lC.z - gcW.z < 0.3) continue; const d = g.distanceTo(lA); if (d < bd) { bd = d; best = g; } }
          if (best) { Object.assign(L, { a: { p: best }, b: { sat: s }, t0: t, dur: rnd(2.4, 4.4), laser: 0 }); break; }
        } }
      }
      for (const L of LK) {
        if (!L.a) continue; const age = t - L.t0;
        if (age > L.dur || (L.a.sat && !SATS.includes(L.a.sat)) || (L.b.sat && !SATS.includes(L.b.sat))) { L.a = L.b = null; L.m.visible = false; continue; }
        endPos(L.a, lA); endPos(L.b, lB); const ar = L.g.attributes.position.array; ar[0] = lA.x; ar[1] = lA.y; ar[2] = lA.z; ar[3] = lB.x; ar[4] = lB.y; ar[5] = lB.z; L.g.attributes.position.needsUpdate = true;
        const op = ss(age, 0, 0.4) * (1 - ss(age, L.dur - 0.6, L.dur)); L.m.material.color.copy(L.laser ? CL : CD); L.m.material.opacity = op * (L.laser ? 0.75 : 0.5); L.m.visible = true;
        for (const ph of L.laser ? [(age * 1.7) % 1, (age * 1.7 + 0.5) % 1] : [(age * 0.9) % 1, 1 - ((age * 0.7 + 0.4) % 1)]) FIRE.glow(lC.copy(lA).lerp(lB, ph), 0.006, (L.laser ? 1.3 : 2.2) * op, (L.laser ? 3.6 : 3.4) * op, (L.laser ? 2.0 : 4.2) * op);
      }
    };
    // ---------- scheduler: one ascent at a time, launch from armed pads on the visible face ----------
    let nextLaunch = 3.5, lastSite = null;
    const padW = (S) => toW(T1.copy(S.base));
    let spinRate = 0.07, lastRotY = null;
    const visAfter = (S) => { const V = S.V, Tm = (V.tins[0] + V.tins[1]) / 2 * 1.6, D = 0.155 * Tm / 2.4; dirAt(S.n, deg(S.hdg), tB); gc(S.n, tB, D * 1.15, tA).normalize(); rotY(tA, spinRate * Tm * 0.5, tC); toW(tC); spinG.getWorldPosition(tT); return tC.z - tT.z; };
    const schedule = () => {
      for (const S of SITES) if (S.state === 'spent') { padW(S); if (T1.z < -0.2) arm(S); }
      const RATE = { off: 0, low: 1.7, normal: 1, high: 0.55 }[CFG().rate] ?? 1;
      if (!FULL || !RATE || t < nextLaunch || FLIGHTS.filter((F) => F.k < 1.05).length >= 3) return;
      const busy = FLIGHTS.filter((F) => F.k < 1.05).map((F) => F.S);
      const cands = SITES.filter((S) => { if (S.state !== 'armed' || (S === lastSite && !S.il) || busy.some((B) => B.n.distanceTo(S.n) < 0.6)) return false; padW(S); if (T1.z < 0.25) return false; return visAfter(S) > 0.3; });
      if (!cands.length) { nextLaunch = t + 1; return; }
      let r = Math.random() * cands.reduce((a, S) => a + S.w, 0), pick = cands[0];
      for (const S of cands) { r -= S.w; if (r <= 0) { pick = S; break; } }
      launch(pick); lastSite = pick; nextLaunch = t + (Math.random() < 0.25 ? rnd(1.5, 3) : rnd(4, 10)) * RATE;
    };
    const frame = (dt, tt) => {
      const on = CFG().traffic !== false;
      if (!on) {
        if (!trafficOff) { trafficOff = true; for (const o of MINE) { o.userData._v = o.visible; o.visible = false; } if (IM.cur) { if (IM.cur.s) IM.cur.s.inner.quaternion.identity(); IM.cur.lab && IM.cur.lab.close(); IM.cur = null; } }
        for (const s of SATM) if (s.inner) s.inner.quaternion.identity();
        t = tt; return;
      }
      if (trafficOff) { trafficOff = false; for (const o of MINE) o.visible = o.userData._v ?? true; nextLaunch = tt + 1.5; IM.next = tt + 4; }
      if (lastRotY != null && dt > 0) { const r = (spinG.rotation.y - lastRotY) / dt; if (r > 0 && r < 0.3) spinRate += (r - spinRate) * 0.05; } lastRotY = spinG.rotation.y;
      t = tt; if ((++stnN % 30) === 0) stencilize(); scene.updateMatrixWorld(); invSpin.copy(spinG.matrixWorld).invert(); plN = 0;
      schedule();
      for (let i = FLIGHTS.length - 1; i >= 0; i--) { const F = FLIGHTS[i]; let ok = false; try { ok = step(F, dt); } catch (e) { console.warn('launch flight', F.S.id, e); } if (!ok) { F.lab && F.lab.close(); F.blab && F.blab.close(); F.S.state = 'spent'; FLIGHTS.splice(i, 1); } }
      bodiesUpdate(dt); satsUpdate(dt); deepUpdate(); linksUpdate(); trailsUpdate(); poUpdate(); trkUpdate(); try { imgUpdate(); } catch (e) { if (!IM.err) { IM.err = 1; console.warn('imaging', e); } IM.cur = null; } lblUpdate(dt);
      for (let i = plN; i < PLM.length; i++) PLM[i].visible = false;
      for (const k in FL) if (FL[k].dirty) { FL[k].im.instanceMatrix.needsUpdate = true; FL[k].dirty = false; }
      FIRE.update(dt); SMOKE.update(dt);
    };
    const spawn = (id) => { const S = SITES.find((x) => x.id === id); if (!S || S.state === 'flying') return false; if (S.state !== 'armed') arm(S); launch(S); lastSite = S; nextLaunch = t + 12; return true; };
    MINE = [...spinG.children, ...scene.children].filter((x) => !PRE0.has(x));
    return { frame, spawn, img: () => { if (IM.cur) return false; const pk = imgPick(); if (pk) imgStart(pk); return !!pk; }, events: () => SITES.map((S) => S.id), site: (id) => SITES.find((x) => x.id === id), flights: () => FLIGHTS.map((F) => ({ id: F.S.id, k: +F.k.toFixed(2), lt: +(t - F.T0).toFixed(2), t: +t.toFixed(2) })), lbl: () => LBL.map((L) => [L.on, +L.op.toFixed(2), L.title, L.sub, L.tok]) };
  };
  return { theatre };
})();
