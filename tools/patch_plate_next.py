"""Erase the prototype next-page disc from the already-calibrated plate.

The disc is centred on the right rim, so its outer half lives outside the
silhouette and was copied verbatim.  Live chrome must not sit on top of it.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "public" / "assets" / "bg-plate.png"
plate = Image.open(path).convert("RGB")
w, h = plate.size
arr = np.asarray(plate).astype(np.float64)

cx, cy, r = 1648, 566, 26
mask_img = Image.new("L", (w, h), 0)
ImageDraw.Draw(mask_img).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
m = np.asarray(mask_img) > 0
m[:, :cx] = False

# Donor: the same rows, a few pixels past the disc, plus the rows just above
# and below it — all scene bokeh, none of the chrome.
donor = arr.copy()
yy, xx = np.nonzero(m)
for y, x in zip(yy, xx):
    src_y = y
    if src_y < cy - r + 2:
        src_y = cy - r - 4
    elif src_y > cy + r - 2:
        src_y = cy + r + 4
    donor[y, x] = arr[np.clip(src_y, 0, h - 1), min(w - 2, cx + r + 2)]

# Soften the seam so the hole is not a hard stamp.
filled = Image.fromarray(np.clip(donor, 0, 255).astype(np.uint8))
soft = filled.filter(ImageFilter.GaussianBlur(6))
alpha = mask_img.filter(ImageFilter.GaussianBlur(2))
# Keep the left half of the ellipse mask at 0 (already cleared above).
a = np.array(alpha)
a[:, :cx] = 0
patched = Image.composite(soft, plate, Image.fromarray(a))
patched.save(path)
print("patched", path, "pixels", int(m.sum()))
