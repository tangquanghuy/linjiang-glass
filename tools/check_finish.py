"""Compare the glass surface finish against the prototype.

Splits a bare-glass patch into grain (under ~1px) and polish (~1 to 14px) and
reports the luminance sd of each, plus how far the polish structure survives along
each axis -- which is what makes it read as brushed rather than as noise.

    npm run diff && python tools/check_finish.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
# Bare glass between the top rim and the cards.  Kept clear of both: the card rims
# glow ~10px upward and the top rim's bloom reaches ~8px down, and including either
# inflates the reading to roughly twice the true surface figure.
PATCH = (860, 418, 1240, 452)


def split(path):
    a = np.asarray(Image.open(path).convert("RGB"), float)
    x0, y0, x1, y1 = PATCH
    p = a[y0:y1, x0:x1]
    src = Image.fromarray(p.astype(np.uint8))
    lo = np.asarray(src.filter(ImageFilter.GaussianBlur(14)), float)
    hi = np.asarray(src.filter(ImageFilter.GaussianBlur(1.2)), float)
    return (p - hi), (hi - lo)


def report(tag, grain, polish):
    m = polish @ [0.299, 0.587, 0.114]
    corr = lambda lag, axis: np.corrcoef(
        (m[:, :-lag] if axis == "x" else m[:-lag]).ravel(),
        (m[:, lag:] if axis == "x" else m[lag:]).ravel())[0, 1]
    g = (grain @ [0.299, 0.587, 0.114]).std()
    print(f"{tag:<10} grain sd {g:4.2f}   polish sd {m.std():4.2f}   "
          f"corr_x@12 {corr(12, 'x'):5.2f}   corr_y@6 {corr(6, 'y'):5.2f}")


for tag, path in (("prototype", ROOT / "public" / "ref" / "prototype.png"),
                  ("replica", ROOT / "artifacts" / "render.png")):
    report(tag, *split(path))
