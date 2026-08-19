/* Pieces shared by the portrait panels.
   ------------------------------------------------------------------
   `head` in particular: the raised title tab plus the CJK caption that sits inside the
   body under it is the pairing every panel in this column uses, base view and page
   alike, so it has one definition rather than one per file.  The blossom that straddles
   the ear's corner is painted by the stage, not here -- it has to sit above the rim
   layer, and the content layer is a stacking context beneath it. */

import { icons } from '../icons.js';

export const ic = (name) => (name ? `<i class="ic">${icons[name]}</i>` : '');

export const pct = (value, max) => Math.max(0, Math.min(100, (value / max) * 100));

export const head = (script, cjk) => `
  <div class="pear"><span>${script}</span></div>
  <div class="pear-cap"><i>/</i><span>${cjk}</span></div>`;

/* A meter, with the thresholds the schema states outright (顺从度 350/600, 体力 20,
   尿意 60/80) marked on the track -- so the number means something without the reader
   having to remember which value unlocks what.  A tick already passed is drawn dark so
   it reads against the filled bar instead of vanishing into it. */
export function meter(label, value, max, tone, ticks = []) {
  const marks = ticks.filter((t) => t > 0 && t < max)
    .map((t) => `<u class="${value >= t ? 'is-past' : ''}" style="--at:${(t / max) * 100}%"></u>`).join('');
  return `
  <div class="pmeter tone-${tone}">
    <div class="pmeter-head"><span>${label}</span><b>${value}</b><em>/ ${max}</em></div>
    <div class="pmeter-track"><i style="--pct:${pct(value, max)}%"></i>${marks}</div>
  </div>`;
}

/* A section heading inside a page: name, a note on what the numbers are, a rule that
   takes the slack, and an optional trailing hint. */
export const section = (title, note, hint = '') => `
  <div class="ppage-head">
    <b>${title}</b><span>${note}</span><i></i>${hint ? `<em>${hint}</em>` : ''}
  </div>`;
