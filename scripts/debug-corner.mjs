/* Dump the generated portrait panel paths and crop the ear corner, so the rim
   defect can be read off the path data rather than guessed at. */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const server = await createServer({ server: { port: 5195 }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch();
/* A narrow viewport so the column fills it (k is capped for wide containers), and a
   high device scale factor so the crop is still legible at 3x device pixels. */
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
await page.goto('http://127.0.0.1:5195/?mode=portrait', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.pcontent > .ppanel')].map((p) => ({
    id: p.dataset.panel,
    earTop: p.offsetTop,
    bottom: p.offsetTop + p.offsetHeight,
  }));
  const clips = [...document.querySelectorAll('.pdefs clipPath')].map((c) => ({
    id: c.id,
    d: c.querySelector('path').getAttribute('d'),
  }));
  const rims = [...document.querySelectorAll('.prim > g')].map((g, i) => ({
    group: i,
    clip: g.getAttribute('clip-path'),
    strokes: g.children.length,
  }));
  /* Every top-level stroke in the rim layer, i.e. the crisp segments. */
  const top = [...document.querySelectorAll('.prim > path')].map((p) => ({
    stroke: p.getAttribute('stroke'),
    width: p.getAttribute('stroke-width'),
    d: p.getAttribute('d'),
  }));
  return { panels, clips, rims, top };
});

mkdirSync('artifacts', { recursive: true });
const girls = info.panels.find((p) => p.id === 'girls');
const status = info.panels.find((p) => p.id === 'status');
/* Canvas units -> real pixels: the column is scaled by k and centred by the stage,
   so a crop expressed in canvas coordinates has to go through both. */
const view = await page.evaluate(() => {
  const s = document.querySelector('.pscale');
  return { k: Number(getComputedStyle(s).getPropertyValue('--k')), left: s.offsetLeft };
});
const toReal = (v) => v * view.k;
/* Both ears, so the two ornaments can be compared side by side -- they are meant to
   be different flowers, not the same one twice. */
for (const [name, p] of [['status', status], ['girls', girls]]) {
  await page.screenshot({
    path: `artifacts/corner-${name}.png`,
    clip: {
      x: view.left + toReal(10),
      y: toReal(p.earTop - 80),
      width: toReal(400),
      height: toReal(210),
    },
  });
}

await browser.close();
await server.close();

console.log('\npanels:');
info.panels.forEach((p) => console.log(`  ${p.id.padEnd(9)} earTop ${p.earTop}  bottom ${p.bottom}`));

console.log('\nclip paths:');
for (const c of info.clips) {
  console.log(`\n  ${c.id}`);
  c.d.split(/(?=[MLAZ] )/).forEach((seg) => console.log(`    ${seg.trim()}`));
}

console.log('\ncrisp rim strokes touching the left edge (x=33):');
for (const t of info.top) {
  if (!/(^|[ ])33[ ]/.test(t.d) && !t.d.includes(' 33 ')) continue;
  console.log(`  w${t.width} ${t.stroke}`);
  console.log(`    ${t.d}`);
}
console.log('\nwrote artifacts/corner-girls.png');
