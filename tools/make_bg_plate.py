"""Build the background plate the HUD sits on.

Everything outside the glass silhouette is copied verbatim from the prototype, so
the outer bloom and the desk reflection are exact.  The area *behind* the glass is
reconstructed with a pyramid (harmonic) fill: successively coarser levels are built
from valid pixels only, then the hole is filled from the coarsest level upward.
That interpolates the surrounding scene smoothly, which suits an out-of-focus
background and cannot produce the banding a per-column rescale does.

Because the glass is heavily blurred and ~80% opaque, only the low frequencies of
this reconstruction survive, so a smooth fill is indistinguishable from a true
inpaint once the glass is composited over it.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import geometry as G
from svgpath import sample

ROOT = Path(__file__).resolve().parents[1]
proto = Image.open(ROOT / "原型" / "原型示意图.png").convert("RGB")
W, H = proto.size
src = np.asarray(proto).astype(np.float64)

# ---------------------------------------------------------------- silhouette
poly = [(x, y) for x, y in sample(G.shell_path(), step=0.4)]
mask_img = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask_img).polygon(poly, fill=255)
# Grow by one pixel so the prototype's own rim goes too, but no further: dilating
# further eats into the baked outer bloom that the replica relies on being exact.
mask_img = mask_img.filter(ImageFilter.MaxFilter(3))
# The next-page disc sits on the right rim; its outer half is outside the
# silhouette and would otherwise be copied verbatim, then drawn again live.
ImageDraw.Draw(mask_img).ellipse((1648 - 26, 566 - 26, 1648 + 26, 566 + 26), fill=255)
mask = np.asarray(mask_img).astype(bool)

ys = np.nonzero(mask.any(axis=1))[0]
print(f"silhouette rows {ys.min()}..{ys.max()}, {mask.sum()} px")


# --------------------------------------------------------------- pyramid fill
def downsample(val, wgt):
    """Average 2x2 blocks, weighting by validity so holes do not pull toward zero."""
    h, w = wgt.shape
    h, w = h - h % 2, w - w % 2
    v = val[:h, :w] * wgt[:h, :w, None]
    v = v[0::2, 0::2] + v[1::2, 0::2] + v[0::2, 1::2] + v[1::2, 1::2]
    g = wgt[:h, :w]
    g = g[0::2, 0::2] + g[1::2, 0::2] + g[0::2, 1::2] + g[1::2, 1::2]
    safe = np.maximum(g, 1e-8)
    return v / safe[:, :, None], np.minimum(g, 1.0)


def upsample_to(val, shape):
    img = Image.fromarray(np.clip(val, 0, 255).astype(np.uint8))
    return np.asarray(img.resize((shape[1], shape[0]), Image.BILINEAR)).astype(np.float64)


valid = (~mask).astype(np.float64)
levels = [(src * valid[:, :, None], valid)]
while min(levels[-1][1].shape) > 4:
    levels.append(downsample(*levels[-1]))

# Walk back down, using the coarser level to fill wherever this level is invalid.
filled = levels[-1][0]
for lvl in range(len(levels) - 2, -1, -1):
    val, wgt = levels[lvl]
    coarse = upsample_to(filled, wgt.shape)
    filled = np.where(wgt[:, :, None] > 0.5, val, coarse)

out = np.where(mask[:, :, None], filled, src)
plate = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

# Soften the reconstruction so the pyramid's blockiness disappears, then restore
# the untouched pixels exactly.
soft = plate.filter(ImageFilter.GaussianBlur(9))
inner = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
plate = Image.composite(soft, plate, inner)
plate.paste(proto, (0, 0), Image.fromarray(((~mask) * 255).astype(np.uint8)))

# Grain, so the smooth fill does not read as a gradient mesh.
rng = np.random.default_rng(7)
arr = np.asarray(plate).astype(np.float64)
plate = Image.fromarray(np.clip(arr + rng.normal(0, 2.2, (H, W, 1)) * mask[:, :, None], 0, 255).astype(np.uint8))

dst = ROOT / "public" / "assets" / "bg-plate.png"
dst.parent.mkdir(parents=True, exist_ok=True)
plate.save(dst)
print("wrote", dst)

# Report the reconstructed backdrop colour where the glass body sits, so the
# CSS tint can be calibrated against the measured body colours.
p = np.asarray(plate).astype(float)
for label, (xa, xb) in {"left (x150-260)": (150, 260), "right (x950-1080)": (950, 1080)}.items():
    print(f"backdrop behind glass, {label}: {p[560:600, xa:xb].reshape(-1, 3).mean(axis=0).round(1)}")

side = Image.new("RGB", (W, 2 * 470))
side.paste(proto.crop((0, 320, W, 790)), (0, 0))
side.paste(plate.crop((0, 320, W, 790)), (0, 470))
side.save(ROOT / "_analysis" / "plate_compare.png")
print("wrote _analysis/plate_compare.png")
