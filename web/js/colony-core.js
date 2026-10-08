// Fly Dungeon 3D colony core: a population of flies, each with its own live connectome brain, evolving to survive.
// Pure logic (no DOM, no three.js) so the same file runs in the browser and in Node (tools/evolve.mjs).
//
// What is real and what is learned
//   real      : the wiring (6,484 neurons / 193k connections of the male-CNS connectome), signed by neurotransmitter
//   evolved   : the numbers the wiring does not give you: excitatory/inhibitory strength scaling, sensory gains,
//               decision thresholds, speed. 8 genes per fly, selected by survival.
//   supplied  : the body (2D movement, hop physics) and steering direction, like the other embodied fly simulators:
//               the brain decides *whether* to flee / approach / eat, a simple taxis controller decides *where*.

import { PARAMS } from './sim.js';

export const GENE_NAMES = ['excitation', 'inhibition', 'loom gain', 'food gain', 'flee threshold', 'approach threshold', 'speed', 'wander'];
export const NG = GENE_NAMES.length;
export function decode(g) {
  return { eS: 0.5 + 1.5 * g[0], iS: 0.3 + 2.2 * g[1], loomGain: 0.5 + 2.0 * g[2], foodGain: 0.5 + 2.5 * g[3], escThr: 0.08 + 0.8 * g[4], appThr: 0.01 + 0.25 * g[5], vmax: 2 + 4 * g[6], wander: g[7] };
}

export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Shared connectome topology in "push" form (out-edges), so a step only touches active neurons. */
export class Wiring {
  constructor(brain, behaviours, cases) {
    this.n = brain.n; this.ntype = brain.ntype;
    const { indptr, indices, weights, n } = brain;
    const cnt = new Uint32Array(n + 1);
    for (let k = 0; k < indices.length; k++) cnt[indices[k] + 1]++;
    for (let i = 0; i < n; i++) cnt[i + 1] += cnt[i];
    this.outPtr = cnt; this.outTgt = new Uint16Array(indices.length); this.outW = new Float32Array(indices.length);
    const fill = cnt.slice(0, n);
    for (let i = 0; i < n; i++) for (let k = indptr[i]; k < indptr[i + 1]; k++) { const j = indices[k], p = fill[j]++; this.outTgt[p] = i; this.outW[p] = weights[k]; }
    const idx = (names) => { const o = []; for (const nm of names) { const t = brain.typeId(nm); if (t !== undefined) for (const i of brain.byType[t]) o.push(i); } return Int32Array.from(o); };
    const stim = (id) => cases.cases.find((c) => c.id === id).stimulus.types;
    this.loom = idx(stim('loom')); this.prey = idx(stim('prey')); this.taste = idx(stim('taste'));
    this.escape = idx(behaviours.escape.cells); this.approach = idx(behaviours.approach.cells); this.feed = idx(behaviours.feed.cells);
    this.keep = new Float32Array(n).fill(1);
    this.lesionLoom = idx(['LC4', 'LPLC2']); this.lesionTaste = idx(['GNG117']);
    this.u = new Float32Array(n);
  }
  setLesions(loom, taste) {
    this.keep.fill(1);
    if (loom) for (const i of this.lesionLoom) this.keep[i] = 0;
    if (taste) for (const i of this.lesionTaste) this.keep[i] = 0;
  }
}

/** One fly's brain: persistent state, advanced one step per tick. Same update rule as sim.js, with evolved scalings. */
export class FlyBrain {
  constructor(wiring) { this.w = wiring; this.x = new Float32Array(wiring.n); this.drv = new Float32Array(wiring.n); }
  step(sLoom, sPrey, sTaste, p) {
    const W = this.w, n = W.n, x = this.x, u = W.u, drv = this.drv, ptr = W.outPtr, tgt = W.outTgt, ow = W.outW;
    u.fill(0);
    for (let j = 0; j < n; j++) {
      const xj = x[j]; if (xj < 1e-3) continue;
      for (let k = ptr[j], e = ptr[j + 1]; k < e; k++) { const w = ow[k]; u[tgt[k]] += (w > 0 ? p.eS : p.iS) * w * xj; }
    }
    for (const i of W.loom) drv[i] = sLoom; for (const i of W.prey) drv[i] = sPrey; for (const i of W.taste) drv[i] = sTaste;
    const { GAIN, THETA, ALPHA } = PARAMS, keep = W.keep;
    for (let i = 0; i < n; i++) { let v = GAIN * u[i] + drv[i] - THETA; v = v < 0 ? 0 : v > 1 ? 1 : v; x[i] = (1 - ALPHA) * x[i] + ALPHA * v * keep[i]; }
  }
  mean(ix) { let s = 0; for (const i of ix) s += this.x[i]; return ix.length ? s / ix.length : 0; }
}

export const BRAIN_EVERY = 3;   // each fly's brain steps every 3rd tick (0.15 s), staggered across flies
export const CFG = { R: 28, NF: 28, NB: 8, dt: 0.05, tmax: 60, e0: 50, decay: 1.7, eatGain: 32, hopCost: 7, moveCost: 0.12, swR: 3.2, swH: 14, swSpeed: 10 };

export class World {
  constructor(wiring, genomes, seed = 1, cfg = CFG) {
    this.W = wiring; this.cfg = cfg; this.rand = rng(seed); this.t = 0; this.over = false;
    this.lesion = { loom: false, taste: false };
    this.berries = []; this.swatters = []; this.events = [];
    this.flies = genomes.map((g, i) => this.makeFly(g, i));
    for (let i = 0; i < cfg.NB; i++) this.berries.push(this.newBerry());
    this.nextSw = 2.0;
  }
  makeFly(g, id) {
    const a = this.rand() * 6.283, r = Math.sqrt(this.rand()) * (this.cfg.R - 4);
    return { id, genes: g, p: decode(g), x: Math.cos(a) * r, z: Math.sin(a) * r, h: this.rand() * 6.283, v: 0, energy: this.cfg.e0, alive: true, age: 0, eaten: 0, hops: 0, brain: new FlyBrain(this.W), burst: 0, bx: 0, bz: 0, cool: 0, hopT: 0, eatT: 0, esc: 0, app: 0, feed: 0, loom: 0, cause: '' };
  }
  nearestBerry(f) { let b = null, d = 1e9; for (const q of this.berries) { const e = Math.hypot(f.x - q.x, f.z - q.z); if (e < d) { d = e; b = q; } } return { b, d }; }
  newBerry() { const a = this.rand() * 6.283, r = Math.sqrt(this.rand()) * (this.cfg.R - 2); return { x: Math.cos(a) * r, z: Math.sin(a) * r }; }
  setLesions(loom, taste) { this.lesion.loom = loom; this.lesion.taste = taste; this.W.setLesions(loom, taste); }
  addSwatter(x, z) { this.swatters.push({ x, z, y: this.cfg.swH, state: 'down', hold: 0, hit: false }); }

  step() {
    const c = this.cfg, dt = c.dt, R = c.R;
    this.t += dt; this.tick = (this.tick || 0) + 1;
    // swatters
    this.nextSw -= dt;
    const alive = this.flies.filter((f) => f.alive);
    if (this.nextSw <= 0 && alive.length) {
      const f = alive[Math.floor(this.rand() * alive.length)];
      this.addSwatter(f.x + (this.rand() - 0.5) * 3, f.z + (this.rand() - 0.5) * 3);
      this.nextSw = Math.max(0.6, 1.5 - this.t / 90) * (0.7 + 0.6 * this.rand());
    }
    for (let i = this.swatters.length - 1; i >= 0; i--) {
      const s = this.swatters[i];
      if (s.state === 'down') { s.y -= c.swSpeed * dt; if (s.y <= 0.3) { s.y = 0.3; s.state = 'hold'; s.hold = 0.45; this.smash(s); } }
      else if (s.state === 'hold') { s.hold -= dt; if (s.hold <= 0) s.state = 'up'; }
      else { s.y += 12 * dt; if (s.y > 20) this.swatters.splice(i, 1); }
    }
    // flies
    for (const f of this.flies) {
      if (!f.alive) continue;
      f.age += dt; f.cool = Math.max(0, f.cool - dt); f.eatT = Math.max(0, f.eatT - dt);
      // sensors + brain (every BRAIN_EVERY ticks, staggered per fly; motor uses the latest readouts in between)
      let thr = f.thr || null;
      const nb0 = this.nearestBerry(f);
      let nb = nb0.b, bd = nb0.d;
      if ((this.tick + f.id) % BRAIN_EVERY === 0) {
        let sl = 0, td = 1e9; thr = null;
        for (const s of this.swatters) {
          if (s.state === 'up') continue;
          const dx = f.x - s.x, dz = f.z - s.z, d = Math.hypot(Math.hypot(dx, dz), s.y);
          const ang = 2 * Math.atan(c.swR / Math.max(d, 0.5));
          const v = Math.min(1, ang / 1.2) * 0.5; if (v > sl) sl = v;
          if (d < td) { td = d; thr = s; }
        }
        f.thr = thr; sl = Math.min(0.6, sl * f.p.loomGain);
        const sp = nb && bd < 16 ? Math.min(1, (1 - bd / 16) * f.p.foodGain) : 0;
        const st = nb && bd < 1.3 ? 1 : 0;
        f.sp = sp; f.st = st;
        f.brain.step(sl, sp, st, f.p);
        f.esc = f.brain.mean(this.W.escape); f.app = f.brain.mean(this.W.approach); f.feed = f.brain.mean(this.W.feed); f.loom = sl;
      }
      const sp = f.sp || 0, st = nb && bd < 1.3 ? (f.st || 0) : 0;
      // motor
      let speed = 0;
      if (f.burst > 0) { f.burst -= dt; f.x += f.bx * dt; f.z += f.bz * dt; speed = 12; f.hopT = f.burst; }
      else if (f.esc >= f.p.escThr && f.cool <= 0 && thr) {
        let dx = f.x - thr.x, dz = f.z - thr.z; const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
        f.bx = dx * 12; f.bz = dz * 12; f.burst = 0.35; f.cool = 0.9; f.hops++; f.energy -= c.hopCost; f.h = Math.atan2(dx, dz);
      } else if (f.feed >= 0.115 && st && nb) {
        // eating (needs the taste relay to work)
        const idx = this.berries.indexOf(nb);
        if (idx >= 0) { this.berries[idx] = this.newBerry(); f.energy = Math.min(100, f.energy + c.eatGain); f.eaten++; f.eatT = 0.6; }
      } else if (f.app >= f.p.appThr && nb && sp > 0) {
        const want = Math.atan2(nb.x - f.x, nb.z - f.z); let d = want - f.h; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
        f.h += Math.max(-4 * dt, Math.min(4 * dt, d)); speed = f.p.vmax * Math.min(1.2, Math.max(0.3, f.app / 0.3));
        f.x += Math.sin(f.h) * speed * dt; f.z += Math.cos(f.h) * speed * dt;
      } else {
        f.h += (this.rand() - 0.5) * 3 * dt; speed = 1.0 + 2 * f.p.wander;
        f.x += Math.sin(f.h) * speed * dt; f.z += Math.cos(f.h) * speed * dt;
      }
      f.v = speed;
      const r = Math.hypot(f.x, f.z); if (r > R) { f.x *= R / r; f.z *= R / r; f.h += Math.PI * 0.6; }
      f.energy -= (c.decay + c.moveCost * speed) * dt;
      if (f.energy <= 0) { f.alive = false; f.cause = 'starved'; f.died = this.t; }
    }
    const left = this.flies.reduce((s, f) => s + (f.alive ? 1 : 0), 0);
    if (this.t >= c.tmax || left <= 1) this.over = true;
  }
  smash(s) {
    for (const f of this.flies) if (f.alive && Math.hypot(f.x - s.x, f.z - s.z) < this.cfg.swR && f.burst <= 0.12) { f.alive = false; f.cause = 'swatted'; f.died = this.t; }
    this.events.push({ type: 'smash', x: s.x, z: s.z });
  }
  fitness(f) { return (f.alive ? this.t : f.died) + 8 * f.eaten; }
}

// ---------------------------------------------------------------- evolution
export function randomGenome(rand) { return Array.from({ length: NG }, () => rand()); }
export function nextGeneration(flies, fit, rand, gen, size) {
  const order = flies.map((f, i) => i).sort((a, b) => fit[b] - fit[a]);
  const sigma = Math.max(0.05, 0.18 * Math.pow(0.97, gen));
  const parents = order.slice(0, Math.max(4, Math.round(size * 0.28))).map((i) => flies[i].genes);
  const out = [];
  for (let i = 0; i < 3; i++) out.push(parents[i].slice());                       // elites
  while (out.length < size - 2) {
    const a = parents[Math.floor(rand() * parents.length)], b = parents[Math.floor(rand() * parents.length)];
    out.push(a.map((v, k) => clamp01((rand() < 0.5 ? v : b[k]) + gauss(rand) * sigma)));
  }
  while (out.length < size) out.push(randomGenome(rand));                           // fresh blood
  return out;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function gauss(rand) { return Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(6.283 * rand()); }
