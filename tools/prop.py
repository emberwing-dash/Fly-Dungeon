"""Neuron-level rate propagation on the real connectome (ground truth for the game's reduced model)."""
import numpy as np, scipy.sparse as sp
from load import load

class Brain:
    def __init__(self):
        self.meta, A, self.sign, self.info, self.N = load()
        self.types = self.info["types"]
        self.sc = np.array(self.meta["superclasses"])[self.info["sc"]]
        self.cl = np.array(self.meta["classes"])[self.info["cls"]]
        self.side = self.info["side"]
        indeg_syn = np.asarray(A.sum(axis=0)).ravel() + 1e-9      # total input synapses per target
        # W[post, pre] = sign(pre) * count / total_input(post)   (conductance-like normalisation)
        D = sp.diags(self.sign.astype(np.float32))
        An = A.T.tocsr()                                           # post x pre
        self.W = (An @ D).tocsr()
        self.W = sp.diags((1.0 / indeg_syn).astype(np.float32)) @ self.W
        self.W = self.W.tocsr()
        self.tidx = {}
        for i, t in enumerate(self.types):
            self.tidx.setdefault(t, []).append(i)
        self.tidx = {k: np.array(v) for k, v in self.tidx.items()}
    def ids(self, typ, side=None):
        ix = self.tidx.get(typ, np.array([], int))
        return ix if side is None else ix[self.side[ix] == side]
    def run(self, drive, silence=None, steps=60, gain=6.0, theta=0.02, alpha=0.5):
        """drive: dict{neuron_index: strength}. returns steady rate vector."""
        r = np.zeros(self.N, np.float32)
        I = np.zeros(self.N, np.float32)
        for k, v in drive.items(): I[k] = v
        keep = np.ones(self.N, np.float32)
        if silence is not None: keep[silence] = 0
        for _ in range(steps):
            u = gain * (self.W @ r) + I
            tgt = np.clip(u - theta, 0, 1) * keep
            r = (1 - alpha) * r + alpha * tgt
        return r
