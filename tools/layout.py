"""Layered left-to-right circuit layout.
Flow coordinate = harmonic (absorbing) solve with sensors at 0 and command neurons at 1; nodes are binned into layers
by flow rank, then ordered inside each layer with barycentre sweeps to reduce edge crossings."""
import numpy as np


def harmonic_x(n, wabs, fixed0, fixed1):
    A = wabs + wabs.T
    L = np.diag(A.sum(1)) - A
    fixed = {i: 0.0 for i in fixed0}
    fixed.update({i: 1.0 for i in fixed1})
    free = [i for i in range(n) if i not in fixed]
    x = np.full(n, 0.5)
    for i, v in fixed.items(): x[i] = v
    if free and fixed:
        Lff = L[np.ix_(free, free)] + 1e-6 * np.eye(len(free))
        rhs = -L[np.ix_(free, list(fixed))] @ np.array([fixed[i] for i in fixed])
        x[free] = np.linalg.solve(Lff, rhs)
    return x


def layout(names, wabs, sensors, commands, n_layers=6, seed=0):
    n = len(names)
    idx = {t: i for i, t in enumerate(names)}
    s_ix = [idx[t] for t in sensors if t in idx]
    c_ix = [idx[t] for t in commands if t in idx]
    x0 = harmonic_x(n, wabs, s_ix, c_ix)
    free = [i for i in range(n) if i not in s_ix and i not in c_ix]
    order = sorted(free, key=lambda i: x0[i])
    layer = np.zeros(n, int)
    for i in s_ix: layer[i] = 0
    for i in c_ix: layer[i] = n_layers + 1
    for r, i in enumerate(order):
        layer[i] = 1 + int(r * n_layers / max(1, len(order)))
    layers = {}
    for i in range(n): layers.setdefault(layer[i], []).append(i)
    rng = np.random.default_rng(seed)
    pos = np.zeros(n)
    for L, mem in layers.items():
        for k, i in enumerate(rng.permutation(mem)): pos[i] = k
    A = wabs + wabs.T
    for sweep in range(12):
        seq = sorted(layers) if sweep % 2 == 0 else sorted(layers, reverse=True)
        for L in seq:
            mem = layers[L]
            if len(mem) < 2: continue
            bary = {}
            for i in mem:
                nb = [j for j in range(n) if A[i, j] > 0 and layer[j] != L]
                w = np.array([A[i, j] for j in nb]);
                bary[i] = (np.dot(w, [pos[j] / max(1, len(layers[layer[j]]) - 1) for j in nb]) / w.sum()) if len(nb) else pos[i] / max(1, len(mem) - 1)
            for k, i in enumerate(sorted(mem, key=lambda i: bary[i])): pos[i] = k
    xs = np.zeros(n); ys = np.zeros(n)
    Ls = sorted(layers)
    for L in Ls:
        mem = sorted(layers[L], key=lambda i: pos[i]); m = len(mem)
        for k, i in enumerate(mem):
            xs[i] = 0.03 + 0.94 * (Ls.index(L)) / max(1, len(Ls) - 1)
            ys[i] = (0.5 if m == 1 else 0.04 + 0.92 * (k + 0.5 * (Ls.index(L) % 2)) / (m - 0.0 if m > 1 else 1))
            ys[i] = float(np.clip(ys[i], 0.04, 0.96))
    return xs, ys
