// Fly Dungeon. 3D menu, fly chooser, brain proof screen and the 3D dungeon.
// Simulation: dungeon-core.js. Models: flymodel.js. Menu stage: stage3d.js.
import * as THREE from '../vendor/three.module.min.js';
import { Brain, PARAMS } from './sim.js';
import { Wiring } from './colony-core.js';
import { Dungeon, TYPES, STAT_KEYS, FREE_POINTS, GENE_NAMES, DT, T } from './dungeon-core.js';
import { buildFly, FLYSPEC, lam, sph, cyl, box, addOutlines } from './flymodel.js';
import { Stage3D } from './stage3d.js';
import { Sound } from './audio.js';
const sound = new Sound();

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// ------------------------------------------------------------------ assets (Block Land by VEXED, CC0: brick wall, key, honey)
const IMG = {};
function loadImg(name, src) { return new Promise((res) => { const i = new Image(); i.onload = () => { IMG[name] = i; res(); }; i.onerror = () => res(); i.src = src; }); }

// ------------------------------------------------------------------ state
let wiring, brainObj, casesData, ids = null, prov = null, evolvedFile, dungeon = null, stage = null;
const S = { type: 'fruit', stats: null, free: FREE_POINTS, size: 'medium', n: 8, brain: 'naive', speed: 1, paused: false, sel: null, keys: {}, explored: null, texts: [], mapOpen: false, screen: 'menu', menuOpen: false, rmb: false, freecam: false };
async function loadAll() {
  await Promise.all([loadImg('tiles', 'assets/blockland/World-Tiles.png')]);
  const [cases, bj, bb, ev, idj, pv] = await Promise.all([fetch('data/cases.json').then((r) => r.json()), fetch('data/brain.json').then((r) => r.json()), fetch('data/brain.bin').then((r) => r.arrayBuffer()), fetch('data/dungeon-evolved.json').then((r) => r.json()).catch(() => null), fetch('data/brain_ids.json').then((r) => r.json()).catch(() => null), fetch('data/provenance.json').then((r) => r.json()).catch(() => null)]);
  Object.assign(PARAMS, bj.params); brainObj = new Brain(bj, bb); wiring = new Wiring(brainObj, cases.behaviours, cases); casesData = cases; evolvedFile = ev; ids = idj; prov = pv;
}

// ------------------------------------------------------------------ screens
function show(id) {
  S.screen = id; for (const s of ['menu', 'setup', 'brainScreen']) $('#' + s).hidden = s !== id; $('#game').hidden = id !== 'game'; $('#stage').hidden = id === 'game';
  if (stage && id !== 'game') stage.setMode(id === 'menu' ? 'menu' : id === 'setup' ? 'setup' : 'brain');
  sound.setMode(id === 'game' ? 'game' : 'menu'); $('#bSoundMenu').hidden = id === 'game'; if (id !== 'game') sound.hum(0);
}
const TYPE_TAGS = { fruit: 'balanced', house: 'fast, tough', gnat: 'tiny, twitchy' };
const flyTypes = Object.keys(TYPES);
function chooseType(k) { S.type = k; S.stats = { ...TYPES[k].base }; S.free = FREE_POINTS; buildSetup(); }
function buildSetup() {
  const box = $('#types'); box.innerHTML = '';
  for (const [k, t] of Object.entries(TYPES)) {
    const b = document.createElement('button'); b.className = 'type' + (k === S.type ? ' on' : ''); b.dataset.k = k;
    b.innerHTML = `<i style="background:${hex(FLYSPEC[k].thorax)}"></i>${t.name}<small>${TYPE_TAGS[k]}</small>`; b.dataset.snd = 'pop'; b.onclick = () => chooseType(k); box.appendChild(b);
  }
  if (!S.stats) S.stats = { ...TYPES[S.type].base };
  $('#typeName').textContent = TYPES[S.type].name; $('#typeBlurb').textContent = TYPES[S.type].blurb;
  const st = $('#stats'); st.innerHTML = '';
  const labels = { speed: 'Speed', stamina: 'Stamina', senses: 'Senses', reflex: 'Reflex' }, tips = { speed: 'how fast it flies (faster wing beats)', stamina: 'energy before starving (bigger abdomen)', senses: 'range of the smell and shadow detectors (bigger eyes)', reflex: 'dash power and recharge (longer legs)' };
  for (const k of STAT_KEYS) {
    const row = document.createElement('div'); row.className = 'stat'; row.title = tips[k];
    row.innerHTML = `<span>${labels[k]}</span><span class="pillbar"><u style="width:${S.stats[k] * 10}%"></u></span><b>${S.stats[k]}</b><button aria-label="Less ${labels[k]}">&minus;</button><button aria-label="More ${labels[k]}">+</button>`;
    const [minus, plus] = row.querySelectorAll('button');
    minus.disabled = S.stats[k] <= TYPES[S.type].base[k]; plus.disabled = S.free <= 0 || S.stats[k] >= 9;
    minus.dataset.snd = 'statDown'; plus.dataset.snd = 'statUp'; minus.onclick = () => { S.stats[k]--; S.free++; buildSetup(); }; plus.onclick = () => { S.stats[k]++; S.free--; buildSetup(); };
    st.appendChild(row);
  }
  $('#pts').textContent = `${S.free} points left`;
  $('#brainHint').textContent = S.brain === 'naive' ? 'Random brains. The first flies stumble; watch the curve climb as they die.' : evolvedFile ? `Brains pre-evolved for ${Math.round(evolvedFile.simSeconds / 60)} minutes of dungeon time (${evolvedFile.births} flies).` : 'No pre-evolved file found.';
  if (stage) stage.setFly(S.type, S.stats);       // the big 3D fly on the left changes with the choice
}
function seg(id, key, parse = (v) => v) { document.querySelectorAll(`#${id} button`).forEach((b) => b.onclick = () => { S[key] = parse(b.dataset.v); document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle('on', x === b)); buildSetup(); }); }

// ------------------------------------------------------------------ brain proof screen
const BRAIN_TYPES = { loom: ['loom', 0.4], prey: ['prey', 1.0], taste: ['taste', 1.0], blind: ['loom', 0.4] };
let provBuilt = false;
function buildProv() {
  if (provBuilt || !prov) return; provBuilt = true;
  const sh = (s) => s.slice(0, 16) + '…' + s.slice(-6);
  $('#prov').innerHTML = `<dl class="kv"><dt>Project</dt><dd>${prov.project}</dd><dt>Repository</dt><dd><a href="${prov.repo}" target="_blank" rel="noopener">${prov.repo.replace('https://', '')}</a></dd><dt>Commit</dt><dd class="mono">${prov.commit.slice(0, 12)} by ${prov.commit_author}</dd><dt>Data origin</dt><dd>${prov.data_origin}</dd><dt>Source brain</dt><dd><b>${prov.source_totals.neurons.toLocaleString()}</b> neurons, <b>${prov.source_totals.connections.toLocaleString()}</b> connections, ${prov.source_totals.cell_types.toLocaleString()} cell types</dd><dt>In this game</dt><dd><b>${prov.shipped.neurons.toLocaleString()}</b> neurons, <b>${prov.shipped.connections.toLocaleString()}</b> connections, ${prov.shipped.cell_types} cell types (the pathways for shadows, smell and taste)</dd></dl>
  <p class="note" style="margin-top:10px">Source files (SHA-256):</p>${Object.entries(prov.files).map(([n, f]) => `<span class="hash"><b>${n}</b> ${(f.bytes / 1e6).toFixed(1)} MB &middot; ${sh(f.sha256)}</span>`).join('')}`;
  $('#edges').innerHTML = prov.sample_edges.slice(0, 5).map((e) => `<div class="edge"><b>${e.pre}</b> &rarr; <b>${e.post}</b><small>raw connectome: ${e.synapses} synapses of ${e.input_synapses_of_post.toLocaleString()} inputs, sign ${e.transmitter_sign > 0 ? '+' : '&minus;'}<br>rebuilt weight ${e.weight_from_source.toFixed(6)} = shipped ${e.weight_shipped.toFixed(6)} <span class="ok">&#10003;</span></small></div>`).join('');
}
function initBrainScreen() { buildProv(); if (ids && stage && !stage.cloud) stage.setBrain(ids); stage && stage.setActivity(null); $('#pokeOut').innerHTML = '<p class="note">Press a button.</p>'; }
function poke(kind) {
  const [stim, strength] = BRAIN_TYPES[kind]; const types = casesData.cases.find((c) => c.id === stim).stimulus.types;
  const sil = kind === 'blind' ? new Set(['LC4', 'LPLC2'].map((t) => brainObj.typeId(t))) : [];
  const x = brainObj.run(brainObj.drive(types, strength), sil); const act = Float32Array.from(x); stage.setActivity(act); sound.play('poke', { level: kind === 'blind' ? 0.1 : kind === 'taste' ? 0.3 : 0.8 });
  const order = Array.from(act.keys()).sort((a, b) => act[b] - act[a]); const fired = act.reduce((s, v) => s + (v > 0.05 ? 1 : 0), 0);
  const cmds = ['escape', 'approach', 'feed'].map((b) => { const cells = casesData.behaviours[b].cells; let s = 0, c = 0; for (const nm of cells) { const t = brainObj.typeId(nm); if (t === undefined) continue; for (const i of brainObj.byType[t]) { s += act[i]; c++; } } return [b, c ? s / c : 0]; });
  const label = { escape: 'Escape neurons (DNp01/02/04)', approach: 'Approach neurons (DNp09, DNg97, DNg100)', feed: 'Proboscis neuron (MN9)' };
  $('#pokeOut').innerHTML = `<p class="note"><b>${fired.toLocaleString()}</b> of ${act.length.toLocaleString()} real neurons fired after 40 steps over ${brainObj.nnz.toLocaleString()} real connections.</p>` + cmds.map(([b, v]) => `<div class="nrow"><span><b>${label[b]}</b></span><span class="pillbar"><u style="width:${clamp(v * 3, 0, 1) * 100}%"></u></span></div>`).join('') + `<p class="note" style="margin-top:8px">Most active real neurons:</p>` + order.slice(0, 7).map((i) => `<div class="nrow"><span><b>${ids ? ids.instance[i] : '#' + i}</b><small>FlyEM body id ${ids ? ids.body_id[i] : '?'}</small></span><span class="pillbar"><u style="width:${clamp(act[i], 0, 1) * 100}%"></u></span></div>`).join('');
}

// ------------------------------------------------------------------ three.js dungeon scene
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x120b24); scene.fog = new THREE.Fog(0x120b24, 12, 38);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
const cam = { az: 0.5, el: 1.02, dist: 11.5, tx: 0, tz: 0, shake: 0 };
scene.add(new THREE.HemisphereLight(0xcdd6ff, 0x4a3470, 1.6));
const keyLight = new THREE.DirectionalLight(0xfff0d0, 1.1); keyLight.position.set(4, 10, 3); scene.add(keyLight);
const flyLight = new THREE.PointLight(0xffe9b8, 3, 20, 1.4); scene.add(flyLight);
const fx = $('#fx'), fxc = fx.getContext('2d');
function sp(x, z) { const dx = x - cam.tx, dz = z - cam.tz, d = Math.hypot(dx, dz), side = dx * Math.cos(cam.az) - dz * Math.sin(cam.az); return { vol: Math.pow(clamp(1 - d / 22, 0, 1), 1.3), pan: clamp(side / 14, -1, 1) }; }
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fx.width = w; fx.height = h; }
addEventListener('resize', resize); resize();

const texCache = {};
function cropTex(img, sx, sy, sw, sh) { const key = sx + ',' + sy + ',' + sw + ',' + sh; if (texCache[key]) return texCache[key]; const c = document.createElement('canvas'); c.width = sw; c.height = sh; c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh); const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return (texCache[key] = t); }
const tileTex = (c, r) => cropTex(IMG.tiles, c * 16, r * 16, 16, 16);
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const blobGeo = new THREE.CircleGeometry(0.5, 14), blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
const spriteOf = (tex, w, h, y) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 })); s.scale.set(w, h, 1); s.center.set(0.5, 0); s.userData.base = { w, h, y }; return s; };

// ---- 3D enemy models: toon-shaded, outlined ----
function makeSpider(spiked) {
  const g = new THREE.Group(), col = spiked ? 0xc23b3b : 0x6a4a5e, body = new THREE.Group(); g.add(body);
  const ab = new THREE.Mesh(sph, lam(col, 0x1a0a14)); ab.scale.set(0.62, 0.5, 0.78); ab.position.set(0, 0.42, -0.28); body.add(ab);
  const ct = new THREE.Mesh(sph, lam(spiked ? 0xd24a4a : 0x7d5a70, 0x1a0a14)); ct.scale.set(0.4, 0.34, 0.42); ct.position.set(0, 0.4, 0.2); body.add(ct);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(sph, lam(0xffe14a, 0x8a6a00)); e.scale.setScalar(0.1); e.position.set(0.1 * s, 0.5, 0.4); body.add(e); const e2 = e.clone(); e2.scale.setScalar(0.065); e2.position.set(0.05 * s, 0.56, 0.42); body.add(e2); }
  if (spiked) for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), lam(0xf4f0e8, 0x222233)); sp.position.set((i - 2) * 0.1, 0.75 - Math.abs(i - 2) * 0.04, -0.28 - Math.abs(i - 2) * 0.03); body.add(sp); }
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, k = i % 4; const piv = new THREE.Group(); piv.position.set(0.12 * side, 0.4, 0.28 - k * 0.2);
    const up = new THREE.Mesh(cyl, lam(col, 0)); up.scale.set(0.055, 0.5, 0.055); up.position.set(0.25 * side, 0.1, 0); up.rotation.z = side * -1.1; piv.add(up);
    const lo = new THREE.Mesh(cyl, lam(col, 0)); lo.scale.set(0.045, 0.55, 0.045); lo.position.set(0.55 * side, -0.14, 0); lo.rotation.z = side * 0.55; piv.add(lo);
    piv.userData.k = k; piv.userData.side = side; piv.rotation.y = side * (k - 1.5) * 0.28; g.add(piv); legs.push(piv);
  }
  g.scale.setScalar(spiked ? 1.35 : 1.15); g.userData.legs = legs; g.userData.body = body; return addOutlines(g, 1.1);
}
function makeSlime(pink) {
  const g = new THREE.Group(); const c = pink ? 0xff7fc0 : 0x6ee27e;
  const b = new THREE.Mesh(sph, lam(c, pink ? 0x40102a : 0x0e3a16)); b.scale.set(0.95, 0.62, 0.95); b.position.y = 0.3; g.add(b);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(sph, lam(0xffffff, 0x555555)); e.scale.setScalar(0.2); e.position.set(0.17 * s, 0.4, 0.38); g.add(e); const pu = new THREE.Mesh(sph, lam(0x1a1020)); pu.scale.setScalar(0.1); pu.position.set(0.17 * s, 0.4, 0.5); g.add(pu); }
  g.userData.blob = b; return addOutlines(g, 1.08);
}
function makeBird() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const bd = new THREE.Mesh(sph, lam(0x7d97c0, 0x0c1420)); bd.scale.set(0.7, 0.62, 0.95); bd.position.y = 0.05; body.add(bd);
  const hd = new THREE.Mesh(sph, lam(0x9db5d8, 0x0c1420)); hd.scale.set(0.42, 0.4, 0.42); hd.position.set(0, 0.28, 0.45); body.add(hd);
  const bk = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), lam(0xffb347, 0x402000)); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.26, 0.76); body.add(bk);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(sph, lam(0xffffff, 0x444444)); e.scale.setScalar(0.1); e.position.set(0.15 * s, 0.34, 0.62); body.add(e); const pu = new THREE.Mesh(sph, lam(0x000000)); pu.scale.setScalar(0.05); pu.position.set(0.17 * s, 0.34, 0.66); body.add(pu); }
  const tail = new THREE.Mesh(box, lam(0x5a72a0, 0x0c1420)); tail.scale.set(0.3, 0.06, 0.5); tail.position.set(0, 0.02, -0.7); tail.rotation.x = -0.2; body.add(tail);
  const wings = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(0.3 * s, 0.14, 0); const w = new THREE.Mesh(box, lam(0x6a85b8, 0x0c1420)); w.scale.set(0.9, 0.05, 0.5); w.position.x = 0.45 * s; p.add(w); body.add(p); return { p, s }; });
  g.scale.setScalar(1.2); g.userData.wings = wings; g.userData.body = body; return addOutlines(g, 1.08);
}
function makeSwatter() {
  const g = new THREE.Group(); const arm = new THREE.Group(); g.add(arm);
  const handle = new THREE.Mesh(cyl, lam(0x3d86d6, 0x0a1a30)); handle.scale.set(0.12, 3.4, 0.12); handle.position.set(0, 1.7, -0.55); handle.rotation.x = 0.25; arm.add(handle);
  const grip = new THREE.Mesh(cyl, lam(0x2a2236)); grip.scale.set(0.16, 0.8, 0.16); grip.position.set(0, 3.2, -1.35); grip.rotation.x = 0.25; arm.add(grip);
  const pad = new THREE.Mesh(box, lam(0xf0605a, 0x3a0a0a)); pad.scale.set(1.5, 0.07, 1.8); pad.position.set(0, 0.05, 0.1); arm.add(pad);
  for (let i = -2; i <= 2; i++) { const bar = new THREE.Mesh(box, lam(0x9a2a2a)); bar.scale.set(0.05, 0.09, 1.7); bar.position.set(i * 0.3, 0.07, 0.1); bar.userData.skipOutline = true; arm.add(bar); }
  const rim = new THREE.Mesh(box, lam(0x3d86d6, 0x0a1a30)); rim.scale.set(1.62, 0.1, 0.1); rim.position.set(0, 0.07, 1.02); arm.add(rim);
  g.userData.arm = arm; return addOutlines(g, 1.06);
}

// ---- level meshes ----
let levelGroup = null, ents = new Map(), flyMeshes = new Map(), honeyMeshes = [], keySprite = null, exitGroup = null, exitLight = null, selRing = null, slamRings = new Map();
const parts = []; let partsPts = null;
function disposeGroup(g) { g.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); if (o.material && !o.userData.shared) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose && m.dispose()); } }); }
function buildLevel() {
  const L = dungeon.L; if (levelGroup) { scene.remove(levelGroup); disposeGroup(levelGroup); }
  for (const m of flyMeshes.values()) scene.remove(m.g); flyMeshes.clear(); ents.clear(); slamRings.clear(); honeyMeshes = [];
  levelGroup = new THREE.Group(); scene.add(levelGroup); S.explored = new Uint8Array(L.W * L.H);
  const c = document.createElement('canvas'); c.width = L.W * 16; c.height = L.H * 16; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#120b24'; g.fillRect(0, 0, c.width, c.height);
  let seed = L.seed * 13 + L.level; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) { if (L.g[y * L.W + x] === T.WALL) continue; const v = r(); g.fillStyle = v < 0.5 ? '#4a3a78' : v < 0.85 ? '#52427f' : '#43346d'; g.fillRect(x * 16, y * 16, 16, 16); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x * 16, y * 16, 16, 1); g.fillRect(x * 16, y * 16, 1, 16); if (r() < 0.07) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x * 16 + 3 + Math.floor(r() * 8), y * 16 + 4 + Math.floor(r() * 6), 3, 1); } }
  const ft = new THREE.CanvasTexture(c); ft.magFilter = THREE.NearestFilter; ft.minFilter = THREE.LinearFilter; ft.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.W, L.H), new THREE.MeshLambertMaterial({ map: ft })); floor.rotation.x = -Math.PI / 2; floor.position.set(L.W / 2, 0, L.H / 2); levelGroup.add(floor);
  const wl = [], spikes = [];
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    const t = L.g[y * L.W + x];
    if (t === T.WALL) { const near = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < L.W && ny < L.H && L.g[ny * L.W + nx] !== T.WALL; }); if (near) wl.push([x, y]); }
    else if (t === T.SPIKE) spikes.push([x, y]);
  }
  const wallMat = lam(0xd9c8e8, 0x0a0614, { map: tileTex(11, 69) });
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.5, 1), wallMat, wl.length); const m4 = new THREE.Matrix4(); wl.forEach(([x, y], i) => { m4.makeTranslation(x + 0.5, 0.75, y + 0.5); walls.setMatrixAt(i, m4); }); levelGroup.add(walls);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.08, 1.02), lam(0x3b2c5c), wl.length); wl.forEach(([x, y], i) => { m4.makeTranslation(x + 0.5, 1.52, y + 0.5); caps.setMatrixAt(i, m4); }); levelGroup.add(caps);
  const sp = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.48, 5), lam(0xe6e8f2, 0x222630), Math.max(1, spikes.length * 4)); sp.count = spikes.length * 4;
  spikes.forEach(([x, y], i) => { for (let k = 0; k < 4; k++) { m4.makeTranslation(x + 0.28 + (k % 2) * 0.44, 0.24, y + 0.28 + Math.floor(k / 2) * 0.44); sp.setMatrixAt(i * 4 + k, m4); } }); levelGroup.add(sp);
  exitGroup = new THREE.Group(); exitGroup.position.set(L.exit.x, 0, L.exit.y);
  const stone = lam(0x8a86b8);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(box, stone); p.userData.shared = true; p.scale.set(0.28, 1.7, 0.28); p.position.set(0.7 * s, 0.85, 0); exitGroup.add(p); }
  const lin = new THREE.Mesh(box, stone); lin.userData.shared = true; lin.scale.set(1.7, 0.3, 0.3); lin.position.y = 1.75; exitGroup.add(lin);
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), new THREE.MeshBasicMaterial({ color: 0x66ffc8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); portal.position.y = 0.85; portal.name = 'portal'; exitGroup.add(portal);
  const eg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x66ffc8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); eg.scale.set(5, 5, 1); eg.position.y = 0.9; exitGroup.add(eg);
  exitLight = new THREE.PointLight(0x66ffc8, 2.6, 11, 1.3); exitLight.position.set(0, 1.2, 0); exitGroup.add(exitLight); levelGroup.add(addOutlines(exitGroup, 1.05));
  keySprite = spriteOf(tileTex(0, 85), 0.8, 0.8, 0.5); keySprite.position.set(L.key.x, 0.5, L.key.y); levelGroup.add(keySprite);
  const kg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd45e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); kg.scale.set(3, 3, 1); kg.position.set(L.key.x, 0.8, L.key.y); levelGroup.add(kg);
  for (const h of L.honey) { const s = spriteOf(tileTex(0, 84), 0.55, 0.55, 0.3); s.position.set(h.x, 0.3, h.y); levelGroup.add(s); const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc83c, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(1.6, 1.6, 1); gl.position.set(h.x, 0.4, h.y); levelGroup.add(gl); honeyMeshes.push({ h, s, gl }); }
  for (const e of L.enemies) {
    let o; const sh = new THREE.Mesh(blobGeo, blobMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; sh.scale.setScalar(e.kind === 'human' ? 1.1 : e.kind === 'patrol' ? 1.3 : 0.9);
    if (e.kind === 'patrol') o = makeSpider(e.spiked); else if (e.kind === 'slime') o = makeSlime(e.color === 'pink'); else if (e.kind === 'bird') o = makeBird(); else o = makeSwatter();
    o.position.set(e.x, 0, e.y); levelGroup.add(o); levelGroup.add(sh);
    if (e.kind === 'human') o.userData.arm.position.y = 2.6;
    ents.set(e, { o, sh, home: { x: e.x, z: e.y } });
    if (e.kind === 'human') { const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40), new THREE.MeshBasicMaterial({ color: 0xff4a4a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; levelGroup.add(ring); slamRings.set(e, ring); }
  }
  if (!selRing) { selRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 28), new THREE.MeshBasicMaterial({ color: 0xffc83c, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })); selRing.rotation.x = -Math.PI / 2; scene.add(selRing); }
  if (!partsPts) { const N = 400; const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); partsPts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, depthWrite: false })); partsPts.frustumCulled = false; scene.add(partsPts); }
  parts.length = 0; S.texts = [];
}
function flyMesh(f) {
  let m = flyMeshes.get(f.id); if (m) return m;
  m = buildFly(dungeon.cfg.type, glowTex); m.g.scale.multiplyScalar(1.45); m.setStats(dungeon.cfg.stats); m.shadow = new THREE.Mesh(blobGeo, blobMat); m.shadow.rotation.x = -Math.PI / 2; m.shadow.position.y = -0.53; m.g.add(m.shadow);
  m.phase = Math.random() * 6; scene.add(m.g); flyMeshes.set(f.id, m); return m;
}
const burst = (x, y, color, n = 8, sp = 2) => { const col = new THREE.Color(color); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; parts.push({ x, z: y, y: 0.6, vx: Math.cos(a) * sp * Math.random(), vz: Math.sin(a) * sp * Math.random(), vy: 1 + Math.random() * 2, life: 0.6 + Math.random() * 0.5, c: col }); } if (parts.length > 400) parts.splice(0, parts.length - 400); };

// ------------------------------------------------------------------ game start / input
function startGame() {
  const cfg = { type: S.type, stats: { ...S.stats }, size: S.size, flies: S.n };
  dungeon = new Dungeon(wiring, cfg, (Math.random() * 1e6) | 0);
  if (S.brain === 'evolved' && evolvedFile) dungeon.archive = evolvedFile.genomes.map((g, i) => ({ genes: g, fit: evolvedFile.fitness[i], gen: 20 }));
  dungeon.flies = []; dungeon.births = 0; dungeon.nextId = 1; for (let i = 0; i < cfg.flies; i++) dungeon.spawn(); dungeon.births = cfg.flies; dungeon.events.length = 0;
  S.paused = false; S.sel = null; S.speed = 1; S.mapOpen = false; $('#bigWrap').hidden = true; $('#tL').setAttribute('aria-pressed', 'false'); $('#tK').setAttribute('aria-pressed', 'false');
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', b.dataset.speed === '1')); $('#bPause').textContent = 'Pause'; $('#log').innerHTML = '';
  show('game'); resize(); buildLevel(); selectLeader(); snapCamera(); say('Level 1. Find the golden key, then reach the green door. 3 escapes open the next dungeon.', 'gold'); lastT = performance.now(); if (!running) { running = true; requestAnimationFrame(loop); }
}
addEventListener('keydown', (e) => {
  sound.unlock(); if (e.code === 'KeyN' && !e.repeat) { toggleMute(); return; }
  if ($('#game').hidden || !dungeon) { if (e.code === 'Escape' && (S.screen === 'setup' || S.screen === 'brainScreen')) show('menu'); return; }
  S.keys[e.code] = true;
  if (e.code === 'Escape') { if (S.mapOpen) toggleMap(); else openMenu(!S.menuOpen); return; }
  if (S.menuOpen) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
  if (e.code === 'KeyF') { S.freecam = false; say('Following the selected fly.'); }
  if (e.code === 'Space') { togglePause(); e.preventDefault(); }
  if (e.code === 'Tab' || e.code === 'KeyQ') { cycle(e.shiftKey ? -1 : 1); e.preventDefault(); }
  if (e.code === 'KeyM') toggleMap();
  if (e.code === 'KeyP') toggleManual();
  if (e.code === 'KeyL') tog('L'); if (e.code === 'KeyK') tog('K');
  if (e.code === 'Digit1') setSpeed(1); if (e.code === 'Digit2') setSpeed(3); if (e.code === 'Digit3') setSpeed(8);
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => { S.keys[e.code] = false; });
function toggleMute() { sound.unlock(); sound.setMuted(!sound.muted); $('#bSound').classList.toggle('off', sound.muted); $('#bSoundMenu').classList.toggle('off', sound.muted); }
function setSpeed(v) { S.speed = v; document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === v)); }
function togglePause() { S.paused = !S.paused; $('#bPause').textContent = S.paused ? 'Resume' : 'Pause'; }
function openMenu(open) { if (S.menuOpen === open) return; sound.setPaused(open); sound.play(open ? 'pause' : 'resume'); S.menuOpen = open; if (open) { S.pausedBefore = S.paused; S.paused = true; } else { S.paused = !!S.pausedBefore; } $('#pauseMenu').hidden = !open; $('#bPause').textContent = S.paused ? 'Resume' : 'Pause'; }
function toggleMap() { S.mapOpen = !S.mapOpen; $('#bigWrap').hidden = !S.mapOpen; if (S.mapOpen) bigMap(); }
function tog(w) { const l = { ...dungeon.lesion }; if (w === 'L') l.loom = !l.loom; else l.taste = !l.taste; dungeon.setLesions(l.loom, l.taste); $('#tL').setAttribute('aria-pressed', l.loom); $('#tK').setAttribute('aria-pressed', l.taste); sound.play(l.loom || l.taste ? 'lesion' : 'restore'); say(w === 'L' ? (l.loom ? 'Shadow detectors LC4 and LPLC2 are off in every fly. Enemies will not register!' : 'Shadow detectors restored.') : (l.taste ? 'Taste relay GNG117 cut. Honey cannot be eaten.' : 'Taste relay restored.'), l.loom || l.taste ? 'bad' : 'good'); }
function toggleManual() { if (!S.sel || !S.sel.alive) return; S.freecam = false; if (S.sel.manual) { S.sel.manual = null; say('You released the fly. Its brain is back in charge.'); } else { S.sel.manual = { x: 0, y: 0 }; say('You control this fly with WASD (relative to the camera). Its brain still dashes away from enemies and eats honey for you.', 'gold'); } }
function cycle(dir) { const a = dungeon.flies.filter((f) => f.alive); if (!a.length) return; S.freecam = false; const i = a.indexOf(S.sel); if (S.sel && S.sel.manual) S.sel.manual = null; S.sel = a[(i + dir + a.length) % a.length]; say(`Now following fly #${S.sel.id} (gen ${S.sel.gen}).`); }
function selectLeader() { const a = dungeon.flies.filter((f) => f.alive); if (a.length) S.sel = a.reduce((b, f) => (f.bestProg > b.bestProg ? f : b), a[0]); }
function snapCamera() { const f = S.sel; cam.tx = f ? f.x : dungeon.L.start.x; cam.tz = f ? f.y : dungeon.L.start.y; }
function backToMenu() { dungeon = null; S.menuOpen = false; S.freecam = false; $('#pauseMenu').hidden = true; show('menu'); }

let drag = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => { if (e.button === 2) S.rmb = true; drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; cam.az -= dx * 0.006; cam.el = clamp(cam.el + dy * 0.005, 0.35, 1.45); });
canvas.addEventListener('pointerup', (e) => { if (e.button === 2) S.rmb = false; if (drag && drag.moved < 6 && dungeon && drag.button === 0) pick(e); drag = null; });
canvas.addEventListener('pointercancel', () => { S.rmb = false; drag = null; });
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 4, 24); e.preventDefault(); }, { passive: false });
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
function pick(e) { const r = canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera); const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(plane, p)) return; let best = null, bd = 1.5; for (const f of dungeon.flies) if (f.alive) { const d = Math.hypot(f.x - p.x, f.y - p.z); if (d < bd) { bd = d; best = f; } } if (best) { if (S.sel && S.sel.manual) S.sel.manual = null; S.sel = best; S.freecam = false; } }

// ------------------------------------------------------------------ log + events
function say(msg, cls = '') { const l = $('#log'); const d = document.createElement('div'); d.className = cls; d.textContent = msg; l.appendChild(d); while (l.children.length > 4) l.firstChild.remove(); setTimeout(() => d.remove(), 5200); }
function drain() {
  for (const e of dungeon.events) {
    if (e.type === 'death') { burst(e.x, e.y, 0xff6b8b, 14, 3); sound.play('death', sp(e.x, e.y)); if (dungeon.deaths < 40 || dungeon.deaths % 5 === 0) say(`Fly #${e.id} (gen ${e.gen}) ${e.cause === 'starved' ? 'starved' : 'was killed'} at ${Math.round(e.prog * 100)}% of the way.`, 'bad'); if (S.sel && S.sel.id === e.id) selectLeader(); }
    else if (e.type === 'birth') { sound.play('birth', { vol: 0.5 }); if (e.gen >= 2 && dungeon.births % 6 === 0) say(`Fly #${e.id} hatches (gen ${e.gen}) with a mutated copy of a brain that scored ${Math.round(e.parentFit)}.`, 'good'); }
    else if (e.type === 'escape') { sound.play('escape', { vol: 0.9 }); say(`Fly #${e.id} (gen ${e.gen}) ESCAPED the dungeon!`, 'gold'); const f = dungeon.flies.find((q) => q.id === e.id); if (f) burst(f.x, f.y, 0xffc83c, 30, 4); if (S.sel && S.sel.id === e.id) selectLeader(); }
    else if (e.type === 'level') { if (e.level > 1) sound.play('level'); buildLevel(); if (e.level > 1) say(`Level ${e.level}. The brains carry over. New dungeon, more enemies.`, 'gold'); selectLeader(); snapCamera(); }
    else if (e.type === 'dash') { const f = dungeon.flies.find((q) => q.id === e.id); if (f) { burst(f.x, f.y, 0xcfeaff, 6, 2); sound.play('dash', sp(f.x, f.y)); } }
    else if (e.type === 'eat') { sound.play('eat', sp(e.x, e.y)); burst(e.x, e.y, 0xffc83c, 10, 2); S.texts.push({ x: e.x, z: e.y, t: '+honey', life: 1 }); }
    else if (e.type === 'key') { const f = dungeon.flies.find((q) => q.id === e.id); if (f) { S.texts.push({ x: f.x, z: f.y, t: 'KEY!', life: 1.3 }); sound.play('key', sp(f.x, f.y)); } }
    else if (e.type === 'slam') { burst(e.x, e.y, 0xffffff, 16, 4); cam.shake = 0.25; sound.play('slam', sp(e.x, e.y)); }
    else if (e.type === 'hurt') { burst(e.x, e.y, 0xff9bb0, 5, 2); sound.play('hurt', sp(e.x, e.y)); }
  }
  dungeon.events.length = 0;
}

// ------------------------------------------------------------------ main loops
let lastT = 0, acc = 0, hudT = 0, running = false, stageLast = 0;
function loop(now) { requestAnimationFrame(loop); if (!dungeon || $('#game').hidden) return; try { frameStep(now); } catch (e) { console.error('frame error', e); window.__lastError = String(e && e.stack || e); } }
function stageLoop(now) { requestAnimationFrame(stageLoop); if (!stage || !$('#game').hidden) { stageLast = now; return; } const dt = Math.min(0.05, (now - stageLast) / 1000); stageLast = now; stage.tick(dt);
  const P = stage.pointer, mv = Math.hypot(P.x - (stageLoop.px ?? P.x), P.y - (stageLoop.py ?? P.y)); stageLoop.px = P.x; stageLoop.py = P.y; stageLoop.v = (stageLoop.v || 0) * 0.9 + mv * 2;
  if (S.screen === 'menu') sound.hum(clamp(0.25 + stageLoop.v * 6, 0, 1), 200 + stageLoop.v * 400); else if (S.screen === 'setup') sound.hum(0.45, { fruit: 220, house: 160, gnat: 320 }[S.type] || 200); else sound.hum(0); }
function frameStep(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const kk = S.keys, panning = S.rmb && (kk.KeyW || kk.KeyA || kk.KeyS || kk.KeyD || kk.ArrowUp || kk.ArrowDown || kk.ArrowLeft || kk.ArrowRight);
  if (panning) { const fw = (kk.KeyW || kk.ArrowUp ? 1 : 0) - (kk.KeyS || kk.ArrowDown ? 1 : 0), rt = (kk.KeyD || kk.ArrowRight ? 1 : 0) - (kk.KeyA || kk.ArrowLeft ? 1 : 0), sp = 13 * dt * (cam.dist / 11.5) * (kk.ShiftLeft ? 2 : 1), L2 = dungeon.L; S.freecam = true; cam.tx = clamp(cam.tx + (fw * -Math.sin(cam.az) + rt * Math.cos(cam.az)) * sp, 0, L2.W); cam.tz = clamp(cam.tz + (fw * -Math.cos(cam.az) + rt * -Math.sin(cam.az)) * sp, 0, L2.H); }
  if (S.sel && S.sel.manual && !panning) { const k = S.keys; const fw = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), rt = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0); S.sel.manual.x = fw * -Math.sin(cam.az) + rt * Math.cos(cam.az); S.sel.manual.y = fw * -Math.cos(cam.az) + rt * -Math.sin(cam.az); }
  if (!S.paused) { acc += dt * S.speed; let guard = 0; while (acc >= DT && guard++ < 40) { dungeon.step(); acc -= DT; } if (acc > 2) acc = 0; }
  drain();
  if (S.sel && !S.sel.alive && !dungeon.flies.includes(S.sel)) selectLeader();
  for (const f of dungeon.flies) if (f.alive && f.manual && f !== S.sel) f.manual = null;
  render(now / 1000, dt);
  hudT -= dt; if (hudT <= 0) { hudT = 0.15; hud(); minimap(); if (S.mapOpen) bigMap(); }
}

// ------------------------------------------------------------------ 3D render
function render(t, dt) {
  const d = dungeon, L = d.L;
  const f = S.sel && S.sel.alive && !S.freecam ? S.sel : null; const gx = f ? f.x : cam.tx, gz = f ? f.y : cam.tz; const k = Math.min(1, dt * 6); cam.tx += (gx - cam.tx) * k; cam.tz += (gz - cam.tz) * k;
  let sx = 0, sz = 0; if (cam.shake > 0) { cam.shake -= dt; sx = (Math.random() - 0.5) * 0.25; sz = (Math.random() - 0.5) * 0.25; }
  camera.position.set(cam.tx + Math.sin(cam.az) * Math.cos(cam.el) * cam.dist + sx, 0.5 + Math.sin(cam.el) * cam.dist, cam.tz + Math.cos(cam.az) * Math.cos(cam.el) * cam.dist + sz); camera.lookAt(cam.tx, 0.4, cam.tz);
  flyLight.position.set(cam.tx, 2.2, cam.tz);
  const portal = exitGroup.getObjectByName('portal'); portal.material.opacity = 0.45 + 0.2 * Math.sin(t * 3); exitLight.intensity = 2.4 + 0.5 * Math.sin(t * 3);
  keySprite.material.map = tileTex(Math.floor(t * 8) % 6, 85); keySprite.position.y = 0.55 + Math.sin(t * 3) * 0.1;
  for (const { h, s, gl } of honeyMeshes) { s.visible = gl.visible = !h.taken; if (!h.taken) { s.material.map = tileTex(Math.floor(t * 8) % 6, 84); s.position.y = 0.3 + Math.sin(t * 4 + h.x) * 0.06; } }
  for (const e of L.enemies) {
    const E = ents.get(e); if (!E) continue; const { o, sh } = E; sh.position.x = e.x; sh.position.z = e.y;
    if (E.snd !== e.state) { if (e.kind === 'human' && e.state === 'wind') sound.play('swatWind', sp(e.tx, e.ty)); if (e.kind === 'bird' && e.state === 'chase') sound.play('bird', sp(e.x, e.y)); E.snd = e.state; }
    if (e.kind === 'patrol') {
      o.position.set(e.x, 0, e.y); const want = Math.atan2(e.dx, e.dy); let dr = want - o.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; o.rotation.y += dr * Math.min(1, dt * 10);
      o.userData.legs.forEach((l) => { const ph = e.anim * 1.6 + l.userData.k * 1.6 + (l.userData.side > 0 ? Math.PI : 0); l.rotation.z = Math.sin(ph) * 0.18; l.position.y = 0.4 + Math.max(0, Math.sin(ph)) * 0.08; });
      o.userData.body.position.y = Math.abs(Math.sin(e.anim * 0.8)) * 0.03;
    } else if (e.kind === 'slime') {
      o.position.set(e.x, 0, e.y); const sq = 1 + Math.sin(t * 3 + e.x) * 0.08; o.userData.blob.scale.set(0.95 / sq, 0.62 * sq, 0.95 / sq); o.rotation.y = Math.atan2(e.vx || 0.001, e.vy || 0.001);
    } else if (e.kind === 'bird') {
      o.position.set(e.x, 1.0 + Math.sin(t * 6 + e.x) * 0.12, e.y); const want = (e.face || 1) > 0 ? Math.PI / 2 : -Math.PI / 2; let dr = want - o.rotation.y; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; o.rotation.y += dr * Math.min(1, dt * 8);
      o.userData.wings.forEach((w) => { w.p.rotation.z = w.s * Math.sin(t * (e.state === 'chase' ? 30 : 14)) * 0.7; }); o.userData.body.rotation.x = e.state === 'chase' ? 0.25 : 0;
    } else {
      const arm = o.userData.arm; let tx = E.home.x, tz = E.home.z, ty = 2.6, tilt = 0.5;
      if (e.state === 'wind') { tx = e.tx; tz = e.ty; ty = 2.2 + (e.t / 0.75) * 0.9; tilt = 0.35; }
      else if (e.state === 'slam') { tx = e.tx; tz = e.ty; ty = 0.15; tilt = 0; }
      const k2 = e.state === 'slam' ? 1 : Math.min(1, dt * 7); o.position.x += (tx - o.position.x) * k2; o.position.z += (tz - o.position.z) * k2; arm.position.y += (ty - arm.position.y) * k2; arm.rotation.x += (tilt - arm.rotation.x) * k2;
      const ring = slamRings.get(e); if (ring) { ring.visible = e.state === 'wind' || e.state === 'slam'; ring.position.x = e.tx; ring.position.z = e.ty; if (e.state === 'wind') { const kk = 1 - e.t / 0.75; ring.scale.setScalar(1.7 * (0.35 + 0.65 * kk)); ring.material.opacity = 0.4 + 0.5 * kk; ring.material.color.set(0xff4a4a); } else { ring.scale.setScalar(1.7); ring.material.opacity = 0.9; ring.material.color.set(0xffffff); } }
      sh.position.x = o.position.x; sh.position.z = o.position.z;
    }
  }
  const live = new Set();
  for (const fl of d.flies) {
    const alive = fl.alive; if (!alive && (!fl.died || d.t - fl.died > 1.6)) continue; live.add(fl.id); const m = flyMesh(fl);
    const hop = fl.dash > 0 ? 0.35 : 0; m.g.position.set(fl.x, 0.55 + hop + Math.sin(t * 7 + m.phase) * 0.04, fl.y); m.g.rotation.y = Math.PI / 2 - fl.h;
    if (alive) {
      m.body.rotation.set(fl.dash > 0 ? -0.5 : 0, 0, 0); m.body.scale.set(1, 1, fl.dash > 0 ? 1.25 : 1); m.body.visible = !(fl.hurt > 0 && Math.floor(fl.hurt * 14) % 2);
      for (const w of m.wings) w.p.rotation.z = w.s * (0.2 + Math.sin(t * m.flapSpeed + m.phase) * m.flapAmp); m.shadow.position.y = -0.53 - hop;
      m.parts.forEach((p) => p.material.emissive.setHex(fl === S.sel ? 0x5a4a14 : fl.eatT > 0 ? 0x6a5a14 : 0x2a1c0a)); m.glow.visible = true; m.glow.material.color.setHex(fl === S.sel ? 0xffc83c : 0x46d6c4); m.glow.material.opacity = fl === S.sel ? 0.8 : 0.5;
    } else { m.glow.visible = false; m.body.rotation.set(0, 0, Math.PI); m.body.visible = true; for (const w of m.wings) w.p.rotation.z = 0; m.body.scale.set(1, 1, 1); m.g.position.y = 0.25; }
  }
  for (const [id, m] of flyMeshes) if (!live.has(id)) { scene.remove(m.g); flyMeshes.delete(id); }
  if (S.sel && S.sel.alive) { selRing.visible = true; selRing.position.set(S.sel.x, 0.04, S.sel.y); selRing.scale.setScalar(1 + 0.08 * Math.sin(t * 6)); } else selRing.visible = false;
  const pos = partsPts.geometry.attributes.position.array, col = partsPts.geometry.attributes.color.array; let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.z += p.vz * dt; p.vy -= 6 * dt; p.y = Math.max(0.05, p.y + p.vy * dt); }
  for (const p of parts) { if (n >= 400) break; pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z; col[n * 3] = p.c.r; col[n * 3 + 1] = p.c.g; col[n * 3 + 2] = p.c.b; n++; }
  for (let i = n; i < 400; i++) pos[i * 3 + 1] = -50;
  partsPts.geometry.attributes.position.needsUpdate = true; partsPts.geometry.attributes.color.needsUpdate = true;
  for (const fl of d.flies) if (fl.alive) { const ex = Math.floor(fl.x), ey = Math.floor(fl.y); for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const nx = ex + i, ny = ey + j; if (nx >= 0 && ny >= 0 && nx < L.W && ny < L.H && i * i + j * j < 26) S.explored[ny * L.W + nx] = 1; } }
  const hf = S.sel && S.sel.alive ? S.sel : null; sound.hum(hf && !S.paused ? clamp(hf.v / 5, 0.25, 1) * sp(hf.x, hf.y).vol : 0, { fruit: 220, house: 160, gnat: 320 }[dungeon.cfg.type] || 200);
  let danger = 0; for (const fl of d.flies) if (fl.alive) danger = Math.max(danger, fl.esc * 1.2, fl.loom / 0.45); sound.setIntensity(S.paused ? 0 : danger);
  renderer.render(scene, camera);
  overlay(dt);
}
const proj = new THREE.Vector3();
function toScreen(x, y, z) { proj.set(x, y, z).project(camera); return { x: (proj.x * 0.5 + 0.5) * fx.width, y: (-proj.y * 0.5 + 0.5) * fx.height, ok: proj.z < 1 }; }
function label(txt, p, color, size = 18) { fxc.font = `${size}px Chewy, Fredoka, sans-serif`; fxc.fillStyle = color; fxc.strokeStyle = '#160d24'; fxc.lineWidth = 5; fxc.lineJoin = 'round'; fxc.strokeText(txt, p.x, p.y); fxc.fillText(txt, p.x, p.y); }
function overlay(dt) {
  fxc.clearRect(0, 0, fx.width, fx.height); fxc.textAlign = 'center';
  for (let i = S.texts.length - 1; i >= 0; i--) { const q = S.texts[i]; q.life -= dt; if (q.life <= 0) { S.texts.splice(i, 1); continue; } const p = toScreen(q.x, 1.2 + (1.3 - q.life) * 0.5, q.z); if (!p.ok) continue; fxc.globalAlpha = Math.min(1, q.life * 2); label(q.t, p, '#ffc83c', 22); } fxc.globalAlpha = 1;
  const f = S.sel; if (f && f.alive) { const p = toScreen(f.x, 1.5, f.y); if (p.ok) label((f.manual ? 'YOU  ' : '') + '#' + f.id + '  gen ' + f.gen, p, '#fff4dd', 20); }
  for (const e of dungeon.L.enemies) if (e.kind === 'bird' && e.state === 'chase') { const p = toScreen(e.x, 2.2, e.y); if (p.ok) label('!', p, '#ff6b8b', 30); }
  const L = dungeon.L; for (const [name, o, color, y] of [['EXIT', L.exit, '#7dffd1', 2.4], ['KEY', L.key, '#ffc83c', 1.4]]) { const p = toScreen(o.x, y, o.y); if (p.ok) label(name, p, color, 17); }
}

// ------------------------------------------------------------------ HUD, objective, charts
const GENE_LABELS = GENE_NAMES;
function hud() {
  const d = dungeon; $('#hLevel').textContent = d.level; $('#hEsc').textContent = `${d.levelEscapes}/3`; $('#hAlive').textContent = d.flies.filter((f) => f.alive).length; $('#hBirths').textContent = d.births; $('#hDeaths').textContent = d.deaths;
  const ro = $('#roster'); const alive = d.flies.filter((f) => f.alive); const idsKey = alive.map((f) => f.id).join(',');
  if (ro.dataset.ids !== idsKey) { ro.dataset.ids = idsKey; ro.innerHTML = ''; for (const f of alive) { const b = document.createElement('button'); b.className = 'fly'; b.dataset.id = f.id; b.innerHTML = `<span class="dot"></span><div><b>#${f.id}</b> gen ${f.gen}<div class="bar"><u></u></div></div><span class="muted"></span>`; b.onclick = () => { if (S.sel && S.sel.manual) S.sel.manual = null; S.sel = f; S.freecam = false; }; ro.appendChild(b); } }
  for (const b of ro.children) { const f = alive.find((q) => q.id === +b.dataset.id); if (!f) continue; b.classList.toggle('sel', f === S.sel); b.querySelector('u').style.width = clamp(f.energy / d.body.maxEnergy, 0, 1) * 100 + '%'; b.querySelector('span.muted').textContent = (f.hasKey ? 'K ' : '') + Math.round(f.progress * 100) + '%'; }
  const f = S.sel; const sel = $('#sel');
  if (f && f.alive) {
    const bar = (n, v, cls = '') => `<div class="gene ${cls}"><span>${n}</span><span class="pillbar"><u style="width:${clamp(v, 0, 1) * 100}%"></u></span><span>${Math.min(100, Math.round(v * 100))}</span></div>`;
    // the real neurons that are firing most in this fly's brain right now (FlyEM instance names and body ids)
    let top = ''; if (ids) { const x = f.brain.x, n = x.length; const best = []; for (let i = 0; i < n; i++) { const v = x[i]; if (v > 0.15 && (best.length < 4 || v > best[best.length - 1][1])) { best.push([i, v]); best.sort((a, b) => b[1] - a[1]); if (best.length > 4) best.pop(); } } top = best.map(([i, v]) => `<div class="neu"><span><b>${ids.instance[i]}</b><small>FlyEM body ${ids.body_id[i]}</small></span><span class="pillbar"><u style="width:${clamp(v, 0, 1) * 100}%"></u></span></div>`).join('') || '<div class="muted">quiet right now</div>'; }
    sel.innerHTML = `<b>Fly #${f.id}</b> gen ${f.gen}${f.manual ? ' (you)' : ''}<br><span class="muted">energy ${Math.round(f.energy)} &middot; honey ${f.honey} &middot; ${f.hasKey ? 'has key' : 'needs key'}${f.parentFit != null ? ` &middot; parent scored ${Math.round(f.parentFit)}` : ''}</span><div style="margin-top:8px"><span class="muted">Real neurons firing now (FlyEM ids)</span>${top}</div><div style="margin-top:8px">${bar('shadow signal', f.loom / 0.5, 'act')}${bar('escape neurons', f.esc, 'act')}${bar('approach neurons', f.app / 0.35, 'act')}${bar('feeding neuron', f.feed / 0.23, 'act')}</div><div style="margin-top:8px"><span class="muted">Evolved genes</span>${f.genes.map((v, i) => bar(GENE_LABELS[i], v)).join('')}</div>`;
    const L = d.L, goal = f.hasKey ? L.exit : L.key, v = (f.hasKey ? L.fieldExit : L.fieldKey)[Math.floor(f.y) * L.W + Math.floor(f.x)];
    const dx = goal.x - f.x, dz = goal.y - f.y, fwd = [-Math.sin(cam.az), -Math.cos(cam.az)], rgt = [Math.cos(cam.az), -Math.sin(cam.az)];
    const ang = Math.atan2(dx * rgt[0] + dz * rgt[1], dx * fwd[0] + dz * fwd[1]); $('#arrow').style.transform = `rotate(${ang}rad)`;
    $('#objText').textContent = `${f.hasKey ? 'Reach the EXIT' : 'Find the KEY'}  ${Math.round(Math.min(v, Math.hypot(dx, dz) * 1.6))} tiles`;
  } else { sel.textContent = 'Click a fly, or press Q.'; $('#objText').textContent = 'Waiting for a fly...'; }
  chart();
}
function chart() {
  const c = $('#chart'), g = c.getContext('2d'), W = c.width, H = c.height; g.clearRect(0, 0, W, H); const h = dungeon.hist; if (!h.length) return;
  g.strokeStyle = 'rgba(255,244,221,.12)'; for (const v of [0, 0.5, 1]) { const y = H - 8 - (H - 16) * v; g.beginPath(); g.moveTo(22, y); g.lineTo(W - 4, y); g.stroke(); g.fillStyle = '#cdbfe0'; g.font = '10px Fredoka, sans-serif'; g.fillText(v.toFixed(1), 2, y + 3); }
  const n = h.length, xs = (i) => 24 + (W - 30) * (n === 1 ? 0.5 : i / (n - 1)), ys = (v) => H - 8 - (H - 16) * clamp(v, 0, 1);
  h.forEach((p, i) => { g.fillStyle = p.escaped ? '#ffc83c' : 'rgba(255,107,139,.6)'; g.fillRect(xs(i) - 1, ys(p.prog) - 1, 3, 3); });
  const w = Math.max(6, Math.round(n / 12)); g.strokeStyle = '#46d6c4'; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath();
  for (let i = 0; i < n; i++) { let s = 0, c2 = 0; for (let j = Math.max(0, i - w); j <= i; j++) { s += h[j].prog; c2++; } const y = ys(s / c2); i ? g.lineTo(xs(i), y) : g.moveTo(xs(i), y); } g.stroke();
  const last = h.slice(-20), m = last.reduce((s, p) => s + p.prog, 0) / last.length, first = h.slice(0, 20), m0 = first.reduce((s, p) => s + p.prog, 0) / first.length;
  $('#chartNote').textContent = `${n} flies so far. Average progress: first 20 flies ${Math.round(m0 * 100)}%, latest 20 flies ${Math.round(m * 100)}%. Gold dots escaped.`;
}

// ------------------------------------------------------------------ minimap + full map
function drawMap(cv, s, full) {
  const d = dungeon, L = d.L; cv.width = L.W * s; cv.height = L.H * s; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#120b24'; g.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    if (!full && !S.explored[y * L.W + x]) continue; const t = L.g[y * L.W + x];
    if (t === T.WALL) { const near = x > 0 && L.g[y * L.W + x - 1] !== T.WALL || x < L.W - 1 && L.g[y * L.W + x + 1] !== T.WALL || y > 0 && L.g[(y - 1) * L.W + x] !== T.WALL || y < L.H - 1 && L.g[(y + 1) * L.W + x] !== T.WALL; if (!near) continue; g.fillStyle = '#7a68b0'; }
    else g.fillStyle = t === T.SPIKE ? '#e0707c' : '#3d2f68';
    g.fillRect(x * s, y * s, s, s);
  }
  for (const h of L.honey) if (!h.taken && (full || S.explored[Math.floor(h.y) * L.W + Math.floor(h.x)])) { g.fillStyle = '#ffc83c'; g.fillRect(h.x * s - 1, h.y * s - 1, Math.max(2, s * 0.6), Math.max(2, s * 0.6)); }
  const near = (e) => d.flies.some((f) => f.alive && Math.hypot(f.x - e.x, f.y - e.y) < 9);
  for (const e of L.enemies) if (full || near(e)) { g.fillStyle = '#ff6b8b'; g.fillRect(e.x * s - 1, e.y * s - 1, Math.max(3, s * 0.8), Math.max(3, s * 0.8)); }
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250), gs = Math.max(6, s * 2.2);
  g.fillStyle = `rgba(125,255,209,${pulse})`; g.fillRect(L.exit.x * s - gs / 2, L.exit.y * s - gs / 2, gs, gs); g.strokeStyle = '#7dffd1'; g.lineWidth = 1; g.strokeRect(L.exit.x * s - gs / 2, L.exit.y * s - gs / 2, gs, gs);
  g.fillStyle = `rgba(255,200,60,${pulse})`; g.fillRect(L.key.x * s - gs / 2, L.key.y * s - gs / 2, gs, gs); g.strokeStyle = '#ffc83c'; g.strokeRect(L.key.x * s - gs / 2, L.key.y * s - gs / 2, gs, gs);
  g.font = `${Math.max(11, s * 3)}px Chewy, sans-serif`; g.textAlign = 'center'; g.fillStyle = '#7dffd1'; g.fillText('EXIT', L.exit.x * s, L.exit.y * s - gs); g.fillStyle = '#ffc83c'; g.fillText('KEY', L.key.x * s, L.key.y * s - gs);
  g.fillStyle = '#b9a6ff'; g.fillRect(L.start.x * s - 2, L.start.y * s - 2, 4, 4);
  for (const f of d.flies) if (f.alive) { const sel = f === S.sel; g.fillStyle = sel ? '#ffffff' : '#46d6c4'; const r = sel ? Math.max(3, s) : Math.max(2, s * 0.7); g.fillRect(f.x * s - r, f.y * s - r, r * 2, r * 2); if (sel) { g.strokeStyle = '#ffc83c'; g.lineWidth = 2; g.strokeRect(f.x * s - r - 2, f.y * s - r - 2, r * 2 + 4, r * 2 + 4); } }
}
function minimap() { if (!dungeon) return; const L = dungeon.L; drawMap($('#mini'), Math.max(2, Math.min(4, Math.floor(230 / L.W))), false); }
function bigMap() { const L = dungeon.L; const s = Math.max(4, Math.floor(Math.min(innerWidth * 0.94 / L.W, innerHeight * 0.76 / L.H))); drawMap($('#bigmap'), s, true); }

// ------------------------------------------------------------------ boot
function wireUI() {
  addEventListener('pointerdown', () => sound.unlock());
  document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('.btn,.type,.seg button,.arrow,.backbtn,.topbtns button,.panel button,.fly,.stat button,.soundbtn'); if (t && !t.disabled && t !== wireUI.lastHover) { sound.play('hover'); } wireUI.lastHover = t; });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (!b || b.disabled) return; if (b.dataset.poke) return; const s = b.dataset.snd || (b.id === 'bBack' || b.id === 'bBrainBack' ? 'back' : b.id === 'bStart' ? 'start' : b.id === 'bPause' || b.id === 'bMenu' || b.id === 'bResume' || b.id === 'bSound' || b.id === 'bSoundMenu' ? '' : 'click'); if (s) sound.play(s); });
  $('#bSound').onclick = toggleMute; $('#bSoundMenu').onclick = toggleMute;
  const vm = $('#volMusic'), vs = $('#volSfx'); vm.value = sound.music; vs.value = sound.sfx; vm.oninput = () => sound.setMusic(+vm.value); vs.oninput = () => { sound.setSfx(+vs.value); sound.play('eat', { vol: 0.6 }); };
  $('#bSound').classList.toggle('off', sound.muted); $('#bSoundMenu').classList.toggle('off', sound.muted);
  $('#bPlay').onclick = () => { buildSetup(); show('setup'); };
  $('#bBrain').onclick = () => { show('brainScreen'); initBrainScreen(); };
  $('#bBrainBack').onclick = () => show('menu');
  $('#bBack').onclick = () => show('menu');
  $('#bHow').onclick = () => $('#dlgHow').showModal();
  $('#bStart').onclick = startGame;
  $('#bPrev').onclick = () => chooseType(flyTypes[(flyTypes.indexOf(S.type) + flyTypes.length - 1) % flyTypes.length]);
  $('#bNext').onclick = () => chooseType(flyTypes[(flyTypes.indexOf(S.type) + 1) % flyTypes.length]);
  document.querySelectorAll('[data-poke]').forEach((b) => b.onclick = () => poke(b.dataset.poke));
  seg('segSize', 'size'); seg('segN', 'n', (v) => +v); seg('segBrain', 'brain');
  $('#bPause').onclick = togglePause; $('#bMenu').onclick = () => openMenu(true); $('#bResume').onclick = () => openMenu(false); $('#bQuit').onclick = backToMenu; $('#bMap').onclick = toggleMap;
  document.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => setSpeed(+b.dataset.speed));
  $('#tL').onclick = () => tog('L'); $('#tK').onclick = () => tog('K');
}
wireUI(); S.stats = { ...TYPES.fruit.base };
loadAll().then(() => {
  stage = new Stage3D($('#stage'), { brickTex: tileTex(11, 69) }); requestAnimationFrame(stageLoop); show('menu');
  $('#stage').addEventListener('pointerdown', () => { if (S.screen === 'menu') { stage.pulse(); sound.play('zip'); } });
  const b = $('#bStart'); b.disabled = false; b.textContent = 'Enter the dungeon';
  const qs = new URLSearchParams(location.search);       // ?screen=setup|brain, ?play=house&brain=evolved&warp=60&map=1 : used for screenshots/tests
  if (qs.get('screen') === 'setup') { if (qs.get('type')) S.type = qs.get('type'); S.stats = { ...TYPES[S.type].base }; buildSetup(); show('setup'); stage.tick(0.05); }
  if (qs.get('screen') === 'brain') { show('brainScreen'); initBrainScreen(); if (qs.get('poke')) poke(qs.get('poke')); }
  if (qs.get('play')) { S.type = TYPES[qs.get('play')] ? qs.get('play') : 'fruit'; S.stats = { ...TYPES[S.type].base }; S.brain = qs.get('brain') || 'naive'; if (qs.get('size')) S.size = qs.get('size'); startGame(); const w = +qs.get('warp') || 0; for (let i = 0; i < w * 20; i++) dungeon.step(); drain(); selectLeader(); snapCamera(); if (qs.get('az')) cam.az = +qs.get('az'); if (qs.get('map')) toggleMap(); }
}).catch((e) => { $('#bStart').textContent = 'Could not load data. Serve over http.'; console.error(e); });
window.__sound = sound;
window.__dungeon = { get d() { return dungeon; }, S, cam, get stage() { return stage; } };
