/**
 * 开局页截图：四个步骤各一张，第二步额外截一张"已选住所 + 已选工作"的状态。
 * 地图是 iframe，等它把节点铺完再拍，不然拍到的是空底板。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = 'artifacts/opening';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto(`${BASE}/opening.html`, { waitUntil: 'load' });
await page.fill('#player-name', '林舟');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/step1.png` });

await page.click('#next');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/step2-home.png` });

// 选住所 → 自动切到工作层 → 选一个岗位，看路线和通勤卡
const frame = page.frameLocator('#opening-map-iframe');
await frame.locator('[data-k="N:gl_yunting"]').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/step2-work.png` });
await frame.locator('[data-k="N:mh_hospital"]').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/step2-route.png` });

await page.click('#next');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/step3.png` });
await page.fill('#streamer-name', '沈遥');
await page.fill('#streamer-handle', '遥夜');
await page.click('#generate-profile');
await page.waitForTimeout(1500);
await page.click('#next');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/step4.png` });

await browser.close();
console.log('shots ->', OUT);
