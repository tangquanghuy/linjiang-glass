/* Is the rectangular seam near the ear coming from the background plate?

   bg-plate.png is the landscape scene, 1672x941, and it carries a *baked* reflection
   of the landscape HUD (tools/calibrate_plate.py solves for the plate that makes the
   composite land on the prototype).  Cover-fitting that into a tall portrait box
   scales it about 2x and shows a narrow vertical slice, so fragments of those baked
   edges can surface as hard-edged shapes.  This shoots the same crop with the plate
   shown and hidden so the difference is visible.
*/

import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 5194 }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
await page.goto('http://127.0.0.1:5194/?mode=portrait', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

const view = await page.evaluate(() => {
  const s = document.querySelector('.pscale');
  const girls = document.querySelector('[data-panel="girls"]');
  const plate = document.querySelector('.pplate');
  const r = plate.getBoundingClientRect();
  return {
    k: Number(getComputedStyle(s).getPropertyValue('--k')),
    left: s.offsetLeft,
    earTop: girls.offsetTop,
    plateBox: { w: Math.round(r.width), h: Math.round(r.height) },
    natural: { w: plate.naturalWidth, h: plate.naturalHeight },
  };
});

const toReal = (v) => v * view.k;
const clip = {
  x: view.left + toReal(10),
  y: toReal(view.earTop - 110),
  width: toReal(470),
  height: toReal(260),
};

await page.screenshot({ path: 'artifacts/plate-on.png', clip });
await page.evaluate(() => { document.querySelector('.pplate').style.visibility = 'hidden'; });
await page.waitForTimeout(200);
await page.screenshot({ path: 'artifacts/plate-off.png', clip });

await browser.close();
await server.close();

const cover = Math.max(view.plateBox.w / view.natural.w, view.plateBox.h / view.natural.h);
console.log(`\n  plate ${view.natural.w}x${view.natural.h} drawn into ${view.plateBox.w}x${view.plateBox.h}`);
console.log(`  object-fit: cover scale = ${cover.toFixed(2)}x`);
console.log(`  visible slice of the source: ${Math.round(view.plateBox.w / cover)}px `
  + `of ${view.natural.w} wide (${Math.round((view.plateBox.w / cover / view.natural.w) * 100)}%)`);
console.log('\n  wrote artifacts/plate-on.png and artifacts/plate-off.png\n');
