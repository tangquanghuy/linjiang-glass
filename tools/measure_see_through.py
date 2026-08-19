"""Does the prototype's glass keep more of the scene's colour blobs than we do?"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
proto = Image.open(ROOT / "public" / "ref" / "prototype.png").convert("RGB")
got = Image.open(ROOT / "artifacts" / "render.png").convert("RGB")
plate = Image.open(ROOT / "public" / "assets" / "bg-plate.png").convert("RGB")

# Mid-frequency: colour blobs the size of a blossom / lamp, not grain and not the
# whole-panel gradient.  Subtract a 40px blur from a 6px blur.
def mid(im):
    a = np.asarray(im, float)
    hi = np.asarray(im.filter(ImageFilter.GaussianBlur(6)), float)
    lo = np.asarray(im.filter(ImageFilter.GaussianBlur(40)), float)
    return hi - lo, a


P_m, P = mid(proto)
G_m, G = mid(got)
Pl_m, Pl = mid(plate)

# Bare glass, well inside the rim, away from cards and text.
BANDS = {
    "status-body": (40, 460, 500, 600),
    "above-cards": (850, 416, 1320, 460),
    "between-cards": (790, 500, 1370, 690),
    "left-warm": (26, 500, 70, 700),
    "pod": (1336, 356, 1640, 436),
}

print("mid-frequency energy (colour blobs showing through the frost)")
print(f"{'band':<16} {'src':<6} {'sdR':>6} {'sdG':>6} {'sdB':>6} {'sdL':>6}  hue-of-blob")
for name, (x0, y0, x1, y1) in BANDS.items():
    for tag, m, raw in (("proto", P_m, P), ("got", G_m, G), ("plate", Pl_m, Pl)):
        sl = (slice(y0, y1), slice(x0, x1))
        blob = m[sl]
        sd = blob.std((0, 1))
        lum = (blob @ [0.299, 0.587, 0.114]).std()
        # Dominant direction of the residual colour
        v = blob.reshape(-1, 3).mean(0)
        print(
            f"{name:<16} {tag:<6} {sd[0]:6.2f} {sd[1]:6.2f} {sd[2]:6.2f} {lum:6.2f}  "
            f"mean-blob {v.round(1)}"
        )
    print()

# Channel-wise correlation with the plate in the mid band: if proto tracks the
# plate's pink/gold blobs and we don't, that's the missing 微光晕.
print("correlation of mid-band with the plate (does the glass follow the scene?)")
for name, (x0, y0, x1, y1) in BANDS.items():
    sl = (slice(y0, y1), slice(x0, x1))
    for tag, m in (("proto", P_m), ("got", G_m)):
        cor = []
        for c in range(3):
            a, b = m[sl][..., c].ravel(), Pl_m[sl][..., c].ravel()
            if a.std() < 1e-6 or b.std() < 1e-6:
                cor.append(0.0)
            else:
                cor.append(float(np.corrcoef(a, b)[0, 1]))
        print(f"  {name:<16} {tag:<6} corr RGB {np.round(cor, 2)}  mean {np.mean(cor):.2f}")

# Fine grain coloured by the local mean -- the fog should pick up the scene hue,
# not sit as grey noise on indigo.
print("\nfine grain (1-6px) chroma -- is the frost coloured or grey?")
for name, (x0, y0, x1, y1) in BANDS.items():
    for tag, im in (("proto", proto), ("got", got)):
        crop = im.crop((x0, y0, x1, y1))
        grain = np.asarray(crop, float) - np.asarray(crop.filter(ImageFilter.GaussianBlur(2.2)), float)
        # chroma of the grain itself
        ch = np.sqrt(((grain - grain.mean(-1, keepdims=True)) ** 2).mean())
        sd = grain.std()
        print(f"  {name:<16} {tag:<6} grain-sd {sd:5.2f}  grain-chroma {ch:5.2f}")
