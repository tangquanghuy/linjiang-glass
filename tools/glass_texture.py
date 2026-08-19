"""Isolate the fine structure the prototype's glass carries on top of its gradients.

Subtracting a heavily blurred copy leaves only what varies faster than the body
shading: if the surface has polish marks, this is where they show.  Writes an
amplified map plus a directional energy readout, so the streaks can be reproduced
with the right angle and scale rather than by eye.

    python tools/glass_texture.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
proto = Image.open(ROOT / "public" / "ref" / "prototype.png").convert("RGB")

# Bare glass only: no rim, no card, no text.
PATCHES = {
    "above-cards": (850, 416, 1320, 463),
    "pane-gap": (60, 578, 500, 605),
    "pod-left": (1340, 358, 1412, 436),
    "below-cards": (560, 703, 1330, 716),
}

big = np.asarray(proto, float)
lowpass = np.asarray(proto.filter(ImageFilter.GaussianBlur(9)), float)
detail = big - lowpass

# Mid band: coarser than grain, finer than the body shading.  This is the scale a
# polished surface lives at, so it gets its own full-HUD map.
mid = (np.asarray(proto.filter(ImageFilter.GaussianBlur(7)), float)
       - np.asarray(proto.filter(ImageFilter.GaussianBlur(46)), float))
band = np.clip(128 + mid[350:725, 20:1655] * 5, 0, 255).astype(np.uint8)
Image.fromarray(band).save(ROOT / "artifacts" / "tex_midband.png")

for name, (x0, y0, x1, y1) in PATCHES.items():
    d = detail[y0:y1, x0:x1]
    lum = d @ [0.299, 0.587, 0.114]
    gy, gx = np.gradient(lum)
    # Streaks show up as energy concentrated across one axis and not the other.
    print(f"{name:<13} sd {lum.std():5.2f}   |d/dx| {np.abs(gx).mean():5.2f}   "
          f"|d/dy| {np.abs(gy).mean():5.2f}   ratio {np.abs(gy).mean() / max(np.abs(gx).mean(), 1e-6):4.2f}")

    vis = np.clip(128 + d[..., :3] * 7, 0, 255).astype(np.uint8)
    img = Image.fromarray(vis)
    img = img.resize((img.width * 2, img.height * 2), Image.NEAREST)
    img.save(ROOT / "artifacts" / f"tex_{name}.png")

print("\nwrote artifacts/tex_*.png (detail x7 around mid grey)")
