"""Bake the mask that decides where the glass is hazy and where it stays clear.

Measured with tools/map_polish.py, the prototype's surface haze is not uniform:
band-passed sd runs 2.0-3.4 across the open middle of the panel, where the scene
behind is still readable, and 8-12 within a few tens of pixels of a border, where
the glass reads as a thick polished bevel that scatters.  Spreading the haze
evenly is what makes the whole panel look milky.

The bands follow the same paths the browser strokes, sampled from geometry.py, so
the mask cannot drift away from the shape it is masking.  Written as alpha, which
is what CSS mask-image reads from a PNG by default.

    python tools/make_polish_mask.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import geometry as G
import svgpath

ROOT = Path(__file__).resolve().parents[1]
W, H = G.CANVAS

BASE = 58            # clear middle: about a quarter strength

# path, stroke width, blur, level.  The widths come from how fast the haze decays
# in each corridor, and they are not the same everywhere: below the top rim it is
# back to the clear level within 15px, while beside a vertical edge or the pane
# border it stays raised for a good 20.  The sides read as the thick part of the
# bevel, which is why they scatter over a wider band.
SEG = {s["id"]: s["d"] for s in G.rim_segments()}
BANDS = [
    (SEG["main-top"], 14, 5, 226),
    (SEG["tl-ear"], 14, 5, 226),
    (SEG["pod-top"], 14, 5, 210),
    (SEG["pod-rise"], 26, 8, 195),
    (SEG["left"], 34, 10, 186),
    (SEG["right"], 34, 10, 186),
    (SEG["bottom"], 30, 9, 200),
    (G.status_pane_path(), 28, 9, 172),
    (G.pod_floor_path(), 22, 7, 150),
]

mask = Image.new("L", (W, H), BASE)
for d, width, blur, level in BANDS:
    layer = Image.new("L", (W, H), 0)
    pts = [(round(x), round(y)) for x, y in svgpath.sample(d, step=1.0)]
    ImageDraw.Draw(layer).line(pts, fill=level, width=width, joint="curve")
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    mask = Image.fromarray(np.maximum(np.asarray(mask), np.asarray(layer)))

out = Image.new("RGBA", (W, H), (255, 255, 255, 255))
out.putalpha(mask)
dst = ROOT / "public" / "assets" / "polish-mask.png"
out.save(dst)

m = np.asarray(mask, float) / 255
print(f"wrote {dst}  {W}x{H}")
print(f"  check patch (860-1240, 418-452)  {m[418:452, 860:1240].mean():.2f}")
for name, (x, y) in {"open middle": (1050, 440), "near left rim": (34, 560),
                     "near pane border": (528, 560), "under cards": (900, 710),
                     "below top rim +15": (1050, 426)}.items():
    print(f"  {name:<18} {m[y, x]:.2f}")
