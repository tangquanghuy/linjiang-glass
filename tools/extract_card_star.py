"""Cut the name-side sparkle from the prototype (晴奈 / 莉央)."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets"
ART = ROOT / "artifacts"
proto = Image.open(ROOT / "原型" / "原型示意图.png").convert("RGB")
src = np.asarray(proto, float)

# Just the glint to the right of the two-character name, plus a little glow.
BOXES = {
    "card-sparkle": (752, 486, 778, 512),  # 晴奈
    "card-star": (1584, 486, 1610, 512),   # 莉央
}


def extract(name, box, pad=3):
    x0, y0, x1, y1 = box
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    crop = src[y0:y1, x0:x1]
    bg = np.asarray(
        Image.fromarray(crop.astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)),
        float,
    )
    resid = (crop - bg) @ [0.299, 0.587, 0.114]
    lum = crop @ [0.299, 0.587, 0.114]
    alpha = np.clip((resid - 1.0) / 16, 0, 1)
    alpha = np.clip(alpha + np.clip((lum - 130) / 70, 0, 0.7), 0, 1)
    rgba = np.zeros((crop.shape[0], crop.shape[1], 4), float)
    rgba[..., :3] = np.clip(crop + 8, 0, 255)
    rgba[..., 3] = alpha * 255
    img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA")
    dest = OUT / f"{name}.png"
    img.save(dest)
    img.resize((img.size[0] * 4, img.size[1] * 4), Image.NEAREST).save(
        ART / f"{name}_x4.png"
    )
    print(f"{name:16s} {img.size[0]}x{img.size[1]}  meanA {alpha.mean():.3f}")
    return img


preview = Image.new("RGBA", (220, 80), (28, 32, 56, 255))
x = 16
for name, box in BOXES.items():
    im = extract(name, box)
    preview.paste(im, (x, 22), im)
    x += im.size[0] + 28
preview.convert("RGB").save(ART / "card_star_preview.png")
print("wrote", ART / "card_star_preview.png")
