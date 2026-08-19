"""Second pass: internal rims (Status pane border, tools pod, girl cards).

Some internal borders are far fainter than the outer rim, so for those we print
raw luminance profiles and read the boundary off directly instead of relying on
ridge detection.
"""

import numpy as np
from PIL import Image

from trace_outline import lum, ridge_column, ridge_row, trace  # noqa: F401


def hprofile(y0, y1, x0, x1, label):
    print(f"\n=== horizontal profile  y={y0}..{y1}  {label} ===")
    band = lum[y0:y1, x0:x1].mean(axis=0)
    for i, v in enumerate(band):
        x = x0 + i
        bar = "#" * int(max(0, v - 40) / 4)
        print(f"{x:5d} {v:7.1f} {bar}")


def vprofile(x0, x1, y0, y1, label):
    print(f"\n=== vertical profile  x={x0}..{x1}  {label} ===")
    band = lum[y0:y1, x0:x1].mean(axis=1)
    for i, v in enumerate(band):
        y = y0 + i
        bar = "#" * int(max(0, v - 40) / 4)
        print(f"{y:5d} {v:7.1f} {bar}")


# Status pane's right border: pick rows with no text/graphics in the way.
hprofile(590, 610, 465, 545, "Status pane right border (empty row)")

# Tools pod: where does the rise flatten, and where does the pod's top rim end?
print("\n=== pod rise, wide window ===")
print(" ".join(f"{x}:{y}" for x, y in trace("h", range(1330, 1460), (338, 418), 409, tol=4)))

# Pod's internal bottom border.
vprofile(1450, 1520, 405, 460, "pod bottom border")

# Pod's right end / shell top-right corner.
hprofile(344, 356, 1600, 1665, "pod top rim, right end")

# Card 1 (Haruna) frame: bright rose rim traces well.
print("\n=== card1 top rim ===")
print(" ".join(f"{x}:{y}" for x, y in trace("h", range(600, 780, 6), (452, 476), 464, tol=5)))
print("\n=== card1 left rim ===")
print(" ".join(f"{x}:{y}" for x, y in trace("v", range(500, 690, 8), (540, 570), 553, tol=5)))
print("\n=== card1 bottom rim ===")
print(" ".join(f"{x}:{y}" for x, y in trace("h", range(600, 780, 6), (686, 710), 700, tol=5)))

# Card pitch: scan a row that crosses all four card rims.
hprofile(560, 580, 540, 1660, "row crossing all four card rims")
