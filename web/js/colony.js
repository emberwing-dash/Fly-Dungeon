// Fly Dungeon 3D colony viewer: renders colony-core's World with three.js and lets you play "the weather".
import * as THREE from '../vendor/three.module.min.js';
import { Brain, PARAMS } from './sim.js';
import { Wiring, World, CFG, GENE_NAMES, decode, rng, randomGenome, nextGeneration } from './colony-core.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- data + state
let wiring, evolved, world, seedCounter = 100;
const S = { gen: 0, speed: 1, paused: false, evolve: false, mode: 'evolved', history: [], genomes: null, sel: null, acc: 0, lesionL: false, lesionK: false, rand: rng(2024), ended: false };

async function load() {
  const [cases, bj, bb, ev] = await Promise.all([
    fetch('data/cases.json').then((r) => r.json()), fetch('data/brain.json').then((r) => r.json()), fetch('data/brain.bin').then((r) => r.arrayBuffer()),
    fetch('data/evolved.json').then((r) => r.json()).catch(() => null)]);
  Object.assign(PARAMS, bj.params);
  const brain = new Brain(bj, bb);
  wiring = new Wiring(brain, cases.behaviours, cases);
  evolved = ev;
}

// ---------------------------------------------------------------- scene
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3f0); scene.fog = new THREE.Fog(0x9fd3f0, 70, 170);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 500);
const cam = { az: 0.6, el: 0.95, dist: 66, target: new THREE.Vector3() };
function placeCam() { camera.position.set(cam.target.x + Math.sin(cam.az) * Math.cos(cam.el) * cam.dist, cam.target.y + Math.sin(cam.el) * cam.dist, cam.target.z + Math.cos(cam.az) * Math.cos(cam.el) * cam.dist); camera.lookAt(cam.target); }
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a52, 1.05));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.3); sun.position.set(30, 60, 20); scene.add(sun);
function lawn() { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#7fb85a' : '#6fa84c'; g.fillRect(x * 32, y * 32, 32, 32); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace; return t; }
const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshLambertMaterial({ map: lawn() })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const arena = new THREE.Mesh(new THREE.RingGeometry(CFG.R, CFG.R + 0.5, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); arena.rotation.x = -Math.PI / 2; arena.position.y = 0.05; scene.add(arena);
const disc = new THREE.Mesh(new THREE.CircleGeometry(CFG.R, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; scene.add(disc);

// fly meshes
const bodyGeo = new THREE.SphereGeometry(0.5, 10, 8), wingGeo = new THREE.CircleGeometry(0.7, 10);
function makeFlyMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x5a4636 });
  const th = new THREE.Mesh(bodyGeo, mat); th.scale.set(0.85, 0.75, 1.0); g.add(th);
  const ab = new THREE.Mesh(bodyGeo, mat); ab.scale.set(0.75, 0.65, 1.15); ab.position.set(0, 0, -0.75); g.add(ab);
  const hd = new THREE.Mesh(bodyGeo, mat); hd.scale.setScalar(0.55); hd.position.set(0, 0.02, 0.62); g.add(hd);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xd2312b })); e.scale.setScalar(0.28); e.position.set(0.22 * s, 0.1, 0.74); g.add(e); }
  const wm = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const wings = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(0.2 * s, 0.25, 0.0); const w = new THREE.Mesh(wingGeo, wm); w.scale.set(0.5, 1, 1); w.rotation.x = -Math.PI / 2; w.position.set(0.3 * s, 0, -0.55); p.add(w); g.add(p); return { p, s }; });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.2; g.add(ring);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28 })); shadow.rotation.x = -Math.PI / 2;
  return { g, mat, wings, ring, shadow, flap: Math.random() * 6 };
}
let flyMeshes = [], berryMeshes = [], swMeshes = [];
const berryGeo = new THREE.SphereGeometry(0.6, 12, 10), berryMat = new THREE.MeshLambertMaterial({ color: 0xe0342f, emissive: 0x501010 });
function makeSwatter() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(CFG.swR, CFG.swR, 0.6, 28), new THREE.MeshLambertMaterial({ color: 0x2d2f3a, transparent: true, opacity: 0.92 })));
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 8), new THREE.MeshLambertMaterial({ color: 0x1c1d25 })); h.position.y = 7.2; g.add(h);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(CFG.swR, 28), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0 })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.06;
  scene.add(sh); return { g, sh };
}
function sync() { // make mesh pools match world sizes
  while (flyMeshes.length < world.flies.length) { const m = makeFlyMesh(); scene.add(m.g); scene.add(m.shadow); flyMeshes.push(m); }
  while (flyMeshes.length > world.flies.length) { const m = flyMeshes.pop(); scene.remove(m.g); scene.remove(m.shadow); }
  while (berryMeshes.length < world.berries.length) { const m = new THREE.Mesh(berryGeo, berryMat); scene.add(m); berryMeshes.push(m); }
  while (berryMeshes.length > world.berries.length) scene.remove(berryMeshes.pop());
  while (swMeshes.length < world.swatters.length) { const m = makeSwatter(); scene.add(m.g); swMeshes.push(m); }
  while (swMeshes.length > world.swatters.length) { const m = swMeshes.pop(); scene.remove(m.g); scene.remove(m.sh); }
}

// ---------------------------------------------------------------- rounds + evolution
function newWorld() {
  world = new World(wiring, S.genomes, ++seedCounter);
  world.setLesions(S.lesionL, S.lesionK);
  S.ended = false; S.skip = false; S.sel = null; $('#sel').textContent = 'Click a fly.';
  flyMeshes.forEach((m) => { m.g.scale.set(1, 1, 1); });
  sync(); updateHeader();
}
function useGenomes(genomes, mode, gen, history) { S.genomes = genomes.map((g) => g.slice()); S.mode = mode; S.gen = gen; S.history = history || []; $('#mode').textContent = mode === 'evolved' ? 'evolved' : 'naive'; setActive(); drawChart(); newWorld(); }
function setActive() { $('#bEvolved').classList.toggle('on', S.mode === 'evolved'); $('#bNaive').classList.toggle('on', S.mode === 'naive'); }
function endRound() {
  S.ended = true;
  const fit = world.flies.map((f) => world.fitness(f));
  const surv = world.flies.reduce((a, f) => a + (f.alive ? world.t : f.died), 0) / world.flies.length;
  const alive = world.flies.filter((f) => f.alive).length, swat = world.flies.filter((f) => f.cause === 'swatted').length, starv = world.flies.filter((f) => f.cause === 'starved').length;
  S.history.push({ gen: S.gen, surviveSec: +surv.toFixed(1), survivors: alive });
  say(`Round over: ${alive} survived, ${swat} swatted, ${starv} starved. Average life ${surv.toFixed(0)} s.`, 3200);
  drawChart();
  setTimeout(() => {
    if (S.evolve) { S.genomes = nextGeneration(world.flies, fit, S.rand, S.gen, CFG.NF); S.gen++; }
    newWorld();
  }, 2600);
}

// ---------------------------------------------------------------- UI
let toastT; function say(m, ms = 1600) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
function updateHeader() { $('#gen').textContent = S.gen; $('#alive').textContent = world.flies.filter((f) => f.alive).length; $('#time').textContent = world.t.toFixed(0) + ' s'; }
function drawChart() {
  const c = $('#chart'), g = c.getContext('2d'), W = c.width, H = c.height; g.clearRect(0, 0, W, H);
  const h = S.history; if (!h.length) { $('#chartNote').textContent = 'No finished rounds yet.'; return; }
  const maxY = CFG.tmax; g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 1;
  for (const v of [0, 20, 40, 60]) { const y = H - 14 - (H - 24) * v / maxY; g.beginPath(); g.moveTo(24, y); g.lineTo(W - 4, y); g.stroke(); g.fillStyle = '#a9b8d0'; g.font = '10px system-ui'; g.fillText(v, 4, y + 3); }
  const n = h.length, xs = (i) => 28 + (W - 36) * (n === 1 ? 0.5 : i / (n - 1));
  g.strokeStyle = '#42e0b4'; g.lineWidth = 2; g.beginPath(); h.forEach((p, i) => { const y = H - 14 - (H - 24) * Math.min(1, p.surviveSec / maxY); i ? g.lineTo(xs(i), y) : g.moveTo(xs(i), y); }); g.stroke();
  g.fillStyle = '#42e0b4'; h.forEach((p, i) => { const y = H - 14 - (H - 24) * Math.min(1, p.surviveSec / maxY); g.beginPath(); g.arc(xs(i), y, 2.5, 0, 6.3); g.fill(); });
  const last = h[h.length - 1]; $('#chartNote').textContent = `Mean seconds survived (max ${CFG.tmax}). Latest: ${last.surviveSec} s, ${last.survivors} survivors.`;
}
function showSel() {
  const f = S.sel; if (!f) return;
  const rows = f.genes.map((v, i) => `<div class="gene"><span>${GENE_NAMES[i]}</span><i><u style="width:${v * 100}%"></u></i><span>${(v * 100).toFixed(0)}</span></div>`).join('');
  const act = [['escape neurons', f.esc], ['approach neurons', f.app], ['feeding neuron', f.feed]].map(([n, v]) => `<div class="gene act"><span>${n}</span><i><u style="width:${clamp(v, 0, 1) * 100}%"></u></i><span>${(v * 100).toFixed(0)}</span></div>`).join('');
  $('#sel').innerHTML = `<b>Fly #${f.id + 1}</b> ${f.alive ? 'energy ' + f.energy.toFixed(0) : '☠ ' + f.cause} &middot; berries ${f.eaten} &middot; hops ${f.hops}<div style="margin-top:6px">${act}</div><div style="margin-top:6px"><span class="muted">Evolved genes (the numbers the wiring doesn't give):</span>${rows}</div>`;
}
function wire() {
  $('#bEvolved').onclick = () => { if (evolved) useGenomes(evolved.genomes, 'evolved', evolved.generations, evolved.history.map((h) => ({ gen: h.gen, surviveSec: h.surviveSec, survivors: h.survivors }))); };
  $('#bNaive').onclick = () => { const r = rng(Date.now() & 0xffff); useGenomes(Array.from({ length: CFG.NF }, () => randomGenome(r)), 'naive', 0, []); $('#cEvolve').checked = true; S.evolve = true; say('Naive colony. Evolving is on: watch survival improve.', 2600); };
  $('#cEvolve').onchange = (e) => { S.evolve = e.target.checked; };
  document.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => { S.speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#bSkip').onclick = () => { S.skip = true; say('Fast-forwarding…', 900); };
  const tog = (w) => { if (w === 'L') S.lesionL = !S.lesionL; else S.lesionK = !S.lesionK; world.setLesions(S.lesionL, S.lesionK); $('#tL').setAttribute('aria-pressed', S.lesionL); $('#tK').setAttribute('aria-pressed', S.lesionK); say(w === 'L' ? (S.lesionL ? 'Shadow detectors (LC4, LPLC2) switched off in every fly' : 'Shadow detectors restored') : (S.lesionK ? 'Taste relay GNG117 cut in every fly' : 'Taste relay restored')); };
  $('#tL').onclick = () => tog('L'); $('#tK').onclick = () => tog('K');
  addEventListener('keydown', (e) => { if (e.code === 'Space') { S.paused = !S.paused; say(S.paused ? 'Paused' : 'Running', 700); e.preventDefault(); } if (e.code === 'KeyL') tog('L'); if (e.code === 'KeyK') tog('K'); });
  // camera + picking
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; cam.az -= dx * 0.006; cam.el = clamp(cam.el + dy * 0.006, 0.15, 1.5); });
  canvas.addEventListener('pointerup', (e) => { if (drag && drag.moved < 6) click(e); drag = null; });
  canvas.addEventListener('dblclick', () => { cam.az = 0.6; cam.el = 0.95; cam.dist = 66; S.sel = null; });
  canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 12, 120); e.preventDefault(); }, { passive: false });
}
const ray = new THREE.Raycaster();
function click(e) {
  const nd = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(nd, camera);
  const p = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p); if (!p) return;
  // pick a fly if close
  let best = null, bd = 2.2; world.flies.forEach((f) => { const d = Math.hypot(f.x - p.x, f.z - p.z); if (d < bd) { bd = d; best = f; } });
  if (best && !e.shiftKey) { S.sel = best; showSel(); return; }
  if (e.shiftKey) { world.berries.push({ x: p.x, z: p.z }); if (world.berries.length > 24) world.berries.shift(); sync(); }
  else { world.addSwatter(p.x, p.z); sync(); }
}

// ---------------------------------------------------------------- loop
let last = performance.now(), hud = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (world && S.skip && !S.ended) {                   // time-sliced fast-forward: ~30 ms of simulation per frame
    const t0 = performance.now();
    while (!world.over && performance.now() - t0 < 30) world.step();
    if (world.over) { S.skip = false; endRound(); }
  } else if (world && !S.paused && !S.ended) {
    S.acc += dt * S.speed; let guard = 0;
    while (S.acc >= CFG.dt && guard++ < 12) { world.step(); S.acc -= CFG.dt; if (world.over) { endRound(); break; } }
    if (S.acc > 1) S.acc = 0;
  }
  if (world) render(now);
  hud -= dt; if (hud <= 0 && world) { hud = 0.2; updateHeader(); if (S.sel) showSel(); }
  placeCam(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
function render(now) {
  sync();
  world.flies.forEach((f, i) => {
    const m = flyMeshes[i];
    const hop = f.burst > 0 ? Math.sin((1 - f.burst / 0.35) * Math.PI) * 3.2 : 0;
    m.g.position.set(f.x, 0.5 + hop + (f.alive ? 0 : -0.25), f.z); m.g.rotation.y = f.h;
    m.shadow.position.set(f.x, 0.07, f.z);
    if (f.alive) {
      const e = clamp(f.energy / 70, 0, 1); m.mat.color.setRGB(0.55 - 0.25 * e, 0.2 + 0.55 * e, 0.2 + 0.05 * e); m.g.scale.set(1, 1, 1);
      m.flap += 0.45 + (hop > 0 ? 0.6 : 0.0) + f.v * 0.03; for (const w of m.wings) w.p.rotation.z = w.s * (0.2 + Math.sin(m.flap) * (hop > 0 ? 0.9 : 0.35));
      m.ring.material.opacity = S.sel === f ? 0.9 : f.eatT > 0 ? 0.7 : 0; m.ring.material.color.set(S.sel === f ? 0xffffff : 0xffd45e);
    } else { m.mat.color.setRGB(0.35, 0.35, 0.35); m.g.scale.y = 0.35; m.ring.material.opacity = 0; for (const w of m.wings) w.p.rotation.z = w.s * 0.05; }
    m.g.visible = f.alive || (world.t - f.died) < 6; m.shadow.visible = m.g.visible;
  });
  world.berries.forEach((b, i) => { berryMeshes[i].position.set(b.x, 0.7 + Math.sin(now * 0.003 + i) * 0.1, b.z); });
  world.swatters.forEach((s, i) => { const m = swMeshes[i]; m.g.position.set(s.x, s.y, s.z); m.sh.position.x = s.x; m.sh.position.z = s.z; m.sh.material.opacity = clamp(0.55 - s.y * 0.03, 0, 0.55); });
  if (S.sel) { cam.target.lerp(new THREE.Vector3(S.sel.x, 0, S.sel.z), 0.03); } else cam.target.lerp(new THREE.Vector3(0, 0, 0), 0.05);
}

window.__colony = { get world() { return world; }, S };
async function main() {
  await load(); wire();
  if (evolved) $('#bEvolved').click(); else { $('#bEvolved').disabled = true; $('#bNaive').click(); }
  $('#loading').hidden = true; requestAnimationFrame(frame);
}
main().catch((e) => { $('#loading').textContent = 'Could not load data. Serve this folder over http. ' + e; console.error(e); });
