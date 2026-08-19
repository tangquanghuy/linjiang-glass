"""Locate text and icon bounding boxes by thresholding bright pixels inside a
region of interest.  Text sits well above the glass body luminance (~70-80), so a
threshold around 140 isolates it cleanly.
"""

import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
lum = np.asarray(Image.open(ROOT / "原型" / "原型示意图.png").convert("L")).astype(float)


def bbox(x0, y0, x1, y1, thr=140, label=""):
    reg = lum[y0:y1, x0:x1]
    m = reg > thr
    if not m.any():
        print(f"{label:26s} (nothing above {thr})")
        return None
    ys, xs = np.nonzero(m)
    # Trim 1% outliers so a stray bokeh pixel cannot inflate the box.
    bx0, bx1 = np.percentile(xs, [0.5, 99.5])
    by0, by1 = np.percentile(ys, [0.5, 99.5])
    L, T, R, B = x0 + int(bx0), y0 + int(by0), x0 + int(bx1), y0 + int(by1)
    print(f"{label:26s} x {L}..{R} (w {R - L})   y {T}..{B} (h {B - T})")
    return L, T, R, B


print("--- Status pane header ---")
bbox(40, 405, 200, 455, 150, "Status (script)")
bbox(196, 418, 300, 448, 150, "主角状态")
bbox(196, 418, 300, 448, 150, "主角状态 (again)")

print("\n--- Status pane column labels ---")
bbox(40, 470, 130, 500, 130, "资金 label+icon")
bbox(200, 470, 290, 500, 130, "日期 label+icon")
bbox(380, 470, 470, 500, 130, "时间 label+icon")

print("\n--- Status pane values ---")
bbox(40, 505, 190, 545, 140, "¥286,450 row")
bbox(200, 505, 370, 545, 140, "4月17日(周四) row")
bbox(380, 505, 500, 545, 140, "20:45 row")
bbox(60, 548, 190, 578, 130, "+12,000 pill")
bbox(200, 548, 340, 578, 130, "春季·第3周")
bbox(400, 548, 500, 578, 130, "夜晚")

print("\n--- favor row ---")
bbox(40, 612, 240, 642, 130, "好感度总览 label")
bbox(330, 655, 420, 692, 140, "74 / 100")
bbox(419, 654, 495, 686, 140, "详细 button")

print("\n--- Girls header ---")
bbox(560, 415, 700, 460, 150, "Girls (script)")
bbox(700, 425, 800, 455, 150, "女主角状态")
bbox(520, 395, 580, 445, 130, "sakura ornament")

print("\n--- card 1 internals (x 537..797) ---")
bbox(690, 480, 790, 515, 150, "name 晴奈")
bbox(690, 512, 790, 535, 130, "romaji Haruna")
bbox(690, 545, 790, 580, 140, "heart + 好感度")
bbox(680, 580, 790, 625, 140, "78 /100")
bbox(660, 625, 795, 660, 140, "mood pill")
bbox(650, 660, 795, 690, 130, "quote")

print("\n--- tool pod row ---")
bbox(1416, 366, 1466, 418, 150, "mail icon")
bbox(1455, 360, 1475, 380, 150, "badge dot")
bbox(1493, 366, 1543, 418, 150, "memo icon")
bbox(1571, 366, 1621, 418, 150, "gear icon")

print("\n--- next arrow ---")
bbox(1630, 530, 1672, 600, 120, "next arrow circle")
