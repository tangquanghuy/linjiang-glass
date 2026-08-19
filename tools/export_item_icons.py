"""Prepare the authored item-category art for the app.

Source: 原型/道具图标/<类别>.png -- one file per category in the closed enums that
变量相关/道具分类与图标素材.md defines.  Output: public/assets/items/<slug>.png, which is
where both layouts look (src/data.js resolveCategory picks the slug, and the drawer cell
and the portrait row both load it with an onerror that falls back to the hue placeholder).

Three things are done here rather than asked of the artwork:

  Cut out.  Most of the files already carry an alpha channel.  日用品.png does not: the
  generator *painted* the transparency checkerboard as pixels, two neutral greys near 254
  and 246 on a 32px grid.  A colour key alone would eat the subject, which is white
  plastic in the same range, so the background is found by flooding inward from the
  border and stops at the subject's outline.

  Trim.  Nearly every file's subject runs to the frame edge, and each one runs to a
  different edge, so their apparent sizes did not match.  Each is trimmed to its own
  bounds and re-seated to fill the frame, which makes the *file* a tight square around
  the subject and leaves the visual inset entirely to CSS.

  That is deliberate, and it is a correction: the brief asked the artwork for 11% of
  clearance, and honouring it here as well as in the cell's own inset padded the subject
  twice -- 78% of a box that was already 61% of the cell came out at 47% of it, which read
  as a small icon rattling around in a large socket.  One owner for apparent size, and it
  is the stylesheet, because that is where the cell is.

  Size.  512 was specified for authoring; it is four times what the app can show.  The
  largest real use is the landscape drawer cell: 40 canvas units at k up to 1.53 is 61
  real pixels, 122 on a 2x screen.  256 keeps a 2x margin over that and costs a quarter
  of the bytes of 512.  One constant if that ever needs to change.

Run: python tools/export_item_icons.py
"""

import os
from collections import deque

from PIL import Image, ImageFilter

# Sets live in numbered subfolders: 原型/道具图标/1, /2, /3.  A whole set to a folder rather
# than a -N suffix on every file, because sets are authored as batches and a folder is what
# a batch arrives as -- and discovered rather than listed, so a fourth set is a folder named
# 4 and no code change.  Anything else in the parent (备用/) is ignored.
SRC_ROOT = os.path.join('原型', '道具图标')
OUT = os.path.join('public', 'assets', 'items')
MANIFEST = os.path.join('src', 'item-art.json')


def set_dirs():
    if not os.path.isdir(SRC_ROOT):
        return []
    numbered = [d for d in os.listdir(SRC_ROOT)
                if d.isdigit() and os.path.isdir(os.path.join(SRC_ROOT, d))]
    return [(int(d), os.path.join(SRC_ROOT, d)) for d in sorted(numbered, key=int)]

SIZE = 256
# Not quite 1: a couple of pixels keep the outermost antialiased edge from being clipped
# by the resample.  Visual inset is the stylesheet's job, not this file's.
FILL = 0.97
ALPHA_FLOOR = 12     # ignore near-transparent fringe when measuring the subject

# Authored filename (without .png) -> slug.  The keys are the 类别 enum values, except
# 日用品 which the artwork names in full while the enum calls it 日用.
MAP = {
    '植物': 'material-plant',
    '动物': 'material-animal',
    '矿物': 'material-mineral',
    '化学': 'material-chemical',
    '织物': 'material-fabric',
    '素材-其他': 'material-other',

    '食物': 'consumable-food',
    '饮料': 'consumable-drink',
    '药物': 'consumable-medicine',
    '日用品': 'consumable-daily',
    '消耗品-其他': 'consumable-other',

    '服装': 'goods-clothing',
    '饰品': 'goods-accessory',
    '器具': 'goods-implement',
    '器材': 'goods-equipment',
    '用品-其他': 'goods-other',
}


def is_checker(px):
    """A pixel that could be part of the painted transparency checkerboard: neutral, and
    in the narrow near-white band the two checker tones occupy."""
    r, g, b = px[:3]
    return max(r, g, b) - min(r, g, b) < 6 and 238 <= (r + g + b) // 3 <= 255


def key_out_checkerboard(im):
    """Flood inward from the border through checker-coloured pixels only.

    Colour alone cannot do this: the subject is white plastic in the same range as the
    background, so keying by colour removes its highlights and punches holes through it.
    Reachability from the border is what separates 'background' from 'a white part of the
    subject' -- the latter is enclosed by the subject's darker outline.
    """
    w, h = im.size
    px = im.convert('RGB').load()
    background = bytearray(w * h)
    queue = deque()

    def push(x, y):
        i = y * w + x
        if not background[i] and is_checker(px[x, y]):
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
    # The checker grid is hard-edged, so the mask comes out hard too.  A slight blur and a
    # steep remap gives the subject the half-pixel edge the other files already have.
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 0 if v < 96 else (255 if v > 160 else (v - 96) * 4))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out, sum(background)


def seat(im):
    """Trim to the subject and re-seat it at FILL of a square SIZE frame."""
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
    """One file in, one file out.  Returns (bytes written, note)."""
    im = Image.open(path).convert('RGBA')
    note = ''
    if im.getchannel('A').getextrema()[0] == 255:
        im, keyed = key_out_checkerboard(im)
        note = f'  (keyed out a painted checkerboard, {keyed / (im.width * im.height) * 100:.0f}% of the frame)'
    out, _ = seat(im)
    out.save(dest, optimize=True)
    return os.path.getsize(dest), note


def main():
    os.makedirs(OUT, exist_ok=True)
    sets = set_dirs()
    art_sets = max([n for n, _ in sets], default=0)
    unused = set()
    total = 0
    made = 0
    kept = 0
    sets_per_slug = {}

    for n, src in sets:
        present = {os.path.splitext(f)[0] for f in os.listdir(src) if f.endswith('.png')}
        unused |= {f'{src}/{stem}' for stem in present - set(MAP)}
        print(f'  set {n}  {src}')
        for name, slug in MAP.items():
            out_name = slug if n == 1 else f'{slug}-{n}'
            dest = os.path.join(OUT, f'{out_name}.png')
            path = os.path.join(src, f'{name}.png')

            if os.path.exists(path):
                size, note = convert(path, dest)
                total += size
                made += 1
                print(f'    {name:<12} -> {out_name:<24} {size / 1024:6.1f} KB{note}')
            elif os.path.exists(dest):
                # Additive on purpose.  A source that has gone missing must not downgrade an
                # asset that is already shipped: rebuilding the manifest from sources alone
                # would drop these slugs to one set, orphan the -2/-3 files still on disk,
                # and silently take the app back to one picture per category.  A source is
                # how an asset gets made, not what keeps it alive.
                total += os.path.getsize(dest)
                kept += 1
                print(f'    {name:<12} -- source gone, kept the existing {out_name}.png')
            else:
                print(f'    MISSING  {name}.png -> {out_name}')
                continue

            # Only contiguous sets count: art numbered 3 with no 2 would otherwise let the
            # hash pick an index that is not there.
            if sets_per_slug.get(slug, 0) == n - 1:
                sets_per_slug[slug] = n

    # A manifest of how many sets each slug actually got.  Without it the app would hash an
    # item to a set that does not exist, request it, take a 404, and fall back -- correct,
    # but it means a wasted request per item on every render, repeated because the drawer is
    # rebuilt each time it opens.  This tool is the only thing that knows what was written,
    # so it is the thing that should say so.  The onerror chain stays as a safety net for a
    # file deleted without re-running this.
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        f.write('{\n')
        f.write(',\n'.join(f'  "{slug}": {n}' for slug, n in sorted(sets_per_slug.items())))
        f.write('\n}\n')
    print(f'\n  wrote {MANIFEST}')

    extra = unused
    if extra:
        print(f'  not mapped: {", ".join(sorted(extra))}')
    by_count = {}
    for slug, n in sets_per_slug.items():
        by_count[n] = by_count.get(n, 0) + 1
    spread = ', '.join(f'{c} slug(s) with {n} set(s)' for n, c in sorted(by_count.items()))
    print(f'  {made} exported, {kept} kept from a missing source, {total / 1024:.0f} KB, {SIZE}x{SIZE}')
    print(f'  {spread}')
    # src/data.js reads the manifest, so it needs no constant of its own -- but ART_SETS is
    # still the ceiling it clamps to, and it must not be lower than what was written here.
    print(f'  ART_SETS in src/data.js must be at least {art_sets}')


if __name__ == '__main__':
    main()
