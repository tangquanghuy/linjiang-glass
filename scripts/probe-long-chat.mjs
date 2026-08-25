/* 聊天有多长，状态栏就有多卡？
   ------------------------------------------------------------------
   tools/tavern-real-fixture.js 只铺 15 条消息。真实对话是几百条，每条还带一个酒馆助手的
   渲染 iframe。这件事对状态栏不是中性的：壳层在竖屏滚动时每帧都做一次跨文档的强制回流

     noteHostScroll → nudgePortraitHud 写 hudFrame.style.top      （写）
                    → requestFollow → followHud → viewportPoint()  （读 getBoundingClientRect）

   写完再读就是强制同步布局，而被强制的是**酒馆那篇文档**，不是状态栏自己。所以它的成本
   随聊天长度增长，而现有夹具的规模把这一项系统性地低估了。

   这支脚本在同一夹具上把消息数灌到不同量级，量同一段手势的：强制布局耗时、光栅耗时、
   以及主线程最长任务。

   用法：node scripts/probe-long-chat.mjs [--cpu 4]
*/
import { createServer } from 'vite';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const CPU = Number(argValue('--cpu', '4'));
const COUNTS = [0, 100, 300];

const METRICS = ['LayoutCount', 'LayoutDuration', 'RecalcStyleCount', 'RecalcStyleDuration', 'ScriptDuration'];
const TRACE_CATEGORIES = ['-*', 'toplevel', 'viz', 'cc', 'devtools.timeline',
  'disabled-by-default-devtools.timeline'].join(',');

const port = 5221;
const server = await createServer({ server: { port }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch();

const readMetrics = async (session) => {
  const { metrics } = await session.send('Performance.getMetrics');
  const out = {};
  for (const row of metrics) if (METRICS.includes(row.name)) out[row.name] = row.value;
  return out;
};

console.log(`竖屏 390x844，CPU ${CPU}x，同一段 40 步手势\n`);

for (const extra of COUNTS) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  try {
    await page.goto(
      `http://127.0.0.1:${port}/tools/tavern-real-fixture.html?chrome=0&preset=phone-iphone&sheld=50`,
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

    /* 灌消息：克隆一条已有的 filler 楼层，保持结构和真实的一样（.mes / .mes_block /
       .mes_text），并在其中一部分里塞一个渲染 iframe，模拟酒馆助手按楼层注入。 */
    const shape = await page.evaluate((n) => {
      const chat = document.getElementById('chat');
      const template = chat.querySelector('.mes.fixture-filler');
      for (let i = 0; i < n; i += 1) {
        const clone = template.cloneNode(true);
        clone.querySelector('.mes_text').textContent = `灌入的长对话楼层 ${i + 1}，用来把 #chat 撑到真实规模。`;
        if (i % 4 === 0) {
          const render = document.createElement('div');
          render.className = 'TH-render';
          const frame = document.createElement('iframe');
          frame.setAttribute('frameborder', '0');
          frame.style.cssText = 'width:100%;height:64px;border:0';
          frame.srcdoc = '<!DOCTYPE html><html><body style="margin:0;background:#1a1b2c;color:#ccd"><p style="font:12px sans-serif;padding:6px">正文美化占位</p></body></html>';
          render.appendChild(frame);
          clone.querySelector('.mes_text').appendChild(render);
        }
        chat.appendChild(clone);
      }
      return {
        messages: chat.querySelectorAll('.mes').length,
        frames: chat.querySelectorAll('iframe').length,
        nodes: document.querySelectorAll('*').length,
        scrollHeight: chat.scrollHeight,
      };
    }, extra);
    await page.waitForTimeout(1200);

    await page.evaluate(() => {
      const chat = document.getElementById('chat');
      const slot = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
      const pane = chat.getBoundingClientRect();
      chat.scrollTop = Math.max(0, chat.scrollTop + slot.top - pane.top - 30);
    });
    await page.waitForTimeout(500);
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

    if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    const m0 = await readMetrics(session);
    const events = [];
    const onData = (p) => events.push(...(p.value || []));
    session.on('Tracing.dataCollected', onData);
    const done = new Promise((r) => session.once('Tracing.tracingComplete', r));
    await session.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReportEvents' });
    await page.evaluate(() => {
      window.__f = { times: [], last: performance.now(), stop: false };
      const step = (now) => {
        window.__f.times.push(now - window.__f.last);
        window.__f.last = now;
        if (!window.__f.stop) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
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
    await new Promise((r) => setTimeout(r, 350));
    await session.send('Tracing.end');
    await done;
    session.off('Tracing.dataCollected', onData);
    if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const m1 = await readMetrics(session);

    const frameInfo = await page.evaluate((before) => {
      window.__f.stop = true;
      const chat = document.getElementById('chat');
      const hud = document.getElementById('linjiang-hud-live').getBoundingClientRect();
      const slot = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
      const times = window.__f.times.slice(1).sort((a, b) => a - b);
      const at = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))] || 0;
      return {
        scrolled: Math.round(chat.scrollTop - before),
        align: +(hud.top - slot.top).toFixed(1),
        p95: +at(0.95).toFixed(1),
        max: +(times.at(-1) || 0).toFixed(1),
        over32: times.filter((t) => t > 32).length,
        n: times.length,
      };
    }, point.before);

    const raster = events.filter((e) => (e.name === 'RasterTask' || e.name === 'Rasterize') && e.ph === 'X');
    const rasterMs = raster.reduce((s, e) => s + (Number(e.dur) || 0), 0) / 1000;
    const layouts = events.filter((e) => e.name === 'Layout' && e.ph === 'X');
    const layoutMs = layouts.reduce((s, e) => s + (Number(e.dur) || 0), 0) / 1000;
    const worstLayout = layouts.reduce((m, e) => Math.max(m, (Number(e.dur) || 0) / 1000), 0);
    const d = (k) => (m1[k] ?? 0) - (m0[k] ?? 0);

    console.log(`楼层 ${String(shape.messages).padStart(4)} 条 / iframe ${String(shape.frames).padStart(3)} 个 / 顶层节点 ${String(shape.nodes).padStart(5)}  →  `
      + `布局 ${String(d('LayoutCount')).padStart(3)}次 累计 ${layoutMs.toFixed(1).padStart(6)}ms 单次最长 ${worstLayout.toFixed(1).padStart(5)}ms  `
      + `样式 ${String(d('RecalcStyleCount')).padStart(3)}次/${(d('RecalcStyleDuration') * 1000).toFixed(0).padStart(4)}ms  `
      + `脚本 ${(d('ScriptDuration') * 1000).toFixed(0).padStart(4)}ms  `
      + `光栅 ${rasterMs.toFixed(0).padStart(4)}ms/${String(raster.length).padStart(3)}次  `
      + `帧 p95 ${String(frameInfo.p95).padStart(5)}ms max ${String(frameInfo.max).padStart(6)}ms >32ms ${frameInfo.over32}/${frameInfo.n}  `
      + `滚动 ${frameInfo.scrolled}px 对齐 ${frameInfo.align}px`);
  } catch (error) {
    console.log(`楼层 +${extra} ERR ${error.message}`);
  }
  await page.close();
}

await browser.close();
await server.close();
