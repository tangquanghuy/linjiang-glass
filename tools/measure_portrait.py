"""One-off measurements of the portrait prototype.

Finds the canvas size, the three panels' horizontal rim lines, and the pixel
heights of a few type specimens, so the portrait type scale can be checked
against the landscape canvas for visual parity.
"""
import sys
from PIL import Image

SRC = "原型/竖屏原型图1.png"

im = Image.open(SRC).convert("RGB")
W, H = im.size
print(f"canvas: {W} x {H}   aspect 1:{H/W:.4f}")
print()

g = im.convert("L")
px = g.load()


def bright_run_rows(x0, x1, thresh=205, min_frac=0.55):
    """Rows carrying a long horizontal bright run -- panel top/bottom rims."""
    hits = []
    span = x1 - x0
    for y in range(H):
        n = 0
        for x in range(x0, x1, 2):
            if px[x, y] > thresh:
                n += 1
        if n / (span / 2) >= min_frac:
            hits.append((y, round(n / (span / 2), 2)))
    return hits


def group(rows, gap=6):
    out = []
    for y, f in rows:
        if out and y - out[-1][-1][0] <= gap:
            out[-1].append((y, f))
        else:
            out.append([(y, f)])
    return [(b[0][0], b[-1][0], max(f for _, f in b)) for b in out]


print("horizontal rim lines (centre 70% of width):")
for a, b, f in group(bright_run_rows(int(W * 0.15), int(W * 0.85))):
    print(f"  y {a}..{b}   peak coverage {f}")
print()


def ink_rows(box, thresh=150):
    """Vertical extent of ink inside a crop -- glyph cap height."""
    x0, y0, x1, y1 = box
    rows = []
    for y in range(y0, y1):
        n = sum(1 for x in range(x0, x1) if px[x, y] > thresh)
        if n:
            rows.append(y)
    if not rows:
        return None
    return rows[0], rows[-1], rows[-1] - rows[0] + 1


SPECIMENS = {
    "name 沙花叉":        (470, 185, 600, 245),
    "label 好感度":        (500, 290, 580, 320),
    "number 710":         (600, 285, 680, 325),
    "max /1000":          (690, 295, 730, 320),
    "status 异常状态":     (62, 660, 160, 692),
    "card name 东雪莲":    (195, 1250, 290, 1290),
    "card number 780":    (200, 1370, 265, 1405),
}
print("type specimens (ink top, ink bottom, height in canvas px):")
for k, box in SPECIMENS.items():
    r = ink_rows(box)
    print(f"  {k:22} {r}")
