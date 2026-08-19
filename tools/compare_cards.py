"""Side-by-side + MAE of the four girl cards vs the prototype.

    python tools/compare_cards.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / "public" / "ref" / "prototype.png"
if not REF.exists():
    REF = ROOT / "原型" / "原型示意图.png"
GOT = ROOT / "artifacts" / "render.png"
ART = ROOT / "artifacts"

CARDS = [
    ("c1", 537, 467),
    ("c2", 814, 467),
    ("c3", 1091, 467),
    ("c4", 1368, 467),
]
W, H, PAD = 260, 234, 18


def mae(a, b):
    return float(np.abs(a.astype(float) - b.astype(float)).mean())


def main():
    proto = np.asarray(Image.open(REF).convert("RGB"))
    got = np.asarray(Image.open(GOT).convert("RGB"))
    ART.mkdir(exist_ok=True)

    # Full rail: proto | ours | |diff|*3
    rail_w = (W + PAD * 2) * 4
    rail_h = H + PAD * 2
    proto_rail = Image.fromarray(proto[467 - PAD : 467 + H + PAD, 537 - PAD : 537 - PAD + rail_w])
    got_rail = Image.fromarray(got[467 - PAD : 467 + H + PAD, 537 - PAD : 537 - PAD + rail_w])
    diff = np.clip(np.abs(np.asarray(got_rail).astype(float) - np.asarray(proto_rail).astype(float)) * 3, 0, 255)
    stack = Image.new("RGB", (rail_w, rail_h * 3 + 16), (12, 10, 18))
    stack.paste(proto_rail, (0, 0))
    stack.paste(got_rail, (0, rail_h + 8))
    stack.paste(Image.fromarray(diff.astype(np.uint8)), (0, rail_h * 2 + 16))
    stack.save(ART / "cards_band.png")

    print("card   full   text-panel (x>150)   rim-band")
    rows = []
    for name, x, y in CARDS:
        p = proto[y : y + H, x : x + W]
        g = got[y : y + H, x : x + W]
        text = (slice(None), slice(150, W))
        rim = np.zeros((H, W), bool)
        rim[:3] = True
        rim[-3:] = True
        rim[:, :3] = True
        rim[:, -3:] = True
        print(
            f"{name}   {mae(p, g):5.1f}   {mae(p[text], g[text]):5.1f}          "
            f"{mae(p[rim], g[rim]):5.1f}"
        )
        # per-card strip: proto | ours | diff
        d = np.clip(np.abs(p.astype(float) - g.astype(float)) * 3, 0, 255).astype(np.uint8)
        strip = Image.new("RGB", (W * 3 + 16, H), (12, 10, 18))
        strip.paste(Image.fromarray(p), (0, 0))
        strip.paste(Image.fromarray(g), (W + 8, 0))
        strip.paste(Image.fromarray(d), (W * 2 + 16, 0))
        strip.save(ART / f"card_{name}_cmp.png")
        rows.append(strip)

    sheet = Image.new("RGB", (W * 3 + 16, H * 4 + 24), (12, 10, 18))
    for i, row in enumerate(rows):
        sheet.paste(row, (0, i * (H + 8)))
    sheet.save(ART / "cards_cmp.png")
    print("wrote artifacts/cards_band.png, cards_cmp.png")


if __name__ == "__main__":
    main()
