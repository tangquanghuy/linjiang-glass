/**
 * 底板地图小样截图。按缩放档位出图——分级是连续的，
 * 得看几个中间态才知道各层的进退咬不咬得住。
 * 输出压成 1440x810 的 JPEG：PNG@1.5x 有 6MB，读不进来。
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// 不带 ?dev=1：出图要的是干净的地图，开发条不该在里面
const file = pathToFileURL(path.resolve('city/plate_map.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

await page.goto(file);
await page.waitForTimeout(1800);

// 乌溪区 footprint 中心 (0.315, 0.685)，沿着它一路推近。
// z 是按乌溪的 r 反推的：footprint 宽 0.33，所以 r ≈ 0.33z
const WX = [0.315, 0.685];
const shots = [
  ['z1-city', 0.5, 0.5, 1.0],        // r 0.33 全城
  ['z2-approach', 0.42, 0.60, 1.9],  // r 0.63 区卡淡出中
  ['z3-fade', WX[0], WX[1], 2.6],    // r 0.86 溶解
  ['z4-district', WX[0], WX[1], 3.3], // r 1.09 区级
  ['z5-detail', WX[0], WX[1], 4.3],  // r 1.42 次级地点齐了
  ['z6-deep', WX[0], WX[1], 5.8]     // r 1.91 子场景
];

const only = process.argv[2];
for (const [name, cx, cy, z] of shots) {
  if (only && !name.includes(only)) continue;
  await page.evaluate(([a, b, c]) => window.__setView(a, b, c), [cx, cy, z]);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `artifacts/pm-${name}.jpg`, type: 'jpeg', quality: 80 });
}

// 别的区：确认 footprint 摆放和淡入不是只对乌溪成立
if (!only) {
  for (const k of ['minghu', 'yushi']) {
    await page.evaluate(a => window.__focus(a), k);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `artifacts/pm-d-${k}.jpg`, type: 'jpeg', quality: 80 });
  }
}

// 时段：推到区级看，低倍率看不出调色差别
if (!only) {
  await page.evaluate(() => window.__setView(0.315, 0.685, 3.4));
  for (const ph of ['暮', '深夜']) {
    await page.evaluate(p => window.__setPhase(p), ph);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `artifacts/pm-phase-${ph}.jpg`, type: 'jpeg', quality: 80 });
  }
}

console.log(JSON.stringify(await page.evaluate(() => window.__view())));
await browser.close();
