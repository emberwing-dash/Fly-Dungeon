import sys; sys.path.insert(0,'.')
import pickle
from moves import *
G = Game(); sel = pickle.load(open('sel.pkl','rb'))
def probe(s,beh,st,les,vis_n=60):
    j=names.index(beh); I=G.src(s,st); h=beval(G,I,[],[[]])[0]
    vis=[k for k,_,_ in sel[s][:vis_n]]; vis=[t for t in dict.fromkeys(vis+SC[s]+BEH[beh]) if t in G.tix]
    cmds=set(BEH[beh]); ld=beval(G,I,les,[[]])[0]
    ops=[t for t in vis if t not in cmds and t not in les]; moves=build_moves(ops)
    R1=beval(G,I,les,[[m] for m in moves]); sc1,acc1,col1=score_vec(R1,h,j,1)
    cur=[];spent=0;best=None
    for step in range(5):
        cands=[m for m in moves if m[0] not in [c[0] for c in cur] and spent+COST[m[1]]<=BUDGET]
        if not cands: break
        R=beval(G,I,les,[cur+[m] for m in cands]); sc,acc,col=score_vec(R,h,j,len(cur)+1)
        i=int(np.argmax(sc)); cur.append(cands[i]); spent+=COST[cands[i][1]]; best=(sc[i],acc[i],col[i])
    print(f'{s} st={st} lesion {les} reach {ld[j]/h[j]:.0%} | single acc>=.5: {(acc1>=.5).sum()}/{len(moves)} (>=.8: {(acc1>=.8).sum()}) | par {best[0]:.0f} acc {best[1]:.2f} col {best[2]:.2f} {[(str(a),b) for a,b in cur]}')
for st in (0.25,0.4):
    probe('loom','escape',st,['LC4'])
    probe('loom','escape',st,['LPLC2'])
# prey relays-only deeper lesion
j=names.index('approach'); I=G.src('prey',1.0); h=beval(G,I,[],[[]])[0]
vis=[k for k,_,_ in sel['prey'][:60]]; vis=[t for t in dict.fromkeys(vis+SC['prey']+BEH['approach']) if t in G.tix]
relays=[t for t in vis if t not in SC['prey'] and t not in BEH['approach']]
les=[]
for _ in range(9):
    cand=[t for t in relays if t not in les]; R=beval(G,I,les,[[(t,'silence')] for t in cand]); i=int(np.argmin(R[:,j])); les.append(cand[i])
    print(len(les),str(cand[i]),round(float(R[i,j]/h[j]),2))
    if R[i,j]<=0.4*h[j]: break
probe('prey','approach',1.0,[str(x) for x in les])
