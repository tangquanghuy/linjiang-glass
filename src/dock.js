import geo from './geometry.json';

/* The upper panel's glass.
   ------------------------------------------------------------------
   Same material as the shell, same construction: a measured silhouette in
   geometry.json, a clip path, the blur/scatter/tint/frost stack, additive edge
   light, and a rim painted per segment rather than as one even outline.

   What differs is which side is lit.  The shell's hot face is its bottom, where
   the desk bounces light up into it.  The dock hangs above the shell, so its hot
   face is its *bottom* too -- but for a different reason: the shell's own top rim
   is the brightest line in the scene, and it sits 13px away.  So the dock's
   underside rims are near-white, its top rim is the dimmest, and the two mating
   faces glow into the seam from both sides.  That is what sells the joint. */

const d = geo.dock;

export function buildDockDefs(svg) {
  svg.insertAdjacentHTML('beforeend', `
<defs>
  <clipPath id="dockClip" clipPathUnits="userSpaceOnUse">
    <path d="${d.path}"/>
  </clipPath>

  <!-- Side rims dim at the top of the panel and brighten toward the seam, the
       mirror of the shell's sides brightening toward the desk.  Left keeps the
       shell's cool pearl, right its dusty warm -- so at the seam each dock edge
       hands off to the shell edge directly below it in the same hue. -->
  <linearGradient id="dockRimLeftGrad" gradientUnits="userSpaceOnUse"
    x1="${d.left}" y1="${d.earTop + 29}" x2="${d.left}" y2="${d.levels.ear - 16}">
    <stop offset="0"   stop-color="rgb(194,198,222)" stop-opacity=".76"/>
    <stop offset=".42" stop-color="rgb(208,204,226)" stop-opacity=".84"/>
    <stop offset=".80" stop-color="rgb(234,224,236)" stop-opacity=".92"/>
    <stop offset="1"   stop-color="rgb(250,242,248)" stop-opacity=".98"/>
  </linearGradient>
  <linearGradient id="dockRimRightGrad" gradientUnits="userSpaceOnUse"
    x1="${d.right}" y1="${d.top + 30}" x2="${d.right}" y2="${d.levels.pod - 16}">
    <stop offset="0"   stop-color="rgb(184,170,178)" stop-opacity=".78"/>
    <stop offset=".34" stop-color="rgb(204,184,184)" stop-opacity=".85"/>
    <stop offset=".70" stop-color="rgb(230,204,198)" stop-opacity=".91"/>
    <stop offset="1"   stop-color="rgb(250,232,226)" stop-opacity=".97"/>
  </linearGradient>

  <!-- Inner glow: cool and shallow off the top edge, warm and deep off the
       underside.  Anchored to the panel, not the canvas -- the bug that made the
       shell's first bloom never reach the glass. -->
  <linearGradient id="dockGlowGrad" gradientUnits="userSpaceOnUse"
    x1="0" y1="${d.earTop}" x2="0" y2="${d.levels.main}">
    <stop offset="0"   stop-color="rgb(224,230,255)" stop-opacity=".30"/>
    <stop offset=".22" stop-color="rgb(210,218,250)" stop-opacity=".14"/>
    <stop offset=".52" stop-color="rgb(198,204,240)" stop-opacity=".07"/>
    <stop offset=".82" stop-color="rgb(255,226,226)" stop-opacity=".20"/>
    <stop offset="1"   stop-color="rgb(255,232,232)" stop-opacity=".40"/>
  </linearGradient>

  <filter id="dockSeamBloom" x="-6%" y="-140%" width="112%" height="380%">
    <feGaussianBlur stdDeviation="26"/>
  </filter>
  <filter id="dockSeamCore" x="-6%" y="-140%" width="112%" height="380%">
    <feGaussianBlur stdDeviation="7"/>
  </filter>
</defs>`);
}

function strokes(list, over = {}) {
  return list.map((s) => {
    const width = over.width ?? s.width;
    const opacity = over.opacity ?? s.opacity;
    const color = over.color ?? s.color;
    const filter = over.filter ? ` filter="${over.filter}"` : '';
    return `<path d="${s.d}" fill="none" stroke="${color}" stroke-width="${width}" ` +
      `stroke-opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"${filter}/>`;
  }).join('\n');
}

const byId = (ids) => d.rimSegments.filter((s) => ids.includes(s.id));
const notIn = (ids) => d.rimSegments.filter((s) => !ids.includes(s.id));

/* Light climbing up into the underside from the seam.  This has to follow the
   notched bottom edge, so it is a very wide blurred stroke along that path
   rather than a linear-gradient in y -- the bottom sits at three different
   heights and a flat gradient would miss two of them. */
export function buildDockUnderglow(svg) {
  const { w, h } = geo.canvas;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = `
<g clip-path="url(#dockClip)">
  <path d="${d.bottomPath}" fill="none" stroke="rgb(255,206,196)" stroke-width="112"
        stroke-opacity=".13" stroke-linecap="round" filter="url(#dockSeamBloom)"/>
  <path d="${d.bottomPath}" fill="none" stroke="rgb(255,222,214)" stroke-width="34"
        stroke-opacity=".17" stroke-linecap="round" filter="url(#dockSeamCore)"/>
  <path d="${d.topPath}" fill="none" stroke="rgb(216,226,255)" stroke-width="46"
        stroke-opacity=".07" stroke-linecap="round" filter="url(#dockSeamBloom)"/>
</g>`;
}

/* Convex-lens fog on the raised arcs, including the two tenon fillets that mate
   with the shell's -- so the joint scatters on both sides of the seam. */
export function buildDockLens(svg) {
  const { w, h } = geo.canvas;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const fog = d.convexArcs.map((s) =>
    `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${s.width}" ` +
    `stroke-opacity="${s.opacity}" stroke-linecap="round" filter="url(#lensFog)"/>`
  ).join('\n');
  const core = d.convexArcs.map((s) =>
    `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${Math.max(6, s.width * 0.3)}" ` +
    `stroke-opacity="${Math.min(0.5, s.opacity * 1.7)}" stroke-linecap="round" filter="url(#lensCore)"/>`
  ).join('\n');
  svg.innerHTML = `<g clip-path="url(#dockClip)">${fog}\n${core}</g>`;
}

/* Rim stack, bottom to top -- the shell's order, mirrored top for bottom:
     1. inner glow clipped inside, along the whole outline
     2. thin dark hairline (glass thickness) on the unlit faces only
     3. soft inward bloom on the two tenon fillets
     4. the crisp segmented highlight
   The hairline is kept off the underside for the same reason it is kept off the
   shell's bottom: there the body ramps continuously into the rim, and a dark line
   is exactly what turns a rim into a bar pasted on top. */
export function buildDockRim(svg) {
  const { w, h } = geo.canvas;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const hot = byId(d.hotSegments);
  const unlit = notIn(d.litSegments);

  svg.innerHTML = `
<g clip-path="url(#dockClip)">
  ${strokes(d.rimSegments, { color: 'url(#dockGlowGrad)', width: 10, opacity: 1, filter: 'url(#glowBlur)' })}
  ${strokes(unlit, { color: 'rgba(10,14,34,.26)', width: 6, opacity: 1, filter: 'url(#hairBlur)' })}
  ${strokes(hot, { width: 7, opacity: 0.26, filter: 'url(#hotBloom)' })}
  ${strokes(byId(d.litSegments), { width: 5, opacity: 0.16, filter: 'url(#rimBloom)' })}
</g>
<!-- The crisp line sits outside the clip: centred on the silhouette, half of a
     clipped stroke is eaten by the clip's own antialiasing. -->
${strokes(d.rimSegments)}
<!-- Outward bloom on the underside only, so the seam reads as a lit gap between
     two pieces rather than an outline drawn around each. -->
<path d="${d.bottomPath}" fill="none" stroke="rgb(255,238,232)" stroke-width="7"
      stroke-opacity=".30" stroke-linecap="round" filter="url(#rimBloom)"/>`;
}

export { d as dockGeo };
