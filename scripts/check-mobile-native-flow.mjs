/* Native mobile-flow regression.
   Verifies the browser-host architecture that replaces the lifted cross-origin HUD
   iframe on phones: the HUD bundle runs directly in Tavern Helper's srcdoc, touch
   scrolling is native, and desktop-only geometry controls are absent. */
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';
import { stubExternalRequests } from './lib/stub-external.mjs';

const meta = stageRealSources();
/* 酒馆和 HUD 必须分处两个源。
   ==================================================================
   生产环境就是这样：酒馆是 TauriTavern 的应用源，HUD 在 GitHub Pages。夹具原来把两者放在
   同一个源上，于是一整类「相对地址解析到了错误的源」的 bug 天生隐形 —— 那个错误地址在同源
   夹具里恰好也能命中文件。

   实测代价：原生流下 HUD 的 DOM 长在楼层 srcdoc 里，srcdoc 的 baseURI 继承酒馆地址，于是
   商店 / CG / 地图 / 街机 的 iframe 全被解析到 `<酒馆域>/shop/index.html` 这种不存在的路径
   → 空白 iframe → 真机整屏黑。而夹具一路全绿，因为 5225 上那个文件是存在的。

   所以第二个服务器不是"额外的严格"，它是**让夹具具备发现这类 bug 的能力**。 */
const server = await startFixtureServer({ port: 5225 });
const hudServer = await startFixtureServer({ port: 5226 });
const HUD_ORIGIN = 'http://127.0.0.1:5226/';
const browser = await chromium.launch();
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};
const cases = [
  { id: 'android-inline', shell: 'inline', preset: 'phone-android', w: 360, h: 800 },
  { id: 'android-boot', shell: 'boot', preset: 'phone-iphone', w: 390, h: 844 },
  /* TauriTavern。用户真机就是这个宿主，而它跟普通浏览器有一个要紧的差别：
     它提供非零的 --tt-inset-top（刘海 / 状态栏）。整页必须让开那一条，否则页面顶部会被塞进
     状态栏底下、右上角关闭钮点不到 —— 真机上就是这么坏的，而只跑浏览器宿主的用例看不见。 */
  { id: 'tauri-inset', shell: 'inline', preset: 'phone-iphone', w: 393, h: 852, host: 'tauritavern' },
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
      /* HUD 换到第二个源，理由见文件顶部那段。 */
      hud: HUD_ORIGIN,
      ...(kase.host ? { host: kase.host } : {}),
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
    /* 顶部安全区必须让开。
       ==================================================================
       真机上「次级页面和商店顶部被遮挡、关闭钮要很用力往上滑才点得到」就是漏了这一条。
       诊断条给出的数字排除了我最初的猜测（以为是 TT 顶部导航栏压在上面）：

           楼层框    430x932 @0,0            ← 全屏本身是对的
           #top-bar  hidden fixed 430x35@0,59 ← 导航栏是隐藏的，没在挡

       占着顶上那一条的是 iOS 安全区（@0,59 里的 59）。TT 自己所有的面都靠 --tt-inset-top
       避开它，我们这条全屏路径也必须避。夹具里这个变量是 47px，所以下面按它来断言。 */
    const viewport = await page.evaluate(() => ({
      w: Math.round(window.visualViewport?.width || innerWidth),
      h: Math.round(window.visualViewport?.height || innerHeight),
      insetTop: Math.round(parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--tt-inset-top'),
      ) || 0),
    }));
    /* 普通浏览器宿主没有这个变量（值为 0），断言退化成「从 0 开始铺满」——跟以前一样。
       真正验「让开安全区」的是下面 host=tauritavern 那个用例，TT 会提供非零的 --tt-inset-top。
       所以这里只报数，不当失败：否则非 TT 用例会因为一个它压根没有的东西而红。 */
    if (kase.host === 'tauritavern') {
      check(viewport.insetTop > 0,
        '前提：TT 提供了非零顶部安全区（否则下面那条等于空转）', `--tt-inset-top=${viewport.insetTop}px`);
    } else {
      console.log(`  note  这个宿主没有顶部安全区，按 0 断言  --tt-inset-top=${viewport.insetTop}px`);
    }
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
  /* 铺满「安全区以下的整个视口」，而不是从 0 开始铺满 —— 从 0 开始就会把顶部塞进状态栏底下，
     那正是真机上关闭钮点不到的成因。 */
    const covers = (state) => state.position === 'fixed' && state.left === 0
      && state.top === viewport.insetTop
      && Math.abs(state.width - viewport.w) <= 2
      && Math.abs(state.height - (viewport.h - viewport.insetTop)) <= 2;

    await hud.locator('.pdest-btn[data-page="schedule"]').first().click();
    await page.waitForTimeout(300);
    const pageState = await readPageState();
    check(pageState.open && pageState.marker === '1' && covers(pageState),
      'detail page pins the floor to the visual viewport', JSON.stringify(pageState));
    check(pageState.docOverflow === 'hidden' && pageState.rootOverflow === 'auto'
      && Math.abs(pageState.bodyScroll - (viewport.h - viewport.insetTop)) <= 2,
      'detail page keeps body height equal to the viewport (no height tug-of-war)', JSON.stringify(pageState));
    /* 打开就该停在顶部。整页模式下滚动容器是 #linjiang-mobile-native-root 而不是 window，
       HUD 原来调的 window.scrollTo 在那儿是空操作 —— 真机症状是页面不在顶部、右上角关闭钮
       在视野之外，要很用力往上滑才拽得出来。 */
    const atTop = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
      const root = doc.getElementById('linjiang-mobile-native-root');
      return {
        rootScrollTop: Math.round(root?.scrollTop ?? -1),
        scrollable: !!root && root.scrollHeight > root.clientHeight + 1,
      };
    });
    check(atTop.rootScrollTop === 0,
      '次级页面打开时停在顶部（关闭钮在视野内）', JSON.stringify(atTop));
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
    /* 内嵌页面的地址必须解析到 **HUD 的源**，不是酒馆的源。
       ==================================================================
       真机黑屏的根因就在这里。原生流下 HUD 的 DOM 长在楼层 srcdoc 文档里，而 srcdoc 的
       baseURI 继承父文档 —— 也就是酒馆的地址。原来 shopSrc() 用 document.baseURI 解析
       `${BASE_URL}shop/index.html`，于是指向 `<酒馆域>/shop/index.html`：生产环境 TT 的应用
       源下没有这个文件 → 404 → 空白 iframe → 叠上覆盖层近黑底色和被藏起来的宿主 chrome
       = 整屏黑。次级页面（日程）是纯 DOM、不解析地址，所以一直正常 —— 正是用户观察到的分野。

       现在基准由壳层给（window.__linjiangHudBase，见 src/asset.js 的 hudBase）。
       三条一起断言：基准本身对、楼层 baseURI 确实是酒馆地址（前提）、且基准真的落到了 iframe 上。 */
    const originCheck = await page.evaluate((hudOrigin) => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const doc = frame.contentDocument;
      const iframe = doc.querySelector('.shop-layer iframe');
      return {
        hudBase: frame.contentWindow.__linjiangHudBase || '',
        floorBaseURI: doc.baseURI,
        tavernOrigin: location.origin,
        shopResolved: iframe ? iframe.src : '',
        onHudOrigin: !!iframe && iframe.src.startsWith(hudOrigin),
        onTavernOrigin: !!iframe && iframe.src.startsWith(`${location.origin}/`),
      };
    }, HUD_ORIGIN);
    check(originCheck.hudBase.startsWith(HUD_ORIGIN),
      '壳层把 HUD 自己的来源交给了 HUD（__linjiangHudBase）', originCheck.hudBase || '(空)');
    check(originCheck.floorBaseURI.startsWith(originCheck.tavernOrigin),
      '前提：楼层 srcdoc 的 baseURI 确实是酒馆地址（所以不能拿它当基准）',
      originCheck.floorBaseURI.slice(0, 60));
    check(originCheck.onHudOrigin && !originCheck.onTavernOrigin,
      '商店 iframe 解析到 HUD 的源，而不是酒馆的源（真机黑屏的根因）',
      originCheck.shopResolved);

    /* 带 iframe 的覆盖层走 'flow'：只撑高楼层，**对酒馆文档零改动**。
       ==================================================================
       这一段的契约又改过一次，原因是真机上「整页几何 + 里面一个跨源 iframe」会让整个 WebView
       停止绘制：打开商店后约 0.2 秒整屏全黑，连挂在**酒馆文档**里的诊断条都一起消失 ——
       所以不是"我们的近黑背景露出来了"，是绘制整个停了。而纯 DOM 的次级页面走同一条整页几何
       在真机上一直正常，两者唯一的差别就是里面有没有 iframe。

       整页几何对宿主做三件事：楼层变 position:fixed、中和祖先的 backdrop-filter、
       藏掉 #top-bar / #form_sheld。'flow' 一件都不做，只写楼层 height。
       所以这里断言的重点从"铺满视口"变成 **"宿主一点没被碰"** —— 那才是这次改动要保住的东西。
       代价是覆盖层不再真全屏（只铺满一个屏幕高的楼层），这是明知的取舍，不是回归。 */
    check(shop.layer && shop.innerFrames === 1,
      '商店作为覆盖层开出来了（一层一个 iframe）', JSON.stringify({ layer: shop.layer, frames: shop.innerFrames }));
    check(shop.position === 'static',
      "'flow' 模式下楼层留在常规流（不变 fixed）", shop.position);
    check(shop.topbar === 'visible' && shop.form === 'visible',
      '酒馆 chrome 一个都没被藏（这是真机全黑前发生的事）', JSON.stringify({ topbar: shop.topbar, form: shop.form }));
    const untouched = await page.evaluate(() => {
      const chat = document.getElementById('chat');
      return {
        chatBackdrop: getComputedStyle(chat).backdropFilter,
        chatStyleAttr: chat.getAttribute('style') || '',
        markers: document.querySelectorAll('[data-linjiang-cb-saved],[data-linjiang-floor-saved]').length,
      };
    });
    check(untouched.chatBackdrop === restFloor.backdrop && untouched.chatStyleAttr === ''
      && untouched.markers === 0,
      '#chat 的模糊没被中和、宿主上没有我们的记号', JSON.stringify(untouched));
    /* 'flow' 模式的目标是**填满阅读区**，不是填满屏幕：它刻意不藏宿主 chrome，所以顶栏和
       输入栏仍在，楼层能安全占用的就是 #chat 的可视框。同时断言覆盖层的关闭钮真的没被顶栏
       盖住 —— 实测踩过：楼层顶端对齐安全区(47) 时关闭钮落在 y=78，而 #top-bar 占 47..82，
       那个点上最上面的是 div#top-bar，按钮点不到。 */
    const pane = await page.evaluate(() => {
      const chat = document.getElementById('chat');
      const frame = window.__linjiangTavernLive.statusFrame;
      const doc = frame.contentDocument;
      const btn = doc.querySelector('[data-shop-close]');
      const br = btn?.getBoundingClientRect();
      const fr = frame.getBoundingClientRect();
      const hit = br
        ? document.elementFromPoint(Math.round(fr.left + br.left + br.width / 2),
          Math.round(fr.top + br.top + br.height / 2))
        : null;
      return {
        paneTop: Math.round(chat.getBoundingClientRect().top),
        paneH: Math.round(chat.clientHeight),
        floorTop: Math.round(fr.top),
        floorH: Math.round(fr.height),
        closeHitTag: hit ? `${hit.tagName.toLowerCase()}${hit.id ? '#' + hit.id : ''}` : '(null)',
      };
    });
    check(Math.abs(pane.floorH - pane.paneH) <= 4 && Math.abs(pane.floorTop - pane.paneTop) <= 4,
      "'flow' 模式下楼层填满阅读区并与它对齐",
      `楼层 ${pane.floorH}px@${pane.floorTop} / 阅读区 ${pane.paneH}px@${pane.paneTop}`);
    check(!/top-bar|form_sheld|top-settings/.test(pane.closeHitTag),
      '覆盖层的关闭钮没被酒馆 chrome 盖住', pane.closeHitTag);
    await hud.locator('[data-shop-close]').click();
    await page.waitForTimeout(300);
    const shopClosed = await readPageState();
    check(!shopClosed.open && !shopClosed.marker && shopClosed.position === 'static'
      && shopClosed.topbar === 'visible' && shopClosed.form === 'visible',
      'shop closes back to native flow without remounting the main HUD', JSON.stringify(shopClosed));
    /* 关掉之后楼层高度必须交回「内容决定」，否则聊天里会留下一屏高的空楼层。 */
    const heightBack = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      return Math.round(frame.getBoundingClientRect().height);
    });
    check(Math.abs(heightBack - restFloor.height) <= 6,
      '关掉后楼层高度交回内容决定（不留一屏高的空楼层）', `${heightBack}px vs ${restFloor.height}px`);
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
    /* 用**次级页面**来验自愈，不能用商店。
       商店现在走 'flow'（不碰酒馆文档），它压根不会产生"整页残局"，拿它当前提必然失败。
       次级页面仍然走 'page'，它才是会在宿主上留下 fixed 楼层与隐藏 chrome 的那一支。 */
    await hud.locator('.pdest-btn[data-page="schedule"]').first().click();
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
    /* 内嵌页面取不回来时，用户必须看到「可读的等待」，而不是一片近黑。
       ==================================================================
       真机实况（诊断条读出来的）：
           商店加载：等待中           ← load 从未触发
           商店内页：同源 body节点=0   ← 还停在初始 about:blank
       楼层是 tauri://localhost/、商店在 Pages 上，两者不可能同源 —— 能读到且 body 为空，
       说明那个 iframe 压根没导航过去。屏幕上于是只剩 .shop-layer 的底色 #0c1024（近黑），
       用户报的就是"点商店直接黑屏"，而"多开几次就好了"是命中了缓存。

       根因是这几个页面走 GitHub Pages，国内可能很慢甚至取不回来（本仓库早就量过 178~240 秒，
       素材因此改走 jsDelivr；但页面不能简单换源，街机和 CG 的 localStorage 存档绑在 origin 上）。

       所以这里锁的不是"加载要多快"，而是**失败模式必须是可理解、可退出的**：
       拦掉商店地址模拟取不回来，断言加载层在、有文字、并且给出重试/关闭。 */
    await page.route('**/shop/index.html*', (route) => { /* 永不响应，模拟取不回来 */ });
    await hud.locator('.pdest-btn[data-page="shop"]').first().click();
    await page.waitForTimeout(1200);
    const loadingEarly = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
      const box = doc.querySelector('.shop-layer .overlay-loading');
      if (!box) return { present: false };
      const r = box.getBoundingClientRect();
      return {
        present: true,
        area: Math.round(r.width * r.height),
        text: (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        buttons: box.querySelectorAll('button').length,
        buttonsVisible: [...box.querySelectorAll('button')]
          .filter((b) => b.offsetParent !== null).length,
      };
    });
    check(loadingEarly.present && loadingEarly.area > 10000 && loadingEarly.text.includes('正在加载'),
      '内嵌页面加载期间显示可读的等待状态（不是一片近黑）', JSON.stringify(loadingEarly));

    /* 超过 SLOW_MS（6s）之后必须给出解释和出路，否则用户只能杀进程。 */
    await page.waitForTimeout(6500);
    const loadingSlow = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
      const box = doc.querySelector('.shop-layer .overlay-loading');
      if (!box) return { present: false };
      return {
        present: true,
        text: (box.textContent || '').replace(/\s+/g, ' ').trim(),
        buttonsVisible: [...box.querySelectorAll('button')]
          .filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim()),
      };
    });
    check(loadingSlow.present && loadingSlow.buttonsVisible.includes('重试')
      && loadingSlow.buttonsVisible.includes('关闭'),
      '慢到一定程度给出重试与关闭（用户有出路）', JSON.stringify(loadingSlow.buttonsVisible));
    check(/慢|网络/.test(loadingSlow.text),
      '并且解释了为什么慢', loadingSlow.text.slice(0, 60));

    /* 用它自己的关闭钮退出：这条路不依赖被测页面加载成功。 */
    await hud.locator('.shop-layer .overlay-loading button', { hasText: '关闭' }).click();
    await page.waitForTimeout(400);
    check(await page.evaluate(() => !window.__linjiangTavernLive.statusFrame.contentDocument.querySelector('.shop-layer')),
      '等待状态里的关闭钮真的能退出');
    await page.unroute('**/shop/index.html*');

    check(errors.length === 0, 'no script errors', errors.slice(0, 3).join(' | '));
  } catch (error) {
    check(false, `${kase.id} execution`, error.message);
  }
  await page.close();
}

await browser.close();
await server.close();
await hudServer.close();
console.log(`\nReal sources: ST ${meta.versions.sillytavern} / Tavern Helper ${meta.versions.tavernHelper}`);
if (failures.length) {
  console.log('\nNative mobile-flow regression failed:');
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('Native mobile-flow regression: all checks passed');
