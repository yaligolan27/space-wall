// <space-emblem speed="60"> — the directorate emblem in real 3D.
// Proportions are taken from the logo and expressed in globe radii (R): orbit rings 1.4R (±30°, tilted 76°) with a 3px stroke,
// spire 2.4R tall / 1.74R wide with fin tips level with the spire's base, four satellites (two per ring) that shrink as they
// travel behind the planet and carry a soft blue glow, and the wordmark 1.28R below the globe centre (rendered in CSS by the page).
// One key light (upper-left, slightly in front) lights the Earth, the spire, the rings and the satellites, and casts the
// spire's shadow onto the planet; a matching studio environment supplies the satin reflections.
import * as THREE from '../vendor/three.module.js';

const TEX_BASE = new URL('../assets/earth/', import.meta.url);
const d2r = THREE.MathUtils.degToRad;

class SpaceEmblem extends HTMLElement {
  static get observedAttributes() { return ['speed']; }
  connectedCallback() { if (this._started) return; this._started = true; this.style.display = 'block'; this._init(); }
  disconnectedCallback() { this._alive = false; }
  attributeChangedCallback() { this._speed = Number(this.getAttribute('speed')) || 60; }

  _init() {
    this._speed = Number(this.getAttribute('speed')) || 60;
    const w = this.clientWidth || 620, h = this.clientHeight || 620;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { console.warn('space-emblem: WebGL unavailable', e); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(16, w / h, 0.1, 100);
    camera.position.set(0, 0, 17.8);
    const R = 1.5;                                  // globe radius ≈ 186px in a 620px box
    const SUN = new THREE.Vector3(-5.5, 4.6, 6.4);  // the single key light: upper-left, slightly in front

    // ---- environment: a dark studio with one bright panel where the key light is, so reflections agree with the shading
    const envScene = new THREE.Scene();
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const g = cv.getContext('2d'); const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#5d6f95'); grad.addColorStop(.45, '#2b3a63'); grad.addColorStop(.55, '#141d3d'); grad.addColorStop(1, '#03060f');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 256);
    const envTex = new THREE.CanvasTexture(cv); envTex.colorSpace = THREE.SRGBColorSpace;
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 32), new THREE.MeshBasicMaterial({ map: envTex, side: THREE.BackSide })));
    const softbox = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), new THREE.MeshBasicMaterial({ color: 0xfff3e2 }));
    softbox.position.copy(SUN).normalize().multiplyScalar(36); softbox.lookAt(0, 0, 0); envScene.add(softbox);
    const bounce = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), new THREE.MeshBasicMaterial({ color: 0x1d2a52 }));
    bounce.position.copy(SUN).normalize().multiplyScalar(-34); bounce.lookAt(0, 0, 0); envScene.add(bounce);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture; pmrem.dispose();

    // ---- Earth (NASA Blue Marble, night lights, bump + water specular), tilted 23.4°
    const loader = new THREE.TextureLoader();
    const tex = (name, srgb) => { const t = loader.load(new URL(name, TEX_BASE).href); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const tilt = new THREE.Group(); tilt.rotation.z = d2r(-23.4); scene.add(tilt);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 128), new THREE.MeshPhongMaterial({
      map: tex('earth-blue-marble.jpg', true), bumpMap: tex('earth-topology.png'), bumpScale: 0.03,
      specularMap: tex('earth-water.png'), specular: new THREE.Color(0x4a6f99), shininess: 24,
      emissiveMap: tex('earth-night.jpg', true), emissive: new THREE.Color(0xffe0b0), emissiveIntensity: 0.26,
    }));
    earth.receiveShadow = true; tilt.add(earth);
    const fresnelVert = 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }';
    tilt.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.002, 96, 96), new THREE.ShaderMaterial({
      vertexShader: fresnelVert,
      fragmentShader: 'varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.0 - max(dot(vN, normalize(-vP)), 0.0), 4.0); gl_FragColor = vec4(0.55, 0.75, 0.95, 1.0) * f * 0.7; }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })));
    // outer atmosphere, brighter toward the key light
    const sunDir = SUN.clone().normalize();
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.15, 96, 96), new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 sunDir; varying vec3 vN; void main(){ float i = pow(0.62 - dot(vN, vec3(0.0,0.0,1.0)), 3.5); float s = 0.55 + 0.45 * max(dot(-vN, sunDir), 0.0); gl_FragColor = vec4(0.45, 0.68, 0.95, 1.0) * i * 0.9 * s; }',
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })));

    // ---- materials: satin premium finish in the directorate's navy and light blue
    const navyMat = new THREE.MeshPhysicalMaterial({ color: 0x1c2468, metalness: .5, roughness: .38, clearcoat: .6, clearcoatRoughness: .3, envMapIntensity: 1.1, side: THREE.DoubleSide });
    const lightMat = new THREE.MeshPhysicalMaterial({ color: 0x8dbfe8, metalness: .2, roughness: .4, clearcoat: .6, clearcoatRoughness: .3, envMapIntensity: .9, side: THREE.DoubleSide });
    const ringMat = new THREE.MeshPhysicalMaterial({ color: 0x3b4aa6, metalness: .55, roughness: .34, clearcoat: .8, clearcoatRoughness: .2, emissive: 0x1f2a6e, emissiveIntensity: .35, envMapIntensity: 1.3 });
    const satMat = new THREE.MeshPhysicalMaterial({ color: 0x2a3688, metalness: .5, roughness: .32, clearcoat: .8, clearcoatRoughness: .2, emissive: 0x4f6fd0, emissiveIntensity: .45, envMapIntensity: 1.3 });

    // ---- orbit rings: radius 1.4R, 3px stroke, centred just above the globe centre, two satellites each (opposite sides)
    const ringR = 1.4 * R, tube = 0.0095 * R;
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(190,215,245,.95)'); gr.addColorStop(.25, 'rgba(156,196,228,.55)'); gr.addColorStop(.6, 'rgba(120,165,225,.14)'); gr.addColorStop(1, 'rgba(120,165,225,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const SAT_R = 0.06 * R;                           // 0.11R diameter at the front of the orbit, 0.03R at the back
    const sats = [];
    const mkRing = (zdeg, phases) => {
      const grp = new THREE.Group(); grp.rotation.order = 'ZXY'; grp.rotation.z = d2r(zdeg); grp.rotation.x = d2r(76); grp.position.y = 0.06 * R;
      grp.add(new THREE.Mesh(new THREE.TorusGeometry(ringR, tube, 12, 256), ringMat));
      const pivots = phases.map(p => {
        const pv = new THREE.Group(); pv.rotation.z = d2r(p);
        const s = new THREE.Mesh(new THREE.SphereGeometry(SAT_R, 32, 32), satMat); s.position.x = ringR; s.castShadow = true;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9cc4e4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .85 }));
        glow.position.x = ringR; pv.add(s, glow); grp.add(pv); sats.push({ s, glow }); return pv;
      });
      scene.add(grp); return pivots;
    };
    const pivA = mkRing(-30, [180, 0]);   // upper-left → lower-right
    const pivB = mkRing(30, [180, 0]);    // lower-left → upper-right

    // ---- spire: logo silhouette in R units (tip 1.27R above centre, base 1.13R below, widest ±0.28R at −0.57R, fin tips ±0.87R)
    // A slim diamond cross-section gives two lit facets per side; the left half and right fin are navy, the right half and left fin light blue.
    const P = (x, y, z) => [x * R, y * R, z * R];
    const tri = (mat, a, b, c) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m;
    };
    const A = P(0, 1.27, 0), B = P(0, -1.13, 0), Lp = P(-0.28, -0.57, 0), Rp = P(0.28, -0.57, 0), F = P(0, -0.57, 0.10), K = P(0, -0.57, -0.06);
    const rocket = new THREE.Group();
    rocket.add(tri(navyMat, A, Lp, F), tri(navyMat, Lp, B, F), tri(lightMat, A, F, Rp), tri(lightMat, F, B, Rp));
    rocket.add(tri(navyMat, A, K, Lp), tri(navyMat, Lp, K, B), tri(lightMat, A, Rp, K), tri(lightMat, Rp, B, K));
    const fin = (mat, pts) => {
      const sh = new THREE.Shape(); sh.moveTo(pts[0][0] * R, pts[0][1] * R); sh.lineTo(pts[1][0] * R, pts[1][1] * R); sh.lineTo(pts[2][0] * R, pts[2][1] * R); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.05 * R, bevelEnabled: true, bevelThickness: 0.008 * R, bevelSize: 0.008 * R, bevelSegments: 2 });
      geo.translate(0, 0, -0.025 * R); const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m;
    };
    rocket.add(fin(lightMat, [[-0.28, -0.57], [-0.87, -1.13], [0, -1.13]]));
    rocket.add(fin(navyMat, [[0.28, -0.57], [0.87, -1.13], [0, -1.13]]));
    rocket.position.z = 2.3;
    const rocketScale = (camera.position.z - rocket.position.z) / camera.position.z; // keep logo proportions despite perspective
    rocket.scale.setScalar(rocketScale);
    scene.add(rocket);

    // ---- lights: the one key light (casts the spire's shadow on the planet) + a whisper of ambient so shadows are not pure black
    const sun = new THREE.DirectionalLight(0xfff3e0, 3.4); sun.position.copy(SUN); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -3.2; sun.shadow.camera.right = sun.shadow.camera.top = 3.2;
    sun.shadow.radius = 5; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x7f9fd0, 0.18));

    // ---- animation
    this._alive = true;
    let last = performance.now(), t = 0;
    const wp = new THREE.Vector3();
    const loop = (now) => {
      if (!this._alive) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
      earth.rotation.y += (2 * Math.PI / this._speed) * dt;
      pivA.forEach(p => p.rotation.z += (2 * Math.PI / 52) * dt);
      pivB.forEach(p => p.rotation.z -= (2 * Math.PI / 68) * dt);
      for (const { s, glow } of sats) {          // perspective cue: satellites shrink as they go behind the planet
        s.getWorldPosition(wp);
        const k = 0.3 + 0.7 * ((wp.z / ringR) + 1) / 2;
        s.scale.setScalar(k); glow.scale.setScalar(SAT_R * 2 * 3.8 * k);
      }
      rocket.position.y = 0.05 * Math.sin(t * 0.9);                       // breathing: hover + subtle scale, silhouette preserved
      rocket.rotation.y = 0.02 * Math.sin(t * 0.45);
      rocket.scale.setScalar(rocketScale * (1 + 0.012 * Math.sin(t * 0.9)));
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    new ResizeObserver(() => {
      const nw = this.clientWidth, nh = this.clientHeight; if (!nw || !nh) return;
      renderer.setSize(nw, nh); camera.aspect = nw / nh; camera.updateProjectionMatrix();
    }).observe(this);
  }
}
if (!customElements.get('space-emblem')) customElements.define('space-emblem', SpaceEmblem);
