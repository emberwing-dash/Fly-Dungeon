"""Build everything the browser game needs from the real connectome tables:
   web/data/brain.json + brain.bin   the neuron-level pathway subgraph (6.5k neurons, ~190k synapse-type edges)
   web/data/cases.json               behaviours, cases (stimulus, lesion, visible circuit, par fix, layout)
Run:  python make_cases.py            (needs select_sub.py + build_sub.py to have been run once)
"""
import sys, json, pickle
sys.path.insert(0, '.')
from pathlib import Path
import numpy as np
from moves import *            # Game, BEH, SC, moves helpers
from layout import layout

OUT = Path(__file__).resolve().parents[1] / 'web' / 'data'
OUT.mkdir(parents=True, exist_ok=True)

G = Game()
sel = pickle.load(open('sel.pkl', 'rb'))
B = G.B

BEHAVIOURS = {
    'escape':   dict(label='Escape jump',   emoji='\U0001F998', cells=BEH['escape'],   note='Giant-fibre and takeoff descending neurons (DNp01, DNp02, DNp04)'),
    'groom':    dict(label='Grooming',      emoji='\U0001F9F9', cells=BEH['groom'],    note='Antennal grooming command neurons (DNg07, DNg08)'),
    'court':    dict(label='Courtship',     emoji='\U0001F3B6', cells=BEH['court'],    note='Courtship command neurons (pIP10, DNp13)'),
    'approach': dict(label='Approach',      emoji='\U0001F34E', cells=BEH['approach'], note='Forward-walking descending neurons (DNp09, DNg97, DNg100)'),
    'feed':     dict(label='Feeding',       emoji='\U0001F36F', cells=BEH['feed'],     note='Proboscis motor neuron MN9'),
    'retreat':  dict(label='Retreat',       emoji='↩️', cells=BEH['retreat'], note='Backward-walking "moonwalker" descending neuron (MDN)'),
    'flight':   dict(label='Flight',        emoji='\U0001FAB0', cells=BEH['flight'],  note='Flight command neurons (DNa08, DNg02)'),
    'turn':     dict(label='Steering',      emoji='\U0001F9ED', cells=BEH['turn'],    note='Steering descending neurons (DNa01, DNa02)'),
}
ORDER = list(BEHAVIOURS)

CASES = [
 dict(id='prey', title='Eyes on the Prize', emoji='\U0001F34E', scenario='prey', target='approach', strength=1.0,
      lesion=['PLP300m', 'CB4105', 'PVLP030', 'PVLP150', 'PVLP137', 'PLP249'], vis=60, level='Easy',
      story="A ripe berry rolls across the dish. A healthy fly locks on and walks straight to it. This one has damage in its visual-to-motor relay and just stands there.",
      goal="Restore the approach drive to the healthy level. Don't overshoot, and don't wake other behaviours."),
 dict(id='loom', title='The Shadow', emoji='\U0001F311', scenario='loom', target='escape', strength=0.4,
      lesion=['LPLC2'], vis=60, level='Easy',
      story="A predator's shadow sweeps overhead. Two kinds of looming detector (LC4 and LPLC2) normally trigger the giant-fibre escape. This fly lost its LPLC2 cells and reacts late.",
      goal="Bring the escape reflex back to its healthy strength. Hint: the circuit has brakes as well as accelerators."),
 dict(id='dust', title='Dusty Antennae', emoji='\U0001F32B️', scenario='dust', target='groom', strength=1.0,
      lesion=['SApp10', 'JO-ED2_c', 'JO-EV3'], vis=60, level='Medium',
      story="Dust settles on the antennae. A healthy fly sweeps it off with its front legs. Three groups of the antennal mechanosensors are dead, so the grooming command barely fires.",
      goal="Rebuild a path from the surviving sensors to the grooming neurons until the fly cleans itself again."),
 dict(id='taste', title='Sweet Tooth', emoji='\U0001F36F', scenario='taste', target='feed', strength=1.0,
      lesion=['GNG117'], vis=60, level='Hard',
      story="A droplet of sugar water touches the fly's mouth. The key relay GNG117 is gone, so the proboscis never extends and the fly starves next to food.",
      goal="Find a detour around GNG117. Few single operations work; combine two or three."),
 dict(id='mate', title='Love Is Blind', emoji='\U0001F498', scenario='mate', target='court', strength=1.0,
      lesion=['AOTU008', 'LAL130'], vis=62, level='Hard',
      story="Another fly walks into view. Males normally begin courtship (wing extension and song). Two relays between the visual system and the courtship command neurons are destroyed.",
      goal="Reconnect the visual courtship pathway. Be careful: the brain has more than one drive nearby."),
 dict(id='loom2', title='The Shadow II', emoji='\U0001F311', scenario='loom', target='escape', strength=0.25,
      lesion=['LC4'], vis=60, level='Expert',
      story="Same shadow, fainter, and now the other looming detector (LC4) is gone. Only a thin LPLC2 signal remains, and you must amplify and rewire it.",
      goal="Escape strength must come back to the healthy level using at most 5 operation points."),
]


def type_edges(names, thr=0.004):
    idx = {t: np.where(np.isin(G.ntype, [G.types.index(t)]))[0] for t in names}
    n = len(names)
    Wm = np.zeros((n, n), np.float32)
    for bi, tb in enumerate(names):
        rows = G.W[idx[tb]]                      # post neurons of b
        for ai, ta in enumerate(names):
            if ai == bi: continue
            Wm[ai, bi] = rows[:, idx[ta]].sum() / max(len(idx[tb]), 1)
    return Wm


def full_check(cfg, moves_):
    """Re-run healthy / lesioned / fixed on the FULL 165k-neuron connectome with the same rule."""
    st = cfg['strength']
    I = np.zeros(B.N, np.float32)
    for t in SC[cfg['scenario']]: I[B.ids(t)] = st
    def run(sil, boo):
        keep = np.ones(B.N, np.float32); off = np.zeros(B.N, np.float32)
        for t in sil: keep[B.ids(t)] = 0
        for t, a in boo: off[B.ids(t)] = a
        x = np.zeros(B.N, np.float32)
        for _ in range(STEPS):
            x = (1 - ALPHA) * x + ALPHA * np.clip(GAIN * (B.W @ x) + I + off - THETA, 0, 1) * keep
        ix = np.concatenate([B.ids(t) for t in BEH[cfg['target']]])
        return float(x[ix].mean())
    h = run([], []); d = run(cfg['lesion'], [])
    f = run(list(cfg['lesion']) + [t for t, k in moves_ if k == 'silence'], [(t, NUDGE if k == 'nudge' else DRIVE) for t, k in moves_ if k != 'silence'])
    return dict(healthy=round(h, 4), lesioned=round(d, 4), par_fix=round(f, 4), par_ratio=round(f / h, 3), lesioned_ratio=round(d / h, 3))


def build_case(cfg):
    s, beh, st = cfg['scenario'], cfg['target'], cfg['strength']
    j = names.index(beh)
    I = G.src(s, st)
    h = beval(G, I, [], [[]])[0]
    dmg = beval(G, I, cfg['lesion'], [[]])[0]
    vis = [k for k, _, _ in sel[s][:cfg['vis']]]
    vis = list(dict.fromkeys(vis + SC[s] + BEH[beh] + cfg['lesion']))
    vis = [t for t in vis if t in G.tix]
    cmds = set(BEH[beh]); sens = set(SC[s])
    ops = [t for t in vis if t not in cmds and t not in cfg['lesion']]
    moves = build_moves(ops)
    # greedy par fix under the operation-point budget
    cur, spent = [], 0
    best = (0, 0, 0)
    for step in range(5):
        cands = [m for m in moves if m[0] not in [c[0] for c in cur] and spent + COST[m[1]] <= BUDGET]
        if not cands: break
        R = beval(G, I, cfg['lesion'], [cur + [m] for m in cands]); sc, acc, col = score_vec(R, h, j, len(cur) + 1)
        i = int(np.argmax(sc))
        if cur and sc[i] <= best[0]: break
        cur.append(cands[i]); spent += COST[cands[i][1]]; best = (float(sc[i]), float(acc[i]), float(col[i]))
    R1 = beval(G, I, cfg['lesion'], [[m] for m in moves]); sc1, acc1, col1 = score_vec(R1, h, j, 1)
    # type graph among visible nodes
    Wm = type_edges(vis)
    wabs = np.abs(Wm)
    xs, ys = layout(vis, wabs, [t for t in vis if t in sens], [t for t in vis if t in cmds])
    nodes = []
    for k, t in enumerate(vis):
        ti = G.types.index(t)
        kind = 'sensor' if t in sens else 'cmd' if t in cmds else 'relay'
        nodes.append(dict(t=str(t), x=round(float(xs[k]), 4), y=round(float(ys[k]), 4), kind=kind,
                          n=int((G.ntype == ti).sum()), sc=str(B.sc[G.nid[np.where(G.ntype == ti)[0][0]]]),
                          nt=float(np.sign(B.sign[G.nid[np.where(G.ntype == ti)[0]]].mean())) ))
    edges = []
    flat = [(abs(Wm[a, b]), a, b) for a in range(len(vis)) for b in range(len(vis)) if abs(Wm[a, b]) >= 0.004]
    flat.sort(reverse=True)
    for _, a, b in flat[:240]:
        edges.append([str(vis[a]), str(vis[b]), round(float(Wm[a, b]), 4)])
    info = dict(
        id=cfg['id'], title=cfg['title'], emoji=cfg['emoji'], scenario=s, target=beh, level=cfg['level'],
        story=cfg['story'], goal=cfg['goal'],
        stimulus=dict(types=[str(t) for t in SC[s]], strength=st),
        lesion=[str(t) for t in cfg['lesion']], budget=BUDGET,
        healthy={b: round(float(h[k]), 5) for k, b in enumerate(names)},
        damaged={b: round(float(dmg[k]), 5) for k, b in enumerate(names)},
        ops=[str(t) for t in ops],
        nodes=nodes, edges=edges,
        par=dict(moves=[[str(t), k] for t, k in cur], score=round(best[0]), acc=round(best[1], 3), collateral=round(best[2], 3)),
        difficulty=dict(single_good=int((acc1 >= 0.5).sum()), single_total=len(moves)),
        fullcheck=full_check(cfg, cur),
    )
    print(f"{cfg['id']:6s} vis {len(vis)} ops {len(ops)} edges {len(edges)} reach {dmg[j]/h[j]:.0%} par {best[0]:.0f} singles>=.5 {int((acc1>=.5).sum())}/{len(moves)}")
    return info


def export_brain():
    types = []
    for k, t in enumerate(G.types):
        ix = np.where(G.ntype == k)[0]
        types.append(dict(name=str(t), n=int(len(ix)), sc=str(B.sc[G.nid[ix[0]]])))
    W = G.W.tocsr()
    W.sort_indices()
    n = G.n
    ntype = G.ntype.astype(np.uint16)
    indptr = W.indptr.astype(np.uint32)
    indices = W.indices.astype(np.uint16)
    data = W.data.astype(np.float32)
    parts = [ntype.tobytes()]
    off = len(parts[0]); pad = (-off) % 4; parts.append(b'\0' * pad); off += pad
    parts.append(indptr.tobytes()); off += indptr.nbytes
    parts.append(indices.tobytes()); off += indices.nbytes
    pad = (-off) % 4; parts.append(b'\0' * pad)
    parts.append(data.tobytes())
    (OUT / 'brain.bin').write_bytes(b''.join(parts))
    json.dump(dict(n=int(n), nnz=int(W.nnz), types=types, params=dict(GAIN=GAIN, THETA=THETA, ALPHA=ALPHA, STEPS=STEPS, NUDGE=NUDGE, DRIVE=DRIVE)),
              open(OUT / 'brain.json', 'w'), separators=(',', ':'))
    print('brain.bin', (OUT / 'brain.bin').stat().st_size // 1024, 'KB', 'types', len(types))


if __name__ == '__main__':
    export_brain()
    cases = [build_case(c) for c in CASES]
    tmp = OUT / 'cases.json.tmp'
    json.dump(dict(behaviours=BEHAVIOURS, order=ORDER, resident_order=names, costs=COST, budget=BUDGET, cases=cases), open(tmp, 'w'), separators=(',', ':'))
    import os; os.replace(tmp, OUT / 'cases.json')
    print('cases.json', (OUT / 'cases.json').stat().st_size // 1024, 'KB')
