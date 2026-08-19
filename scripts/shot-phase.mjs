/** 四个时段各出一张，判调色 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(pathToFileURL(path.resolve('city/plate_map.html')).href);
await page.waitForTimeout(1700);

const z = Number(process.argv[2] || 3.3);
const [cx, cy] = z <= 1.2 ? [0.5, 0.5] : [0.315, 0.685];
await page.evaluate(([a, b, c]) => window.__setView(a, b, c), [cx, cy, z]);
await page.waitForTimeout(700);

const names = { '朝': 'dawn', '暮': 'dusk', '夜': 'night', '深夜': 'late' };
for (const [ph, en] of Object.entries(names)) {
  await page.evaluate(p => window.PLATE_MAP.setPhase(p), ph);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `artifacts/ph-${en}.jpg`, type: 'jpeg', quality: 80 });
}
await browser.close();
console.log('ok');
