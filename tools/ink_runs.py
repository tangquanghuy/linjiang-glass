"""Report the x-spans of ink groups inside a horizontal band, and the y-spans of
ink rows inside a column band.  One call gives every group boundary in a row of
the layout, which is far more reliable than reading zoomed crops by eye.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
lum = np.asarray(Image.open(ROOT / "原型" / "原型示意图.png").convert("L")).astype(float)


def runs(mask, gap):
    """Merge indices in `mask` into spans, bridging holes up to `gap` wide."""
    idx = np.nonzero(mask)[0]
    if len(idx) == 0:
        return []
    out, s, p = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - p > gap:
            out.append((s, p))
            s = i
        p = i
    out.append((s, p))
    return out


def xruns(y0, y1, x0, x1, thr=135, gap=7, label=""):
    band = lum[y0:y1, x0:x1] > thr
    col = band.any(axis=0)
    spans = runs(col, gap)
    print(f"\n[{label}]  y {y0}..{y1}  thr {thr}")
    for a, b in spans:
        sub = band[:, a:b + 1]
        ys = np.nonzero(sub.any(axis=1))[0]
        print(f"   x {x0 + a:5d}..{x0 + b:<5d} w {b - a + 1:4d}   "
              f"y {y0 + ys[0]:4d}..{y0 + ys[-1]:<4d} h {ys[-1] - ys[0] + 1}")


def yruns(x0, x1, y0, y1, thr=135, gap=5, label=""):
    band = lum[y0:y1, x0:x1] > thr
    row = band.any(axis=1)
    print(f"\n[{label}]  x {x0}..{x1}  thr {thr}")
    for a, b in runs(row, gap):
        sub = band[a:b + 1, :]
        xs = np.nonzero(sub.any(axis=0))[0]
        print(f"   y {y0 + a:5d}..{y0 + b:<5d} h {b - a + 1:4d}   "
              f"x {x0 + xs[0]:4d}..{x0 + xs[-1]:<4d} w {xs[-1] - xs[0] + 1}")


# Vertical rhythm of the Status region, then each row's groups.
yruns(40, 500, 400, 715, 140, 6, "Status region rows")

xruns(408, 452, 30, 520, 145, 9, "Status header")
xruns(482, 502, 30, 520, 130, 9, "Status column labels")
xruns(518, 548, 30, 520, 135, 9, "Status values")
xruns(548, 578, 30, 520, 128, 9, "Status sub-values")
xruns(624, 646, 30, 520, 128, 9, "favor label")
xruns(652, 690, 30, 520, 135, 12, "favor line")

# Girls header and one card's internals.
xruns(396, 462, 515, 800, 145, 10, "Girls header")
yruns(660, 800, 470, 700, 140, 5, "card1 rows (stat column)")
xruns(478, 700, 660, 800, 140, 9, "card1 name/romaji band")

# Tool pod.
xruns(360, 415, 1400, 1660, 150, 9, "tool pod icons")
yruns(1600, 1670, 520, 620, 115, 5, "next arrow")
