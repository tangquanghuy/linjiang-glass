/* Scroll-performance regression for the lifted SillyTavern HUD.
   The shell temporarily removes backdrop-filter sampling while #chat moves;
   without that mode the desktop fixture drops to roughly 30 fps.

   注意这支脚本量的是**顶层文档的 rAF 帧时**，它对滚动的真实成本并不敏感 —— 那部分在光栅
   和合成线程上，8 倍 CPU 降频下这里的帧时依然稳定在 16.7ms。它守住的是别的东西：
   host-scroll-active 的开关时序、触摸转发、以及 HUD 与栏位的对齐。

   逐帧重光栅那一类回退由 scripts/check-hud-raster-perf.mjs 负责（跑在源码驱动的
   tools/tavern-live-fixture 上，抓 trace 里的光栅/绘制，并直接断言壳层的移动机制）。
   两支都要跑。 */
import { createServer } from 'vite';
import { chromium } from 'playwright';

const port = 5214;
const server = await createServer({ server: { port }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch();
const failures = [];
const errors = [];

const presets = [
  { id: 'desktop-work', label: 'desktop', width: 1440, height: 900 },
  { id: 'phone-iphone', label: 'phone', width: 390, height: 844, mobile: true, tauri: true },
];

for (const preset of presets) {
  const page = await browser.newPage({
    viewport: { width: preset.width, height: preset.height },
    deviceScaleFactor: preset.mobile ? 2 : 1,
    isMobile: !!preset.mobile,
    hasTouch: !!preset.mobile,
  });
  if (preset.tauri) {
    await page.addInitScript(() => { window.__TAURITAVERN__ = { abiVersion: 1 }; });
  }
  page.on('pageerror', (error) => errors.push(`${preset.label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      errors.push(`${preset.label}: ${message.text()}`);
    }
  });

  await page.goto(
    `http://127.0.0.1:${port}/tools/tavern-real-fixture.html?chrome=0&preset=${preset.id}&sheld=50`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(async () => {
    try { return !!(await window.__linjiangTavernReal?.waitUntilReady?.(100)); }
    catch { return false; }
  }, { timeout: 25000 });

  await page.evaluate(() => {
    const chat = document.getElementById('chat');
    const frame = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
    const pane = chat.getBoundingClientRect();
    chat.scrollTop = Math.max(0, chat.scrollTop + frame.top - pane.top - 8);
  });
  await page.waitForTimeout(180);

  const result = await page.evaluate(async () => {
    const chat = document.getElementById('chat');
    const hud = document.getElementById('linjiang-hud-live');
    const hudHtml = hud.contentDocument.documentElement;
    const frameTimes = [];
    let activeFrames = 0;
    let last = performance.now();

    await new Promise((resolve) => {
      let frame = 0;
      const step = (now) => {
        frameTimes.push(now - last);
        last = now;
        chat.scrollTop += 3;
        if (hudHtml.classList.contains('host-scroll-active')) activeFrames += 1;
        if (++frame < 180) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    frameTimes.shift();
    frameTimes.sort((a, b) => a - b);
    const percentile = (value) => frameTimes[
      Math.min(frameTimes.length - 1, Math.floor(frameTimes.length * value))
    ] || 0;
    const activeAtEnd = hudHtml.classList.contains('host-scroll-active');
    await new Promise((resolve) => setTimeout(resolve, 240));

    return {
      p50: percentile(.50),
      p95: percentile(.95),
      p99: percentile(.99),
      max: frameTimes.at(-1) || 0,
      over32: frameTimes.filter((value) => value > 32).length,
      activeFrames,
      activeAtEnd,
      clearedAfterIdle: !hudHtml.classList.contains('host-scroll-active'),
      visibility: getComputedStyle(hud).visibility,
      performanceMode: hudHtml.dataset.hudPerformance || '',
      alignment: (() => {
        const slot = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
        const frame = hud.getBoundingClientRect();
        return frame.top - slot.top;
      })(),
    };
  });

  const smooth = result.p95 <= 25 && result.over32 <= 10;
  const modeWorked = preset.tauri
    ? result.performanceMode === 'low' && result.activeFrames === 0
      && !result.activeAtEnd && result.clearedAfterIdle
    : result.activeFrames >= 150 && result.activeAtEnd && result.clearedAfterIdle;
  const aligned = Math.abs(result.alignment) <= 1;
  if (!smooth) failures.push(`${preset.label}: p95=${result.p95.toFixed(1)}ms, >32ms=${result.over32}`);
  if (!modeWorked) failures.push(`${preset.label}: scroll mode ${JSON.stringify(result)}`);
  if (result.visibility !== 'visible') failures.push(`${preset.label}: HUD became ${result.visibility}`);
  if (!aligned) failures.push(`${preset.label}: HUD/slot alignment ${result.alignment}px`);

  console.log(
    `${smooth && modeWorked && aligned && result.visibility === 'visible' ? 'ok  ' : 'FAIL'}  `
    + `${preset.label.padEnd(8)} p50 ${result.p50.toFixed(1)}ms  p95 ${result.p95.toFixed(1)}ms  `
    + `p99 ${result.p99.toFixed(1)}ms  >32ms ${result.over32}  active ${result.activeFrames}/179 `
    + `perf ${result.performanceMode} align ${result.alignment.toFixed(1)}`,
  );

  if (preset.tauri) {
    await page.evaluate(() => {
      const chat = document.getElementById('chat');
      const slot = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
      const pane = chat.getBoundingClientRect();
      chat.scrollTop = Math.max(0, chat.scrollTop + slot.top - pane.top - 30);
    });
    await page.waitForTimeout(200);
    const point = await page.evaluate(() => {
      const chat = document.getElementById('chat');
      const hud = document.getElementById('linjiang-hud-live').getBoundingClientRect();
      const pane = chat.getBoundingClientRect();
      return {
        x: hud.left + hud.width / 2,
        y: Math.max(pane.top + 120, hud.top + 120),
        before: chat.scrollTop,
      };
    });
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
    });
    for (let index = 1; index <= 24; index += 1) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: point.x, y: point.y - index * 7, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const touch = await page.evaluate((before) => {
      const chat = document.getElementById('chat');
      const hud = document.getElementById('linjiang-hud-live').getBoundingClientRect();
      const slot = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
      return { delta: chat.scrollTop - before, alignment: hud.top - slot.top };
    }, point.before);
    const touchWorked = touch.delta > 100 && Math.abs(touch.alignment) <= 1;
    if (!touchWorked) failures.push(`${preset.label}: touch forwarding ${JSON.stringify(touch)}`);
    console.log(`  ${touchWorked ? 'ok  ' : 'FAIL'}  phone touch forwarded ${touch.delta.toFixed(0)}px, align ${touch.alignment.toFixed(1)}px`);
  }
  await page.close();
}

await browser.close();
await server.close();

if (errors.length) failures.push(...[...new Set(errors)]);
if (failures.length) {
  console.log('\nscroll performance regression:');
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('\nHUD host-scroll performance: all checks passed');
