/** 按指定窗口尺寸出一张，验不同比例下的最小缩放 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const w = Number(process.argv[2] || 1024), h = Number(process.argv[3] || 580);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(pathToFileURL(path.resolve('city/plate_map.html')).href);
await page.waitForTimeout(1600);
await page.screenshot({ path: `artifacts/fit-${w}x${h}.jpg`, type: 'jpeg', quality: 82 });
await browser.close();
console.log(`artifacts/fit-${w}x${h}.jpg`);
