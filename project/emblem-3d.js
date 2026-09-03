// <space-emblem speed="60"> — the directorate emblem in real 3D: NASA Blue Marble Earth, two thin orbit rings (1.4R, ±30°, 76° tilt),
// three glossy satellites, and the faceted rocket (navy / light-blue) casting a soft shadow on the planet. Geometry is scaled from the logo (globe radius R).
(() => {
  const TEX = 'https://unpkg.com/three-globe/example/img/';
  class SpaceEmblem extends HTMLElement {
    static get observedAttributes() { return ['speed']; }
    connectedCallback() { if (this._started) return; this._started = true; this.style.display = 'block'; this._init(); }
    disconnectedCallback() { this._alive = false; }
    attributeChangedCallback() { this._speed = Number(this.getAttribute('speed')) || 60; }
    async _init() {
      this._speed = Number(this.getAttribute('speed')) || 60;
      const THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
      const w = this.clientWidth || 620, h = this.clientHeight || 620;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
      this.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(16, w / h, 0.1, 100);
      camera.position.set(0, 0, 17.8);
      const R = 1.5, d2r = THREE.MathUtils.degToRad;

      // studio environment for glossy reflections
      const envScene = new THREE.Scene();
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
      const g = cv.getContext('2d'); const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#dbe7f5'); grad.addColorStop(.42, '#7d93b8'); grad.addColorStop(.5, '#1b2650'); grad.addColorStop(1, '#04071a');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 256);
      const envTex = new THREE.CanvasTexture(cv); envTex.colorSpace = THREE.SRGBColorSpace;
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 32), new THREE.MeshBasicMaterial({ map: envTex, side: THREE.BackSide })));
      const softbox = new THREE.Mesh(new THREE.PlaneGeometry(28, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      softbox.position.set(-24, 22, 26); softbox.lookAt(0, 0, 0); envScene.add(softbox);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(40, 4), new THREE.MeshBasicMaterial({ color: 0x9cc4e4 }));
      strip.position.set(28, -6, 20); strip.lookAt(0, 0, 0); envScene.add(strip);
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(envScene, 0.04).texture; pmrem.dispose();

      // Earth
      const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
      const map = loader.load(TEX + 'earth-blue-marble.jpg'); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
      const night = loader.load(TEX + 'earth-night.jpg'); night.colorSpace = THREE.SRGBColorSpace;
      const bump = loader.load(TEX + 'earth-topology.png');
      const water = loader.load(TEX + 'earth-water.png');
      const tilt = new THREE.Group(); tilt.rotation.z = d2r(-23.4); scene.add(tilt);
      const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 128), new THREE.MeshPhongMaterial({
        map, bumpMap: bump, bumpScale: 0.03, specularMap: water, specular: new THREE.Color(0x4a6f99), shininess: 22,
        emissiveMap: night, emissive: new THREE.Color(0xffe0b0), emissiveIntensity: 0.28
      }));
      earth.receiveShadow = true; tilt.add(earth);
      const fresnelVert = 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }';
      tilt.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.002, 96, 96), new THREE.ShaderMaterial({
        vertexShader: fresnelVert,
        fragmentShader: 'varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.0 - max(dot(vN, normalize(-vP)), 0.0), 4.0); gl_FragColor = vec4(0.55, 0.75, 0.95, 1.0) * f * 0.7; }',
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      })));
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.15, 96, 96), new THREE.ShaderMaterial({
        vertexShader: fresnelVert,
        fragmentShader: 'varying vec3 vN; void main(){ float i = pow(0.62 - dot(vN, vec3(0.0,0.0,1.0)), 3.5); gl_FragColor = vec4(0.45, 0.68, 0.95, 1.0) * i * 0.9; }',
        side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      })));

      // materials — the directorate's navy and light blue as lacquered, clear-coated metal
      const navyMat = new THREE.MeshPhysicalMaterial({ color: 0x1c2260, metalness: .45, roughness: .22, clearcoat: 1, clearcoatRoughness: .1, envMapIntensity: 1.4 });
      const lightMat = new THREE.MeshPhysicalMaterial({ color: 0x9cc4e4, metalness: .35, roughness: .25, clearcoat: 1, clearcoatRoughness: .1, envMapIntensity: 1.2 });
      const ringMat = new THREE.MeshPhysicalMaterial({ color: 0x2a3480, metalness: .7, roughness: .2, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.6 });
      const satMat = new THREE.MeshPhysicalMaterial({ color: 0x1f2870, metalness: .55, roughness: .18, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.8 });

      // orbit rings: radius 1.4R, stroke 0.019R (as in the logo), centred 0.11R above the globe centre
      const ringR = 1.4 * R, tube = 0.0095 * R;
      const mkRing = (zdeg, phases) => {
        const grp = new THREE.Group(); grp.rotation.order = 'ZXY'; grp.rotation.z = d2r(zdeg); grp.rotation.x = d2r(76); grp.position.y = 0.11 * R;
        grp.add(new THREE.Mesh(new THREE.TorusGeometry(ringR, tube, 14, 240), ringMat));
        const pivots = phases.map(p => {
          const pv = new THREE.Group(); pv.rotation.z = d2r(p);
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.045 * R, 32, 32), satMat); s.position.x = ringR; s.castShadow = true; pv.add(s); grp.add(pv); return pv;
        });
        scene.add(grp); return pivots;
      };
      const piv1 = mkRing(-30, [180]);
      const piv2 = mkRing(30, [180, 20]);

      // rocket — logo silhouette in R units; spire is a shallow four-sided pyramid (navy left / light right), fins are thin bevelled plates
      const P = (x, y, z) => [x * R, y * R, z * R];
      const tri = (mat, a, b, c) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };
      const A = P(0, 1.19, 0), B = P(0, -1.094, 0), Lp = P(-0.28, -0.547, 0), Rp = P(0.28, -0.547, 0), F = P(0, -0.547, 0.2), K = P(0, -0.547, -0.12);
      const rocket = new THREE.Group();
      rocket.add(tri(navyMat, A, Lp, F), tri(navyMat, Lp, B, F), tri(lightMat, A, F, Rp), tri(lightMat, F, B, Rp));
      rocket.add(tri(navyMat, A, K, Lp), tri(navyMat, Lp, K, B), tri(lightMat, A, Rp, K), tri(lightMat, Rp, B, K));
      const fin = (mat, pts) => {
        const sh = new THREE.Shape(); sh.moveTo(pts[0][0] * R, pts[0][1] * R); sh.lineTo(pts[1][0] * R, pts[1][1] * R); sh.lineTo(pts[2][0] * R, pts[2][1] * R); sh.closePath();
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.06 * R, bevelEnabled: true, bevelThickness: 0.012 * R, bevelSize: 0.012 * R, bevelSegments: 3 });
        geo.translate(0, 0, -0.03 * R); const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m;
      };
      rocket.add(fin(lightMat, [[-0.28, -0.547], [-0.84, -1.068], [0, -1.094]]));
      rocket.add(fin(navyMat, [[0.28, -0.547], [0.84, -1.068], [0, -1.094]]));
      rocket.position.z = 2.3;
      const rocketScale = (camera.position.z - rocket.position.z) / camera.position.z; // keep logo proportions despite perspective
      rocket.scale.setScalar(rocketScale);
      scene.add(rocket);

      // lights — one key from upper-left, casting the rocket's shadow onto the planet
      const sun = new THREE.DirectionalLight(0xfff4e6, 3.0); sun.position.set(-5, 4, 8); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
      sun.shadow.camera.left = sun.shadow.camera.bottom = -3.2; sun.shadow.camera.right = sun.shadow.camera.top = 3.2; sun.shadow.radius = 6; sun.shadow.bias = -0.0005;
      scene.add(sun);
      scene.add(new THREE.AmbientLight(0x8fb0d8, 0.3));
      const rim = new THREE.DirectionalLight(0x9cc4e4, 0.9); rim.position.set(5, -1, -2); scene.add(rim);

      this._alive = true;
      let last = performance.now(), t = 0;
      const loop = (now) => {
        if (!this._alive) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
        earth.rotation.y += (2 * Math.PI / this._speed) * dt;
        piv1.forEach(p => p.rotation.z += (2 * Math.PI / 52) * dt);
        piv2.forEach(p => p.rotation.z -= (2 * Math.PI / 68) * dt);
        rocket.position.y = 0.05 * Math.sin(t * 0.9);
        rocket.rotation.y = 0.07 * Math.sin(t * 0.45);
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
})();
