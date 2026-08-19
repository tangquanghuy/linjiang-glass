/** 逐层关掉，看帧率是谁吃掉的 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto(pathToFileURL(path.resolve('city/plate_map.html')).href);
await page.waitForTimeout(1600);
await page.evaluate(() => window.__setView(0.32, 0.685, 3.6));
await page.waitForTimeout(600);

const fps = () => page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const loop = () => { if (++n < 100) requestAnimationFrame(loop); else res(Math.round(n * 1000 / (performance.now() - t0))); };
  requestAnimationFrame(loop);
}));

const steps = [
  ['原样', () => { }],
  ['关颗粒+暗角', () => { grain.style.display = 'none'; vignette.style.display = 'none'; }],
  ['关樱花', () => { document.querySelectorAll('.petal').forEach(p => p.remove()); }],
  ['关 canvas 光带', () => { link.style.display = 'none'; }],
  ['关底板 filter', () => { document.querySelectorAll('#plates img').forEach(i => i.style.filter = 'none'); }],
  ['关底板', () => { plates.style.display = 'none'; }]
];

for (const [label, fn] of steps) {
  await page.evaluate(`(${fn.toString()})()`);
  await page.waitForTimeout(400);
  console.log(label.padEnd(16) + (await fps()) + ' fps');
}
await browser.close();
