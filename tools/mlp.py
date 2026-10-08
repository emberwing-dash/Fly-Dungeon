"""Tiny from-scratch MLP (numpy, Adam). Two ReLU hidden layers, linear output, MSE loss."""
import numpy as np

class MLP:
    def __init__(self, n_in, hidden, n_out, seed=1):
        r = np.random.default_rng(seed)
        sizes = [n_in] + list(hidden) + [n_out]
        self.W = [(r.standard_normal((a, b)) * np.sqrt(2.0 / a)).astype(np.float32) for a, b in zip(sizes[:-1], sizes[1:])]
        self.b = [np.zeros(b, np.float32) for b in sizes[1:]]
    def forward(self, X, keep=False):
        acts = [X]; h = X
        for i, (W, b) in enumerate(zip(self.W, self.b)):
            h = h @ W + b
            if i < len(self.W) - 1: h = np.maximum(h, 0)
            acts.append(h)
        return acts if keep else h
    def predict(self, X): return self.forward(X)
    def fit(self, X, Y, Xv, Yv, epochs=80, bs=128, lr=2e-3, l2=1e-5, patience=12, seed=0):
        r = np.random.default_rng(seed)
        m = [np.zeros_like(w) for w in self.W] + [np.zeros_like(b) for b in self.b]
        v = [np.zeros_like(w) for w in self.W] + [np.zeros_like(b) for b in self.b]
        t = 0; best = (1e9, None, 0)
        for ep in range(epochs):
            idx = r.permutation(len(X))
            for k in range(0, len(X), bs):
                bi = idx[k:k + bs]; xb, yb = X[bi], Y[bi]
                acts = self.forward(xb, keep=True)
                g = 2 * (acts[-1] - yb) / len(bi)
                gW, gb = [None] * len(self.W), [None] * len(self.b)
                for i in range(len(self.W) - 1, -1, -1):
                    gW[i] = acts[i].T @ g + l2 * self.W[i]; gb[i] = g.sum(0)
                    if i: g = (g @ self.W[i].T) * (acts[i] > 0)
                t += 1
                for i, (p, gr) in enumerate(zip(self.W + self.b, gW + gb)):
                    m[i] = 0.9 * m[i] + 0.1 * gr; v[i] = 0.999 * v[i] + 0.001 * gr * gr
                    p -= lr * (m[i] / (1 - 0.9 ** t)) / (np.sqrt(v[i] / (1 - 0.999 ** t)) + 1e-8)
            val = float(((self.predict(Xv) - Yv) ** 2).mean())
            if val < best[0] - 1e-7: best = (val, ([w.copy() for w in self.W], [b.copy() for b in self.b]), ep)
            elif ep - best[2] >= patience: break
        self.W, self.b = best[1]
        return best[0], best[2]
