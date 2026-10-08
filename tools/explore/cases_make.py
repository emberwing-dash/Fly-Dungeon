import sys; sys.path.insert(0,'.')
import numpy as np, time, json
import gsim
from gsim import *
G=Game()
names=list(BEH)
sens=set(t for ts in SC.values() for t in ts); dns=set(t for ts in BEH.values() for t in ts)
cand=[t for t in G.types if t not in sens and t not in dns]
def beval(I, sil, boo):
    out=[]
    for k in range(0,len(sil),64):
        s=sil[k:k+64]; b=boo[k:k+64]
        r=G.readout(G.run(I,silence_types=s,boost_types=b,batch=len(s))); out.append(np.stack([np.asarray(r[bh],dtype=np.float32) for bh in names],axis=1))
    return np.concatenate(out)
def one(I,sil,boo): return beval(I,[list(sil)],[list(boo)])[0]
CASE={'loom':('escape',0.25),'dust':('groom',1.0),'mate':('court',1.0),'prey':('approach',1.0),'taste':('feed',1.0)}
def greedy_lesion(s,j,I,hv,k,pool):
    les=[]
    for _ in range(k):
        R=beval(I,[les+[t] for t in pool],[[] for _ in pool]); i=int(np.argmin(R[:,j])); les.append(pool[i])
        if R[i,j]<0.3*hv[j]: break
    return les
if __name__=='__main__':
    for s,(beh,st) in CASE.items():
        I=G.src(s,st); hv=one(I,[],[]); j=names.index(beh)
        les=greedy_lesion(s,j,I,hv,8,cand); lv=one(I,les,[])
        print(s,beh,'strength',st,'healthy',round(float(hv[j]),3),'lesion',les,'->',round(float(lv[j]),3))
        # greedy fix with boosts only (not on lesioned)
        pool=[t for t in cand if t not in les]; fix=[]
        for step in range(4):
            R=beval(I,[les]*len(pool),[fix+[t] for t in pool]); score=R[:,j]-0.5*np.delete(R,j,axis=1).clip(0).max(axis=1)
            i=int(np.argmax(score)); fix.append(pool[i]); print('   +boost',pool[i],'target',round(float(R[i,j]),3),'(',round(float(R[i,j]/hv[j]),2),'of healthy )')
