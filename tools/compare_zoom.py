"""Stacked prototype/replica crops at high zoom for spot-checking a region.

    python tools/compare_zoom.py x0 y0 x1 y1 [zoom]
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ref = Image.open(ROOT / "public" / "ref" / "prototype.png").convert("RGB")
got = Image.open(ROOT / "artifacts" / "render.png").convert("RGB")

x0, y0, x1, y1 = (int(v) for v in sys.argv[1:5])
z = int(sys.argv[5]) if len(sys.argv) > 5 else 3
box = (x0, y0, x1, y1)
w, h = (x1 - x0) * z, (y1 - y0) * z

sheet = Image.new("RGB", (w, h * 2 + 8), (14, 12, 20))
for i, src in enumerate((ref, got)):
    sheet.paste(src.crop(box).resize((w, h), Image.LANCZOS), (0, i * (h + 8)))
d = ImageDraw.Draw(sheet)
d.text((6, 4), "PROTOTYPE", fill=(255, 240, 120))
d.text((6, h + 12), "REPLICA", fill=(255, 240, 120))
sheet.save(ROOT / "artifacts" / "zoom.png")
print("wrote artifacts/zoom.png", sheet.size, "box", box)
