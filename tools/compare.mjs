// Controlled comparison on fresh seeds: naive (random genomes) vs evolved colony, and evolved colony with parts of the brain switched off.
// Usage: node compare.mjs [seeds=8]   -> prints a table and writes compare_report.json
import fs from 'node:fs';
import { Brain, PARAMS } from '../web/js/sim.js';
import { Wiring, World, CFG, rng, randomGenome } from '../web/js/colony-core.js';
const D = new URL('../web/data/', import.meta.url);
const cases = JSON.parse(fs.readFileSync(new URL('cases.json', D))); const bj = JSON.parse(fs.readFileSync(new URL('brain.json', D)));
const bin = fs.readFileSync(new URL('brain.bin', D)); const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
Object.assign(PARAMS, bj.params); const brain = new Brain(bj, ab); const W = new Wiring(brain, cases.behaviours, cases);
const ev = JSON.parse(fs.readFileSync(new URL('evolved.json', D)));
const N = +process.argv[2] || 8;
const conds = {
  'naive (random genes)': { naive: true },
  'evolved': {},
  'evolved, shadow detectors off (L)': { loom: true },
  'evolved, taste relay cut (K)': { taste: true },
};
const out = {};
for (const [name, c] of Object.entries(conds)) {
  const S = [], A = [], SW = [], ST = [], B = [];
  for (let s = 0; s < N; s++) {
    const r = rng(9000 + s); const genomes = c.naive ? Array.from({ length: CFG.NF }, () => randomGenome(r)) : ev.genomes;
    const w = new World(W, genomes, 777 + s); w.setLesions(!!c.loom, !!c.taste);
    while (!w.over) w.step();
    S.push(w.flies.reduce((a, f) => a + (f.alive ? w.t : f.died), 0) / w.flies.length); A.push(w.flies.filter((f) => f.alive).length);
    SW.push(w.flies.filter((f) => f.cause === 'swatted').length); ST.push(w.flies.filter((f) => f.cause === 'starved').length); B.push(w.flies.reduce((a, f) => a + f.eaten, 0));
  }
  const m = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  out[name] = { meanSurvivalSeconds: m(S), survivorsOf28: m(A), swatted: m(SW), starved: m(ST), berriesEaten: m(B), rounds: N };
  console.log(name.padEnd(36), JSON.stringify(out[name]));
}
fs.writeFileSync(new URL('compare_report.json', import.meta.url), JSON.stringify(out, null, 1));
