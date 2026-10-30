"""Re-cut a pasted 10x5 sheet picture into OUR grid: 50 cells, each exactly 3:2 (678x452) with 1px black lines
(6791x2266, the same layout the game/editor use), so it can be loaded with "Load whole sheet".

Cells are found from the picture itself: black grid lines when it has them, otherwise an even 10x5 split."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

COLS, ROWS = 10, 5
CW, CH, LINE = 678, 452, 1          # our cell size (exactly 3:2) and line width
ROOT = Path(__file__).resolve().parent.parent


def runs(mask):
    out, s = [], None
    for i, v in enumerate(mask):
        if v and s is None:
            s = i
        if not v and s is not None:
            out.append((s, i - 1)); s = None
    if s is not None:
        out.append((s, len(mask) - 1))
    return out


def edges(profile, n, size):
    """Cell edge positions [(start, end_exclusive)] along one axis."""
    dark = runs(profile < np.median(profile) * 0.45)
    if len(dark) == n + 1:                      # black grid lines: cells sit between them (+1px inset vs. fringing)
        return [(dark[k][1] + 2, dark[k + 1][0] - 1) for k in range(n)], 'lines'
    step = size / n                             # no lines: even split
    return [(round(k * step), round((k + 1) * step)) for k in range(n)], 'even'


def convert(src, dst_png, dst_webp):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im, dtype=np.float32).mean(axis=2)
    xs, kx = edges(a.mean(axis=0), COLS, im.width)
    ys, ky = edges(a.mean(axis=1), ROWS, im.height)
    sheet = Image.new('RGB', (COLS * (CW + LINE) + LINE, ROWS * (CH + LINE) + LINE), (0, 0, 0))
    sizes = set()
    for r, (y0, y1) in enumerate(ys):
        for c, (x0, x1) in enumerate(xs):
            w, h = x1 - x0, y1 - y0
            # trim to exactly 3:2 around the centre (the same trim the game applies to the original frames)
            if w / h > 1.5:
                nw = h * 1.5; x0c, y0c, x1c, y1c = x0 + (w - nw) / 2, y0, x0 + (w + nw) / 2, y1
            else:
                nh = w / 1.5; x0c, y0c, x1c, y1c = x0, y0 + (h - nh) / 2, x1, y0 + (h + nh) / 2
            cell = im.resize((CW, CH), Image.LANCZOS, box=(x0c, y0c, x1c, y1c))
            sheet.paste(cell, (LINE + c * (CW + LINE), LINE + r * (CH + LINE)))
            sizes.add((w, h))
    for p, kw in ((dst_png, dict(optimize=True)), (dst_webp, dict(quality=95, method=6))):
        p.unlink(missing_ok=True)
        sheet.save(p, **kw)
    print(f'{src.name}: {im.size} grid found by {kx}/{ky}; source cells {min(sizes)}..{max(sizes)} px -> '
          f'{CW}x{CH} (3:2); sheet {sheet.size}; png {dst_png.stat().st_size / 1048576:.1f} MB, webp {dst_webp.stat().st_size / 1048576:.2f} MB')


if __name__ == '__main__':
    out = ROOT / 'sheets' / 'custom'
    out.mkdir(parents=True, exist_ok=True)
    for i, src in enumerate(sys.argv[1:], 1):
        convert(Path(src), out / f'sheet-{i}.png', out / f'sheet-{i}.webp')
