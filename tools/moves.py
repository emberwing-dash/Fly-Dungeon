import sys; sys.path.insert(0,'.')
import numpy as np
from gsim import *
NUDGE, DRIVE = 0.12, 0.40
COST = {'nudge': 1, 'drive': 2, 'silence': 1}
BUDGET = 5
names = list(BEH)
def build_moves(pool): return [(t, k) for t in pool for k in ('nudge', 'drive', 'silence')]
def split(mv):
    sil = [t for t, k in mv if k == 'silence']
    boo = [(t, NUDGE if k == 'nudge' else DRIVE) for t, k in mv if k in ('nudge', 'drive')]
    return sil, boo
def beval(G, I, lesion, move_sets):
    out = []
    for k in range(0, len(move_sets), 64):
        chunk = move_sets[k:k + 64]
        sil, boo = zip(*[split(m) for m in chunk])
        sil = [list(lesion) + s for s in sil]
        r = G.readout(G.run(I, silence_types=sil, boost_types=list(boo), batch=len(chunk)))
        out.append(np.stack([np.asarray(r[b], dtype=np.float32) for b in names], axis=1))
    return np.concatenate(out)
def score_vec(R, h, j, nmoves=0):
    """R: (m, nbeh) readouts. returns (score, acc, collateral)."""
    ratio = R[:, j] / max(h[j], 1e-9)
    acc = np.clip(1 - np.abs(ratio - 1), 0, 1)
    other = np.delete(R - h, j, axis=1)
    col = np.clip(other.max(axis=1) / max(h[j], 1e-9), 0, 1)
    return 100 * acc - 60 * col - 2 * nmoves, acc, col
