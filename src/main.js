import './styles/tokens.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/content.css';
import './styles/cards.css';
import './styles/tools.css';
import './styles/pages.css';
import './styles/dock.css';
import './styles/drawer.css';
/* After drawer.css: the gift tray is the drawer's panel with different cells, so its
   overrides have to land on top of the cell rules they narrow. */
import './styles/gifts.css';
import './styles/portrait.css';

import { asset } from './asset.js';
document.documentElement.style.setProperty('--hud-frost', `url("${asset('frost.png')}")`);

import { buildDefs, buildRim, buildLens } from './glass.js';
import { buildDockDefs } from './dock.js';
import { buildDrawerDefs } from './drawer.js';
import { renderContent } from './content.js';
import { createPortraitStage } from './portrait/stage.js';
import { mountPortraitContent } from './portrait/content.js';
import { startBridge } from './bridge.js';

/* Two layouts, not one layout with breakpoints.
   ------------------------------------------------------------------
   The landscape canvas is a fixed 1672x941 reproduction of a measured prototype
   and is scaled to cover the viewport.  Portrait cannot be that same canvas
   rescaled: the aspect mismatch against a phone is about 3.9x, and scaling is the
   one transform that cannot change an aspect ratio, so any fit strategy either
   crops most of the scene or shrinks the type past legibility.  Portrait is
   therefore its own composition on its own canvas -- fixed width, elastic height --
   sharing the material, the tokens' structure and the construction rules.

   ?mode=portrait / ?mode=landscape forces one for testing. */
function wantsPortrait() {
  const forced = new URLSearchParams(location.search).get('mode');
  if (forced === 'portrait') return true;
  if (forced === 'landscape') return false;
  /* innerWidth < innerHeight is right for a real phone, wrong for a tavern
     status iframe: those are often a chat-column wide and a viewport tall.
     Portrait is the phone composition; a desktop embed should cover-fill. */
  return innerWidth < innerHeight && innerWidth < 720;
}

function bootLandscape() {
  const stage = document.getElementById('stage');
  buildDefs(document.getElementById('defs'));
  /* The dock's and the drawer's clip paths and gradients live in the always-present
     defs so the CSS layers can reference them even though both panels mount on
     demand. */
  buildDockDefs(document.getElementById('defs'));
  buildDrawerDefs(document.getElementById('defs'));
  buildLens(document.getElementById('lens'));
  buildRim(document.getElementById('rim'));
  renderContent(document.getElementById('content'));

  const fitStage = () => {
    const canvasW = 1672;
    const canvasH = 941;
    const contain = new URLSearchParams(location.search).get('fit') === 'contain';
    /* Glass shell band in prototype px (pod top 350 … rim bottom 720). */
    const shellCenter = 535;
    const kW = innerWidth / canvasW;
    const kH = innerHeight / canvasH;
    const k = contain ? Math.min(kW, kH) : Math.max(kW, kH);
    let shiftY = 0;
    if (!contain && kW >= kH) {
      const visibleH = innerHeight / kW;
      let centerY = shellCenter;
      const half = visibleH / 2;
      if (centerY - half < 0) centerY = half;
      if (centerY + half > canvasH) centerY = canvasH - half;
      shiftY = canvasH / 2 - centerY;
    }
    stage.style.setProperty('--k', String(k));
    stage.style.setProperty('--shift-y', `${shiftY}px`);
  };
  fitStage();
  addEventListener('resize', fitStage);
}

function bootPortrait() {
  const viewport = document.querySelector('.viewport');
  const host = document.createElement('div');
  host.id = 'pstage';
  viewport.appendChild(host);

  const stage = createPortraitStage(host);
  mountPortraitContent(stage, {
    /* Every route the column offers is built (see src/portrait/pages.js), so this only
       fires for a name nothing routes -- which should be loud rather than a blank
       panel. */
    onPage: (page, arg) => {
      console.warn('[portrait] no page routed for:', page, arg ?? '');
    },
  });
  return stage;
}

/* Both layouts stay mounted once built and are shown one at a time.
   The mode has to be re-picked on resize, not just at boot: rotating a phone
   changes which composition fits, and tearing the other one down would mean
   rebuilding its geometry, its rim SVGs and its scroll position every rotation. */
let landscapeBooted = false;
let portraitStage = null;

function applyMode() {
  const portrait = wantsPortrait();
  const viewport = document.querySelector('.viewport');

  viewport.classList.toggle('is-portrait', portrait);
  /* The document only scrolls in portrait: the whole point of the elastic canvas
     is that opening the preview makes the page taller. */
  document.documentElement.classList.toggle('portrait-mode', portrait);

  if (portrait) {
    if (!portraitStage) portraitStage = bootPortrait();
    else portraitStage.sync();
  } else if (!landscapeBooted) {
    bootLandscape();
    landscapeBooted = true;
  }
}

applyMode();
startBridge();

let modeTick = 0;
addEventListener('resize', () => {
  cancelAnimationFrame(modeTick);
  modeTick = requestAnimationFrame(applyMode);
});
