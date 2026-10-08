// Fly Dungeon: Fly Pilot. A small 3D game. You steer; the fly's escape reflex and feeding response are computed by the
// real connectome subgraph (js/sim.js), not by hand-written rules.
import * as THREE from '../vendor/three.module.min.js';
import { Brain, PARAMS, readout } from './sim.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BEST = 'flyfix.pilot.best';

// ---------------------------------------------------------------- brain
let brain, data, loomTypes, tasteTypes, escapeHealthy = 0.78, feedHealthy = 0.23;
const lesion = { loom: false, taste: false };

async function loadBrain() {
  const [cases, bj, bb] = await Promise.all([
    fetch('data/cases.json').then((r) => r.json()), fetch('data/brain.json').then((r) => r.json()), fetch('data/brain.bin').then((r) => r.arrayBuffer())]);
  data = cases; Object.assign(PARAMS, bj.params); brain = new Brain(bj, bb);
  loomTypes = cases.cases.find((c) => c.id === 'loom').stimulus.types;
  tasteTypes = cases.cases.find((c) => c.id === 'taste').stimulus.types;
}
function silenced(which) {
  const s = new Set();
  if (lesion.loom && which === 'loom') for (const t of ['LC4', 'LPLC2']) s.add(brain.typeId(t));
  if (lesion.taste && which === 'taste') s.add(brain.typeId('GNG117'));
  return s;
}
/** looming strength 0..0.5 -> escape-neuron activity 0..1 (real wiring) */
function brainLoom(strength) {
  if (strength < 0.02) return 0;
  const t0 = performance.now();
  brain.run(brain.drive(loomTypes, strength), silenced('loom'));
  const y = readout(brain, data.behaviours, brain.typeActivity()).escape;
  $('#brainMs').textContent = (performance.now() - t0).toFixed(0) + ' ms';
  return y;
}
function brainTaste() {
  brain.run(brain.drive(tasteTypes, 1.0), silenced('taste'));
  return readout(brain, data.behaviours, brain.typeActivity()).feed;
}

// ---------------------------------------------------------------- scene
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3f0);
scene.fog = new THREE.Fog(0x9fd3f0, 40, 120);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a52, 1.05));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.4); sun.position.set(30, 60, 20); scene.add(sun);

// ground: checker lawn
function lawn() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#7fb85a' : '#6fa84c'; g.fillRect(x * 32, y * 32, 32, 32); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: lawn() }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const ARENA = 42;
const rim = new THREE.Mesh(new THREE.TorusGeometry(ARENA, 0.25, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
rim.rotation.x = Math.PI / 2; rim.position.y = 0.2; scene.add(rim);
// decoration: flowers and mushrooms (no collision)
for (let i = 0; i < 90; i++) {
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (ARENA + 20);
  const g = new THREE.Group(); const h = 1 + Math.random() * 2.5;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 5), new THREE.MeshLambertMaterial({ color: 0x3e8a3a })); stem.position.y = h / 2; g.add(stem);
  const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 8, 6), new THREE.MeshLambertMaterial({ color: [0xffffff, 0xffe066, 0xff9bd1, 0xb8a1ff][i % 4] })); bloom.position.y = h; g.add(bloom);
  g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); scene.add(g);
}

// ---------------------------------------------------------------- the fly
const fly = new THREE.Group(); scene.add(fly);
const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5a4636 });
const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), bodyMat); thorax.scale.set(1, 0.9, 1.2); fly.add(thorax);
const abd = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), new THREE.MeshLambertMaterial({ color: 0x3d2f24 })); abd.scale.set(0.9, 0.8, 1.4); abd.position.set(0, -0.03, -0.62); fly.add(abd);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), bodyMat); head.position.set(0, 0.02, 0.5); fly.add(head);
for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd2312b, emissive: 0x400808 })); e.position.set(0.15 * s, 0.07, 0.6); fly.add(e); }
const probos = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.4, 6), new THREE.MeshLambertMaterial({ color: 0xe8c9a0 })); probos.rotation.x = Math.PI / 2; probos.position.set(0, -0.12, 0.8); probos.scale.y = 0.01; fly.add(probos);
const wingMat = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
const wings = [-1, 1].map((s) => { const piv = new THREE.Group(); piv.position.set(0.2 * s, 0.25, 0.05); const w = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), wingMat); w.scale.set(0.45, 1, 1); w.rotation.x = -Math.PI / 2; w.position.set(0.28 * s, 0, -0.45); piv.add(w); fly.add(piv); return { piv, s }; });
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })); blob.rotation.x = -Math.PI / 2; scene.add(blob);
// reflex flash ring
const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xffd45e, transparent: true, opacity: 0, side: THREE.DoubleSide })); scene.add(ring);

// ---------------------------------------------------------------- game state
const S = { run: false, t: 0, lives: 3, berries: 0, saves: 0, heading: 0, vel: new THREE.Vector3(), vy: 0, reflex: 0, reflexDir: new THREE.Vector3(), invuln: 0, spawn: 2, brainT: 0, loom: 0, esc: 0, eatT: 0, feed: 0 };
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (e.code === 'KeyL') toggle('loom'); if (e.code === 'KeyK') toggle('taste'); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
function toggle(w) { if (!brain) return; lesion[w] = !lesion[w]; const b = w === 'loom' ? $('#tL') : $('#tK'); b.setAttribute('aria-pressed', String(lesion[w])); say(lesion[w] ? (w === 'loom' ? 'Shadow detectors offline' : 'Taste relay cut') : 'Brain restored', 1000); }
$('#tL').addEventListener('click', () => toggle('loom')); $('#tK').addEventListener('click', () => toggle('taste'));
let toastT; function say(msg, ms = 900) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }

// berries
const berries = [];
const berryGeo = new THREE.SphereGeometry(0.42, 14, 10);
function spawnBerry() {
  const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * (ARENA - 10);
  const m = new THREE.Mesh(berryGeo, new THREE.MeshLambertMaterial({ color: [0xe0342f, 0xff7a1a, 0xc2185b][berries.length % 3], emissive: 0x401010 }));
  m.position.set(Math.cos(a) * r, 1.2 + Math.random() * 4, Math.sin(a) * r); m.userData.ph = Math.random() * 6; scene.add(m); berries.push(m);
}
// swatters
const swatters = [];
function spawnSwatter() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.5, 28), new THREE.MeshLambertMaterial({ color: 0x2d2f3a, transparent: true, opacity: 0.92 })); g.add(disc);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 8), new THREE.MeshLambertMaterial({ color: 0x1c1d25 })); handle.position.y = 6.2; g.add(handle);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(3.2, 28), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.05; scene.add(sh);
  const px = fly.position.x + (Math.random() - 0.5) * 3, pz = fly.position.z + (Math.random() - 0.5) * 3;
  g.position.set(px, 16 + fly.position.y * 0.5, pz); scene.add(g);
  swatters.push({ g, sh, state: 'down', hold: 0, speed: 9 + Math.min(5, S.t / 20) });
}

function reset() {
  for (const b of berries) scene.remove(b); berries.length = 0;
  for (const s of swatters) { scene.remove(s.g); scene.remove(s.sh); } swatters.length = 0;
  Object.assign(S, { t: 0, lives: 3, berries: 0, saves: 0, heading: 0, reflex: 0, invuln: 0, spawn: 2, brainT: 0, loom: 0, esc: 0, eatT: 0, feed: 0 });
  S.vel.set(0, 0, 0); S.vy = 0; fly.position.set(0, 3, 0);
  for (let i = 0; i < 9; i++) spawnBerry();
}

// ---------------------------------------------------------------- loop
const fwd = new THREE.Vector3();
function update(dt) {
  S.t += dt;
  // steering
  const turn = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  S.heading += turn * 2.4 * dt;
  const thr = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 0.8 : 0);
  fwd.set(Math.sin(S.heading), 0, Math.cos(S.heading));
  S.vel.addScaledVector(fwd, thr * 26 * dt);
  S.vel.multiplyScalar(Math.pow(0.18, dt));
  const climb = (keys.Space ? 1 : 0) - (keys.ShiftLeft || keys.ShiftRight ? 1 : 0);
  S.vy += (climb * 30 - 3) * dt; S.vy *= Math.pow(0.05, dt);
  // reflex burst (from the brain)
  if (S.reflex > 0) { S.reflex -= dt; S.vel.addScaledVector(S.reflexDir, 70 * dt); S.vy += 14 * dt; }
  const sp = Math.hypot(S.vel.x, S.vel.z); if (sp > 14 && S.reflex <= 0) S.vel.multiplyScalar(14 / sp);
  fly.position.x += S.vel.x * dt; fly.position.z += S.vel.z * dt; fly.position.y = clamp(fly.position.y + S.vy * dt, 0.6, 20);
  const rr = Math.hypot(fly.position.x, fly.position.z); if (rr > ARENA) { const k = ARENA / rr; fly.position.x *= k; fly.position.z *= k; S.vel.multiplyScalar(0.5); }
  fly.rotation.set(-S.vy * 0.03 - thr * 0.15, S.heading, -turn * 0.45 + S.reflexDir.x * 0, 'YXZ');
  const flap = performance.now() * 0.09;
  for (const w of wings) w.piv.rotation.z = w.s * (0.25 + Math.sin(flap) * 0.7);
  blob.position.set(fly.position.x, 0.06, fly.position.z); blob.scale.setScalar(clamp(1.3 - fly.position.y * 0.05, 0.4, 1.2));
  // proboscis while eating
  const eatK = S.eatT > 0 ? 1 : 0; probos.scale.y += (eatK * 1 * clamp(S.feed / feedHealthy, 0, 1) * 40 - probos.scale.y) * 0.2; probos.scale.y = Math.max(0.01, probos.scale.y);
  S.eatT = Math.max(0, S.eatT - dt);
  S.invuln = Math.max(0, S.invuln - dt); fly.visible = S.invuln <= 0 || Math.floor(S.t * 12) % 2 === 0;
  ring.position.copy(fly.position); ring.lookAt(camera.position); ring.material.opacity = Math.max(0, ring.material.opacity - dt * 1.8); ring.scale.setScalar(1 + (1 - ring.material.opacity) * 2);

  // berries
  for (const b of berries) { b.userData.ph += dt; b.position.y += Math.sin(b.userData.ph * 2) * 0.004; b.rotation.y += dt;
    if (b.position.distanceTo(fly.position) < 1.1) eat(b); }
  // swatters
  S.spawn -= dt;
  if (S.spawn <= 0) { spawnSwatter(); S.spawn = Math.max(1.5, 3.6 - S.t / 30) + Math.random(); }
  let threat = null, tmin = 1e9;
  for (let i = swatters.length - 1; i >= 0; i--) {
    const s = swatters[i];
    if (s.state === 'down') { s.g.position.y -= s.speed * dt; if (s.g.position.y <= 0.3) { s.g.position.y = 0.3; s.state = 'hold'; s.hold = 0.5; } }
    else if (s.state === 'hold') { s.hold -= dt; if (s.hold <= 0) s.state = 'up'; }
    else { s.g.position.y += 10 * dt; if (s.g.position.y > 22) { scene.remove(s.g); scene.remove(s.sh); swatters.splice(i, 1); continue; } }
    s.sh.position.x = s.g.position.x; s.sh.position.z = s.g.position.z;
    s.sh.material.opacity = clamp(0.5 - s.g.position.y * 0.02, 0, 0.5);
    // collision with the disc
    const dx = fly.position.x - s.g.position.x, dz = fly.position.z - s.g.position.z, dxz = Math.hypot(dx, dz);
    if (S.invuln <= 0 && dxz < 3.3 && Math.abs(fly.position.y - s.g.position.y) < 0.7) hit();
    if (s.state === 'down') { const d = s.g.position.distanceTo(fly.position); if (d < tmin) { tmin = d; threat = s; } }
  }
  // the brain: looming angular size -> real connectome -> escape neurons
  S.brainT -= dt;
  if (S.brainT <= 0 && brain) {
    S.brainT = 0.09;
    let strength = 0;
    if (threat) { const ang = 2 * Math.atan(3.2 / Math.max(tmin, 0.5)); strength = clamp(ang / 1.2, 0, 1) * 0.5; }
    S.loom = strength; S.esc = brainLoom(strength);
    if (threat && S.esc >= 0.5 && S.reflex <= 0 && S.cool <= 0) {
      S.reflexDir.set(fly.position.x - threat.g.position.x, 0, fly.position.z - threat.g.position.z).normalize();
      if (!isFinite(S.reflexDir.x) || S.reflexDir.lengthSq() < 0.1) S.reflexDir.set(1, 0, 0);
      S.reflex = 0.4; S.cool = 1.0; S.saves++; ring.material.opacity = 1; say('REFLEX JUMP!', 700);
    }
  }
  S.cool = Math.max(0, (S.cool || 0) - dt);
  // HUD
  $('#bLoom').style.width = clamp(S.loom / 0.5, 0, 1) * 100 + '%';
  $('#bEsc').style.width = clamp(S.esc, 0, 1) * 100 + '%';
  $('#bFeed').style.width = clamp(S.feed / feedHealthy, 0, 1) * 100 * (S.eatT > 0 ? 1 : 0.0) + '%';
  $('#sTime').textContent = Math.max(0, Math.ceil(90 - S.t));
  if (S.t >= 90) end('Time!', `You ate ${S.berries} berries and your brain's reflex saved you ${S.saves} times.`);
  // camera
  const camPos = fly.position.clone().addScaledVector(fwd, -6.5); camPos.y += 2.6;
  camera.position.lerp(camPos, 1 - Math.pow(0.0008, dt)); camera.position.y = Math.max(camera.position.y, 0.8);
  camera.lookAt(fly.position.x + fwd.x * 3, fly.position.y + 0.3, fly.position.z + fwd.z * 3);
}

function eat(b) {
  scene.remove(b); berries.splice(berries.indexOf(b), 1); spawnBerry();
  const f = brain ? brainTaste() : feedHealthy; S.feed = f; S.eatT = 0.6;
  if (f >= feedHealthy * 0.5) { S.berries++; $('#sBerries').textContent = S.berries; say('Yum!', 500); }
  else say('No taste response, no food', 900);
}
function hit() {
  S.lives--; S.invuln = 1.6; $('#sLives').textContent = S.lives; say('Splat!', 800);
  S.vel.set(0, 0, 0); S.vy = 6;
  if (S.lives <= 0) end('Swatted!', `You ate ${S.berries} berries before the hand got you. Reflex saves: ${S.saves}.`);
}
function end(title, msg) {
  if (!S.run) return; S.run = false;
  const best = Math.max(S.berries, +localStorage.getItem(BEST) || 0); try { localStorage.setItem(BEST, best); } catch {}
  $('#overTitle').textContent = title; $('#overMsg').textContent = msg + (best === S.berries && S.berries > 0 ? ' New best!' : ` Best: ${best}.`);
  $('#over').hidden = false; $('#hud').hidden = true; $('#best').textContent = best;
}
function start() {
  reset(); $('#sBerries').textContent = 0; $('#sLives').textContent = 3; $('#title').hidden = true; $('#over').hidden = true; $('#hud').hidden = false; S.run = true; S.cool = 0;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.run) update(dt);
  else { const t = now * 0.0003; camera.position.set(Math.sin(t) * 12, 5, Math.cos(t) * 12); camera.lookAt(0, 2, 0); fly.position.set(0, 3 + Math.sin(now * 0.002) * 0.3, 0); fly.rotation.set(0, t + Math.PI, 0); for (const w of wings) w.piv.rotation.z = w.s * (0.25 + Math.sin(now * 0.09) * 0.7); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
$('#best').textContent = +localStorage.getItem(BEST) || 0;
$('#btnStart').addEventListener('click', start); $('#btnAgain').addEventListener('click', start);
reset(); requestAnimationFrame(frame);
loadBrain().then(() => { const b = $('#btnStart'); b.disabled = false; b.textContent = 'Start flying'; })
  .catch((e) => { $('#btnStart').textContent = 'Could not load brain data. Serve over http.'; console.error(e); });
