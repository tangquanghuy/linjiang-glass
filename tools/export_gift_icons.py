"""Prepare the authored livestream gift icons for the app.

Source: 原型/礼物图标/<slug>.png -- the eleven files 变量相关/直播礼物图标素材.md lists.
Output: public/assets/gifts/<slug>.png, which is where src/data.js GIFT_ART points.
Empty files there currently make every cell fall back to the hue gem; dropping the
PNGs in is the whole integration.

Same three jobs as export_item_icons.py, with one difference in the key:

  Cut out.  The generator paints a near-white studio backdrop instead of an alpha
  channel.  Flood inward from the border through those pixels and stop at the
  subject's outline, so a cream envelope or a silver badge highlight is not eaten
  just because it is pale -- those sit inside the outline and are not reachable
  from the edge.

  Trim.  Seat the subject at FILL of a 256 square.  Apparent size in the tray is
  the stylesheet's job.

  Size.  256, same as the item icons: the tray cell is ~40 canvas units.

Run: python tools/export_gift_icons.py
"""

import os
from collections import deque

from PIL import Image, ImageFilter

SRC = os.path.join('原型', '礼物图标')
OUT = os.path.join('public', 'assets', 'gifts')

SLUGS = (
    'gift-heart',
    'gift-snack',
    'gift-cheers',
    'gift-blindbox',
    'gift-letter',
    'gift-plane',
    'gift-tower',
    'gift-rocket',
    'gift-guard-1',
    'gift-guard-2',
    'gift-guard-3',
)

SIZE = 256
FILL = 0.97
ALPHA_FLOOR = 12
# 直播礼物图标素材.md: 最暗处不低于 #2a2740.  Pure black muddies on the glass tray.
DARK_FLOOR = 42


def is_studio_white(px):
    r, g, b = px[:3]
    return min(r, g, b) >= 248 and max(r, g, b) - min(r, g, b) < 10


def key_out_white(im):
    w, h = im.size
    px = im.convert('RGB').load()
    background = bytearray(w * h)
    queue = deque()

    def push(x, y):
        i = y * w + x
        if not background[i] and is_studio_white(px[x, y]):
            background[i] = 1
            queue.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            push(x - 1, y)
        if x < w - 1:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y < h - 1:
            push(x, y + 1)

    alpha = Image.frombytes('L', (w, h), bytes(255 if not v else 0 for v in background))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8)).point(
        lambda v: 0 if v < 96 else (255 if v > 160 else (v - 96) * 4)
    )
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out, sum(background)


def lift_darks(im):
    """Keep the darkest opaque pixels off pure black without flattening the rest."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < ALPHA_FLOOR:
                continue
            lum = (r + g + b) // 3
            if lum >= DARK_FLOOR:
                continue
            if lum == 0:
                px[x, y] = (0x2A, 0x27, 0x40, a)
                continue
            s = DARK_FLOOR / lum
            px[x, y] = (
                min(255, round(r * s)),
                min(255, round(g * s)),
                min(255, round(b * s)),
                a,
            )
    return im


def seat(im):
    alpha = im.getchannel('A')
    box = alpha.point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()
    if not box:
        raise ValueError('no opaque pixels')
    subject = im.crop(box)
    target = round(SIZE * FILL)
    scale = target / max(subject.size)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(subject, ((SIZE - size[0]) // 2, (SIZE - size[1]) // 2))
    return canvas, box


def convert(path, dest):
    im = Image.open(path).convert('RGBA')
    note = ''
    if im.getchannel('A').getextrema()[0] == 255:
        im, keyed = key_out_white(im)
        note = f'  (keyed out studio white, {keyed / (im.width * im.height) * 100:.0f}% of the frame)'
    im = lift_darks(im)
    out, _ = seat(im)
    out.save(dest, optimize=True)
    return os.path.getsize(dest), note


def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.isdir(SRC):
        print(f'  missing {SRC}')
        return
    total = 0
    made = 0
    for slug in SLUGS:
        path = os.path.join(SRC, f'{slug}.png')
        dest = os.path.join(OUT, f'{slug}.png')
        if not os.path.exists(path):
            print(f'    MISSING  {slug}.png')
            continue
        size, note = convert(path, dest)
        total += size
        made += 1
        print(f'    {slug:<16} -> gifts/{slug}.png  {size / 1024:6.1f} KB{note}')
    print(f'\n  {made}/{len(SLUGS)} exported, {total / 1024:.0f} KB, {SIZE}x{SIZE}')


if __name__ == '__main__':
    main()
