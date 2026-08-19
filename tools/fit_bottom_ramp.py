"""Solve the bottom bloom ramp from the prototype and emit it as CSS stops.

The ramp is additive (the layer blends with plus-lighter), so the light it must
contribute at each scanline is simply prototype - render with the ramp switched
off.  Run with --bare after setting --bottom-ramp to a transparent gradient:

    npm run diff && python tools/fit_bottom_ramp.py

Columns are restricted to bare glass -- below the cards for the right half, and
below the favour row inside the Status pane -- and the two are averaged, since any
left-to-right difference belongs to the plate rather than to this ramp.
"""

from pathlib import Path

import numpy as np
from PIL import Image

import geometry as G

ROOT = Path(__file__).resolve().parents[1]
BOTTOM = G.SHELL["bottom"]
TOP = 596                      # the ramp measures as zero from here up
# x0, x1, first clean scanline.  The three inter-card gaps are the only columns
# that are bare glass over the whole height of the card row; below the cards the
# full width opens up.
BANDS = [(804, 810, TOP), (1081, 1087, TOP), (1358, 1364, TOP), (540, 1620, 703)]

proto = np.asarray(Image.open(ROOT / "public" / "ref" / "prototype.png").convert("RGB"), float)
render = np.asarray(Image.open(ROOT / "artifacts" / "render.png").convert("RGB"), float)

rows = {}
for y in range(TOP, BOTTOM):
    vals = [proto[y, a:b].mean(0) - render[y, a:b].mean(0) for a, b, y0 in BANDS if y >= y0]
    if vals:
        rows[y] = np.mean(vals, axis=0)

# The ramp is monotone by nature, so a scanline that dips below its neighbours is
# a card element leaking into the gap columns rather than a feature of the ramp.
med = np.median([rows[y] for y in sorted(rows)], axis=1)
ys_all = sorted(rows)
for i, y in enumerate(ys_all):
    lo, hi = max(0, i - 34), min(len(ys_all), i + 35)
    if med[i] < np.median(med[lo:hi]) - 12:
        del rows[y]

# The ramp is smooth by nature; a 3-tap pass removes the sampling jitter that
# would otherwise show up as banding once it is turned into gradient stops.
have = sorted(rows)
ys = list(range(TOP, BOTTOM))
arr = np.clip(np.stack([np.interp(ys, have, [rows[y][c] for y in have]) for c in range(3)], 1), 0, None)
k = 9
pad = np.pad(arr, ((k // 2, k // 2), (0, 0)), mode="edge")
arr = np.stack([np.convolve(pad[:, c], np.ones(k) / k, "valid") for c in range(3)], 1)

# A stop's premultiplied colour is what lands on screen, so pick alpha from the
# strongest channel and scale the colour back up to suit.
print("  --bottom-ramp: linear-gradient(180deg,")
picks = [y for y in ys if (y - ys[0]) % 12 == 0 or y == ys[-1]]
out = []
for y in picks:
    v = arr[ys.index(y)]
    a = float(v.max()) / 255
    if a < 0.004:
        out.append(f"    rgba(255, 150, 235, 0) {y}px")
        continue
    c = np.clip(v / a, 0, 255)
    out.append(f"    rgba({c[0]:.0f}, {c[1]:.0f}, {c[2]:.0f}, {a:.3f}) {y}px")
print(",\n".join(out) + ");")
