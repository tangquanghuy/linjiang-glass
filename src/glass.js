import geo from './geometry.json';

/* Shape and paint definitions.  The silhouette path comes from geometry.json,
   which tools/export_assets.py generates from the same measurements the
   verification scripts use, so the shipped shape and the checked shape are one
   and the same. */
export function buildDefs(svg) {
  const { w, h } = geo.canvas;
  const { left: L, right: R, top: T, bottom: B } = geo.shell;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = `
<defs>
  <clipPath id="shellClip" clipPathUnits="userSpaceOnUse">
    <path d="${geo.shellPath}"/>
  </clipPath>
  <clipPath id="belowShell" clipPathUnits="userSpaceOnUse">
    <rect x="0" y="${B}" width="${w}" height="${h - B}"/>
  </clipPath>
  <!-- Side rims brighten toward the desk: measured left 170 at the ear, 246 at
       the bottom corner; right 189 at the pod, 249 at the bottom corner. -->
  <linearGradient id="rimLeftGrad" gradientUnits="userSpaceOnUse" x1="${L}" y1="${T}" x2="${L}" y2="${B}">
    <stop offset="0"   stop-color="rgb(200,204,228)" stop-opacity=".80"/>
    <stop offset=".40" stop-color="rgb(210,200,220)" stop-opacity=".88"/>
    <stop offset=".78" stop-color="rgb(240,226,230)" stop-opacity=".96"/>
    <stop offset="1"   stop-color="rgb(255,250,246)" stop-opacity="1"/>
  </linearGradient>
  <!-- Peak colour sampled every 12px down x=1648: dusty mauve where the pod meets
       the wall, warming and brightening as it drops toward the desk. -->
  <linearGradient id="rimRightGrad" gradientUnits="userSpaceOnUse" x1="${R}" y1="390" x2="${R}" y2="${B}">
    <stop offset="0"   stop-color="rgb(180,160,163)" stop-opacity=".82"/>
    <stop offset=".12" stop-color="rgb(190,166,155)" stop-opacity=".86"/>
    <stop offset=".21" stop-color="rgb(232,199,183)" stop-opacity=".92"/>
    <stop offset=".33" stop-color="rgb(243,212,205)" stop-opacity=".95"/>
    <stop offset=".58" stop-color="rgb(238,216,218)" stop-opacity=".95"/>
    <stop offset=".78" stop-color="rgb(254,242,238)" stop-opacity="1"/>
    <stop offset="1"   stop-color="rgb(255,248,246)" stop-opacity="1"/>
  </linearGradient>

  <linearGradient id="innerGlowGrad" gradientUnits="userSpaceOnUse" x1="0" y1="347" x2="0" y2="723">
    <stop offset="0"    stop-color="rgb(228,234,255)" stop-opacity=".28"/>
    <stop offset=".16"  stop-color="rgb(212,222,252)" stop-opacity=".16"/>
    <stop offset=".40"  stop-color="rgb(198,204,240)" stop-opacity=".08"/>
    <stop offset=".78"  stop-color="rgb(255,228,214)" stop-opacity=".22"/>
    <stop offset="1"    stop-color="rgb(255,236,228)" stop-opacity=".42"/>
  </linearGradient>

  <linearGradient id="podFloorGrad" gradientUnits="userSpaceOnUse" x1="1336" y1="440" x2="1648" y2="440">
    <stop offset="0"    stop-color="rgb(226,232,255)" stop-opacity="0"/>
    <stop offset=".08"  stop-color="rgb(226,232,255)" stop-opacity=".28"/>
    <stop offset=".7"   stop-color="rgb(226,232,255)" stop-opacity=".34"/>
    <stop offset="1"    stop-color="rgb(226,232,255)" stop-opacity=".18"/>
  </linearGradient>

  <filter id="glowBlur" x="-12%" y="-30%" width="124%" height="160%">
    <feGaussianBlur stdDeviation="2.4"/>
  </filter>
  <filter id="rimBloom" x="-12%" y="-30%" width="124%" height="160%">
    <feGaussianBlur stdDeviation="3.2"/>
  </filter>
  <filter id="hotBloom" x="-20%" y="-40%" width="140%" height="180%">
    <feGaussianBlur stdDeviation="5.5"/>
  </filter>
  <filter id="deskBloom" x="-10%" y="-10%" width="120%" height="500%">
    <feGaussianBlur stdDeviation="9"/>
  </filter>
  <filter id="cornerBloom" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur stdDeviation="8.5"/>
  </filter>
  <filter id="hairBlur" x="-12%" y="-30%" width="124%" height="160%">
    <feGaussianBlur stdDeviation="1.0"/>
  </filter>
  <!-- Wide, soft scatter sitting just inside a convex arc -- the milky fog of a
       lightly ground convex lens, not a surface texture. -->
  <filter id="lensFog" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur stdDeviation="5.5"/>
  </filter>
  <filter id="lensCore" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="2.0"/>
  </filter>
</defs>`;
}

function segmentStrokes(over = {}) {
  const skip = new Set(over.skip || []);
  return geo.rimSegments.filter((s) => !skip.has(s.id)).map((s) => {
    const width = over.width ?? s.width;
    const opacity = over.opacity ?? s.opacity;
    const filter = over.filter ? ` filter="${over.filter}"` : '';
    return (`<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${width}" ` +
      `stroke-opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"${filter}/>`);
  }).join('\n');
}

/* Rim stack, painted bottom to top:
     1. shallow inner glow, clipped inside
     2. thin dark hairline just inside the rim (glass thickness)
     3. soft inward bloom on the hot segments only
     4. the crisp segmented highlight
   Status pane border and the pod floor crease ride along at the end. */
export function buildRim(svg) {
  const { w, h } = geo.canvas;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const hot = geo.rimSegments.filter((s) => s.id === 'pod-rise');
  const hotStrokes = hot.map((s) =>
    `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="7" ` +
    `stroke-opacity=".28" stroke-linecap="round" filter="url(#hotBloom)"/>`
  ).join('\n');
  const leftSeg = geo.rimSegments.find((s) => s.id === 'left');
  const rightSeg = geo.rimSegments.find((s) => s.id === 'right');
  const bottomSeg = geo.rimSegments.find((s) => s.id === 'bottom');
  const { left: L, right: R, bottom: B, r: cr } = geo.shell;
  const blArc = `M ${L + cr} ${B} A ${cr} ${cr} 0 0 1 ${L} ${B - cr}`;
  const brArc = `M ${R} ${B - cr} A ${cr} ${cr} 0 0 1 ${R - cr} ${B}`;

  svg.innerHTML = `
<g clip-path="url(#shellClip)">
  <!-- Full-shell inner glow, but not on the title ear: a clipped stroke and
       the unclipped crisp rim sit 1px apart there and read as two outlines. -->
  ${geo.rimSegments.filter((s) => s.id !== 'tl-ear').map((s) =>
    `<path d="${s.d}" fill="none" stroke="url(#innerGlowGrad)" stroke-width="10" filter="url(#glowBlur)"/>`
  ).join('\n')}
  <!-- Thin dark line just inside the rim reads as the glass's own thickness.  The
       bottom is excluded: there the prototype ramps up continuously into the rim
       over 18px, and a dark line there is what turns the rim into a pasted-on bar.
       The title ear and pod top are also excluded: a second stroke there is the
       double outline on those two raised corners. -->
  ${geo.rimSegments.filter((s) => !['left', 'right', 'bottom', 'tl-ear', 'pod-top'].includes(s.id)).map((s) =>
    `<path d="${s.d}" fill="none" stroke="rgba(10,14,34,.28)" stroke-width="6.5" filter="url(#hairBlur)"/>`
  ).join('\n')}
  ${hotStrokes}
  ${segmentStrokes({ width: 5, opacity: 0.18, filter: 'url(#rimBloom)', skip: ['left', 'right', 'bottom', 'tl-ear'] })}
  <!-- Inward corner bloom — light piped through the quarter-circle. -->
  <path d="${blArc}" fill="none" stroke="rgb(255,232,214)" stroke-width="28"
        stroke-opacity=".38" stroke-linecap="round" filter="url(#cornerBloom)"/>
  <path d="${brArc}" fill="none" stroke="rgb(255,226,200)" stroke-width="30"
        stroke-opacity=".40" stroke-linecap="round" filter="url(#cornerBloom)"/>
  <path d="${blArc}" fill="none" stroke="rgb(255,244,230)" stroke-width="11"
        stroke-opacity=".48" stroke-linecap="round" filter="url(#glowBlur)"/>
  <path d="${brArc}" fill="none" stroke="rgb(255,236,214)" stroke-width="11"
        stroke-opacity=".50" stroke-linecap="round" filter="url(#glowBlur)"/>
</g>
<!-- The bottom rim's halo is confined to the desk side.  Letting it spill upward
     lays a neutral white wash over the last 15px of glass, where the prototype is
     climbing in magenta -- that mismatch is what reads as a pasted-on white bar. -->
<g clip-path="url(#belowShell)">
  <path d="${bottomSeg.d}" fill="none" stroke="${bottomSeg.color}" stroke-width="2.6"
        stroke-opacity=".62" stroke-linecap="round" filter="url(#rimBloom)"/>
</g>
${segmentStrokes({ skip: ['left', 'right', 'bottom'] })}
<!-- The three straight rims sit outside the clip: centred exactly on the
     silhouette, half of a clipped stroke would be eaten by the clip's own
     antialiasing. -->
<path d="${leftSeg.d}" fill="none" stroke="url(#rimLeftGrad)" stroke-width="3"
      stroke-opacity=".95" stroke-linecap="butt" transform="translate(.4 0)"/>
<path d="${rightSeg.d}" fill="none" stroke="url(#rimRightGrad)" stroke-width="1.7"
      stroke-opacity=".95" stroke-linecap="butt" transform="translate(.45 0)"/>
<path d="${bottomSeg.d}" fill="none" stroke="${bottomSeg.color}" stroke-width="1.9"
      stroke-opacity="1" stroke-linecap="butt" transform="translate(0 .45)"/>
<!-- Outward wrap on the two bottom corners only.  The straight bottom stays
     desk-clipped so it cannot become a white bar; the corners are allowed to
     bloom into the desk and slightly off the silhouette. -->
<path d="${blArc}" fill="none" stroke="rgb(255,236,220)" stroke-width="16"
      stroke-opacity=".50" stroke-linecap="round" filter="url(#cornerBloom)"/>
<path d="${brArc}" fill="none" stroke="rgb(255,230,210)" stroke-width="18"
      stroke-opacity=".52" stroke-linecap="round" filter="url(#cornerBloom)"/>
<path d="${blArc}" fill="none" stroke="rgb(255,248,240)" stroke-width="3.4"
      stroke-opacity=".95" stroke-linecap="round"/>
<path d="${brArc}" fill="none" stroke="rgb(255,246,236)" stroke-width="3.2"
      stroke-opacity=".95" stroke-linecap="round"/>
<g clip-path="url(#shellClip)">
  <path d="${geo.statusPanePath}" fill="none" stroke="rgba(226,232,255,.20)" stroke-width="1.6"/>
  <path d="${geo.podFloorPath}" fill="none" stroke="url(#podFloorGrad)" stroke-width="1.55"/>
</g>`;
}

/* Convex-lens fog.  Only the raised ear, the two S-fillet convexes and the pod
   corner scatter: a wide milky stroke just inside the arc, plus a tighter core
   that reads as the highlight concentrating through the curve. */
export function buildLens(svg) {
  const { w, h } = geo.canvas;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const fog = (geo.convexArcs || []).map((s) =>
    `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${s.width}" ` +
    `stroke-opacity="${s.opacity}" stroke-linecap="round" filter="url(#lensFog)"/>`
  ).join('\n');
  const core = (geo.convexArcs || []).filter((s) => s.id !== 'ear-corner').map((s) =>
    `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${Math.max(6, s.width * 0.28)}" ` +
    `stroke-opacity="${Math.min(0.55, s.opacity * 1.8)}" stroke-linecap="round" filter="url(#lensCore)"/>`
  ).join('\n');
  svg.innerHTML = `<g clip-path="url(#shellClip)">${fog}\n${core}</g>`;
}

export { geo };
