"""Microscopic frost tile -- a soft silk, not clouds and not TV snow.

Failed recipes, both visible the moment you open the PNG:
  - FOG_SIGMA 5 + blur 2.2  -> 8-15px clouds (countable particles)
  - band-pass 0.55-2.2px    -> 1px salt-and-pepper (also countable)

The prototype's open glass is grain sd 0.54: you cannot point at a particle.
The overlay still has to exist or the body reads as plastic, so the tile is a
soft ~1.2px isotropic silk at a few grey levels.  Open it and it is almost
flat mid-grey; overlay it and the surface stops being a perfect slab.

Mean stays 128 so the blend only modulates.  tanh clips the bright tail that
would otherwise become a white speck on the indigo body.

    python tools/make_frost_tile.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
W, H = 1024, 1024
# Three scales.  The last tile was only 1.2px silk -- it killed the particles
# and also the 发雾.  Soft fog at ~3px is the veil; a slower 10px drift is the
# uneven thickness.  Neither is the old 8-15px cloud (that was sigma 5 + blur
# 2.2 at high contrast).  A 1.2px silk stays underneath so it is not plastic.
SILK_SIGMA, SILK_SD = 0.85, 2.6
FOG_SIGMA, FOG_SD = 1.00, 2.2
VEIL_SIGMA, VEIL_SD = 3.2, 0.25
# Slightly above 128 so soft-light lifts the body -- that is the milk.
MEAN = 130.0
CHROMA = 0.08
SEED = 20260817


def correlated(rng, sigma):
    white = rng.standard_normal((H, W))
    fy = np.fft.fftfreq(H)[:, None]
    fx = np.fft.fftfreq(W)[None, :]
    kernel = np.exp(-2 * (np.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
    out = np.fft.ifft2(np.fft.fft2(white) * kernel).real
    return out / out.std()


def stats(lum, tag):
    def corr(lag, ax):
        a = lum[:, :-lag] if ax == "x" else lum[:-lag]
        b = lum[:, lag:] if ax == "x" else lum[lag:]
        return np.corrcoef(a.ravel(), b.ravel())[0, 1]

    hi = lum > (lum.mean() + 1.4 * lum.std())
    runs = []
    for row in hi:
        n = 0
        for v in row:
            if v:
                n += 1
            elif n:
                runs.append(n)
                n = 0
        if n:
            runs.append(n)
    run_mean = float(np.mean(runs)) if runs else 0.0
    print(
        f"{tag:<16} mean {lum.mean():6.2f}  sd {lum.std():5.2f}  "
        f"corr@1 {corr(1, 'x'):.2f}  corr@4 {corr(4, 'x'):.2f}  "
        f"corr@12 {corr(12, 'x'):.2f}  bright-run {run_mean:.1f}px  "
        f"p01 {np.percentile(lum, 1):.1f}  p99 {np.percentile(lum, 99):.1f}"
    )


old_path = ROOT / "public" / "assets" / "frost.png"
old_img = Image.open(old_path).convert("RGB") if old_path.exists() else None
if old_img is not None:
    stats(np.asarray(old_img, float) @ [0.299, 0.587, 0.114], "prev frost.png")

rng = np.random.default_rng(SEED)
field = (
    SILK_SD * correlated(rng, SILK_SIGMA)
    + FOG_SD * correlated(rng, FOG_SIGMA)
    + VEIL_SD * correlated(rng, VEIL_SIGMA)
)
field -= field.mean()
tint = np.stack(
    [field + CHROMA * SILK_SD * rng.standard_normal((H, W)) for _ in range(3)],
    -1,
)
arr = MEAN + tint
# Clip bright tails: those are the white specks on the indigo body.
arr = MEAN + 8.5 * np.tanh((arr - MEAN) / 8.5)
arr += MEAN - arr.mean(axis=(0, 1))
img = Image.fromarray(np.clip(arr, 0, 255).round().astype(np.uint8))
img = img.filter(ImageFilter.GaussianBlur(0.35))
arr = np.asarray(img, float)
arr += MEAN - arr.mean(axis=(0, 1))
img = Image.fromarray(np.clip(arr, 0, 255).round().astype(np.uint8))

out = ROOT / "public" / "assets" / "frost.png"
img.save(out)
lum = np.asarray(img, float) @ [0.299, 0.587, 0.114]
stats(lum, "new frost.png")
print(f"wrote {out}  {W}x{H}")

# Proof sheet: 1:1, 4x nearest, and the tile soft-lighted onto the indigo body
# at the CSS opacity, which is what actually lands on the HUD.
art = ROOT / "artifacts"
art.mkdir(exist_ok=True)
crop_n = 240
new_c = img.crop((0, 0, crop_n, crop_n))
new_z = new_c.resize((crop_n * 4, crop_n * 4), Image.NEAREST)

indigo = np.full((crop_n, crop_n, 3), (36, 50, 96), float)
blend = np.asarray(new_c, float) / 255.0
base = indigo / 255.0
# CSS soft-light, then lerp with opacity 0.50 (matches .glass-frost).
soft = np.where(
    blend <= 0.5,
    base - (1.0 - 2.0 * blend) * base * (1.0 - base),
    base + (2.0 * blend - 1.0) * (np.sqrt(base) - base),
)
comp = np.clip((1.0 - 0.50) * indigo + 0.50 * soft * 255.0, 0, 255).astype(np.uint8)
comp_img = Image.fromarray(comp)
comp_z = comp_img.resize((crop_n * 4, crop_n * 4), Image.NEAREST)

amp = Image.fromarray(
    np.clip(128 + (np.asarray(new_c, float) - 128) * 10, 0, 255).astype(np.uint8)
)

pad, label_h = 16, 28
sheet = Image.new("RGB", (pad * 3 + crop_n * 4 * 2, label_h + crop_n * 4 + pad), (28, 30, 38))
sheet.paste(new_z, (pad, label_h))
sheet.paste(comp_z, (pad * 2 + crop_n * 4, label_h))
draw = ImageDraw.Draw(sheet)
draw.text((pad, 6), "tile 4x nearest  (almost flat grey = good)", fill=(220, 220, 230))
draw.text((pad * 2 + crop_n * 4, 6), "soft-light on indigo @0.50  4x", fill=(220, 220, 230))
sheet.save(art / "frost_compare.png")
amp.resize((crop_n * 3, crop_n * 3), Image.NEAREST).save(art / "frost_x10.png")
print(f"wrote {art / 'frost_compare.png'}")
