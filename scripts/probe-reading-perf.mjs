/* 正文美化的规模代价。
   ==================================================================
   外部部署/V20260826/正文美化.html 是 581KB（369KB CSS + 199KB JS + 8KB 骨架，其中 5 张内联
   base64 WebP 约 204KB）。它的部署方式是 SillyTavern 的正则把 AI 正文捕获成 $1 塞进这个
   模板，酒馆助手再把整块渲染成一个 srcdoc iframe —— 也就是**每条 AI 消息一个独立副本**。
   而酒馆助手的「渲染深度」默认是 0，calcToRender 里 0 表示「全部楼层都渲染」。

   所以这支脚本量的不是「这份代码写得好不好」，而是「N 份同时活着要多少钱」：随楼层数变化的
   JS 堆、节点数、样式规则数、文档数，以及一段滚动手势的光栅代价。

   两件让早期数字全部作废的事，记在这里免得再犯：

   一、夹具必须加载酒馆助手的 dist/index.css。少了它，本该被 `hidden!` 折叠的 <pre><code> 会把
       整份源码当可见文本铺出来，一条楼层高到 416000px，而且高度随源码体积变化 —— 于是「按体积
       做的对比」量的其实是「渲染了多少像素的源码文本」。下面的保真门禁卡了一条 5000px 上限。

   二、外部请求必须换成确定性替身，而且每个组合必须重复采样。readyMs 是一次性事件的墙钟时间，
       正文美化的揭开路径上有 GOOGLE_READING_FONT_HREF，不 stub 的话这个数字里掺着「Google
       Fonts 这次花多久失败」；只跑一次的话，变体间的差值可能整个是噪声。

   用法：
     node scripts/probe-reading-perf.mjs                  # 1 / 4 / 8 / 16 层，每格 5 次
     node scripts/probe-reading-perf.mjs --floors 1,8,24
     node scripts/probe-reading-perf.mjs --repeat 7 --variants inline,external
     node scripts/probe-reading-perf.mjs --cpu 1 --json artifacts/reading-perf.json

   ------------------------------------------------------------------
   校准结果（这台机器，CPU 4x，--floors 1,16 --repeat 5，中位数 [最小–最大]）。
   artifacts/ 是 gitignore 的，所以这张表是唯一留得下来的记录。

   16 个阅读器楼层：

     指标            inline              external            判定
     就绪 ms         808 [775–858]       653 [633–743]       −19.2%，区间不重叠 → 真收益
     样式 ms         232 [230–243]       164 [162–182]       −29.3%，区间不重叠 → 真收益
     JS堆 MB         30.3 [30.3–31.5]    31.9 [31.1–32.5]    +5.3%，区间重叠 → 未分辨出，反正没省
     脚本 ms         126 [117–134]       123 [121–143]       −2.4%，区间重叠 → 未分辨出
     滚动绘制 ms     6.4 [5.3–6.6]       5.8 [5.5–6.1]       −9.4%，区间重叠 → 未分辨出
     CSS 规则        13168               13168               完全相同

   边际成本（1 → 16 层）：

     变体            就绪 ms/层    JS堆 MB/层    滚动绘制 ms/层
     inline            29.2          1.16           ≈0
     external          24.2          1.25           ≈0
     external+js       21.9          1.28           ≈0

   怎么读这张表：

   · 收益全部集中在「每个 iframe 各自解析 369KB 内联 CSS 文本」这一件事上 —— 就绪 −19%、
     累计样式重算 −29%。这两条区间不重叠，站得住。

   · CSSOM 一条没省。13168 条规则三个变体完全相同：外链只是把字节从 srcdoc 里挪走，每个 iframe
     文档照样建自己的一份 CSSOM。所以 JS 堆也没省，中位数甚至略高（多了外部样式表对象），
     边际每层 1.16 → 1.25MB 是变差 8%。100 层约 120MB 这个隐忧，外链解决不了。

   · 滚动完全不是瓶颈，也不该指望它变好。整段手势主线程绘制 6ms 上下，边际 ≈0 ms/层 ——
     iframe 各自合成，滚动成本不随楼层数涨。

   · external+js 相对 external：16 层就绪 624 [595–657] vs 653 [633–743]，区间重叠，没分辨出来。
     边际差 2.3 ms/层。也就是说再把内联 JS 外链，收益在噪声里，而失败模式最差 —— 脚本取不到时
     revealReading() 不执行，整页永久空白（CSS 取不到只是「无样式但可读」）。不划算。

   这张表是用夹具本地伺服外链素材量的（夹具把 jsDelivr 前缀改写到 /reading/），所以它量的是
   「解析 / 解码」这一侧的节省，相当于 CDN 已命中缓存。没有量的东西：真机、CDN 冷启动、以及
   真实长正文（夹具样例正文只有 3 段，绝对成本会更高，但外链的相对收益可能更小）。
*/
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';
import { stubExternalRequests } from './lib/stub-external.mjs';

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const CPU = Number(argValue('--cpu', '4'));
const jsonOut = argValue('--json', '');
const floorCounts = argValue('--floors', '1,4,8,16').split(',').map(Number).filter((n) => n >= 1);
/* inline = 现状（5 张图内联 base64）；external = scripts/build-reading-external.mjs 的产物。
   夹具会把外链前缀改写到本地 /reading/，所以两版都真的解码图片，差距是真的。 */
/* 变体名允许带 +pad<KB> 后缀，例如 external+pad199：在 external 的 srcdoc 里塞 199KB 惰性
   注释。用来回答「再砍 srcdoc 体积还有没有收益」—— 如果惰性填充不涨成本，把内联 JS 外链
   就是白费力气，因为成本在 JS 执行而不在 srcdoc 解析。 */
const variants = argValue('--variants', 'inline,external').split(',').filter(Boolean);
const parseVariant = (name) => {
  const match = name.match(/^(inline|external)(\+js)?(?:\+pad(\d+))?$/);
  if (!match) {
    throw new Error(`看不懂的变体名：${name}（形如 inline / external / external+js / external+pad199）`);
  }
  return { name, file: match[1], externalJs: !!match[2], padKB: Number(match[3] || 0) };
};
const variantSpecs = variants.map(parseVariant);
/* 重复采样。每个组合只跑一次是不够的：readyMs 是一次性事件的墙钟时间，受 GC、编译缓存、
   系统抖动影响，单次跑出来的变体差值可能整个是噪声。这里默认跑 5 次取中位数，同时把最小值
   和最大值一起报出来 —— 如果两个变体的 [min,max] 区间重叠，那这个「优化」就没有被量出来。 */
const REPEAT = Number(argValue('--repeat', '5'));

const TRACE_CATEGORIES = ['-*', 'toplevel', 'viz', 'cc', 'blink', 'devtools.timeline',
  'disabled-by-default-devtools.timeline'].join(',');

const meta = stageRealSources();
const server = await startFixtureServer({ port: 5224 });
const browser = await chromium.launch();
const rows = [];

for (const spec of variantSpecs) {
const variant = spec.name;
for (const readerFloors of floorCounts) {
for (let rep = 1; rep <= REPEAT; rep += 1) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const record = { variant, readerFloors, rep, cpu: CPU };
  const externalHosts = new Set();
  try {
    /* 外部请求换成确定性替身。不做这一步的话 readyMs 里会掺进「Google Fonts 这次花多久失败」
       —— 正文美化的揭开路径上有 GOOGLE_READING_FONT_HREF，那个抖动能有几百毫秒，足以把变体
       之间的真实差值整个淹掉。理由详见 lib/stub-external.mjs。 */
    await stubExternalRequests(page, externalHosts);
    /* 楼层总数固定，只改「其中多少条带真实阅读器」，这样滚动范围可比。 */
    const floors = Math.max(16, readerFloors + 4);
    const query = new URLSearchParams({
      chrome: '0', preset: 'phone-iphone', theme: 'Dark V 1.0',
      floors: String(floors), rendered: String(readerFloors), reading: spec.file,
    });
    if (spec.padKB) query.set('readingPad', String(spec.padKB));
    if (spec.externalJs) query.set('readingExternalJs', '1');

    const t0 = Date.now();
    await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 60000 });
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady(60000));

    /* 等所有阅读器都把自己揭开（body 从 render-pending 变成 render-ready）。这一步就是
       「用户要等多久才看到正文」。 */
    await page.waitForFunction(() => {
      const frames = window.__linjiangTavernLive.renderFrames;
      return frames.length > 0 && frames.every((frame) => {
        const doc = frame.contentDocument;
        return doc?.body && !doc.body.classList.contains('render-pending');
      });
    }, { timeout: 120000 });
    record.readyMs = Date.now() - t0;

    await page.waitForTimeout(1500);

    /* 保真门禁。两个变体必须真的是同一个页面，否则数字没有可比性：
       external 变体只要样式表或图片有一个没落地，就会退化成「无样式」或「不解码图」，
       量出来会好看很多，但那是假的。这里把它拦在成本测量之前。 */
    record.fidelity = await page.evaluate(() => {
      const frames = window.__linjiangTavernLive.renderFrames;
      const rows = frames.map((frame) => {
        const doc = frame.contentDocument;
        if (!doc?.body) return { ok: false, why: '文档未就绪' };
        const content = doc.querySelector('.reading-content');
        const banner = doc.querySelector('.reading-header-banner');
        const rules = [...doc.styleSheets]
          .reduce((n, sheet) => { try { return n + sheet.cssRules.length; } catch { return n; } }, 0);
        const bannerImage = banner ? getComputedStyle(banner).backgroundImage : '';
        return {
          ok: rules > 700 && !!content && /url\(/.test(bannerImage)
            && !doc.body.classList.contains('render-pending'),
          rules,
          hasBannerImage: /url\(/.test(bannerImage),
          revealed: !doc.body.classList.contains('render-pending'),
        };
      });
      /* 版面尺寸也必须对：踩过一次大坑 —— 少加载酒馆助手的 dist/index.css 时，
         渲染完成后本该被 `hidden!` 折叠的 <pre><code> 会把整份源码当可见文本铺出来，
         一条楼层高到 416000px，而且高度随源码体积变化。于是「按体积做的对比」测的其实是
         「渲染了多少像素的源码文本」，两个变体根本不是同一个页面。
         这里卡一条硬上限：任何一条楼层超过 5000px 就说明代码块没被折叠。 */
      const chat = document.getElementById('chat');
      const tallest = Math.max(0, ...[...chat.querySelectorAll('.mes')]
        .map((mes) => Math.round(mes.getBoundingClientRect().height)));
      return {
        frames: rows.length,
        allOk: rows.every((r) => r.ok) && tallest <= 5000,
        tallestMes: tallest,
        chatScrollHeight: chat.scrollHeight,
        sample: rows[0] || null,
      };
    });
    if (!record.fidelity.allOk) {
      throw new Error(`保真门禁失败（两个变体不是同一个页面，数字不可比）：${JSON.stringify(record.fidelity)}`);
    }

    record.shape = await page.evaluate(() => {
      const frames = window.__linjiangTavernLive.renderFrames;
      let nodes = 0;
      let sheets = 0;
      let rules = 0;
      let backdrop = 0;
      let images = 0;
      for (const frame of frames) {
        const doc = frame.contentDocument;
        if (!doc) continue;
        const all = doc.querySelectorAll('*');
        nodes += all.length;
        sheets += doc.styleSheets.length;
        for (const sheet of doc.styleSheets) {
          try { rules += sheet.cssRules.length; } catch { /* 跨源样式表读不到 */ }
        }
        for (const el of all) {
          const cs = getComputedStyle(el);
          const bf = cs.backdropFilter || cs.webkitBackdropFilter;
          if (bf && bf !== 'none') backdrop += 1;
        }
        images += doc.querySelectorAll('img').length;
      }
      return {
        readerFrames: frames.length,
        topNodes: document.querySelectorAll('*').length,
        allIframes: document.querySelectorAll('iframe').length,
        readerNodes: nodes,
        readerSheets: sheets,
        readerCssRules: rules,
        readerBackdropElements: backdrop,
        readerImgTags: images,
        chatScrollHeight: document.getElementById('chat').scrollHeight,
      };
    });

    const heap = await session.send('Runtime.getHeapUsage');
    record.heapMB = +(heap.usedSize / 1024 / 1024).toFixed(1);
    const { metrics } = await session.send('Performance.getMetrics');
    const metric = (name) => metrics.find((row) => row.name === name)?.value ?? 0;
    record.docs = metric('Documents');
    record.frames = metric('Frames');
    record.domNodes = metric('Nodes');
    record.jsHeapMB = +(metric('JSHeapUsedSize') / 1024 / 1024).toFixed(1);
    record.layoutMs = +(metric('LayoutDuration') * 1000).toFixed(0);
    record.styleMs = +(metric('RecalcStyleDuration') * 1000).toFixed(0);
    record.scriptMs = +(metric('ScriptDuration') * 1000).toFixed(0);

    /* 一段滚动手势：手指按在阅读区上划，量光栅。 */
    const point = await page.evaluate(() => {
      const chat = document.getElementById('chat');
      chat.scrollTop = Math.round(chat.scrollHeight * 0.4);
      const pane = chat.getBoundingClientRect();
      return { x: Math.round(pane.left + pane.width / 2), y: Math.round(pane.top + pane.height / 2), before: chat.scrollTop };
    });
    await page.waitForTimeout(400);

    if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    const events = [];
    const onData = (payload) => events.push(...(payload.value || []));
    session.on('Tracing.dataCollected', onData);
    const done = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReportEvents' });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
    });
    for (let i = 1; i <= 40; i += 1) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: point.x, y: point.y - i * 6, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await session.send('Tracing.end');
    await done;
    session.off('Tracing.dataCollected', onData);
    if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    const sum = (names) => {
      let ms = 0;
      let count = 0;
      for (const event of events) {
        if (event.ph !== 'X' || !names.includes(event.name)) continue;
        ms += (Number(event.dur) || 0) / 1000;
        count += 1;
      }
      return { ms: +ms.toFixed(1), count };
    };
    record.scroll = {
      raster: sum(['RasterTask', 'Rasterize']),
      paint: sum(['Paint']),
      styleLayout: sum(['UpdateLayoutTree', 'Layout']),
      scrolled: await page.evaluate((before) => Math.round(document.getElementById('chat').scrollTop - before), point.before),
    };
  } catch (error) {
    record.error = error.message;
  }
  record.externalHosts = [...externalHosts].sort();
  rows.push(record);

  const s = record.shape || {};
  console.log(record.error
    ? `${variant.padEnd(12)} ${String(readerFloors).padStart(2)} 层 #${rep}  ERR ${record.error}`
    : `${variant.padEnd(12)} ${String(readerFloors).padStart(2)} 层 #${rep}  `
      + `就绪 ${String(record.readyMs).padStart(6)}ms  `
      + `JS堆 ${String(record.jsHeapMB).padStart(6)}MB  `
      + `节点 ${String(record.domNodes).padStart(6)}  CSS规则 ${String(s.readerCssRules).padStart(6)}  `
      + `样式 ${String(record.styleMs).padStart(4)}ms 布局 ${String(record.layoutMs).padStart(4)}ms 脚本 ${String(record.scriptMs).padStart(5)}ms  `
      + `滚动绘制 ${String(record.scroll.paint.ms).padStart(5)}ms 光栅 ${String(record.scroll.raster.ms).padStart(5)}ms`);
  await page.close();
}
}
console.log('');
}

await browser.close();
await server.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ meta, cpu: CPU, rows }, null, 2));

/* ==================================================================
   汇总。用中位数，不用单次值也不用平均数 —— 平均数会被偶发的一次长 GC 拖走。
   同时报出每组的最小值和最大值：**如果两个变体的 [min,max] 区间重叠，那这个差值就没有被
   这次量测分辨出来**，不能拿去当收益。这条是硬规矩，因为之前正是靠单次值算出过一批站不住的
   百分比。 */
const median = (list) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
};
const pick = (variant, floors, get) => rows
  .filter((row) => row.variant === variant && row.readerFloors === floors && !row.error && row.shape)
  .map(get)
  .filter((v) => typeof v === 'number');
const stat = (variant, floors, get) => {
  const list = pick(variant, floors, get);
  if (!list.length) return null;
  return { n: list.length, med: median(list), min: Math.min(...list), max: Math.max(...list) };
};

const METRICS = [
  { key: '就绪 ms', get: (row) => row.readyMs },
  { key: 'JS堆 MB', get: (row) => row.jsHeapMB },
  { key: '样式 ms', get: (row) => row.styleMs },
  { key: '脚本 ms', get: (row) => row.scriptMs },
  { key: '滚动绘制 ms', get: (row) => row.scroll.paint.ms },
  { key: 'CSS 规则', get: (row) => row.shape.readerCssRules },
];

for (const floors of floorCounts) {
  console.log(`\n=== ${floors} 个阅读器楼层 · CPU ${CPU}x · 每格 ${REPEAT} 次取中位数 ===`);
  console.log(`  ${'指标'.padEnd(12)}${variantSpecs.map((s) => s.name.padStart(22)).join('')}`);
  for (const metric of METRICS) {
    const cells = variantSpecs.map((spec) => {
      const s = stat(spec.name, floors, metric.get);
      return (s ? `${s.med} [${s.min}–${s.max}]` : '—').padStart(22);
    });
    console.log(`  ${metric.key.padEnd(12)}${cells.join('')}`);
  }
  /* 逐指标判定：中位数差多少，以及区间是否重叠。 */
  const base = variantSpecs[0].name;
  for (const spec of variantSpecs.slice(1)) {
    const lines = [];
    for (const metric of METRICS) {
      const a = stat(base, floors, metric.get);
      const b = stat(spec.name, floors, metric.get);
      if (!a || !b || a.med === 0) continue;
      const pct = ((a.med - b.med) / a.med) * 100;
      const overlap = b.min <= a.max && a.min <= b.max;
      lines.push(`${metric.key} ${pct >= 0 ? '−' : '+'}${Math.abs(pct).toFixed(1)}%${overlap ? '（区间重叠，未分辨出）' : ''}`);
    }
    console.log(`  ${spec.name} 相对 ${base}：${lines.join(' · ')}`);
  }
}

/* 每层的边际成本 —— 回答「加一层要多少钱」。用两端楼层数的中位数相减。 */
if (floorCounts.length >= 2) {
  const lo = floorCounts[0];
  const hi = floorCounts.at(-1);
  const span = hi - lo;
  console.log(`\n每增加一个阅读器楼层的边际成本（${lo} → ${hi} 层，中位数相减除以 ${span}）：`);
  console.log(`  ${'变体'.padEnd(14)}${'就绪 ms/层'.padStart(14)}${'JS堆 MB/层'.padStart(14)}${'滚动绘制 ms/层'.padStart(16)}`);
  const marginals = [];
  for (const spec of variantSpecs) {
    const per = (get) => {
      const a = stat(spec.name, lo, get);
      const b = stat(spec.name, hi, get);
      return a && b ? +((b.med - a.med) / span).toFixed(2) : null;
    };
    const row = {
      variant: spec.name,
      ready: per((r) => r.readyMs),
      heap: per((r) => r.jsHeapMB),
      paint: per((r) => r.scroll.paint.ms),
    };
    marginals.push(row);
    console.log(`  ${row.variant.padEnd(14)}${String(row.ready).padStart(14)}${String(row.heap).padStart(14)}${String(row.paint).padStart(16)}`);
  }
  const base = marginals[0];
  for (const row of marginals.slice(1)) {
    const d = (key) => (base[key] ? `${(((base[key] - row[key]) / base[key]) * 100).toFixed(0)}%` : 'n/a');
    console.log(`  ${row.variant} 相对 ${base.variant}：就绪 ${d('ready')} · JS堆 ${d('heap')} · 滚动绘制 ${d('paint')}（正数=更省）`);
  }
}

const hosts = [...new Set(rows.flatMap((row) => row.externalHosts || []))].sort();
console.log(`\n外部请求已替身：${hosts.join(' ') || '无'}（否则 readyMs 里会掺进网络抖动）`);
console.log(`真实源码：ST ${meta.versions.sillytavern} · 酒馆助手 ${meta.versions.tavernHelper} · TauriTavern ${meta.versions.tauritavern}`);
