"""Ridge-trace the tool-pod's internal floor.  Max-brightness hunting locks onto
card glow; a centre-minus-flanks ridge response stays on the faint 2px border.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
img = Image.open(ROOT / "原型" / "原型示意图.png").convert("RGB")
lum = np.asarray(img).astype(float).mean(axis=2)

# Horizontal floor: y-search around 440 for x in 1420..1640.
print("x -> y  (ridge)")
pts = []
last = 440
for x in range(1360, 1650):
    lo, hi = max(410, last - 6), min(452, last + 6)
    ys = np.arange(lo, hi)
    c = lum[ys, x]
    fl = 0.5 * (lum[ys - 4, x] + lum[ys + 4, x])
    resp = c - fl
    k = int(resp.argmax())
    if resp[k] > 8:
        y = int(ys[k])
        pts.append((x, y, float(resp[k]), float(c[k])))
        last = y

print(" ".join(f"{x}:{y}" for x, y, *_ in pts[::3]))
print(f"n={len(pts)}  y range {min(p[1] for p in pts)}..{max(p[1] for p in pts)}")

# Where does the floor peel off the main top rim?  Walk left from 1420
# with a wider window looking for a rising ridge.
print("\n--- walk left from 1420 ---")
last = 440
left = []
for x in range(1420, 1320, -1):
    lo, hi = max(400, last - 8), min(450, last + 4)
    ys = np.arange(lo, hi)
    c = lum[ys, x]
    fl = 0.5 * (lum[ys - 4, x] + lum[ys + 4, x])
    resp = c - fl
    k = int(resp.argmax())
    if resp[k] < 6:
        break
    y = int(ys[k])
    left.append((x, y, float(resp[k])))
    last = y
print(" ".join(f"{x}:{y}" for x, y, _ in left))

# Right end: does it meet the shell's right edge or curve up into the TR corner?
print("\n--- walk right from 1580 ---")
last = 440
right = []
for x in range(1580, 1655):
    lo, hi = max(410, last - 3), min(460, last + 8)
    ys = np.arange(lo, hi)
    c = lum[ys, x]
    fl = 0.5 * (lum[ys - 4, x] + lum[ys + 4, x])
    resp = c - fl
    k = int(resp.argmax())
    if resp[k] < 6:
        break
    y = int(ys[k])
    right.append((x, y, float(resp[k])))
    last = y
print(" ".join(f"{x}:{y}" for x, y, _ in right))

vis = img.crop((1280, 330, 1672, 480))
z = 3
vis = vis.resize((vis.width * z, vis.height * z), Image.LANCZOS)
d = ImageDraw.Draw(vis)
for x, y, *_ in pts + left + right:
    X, Y = (x - 1280) * z, (y - 330) * z
    d.rectangle([X - 1, Y - 1, X + 1, Y + 1], fill=(255, 0, 0))
vis.save(ROOT / "_analysis" / "pod_floor_ridge.png")
print("wrote _analysis/pod_floor_ridge.png")
