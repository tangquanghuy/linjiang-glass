"""Cut the header scripts and the blossom out of the prototype.

The cursive titles never match a webfont, and the sakura is a scene bloom rather
than a drawn icon -- both are taken from the prototype with a residual alpha so
they can sit on our glass without stamping a rectangle of someone else's frost.

    python tools/extract_sprites.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets"
ART = ROOT / "artifacts"
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(exist_ok=True)

proto = Image.open(ROOT / "public" / "ref" / "prototype.png").convert("RGB")
src = np.asarray(proto, float)


def ink_box(window, thr):
    x0, y0, x1, y1 = window
    lum = src[y0:y1, x0:x1] @ [0.299, 0.587, 0.114]
    m = lum > thr
    ys, xs = np.nonzero(m)
    bx0, bx1 = np.percentile(xs, [0.3, 99.7])
    by0, by1 = np.percentile(ys, [0.3, 99.7])
    return (x0 + int(bx0), y0 + int(by0), x0 + int(bx1) + 1, y0 + int(by1) + 1)


def punch_thin_rim(alpha, x0, y0, kind):
    """Drop the prototype rim that was baked into the crop.

    The extracted hairline is a solid 2px stroke (alpha ~ 1), so a 'thin
    feature' test never fires.  Distance to the live SVG path is the test:
    anything sitting on that path is our rim's job, not the sprite's.
    Letter strokes stay — they sit several pixels off the path."""
    h, w = alpha.shape
    yy = np.arange(y0, y0 + h, dtype=float)[:, None]
    xx = np.arange(x0, x0 + w, dtype=float)[None, :]
    if kind == "ear":
        hair = np.abs(yy - 390.0)
        # Quarter-circle of the title ear: centre (52, 419), r = 29.
        arc = np.abs(np.sqrt((xx - 52.0) ** 2 + (yy - 419.0) ** 2) - 29.0)
        on_arc = (xx <= 56) & (yy <= 423)
        dist = np.where(on_arc, np.minimum(hair, arc), hair)
        # Everything above the live path is leftover ear bloom; the proto's
        # inner highlight sits ~3px below the path — both are our rim's job.
        drop = (dist <= 5.8) | (yy < 389.0)
    else:
        dist = np.abs(yy - 411.0)
        drop = dist <= 5.8
    return np.where(drop, 0, alpha)


def extract(box, pad, blur, floor, scale, name, cut_right=None):
    """RGB from the prototype, alpha from how much the pixel outshines its neighbourhood."""
    x0, y0, x1, y1 = box
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    crop = src[y0:y1, x0:x1]
    bg = np.asarray(
        Image.fromarray(crop.astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)),
        float,
    )
    resid = (crop - bg) @ [0.299, 0.587, 0.114]
    alpha = np.clip((resid - floor) / scale, 0, 1)
    if cut_right is not None:
        local = max(0, cut_right - x0)
        alpha[:, local:] = 0
        if local > 4:
            alpha[:, local - 4:local] *= np.linspace(1, 0, 4)
    if name == "title-status":
        alpha = punch_thin_rim(alpha, x0, y0, kind="ear")
    if name == "title-girls":
        alpha = punch_thin_rim(alpha, x0, y0, kind="main")
    # Keep a little of the original glow; zero the rest so the glass shows through.
    rgba = np.zeros((crop.shape[0], crop.shape[1], 4), float)
    rgba[..., :3] = crop
    rgba[..., 3] = alpha * 255
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA")
    dest = OUT / f"{name}.png"
    img.save(dest)
    print(f"{name:16s}  {img.size[0]}x{img.size[1]}  at {x0},{y0}  meanA {alpha.mean():.3f}")
    return {"src": f"/assets/{name}.png", "x": x0, "y": y0, "w": img.size[0], "h": img.size[1]}


# Script only, full glyph height (S / G tops sit above the rim).  The CJK
# captions are garbled in the prototype so they stay live type -- these
# windows stop well before the slash.
status_box = (30, 380, 166, 452)
girls_box = (548, 394, 660, 466)
# Soft warm bloom, stop before the G.  The extractor knocks out the 1px rim
# the petals sit on.
blossom_box = (486, 366, 560, 448)


def extract_blossom(box, pad, name):
    x0, y0, x1, y1 = box
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    crop = src[y0:y1, x0:x1]
    bg = np.asarray(
        Image.fromarray(crop.astype(np.uint8)).filter(ImageFilter.GaussianBlur(5)),
        float,
    )
    resid = (crop - bg) @ [0.299, 0.587, 0.114]
    warm = crop[..., 0] * 0.45 + crop[..., 1] * 0.40 - crop[..., 2] * 0.20
    alpha = np.clip((resid - 1.5) / 26, 0, 1) * np.clip((warm - 40) / 50, 0.15, 1)
    # Drop the cool hairline only where the bloom has no vertical body -- a
    # petal that crosses the rim stays, an isolated 1px stroke does not.
    yy = np.arange(y0, y1)[:, None]
    rim = (yy >= 409) & (yy <= 413)
    pad_a = np.pad(alpha, ((4, 4), (0, 0)), mode="edge")
    thick = np.max(
        np.stack([pad_a[i:i + alpha.shape[0]] for i in range(9)]), 0
    )
    alpha = np.where(rim & (thick < 0.28), 0, alpha)
    rgba = np.zeros((crop.shape[0], crop.shape[1], 4), float)
    rgba[..., :3] = crop
    rgba[..., 3] = alpha * 255
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA")
    dest = OUT / f"{name}.png"
    img.save(dest)
    print(f"{name:16s}  {img.size[0]}x{img.size[1]}  at {x0},{y0}  meanA {alpha.mean():.3f}")
    return {"src": f"/assets/{name}.png", "x": x0, "y": y0, "w": img.size[0], "h": img.size[1]}


sprites = {
    "statusTitle": extract(status_box, pad=2, blur=5, floor=3, scale=28,
                           name="title-status", cut_right=160),
    "girlsTitle": extract(girls_box, pad=2, blur=5, floor=3, scale=28,
                          name="title-girls", cut_right=656),
    "blossom": extract_blossom(blossom_box, pad=4, name="blossom"),
}

# Preview on dark glass so holes in the alpha are obvious.
preview = Image.new("RGBA", (920, 200), (28, 36, 64, 255))
sx = 16
for key in ("statusTitle", "girlsTitle", "blossom"):
    im = Image.open(ROOT / "public" / sprites[key]["src"][1:])
    preview.paste(im, (sx, 40), im)
    sx += im.size[0] + 24
preview.convert("RGB").save(ART / "sprites_preview.png")
print("wrote", ART / "sprites_preview.png")

# Placement is consumed by content.js.
import json
(ROOT / "src" / "sprites.json").write_text(json.dumps(sprites, indent=2), encoding="utf-8")
print("wrote src/sprites.json")
