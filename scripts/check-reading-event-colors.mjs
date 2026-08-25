import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const source = readFileSync('外部部署/V20260826/正文美化.html', 'utf8')
  .replace(/^```\s*\r?\n/, '')
  .replace(/\r?\n```\s*$/, '');
const port = 5231;
const server = await createServer({ server: { port }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ headless: true });
mkdirSync('artifacts/reading-event-colors', { recursive: true });
const failures = [];

for (const mode of ['native', 'tt-mobile']) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ...(mode === 'tt-mobile' ? { userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/139 Mobile Safari/537.36' } : {}),
  });
  if (mode === 'tt-mobile') {
    await page.addInitScript(() => { window.__TAURITAVERN__ = { abiVersion: 1 }; });
  }
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 204, body: '' }));
  await page.route('https://fontsapi.zeoseven.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.setContent('<iframe id="reader" style="display:block;width:100%;height:100%;border:0"></iframe>');
  if (mode === 'tt-mobile') {
    await page.evaluate(() => { window.__TAURITAVERN__ = { abiVersion: 1 }; });
  }
  const frameSource = mode === 'tt-mobile'
    ? source.replace('</head>', '<style>:root{--tt-base-viewport-height:844px}</style></head>')
    : source;
  await page.locator('#reader').evaluate((frame, html) => { frame.srcdoc = html; }, frameSource);
  const reader = page.frameLocator('#reader');
  await reader.locator('body').waitFor({ timeout: 20000 });
  await page.waitForTimeout(900);
  await reader.locator('body').evaluate(body => {
    const html = window.eval('renderSuddenEvent(EVT_DEMO, 0)');
    body.dataset.theme = 'warm-white';
    const host = document.createElement('main');
    host.id = 'eventColorProbe';
    host.className = 'reading-content';
    host.innerHTML = html;
    body.replaceChildren(host);
    body.classList.remove('theme-preload', 'render-pending');
  });
  await reader.locator('.evt-wrap').waitFor({ timeout: 5000 });

  const result = await reader.locator('.evt-wrap').evaluate(root => {
    const glass = root.querySelector('.evt-glass');
    const body = root.querySelector('.evt-a > .evt-glass > .body');
    const option = root.querySelector('.evt-opt:not(.locked)') || root.querySelector('.evt-opt');
    const locked = root.querySelector('.evt-opt.locked');
    const edge = root.querySelector('.evt-edge');
    return {
      ttMobile: document.documentElement.dataset.ttMobile || '',
      viewportContract: getComputedStyle(document.documentElement).getPropertyValue('--tt-base-viewport-height').trim(),
      userAgent: navigator.userAgent,
      hasSync: typeof window.__syncTtMobileHost,
      glassBackground: getComputedStyle(glass).backgroundColor,
      bodyBackground: getComputedStyle(body).backgroundColor,
      optionBackground: getComputedStyle(option).backgroundColor,
      optionScheme: getComputedStyle(option).colorScheme,
      lockedOpacity: locked ? Number(getComputedStyle(locked).opacity) : null,
      lockedFilter: locked ? getComputedStyle(locked).filter : null,
      backdropFilter: getComputedStyle(glass).backdropFilter || getComputedStyle(glass).webkitBackdropFilter || '',
      edgeBlend: getComputedStyle(edge).mixBlendMode,
    };
  });

  const expectedTt = mode === 'tt-mobile';
  const ok = result.ttMobile === (expectedTt ? '1' : '')
    && (!expectedTt || result.bodyBackground === 'rgb(21, 27, 56)')
    && (!expectedTt || result.optionBackground === 'rgb(37, 46, 90)')
    && (!expectedTt || result.optionScheme === 'dark')
    && (!expectedTt || result.lockedOpacity === 1)
    && (!expectedTt || result.lockedFilter === 'none')
    && (!expectedTt || result.backdropFilter === 'none')
    && (!expectedTt || result.edgeBlend === 'screen');
  if (!ok) failures.push(`${mode}: ${JSON.stringify(result)}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${mode.padEnd(10)} ${JSON.stringify(result)}`);
  await reader.locator('.evt-wrap').screenshot({ path: `artifacts/reading-event-colors/${mode}.png` });
  await page.close();
}

await browser.close();
await server.close();
if (failures.length) {
  console.log('\nreading event color regression:');
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('\nReading event colors: all checks passed');
