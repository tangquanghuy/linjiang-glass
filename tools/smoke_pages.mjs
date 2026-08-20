import { chromium } from 'playwright';

const url = process.env.HUD_URL || 'http://127.0.0.1:5174/';
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
await page.screenshot({ path: 'artifacts/hud.png' });
await page.screenshot({ path: 'artifacts/hud_stamina.png', clip: { x: 20, y: 630, width: 500, height: 90 } });

/* 背包 no longer opens a page: it opens the bottom drawer, and a cell in the drawer
   is what opens the page.  So the inventory row needs two clicks, which is why the
   trigger is a list rather than one selector. */
const shots = [
  ['events', ['.pane-pod .tool-btn[data-page="events"]'], '.events-page'],
  ['inventory', ['.pane-pod .tool-btn[data-page="inventory"]', '.drawer-slot'], '.inventory-page'],
  ['map', ['.pane-pod .tool-btn[data-page="map"]'], '.map-layer'],
  ['profile', ['.btn-ghost'], '.profile-page'],
];

for (const [name, triggers, expect] of shots) {
  // Twice: the first peels any page, the second the drawer or the dock under it.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  for (const trigger of triggers) {
    await page.locator(trigger).first().click();
    await page.waitForTimeout(200);
  }
  await page.waitForSelector(expect, { timeout: 3000 });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `artifacts/page_${name}.png` });
  console.log(`${name.padEnd(10)} ok`);
}

// profile -> dock -> archive round trip.  Escape rather than a collapse button:
// pages.js dropped "收起到上方速览" once it was clear Escape and x already did it.
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
await page.locator('.pane-pod .tool-btn[data-page="inventory"]').click();
await page.waitForTimeout(150);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
await page.locator('.btn-ghost').click();
await page.waitForSelector('.profile-page', { timeout: 3000 });
// The roster is a column now, not a fold: nothing on this page grows on a click, which
// is what the fold got wrong inside a sheet of fixed height.
await page.locator('.profile-fan').first().click();
await page.waitForSelector('.dock-root', { timeout: 3000 });
await page.locator('[data-character-full]').click();
await page.waitForSelector('.character-archive', { timeout: 3000 });
await page.keyboard.press('Escape');
await page.waitForSelector('.dock-root', { timeout: 3000 });
if (await page.locator('.page-modal').count()) throw new Error('Escape left the archive open');
console.log('round trip ok');

await browser.close();
if (errors.length) {
  console.log('\nERRORS:');
  errors.forEach((e) => console.log(' -', e));
  process.exitCode = 1;
} else {
  console.log('no console/page errors');
}
