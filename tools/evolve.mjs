// Headless evolution of the fly colony. Usage: node evolve.mjs [generations=40] [seed=1]
// Writes web/data/evolved.json (final population + per-generation history).
import fs from 'node:fs';
import { Brain, PARAMS } from '../web/js/sim.js';
import { Wiring, World, CFG, NG, rng, randomGenome, nextGeneration, GENE_NAMES, decode } from '../web/js/colony-core.js';
const D = new URL('../web/data/', import.meta.url);
const cases = JSON.parse(fs.readFileSync(new URL('cases.json', D)));
const bj = JSON.parse(fs.readFileSync(new URL('brain.json', D)));
const bin = fs.readFileSync(new URL('brain.bin', D)); const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
Object.assign(PARAMS, bj.params);
const brain = new Brain(bj, ab);
const wiring = new Wiring(brain, cases.behaviours, cases);
const GENS = +process.argv[2] || 40, SEED = +process.argv[3] || 1;
const rand = rng(SEED * 7919);
let genomes = Array.from({ length: CFG.NF }, () => randomGenome(rand));
const history = [];
for (let g = 0; g < GENS; g++) {
  const t0 = Date.now();
  const w = new World(wiring, genomes, SEED * 1000 + g);
  while (!w.over) w.step();
  const fit = w.flies.map((f) => w.fitness(f));
  const mean = fit.reduce((a, b) => a + b, 0) / fit.length, best = Math.max(...fit);
  const surv = w.flies.reduce((s, f) => s + (f.alive ? 1 : 0), 0);
  const swat = w.flies.filter((f) => f.cause === 'swatted').length, starv = w.flies.filter((f) => f.cause === 'starved').length;
  const berries = w.flies.reduce((s, f) => s + f.eaten, 0);
  const surviveSec = w.flies.reduce((a, f) => a + (f.alive ? w.t : f.died), 0) / w.flies.length;
  history.push({ gen: g, surviveSec: +surviveSec.toFixed(1), mean: +mean.toFixed(1), best: +best.toFixed(1), survivors: surv, swatted: swat, starved: starv, berries, simSeconds: +w.t.toFixed(1) });
  console.log(`gen ${String(g).padStart(2)} survive ${surviveSec.toFixed(1)}s mean ${mean.toFixed(1)} best ${best.toFixed(1)} alive ${surv} swatted ${swat} starved ${starv} berries ${berries} t=${w.t.toFixed(0)}s  (${((Date.now() - t0) / 1000).toFixed(1)}s wall)`);
  genomes = nextGeneration(w.flies, fit, rand, g, CFG.NF);
}
fs.writeFileSync(new URL('evolved.json', D), JSON.stringify({ seed: SEED, generations: GENS, genes: GENE_NAMES, genomes, history, example: decode(genomes[0]) }));
console.log('saved evolved.json');
