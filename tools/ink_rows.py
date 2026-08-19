"""List the ink bands of a region in the prototype and the replica side by side.

Projecting the ink onto one axis and reading off the bands gives the whole
vertical rhythm of a pane in one shot, which is what the gap tokens control.  Pass
--axis x to get the columns instead.

    python tools/ink_rows.py status
    python tools/ink_rows.py card1 --axis x
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

# name -> (x0, x1, y0, y1)
AREAS = {
    "status": (46, 500, 392, 700),
    "status-head": (46, 360, 392, 458),
    "stat1": (46, 210, 470, 590),
    "favor": (46, 500, 616, 700),
    "girls-head": (520, 840, 392, 466),
    "card1": (700, 795, 470, 700),
    "pod": (1408, 1640, 356, 430),
}


def bands(img, x0, x1, y0, y1, axis):
    w = img[y0:y1, x0:x1] @ [0.299, 0.587, 0.114]
    base = np.percentile(w, 40)
    mask = w > base + max(16, 0.34 * (w.max() - base))
    prof = mask.sum(axis=1 if axis == "y" else 0)
    on = prof > (1 if axis == "y" else 1)
    out, start = [], None
    origin = y0 if axis == "y" else x0
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= 2:
                out.append((origin + start, origin + i - 1))
            start = None
    if start is not None:
        out.append((origin + start, origin + len(on) - 1))
    return out


ap = argparse.ArgumentParser()
ap.add_argument("area", choices=sorted(AREAS))
ap.add_argument("--axis", default="y", choices=["x", "y"])
args = ap.parse_args()

ref = np.asarray(Image.open(ROOT / "public" / "ref" / "prototype.png").convert("RGB"), float)
got = np.asarray(Image.open(ROOT / "artifacts" / "render.png").convert("RGB"), float)
box = AREAS[args.area]

a = bands(ref, *box, args.axis)
b = bands(got, *box, args.axis)
print(f"{args.area}  axis={args.axis}  window={box}\n")
print(f"{'prototype':>18}   {'replica':>18}    {'shift':>6} {'size':>5}")
for i in range(max(len(a), len(b))):
    pa = f"{a[i][0]}-{a[i][1]} ({a[i][1] - a[i][0] + 1})" if i < len(a) else "--"
    pb = f"{b[i][0]}-{b[i][1]} ({b[i][1] - b[i][0] + 1})" if i < len(b) else "--"
    extra = ""
    if i < len(a) and i < len(b):
        extra = (f"{b[i][0] - a[i][0]:>6} "
                 f"{(b[i][1] - b[i][0]) - (a[i][1] - a[i][0]):>5}")
    print(f"{pa:>18}   {pb:>18}    {extra}")
