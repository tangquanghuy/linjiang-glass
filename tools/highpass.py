"""High-pass view of the HUD: subtract a heavily blurred copy so every faint
rim, divider and inner border becomes visible at once.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_analysis"
img = Image.open(ROOT / "原型" / "原型示意图.png").convert("RGB")

box = (0, 330, 1672, 790)
crop = img.crop(box)
lo = crop.filter(ImageFilter.GaussianBlur(6))
hi = np.asarray(crop).astype(float) - np.asarray(lo).astype(float)

# Amplify and centre at mid grey; keep it monochrome for legibility.
g = hi.mean(axis=2) * 7.0 + 128.0
out = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8)).convert("RGB")

z = 2
out = out.resize((out.width * z, out.height * z), Image.LANCZOS)
d = ImageDraw.Draw(out)
for ox in range(0, 1672, 100):
    X = ox * z
    d.line([(X, 0), (X, 24)], fill=(255, 0, 0), width=1)
    d.text((X + 2, 2), str(ox), fill=(255, 0, 0))
for oy in range(350, 790, 50):
    Y = (oy - box[1]) * z
    d.line([(0, Y), (28, Y)], fill=(255, 0, 0), width=1)
    d.text((30, Y - 5), str(oy), fill=(255, 0, 0))
out.save(OUT / "highpass_full.png")
print("wrote", OUT / "highpass_full.png", out.size)

# Zoomed high-pass on the Status / Girls boundary, where the structure is unclear.
for name, b in {
    "hp_boundary": (300, 380, 620, 760),
    "hp_pod": (1300, 330, 1672, 470),
    "hp_leftcorner": (0, 370, 200, 480),
}.items():
    c = img.crop(b)
    l2 = c.filter(ImageFilter.GaussianBlur(5))
    h2 = np.asarray(c).astype(float) - np.asarray(l2).astype(float)
    g2 = h2.mean(axis=2) * 8.0 + 128.0
    o2 = Image.fromarray(np.clip(g2, 0, 255).astype(np.uint8)).convert("RGB")
    zz = 4
    o2 = o2.resize((o2.width * zz, o2.height * zz), Image.LANCZOS)
    dd = ImageDraw.Draw(o2)
    for ox in range(b[0] - b[0] % 20 + 20, b[2], 20):
        X = (ox - b[0]) * zz
        dd.line([(X, 0), (X, o2.height)], fill=(255, 60, 60))
        dd.text((X + 2, 2), str(ox), fill=(255, 200, 0))
    for oy in range(b[1] - b[1] % 20 + 20, b[3], 20):
        Y = (oy - b[1]) * zz
        dd.line([(0, Y), (o2.width, Y)], fill=(255, 60, 60))
        dd.text((2, Y + 2), str(oy), fill=(255, 200, 0))
    o2.save(OUT / f"{name}.png")
    print("wrote", name, b, o2.size)
