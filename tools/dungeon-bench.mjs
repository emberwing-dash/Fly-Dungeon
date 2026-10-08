// Fixed benchmark: a batch of flies runs a fixed dungeon (no respawn). Reports escape rate and mean progress.
import fs from 'node:fs';
import { Brain, PARAMS } from '../web/js/sim.js';
import { Wiring } from '../web/js/colony-core.js';
import { Dungeon, TYPES, rng, randomGenome, generate } from '../web/js/dungeon-core.js';
const D = new URL('../web/data/', import.meta.url);
const cases = JSON.parse(fs.readFileSync(new URL('cases.json', D))); const bj = JSON.parse(fs.readFileSync(new URL('brain.json', D)));
const bin = fs.readFileSync(new URL('brain.bin', D)); const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
Object.assign(PARAMS, bj.params); const brain = new Brain(bj, ab); const W = new Wiring(brain, cases.behaviours, cases);
export function bench(genomes, { level = 3, seeds = [1, 2, 3, 4], type = 'fruit', tmax = 90, size = 'medium', lesion = null } = {}) {
  const stats = { ...TYPES[type].base }; stats.speed += 2; stats.senses += 2; stats.reflex += 2;
  let esc = 0, n = 0, prog = 0, death = { killed: 0, starved: 0 }, tEsc = 0;
  for (const s of seeds) {
    const d = new Dungeon(W, { type, stats, size, flies: 0 }, s); d.level = level - 1; d.nextLevel(); d.cfg.flies = 0; if (lesion) d.setLesions(!!lesion.loom, !!lesion.taste);
    for (const g of genomes) { const f = d.spawn(); f.genes = g; f.p = (await0 => null)(0) || f.p; }
    d.flies.forEach((f, i) => { f.genes = genomes[i]; f.p = decodeGenes(genomes[i]); });
    while (d.t < tmax && d.flies.some((f) => f.alive)) { d.step(); d.queue = 0; }
    for (const f of d.flies) { n++; if (f.escaped) { esc++; tEsc += f.age; } prog += f.bestProg; if (f.cause) death[f.cause]++; }
  }
  return { escapeRate: +(esc / n).toFixed(2), meanProgress: +(prog / n).toFixed(2), killed: death.killed / n, starved: death.starved / n, meanEscapeTime: esc ? +(tEsc / esc).toFixed(0) : null };
}
import { decodeGenes } from '../web/js/dungeon-core.js';
if (process.argv[1].endsWith('dungeon-bench.mjs')) {
  const r = rng(5); const naive = Array.from({ length: 24 }, () => randomGenome(r));
  console.log('naive level3', bench(naive)); console.log('naive level5', bench(naive, { level: 5 }));
}
