// The "AI Resident": per-case MLP (2 hidden ReLU layers) trained offline on simulated surgeries (tools/train_resident.py).
// Input: one-hot (nudge, drive, silence) per operable cell type. Output: each behaviour's strength relative to the healthy target level.

export class Resident {
  constructor(spec, order) { this.spec = spec; this.order = order; this.idx = new Map(); }
  load(caseId) {
    const m = this.spec[caseId]; if (!m) return null;
    const idx = new Map(m.ops.map((t, i) => [t, i]));
    return { ops: m.ops, idx, layers: m.layers.map((l) => ({ w: l.w.map((r) => Float32Array.from(r)), b: Float32Array.from(l.b) })) };
  }
  /** moves: [{t, kind}] -> Float32Array(outputs) */
  predict(net, moves) {
    const nIn = net.ops.length * 3;
    let x = new Float32Array(nIn);
    for (const mv of moves) { const i = net.idx.get(mv.t); if (i !== undefined) x[3 * i + KIND[mv.kind]] = 1; }
    for (let l = 0; l < net.layers.length; l++) {
      const { w, b } = net.layers[l];
      const out = new Float32Array(b.length);
      out.set(b);
      for (let i = 0; i < w.length; i++) { const xi = x[i]; if (xi === 0) continue; const row = w[i]; for (let j = 0; j < out.length; j++) out[j] += xi * row[j]; }
      if (l < net.layers.length - 1) for (let j = 0; j < out.length; j++) if (out[j] < 0) out[j] = 0;
      x = out;
    }
    for (let j = 0; j < x.length; j++) if (x[j] < 0) x[j] = 0;
    return x;
  }
}
const KIND = { nudge: 0, drive: 1, silence: 2 };
