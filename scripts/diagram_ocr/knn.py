import sys, json
sys.path.append('/home/ccollins/projects/chess/.venv/lib/python3.12/site-packages')
import numpy as np, chess
D = '/tmp/claude-1000/-home-ccollins-projects-chess/3dc6cc5d-c969-470a-83d4-763fecb3799d/scratchpad/diag2/'
X = np.load(D + 'cap_X.npy'); meta = [tuple(x.strip() for x in l.split('\t')) for l in open(D + 'cap_meta.tsv').read().split('\n') if l]
al = json.load(open(D + 'part2_align.json'))
# use expected ply (diagram placed right after that many moves)
import re
def label(fen, sq):
    p = chess.Board(fen).piece_at(chess.parse_square(sq)); return p.symbol() if p else '.'
y = np.array(['?'] * len(meta), dtype=object); figs = np.array([m[0] for m in meta])
dark = np.array([("abcdefgh".index(s[0]) + int(s[1])) % 2 == 1 for _, s in meta])
# features: normalise each crop (subtract mean, unit norm) so ink pattern dominates
F = X - X.mean(axis=1, keepdims=True); F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-6
F = np.hstack([F, X.mean(axis=1, keepdims=True) * 3])
for i, (fig, sq) in enumerate(meta):
    if fig in al: y[i] = label(al[fig]['fen'], sq)
lab = y != '?'
print('labelled squares', lab.sum(), 'classes', sorted(set(y[lab])))
def knn_predict(train_idx, test_idx, k=1):
    A = F[train_idx]; out = []
    for j in test_idx:
        same = dark[train_idx] == dark[j]
        d = ((A - F[j]) ** 2).sum(axis=1); d[~same] = 1e9
        nn = np.argsort(d)[:k]
        vals, cnt = np.unique(y[train_idx][nn], return_counts=True)
        out.append((vals[np.argmax(cnt)], float(np.sqrt(d[nn[0]]))))
    return out
# leave-one-diagram-out on the labelled set
errs = 0; tot = 0; bad = []
lf = sorted(set(figs[lab]))
for f in lf:
    tr = np.where(lab & (figs != f))[0]; te = np.where(figs == f)[0]
    pred = knn_predict(tr, te)
    for j, (p, d) in zip(te, pred):
        tot += 1
        if p != y[j]: errs += 1; bad.append((f, meta[j][1], y[j], p, round(d, 3)))
print('LODO errors', errs, '/', tot)
for b in bad[:40]: print(b)
