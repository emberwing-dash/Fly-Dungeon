import sys; sys.path.insert(0,'.')
import numpy as np
import gsim
from cases_make import *
sensall=set(); 
cand2=[t for t in G.types if t not in dns]
for boost in (0.12,0.25,0.4):
    gsim.BOOST=boost
    print('##### BOOST',boost)
    for s,(beh,st) in CASE.items():
        I=G.src(s,st); hv=one(I,[],[]); j=names.index(beh)
        les=greedy_lesion(s,j,I,hv,8,[t for t in cand2 if t not in SC[s]]); lv=one(I,les,[])
        pool=[t for t in cand2 if t not in les]
        R=beval(I,[les]*len(pool),[[t] for t in pool]); gain=(R[:,j]-lv[j])/max(hv[j]-lv[j],1e-6)
        fix=[]
        for step in range(3):
            R=beval(I,[les]*len(pool),[fix+[t] for t in pool]); score=R[:,j]-0.5*np.delete(R,j,axis=1).clip(0).max(axis=1)
            i=int(np.argmax(score)); fix.append(pool[i])
        f=one(I,les,fix)
        print(f'{s:5s} lesion {len(les)} types: {hv[j]:.3f}->{lv[j]:.3f} | good single moves(>=25% rec): {(gain>=0.25).sum()}/{len(pool)} best single {gain.max():.2f} | greedy3 recovery {(f[j]-lv[j])/max(hv[j]-lv[j],1e-6):.2f} collateral {np.delete(f,j).max():.3f}')
