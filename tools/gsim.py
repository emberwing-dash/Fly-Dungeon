"""The game's brain: neuron-level rate network on the pathway subgraph (numpy reference implementation).
The browser re-implements exactly this update rule in JavaScript (web/js/sim.js)."""
import sys; sys.path.insert(0,'.')
import numpy as np, pickle, scipy.sparse as sp
from prop import Brain
from scen_test import SC, BEH

GAIN, THETA, ALPHA, STEPS, BOOST = 4.0, 0.02, 0.5, 40, 0.12

class Game:
    def __init__(self, B=None, sub_pkl='sub_sel.pkl'):
        self.B = B or Brain()
        self.types, self.nid = pickle.load(open(sub_pkl, 'rb'))
        B = self.B
        self.n = len(self.nid)
        self.W = B.W[self.nid][:, self.nid].tocsr().astype(np.float32)
        self.ntype = np.array([self.types.index(B.types[i]) for i in self.nid])
        self.tix = {t: np.where(self.ntype == k)[0] for k, t in enumerate(self.types)}
        self.beh_ix = {b: np.concatenate([self.tix[t] for t in ts if t in self.tix]) for b, ts in BEH.items()}
        self.sc = B.sc[self.nid]
    def src(self, scen, strength=1.0):
        I = np.zeros(self.n, np.float32)
        for t in SC[scen]:
            if t in self.tix: I[self.tix[t]] = strength
        return I
    def run(self, I, silence_types=(), boost_types=(), batch=None):
        """I: (n,) or (n,B). silence/boost: list of type names (or list of lists for a batch)."""
        x = np.zeros((self.n,) if batch is None else (self.n, batch), np.float32)
        keep = np.ones_like(x); off = np.zeros_like(x)
        def apply(spec, arr, val, col=None):
            for t in spec:
                ix = self.tix.get(t)
                if ix is None: continue
                if col is None: arr[ix] = val
                else: arr[ix, col] = val
        def apply_boost(spec, arr, col=None):
            for item in spec:
                t, amt = item if isinstance(item, (tuple, list)) else (item, BOOST)
                ix = self.tix.get(t)
                if ix is None: continue
                if col is None: arr[ix] = amt
                else: arr[ix, col] = amt
        if batch is None:
            apply(silence_types, keep, 0.0); apply_boost(boost_types, off)
            Iv = I
        else:
            for c in range(batch):
                apply(silence_types[c], keep, 0.0, c); apply_boost(boost_types[c], off, c)
            Iv = I if I.ndim == 2 else I[:, None]
        for _ in range(STEPS):
            u = GAIN * (self.W @ x) + Iv + off
            x = (1 - ALPHA) * x + ALPHA * np.clip(u - THETA, 0, 1) * keep
        return x
    def readout(self, x):
        return {b: (x[ix].mean(axis=0) if len(ix) else 0) for b, ix in self.beh_ix.items()}
if __name__ == '__main__':
    import time
    G = Game()
    for s in SC:
        t = time.time(); x = G.run(G.src(s)); r = G.readout(x)
        print(f'{s:5s}', {k: round(float(v), 2) for k, v in r.items()}, round(time.time() - t, 3), 's')
