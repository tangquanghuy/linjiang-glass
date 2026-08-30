/* 状态栏黑屏回归。
   ==================================================================
   用户反馈「状态栏会黑屏，移动端尤其明显」。黑屏在 DOM 上没有对应概念，所以这支脚本先把它
   翻译成可数的东西，再在四个真实宿主组合上分别度量。

   判据（实现在 tools/tavern-live-fixture.js 的 blackoutSample）
   ------------------------------------------------------------------
   壳层骨架给 html/body 涂的是 #05040a，所以「楼层占着高度、里面却没有画好的 HUD」在屏幕上
   就是一块纯深色。于是：

     可见条面积 = Σ（每个状态栏楼层里"已画好且可见"的 HUD ∩ #chat 可视区）

   面积为 0 且楼层仍占着高度 = 用户看到的黑屏。逐帧采样，取最长的一段 area==0，就是黑屏时长。
   另外用截图算「阅读栏区域里接近 #05040a 的像素占比」做一次像素级复核，免得判据本身骗自己。

   四个宿主组合
   ------------------------------------------------------------------
   壳层里有三条互斥的架构分支，四个组合刚好把它们盖全：

     browser-pc     原生浏览器 + 桌面宽度   → 抬升架构（HUD 挂在酒馆文档上，楼层只是锚点）
     browser-phone  原生浏览器 + 手机       → 原生流（HUD bundle 直接在楼层文档里执行）
     tt-pc          TauriTavern + 桌面      → 抬升架构（__TAURITAVERN__ 在，但不装移动 compat）
     tt-phone       TauriTavern + 手机      → 抬升架构（MOBILE_NATIVE_FLOW 明确排除 TT）+ 真实的
                                             几何防火墙和浮层准入在跑

   受测产物是用户线上粘的那一份：外部部署/V20260826/状态栏-测试版-流内嵌入.html（shell=flow，
   INLINE_DOCK=true）。

   四个场景
   ------------------------------------------------------------------
     handover     来了一条新 AI 消息 → owner 交接。原生流下这会把 HUD 从头挂一遍。
     recovery     挂载时网络失败一次，之后网络恢复且该楼层重新当选 → 它能不能自愈。
     stale        旧楼层被重新渲染（swipe / 重渲染 / WebKit 丢弃后回滚）→ 它带着更小的 mesid
                  重新注册，选不上，那它有没有把自己的高度交出去。
     pileup       连续来 6 条消息 → 有多少份 HUD 还活在各个楼层文档里，堆了多少堆内存。

   用法：
     node scripts/check-status-blackout.mjs                 # 全部
     node scripts/check-status-blackout.mjs --only=tt-phone # 只跑一个组合
     node scripts/check-status-blackout.mjs --shots         # 额外存截图
*/
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { PROJECT_ROOT, stageRealSources } from './lib/real-tavern-sources.mjs';
import { stubExternalRequests } from './lib/stub-external.mjs';

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice('--only='.length);
const wantShots = args.includes('--shots');
/* 选举过程的逐步日志。排查「栏整块消失」这类问题时，光看终态是猜；这个开关把
   register / elect / unregister 的每一次进出都打出来。 */
const debugElect = args.includes('--debug-elect');
const SHOT_DIR = join(PROJECT_ROOT, 'artifacts', 'status-blackout');
mkdirSync(SHOT_DIR, { recursive: true });

/* UA 很重要，不是装饰：TauriTavern 的 bootstrap.js 用 UA 决定装不装移动端 compat，
   壳层的 MOBILE_NATIVE_FLOW 也读 UA。Playwright 的 isMobile/hasTouch 都不改 UA，
   所以必须显式给。 */
const UA = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  desktopTt: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 TauriTavern/2.2.0',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
  iosTt: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TauriTavern/2.2.0',
};

const TARGETS = [
  {
    id: 'browser-pc', label: '原生浏览器 · 桌面 1440×900',
    preset: 'desktop-work', w: 1440, h: 900, dsf: 1, touch: false, host: null, ua: UA.desktop,
    architecture: 'lifted',
  },
  {
    id: 'browser-phone', label: '原生浏览器 · 手机 390×844',
    preset: 'phone-iphone', w: 390, h: 844, dsf: 3, touch: true, host: null, ua: UA.android,
    architecture: 'native-flow',
  },
  {
    id: 'tt-pc', label: 'TauriTavern · 桌面 1440×900',
    preset: 'desktop-work', w: 1440, h: 900, dsf: 1, touch: false, host: 'tauritavern', ua: UA.desktopTt,
    architecture: 'lifted',
  },
  {
    /* TT 手机端已经并入原生流（见壳层 MOBILE_NATIVE_FLOW 上面那段）。这一格的期望值从
       lifted 改成 native-flow 是这次迁移的核心断言：TT 是移动端的主要宿主，而它以前被那条
       `if (host.__TAURITAVERN__) return false` 挡在唯一为移动端性能做的那条路之外。 */
    id: 'tt-phone', label: 'TauriTavern · 手机 390×844',
    preset: 'phone-iphone', w: 390, h: 844, dsf: 3, touch: true, host: 'tauritavern', ua: UA.iosTt,
    architecture: 'native-flow',
  },
];

/* 预算。
   ------------------------------------------------------------------
   handoverMs：交接过程中允许「屏幕上没有任何画好的状态栏」的最长时间。给 150ms 是因为
     一次跨文档的显示权交换至少要走几帧（新楼层布局 + 旧楼层折叠），但不该到肉眼可辨的程度。
   pileup：连续 6 条消息之后，还活着（DOM 没被收走）的 HUD 实例数上限。抬升架构天然是 1，
     原生流如果每层留一份就会线性涨。 */
const BUDGET = {
  handoverMs: 150,
  /* 限速下的预算。本地夹具里 HUD 就在同一台机器上，交接的黑窗口只有几十毫秒 —— 那个数字
     跟用户的处境无关。手机场景额外跑一遍 4G 时延，才是反馈里那个「黑一下」的真实量级。 */
  handoverSlowMs: 300,
  recoveryMs: 12000,
  staleAnchorPx: 8,
  /* 壳层里的 KEEP_MOUNTED 就是 3：owner 一份，加上"删掉末条消息后还能退回去"的余量两份。
     再多就是纯堆积了。 */
  pileupInstances: 3,
  /* 楼层区域里接近 #05040a 的像素占比。0.9 以上基本就是一块纯黑。 */
  darkFraction: 0.9,
};

/* CDP 的网络条件。按国内 4G 的常见量级给：150ms RTT、下行 4Mbps。
   jsDelivr / Pages 的实测中位延迟比这更差（见 scripts/build-status-shell.mjs 的那组数据），
   所以这是保守值。 */
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1024 * 1024) / 8 };
const NO_THROTTLE = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };



const failures = [];
const rows = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};

/** 截图里接近 #05040a 的像素占比。判据本身是 DOM 推导的，这一条是独立的像素级复核。 */
function darkFraction(buffer) {
  const png = PNG.sync.read(buffer);
  let dark = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    /* #05040a 附近；容差给宽一点，因为骨架底色上还会叠 #chat 的 backdrop-filter。 */
    if (r <= 24 && g <= 24 && b <= 32) dark += 1;
  }
  return +(dark / (png.width * png.height)).toFixed(3);
}

async function shot(page, name, clip) {
  if (!wantShots) return null;
  const path = join(SHOT_DIR, `${name}.png`);
  const buffer = await page.screenshot(clip ? { path, clip } : { path });
  return { path, dark: darkFraction(buffer) };
}

/** #chat 在视口里的矩形，截图裁剪用。 */
const chatClip = (page) => page.evaluate(() => {
  const r = document.getElementById('chat').getBoundingClientRect();
  return {
    x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)),
    width: Math.min(Math.round(r.width), innerWidth), height: Math.min(Math.round(r.height), innerHeight),
  };
});

/* 先强制一次 GC 再读。不 GC 的话 JSHeapUsedSize 里掺着还没回收的垃圾，"放掉了几份实例"
   这个问题就量不出来 —— 实测同一份代码两次运行能差出 5MB。 */
const heapMb = async (session) => {
  try { await session.send('HeapProfiler.collectGarbage'); } catch (e) { /* 拿不到就读原值 */ }
  const { metrics } = await session.send('Performance.getMetrics');
  const row = metrics.find((m) => m.name === 'JSHeapUsedSize');
  return row ? +(row.value / 1048576).toFixed(1) : null;
};

/** 等到「屏幕上有画好的状态栏」，或超时。返回等了多久。 */
async function waitPainted(page, timeout) {
  const started = Date.now();
  for (;;) {
    const sample = await page.evaluate(() => window.__linjiangTavernLive.blackoutSample());
    if (sample.area > 0) return { ms: Date.now() - started, sample };
    if (Date.now() - started > timeout) return { ms: Date.now() - started, sample, timedOut: true };
    await page.waitForTimeout(60);
  }
}

/** 等到**指定那一层**接管完成（判据见夹具的 floorTakeover）。 */
async function waitFloorPainted(page, index, timeout) {
  const started = Date.now();
  for (;;) {
    const state = await page.evaluate((i) => window.__linjiangTavernLive.floorTakeover(i), index);
    if (state.ready) return { ms: Date.now() - started, state };
    if (Date.now() - started > timeout) return { ms: Date.now() - started, state, timedOut: true };
    await page.waitForTimeout(60);
  }
}

const meta = stageRealSources();
const server = await startFixtureServer({ port: 5231 });
const browser = await chromium.launch();

for (const target of TARGETS) {
  if (only && target.id !== only) continue;
  console.log(`\n=== ${target.id} · ${target.label} ===`);
  const page = await browser.newPage({
    viewport: { width: target.w, height: target.h },
    deviceScaleFactor: target.dsf,
    isMobile: target.touch,
    hasTouch: target.touch,
    userAgent: target.ua,
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');

  /* HUD 文档的故障注入。必须**后于** stubExternalRequests 注册：Playwright 按逆序匹配，
     后注册的先被问到；不该拦的时候 fallback 下去让外部替身照常工作。 */
  let blockHudDocument = false;
  let hudDocumentHits = 0;

  /* 报错按「当时有没有在注入故障」分档。注入期间的 fetch 失败是场景本身，不能算问题；
     但也不能整段忽略这类文字，否则真正的加载失败会被一起藏掉。 */
  let injecting = false;
  const errors = [];
  const noteError = (body) => {
    if (/favicon|fontawesome|webfonts|\.woff|\.ttf|img\/|backgrounds\//i.test(body)) return;
    errors.push({ body, injected: injecting });
  };
  page.on('pageerror', (error) => noteError(error.message));
  page.on('console', (message) => {
    if (debugElect && /PROBE/.test(message.text())) console.log(`      ${message.text()}`);
    if (message.type() !== 'error') return;
    noteError(message.text());
  });

  await stubExternalRequests(page, new Set());
  /* 两种架构取 HUD 文档的方式不同，但都落在同一个路径上：
       原生流    fetch('/')                      —— resourceType 'fetch'
       抬升架构  <iframe src="/?host=…&v=…">     —— resourceType 'document'
     所以按 pathname 匹配，别按完整 URL（抬升那边带查询串）。 */
  await page.route(
    (url) => url.origin === server.url && url.pathname === '/',
    (route) => {
      hudDocumentHits += 1;
      if (blockHudDocument) return route.abort('failed');
      return route.fallback();
    },
  );

  const row = { id: target.id, label: target.label };
  rows.push(row);

  try {
    const query = new URLSearchParams({
      chrome: '0', preset: target.preset, theme: 'Dark V 1.0',
      floors: '6', rendered: '0', statusFloors: '3', shell: 'flow',
    });
    if (target.host) query.set('host', target.host);
    await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady(60000));
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted(60000));
    await page.waitForTimeout(600);

    const boot = await page.evaluate(() => ({
      measure: window.__linjiangTavernLive.measure(),
      floors: window.__linjiangTavernLive.floorReport(),
      manager: window.__linjiangTavernLive.managerReport(),
    }));
    if (debugElect) {
      await page.evaluate(() => {
        const m = window.__linjiangHudManagerV2;
        const snap = () => `electTick=${m.electTick} owner=${m.owner?.rank ?? null} 候选=${[...m.candidates.values()].map((r) => `${r.rank}${r.frame?.isConnected ? '' : '!conn'}${r.destroyed() ? '!dead' : ''}`).join(',')}`;
        for (const name of ['elect', 'scheduleElect', 'unregister', 'register']) {
          const original = m[name].bind(m);
          m[name] = (...a) => {
            console.log(`PROBE ${name} 进  ${snap()}`);
            const out = original(...a);
            console.log(`PROBE ${name} 出  ${snap()}`);
            return out;
          };
        }
      });
    }

    const nativeFlow = boot.measure.nativeFlow;
    row.architecture = nativeFlow ? 'native-flow' : 'lifted';
    check(row.architecture === target.architecture,
      `架构判定 = ${target.architecture}`, `实际 ${row.architecture}`);

    /* ---------------------------------------------------------------- 开机静态检查
       三个状态栏楼层里只有最新那个该占着高度，另外两个必须已经把高度交出去
       （collapseAnchor 把 height/opacity 都压成 0）。#chat 此刻停在顶部，也就是用户刚打开
       对话时看到的位置 —— 靠上的那个状态栏楼层就在首屏里，它要是既没画好又占着高度，
       用户第一眼看到的就是一块黑。所以这一条要连像素一起验。 */
    const ownerIndex = boot.floors.length - 1;
    const staleAtBoot = boot.floors
      .filter((f, i) => i !== ownerIndex)
      .map((f) => ({ index: f.index, anchorH: f.anchorH, stage: f.stage, collapsed: f.collapsed, rect: f.rect }));
    row.staleAtBoot = staleAtBoot.map(({ rect, ...rest }) => rest);
    const bootOffenders = staleAtBoot.filter((f) => f.anchorH > BUDGET.staleAnchorPx);
    check(bootOffenders.length === 0, '开机后非 owner 楼层已交出高度', JSON.stringify(row.staleAtBoot));
    for (const offender of bootOffenders) {
      /* 像素级复核：这块区域是不是真的一片 #05040a。 */
      const clip = offender.rect && offender.rect.y >= 0 && offender.rect.height > 4
        && offender.rect.y + offender.rect.height <= target.h ? offender.rect : null;
      const captured = clip ? await shot(page, `${target.id}-boot-black-floor${offender.index}`, clip) : null;
      if (captured) {
        row.bootBlackShot = captured;
        check(captured.dark < BUDGET.darkFraction,
          `开机首屏第 ${offender.index} 层不是纯黑块`,
          `深色像素占比 ${captured.dark}（${offender.anchorH}px 高）`);
      }
    }

    /* 后面所有跟"可见"有关的断言都要求 owner 在屏幕上。真实使用里用户就是停在底部的。 */
    await page.evaluate(() => window.__linjiangTavernLive.stickToBottom(600));
    await page.waitForTimeout(800);

    /* ---------------------------------------------------------------- stale
       旧楼层重新出现：带着更小的 mesid 重新注册，选不上。它有没有把自己的高度交出去？
       两种入口都要测，因为它们的起点不同（详见夹具里 recreateStatusFloor 的说明）：
         rerender  复用同一个 iframe 元素 —— 上一任文档在 pagehide 里写下的折叠还在
         recreate  全新的 iframe 元素 —— 什么都没有，只能靠壳层自己交高度 */
    row.stale = {};
    for (const [kind, api] of [['rerender', 'rerenderStatusFloor'], ['recreate', 'recreateStatusFloor']]) {
      await page.evaluate((name) => window.__linjiangTavernLive[name](0), api);
      await page.waitForTimeout(2200);
      const after = await page.evaluate(() => ({
        floors: window.__linjiangTavernLive.floorReport(),
        sample: window.__linjiangTavernLive.blackoutSample(),
      }));
      const floor = after.floors[0];
      row.stale[kind] = {
        anchorH: floor.anchorH, stage: floor.stage, collapsed: floor.collapsed,
        shell: !!floor.shellVersion, ownerArea: after.sample.area,
      };
      check(!!floor.shellVersion, `stale(${kind})：旧楼层里壳层确实执行了`, floor.shellVersion || '(空)');
      check(floor.anchorH <= BUDGET.staleAnchorPx,
        `stale(${kind})：旧楼层没有留下占高度的黑块`,
        `anchorH=${floor.anchorH}px stage=${floor.stage} collapsed=${floor.collapsed}`);
      check(after.sample.area > 0, `stale(${kind})：owner 没有被旧楼层的重新注册搞掉`,
        `area=${after.sample.area} stages=${JSON.stringify(after.sample.stages)}`);
      if (floor.anchorH > BUDGET.staleAnchorPx) {
        /* 先把那一层滚进视口，否则裁的是别处，像素读数毫无意义。 */
        const clip = await page.evaluate(() => {
          const api = window.__linjiangTavernLive;
          api.scrollToFloor(0);
          const rect = api.floorReport()[0].rect;
          if (!rect) return null;
          const y = Math.max(0, rect.y);
          const height = Math.min(rect.height - (y - rect.y), innerHeight - y);
          return height > 4 ? { x: Math.max(0, rect.x), y, width: rect.width, height: Math.round(height) } : null;
        });
        const captured = await shot(page, `${target.id}-stale-${kind}-black`, clip || await chatClip(page));
        if (captured) {
          row.stale[kind].shot = captured;
          check(captured.dark < BUDGET.darkFraction,
            `stale(${kind})：那块区域不是纯黑`, `深色像素占比 ${captured.dark}（裁剪 ${JSON.stringify(clip)}）`);
        }
        await page.evaluate(() => window.__linjiangTavernLive.stickToBottom(400));
        await page.waitForTimeout(500);
      }
    }

    /* ---------------------------------------------------------------- handover
       来了一条新 AI 消息。逐帧采样整个交接过程，取最长的一段「屏幕上没有画好的状态栏」。
       跑两遍：不限速的一遍量机制本身，限速那一遍才是用户的处境（HUD bundle 走网络）。 */
    const handoverRun = async (label, conditions, budgetMs) => {
      await session.send('Network.emulateNetworkConditions', conditions);
      const heapBefore = await heapMb(session);
      const newIndex = await page.evaluate(() => {
        const api = window.__linjiangTavernLive;
        api.startBlackoutSampler();
        api.stickToBottom(8000);
        return api.appendStatusFloor();
      });
      const painted = await waitFloorPainted(page, newIndex, 30000);
      await page.waitForTimeout(400);
      const result = await page.evaluate(() => {
        const api = window.__linjiangTavernLive;
        api.stopBlackoutSampler();
        return { summary: api.blackoutSummary(), sample: api.blackoutSample(), floors: api.floorReport() };
      });
      await session.send('Network.emulateNetworkConditions', NO_THROTTLE);
      const entry = {
        worstMs: result.summary.worstMs,
        endedBlack: result.summary.endedBlack,
        frames: result.summary.frames,
        gaps: result.summary.gaps.slice(0, 6),
        paintedAfterMs: painted.ms,
        timedOut: !!painted.timedOut,
        heapBefore,
        hudDocumentHits,
      };
      check(!painted.timedOut, `handover(${label})：新楼层最终接管了`,
        `${painted.ms}ms ${JSON.stringify(painted.state)}`);
      check(result.summary.worstMs <= budgetMs,
        `handover(${label})：黑屏 ≤ ${budgetMs}ms`,
        `最长 ${result.summary.worstMs}ms（${result.summary.frames} 帧，间隙 ${JSON.stringify(entry.gaps)}）`);
      check(!result.summary.endedBlack, `handover(${label})：结束时不是黑的`,
        `area=${result.sample.area} stages=${JSON.stringify(result.sample.stages)}`);
      return entry;
    };

    row.handover = await handoverRun('本地', NO_THROTTLE, BUDGET.handoverMs);
    row.handoverSlow = await handoverRun('4G 时延', SLOW_4G, BUDGET.handoverSlowMs);
    row.handoverShot = await shot(page, `${target.id}-after-handover`, await chatClip(page));

    /* ---------------------------------------------------------------- recovery
       挂载时网络失败一次。原生流下 mountMobileNativeHud 把那个 promise 记住了，所以问题是
       「网络恢复、这一楼重新当选之后，它会不会再试一次」。
       复现路径全是真实动作：新消息（挂载失败）→ 再来一条新消息（这条成功）→ 删掉最后那条
       （等于 swipe / 删除末条消息）→ 选举退回到失败那一楼。 */
    injecting = true;
    blockHudDocument = true;
    const failedIndex = await page.evaluate(() => {
      const api = window.__linjiangTavernLive;
      api.stickToBottom(3000);
      return api.appendStatusFloor();
    });
    await page.waitForTimeout(2500);
    const duringFailure = await page.evaluate(() => ({
      sample: window.__linjiangTavernLive.blackoutSample(),
      floors: window.__linjiangTavernLive.floorReport(),
    }));
    row.mountFailure = {
      index: failedIndex,
      area: duringFailure.sample.area,
      stage: duringFailure.floors[failedIndex]?.stage,
      hint: duringFailure.floors[failedIndex]?.hint,
    };
    blockHudDocument = false;

    /* 再来一条正常的消息，然后删掉它 —— 选举会退回到失败那一楼。 */
    const healthyIndex = await page.evaluate(() => {
      const api = window.__linjiangTavernLive;
      api.stickToBottom(3000);
      return api.appendStatusFloor();
    });
    await waitFloorPainted(page, healthyIndex, 25000);
    await page.evaluate((index) => {
      const api = window.__linjiangTavernLive;
      api.removeStatusFloor(index + 1);
      api.stickToBottom(2000);
    }, failedIndex);
    const recovered = await waitPainted(page, BUDGET.recoveryMs);
    const recovery = await page.evaluate(() => ({
      floors: window.__linjiangTavernLive.floorReport(),
      manager: window.__linjiangTavernLive.managerReport(),
      lifted: window.__linjiangTavernLive.liftedReport(),
      sample: window.__linjiangTavernLive.blackoutSample(),
    }));
    row.recovery = {
      ms: recovered.ms,
      timedOut: !!recovered.timedOut,
      area: recovery.sample.area,
      stages: recovery.sample.stages,
      lifted: recovery.lifted,
      ownerId: recovery.manager?.ownerId,
      ownerRank: recovery.manager?.ownerRank,
      candidates: recovery.manager?.candidates,
      floors: recovery.floors.map((f) => `${f.index}:${f.stage}:${f.anchorH}px${f.isOwner ? '*' : ''}${f.hasBridge ? '+bridge' : ''}`),
    };
    check(!recovered.timedOut,
      'recovery：一次挂载失败之后还能自愈',
      `${recovered.ms}ms area=${recovery.sample.area} owner=${recovery.manager?.ownerRank} lifted=${JSON.stringify(recovery.lifted)} floors=${JSON.stringify(row.recovery.floors)}`);
    if (recovered.timedOut) {
      row.recoveryShot = await shot(page, `${target.id}-recovery-black`, await chatClip(page));
    }
    injecting = false;

    /* ---------------------------------------------------------------- chat-switch
       切换对话。这是「延迟调度被丢掉」那条根因最狠的表现：switchContext 把 epoch 加一，
       仍然连着的候选要靠一次延迟收编捞回来，而那次延迟原来是 manager 用自己（可能已经消失的）
       realm 的闭包排的期 —— 一旦被丢掉，选举一个候选都选不出来，HUD 连裁剪台都不建，
       状态栏整块消失，直到下一条新消息才回来。

       两种事件顺序都要过：壳层自己的注释就写着 chatLoaded 和替换楼层的先后没有保证。 */
    row.chatSwitch = {};
    for (const order of ['event-first', 'floors-first']) {
      const info = await page.evaluate((mode) => window.__linjiangTavernLive
        .switchChat(`chat-${mode}`, { order: mode }), order);
      await page.evaluate(() => window.__linjiangTavernLive.stickToBottom(1200));
      const back = await waitPainted(page, 15000);
      const state = await page.evaluate(() => ({
        manager: window.__linjiangTavernLive.managerReport(),
        floors: window.__linjiangTavernLive.floorReport(),
        sample: window.__linjiangTavernLive.blackoutSample(),
        lifted: window.__linjiangTavernLive.liftedReport(),
      }));
      const blankFloors = state.floors.filter((f) => f.anchorH > BUDGET.staleAnchorPx
        && f.stage !== 'painted' && !f.isOwner);
      row.chatSwitch[order] = {
        ms: back.ms,
        timedOut: !!back.timedOut,
        epoch: state.manager?.epoch,
        ownerRank: state.manager?.ownerRank,
        candidates: state.manager?.candidates.length,
        area: state.sample.area,
        blankFloors: blankFloors.map((f) => `${f.index}:${f.anchorH}px:${f.stage}`),
      };
      check(!back.timedOut, `chat-switch(${order})：切完对话状态栏还在`,
        `${back.ms}ms epoch=${state.manager?.epoch} owner=${state.manager?.ownerRank} `
        + `候选=${state.manager?.candidates.length} area=${state.sample.area} `
        + `stages=${JSON.stringify(state.sample.stages)}`);
      check(state.manager?.ownerRank != null, `chat-switch(${order})：选出了 owner`,
        JSON.stringify(state.manager?.candidates));
      check(blankFloors.length === 0, `chat-switch(${order})：没有留下占高度的空楼层`,
        JSON.stringify(row.chatSwitch[order].blankFloors));
      if (back.timedOut) {
        row.chatSwitch[order].shot = await shot(page, `${target.id}-chatswitch-${order}-black`, await chatClip(page));
      }
      void info;
    }

    /* ---------------------------------------------------------------- pileup
       连续 6 条消息。每次交接都会在新楼层里再挂一份 HUD；旧楼层的那份如果只是被隐藏、
       没有被收走，实例数就会线性涨。 */
    for (let i = 0; i < 6; i += 1) {
      const index = await page.evaluate(() => {
        const api = window.__linjiangTavernLive;
        api.stickToBottom(2500);
        return api.appendStatusFloor();
      });
      await waitFloorPainted(page, index, 25000);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(800);
    const heapBefore = row.handover?.heapBefore ?? null;
    const heapAfter = await heapMb(session);
    const pileup = await page.evaluate(() => {
      const api = window.__linjiangTavernLive;
      const floors = api.floorReport();
      return {
        floors: floors.length,
        alive: floors.filter((f) => f.nodes >= 60).length,
        stages: floors.map((f) => `${f.index}:${f.stage}${f.isOwner ? '*' : ''}`),
        /* 「占着高度又没画好」= 屏幕上那块黑。抬升架构下 owner 的锚点本来就该占着高度
           （共用 HUD 是跟着它走的），所以那一层不算。 */
        occupiedButBlank: floors.filter((f, i) => f.anchorH > 8 && f.stage !== 'painted'
          && !api.floorTakeover(i).ready).length,
        blankFloors: floors.filter((f, i) => f.anchorH > 8 && f.stage !== 'painted'
          && !api.floorTakeover(i).ready).map((f) => `${f.index}:${f.anchorH}px:${f.stage}`),
        sample: api.blackoutSample(),
        manager: api.managerReport(),
      };
    });
    row.pileup = {
      floors: pileup.floors, alive: pileup.alive,
      occupiedButBlank: pileup.occupiedButBlank,
      heapBefore, heapAfter, heapDelta: heapAfter != null && heapBefore != null ? +(heapAfter - heapBefore).toFixed(1) : null,
      candidates: pileup.manager?.candidates.length ?? null,
    };
    check(pileup.alive <= BUDGET.pileupInstances,
      `pileup：活着的 HUD 实例 ≤ ${BUDGET.pileupInstances}`,
      `${pileup.alive} 份 / ${pileup.floors} 层，堆 ${heapBefore}→${heapAfter}MB，stages ${JSON.stringify(pileup.stages)}`);
    check(pileup.occupiedButBlank === 0,
      'pileup：没有"占着高度又没画好"的楼层',
      `${pileup.occupiedButBlank} 层 ${JSON.stringify(pileup.blankFloors)}`);
    check(pileup.sample.area > 0, 'pileup：最后屏幕上有画好的状态栏', JSON.stringify(pileup.sample));

    const realErrors = errors.filter((e) => !e.injected).map((e) => e.body);
    row.injectedErrors = errors.filter((e) => e.injected).length;
    check(realErrors.length === 0, '没有脚本报错（故障注入期间的除外）', realErrors.slice(0, 3).join(' | '));
  } catch (error) {
    check(false, `${target.id} 执行`, error.message);
    row.error = error.message;
  }
  await page.close();
}

await browser.close();
await server.close();

console.log('\n---- 汇总 ----');
for (const row of rows) {
  console.log(`\n${row.id}（${row.architecture || '?'}）`);
  if (row.error) { console.log(`  执行失败：${row.error}`); continue; }
  console.log(`  handover  本地黑屏最长 ${row.handover?.worstMs}ms  4G 时延下 ${row.handoverSlow?.worstMs}ms  结束时黑=${row.handoverSlow?.endedBlack}  HUD 文档请求累计 ${row.handoverSlow?.hudDocumentHits} 次`);
  console.log(`  stale     rerender anchorH=${row.stale?.rerender?.anchorH}px/${row.stale?.rerender?.stage}  recreate anchorH=${row.stale?.recreate?.anchorH}px/${row.stale?.recreate?.stage}`);
  console.log(`  recovery  ${row.recovery?.timedOut ? `未自愈（等了 ${row.recovery?.ms}ms）` : `${row.recovery?.ms}ms 自愈`}  失败时 area=${row.mountFailure?.area} stage=${row.mountFailure?.stage}`);
  const cs = row.chatSwitch || {};
  console.log(`  切对话     事件先 ${cs['event-first']?.timedOut ? '状态栏消失' : `${cs['event-first']?.ms}ms 恢复`}  楼层先 ${cs['floors-first']?.timedOut ? '状态栏消失' : `${cs['floors-first']?.ms}ms 恢复`}`);
  console.log(`  pileup    ${row.pileup?.alive}/${row.pileup?.floors} 份实例活着  占高度但空白 ${row.pileup?.occupiedButBlank} 层  堆 ${row.pileup?.heapBefore}→${row.pileup?.heapAfter}MB（+${row.pileup?.heapDelta}）`);
}

writeFileSync(join(SHOT_DIR, 'report.json'), JSON.stringify({
  at: new Date().toISOString(), versions: meta.versions, budget: BUDGET, rows,
}, null, 2), 'utf8');
console.log(`\n真实源码：ST ${meta.versions.sillytavern} · 酒馆助手 ${meta.versions.tavernHelper} · TauriTavern ${meta.versions.tauritavern}`);
console.log(`报告：artifacts/status-blackout/report.json`);

if (failures.length) {
  console.log('\n状态栏黑屏回归失败：');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('状态栏黑屏回归：全部通过');
