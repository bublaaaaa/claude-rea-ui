"""Black & white hand masks (hand = white) for the sheet cells that contain a hand, on the same grid as sheets/sheet-grid.png.
Cells 02-09: align each frame to the clean idle face (cell 01) and keep what changed (hand + cuff), then remove the cuff by colour.
Cells 11, 26, 42-44: a traced outline snapped to the line art with GrabCut.  Cells 10, 12: motion-blurred sleeve only, no hand -> empty."""
import sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CW, CH, L, COLS = 678, 452, 1, 10
SHEET = np.asarray(Image.open(ROOT / 'sheets' / 'sheet-grid.png').convert('RGB'))
H_, W_ = SHEET.shape[:2]


def cell(n):
    i = n - 1
    x, y = L + (i % COLS) * (CW + L), L + (i // COLS) * (CH + L)
    return SHEET[y:y + CH, x:x + CW].copy()


def cuff_mask(rgb):
    r, b = rgb[..., 0].astype(int), rgb[..., 2].astype(int)
    return (b - r) > 22                      # blue / lavender sleeve; skin and dark chain links stay out


def bottom_component(m):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
    keep = np.zeros_like(m, bool)
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if a > 400 and y + h >= CH - 2:      # the hand always enters from the bottom edge
            keep |= lab == i
    return keep


def hair_box(rgb):
    """bounding box of the dark hair at the top of the head (it never overlaps the hand)"""
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    m = (g < 85).astype(np.uint8); m[200:] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    i = 1 + int(np.argmax(st[1:, 4]))
    return st[i, 0], st[i, 1], st[i, 2], st[i, 3]


def aligned_ref(n, ref):
    """warp the idle face onto frame n: start from the hair outline, refine on the (hand-free) upper head"""
    g0 = cv2.cvtColor(ref, cv2.COLOR_RGB2GRAY).astype(np.float32)
    g1 = cv2.cvtColor(cell(n), cv2.COLOR_RGB2GRAY).astype(np.float32)
    xr, yr, wr, hr = hair_box(ref); xt, yt, wt, ht = hair_box(cell(n))
    s = ((wr / wt) + (hr / ht)) / 2                       # target -> ref scale
    warp = np.array([[s, 0, xr + wr / 2 - s * (xt + wt / 2)], [0, s, yr - s * yt]], np.float32)
    mask = np.zeros_like(g0, np.uint8); mask[10:200, 60:620] = 255
    try:
        _, warp = cv2.findTransformECC(g1, g0, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-7), mask, 5)
    except cv2.error:
        pass
    return cv2.warpAffine(ref, warp, (CW, CH), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)


def hand_by_difference(n, ref):
    c = cell(n)
    d = np.abs(c.astype(np.int16) - aligned_ref(n, ref).astype(np.int16)).sum(axis=2).astype(np.float32)
    d = cv2.GaussianBlur(d, (0, 0), 2)
    obj = bottom_component(d > 70)
    obj = cv2.morphologyEx(obj.astype(np.uint8), cv2.MORPH_OPEN, np.ones((13, 13), np.uint8))   # cut thin misalignment edges
    obj = cv2.morphologyEx(obj, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)).astype(bool)
    obj[:170] = False                                      # the hand never reaches the forehead
    obj = bottom_component(obj)
    if not obj.any():
        return np.zeros((CH, CW), np.uint8)
    cnts, _ = cv2.findContours(obj.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    hull = np.zeros((CH, CW), np.uint8)
    cv2.fillPoly(hull, [cv2.convexHull(np.vstack(cnts))], 255)
    hand = (hull > 0) & ~cuff_mask(c)
    hand = cv2.morphologyEx(hand.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n_, lab, st, _ = cv2.connectedComponentsWithStats(hand, 8)
    out = np.zeros_like(hand)
    for i in range(1, n_):
        if st[i, 4] > 300:
            out[lab == i] = 255
    return cv2.morphologyEx(out, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))


def hand_by_outline(n, poly, grow=6):
    p = np.zeros((CH, CW), np.uint8); cv2.fillPoly(p, [np.array(poly, np.int32)], 255)
    return refine(n, p, grow)


def cuff_shape(n, er=5):
    """the cuff = the blue/lavender region that contains the bottom-centre. The lavender background has the same
    colour, so we rely on the cuff's dark outline: after a small erosion the two stay separate components."""
    m = cuff_mask(cell(n)).astype(np.uint8); m[:230] = 0
    m = cv2.erode(m, np.ones((er, er), np.uint8))
    _, lab, _, _ = cv2.connectedComponentsWithStats(m, 8)
    ids = set(lab[440:452, 250:420].ravel()) - {0}
    return cv2.dilate(np.isin(lab, list(ids)).astype(np.uint8), np.ones((er, er), np.uint8)) * 255


def hand_by_transfer(n, src_n, src_mask):
    """carry a good mask from another frame by matching the cuff shape (the cuff is easy to find by colour)"""
    a, b = cuff_shape(src_n), cuff_shape(n)
    ba, bb = cv2.boundingRect(a), cv2.boundingRect(b)
    sx, sy = ba[2] / max(bb[2], 1), ba[3] / max(bb[3], 1)
    warp = np.array([[sx, 0, ba[0] - sx * bb[0]], [0, sy, ba[1] - sy * bb[1]]], np.float32)   # target -> source
    ga = cv2.GaussianBlur(a.astype(np.float32), (0, 0), 6); gb = cv2.GaussianBlur(b.astype(np.float32), (0, 0), 6)
    try:
        _, warp = cv2.findTransformECC(gb, ga, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-7), None, 5)
    except cv2.error:
        pass
    p = cv2.warpAffine(src_mask, warp, (CW, CH), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    return refine(n, (p > 127).astype(np.uint8) * 255, 8)


def refine(n, p, grow=6):
    """GrabCut snaps a rough mask to the drawing's edges; cuff colour is removed afterwards"""
    c = cell(n)
    inner = cv2.erode(p, np.ones((2 * grow + 1,) * 2, np.uint8))
    outer = cv2.dilate(p, np.ones((2 * grow + 1,) * 2, np.uint8))
    gc = np.full((CH, CW), cv2.GC_BGD, np.uint8)
    gc[outer > 0] = cv2.GC_PR_BGD
    gc[p > 0] = cv2.GC_PR_FGD
    gc[inner > 0] = cv2.GC_FGD
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(cv2.cvtColor(c, cv2.COLOR_RGB2BGR), gc, None, bgd, fgd, 4, cv2.GC_INIT_WITH_MASK)
    m = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)) & ~cuff_mask(c)
    m = cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n_, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    out = np.zeros_like(m)
    for i in range(1, n_):
        if st[i, 4] > 400:
            out[lab == i] = 255
    return out


OUTLINES = {   # cell number -> polygon in cell pixels (x, y)
    5: [(222, 258), (236, 240), (268, 224), (300, 214), (335, 212), (370, 218), (400, 224), (430, 232), (458, 248), (478, 272), (482, 312), (470, 332), (430, 312), (390, 290), (350, 262), (335, 250), (312, 258), (285, 285), (262, 315), (245, 342), (228, 330), (220, 290)],
    6: [(226, 268), (245, 248), (275, 236), (310, 230), (345, 236), (378, 236), (408, 240), (440, 255), (470, 275), (486, 310), (484, 345), (462, 352), (425, 322), (375, 293), (335, 268), (318, 268), (300, 292), (268, 320), (250, 350), (236, 350), (228, 310)],
    11: [(235, 215), (300, 185), (350, 165), (410, 150), (440, 160), (455, 200), (470, 260), (465, 320), (445, 345), (420, 380), (340, 395), (285, 390), (272, 330), (300, 270)],
    26: [(300, 215), (360, 200), (420, 215), (450, 270), (445, 340), (430, 400), (380, 440), (330, 440), (300, 380), (285, 320), (300, 270)],
    42: [(160, 300), (185, 275), (230, 257), (300, 250), (380, 254), (470, 264), (520, 292), (535, 340), (525, 452), (150, 452), (155, 332)],
    43: [(160, 300), (185, 275), (230, 257), (300, 250), (380, 254), (470, 264), (520, 292), (535, 340), (525, 452), (150, 452), (155, 332)],
    44: [(160, 300), (185, 275), (230, 257), (300, 250), (380, 254), (470, 264), (520, 292), (535, 340), (525, 452), (150, 452), (155, 332)],
}
BY_DIFF = [2, 3, 7, 8, 9]
BY_TRANSFER = [4]                # carried from frame 07 (clean mask) by matching the cuff shape
EMPTY = [10, 12]


def build():
    ref = cell(1)
    masks = {n: hand_by_difference(n, ref) for n in BY_DIFF}
    src = 7
    for n in BY_TRANSFER:                       # 04 <- 07, 05 <- 04, 06 <- 05: neighbours have the most similar cuff
        masks[n] = hand_by_transfer(n, src, masks[src]); src = n
    masks.update({n: hand_by_outline(n, poly) for n, poly in OUTLINES.items()})
    masks.update({n: np.zeros((CH, CW), np.uint8) for n in EMPTY})
    return masks


def sheet_of(masks, line=70):
    out = np.zeros((H_, W_), np.uint8)
    for k in range(COLS + 1):
        out[:, k * (CW + L):k * (CW + L) + L] = line
    for k in range(H_ // (CH + L) + 1):
        out[k * (CH + L):k * (CH + L) + L, :] = line
    for n, m in masks.items():
        i = n - 1
        x, y = L + (i % COLS) * (CW + L), L + (i // COLS) * (CH + L)
        out[y:y + CH, x:x + CW] = m
    return out


if __name__ == '__main__':
    masks = build()
    out = ROOT / 'sheets' / 'hand-mask.png'
    out.unlink(missing_ok=True)
    Image.fromarray(sheet_of(masks)).save(out, optimize=True)
    print('wrote', out, f'{out.stat().st_size / 1048576:.2f} MB;', 'hand pixels per cell:', {n: int((m > 0).sum()) for n, m in sorted(masks.items())})
    if len(sys.argv) > 1:   # QA overlays
        sp = Path(sys.argv[1]); tiles = []
        for n, m in sorted(masks.items()):
            c = cell(n); ov = c.copy(); ov[m > 0] = (0.45 * ov[m > 0] + 0.55 * np.array([255, 0, 60])).astype(np.uint8)
            cv2.putText(ov, f'{n:02d}', (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 0), 2)
            tiles.append(cv2.resize(np.hstack([ov, np.stack([m] * 3, -1)]), (680, 226)))
        for k in range(0, len(tiles), 5):
            Image.fromarray(np.vstack(tiles[k:k + 5])).save(sp / f'qa{k // 5}.png')
