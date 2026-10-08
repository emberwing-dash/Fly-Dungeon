"""Compare the browser simulator (parity.mjs output) with the numpy reference.  Run:  node parity.mjs > parity_js.json && python parity.py"""
import sys, json; sys.path.insert(0, '.')
import numpy as np
from moves import *
import make_cases as mc
G = mc.G
js = json.load(open('parity_js.json'))
cj = json.load(open('../web/data/cases.json'))
worst = 0.0
for c in cj['cases']:
    j = names.index(c['target']); I = G.src(c['scenario'], c['stimulus']['strength'])
    r = beval(G, I, c['lesion'], [[], [(t, k) for t, k in c['par']['moves']]])
    h = beval(G, I, [], [[]])[0]
    py = dict(healthy=float(h[j]), damaged=float(r[0][j]), fixed=float(r[1][j]))
    worst = max(worst, max(abs(py[k] - js[c['id']][k]) for k in py))
print('max abs difference JS vs numpy over all cases:', worst)
