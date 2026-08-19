"""Export what the web build needs: geometry as JSON, plus placeholder card art
cropped from the prototype so the cards read correctly before real art arrives.
"""

import json
from pathlib import Path

from PIL import Image

import geometry as G

ROOT = Path(__file__).resolve().parents[1]
proto = Image.open(ROOT / "原型" / "原型示意图.png").convert("RGBA")

ART = ROOT / "public" / "art"
ART.mkdir(parents=True, exist_ok=True)

# Art occupies roughly the left 55% of each card; the stat column sits to its right.
# The crop is taken just inside the rim and is placed back at the same inset with no
# scaling, so a placeholder lands pixel-exact and the diff isolates real errors.
ART_FRAC = 0.56
ART_W, ART_H = 0, 0
for i, (x, y, w, h) in enumerate(G.card_boxes(), 1):
    aw = int(w * ART_FRAC)
    crop = proto.crop((int(x) + 1, y + 1, int(x) + aw, y + h - 1))
    ART_W, ART_H = crop.size
    # Fade the inner edge so the art dissolves into the card glass.
    fade = Image.new("L", crop.size, 255)
    px = fade.load()
    tail = int(crop.width * 0.28)
    for cx in range(crop.width - tail, crop.width):
        v = int(255 * (crop.width - cx) / tail)
        for cy in range(crop.height):
            px[cx, cy] = v
    crop.putalpha(fade)
    crop.save(ART / f"girl{i}.png")
    print(f"girl{i}.png {crop.size}")

spec = {
    "canvas": {"w": G.CANVAS[0], "h": G.CANVAS[1]},
    "shell": G.SHELL,
    "shellPath": G.shell_path(),
    "rimSegments": G.rim_segments(),
    "convexArcs": G.convex_arcs(),
    "podFloorPath": G.pod_floor_path(),
    "statusPane": G.STATUS_PANE,
    "statusPanePath": G.status_pane_path(),
    "cards": {**G.CARDS, "boxes": [
        {"x": x, "y": y, "w": w, "h": h} for x, y, w, h in G.card_boxes()
    ], "artFrac": ART_FRAC, "artW": ART_W, "artH": ART_H},
    "regions": G.regions(),
    "toolBtn": G.TOOL_POD_BTN,
    "nextBtn": G.NEXT_BTN,
    "favorBar": G.FAVOR_BAR,
    "detailBtn": G.DETAIL_BTN,
    "optics": G.OPTICS,
}
dst = ROOT / "src" / "geometry.json"
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(json.dumps(spec, indent=2), encoding="utf-8")
print("wrote", dst)
