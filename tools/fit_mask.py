"""Fit a hand-painted mask (green on a 10x5 grid image) to the real sheet grid.
Each painted cell is cut out between its grid lines and scaled back to the exact 678x452 cell, so the mask lines up
with the real frames (the painted picture was ~1.5% squeezed vertically). Output: black hand on white, same size/grid as
sheets/sheet-grid.png, plus a green-on-real overlay to check the fit."""
import sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'reference' / 'hand-mask-main-source.webp'
CW, CH, L, COLS, ROWS = 678, 452, 1, 10, 5
LINE = 0                                            # thin black grid lines (hand = black, background = white)

a = np.asarray(Image.open(SRC).convert('RGB')).astype(int)
green = ((a[..., 1] - np.maximum(a[..., 0], a[..., 2])) > 120).astype(np.float32) * 255
dark = a.sum(axis=2) < 150


def runs(v, thr=0.6):
    g = []
    for i in np.where(v > thr)[0]:
        if g and i - g[-1][-1] <= 1: g[-1].append(i)
        else: g.append([i])
    return [(x[0], x[-1]) for x in g]


xl, yl = runs(dark.mean(axis=0)), runs(dark.mean(axis=1))
assert len(xl) == COLS + 1 and len(yl) == ROWS + 1, (len(xl), len(yl))
sheet = np.asarray(Image.open(ROOT / 'sheets' / 'sheet-grid.png').convert('RGB'))
H_, W_ = sheet.shape[:2]
out = np.full((H_, W_), 255, np.uint8)             # white background
for k in range(COLS + 1): out[:, k * (CW + L):k * (CW + L) + L] = LINE
for k in range(ROWS + 1): out[k * (CH + L):k * (CH + L) + L, :] = LINE
over = sheet.copy()
marked = []
for r in range(ROWS):
    for c in range(COLS):
        cell = green[yl[r][1] + 1:yl[r + 1][0], xl[c][1] + 1:xl[c + 1][0]]   # between the grid lines
        if cell.max() < 128:
            continue
        m = cv2.resize(cell, (CW, CH), interpolation=cv2.INTER_CUBIC) > 127
        x, y = L + c * (CW + L), L + r * (CH + L)
        out[y:y + CH, x:x + CW][m] = 0                 # hand = black
        reg = over[y:y + CH, x:x + CW]
        reg[m] = (0.45 * reg[m] + 0.55 * np.array([0, 255, 60])).astype(np.uint8)
        marked.append(r * COLS + c + 1)
o = ROOT / 'sheets' / 'hand-mask-main.png'
o.unlink(missing_ok=True)
Image.fromarray(out).save(o, optimize=True)
ov = ROOT / 'sheets' / 'hand-mask-main-overlay.png'
ov.unlink(missing_ok=True)
Image.fromarray(over).save(ov, optimize=True)
print('painted cells:', marked)
print('wrote', o.name, f'{o.stat().st_size / 1048576:.2f} MB;', ov.name, f'{ov.stat().st_size / 1048576:.2f} MB; size', out.shape[::-1])
