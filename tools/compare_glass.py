"""Stack prototype-vs-render crops of the glass itself (no text) so the material
can be judged directly.  Run after `npm run diff` refreshes artifacts/render.png.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ref = Image.open(ROOT / "public" / "ref" / "prototype.png").convert("RGB")
got = Image.open(ROOT / "artifacts" / "render.png").convert("RGB")

REGIONS = [
    ("title ear + corner + rim", (0, 368, 430, 500)),
    ("tool pod S-fillet merge", (1290, 332, 1672, 464)),
    ("bottom rim + underside bloom", (900, 640, 1330, 772)),
]

Z = 2
PAD = 10
rows = [(label, box) for label, box in REGIONS]
w = max(box[2] - box[0] for _, box in rows) * Z
h = sum((box[3] - box[1]) * Z * 2 + PAD * 3 for _, box in rows)
sheet = Image.new("RGB", (w, h), (16, 14, 22))
d = ImageDraw.Draw(sheet)

y = 0
for label, box in rows:
    ch = (box[3] - box[1]) * Z
    for i, src in enumerate((ref, got)):
        c = src.crop(box).resize(((box[2] - box[0]) * Z, ch), Image.LANCZOS)
        sheet.paste(c, (0, y))
        d.text((6, y + 4), ("PROTOTYPE  " if i == 0 else "REPLICA    ") + label,
               fill=(255, 240, 120))
        y += ch
    y += PAD * 3

sheet.save(ROOT / "artifacts" / "glass_compare.png")
print("wrote artifacts/glass_compare.png", sheet.size)
