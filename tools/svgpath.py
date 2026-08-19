"""Minimal SVG path sampler for the subset we emit: M, L, A (circular), Z.

Implementing the endpoint->centre arc conversion from the SVG spec lets the
verification tooling sample the exact same `d` string the browser will render,
so the check can never pass against a different shape than the one shipped.
"""

import math
import re

TOKEN = re.compile(r"([MLAZmlaz])|(-?\d*\.?\d+)")


def _tokens(d):
    for m in TOKEN.finditer(d):
        yield m.group(1) if m.group(1) else float(m.group(2))


def _arc_centre(p0, p1, r, large_arc, sweep):
    """SVG endpoint parameterisation -> centre, start angle, sweep angle."""
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = (x1 - x0) / 2, (y1 - y0) / 2
    half = math.hypot(dx, dy)
    r = max(r, half)  # spec: scale r up if it cannot span the endpoints
    h = math.sqrt(max(0.0, r * r - half * half))
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    # Unit normal to the chord.
    nx, ny = -dy / half, dx / half
    sign = 1.0 if large_arc != sweep else -1.0
    cx, cy = mx + sign * h * nx, my + sign * h * ny
    a0 = math.atan2(y0 - cy, x0 - cx)
    a1 = math.atan2(y1 - cy, x1 - cx)
    da = a1 - a0
    if sweep and da < 0:
        da += 2 * math.pi
    elif not sweep and da > 0:
        da -= 2 * math.pi
    return (cx, cy), a0, da, r


def sample(d, step=0.5):
    """Return a densely sampled polyline of the path, one point per ~`step` px."""
    pts, cur, start = [], (0.0, 0.0), (0.0, 0.0)
    it = list(_tokens(d))
    i, cmd = 0, None
    while i < len(it):
        if isinstance(it[i], str):
            cmd = it[i].upper()
            i += 1
            if cmd == "Z":
                n = max(2, int(math.dist(cur, start) / step))
                pts += [(cur[0] + (start[0] - cur[0]) * t / n,
                         cur[1] + (start[1] - cur[1]) * t / n) for t in range(n + 1)]
                cur = start
            continue
        if cmd == "M":
            cur = start = (it[i], it[i + 1])
            pts.append(cur)
            i += 2
        elif cmd == "L":
            nxt = (it[i], it[i + 1])
            n = max(2, int(math.dist(cur, nxt) / step))
            pts += [(cur[0] + (nxt[0] - cur[0]) * t / n,
                     cur[1] + (nxt[1] - cur[1]) * t / n) for t in range(1, n + 1)]
            cur = nxt
            i += 2
        elif cmd == "A":
            r, large, sweep, nxt = it[i], int(it[i + 3]), int(it[i + 4]), (it[i + 5], it[i + 6])
            (cx, cy), a0, da, rr = _arc_centre(cur, nxt, r, large, sweep)
            n = max(3, int(abs(da) * rr / step))
            pts += [(cx + rr * math.cos(a0 + da * t / n), cy + rr * math.sin(a0 + da * t / n))
                    for t in range(1, n + 1)]
            cur = nxt
            i += 7
        else:
            raise ValueError(f"unsupported command {cmd}")
    return pts
