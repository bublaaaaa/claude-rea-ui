"""Inventory every frame the game can draw, cluster near-identical ones, report quality impact."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'original' / 'assets'   # untouched downloads
MEDIA = SRC / 'media'
W, H = 680, 464
PER = 9


def load_frames():
    manifest = json.loads((ROOT / 'original' / 'scripts' / 'manifest.js').read_text(encoding='utf8').split('=', 1)[1].rstrip().rstrip(';'))
    frames = []  # (label, RGB image at native size)
    for t, a in manifest['attacks'].items():
        sheets = {}
        for fi in range(a['frameCount']):
            name = a['sheets'][fi // PER]
            sheet = sheets.setdefault(name, Image.open(SRC / name).convert('RGB'))
            k = fi % PER
            x, y = (k % 3) * W, (k // 3) * H
            frames.append((f'sheet:{t}:{fi}', sheet.crop((x, y, x + W, y + H))))
    for t, n in (('left', 6), ('right', 6), ('body', 6), ('front', 12)):
        sheet = Image.open(MEDIA / f'{t}-combo.webp').convert('RGB')
        for fi in range(n):
            x, y = (fi % 3) * W, (fi // 3) * H
            frames.append((f'combo:{t}:{fi}', sheet.crop((x, y, x + W, y + H))))
    for t in ('left', 'front', 'right', 'body'):
        frames.append((f'end:{t}', Image.open(MEDIA / f'{t}-end.jpg').convert('RGB')))
    frames.append(('start', Image.open(MEDIA / 'front-start.jpg').convert('RGB')))
    return frames


def cluster(frames, th):
    """Leader clustering (no chaining): every member is within `th` of its medoid."""
    n = len(frames)
    flat = np.stack([np.asarray(im.resize((170, 116), Image.LANCZOS), dtype=np.float32) for _, im in frames]).reshape(n, -1)
    d = np.stack([np.abs(flat - flat[i]).mean(axis=1) for i in range(n)])
    unassigned = set(range(n))
    groups = []
    while unassigned:
        # pick the seed that covers the most still-unassigned frames
        best = max(unassigned, key=lambda i: sum(1 for j in unassigned if d[i, j] < th))
        members = [j for j in unassigned if d[best, j] < th]
        unassigned -= set(members)
        # medoid among native-size cells (680x464) preferred as representative
        cells = [j for j in members if frames[j][1].size == (W, H)] or members
        rep = min(cells, key=lambda i: sum(d[i, j] for j in members))
        groups.append((rep, members))
    return groups, d


if __name__ == '__main__':
    th = float(sys.argv[1]) if len(sys.argv) > 1 else 1.6
    frames = load_frames()
    groups, d = cluster(frames, th)
    print(f'{len(frames)} frames, threshold {th} -> {len(groups)} unique cells')
    worst = 0
    for rep, members in sorted(groups, key=lambda g: -len(g[1])):
        if len(members) > 1:
            w = max(d[rep, j] for j in members)
            worst = max(worst, w)
            print(f'  x{len(members):2d} keep {frames[rep][0]:<16} max diff {w:.2f}')
    print('worst diff to representative:', round(float(worst), 2), '(0-255 scale)')
