"""Select the pathway subgraph that the game runs on and export it."""
import sys; sys.path.insert(0,'.')
import numpy as np, pickle, scipy.sparse as sp
from prop import Brain
B=Brain()
sel=pickle.load(open('sel.pkl','rb'))
from scen_test import SC, BEH
TOPN=int(sys.argv[1]) if len(sys.argv)>1 else 70
types=set()
for s,lst in sel.items(): types.update(k for k,_,_ in lst[:TOPN])
for ts in SC.values(): types.update(ts)
for ts in BEH.values(): types.update(ts)
types={t for t in types if t in B.tidx}
nid=np.concatenate([B.tidx[t] for t in sorted(types)])
print('types',len(types),'neurons',len(nid))
sub=B.W[nid][:,nid]
print('edges',sub.nnz)
pickle.dump((sorted(types),nid),open('sub_sel.pkl','wb'))
