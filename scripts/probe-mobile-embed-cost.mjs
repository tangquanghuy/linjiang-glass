/* 移动端状态栏的成本归属：嵌入机制 vs 载荷重量。
   ==================================================================
   为什么要这支脚本
   ------------------------------------------------------------------
   「移动端不再自己操作嵌入页面、直接收进嵌入框」这次改造换掉的是**宿主几何**那一半成本：
   不再把 HUD 抬到酒馆文档上、不再逐帧 followHud、不再写裁剪台。但它没有动**载荷**那一半，
   而这两半在低端机上都可能是瓶颈。于是「改完还是卡」有三种完全不同的解释：

     a. 原生流其实没生效，还在走抬升那条路；
     b. 生效了，宿主几何成本确实没了，但载荷本身在 1 核上就跑不动；
     c. 生效了，但还有别的常驻开销。

   这三者的处置完全不同，靠肉眼看「卡不卡」永远分不清。所以这里在同一台机器、同一档 CPU
   限速下跑三个配置，把数字摆在一起：

     reference     参考/底部状态栏.html —— 别人那条栏，整份内联（329KB JS + 186KB CSS），
                   运行时除字体图标不取任何东西、一张图都不解码、零处 will-change。
                   它就是「直接收进嵌入框」这条路能到的下限。
     native-flow   状态栏-测试版-流内嵌入.html 的现状：HUD bundle 直接在楼层文档里跑。
     lifted        同一份产物，但用 __linjiangForceDesktopShell 强制走旧的抬升架构。
                   这是「改之前」的对照。

   载荷差在哪（构建产物实测）：我们首屏就要 259KB JS + 147KB CSS + bg-plate 2.0MB /
   frost 1.0MB / polish 365KB 三张贴图，外加 40 处 backdrop-filter；参考实现一张图没有。
   如果 native-flow 与 lifted 的差距远小于它们与 reference 的差距，那答案就是 (b)。

   量什么
   ------------------------------------------------------------------
     架构        直接读 DOM 判定，先回答「到底生效没」这个问题本身
     首屏        从 srcdoc 落地到状态栏画好
     静止        安顿之后 3 秒的光栅与长任务。常驻开销在低端机上比首屏更致命
     滚动        40 帧触摸拖动期间的光栅与长任务
     内存        GC 之后的 JS 堆
     图片解码    ImageDecodeTask 的次数与耗时 —— 这一项是载荷侧的直接证据

   用法：
     node scripts/probe-mobile-embed-cost.mjs                # 6 倍限速（约等于低端机）
     node scripts/probe-mobile-embed-cost.mjs --cpu=1         # 不限速
     node scripts/probe-mobile-embed-cost.mjs --only=native-flow
*/
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { PROJECT_ROOT, stageRealSources } from './lib/real-tavern-sources.mjs';
import { stubExternalRequests } from './lib/stub-external.mjs';

const args = process.argv.slice(2);
const CPU = Number((args.find((a) => a.startsWith('--cpu=')) || '--cpu=6').slice(6)) || 1;
const only = (args.find((a) => a.startsWith('--only=')) || '').slice('--only='.length);
/* --flat：开机就把 HUD 的 performanceMode 设成 low（平面玻璃，不采样 backdrop）。
   ------------------------------------------------------------------
   这一档本来只有 TauriTavern 移动端拿得到：src/main.js 的 hostNeedsFlatGlass 只认
   `?host=tauritavern-mobile` 这个查询串，而原生流下 HUD 是当 module 直接在楼层文档里跑的，
   根本没有查询串 —— 于是「专门为了救移动端性能而做的那条路」反倒是唯一还在付全套
   backdrop-filter（40 处）的移动端路径。这个开关用来量清楚：把它打开值多少。
   走 localStorage 而不是改代码：原生流下 HUD 与夹具同源，prefs 就落在这个 origin 上。 */
const FLAT_GLASS = args.includes('--flat');
/* --noplate：把三张大贴图换成 1×1 透明 PNG。
   ------------------------------------------------------------------
   bg-plate.png 1672×941（解码后约 6MB 位图）、frost.png 1024×1024（约 4MB，还要 repeat
   铺在 6 个面上）、polish.png 512×384（约 0.8MB）—— 每份 HUD 实例约 11MB 解码位图，而参考
   底部状态栏一张图都没有。1G 内存的机器上这是决定性的差距。

   用路由替换而不是改产物：布局一个像素都不变（<img> 还在、background 还在，只是源变成
   1×1），于是量出来的差值就是**纯解码与位图内存**那一笔，不掺任何排版变化。这样才能在
   动不动视觉之前先知道它值多少。 */
const NO_PLATE = args.includes('--noplate');
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const BIG_TEXTURES = /\/assets\/(?:bg-plate|frost|polish|polish-mask)\.png/;
const OUT_DIR = join(PROJECT_ROOT, 'artifacts', 'embed-cost');
mkdirSync(OUT_DIR, { recursive: true });

/* 这一组分类是照 check-hud-raster-perf.mjs 来的，另外加了 devtools.timeline 里的
   ImageDecodeTask —— 载荷侧的直接证据就在那儿。 */
const TRACE_CATEGORIES = [
  '-*', 'toplevel', 'viz', 'cc', 'blink',
  'devtools.timeline', 'disabled-by-default-devtools.timeline',
].join(',');

const UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';

const CASES = [
  {
    id: 'reference', label: '参考底部状态栏（整份内联，无图）',
    shell: 'reference', forceLifted: false, expect: 'inline-reference',
  },
  {
    id: 'native-flow', label: '流内嵌入 · 原生流（现状）',
    shell: 'flow', forceLifted: false, expect: 'native-flow',
  },
  {
    id: 'lifted', label: '流内嵌入 · 强制抬升架构（改之前的对照）',
    shell: 'flow', forceLifted: true, expect: 'lifted',
  },
];

const sum = (rows) => +(rows.reduce((acc, row) => acc + (Number(row.dur) || 0), 0) / 1000).toFixed(1);
const pick = (events, names) => events.filter((event) => event.ph === 'X' && names.includes(event.name));

/** 一段 trace 里我们关心的四类开销。 */
function digest(events) {
  const raster = pick(events, ['RasterTask', 'Rasterize']);
  const decode = pick(events, ['ImageDecodeTask', 'Decode Image', 'ImageDecode']);
  /* 长任务用主线程上超过 50ms 的 RunTask 近似 —— 低端机上的"卡"就是这些。 */
  const tasks = pick(events, ['RunTask']).filter((event) => Number(event.dur) > 50000);
  const layout = pick(events, ['Layout', 'UpdateLayoutTree', 'ParseHTML', 'EvaluateScript', 'FunctionCall']);
  return {
    光栅次数: raster.length,
    光栅ms: sum(raster),
    图片解码次数: decode.length,
    图片解码ms: sum(decode),
    长任务数: tasks.length,
    长任务ms: sum(tasks),
    最长任务ms: tasks.length ? +(Math.max(...tasks.map((t) => Number(t.dur))) / 1000).toFixed(1) : 0,
    脚本与布局ms: sum(layout),
  };
}

const meta = stageRealSources();
const server = await startFixtureServer({ port: 5237 });
const browser = await chromium.launch();
const rows = [];

for (const kase of CASES) {
  if (only && kase.id !== only) continue;
  console.log(`\n=== ${kase.id} · ${kase.label} ===`);
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA,
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  await stubExternalRequests(page, new Set());
  if (FLAT_GLASS) {
    /* prefs.js 的 KEY 就是 'glass-hud-prefs'。必须在任何文档执行之前落地。 */
    await page.addInitScript(() => {
      try {
        const key = 'glass-hud-prefs';
        const current = JSON.parse(localStorage.getItem(key) || '{}');
        localStorage.setItem(key, JSON.stringify({ ...current, performanceMode: 'low' }));
      } catch (e) {}
    });
  }
  if (NO_PLATE) {
    /* 必须后于 stubExternalRequests 注册：Playwright 按逆序匹配。本机地址被那条兜底
       `route.continue()` 放过，所以这里要自己拦。 */
    await page.route((url) => BIG_TEXTURES.test(url.pathname), (route) => route.fulfill({
      status: 200, contentType: 'image/png', body: TRANSPARENT_PNG,
    }));
  }
  const row = { id: kase.id, label: kase.label, cpu: CPU, flatGlass: FLAT_GLASS, noPlate: NO_PLATE };
  rows.push(row);

  /* trace 收集封装成一段一段的，静止相和滚动相各来一次。 */
  const traceWindow = async (body) => {
    const events = [];
    const onData = (payload) => events.push(...(payload.value || []));
    session.on('Tracing.dataCollected', onData);
    const done = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReportEvents' });
    await body();
    await session.send('Tracing.end');
    await done;
    session.off('Tracing.dataCollected', onData);
    return digest(events);
  };

  try {
    const query = new URLSearchParams({
      chrome: '0', preset: 'phone-iphone', theme: 'Dark V 1.0',
      floors: '8', rendered: '0', statusFloors: '1', shell: kase.shell,
    });
    if (kase.forceLifted) query.set('forceLifted', '1');

    /* 限速要在导航**之前**开：首屏成本的大头是解析和执行，导航后再开就量不到了。 */
    if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: CPU });

    /* 首屏这一段必须也 trace。
       ------------------------------------------------------------------
       第一版只 trace 了静止和滚动，于是三个配置的图片解码全是 0，看起来像"贴图不要钱" ——
       其实解码发生在首次绘制，早就在窗口之外了。载荷侧的成本几乎全在这一段，漏掉它就只能
       得出"剩下的卡不在载荷"这种错结论。 */
    const started = Date.now();
    let ready = null;
    row.首屏 = await traceWindow(async () => {
      await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 120000 });
      /* 等第 0 层真的画好。用 floorTakeover 而不是"屏幕上有东西"，三个配置的判据才是同一套
         （见夹具里那段说明）。 */
      for (;;) {
        ready = await page.evaluate(() => window.__linjiangTavernLive.floorTakeover(0));
        if (ready.ready) break;
        if (Date.now() - started > 120000) break;
        await page.waitForTimeout(80);
      }
      /* 多留 800ms：贴图解码和第一次合成往往落在"节点已经建好"之后。 */
      await page.waitForTimeout(800);
    });
    row.首屏ms = Date.now() - started;
    row.架构 = ready?.architecture || '(未知)';
    row.节点数 = ready?.nodes || 0;
    row.画出来了 = !!ready?.ready;
    console.log(`  架构 ${row.架构}  首屏 ${row.首屏ms}ms  节点 ${row.节点数}  ${row.画出来了 ? '' : '（超时没画出来）'}`);
    console.log(`  首屏开销 光栅 ${row.首屏.光栅次数} 次 / ${row.首屏.光栅ms}ms   解码 ${row.首屏.图片解码次数} 次 / ${row.首屏.图片解码ms}ms   长任务 ${row.首屏.长任务数} 个 / ${row.首屏.长任务ms}ms（最长 ${row.首屏.最长任务ms}ms）   脚本+布局 ${row.首屏.脚本与布局ms}ms`);
    if (row.架构 !== kase.expect) {
      console.log(`  注意：架构判定是 ${row.架构}，期望 ${kase.expect}`);
    }

    /* 把状态栏滚进视口，并等它彻底安顿。 */
    await page.evaluate(() => window.__linjiangTavernLive.scrollToFloor(0));
    await page.waitForTimeout(2500);

    row.静止 = await traceWindow(() => page.waitForTimeout(3000));
    console.log(`  静止3s   光栅 ${row.静止.光栅次数} 次 / ${row.静止.光栅ms}ms   解码 ${row.静止.图片解码次数} 次 / ${row.静止.图片解码ms}ms   长任务 ${row.静止.长任务数} 个 / ${row.静止.长任务ms}ms`);

    /* 滚动：在状态栏正中间按住往上拖 40 帧。 */
    const point = await page.evaluate(() => {
      const api = window.__linjiangTavernLive;
      const frame = api.statusFrames[0];
      const box = frame.getBoundingClientRect();
      const pane = document.getElementById('chat').getBoundingClientRect();
      return {
        x: Math.round(box.left + box.width / 2),
        y: Math.round(Math.max(pane.top + 100, Math.min(box.top + box.height / 2, pane.bottom - 100))),
        before: document.getElementById('chat').scrollTop,
      };
    });
    row.滚动 = await traceWindow(async () => {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
      });
      for (let i = 1; i <= 40; i += 1) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: point.x, y: point.y - i * 5, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
        });
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    row.滚动距离px = await page.evaluate((before) => Math.round(document.getElementById('chat').scrollTop - before), point.before);
    console.log(`  滚动40帧 光栅 ${row.滚动.光栅次数} 次 / ${row.滚动.光栅ms}ms   长任务 ${row.滚动.长任务数} 个 / ${row.滚动.长任务ms}ms   实际滚了 ${row.滚动距离px}px`);

    if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    try { await session.send('HeapProfiler.collectGarbage'); } catch (e) { /* 拿不到就读原值 */ }
    const { metrics } = await session.send('Performance.getMetrics');
    const heap = metrics.find((m) => m.name === 'JSHeapUsedSize');
    row.堆MB = heap ? +(heap.value / 1048576).toFixed(1) : null;
    row.文档节点数 = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrames[0].contentDocument;
      const lifted = document.getElementById('linjiang-hud-live')?.contentDocument;
      return (doc?.querySelectorAll('*').length || 0) + (lifted?.querySelectorAll('*').length || 0);
    });
    /* 这一层文档实际下了多少图、以及按像素算的解码后位图有多大。
       解码位图不进 JS 堆，Performance.getMetrics 看不到它，所以只能这样算：
       拿 resource timing 的清单，配上已知的像素尺寸（w×h×4 字节）。 */
    row.图 = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrames[0].contentDocument;
      const win = doc?.defaultView;
      const known = {
        'bg-plate.png': [1672, 941], 'frost.png': [1024, 1024],
        'polish.png': [512, 384], 'polish-mask.png': [512, 384],
      };
      const rows = [];
      let bytes = 0;
      let bitmapMb = 0;
      for (const entry of (win?.performance?.getEntriesByType('resource') || [])) {
        if (!/\.(?:png|jpe?g|webp|gif|avif)(?:\?|$)/i.test(entry.name)) continue;
        const name = entry.name.split('/').pop().split('?')[0];
        bytes += Number(entry.transferSize || entry.encodedBodySize || 0);
        const size = known[name];
        if (size) {
          bitmapMb += (size[0] * size[1] * 4) / 1048576;
          rows.push(name);
        }
      }
      return {
        张数: (win?.performance?.getEntriesByType('resource') || [])
          .filter((e) => /\.(?:png|jpe?g|webp|gif|avif)(?:\?|$)/i.test(e.name)).length,
        传输KB: Math.round(bytes / 1024),
        大贴图: rows,
        解码位图MB: +bitmapMb.toFixed(1),
      };
    });
    console.log(`  图 ${row.图.张数} 张 / 传输 ${row.图.传输KB}KB / 大贴图解码位图 ${row.图.解码位图MB}MB ${JSON.stringify(row.图.大贴图)}`);

    /* HUD 实际用的是哪一档玻璃。--flat 到底有没有落地，要看这个而不是看命令行参数。 */
    row.玻璃档 = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrames[0].contentDocument;
      const lifted = document.getElementById('linjiang-hud-live')?.contentDocument;
      return (lifted || doc)?.documentElement?.dataset?.hudPerformance || '(无此属性)';
    });
    console.log(`  堆 ${row.堆MB}MB   状态栏文档节点 ${row.文档节点数}   玻璃档 ${row.玻璃档}`);
  } catch (error) {
    row.error = error.message;
    console.log(`  执行失败：${error.message}`);
  }
  await page.close();
}

await browser.close();
await server.close();

const cell = (value, width) => String(value ?? '-').padEnd(width);
console.log(`\n---- 汇总（CPU 限速 ${CPU}×，390×844 @3x）----`);
console.log(`${cell('配置', 13)}${cell('架构', 18)}${cell('首屏ms', 8)}${cell('首屏长任务', 11)}${cell('首屏解码', 10)}${cell('首屏光栅', 10)}${cell('静止光栅', 10)}${cell('滚动光栅', 10)}${cell('堆MB', 7)}节点`);
for (const row of rows) {
  if (row.error) { console.log(`${cell(row.id, 13)}执行失败：${row.error}`); continue; }
  console.log(
    cell(row.id, 13) + cell(row.架构, 18) + cell(row.首屏ms, 8)
    + cell(`${row.首屏?.长任务ms}ms`, 11)
    + cell(`${row.首屏?.图片解码ms}ms`, 10)
    + cell(`${row.首屏?.光栅ms}ms`, 10)
    + cell(`${row.静止?.光栅ms}ms`, 10)
    + cell(`${row.滚动?.光栅ms}ms`, 10)
    + cell(row.堆MB, 7) + String(row.文档节点数 ?? '-'),
  );
}

const reference = rows.find((row) => row.id === 'reference');
const native = rows.find((row) => row.id === 'native-flow');
const lifted = rows.find((row) => row.id === 'lifted');
if (reference && native && lifted && !reference.error && !native.error && !lifted.error) {
  /* 两笔账要分开算，因为它们对应两种完全不同的处置：
       交互期成本（静止 + 滚动）—— 换嵌入机制能治的就是这一笔
       首屏成本（长任务 + 解码 + 光栅）—— 只能靠减载荷 */
  const 交互 = (row) => +((row.静止?.光栅ms || 0) + (row.静止?.长任务ms || 0)
    + (row.滚动?.光栅ms || 0) + (row.滚动?.长任务ms || 0)).toFixed(1);
  const 首屏 = (row) => +((row.首屏?.长任务ms || 0) + (row.首屏?.图片解码ms || 0)
    + (row.首屏?.光栅ms || 0)).toFixed(1);
  console.log('\n---- 成本归属 ----');
  console.log(`  交互期（静止+滚动）  抬升 ${交互(lifted)}ms → 原生流 ${交互(native)}ms → 参考 ${交互(reference)}ms`);
  console.log(`    换嵌入机制省下 ${+(交互(lifted) - 交互(native)).toFixed(1)}ms，与参考还差 ${+(交互(native) - 交互(reference)).toFixed(1)}ms`);
  console.log(`  首屏               抬升 ${首屏(lifted)}ms → 原生流 ${首屏(native)}ms → 参考 ${首屏(reference)}ms`);
  console.log(`    与参考还差 ${+(首屏(native) - 首屏(reference)).toFixed(1)}ms —— 这一笔只能靠减载荷`);
  console.log(`  墙上时间到画好      抬升 ${lifted.首屏ms}ms → 原生流 ${native.首屏ms}ms → 参考 ${reference.首屏ms}ms`);
}

writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify({
  at: new Date().toISOString(), cpu: CPU, versions: meta.versions, rows,
}, null, 2), 'utf8');
console.log(`\n真实源码：ST ${meta.versions.sillytavern} · 酒馆助手 ${meta.versions.tavernHelper} · TauriTavern ${meta.versions.tauritavern}`);
console.log('报告：artifacts/embed-cost/report.json');
