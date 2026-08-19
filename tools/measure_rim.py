"""Sample rim colour along the shell path, and trace the tool-pod floor.

The rim is a ~2px ridge.  For each path sample we take the brightest pixel in a
small window, then print a compact along-path profile so the SVG stroke can be
authored as several segments instead of one vertical gradient.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")

import geometry as G
from svgpath import sample

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_analysis"
img = Image.open(ROOT / "原型" / "原型示意图.png").convert("RGB")
arr = np.asarray(img).astype(float)
lum = arr.mean(axis=2)
H, W = lum.shape

pts = sample(G.shell_path(), step=2.0)


def peak(x, y, rad=4):
    xi, yi = int(round(x)), int(round(y))
    x0, x1 = max(0, xi - rad), min(W, xi + rad + 1)
    y0, y1 = max(0, yi - rad), min(H, yi + rad + 1)
    win = lum[y0:y1, x0:x1]
    i = int(win.argmax())
    yy, xx = divmod(i, win.shape[1])
    rgb = arr[y0 + yy, x0 + xx]
    return float(win[yy, xx]), rgb, (x0 + xx, y0 + yy)


rows = []
for i, (x, y) in enumerate(pts):
    L, rgb, _ = peak(x, y)
    rows.append((i, x, y, L, rgb))

# Compact profile: every ~40 samples (~80px).
print("i     x      y    lum     R    G    B")
for i, x, y, L, rgb in rows[::20]:
    print(f"{i:4d} {x:6.1f} {y:6.1f}  {L:5.1f}  {rgb[0]:5.0f} {rgb[1]:5.0f} {rgb[2]:5.0f}")

# Landmark bins: ear top, main top, pod top, right, bottom, left.
def bin_mean(pred):
    sel = [(L, rgb) for _, x, y, L, rgb in rows if pred(x, y)]
    if not sel:
        return None
    L = np.mean([s[0] for s in sel])
    rgb = np.mean([s[1] for s in sel], axis=0)
    return L, rgb

landmarks = {
    "ear top":       lambda x, y: 60 < x < 300 and y < 400,
    "ear fillet":    lambda x, y: 300 < x < 360 and 390 < y < 420,
    "main top":      lambda x, y: 400 < x < 1300 and 400 < y < 420,
    "pod rise":      lambda x, y: 1330 < x < 1430 and 350 < y < 420,
    "pod top":       lambda x, y: 1440 < x < 1600 and y < 360,
    "pod TR corner": lambda x, y: x > 1600 and y < 400,
    "right side":    lambda x, y: x > 1635 and 420 < y < 680,
    "BR corner":     lambda x, y: x > 1600 and y > 680,
    "bottom":        lambda x, y: 80 < x < 1600 and y > 710,
    "BL corner":     lambda x, y: x < 60 and y > 680,
    "left side":     lambda x, y: x < 35 and 430 < y < 680,
    "TL corner":     lambda x, y: x < 55 and y < 430,
}
print("\n--- landmark means ---")
for name, pred in landmarks.items():
    m = bin_mean(pred)
    if m is None:
        print(f"{name:16s}  (none)")
        continue
    L, rgb = m
    print(f"{name:16s}  lum {L:5.1f}  rgb {rgb[0]:5.0f} {rgb[1]:5.0f} {rgb[2]:5.0f}")

# Bloom colour just inside the bottom rim, away from cards.
print("\n--- bloom patches just above bottom rim ---")
for x0 in (80, 200, 400, 900, 1100, 1500):
    p = arr[690:710, x0:x0 + 40].reshape(-1, 3).mean(axis=0)
    print(f"  x {x0:4d}  {p.round(1)}")

# Trace pod floor: faint horizontal ridge around y 440, x 1400..1640,
# then the left fillet that rises to meet the main top.
print("\n--- pod floor vertical profile (x 1480..1560) ---")
for y in range(420, 460):
    v = lum[y, 1480:1560].mean()
    print(f"  y {y}  {v:6.1f}  {'#' * int(max(0, v - 50) / 4)}")

print("\n--- pod floor left fillet (scan each x for ridge in y 400..450) ---")
floor = []
last = 440
for x in range(1340, 1650):
    lo, hi = max(400, last - 8), min(455, last + 8)
    col = lum[lo:hi, x]
    # Prefer a local peak, not just the brightest pixel (cards glow).
    k = int(col.argmax())
    y = lo + k
    if col[k] > 90:
        floor.append((x, y, float(col[k])))
        last = y

# Thin the list.
print(" ".join(f"{x}:{y}" for x, y, _ in floor[::4]))

(OUT / "rim_profile.json").write_text(json.dumps({
    "landmarks": {k: (None if bin_mean(v) is None else {
        "lum": float(bin_mean(v)[0]),
        "rgb": [float(c) for c in bin_mean(v)[1]],
    }) for k, v in landmarks.items()},
    "floor": floor[::2],
}, indent=1), encoding="utf-8")

# Overlay: paint floor points.
vis = img.crop((1280, 330, 1672, 480)).resize((784, 300), Image.LANCZOS)
d = ImageDraw.Draw(vis)
for x, y, _ in floor:
    d.point(((x - 1280) * 2, (y - 330) * 2), fill=(255, 0, 0))
vis.save(OUT / "pod_floor_trace.png")
print("\nwrote _analysis/pod_floor_trace.png")
