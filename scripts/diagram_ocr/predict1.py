exec(open('/tmp/claude-1000/-home-ccollins-projects-chess/3dc6cc5d-c969-470a-83d4-763fecb3799d/scratchpad/diag2/knn.py').read().split('# leave-one-diagram-out')[0])
import re
sys.path.insert(0, '/home/ccollins/projects/chess')
from corpus_tools.gutenberg_html import extract_blocks
from corpus_tools.descriptive import split_moves, resolve_line
tr = np.where(lab)[0]
part1 = sorted({f for f in figs if f not in al}, key=lambda f: int(f[3:]))
pred = {}
for f in part1:
    te = np.where(figs == f)[0]
    pred[f] = {meta[j][1]: (p, d) for j, (p, d) in zip(te, knn_predict(tr, te))}
def to_fen(sqs):
    rows = []
    for r in range(8, 0, -1):
        row = ''; e = 0
        for fl in 'abcdefgh':
            p = sqs[fl + str(r)][0]
            if p == '.': e += 1
            else:
                row += (str(e) if e else '') + p; e = 0
        rows.append(row + (str(e) if e else ''))
    return '/'.join(rows)
blocks = extract_blocks(open(sys.argv[1], encoding='latin-1').read())
stop = next(i for i, b in enumerate(blocks) if b['kind'] == 'heading' and b['text'] == 'PART II')
follow = {}; cur = None
for b in blocks[:stop]:
    if b['kind'] == 'figure':
        m = re.search(r'(Fig\d+)', b['src'])
        cur = m.group(1) if m else None
        if cur: follow[cur] = []
    elif b['kind'] == 'moves' and cur:
        follow[cur].append(b['text'])
    elif b['kind'] == 'heading':
        cur = None
res = {}
for f in part1:
    placement = to_fen(pred[f])
    unsure = sorted(sq for sq, (p, d) in pred[f].items() if d > 0.8 or p.lower() in 'qk' and d > 0.5)
    texts = [m for t in follow.get(f, []) for line in t.split('\n') for m in split_moves(line)]
    best = None
    for side in 'wb':
        try:
            b = chess.Board(f'{placement} {side} - - 0 1')
        except ValueError:
            continue
        moves, err = resolve_line(b, texts)
        if best is None or len(moves) > best[1]:
            best = (side, len(moves), err, b.is_valid())
    res[f] = {'placement': placement, 'unsure': unsure, 'side': best[0], 'read': best[1], 'of': len(texts), 'err': best[2], 'valid': best[3]}
    print(f, placement, best[0], f'{best[1]}/{len(texts)}', 'valid' if best[3] else 'INVALID', 'unsure:' + ','.join(unsure) if unsure else '')
json.dump(res, open(D + 'part1_pred.json', 'w'), indent=1)
