// Headless dungeon run: evolution check. Usage: node dungeon-test.mjs [simSeconds=900] [flies=8] [type=fruit] [seed=1] [size=medium]
import fs from 'node:fs';
import { Brain, PARAMS } from '../web/js/sim.js';
import { Wiring } from '../web/js/colony-core.js';
import { Dungeon, STAT_KEYS, TYPES } from '../web/js/dungeon-core.js';
const D = new URL('../web/data/', import.meta.url);
const cases = JSON.parse(fs.readFileSync(new URL('cases.json', D))); const bj = JSON.parse(fs.readFileSync(new URL('brain.json', D)));
const bin = fs.readFileSync(new URL('brain.bin', D)); const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
Object.assign(PARAMS, bj.params); const brain = new Brain(bj, ab); const W = new Wiring(brain, cases.behaviours, cases);
const SIM = +process.argv[2] || 900, N = +process.argv[3] || 8, type = process.argv[4] || 'fruit', seed = +process.argv[5] || 1, size = process.argv[6] || 'medium';
const stats = { ...TYPES[type].base }; stats.speed += 2; stats.senses += 2; stats.reflex += 2;
const d = new Dungeon(W, { type, stats, size, flies: N }, seed);
const t0 = Date.now(); let last = 0;
while (d.t + (d.level - 1) * 0 < 1e9 && (d.tick * 0.05) < SIM) {
  d.step();
  if (d.events.length) { for (const e of d.events) if (e.type === 'escape') console.log(`  t=${(d.tick * 0.05).toFixed(0)}s level ${d.level}: fly #${e.id} (gen ${e.gen}) ESCAPED`); d.events.length = 0; }
  const sec = Math.floor(d.tick * 0.05);
  if (sec % 120 === 0 && sec !== last) { last = sec; const h = d.hist.slice(-24); const m = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-'; console.log(`t=${sec}s level ${d.level} births ${d.births} deaths ${d.deaths} escapes ${d.escapes} | last24 mean progress ${m(h.map((x) => x.prog))} fit ${m(h.map((x) => x.fit))}`); }
}
const h = d.hist; const seg = (a, b) => { const s = h.slice(a, b); return s.length ? (s.reduce((x, y) => x + y.prog, 0) / s.length).toFixed(2) + ' (n=' + s.length + ')' : '-'; };
console.log('progress by birth order: first 20', seg(0, 20), '| 20-60', seg(20, 60), '| 60-120', seg(60, 120), '| 120+', seg(120, 1e9));
console.log('wall', ((Date.now() - t0) / 1000).toFixed(1), 's');
