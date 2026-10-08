import sys; sys.path.insert(0,'.')
import numpy as np, time
from gsim import *
G=Game()
CASE={'loom':'escape','dust':'groom','mate':'court','prey':'approach','taste':'feed'}
sens=set(t for ts in SC.values() for t in ts)
dns=set(t for ts in BEH.values() for t in ts)
cand=[t for t in G.types if t not in sens and t not in dns]
print(len(cand),'candidate intervention types')
def batch_eval(I, sil, boo):
    B=len(sil); out=[]
    for k in range(0,B,64):
        s=sil[k:k+64]; b=boo[k:k+64]
        x=G.run(I,silence_types=s,boost_types=b,batch=len(s)); r=G.readout(x)
        out.append(np.stack([r[bh] for bh in BEH],axis=1))
    return np.concatenate(out)
names=list(BEH)
for s,beh in CASE.items():
    t0=time.time()
    I=G.src(s); h=G.readout(G.run(I)); hv=np.array([float(h[b]) for b in names])
    j=names.index(beh)
    R=batch_eval(I,[[t] for t in cand],[[] for _ in cand])
    d=hv[j]-R[:,j]; o=np.argsort(-d)[:8]
    print(s,beh,'healthy',round(hv[j],3),'crit:',[(cand[i],round(float(d[i]),3)) for i in o])
    other=np.delete(R-hv,j,axis=1).max(axis=1); o2=np.argsort(-other)[:6]
    print('   disinhib (silence raises other behaviours):',[(cand[i],round(float(other[i]),3)) for i in o2])
    B_=batch_eval(I,[[] for _ in cand],[[t] for t in cand]); up=B_[:,j]-hv[j]; o3=np.argsort(-up)[:5]
    print('   boost raises target:',[(cand[i],round(float(up[i]),3)) for i in o3], round(time.time()-t0,1),'s')
