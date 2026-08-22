// 正文美化.html 头部截图：移动端（收起/展开）+ 桌面端，多主题
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page_url = 'file:///' + path.join(root, '外部部署', '正文美化.html').replace(/\\/g, '/');
const outDir = path.join(root, 'artifacts', 'reader-header');
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { key: 'p390', width: 390, height: 844, mobile: true },
  { key: 'p360', width: 360, height: 780, mobile: true },
  { key: 'p320', width: 320, height: 640, mobile: true },
  { key: 'd1280', width: 1280, height: 800, mobile: false }
];

const measure = () => {
  const box = document.getElementById('inlineControls');
  const r = box.getBoundingClientRect();
  return {
    vw: window.innerWidth,
    w: +r.width.toFixed(1),
    ratio: +(r.width / window.innerWidth * 100).toFixed(1),
    right: +(window.innerWidth - r.right).toFixed(1),
    overflow: box.scrollWidth - box.clientWidth,
    cls: box.className,
    visibleChips: [...box.querySelectorAll('.control-btn[data-theme-key]')]
      .filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.themeKey)
  };
};

const browser = await chromium.launch();
for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile
  });
  const page = await ctx.newPage();
  await page.goto(page_url, { waitUntil: 'load' });
  await page.waitForTimeout(1400);

  console.log(vp.key, 'collapsed', JSON.stringify(await page.evaluate(measure)));
  await page.screenshot({ path: path.join(outDir, vp.key + '-collapsed.png'), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 300) } });

  if (vp.mobile) {
    // 点当前主题 -> 展开
    await page.click('.inline-controls .control-btn[data-theme-key].active');
    await page.waitForTimeout(400);
    console.log(vp.key, 'open     ', JSON.stringify(await page.evaluate(measure)));
    await page.screenshot({ path: path.join(outDir, vp.key + '-open.png'), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 300) } });

    // 选另一个主题 -> 应自动收回
    await page.click('.inline-controls .control-btn[data-theme-key="dark"]');
    await page.waitForTimeout(500);
    console.log(vp.key, 'picked   ', JSON.stringify(await page.evaluate(measure)), 'theme=', await page.evaluate(() => document.body.dataset.theme));
    await page.screenshot({ path: path.join(outDir, vp.key + '-picked-dark.png'), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 300) } });
  }
  await ctx.close();
}
await browser.close();
console.log('out:', outDir);
