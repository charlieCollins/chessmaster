import sys, numpy as np
from scipy.cluster.vq import kmeans2
from PIL import Image, ImageDraw
pre = sys.argv[1]; K = int(sys.argv[2])
X = np.load(pre + '_X.npy'); meta = [l.split('\t') for l in open(pre + '_meta.tsv').read().split('\n') if l]
dark = np.array([("abcdefgh".index(s.strip()[0]) + int(s.strip()[1])) % 2 == 1 for _, s in meta])
labels = np.full(len(X), -1)
rng = np.random.default_rng(0)
for par, off in ((False, 0), (True, 1000)):
    idx = np.where(dark == par)[0]
    best = None
    for seed in range(3):
        c, l = kmeans2(X[idx], K, minit='++', seed=seed)
        err = ((X[idx] - c[l]) ** 2).sum()
        if best is None or err < best[0]: best = (err, c, l)
    labels[idx] = best[2] + off
np.save(pre + '_clusters.npy', labels)
# contact sheet: one row per cluster, 10 samples
ids = sorted(set(labels)); S = 32
sheet = Image.new('L', (60 + 10 * (S + 2), len(ids) * (S + 2)), 255)
d = ImageDraw.Draw(sheet)
for row, cid in enumerate(ids):
    mem = np.where(labels == cid)[0]
    pick = rng.choice(mem, min(10, len(mem)), replace=False)
    d.text((2, row * (S + 2) + 10), f'{cid}:{len(mem)}', fill=0)
    for j, m in enumerate(pick):
        sheet.paste(Image.fromarray((X[m].reshape(S, S) * 255).astype(np.uint8)), (60 + j * (S + 2), row * (S + 2)))
sheet.save(pre + '_clusters.png'); print(len(ids), 'clusters', sheet.size)
