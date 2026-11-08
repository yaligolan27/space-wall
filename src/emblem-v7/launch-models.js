// Launch vehicles, pads and satellites for the emblem launch theatre (instanced, merged per material, forward +X / up +Y, origin at engine plane).
window.EmblemLaunchModels = (c, spinG) => {
  const { THREE, TAU, hdr } = c, V3 = THREE.Vector3, Y_AXIS = new V3(0, 1, 0), Z_AXIS = new V3(0, 0, 1), DS = THREE.DoubleSide;
  const MAXA = c.renderer ? c.renderer.capabilities.getMaxAnisotropy() : 4;
  const ctex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = MAXA; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; return tx; };
  const latTex = ctex(64, 1024, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#d6dbe2'; g.lineWidth = 7; g.beginPath(); g.moveTo(3, 0); g.lineTo(3, h); g.moveTo(w - 3, 0); g.lineTo(w - 3, h); g.stroke(); g.lineWidth = 3.5; for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y + 2); g.lineTo(w, y + 2); g.moveTo(4, y + 4); g.lineTo(w - 4, y + 60); g.moveTo(w - 4, y + 4); g.lineTo(4, y + 60); g.stroke(); } });
  const gridTex = ctex(64, 64, (g, w) => { g.clearRect(0, 0, w, w); g.strokeStyle = '#d0d4da'; g.lineWidth = 3; for (let k = -w; k < 2 * w; k += 9) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + w, w); g.moveTo(k + w, 0); g.lineTo(k, w); g.stroke(); } g.lineWidth = 8; g.strokeRect(0, 0, w, w); });
  const steelTex = ctex(64, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#cfd4db'); gr.addColorStop(0.5, '#eef1f5'); gr.addColorStop(1, '#cfd4db'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 24) { g.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`; g.fillRect(0, y + 2, w, 20); g.fillStyle = 'rgba(60,66,76,0.45)'; g.fillRect(0, y, w, 1.6); } });
  const tileTex = ctex(256, 256, (g, w) => { g.fillStyle = '#40444b'; g.fillRect(0, 0, w, w); const R = 9.2376, hx = 16; for (let row = -1; row < 20; row++) for (let col = -1; col < 18; col++) { const cx = col * hx + (row % 2 ? hx / 2 : 0), cy = row * R * 1.5; const v = 16 + Math.random() * 9 + (Math.random() < 0.025 ? 70 : 0); g.fillStyle = `rgb(${v | 0},${(v + 1) | 0},${(v + 3) | 0})`; g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * (R - 1.1), cy + Math.sin(a) * (R - 1.1)); } g.fill(); } });
  const lzTex = ctex(256, 256, (g) => { g.fillStyle = '#8f9399'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#f4f4ef'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 98, 0, TAU); g.stroke(); g.lineWidth = 18; g.beginPath(); g.moveTo(82, 82); g.lineTo(174, 174); g.moveTo(174, 82); g.lineTo(82, 174); g.stroke(); });
  const deckTex = ctex(256, 256, (g) => { g.fillStyle = '#3c4148'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#f2f2ee'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 80, 0, TAU); g.stroke(); g.lineWidth = 14; g.beginPath(); g.moveTo(92, 92); g.lineTo(164, 164); g.moveTo(164, 92); g.lineTo(92, 164); g.stroke(); });
  const foilTex = ctex(256, 256, (g, s) => { g.fillStyle = '#b8862e'; g.fillRect(0, 0, s, s); for (let i = 0; i < 600; i++) { const x = Math.random() * s, y = Math.random() * s, r = 4 + Math.random() * 18; g.fillStyle = `hsl(${34 + Math.random() * 14},${55 + Math.random() * 30}%,${30 + Math.random() * 42}%)`; g.beginPath(); g.moveTo(x, y); for (let q = 0; q < 3; q++) g.lineTo(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 2); g.closePath(); g.fill(); } });
  const cellTex = ctex(256, 256, (g, s) => { g.fillStyle = '#0b1534'; g.fillRect(0, 0, s, s); const n = 8, cc = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = `rgb(${30 + Math.random() * 25},${55 + Math.random() * 35},${130 + Math.random() * 60})`; g.fillRect(i * cc + 2, j * cc + 2, cc - 4, cc - 4); } g.strokeStyle = 'rgba(220,228,240,0.9)'; g.lineWidth = 5; g.strokeRect(0, 0, s, s); });

  const rimify = (m, k = 0.35, col = 0x9fd0ff) => { const rc = hdr(col, k); m.onBeforeCompile = (sh) => { sh.uniforms.uRimL = { value: rc }; sh.fragmentShader = 'uniform vec3 uRimL;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uRimL * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);'); }; m.customProgramCacheKey = () => 'rimL'; return m; };
  const std = (col, m, r, o = {}) => rimify(new THREE.MeshStandardMaterial(Object.assign({ color: col, metalness: m, roughness: r, emissive: col, emissiveIntensity: 0.05 }, o)));
  const UM = {
    white: std(0xf2f4f7, 0.05, 0.36), whiteDS: std(0xf0f2f5, 0.05, 0.4, { side: DS }), offw: std(0xd2d6dc, 0.25, 0.4),
    black: std(0x16181c, 0.3, 0.5), carbon: std(0x1d2025, 0.5, 0.38), dark: std(0x2c3036, 0.75, 0.38),
    bell: std(0x4a3f38, 0.9, 0.3, { side: DS }), niob: std(0x5c6068, 1, 0.22, { side: DS }), silver: std(0xd9dde3, 1, 0.2),
    steel: rimify(new THREE.MeshPhysicalMaterial({ map: steelTex, color: 0xffffff, metalness: 1, roughness: 0.24, clearcoat: 0.25, emissive: 0x30343a, emissiveIntensity: 0.3 })),
    tile: std(0xffffff, 0.1, 0.75, { map: tileTex, emissive: 0x0b0c0e, emissiveIntensity: 1 }),
    grid: std(0x8a9099, 0.85, 0.32, { map: gridTex, alphaTest: 0.5, side: DS }),
    lattice: std(0xb4bac3, 0.6, 0.45, { map: latTex, alphaTest: 0.5, side: DS }), latDark: std(0x707780, 0.6, 0.5, { map: latTex, alphaTest: 0.5, side: DS }),
    conc: std(0x5b6067, 0.05, 0.95, { emissiveIntensity: 0.02 }), deck: std(0x4c525a, 0.3, 0.72),
    lz: std(0xffffff, 0.05, 0.9, { map: lzTex, emissive: 0x111111, emissiveIntensity: 1 }), barge: std(0xffffff, 0.2, 0.8, { map: deckTex, emissive: 0x0a0a0a, emissiveIntensity: 1 }),
    sz: std(0xc4cbc0, 0.15, 0.48), szDark: std(0x4a5048, 0.4, 0.5), red: std(0xb03a2e, 0.2, 0.5),
    gold: rimify(new THREE.MeshStandardMaterial({ map: foilTex, color: 0xffffff, metalness: 1, roughness: 0.3, emissive: 0x3a2508, emissiveIntensity: 0.4 })),
    cells: rimify(new THREE.MeshPhysicalMaterial({ map: cellTex, color: 0xffffff, metalness: 0.5, roughness: 0.18, clearcoat: 1, emissive: 0x0b1c4a, emissiveIntensity: 0.6, side: DS })),
    shield: std(0xd9c9f2, 0.9, 0.22, { side: DS, emissiveIntensity: 0.12 }), mirror: rimify(new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.12, emissive: 0x6a4300, emissiveIntensity: 0.55 }), 0.5, 0xffe2a0),
    foam: std(0xcf6f2a, 0.05, 0.78), foamL: std(0xd8a26a, 0.05, 0.72),
    bus: std(0x3a3f47, 0.7, 0.32), busTop: std(0xc6cad0, 0.85, 0.22),
  };

  const SG = (n) => (n >= 10 ? Math.round(n * 1.75) : n);
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const CX = (rt, rb, h, seg = 32, open = false) => new THREE.CylinderGeometry(rt, rb, h, SG(seg), 1, open).rotateZ(-Math.PI / 2);
  const CXh = (r, h, seg, p0) => new THREE.CylinderGeometry(r, r, h, SG(seg), 1, true, p0, Math.PI).rotateZ(-Math.PI / 2);
  const Cy = (rt, rb, h, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, SG(seg), 1, open);
  const Sp = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, SG(ws), SG(hs));
  const latheX = (prof, seg = 32, p0 = 0, pl = TAU) => new THREE.LatheGeometry(prof.map(([r, x]) => new THREE.Vector2(r, x)), SG(seg), p0, pl).rotateZ(-Math.PI / 2);
  const disc = (r, seg = 40) => new THREE.CircleGeometry(r, SG(seg)).rotateY(-Math.PI / 2);
  const bellG = (rt, re, L, seg = 18) => latheX([[rt * 0.7, 0.002], [rt, 0], [rt * 1.3, -L * 0.2], [(rt + re) * 0.55, -L * 0.55], [re, -L]], seg);
  const rod = (p1, p2, r = 0.002, seg = 6) => { const a = new V3(...p1), b = new V3(...p2), L = a.distanceTo(b); return Cy(r, r, L, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, b.clone().sub(a).normalize())).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); };
  const ring = (n, fn, ph = 0) => { for (let k = 0; k < n; k++) { const an = ph + k / n * TAU; fn(an, Math.cos(an), Math.sin(an), k); } };
  const shp = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const planXZ = (pts, th) => new THREE.ExtrudeGeometry(shp(pts), { depth: th, bevelEnabled: false }).translate(0, 0, -th / 2).rotateX(Math.PI / 2);
  const fairH = (rb, rm, Lc, Lo) => { const P = [[rb, 0], [rm, 0.012], [rm, Lc]]; for (let i = 1; i <= 10; i++) { const u = i / 10; P.push([rm * Math.pow(Math.cos(u * Math.PI / 2), 0.75), Lc + Lo * u]); } P[P.length - 1][0] = 0; return (a) => a(latheX(P, 28, 0, Math.PI), UM.whiteDS); };

  // ---------- vehicles ----------
  const f9b = (fins, legs) => (a) => {
    a(CX(0.0352, 0.0366, 0.03, 40), UM.black, [0.015, 0, 0]); a(disc(0.036), UM.dark, [0.0005, 0, 0]);
    const bl = bellG(0.0036, 0.0074, 0.02, 16); a(bl, UM.bell); ring(8, (an, cs, sn) => a(bl, UM.bell, [0, cs * 0.0238, sn * 0.0238]));
    a(CX(0.034, 0.034, 0.52, 48), UM.white, [0.29, 0, 0]);
    for (const x of [0.16, 0.38, 0.5]) a(CX(0.0343, 0.0343, 0.002, 48), UM.offw, [x, 0, 0]);
    a(B(0.48, 0.005, 0.007), UM.offw, [0.3, 0.0345, 0]);
    a(CX(0.0347, 0.0347, 0.072, 48), UM.black, [0.586, 0, 0]);
    ring(4, (an, cs, sn) => {
      if (!legs) a(B(0.17, 0.003, 0.014), UM.carbon, [0.1, cs * 0.0352, sn * 0.0352], [an, 0, 0]);
      else { a(rod([0.135, cs * 0.035, sn * 0.035], [-0.036, cs * 0.09, sn * 0.09], 0.0036), UM.carbon); a(rod([0.012, cs * 0.035, sn * 0.035], [0.041, cs * 0.065, sn * 0.065], 0.0018), UM.dark); a(CX(0.008, 0.008, 0.003, 14), UM.dark, [-0.037, cs * 0.09, sn * 0.09]); }
    }, Math.PI / 4);
    ring(4, (an, cs, sn) => { if (!fins) a(B(0.028, 0.003, 0.03), UM.grid, [0.6, cs * 0.0362, sn * 0.0362], [an, 0, 0]); else a(B(0.0035, 0.032, 0.03), UM.grid, [0.604, cs * 0.0505, sn * 0.0505], [an, 0, 0]); });
    ring(2, (an, cs, sn) => a(B(0.012, 0.005, 0.009), UM.dark, [0.574, cs * 0.0355, sn * 0.0355], [an, 0, 0]), 0.5);
  };
  const f9s = (a) => {
    a(latheX([[0.0058, 0.004], [0.0066, 0], [0.011, -0.012], [0.017, -0.03], [0.0232, -0.05], [0.0258, -0.062]], 32), UM.niob);
    a(CX(0.011, 0.016, 0.016, 24), UM.dark, [0.008, 0, 0]); a(CX(0.034, 0.034, 0.152, 48), UM.white, [0.082, 0, 0]);
    a(CX(0.0343, 0.0343, 0.004, 48), UM.black, [0.008, 0, 0]); a(CX(0.0346, 0.0346, 0.02, 48), UM.black, [0.168, 0, 0]);
    ring(4, (an, cs, sn) => a(B(0.006, 0.003, 0.004), UM.dark, [0.15, cs * 0.0348, sn * 0.0348], [an, 0, 0]), 0.3);
  };
  const slkStk = (a) => { a(CX(0.03, 0.03, 0.004, 32), UM.dark, [0.002, 0, 0]); for (let k = 0; k < 12; k++) a(B(0.0088, 0.056, 0.04), k % 2 ? UM.busTop : UM.bus, [0.009 + k * 0.0095, 0, 0]); for (const z of [-0.023, 0.023]) a(CX(0.0016, 0.0016, 0.122, 6), UM.silver, [0.065, 0, z]); };
  const sh = (a) => {
    const rb = bellG(0.0026, 0.0044, 0.012, 14);
    for (const [n, rr, ph] of [[3, 0.008, 0], [10, 0.022, 0.1], [20, 0.04, 0]]) ring(n, (an, cs, sn) => a(rb, UM.bell, [0, cs * rr, sn * rr]), ph);
    a(CX(0.05, 0.051, 0.03, 64), UM.steel, [0.015, 0, 0]); a(disc(0.0505, 48), UM.dark, [0.0005, 0, 0]);
    a(CX(0.05, 0.05, 0.6, 64), UM.steel, [0.33, 0, 0]);
    for (const z of [-1, 1]) a(B(0.5, 0.0045, 0.006), UM.steel, [0.3, 0, z * 0.0505]);
    ring(4, (an, cs, sn) => a(B(0.004, 0.034, 0.042), UM.grid, [0.612, cs * 0.067, sn * 0.067], [an, 0, 0]), Math.PI / 4);
    a(CX(0.0502, 0.0502, 0.04, 64), UM.dark, [0.65, 0, 0]);
    ring(16, (an, cs, sn) => a(B(0.03, 0.002, 0.007), UM.steel, [0.65, cs * 0.0505, sn * 0.0505], [an, 0, 0]));
    for (const z of [-1, 1]) a(B(0.008, 0.008, 0.012), UM.dark, [0.6, 0, z * 0.056]);
  };
  const ssM = (a) => {
    const slb = bellG(0.0035, 0.006, 0.012, 16), rvb = bellG(0.005, 0.0135, 0.034, 24);
    ring(3, (an, cs, sn) => a(slb, UM.bell, [0.004, cs * 0.009, sn * 0.009]));
    ring(3, (an, cs, sn) => a(rvb, UM.niob, [0.006, cs * 0.029, sn * 0.029]), Math.PI / 3);
    a(disc(0.049, 48), UM.dark, [0.004, 0, 0]);
    a(CXh(0.05, 0.36, 64, 0), UM.tile, [0.184, 0, 0]); a(CXh(0.05, 0.36, 64, Math.PI), UM.steel, [0.184, 0, 0]);
    const prof = [[0.05, 0], [0.049, 0.03], [0.045, 0.06], [0.038, 0.09], [0.028, 0.115], [0.016, 0.133], [0.006, 0.142], [0, 0.145]];
    a(latheX(prof, 32, 0, Math.PI), UM.tile, [0.364, 0, 0]); a(latheX(prof, 32, Math.PI, Math.PI), UM.steel, [0.364, 0, 0]);
    for (const z of [-1, 1]) {
      a(planXZ([[0.012, 0.049 * z], [0.135, 0.049 * z], [0.118, 0.098 * z], [0.03, 0.104 * z]], 0.004), UM.tile);
      a(planXZ([[0.372, 0.046 * z], [0.445, 0.034 * z], [0.432, 0.064 * z], [0.388, 0.072 * z]], 0.003), UM.tile);
    }
    a(B(0.05, 0.003, 0.03), UM.dark, [0.27, 0.0495, 0]);
  };
  const szc = (a) => {
    a(latheX([[0.019, 0], [0.0195, 0.03], [0.021, 0.12], [0.025, 0.24], [0.029, 0.36], [0.03, 0.44]], 40), UM.sz);
    const bl = bellG(0.0035, 0.006, 0.014, 14); ring(4, (an, cs, sn) => a(bl, UM.bell, [0, cs * 0.009, sn * 0.009]), Math.PI / 4);
    ring(4, (an, cs, sn) => a(bellG(0.0015, 0.0025, 0.008, 10), UM.bell, [0.002, cs * 0.017, sn * 0.017]));
    a(CX(0.0302, 0.0302, 0.006, 40), UM.szDark, [0.44, 0, 0]);
    ring(10, (an, cs, sn) => a(rod([0.443, cs * 0.028, sn * 0.028], [0.5, Math.cos(an + 0.3) * 0.028, Math.sin(an + 0.3) * 0.028], 0.0014), UM.dark));
  };
  const szs = (a) => { a(bellG(0.004, 0.008, 0.016, 16), UM.bell); ring(4, (an, cs, sn) => a(bellG(0.0025, 0.005, 0.012, 12), UM.bell, [0, cs * 0.012, sn * 0.012]), Math.PI / 4); a(CX(0.03, 0.03, 0.13, 40), UM.sz, [0.07, 0, 0]); a(CX(0.0305, 0.0305, 0.008, 40), UM.szDark, [0.134, 0, 0]); };
  const szb = (a) => {
    a(latheX([[0.021, 0], [0.023, 0.02], [0.023, 0.13], [0.019, 0.2], [0.012, 0.28], [0.005, 0.33], [0, 0.34]], 28), UM.sz);
    const bl = bellG(0.0032, 0.0055, 0.013, 12); ring(4, (an, cs, sn) => a(bl, UM.bell, [0, cs * 0.009, sn * 0.009]), Math.PI / 4);
    a(B(0.03, 0.022, 0.003), UM.szDark, [0.015, 0.032, 0]); a(CX(0.0235, 0.0235, 0.004, 28), UM.szDark, [0.13, 0, 0]);
  };
  const a6c = (a) => { a(bellG(0.006, 0.0135, 0.034, 24), UM.niob); a(CX(0.03, 0.031, 0.02, 40), UM.offw, [0.01, 0, 0]); a(CX(0.03, 0.03, 0.54, 48), UM.white, [0.29, 0, 0]); a(CX(0.0303, 0.0303, 0.04, 48), UM.black, [0.58, 0, 0]); for (const x of [0.12, 0.42]) a(CX(0.0304, 0.0304, 0.002, 48), UM.offw, [x, 0, 0]); for (const z of [-1, 1]) a(B(0.04, 0.008, 0.012), UM.dark, [0.08, 0, z * 0.034]); };
  const a6u = (a) => { a(bellG(0.004, 0.011, 0.04, 20), UM.niob); a(CX(0.03, 0.03, 0.12, 48), UM.white, [0.065, 0, 0]); a(CX(0.0303, 0.0303, 0.015, 48), UM.black, [0.132, 0, 0]); };
  const p120 = (a) => { a(bellG(0.007, 0.012, 0.026, 18), UM.dark); a(CX(0.019, 0.021, 0.02, 32), UM.offw, [0.01, 0, 0]); a(CX(0.019, 0.019, 0.3, 32), UM.white, [0.17, 0, 0]); a(latheX([[0.019, 0], [0.017, 0.025], [0.012, 0.05], [0.005, 0.068], [0, 0.072]], 32), UM.white, [0.32, 0, 0]); a(CX(0.0193, 0.0193, 0.003, 32), UM.black, [0.3, 0, 0]); a(B(0.012, 0.008, 0.006), UM.dark, [0.28, -0.021, 0]); };
  const cz5c = (a) => { const bl = bellG(0.005, 0.0105, 0.028, 18); for (const z of [-1, 1]) a(bl, UM.niob, [0, 0, z * 0.012]); a(CX(0.034, 0.035, 0.02, 40), UM.offw, [0.01, 0, 0]); a(CX(0.034, 0.034, 0.54, 48), UM.white, [0.29, 0, 0]); a(CX(0.0343, 0.0343, 0.04, 48), UM.offw, [0.58, 0, 0]); a(CX(0.0342, 0.0342, 0.008, 48), UM.red, [0.46, 0, 0]); };
  const cz5u = (a) => { for (const z of [-1, 1]) a(bellG(0.003, 0.008, 0.026, 16), UM.niob, [0, 0, z * 0.01]); a(CX(0.034, 0.034, 0.13, 48), UM.white, [0.07, 0, 0]); a(CX(0.0343, 0.0343, 0.01, 48), UM.offw, [0.135, 0, 0]); };
  const cz5b = (a) => { for (const z of [-1, 1]) a(bellG(0.0035, 0.007, 0.016, 14), UM.bell, [0, 0, z * 0.008]); a(CX(0.022, 0.022, 0.25, 36), UM.white, [0.13, 0, 0]); a(latheX([[0.022, 0], [0.02, 0.03], [0.014, 0.065], [0.006, 0.09], [0, 0.1]], 32), UM.white, [0.255, 0, 0]); a(CX(0.0223, 0.0223, 0.006, 36), UM.red, [0.2, 0, 0]); };
  const shv1 = (a) => { a(bellG(0.006, 0.011, 0.02, 18), UM.dark); a(CX(0.02, 0.021, 0.012, 32), UM.black, [0.006, 0, 0]); a(CX(0.02, 0.02, 0.27, 36), UM.white, [0.147, 0, 0]); for (const x of [0.05, 0.25]) a(CX(0.0203, 0.0203, 0.012, 36), UM.black, [x, 0, 0]); a(CX(0.0202, 0.0202, 0.04, 36), UM.black, [0.3, 0, 0]); };
  const shv2 = (a) => { a(bellG(0.005, 0.01, 0.02, 16), UM.dark); a(CX(0.02, 0.02, 0.17, 36), UM.white, [0.09, 0, 0]); a(CX(0.0202, 0.0202, 0.03, 36), UM.black, [0.185, 0, 0]); };
  const shv3 = (a) => { a(bellG(0.004, 0.008, 0.014, 14), UM.dark); a(CX(0.016, 0.02, 0.08, 32), UM.white, [0.045, 0, 0]); a(CX(0.02, 0.02, 0.02, 32), UM.black, [0.09, 0, 0]); };
  // ---------- satellites (X = velocity, Y = radial up, wings span Z) ----------
  const slk = (a) => { a(B(0.95, 0.09, 0.56), UM.bus); a(B(0.96, 0.012, 0.57), UM.busTop, [0, 0.05, 0]); for (const x of [-0.24, 0.24]) for (const z of [-0.14, 0.14]) a(B(0.36, 0.01, 0.22), UM.offw, [x, -0.05, z]); a(CX(0.04, 0.05, 0.08, 10), UM.dark, [-0.5, 0, 0]); for (const z of [-0.2, 0.2]) a(Sp(0.05, 10, 8), UM.silver, [0.5, 0.03, z]); };
  const slkW = (a) => { for (const sz of [-1, 1]) { a(B(0.8, 0.014, 1.3), UM.cells, [0, 0.06, sz * 1.0]); a(B(0.06, 0.03, 0.08), UM.silver, [0, 0.06, sz * 0.32]); } };
  const gsat = (a) => { a(B(0.7, 0.7, 0.7), UM.gold); a(B(0.72, 0.03, 0.72), UM.busTop, [0, 0.36, 0]); for (const sx of [-1, 1]) { a(new THREE.SphereGeometry(0.45, 24, 8, 0, TAU, 0, 0.6).rotateZ(sx * Math.PI / 2), UM.whiteDS, [sx * 0.8, 0.05, 0]); a(rod([sx * 0.36, 0.2, 0], [sx * 0.55, 0.05, 0], 0.02), UM.silver); } a(Cy(0.08, 0.12, 0.2, 16), UM.silver, [0, -0.45, 0]); };
  const gsatW = (a) => { for (const sz of [-1, 1]) { a(Cy(0.02, 0.02, 0.3).rotateX(Math.PI / 2), UM.silver, [0, 0, sz * 0.5]); for (let j = 0; j < 3; j++) a(B(0.75, 0.016, 0.52), UM.cells, [0, 0, sz * (0.95 + j * 0.56)]); } };
  const ofk = (a) => { a(new THREE.CylinderGeometry(0.34, 0.34, 0.75, 6).rotateZ(-Math.PI / 2), UM.gold); for (const x of [-0.36, 0.36]) a(CX(0.345, 0.345, 0.04, 6), UM.silver, [x, 0, 0]); a(Cy(0.16, 0.18, 0.3, 20), UM.dark, [0.05, -0.45, 0]); a(B(0.2, 0.12, 0.2), UM.silver, [-0.2, 0.36, 0]); };
  const ofkW = (a) => { for (const sz of [-1, 1]) for (let j = 0; j < 2; j++) a(B(0.6, 0.016, 0.5), UM.cells, [0, 0, sz * (0.62 + j * 0.53)]); };
  const ofs = (a) => { a(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 6).rotateZ(-Math.PI / 2), UM.gold); for (const x of [-0.38, 0.38]) a(CX(0.305, 0.305, 0.04, 6), UM.silver, [x, 0, 0]); a(Cy(0.05, 0.06, 0.2, 10), UM.silver, [0, -0.38, 0]); a(B(0.16, 0.1, 0.16), UM.silver, [-0.2, 0.33, 0]); for (const sz of [-1, 1]) a(B(0.5, 0.014, 0.34), UM.cells, [0, 0.12, sz * 0.5]); };
  const ofsW = (a) => { a(new THREE.SphereGeometry(1.2, 40, 6, 0, TAU, 0, 0.55), UM.whiteDS, [0, -1.62, 0]); a(new THREE.TorusGeometry(0.627, 0.012, 6, 48).rotateX(Math.PI / 2), UM.silver, [0, -0.6, 0]); for (let k = 0; k < 12; k++) { const an = k / 12 * TAU; a(rod([0, -0.43, 0], [Math.cos(an) * 0.62, -0.6, Math.sin(an) * 0.62], 0.006), UM.silver); } for (let k = 0; k < 3; k++) { const an = k / 3 * TAU + 0.5; a(rod([Math.cos(an) * 0.6, -0.6, Math.sin(an) * 0.6], [0, -0.95, 0], 0.009), UM.silver); } a(Cy(0.05, 0.03, 0.1, 12), UM.dark, [0, -0.98, 0]); };
  const wv = (a) => { a(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 6), UM.offw); a(B(0.6, 0.25, 0.6), UM.gold, [0, 0.68, 0]); a(Cy(0.3, 0.33, 0.06, 24), UM.dark, [0, -0.58, 0]); a(Cy(0.26, 0.26, 0.01, 24), UM.niob, [0, -0.615, 0]); a(Cy(0.04, 0.04, 0.25, 8), UM.silver, [0.22, 0.92, 0.22]); a(Sp(0.07, 10, 8), UM.white, [-0.22, 0.86, -0.18]); };
  const wvW = (a) => ring(3, (an, cs, sn) => a(B(0.75, 0.016, 0.5), UM.cells, [cs * 0.85, 0.72, sn * 0.85], [0, -an, -0.3]), 0.5);
  const pln = (a) => { a(B(0.7, 0.9, 0.7), UM.offw); a(B(0.72, 0.04, 0.72), UM.dark, [0, 0.47, 0]); a(Cy(0.28, 0.3, 0.12, 24), UM.dark, [0, -0.5, 0]); a(Cy(0.24, 0.24, 0.01, 24), UM.niob, [0, -0.565, 0]); a(B(0.3, 0.2, 0.3), UM.gold, [0.15, 0.6, 0.1]); };
  const plnW = (a) => ring(4, (an, cs, sn) => a(B(0.7, 0.016, 0.42), UM.cells, [cs * 0.75, 0.45, sn * 0.75], [0, -an, 0]), Math.PI / 4);
  const sky = (a) => { a(B(0.45, 0.8, 0.45), UM.offw); a(Cy(0.17, 0.17, 0.08, 16), UM.dark, [0, -0.43, 0]); a(B(0.47, 0.03, 0.47), UM.gold, [0, 0.41, 0]); };
  const skyW = (a) => { for (const sz of [-1, 1]) a(B(0.45, 0.016, 0.6), UM.cells, [0, 0.38, sz * 0.55]); };
  const jw = (a) => {
    a(B(0.3, 0.12, 0.3), UM.bus, [0, -0.1, 0]); a(B(0.06, 0.05, 0.45), UM.cells, [0, -0.18, 0]); a(Cy(0.03, 0.03, 0.4, 8), UM.dark, [0, 0.32, 0]);
    const s2 = 0.1, hex = new THREE.CylinderGeometry(s2 * 0.96, s2 * 0.96, 0.02, 6).rotateZ(Math.PI / 2);
    for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) { const d = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); if (d < 1 || d > 2) continue; a(hex, UM.mirror, [0.02, 0.66 + s2 * 1.5 * r, s2 * Math.sqrt(3) * (q + r / 2)]); }
    a(B(0.04, 0.5, 0.06), UM.dark, [-0.03, 0.66, 0]);
    for (const [y, z] of [[0.42, 0], [-0.21, 0.36], [-0.21, -0.36]]) a(rod([0.03, 0.66 + y, z], [0.62, 0.66, 0], 0.006), UM.dark);
    a(Sp(0.04, 10, 8), UM.mirror, [0.63, 0.66, 0]);
  };
  const jwW = (a) => { for (let L = 0; L < 5; L++) { const k = 1 - L * 0.06; a(planXZ([[1.1 * k, 0], [0, 0.55 * k], [-1.1 * k, 0], [0, -0.55 * k]], 0.006), UM.shield, [0, L * 0.03, 0]); } };
  const rmW = (a) => { for (const sx of [-1, 1]) a(B(0.02, 0.55, 0.8), UM.cells, [sx * 0.55, 0.0, 0], [0, 0, sx * 0.35]); };
  const rmn = (a) => { a(Cy(0.28, 0.28, 0.9, 24), UM.offw, [0, 0.45, 0]); a(Cy(0.29, 0.29, 0.04, 24), UM.dark, [0, 0.9, 0]); a(new THREE.CylinderGeometry(0.3, 0.36, 0.25, 6), UM.gold, [0, -0.12, 0]); a(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 24, 1, true, 0, Math.PI), UM.cells, [0, 0.42, 0]); a(Cy(0.05, 0.05, 0.2, 8), UM.silver, [0.2, -0.32, 0]); };
  const gen = (o) => (a) => {
    const r = o.r, L = o.L, mt = o.mat || UM.white, sk = o.sk ?? r * 0.4, n = o.nEng || 1, bm = o.bell || UM.bell;
    const bl = bellG(r * (n > 1 ? 0.13 : 0.22), r * (n > 1 ? 0.24 : 0.55), r * (n > 1 ? 0.5 : 0.9), 18);
    if (n === 1) a(bl, bm); else if (n === 2) { for (const z of [-1, 1]) a(bl, bm, [0, 0, z * r * 0.4]); } else { if (n % 2) a(bl, bm); ring(n - (n % 2), (an, cs, sn) => a(bl, bm, [0, cs * r * 0.58, sn * r * 0.58])); }
    a(CX(r, r * 1.02, sk, 40), o.skMat || UM.dark, [sk / 2, 0, 0]); a(disc(r), UM.dark, [0.0005, 0, 0]);
    a(CX(r, r, L, 48), mt, [sk + L / 2, 0, 0]);
    for (const [f, w, mm] of o.bands || []) a(CX(r * 1.005, r * 1.005, w, 48), mm || UM.black, [sk + f * L, 0, 0]);
    if (o.nose) { const nl = r * (o.noseL || 2.2); a(latheX([[r, 0], [r * 0.96, nl * 0.25], [r * 0.78, nl * 0.55], [r * 0.45, nl * 0.82], [0, nl]], 32), o.noseMat || mt, [sk + L, 0, 0]); }
    if (o.fins) ring(4, (an, cs, sn) => a(B(r * 1.6, r * 0.8, r * 0.05), UM.dark, [sk + L - r * 1.2, cs * r * 1.3, sn * r * 1.3], [an, 0, 0]), Math.PI / 4);
    if (o.las) a(CX(o.las[0], o.las[0], o.las[1], 10), UM.offw, [o.las[2], 0, 0]);
  };
  const withLas = (f, rr, L, x) => (a) => { f(a); a(CX(rr, rr, L, 10), UM.offw, [x, 0, 0]); a(latheX([[rr * 1.4, 0], [0, rr * 3]], 16), UM.dark, [x + L / 2, 0, 0]); };
  const orn = (a) => { a(CX(0.36, 0.36, 0.55, 32), UM.offw, [-0.3, 0, 0]); a(CX(0.37, 0.37, 0.05, 32), UM.dark, [-0.02, 0, 0]); a(latheX([[0.42, 0], [0.4, 0.1], [0.22, 0.42], [0.14, 0.5], [0, 0.52]], 32), UM.offw, [0.0, 0, 0]); a(CX(0.08, 0.14, 0.15, 16), UM.dark, [-0.65, 0, 0]); };
  const ornW = (a) => ring(4, (an, cs, sn) => a(B(0.3, 1.1, 0.016), UM.cells, [-0.35, cs * 0.95, sn * 0.95], [an, 0, 0]), Math.PI / 4);
  const prg = (a) => { a(CX(0.32, 0.32, 0.55, 24), UM.sz, [-0.35, 0, 0]); a(CX(0.33, 0.33, 0.04, 24), UM.dark, [-0.1, 0, 0]); a(CX(0.26, 0.32, 0.32, 24), UM.offw, [0.1, 0, 0]); a(Sp(0.27, 20, 14), UM.offw, [0.45, 0, 0]); a(CX(0.06, 0.08, 0.12, 12), UM.dark, [0.74, 0, 0]); a(rod([0.3, 0.25, 0], [0.3, 0.6, 0], 0.012), UM.silver); a(rod([-0.5, -0.32, 0], [-0.5, -0.65, 0], 0.012), UM.silver); a(CX(0.1, 0.18, 0.14, 16), UM.dark, [-0.68, 0, 0]); };
  const prgW = (a) => { for (const sz of [-1, 1]) for (let j = 0; j < 4; j++) a(B(0.34, 0.012, 0.3), UM.cells, [-0.35, 0, sz * (0.45 + j * 0.32)]); };
  // ---------- ground (X = east, Y = up) ----------
  const twr = (a) => { a(B(0.26, 0.012, 0.22), UM.conc, [-0.09, 0.006, 0]); a(B(0.1, 0.014, 0.05), UM.dark, [-0.09, 0.007, 0.08]); a(B(0.07, 0.95, 0.07), UM.lattice, [0, 0.495, 0]); a(B(0.09, 0.02, 0.09), UM.offw, [0, 0.98, 0]); a(Cy(0.004, 0.007, 0.26), UM.dark, [0, 1.12, 0]); a(B(0.03, 0.012, 0.02), UM.offw, [-0.05, 0.78, 0]); for (let y = 0.15; y < 0.95; y += 0.2) a(B(0.074, 0.008, 0.074), UM.offw, [0, y, 0]); };
  const te = (a) => { a(B(0.026, 0.92, 0.03), UM.latDark, [0, 0.46, 0]); for (const y of [0.3, 0.6, 0.86]) a(B(0.016, 0.008, 0.012), UM.dark, [0.02, y, 0]); };
  const lzM = (a) => a(Cy(0.17, 0.17, 0.008, 48), UM.lz, [0, 0.004, 0]);
  const asds = (a) => { a(B(0.5, 0.045, 0.32), UM.barge, [0, -0.01, 0]); for (const x of [-0.25, 0.25]) a(B(0.02, 0.05, 0.32), UM.deck, [x, 0.02, 0]); for (const z of [-0.15, 0.15]) a(B(0.04, 0.03, 0.03), UM.dark, [0.2, 0.02, z]); };
  const mz = (a) => { a(B(0.34, 0.012, 0.28), UM.conc, [-0.12, 0.006, 0]); a(B(0.1, 1.15, 0.1), UM.latDark, [0, 0.585, 0]); a(B(0.14, 0.05, 0.14), UM.dark, [0, 1.18, 0]); a(B(0.04, 0.12, 0.2), UM.dark, [-0.06, 0.83, 0]); a(B(0.09, 0.016, 0.022), UM.dark, [-0.08, 1.02, 0]); for (let y = 0.1; y < 1.15; y += 0.25) a(B(0.104, 0.01, 0.104), UM.dark, [0, y, 0]); };
  const olm = (a) => { ring(6, (an, cs, sn) => a(B(0.022, 0.18, 0.022), UM.dark, [cs * 0.075, 0.1, sn * 0.075]), 0.5); a(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 40, 1, true), UM.steel, [0, 0.19, 0]); a(new THREE.RingGeometry(0.055, 0.085, 40).rotateX(-Math.PI / 2), UM.dark, [0, 0.205, 0]); };
  const chop = (a) => { a(B(0.22, 0.028, 0.02), UM.dark, [0.11, 0, 0]); a(B(0.03, 0.04, 0.026), UM.dark, [0.205, -0.006, 0]); };
  const gp = (a) => { a(B(0.24, 0.012, 0.24), UM.conc, [0, 0.006, 0]); a(B(0.1, 0.014, 0.05), UM.dark, [0.04, 0.007, 0.09]); a(B(0.045, 0.78, 0.045), UM.lattice, [0.105, 0.41, 0]); a(B(0.03, 0.008, 0.012), UM.offw, [0.068, 0.62, 0]); a(Cy(0.003, 0.005, 0.2), UM.dark, [0.105, 0.9, 0]); };

  // ---------- merge + instancing ----------
  const build = (fn) => {
    const byMat = new Map(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
    fn((g0, m, p, r, s) => {
      const g = g0.index ? g0.toNonIndexed() : g0.clone();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const rr = r || [0, 0, 0]; M4.compose(new V3(...(p || [0, 0, 0])), Q.setFromEuler(E.set(rr[0], rr[1], rr[2])), new V3(...(s || [1, 1, 1]))); g.applyMatrix4(M4);
      if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g);
    });
    let total = 0; for (const arr of byMat.values()) for (const g of arr) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), out = new THREE.BufferGeometry(), mats = [];
    let off = 0;
    for (const [m, arr] of byMat) { const st = off; for (const g of arr) { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); uv.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; g.dispose(); } out.addGroup(st, off - st, mats.length); mats.push(m); }
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.computeBoundingSphere();
    return { geo: out, mats };
  };
  const FL = {}, _x = new V3(), _y = new V3(), _z = new V3(), _sv = new V3(), _m4 = new THREE.Matrix4(), ZM = new THREE.Matrix4().makeScale(0, 0, 0);
  const fleet = (key, fn, max) => {
    const b = build(fn), im = new THREE.InstancedMesh(b.geo, b.mats, max); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < max; i++) im.setMatrixAt(i, ZM); spinG.add(im);
    const free = []; for (let i = max - 1; i >= 0; i--) free.push(i);
    const f = FL[key] = { im, dirty: true,
      add: () => (free.length ? free.pop() : -1),
      hide: (i) => { if (i >= 0) { im.setMatrixAt(i, ZM); f.dirty = true; } },
      release: (i) => { if (i >= 0) { im.setMatrixAt(i, ZM); f.dirty = true; free.push(i); } },
      place: (i, p, fw, up, sx, sy = sx, sz = sx) => { if (i < 0) return; _x.copy(fw).normalize(); _z.crossVectors(_x, up); if (_z.lengthSq() < 1e-12) _z.crossVectors(_x, Math.abs(_x.y) < 0.9 ? Y_AXIS : Z_AXIS); _z.normalize(); _y.crossVectors(_z, _x); _m4.makeBasis(_x, _y, _z).scale(_sv.set(sx, sy, sz)).setPosition(p); im.setMatrixAt(i, _m4); f.dirty = true; },
      placeQ: (i, p, q, s) => { if (i < 0) return; _m4.compose(p, q, _sv.set(s, s, s)); im.setMatrixAt(i, _m4); f.dirty = true; },
    };
    return f;
  };
  const defs = [
    ['f9b0', f9b(0, 0), 4], ['f9b1', f9b(1, 0), 2], ['f9b2', f9b(1, 1), 2], ['f9s', f9s, 2], ['f9f', fairH(0.0345, 0.046, 0.11, 0.15), 4], ['slkStk', slkStk, 2],
    ['sh', sh, 1], ['ss', ssM, 1],
    ['szc', szc, 1], ['szs', szs, 1], ['szf', fairH(0.03, 0.034, 0.12, 0.1), 2], ['szb', szb, 4],
    ['a6c', a6c, 1], ['a6u', a6u, 1], ['a6f', fairH(0.03, 0.041, 0.14, 0.12), 2], ['p120', p120, 2],
    ['cz5c', cz5c, 1], ['cz5u', cz5u, 1], ['cz5f', fairH(0.034, 0.046, 0.15, 0.12), 2], ['cz5b', cz5b, 4],
    ['shv1', shv1, 1], ['shv2', shv2, 1], ['shv3', shv3, 1], ['shvf', fairH(0.02, 0.023, 0.06, 0.07), 2],
    ['slk', slk, 48], ['slkW', slkW, 48], ['gsat', gsat, 10], ['gsatW', gsatW, 10], ['ofk', ofk, 4], ['ofkW', ofkW, 4], ['ofs', ofs, 6], ['ofsW', ofsW, 6], ['orn', orn, 2], ['ornW', ornW, 2],
    ['fhs', gen({ r: 0.035, L: 0.55, sk: 0.03, nEng: 9, nose: true, noseL: 2.0, bands: [[0.93, 0.07, UM.black]] }), 2],
    ['slsc', gen({ r: 0.042, L: 0.6, sk: 0.04, nEng: 4, mat: UM.foam, skMat: UM.foam, bell: UM.niob }), 1], ['slsb', gen({ r: 0.03, L: 0.62, sk: 0.03, nose: true, noseL: 1.8, bands: [[0.25, 0.008, UM.dark], [0.5, 0.008, UM.dark], [0.75, 0.008, UM.dark]] }), 2], ['slsu', (a) => { a(CX(0.026, 0.042, 0.06, 40), UM.offw, [0.03, 0, 0]); a(CX(0.026, 0.026, 0.06, 40), UM.white, [0.09, 0, 0]); a(bellG(0.006, 0.012, 0.02, 14), UM.niob, [0.06, 0, 0]); }, 1], ['slsf', withLas(fairH(0.026, 0.03, 0.06, 0.06), 0.004, 0.06, 0.15), 2],
    ['vulc', gen({ r: 0.034, L: 0.5, sk: 0.03, nEng: 2, mat: UM.foamL, bell: UM.niob, bands: [[0.97, 0.05, UM.white]] }), 1], ['gem', gen({ r: 0.012, L: 0.22, sk: 0.01, nose: true, noseL: 2.5 }), 4], ['vulu', gen({ r: 0.034, L: 0.12, sk: 0.01, nEng: 2, bell: UM.niob }), 1], ['vulf', fairH(0.034, 0.04, 0.12, 0.11), 2],
    ['ngc', gen({ r: 0.05, L: 0.5, sk: 0.04, nEng: 7, bands: [[0.96, 0.05, UM.dark]], fins: true }), 1], ['ngu', gen({ r: 0.05, L: 0.14, sk: 0.01, nEng: 2, bell: UM.niob }), 1], ['ngf', fairH(0.05, 0.058, 0.16, 0.14), 2],
    ['elc', gen({ r: 0.012, L: 0.17, sk: 0.008, nEng: 9, mat: UM.carbon, bell: UM.dark }), 1], ['elu', gen({ r: 0.012, L: 0.04, sk: 0.004, mat: UM.carbon }), 1], ['elf', fairH(0.012, 0.013, 0.035, 0.03), 2],
    ['lvc', gen({ r: 0.028, L: 0.4, sk: 0.02, nEng: 2, mat: UM.offw }), 1], ['lvb', gen({ r: 0.022, L: 0.48, sk: 0.02, mat: UM.offw, nose: true, noseL: 2.0, bands: [[0.15, 0.01, UM.dark], [0.85, 0.01, UM.dark]] }), 2], ['lvu', gen({ r: 0.028, L: 0.1, sk: 0.01, bell: UM.niob }), 1], ['lvf', fairH(0.028, 0.04, 0.12, 0.1), 2],
    ['psc', gen({ r: 0.016, L: 0.3, sk: 0.01, mat: UM.offw }), 1], ['psb', gen({ r: 0.007, L: 0.13, sk: 0.006, mat: UM.offw, nose: true, noseL: 3 }), 6], ['psu', gen({ r: 0.014, L: 0.12, sk: 0.006, mat: UM.offw }), 1], ['psf', fairH(0.014, 0.02, 0.07, 0.06), 2],
    ['h3c', gen({ r: 0.026, L: 0.42, sk: 0.02, nEng: 2, bell: UM.niob }), 1], ['h3b', gen({ r: 0.01, L: 0.2, sk: 0.008, nose: true, noseL: 2.5 }), 2], ['h3u', gen({ r: 0.026, L: 0.1, sk: 0.01, bell: UM.niob }), 1], ['h3f', fairH(0.026, 0.034, 0.1, 0.09), 2],
    ['nuc', gen({ r: 0.02, L: 0.3, sk: 0.015, nEng: 4 }), 1], ['nuu', gen({ r: 0.02, L: 0.12, sk: 0.006 }), 1], ['nuf', fairH(0.02, 0.024, 0.07, 0.06), 2],
    ['anc', gen({ r: 0.018, L: 0.42, sk: 0.015, mat: UM.sz }), 1], ['anb', gen({ r: 0.018, L: 0.3, sk: 0.015, mat: UM.sz, nose: true, noseL: 2 }), 4], ['anu', gen({ r: 0.018, L: 0.12, sk: 0.006, mat: UM.sz }), 1], ['anf', fairH(0.018, 0.026, 0.1, 0.08), 2],
    ['c2c', gen({ r: 0.02, L: 0.38, sk: 0.015, nEng: 4, mat: UM.offw, bands: [[0.7, 0.008, UM.red]] }), 1], ['c2b', gen({ r: 0.014, L: 0.26, sk: 0.01, mat: UM.offw, nose: true, noseL: 2.4 }), 4], ['c2u', gen({ r: 0.02, L: 0.12, sk: 0.006, mat: UM.offw }), 1], ['c2f', withLas(fairH(0.02, 0.022, 0.12, 0.06), 0.003, 0.05, 0.2), 2], ['wv', wv, 4], ['wvW', wvW, 4], ['pln', pln, 3], ['plnW', plnW, 3], ['sky', sky, 14], ['skyW', skyW, 14], ['jw', jw, 1], ['jwW', jwW, 1], ['rm', rmn, 1], ['rmW', rmW, 1], ['prg', prg, 5], ['prgW', prgW, 5],
    ['twr', twr, 2], ['te', te, 2], ['lz', lzM, 2], ['asds', asds, 1], ['mz', mz, 1], ['olm', olm, 1], ['chop', chop, 2], ['gp', gp, 24],
  ];
  for (const [k, fn, n] of defs) fleet(k, fn, n);
  return FL;
};

window.EmblemLaunchVeh = {
  fh: { s: 0.21, b: 'f9b0', Lb: 0.62, st: 'f9s', Ls: 0.18, fair: 'f9f', payload: 'gsat', nPay: 1, straps: { m: 'fhs', n: 2, r: 0.072, k: 0.3, e: ['kero', 0.031, -0.02, 1] }, kMeco: 0.58, kFair: 0.64, eb: ['kero', 0.031, -0.02, 1], es: ['kerovac', 0.025, -0.062, 1], tins: [12, 13] },
  sls: { s: 0.29, b: 'slsc', Lb: 0.64, st: 'slsu', Ls: 0.12, fair: 'slsf', payload: 'orn', nPay: 1, straps: { m: 'slsb', n: 2, r: 0.076, k: 0.33, e: ['solid', 0.03, -0.027, 1.2] }, kMeco: 0.62, kFair: 0.4, eb: ['hydro', 0.036, -0.021, 1.1], es: ['hydrovac', 0.012, 0.04, 1], tins: [13, 14] },
  vul: { s: 0.23, b: 'vulc', Lb: 0.53, st: 'vulu', Ls: 0.13, fair: 'vulf', payload: 'gsat', nPay: 1, straps: { m: 'gem', n: 4, r: 0.048, k: 0.22, e: ['solid', 0.011, -0.01, 0.9] }, kMeco: 0.56, kFair: 0.62, eb: ['mlox', 0.03, -0.017, 1], es: ['hydrovac', 0.02, -0.017, 1], tins: [12, 13] },
  ng: { s: 0.24, b: 'ngc', Lb: 0.54, st: 'ngu', Ls: 0.15, fair: 'ngf', payload: 'gsat', nPay: 1, kMeco: 0.5, kFair: 0.56, eb: ['mlox', 0.045, -0.025, 1.1], es: ['hydrovac', 0.03, -0.025, 1], tins: [12, 13] },
  el: { s: 0.3, b: 'elc', Lb: 0.178, st: 'elu', Ls: 0.044, fair: 'elf', payload: 'sky', nPay: 1, kMeco: 0.45, kFair: 0.52, eb: ['kero', 0.011, -0.006, 0.8], es: ['kerovac', 0.007, -0.01, 0.8], tins: [10, 11] },
  lv: { s: 0.22, b: 'lvc', Lb: 0.42, st: 'lvu', Ls: 0.11, fair: 'lvf', payload: 'gsat', nPay: 1, straps: { m: 'lvb', n: 2, r: 0.054, k: 0.4, e: ['solid', 0.022, -0.02, 1.1] }, kMeco: 0.6, kFair: 0.65, eb: ['kero', 0.024, -0.014, 0.9], es: ['hydrovac', 0.015, -0.025, 1], tins: [12, 13] },
  ps: { s: 0.25, b: 'psc', Lb: 0.31, st: 'psu', Ls: 0.126, fair: 'psf', payload: 'sky', nPay: 1, straps: { m: 'psb', n: 6, r: 0.025, k: 0.22, e: ['solid', 0.007, -0.006, 0.8] }, kMeco: 0.45, kFair: 0.55, eb: ['solid', 0.014, -0.014, 1], es: ['kerovac', 0.009, -0.012, 0.9], tins: [11, 12] },
  h3: { s: 0.22, b: 'h3c', Lb: 0.44, st: 'h3u', Ls: 0.11, fair: 'h3f', payload: 'gsat', nPay: 1, straps: { m: 'h3b', n: 2, r: 0.038, k: 0.25, e: ['solid', 0.01, -0.009, 1] }, kMeco: 0.55, kFair: 0.6, eb: ['hydro', 0.022, -0.013, 1], es: ['hydrovac', 0.014, -0.023, 1], tins: [12, 13] },
  nu: { s: 0.22, b: 'nuc', Lb: 0.315, st: 'nuu', Ls: 0.126, fair: 'nuf', payload: 'sky', nPay: 1, kMeco: 0.5, kFair: 0.56, eb: ['kero', 0.018, -0.01, 0.9], es: ['kerovac', 0.011, -0.018, 0.9], tins: [11, 12] },
  an: { s: 0.22, b: 'anc', Lb: 0.435, st: 'anu', Ls: 0.126, fair: 'anf', payload: 'gsat', nPay: 1, straps: { m: 'anb', n: 4, r: 0.038, k: 0.4, e: ['kero', 0.016, -0.016, 0.9] }, kMeco: 0.6, kFair: 0.64, eb: ['kero', 0.016, -0.016, 0.9], es: ['kerovac', 0.011, -0.016, 0.9], tins: [12, 13] },
  c2: { s: 0.22, b: 'c2c', Lb: 0.395, st: 'c2u', Ls: 0.126, fair: 'c2f', payload: 'prg', nPay: 1, straps: { m: 'c2b', n: 4, r: 0.036, k: 0.35, e: ['kero', 0.013, -0.012, 0.9] }, kMeco: 0.55, kFair: 0.4, eb: ['kero', 0.018, -0.01, 0.9], es: ['kerovac', 0.012, -0.018, 0.9], tins: [11, 12] },
};
