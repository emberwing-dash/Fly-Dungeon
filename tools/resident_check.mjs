// End-to-end check of the exported AI Resident: JS network vs JS simulator on random operation plans.
import fs from 'node:fs';
import { Brain, PARAMS, readout } from '../web/js/sim.js';
import { Resident } from '../web/js/resident.js';
const D = new URL('../web/data/', import.meta.url);
const data = JSON.parse(fs.readFileSync(new URL('cases.json', D)));
const bj = JSON.parse(fs.readFileSync(new URL('brain.json', D)));
const bin = fs.readFileSync(new URL('brain.bin', D)); const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
Object.assign(PARAMS, bj.params);
const brain = new Brain(bj, ab);
const res = new Resident(JSON.parse(fs.readFileSync(new URL('resident.json', D))), data.resident_order);
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const cost = { nudge: 1, drive: 2, silence: 1 };
for (const c of data.cases) {
  const net = res.load(c.id); const I = brain.drive(c.stimulus.types, c.stimulus.strength);
  const j = data.resident_order.indexOf(c.target); const h = c.healthy[c.target];
  let err = 0, n = 0, perr = 0, pn = 0;
  const plans = [c.par.moves.map(([t, kind]) => ({ t, kind }))];
  for (let k = 0; k < 150; k++) {
    const m = []; let spent = 0; const cnt = 1 + Math.floor(rnd() * 4);
    for (let q = 0; q < cnt * 4 && m.length < cnt; q++) {
      const t = net.ops[Math.floor(rnd() * net.ops.length)], kind = ['nudge', 'drive', 'silence'][Math.floor(rnd() * 3)];
      if (m.find((x) => x.t === t) || spent + cost[kind] > 5) continue; m.push({ t, kind }); spent += cost[kind];
    }
    plans.push(m);
  }
  plans.forEach((plan, idx) => {
    const sil = new Set(c.lesion.map((t) => brain.typeId(t))); const boo = new Map();
    for (const m of plan) { const id = brain.typeId(m.t); if (m.kind === 'silence') sil.add(id); else boo.set(id, m.kind === 'nudge' ? PARAMS.NUDGE : PARAMS.DRIVE); }
    brain.run(I, sil, boo);
    const y = readout(brain, data.behaviours, brain.typeActivity())[c.target] / h;
    const p = res.predict(net, plan)[j];
    err += Math.abs(y - p); n++; if (idx === 0) { perr = Math.abs(y - p); pn = y; }
  });
  console.log(`${c.id.padEnd(6)} mean |pred-true| over ${n} plans: ${(err / n).toFixed(3)} (target ratio, 1.0 = healthy) | par fix true ${pn.toFixed(3)} err ${perr.toFixed(3)}`);
}
