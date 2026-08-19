"""Verify the seam offset rule against the landscape dock, before reusing it in portrait.

geometry.py documents: "convex arcs grow by gap, concave arcs shrink by gap,
centres unchanged".  The dock's bottom edge is the shell's top edge offset
outward by gap=13, so the shell's title ear (drop 21, fillet 34) should produce
the dock's notch (fillet 47 and 21) spanning the same x range.

Derivation being checked: for two arcs tangent to each other and to both
horizontals, the centres must be R1+R2 apart, which gives
    dx^2 = drop * (2*(R1+R2) - drop)
and since (F+g) + (F-g) = 2F, dx is independent of the gap.
"""
import math


def s_fillet(x0, y0, drop, r1, r2):
    s = r1 + r2
    dx = math.sqrt(drop * (2 * s - drop))
    c1 = (x0, y0 + r1)
    c2 = (x0 + dx, y0 + drop - r2)
    t = r1 / s
    join = (c1[0] + t * (c2[0] - c1[0]), c1[1] + t * (c2[1] - c1[1]))
    # tangency check: centres exactly R1+R2 apart
    dist = math.dist(c1, c2)
    return dx, join, dist, s


print("shell title ear  (drop 21, fillet 34/34, gap 0)")
dx, join, dist, s = s_fillet(307, 390, 21, 34, 34)
print(f"  dx        {dx:.2f}   expected 49  (flat_end 356 - ear right 307)")
print(f"  join      ({join[0]:.2f}, {join[1]:.2f})   expected (331.5, 400.5)")
print(f"  |C1C2|    {dist:.4f}   must equal R1+R2 = {s}")
print()

print("dock notch       (drop 21, fillet 47/21, gap 13)")
dx, join, dist, s = s_fillet(307, 377, 21, 34 + 13, 34 - 13)
print(f"  dx        {dx:.2f}   expected 49  (dock path 307 -> 356)")
print(f"  join      ({join[0]:.2f}, {join[1]:.2f})   expected (340.88, 391.5)")
print(f"  |C1C2|    {dist:.4f}   must equal R1+R2 = {s}")
print()

print("portrait         (drop 44, fillet 58/58, gap 26)")
dx0, j0, _, _ = s_fillet(268, 10, 44, 58, 58)
dx1, j1, d1, s1 = s_fillet(268, 10 - 26, 44, 58 + 26, 58 - 26)
print(f"  ear    dx {dx0:.2f}  join ({j0[0]:.2f}, {j0[1]:.2f})")
print(f"  notch  dx {dx1:.2f}  join ({j1[0]:.2f}, {j1[1]:.2f})   |C1C2| {d1:.4f} vs {s1}")
print(f"  dx equal? {abs(dx0 - dx1) < 1e-9}")
