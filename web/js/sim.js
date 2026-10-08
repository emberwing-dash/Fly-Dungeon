// Fly Dungeon brain simulator: neuron-level rate network on the real FlyWire/male-CNS pathway subgraph.
// This is a line-for-line port of tools/gsim.py (numpy reference). Both must stay in sync.
//
//   u = GAIN * (W x) + I + boost      x <- (1-ALPHA) x + ALPHA * clip(u - THETA, 0, 1) * keep
//
// W[post, pre] = sign(pre) * synapse_count / total_input_synapses(post)   (from the full connectome)

export const PARAMS = { GAIN: 4.0, THETA: 0.02, ALPHA: 0.5, STEPS: 40, NUDGE: 0.12, DRIVE: 0.4 };

export class Brain {
  /** @param {object} meta parsed brain.json  @param {ArrayBuffer} bin parsed brain.bin */
  constructor(meta, bin) {
    this.meta = meta;
    this.types = meta.types;               // [{name, n, cls}]
    this.nT = this.types.length;
    this.n = meta.n;
    let o = 0;
    const take = (Ctor, len) => { const a = new Ctor(bin, o, len); o += a.byteLength; return a; };
    this.ntype = take(Uint16Array, this.n);
    if (o % 4) o += 4 - (o % 4);
    this.indptr = take(Uint32Array, this.n + 1);
    this.nnz = this.indptr[this.n];
    this.indices = take(Uint16Array, this.nnz);
    if (o % 4) o += 4 - (o % 4);
    this.weights = take(Float32Array, this.nnz);
    this.typeIndex = new Map(this.types.map((t, i) => [t.name, i]));
    // neurons grouped by type
    this.byType = Array.from({ length: this.nT }, () => []);
    for (let i = 0; i < this.n; i++) this.byType[this.ntype[i]].push(i);
    this.x = new Float32Array(this.n);
    this._u = new Float32Array(this.n);
  }

  typeId(name) { return this.typeIndex.get(name); }

  /**
   * @param {Float32Array} I   external drive per neuron
   * @param {Set<number>|number[]} silenced type ids
   * @param {Map<number,number>} boosted type id -> extra input current added to every neuron of the type
   * @returns {Float32Array} steady-state activity per neuron (shared buffer)
   */
  run(I, silenced = [], boosted = new Map(), steps = PARAMS.STEPS) {
    const { GAIN, THETA, ALPHA } = PARAMS;
    const n = this.n, x = this.x, ptr = this.indptr, ind = this.indices, w = this.weights, nt = this.ntype;
    const keepT = new Float32Array(this.nT).fill(1);
    for (const t of silenced) keepT[t] = 0;
    const offT = new Float32Array(this.nT);
    for (const [t, amt] of boosted) offT[t] = amt;
    x.fill(0);
    const u = this._u;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < n; i++) {
        let acc = 0;
        for (let k = ptr[i], e = ptr[i + 1]; k < e; k++) acc += w[k] * x[ind[k]];
        u[i] = GAIN * acc + I[i] + offT[nt[i]];
      }
      for (let i = 0; i < n; i++) {
        let v = u[i] - THETA;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        x[i] = (1 - ALPHA) * x[i] + ALPHA * v * keepT[nt[i]];
      }
    }
    return x;
  }

  /** mean activity of each type (Float32Array nT) */
  typeActivity(x = this.x) {
    const out = new Float32Array(this.nT), cnt = new Float32Array(this.nT);
    for (let i = 0; i < this.n; i++) { out[this.ntype[i]] += x[i]; cnt[this.ntype[i]]++; }
    for (let t = 0; t < this.nT; t++) out[t] = cnt[t] ? out[t] / cnt[t] : 0;
    return out;
  }

  /** drive vector for a list of source type names */
  drive(typeNames, strength) {
    const I = new Float32Array(this.n);
    for (const name of typeNames) {
      const t = this.typeIndex.get(name);
      if (t === undefined) continue;
      for (const i of this.byType[t]) I[i] = strength;
    }
    return I;
  }
}

/** behaviour readout: mean activity over the neurons of the behaviour's command types */
export function readout(brain, behaviours, typeAct) {
  const out = {};
  for (const [b, spec] of Object.entries(behaviours)) {
    let s = 0, c = 0;
    for (const name of spec.cells) {
      const t = brain.typeIndex.get(name);
      if (t === undefined) continue;
      s += typeAct[t] * brain.byType[t].length; c += brain.byType[t].length;
    }
    out[b] = c ? s / c : 0;
  }
  return out;
}
