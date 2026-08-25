// 把 外部部署/V20260826/开局.html 放到一块模拟的酒馆聊天底上截图。
// 那张卡是要粘进角色卡楼层的，所以只在浏览器里单开是看不出问题的——
// 它得在一条深色（或浅色）聊天流中间还站得住。
// 卡里引的是 GitHub Pages 上的图，这里用 route 拦下来喂本地文件；
// breakStrip 把 opening-strip.webp 打成 404，用来验证回退到全尺寸原图那条路。
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARD = readFileSync(path.join(root, '外部部署/V20260826/开局.html'), 'utf8');
const BASE = 'https://tangquanghuy.github.io/linjiang-glass/assets/';
const LOCAL = {
  'opening-strip.webp': ['public/assets/opening-strip.webp', 'image/webp'],
  'opening-background.png': ['public/assets/opening-background.png', 'image/png'],
  'mark-sakura.png': ['public/assets/mark-sakura.png', 'image/png'],
};

const host = (w, bg = '#101014', fg = '#d6d6de') => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:${bg};color:${fg};font-family:system-ui}
.chat{width:${w}px;margin:0 auto;padding:18px 12px}
.msg{font-size:13px;padding:8px 4px;opacity:.8}
iframe{display:block;width:100%;border:0;background:transparent}
</style></head><body><div class="chat">
<div class="msg">Yeah! 20:20 · 剧情 · 楼层 12</div>
<div id="slot"></div>
<div class="msg">下一楼</div>
</div></body></html>`;

const shoot = async (name, width, viewport, breakStrip, theme = []) => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.route(BASE + '*', async (route) => {
    const file = route.request().url().slice(BASE.length).split('?')[0];
    if (breakStrip && file === 'opening-strip.webp') return route.fulfill({ status: 404, body: '' });
    const hit = LOCAL[file];
    if (!hit) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: hit[1], body: readFileSync(path.join(root, hit[0])) });
  });
  await page.setContent(host(width, ...theme), { waitUntil: 'load' });
  await page.evaluate(async (html) => {
    const frame = document.createElement('iframe');
    window.__f = frame;
    document.getElementById('slot').appendChild(frame);
    frame.contentDocument.open();
    frame.contentDocument.write(html);
    frame.contentDocument.close();
    try { await frame.contentDocument.fonts.ready; } catch (e) {}
  }, CARD);
  // 状态条是脚本事后加的一行，所以量两次高度：先给足空间等它出现，再把 iframe 贴合回去
  await page.waitForTimeout(2600);
  await page.evaluate(() => { window.__f.style.height = '900px'; });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const doc = window.__f.contentDocument;
    window.__f.style.height = (doc.getElementById('launch').getBoundingClientRect().bottom + 14) + 'px';
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(root, `artifacts/launch-${name}.png`), fullPage: true });
  const card = await page.frames()[1].locator('#launch').boundingBox();
  const scene = await page.frames()[1].evaluate(() => {
    const img = document.getElementById('scene');
    return { src: img.currentSrc || img.src, natural: img.naturalWidth, fallback: img.classList.contains('full') };
  });
  await browser.close();
  console.log(name, JSON.stringify({ card: card && { w: Math.round(card.width), h: Math.round(card.height) }, ...scene }));
};

await shoot('desktop', 1000, { width: 1080, height: 760 }, false);
await shoot('desktop-fallback', 1000, { width: 1080, height: 760 }, true);
await shoot('desktop-light', 1000, { width: 1080, height: 760 }, false, ['#f2f0f5', '#2c2c33']);
await shoot('phone', 390, { width: 400, height: 860 }, false);
