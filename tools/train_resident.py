"""Train the 'AI Resident': one small neural network per case that predicts, in microseconds, how the fly will behave
after any set of operations. Training data = thousands of simulated surgeries from the real-wiring simulator.
Output: web/data/resident.json (weights) and tools/resident_report.json (held-out accuracy)."""
import sys, json, time
sys.path.insert(0, '.')
import numpy as np
from mlp import MLP
from moves import *
import make_cases as mc
from pathlib import Path
G = mc.G

N_TRAIN, N_TEST = 9000, 1500
rng = np.random.default_rng(7)
OUT = mc.OUT


def sample_sets(ops, n, par_moves):
    sets = []
    focus = None
    while len(sets) < n:
        k = int(rng.choice([1, 2, 2, 3, 3, 4, 5]))
        chosen, spent = [], 0
        tries = 0
        while len(chosen) < k and tries < 20:
            tries += 1
            if par_moves and rng.random() < 0.25:
                t, kind = par_moves[int(rng.integers(len(par_moves)))]
                if rng.random() < 0.35: kind = ['nudge', 'drive', 'silence'][int(rng.integers(3))]
            else:
                t = ops[int(rng.integers(len(ops)))]; kind = ['nudge', 'drive', 'silence'][int(rng.integers(3))]
            if t in [c[0] for c in chosen] or spent + COST[kind] > BUDGET: continue
            chosen.append((t, kind)); spent += COST[kind]
        if chosen: sets.append(chosen)
    return sets


def encode(sets, ops):
    ix = {t: i for i, t in enumerate(ops)}
    X = np.zeros((len(sets), 3 * len(ops)), np.float32)
    for r, mv in enumerate(sets):
        for t, kind in mv:
            X[r, 3 * ix[t] + ['nudge', 'drive', 'silence'].index(kind)] = 1
    return X


report = {}
resident = {}
for case in mc.CASES:
    t0 = time.time()
    cid = case['id']; s, beh, st = case['scenario'], case['target'], case['strength']
    j = names.index(beh); I = G.src(s, st)
    h = beval(G, I, [], [[]])[0]
    cj = json.load(open(OUT / 'cases.json'))
    ci = next(c for c in cj['cases'] if c['id'] == cid)
    ops = ci['ops']; par = [tuple(m) for m in ci['par']['moves']]
    sets = sample_sets(ops, N_TRAIN + N_TEST, par)
    R = beval(G, I, case['lesion'], sets)
    Y = (R / max(h[j], 1e-9)).astype(np.float32)           # behaviours relative to the healthy target level
    X = encode(sets, ops)
    Xtr, Ytr, Xte, Yte = X[:N_TRAIN], Y[:N_TRAIN], X[N_TRAIN:], Y[N_TRAIN:]
    net = MLP(X.shape[1], (96, 96), Y.shape[1], seed=1)
    nv = 1200
    vloss, bep = net.fit(Xtr[:-nv], Ytr[:-nv], Xtr[-nv:], Ytr[-nv:], epochs=90)
    P = np.clip(net.predict(Xte), 0, None)
    r2_t = 1 - ((P[:, j] - Yte[:, j]) ** 2).sum() / ((Yte[:, j] - Yte[:, j].mean()) ** 2).sum()
    mae_t = float(np.abs(P[:, j] - Yte[:, j]).mean())
    # does the model rank good plans well? score = what the game scores
    def sc(Yv, nm):
        ratio = Yv[:, j]; acc = np.clip(1 - np.abs(ratio - 1), 0, 1)
        col = np.clip(np.delete(Yv - (h / h[j]), j, axis=1).max(axis=1), 0, 1)
        return 100 * acc - 60 * col - 2 * nm
    nm = np.array([len(m) for m in sets[N_TRAIN:]])
    st_true, st_pred = sc(Yte, nm), sc(P, nm)
    corr = float(np.corrcoef(st_true, st_pred)[0, 1])
    top = np.argsort(-st_pred)[:50]
    prec = float(np.mean(st_true[top] >= np.percentile(st_true, 90)))
    # single-move hint quality (what the in-game Resident does)
    moves = build_moves([t for t in ops])
    Rt = beval(G, I, case['lesion'], [[m] for m in moves])
    Yt = (Rt / max(h[j], 1e-9)).astype(np.float32)
    true1 = sc(Yt, np.ones(len(moves)))
    Pm = np.clip(net.predict(encode([[m] for m in moves], ops)), 0, None)
    pred1 = sc(Pm, np.ones(len(moves)))
    top3_true = set(np.argsort(-true1)[:3]); top10_pred = set(np.argsort(-pred1)[:10])
    hit = len(top3_true & top10_pred)
    report[cid] = dict(r2_target=round(float(r2_t), 3), mae_target=round(mae_t, 3), score_corr=round(corr, 3),
                       precision_top50_in_top10pct=round(prec, 2), single_move_top3_found_in_top10=hit,
                       n_train=N_TRAIN, n_test=N_TEST, seconds=round(time.time() - t0, 1))
    print(cid, report[cid])
    W = net.W; bs = net.b
    resident[cid] = dict(ops=ops, layers=[dict(w=np.round(w, 4).tolist(), b=np.round(b, 4).tolist()) for w, b in zip(W, bs)])

json.dump(resident, open(OUT / 'resident.json', 'w'), separators=(',', ':'))
json.dump(report, open(Path(__file__).resolve().parent / 'resident_report.json', 'w'), indent=1)
json.dump(report, open(OUT / 'resident_report.json', 'w'), indent=1)
print('resident.json', (OUT / 'resident.json').stat().st_size // 1024, 'KB')
