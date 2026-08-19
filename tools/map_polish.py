"""Measure where on the glass the prototype's surface haze actually sits.

The finish is not uniform: the open middle of the panel is clear enough to read the
scene through, and the haze is concentrated near edges -- the rim, the Status pane
border, the pod crease -- where the glass reads as a thick polished bevel.  A
single patch cannot show that, so this profiles the band-passed energy across and
down several bare-glass corridors.

    python tools/map_polish.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]

# Corridors of bare shell glass, well clear of text, cards and the rim bloom.
CORRIDORS = {
    "above cards, across":  ("x", (850, 1330), (419, 451)),
    "above cards, down":    ("y", (860, 1240), (413, 464)),
    "pane->rail gap, down": ("y", (521, 535), (420, 700)),
    "left margin, down":    ("y", (28, 46), (430, 700)),
    "under cards, across":  ("x", (560, 1330), (703, 714)),
}
STEP = 40


def load(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im, float)
    band = (np.asarray(im.filter(ImageFilter.GaussianBlur(1.2)), float)
            - np.asarray(im.filter(ImageFilter.GaussianBlur(14)), float))
    return a, band @ [0.299, 0.587, 0.114]


ref_a, ref_b = load(ROOT / "public" / "ref" / "prototype.png")
got_a, got_b = load(ROOT / "artifacts" / "render.png")

for name, (axis, xs, ys) in CORRIDORS.items():
    print(f"\n{name}   x{xs}  y{ys}")
    lo, hi = (xs if axis == "x" else ys)
    step = STEP if axis == "x" else max(8, STEP // 3)
    print(f"  {'pos':>5}  {'proto sd':>8}  {'ours sd':>8}   {'proto':>22}")
    for p in range(lo, hi - step + 1, step):
        if axis == "x":
            sl = (slice(ys[0], ys[1]), slice(p, p + step))
        else:
            sl = (slice(p, p + step), slice(xs[0], xs[1]))
        r, g = ref_b[sl].std(), got_b[sl].std()
        print(f"  {p:>5}  {r:>8.2f}  {g:>8.2f}   {'#' * min(22, int(r * 4)):<22}")
