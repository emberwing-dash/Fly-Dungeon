// Parity check: the JS simulator must reproduce the numpy reference (tools/gsim.py) on the shipped cases.
import fs from 'node:fs';
import { Brain, PARAMS, readout } from '../web/js/sim.js';
const D = new URL('../web/data/', import.meta.url);
const data = JSON.parse(fs.readFileSync(new URL('cases.json', D)));
const bj = JSON.parse(fs.readFileSync(new URL('brain.json', D)));
const bin = fs.readFileSync(new URL('brain.bin', D)); const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
Object.assign(PARAMS, bj.params);
const brain = new Brain(bj, ab);
const out = {};
for (const c of data.cases) {
  const I = brain.drive(c.stimulus.types, c.stimulus.strength);
  const run = (sil, boo) => { brain.run(I, new Set(sil.map((t) => brain.typeId(t))), new Map(boo.map(([t, a]) => [brain.typeId(t), a]))); return readout(brain, data.behaviours, brain.typeActivity()); };
  const healthy = run([], []);
  const damaged = run(c.lesion, []);
  const sil = c.par.moves.filter((m) => m[1] === 'silence').map((m) => m[0]).concat(c.lesion);
  const boo = c.par.moves.filter((m) => m[1] !== 'silence').map((m) => [m[0], m[1] === 'nudge' ? PARAMS.NUDGE : PARAMS.DRIVE]);
  const fixed = run(sil, boo);
  out[c.id] = { healthy: healthy[c.target], damaged: damaged[c.target], fixed: fixed[c.target] };
}
console.log(JSON.stringify(out));
