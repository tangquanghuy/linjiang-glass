/* 小手机各屏截图：起 vite -> 打开预览页 -> 逐个 App 截图。
   用法： npm run phone:shot           桌面视口
          PHONE_MOBILE=1 npm run phone:shot   移动视口（走 ≤480 的响应式分支）
   产物： artifacts/phone/*.png */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const MOBILE = !!process.env.PHONE_MOBILE;
const OUT = 'artifacts/phone';
const viewport = MOBILE ? { width: 390, height: 844 } : { width: 1280, height: 900 };
const prefix = MOBILE ? 'm-' : '';

mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: 5199 }, logLevel: 'warn' });
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) problems.push(`console: ${m.text()}`);
});

await page.goto('http://127.0.0.1:5199/phone/preview/', { waitUntil: 'load' });
await page.evaluate(() => window.__openPhone());
await page.waitForSelector('#mobile-phone-overlay.active', { timeout: 5000 });

/* 壁纸是远程 webp，不等它就会截到纯色兜底背景 */
await page.evaluate(async () => {
  const url = getComputedStyle(document.querySelector('.mobile-phone-screen'))
    .backgroundImage.match(/url\("(.+?)"\)/)?.[1];
  if (!url) return;
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = url;
    setTimeout(resolve, 15000);
  });
});
try { await page.evaluate(() => document.fonts.ready); } catch { /* 字体没就绪也照截 */ }
await page.waitForTimeout(600);

/* 环境自检：图标字体和壁纸是远程资源，缺了截图会很误导人 */
const env = await page.evaluate(() => {
  const probe = document.createElement('i');
  probe.className = 'fas fa-gear';
  probe.style.cssText = 'position:absolute;visibility:hidden;font-size:32px';
  document.body.appendChild(probe);
  const glyphWidth = probe.getBoundingClientRect().width;
  probe.remove();
  const screen = document.querySelector('.mobile-phone-screen');
  const url = getComputedStyle(screen).backgroundImage.match(/url\("(.+?)"\)/)?.[1] || '';
  return { glyphWidth, wallpaperUrl: url };
});
const wallpaperOk = env.wallpaperUrl
  ? await page.evaluate((u) => new Promise((res) => {
      const i = new Image();
      i.onload = () => res(true);
      i.onerror = () => res(false);
      i.src = u;
    }), env.wallpaperUrl)
  : false;
console.log(`  图标字体 ${env.glyphWidth > 4 ? 'ok' : '缺失（图标会是空白）'}   壁纸 ${wallpaperOk ? 'ok' : '未加载（用兜底纯色）'}`);

/* 只截手机本体，省得整屏空背景 */
const frame = page.locator('.mobile-phone-frame').first();
const shoot = async (name) => {
  await page.waitForTimeout(400);
  await frame.screenshot({ path: `${OUT}/${prefix}${name}.png` });
  console.log(`  ${prefix}${name}`);
};

await shoot('home');

/* 壁纸页会去拉几十张远程 webp，迭代样式时用 PHONE_APPS=messages,friends 只截需要的 */
const ALL_APPS = ['messages', 'gallery', 'forum', 'friends', 'wallpaper', 'settings'];
const apps = process.env.PHONE_APPS ? process.env.PHONE_APPS.split(',').filter((a) => ALL_APPS.includes(a)) : ALL_APPS;
for (const app of apps) {
  await page.evaluate((a) => window.openAppPanel(a), app);
  await shoot(app);
  await page.evaluate(() => window.closeAppPanel && window.closeAppPanel());
  await page.waitForTimeout(200);
}

/* 确认弹窗：这次要验证的正是它在宽屏下能不能出来，所以整页截 */
/* 注意：不要 return 这个 promise —— 它只在用户点击后才 resolve，evaluate 会一直挂着 */
await page.evaluate(() => {
  window.showCustomConfirm({
    title: '确认购买',
    message: '要花 1200 金币买下这件东西吗？',
    icon: '🛒',
    itemInfo: { name: '月见草香水', desc: '据说能让人想起夏天的傍晚。', price: 1200 },
  });
});
await page.waitForSelector('.custom-confirm-overlay', { timeout: 3000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/${prefix}confirm.png` });
console.log(`  ${prefix}confirm`);

await browser.close();
await server.close();

if (problems.length) {
  console.log(`\n  页面报错 ${problems.length} 条：`);
  for (const p of [...new Set(problems)].slice(0, 12)) console.log(`    ${p}`);
} else {
  console.log('\n  无页面报错');
}
