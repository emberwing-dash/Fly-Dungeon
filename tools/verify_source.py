"""Verify that the brain shipped in web/data is derived from the real connectome files of the ref2/fly project.
1. Re-hash the source files and compare with web/data/provenance.json.
2. Rebuild every shipped synapse weight from the raw source graph and compare with web/data/brain.bin.
Run:  python verify_source.py"""
import sys, json, hashlib, pickle
sys.path.insert(0, '.')
from pathlib import Path
import numpy as np
from load import load, D
OUT = Path(__file__).resolve().parents[1] / 'web' / 'data'
prov = json.load(open(OUT / 'provenance.json'))
ok = True
for name, f in prov['files'].items():
    h = hashlib.sha256(); [h.update(c) for c in iter(lambda fh=open(D / name, 'rb'): fh.read(1 << 20), b'')]
    same = h.hexdigest() == f['sha256']; ok &= same
    print(f"{'OK ' if same else 'BAD'} {name:14s} {f['bytes']:>12,d} bytes  sha256 {h.hexdigest()[:16]}...")
meta, A, sign, info, N = load()
types_sub, nid = pickle.load(open('sub_sel.pkl', 'rb')); n = len(nid)
sh = np.fromfile(OUT / 'brain.bin', dtype=np.uint8); off = 2 * n; off += (-off) % 4
indptr = np.frombuffer(sh[off:off + 4 * (n + 1)], dtype=np.uint32); off += 4 * (n + 1); nnz = int(indptr[-1])
ind = np.frombuffer(sh[off:off + 2 * nnz], dtype=np.uint16); off += 2 * nnz; off += (-off) % 4
w = np.frombuffer(sh[off:off + 4 * nnz], dtype=np.float32)
tot_in = np.asarray(A.sum(axis=0)).ravel() + 1e-9
sub = A[nid][:, nid].T.tocsr()                      # post x pre raw synapse counts, taken straight from the source graph
want = sub.multiply(sign[nid][None, :]).tocsr(); want = want.multiply((1.0 / tot_in[nid])[:, None]).tocsr(); want.sort_indices()
same_struct = np.array_equal(want.indptr, indptr) and np.array_equal(want.indices.astype(np.uint16), ind)
diff = float(np.abs(want.data.astype(np.float32) - w).max()) if same_struct else float('nan')
print(f"{'OK ' if same_struct and diff < 1e-6 else 'BAD'} shipped brain.bin: {n} neurons, {nnz} connections, structure identical to the source subgraph: {same_struct}, max weight difference {diff:.2e}")
ok &= same_struct and diff < 1e-6
print('ALL CHECKS PASSED' if ok else 'MISMATCH')
sys.exit(0 if ok else 1)
