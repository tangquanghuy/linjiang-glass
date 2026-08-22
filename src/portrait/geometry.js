/* Portrait geometry.
   ------------------------------------------------------------------
   The landscape canvas is a pixel reproduction of a measured prototype, so its
   geometry is baked into geometry.json.  The portrait layout has exactly one fixed
   dimension -- the width.  Height is whatever the content needs, and it changes at
   runtime when the character preview expands downward.  A silhouette whose bottom
   edge is only known after layout cannot be baked, so the portrait shape is
   generated here from the same construction rules the landscape shell is built
   from:

     - a raised title ear on the top-left, joined to the main body by an S-fillet
       (a convex arc tangent to a concave arc), which border-radius cannot express
     - each panel's bottom edge carries the matching notch for the ear of the panel
       below it, offset outward by one seam width, so the gap between two panels is
       the same width all the way across.  Offset rule, as documented for the
       landscape dock: convex arcs grow by the gap, concave arcs shrink by it,
       centres unchanged.
     - the rim is painted as separate segments each carrying its own measured
       colour, not as one gradient along the outline

   Everything here is in portrait canvas units: the whole canvas is scaled by one
   factor k = containerWidth / PW, so one unit is one pixel of the portrait
   reference at container width 941.

   Scale note: the portrait reference draws type ~1.55x larger relative to its
   canvas than the landscape reference does relative to its own, because the same
   physical screen carries it at k ~ 0.41 instead of k ~ 1.  Rim widths, blur radii
   and frost grain carry the same RIM_K factor -- they are optical properties of the
   glass, so they scale with the drawing, not with the canvas. */

/** Design canvas width.  The layout is authored against this. */
export const PW = 941;

/* k has a floor, and the canvas width is what enforces it.
   ------------------------------------------------------------------
   Everything is scaled by k = containerWidth / canvasWidth, so the real size of the
   smallest type is 36 * k.  With the canvas pinned at 941 that lands at 13.8 real px
   on a 360px Android but only 12.2 on a 320px phone, below the 13px floor -- and a
   bigger number cannot fix it, because a narrower container always drags k back
   down.  So below the floor the canvas *narrows* instead: the same content reflows
   into fewer units, and k stops falling.

   Not symmetrical with a ceiling: a container wider than the design canvas is
   handled by capping k and centring the column, which is a stage concern, not a
   geometry one -- the canvas is still 941 units wide there. */
export const K_FLOOR = 13 / 36;

/** Canvas width for a given container width, never wider than the design canvas. */
export const canvasWidth = (containerWidth) =>
  Math.min(PW, Math.round(containerWidth / K_FLOOR));

/* Panel body.  `right` follows the canvas width so the two side margins stay equal
   at any width; everything else is an absolute unit and does not move. */
export const PANEL = { left: 33, right: PW - 33, r: 38 };

/** Panel edges for a canvas of `pw` units. */
export const panelEdges = (pw = PW) => ({ left: PANEL.left, right: pw - PANEL.left, r: PANEL.r });

/* Raised title tab on the top-left of every panel.  Width is set by the longest
   script title ("Profile") at the portrait script size, and it has to leave the
   Status panel's top edge a flat run between its own fillet and the pod's:
   ear ends at 33 + 280 + 91 = 404, the pod's fillet starts at 461, so 57 units. */
export const EAR = { width: 280, r: 34, drop: 44, fillet: 58 };

/** Raised tool tab on the top-right -- only the Status panel carries one. */
export const POD = { width: 356, r: 46 };

/* Tool ring buttons inside the pod.  Four 76-unit rings (plus 12 gaps) fill the
   356-unit pod the way three 96-unit rings used to, leaving the same ~16 units of
   side slack so the outer two sit inside the pod's corner radius.  76 units is
   31.5 real px at a 390px-wide container; the hit area is still widened to 44 by
   a pseudo-element rather than by growing the ring.

   `count` is a ceiling and not a knob.  Five rings need 428 units, and the pod has
   only 57 units of flat top edge to grow into before its fillet meets the title
   ear's -- so the fifth does not fit even after spending all of it.  Shrinking the
   ring to make five fit is worse than tight: the 44px hit areas already overlap at
   this pitch (3.8 real px at a 430-wide container, 12.2 at 320), and a 58-unit ring
   would put that overlap past half the button.  So the pod holds only the four rings the
   player presses without reading them, and every other destination is an entry in
   `destinations` (src/data.js), drawn as a labelled cell in the panel body -- see
   portraitDestGrid in portrait/content.js.  New destinations go there, not here. */
export const TOOL = { d: 76, gap: 12, count: 4 };

/** One seam width, used for every gap between stacked panels. */
export const SEAM = 26;

/** Portrait draws at 1.55x the landscape scale; optical widths follow. */
export const RIM_K = 1.55;

/* Cards in the Girls rail.
   The landscape card is landscape-proportioned (260x234, art left, text in a glass
   pane on the right) because it lives in a 1131-wide rail.  Reusing that proportion
   here cost 596 units of width to show 1.28 cards, and left a 296-wide text column
   holding 32-unit type -- sparse and awkward.  The portrait card rotates the same
   idea instead: art on top, a vertical fade, the text pane along the bottom.  At
   330 the rail shows ~2.3 cards, so it reads as a rail rather than a single slide. */
export const CARD = { w: 330, h: 574, gap: 24, r: 30 };

/**
 * Horizontal run of an S-fillet, and the point where its two arcs meet.
 *
 * For the arcs to be tangent to each other and to both horizontals the centres
 * must be exactly r1 + r2 apart, which forces
 *     dx^2 = drop * (2 * (r1 + r2) - drop)
 * Because (F + g) + (F - g) = 2F, dx does not depend on the gap -- which is why a
 * notch spans exactly the same x range as the ear it mates with, and therefore why
 * the seam keeps one width.  For equal radii the join is simply the midpoint in
 * both axes (the landscape pod rise: 1381.5, 380.5).  Checked against the shell ear
 * and the dock notch by tools/check_offset_rule.py.
 */
export function sFillet(drop, r1, r2) {
  const s = r1 + r2;
  const dx = Math.sqrt(drop * (2 * s - drop));
  const t = r1 / s;
  return { dx, jx: t * dx, jy: r1 - t * (r1 + r2 - drop) };
}

const EAR_F = sFillet(EAR.drop, EAR.fillet, EAR.fillet);
/** Horizontal run of a panel's own ear fillet -- gap-independent, so shared. */
export const FILLET_RUN = EAR_F.dx;

/* Key x-coordinates of a panel's top edge, shared by the path, the rim and the
   notch above it, so none of the three can drift.  The ear is anchored to the left
   edge and so is width-independent; the pod hangs off the right edge. */
function topEdge(pod, pw = PW) {
  const L = PANEL.left;
  const earRight = L + EAR.width;
  const earEnd = earRight + FILLET_RUN;
  if (!pod) return { earRight, earEnd, podStart: null, podLeft: null };
  const podLeft = pw - L - POD.width;
  return { earRight, earEnd, podStart: podLeft - FILLET_RUN, podLeft };
}

/** Left edge of the tool pod's button row, for the stylesheet. */
export const podRowLeft = (pw = PW) =>
  pw - PANEL.left - POD.width
  + (POD.width - (TOOL.count * TOOL.d + (TOOL.count - 1) * TOOL.gap)) / 2;

/* A panel's own ear fillet: steps down from the ear top to the main top.
   Equal radii, so the join is the midpoint. */
const earFall = (earRight, eT) =>
  `A ${EAR.fillet} ${EAR.fillet} 0 0 1 ${earRight + FILLET_RUN / 2} ${eT + EAR.drop / 2} ` +
  `A ${EAR.fillet} ${EAR.fillet} 0 0 0 ${earRight + FILLET_RUN} ${eT + EAR.drop}`;

/* The pod fillet: the same shape rotated 180 degrees -- steps up from the main
   top to the pod top. */
const podRise = (podStart, mT) =>
  `A ${EAR.fillet} ${EAR.fillet} 0 0 0 ${podStart + FILLET_RUN / 2} ${mT - EAR.drop / 2} ` +
  `A ${EAR.fillet} ${EAR.fillet} 0 0 1 ${podStart + FILLET_RUN} ${mT - EAR.drop}`;

/* The notch in a panel's bottom edge, traversed right to left because the path
   runs clockwise.  Reversing an arc flips its sweep flag, so the notch's arcs come
   in the opposite order and with opposite sweeps to the ear they mirror.  Radii
   follow the offset rule: the convex arc grows by the seam, the concave one shrinks
   by it, and the two bottom-left corners facing across the seam differ by it too. */
function notchRTL(nextEar) {
  const bottomEar = nextEar - SEAM;
  /* The notch mirrors the ear below, which is anchored to the left edge, so it does
     not depend on the canvas width. */
  const { earRight, earEnd } = topEdge(false);
  const rIn = EAR.fillet + SEAM;
  const rOut = EAR.fillet - SEAM;
  const { jx, jy } = sFillet(EAR.drop, rIn, rOut);
  const rBL = EAR.r - SEAM;
  return {
    bottomEar,
    rBL,
    d: [
      `L ${earEnd} ${bottomEar + EAR.drop}`,
      `A ${rOut} ${rOut} 0 0 1 ${earRight + jx} ${bottomEar + jy}`,
      `A ${rIn} ${rIn} 0 0 0 ${earRight} ${bottomEar}`,
      `L ${PANEL.left + rBL} ${bottomEar}`,
      `A ${rBL} ${rBL} 0 0 1 ${PANEL.left} ${bottomEar - rBL}`,
    ].join(' '),
  };
}

/* The bottom edge right to left, flat or notched.  `bottom` is the main bottom
   level; with a notch the level under the ear rises to nextEar - SEAM, and the main
   level must equal that plus the drop so the seam stays uniform. */
function bottomEdgeRTL(bottom, nextEar, pw = PW) {
  const { left: L, right: R, r } = panelEdges(pw);
  if (nextEar == null) {
    return `A ${r} ${r} 0 0 1 ${R - r} ${bottom} L ${L + r} ${bottom} A ${r} ${r} 0 0 1 ${L} ${bottom - r}`;
  }
  return `A ${r} ${r} 0 0 1 ${R - r} ${bottom} ${notchRTL(nextEar).d}`;
}

/** Where a notched panel's bottom must sit so the seam is one width. */
export const notchedBottom = (nextEar) => nextEar - SEAM + EAR.drop;

/** Where a notched panel's left rim has to stop. */
const leftRimStop = (bottom, nextEar) =>
  nextEar == null ? bottom - PANEL.r : nextEar - SEAM - (EAR.r - SEAM);

/**
 * Outer silhouette of one panel.
 * `earTop` is the highest point (the raised tab); the main body top sits EAR.drop
 * below it.  `bottom` is the main bottom level, from measured content height.
 * `nextEar` is the ear top of the panel below, or null for the last panel.
 */
export function panelPath({ earTop: eT, bottom, pod = false, nextEar = null, pw = PW }) {
  const { left: L, right: R, r } = panelEdges(pw);
  const mT = eT + EAR.drop;
  const { earRight, earEnd, podStart, podLeft } = topEdge(pod, pw);

  const head = pod
    ? `L ${podStart} ${mT} ${podRise(podStart, mT)} L ${R - POD.r} ${eT} ` +
      `A ${POD.r} ${POD.r} 0 0 1 ${R} ${eT + POD.r}`
    : `L ${R - r} ${mT} A ${r} ${r} 0 0 1 ${R} ${mT + r}`;

  return [
    `M ${L + EAR.r} ${eT}`,
    `L ${earRight} ${eT}`,
    earFall(earRight, eT),
    head,
    `L ${R} ${bottom - r}`,
    bottomEdgeRTL(bottom, nextEar, pw),
    `L ${L} ${eT + EAR.r}`,
    `A ${EAR.r} ${EAR.r} 0 0 1 ${L + EAR.r} ${eT}`,
    'Z',
  ].join(' ');
}

/* Rim segments.  Colours are the landscape shell's measured per-edge values --
   sampled per edge and per axis, not per composition, so a portrait panel's top
   edge is the same light as a landscape top edge.  Widths carry RIM_K.  The side
   rims use objectBoundingBox gradients so one definition serves any panel height. */
const w = (n) => +(n * RIM_K).toFixed(2);

export function panelRim({ earTop: eT, bottom, pod = false, nextEar = null, pw = PW }) {
  const { left: L, right: R, r } = panelEdges(pw);
  const mT = eT + EAR.drop;
  const { earRight, earEnd, podStart, podLeft } = topEdge(pod, pw);

  const segs = [
    {
      id: 'ear-top',
      d: `M ${L} ${eT + EAR.r} A ${EAR.r} ${EAR.r} 0 0 1 ${L + EAR.r} ${eT} L ${earRight} ${eT}`,
      color: 'rgb(236,226,240)', opacity: 0.96, width: w(2.15),
    },
    {
      id: 'ear-fall',
      d: `M ${earRight} ${eT} ${earFall(earRight, eT)}`,
      color: 'rgb(250,242,248)', opacity: 1.0, width: w(2.3),
    },
    {
      id: 'main-top',
      d: `M ${earEnd} ${mT} L ${pod ? podStart : R - r} ${mT}`,
      color: 'rgb(208,204,228)', opacity: 0.90, width: w(2.0),
    },
  ];

  if (pod) {
    segs.push({
      id: 'pod-rise',
      d: `M ${podStart} ${mT} ${podRise(podStart, mT)}`,
      color: 'rgb(252,244,248)', opacity: 1.0, width: w(2.35),
    }, {
      id: 'pod-top',
      d: `M ${podLeft} ${eT} L ${R - POD.r} ${eT}`,
      color: 'rgb(198,176,184)', opacity: 0.78, width: w(1.85),
    }, {
      id: 'right',
      d: `M ${R - POD.r} ${eT} A ${POD.r} ${POD.r} 0 0 1 ${R} ${eT + POD.r} L ${R} ${bottom - r}`,
      color: 'url(#pRimRight)', opacity: 0.92, width: w(2.0),
    });
  } else {
    segs.push({
      id: 'right',
      d: `M ${R - r} ${mT} A ${r} ${r} 0 0 1 ${R} ${mT + r} L ${R} ${bottom - r}`,
      color: 'url(#pRimRight)', opacity: 0.92, width: w(2.0),
    });
  }

  /* Every bottom edge of the landscape shell is near-white; the notch rides along
     on the same stroke so the seam reads as one continuous edge. */
  segs.push({
    id: 'bottom',
    d: `M ${R} ${bottom - r} ${bottomEdgeRTL(bottom, nextEar, pw)}`,
    color: 'rgb(255,248,250)', opacity: 1.0, width: w(2.25),
  }, {
    id: 'left',
    d: `M ${L} ${leftRimStop(bottom, nextEar)} L ${L} ${eT + EAR.r}`,
    color: 'url(#pRimLeft)', opacity: 0.90, width: w(2.0),
  });
  return segs;
}

/* The arcs that read as a polished convex lens: the ear's own corner, the convex
   halves of the S-fillets, and the pod corner.  Same restraint as landscape --
   the open body stays clear, only convex surfaces scatter. */
export function panelConvexArcs({ earTop: eT, pod = false, pw = PW }) {
  const { left: L, right: R } = panelEdges(pw);
  const F = EAR.fillet;
  const { earRight, podStart, podLeft } = topEdge(pod, pw);

  const arcs = [
    {
      id: 'ear-corner',
      d: `M ${L} ${eT + EAR.r} A ${EAR.r} ${EAR.r} 0 0 1 ${L + EAR.r} ${eT}`,
      color: 'rgb(220, 228, 255)', width: w(14), opacity: 0.10,
    },
    {
      id: 'ear-fillet',
      d: `M ${earRight} ${eT} A ${F} ${F} 0 0 1 ${earRight + FILLET_RUN / 2} ${eT + EAR.drop / 2}`,
      color: 'rgb(210, 220, 255)', width: w(18), opacity: 0.12,
    },
  ];
  if (pod) {
    arcs.push({
      id: 'pod-fillet',
      d: `M ${podStart + FILLET_RUN / 2} ${eT + EAR.drop / 2} A ${F} ${F} 0 0 1 ${podLeft} ${eT}`,
      color: 'rgb(255, 232, 242)', width: w(20), opacity: 0.14,
    }, {
      id: 'pod-corner',
      d: `M ${R - POD.r} ${eT} A ${POD.r} ${POD.r} 0 0 1 ${R} ${eT + POD.r}`,
      color: 'rgb(255, 236, 220)', width: w(14), opacity: 0.08,
    });
  }
  return arcs;
}
