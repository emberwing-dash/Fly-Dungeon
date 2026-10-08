import sys; sys.path.insert(0,'.')
import numpy as np
from prop import Brain
B=Brain()
BEH={'escape':['DNp01','DNp02','DNp04'],'walk':['DNg100','DNg97','DNp09'],'retreat':['MDN'],'groom':['DNg07','DNg08'],
     'court':['pIP10','DNp13'],'flight':['DNa08','DNg02_a','DNg02_b'],'feed':['MN9'],'turn':['DNa01','DNa02']}
ST={'loom':['LC4','LPLC2'],'sweet':['LB3b','LB3c','LgLG3','LgLG4','LgAG2'],'bitter':['LB1a','LB1b','LB1c','LB1d','LgAG1'],
 'water':['LB3a'],'wind/JO':[t for t in B.tidx if t.startswith('JO-')],'pheromone':['ORN_DA1','ORN_VA1v','ORN_VA1d'],
 'vinegar':['ORN_DM1','ORN_DM4','ORN_VA2','ORN_DP1m','ORN_DM2','ORN_VM2','ORN_DL1'],'CO2':['ORN_V'],'geosmin':['ORN_DA2'],
 'heat':[t for t in B.tidx if t.startswith('TRN_')],'humid':[t for t in B.tidx if t.startswith('HRN_')],
 'smallobj':['LC10a','LC10b'],'tactile':[t for t in B.tidx if t.startswith('SNta')],'LC6':['LC6'],'LC11':['LC11']}
def run(name,gain,theta=0.02,strength=1.0,silence=None):
    drive={}
    for ty in ST[name]:
        for i in B.ids(ty): drive[i]=strength
    r=B.run(drive,gain=gain,theta=theta,silence=silence)
    return {b:float(np.mean([r[i] for t in ts for i in B.ids(t)] or [0])) for b,ts in BEH.items()}, r
if __name__=='__main__':
    for g in [3,4,5]:
        print('=== gain',g)
        for s in ST:
            o,r=run(s,g); print(f'{s:10s}',' '.join(f'{k}:{v:.2f}' for k,v in o.items()), f'| active {(r>0.01).mean():.2f}')
