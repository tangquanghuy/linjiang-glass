/* The elastic portrait stage.
   ------------------------------------------------------------------
   Landscape is a fixed 1672x941 canvas scaled to cover the viewport.  Portrait
   fixes the width only:

       k = containerWidth / PW

   and the height is whatever the content comes to.  That is what lets the
   character preview expand downward without leaving empty space: opening it makes
   the document taller instead of overlaying something, and closing it makes the
   document shorter again.  In an embedded page the host container simply grows.

   transform: scale() does not affect layout size, so the wrapper's height has to be
   set from the measured content height times k.  A ResizeObserver on the content
   does that, which also covers font loading and image decode changing the height
   after first paint.

   Seam arithmetic.  Each panel's box top is its ear top and its box bottom is its
   silhouette's main bottom level.  For the gap between two panels to be one seam
   wide everywhere, the panel above has to reach *below* the ear top of the panel
   below by EAR.drop - SEAM, exactly as the landscape dock's main bottom (398) sits
   below the shell's ear top (390) by drop 21 - gap 13 = 8.  So consecutive panel
   boxes overlap by that much, which in flow terms is a negative margin:

       margin-top = SEAM - EAR.drop        (26 - 44 = -18)

   With that, a panel's measured box bottom is its silhouette bottom, and the notch
   in it lands one seam above the next panel's ear.  The value is exported so the
   stylesheet and this file cannot disagree. */

import { EAR, PANEL, PW, SEAM, TOOL, canvasWidth, panelPath, podRowLeft } from './geometry.js';
import { buildPortraitDefs, paintPortraitRim } from './glass.js';
import { reportPortraitSize } from '../bridge.js';
import dockArtRaw from '../dock-art.json';
import { asset, rebaseRecord } from '../asset.js';

const dockArt = rebaseRecord(dockArtRaw);

/* Upper bound on k.  The smallest type is 36 units, so k above 17/36 draws it past
   17 real px -- larger than any platform's body size, and the whole column starts
   reading as a zoomed-in mock rather than an interface.  Beyond this the column
   centres instead of growing. */
export const K_CEIL = 17 / 36;

/** Flow overlap between consecutive panels; negative, see the note above. */
export const PANEL_MARGIN = SEAM - EAR.drop;

const glassLayers = (p) => {
  const clip = `clip-path:url(#pClip-${p.id});-webkit-clip-path:url(#pClip-${p.id})`;
  const vars = `--pt:${p.earTop + EAR.drop}px;--pb:${p.bottom}px`;
  /* One backdrop-filter pass per panel.  The scatter layer is the landscape
     微光晕; on this canvas it is a second full-size blur for a 10% screen blend,
     and perf.css hides any leftover .pg-scatter on phones. */
  return `
<div class="pg pg-blur"    style="${clip}"></div>
<div class="pg pg-paint"   style="${clip};${vars}">
  <div class="pg-tint"></div>
  <div class="pg-frost"></div>
  <div class="pg-edge"></div>
</div>`;
};

/* The blossom straddles each ear's corner arc -- half on the glass, half on the
   scene -- which is what the landscape mockup does at both the shell's title ear and
   the dock's, and what stops the corner reading as a bare radius.  The corner's
   centre is (PANEL.left + EAR.r, earTop + EAR.r) and the crop is offset so it sits
   on the arc rather than inside it.

   Size follows the landscape relationship rather than a flat scale factor: there the
   dock's blossom is 53 tall against a 43-tall script title, so 1.23x the title.  The
   portrait script is 96, which gives 118 -- a flat 1.55x of the source came out
   half again too big and drifted over the lettering.

   Even at 118 this is not an upscale in the end: the canvas is multiplied by k, so
   at a phone width the net display size is well under the source's 82x90 and the
   note in content.js about not softening these crops still holds.

   Measured off the landscape shell rather than guessed at.  There the crop is 82x90
   at y 362 against a top edge at y 411, so 49 of its 90 units -- 54% -- sit above the
   glass: it straddles the edge rather than decorating the inside of it.

   Size.  The first attempts sized this against the *dock's* blossom, which is 53 tall
   against a 43-tall script (1.23x), and reasoned that the result was safe because the
   net display size stayed under the source's pixel count.  That reasoning only covers
   sharpness, not apparent size, and the two are different problems: at 107x118 the
   crop rendered 44x49 real pixels on a phone against the landscape one's 82x90 on a
   desktop -- half the linear size, a quarter of the area, which reads as a smudge.

   The right reference is the *shell's* blossom, the one visible in the base view: 90
   tall against a 51px script, so 1.76x.  Against the portrait script's 96 that gives
   169.  An angular check agrees: the landscape crop subtends 90 * 0.277mm / 600mm =
   0.0415 rad, and matching that on a phone at k 0.414 needs 177 units.  172 sits
   between them, and at that size the crop still renders about 71 real pixels against a
   90-pixel source, so it is downsampled and stays crisp.

   Assets, one per panel, each taken from the landscape panel it corresponds to:

     Status  blossom-bloom.png -- the bloom beside "Girls" on the landscape main status
             bar.  Narrower, with a small bud alongside it.
     Girls   dock-blossom.png -- the fuller, rounder bloom on the landscape 速览 panel's
             own raised ear corner.

   The Status one had to be extracted first.  sprites.json's blossom.png is not a cutout:
   it is a rectangular crop off the prototype holding that bloom, a separate bud, a
   length of stem, and across rows 48-50 a fragment of the shell's own rim highlight.
   At the single position it was cut for the fragment lands on the real rim and vanishes;
   drawn anywhere else it reads as a hard-edged box, which is what the rectangle near
   the ear turned out to be.  Connected-component labelling was the wrong way to find
   the bloom inside it -- the petals are separated by fully transparent gaps, so the
   bloom splits across components and none of them is the flower.  It is simply the
   right-hand part of the crop; tools/extract_blossom.py takes it by rectangle.

   Size.  Both are drawn 90 units tall so the two ears carry equal visual weight, from
   an angular match: the dock crop is 53 tall and subtends 53 * 0.277mm / 600mm at a
   desk, which on a phone at k 0.414 wants about 105 units.  90 is slightly under,
   chosen so the crop stays clear of the script, and at that size neither source is
   meaningfully blown up.

   Both are flipped horizontally.  Each crop has its stem trailing off the left, which
   in the landscape scene lies along the rim for its whole length; at a portrait ear's
   corner the panel edge is immediately to the left, so an unflipped stem would hang off
   into open scene with no edge under it.  Flipped, it trails right along the ear's top
   edge instead.

   Placement mirrors the dock's: on the ear's corner, overhanging it both ways -- 47% of
   the height above the top line and a fifth of the width past the left edge.  The
   horizontal overhang is a fraction rather than a fixed distance: at a fixed 21 units
   the narrower Status bloom had 31% of itself out over the dark scene against the wider
   one's 19%, which made it read as the dimmer of the two. */
const ORNAMENT = {
  status: { src: asset('blossom-bloom.png'), w: 68, h: 90 },
  girls: { src: dockArt.dockBlossom.src, w: 110, h: 90 },
  /* Every full page shares one id, so it shares one clip path and this one entry.  It
     takes the fuller 速览 bloom rather than the Status one because a page is the
     detail view the 速览 panel was, and because without an entry here `blossom()`
     returns nothing and the ear is left as a bare radius -- which is exactly the thing
     the ornament exists to prevent. */
  page: { src: dockArt.dockBlossom.src, w: 110, h: 90 },
};

const blossom = (p) => {
  const o = ORNAMENT[p.id];
  if (!o) return '';
  return `
  <img class="pblossom" src="${o.src}" alt="" draggable="false"
    style="left:${PANEL.left - o.w * 0.19}px; top:${p.earTop - o.h * 0.47}px;
           width:${o.w}px; height:${o.h}px">`;
};

/**
 * Mount the portrait stage into `host` and return a handle.
 * `host` becomes a normal-flow block: full width, height driven by content.
 */
export function createPortraitStage(host) {
  host.classList.add('pstage');
  /* 低负载档不给底图 src。
     ------------------------------------------------------------------
     bg-plate.png 是 1672×941，解码后约 6MB 位图，而它在竖屏里被缩到一条不到 400px 宽的栏
     后面 —— 严重过采样。移动端（原生流）默认就在低负载档，所以默认不再付这笔钱。

     留着元素、只不给 src：<img> 没有 src 就既不发请求也不解码，而任何 querySelector('.pplate')
     仍然命中。用户在设置页切回「完整效果」时由 main.js 的 syncHeavyTextures 把 src 补上。 */
  const plateSrc = document.documentElement.dataset.hudPerformance === 'low'
    ? '' : asset('bg-plate.png');
  host.innerHTML = `
<div class="pscale">
  <img class="pplate"${plateSrc ? ` src="${plateSrc}"` : ''} alt="" draggable="false">
  <svg class="pdefs" aria-hidden="true"></svg>
  <div class="pglass" aria-hidden="true"></div>
  <div class="pcontent"></div>
  <svg class="prim" aria-hidden="true"></svg>
  <div class="pblossoms" aria-hidden="true"></div>
</div>`;

  const scale = host.querySelector('.pscale');
  const defs = host.querySelector('.pdefs');
  const glass = host.querySelector('.pglass');
  const content = host.querySelector('.pcontent');
  const rim = host.querySelector('.prim');
  const blossoms = host.querySelector('.pblossoms');

  /* Read the panels straight out of the DOM: the content owns its own height, so
     the shape follows the layout rather than the layout following a table of
     numbers.  A panel opts into the raised tool tab with data-pod. */
  const measure = (pw) => {
    const els = [...content.querySelectorAll(':scope > .ppanel')];
    return els.map((el, i) => {
      const next = els[i + 1];
      const spec = {
        id: el.dataset.panel,
        earTop: el.offsetTop,
        bottom: el.offsetTop + el.offsetHeight,
        pod: el.hasAttribute('data-pod'),
        nextEar: next ? next.offsetTop : null,
        pw,
      };
      spec.path = panelPath(spec);
      return spec;
    });
  };

  let raf = 0;
  let painted = '';
  const paint = () => {
    raf = 0;
    /* Hidden by the mode switch: clientWidth is 0, and painting would set a k of 0
       and throw away the measured layout. */
    const width = host.clientWidth;
    if (!width) return;

    /* k is bounded at both ends, and the two bounds are enforced differently.
       Below K_FLOOR the canvas narrows so the same content reflows into fewer units
       and k stops falling -- a bigger type size cannot fix a narrow container.
       Above K_CEIL the canvas stays at its design width and the column is simply
       centred, with the plate filling the rest: that is what a phone held sideways
       and a tablet in portrait get, rather than a column blown up past the size the
       type was drawn for. */
    const pw = canvasWidth(width);
    const k = Math.min(width / pw, K_CEIL);
    const drawn = pw * k;

    scale.style.setProperty('--k', String(k));
    scale.style.setProperty('--pw', `${pw}px`);
    /* A short full-screen page should still carry glass to the visual viewport's
       bottom.  Expose the viewport in portrait canvas units; long pages simply
       exceed this minimum and keep their natural elastic height. */
    scale.style.setProperty('--viewport-canvas-h', `${Math.ceil(innerHeight / k)}px`);
    /* Derived positions the stylesheet would otherwise have to hard-code. */
    scale.style.setProperty('--pod-row-left', `${podRowLeft(pw)}px`);
    scale.style.setProperty('--tool-d', `${TOOL.d}px`);
    scale.style.setProperty('--tool-gap', `${TOOL.gap}px`);
    scale.style.setProperty('--panel-right', `${pw - PANEL.left}px`);
    /* The seam arithmetic has one home: the stylesheet reads it from here rather
       than repeating the number. */
    scale.style.setProperty('--panel-margin', `${PANEL_MARGIN}px`);
    scale.style.setProperty('--ear-drop', `${EAR.drop}px`);
    /* Centre the column when the container is wider than the drawing. */
    scale.style.left = `${Math.round((width - drawn) / 2)}px`;

    const panels = measure(pw);
    const h = Math.ceil(content.offsetHeight);
    if (!panels.length || !h) return;

    const drawnH = Math.ceil(h * k);
    scale.style.height = `${h}px`;
    /* The wrapper is what the host page lays out against, so it carries the
       scaled height.  Rounding up avoids a sub-pixel gap at the bottom. */
    host.style.height = `${drawnH}px`;
    reportPortraitSize(drawnH);

    /* k can change without the silhouettes changing.  Rebuilding the glass DOM
       tears down every backdrop-filter layer; skip that unless a panel box or
       the canvas width actually moved. */
    const sig = `${pw}|${h}|` + panels.map((p) =>
      `${p.id}:${p.earTop}:${p.bottom}:${p.pod ? 1 : 0}`).join('|');
    if (sig === painted) return;
    painted = sig;

    for (const svg of [defs, rim]) {
      svg.setAttribute('width', String(pw));
      svg.setAttribute('height', String(h));
    }
    buildPortraitDefs(defs, panels, h, pw);
    glass.innerHTML = panels.map(glassLayers).join('');
    paintPortraitRim(rim, panels, h, pw);
    blossoms.innerHTML = panels.map(blossom).join('');
  };

  const sync = () => {
    if (!raf) raf = requestAnimationFrame(paint);
  };

  const ro = new ResizeObserver(sync);
  ro.observe(host);
  ro.observe(content);
  addEventListener('resize', sync);

  return { content, sync, scale, destroy: () => { ro.disconnect(); removeEventListener('resize', sync); } };
}
