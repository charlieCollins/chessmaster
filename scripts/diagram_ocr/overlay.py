import sys, json, glob
sys.path.insert(0, '/tmp/claude-1000/-home-ccollins-projects-chess/3dc6cc5d-c969-470a-83d4-763fecb3799d/scratchpad/diag2')
import board
from PIL import Image, ImageDraw, ImageFont
D = '/tmp/claude-1000/-home-ccollins-projects-chess/3dc6cc5d-c969-470a-83d4-763fecb3799d/scratchpad/diag2/'
IMG = '/tmp/claude-1000/-home-ccollins-projects-chess/3dc6cc5d-c969-470a-83d4-763fecb3799d/scratchpad/unz/33870/33870-h/images/'
pred = json.load(open(D + 'part1_pred.json'))
font = ImageFont.truetype(glob.glob('/usr/share/fonts/**/DejaVuSans-Bold.ttf', recursive=True)[0], 30)
small = ImageFont.truetype(glob.glob('/usr/share/fonts/**/DejaVuSans-Bold.ttf', recursive=True)[0], 34)
def render(fig, placement, S=460):
    im = Image.open(IMG + fig + '.jpg').convert('RGB'); g = board.load_gray(IMG + fig + '.jpg')
    t, b, l, r = board.frame_edges(g); h = (b - t) / 8; w = (r - l) / 8
    d = ImageDraw.Draw(im)
    rows = placement.split('/')
    for ri, row in enumerate(rows):
        fi = 0
        for ch in row:
            if ch.isdigit(): fi += int(ch); continue
            x = l + fi * w + 2; y = t + ri * h + 1
            d.text((x, y), ch, fill=(230, 0, 0) if ch.isupper() else (0, 90, 230), font=font, stroke_width=2, stroke_fill=(255, 255, 255))
            fi += 1
    im = im.resize((S, S))
    d = ImageDraw.Draw(im); d.text((S - 110, S - 30), fig, fill=(0, 150, 0), font=small, stroke_width=2, stroke_fill=(255, 255, 255))
    return im
figs = sys.argv[1].split(',')
S = 460
sheet = Image.new('RGB', (2 * S + 10, 2 * S + 10), 'white')
for k, f in enumerate(figs):
    sheet.paste(render(f, pred[f]['placement'], S), ((k % 2) * (S + 10), (k // 2) * (S + 10)))
sheet.save(D + sys.argv[2])
