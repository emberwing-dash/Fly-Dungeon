import sys; sys.path.insert(0,'.')
import numpy as np
from prop import Brain
B=Brain()
BEH={'escape':['DNp01','DNp02','DNp04'],'approach':['DNp09','DNg97','DNg100'],'retreat':['MDN'],'groom':['DNg07','DNg08'],
     'court':['pIP10','DNp13'],'flight':['DNa08','DNg02_a'],'feed':['MN9'],'turn':['DNa01','DNa02']}
SC={'loom':['LC4','LPLC2'],
    'dust':['JO-ED2_b','JO-ED2_c','JO-EV3','JO-CM','JO-EV1','JO-EV6','JO-ED1','SApp10'],
    'mate':['LC10a','LC10d','LC10c-1','LC10c-2','ORN_DA1'],
    'prey':['LC9','LC31a','LC31b','LPC1','LLPC1','LC19'],
    'taste':['LB3c','LB3d','LB3b','GNG642','BM'],
    'wind':['LgAG1','SNta02,SNta09','LC9','LPLC1']}
def run(name,gain=4,theta=0.02,strength=1.0,silence=None):
    drive={i:strength for ty in SC[name] for i in B.ids(ty)}
    r=B.run(drive,gain=gain,theta=theta,silence=silence,steps=40)
    return {b:round(float(np.mean([r[i] for t in ts for i in B.ids(t)] or [0])),2) for b,ts in BEH.items()}, r
if __name__=='__main__':
  for g in (3,4,5,6):
    print('== gain',g)
    for s in SC:
        o,r=run(s,g); print(f'{s:6s}',o,f'act {(r>0.01).mean():.3f}')
