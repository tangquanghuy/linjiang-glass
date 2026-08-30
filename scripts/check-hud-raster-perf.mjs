/* 被抬起的状态栏在宿主滚动时的光栅回归。
   ==================================================================
   为什么需要一支新的：scripts/check-hud-scroll-perf.mjs 断言的是顶层文档的 rAF 帧时，
   而这件事的成本根本不在主线程 —— 8 倍 CPU 降频下帧时依然稳定在 16.7ms，同一段手势却要
   450ms 光栅。那支脚本因此对真正的回退完全不敏感，而且它的手机预设只跑 TauriTavern，
   原生浏览器竖屏（大多数用户所在的那条路）一次都没测过。

   这支脚本分两层断言。

   第一层：机制。硬件无关，直接盯住修复本身。滚动时被抬起的 iframe 上
     · left / top / clip-path 一个都不许变（变了就意味着逐帧重排 + 丢层缓存）
     · transform 必须在变（否则它没跟着滚）
     · will-change 必须是 transform，父节点必须是裁剪台
     · 裁剪台的几何在整段手势里不许变
   这四条任何一条破了，性能就一定回到修复前，无论当天机器多快。

   第二层：成本。有机器差异，所以只抓数量级，但把实测值打出来，漂移看得见。
     · 光栅任务数 / 采样帧（修复前 1.25–3.89，修复后 0–0.81）
     · 光栅累计耗时（修复前 236–816ms，修复后 0–98ms）
     · 安顿后静置期的光栅（提升为合成层的代价必须是一次性的，不能变成常驻）
   主线程 Paint 次数曾经也在这一层，后来发现它不区分修复前后，已降级为诊断输出，理由写在下面
   预算那段的表里。
   同时验证功能没坏：手势真的把 #chat 滚起来了、HUD 与栏位对齐、HUD 还看得见、
   TauriTavern 的浮层准入退出契约还在。

   夹具用的是源码驱动的那一套（真实 ST 样式 / 真实酒馆助手注入 / 真实 TT compat 模块），
   所以 #chat 自带的 backdrop-filter 也在成本里 —— 手写夹具漏掉了这一条。

   用法：
     node scripts/check-hud-raster-perf.mjs
     node scripts/check-hud-raster-perf.mjs --cpu 6
     node scripts/check-hud-raster-perf.mjs --only 390 --json artifacts/raster.json
     node scripts/check-hud-raster-perf.mjs --shell boot     # 整个矩阵压到引导壳路径
*/
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';
/* 外部资源必须换成确定性的替身，否则这支脚本量不出东西来 —— 理由、两次踩坑的症状、以及
   每类资源为什么给这个替身而不是 abort，都写在 lib/stub-external.mjs 的头部。 */
import { stubExternalRequests } from './lib/stub-external.mjs';

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const CPU = Number(argValue('--cpu', '4'));
const only = argValue('--only', '');
const jsonOut = argValue('--json', '');
/* --baseline [rev]：不用工作区的壳层，改用某个 git 版本的（默认 HEAD）。这是用来验证
   「这套断言真的能拦住回退」的：拿修复前的壳层跑一遍，第一层机制断言应该全红。
   平时不要用它。

   注意 rev 要给对。修复前的最后一个版本是 5c04982（`fix: 修复TT移动端状态栏与捕鱼反馈`），
   裁剪台是在 821800e 进去的。所以：

     node scripts/check-hud-raster-perf.mjs --baseline 5c04982     ← 应当全红
     node scripts/check-hud-raster-perf.mjs --baseline HEAD        ← 全绿，因为 HEAD 已含修复

   曾经 HEAD 就是修复前，那时候文档里写的是 --baseline HEAD；修复推上去之后那句话就成了错的，
   照着跑会看到「基线也全绿」而误以为断言失效。判断某个 rev 属于哪一侧，看它的 状态栏.html
   里有没有 linjiang-hud-stage 就行。 */
const baselineIndex = argv.indexOf('--baseline');
const baselineRev = baselineIndex >= 0
  ? (argv[baselineIndex + 1] && !argv[baselineIndex + 1].startsWith('--') ? argv[baselineIndex + 1] : 'HEAD')
  : null;
/* --shell inline|boot：把整个用例矩阵压到某一条投递路径上跑。
   默认矩阵里两条都有（见 CASES 的 shell 字段），这个开关是给「怀疑某条路径整体退化」时用的。

   基线模式强制 inline：--baseline 是拿 git 某个版本的 外部部署/V20260826/状态栏.html 去顶替工作区那份，
   而那份文件本身就是自包含版。引导壳路径下夹具根本不 fetch 它，顶替就落不到实处，断言会
   莫名其妙地绿 —— 那比没有基线更糟。 */
const shellOverride = argValue('--shell', '');
if (shellOverride && !['inline', 'boot'].includes(shellOverride)) {
  throw new Error(`--shell 只接受 inline 或 boot，收到 ${shellOverride}`);
}

/* 预算。
   ------------------------------------------------------------------
   成本类断言用「每采样帧」的比率，不用绝对次数：headless Chromium 不锁 vsync，一段手势能跑
   出 170 到 200 个 rAF 回调，绝对次数会随机器快慢漂移，比率不会。

   下面这张表是这台机器上 CPU 4x、外部请求已替身（见 lib/stub-external.mjs）时的双侧实测。
   「修复前」一列是 --baseline 5c04982 量出来的（那是裁剪台进去之前的最后一版），两列都是同一
   次校准跑的，所以可以直接比。

                        光栅任务/帧          光栅累计 ms         绘制/帧
     用例              修复后   修复前     修复后  修复前     修复后   修复前
     phone-small       0.355    1.253       71.1   289.2      0.193   0.210
     phone-android     0.436    1.246       68.9   428.8      0.202   0.199
     phone-iphone      0.484    1.574       83.2   458.9      0.204   0.208
     phone-wide        0.484    1.815       78.7   551.3      0.204   0.220
     phone-iphone-tt   0        1.276        0     405.2      0       0.425
     tablet-portrait   0.574    2.538       98.0   719.7      0.202   0.207
     phone-landscape   0.703    1.254       43.3   235.6      0.205   0.220
     desktop-work      0.810    3.893       68.9   815.8      0.201   0.404

   由这张表定阈值：

   · 光栅任务/帧 —— 修复后最高 0.810，修复前最低 1.246，中间是一段干净的空隙，阈值取 1.0
     （比修复后最差值高 23%，比修复前最好值低 20%，两边都有余量）。这是第二层里最可靠的一条。

   · 光栅累计 ms —— 修复后最高 98，修复前最低 235.6。逐用例给预算，取在两者之间、约为该用例
     修复后实测值的 2–3 倍。注意这是绝对时间，换机器会漂，所以它只负责抓数量级回退。之前这
     几个预算给到 260–560ms，太松了：desktop 的 560ms 连修复前的 815.8ms 都拦不住 —— 那不是
     余量，那是漏网。

   · 绘制/帧 —— 不再作为断言。看表就知道它不区分状态：浏览器用例修复后 0.193–0.205、修复前
     0.199–0.220，两个区间完全重叠，phone-android 甚至修复后(0.202)还高于修复前(0.199)。只有
     TT 和 desktop 两个用例有分离度，靠不住。它现在只打印出来当诊断，不参与判定。留一条量不
     出东西的绿灯，比没有这条更糟 —— 会让人误以为被守住了。

   真正把回退拦下来的是第一层的机制断言（transform 改写 0 次 vs 38 次、clip-path 38 种 vs 1 种），
   二值、没有灰区、与机器无关。第二层是数量级的兜底。 */
const RATIO_BUDGET = { rasterTasksPerFrame: 1.0 };
/* shell 字段 = 壳层的投递路径（见 tools/tavern-live-fixture.js 的 SHELL_VARIANT）。
   inline 是自包含版（脚本内联同步执行），boot 是引导壳（脚本从 http URL 取回再执行）。

   两条路径跑的是同一份 public/shell/status-shell.js，所以裁剪台那套机制本该完全一样 ——
   但「本该」不等于「是」：boot 把脚本执行推到了网络之后，抬升发生在更晚的时刻，裁剪台是在
   一个已经布局完的 #chat 上建起来的，几何取值的时机跟 inline 不同。所以 boot 至少要有一个
   浏览器竖屏和一个 TT 竖屏用例，不能假定它等价。

   只挑两个而不是把 8 个用例翻倍：默认套件的时长要留得住。想跑全矩阵用 --shell boot。 */
const CASES = [
  { id: 'phone-small', preset: 'phone-small', w: 320, h: 568, dsf: 2, host: '', rasterMs: 160, shell: 'inline' },
  { id: 'phone-android', preset: 'phone-android', w: 360, h: 800, dsf: 3, host: '', rasterMs: 160, shell: 'inline' },
  { id: 'phone-iphone', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: '', rasterMs: 180, shell: 'inline' },
  { id: 'phone-wide', preset: 'phone-wide', w: 430, h: 932, dsf: 3, host: '', rasterMs: 180, shell: 'inline' },
  { id: 'phone-iphone-tt', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: 'tauritavern', rasterMs: 180, shell: 'inline' },
  { id: 'tablet-portrait', preset: 'tablet-portrait', w: 768, h: 1024, dsf: 2, host: '', rasterMs: 220, shell: 'inline' },
  { id: 'phone-landscape', preset: 'phone-landscape', w: 844, h: 390, dsf: 3, host: '', rasterMs: 130, shell: 'inline' },
  { id: 'desktop-work', preset: 'desktop-work', w: 1440, h: 900, dsf: 1, host: '', rasterMs: 180, shell: 'inline' },
  { id: 'phone-iphone-boot', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: '', rasterMs: 180, shell: 'boot' },
  { id: 'phone-iphone-tt-boot', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: 'tauritavern', rasterMs: 180, shell: 'boot' },
];

const TRACE_CATEGORIES = ['-*', 'toplevel', 'viz', 'cc', 'blink', 'devtools.timeline',
  'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame'].join(',');

const meta = stageRealSources();
const baselineShell = baselineRev
  ? execFileSync('git', ['show', `${baselineRev}:外部部署/状态栏.html`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  : null;
if (baselineShell) {
  console.log(`⚠ 基线模式：用 ${baselineRev} 版本的壳层（${baselineShell.length} 字节），断言应当失败`);
}

const server = await startFixtureServer({ port: 5223 });
const browser = await chromium.launch();

const failures = [];
const rows = [];
const check = (ok, label, detail = '') => {
  console.log(`    ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};

for (const kase of CASES) {
  if (only && !kase.id.includes(only) && !String(kase.w).includes(only)) continue;
  /* 基线模式只能跑 inline —— 理由在上面 shellOverride 那段。 */
  const shell = baselineShell ? 'inline' : (shellOverride || kase.shell);
  /* 手机尺寸一律跳过：那些格子现在都走原生流，没有被抬起的 iframe 可量。
     以前这里还带一条 `!kase.host`，把 TT 手机端排除在"原生流"之外 —— 那是在描述 TT 还没
     迁移这个事实。TT 手机端并入原生流之后，两个宿主的手机格都该跳过，滚动成本由
     check-mobile-native-flow.mjs 的光栅预算和 probe-mobile-embed-cost.mjs 接管。
     于是这支脚本实际只剩桌面那一格 —— 而抬升架构现在也确实只剩桌面会用到。 */
  const nativeMobileFlow = !baselineShell && kase.w < 880;
  if (nativeMobileFlow) {
    console.log(`
--- skip ${kase.id}: native mobile flow has no lifted iframe; covered by check-mobile-native-flow.mjs ---`);
    continue;
  }
  if (baselineShell && kase.shell === 'boot') {
    console.log(`\n--- 跳过 ${kase.id}：基线模式下引导壳路径不 fetch 状态栏.html，顶替落不到实处 ---`);
    continue;
  }
  console.log(`\n=== ${kase.id}  ${kase.w}x${kase.h}  ${kase.host || 'browser'}  壳层 ${shell}  CPU ${CPU}x ===`);
  const page = await browser.newPage({
    viewport: { width: kase.w, height: kase.h },
    deviceScaleFactor: kase.dsf,
    isMobile: kase.w < 900,
    hasTouch: true,
  });
  const session = await page.context().newCDPSession(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const body = message.text();
    if (/favicon|jsdelivr|fontawesome|webfonts|\.woff|\.ttf|img\/|backgrounds\//i.test(body)) return;
    errors.push(body);
  });

  const record = { ...kase, cpu: CPU };
  const externalHosts = new Set();
  try {
    /* 先注册兜底的外部替身，再注册基线路由。Playwright 按注册的逆序匹配，后注册的先被问到，
       所以基线那条（只匹配 状态栏.html）必须排在后面才能压过兜底。 */
    await stubExternalRequests(page, externalHosts);
    if (baselineShell) {
      /* 夹具 fetch 的是 '/外部部署/V20260826/状态栏.html'，请求 URL 是百分号编码的，所以带中文
         文件名的 glob 匹配不上，必须用谓词。 */
      await page.route(
        (url) => decodeURIComponent(url.pathname).endsWith('状态栏.html'),
        (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: baselineShell }),
      );
    }
    const query = new URLSearchParams({
      chrome: '0', preset: kase.preset, theme: 'Dark V 1.0', floors: '12', rendered: '2',
    });
    if (kase.host) query.set('host', kase.host);
    query.set('shell', shell);
    await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady());
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted());
    await page.waitForTimeout(600);

    /* 把状态栏滚到阅读区上沿附近，让它一定跨越裁剪边界 —— 这才是逐帧改 clip-path 的
       那个场景。 */
    await page.evaluate(() => {
      const chat = document.getElementById('chat');
      const slot = window.__linjiangTavernLive.statusFrame.getBoundingClientRect();
      const pane = chat.getBoundingClientRect();
      chat.scrollTop = Math.max(0, chat.scrollTop + slot.top - pane.top - 30);
    });
    await page.waitForTimeout(400);

    const point = await page.evaluate(() => {
      const chat = document.getElementById('chat');
      const hud = document.getElementById('linjiang-hud-live').getBoundingClientRect();
      const pane = chat.getBoundingClientRect();
      return {
        x: Math.round(hud.left + hud.width / 2),
        y: Math.round(Math.max(pane.top + 90, hud.top + 90)),
        before: chat.scrollTop,
      };
    });

    /* 逐帧采样 HUD 的内联几何。第一层断言全靠它。 */
    await page.evaluate(() => {
      const hud = document.getElementById('linjiang-hud-live');
      const stage = document.getElementById('linjiang-hud-stage');
      const slot = window.__linjiangTavernLive.statusFrame;
      window.__geom = { left: [], top: [], clip: [], transform: [], stage: [], align: [], stop: false };
      const push = (list, value) => { if (list.at(-1) !== value) list.push(value); };
      const step = () => {
        push(window.__geom.left, hud.style.left);
        push(window.__geom.top, hud.style.top);
        push(window.__geom.clip, hud.style.clipPath || hud.style.webkitClipPath || '');
        push(window.__geom.transform, hud.style.transform);
        push(window.__geom.stage, stage ? stage.style.cssText : '(无裁剪台)');
        window.__geom.align.push(+(hud.getBoundingClientRect().top - slot.getBoundingClientRect().top).toFixed(2));
        if (!window.__geom.stop) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: CPU });

    const events = [];
    const onData = (payload) => events.push(...(payload.value || []));
    session.on('Tracing.dataCollected', onData);
    const traceDone = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReportEvents' });

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

    await session.send('Tracing.end');
    await traceDone;
    session.off('Tracing.dataCollected', onData);
    if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    const after = await page.evaluate((before) => {
      window.__geom.stop = true;
      const chat = document.getElementById('chat');
      const hud = document.getElementById('linjiang-hud-live');
      const stage = document.getElementById('linjiang-hud-stage');
      const slot = window.__linjiangTavernLive.statusFrame;
      const style = getComputedStyle(hud);
      const abs = window.__geom.align.map(Math.abs);
      return {
        geom: {
          left: window.__geom.left,
          top: window.__geom.top,
          clip: window.__geom.clip,
          transforms: window.__geom.transform.length,
          stages: window.__geom.stage.length,
          frames: window.__geom.align.length,
        },
        driftMax: abs.length ? +Math.max(...abs).toFixed(2) : null,
        driftOver1: abs.filter((v) => v > 1).length,
        scrolled: Math.round(chat.scrollTop - before),
        endAlign: +(hud.getBoundingClientRect().top - slot.getBoundingClientRect().top).toFixed(2),
        parentIsStage: !!stage && hud.parentNode === stage,
        position: style.position,
        willChange: style.willChange,
        visibility: style.visibility,
        stageOverflow: stage ? getComputedStyle(stage).overflow : '',
        stagePointerEvents: stage ? getComputedStyle(stage).pointerEvents : '',
      };
    }, point.before);

    /* 静止相。提升为合成层要付一次整块纹理的光栅代价 —— 那是一次性的，换掉的是逐帧的。
       但如果哪天有东西让这个层持续失效（常驻动画、反复重写 cssText、快照抖动），代价就
       从一次性变成常驻，手机上会一直发热掉电。所以等它安顿下来之后，什么都不做地再 trace
       一段，断言几乎没有光栅。

       这条断言只有在外部请求被替身接住之后才成立 —— 见 lib/stub-external.mjs 头部的
       那段说明。真机上外链字体和图当然会在随机时刻落地并触发重绘，但那是网络的事，不是
       合成层的事，混在一个断言里量不出任何东西。 */
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const idleEvents = [];
    const onIdleData = (payload) => idleEvents.push(...(payload.value || []));
    session.on('Tracing.dataCollected', onIdleData);
    const idleDone = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReportEvents' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await session.send('Tracing.end');
    await idleDone;
    session.off('Tracing.dataCollected', onIdleData);
    const idleRaster = idleEvents.filter((event) => event.ph === 'X'
      && (event.name === 'RasterTask' || event.name === 'Rasterize'));
    const idle = {
      count: idleRaster.length,
      ms: +(idleRaster.reduce((total, event) => total + (Number(event.dur) || 0), 0) / 1000).toFixed(1),
    };

    const measured = await page.evaluate(() => window.__linjiangTavernLive.measure());

    const xEvents = events.filter((event) => event.ph === 'X');
    const sum = (names) => {
      let ms = 0;
      let count = 0;
      for (const event of xEvents) {
        if (!names.includes(event.name)) continue;
        ms += (Number(event.dur) || 0) / 1000;
        count += 1;
      }
      return { ms: +ms.toFixed(1), count };
    };
    const raster = sum(['RasterTask', 'Rasterize']);
    const paint = sum(['Paint']);
    const styleLayout = sum(['UpdateLayoutTree', 'Layout']);

    record.result = {
      raster, paint, styleLayout, idle, ...after, hudNodes: measured.hudNodes,
      externalHosts: [...externalHosts].sort(),
    };
    rows.push(record);

    const frames = Math.max(1, after.geom.frames);
    const paintsPerFrame = +(paint.count / frames).toFixed(3);
    const rasterTasksPerFrame = +(raster.count / frames).toFixed(3);
    record.result.paintsPerFrame = paintsPerFrame;
    record.result.rasterTasksPerFrame = rasterTasksPerFrame;

    console.log(`    实测  光栅 ${raster.ms}ms / ${raster.count} 次 · 主线程绘制 ${paint.ms}ms / ${paint.count} 次 · `
      + `样式布局 ${styleLayout.ms}ms · 采样 ${frames} 帧 · transform 变了 ${after.geom.transforms} 次`);
    console.log(`    比率  绘制/帧 ${paintsPerFrame} · 光栅任务/帧 ${rasterTasksPerFrame}`);
    console.log(`    静止  安顿 1.5s 后再静置 1.5s：光栅 ${idle.count} 次 / ${idle.ms}ms`
      + `　（外部请求已替身：${[...externalHosts].sort().join(' ') || '无'}）`);

    /* ---- 第零层：壳层真的按预期那条路径装上了 ----
       没有这一条的话，boot 用例万一脚本没取到，会表现为下面一整片机制断言失败，根因看不出来。 */
    check(measured.shellVariant === shell, '壳层走的是预期路径', String(measured.shellVariant));
    /* 记号断言在基线模式下要跳过：SHELL_VERSION 是拆分时才引入的，任何早于那次拆分的壳层
       都不会有这个记号。留着它只会在基线跑里多一条「合理的红」，而混在真正的回退证据里的
       无效红灯，最终结果是没人再看红灯。 */
    if (baselineShell) {
      console.log('    skip  壳层脚本已执行（有 data-linjiang-shell 记号）  基线壳层早于该记号的引入');
    } else {
      check(!!measured.shellVersion, '壳层脚本已执行（有 data-linjiang-shell 记号）',
        measured.shellVersion || '(空 —— 脚本没取到)');
    }

    /* ---- 第一层：机制 ---- */
    check(after.parentIsStage, '机制：HUD 挂在裁剪台里');
    check(after.position === 'absolute', '机制：HUD 是 absolute（由 transform 定位）', after.position);
    check(after.willChange === 'transform', '机制：HUD 提升为合成层', after.willChange);
    check(after.geom.left.length === 1, '机制：滚动中 left 没变过', JSON.stringify(after.geom.left));
    check(after.geom.top.length === 1, '机制：滚动中 top 没变过', JSON.stringify(after.geom.top));
    check(after.geom.clip.every((v) => !v), '机制：滚动中没有写过 clip-path', JSON.stringify(after.geom.clip));
    check(after.geom.stages === 1, '机制：滚动中裁剪台几何没变过', `${after.geom.stages} 种`);
    check(after.geom.transforms > 5, '机制：HUD 真的在跟着滚（transform 在变）', `${after.geom.transforms} 次`);
    check(after.stageOverflow === 'hidden' && after.stagePointerEvents === 'none',
      '机制：裁剪台在裁剪且不吃指针', `overflow=${after.stageOverflow} pointer-events=${after.stagePointerEvents}`);

    /* ---- 第二层：成本 ----
       绘制/帧 不在这里断言，它不区分修复前后（见文件上方那张表），只在上面打印当诊断。 */
    check(rasterTasksPerFrame <= RATIO_BUDGET.rasterTasksPerFrame,
      `成本：光栅任务 ≤ ${RATIO_BUDGET.rasterTasksPerFrame} 个/帧（修复前 1.25–3.89）`, String(rasterTasksPerFrame));
    check(raster.ms <= kase.rasterMs, `成本：光栅累计 ≤ ${kase.rasterMs}ms（修复前 236–816）`, `${raster.ms}ms`);
    check(idle.count <= 4, '成本：安顿后静止 1.5 秒几乎不光栅（提升的代价是一次性的）',
      `${idle.count} 次 / ${idle.ms}ms`);

    /* ---- 功能没坏 ---- */
    check(after.scrolled > 100, '功能：手势把 #chat 滚起来了', `${after.scrolled}px`);
    check(Math.abs(after.endAlign) <= 1, '功能：手势结束后 HUD 与栏位对齐', `${after.endAlign}px`);
    check(after.driftOver1 === 0, '功能：手势中错位始终 ≤1px', `最大 ${after.driftMax}px，超标 ${after.driftOver1}/${after.geom.frames} 帧`);
    check(after.visibility === 'visible', '功能：HUD 仍然可见', after.visibility);
    check(measured.hudMoney.includes('512,300'), '功能：MVU 快照仍在 HUD 上', measured.hudMoney || '(空)');
    if (kase.host === 'tauritavern') {
      check(measured.ttSurface === 'none' && measured.ttAdmitted === false && measured.ttOriginalTop === '',
        '功能：TauriTavern 浮层准入退出契约仍成立',
        `surface=${measured.ttSurface} admitted=${measured.ttAdmitted} originalTop=${measured.ttOriginalTop || '(空)'}`);
    }
    check(errors.length === 0, '无脚本错误', errors.slice(0, 2).join(' | '));
  } catch (error) {
    check(false, '用例执行', error.message);
    record.error = error.message;
    rows.push(record);
  }
  await page.close();
}

await browser.close();
await server.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ meta, cpu: CPU, rows }, null, 2));

console.log(`\n真实源码：ST ${meta.versions.sillytavern} · 酒馆助手 ${meta.versions.tavernHelper} · TauriTavern ${meta.versions.tauritavern}`);
if (failures.length) {
  console.log('\n光栅回归失败：');
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('被抬起状态栏的滚动光栅回归：全部通过');
