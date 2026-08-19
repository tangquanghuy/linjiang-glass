"""What blur + tint mix on the plate best matches the prototype's see-through.

The 11% local-contrast figure was for high-frequency edges.  Mid-size colour
blobs (a blossom, a lamp) are what make the glass look transparent, and those
live at 6-40px -- a 64px backdrop-filter wipes them.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
proto = Image.open(ROOT / "public" / "ref" / "prototype.png").convert("RGB")
plate = Image.open(ROOT / "public" / "assets" / "bg-plate.png").convert("RGB")
P = np.asarray(proto, float)
Pl = np.asarray(plate, float)

# Clean glass, no text / cards / rim.
BOX = (860, 418, 1280, 458)
x0, y0, x1, y1 = BOX
target = P[y0:y1, x0:x1]
tgt_mid = (
    np.asarray(proto.crop(BOX).filter(ImageFilter.GaussianBlur(6)), float)
    - np.asarray(proto.crop(BOX).filter(ImageFilter.GaussianBlur(40)), float)
)

TINT = np.array([36.0, 50.0, 96.0])

print("radius  alpha  MAE   mid-sd-ratio  mid-corr  mean-RGB")
for radius in (8, 12, 16, 20, 24, 28, 32, 40, 48, 64):
    blurred = np.asarray(plate.filter(ImageFilter.GaussianBlur(radius)), float)
    b = blurred[y0:y1, x0:x1]
    for alpha in (0.35, 0.42, 0.50, 0.58, 0.66):
        mix = alpha * TINT + (1 - alpha) * b
        mae = float(np.abs(mix - target).mean())
        mix_im = Image.fromarray(np.clip(mix, 0, 255).astype(np.uint8))
        mix_mid = (
            np.asarray(mix_im.filter(ImageFilter.GaussianBlur(6)), float)
            - np.asarray(mix_im.filter(ImageFilter.GaussianBlur(40)), float)
        )
        sd_r = mix_mid.std() / (tgt_mid.std() + 1e-6)
        corr = float(np.corrcoef(mix_mid.ravel(), tgt_mid.ravel())[0, 1])
        print(
            f"{radius:>6}  {alpha:.2f}  {mae:5.1f}   {sd_r:6.2f}       {corr:5.2f}   "
            f"{mix.mean((0, 1)).round(0)}"
        )
