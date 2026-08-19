"""Trace the HUD's bright rim in the prototype image to recover exact outline coordinates.

The rim is a ~2px near-white ridge. We detect it with a ridge response
(centre brightness minus the mean of two off-centre samples) and walk along the
edge with a continuity constraint so bokeh highlights in the background cannot
capture the trace.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "原型" / "原型示意图.png"
OUT = ROOT / "_analysis"
OUT.mkdir(exist_ok=True)

img = Image.open(SRC).convert("RGB")
lum = np.asarray(img).astype(float).mean(axis=2)
H, W = lum.shape


def ridge_column(x, y_lo, y_hi, off=5):
    """Ridge response for every candidate y in a column."""
    ys = np.arange(y_lo, y_hi)
    centre = lum[ys, x]
    flanks = 0.5 * (lum[ys - off, x] + lum[ys + off, x])
    return ys, centre - flanks


def ridge_row(y, x_lo, x_hi, off=5):
    xs = np.arange(x_lo, x_hi)
    centre = lum[y, xs]
    flanks = 0.5 * (lum[y, xs - off] + lum[y, xs + off])
    return xs, centre - flanks


def trace(axis, fixed_range, search, seed, tol=6, min_resp=8.0):
    """Walk along `axis` keeping the found coordinate within `tol` of the last hit.

    axis 'h' walks over x and finds y (horizontal edges);
    axis 'v' walks over y and finds x (vertical edges).
    """
    pts, last = [], seed
    for t in fixed_range:
        lo = max(search[0], last - tol)
        hi = min(search[1], last + tol + 1)
        if hi - lo < 2:
            continue
        if axis == "h":
            coords, resp = ridge_column(t, lo, hi)
        else:
            coords, resp = ridge_row(t, lo, hi)
        i = int(resp.argmax())
        if resp[i] < min_resp:
            continue
        last = int(coords[i])
        pts.append((t, last) if axis == "h" else (last, t))
    return pts


def subpixel_peak(vals, i):
    """Parabolic interpolation around a discrete peak."""
    if i <= 0 or i >= len(vals) - 1:
        return 0.0
    a, b, c = vals[i - 1], vals[i], vals[i + 1]
    d = a - 2 * b + c
    return 0.0 if d == 0 else 0.5 * (a - c) / d


segments = {}

# Top rim of the title ear (left, raised) — seed from the measured y=390 at x=200.
segments["top_ear"] = trace("h", range(60, 300, 2), (378, 402), 390)
# S-curve transition and the main top rim.
segments["top_step"] = trace("h", range(300, 350), (382, 416), 390, tol=3)
segments["top_main"] = trace("h", range(350, 1340, 4), (398, 420), 408)
# Tools-pod merge and pod top rim.
segments["top_pod_rise"] = trace("h", range(1340, 1404), (340, 414), 407, tol=4)
segments["top_pod"] = trace("h", range(1404, 1630, 2), (338, 356), 346)
# Bottom rim runs the full width.
segments["bottom"] = trace("h", range(40, 1640, 4), (712, 730), 720)
# Left and right vertical edges.
segments["left"] = trace("v", range(430, 700, 4), (12, 34), 20)
segments["right"] = trace("v", range(470, 700, 4), (1640, 1668), 1655)
# Status pane's internal right rim.
segments["pane_right"] = trace("v", range(450, 700, 4), (488, 514), 501)

report = {}
for name, pts in segments.items():
    if not pts:
        report[name] = None
        continue
    arr = np.array(pts)
    if name in ("left", "right", "pane_right"):
        vals = arr[:, 0]
    else:
        vals = arr[:, 1]
    report[name] = {
        "n": len(pts),
        "min": int(vals.min()),
        "max": int(vals.max()),
        "median": float(np.median(vals)),
        "first": pts[0],
        "last": pts[-1],
    }
    print(f"{name:14s} n={len(pts):4d}  range {vals.min()}..{vals.max()}  median {np.median(vals):.1f}")

# Sample the S-curves densely so we can fit them by hand.
print("\n--- left step (x -> y) ---")
print(" ".join(f"{x}:{y}" for x, y in segments["top_step"]))
print("\n--- pod rise (x -> y) ---")
print(" ".join(f"{x}:{y}" for x, y in segments["top_pod_rise"]))

(OUT / "outline_trace.json").write_text(
    json.dumps({"segments": {k: v for k, v in segments.items()}, "report": report}, indent=1),
    encoding="utf-8",
)

# Visual check: paint the traced points over a 2x crop of the HUD band.
crop_box = (0, 320, W, 800)
vis = img.crop(crop_box).resize(((crop_box[2] - crop_box[0]) * 2, (crop_box[3] - crop_box[1]) * 2), Image.LANCZOS)
d = ImageDraw.Draw(vis)
colors = {
    "top_ear": (0, 255, 0), "top_step": (255, 0, 0), "top_main": (0, 255, 255),
    "top_pod_rise": (255, 0, 255), "top_pod": (255, 255, 0), "bottom": (0, 160, 255),
    "left": (255, 128, 0), "right": (128, 255, 0), "pane_right": (255, 0, 128),
}
for name, pts in segments.items():
    for x, y in pts:
        X, Y = x * 2, (y - crop_box[1]) * 2
        d.rectangle([X - 1, Y - 1, X + 1, Y + 1], fill=colors[name])
vis.save(OUT / "outline_trace.png")
print(f"\nwrote {OUT / 'outline_trace.png'}")
