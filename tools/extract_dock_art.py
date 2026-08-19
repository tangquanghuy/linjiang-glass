"""Cut the ornaments and the script header for the upper panel out of the mockups.

Two different keys, because the sources differ:

  flowers  The sakura are warm (R-B about +20) and everything they sit on is cool
           (R-B about -15).  That 35-unit separation keys far more cleanly than a
           luminance threshold, which would also grab the panel's own highlight.

  script   'Heroine' is a thin bright stroke on glass, so it keys the way
           extract_sprites.py already keys 'Status' and 'Girls': alpha from how
           much a pixel outshines its own neighbourhood.  A warm key would pull in
           the panel's warm bloom along with the letters.

Both keep the source RGB and only synthesise alpha, so the ornament carries the
prototype's own colour onto our glass instead of a flat tint.

    python tools/extract_dock_art.py
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets"
ART = ROOT / "artifacts"
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(exist_ok=True)

SOURCES = {
    "plan": ROOT / "原型" / "方案展示.png",
    "upper": ROOT / "原型" / "上方2.png",
}
src = {k: np.asarray(Image.open(v).convert("RGB"), float) for k, v in SOURCES.items()}


def trim(rgba, gap=4, thr=6):
    """Crop to the main mass, cutting edge fragments that are detached from it.

    The mockup panels carry rim highlights and small flourishes right next to the
    ornaments, and the key catches a few of them as specks a handful of pixels
    clear of the real shape -- the leftover "tails".  Filtering by area would be
    wrong (the dot on a cursive letter is legitimately tiny); the actual signal is
    distance, so this keeps the inkiest run and drops anything on the far side of a
    `gap`-wide band of nothing.
    """
    a = rgba[..., 3] > thr
    if not a.any():
        return rgba, 0, 0

    def main_run(occ):
        idx = np.nonzero(occ)[0]
        splits = np.nonzero(np.diff(idx) >= gap)[0]
        groups = np.split(idx, splits + 1)
        best = max(groups, key=lambda g: occ[g].sum())
        return int(best[0]), int(best[-1]) + 1

    y0, y1 = main_run(a.sum(1))
    x0, x1 = main_run(a.sum(0))
    return rgba[y0:y1, x0:x1], x0, y0


def warm_key(img, box, name, thr=0.0, scale=15.0, lum_floor=70.0, lum_scale=55.0,
             feather=0.6):
    x0, y0, x1, y1 = box
    crop = img[y0:y1, x0:x1]
    warm = crop[..., 0] - crop[..., 2]
    lum = crop @ [0.299, 0.587, 0.114]
    alpha = np.clip((warm - thr) / scale, 0, 1) * np.clip((lum - lum_floor) / lum_scale, 0, 1)
    if feather:
        alpha = np.asarray(
            Image.fromarray((alpha * 255).astype(np.uint8)).filter(
                ImageFilter.GaussianBlur(feather)), float) / 255.0
    rgba = np.zeros((*alpha.shape, 4), float)
    rgba[..., :3] = crop
    rgba[..., 3] = alpha * 255
    rgba, dx, dy = trim(rgba)
    out = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA")
    out.save(OUT / f"{name}.png")
    print(f"{name:16s} {out.size[0]:3d}x{out.size[1]:3d}  "
          f"src {x0 + dx},{y0 + dy}  meanA {rgba[..., 3].mean() / 255:.3f}  "
          f"solid {(rgba[..., 3] > 200).mean():.3f}")
    return {"src": f"/assets/{name}.png", "w": out.size[0], "h": out.size[1]}


def glow_key(img, box, name, blur=5.0, floor=3.0, scale=26.0):
    x0, y0, x1, y1 = box
    crop = img[y0:y1, x0:x1]
    bg = np.asarray(
        Image.fromarray(crop.astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)), float)
    resid = (crop - bg) @ [0.299, 0.587, 0.114]
    alpha = np.clip((resid - floor) / scale, 0, 1)
    rgba = np.zeros((*alpha.shape, 4), float)
    rgba[..., :3] = crop
    rgba[..., 3] = alpha * 255
    rgba, dx, dy = trim(rgba)
    out = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA")
    out.save(OUT / f"{name}.png")
    print(f"{name:16s} {out.size[0]:3d}x{out.size[1]:3d}  "
          f"src {x0 + dx},{y0 + dy}  meanA {rgba[..., 3].mean() / 255:.3f}")
    return {"src": f"/assets/{name}.png", "w": out.size[0], "h": out.size[1]}


art = {
    # Corner ornament from plan A's 我的信息 header -- the cluster that straddles
    # the panel's raised corner.
    # The box stops at y=163: below that is the mockup panel's own rim highlight,
    # which is warm enough to survive the key and reads as a stray streak.
    "dockBlossom": warm_key(src["plan"], (50, 103, 122, 163), "dock-blossom",
                            thr=-1.0, scale=16.0, lum_floor=88.0, lum_scale=52.0),
    # Section marker: the small pink sakura in front of 当前章节.
    "markSakura": warm_key(src["upper"], (1269, 257, 1305, 293), "mark-sakura",
                           thr=0.0, scale=13.0, lum_floor=96.0, lum_scale=48.0),
    # The upper panel's own script header.  floor=5 rather than 2.5: at 2.5 the
    # panel's broad bloom clears the threshold too and the sprite carries a faint
    # rectangle of someone else's glass.
    "heroineTitle": glow_key(src["upper"], (209, 199, 339, 249), "title-heroine",
                             blur=5.0, floor=5.0, scale=22.0),
}

(ROOT / "src" / "dock-art.json").write_text(
    json.dumps(art, indent=2, ensure_ascii=False), encoding="utf-8")
print("wrote src/dock-art.json")

# Preview on a dark plate so holes in the alpha are obvious, and on a light one so
# fringing is obvious.
for tone, bg in (("dark", (30, 38, 68, 255)), ("light", (150, 140, 175, 255))):
    strip = Image.new("RGBA", (420, 130), bg)
    x = 14
    for key in art:
        im = Image.open(ROOT / "public" / art[key]["src"].lstrip("/").replace("assets", "public/assets", 1)) \
            if False else Image.open(OUT / Path(art[key]["src"]).name)
        strip.alpha_composite(im, (x, (130 - im.size[1]) // 2))
        x += im.size[0] + 16
    strip.convert("RGB").resize((840, 260), Image.LANCZOS).save(ART / f"dock_art_{tone}.png")
print("wrote artifacts/dock_art_dark.png, artifacts/dock_art_light.png")
