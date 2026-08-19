"""Measure card text-panel RGB vs prototype."""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OURS = np.asarray(Image.open(ROOT / "artifacts" / "render.png").convert("RGB")).astype(float)
PROTO = np.asarray(Image.open(ROOT / "原型" / "原型示意图.png").convert("RGB")).astype(float)

CARDS = [("ice/pink-proto", 537), ("rose/blue-proto", 814), ("crimson/pur-proto", 1091), ("gold/gold-proto", 1368)]

print("text panel x=190-250 y=40-200")
print(f"{'name':20} ours              proto             dRGB")
for name, x in CARDS:
    y = 467
    o = OURS[y + 40 : y + 200, x + 190 : x + 250].mean(axis=(0, 1))
    r = PROTO[y + 40 : y + 200, x + 190 : x + 250].mean(axis=(0, 1))
    print(
        f"{name:20} {o[0]:5.0f} {o[1]:5.0f} {o[2]:5.0f}     "
        f"{r[0]:5.0f} {r[1]:5.0f} {r[2]:5.0f}    "
        f"{o[0]-r[0]:+5.0f} {o[1]-r[1]:+5.0f} {o[2]-r[2]:+5.0f}"
    )

gap = OURS[520:680, 798:812].mean(axis=(0, 1))
print(f"\nHUD gap between c1-c2: {gap[0]:.0f} {gap[1]:.0f} {gap[2]:.0f}")
gap2 = OURS[520:680, 1075:1089].mean(axis=(0, 1))
print(f"HUD gap between c2-c3: {gap2[0]:.0f} {gap2[1]:.0f} {gap2[2]:.0f}")
gap3 = OURS[520:680, 1352:1366].mean(axis=(0, 1))
print(f"HUD gap between c3-c4: {gap3[0]:.0f} {gap3[1]:.0f} {gap3[2]:.0f}")
