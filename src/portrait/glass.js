/* Portrait glass: shape definitions and the rim stack, per panel.
   ------------------------------------------------------------------
   The landscape builders in src/glass.js cannot be reused: they are written
   against one fused silhouette on a canvas of known size, and several of their
   gradients are userSpaceOnUse with the shell's own y-coordinates baked in.  The
   portrait layout has three independent panels whose bottom edges are only known
   after layout, so every definition here is either objectBoundingBox (so one
   gradient serves any panel height) or regenerated when heights change.

   The material itself is unchanged -- same measured per-edge rim colours, same
   inner glow, same hairline-inside-the-rim, same convex-lens fog.  Only the shape
   they are painted onto is different. */

import { RIM_K, panelConvexArcs, panelEdges, panelRim } from './geometry.js';

const sd = (n) => +(n * RIM_K).toFixed(2);

/**
 * Shared gradients and filters, plus one clip path per panel.
 * @param {SVGElement} svg   the defs host
 * @param {Array} panels     [{ id, earTop, bottom, pod, path }]
 * @param {number} height    current canvas height
 */
export function buildPortraitDefs(svg, panels, height, pw) {
  svg.setAttribute('viewBox', `0 0 ${pw} ${height}`);
  svg.innerHTML = `
<defs>
  ${panels.map((p) => `
  <clipPath id="pClip-${p.id}" clipPathUnits="userSpaceOnUse">
    <path d="${p.path}"/>
  </clipPath>`).join('')}

  <!-- Side rims brighten downward, the same way the landscape shell's do.
       objectBoundingBox so one definition covers every panel height. -->
  <linearGradient id="pRimLeft" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0"   stop-color="rgb(200,204,228)" stop-opacity=".80"/>
    <stop offset=".40" stop-color="rgb(210,200,220)" stop-opacity=".88"/>
    <stop offset=".78" stop-color="rgb(240,226,230)" stop-opacity=".96"/>
    <stop offset="1"   stop-color="rgb(255,250,246)" stop-opacity="1"/>
  </linearGradient>
  <linearGradient id="pRimRight" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0"   stop-color="rgb(190,166,155)" stop-opacity=".84"/>
    <stop offset=".22" stop-color="rgb(232,199,183)" stop-opacity=".92"/>
    <stop offset=".55" stop-color="rgb(240,214,212)" stop-opacity=".95"/>
    <stop offset=".82" stop-color="rgb(254,242,238)" stop-opacity="1"/>
    <stop offset="1"   stop-color="rgb(255,248,246)" stop-opacity="1"/>
  </linearGradient>

  <!-- Shallow inner glow: cool at the top edge, warming into the underside the
       way desk light does in the landscape scene. -->
  <linearGradient id="pInnerGlow" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0"   stop-color="rgb(228,234,255)" stop-opacity=".28"/>
    <stop offset=".18" stop-color="rgb(212,222,252)" stop-opacity=".15"/>
    <stop offset=".55" stop-color="rgb(198,204,240)" stop-opacity=".07"/>
    <stop offset=".85" stop-color="rgb(255,228,214)" stop-opacity=".20"/>
    <stop offset="1"   stop-color="rgb(255,236,228)" stop-opacity=".40"/>
  </linearGradient>

  <filter id="pGlowBlur" x="-12%" y="-30%" width="124%" height="160%">
    <feGaussianBlur stdDeviation="${sd(2.4)}"/>
  </filter>
  <filter id="pHairBlur" x="-12%" y="-30%" width="124%" height="160%">
    <feGaussianBlur stdDeviation="${sd(1.0)}"/>
  </filter>
  <filter id="pRimBloom" x="-12%" y="-30%" width="124%" height="160%">
    <feGaussianBlur stdDeviation="${sd(3.2)}"/>
  </filter>
  <filter id="pHotBloom" x="-20%" y="-40%" width="140%" height="180%">
    <feGaussianBlur stdDeviation="${sd(5.5)}"/>
  </filter>
  <filter id="pCornerBloom" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur stdDeviation="${sd(8.5)}"/>
  </filter>
  <filter id="pLensFog" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur stdDeviation="${sd(5.5)}"/>
  </filter>
  <filter id="pLensCore" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="${sd(2.0)}"/>
  </filter>
</defs>`;
}

const stroke = (s, over = {}) => {
  const width = over.width ?? s.width;
  const opacity = over.opacity ?? s.opacity;
  const colour = over.color ?? s.color;
  const filter = over.filter ? ` filter="${over.filter}"` : '';
  return `<path d="${s.d}" fill="none" stroke="${colour}" stroke-width="${width}" ` +
    `stroke-opacity="${opacity}" stroke-linecap="${over.cap || 'round'}" stroke-linejoin="round"${filter}/>`;
};

/* Rim stack per panel, painted bottom to top:
     1. shallow inner glow, clipped inside the silhouette
     2. a thin dark hairline just inside the rim -- the glass's own thickness
     3. soft inward bloom on the two S-fillets only (the hot segments)
     4. the crisp segmented highlight
     5. inward and outward bloom on the two bottom corners
   The straight left/right/bottom rims are painted outside the clip: centred on
   the silhouette, half of a clipped stroke is eaten by the clip's antialiasing. */
export function paintPortraitRim(svg, panels, height, pw) {
  svg.setAttribute('viewBox', `0 0 ${pw} ${height}`);
  svg.innerHTML = panels.map((p) => {
    const segs = panelRim(p);
    const by = (id) => segs.find((s) => s.id === id);
    const hot = segs.filter((s) => s.id === 'ear-fall' || s.id === 'pod-rise');
    const inner = segs.filter((s) => s.id !== 'ear-top');
    const hair = segs.filter((s) => !['left', 'right', 'bottom', 'ear-top', 'pod-top'].includes(s.id));
    const crisp = segs.filter((s) => !['left', 'right', 'bottom'].includes(s.id));
    const { left: L, right: R, r } = panelEdges(p.pw);
    const B = p.bottom;
    /* The bottom-right is always a real body corner.  The bottom-LEFT only is when
       the panel has no notch: a notched panel's bottom edge steps up under the next
       panel's ear and finishes on a tight EAR.r - SEAM seam corner, so painting an
       r-radius corner there draws an arc the silhouette does not have -- which is
       the hook that was crossing the ear below it. */
    const brArc = `M ${R} ${B - r} A ${r} ${r} 0 0 1 ${R - r} ${B}`;
    const blArc = p.nextEar == null
      ? `M ${L + r} ${B} A ${r} ${r} 0 0 1 ${L} ${B - r}`
      : null;
    const fog = panelConvexArcs(p);

    return `
<g clip-path="url(#pClip-${p.id})">
  ${inner.map((s) => stroke(s, {
      color: 'url(#pInnerGlow)', width: sd(10), opacity: 1, filter: 'url(#pGlowBlur)',
    })).join('\n  ')}
  ${hair.map((s) => stroke(s, {
      color: 'rgba(10,14,34,.28)', width: sd(6.5), opacity: 1, filter: 'url(#pHairBlur)',
    })).join('\n  ')}
  ${hot.map((s) => stroke(s, { width: sd(7), opacity: 0.28, filter: 'url(#pHotBloom)' })).join('\n  ')}
  ${crisp.map((s) => stroke(s, { width: sd(5), opacity: 0.18, filter: 'url(#pRimBloom)' })).join('\n  ')}
  ${blArc ? `<path d="${blArc}" fill="none" stroke="rgb(255,232,214)" stroke-width="${sd(28)}"
        stroke-opacity=".34" stroke-linecap="round" filter="url(#pCornerBloom)"/>` : ''}
  <path d="${brArc}" fill="none" stroke="rgb(255,226,200)" stroke-width="${sd(30)}"
        stroke-opacity=".36" stroke-linecap="round" filter="url(#pCornerBloom)"/>
  <!-- Convex-lens fog: only the raised tab's corner and the S-fillet convexes. -->
  ${fog.map((s) => stroke(s, { opacity: s.opacity, filter: 'url(#pLensFog)' })).join('\n  ')}
  ${fog.filter((s) => s.id !== 'ear-corner').map((s) => stroke(s, {
      width: Math.max(sd(6), s.width * 0.28),
      opacity: Math.min(0.55, s.opacity * 1.8),
      filter: 'url(#pLensCore)',
    })).join('\n  ')}
</g>
${crisp.map((s) => stroke(s)).join('\n')}
<path d="${by('left').d}" fill="none" stroke="url(#pRimLeft)" stroke-width="${sd(2.4)}"
      stroke-opacity=".95" stroke-linecap="butt"/>
<path d="${by('right').d}" fill="none" stroke="url(#pRimRight)" stroke-width="${sd(1.9)}"
      stroke-opacity=".95" stroke-linecap="butt"/>
<path d="${by('bottom').d}" fill="none" stroke="rgb(255,248,250)" stroke-width="${sd(1.9)}"
      stroke-opacity="1" stroke-linecap="butt"/>
${blArc ? `<path d="${blArc}" fill="none" stroke="rgb(255,248,240)" stroke-width="${sd(3.4)}"
      stroke-opacity=".95" stroke-linecap="round"/>` : ''}
<path d="${brArc}" fill="none" stroke="rgb(255,246,236)" stroke-width="${sd(3.2)}"
      stroke-opacity=".95" stroke-linecap="round"/>`;
  }).join('\n');
}
