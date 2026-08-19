"""Horizontal luminance of card mid-band. Finds dark valleys in the art-to-glass fade."""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def profile(path, y0=90, y1=160):
    im = np.asarray(Image.open(path).convert("RGB")).astype(float)
    band = im[y0:y1].mean(axis=0)
    lum = 0.2126 * band[:, 0] + 0.7152 * band[:, 1] + 0.0722 * band[:, 2]
    step = max(1, len(lum) // 13)
    parts = [f"{i}:{lum[i]:.0f}" for i in range(0, len(lum), step)]
    valley = int(lum[60:200].min()) if len(lum) > 200 else int(lum.min())
    return lum, f"min60-200={valley}  " + " ".join(parts)


for label, rel in [
    ("proto gold", "artifacts/proto_c4-gold.png"),
    ("proto pink", "artifacts/proto_c1-pink.png"),
    ("ours ice", "artifacts/live_c1.png"),
    ("ours rose", "artifacts/live_c2.png"),
    ("ours crimson", "artifacts/live_c3.png"),
    ("ours gold", "artifacts/live_c4.png"),
]:
    p = ROOT / rel
    if not p.exists():
        print(label, "missing")
        continue
    _, s = profile(p)
    print(f"{label:14} {s}")
