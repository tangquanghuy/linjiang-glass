"""How much of the plate survives through the glass, prototype vs replica."""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
proto = np.asarray(Image.open(ROOT / "public" / "ref" / "prototype.png").convert("RGB"), float)
got = np.asarray(Image.open(ROOT / "artifacts" / "render.png").convert("RGB"), float)
plate = np.asarray(Image.open(ROOT / "public" / "assets" / "bg-plate.png").convert("RGB"), float)

PATCHES = {
    "ear-open": (60, 430, 280, 455),
    "above-cards": (860, 418, 1280, 458),
    "pane-gap": (80, 575, 480, 605),
    "intercard-1": (800, 500, 814, 640),
    "intercard-2": (1077, 500, 1091, 640),
    "under-cards": (560, 704, 1320, 716),
    "pod-dark": (1340, 360, 1410, 430),
    "left-margin": (28, 480, 48, 680),
}

TINT = np.array([36.0, 50.0, 96.0])


def chroma(a):
    m = a.mean(-1, keepdims=True)
    return float(np.sqrt(((a - m) ** 2).mean()))


def sat(a):
    mx, mn = a.max(-1), a.min(-1)
    return float(np.where(mx > 1, (mx - mn) / mx, 0).mean())


print("patch            src     R    G    B   lum  chroma   sat   d-plate")
print("-" * 88)
for name, (x0, y0, x1, y1) in PATCHES.items():
    for tag, im in (("proto", proto), ("got", got), ("plate", plate)):
        p = im[y0:y1, x0:x1]
        rgb = p.mean((0, 1))
        lum = float((p @ [0.299, 0.587, 0.114]).mean())
        d = rgb - plate[y0:y1, x0:x1].mean((0, 1))
        print(
            f"{name:<16} {tag:<6} {rgb[0]:5.0f} {rgb[1]:5.0f} {rgb[2]:5.0f}  "
            f"{lum:5.1f}  {chroma(p):6.1f}  {sat(p):.3f}  {d.round(0)}"
        )
    print()

print("plate weight (1-alpha), assuming tint rgb(36,50,96):")
for name, (x0, y0, x1, y1) in PATCHES.items():
    P = proto[y0:y1, x0:x1].mean((0, 1))
    G = got[y0:y1, x0:x1].mean((0, 1))
    Pl = plate[y0:y1, x0:x1].mean((0, 1))
    wP = (P - TINT) / (Pl - TINT + 1e-6)
    wG = (G - TINT) / (Pl - TINT + 1e-6)
    print(
        f"  {name:<16} proto {wP.round(2)} mean {wP.mean():.2f}   "
        f"got {wG.round(2)} mean {wG.mean():.2f}"
    )

# Warmth: R-B, the sunset leaking through
print("\nwarmth R-B (positive = sunset showing through):")
for name, (x0, y0, x1, y1) in PATCHES.items():
    for tag, im in (("proto", proto), ("got", got), ("plate", plate)):
        p = im[y0:y1, x0:x1].mean((0, 1))
        print(f"  {name:<16} {tag:<6} R-B {p[0]-p[2]:+6.1f}  G-B {p[1]-p[2]:+6.1f}")
