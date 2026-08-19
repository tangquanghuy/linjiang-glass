import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = pathToFileURL(path.resolve('city/sample_wuxi.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
await page.goto(file);
await page.waitForTimeout(800);

for (const p of ['朝', '暮', '夜']) {
  await page.evaluate(v => window.__setPhase(v), p);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `artifacts/wuxi-${p}.png` });
}
await browser.close();
console.log('ok');
