import geo from './geometry.json';
import { inventoryRail, itemIconTag, potencyNotches } from './data.js';
import { insertSafeHTML, setSafeHTML } from './dom.js';

/* The lower panel: the item rail.
   ------------------------------------------------------------------
   The desktop band under the shell was the one region of the landscape composition
   with nothing in it -- except it was not empty.  bg-plate.png bakes the shell's
   specular reflection into y 720..800, and that reflection is the strongest depth
   cue in the picture: it is what makes the glass read as floating above a desk
   rather than pasted onto a wall.  So the drawer is deliberately *not* a full-height
   panel filling the band.  It is 90 units tall, which is the tallest a drawer can be
   and still be fully visible on a 21:9 display (see geometry.json drawer._bottom),
   and it leaves the 13-unit seam open so the brightest slice of that reflection
   still shows through the gap -- which is precisely what a seam should reveal.

   Below its own bottom edge it lays a short sheen instead of a full mirrored
   reflection.  A full reflection cannot work there: y 823 and down is occupied by
   the plate's phone, pen and notepad, and a mirrored copy of the drawer landing on
   top of those props reads as dirt.  A 30-unit sheen reads as the drawer's edge
   grazing the desk and does not have to correspond to anything underneath it.

   Material is the shell's, built the same way: measured silhouette in geometry.json,
   a clip path, the blur/scatter/tint/frost stack, additive edge light, and a rim
   painted per segment.  What differs is which faces are lit -- both horizontals
   are, for two different reasons, documented at geometry.json drawer._lit. */

const d = geo.drawer;
const R = d.rail;

export function buildDrawerDefs(svg) {
  const { w, h } = geo.canvas;
  svg.insertAdjacentHTML('beforeend', `
<defs>
  <clipPath id="drawerClip" clipPathUnits="userSpaceOnUse">
    <path d="${d.path}"/>
  </clipPath>
  <!-- The bottom rim's halo is confined to the desk side, the same guard the shell
       uses: letting it spill upward lays a flat white wash over the last pixels of
       glass and turns the rim into a bar pasted on top. -->
  <clipPath id="belowDrawer" clipPathUnits="userSpaceOnUse">
    <rect x="0" y="${d.bottom}" width="${w}" height="${h - d.bottom}"/>
  </clipPath>

  <!-- Sides brighten downward, continuing the shell's own sides: the shell's left
       ends at rgb(255,250,246) and its right at rgb(255,248,246) where they meet the
       desk, so the drawer picks each up in the same hue directly below. -->
  <linearGradient id="drawerRimLeftGrad" gradientUnits="userSpaceOnUse"
    x1="${d.left}" y1="${d.top + d.r_top}" x2="${d.left}" y2="${d.bottom - d.r_bot}">
    <stop offset="0" stop-color="rgb(246,240,240)" stop-opacity=".90"/>
    <stop offset="1" stop-color="rgb(255,250,246)" stop-opacity="1"/>
  </linearGradient>
  <linearGradient id="drawerRimRightGrad" gradientUnits="userSpaceOnUse"
    x1="${d.right}" y1="${d.top + d.r_top}" x2="${d.right}" y2="${d.bottom - d.r_bot}">
    <stop offset="0" stop-color="rgb(248,234,230)" stop-opacity=".90"/>
    <stop offset="1" stop-color="rgb(255,248,246)" stop-opacity="1"/>
  </linearGradient>

  <!-- Inner glow: warm off the top, where the seam is, and warmer still off the
       bottom, where the desk bounces.  Anchored to the panel rather than the canvas,
       the bug that made the shell's first bloom never reach the glass.

       Every value here is a fraction of the shell's and the dock's, and that is the
       point rather than a preference.  Those two panels are 309 and 328 units tall,
       so an edge treatment reaches a third of the way in and leaves a body.  This one
       is 90 tall: the same numbers reach across the whole panel and there is no body
       left, which measured as a washed-out rgb(96,96,124) against the shell's
       rgb(59,68,99).  Edge light has to scale with the panel, not be copied into it. -->
  <linearGradient id="drawerGlowGrad" gradientUnits="userSpaceOnUse"
    x1="0" y1="${d.top}" x2="0" y2="${d.bottom}">
    <stop offset="0"   stop-color="rgb(255,232,226)" stop-opacity=".15"/>
    <stop offset=".40" stop-color="rgb(226,220,244)" stop-opacity=".03"/>
    <stop offset=".74" stop-color="rgb(255,226,214)" stop-opacity=".07"/>
    <stop offset="1"   stop-color="rgb(255,238,228)" stop-opacity=".19"/>
  </linearGradient>

  <filter id="drawerSeamBloom" x="-6%" y="-380%" width="112%" height="860%">
    <feGaussianBlur stdDeviation="11"/>
  </filter>
  <filter id="drawerSeamCore" x="-6%" y="-380%" width="112%" height="860%">
    <feGaussianBlur stdDeviation="5"/>
  </filter>
  <filter id="drawerSheen" x="-8%" y="-40%" width="116%" height="420%">
    <feGaussianBlur stdDeviation="11"/>
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

/* Light entering from both horizontal faces.  These follow the edge paths as blurred
   strokes rather than being a linear-gradient in y, so the corner radii carry the glow
   round with them instead of it stopping square.

   Widths are a third of the dock's for the reason given at drawerGlowGrad: the dock's
   112-unit seam bloom occupies its bottom third, and in a 90-unit panel the same
   stroke is the entire panel. */
export function buildDrawerUnderglow(svg) {
  const { w, h } = geo.canvas;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = `
<g clip-path="url(#drawerClip)">
  <path d="${d.topPath}" fill="none" stroke="rgb(255,214,204)" stroke-width="32"
        stroke-opacity=".10" stroke-linecap="round" filter="url(#drawerSeamBloom)"/>
  <path d="${d.topPath}" fill="none" stroke="rgb(255,228,220)" stroke-width="11"
        stroke-opacity=".13" stroke-linecap="round" filter="url(#drawerSeamCore)"/>
  <path d="${d.bottomPath}" fill="none" stroke="rgb(255,226,208)" stroke-width="28"
        stroke-opacity=".09" stroke-linecap="round" filter="url(#drawerSeamBloom)"/>
</g>`;
}

export function buildDrawerLens(svg) {
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
  svg.innerHTML = `<g clip-path="url(#drawerClip)">${fog}\n${core}</g>`;
}

/* Rim stack, the shell's order:
     1. inner glow clipped inside, along the whole outline
     2. thin dark hairline on the upper faces only (glass thickness)
     3. soft inward bloom on the seam-facing top edge
     4. the crisp segmented highlight, drawn outside the clip
   Then the desk sheen, clipped to below the panel. */
export function buildDrawerRim(svg) {
  const { w, h } = geo.canvas;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const bottom = d.rimSegments.find((s) => s.id === 'dr-bottom');
  const left = d.rimSegments.find((s) => s.id === 'dr-left');
  const right = d.rimSegments.find((s) => s.id === 'dr-right');
  const straight = ['dr-left', 'dr-right', 'dr-bottom'];

  svg.innerHTML = `
<g clip-path="url(#drawerClip)">
  ${strokes(d.rimSegments, { color: 'url(#drawerGlowGrad)', width: 10, opacity: 1, filter: 'url(#glowBlur)' })}
  ${strokes(byId(d.hairSegments), { color: 'rgba(10,14,34,.26)', width: 6, opacity: 1, filter: 'url(#hairBlur)' })}
  ${strokes(byId(d.hotSegments), { width: 7, opacity: 0.26, filter: 'url(#hotBloom)' })}
  ${strokes(byId(d.litSegments).filter((s) => !straight.includes(s.id)), { width: 5, opacity: 0.16, filter: 'url(#rimBloom)' })}
</g>
<!-- The desk sheen: a short graze under the bottom edge, not a mirrored reflection.
     y 823 and below is where the plate's phone, pen and notepad sit, and a real
     reflection landing on those props reads as dirt.  A graze does not have to
     correspond to what is beneath it. -->
<g clip-path="url(#belowDrawer)">
  <path d="${d.bottomPath}" fill="none" stroke="rgb(255,236,224)" stroke-width="30"
        stroke-opacity=".30" stroke-linecap="round" filter="url(#drawerSheen)"/>
  <path d="${bottom.d}" fill="none" stroke="${bottom.color}" stroke-width="2.6"
        stroke-opacity=".58" stroke-linecap="round" filter="url(#rimBloom)"/>
</g>
<!-- The three straight rims sit outside the clip: centred exactly on the
     silhouette, half of a clipped stroke would be eaten by the clip's own
     antialiasing. -->
${strokes(d.rimSegments.filter((s) => !straight.includes(s.id)))}
<path d="${left.d}" fill="none" stroke="${left.color}" stroke-width="2.6"
      stroke-opacity=".95" stroke-linecap="butt" transform="translate(.4 0)"/>
<path d="${right.d}" fill="none" stroke="${right.color}" stroke-width="1.7"
      stroke-opacity=".95" stroke-linecap="butt" transform="translate(.45 0)"/>
<path d="${bottom.d}" fill="none" stroke="${bottom.color}" stroke-width="1.9"
      stroke-opacity="1" stroke-linecap="butt" transform="translate(0 .45)"/>`;
}

/* ------------------------------------------------------------------- content */

/* The cell.  No label: at 66 units a name would be two characters and a truncation
   ellipsis, which says less than the icon does.  Quantity is only drawn above 1 --
   "x1" on a unique item is noise -- and 佩戴 is a ring rather than a word because it
   is the one piece of state that changes while you are looking at the rail. */
function slot(item) {
  const { icon } = item;
  const qty = item.quantity > 1 ? `<span class="slot-qty">${item.quantity}</span>` : '';
  const worn = item.worn ? '<span class="slot-worn" aria-hidden="true"></span>' : '';
  const meta = item.bucket === 'consumable' ? ` 强度 ${item.potency}`
    : item.bucket === 'goods' ? (item.worn ? ' 佩戴中' : ' 未佩戴')
      : ` ${item.source}`;

  return `
      <button class="drawer-slot b-${item.bucket}${item.worn ? ' is-worn' : ''}" type="button"
        data-item="${item.name}" data-set="${icon.set}" data-placing="${icon.placing}"
        style="--hue:${icon.hue}; --tilt:${icon.tilt}deg; --scale:${icon.scale}${
          item.bucket === 'consumable' ? `; --potency:${item.potency}` : ''}"
        aria-label="${icon.label} · ${item.name}，数量 ${item.quantity}${meta}，点击查看详情">
        <span class="slot-well"></span>
        ${itemIconTag(icon, 'slot-icon')}
        <span class="slot-gem"></span>
        ${potencyNotches(item.bucket === 'consumable' ? item.potency : 0)}
        ${qty}${worn}
      </button>`;
}

/* A vertical caption plus a hairline, standing in the rail where one bucket ends and
   the next begins.  Vertical because the rail is 66 units tall and 1573 wide: a
   horizontal caption would cost eight cells, a vertical one costs less than half of
   one.  It also gives the swipe something to land on -- snap points sit on these
   rather than on every cell, since snapping every 78 units across twenty cells
   would be a notch with no meaning. */
function divider(label) {
  return `
      <div class="drawer-div" aria-hidden="true"><i></i><span>${label}</span></div>`;
}

function railBody() {
  const groups = inventoryRail();
  if (!groups.length) {
    return '<div class="drawer-empty">背包是空的</div>';
  }
  return groups.map((g) => `
    <div class="drawer-group" role="list" aria-label="${g.label}">
      ${divider(g.label)}${g.items.map(slot).join('')}
    </div>`).join('');
}

/* The panel shell, content injected.
   ------------------------------------------------------------------
   Parameterised rather than copied, because the gift tray (src/gifts.js) is the same
   panel: same silhouette, same glass stack, same rail box, same scroll behaviour --
   only the cells inside differ.  Duplicating this would mean two copies of a
   measured silhouette and of the drag-to-scroll gesture, and the two would drift.

   `extraClass` is how the tray gets its own cell metrics without a second stylesheet
   of panel chrome. */
function panelMarkup(body, { label, extraClass = '' }) {
  const railLeft = d.left + R.pad;
  const railWidth = d.right - d.left - R.pad * 2;
  /* Rail geometry is declared on the root, not on the rail: the overflow hints are
     siblings of the rail and need the same numbers, and a custom property inherits
     down rather than sideways. */
  return `
<div class="drawer-root${extraClass ? ` ${extraClass}` : ''}" role="region" aria-label="${label}"
  style="--rx:${railLeft}px; --rw:${railWidth}px;
         --ry:${R.top}px; --rh:${R.height}px; --sy:${R.slotTop}px; --sh:${R.slot}px">
  <div class="drawer-blur"></div>
  <div class="drawer-scatter"></div>
  <div class="drawer-tint"></div>
  <div class="drawer-frost"></div>
  <div class="drawer-edge"></div>
  <svg class="drawer-underglow" aria-hidden="true"></svg>
  <svg class="drawer-lens" aria-hidden="true"></svg>

  <div class="drawer-rail">
    ${body}
  </div>
  <!-- Overflow affordance.  The scrollbar is hidden -- a 66-unit row has no height to
       spare for one -- so with nothing else the reader could not tell a full bag from
       an empty one.  These are siblings of the rail rather than children because a
       child of a scroller scrolls away with the content. -->
  <span class="drawer-more drawer-more-l" aria-hidden="true"></span>
  <span class="drawer-more drawer-more-r" aria-hidden="true"></span>

  <svg class="drawer-rim" aria-hidden="true"></svg>
</div>`;
}

/* --------------------------------------------------------------------- mount */

/* A sibling of .page-layer rather than a child of it: the layer is the modal stack
   and gets a shade over everything in it, whereas the drawer is part of the resting
   composition -- it must dim *behind* an opened page, not with it.  Sitting below
   the layer's z-index is what produces that for free.
   ------------------------------------------------------------------
   `body` is a function rather than a string so the panel can be repainted against
   changed state without being torn down -- the gift tray does that when the reader
   switches character, which must not re-run the slide-in animation or rebuild the
   rim SVGs.

   `blockedBy` is the selector list that outranks this panel on Escape.  It has to be
   passed in rather than hard-coded: the confirm card sits above the tray and must
   peel first, and a panel cannot know what someone else will stack on top of it. */
export function mountRailPanel(stage, {
  label,
  extraClass = '',
  body,
  onPick,
  pickSelector = '.drawer-slot',
  escapeKey,
  blockedBy = '.dev-sheet, .page-modal, .map-layer, .arcade-layer',
} = {}) {
  let root = null;
  /* The rail's ResizeObserver outlives a synchronous remove(): it fires on the next
     frame, by which point root is null.  So closing has to tear it down rather than
     leave it to be garbage collected. */
  let teardown = null;

  const paint = () => {
    buildDrawerUnderglow(root.querySelector('.drawer-underglow'));
    buildDrawerLens(root.querySelector('.drawer-lens'));
    buildDrawerRim(root.querySelector('.drawer-rim'));
  };

  const isOpen = () => !!root;

  const close = () => {
    if (!root) return;
    teardown?.();
    teardown = null;
    root.remove();
    root = null;
  };

  const open = () => {
    if (root) return;
    insertSafeHTML(stage, 'beforeend', panelMarkup(body(), { label, extraClass }));
    root = stage.querySelector(':scope > .drawer-root');
    paint();
    teardown = wire();
  };

  /* Content only.  The glass stack, the rim SVGs and the slide-in stay as they are,
     which is the whole reason this exists rather than a close-then-open: switching
     character in the tray must not replay the animation or repaint three SVGs. */
  const repaint = () => {
    if (!root) return;
    teardown?.();
    const rail = root.querySelector('.drawer-rail');
    setSafeHTML(rail, body());
    rail.scrollLeft = 0;
    teardown = wire();
  };

  const toggle = () => (root ? close() : open());

  /* Horizontal browsing has to work with a wheel as well as a finger: the landscape
     document never scrolls vertically, so a vertical wheel gesture over the rail
     would otherwise do nothing at all. */
  function wire() {
    const rail = root.querySelector('.drawer-rail');
    if (!rail) return;

    const updateEdges = () => {
      if (!root) return;
      const max = rail.scrollWidth - rail.clientWidth;
      root.classList.toggle('has-prev', max > 2 && rail.scrollLeft > 2);
      root.classList.toggle('has-more', max > 2 && rail.scrollLeft < max - 2);
    };
    rail.addEventListener('scroll', updateEdges, { passive: true });
    /* Content width, not just scroll position: whether there is more to see changes
       when items are added or removed as well as when the rail moves, and no scroll
       event fires for that.  Observing the groups rather than the rail because the
       rail's own box is fixed -- it is the content inside that grows. */
    const observer = new ResizeObserver(updateEdges);
    rail.querySelectorAll('.drawer-group').forEach((g) => observer.observe(g));
    updateEdges();

    rail.addEventListener('wheel', (event) => {
      const dx = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!dx) return;
      const before = rail.scrollLeft;
      rail.scrollLeft += dx;
      /* Only claim the gesture if the rail could actually act on it, so a wheel at
         either end still behaves like a normal page wheel. */
      if (rail.scrollLeft !== before) event.preventDefault();
    }, { passive: false });

    /* Drag to scroll -- mouse only.
       ------------------------------------------------------------------
       A touch screen already pans a horizontal scroller natively, with the platform's
       own momentum curve and its own snap behaviour.  Handling pointer events for
       touch as well would move the rail twice per gesture, so touch is left alone and
       this exists to give a mouse the same gesture a finger gets for free.

       Scale comes from the rail's own boxes rather than from the canvas: rendered
       width over layout width *is* the effective scale, whatever produced it. Reading
       --k off .stage worked only because main.js happens to write it as an inline
       style -- as a stylesheet declaration it is an unparsed token stream and
       Number() of `max(100vw / 1672px, ...)` is NaN. */
    let drag = null;
    let suppressClick = false;
    let glide = 0;

    const stopGlide = () => {
      if (glide) cancelAnimationFrame(glide);
      glide = 0;
    };

    const scale = () => {
      const rendered = rail.getBoundingClientRect().width;
      return rendered && rail.clientWidth ? rendered / rail.clientWidth : 1;
    };

    /* Capture keeps the drag alive when the cursor leaves the rail, but it has to be
       given back explicitly.  While the rail holds capture every pointer event is
       retargeted to it, so a capture left standing would make the *next* click report
       the rail as its target and `closest('.drawer-slot')` would find nothing -- the
       cell would stop being clickable with no visible cause.  Both calls throw for a
       pointerId that is no longer active, which is not worth failing a gesture over. */
    let captured = 0;
    const capture = (id) => {
      if (captured) return;
      try { rail.setPointerCapture(id); captured = id; } catch { /* stale pointer */ }
    };
    const uncapture = () => {
      if (!captured) return;
      try { rail.releasePointerCapture(captured); } catch { /* already gone */ }
      captured = 0;
    };

    rail.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button) return;
      stopGlide();
      rail.classList.remove('is-dragging');
      /* Cleared here rather than only when a click consumes it.  A browser suppresses
         the click after a drag that took pointer capture, so a latch waiting to be
         consumed can outlive its gesture and swallow the *next* real click instead. */
      suppressClick = false;
      drag = { x: event.clientX, left: rail.scrollLeft, k: scale(), moved: 0, v: 0, t: event.timeStamp };
    });

    rail.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      drag.moved = Math.max(drag.moved, Math.abs(dx));
      /* 4 units of slop, so a click with a shaky hand is still a click. */
      if (drag.moved <= 4) return;
      capture(event.pointerId);
      rail.classList.add('is-dragging');
      const before = rail.scrollLeft;
      rail.scrollLeft = drag.left - dx / drag.k;
      /* Velocity in canvas units per millisecond, measured from what the rail actually
         did rather than from the pointer, so hitting an end kills the flick instead of
         storing up speed against a wall.  Smoothed, so one stuttered frame cannot
         throw the release. */
      const dt = Math.max(1, event.timeStamp - drag.t);
      drag.v = drag.v * 0.68 + ((rail.scrollLeft - before) / dt) * 0.32;
      drag.t = event.timeStamp;
    });

    /* Release with speed still in it and the rail keeps going.  Without this a flick
       stops dead under the cursor: browsing thirty cells would mean dragging the full
       width of the rail three times rather than flicking twice, which is the whole
       difference between a rail and a scrollbar. */
    const release = () => {
      if (!drag) return;
      const { v, moved } = drag;
      drag = null;
      uncapture();
      suppressClick = moved > 4;
      if (!suppressClick || Math.abs(v) < 0.12) {
        rail.classList.remove('is-dragging');
        return;
      }
      /* Snap stays off for the glide -- .is-dragging carries it -- and comes back when
         the rail settles, which is what lets the flick land on a bucket divider. */
      /* Decay and cut-off are tuned for a tail of roughly 600ms.  At 0.93 with a
         0.02 cut-off the loop ran for over a second on an ordinary flick, which is long
         enough that the rail is still creeping when the reader has already decided what
         they are looking at -- and long enough that snap, which is held off for the
         whole glide, comes back late. */
      let speed = v;
      const step = () => {
        speed *= 0.915;
        const before = rail.scrollLeft;
        rail.scrollLeft += speed * 16;
        /* Stop when the speed runs out *or* the rail stopped moving, so hitting either
           end does not spin the loop for half a second going nowhere. */
        if (Math.abs(speed) > 0.06 && Math.round(rail.scrollLeft) !== Math.round(before)) {
          glide = requestAnimationFrame(step);
        } else {
          glide = 0;
          rail.classList.remove('is-dragging');
        }
      };
      glide = requestAnimationFrame(step);
    };
    rail.addEventListener('pointerup', release);
    rail.addEventListener('pointercancel', release);
    rail.addEventListener('lostpointercapture', release);

    rail.addEventListener('click', (event) => {
      /* A drag that happens to end over a cell must not also open that cell. */
      if (suppressClick) { suppressClick = false; return; }
      const cell = event.target.closest(pickSelector);
      /* The element, not one field off it: the tray's cells carry several data
         attributes and the drawer's carry one, so the caller reads what it wrote. */
      if (cell && !cell.disabled) onPick?.(cell);
    });

    /* The observer and any running glide need undoing.  Every listener above is on a
       node inside the drawer, so removing the drawer takes them with it. */
    return () => { observer.disconnect(); stopGlide(); uncapture(); };
  }

  /* Escape peels one level, and the drawer shares the bottom level with the
     character dock -- 评语 -> page -> 抽屉/速览.  So it only acts when nothing from
     the modal stack is standing on top of it; mountPages closes the dock on the same
     keypress, which is what makes the two read as one level.

     Bound in the capture phase, which is the whole reason this works.  mountPages
     registers its own bubble-phase handler on the window first, so in the bubble
     phase this one would run *after* the page had already been removed, read a clear
     stack, and close the drawer too -- one Escape peeling two levels.  Capturing puts
     this ahead of it, so the test "is a page open?" is asked before anything has
     acted on the key. */
  if (escapeKey && !stage.dataset[escapeKey]) {
    stage.dataset[escapeKey] = '1';
    addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !root) return;
      if (document.querySelector(blockedBy)) return;
      close();
    }, { capture: true });
  }

  return { open, close, toggle, isOpen, repaint, root: () => root };
}

/* The item drawer: the rail panel, filled with the bag. */
export function mountDrawer(stage, { onItem } = {}) {
  return mountRailPanel(stage, {
    label: '道具抽屉',
    body: railBody,
    onPick: (cell) => onItem?.(cell.dataset.item),
    escapeKey: 'drawerEscapeBound',
    /* The gift confirm card stacks above this, so it peels first. */
    blockedBy: '.dev-sheet, .page-modal, .gift-confirm, .map-layer, .arcade-layer',
  });
}

export { d as drawerGeo };
