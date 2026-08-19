"""Extract the single bloom out of public/assets/blossom.png.

That file is not a cutout.  It is a rectangular crop off the prototype holding the main
bloom, a separate bud, a length of stem, and -- across rows 48-50 -- a fragment of the
shell's own rim highlight.  At the one position it was cut for, that rim fragment lands
on the real rim and vanishes, which is why nobody noticed.  Drawn anywhere else, or at
any other size, the fragment and the soft matte around it read as a hard-edged box.

Connected-component labelling is the wrong tool for finding the bloom: its petals are
separated by fully transparent gaps, so the bloom splits into several components and
none of them is the flower.  The bloom is simply the right-hand part of the crop, so
this takes it by rectangle and then drops any surviving speck that is not adjacent to
something solid.

Usage: python tools/extract_blossom.py [--write]
"""
import sys
from PIL import Image

SRC = "public/assets/blossom.png"
DST = "public/assets/blossom-bloom.png"
BOX = (44, 30, 82, 80)      # the bloom, stem stub included; excludes bud and rim line
SOLID = 200
NEAR = 2

im = Image.open(SRC).convert("RGBA")
crop = im.crop(BOX)
w, h = crop.size
px = crop.load()

solid = {(x, y) for y in range(h) for x in range(w) if px[x, y][3] >= SOLID}


def near_solid(x, y):
    return any((x + dx, y + dy) in solid
               for dy in range(-NEAR, NEAR + 1) for dx in range(-NEAR, NEAR + 1))


specks = [(x, y) for y in range(h) for x in range(w)
          if 0 < px[x, y][3] < SOLID and not near_solid(x, y)]

print(f"{SRC} -> bloom at {BOX}  =>  {w}x{h}")
print(f"  solid pixels:        {len(solid)}")
print(f"  detached specks:     {len(specks)}  (cleared)")
print(f"  fully transparent:   {sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)}")

if "--write" not in sys.argv:
    print("\n  report only; pass --write to emit the file")
    sys.exit(0)

for x, y in specks:
    r, g, b, _ = px[x, y]
    px[x, y] = (r, g, b, 0)
crop.save(DST)
print(f"\n  wrote {DST}")
print(f"  {SRC} untouched, so the landscape pixel diff is unaffected")
