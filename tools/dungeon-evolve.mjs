// Evolve brains for the dungeon headlessly (continuous replacement, rising levels), save the best genomes for the "pre-evolved" start.
// Usage: node dungeon-evolve.mjs [simSeconds=1800] [seed=1]
import fs from 'node:fs';
import { Brain, PARAMS } from '../web/js/sim.js';
import { Wiring } from '../web/js/colony-core.js';
import { Dungeon, TYPES, GENE_NAMES } from '../web/js/dungeon-core.js';
import { bench } from './dungeon-bench.mjs';
import { rng, randomGenome } from '../web/js/dungeon-core.js';
const D = new URL('../web/data/', import.meta.url);
const cases = JSON.parse(fs.readFileSync(new URL('cases.json', D))); const bj = JSON.parse(fs.readFileSync(new URL('brain.json', D)));
const bin = fs.readFileSync(new URL('brain.bin', D)); const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
Object.assign(PARAMS, bj.params); const brain = new Brain(bj, ab); const W = new Wiring(brain, cases.behaviours, cases);
const SIM = +process.argv[2] || 1800, seed = +process.argv[3] || 1;
const stats = { ...TYPES.fruit.base }; stats.speed += 2; stats.senses += 2; stats.reflex += 2;
const d = new Dungeon(W, { type: 'fruit', stats, size: 'medium', flies: 10 }, seed);
let lastLog = 0; const curve = [];
while (d.tick * 0.05 < SIM) {
  d.step(); d.events.length = 0;
  const sec = Math.floor(d.tick * 0.05); if (sec % 150 === 0 && sec !== lastLog) { lastLog = sec; const h = d.hist.slice(-40); const m = (k) => h.reduce((s, x) => s + x[k], 0) / Math.max(1, h.length); curve.push({ t: sec, level: d.level, births: d.births, progress: +m('prog').toFixed(2), fitness: +m('fit').toFixed(1) }); console.log(JSON.stringify(curve[curve.length - 1])); }
}
const top = d.archive.slice().sort((a, b) => b.fit - a.fit).slice(0, 24);
fs.writeFileSync(new URL('dungeon-evolved.json', D), JSON.stringify({ seed, simSeconds: SIM, genes: GENE_NAMES, genomes: top.map((a) => a.genes), fitness: top.map((a) => +a.fit.toFixed(1)), curve, births: d.births }));
const r = rng(11); const naive = Array.from({ length: 24 }, () => randomGenome(r));
for (const level of [3, 5, 7]) console.log('level', level, 'naive', JSON.stringify(bench(naive, { level, seeds: [11, 12, 13, 14] })), '\n         evolved', JSON.stringify(bench(top.map((a) => a.genes), { level, seeds: [11, 12, 13, 14] })));
