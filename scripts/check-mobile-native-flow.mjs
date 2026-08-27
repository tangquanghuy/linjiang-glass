/* Native mobile-flow regression.
   Verifies the browser-host architecture that replaces the lifted cross-origin HUD
   iframe on phones: the HUD bundle runs directly in Tavern Helper's srcdoc, touch
   scrolling is native, and desktop-only geometry controls are absent. */
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';
import { stubExternalRequests } from './lib/stub-external.mjs';

const meta = stageRealSources();
const server = await startFixtureServer({ port: 5225 });
const browser = await chromium.launch();
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};
const cases = [
  { id: 'android-inline', shell: 'inline', preset: 'phone-android', w: 360, h: 800 },
  { id: 'android-boot', shell: 'boot', preset: 'phone-iphone', w: 390, h: 844 },
];
const userAgent = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';

for (const kase of cases) {
  console.log(`\n=== ${kase.id} ${kase.w}x${kase.h} ===`);
  const page = await browser.newPage({
    viewport: { width: kase.w, height: kase.h }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, userAgent,
  });
  const session = await page.context().newCDPSession(page);
  const errors = [];
  const externalHosts = new Set();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const body = message.text();
    if (/favicon|fontawesome|webfonts|\.woff|\.ttf|img\/|backgrounds\//i.test(body)) return;
    errors.push(body);
  });
  try {
    await stubExternalRequests(page, externalHosts);
    const query = new URLSearchParams({
      chrome: '0', preset: kase.preset, theme: 'Dark V 1.0', floors: '20', rendered: '0',
      statusFloors: '3', shell: kase.shell,
    });
    await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady(60000));
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted(60000));
    await page.waitForTimeout(500);

    const shape = await page.evaluate(() => {
      const api = window.__linjiangTavernLive;
      const frame = api.statusFrame;
      const doc = frame.contentDocument;
      const root = doc.getElementById('linjiang-mobile-native-root');
      const box = root.getBoundingClientRect();
      return {
        measure: api.measure(),
        nativeMarker: doc.documentElement.dataset.linjiangMobileNative || '',
        rootNodes: root.querySelectorAll('*').length,
        rootWidth: Math.round(box.width),
        innerHudFrames: doc.querySelectorAll('iframe#hud, iframe#linjiang-hud-live').length,
        stageCount: document.querySelectorAll('#linjiang-hud-stage').length,
        framePosition: getComputedStyle(frame).position,
        dockSetting: !!doc.querySelector('[data-pref-set="dockDefault"]'),
      };
    });
    check(shape.nativeMarker === '1' && shape.measure.nativeFlow, 'native-flow selected', JSON.stringify(shape.measure));
    check(!shape.measure.lifted && shape.innerHudFrames === 0, 'no inner/lifted HUD iframe', String(shape.innerHudFrames));
    check(shape.stageCount === 0, 'no desktop clip stage', String(shape.stageCount));
    check(shape.framePosition === 'static', 'Tavern Helper iframe remains in normal flow', shape.framePosition);
    check(shape.rootNodes > 150 && shape.measure.hudMoney.includes('512,300'), 'HUD rendered with MVU snapshot', `${shape.rootNodes} nodes ${shape.measure.hudMoney}`);
    check(shape.rootWidth > 180 && shape.rootWidth <= shape.measure.slotW, 'HUD uses reading-column width', `${shape.rootWidth}/${shape.measure.slotW}`);

    const point = await page.evaluate(() => {
      const api = window.__linjiangTavernLive;
      const chat = document.getElementById('chat');
      const frame = api.statusFrame;
      const pane = chat.getBoundingClientRect();
      chat.scrollTop = Math.max(0, chat.scrollTop + frame.getBoundingClientRect().top - pane.top - 20);
      const frameBox = frame.getBoundingClientRect();
      const rootBox = frame.contentDocument.getElementById('linjiang-mobile-native-root').getBoundingClientRect();
      const bridge = frame.contentWindow.__linjiangMobileDirectBridge;
      frame.contentWindow.__nativeFlowEvents = [];
      const original = bridge.event.bind(bridge);
      bridge.event = (type, ...args) => {
        frame.contentWindow.__nativeFlowEvents.push(type);
        return original(type, ...args);
      };
      return {
        x: Math.round(frameBox.left + rootBox.left + rootBox.width / 2),
        y: Math.round(Math.max(pane.top + 120, frameBox.top + 160)),
        before: chat.scrollTop,
      };
    });
    await page.waitForTimeout(250);
    const traceEvents = [];
    const onTrace = (payload) => traceEvents.push(...(payload.value || []));
    session.on('Tracing.dataCollected', onTrace);
    const traceDone = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.start', {
      categories: ['-*', 'toplevel', 'viz', 'cc', 'blink', 'devtools.timeline',
        'disabled-by-default-devtools.timeline'].join(','),
      transferMode: 'ReportEvents',
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
    });
    for (let i = 1; i <= 40; i += 1) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - i * 6, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
    await session.send('Tracing.end');
    await traceDone;
    session.off('Tracing.dataCollected', onTrace);
    const rasterEvents = traceEvents.filter((event) => event.ph === 'X'
      && (event.name === 'RasterTask' || event.name === 'Rasterize'));
    const raster = {
      count: rasterEvents.length,
      ms: +(rasterEvents.reduce((sum, event) => sum + (Number(event.dur) || 0), 0) / 1000).toFixed(1),
    };
    const touch = await page.evaluate((before) => {
      const api = window.__linjiangTavernLive;
      const frame = api.statusFrame;
      const chat = document.getElementById('chat');
      return {
        delta: Math.round(chat.scrollTop - before),
        events: frame.contentWindow.__nativeFlowEvents || [],
        framePosition: getComputedStyle(frame).position,
      };
    }, point.before);
    check(touch.delta > 30, 'dragging HUD natively scrolls #chat', `${touch.delta}px`);
    check(!touch.events.includes('touchScroll') && !touch.events.includes('wheel'), 'no synthetic scroll forwarding', JSON.stringify(touch.events));
    check(touch.framePosition === 'static', 'scroll does not change iframe positioning', touch.framePosition);
    check(raster.count <= 30 && raster.ms <= 40, 'native scroll avoids lifted-HUD raster churn', `${raster.count} tasks / ${raster.ms}ms`);

    const frameSelector = await page.evaluate(() => `#${CSS.escape(window.__linjiangTavernLive.statusFrame.id)}`);
    const hud = page.frameLocator(frameSelector);
    await hud.locator('.pdest-btn[data-page="settings"]').first().click();
    await page.waitForTimeout(200);
    const settings = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
      return {
        open: doc.documentElement.classList.contains('is-page-open'),
        dockSetting: !!doc.querySelector('[data-pref-set="dockDefault"]'),
      };
    });
    check(settings.open && !settings.dockSetting, 'mobile settings hide desktop docking control', JSON.stringify(settings));
    await hud.locator('.pclose').click();
    await page.waitForTimeout(250);

    await hud.locator('.pdest-btn[data-page="schedule"]').first().click();
    await page.waitForTimeout(300);
    const pageState = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const doc = frame.contentDocument;
      return {
        open: doc.documentElement.classList.contains('is-page-open'),
        framePosition: getComputedStyle(frame).position,
        topbar: getComputedStyle(document.getElementById('top-bar')).visibility,
        form: getComputedStyle(document.getElementById('form_sheld')).visibility,
      };
    });
    check(pageState.open && pageState.framePosition === 'static', 'detail page stays inside normal-flow floor', JSON.stringify(pageState));
    check(pageState.topbar === 'visible' && pageState.form === 'visible', 'detail page does not mutate tavern chrome', JSON.stringify(pageState));
    await hud.locator('.pclose').click();
    await page.waitForTimeout(250);
    const closed = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      return {
        open: frame.contentDocument.documentElement.classList.contains('is-page-open'),
        position: getComputedStyle(frame).position,
      };
    });
    check(!closed.open && closed.position === 'static', 'detail page closes back to native flow', JSON.stringify(closed));

    await hud.locator('.pdest-btn[data-page="shop"]').first().click();
    await page.waitForTimeout(400);
    const shop = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const doc = frame.contentDocument;
      return {
        layer: !!doc.querySelector('.shop-layer'),
        innerFrames: doc.querySelectorAll('.shop-layer iframe').length,
        position: getComputedStyle(frame).position,
        topbar: getComputedStyle(document.getElementById('top-bar')).visibility,
        form: getComputedStyle(document.getElementById('form_sheld')).visibility,
      };
    });
    check(shop.layer && shop.innerFrames === 1 && shop.position === 'static',
      'complex app opens as an inner page without moving the main HUD', JSON.stringify(shop));
    check(shop.topbar === 'visible' && shop.form === 'visible',
      'complex app also leaves tavern chrome unchanged', JSON.stringify(shop));
    await hud.locator('[data-shop-close]').click();
    await page.waitForTimeout(200);
    check(await page.evaluate(() => !window.__linjiangTavernLive.statusFrame.contentDocument.querySelector('.shop-layer')),
      'complex app closes without remounting the main HUD');
    check(errors.length === 0, 'no script errors', errors.slice(0, 3).join(' | '));
  } catch (error) {
    check(false, `${kase.id} execution`, error.message);
  }
  await page.close();
}

await browser.close();
await server.close();
console.log(`\nReal sources: ST ${meta.versions.sillytavern} / Tavern Helper ${meta.versions.tavernHelper}`);
if (failures.length) {
  console.log('\nNative mobile-flow regression failed:');
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('Native mobile-flow regression: all checks passed');
