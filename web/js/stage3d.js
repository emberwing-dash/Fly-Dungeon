// The 3D stage behind the menu, the fly chooser and the brain screen: a toon-shaded dungeon diorama with an interactive fly.
import * as THREE from '../vendor/three.module.min.js';
import { buildFly, lam, sph, cyl, box, addOutlines } from './flymodel.js';

const mkGlow = () => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); };

export class Stage3D {
  constructor(canvas, { brickTex = null } = {}) {
    this.canvas = canvas; this.mode = 'menu'; this.t = 0; this.pointer = { x: 0, y: 0 }; this.roll = 0; this.pops = []; this.glowTex = mkGlow();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0x1b1030, 14, 34);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80); this.camera.position.set(0, 1.7, 11); this.camera.lookAt(0, 1.1, 0);
    this.scene.add(new THREE.HemisphereLight(0xcdd6ff, 0x4a3470, 1.25));
    const key = new THREE.DirectionalLight(0xfff0d6, 1.6); key.position.set(4, 8, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd8ff, 0.8); rim.position.set(-6, 3, -4); this.scene.add(rim);
    this.menuGroup = new THREE.Group(); this.setupGroup = new THREE.Group(); this.brainGroup = new THREE.Group(); this.scene.add(this.menuGroup, this.setupGroup, this.brainGroup);
    this.buildMenu(brickTex); this.buildSetup(); this.fly = null; this.setFly('fruit');
    this.setMode('menu'); this.resize(); addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => { this.pointer.x = (e.clientX / innerWidth) * 2 - 1; this.pointer.y = -((e.clientY / innerHeight) * 2 - 1); });
  }
  resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.narrow = w / h < 1.15; }

  // ---------------------------------------------------------------- menu diorama
  buildMenu(brickTex) {
    const g = this.menuGroup;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.6, 0.5, 8), lam(0x3b2c5c)); floor.position.y = -0.3; g.add(floor);
    const tiles = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.06, 8), lam(0x4a3a72)); tiles.position.y = -0.04; g.add(tiles);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.9, 0.07, 6, 48), lam(0x2fd0c0, 0x14786e)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.02; g.add(ring);
    const brick = brickTex ? lam(0xffffff, 0x3a2450, { map: brickTex }) : lam(0x8a6a78);
    this.torches = [];
    for (const [x, z] of [[-1.2, -2.6], [5.6, -2.4], [3.4, -5.6], [-0.4, -6.2]]) {
      const p = new THREE.Mesh(box, brick); p.scale.set(1.15, 3.6 + (x > 0 ? 0.6 : 0), 1.15); p.position.set(x, 1.6, z); g.add(p);
      const cap = new THREE.Mesh(box, lam(0x2e2348)); cap.scale.set(1.35, 0.22, 1.35); cap.position.set(x, p.position.y + p.scale.y / 2 + 0.1, z); g.add(cap);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 5), lam(0xffa43a, 0xff7a1a)); fl.position.set(x + (x < 0 ? 0.75 : -0.75), 2.3, z + 0.1); fl.userData.noOutline = true; g.add(fl);
      const light = new THREE.PointLight(0xffa24a, 6, 9, 1.6); light.position.copy(fl.position); g.add(light); this.torches.push({ fl, light, ph: Math.random() * 6 });
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffa24a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(2.2, 2.2, 1); gl.position.copy(fl.position); g.add(gl);
    }
    // glowing exit arch behind the hero
    const arch = new THREE.Group(); arch.position.set(2.6, 0, -4.4);
    for (const s of [-1, 1]) { const q = new THREE.Mesh(box, lam(0x6d6a96)); q.scale.set(0.5, 3.6, 0.5); q.position.set(1.7 * s, 1.8, 0); arch.add(q); }
    const lin = new THREE.Mesh(box, lam(0x6d6a96)); lin.scale.set(4.2, 0.55, 0.55); lin.position.y = 3.7; arch.add(lin);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 3.4), new THREE.MeshBasicMaterial({ color: 0x66ffc8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); portal.position.y = 1.8; portal.userData.noOutline = true; arch.add(portal); this.portal = portal;
    const pl = new THREE.PointLight(0x66ffc8, 8, 12, 1.5); pl.position.set(0, 2, 1); arch.add(pl); this.portalLight = pl; g.add(addOutlines(arch, 1.06));
    // embers
    const N = 160; const geo = new THREE.BufferGeometry(); this.emberPos = new Float32Array(N * 3); this.emberV = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.emberPos[i * 3] = (Math.random() - 0.5) * 14; this.emberPos[i * 3 + 1] = Math.random() * 6; this.emberPos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 1; this.emberV[i] = 0.2 + Math.random() * 0.5; }
    geo.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    this.embers = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc27a, size: 0.09, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); this.embers.frustumCulled = false; g.add(this.embers);
    // hero fly
    this.hero = buildFly('fruit', this.glowTex); this.hero.g.scale.setScalar(2.5); this.hero.g.position.set(2.4, 1.4, 1.5); g.add(this.hero.g); this.hero.glow.material.opacity = 0.35;
    this.hero.setStats({ speed: 5, stamina: 4, senses: 5, reflex: 5 });
  }

  // ---------------------------------------------------------------- fly chooser (turntable)
  buildSetup() {
    const g = this.setupGroup;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.3, 24), lam(0x8fbfcc)); disc.position.y = -0.2; g.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.09, 6, 40), lam(0x3fc3d6, 0x1a6a78)); rim.rotation.x = Math.PI / 2; rim.position.y = -0.04; g.add(rim);
    this.turn = disc; this.setupRoot = new THREE.Group(); g.add(this.setupRoot);
    
  }
  /** show a fly of this type (with its stats) on the turntable and in the menu's hero slot */
  setFly(type, stats = null, pop = true) {
    if (this.fly && this.flyType === type) { if (stats) { this.fly.setStats(stats); this.pops.push({ t: 0, dur: 0.35, amp: 0.07 }); } return; }
    if (this.fly) this.setupRoot.remove(this.fly.g);
    this.flyType = type; this.fly = buildFly(type, this.glowTex); this.fly.g.scale.setScalar(this.fly.baseScale * 2.3); this.fly.g.position.y = 1.0; if (stats) this.fly.setStats(stats); this.setupRoot.add(this.fly.g);
    if (pop) { this.pops.push({ t: 0, dur: 0.6, amp: 0.35, spin: true }); this.burst(this.setupRoot, 0, 1.4, 0, 0xffd45e); }
  }
  burst(parent, x, y, z, color) { const n = 14; for (let i = 0; i < n; i++) { const m = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color, transparent: true })); m.scale.setScalar(0.1 + Math.random() * 0.1); m.position.set(x, y, z); const a = (i / n) * 6.28; m.userData = { vx: Math.cos(a) * (1.5 + Math.random()), vy: 1 + Math.random() * 2, vz: Math.sin(a) * (1.5 + Math.random()), life: 0.8 }; parent.add(m); (this.bits || (this.bits = [])).push({ m, parent }); } }

  // ---------------------------------------------------------------- brain screen (real neuron cloud)
  setBrain(ids) {
    if (this.cloud) { this.brainGroup.remove(this.cloud); this.cloud.geometry.dispose(); }
    const n = ids.n; const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const xyz = ids.xyz; let cx = 0, cy = 0, cz = 0, c = 0; for (let i = 0; i < n; i++) { if (xyz[i][0] != null) { cx += xyz[i][0]; cy += xyz[i][1]; cz += xyz[i][2]; c++; } } cx /= c; cy /= c; cz /= c;
    const dist = []; for (let i = 0; i < n; i++) { const p = xyz[i]; if (p[0] == null) continue; dist.push(Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz)); } dist.sort((a, b) => a - b); const m = dist[Math.floor(dist.length * 0.94)] || 1; const k = 2.45 / m; this.cloudBase = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const p = xyz[i]; let x = p[0] == null ? (Math.random() - 0.5) * 3.6 : (p[0] - cx) * k, y = p[0] == null ? (Math.random() - 0.5) * 3.2 : -(p[1] - cy) * k, z = p[0] == null ? (Math.random() - 0.5) * 3 : (p[2] - cz) * k; const r = Math.hypot(x, y, z); if (r > 3.3) { x *= 3.3 / r; y *= 3.3 / r; z *= 3.3 / r; } pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.cloudCol = col; this.cloudN = n; this.cloudKind = ids.kind;
    this.cloud = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.075, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true })); this.cloud.frustumCulled = false; this.brainGroup.add(this.cloud);
    this.cloudInit();
  }
  cloudInit() { const base = [0x6c7fb8, 0x4f8f9a, 0x8a6fb0, 0x9b7a5a]; const c = new THREE.Color(); for (let i = 0; i < this.cloudN; i++) { c.setHex(base[this.cloudKind[i] % base.length]); this.cloudCol[i * 3] = c.r * 0.55; this.cloudCol[i * 3 + 1] = c.g * 0.55; this.cloudCol[i * 3 + 2] = c.b * 0.55; } if (this.cloud) this.cloud.geometry.attributes.color.needsUpdate = true; }
  /** activity: Float32Array per neuron (0..1) */
  setActivity(act) { if (!this.cloud) return; const base = [0x6c7fb8, 0x4f8f9a, 0x8a6fb0, 0x9b7a5a]; const c = new THREE.Color(), hot = new THREE.Color(0xffd45e); for (let i = 0; i < this.cloudN; i++) { c.setHex(base[this.cloudKind[i] % base.length]).multiplyScalar(0.55); const a = act ? Math.min(1, act[i] * 2.2) : 0; c.lerp(hot, a); this.cloudCol[i * 3] = c.r; this.cloudCol[i * 3 + 1] = c.g; this.cloudCol[i * 3 + 2] = c.b; } this.cloud.geometry.attributes.color.needsUpdate = true; }

  setMode(mode) {
    this.mode = mode; this.menuGroup.visible = mode === 'menu'; this.setupGroup.visible = mode === 'setup'; this.brainGroup.visible = mode === 'brain';
    this.scene.fog.near = mode === 'brain' ? 40 : 14; this.scene.fog.far = mode === 'brain' ? 80 : 34;
    if (mode === 'brain') { this.camera.position.set(0, 0, 11.5); this.camera.lookAt(0, 0, 0); } else { this.camera.position.set(0, 1.7, 11); this.camera.lookAt(0, 1.1, 0); }
  }
  pulse() { if (this.mode === 'menu') { this.roll = 0.0001; this.burst(this.menuGroup, this.hero.g.position.x, this.hero.g.position.y, this.hero.g.position.z, 0xffd45e); } }

  tick(dt) {
    this.t += dt; const t = this.t, P = this.pointer;
    if (this.mode === 'menu') {
      const h = this.hero.g; const shift = this.narrow ? 0 : 2.4; const tx = shift + P.x * 2.2, ty = 1.4 + P.y * 1.1 + Math.sin(t * 2) * 0.12;
      h.position.x += (tx - h.position.x) * Math.min(1, dt * 3); h.position.y += (ty - h.position.y) * Math.min(1, dt * 3); h.position.z = 1 + Math.sin(t * 0.9) * 0.3;
      h.rotation.y += ((-0.75 + P.x * 0.6 + Math.sin(t * 0.7) * 0.1) - h.rotation.y) * Math.min(1, dt * 5); h.rotation.x += ((0.4 - P.y * 0.3) - h.rotation.x) * Math.min(1, dt * 5);
      if (this.roll > 0) { this.roll += dt * 8; h.rotation.z = this.roll; if (this.roll > 6.283) { this.roll = 0; h.rotation.z = 0; } } else h.rotation.z += ((-(tx - h.position.x) * 0.25) - h.rotation.z) * Math.min(1, dt * 6);
      for (const w of this.hero.wings) w.p.rotation.z = w.s * (0.2 + Math.sin(t * 62) * 0.7);
      for (const q of this.torches) { const f = 1 + Math.sin(t * 9 + q.ph) * 0.12 + Math.sin(t * 17 + q.ph) * 0.06; q.fl.scale.set(f, 0.9 + (f - 1) * 3, f); q.light.intensity = 6 * f; }
      this.portal.material.opacity = 0.42 + 0.12 * Math.sin(t * 2.2); this.portalLight.intensity = 7.5 + Math.sin(t * 2.2) * 1.5;
      const pe = this.emberPos; for (let i = 0; i < pe.length / 3; i++) { pe[i * 3 + 1] += this.emberV[i] * dt; pe[i * 3] += Math.sin(t + i) * 0.003; if (pe[i * 3 + 1] > 7) pe[i * 3 + 1] = 0; } this.embers.geometry.attributes.position.needsUpdate = true;
    } else if (this.mode === 'setup' && this.fly) {
      const f = this.fly; const base = f.baseScale * 2.3; let k = 1;
      for (let i = this.pops.length - 1; i >= 0; i--) { const q = this.pops[i]; q.t += dt; const u = Math.min(1, q.t / q.dur); k *= 1 + Math.sin(u * Math.PI) * q.amp * (q.spin ? 1 - u : 1); if (q.spin) f.g.rotation.y += dt * 14 * (1 - u); if (u >= 1) this.pops.splice(i, 1); }
      f.g.scale.setScalar(base * k); f.g.position.y = 1.0 + Math.sin(t * 2.2) * 0.12; f.g.rotation.y += dt * 0.55; f.g.rotation.x = Math.sin(t * 1.3) * 0.06 + 0.1;
      for (const w of f.wings) w.p.rotation.z = w.s * (0.2 + Math.sin(t * f.flapSpeed) * f.flapAmp); this.turn.rotation.y += dt * 0.3;
      this.setupGroup.position.x = this.narrow ? 0 : -2.7; this.setupRoot.position.set(0, 0, 0);
    } else if (this.mode === 'brain' && this.cloud) {
      this.cloud.rotation.y += dt * 0.12 + P.x * dt * 0.1; this.cloud.rotation.x = Math.sin(t * 0.2) * 0.08 + P.y * 0.15; this.brainGroup.position.x = this.narrow ? 0 : 0.2;
    }
    if (this.bits) for (let i = this.bits.length - 1; i >= 0; i--) { const b = this.bits[i], u = b.m.userData; u.life -= dt; u.vy -= 6 * dt; b.m.position.x += u.vx * dt; b.m.position.y += u.vy * dt; b.m.position.z += u.vz * dt; b.m.material.opacity = Math.max(0, u.life); if (u.life <= 0) { b.parent.remove(b.m); b.m.material.dispose(); this.bits.splice(i, 1); } }
    this.renderer.render(this.scene, this.camera);
  }
}
