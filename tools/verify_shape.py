"""Sample the generated outline path and check it lands on the prototype's rim.

Reports, for every point on the path, how far the nearest brightness ridge is.
A good fit means the median offset is under a pixel and the tail is small.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import geometry as G
from svgpath import sample

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_analysis"
proto = Image.open(ROOT / "原型" / "原型示意图.png").convert("RGB")
lum = np.asarray(proto).astype(float).mean(axis=2)
H, W = lum.shape


def offsets(pts, axis_hint):
    """For each sampled point, the signed distance to the brightest nearby ridge."""
    out = []
    for x, y in pts:
        xi, yi = int(round(x)), int(round(y))
        if not (8 < xi < W - 8 and 8 < yi < H - 8):
            continue
        if axis_hint(x, y) == "h":       # horizontal edge -> search vertically
            win = lum[yi - 5:yi + 6, xi]
            k = int(win.argmax()) - 5
        else:                             # vertical edge -> search horizontally
            win = lum[yi, xi - 5:xi + 6]
            k = int(win.argmax()) - 5
        out.append(k)
    return np.array(out)


s = G.SHELL


def shell_axis(x, y):
    """Near the left/right edges the rim runs vertically, elsewhere horizontally."""
    if x < s["left"] + s["r"] or x > s["right"] - s["r"]:
        if s["top"] < y < s["bottom"] - s["r"]:
            return "v"
    return "h"


targets = {
    "shell": (sample(G.shell_path()), shell_axis),
    "status": (sample(G.status_pane_path()), lambda x, y: "v" if y > 470 else "h"),
}
for i, (x, y, w, h) in enumerate(G.card_boxes(), 1):
    r = G.CARDS["r"]
    d = (f"M {x + r} {y} L {x + w - r} {y} A {r} {r} 0 0 1 {x + w} {y + r} "
         f"L {x + w} {y + h - r} A {r} {r} 0 0 1 {x + w - r} {y + h} "
         f"L {x + r} {y + h} A {r} {r} 0 0 1 {x} {y + h - r} "
         f"L {x} {y + r} A {r} {r} 0 0 1 {x + r} {y} Z")
    targets[f"card{i}"] = (sample(d), lambda px, py, x=x, w=w, r=r:
                           "v" if (px < x + r or px > x + w - r) else "h")

print(f"{'element':10s} {'n':>5s} {'median':>7s} {'|off|<=1':>9s} {'|off|<=2':>9s}")
for name, (pts, hint) in targets.items():
    off = offsets(pts, hint)
    if len(off) == 0:
        print(f"{name:10s}   no samples in frame")
        continue
    print(f"{name:10s} {len(off):5d} {np.median(off):7.2f} "
          f"{100 * np.mean(np.abs(off) <= 1):8.1f}% {100 * np.mean(np.abs(off) <= 2):8.1f}%")

# Visual overlay for a human check.
vis = proto.copy()
d = ImageDraw.Draw(vis)
colors = {"shell": (255, 0, 0), "status": (0, 200, 255),
          "card1": (0, 255, 120), "card2": (0, 255, 120),
          "card3": (0, 255, 120), "card4": (0, 255, 120)}
for name, (pts, _) in targets.items():
    for x, y in pts[::2]:
        d.point((x, y), fill=colors[name])
for i in range(3):
    cx = G.TOOL_POD_BTN["first_cx"] + i * G.TOOL_POD_BTN["pitch"]
    r = G.TOOL_POD_BTN["d"] / 2
    d.ellipse([cx - r, G.TOOL_POD_BTN["cy"] - r, cx + r, G.TOOL_POD_BTN["cy"] + r],
              outline=(255, 220, 0))
band = vis.crop((0, 330, W, 790))
band = band.resize((band.width * 2, band.height * 2), Image.LANCZOS)
band.save(OUT / "shape_overlay.png")
print("\nwrote _analysis/shape_overlay.png")
