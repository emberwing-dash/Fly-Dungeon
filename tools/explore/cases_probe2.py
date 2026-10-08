import sys; sys.path.insert(0,'.')
import pickle
from moves import *
G = Game(); sel = pickle.load(open('sel.pkl','rb'))
CFG = {'loom':('escape',0.4),'dust':('groom',1.0),'mate':('court',1.0),'prey':('approach',1.0),'taste':('feed',1.0)}
FR, KMAX = 0.35, 5
def lesion_for(s,beh,st,relays,sens,vis):
    j=names.index(beh); I=G.src(s,st); h=beval(G,I,[],[[]])[0]; les=[]
    for pool in (relays, relays+sens):
        les=[]
        for _ in range(KMAX):
            cand=[t for t in pool if t not in les]
            R=beval(G,I,les,[[(t,'silence')] for t in cand]); i=int(np.argmin(R[:,j])); les.append(cand[i])
            if R[i,j]<=FR*h[j]: return les,True
    return les,False
for s,(beh,st) in CFG.items():
    j=names.index(beh); I=G.src(s,st); h=beval(G,I,[],[[]])[0]
    vis=[k for k,_,_ in sel[s][:60]]
    vis=[t for t in dict.fromkeys(vis+SC[s]+BEH[beh]) if t in G.tix]
    sens=[t for t in SC[s] if t in G.tix]; cmds=set(BEH[beh]); relays=[t for t in vis if t not in sens and t not in cmds]
    les,ok=lesion_for(s,beh,st,relays,sens,vis)
    ld=beval(G,I,les,[[]])[0]
    ops=[t for t in vis if t not in cmds and t not in les]
    moves=build_moves(ops)
    R1=beval(G,I,les,[[m] for m in moves]); sc1,acc1,col1=score_vec(R1,h,j,1)
    cur=[];spent=0
    for step in range(5):
        cands=[m for m in moves if m[0] not in [c[0] for c in cur] and spent+COST[m[1]]<=BUDGET]
        if not cands: break
        R=beval(G,I,les,[cur+[m] for m in cands]); sc,acc,col=score_vec(R,h,j,len(cur)+1)
        i=int(np.argmax(sc)); cur.append(cands[i]); spent+=COST[cands[i][1]]
        best=(sc[i],acc[i],col[i])
    print(f'{s}: lesion {[str(x) for x in les]} reach {ld[j]/h[j]:.0%} ok={ok} | ops {len(ops)} | single acc>=.5: {(acc1>=.5).sum()}/{len(moves)} (>=.8: {(acc1>=.8).sum()}) | greedy par {best[0]:.0f} (acc {best[1]:.2f} col {best[2]:.2f}) with {[ (str(a),b) for a,b in cur]}')
