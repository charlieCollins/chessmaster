import sys, re, json
sys.path.insert(0, '/home/ccollins/projects/chess')
import chess
from corpus_tools.gutenberg_html import extract_blocks
from corpus_tools.mainline import mainline_after
D = '/tmp/claude-1000/-home-ccollins-projects-chess/3dc6cc5d-c969-470a-83d4-763fecb3799d/scratchpad/diag2/'
pred = json.load(open(D + 'part1_pred.json'))
fixes = dict(l.split() for l in open(D + 'fixes.txt') if l.strip())
blocks = extract_blocks(open(sys.argv[1], encoding='latin-1').read())
stop = next(i for i, b in enumerate(blocks) if b['kind'] == 'heading' and b['text'] == 'PART II')
sections = {}; cur = None
for b in blocks[:stop]:
    if b['kind'] == 'figure':
        m = re.search(r'(Fig\d+)', b['src']); cur = m.group(1) if m else None
        if cur: sections[cur] = []
    elif b['kind'] in ('heading', 'center'): cur = None
    elif cur: sections[cur].append(b)
out = {}
for f in sorted(sections, key=lambda x: int(x[3:])):
    placement = fixes.get(f, pred[f]['placement'])
    best = None
    for side in 'wb':
        b = chess.Board(f'{placement} {side} - - 0 1')
        line = mainline_after(b, sections[f])
        if best is None or len(line.sans) > len(best[1].sans): best = (side, line, b)
    side, line, b = best
    valid = b.is_valid()
    out[f] = {'placement': placement, 'side': 'w' if line.side else 'b', 'sans': line.sans, 'source': line.source, 'error': line.error, 'valid': valid}
    flag = '' if not line.error else 'ERR ' + line.error[:110]
    print(f'{f:6} {"fixed" if f in fixes else "     "} {"valid" if valid else "INVAL"} {out[f]["side"]} {len(line.sans):3} {line.source or "-":5} {" ".join(line.sans[:6])[:40]:40} {flag}')
json.dump(out, open(D + 'part1_verified.json', 'w'), indent=1)
