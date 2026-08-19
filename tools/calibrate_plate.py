"""Solve for the background plate that makes the rendered glass match the prototype.

The composite inside the silhouette is roughly

    render = alpha * tint + (1 - alpha) * blur(plate)   (+ rim, glow, bloom, content)

so nudging the plate by d moves the render by about (1 - alpha) * d.  Rather than
inverting that analytically -- which would ignore how backdrop-filter pulls bright
pixels in from just outside the silhouette -- this measures the residual against a
real render and steps the plate toward it.  The system is close to linear, so a few
passes converge.

Only pixels that genuinely show bare glass drive the correction: anything near the
rim, under a card, or lit by text is excluded, then the residual is smoothed and
extrapolated across the whole silhouette so the plate stays low-frequency.

    npm run diff && python tools/calibrate_plate.py     (repeat 3-4 times)
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import geometry as G
from svgpath import sample

ROOT = Path(__file__).resolve().parents[1]
GAIN = 3.0          # below the analytic 1/(1-alpha) ~ 2.9..4.2, for stability
SMOOTH = 22         # residual is low-frequency by construction

render_path = ROOT / "artifacts" / "render.png"
if not render_path.exists():
    sys.exit("no artifacts/render.png -- run `npm run diff` first")

proto = np.asarray(Image.open(ROOT / "原型" / "原型示意图.png").convert("RGB")).astype(np.float64)
render = np.asarray(Image.open(render_path).convert("RGB")).astype(np.float64)
plate_img = Image.open(ROOT / "public" / "assets" / "bg-plate.png").convert("RGB")
plate = np.asarray(plate_img).astype(np.float64)
H, W, _ = proto.shape

# ------------------------------------------------------------------- masks
sil = Image.new("L", (W, H), 0)
ImageDraw.Draw(sil).polygon([(x, y) for x, y in sample(G.shell_path(), 0.4)], fill=255)
inside = np.asarray(sil).astype(bool)

# Erode the silhouette: within ~15px of the rim the inner glow, not the plate,
# decides the colour.
eroded = np.asarray(sil.filter(ImageFilter.MinFilter(31))).astype(bool)

drive = eroded.copy()
for b in G.card_boxes():
    x, y, w, h = b
    drive[max(0, y - 6):y + h + 6, max(0, int(x) - 6):int(x) + w + 6] = False

# Text, icons and bars are far brighter than bare glass in either image.
bright = Image.fromarray((((proto.mean(axis=2) > 112) | (render.mean(axis=2) > 112)) * 255).astype(np.uint8))
drive &= ~np.asarray(bright.filter(ImageFilter.MaxFilter(9))).astype(bool)

print(f"drive pixels: {drive.sum()} ({100 * drive.sum() / inside.sum():.1f}% of silhouette)")
resid = proto - render
print("mean residual on drive mask:", resid[drive].mean(axis=0).round(2),
      " abs:", np.abs(resid[drive]).mean().round(2))

# ------------------------------------- smooth + extrapolate over the silhouette
weight = drive.astype(np.float64)


def _box1d(a, r, axis):
    """Edge-clamped box average, via a prefix sum so the cost is independent of r."""
    a = np.moveaxis(a, axis, 0)
    n = a.shape[0]
    pad = np.concatenate([np.repeat(a[:1], r, 0), a, np.repeat(a[-1:], r, 0)], 0)
    c = np.concatenate([np.zeros_like(pad[:1]), np.cumsum(pad, 0)], 0)
    out = (c[2 * r + 1: 2 * r + 1 + n] - c[:n]) / (2 * r + 1)
    return np.moveaxis(out, 0, axis)


def blur(a, r):
    """Three box passes, which is a close enough stand-in for a Gaussian here.
    PIL cannot blur float images, and these fields must stay signed."""
    r = max(1, int(round(r)))
    for _ in range(3):
        a = _box1d(a, r, 0)
        a = _box1d(a, r, 1)
    return a


num = np.stack([blur(resid[:, :, c] * weight, SMOOTH) for c in range(3)], axis=2)
den = blur(weight, SMOOTH)
field = num / np.maximum(den, 1e-4)[:, :, None]

# Where the drive mask was empty the smoothing has nothing to say, so pull those
# areas from progressively coarser versions of the same field.
for r in (60, 140, 300):
    n2 = np.stack([blur(resid[:, :, c] * weight, r) for c in range(3)], axis=2)
    d2 = blur(weight, r)
    gap = den < 0.02
    field[gap] = (n2 / np.maximum(d2, 1e-4)[:, :, None])[gap]
    den = np.maximum(den, d2)

field = np.stack([blur(field[:, :, c], 12) for c in range(3)], axis=2)

out = plate.copy()
out[inside] = np.clip(plate[inside] + GAIN * field[inside], 0, 255)
Image.fromarray(out.astype(np.uint8)).save(ROOT / "public" / "assets" / "bg-plate.png")
print(f"plate adjusted by mean {np.abs(GAIN * field[inside]).mean():.1f} levels; wrote public/assets/bg-plate.png")
