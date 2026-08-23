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
  { id: 'phone-iphone', label: 'phone', width: 390, height: 844, mobile: true },
];

for (const preset of presets) {
  const page = await browser.newPage({
    viewport: { width: preset.width, height: preset.height },
    deviceScaleFactor: preset.mobile ? 2 : 1,
    isMobile: !!preset.mobile,
    hasTouch: !!preset.mobile,
  });
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
    };
  });

  const smooth = result.p95 <= 25 && result.over32 <= 10;
  const modeWorked = result.activeFrames >= 150 && result.activeAtEnd && result.clearedAfterIdle;
  if (!smooth) failures.push(`${preset.label}: p95=${result.p95.toFixed(1)}ms, >32ms=${result.over32}`);
  if (!modeWorked) failures.push(`${preset.label}: scroll mode ${JSON.stringify(result)}`);
  if (result.visibility !== 'visible') failures.push(`${preset.label}: HUD became ${result.visibility}`);

  console.log(
    `${smooth && modeWorked && result.visibility === 'visible' ? 'ok  ' : 'FAIL'}  `
    + `${preset.label.padEnd(8)} p50 ${result.p50.toFixed(1)}ms  p95 ${result.p95.toFixed(1)}ms  `
    + `p99 ${result.p99.toFixed(1)}ms  >32ms ${result.over32}  active ${result.activeFrames}/179`,
  );
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
