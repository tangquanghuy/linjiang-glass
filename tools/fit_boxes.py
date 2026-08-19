"""Fit exact rounded-rect geometry for every HUD element.

For each element we ridge-trace its four sides, take the median as the true edge
position, then find each corner radius by walking along a side until it departs
from that median.  Output feeds directly into the CSS/SVG build.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
img = Image.open(ROOT / "原型" / "原型示意图.png").convert("RGB")
lum = np.asarray(img).astype(float).mean(axis=2)
H, W = lum.shape


def ridge_at(along, lo, hi, orient, off=4):
    """Best ridge position in [lo,hi) on the line `along`. orient 'y' searches rows."""
    idx = np.arange(lo, hi)
    if orient == "y":
        c, f = lum[idx, along], 0.5 * (lum[idx - off, along] + lum[idx + off, along])
    else:
        c, f = lum[along, idx], 0.5 * (lum[along, idx - off] + lum[along, idx + off])
    r = c - f
    i = int(r.argmax())
    return int(idx[i]), float(r[i])


def edge(side, box, pad, span=0.6):
    """Median ridge position for one side of `box`, sampled over its middle `span`."""
    x0, y0, x1, y1 = box
    hits = []
    if side in ("top", "bottom"):
        a0, a1 = x0 + (x1 - x0) * (1 - span) / 2, x1 - (x1 - x0) * (1 - span) / 2
        guess = y0 if side == "top" else y1
        for a in range(int(a0), int(a1), 2):
            p, r = ridge_at(a, max(1, guess - pad), min(H - 5, guess + pad), "y")
            if r > 4:
                hits.append(p)
    else:
        a0, a1 = y0 + (y1 - y0) * (1 - span) / 2, y1 - (y1 - y0) * (1 - span) / 2
        guess = x0 if side == "left" else x1
        for a in range(int(a0), int(a1), 2):
            p, r = ridge_at(a, max(1, guess - pad), min(W - 5, guess + pad), "x")
            if r > 4:
                hits.append(p)
    if not hits:
        return None
    return int(np.median(hits))


def radius(box, edges, corner, pad):
    """Walk outward along the horizontal edge of `corner` until it leaves the median.

    The point where the rim first departs from the straight edge is `radius` away
    from the perpendicular edge, so the gap between that point and the vertical
    edge position is the corner radius.
    """
    vside, hside = corner  # e.g. ("top","left")
    ey, ex = edges[vside], edges[hside]
    if ey is None or ex is None:
        return None
    step = -1 if hside == "left" else 1
    start = int((edges["left"] + edges["right"]) / 2)
    last = start
    for a in range(start, ex, step):
        p, r = ridge_at(a, max(1, ey - pad), min(H - 5, ey + pad), "y")
        if r < 3 or abs(p - ey) > 1.5:
            break
        last = a
    return abs(last - ex)


ELEMENTS = {
    # name: (rough box, search pad)
    "shell":       ((23, 411, 1650, 720), 12),
    "title_ear":   ((23, 390, 300, 430), 8),
    "tool_pod":    ((1400, 350, 1650, 440), 10),
    "status_pane": ((23, 411, 521, 705), 14),
    "card1":       ((537, 467, 797, 700), 10),
    "card2":       ((814, 467, 1075, 700), 10),
    "card3":       ((1091, 467, 1352, 700), 10),
    "card4":       ((1368, 467, 1629, 700), 10),
    "tool_btn1":   ((1416, 366, 1470, 420), 10),
    "tool_btn2":   ((1494, 366, 1548, 420), 10),
    "tool_btn3":   ((1572, 366, 1626, 420), 10),
    "favor_bar":   ((88, 660, 320, 686), 8),
    "detail_btn":  ((421, 658, 500, 686), 8),
}

result = {}
for name, (box, pad) in ELEMENTS.items():
    e = {s: edge(s, box, pad) for s in ("top", "bottom", "left", "right")}
    rads = {
        "tl": radius(box, e, ("top", "left"), pad),
        "tr": radius(box, e, ("top", "right"), pad),
        "bl": radius(box, e, ("bottom", "left"), pad),
        "br": radius(box, e, ("bottom", "right"), pad),
    }
    w = None if None in (e["left"], e["right"]) else e["right"] - e["left"]
    h = None if None in (e["top"], e["bottom"]) else e["bottom"] - e["top"]
    result[name] = {"edges": e, "w": w, "h": h, "radii": rads}
    print(f"{name:12s} L={e['left']} T={e['top']} R={e['right']} B={e['bottom']}  "
          f"{w}x{h}  r={rads}")

(ROOT / "_analysis" / "boxes.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
print("\nwrote _analysis/boxes.json")
