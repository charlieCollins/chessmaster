"""Locate the 8x8 board inside a scanned diagram and cut it into squares."""
import numpy as np
from PIL import Image

def load_gray(path):
    return np.asarray(Image.open(path).convert("L"), dtype=np.float32) / 255.0

def frame_edges(g):
    """Return (top, bottom, left, right) of the playing area (inside the frame)."""
    dark = g < 0.5
    rows = dark.mean(axis=1); cols = dark.mean(axis=0)
    def inner(profile, forward):
        n = len(profile); idx = range(n) if forward else range(n - 1, -1, -1)
        seen = False; last = None
        edge = [profile[i] for k, i in enumerate(idx) if k <= n * 0.2]
        thr = min(0.6, 0.7 * max(edge))
        for k, i in enumerate(idx):
            if k > n * 0.2: break
            if profile[i] > thr: seen = True; last = i
            elif seen and k > 0 and last is not None and abs(i - last) > 6: break
        return last
    t = inner(rows, True); b = inner(rows, False); l = inner(cols, True); r = inner(cols, False)
    return t + 1, b, l + 1, r

def squares(path, size=32, margin=0.08):
    g = load_gray(path)
    t, b, l, r = frame_edges(g)
    h = (b - t) / 8; w = (r - l) / 8
    out = {}
    for rank in range(8):          # rank index 0 = rank 8 (top)
        for file in range(8):
            y0 = int(t + rank * h + margin * h); y1 = int(t + (rank + 1) * h - margin * h)
            x0 = int(l + file * w + margin * w); x1 = int(l + (file + 1) * w - margin * w)
            crop = Image.fromarray((g[y0:y1, x0:x1] * 255).astype(np.uint8)).resize((size, size), Image.BILINEAR)
            sq = "abcdefgh"[file] + str(8 - rank)
            out[sq] = np.asarray(crop, dtype=np.float32) / 255.0
    return out, (t, b, l, r)
