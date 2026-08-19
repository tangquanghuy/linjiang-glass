"""Single source of truth for HUD geometry, in prototype pixel coordinates.

The design canvas is the prototype's native 1672x941.  Everything the build
consumes is derived from this file so the CSS/SVG and the verification tooling
can never drift apart.
"""

CANVAS = (1672, 941)

# Outer glass silhouette.  Not a rounded rectangle: a raised "title ear" on the
# left and a raised "tool pod" on the right fuse into the main body through
# S-fillets (a convex arc tangent to a concave arc), which border-radius cannot
# express -- hence the SVG path.
SHELL = {
    "left": 23,
    "right": 1648,
    "top": 411,          # main body top rim
    "bottom": 720,
    "r": 32,             # bottom corners
    "ear": {"right": 307, "top": 390, "r_tl": 29, "fillet": 34, "flat_end": 356},
    "pod": {"left": 1430, "top": 350, "r_tr": 45, "fillet": 54, "flat_start": 1333},
}

# Faint internal border delimiting the Status region; shares the shell's left,
# top and bottom edges, so only the right edge and its corner radius are real.
STATUS_PANE = {"right": 517, "bottom": 718, "r": 55}

# Height is 234 rather than the 233 the edge fit reports: the fit locates rim
# centres, and a 1.5px border drawn inside a 233px box puts the bottom rim's centre
# at 699.25 where the prototype has it at 700.5.
CARDS = {"top": 467, "height": 234, "width": 260, "pitch": 277, "first_left": 537, "r": 18}

TOOL_POD_BTN = {"d": 46, "cy": 391, "first_cx": 1439, "pitch": 77.5}

# Next-page disc sits on the right rim, half in the glass.  The live rim is
# gapped across this circle so the vertical highlight does not cut through it.
NEXT_BTN = {"cx": 1648, "cy": 566, "d": 40}

FAVOR_BAR = {"left": 95, "top": 666, "w": 232, "h": 14}
DETAIL_BTN = {"left": 419, "top": 654, "w": 74, "h": 30, "r": 15}

# Frames the content layer lays out inside.  These are the only content
# coordinates in the project: everything within a frame is placed by normal flow
# from the spacing and type scales in src/styles/tokens.css, so a new field or a
# fifth card costs a data entry and no measurement.
def regions():
    s = SHELL
    ear_top, pod = s["ear"]["top"], s["pod"]
    return {
        "status": {"x": s["left"], "y": ear_top, "w": STATUS_PANE["right"] - s["left"],
                   "h": STATUS_PANE["bottom"] - ear_top},
        "girls": {"x": STATUS_PANE["right"], "y": ear_top,
                  "w": s["right"] - STATUS_PANE["right"], "h": s["bottom"] - ear_top},
        # Height is set so the frame's centre line is the measured button centre,
        # which is what the row of buttons aligns to.
        "pod": {"x": pod["left"], "y": pod["top"], "w": s["right"] - pod["left"],
                "h": 2 * (TOOL_POD_BTN["cy"] - pod["top"])},
    }

# Measured optical constants (see tools/measure_optics.py output).
OPTICS = {
    "rim_peak": (218, 215, 230),      # brightest point of the top rim
    "body_left": (65, 70, 103),       # glass body colour, warm end
    "body_right": (47, 61, 102),      # glass body colour, cool end
    "top_glow_falloff": 40,           # px over which the inner top glow decays
    "bottom_bloom_rise": 85,          # px over which the inner bottom bloom rises
    "bottom_rim_lum": 250,
    "backdrop_sd_ratio": 0.11,        # local sd retained through the glass (~1/9)
}


def shell_path():
    """SVG path `d` for the outer glass silhouette, clockwise from the ear."""
    s = SHELL
    L, R, T, B, r = s["left"], s["right"], s["top"], s["bottom"], s["r"]
    ear, pod = s["ear"], s["pod"]
    eT, eR, eRad, eFil, eEnd = ear["top"], ear["right"], ear["r_tl"], ear["fillet"], ear["flat_end"]
    pL, pT, pRad, pFil, pStart = pod["left"], pod["top"], pod["r_tr"], pod["fillet"], pod["flat_start"]

    # S-fillet midpoints: the two tangent arcs meet halfway in both axes.
    ear_mid_x, ear_mid_y = (eR + eEnd) / 2, (eT + T) / 2
    pod_mid_x, pod_mid_y = (pStart + pL) / 2, (T + pT) / 2

    return " ".join([
        f"M {L + eRad} {eT}",
        f"L {eR} {eT}",
        f"A {eFil} {eFil} 0 0 1 {ear_mid_x} {ear_mid_y}",   # convex, curving down
        f"A {eFil} {eFil} 0 0 0 {eEnd} {T}",                 # concave, back to flat
        f"L {pStart} {T}",
        f"A {pFil} {pFil} 0 0 0 {pod_mid_x} {pod_mid_y}",    # concave, curving up
        f"A {pFil} {pFil} 0 0 1 {pL} {pT}",                  # convex, back to flat
        f"L {R - pRad} {pT}",
        f"A {pRad} {pRad} 0 0 1 {R} {pT + pRad}",            # pod top-right
        f"L {R} {B - r}",
        f"A {r} {r} 0 0 1 {R - r} {B}",                      # bottom-right
        f"L {L + r} {B}",
        f"A {r} {r} 0 0 1 {L} {B - r}",                      # bottom-left
        f"L {L} {eT + eRad}",
        f"A {eRad} {eRad} 0 0 1 {L + eRad} {eT}",            # ear top-left
        "Z",
    ])


def rim_segments():
    """Stroke pieces of the silhouette, each with its own measured colour.

    A single vertical gradient cannot express the real rim: the title-ear corner
    and the pod-rise S-curve are hot spots, the pod top is dimmer than the main
    top, the sides stay fairly bright (they are not the 'mid' of a y-gradient),
    and the whole bottom edge is near-white.  Each segment is a sub-path of
    shell_path() so the geometry cannot drift.
    """
    s = SHELL
    L, R, T, B, r = s["left"], s["right"], s["top"], s["bottom"], s["r"]
    ear, pod = s["ear"], s["pod"]
    eT, eR, eRad, eFil, eEnd = ear["top"], ear["right"], ear["r_tl"], ear["fillet"], ear["flat_end"]
    pL, pT, pRad, pFil, pStart = pod["left"], pod["top"], pod["r_tr"], pod["fillet"], pod["flat_start"]
    ear_mid_x, ear_mid_y = (eR + eEnd) / 2, (eT + T) / 2
    pod_mid_x, pod_mid_y = (pStart + pL) / 2, (T + pT) / 2

    return [
        {
            "id": "tl-ear",
            "d": f"M {L} {eT + eRad} A {eRad} {eRad} 0 0 1 {L + eRad} {eT} L {eR} {eT}",
            "color": "rgb(236,226,240)", "opacity": 0.96, "width": 2.15,
        },
        {
            "id": "main-top",
            "d": (f"M {eR} {eT} "
                  f"A {eFil} {eFil} 0 0 1 {ear_mid_x} {ear_mid_y} "
                  f"A {eFil} {eFil} 0 0 0 {eEnd} {T} "
                  f"L {pStart} {T}"),
            "color": "rgb(208,204,228)", "opacity": 0.90, "width": 2.0,
        },
        {
            "id": "pod-rise",
            "d": (f"M {pStart} {T} "
                  f"A {pFil} {pFil} 0 0 0 {pod_mid_x} {pod_mid_y} "
                  f"A {pFil} {pFil} 0 0 1 {pL} {pT}"),
            "color": "rgb(252,244,248)", "opacity": 1.0, "width": 2.35,
        },
        {
            "id": "pod-top",
            "d": f"M {pL} {pT} L {R - pRad} {pT}",
            "color": "rgb(198,176,184)", "opacity": 0.78, "width": 1.85,
        },
        {
            "id": "right",
            "d": f"M {R - pRad} {pT} A {pRad} {pRad} 0 0 1 {R} {pT + pRad} L {R} {B - r}",
            "color": "url(#rimRightGrad)", "opacity": 0.92, "width": 2.0,
        },
        {
            "id": "bottom",
            "d": f"M {R} {B - r} A {r} {r} 0 0 1 {R - r} {B} L {L + r} {B} A {r} {r} 0 0 1 {L} {B - r}",
            "color": "rgb(255,248,250)", "opacity": 1.0, "width": 2.25,
        },
        {
            "id": "left",
            "d": f"M {L} {B - r} L {L} {eT + eRad}",
            "color": "url(#rimLeftGrad)", "opacity": 0.90, "width": 2.0,
        },
    ]


def pod_floor_path():
    """Internal crease under the tool pod.  Ridge-traced at y 440 from the
    S-fillet (x 1336) to the pod's bottom-right quarter-circle, which meets the
    shell's right edge at the same radius as the top-right corner."""
    s = SHELL
    y = 440
    r = s["pod"]["r_tr"]
    x0 = s["pod"]["flat_start"] + 3
    x1 = s["right"] - r
    return f"M {x0} {y} L {x1} {y} A {r} {r} 0 0 1 {s['right']} {y - r}"


def status_pane_path():
    """Internal Status border: departs from the shell top, drops, returns to bottom."""
    s, p = SHELL, STATUS_PANE
    r = p["r"]
    return (f"M {p['right'] - r} {s['top']} "
            f"A {r} {r} 0 0 1 {p['right']} {s['top'] + r} "
            f"L {p['right']} {p['bottom'] - r} "
            f"A {r} {r} 0 0 1 {p['right'] - r} {p['bottom']}")


def convex_arcs():
    """The few silhouette arcs that read as a polished convex lens.

    A convex surface catches a highlight and a short milky fog just inside it --
    like a lightly ground convex mirror -- and nowhere else.  The open body of
    the glass stays clear; spreading haze along every border is what turned the
    panel into a frosted slab.
    """
    s = SHELL
    L, R, T, B, r = s["left"], s["right"], s["top"], s["bottom"], s["r"]
    ear, pod = s["ear"], s["pod"]
    eT, eR, eRad, eFil = ear["top"], ear["right"], ear["r_tl"], ear["fillet"]
    pL, pT, pRad, pFil, pStart = pod["left"], pod["top"], pod["r_tr"], pod["fillet"], pod["flat_start"]
    ear_mid_x, ear_mid_y = (eR + ear["flat_end"]) / 2, (eT + T) / 2
    pod_mid_x, pod_mid_y = (pStart + pL) / 2, (T + pT) / 2
    return [
        {
            "id": "ear-corner",
            "d": f"M {L} {eT + eRad} A {eRad} {eRad} 0 0 1 {L + eRad} {eT}",
            "color": "rgb(220, 228, 255)", "width": 14, "opacity": 0.10,
        },
        {
            "id": "ear-fillet",
            "d": f"M {eR} {eT} A {eFil} {eFil} 0 0 1 {ear_mid_x} {ear_mid_y}",
            "color": "rgb(210, 220, 255)", "width": 18, "opacity": 0.12,
        },
        {
            "id": "pod-fillet",
            "d": f"M {pod_mid_x} {pod_mid_y} A {pFil} {pFil} 0 0 1 {pL} {pT}",
            "color": "rgb(255, 232, 242)", "width": 20, "opacity": 0.14,
        },
        {
            "id": "pod-corner",
            "d": f"M {R - pRad} {pT} A {pRad} {pRad} 0 0 1 {R} {pT + pRad}",
            "color": "rgb(255, 236, 220)", "width": 14, "opacity": 0.08,
        },
    ]


def card_boxes():
    c = CARDS
    return [(c["first_left"] + i * c["pitch"], c["top"], c["width"], c["height"]) for i in range(4)]


if __name__ == "__main__":
    print("shell:", shell_path())
    print("\nstatus:", status_pane_path())
    print("\ncards:", card_boxes())
