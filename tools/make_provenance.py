"""Export the proof that the game's brain is the real connectome from the ref2 project.
Writes web/data/brain_ids.json (FlyEM body ids + instance names of every simulated neuron) and web/data/provenance.json
(source repo, commit, SHA-256 of the source files, counts, and sample edges recomputed from the raw synapse counts)."""
import sys, json, hashlib, subprocess, pickle
sys.path.insert(0, '.')
from pathlib import Path
import numpy as np
from load import load, D

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT / 'ref2' / 'fly'
OUT = Path(__file__).resolve().parents[1] / 'web' / 'data'

def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

meta, A, sign, info, N = load()
types_sub, nid = pickle.load(open('sub_sel.pkl', 'rb'))
nb = np.fromfile(D / 'neurons.bin', dtype=np.uint8)
body = np.frombuffer(nb[8:8 + 8 * N], dtype=np.int64)
inst = meta['instances']
soma = np.frombuffer(nb[8 + 8 * N:8 + 8 * N + 12 * N], dtype=np.float32).reshape(N, 3)
scn = np.array(meta['superclasses'])[info['sc']]
def kind(s): return 0 if 'sensory' in s or s == 'visual_projection' else 1 if s in ('descending_neuron', 'cb_motor', 'vnc_motor', 'cb_efferent', 'vnc_efferent') else 2 if 'intrinsic' in s else 3
ids = dict(n=len(nid), global_index=[int(i) for i in nid], body_id=[int(body[i]) for i in nid], instance=[inst[i] for i in nid],
           superclass=[str(scn[i]) for i in nid], kind=[kind(str(scn[i])) for i in nid],
           xyz=[[int(v) for v in soma[i]] if np.isfinite(soma[i]).all() else [None, None, None] for i in nid])
json.dump(ids, open(OUT / 'brain_ids.json', 'w'), separators=(',', ':'))

git = lambda *a: subprocess.run(['git', '-C', str(REPO), *a], capture_output=True, text=True).stdout.strip()
files = {}
for name in ['graph_w3.bin', 'meta.json', 'ntsign.bin', 'neurons.bin']:
    p = D / name; files[name] = dict(path=f'ref2/fly/public/data/{name}', bytes=p.stat().st_size, sha256=sha(p))

# sample edges: recompute our normalised weight from the raw synapse counts in the source graph
shipped = np.fromfile(OUT / 'brain.bin', dtype=np.uint8)
n = len(nid); off = 2 * n; off += (-off) % 4
indptr = np.frombuffer(shipped[off:off + 4 * (n + 1)], dtype=np.uint32); off += 4 * (n + 1)
nnz = int(indptr[-1]); indices = np.frombuffer(shipped[off:off + 2 * nnz], dtype=np.uint16); off += 2 * nnz; off += (-off) % 4
weights = np.frombuffer(shipped[off:off + 4 * nnz], dtype=np.float32)
tot_in = np.asarray(A.sum(axis=0)).ravel()
rng = np.random.default_rng(3); local_of = {int(g): i for i, g in enumerate(nid)}
samples = []
landmark = [i for i, g in enumerate(nid) if inst[g].startswith('DNp01')]
picks = []
for post in landmark[:1] + list(rng.choice(n, 11, replace=False)):
    post = int(post)
    row = np.arange(indptr[post], indptr[post + 1])
    if not len(row): continue
    k = int(row[np.argmax(np.abs(weights[row]))]) if post in landmark else int(rng.choice(row))
    pre = int(indices[k]); gpre, gpost = int(nid[pre]), int(nid[post])
    raw = float(A[gpre, gpost]); recomputed = float(sign[gpre]) * raw / float(tot_in[gpost])
    samples.append(dict(pre=inst[gpre], pre_body=int(body[gpre]), post=inst[gpost], post_body=int(body[gpost]), synapses=int(raw), transmitter_sign=float(sign[gpre]), input_synapses_of_post=int(tot_in[gpost]), weight_shipped=float(weights[k]), weight_from_source=recomputed))
maxdiff = max(abs(s['weight_shipped'] - s['weight_from_source']) for s in samples)

prov = dict(
    project='fly-brain by Lulzx (browser-based embodied male fruit-fly connectome simulator)',
    repo=git('config', '--get', 'remote.origin.url').replace('.git', ''), commit=git('rev-parse', 'HEAD'), commit_author=git('log', '-1', '--format=%an'), commit_date=git('log', '-1', '--format=%ad'),
    licence_project='MIT', data_origin='FlyEM / Janelia male CNS connectome v1.0 (CC-BY 4.0), packed by the project from gs://flyem-male-cns/v1.0',
    source_totals=dict(neurons=int(N), connections=int(A.nnz), cell_types=len(set(meta['types']))),
    shipped=dict(neurons=int(n), connections=nnz, cell_types=len(types_sub)),
    files=files, sample_edges=samples, sample_max_abs_diff=maxdiff,
    how_to_verify='cd tools && python verify_source.py',
)
json.dump(prov, open(OUT / 'provenance.json', 'w'), indent=1)
print('brain_ids.json', (OUT / 'brain_ids.json').stat().st_size // 1024, 'KB; samples', len(samples), 'max diff', maxdiff)
print(prov['repo'], prov['commit'][:10], prov['source_totals'], prov['shipped'])
