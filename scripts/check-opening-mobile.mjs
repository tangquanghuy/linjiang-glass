import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { PROJECT_ROOT } from './lib/real-tavern-sources.mjs';
import { join } from 'node:path';

const server = await startFixtureServer({ port: 5252 });
const browser = await chromium.launch();
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const mobileUa = 'Mozilla/5.0 (Linux; Android 15; Tablet) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 TauriTavern/2.2.0';

const delayExternalDecoration = async (page) => {
  await page.route(/https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|anchor\.bolt\.qzz\.io)\/.*/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.abort().catch(() => {});
  });
};

console.log('\n=== opening overlay readiness with stalled decoration ===');
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: mobileUa });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await delayExternalDecoration(page);
  let card = readFileSync(join(PROJECT_ROOT, '\u5916\u90e8\u90e8\u7f72', 'V20260826', '\u5f00\u5c40.html'), 'utf8');
  card = card.replace(
    /const OPENING_URL = '[^']+';/,
    `const OPENING_URL = ${JSON.stringify(`${server.url}/opening.html?v=opening-mobile-check`)};`,
  );
  await page.setContent('<!doctype html><html><body style="margin:0;background:#101018"><iframe id="shell" style="width:100%;height:500px;border:0"></iframe></body></html>');
  await page.locator('#shell').evaluate((frame, html) => { frame.srcdoc = html; }, card);
  const shell = page.frameLocator('#shell');
  await shell.locator('#open').click();
  await page.waitForSelector('#linjiang-opening-overlay');
  const started = Date.now();
  await page.waitForFunction(() => !document.querySelector('#linjiang-opening-overlay .lj-loader'), { timeout: 3500 });
  const elapsed = Date.now() - started;
  const overlay = await page.evaluate(() => {
    const frame = document.querySelector('#linjiang-opening-overlay iframe');
    return { src: frame?.src || '', loader: !!document.querySelector('#linjiang-opening-overlay .lj-loader') };
  });
  check(elapsed < 3500 && !overlay.loader, 'ready handshake dismisses 92% loader before stalled fonts/images', `${elapsed}ms`);
  check(errors.length === 0, 'overlay has no script errors', errors.slice(0, 3).join(' | '));
  await page.close();
}

console.log('\n=== TT tablet opening layout ===');
{
  const page = await browser.newPage({ viewport: { width: 1548, height: 916 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: mobileUa });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await delayExternalDecoration(page);
  await page.goto(`${server.url}/opening.html?v=opening-mobile-check`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.panel[data-panel="1"].active');
  const initialMapSrc = await page.locator('#opening-map-iframe').getAttribute('src');
  check(!initialMapSrc, 'map iframe is deferred on the first step', initialMapSrc || '(empty)');
  await page.locator('#player-name').fill('Test Player');
  await page.locator('.step-tab[data-step="3"]').click();
  await page.waitForSelector('body.oshi-step');
  const layout = await page.evaluate(() => {
    const grid = document.querySelector('#oshi-grid');
    const cards = [...grid.querySelectorAll('.oshi-card')];
    const columns = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
    const tops = cards.map((card) => Math.round(card.getBoundingClientRect().top));
    const firstTop = tops[0];
    const firstRow = tops.filter((top) => Math.abs(top - firstTop) <= 1).length;
    const bodyWidths = cards.slice(0, firstRow).map((card) => Math.round(card.querySelector('.oshi-body').getBoundingClientRect().width));
    return {
      touch: document.documentElement.classList.contains('touch-device'),
      columns, firstRow, bodyWidths, minBody: Math.min(...bodyWidths),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  check(layout.touch, 'Android/TT runtime marks the opening page as touch-device');
  check(layout.columns === 3 && layout.firstRow === 3, '1548px touch tablet uses three readable cards per row', JSON.stringify(layout));
  check(layout.minBody >= 220, 'tablet card copy column stays readable', `${layout.minBody}px`);
  check(layout.overflowX <= 1, 'tablet opening page has no horizontal overflow', `${layout.overflowX}px`);
  await page.screenshot({ path: join(PROJECT_ROOT, 'artifacts', 'opening-tablet-tt.png'), fullPage: true });
  await page.locator('.step-tab[data-step="2"]').click();
  await page.waitForFunction(() => !!document.querySelector('#opening-map-iframe')?.getAttribute('src'));
  const mapSrc = await page.locator('#opening-map-iframe').getAttribute('src');
  check(/plate_map\.html/.test(mapSrc || ''), 'map starts when the player enters step 2', mapSrc || '(empty)');
  check(errors.length === 0, 'tablet page has no script errors', errors.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
await server.close();
if (failures.length) {
  console.log('\nopening mobile checks failed:');
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('\nopening mobile checks passed');
