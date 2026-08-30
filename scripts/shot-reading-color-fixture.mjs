/**
 * 正文美化 配色回归取图。
 *
 * 单独存在的理由：正文里大量颜色是由 color-mix()/自定义属性推导出来的，
 * 改配色管线（例如把 color-mix 换成预算好的通道变量）时，光看事件卡不够，
 * 对白气泡、心声、知己容器那几处也吃同一批 token。这里用一份合成 fixture
 * 把它们摆在同一屏里，4 个主题 × PC/移动各出一张，改动前后直接比像素。
 *
 * 用法：node scripts/shot-reading-color-fixture.mjs <outDir>
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'artifacts/reading-color-fixture';
const srcPath = process.argv[3] || '外部部署/V20260826/正文美化.html';
const source = readFileSync(srcPath, 'utf8')
  .replace(/^```\s*\r?\n/, '')
  .replace(/\r?\n```\s*$/, '');

const FIXTURE = `
<p>晨光落在窗台上，玻璃上的雾气还未散去，屋里只剩下呼吸声。</p>
<p class="inner-voice">她其实一直在等这句话，只是不肯先开口。</p>
<p class="named-inner-voice">塔菲：再等一会儿也没关系。</p>
<p>他低声说了句<span class="inline-dialogue-quote"><span class="quote-mark">「</span>别急<span class="quote-mark">」</span></span>，然后把杯子推了过去。</p>
<div class="dialogue-container">
  <div class="bubble-text">今晚的风比昨天软一点，你听得出来吗<em class="dialogue-em">（她偏过头）</em></div>
</div>
<div class="bubble-text">保温杯我留在石凳边了，等下别忘了拿。</div>
`;

const VIEWPORTS = [
  { name: 'pc', width: 1280, height: 1000, isMobile: false },
  { name: 'mob', width: 390, height: 900, isMobile: true },
];
const THEMES = ['warm-white', 'paper-white', 'dark', 'green'];

const port = 5239;
const server = await createServer({ server: { port }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ headless: true });
mkdirSync(outDir, { recursive: true });

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
    });
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ status: 204, body: '' }));
    await page.route('https://fontsapi.zeoseven.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.setContent('<iframe id="reader" style="display:block;width:100%;height:100%;border:0"></iframe>');
    await page.locator('#reader').evaluate((frame, html) => { frame.srcdoc = html; }, source);
    const reader = page.frameLocator('#reader');
    await reader.locator('body').waitFor({ timeout: 20000 });
    await page.waitForTimeout(700);

    await reader.locator('body').evaluate((body, { t, fixture }) => {
      // 主题切换带 420ms 过渡；不掐掉的话取图会落在插值中间，前后两次比像素没有意义。
      const kill = document.createElement('style');
      kill.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(kill);
      body.dataset.theme = t;
      body.classList.remove('theme-preload', 'render-pending');
      const content = document.getElementById('readingContent');
      // Keep #inlineControls (it carries the .inline-controls color-mix sites),
      // drop only the rendered prose so the fixture is deterministic.
      [...content.children].forEach(el => { if (el.id !== 'inlineControls' && el.id !== 'settingsPanel') el.remove(); });
      content.insertAdjacentHTML('beforeend', fixture);
      content.insertAdjacentHTML('beforeend', window.eval('renderSuddenEvent(EVT_DEMO, 0)'));
    }, { t: theme, fixture: FIXTURE });

    await reader.locator('.evt-wrap').waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/${vp.name}-${theme}.png`, fullPage: true });
    console.log(`shot ${vp.name}-${theme}`);
    await page.close();
  }
}

await browser.close();
await server.close();
