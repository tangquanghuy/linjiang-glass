/* Boundary zoom: a gap between 明湖南沿 and 乌溪北沿 used to pin the
   camera on the overview, so pulling in only sharpened a blurry seam.
   Also: tiny zooms near zMin must not get sucked back to farthest. */

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const problems = [];
mkdirSync('artifacts', { recursive: true });
const file = pathToFileURL(path.resolve('city/plate_map.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto(file);
await page.waitForFunction(() => window.PLATE_MAP);
await page.waitForTimeout(400);

const FRAMES = {
  minghu: { x: 0.395, y: 0.130, w: 0.320 },
  wuxi: { x: 0.150, y: 0.520, w: 0.330 },
  guling: { x: 0.115, y: 0.170, w: 0.250 },
};

const inPlate = (x, y, f) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.w;
const anyPlate = (x, y) => Object.values(FRAMES).some((f) => inPlate(x, y, f));

/* Tiny zoom near min must stick (the old |z-zMin|<0.05 snap ate pinch). */
await page.evaluate(() => window.__setView(0.5, 0.5, 1.03));
await page.waitForTimeout(80);
const nudged = await page.evaluate(() => window.PLATE_MAP.view().z);
console.log(`tiny zoom from min  z=${nudged.toFixed(4)} (want ~1.03)`);
if (Math.abs(nudged - 1.03) > 0.02) problems.push(`tiny zoom snapped back to ${nudged}`);

/* The seam: south of 明湖, north of 乌溪, x where both districts' longitudes overlap. */
const gap = { x: 0.42, y: 0.485 };
await page.evaluate(([x, y]) => window.__setView(x, y, 2.1), [gap.x, gap.y]);
await page.waitForTimeout(200);
await page.screenshot({ path: 'artifacts/map-boundary-before.png' });
const before = await page.evaluate(() => window.PLATE_MAP.view());
console.log(`gap before  cx,cy=${before.cx.toFixed(3)},${before.cy.toFixed(3)} z=${before.z.toFixed(3)} inPlate=${anyPlate(before.cx, before.cy)}`);

for (let i = 0; i < 8; i++) {
  await page.evaluate(() => window.__zoomAt(innerWidth / 2, innerHeight / 2, 1.22));
}
await page.waitForTimeout(200);
await page.screenshot({ path: 'artifacts/map-boundary-after.png' });
const after = await page.evaluate(() => window.PLATE_MAP.view());
const entered = anyPlate(after.cx, after.cy);
console.log(`gap after   cx,cy=${after.cx.toFixed(3)},${after.cy.toFixed(3)} z=${after.z.toFixed(3)} inPlate=${entered}`);
if (after.z <= before.z + 0.2) problems.push(`boundary zoom did not advance (${before.z} -> ${after.z})`);
if (!entered) problems.push(`still in the seam after zoom-in (${after.cx}, ${after.cy})`);
const onEdge = Math.abs(after.cy - 0.45) < 0.012 || Math.abs(after.cy - 0.52) < 0.012;
if (onEdge) problems.push(`camera stuck on the plate edge (${after.cx}, ${after.cy})`);

/* Wheel at the seam, same as a finger pinch on the blur band. */
await page.evaluate(([x, y]) => window.__setView(x, y, 2.0), [gap.x, gap.y]);
const screen = await page.evaluate(() => {
  const v = window.PLATE_MAP.view();
  /* toScreen equivalent: put the gap under the cursor, then wheel. */
  return { x: innerWidth / 2, y: innerHeight / 2, z: v.z };
});
for (let i = 0; i < 6; i++) {
  await page.mouse.move(screen.x, screen.y);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(40);
}
const wheeled = await page.evaluate(() => window.PLATE_MAP.view());
const wheelIn = anyPlate(wheeled.cx, wheeled.cy);
console.log(`wheel after cx,cy=${wheeled.cx.toFixed(3)},${wheeled.cy.toFixed(3)} z=${wheeled.z.toFixed(3)} inPlate=${wheelIn}`);
await page.screenshot({ path: 'artifacts/map-boundary-wheel.png' });
if (!wheelIn) problems.push(`wheel zoom at seam did not enter a district (${wheeled.cx}, ${wheeled.cy})`);

/* 青屏山 has no plate — clicking the chip must still glide, not no-op. */
await page.evaluate(() => window.PLATE_MAP.fitAll(0));
await page.evaluate(() => window.PLATE_MAP.focus('qingping'));
await page.waitForTimeout(800);
const qing = await page.evaluate(() => window.PLATE_MAP.view());
console.log(`qingping    cx,cy=${qing.cx.toFixed(3)},${qing.cy.toFixed(3)} z=${qing.z.toFixed(3)}`);
if (qing.z < 1.4 || qing.cx < 0.7) problems.push(`qingping focus did not enter (${qing.cx}, ${qing.z})`);
await page.screenshot({ path: 'artifacts/map-boundary-qingping.png' });

await browser.close();
console.log('');
if (problems.length) {
  console.log('PROBLEMS:');
  problems.forEach((p) => console.log(' -', p));
  process.exitCode = 1;
} else {
  console.log('boundary zoom checks passed');
}
