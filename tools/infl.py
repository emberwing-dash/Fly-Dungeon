import sys; sys.path.insert(0,'.')
import numpy as np, time, pickle
from prop import Brain
B=Brain()
sens_cls={'gustatory','olfactory','visual','thermosensory','hygrosensory','mechanosensory','mechanosensory_proprioceptive','mechanosensory_tactile','chemosensory'}
stypes=sorted({B.types[i] for i in np.where(np.isin(B.cl,list(sens_cls))|(B.sc=='visual_projection'))[0] if B.types[i]})
dn_idx=np.where((B.sc=='descending_neuron')|(B.sc=='cb_motor'))[0]
dn_types=sorted({B.types[i] for i in dn_idx if B.types[i]})
dtix={t:[i for i in B.ids(t)] for t in dn_types}
print(len(stypes),len(dn_types))
def hops(src, K=5):
    x=np.zeros(B.N,np.float32); x[src]=1.0
    acc=np.zeros(B.N,np.float32)
    for k in range(K):
        x=B.W@x
        acc+=x
    return acc
t=time.time()
M=np.zeros((len(stypes),len(dn_types)),np.float32)
for a,s in enumerate(stypes):
    src=B.ids(s)
    if len(src)==0: continue
    acc=hops(src)
    M[a]=[acc[dtix[d]].mean() for d in dn_types]
print(time.time()-t)
pickle.dump((stypes,dn_types,M),open('infl.pkl','wb'))
def best(dn,k=8):
    j=dn_types.index(dn); o=np.argsort(-M[:,j])[:k]; return [(stypes[a],round(float(M[a,j]),4)) for a in o]
for d in ['MDN','DNg07','DNg08','DNp13','pIP10','DNg100','DNg97','DNp09','DNp01','DNa08','DNg02_a','MN9','DNa02']:
    if d in dn_types: print(d,best(d))
