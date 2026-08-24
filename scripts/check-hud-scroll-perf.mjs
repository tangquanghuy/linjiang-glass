/* Scroll-performance regression for the lifted SillyTavern HUD.
   The shell temporarily removes backdrop-filter sampling while #chat moves;
   without that mode the desktop fixture drops to roughly 30 fps. */
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
    const hud = window.__linjiangTavernReal.liveHud();
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
      alignment: window.__linjiangTavernReal.measure().alignment,
    };
  });

  const smooth = result.p95 <= 25 && result.over32 <= 10;
  const modeWorked = preset.tauri
    ? result.performanceMode === 'auto' && result.activeFrames === 0
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
      const hud = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
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
      return { delta: chat.scrollTop - before, alignment: window.__linjiangTavernReal.measure().alignment };
    }, point.before);
    const touchWorked = touch.delta > 100 && Math.abs(touch.alignment) <= 1;
    if (!touchWorked) failures.push(`${preset.label}: touch forwarding ${JSON.stringify(touch)}`);
    console.log(`  ${touchWorked ? 'ok  ' : 'FAIL'}  phone touch forwarded ${touch.delta.toFixed(0)}px, align ${touch.alignment.toFixed(1)}px`);

    const oscillation = await page.evaluate(async () => {
      const chat = document.getElementById('chat');
      let maxAlignment = 0;
      let maxTopLevelHud = 0;
      await new Promise((resolve) => {
        let frame = 0;
        const step = () => {
          chat.scrollTop += frame % 80 < 40 ? 7 : -7;
          const alignment = Math.abs(Number(window.__linjiangTavernReal.measure().alignment) || 0);
          maxAlignment = Math.max(maxAlignment, alignment);
          maxTopLevelHud = Math.max(maxTopLevelHud, document.querySelectorAll('#linjiang-hud-live').length);
          if (++frame < 320) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      return {
        maxAlignment,
        maxTopLevelHud,
        inlineHud: !!window.__linjiangTavernReal.statusFrame.contentDocument.getElementById('hud'),
      };
    });
    const oscillationWorked = oscillation.maxAlignment <= 1
      && oscillation.maxTopLevelHud === 0 && oscillation.inlineHud;
    if (!oscillationWorked) failures.push(`${preset.label}: repeated up/down ${JSON.stringify(oscillation)}`);
    console.log(`  ${oscillationWorked ? 'ok  ' : 'FAIL'}  repeated up/down align ${oscillation.maxAlignment.toFixed(1)}px, top-level HUD ${oscillation.maxTopLevelHud}`);
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
