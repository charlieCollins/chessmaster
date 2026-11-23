import sys, glob, re, numpy as np
sys.path.insert(0, '.')
import board
from scipy.ndimage import gaussian_filter
from scipy.cluster.vq import kmeans2
D = sys.argv[1]; out = sys.argv[2]
figs = sorted(glob.glob(D + '/Fig*.jpg'), key=lambda p: int(re.search(r'Fig(\d+)', p).group(1)))
X, meta = [], []
for p in figs:
    sq, _ = board.squares(p)
    fig = re.search(r'(Fig\d+)', p).group(1)
    for s, a in sq.items():
        X.append(gaussian_filter(a, 1.0).ravel()); meta.append((fig, s))
X = np.array(X); np.save(out + '_X.npy', X)
with open(out + '_meta.tsv', 'w') as f:
    for fig, s in meta: f.write(f'{fig}\t{s}\n')
print(X.shape)
