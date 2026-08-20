/* Every portrait page inside the real SillyTavern/JS-Slash-Runner fixture.
   Captures a vertically stitched image at the true 390x844 mobile viewport and
   audits horizontal overflow, clipped text, section-title wrapping and the
   portrait type floor. */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const server = await createServer({ server: { port: 5205 }, logLevel: 'warn' });
await server.listen();
const origin = 'http://127.0.0.1:5205';
const browser = await chromium.launch({ headless: true });
mkdirSync('artifacts/tavern-mobile-pages', { recursive: true });

const problems = [];
const pageErrors = [];
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ status: 204, body: '' }));
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('favicon')) pageErrors.push(message.text());
});

const url = new URL('/tools/tavern-real-fixture.html', origin);
url.searchParams.set('chrome', '0');
url.searchParams.set('preset', 'phone-iphone');
url.searchParams.set('sheld', '50');
await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(async () => {
  try { return !!(await window.__linjiangTavernReal?.waitUntilReady?.(100)); }
  catch { return false; }
}, { timeout: 25000 });
await page.waitForTimeout(500);

const hud = page.frameLocator('#linjiang-hud-live');

async function revealStatus() {
  await page.evaluate(() => {
    const chat = document.getElementById('chat');
    const frame = window.__linjiangTavernReal.statusFrame;
    const chatRect = chat.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    chat.scrollTop = Math.max(0, chat.scrollTop + frameRect.top - chatRect.top - 20);
  });
  await page.waitForTimeout(160);
}

async function closeWorkspace() {
  const map = await hud.locator('.map-layer').count();
  if (map) {
    await hud.locator('[data-map-close]').click();
    await hud.locator('.map-layer').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(180);
  }
  const opened = await hud.locator('html.is-page-open').count();
  if (opened) {
    await hud.locator('[data-page-close]').first().click();
    await hud.locator('.ppanel[data-panel="girls"]').waitFor({ timeout: 5000 });
    await page.waitForTimeout(180);
  }
  const preview = await hud.locator('.ppanel.is-preview').count();
  if (preview) {
    await hud.locator('[data-preview-close]').click();
    await page.waitForTimeout(180);
  }
  await revealStatus();
}

async function openRoute(route) {
  await closeWorkspace();
  if (route.kind === 'direct') {
    await hud.locator(route.trigger).click();
  } else if (route.kind === 'profile-child') {
    await hud.locator('.pbtn-ghost[data-page="profile"]').click();
    await hud.locator('.pprofile').waitFor({ timeout: 5000 });
    await hud.locator(route.trigger).click();
  } else if (route.kind === 'character') {
    await hud.locator('.prail > .pcard').first().click();
    await hud.locator('.ppanel.is-preview').waitFor({ timeout: 5000 });
    await hud.locator('[data-character-full]').evaluate((element) => element.click());
  } else if (route.kind === 'gift') {
    await hud.locator('.prail > .pcard').first().click();
    await hud.locator('.ppanel.is-preview').waitFor({ timeout: 5000 });
    await hud.locator('[data-gift-page]').evaluate((element) => element.click());
  }
  if (route.name === 'map') {
    await hud.locator('.map-layer').waitFor({ timeout: 5000 });
  } else {
    await hud.locator('.ppanel.is-page').waitFor({ timeout: 5000 });
  }
  await page.waitForTimeout(500);
}

async function auditPage(name) {
  return hud.locator('body').evaluate((body, pageName) => {
    const panel = body.querySelector('.ppanel.is-page');
    const scale = body.querySelector('.pscale');
    const k = Number(getComputedStyle(scale).getPropertyValue('--k')) || 1;
    const panelRect = panel.getBoundingClientRect();
    const outside = [];
    const clipped = [];
    let minType = Infinity;

    panel.querySelectorAll('*').forEach((element) => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const insideHorizontalRail = !!element.closest('.pschedule-today');
      if (!insideHorizontalRail && (rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1)) {
        outside.push({
          selector: element.className || element.tagName,
          text: element.textContent.trim().slice(0, 50),
          left: +(rect.left - panelRect.left).toFixed(1),
          right: +(rect.right - panelRect.right).toFixed(1),
        });
      }
      if (!element.children.length && element.textContent.trim()) {
        const size = parseFloat(style.fontSize) * k;
        if (size) minType = Math.min(minType, size);
        const overflowX = element.scrollWidth - element.clientWidth;
        const overflowY = element.scrollHeight - element.clientHeight;
        const intentionallyEllipsized = style.textOverflow === 'ellipsis';
        const clipsX = style.overflow === 'hidden' || style.overflow === 'clip'
          || style.overflowX === 'hidden' || style.overflowX === 'clip';
        const clipsY = style.overflow === 'hidden' || style.overflow === 'clip'
          || style.overflowY === 'hidden' || style.overflowY === 'clip';
        if (((clipsX && overflowX > 1) || (clipsY && overflowY > 1)) && !intentionallyEllipsized) {
          clipped.push({
            selector: element.className || element.tagName,
            text: element.textContent.trim().slice(0, 70),
            dx: overflowX,
            dy: overflowY,
            overflow: `${style.overflow}/${style.overflowX}/${style.overflowY}`,
          });
        }
      }
    });

    const wrappedHeadings = [];
    panel.querySelectorAll('.ppage-head').forEach((heading) => {
      heading.querySelectorAll('b, span, em').forEach((part) => {
        if (part.getClientRects().length > 1) wrappedHeadings.push(part.textContent.trim());
      });
    });

    return {
      pageName,
      aria: panel.getAttribute('aria-label'),
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      clientWidth: document.body.clientWidth,
      scrollHeight: document.body.scrollHeight,
      clientHeight: document.body.clientHeight,
      panelWidth: panelRect.width,
      minType: Number(minType.toFixed(1)),
      outside: outside.slice(0, 20),
      clipped: clipped.slice(0, 20),
      wrappedHeadings,
    };
  }, name);
}

async function stitchedScreenshot(path) {
  const metrics = await hud.locator('body').evaluate(() => ({
    height: Math.ceil(document.body.scrollHeight),
    viewport: Math.ceil(document.body.clientHeight),
    dpr: devicePixelRatio,
  }));
  const step = Math.max(1, metrics.viewport);
  const positions = [];
  for (let top = 0; top < metrics.height; top += step) positions.push(Math.min(top, Math.max(0, metrics.height - metrics.viewport)));
  const unique = [...new Set(positions)];
  let output = null;
  for (const top of unique) {
    await hud.locator('body').evaluate((body, y) => { body.scrollTop = y; }, top);
    await page.waitForTimeout(100);
    const image = PNG.sync.read(await page.screenshot({ fullPage: false }));
    if (!output) output = new PNG({ width: image.width, height: Math.ceil(metrics.height * metrics.dpr) });
    const destY = Math.round(top * metrics.dpr);
    const rows = Math.min(image.height, output.height - destY);
    PNG.bitblt(image, output, 0, 0, image.width, rows, 0, destY);
  }
  writeFileSync(path, PNG.sync.write(output));
  await hud.locator('body').evaluate((body) => { body.scrollTop = 0; });
}

const routes = [
  { name: 'events', label: '当日事件', kind: 'direct', trigger: '.ptool[data-page="events"]' },
  { name: 'inventory', label: '背包', kind: 'direct', trigger: '.ptool[data-page="inventory"]' },
  { name: 'map', label: '地图', kind: 'direct', trigger: '.ptool[data-page="map"]' },
  { name: 'profile', label: '主角档案', kind: 'direct', trigger: '.pbtn-ghost[data-page="profile"]' },
  { name: 'relations', label: '羁绊总览', kind: 'profile-child', trigger: '[data-page="relations"]' },
  { name: 'schedule', label: '开播日程', kind: 'profile-child', trigger: '[data-page="schedule"]' },
  { name: 'character', label: '女主角档案', kind: 'character' },
  { name: 'gift', label: '送礼', kind: 'gift' },
];

console.log('\n  real tavern mobile page audit · 390x844 @2x');
console.log(`  ${'-'.repeat(104)}`);
for (const route of routes) {
  await openRoute(route);
  if (route.name === 'map') {
    const mapOk = await hud.locator('.map-layer iframe').count();
    console.log(`  ${mapOk ? 'ok  ' : 'FAIL'}  ${route.label.padEnd(8)} overlay`);
    if (!mapOk) problems.push('map: overlay iframe missing');
    await page.screenshot({ path: 'artifacts/tavern-mobile-pages/map.png' });
    continue;
  }
  const result = await auditPage(route.name);
  const overflow = result.scrollWidth - result.clientWidth;
  const ok = overflow <= 1 && !result.outside.length && !result.clipped.length
    && !result.wrappedHeadings.length && result.minType >= 13;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${route.label.padEnd(8)} h=${String(result.scrollHeight).padEnd(5)} minType=${String(result.minType).padEnd(5)} overflow=${overflow} outside=${result.outside.length} clipped=${result.clipped.length} headings=${result.wrappedHeadings.length}`);
  if (!ok) {
    problems.push(`${route.name}: ${JSON.stringify({
      overflow,
      outside: result.outside,
      clipped: result.clipped,
      wrappedHeadings: result.wrappedHeadings,
      minType: result.minType,
    })}`);
  }
  const shotName = route.name === 'inventory' ? 'inventory-goods' : route.name;
  await stitchedScreenshot(`artifacts/tavern-mobile-pages/${shotName}.png`);

  if (route.name === 'inventory') {
    for (const [index, bucket] of [[1, 'consumable'], [2, 'material']]) {
      await hud.locator(`[data-inventory-page="${index}"]`).click();
      await page.waitForTimeout(350);
      const tabState = await hud.locator('body').evaluate((_, selected) => ({
        selected: document.querySelector('[data-inventory-page][aria-selected="true"]')?.dataset.inventoryPage,
        visibleGroups: [...document.querySelectorAll('[data-inventory-page-panel]')]
          .filter((group) => !group.hidden).map((group) => group.dataset.inventoryPagePanel),
        visibleRows: [...document.querySelectorAll('[data-inventory-page-panel]')]
          .filter((group) => !group.hidden).reduce((sum, group) => sum + group.querySelectorAll('.pinv-row').length, 0),
        height: document.body.scrollHeight,
      }), index);
      const tabOk = Number(tabState.selected) === index
        && tabState.visibleGroups.join() === String(index)
        && tabState.visibleRows > 0;
      console.log(`        ${tabOk ? 'ok  ' : 'FAIL'}  inventory page ${index + 1}/3 ${bucket} rows=${tabState.visibleRows} h=${tabState.height}`);
      if (!tabOk) problems.push(`inventory-${bucket}: ${JSON.stringify(tabState)}`);
      await stitchedScreenshot(`artifacts/tavern-mobile-pages/inventory-${bucket}.png`);
    }
  }
}

await browser.close();
await server.close();

console.log(`  ${'-'.repeat(104)}`);
if (problems.length) {
  console.log(`${problems.length} page(s) need attention:`);
  problems.forEach((problem) => console.log(`  - ${problem}`));
}
if (pageErrors.length) {
  console.log('page errors:');
  [...new Set(pageErrors)].forEach((error) => console.log(`  - ${error}`));
}
if (!problems.length && !pageErrors.length) console.log('all mobile pages passed in the real tavern fixture');
if (problems.length || pageErrors.length) process.exit(1);
