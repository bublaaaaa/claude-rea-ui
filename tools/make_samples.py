"""Convert the sample sheets in sample/ into the game's standard sheet format
(10x5 cells of 678x452, 1px black lines -> 6791x2266) and write them as WebP into site/."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CW, CH, L, COLS, ROWS = 678, 452, 1, 10, 5
SW, SH = COLS * (CW + L) + L, ROWS * (CH + L) + L   # 6791 x 2266


def standard(src: Image.Image) -> Image.Image:
    """Return src as a standard sheet. Sheets already in the standard size are kept as they are."""
    if src.size == (SW, SH):
        return src
    # any other 10x5 grid of equal 3:2 tiles, no lines: cut each tile (1px inset hides edge pixels) and re-lay it
    tw, th = src.width / COLS, src.height / ROWS
    out = Image.new('RGB', (SW, SH), (0, 0, 0))
    for r in range(ROWS):
        for c in range(COLS):
            box = (round(c * tw) + 1, round(r * th) + 1, round((c + 1) * tw) - 1, round((r + 1) * th) - 1)
            tile = src.crop(box).resize((CW, CH), Image.LANCZOS)
            out.paste(tile, (L + c * (CW + L), L + r * (CH + L)))
    return out


for name in ('gabi', 'tucker'):
    im = Image.open(ROOT / 'sample' / f'{name}.png')
    if im.mode == 'RGBA':                       # flatten the few semi-transparent pixels onto white
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.getchannel('A'))
        im = bg
    im = standard(im.convert('RGB'))
    out = ROOT / 'site' / f'sample-{name}.webp'
    out.unlink(missing_ok=True)
    im.save(out, quality=95, method=6)
    print(name, im.size, round(out.stat().st_size / 1048576, 2), 'MB')
