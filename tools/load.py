"""Load the male-CNS connectome tables shipped with the ref2/fly repo (flat binaries)."""
import json, numpy as np, scipy.sparse as sp
from pathlib import Path
D = Path(__file__).resolve().parents[2] / "ref2" / "fly" / "public" / "data"

def load():
    meta = json.load(open(D / "meta.json"))
    b = np.fromfile(D / "graph_w3.bin", dtype=np.uint8)
    N, E = (int(x) for x in np.frombuffer(b[:8], dtype=np.uint32))
    o = 8
    indptr = np.frombuffer(b[o:o + 4 * (N + 1)], dtype=np.uint32); o += 4 * (N + 1)
    ind = np.frombuffer(b[o:o + 4 * E], dtype=np.uint32); o += 4 * E
    w = np.frombuffer(b[o:o + 2 * E], dtype=np.uint16)
    A = sp.csr_matrix((w.astype(np.float32), ind.astype(np.int64), indptr.astype(np.int64)), shape=(N, N))
    sign = np.fromfile(D / "ntsign.bin", dtype=np.float32)
    nb = np.fromfile(D / "neurons.bin", dtype=np.uint8)
    o = 8 + 8 * N + 12 * N + 8 * N
    cls = np.frombuffer(nb[o:o + 2 * N], dtype=np.uint16); o += 2 * N
    nt = nb[o:o + N]; sc = nb[o + N:o + 2 * N]; side = nb[o + 2 * N:o + 3 * N]
    info = dict(cls=cls, nt=nt, sc=sc, side=side,
                types=np.array(meta["types"]), inst=np.array(meta["instances"]))
    return meta, A, sign, info, N

if __name__ == "__main__":
    meta, A, sign, info, N = load()
    from collections import Counter
    print(N, A.nnz)
    print(Counter(np.array(meta["superclasses"])[info["sc"]]).most_common())
    print(Counter(np.array(meta["classes"])[info["cls"]]).most_common())
