"""Crop a region out of a render, for eyeballing one row at a time.

Usage: python tools/crop.py <src> <dst> <x> <y> <w> <h> [scale]
"""
import sys
from PIL import Image

src, dst, x, y, w, h = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
scale = int(sys.argv[7]) if len(sys.argv) > 7 else 1
im = Image.open(src).convert("RGB").crop((x, y, x + w, y + h))
if scale != 1:
    im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
im.save(dst)
print(f"{dst}  {im.width}x{im.height}")
