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

    /* 整页 / 覆盖层的契约（这一段整体改过一次，原因值得留着）。
       ==================================================================
       原来这里断言的是「次级页面和商店都留在常规流的楼层里、`position:static`、宿主 chrome
       保持 visible」。那描述的是实现，不是需求，而且恰好把一个真实的 bug 锁在了错的一侧：

         · 覆盖层的 position:fixed 在楼层 srcdoc 文档里锚的是**那一楼**（宽=阅读栏、
           高=酒馆助手量出来的内容高），不是手机屏。所以商店根本没全屏，甚至在带模糊的主题上
           整层消失。
         · 次级整页是流内的高元素，body.scrollHeight 跟着涨、被写进楼层高度，于是 #chat 里
           多出一大片空区、工具栏被挤到重叠 —— 也就是「破坏了酒馆本身的布局」。

       现在的契约跟抬升架构一致（见 check-tavern-live.mjs 里那条「整页锚在视口原点」）：
       整页期间楼层自己铺满视口、盖住宿主 chrome；关掉之后一切按原样还回去。所以这里改成
       断言「进去铺满、出来复原」这一对，而不是断言楼层从不动。 */
    const viewport = await page.evaluate(() => ({
      w: Math.round(window.visualViewport?.width || innerWidth),
      h: Math.round(window.visualViewport?.height || innerHeight),
    }));
    const restFloor = await page.evaluate(() => {
      const chat = document.getElementById('chat');
      const frame = window.__linjiangTavernLive.statusFrame;
      return {
        height: Math.round(frame.getBoundingClientRect().height),
        chatScroll: Math.round(chat.scrollHeight),
        /* 中和 fixed 包含块要动 #chat 的 backdrop-filter。它是主题的一部分，漏还原的后果是
           整个阅读区永久失去模糊 —— 这条断言就是为了让那种泄漏当场变红。 */
        backdrop: getComputedStyle(chat).backdropFilter,
      };
    });

    const readPageState = () => page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const doc = frame.contentDocument;
      const box = frame.getBoundingClientRect();
      const style = getComputedStyle(frame);
      return {
        open: doc.documentElement.classList.contains('is-page-open'),
        marker: doc.documentElement.dataset.linjiangNativePage || '',
        position: style.position,
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
        /* 整页期间滚动条归根节点，document 必须严格等于视口 —— 否则酒馆助手会照着
           body.scrollHeight 把楼层高度覆盖回内容高度。 */
        docOverflow: getComputedStyle(doc.documentElement).overflowY,
        rootOverflow: getComputedStyle(doc.getElementById('linjiang-mobile-native-root')).overflowY,
        bodyScroll: Math.round(doc.body.scrollHeight),
        topbar: getComputedStyle(document.getElementById('top-bar')).visibility,
        form: getComputedStyle(document.getElementById('form_sheld')).visibility,
      };
    });
    const covers = (state) => state.position === 'fixed' && state.left === 0 && state.top === 0
      && Math.abs(state.width - viewport.w) <= 2 && Math.abs(state.height - viewport.h) <= 2;

    await hud.locator('.pdest-btn[data-page="schedule"]').first().click();
    await page.waitForTimeout(300);
    const pageState = await readPageState();
    check(pageState.open && pageState.marker === '1' && covers(pageState),
      'detail page pins the floor to the visual viewport', JSON.stringify(pageState));
    check(pageState.docOverflow === 'hidden' && pageState.rootOverflow === 'auto'
      && Math.abs(pageState.bodyScroll - viewport.h) <= 2,
      'detail page keeps body height equal to the viewport (no height tug-of-war)', JSON.stringify(pageState));
    check(pageState.topbar === 'hidden' && pageState.form === 'hidden',
      'detail page hides the tavern chrome it cannot out-stack', JSON.stringify(pageState));
    await hud.locator('.pclose').click();
    await page.waitForTimeout(300);
    const closed = await readPageState();
    check(!closed.open && !closed.marker && closed.position === 'static',
      'detail page closes back to native flow', JSON.stringify(closed));
    check(closed.topbar === 'visible' && closed.form === 'visible',
      'closing restores the tavern chrome', JSON.stringify(closed));
    const restored = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      return {
        height: Math.round(frame.getBoundingClientRect().height),
        chatScroll: Math.round(document.getElementById('chat').scrollHeight),
        backdrop: getComputedStyle(document.getElementById('chat')).backdropFilter,
      };
    });
    check(Math.abs(restored.height - restFloor.height) <= 4
      && Math.abs(restored.chatScroll - restFloor.chatScroll) <= 8,
      'closing gives the floor height back without inflating #chat',
      `${restored.height}/${restFloor.height}px floor, ${restored.chatScroll}/${restFloor.chatScroll}px chat`);
    check(restored.backdrop === restFloor.backdrop,
      'closing restores #chat backdrop-filter', `${restored.backdrop} vs ${restFloor.backdrop}`);

    await hud.locator('.pdest-btn[data-page="shop"]').first().click();
    await page.waitForTimeout(400);
    const shop = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const doc = frame.contentDocument;
      const layer = doc.querySelector('.shop-layer');
      const box = layer?.getBoundingClientRect();
      const frameBox = frame.getBoundingClientRect();
      const style = getComputedStyle(frame);
      return {
        layer: !!layer,
        innerFrames: doc.querySelectorAll('.shop-layer iframe').length,
        position: style.position,
        left: Math.round(frameBox.left),
        top: Math.round(frameBox.top),
        width: Math.round(frameBox.width),
        height: Math.round(frameBox.height),
        /* 覆盖层自己在楼层文档里的框。楼层现在就是视口，所以 inset:0 应该正好等于视口。 */
        layerW: Math.round(box?.width || 0),
        layerH: Math.round(box?.height || 0),
        topbar: getComputedStyle(document.getElementById('top-bar')).visibility,
        form: getComputedStyle(document.getElementById('form_sheld')).visibility,
      };
    });
    check(shop.layer && shop.innerFrames === 1 && covers(shop),
      'shop overlay pins the floor to the visual viewport', JSON.stringify(shop));
    check(Math.abs(shop.layerW - viewport.w) <= 2 && Math.abs(shop.layerH - viewport.h) <= 2,
      'shop overlay actually covers the phone screen', `${shop.layerW}x${shop.layerH} vs ${viewport.w}x${viewport.h}`);
    check(shop.topbar === 'hidden' && shop.form === 'hidden',
      'shop overlay hides the tavern chrome it cannot out-stack', JSON.stringify(shop));
    await hud.locator('[data-shop-close]').click();
    await page.waitForTimeout(300);
    const shopClosed = await readPageState();
    check(!shopClosed.open && !shopClosed.marker && shopClosed.position === 'static'
      && shopClosed.topbar === 'visible' && shopClosed.form === 'visible',
      'shop closes back to native flow without remounting the main HUD', JSON.stringify(shopClosed));
    check(await page.evaluate(() => !window.__linjiangTavernLive.statusFrame.contentDocument.querySelector('.shop-layer')),
      'shop overlay is torn down on close');

    /* 整页开着时楼层文档被销毁 —— TT 移动端「角色卡渲染管理」的真实行为。
       ==================================================================
       真机事故：iPhone 上开商店后整个 TauriTavern 变成全屏黑，App 仍然响应、切后台再回来
       照样黑。原因不是崩溃也不是内存 —— 是整页状态的还原信息只活在楼层文档的 JS 闭包里
       （cbPatched / savedFloorStyle）。TT 把楼层挪进 0×0 停车场，WebKit 重载那个文档，
       闭包随之消失，而 DOM 上的改动全留着：楼层仍是 position:fixed 铺满视口 +
       background:#05040a（近黑），#top-bar / #form_sheld 仍是 visibility:hidden。
       于是屏幕永久停在全屏近黑，没有任何代码还知道该怎么收。

       怎么测：Chromium 造不出 WebKit 那个语义 —— 这里重新赋值 srcdoc 会正常触发 pagehide，
       旧文档照样跑完清理（实测修复前后都绿，也就是这样测等于没测）。所以改为直接**植入那个
       终态**：把死文档会留在宿主上的东西原样摆好（楼层钉满视口 + chrome 隐藏 + 记号属性），
       然后让一个新控制器启动，断言它必须把宿主收拾干净。
       验的是不变量「任何新控制器启动后，宿主上不得残留整页状态」，而这正是黑屏的直接成因。 */
    await hud.locator('.pdest-btn[data-page="shop"]').first().click();
    await page.waitForTimeout(400);
    const beforeKill = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      return {
        floorPosition: getComputedStyle(frame).position,
        topbar: getComputedStyle(document.getElementById('top-bar')).visibility,
        form: getComputedStyle(document.getElementById('form_sheld')).visibility,
        markers: document.querySelectorAll('[data-linjiang-cb-saved],[data-linjiang-floor-saved]').length,
      };
    });
    check(beforeKill.floorPosition === 'fixed' && beforeKill.topbar === 'hidden',
      '前提：整页状态已生效（楼层 fixed、chrome 隐藏）', JSON.stringify(beforeKill));

    await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const chat = document.getElementById('chat');
      /* 1. 先让当前文档正常退出整页（它还活着，会自己收干净）。 */
      frame.srcdoc = frame.srcdoc;
      /* 2. 再手工摆出「死文档留下的残局」。这一步刻意绕过所有活代码，就像那个文档从没有
            机会执行清理一样。saved 值按真实 patch 的形状写：[value, priority]。 */
      window.__linjiangPlantLeak = () => {
        frame.setAttribute('data-linjiang-floor-saved', '');
        frame.style.cssText = [
          'position:fixed', 'left:0', 'top:0', 'width:100%', 'height:100%',
          'z-index:2147483000', 'background:#05040a', 'overflow:hidden',
        ].join(';');
        chat.setAttribute('data-linjiang-cb-saved', JSON.stringify({
          'backdrop-filter': ['', ''], '-webkit-backdrop-filter': ['', ''],
        }));
        chat.style.setProperty('backdrop-filter', 'none', 'important');
        ['top-bar', 'top-settings-holder', 'form_sheld'].forEach((id) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.setAttribute('data-linjiang-cb-saved', JSON.stringify({ visibility: ['', ''] }));
          el.style.setProperty('visibility', 'hidden', 'important');
        });
      };
    });
    await page.waitForTimeout(2500);
    /* 残局要在新文档挂载**之前**摆好，否则那一任已经收拾过了。用一次再重载来制造
       「先有残局、后有新控制器」的顺序。 */
    await page.evaluate(() => {
      window.__linjiangPlantLeak();
      const frame = window.__linjiangTavernLive.statusFrame;
      frame.srcdoc = frame.srcdoc;
    });
    await page.waitForTimeout(3500);

    const healed = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const chat = document.getElementById('chat');
      return {
        floorPosition: getComputedStyle(frame).position,
        topbar: getComputedStyle(document.getElementById('top-bar')).visibility,
        form: getComputedStyle(document.getElementById('form_sheld')).visibility,
        chatBackdrop: getComputedStyle(chat).backdropFilter,
        leftoverMarkers: document.querySelectorAll('[data-linjiang-cb-saved],[data-linjiang-floor-saved]').length,
      };
    });
    check(healed.floorPosition === 'static',
      '楼层文档被销毁后，楼层几何自愈（不再钉在满视口）', healed.floorPosition);
    check(healed.topbar === 'visible' && healed.form === 'visible',
      '楼层文档被销毁后，酒馆 chrome 自愈（这是黑屏的直接成因）', JSON.stringify(healed));
    check(healed.chatBackdrop !== 'none' && healed.leftoverMarkers === 0,
      '#chat 的 backdrop-filter 还原，且宿主上不留残留记号', JSON.stringify(healed));
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
