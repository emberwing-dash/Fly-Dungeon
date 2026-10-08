"""Does the 6.5k-neuron game subgraph behave like the full 165k-neuron connectome under the same rule?
Compares healthy / lesioned / par-fix readouts (target behaviour) between the two for every shipped case."""
import sys, json; sys.path.insert(0,'.')
import numpy as np
import make_cases as mc
from moves import *
G = mc.G; B = G.B
cj = json.load(open('../web/data/cases.json'))
rows = []
def full_run(c, sil, boo):
    drive = {i: c['stimulus']['strength'] for t in c['stimulus']['types'] for i in B.ids(t)}
    keep = np.ones(B.N, np.float32); off = np.zeros(B.N, np.float32)
    for t in sil: keep[B.ids(t)] = 0
    for t, a in boo: off[B.ids(t)] = a
    I = np.zeros(B.N, np.float32)
    for k, v in drive.items(): I[k] = v
    x = np.zeros(B.N, np.float32)
    for _ in range(STEPS):
        u = GAIN * (B.W @ x) + I + off
        x = (1 - ALPHA) * x + ALPHA * np.clip(u - THETA, 0, 1) * keep
    ix = np.concatenate([B.ids(t) for t in BEH[c['target']]])
    return float(x[ix].mean())
for c in cj['cases']:
    j = names.index(c['target']); I = G.src(c['scenario'], c['stimulus']['strength'])
    mv = [(t, k) for t, k in c['par']['moves']]
    sil_fix = c['lesion'] + [t for t, k in mv if k == 'silence']; boo_fix = [(t, NUDGE if k == 'nudge' else DRIVE) for t, k in mv if k != 'silence']
    sub = beval(G, I, c['lesion'], [[], mv]); subh = beval(G, I, [], [[]])[0]
    for tag, f, s in (('healthy', full_run(c, [], []), float(subh[j])), ('lesioned', full_run(c, c['lesion'], []), float(sub[0][j])), ('par fix', full_run(c, sil_fix, boo_fix), float(sub[1][j]))):
        rows.append((c['id'], tag, f, s)); print(f"{c['id']:6s} {tag:9s} full {f:.3f}  subgraph {s:.3f}")
F = np.array([r[2] for r in rows]); S = np.array([r[3] for r in rows])
print('Pearson r (all conditions):', round(float(np.corrcoef(F, S)[0, 1]), 3), '| mean |diff|', round(float(np.abs(F - S).mean()), 3))
json.dump([dict(case=a, cond=b, full=c, sub=d) for a, b, c, d in rows], open('validation_full.json', 'w'), indent=1)
