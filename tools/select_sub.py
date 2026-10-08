import sys; sys.path.insert(0,'.')
import numpy as np, pickle, scipy.sparse as sp
from prop import Brain
from scen_test import SC, BEH
B=Brain()
absW=abs(B.W).tocsr(); absWT=absW.T.tocsr()
def reach(vec, M, K=5):
    x=vec.astype(np.float32).copy(); acc=np.zeros_like(x)
    for _ in range(K):
        x=M@x; acc+=x
    return acc
CASE={'loom':'escape','dust':'groom','mate':'court','prey':'approach','taste':'feed'}
out={}
for sname,beh in CASE.items():
    s=np.zeros(B.N,np.float32)
    for ty in SC[sname]: s[B.ids(ty)]=1
    t=np.zeros(B.N,np.float32)
    for ty in BEH[beh]: t[B.ids(ty)]=1
    f=reach(s,absW); b=reach(t,absWT)
    score=f*b
    # aggregate to types
    agg={}
    for i in np.where(score>0)[0]:
        agg.setdefault(B.types[i],[0.0,0])
        agg[B.types[i]][0]+=score[i]; agg[B.types[i]][1]+=1
    rank=sorted(((v[0],k,v[1]) for k,v in agg.items() if k),reverse=True)
    cum=0; sel=[]
    for sc_,k,n in rank:
        if len(sel)>=80: break
        sel.append((k,n,float(sc_)))
    print(sname,beh,'types',len(rank),'neurons in top80',sum(n for _,n,_ in sel))
    print('  ',[(k,n) for k,n,_ in sel[:25]])
    out[sname]=sel
pickle.dump(out,open('sel.pkl','wb'))
