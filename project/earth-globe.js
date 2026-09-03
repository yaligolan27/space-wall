// <earth-globe speed="60"> — realistic rotating Earth (three.js, NASA Blue Marble textures), transparent bg.
(() => {
  const TEX = 'https://unpkg.com/three-globe/example/img/';
  class EarthGlobe extends HTMLElement {
    static get observedAttributes() { return ['speed']; }
    connectedCallback() { if (this._started) return; this._started = true; this.style.display = 'block'; this._init(); }
    disconnectedCallback() { this._alive = false; }
    attributeChangedCallback() { this._speed = Number(this.getAttribute('speed')) || 60; }
    async _init() {
      this._speed = Number(this.getAttribute('speed')) || 60;
      const THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
      const w = this.clientWidth || 480, h = this.clientHeight || 480;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
      this.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 100);
      camera.position.set(0, 0, 8.3);
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      const map = loader.load(TEX + 'earth-blue-marble.jpg'); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
      const night = loader.load(TEX + 'earth-night.jpg'); night.colorSpace = THREE.SRGBColorSpace;
      const bump = loader.load(TEX + 'earth-topology.png');
      const water = loader.load(TEX + 'earth-water.png');
      const tilt = new THREE.Group();
      tilt.rotation.z = -23.4 * Math.PI / 180;
      scene.add(tilt);
      const earth = new THREE.Mesh(new THREE.SphereGeometry(1.5, 128, 128), new THREE.MeshPhongMaterial({
        map, bumpMap: bump, bumpScale: 0.03, specularMap: water, specular: new THREE.Color(0x4a6f99), shininess: 22,
        emissiveMap: night, emissive: new THREE.Color(0xffe0b0), emissiveIntensity: 0.28
      }));
      tilt.add(earth);
      const fresnelVert = 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }';
      const rim = new THREE.Mesh(new THREE.SphereGeometry(1.503, 96, 96), new THREE.ShaderMaterial({
        vertexShader: fresnelVert,
        fragmentShader: 'varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.0 - max(dot(vN, normalize(-vP)), 0.0), 4.0); gl_FragColor = vec4(0.55, 0.75, 0.95, 1.0) * f * 0.7; }',
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      tilt.add(rim);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1.72, 96, 96), new THREE.ShaderMaterial({
        vertexShader: fresnelVert,
        fragmentShader: 'varying vec3 vN; void main(){ float i = pow(0.62 - dot(vN, vec3(0.0,0.0,1.0)), 3.5); gl_FragColor = vec4(0.45, 0.68, 0.95, 1.0) * i * 0.9; }',
        side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      scene.add(halo);
      const sun = new THREE.DirectionalLight(0xfff4e6, 3.0); sun.position.set(-6, 4, 3.5); scene.add(sun);
      scene.add(new THREE.AmbientLight(0x8fb0d8, 0.35));
      const fill = new THREE.DirectionalLight(0x5f7cc0, 0.4); fill.position.set(4, -2, -3); scene.add(fill);
      this._alive = true;
      let last = performance.now();
      const loop = (t) => {
        if (!this._alive) return;
        const dt = Math.min(0.1, (t - last) / 1000); last = t;
        earth.rotation.y += (2 * Math.PI / this._speed) * dt;
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
  if (!customElements.get('earth-globe')) customElements.define('earth-globe', EarthGlobe);
})();
