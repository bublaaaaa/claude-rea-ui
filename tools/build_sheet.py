"""Pack the frames the game really draws into ONE sheet, following the cell order of a hand-made
reference layout (reference/layout-order.webp). Every cell is exactly 3:2 (678x452 - the area the game shows).
Pictures the reference doesn't cover are appended after it, so nothing changes visually.
Writes site/sheet.webp (game), site/sheet.png (lossless), site/manifest.js, sheets/grid-blank.png."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from analyze import load_frames, cluster, W, H, ROOT

REF = ROOT / 'reference' / 'layout-order.webp'
REF_COLS, REF_ROWS = 10, 5
REF_X = [(c * 200 + 2, c * 200 + 199) for c in range(REF_COLS)]
REF_Y = [(2, 136), (138, 272), (274, 409), (411, 545), (547, 681)]
CW, CH = 678, 452          # cell = exactly 3:2
COLS, LINE = 10, 1
T = 1.0                    # mean abs diff (0-255): below this two pictures are the same for the eye
RECOVER_FROM = {'left': 12, 'front': 6, 'right': 13, 'body': 12}   # first sheet frame the game ever draws

frames = load_frames()
labels = [l for l, _ in frames]


def centre(im):
    w, h = im.size
    cw, ch = (CW, CH) if (w, h) == (W, H) else (750, 500)
    x, y = (w - cw) // 2, (h - ch) // 2
    return im.crop((x, y, x + cw, y + ch))


def drawn(label):
    p = label.split(':')
    if p[0] in ('combo', 'end', 'start'):
        return True
    return p[1] != 'front' and int(p[2]) >= RECOVER_FROM[p[1]]


used = [i for i, l in enumerate(labels) if drawn(l)]
ft = np.stack([np.asarray(centre(im).resize((150, 100), Image.LANCZOS), dtype=np.float32) for _, im in frames])
D = np.stack([np.abs(ft - ft[i]).mean(axis=(1, 2, 3)) for i in range(len(frames))])

# 1) the reference cells, in order -> distinct picture clusters
groups, _ = cluster(frames, T)
ref = Image.open(REF).convert('RGB')
rt = np.stack([np.asarray(ref.crop((REF_X[c][0], REF_Y[r][0], REF_X[c][1], REF_Y[r][1])).resize((96, 64), Image.LANCZOS), dtype=np.float32)
               for r in range(REF_ROWS) for c in range(REF_COLS)])
sm = np.stack([np.asarray(centre(im).resize((96, 64), Image.LANCZOS), dtype=np.float32) for _, im in frames])
taken, order = set(), []
for k in range(len(rt)):
    dd = np.abs(sm - rt[k]).mean(axis=(1, 2, 3))
    gd = sorted((min(dd[m] for m in mem), gi) for gi, (_, mem) in enumerate(groups))
    for _, gi in gd:                      # best cluster not already claimed by an earlier reference cell
        if gi not in taken:
            taken.add(gi); order.append(groups[gi][0]); break

# 2) add pictures the reference lacks, until every drawn frame is within T of some cell
U = np.array(used)
def cover(sel): return D[np.ix_(U, sel)].min(axis=1)
sel = list(order)
n_ref = len(sel)
while '--no-add' not in sys.argv and cover(sel).max() > T:
    bad = U[cover(sel) > T]
    sel.append(int(max((int(j) for j in U), key=lambda j: ((D[bad, j] <= T).sum(), -D[bad, j].mean()))))

# 3) compose
n = len(sel)
rows = -(-n // COLS)
sw, sh = COLS * (CW + LINE) + LINE, rows * (CH + LINE) + LINE
sheet = Image.new('RGB', (sw, sh), (255, 255, 255))     # unused cells stay plain white
blank = Image.new('RGB', (sw, sh), (255, 255, 255))
from PIL import ImageDraw
bd = ImageDraw.Draw(blank)
for k in range(COLS + 1):
    bd.rectangle([k * (CW + LINE), 0, k * (CW + LINE) + LINE - 1, sh], fill=(0, 0, 0))
for k in range(rows + 1):
    bd.rectangle([0, k * (CH + LINE), sw, k * (CH + LINE) + LINE - 1], fill=(0, 0, 0))
sd = ImageDraw.Draw(sheet)
for k in range(COLS + 1):
    sd.rectangle([k * (CW + LINE), 0, k * (CW + LINE) + LINE - 1, sh], fill=(0, 0, 0))
for k in range(rows + 1):
    sd.rectangle([0, k * (CH + LINE), sw, k * (CH + LINE) + LINE - 1], fill=(0, 0, 0))
for ci, fi in enumerate(sel):
    im = centre(frames[fi][1])
    if im.size != (CW, CH):
        im = im.resize((CW, CH), Image.LANCZOS)
    sheet.paste(im, (LINE + (ci % COLS) * (CW + LINE), LINE + (ci // COLS) * (CH + LINE)))

# 4) every frame -> nearest cell
cell_of = {labels[i]: int(np.argmin(D[i, sel])) for i in range(len(frames))}
site, out = ROOT / 'site', ROOT / 'sheets'
out.mkdir(exist_ok=True)
def put(img, path, **kw):   # Windows sometimes refuses to overwrite in place; remove first
    path.unlink(missing_ok=True)
    img.save(path, **kw)


put(sheet, site / 'sheet.png', optimize=True)
put(sheet, site / 'sheet.webp', quality=95, method=6)
put(blank, out / 'grid-blank.png', optimize=True)
put(sheet, out / 'sheet-grid.png', optimize=True)
manifest = {
    'cell': [CW, CH], 'line': LINE, 'columns': COLS, 'sheet': 'sheet.webp',
    'start': cell_of['start'],
    'sheet_frames': {t: [cell_of[f'sheet:{t}:{i}'] for i in range(c)] for t, c in (('left', 32), ('front', 20), ('right', 32), ('body', 25))},
    'combo_frames': {t: [cell_of[f'combo:{t}:{i}'] for i in range(c)] for t, c in (('left', 6), ('front', 12), ('right', 6), ('body', 6))},
    'end': {t: cell_of[f'end:{t}'] for t in ('left', 'front', 'right', 'body')},
}
(site / 'manifest.js').write_text('window.CHROLLO_SHEET = ' + json.dumps(manifest, separators=(',', ':')) + ';\n', encoding='utf8')
err = cover(sel)
print(f'{n_ref} cells from your layout + {n - n_ref} added = {n} cells; grid {COLS}x{rows} ({rows * COLS - n} blank); sheet {sw}x{sh}')
print(f'worst error on the {len(U)} drawn frames: {err.max():.2f} / 255')
worst = np.argsort(-err)[:6]
print('largest stand-in errors:', ', '.join(f'{labels[used[i]]}->cell{cell_of[labels[used[i]]]} {err[i]:.1f}' for i in worst))
print('added cells (appended at the end):', ', '.join(labels[i] for i in sel[n_ref:]))
for f in (site / 'sheet.png', site / 'sheet.webp', out / 'grid-blank.png'):
    print(f.name, round(f.stat().st_size / 1048576, 2), 'MB')
