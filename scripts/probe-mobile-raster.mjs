/* 光栅/合成侧的开销归因。
   ------------------------------------------------------------------
   probe-mobile-perf.mjs 量的是主线程 rAF 帧时，在 8 倍降频下依然是 16.7ms —— 说明主线程
   不是瓶颈。移动端"卡"的那部分在光栅和合成：backdrop-filter 每帧重采样、SVG 高斯模糊
   重新光栅、被抬起的 iframe 用 left/top + clip-path 逐帧移动导致的整层重绘。这些都不
   出现在 rAF 计时里。

   所以这支脚本抓 trace，按变体对比同一段手势的光栅/绘制累计耗时。变体分两类：
     · 改壳层（外部部署/V20260826/状态栏.html）—— 通过 page.route 改写夹具 fetch 到的源码，
       不落盘、不动仓库文件；
     · 改 HUD 文档 —— 运行时注入样式或摘掉属性。
   每次只动一处，好把开销归到具体某个东西上。control-no-hud 是地板：把 HUD 藏掉，量
   夹具本身滚动的成本。

   用法：node scripts/probe-mobile-raster.mjs [--only 390] [--cpu 4] [--json out.json]
*/
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const only = argValue('--only', '');
const jsonOut = argValue('--json', '');
const CPU = Number(argValue('--cpu', '4'));
/* --idle：完全不做手势，只静静地 trace 1.5 秒。用来回答"HUD 静止不动、没人碰它的时候
   是不是也在持续重绘"—— 如果是，那"卡"就不是滚动路径的问题，而是常驻开销。 */
const IDLE = argv.includes('--idle');

const CASES = [
  { id: 'phone-android', preset: 'phone-android', w: 360, h: 800, dsf: 3 },
  { id: 'phone-iphone', preset: 'phone-iphone', w: 390, h: 844, dsf: 3 },
  { id: 'phone-wide', preset: 'phone-wide', w: 430, h: 932, dsf: 3 },
  { id: 'tablet-portrait', preset: 'tablet-portrait', w: 768, h: 1024, dsf: 2 },
];

/* 只剩「玻璃本身有多贵」这一类对照组。
   ------------------------------------------------------------------
   原来这里还有几组改壳层几何的对照（left/top 换 transform、不逐帧改 clip-path），用来
   定位成本来源；结论已经落进 外部部署/V20260826/状态栏.html 的裁剪台，前后对比也换成了
   check-hud-raster-perf.mjs --baseline（跑在真实源码夹具上，比这里可信）。所以那几组连同
   patchShell 一起删掉了 —— 它们依赖的源码片段已经不存在。 */
const VARIANTS = [
  { id: 'control-no-hud', label: '地板：藏掉 HUD，只滚夹具本身', hud: `hudEl.style.display = 'none';` },
  { id: 'baseline', label: '现状（原生浏览器竖屏）' },
  {
    id: 'hud-no-backdrop',
    label: 'HUD：去掉全部 backdrop-filter',
    hud: `
      const s = doc.createElement('style');
      s.textContent = '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}';
      doc.head.appendChild(s);`,
  },
  {
    id: 'hud-no-svg-filter',
    label: 'HUD：摘掉描边上的 SVG 高斯模糊',
    hud: `doc.querySelectorAll('[filter]').forEach((el) => el.removeAttribute('filter'));`,
  },
  {
    id: 'hud-no-css-filter',
    label: 'HUD：去掉 CSS drop-shadow',
    hud: `
      const s = doc.createElement('style');
      s.textContent = '*{filter:none!important;}';
      doc.head.appendChild(s);`,
  },
  {
    id: 'hud-flat',
    label: 'HUD：三种滤镜全去',
    hud: `
      doc.querySelectorAll('[filter]').forEach((el) => el.removeAttribute('filter'));
      const s = doc.createElement('style');
      s.textContent = '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;filter:none!important;}';
      doc.head.appendChild(s);`,
  },
  {
    id: 'hud-blank',
    label: '对照：HUD 内容换成一块纯色（保留跟随移动）',
    hud: `
      doc.body.innerHTML = '<div style="position:fixed;inset:0;background:#101833"></div>';`,
  },
  {
    id: 'hud-no-anim',
    label: 'HUD：停掉所有 CSS 动画/过渡',
    hud: `
      const s = doc.createElement('style');
      s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;}';
      doc.head.appendChild(s);`,
  },
  {
    id: 'hud-no-live-dot',
    label: 'HUD：只停掉「直播中」那颗常驻脉冲圆点',
    hud: `doc.querySelectorAll('.pworld-who.is-live, .world-who.is-live').forEach((el) => el.classList.remove('is-live'));`,
  },
];

const TRACE_CATEGORIES = [
  '-*', 'toplevel', 'benchmark', 'viz', 'cc', 'gpu', 'blink', 'graphics.pipeline',
  'devtools.timeline', 'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
].join(',');


const port = 5217;
const server = await createServer({ server: { port }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch();

const collectTrace = async (session, run) => {
  const events = [];
  const onData = (payload) => events.push(...(payload.value || []));
  session.on('Tracing.dataCollected', onData);
  const done = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
  await session.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReportEvents' });
  await run();
  await session.send('Tracing.end');
  await done;
  session.off('Tracing.dataCollected', onData);
  return events;
};

const summarize = (events) => {
  const sumDur = (names) => {
    let total = 0;
    let count = 0;
    for (const e of events) {
      if (e.ph !== 'X') continue;
      if (!names.includes(e.name)) continue;
      total += Number(e.dur) || 0;
      count += 1;
    }
    return { ms: +(total / 1000).toFixed(1), count };
  };
  const pipeline = { presented: 0, dropped: 0, other: 0 };
  for (const e of events) {
    if (e.name !== 'PipelineReporter') continue;
    const state = e.args?.state || e.args?.data?.state || '';
    if (!state) continue;
    if (state.includes('PRESENTED')) pipeline.presented += 1;
    else if (state.includes('DROPPED')) pipeline.dropped += 1;
    else pipeline.other += 1;
  }
  /* 光栅任务按进程分组：生产环境 HUD 是跨源的，会在自己的渲染进程里光栅，
     这里同源所以两边同进程 —— 但 Paint 事件带 frame，可以据此区分文档。 */
  const paintByFrame = {};
  for (const e of events) {
    if (e.name !== 'Paint' || e.ph !== 'X') continue;
    const frame = e.args?.data?.frame || 'unknown';
    paintByFrame[frame] = (paintByFrame[frame] || 0) + 1;
  }
  return {
    pipeline,
    paintByFrame,
    raster: sumDur(['RasterTask', 'Rasterize']),
    paint: sumDur(['Paint']),
    styleLayout: sumDur(['UpdateLayoutTree', 'Layout']),
    layerTree: sumDur(['UpdateLayerTree', 'LayerTreeHost::DoUpdateLayers']),
    draw: sumDur(['Display::DrawAndSwap']),
    gpuSwap: sumDur(['GLES2DecoderImpl::HandleSwapBuffers', 'SkiaRenderer::SwapBuffers']),
  };
};

const rows = [];

for (const kase of CASES) {
  if (only && !kase.id.includes(only) && !String(kase.w).includes(only)) continue;
  for (const variant of VARIANTS) {
    const page = await browser.newPage({
      viewport: { width: kase.w, height: kase.h },
      deviceScaleFactor: kase.dsf,
      isMobile: true,
      hasTouch: true,
    });
    const session = await page.context().newCDPSession(page);
    let record = { case: kase.id, w: kase.w, h: kase.h, variant: variant.id, label: variant.label };
    try {
      await page.goto(
        `http://127.0.0.1:${port}/tools/tavern-real-fixture.html?chrome=0&preset=${kase.preset}&sheld=50`,
        { waitUntil: 'domcontentloaded' },
      );
      await page.waitForFunction(async () => {
        try { return !!(await window.__linjiangTavernReal?.waitUntilReady?.(100)); }
        catch { return false; }
      }, { timeout: 40000 });
      await page.waitForFunction(() => {
        const doc = document.getElementById('linjiang-hud-live')?.contentDocument;
        return !!doc?.querySelector('.pstage:not([hidden]) .pcontent > .ppanel')
          && doc.querySelectorAll('*').length > 150;
      }, { timeout: 40000 });
      await page.waitForTimeout(500);

      record.before = await page.evaluate(() => {
        const doc = document.getElementById('linjiang-hud-live').contentDocument;
        const count = (prop) => [...doc.querySelectorAll('*')]
          .filter((el) => { const v = getComputedStyle(el)[prop]; return v && v !== 'none'; }).length;
        return {
          backdrop: count('backdropFilter'),
          cssFilter: count('filter'),
          svgFilterRefs: doc.querySelectorAll('[filter]').length,
          hudH: Math.round(document.getElementById('linjiang-hud-live').getBoundingClientRect().height),
        };
      });

      if (variant.hud) {
        await page.evaluate(`(() => {
          const hudEl = document.getElementById('linjiang-hud-live');
          const doc = hudEl.contentDocument;
          ${variant.hud}
        })()`);
        await page.waitForTimeout(400);
      }

      await page.evaluate(() => {
        const chat = document.getElementById('chat');
        const slot = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
        const pane = chat.getBoundingClientRect();
        chat.scrollTop = Math.max(0, chat.scrollTop + slot.top - pane.top - 30);
      });
      await page.waitForTimeout(300);
      const point = await page.evaluate(() => {
        const chat = document.getElementById('chat');
        const hud = document.getElementById('linjiang-hud-live').getBoundingClientRect();
        const pane = chat.getBoundingClientRect();
        const hidden = getComputedStyle(document.getElementById('linjiang-hud-live')).display === 'none';
        /* 地板组里 HUD 不在了，手势就打在阅读区上 —— 对照的是"同一段手指位移"。 */
        return hidden
          ? { x: Math.round(pane.left + pane.width / 2), y: Math.round(pane.top + 120) }
          : {
            x: Math.round(hud.left + hud.width / 2),
            y: Math.round(Math.max(pane.top + 90, hud.top + 90)),
          };
      });

      if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      const events = await collectTrace(session, async () => {
        if (IDLE) {
          await new Promise((r) => setTimeout(r, 1500));
          return;
        }
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
        });
        for (let i = 1; i <= 40; i += 1) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: point.x, y: point.y - i * 5, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
          });
          await new Promise((r) => setTimeout(r, 16));
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await new Promise((r) => setTimeout(r, 400));
      });
      if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      record.trace = summarize(events);
    } catch (error) {
      record.error = error.message;
    }
    rows.push(record);
    const t = record.trace;
    console.log(record.error
      ? `${kase.id.padEnd(16)} ${variant.variant || variant.id} ERR ${record.error}`
      : `${kase.id.padEnd(16)} ${variant.id.padEnd(18)} `
        + `光栅 ${String(t.raster.ms).padStart(7)}ms/${String(t.raster.count).padStart(4)}次 `
        + `绘制 ${String(t.paint.ms).padStart(6)}ms/${String(t.paint.count).padStart(3)} `
        + `样式布局 ${String(t.styleLayout.ms).padStart(6)}ms `
        + `合成提交 ${String(t.draw.ms).padStart(6)}ms `
        + `帧 ${t.pipeline.presented}/${t.pipeline.dropped}丢 `
        + `| backdrop${record.before?.backdrop} svg${record.before?.svgFilterRefs} css${record.before?.cssFilter} h${record.before?.hudH}`);
    await page.close();
  }
  console.log('');
}

await browser.close();
await server.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
console.log(`共 ${rows.length} 组。${jsonOut ? `原始数据 -> ${jsonOut}` : ''}`);
