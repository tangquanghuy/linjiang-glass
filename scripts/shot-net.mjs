/**
 * 路网层截图。要看的是「中频有没有立起来」：
 * 总览档地铁线是不是读得出网络，进区之后水系有没有让位给底板像素，
 * 以及行程面板摆在那儿会不会压住别的东西。
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = pathToFileURL(path.resolve('city/plate_map.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) console.log('CONSOLE:', m.text()); });
await page.goto(file);
await page.waitForTimeout(1800);

const shot = n => page.screenshot({ path: `artifacts/net-${n}.jpg`, type: 'jpeg', quality: 82 });

// 1. 全城：只有路网，没有行程
await page.evaluate(() => window.__setView(0.5, 0.5, 1.0));
await page.waitForTimeout(700);
await shot('1-city');

// 2. 全城 + 一条横穿全城的行程
const quote = await page.evaluate(() => {
  const all = window.PLATE_MAP.plan('lx_library');
  window.__setView(0.5, 0.5, 1.0);
  return all && Object.keys(all).reduce((o, k) => (o[k] = all[k] && all[k].min, o), {});
});
console.log('横穿全城四种方式时长:', JSON.stringify(quote));
await page.waitForTimeout(900);
await shot('2-trip-city');

// 3. 换成打车看面板变化
await page.evaluate(() => window.PLATE_MAP.setMode('taxi'));
await page.waitForTimeout(600);
await shot('3-trip-taxi');

// 4. 中景：区卡淡出
await page.evaluate(() => { window.PLATE_MAP.clearTrip(); window.__setView(0.40, 0.42, 2.0); });
await page.waitForTimeout(900);
await shot('4-mid');

// 4b. 打开「路网」这一级视图：站名 + 图例 + 线提亮
await page.evaluate(() => window.PLATE_MAP.netView(true));
await page.waitForTimeout(700);
await shot('4b-netview');

// 4c. 总览档的路网视图——图例和换乘站名要在这一档就读得出来
await page.evaluate(() => window.PLATE_MAP.fitAll(0));
await page.waitForTimeout(700);
await shot('4c-netview-city');

// 5. 区级：路网退回淡的那一档
await page.evaluate(() => {
  window.PLATE_MAP.netView(false);
  window.PLATE_MAP.plan('lx_library');
  window.__setView(0.315, 0.685, 3.3);
});
await page.waitForTimeout(1000);
await shot('5-district');

// 6. 竖屏
await page.setViewportSize({ width: 414, height: 896 });
await page.waitForTimeout(1200);
await page.evaluate(() => window.PLATE_MAP.fitAll(0));
await page.waitForTimeout(900);
await shot('6-portrait');

const st = await page.evaluate(() => ({
  stations: document.querySelectorAll('#nodes .st').length,
  stOn: [...document.querySelectorAll('#nodes .st')].filter(e => +getComputedStyle(e).opacity > 0.3).length,
  trip: !document.getElementById('trip').hidden,
  scale: document.getElementById('scale').firstElementChild.textContent
}));
console.log('站名 DOM', st.stations, '在场', st.stOn, '· 行程面板', st.trip, '· 比例尺', st.scale);
await browser.close();
