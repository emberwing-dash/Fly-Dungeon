import sys; sys.path.insert(0,'.')
import pickle
from moves import *
G = Game(); sel = pickle.load(open('sel.pkl','rb'))
CFG = {'loom':('escape',0.25,'any',45,6),'dust':('groom',1.0,'relay',45,12),'mate':('court',1.0,'relay',40,6),'prey':('approach',1.0,'relay',45,6),'taste':('feed',1.0,'relay',35,4)}
cmd_all = set(t for ts in BEH.values() for t in ts)
for s,(beh,st,pool_kind,frac,kmax) in CFG.items():
    j = names.index(beh); I = G.src(s, st)
    h = beval(G, I, [], [[]])[0]
    vis = [k for k,_,_ in sel[s][:60]]
    vis = [t for t in dict.fromkeys(vis + SC[s] + BEH[beh]) if t in G.tix]
    sens = set(SC[s]); cmds = set(BEH[beh])
    relays = [t for t in vis if t not in sens and t not in cmds]
    lpool = vis if pool_kind=='any' else relays
    lpool = [t for t in lpool if t not in cmds and not (pool_kind=='any' and t in sens and False)]
    les = []
    for _ in range(kmax):
        R = beval(G, I, les, [[(t,'silence')] for t in lpool if t not in les])
        cand = [t for t in lpool if t not in les]; i = int(np.argmin(R[:,j])); les.append(cand[i])
        if R[i,j] <= frac/100*h[j]: break
    ld = beval(G, I, les, [[]])[0]
    # greedy fix inside the visible relays (sensors/cmd excluded)
    moves = build_moves([t for t in relays if t not in les])
    cur = []; spent = 0
    for step in range(5):
        cands = [m for m in moves if m[0] not in [c[0] for c in cur] and spent + COST[m[1]] <= BUDGET]
        if not cands: break
        R = beval(G, I, les, [cur + [m] for m in cands]); sc, acc, col = score_vec(R, h, j, len(cur)+1)
        i = int(np.argmax(sc)); cur.append(cands[i]); spent += COST[cands[i][1]]
        print(f'   step{step+1}: {cands[i]} acc {acc[i]:.2f} col {col[i]:.2f} score {sc[i]:.0f} cost {spent}')
    R1 = beval(G, I, les, [[m] for m in moves]); sc1, acc1, col1 = score_vec(R1, h, j, 1)
    print(f'{s}: vis {len(vis)} lesion {les} h {h[j]:.3f}->{ld[j]:.3f} ({ld[j]/h[j]:.0%}); single moves with acc>=.5: {(acc1>=.5).sum()}/{len(moves)}; best single score {sc1.max():.0f}')
