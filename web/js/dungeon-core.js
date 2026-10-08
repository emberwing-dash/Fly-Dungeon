// Fly Dungeon: core simulation (no DOM; runs in the browser and in Node for headless evolution tests).
//
// Every fly has a live copy of the same connectome brain slice (colony-core's FlyBrain). The brain decides WHETHER to
// flee (looming enemies -> escape neurons), WHETHER to push toward the smell of the objective (approach neurons) and
// WHETHER it can eat honey (taste relay -> proboscis neuron). A simple taxis controller supplies WHERE to go.
// Eight brain genes per fly are evolved: when a fly dies, the next one hatches from the best past brains, mutated.

import { FlyBrain, GENE_NAMES, NG, rng, randomGenome } from './colony-core.js';
export { GENE_NAMES, NG, rng, randomGenome };

export const T = { FLOOR: 0, WALL: 1, SPIKE: 2 };
export const BRAIN_EVERY = 3;
export const DT = 0.05;

// ------------------------------------------------------------------ fly types and stats
export const TYPES = {
  fruit: { name: 'Fruit fly', blurb: 'Drosophila melanogaster. The species whose wiring this brain comes from. Balanced.', base: { speed: 3, stamina: 3, senses: 3, reflex: 3 }, mult: { speed: 1, energy: 1, senses: 1, reflex: 1, hit: 0.26, dmg: 1 } },
  house: { name: 'House fly', blurb: 'Fast and tough, but a little short-sighted.', base: { speed: 4, stamina: 4, senses: 2, reflex: 2 }, mult: { speed: 1.15, energy: 1.15, senses: 0.85, reflex: 1, hit: 0.3, dmg: 1 } },
  gnat: { name: 'Gnat', blurb: 'Tiny. Slips through gaps and has twitchy reflexes, but runs out of energy quickly.', base: { speed: 3, stamina: 2, senses: 3, reflex: 4 }, mult: { speed: 1, energy: 0.8, senses: 1, reflex: 1.2, hit: 0.17, dmg: 1.1 } },
};
export const STAT_KEYS = ['speed', 'stamina', 'senses', 'reflex'];
export const FREE_POINTS = 6;
export function bodyOf(type, stats) {
  const t = TYPES[type], m = t.mult;
  return {
    type, vmax: (1.6 + 0.4 * stats.speed) * m.speed,
    maxEnergy: (55 + 11 * stats.stamina) * m.energy, decay: 1.1,
    sense: (0.65 + 0.14 * stats.senses) * m.senses,
    dashSpeed: (6 + 0.9 * stats.reflex) * m.reflex, dashCool: Math.max(0.5, 1.5 - 0.1 * stats.reflex), dashTime: 0.28,
    hit: m.hit, dmg: m.dmg,
  };
}
export function decodeGenes(g) {
  return { eS: 0.5 + 1.5 * g[0], iS: 0.3 + 2.2 * g[1], loomGain: 0.5 + 2.0 * g[2], foodGain: 0.5 + 2.5 * g[3], escThr: 0.08 + 0.8 * g[4], appThr: 0.01 + 0.25 * g[5], speedMul: 0.7 + 0.7 * g[6], wander: g[7] };
}

// ------------------------------------------------------------------ dungeon generation
const SIZES = { small: [44, 30, 6], medium: [60, 38, 8], large: [80, 48, 11] };
export function generate(level0, seed, size = 'medium') {
  const level = Math.min(level0, 8); // enemy density stops growing at level 8
  const rand = rng(seed * 7919 + level0 * 104729);
  const [W, H, nRooms0] = SIZES[size] || SIZES.medium; const nRooms = nRooms0 + Math.min(4, level - 1);
  const g = new Uint8Array(W * H).fill(T.WALL);
  const at = (x, y) => y * W + x;
  const rooms = [];
  for (let tries = 0; tries < 400 && rooms.length < nRooms; tries++) {
    const w = 5 + Math.floor(rand() * 5), h = 4 + Math.floor(rand() * 4), x = 2 + Math.floor(rand() * (W - w - 4)), y = 2 + Math.floor(rand() * (H - h - 4));
    if (rooms.some((r) => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[at(i, j)] = T.FLOOR;
  }
  const carve = (x0, y0, x1, y1) => { // 2-wide L corridor
    let x = x0, y = y0; const sx = Math.sign(x1 - x0) || 1, sy = Math.sign(y1 - y0) || 1;
    while (x !== x1) { g[at(x, y)] = T.FLOOR; g[at(x, y + 1)] = T.FLOOR; x += sx; }
    while (y !== y1) { g[at(x, y)] = T.FLOOR; g[at(x + 1, y)] = T.FLOOR; y += sy; }
    g[at(x, y)] = T.FLOOR; g[at(x + 1, y)] = T.FLOOR; g[at(x, y + 1)] = T.FLOOR;
  };
  for (let i = 1; i < rooms.length; i++) carve(rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);
  for (let i = 0; i < 2 + level; i++) { const a = rooms[Math.floor(rand() * rooms.length)], b = rooms[Math.floor(rand() * rooms.length)]; if (a !== b) carve(a.cx, a.cy, b.cx, b.cy); } // loops
  const pass = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[at(x, y)] !== T.WALL;
  // distances from start room to rooms (BFS, floor only)
  const bfs = (sx, sy) => { const d = new Int32Array(W * H).fill(-1); const q = [at(sx, sy)]; d[q[0]] = 0; for (let h = 0; h < q.length; h++) { const c = q[h], x = c % W, y = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (pass(nx, ny) && d[at(nx, ny)] < 0) { d[at(nx, ny)] = d[c] + 1; q.push(at(nx, ny)); } } } return d; };
  const start = rooms[0]; const d0 = bfs(start.cx, start.cy);
  let exit = rooms[1], best = -1; for (const r of rooms.slice(1)) if (d0[at(r.cx, r.cy)] > best) { best = d0[at(r.cx, r.cy)]; exit = r; }
  const others = rooms.filter((r) => r !== start && r !== exit);
  const keyRoom = others.length ? others[Math.floor(rand() * others.length)] : start;
  const floorIn = (r) => ({ x: r.x + 1 + Math.floor(rand() * (r.w - 2)) + 0.5, y: r.y + 1 + Math.floor(rand() * (r.h - 2)) + 0.5 });
  const level_ = { W, H, g, rooms, start: { x: start.cx + 0.5, y: start.cy + 0.5 }, exit: { x: exit.cx + 0.5, y: exit.cy + 0.5 }, key: { x: keyRoom.cx + 0.5, y: keyRoom.cy + 0.5 }, honey: [], enemies: [], level: level0, seed, pass };
  for (const r of rooms) if (r !== start) for (let i = 0; i < (r === keyRoom || r === exit ? 2 : 1 + (rand() < 0.5 ? 1 : 0)); i++) { const p = floorIn(r); level_.honey.push({ x: p.x, y: p.y, taken: false }); }
  // spikes: scattered on floor away from start/key/exit
  const far = (p, q, d) => Math.hypot(p.x - q.x, p.y - q.y) > d;
  for (let i = 0, n = 6 + 3 * level; i < n; i++) { const r = rooms[Math.floor(rand() * rooms.length)]; const p = floorIn(r); const tx = Math.floor(p.x), ty = Math.floor(p.y); if (far(p, level_.start, 6) && far(p, level_.key, 2.5) && far(p, level_.exit, 2.5)) g[at(tx, ty)] = T.SPIKE; }
  // enemies
  const floors = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[at(x, y)] === T.FLOOR) floors.push({ x: x + 0.5, y: y + 0.5 });
  const pick = (minStart) => { for (let k = 0; k < 60; k++) { const p = floors[Math.floor(rand() * floors.length)]; if (far(p, level_.start, minStart)) return p; } return floors[0]; };
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0, n = 3 + 2 * level; i < n; i++) { const p = pick(9), d = dirs[Math.floor(rand() * 4)]; const spiked = level >= 2 && rand() < 0.4; level_.enemies.push({ kind: 'patrol', spiked, x: p.x, y: p.y, dx: d[0], dy: d[1], speed: spiked ? 2.1 : 1.5, size: 0.8, anim: rand() * 8, alive: true }); }
  for (let i = 0, n = 2 + level; i < n; i++) { const p = pick(8); level_.enemies.push({ kind: 'slime', color: i % 2 ? 'pink' : 'green', x: p.x, y: p.y, hx: p.x, hy: p.y, size: 0.7, anim: rand() * 8, vx: 0, vy: 0, t: 0 }); }
  const birdHomes = [exit, keyRoom, ...others].slice(0, 1 + Math.floor((level + 1) / 2));
  for (const r of birdHomes) { const p = floorIn(r); level_.enemies.push({ kind: 'bird', x: p.x, y: p.y, hx: p.x, hy: p.y, size: 0.9, anim: Math.random() * 4, state: 'idle', speed: 3.0 }); }
  for (let i = 0, n = 1 + level; i < n; i++) { const r = others.length ? others[Math.floor(rand() * others.length)] : exit; const p = floorIn(r); level_.enemies.push({ kind: 'human', x: p.x, y: p.y, size: 1.2, state: 'idle', t: 0, cool: 0, tx: 0, ty: 0, anim: 0 }); }
  level_.fieldKey = flowField(level_, level_.key); level_.fieldExit = flowField(level_, level_.exit);
  level_.dKey0 = level_.fieldKey[at(Math.floor(level_.start.x), Math.floor(level_.start.y))]; level_.dExit0 = level_.fieldExit[at(Math.floor(level_.key.x), Math.floor(level_.key.y))];
  return level_;
}
/** Dijkstra distance-to-target over passable tiles; spikes cost extra so paths avoid them when they can. */
export function flowField(L, target) {
  const { W, H, g } = L; const d = new Float32Array(W * H).fill(1e9);
  const src = Math.floor(target.y) * W + Math.floor(target.x); d[src] = 0; const heap = [[0, src]];
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) { const [c, u] = pop(); if (c > d[u]) continue; const x = u % W, y = (u / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const v = ny * W + nx, t = g[v]; if (t === T.WALL) continue; const nc = c + (t === T.SPIKE ? 9 : 1); if (nc < d[v]) { d[v] = nc; push([nc, v]); } } }
  return d;
}

// ------------------------------------------------------------------ world
export class Dungeon {
  /** wiring: colony-core Wiring. config: {type, stats, size, flies, lesion} */
  constructor(wiring, config, seed = 1) {
    this.W = wiring; this.cfg = config; this.body = bodyOf(config.type, config.stats); this.rand = rng(seed * 31 + 7);
    this.level = 0; this.seed = seed; this.t = 0; this.tick = 0; this.births = 0; this.deaths = 0; this.escapes = 0; this.levelEscapes = 0;
    this.flies = []; this.archive = []; this.hist = []; this.events = []; this.nextId = 1; this.queue = 0; this.lesion = { loom: false, taste: false };
    this.nextLevel();
  }
  nextLevel() { this.level++; this.L = generate(this.level, this.seed, this.cfg.size); this.levelEscapes = 0; for (const f of this.flies) f.alive = false; this.flies = []; this.t = 0; this.events.push({ type: 'level', level: this.level }); for (let i = 0; i < this.cfg.flies; i++) this.spawn(); }
  setLesions(loom, taste) { this.lesion = { loom, taste }; this.W.setLesions(loom, taste); }
  pickGenes() {
    const A = this.archive; if (!A.length) return { genes: randomGenome(this.rand), parent: null };
    // tournament over the best past flies, then mutate. More success = smaller mutations (they hold a good brain).
    const top = A.slice().sort((a, b) => b.fit - a.fit).slice(0, Math.max(6, Math.round(A.length * 0.3)));
    let p = top[Math.floor(this.rand() * top.length)]; const q = top[Math.floor(this.rand() * top.length)]; if (q.fit > p.fit) p = q;
    const sigma = Math.max(0.04, 0.2 * Math.pow(0.985, this.births));
    const g = p.genes.map((v) => Math.max(0, Math.min(1, v + gauss(this.rand) * sigma)));
    if (this.rand() < 0.08) g[Math.floor(this.rand() * NG)] = this.rand();
    return { genes: g, parent: p };
  }
  spawn() {
    const { genes, parent } = this.pickGenes(); const id = this.nextId++; this.births++;
    const f = { id, genes, p: decodeGenes(genes), gen: parent ? parent.gen + 1 : 1, parentFit: parent ? parent.fit : null, x: this.L.start.x + (this.rand() - 0.5) * 2, y: this.L.start.y + (this.rand() - 0.5) * 2, h: 0, v: 0, energy: this.body.maxEnergy, alive: true, age: 0, hasKey: false, honey: 0,
      brain: new FlyBrain(this.W), dash: 0, dx: 0, dy: 0, cool: 0, esc: 0, app: 0, feed: 0, loom: 0, sp: 0, st: 0, thr: null, hurt: 0, progress: 0, bestProg: 0, cause: '', wanderA: this.rand() * 6.28, manual: null, eatT: 0, hopT: 0, escaped: false, lane: (this.rand() - 0.5) * 1.2 };
    this.flies.push(f); return f;
  }
  field(f) { return f.hasKey ? this.L.fieldExit : this.L.fieldKey; }
  progressOf(f) { const L = this.L, v = this.field(f)[Math.floor(f.y) * L.W + Math.floor(f.x)]; if (!f.hasKey) return 0.5 * Math.max(0, 1 - v / Math.max(1, L.dKey0)); return 0.5 + 0.5 * Math.max(0, 1 - v / Math.max(1, L.dExit0)); }
  fitnessOf(f) { return 100 * f.bestProg + (f.escaped ? 80 : 0) + 6 * f.honey + 0.12 * f.age; }
  solid(x, y) { const L = this.L; const tx = Math.floor(x), ty = Math.floor(y); return tx < 0 || ty < 0 || tx >= L.W || ty >= L.H || L.g[ty * L.W + tx] === T.WALL; }
  los(ax, ay, bx, by) { const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2); for (let i = 1; i < n; i++) { const t = i / n; if (this.solid(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; } return true; }
  move(f, dx, dy) { const r = this.body.hit; const nx = f.x + dx; if (!this.solid(nx + Math.sign(dx) * r, f.y - r) && !this.solid(nx + Math.sign(dx) * r, f.y + r)) f.x = nx; const ny = f.y + dy; if (!this.solid(f.x - r, ny + Math.sign(dy) * r) && !this.solid(f.x + r, ny + Math.sign(dy) * r)) f.y = ny; }

  kill(f, cause) { if (!f.alive) return; f.alive = false; f.cause = cause; f.died = this.t; this.deaths++; const fit = this.fitnessOf(f); this.archive.push({ genes: f.genes, fit, gen: f.gen }); if (this.archive.length > 120) this.archive.shift(); this.hist.push({ n: this.hist.length + 1, fit, prog: f.bestProg, escaped: false, gen: f.gen }); this.events.push({ type: 'death', id: f.id, cause, fit, prog: f.bestProg, gen: f.gen, x: f.x, y: f.y }); this.queue++; }
  escape(f) { if (!f.alive) return; f.alive = false; f.escaped = true; this.escapes++; this.levelEscapes++; const fit = this.fitnessOf(f); this.archive.push({ genes: f.genes, fit, gen: f.gen }); this.hist.push({ n: this.hist.length + 1, fit, prog: 1, escaped: true, gen: f.gen }); this.events.push({ type: 'escape', id: f.id, gen: f.gen, fit }); this.queue++; }
  damage(f, amt, from) { if (f.dash > 0 || f.hurt > 0) return; f.energy -= amt * this.body.dmg; f.hurt = 0.7; const dx = f.x - from.x, dy = f.y - from.y, m = Math.hypot(dx, dy) || 1; this.move(f, dx / m * 0.6, dy / m * 0.6); this.events.push({ type: 'hurt', id: f.id, x: f.x, y: f.y }); if (f.energy <= 0) this.kill(f, 'killed'); }

  step() {
    const dt = DT, b = this.body, L = this.L; this.t += dt; this.tick++;
    for (const e of L.enemies) this.stepEnemy(e, dt);
    for (const h of L.honey) if (h.taken && this.t >= h.regrow) h.taken = false;
    for (const f of this.flies) if (f.alive) this.stepFly(f, dt);
    // refill population as flies die (new, smarter brains hatch at the entrance)
    while (this.queue > 0 && this.flies.filter((f) => f.alive).length < this.cfg.flies) { this.queue--; const f = this.spawn(); this.events.push({ type: 'birth', id: f.id, gen: f.gen, parentFit: f.parentFit }); }
    if (this.levelEscapes >= 3) this.nextLevel();
    if (this.flies.length > 60) this.flies = this.flies.filter((f) => f.alive || this.t - (f.died ?? this.t) < 4);
  }
  stepEnemy(e, dt) {
    const L = this.L; e.anim += dt * 8;
    const nearest = () => { let best = null, bd = 1e9; for (const f of this.flies) if (f.alive) { const d = Math.hypot(f.x - e.x, f.y - e.y); if (d < bd) { bd = d; best = f; } } return { f: best, d: bd }; };
    if (e.kind === 'patrol') {
      const nx = e.x + e.dx * e.speed * dt, ny = e.y + e.dy * e.speed * dt;
      if (this.solid(nx + e.dx * 0.5, ny + e.dy * 0.5)) { const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, c]) => !this.solid(e.x + a * 0.9, e.y + c * 0.9) && !(a === -e.dx && c === -e.dy)); const d = open.length ? open[Math.floor(this.rand() * open.length)] : [-e.dx, -e.dy]; e.dx = d[0]; e.dy = d[1]; } else { e.x = nx; e.y = ny; }
      if (this.rand() < 0.002) { const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(this.rand() * 4)]; if (!this.solid(e.x + d[0] * 0.9, e.y + d[1] * 0.9)) { e.dx = d[0]; e.dy = d[1]; } }
    } else if (e.kind === 'slime') {
      e.t -= dt; if (e.t <= 0) { const a = this.rand() * 6.28; e.vx = Math.cos(a) * 0.5; e.vy = Math.sin(a) * 0.5; e.t = 1 + this.rand() * 2; }
      const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt; if (!this.solid(nx, ny) && Math.hypot(nx - e.hx, ny - e.hy) < 3) { e.x = nx; e.y = ny; }
    } else if (e.kind === 'bird') {
      const { f, d } = nearest();
      if (e.state === 'idle' && f && d < 6 && this.los(e.x, e.y, f.x, f.y)) e.state = 'chase';
      if (e.state === 'chase') { if (!f || d > 10 || Math.hypot(e.x - e.hx, e.y - e.hy) > 14) e.state = 'home'; else { const dx = f.x - e.x, dy = f.y - e.y, m = Math.hypot(dx, dy) || 1; this.moveEnemy(e, dx / m * e.speed * dt, dy / m * e.speed * dt); e.face = dx; } }
      if (e.state === 'home') { const dx = e.hx - e.x, dy = e.hy - e.y, m = Math.hypot(dx, dy); if (m < 0.3) e.state = 'idle'; else this.moveEnemy(e, dx / m * 2.2 * dt, dy / m * 2.2 * dt); }
    } else if (e.kind === 'human') {
      e.cool = Math.max(0, e.cool - dt);
      const { f, d } = nearest();
      if (e.state === 'idle' && e.cool <= 0 && f && d < 3.6 && this.los(e.x, e.y, f.x, f.y)) { e.state = 'wind'; e.t = 0.75; e.tx = f.x; e.ty = f.y; }
      else if (e.state === 'wind') { e.t -= dt; if (e.t <= 0) { e.state = 'slam'; e.t = 0.25; for (const q of this.flies) if (q.alive && Math.hypot(q.x - e.tx, q.y - e.ty) < 1.7) this.damage(q, 75, { x: e.tx, y: e.ty }); this.events.push({ type: 'slam', x: e.tx, y: e.ty }); } }
      else if (e.state === 'slam') { e.t -= dt; if (e.t <= 0) { e.state = 'idle'; e.cool = 1.8; } }
    }
    // contact damage
    if (e.kind !== 'human') for (const f of this.flies) if (f.alive && Math.hypot(f.x - e.x, f.y - e.y) < e.size * 0.5 + this.body.hit) this.damage(f, e.kind === 'bird' ? 28 : e.kind === 'slime' ? 14 : e.spiked ? 30 : 20, e);
  }
  moveEnemy(e, dx, dy) { if (!this.solid(e.x + dx, e.y)) e.x += dx; if (!this.solid(e.x, e.y + dy)) e.y += dy; }

  stepFly(f, dt) {
    const L = this.L, b = this.body, p = f.p;
    f.age += dt; f.cool = Math.max(0, f.cool - dt); f.hurt = Math.max(0, f.hurt - dt); f.eatT = Math.max(0, f.eatT - dt);
    // ---- sensors + brain
    if ((this.tick + f.id) % BRAIN_EVERY === 0) {
      let sl = 0, thr = null, td = 1e9;
      for (const e of L.enemies) {
        const dx = f.x - e.x, dy = f.y - e.y, d = Math.hypot(dx, dy); if (d > 9) continue;
        if (e.kind === 'human' && e.state !== 'wind' && d > 4) continue;
        if (!this.los(e.x, e.y, f.x, f.y)) continue;
        const ang = 2 * Math.atan(e.size * (e.kind === 'human' && e.state === 'wind' ? 1.8 : 1) / Math.max(d, 0.4)); const v = Math.min(1, ang / 1.2) * 0.5; if (v > sl) sl = v; if (d < td) { td = d; thr = e; }
      }
      f.thr = thr; sl = Math.min(0.6, sl * p.loomGain * b.sense);
      const fld = this.field(f), v = fld[Math.floor(f.y) * L.W + Math.floor(f.x)], dmax = f.hasKey ? L.dExit0 : L.dKey0;
      f.sp = Math.min(1, p.foodGain * b.sense * (0.25 + 0.75 * Math.max(0, 1 - v / Math.max(1, dmax * 1.1))));
      let hn = null, hd = 1e9; for (const h of L.honey) if (!h.taken) { const d = Math.hypot(f.x - h.x, f.y - h.y); if (d < hd) { hd = d; hn = h; } }
      f.honeyNear = hn && hd < 1.0 ? hn : null; f.st = f.honeyNear ? 1 : 0;
      f.brain.step(sl, f.sp, f.st, { eS: p.eS, iS: p.iS });
      f.esc = f.brain.mean(this.W.escape); f.app = f.brain.mean(this.W.approach); f.feed = f.brain.mean(this.W.feed); f.loom = sl;
    }
    // ---- motor: the brain decides whether; taxis decides where
    let vx = 0, vy = 0, speed = 0;
    if (f.dash > 0) { f.dash -= dt; vx = f.dx * b.dashSpeed; vy = f.dy * b.dashSpeed; speed = b.dashSpeed; }
    else if (f.esc >= p.escThr && f.cool <= 0 && f.thr) {
      let dx = f.x - f.thr.x, dy = f.y - f.thr.y; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      // do not dash into a wall: nudge toward open space
      for (let k = 0; k < 8 && this.solid(f.x + dx * 1.2, f.y + dy * 1.2); k++) { const a = Math.atan2(dy, dx) + (k % 2 ? 1 : -1) * 0.5 * Math.ceil(k / 2); dx = Math.cos(a); dy = Math.sin(a); }
      f.dx = dx; f.dy = dy; f.dash = b.dashTime; f.cool = b.dashCool; f.energy -= 3; f.hopT = 0.3; this.events.push({ type: 'dash', id: f.id });
    } else if (f.honeyNear && f.feed >= 0.115) {
      f.honeyNear.taken = true; f.energy = Math.min(b.maxEnergy, f.energy + 38); f.honey++; f.eatT = 0.7; this.events.push({ type: 'eat', id: f.id, x: f.honeyNear.x, y: f.honeyNear.y }); f.honeyNear.regrow = this.t + 25;
    } else if (f.manual) { const m = f.manual; const l = Math.hypot(m.x, m.y); if (l > 0) { vx = m.x / l * b.vmax * 1.05; vy = m.y / l * b.vmax * 1.05; speed = b.vmax; } }
    else if (f.app >= p.appThr) {
      const d = this.steer(f); if (d) { const sp = b.vmax * p.speedMul * Math.min(1.2, Math.max(0.35, f.app / 0.3)); vx = d.x * sp; vy = d.y * sp; speed = sp; }
    } else { f.wanderA += (this.rand() - 0.5) * 3 * dt; speed = (0.6 + 1.8 * p.wander) * 0.8; vx = Math.cos(f.wanderA) * speed; vy = Math.sin(f.wanderA) * speed; }
    if (speed > 0.05) { const hx = f.x, hy = f.y; this.move(f, vx * dt, vy * dt); if (Math.hypot(f.x - hx, f.y - hy) < Math.hypot(vx, vy) * dt * 0.4) f.wanderA = this.rand() * 6.28; f.h = Math.atan2(vy, vx); }
    f.v = speed; f.energy -= (b.decay + 0.04 * speed) * dt;
    // ---- spikes, objective, progress
    const tx = Math.floor(f.x), ty = Math.floor(f.y);
    if (L.g[ty * L.W + tx] === T.SPIKE && f.dash <= 0) this.damage(f, 18, { x: tx + 0.5, y: ty + 0.5 });
    if (!f.hasKey && Math.hypot(f.x - L.key.x, f.y - L.key.y) < 0.9) { f.hasKey = true; this.events.push({ type: 'key', id: f.id }); }
    if (f.hasKey && Math.hypot(f.x - L.exit.x, f.y - L.exit.y) < 0.9) { this.escape(f); return; }
    f.progress = this.progressOf(f); if (f.progress > f.bestProg) f.bestProg = f.progress;
    if (f.energy <= 0) this.kill(f, 'starved');
  }
  steer(f) {
    const L = this.L, fld = this.field(f); const x = Math.floor(f.x), y = Math.floor(f.y); let best = fld[y * L.W + x], bd = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= L.W || ny >= L.H) continue; if (dx && dy && (L.g[y * L.W + nx] === T.WALL || L.g[ny * L.W + x] === T.WALL)) continue;
      const v = fld[ny * L.W + nx] + (dx && dy ? 0.4 : 0); if (v < best) { best = v; bd = [dx, dy]; }
    }
    if (!bd) return null; // standing on the target tile
    // aim at the centre of the chosen tile for smooth corners
    let cx = x + bd[0] + 0.5 - f.x, cy = y + bd[1] + 0.5 - f.y; const m0 = Math.hypot(cx, cy) || 1; cx /= m0; cy /= m0; cx += -cy * f.lane * 0.6; cy += cx * f.lane * 0.6; const m = Math.hypot(cx, cy) || 1; return { x: cx / m, y: cy / m };
  }
}
function gauss(rand) { return Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(6.283 * rand()); }
