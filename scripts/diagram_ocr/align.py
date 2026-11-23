"""Align Part II diagrams with replayed game positions using cluster-based occupancy."""
import sys, re, json
sys.path.append("/home/ccollins/projects/chess/.venv/lib/python3.12/site-packages")
import numpy as np, chess
sys.path.insert(0, '/home/ccollins/projects/chess'); sys.path.append('/home/ccollins/projects/chess/.venv/lib/python3.12/site-packages')
from corpus_tools.gutenberg_html import extract_blocks
from corpus_tools.descriptive import split_moves, resolve_line
D = '/tmp/claude-1000/-home-ccollins-projects-chess/3dc6cc5d-c969-470a-83d4-763fecb3799d/scratchpad/diag2/'
EMPTY = {0,2,4,9,21,28,31,34,38,1000,1010,1011,1012,1014,1019,1020,1030,1033,1036,1038,1034}
lab = np.load(D + 'cap_clusters.npy'); meta = [l.split('\t') for l in open(D + 'cap_meta.tsv').read().split('\n') if l]
occ = {}
for (fig, sq), c in zip(meta, lab):
    occ.setdefault(fig, {})[sq.strip()] = int(c) not in EMPTY
blocks = extract_blocks(open(sys.argv[1], encoding='latin-1').read())
start = next(i for i, b in enumerate(blocks) if b['kind'] == 'heading' and b['text'] == 'PART II')
games = []  # (name, texts, [(fig, n_texts_before)])
for b in blocks[start:]:
    if b['kind'] == 'center' and re.match(r'GAME \d+', b['text']):
        games.append([b['text'], [], []]); continue
    if not games: continue
    if b['kind'] == 'moves':
        for line in b['text'].split('\n'): games[-1][1].extend(split_moves(line))
    elif b['kind'] == 'figure':
        games[-1][2].append((re.search(r'(Fig\d+)', b['src']).group(1), len(games[-1][1])))
out = {}
for name, texts, figs in games:
    moves, err = resolve_line(chess.Board(), texts)
    boards = [chess.Board()]
    for m in moves:
        nb = boards[-1].copy(); nb.push(m); boards.append(nb)
    for fig, n in figs:
        o = occ[fig]
        def dist(b):
            return sum(o[chess.square_name(s)] != (b.piece_at(s) is not None) for s in chess.SQUARES)
        cand = range(max(0, n - 4), min(len(boards), n + 5))
        scored = sorted((dist(boards[i]), abs(i - n), i) for i in cand)
        d, _, i = scored[0]
        out[fig] = {'game': name, 'ply': i, 'expected_ply': n, 'fen': boards[n].fen(), 'dist': d}
        print(fig, name[:22], 'ply', i, 'texts-before', n, 'hamming', d, '(next best', scored[1][0], ')')
json.dump(out, open(D + 'part2_align.json', 'w'), indent=1)
