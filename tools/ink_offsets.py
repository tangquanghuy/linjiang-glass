"""Report how far each content row has drifted from the prototype.

The content layer positions nothing directly, so a row that sits wrong is a token
that is wrong.  This measures the ink bounding box of each row in both images and
prints the offset, which maps onto one gap or one font size in tokens.css.

    npm run diff && python tools/ink_offsets.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

# name -> window the row lives in, wide enough to catch it after a drift.
PROBES = {
    "status/script":    (48, 240, 392, 458),
    "status/cjk":       (245, 345, 400, 455),
    "status/rule-1":    (60, 480, 448, 474),
    "stat1/label":      (48, 150, 474, 512),
    "stat1/value":      (48, 275, 512, 552),
    "stat1/pill":       (85, 200, 548, 585),
    "stat2/label":      (212, 305, 474, 512),
    "stat3/value":      (378, 478, 512, 552),
    "status/rule-2":    (60, 480, 596, 622),
    "favor/label":      (48, 225, 620, 650),
    "favor/bar":        (88, 335, 656, 694),
    "favor/num":        (336, 412, 650, 694),
    "favor/button":     (412, 505, 644, 698),
    "girls/script":     (548, 725, 392, 462),
    "girls/cjk":        (726, 836, 400, 458),
    "card1/name":       (688, 792, 474, 512),
    "card1/romaji":     (688, 792, 505, 534),
    "card1/metric-lbl": (688, 792, 536, 566),
    "card1/metric":     (688, 792, 566, 618),
    "card1/chip":       (676, 800, 620, 662),
    "card1/quote":      (668, 800, 662, 690),
    "pod/button-1":     (1408, 1472, 360, 424),
    "pod/button-3":     (1563, 1627, 360, 424),
}

ref = np.asarray(Image.open(ROOT / "public" / "ref" / "prototype.png").convert("RGB"), float)
got = np.asarray(Image.open(ROOT / "artifacts" / "render.png").convert("RGB"), float)


def ink_box(img, x0, x1, y0, y1):
    """Bounding box of the bright ink in a window, ignoring the glass behind it."""
    w = img[y0:y1, x0:x1] @ [0.299, 0.587, 0.114]
    thresh = np.percentile(w, 55) + max(14, 0.30 * (w.max() - np.percentile(w, 55)))
    mask = w > thresh
    if mask.sum() < 8:
        return None
    ys, xs = np.nonzero(mask)
    return x0 + xs.min(), y0 + ys.min(), x0 + xs.max(), y0 + ys.max()


print(f"{'row':<18} {'prototype':>20}  {'replica':>20}   {'dx':>4} {'dy':>4} {'dw':>4} {'dh':>4}")
for name, win in PROBES.items():
    a, b = ink_box(ref, *win), ink_box(got, *win)
    if a is None or b is None:
        print(f"{name:<18} {'-- no ink --':>20}")
        continue
    fmt = lambda t: f"{t[0]},{t[1]} {t[2] - t[0] + 1}x{t[3] - t[1] + 1}"
    print(f"{name:<18} {fmt(a):>20}  {fmt(b):>20}   "
          f"{b[0] - a[0]:>4} {b[1] - a[1]:>4} "
          f"{(b[2] - b[0]) - (a[2] - a[0]):>4} {(b[3] - b[1]) - (a[3] - a[1]):>4}")
