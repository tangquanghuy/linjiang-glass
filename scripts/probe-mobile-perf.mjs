/* 移动端状态栏滚动/操作性能探针。
   ------------------------------------------------------------------
   scripts/check-hud-scroll-perf.mjs 只跑两个断言用的场景（1440 桌面 + 390 TauriTavern），
   而且不做 CPU 降频 —— 桌面 Chromium 快到任何回归都测不出来。这支脚本补的是另一半：

     · 原生浏览器酒馆（无 __TAURITAVERN__）的竖屏手机，才是会走 host-scroll-active
       通用选择器切换那条路的环境，现有回归一次都没测过它；
     · 各档手机尺寸 + CPU 降频，逼近真机；
     · 除了 rAF 帧时，还取 CDP 的 LayoutCount / RecalcStyleCount / *Duration，
       用来区分"掉帧发生在样式重算、布局，还是合成/光栅"。

   用法：
     node scripts/probe-mobile-perf.mjs                 # 默认全量，CPU 1x + 4x
     node scripts/probe-mobile-perf.mjs --cpu 6         # 只跑 6 倍降频
     node scripts/probe-mobile-perf.mjs --only 390      # 过滤尺寸
     node scripts/probe-mobile-perf.mjs --json out.json # 落盘原始数据
*/
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const cpuRates = argValue('--cpu', '1,4').split(',').map(Number).filter((n) => n >= 1);
const only = argValue('--only', '');
const jsonOut = argValue('--json', '');

const CASES = [
  { id: 'phone-small', preset: 'phone-small', w: 320, h: 568, dsf: 2 },
  { id: 'phone-android', preset: 'phone-android', w: 360, h: 800, dsf: 3 },
  { id: 'phone-iphone', preset: 'phone-iphone', w: 390, h: 844, dsf: 3 },
  { id: 'phone-wide', preset: 'phone-wide', w: 430, h: 932, dsf: 3 },
  { id: 'phone-landscape', preset: 'phone-landscape', w: 844, h: 390, dsf: 3 },
  { id: 'tablet-portrait', preset: 'tablet-portrait', w: 768, h: 1024, dsf: 2 },
];
const HOSTS = [
  { id: 'browser', tauri: false },
  { id: 'tauri', tauri: true },
];

const port = 5216;
const server = await createServer({ server: { port }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch();

const METRICS = [
  'LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration',
  'ScriptDuration', 'TaskDuration',
];

const readMetrics = async (session) => {
  const { metrics } = await session.send('Performance.getMetrics');
  const out = {};
  for (const row of metrics) if (METRICS.includes(row.name)) out[row.name] = row.value;
  return out;
};
const deltaMetrics = (before, after) => {
  const out = {};
  for (const key of METRICS) out[key] = +((after[key] ?? 0) - (before[key] ?? 0)).toFixed(4);
  return out;
};

const stats = (times) => {
  if (!times.length) return { p50: 0, p95: 0, p99: 0, max: 0, over32: 0, over50: 0, n: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0;
  return {
    p50: +at(0.5).toFixed(1),
    p95: +at(0.95).toFixed(1),
    p99: +at(0.99).toFixed(1),
    max: +sorted.at(-1).toFixed(1),
    over32: times.filter((t) => t > 32).length,
    over50: times.filter((t) => t > 50).length,
    n: times.length,
  };
};

const rows = [];

for (const cpu of cpuRates) {
  for (const host of HOSTS) {
    for (const kase of CASES) {
      if (only && !kase.id.includes(only) && !String(kase.w).includes(only)) continue;
      const page = await browser.newPage({
        viewport: { width: kase.w, height: kase.h },
        deviceScaleFactor: kase.dsf,
        isMobile: true,
        hasTouch: true,
      });
      const consoleErrors = [];
      if (host.tauri) {
        await page.addInitScript(() => { window.__TAURITAVERN__ = { abiVersion: 1 }; });
      }
      page.on('pageerror', (e) => consoleErrors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text());
      });

      const session = await page.context().newCDPSession(page);
      await session.send('Performance.enable');

      const label = `cpu${cpu}x ${host.id.padEnd(7)} ${kase.id.padEnd(16)} ${kase.w}x${kase.h}`;
      let record = { cpu, host: host.id, case: kase.id, w: kase.w, h: kase.h };

      try {
        await page.goto(
          `http://127.0.0.1:${port}/tools/tavern-real-fixture.html?chrome=0&preset=${kase.preset}&sheld=50`,
          { waitUntil: 'domcontentloaded' },
        );
        await page.waitForFunction(async () => {
          try { return !!(await window.__linjiangTavernReal?.waitUntilReady?.(100)); }
          catch { return false; }
        }, { timeout: 40000 });

        /* waitUntilReady 只保证壳层抬起了 iframe，抬起来的可能还是 index.html 那 27 个
           静态节点。要等 main.js 真的建完构图，否则量的是一个空壳。 */
        await page.waitForFunction(() => {
          const doc = document.getElementById('linjiang-hud-live')?.contentDocument;
          if (!doc) return false;
          const stage = doc.querySelector('.pstage:not([hidden]) .pcontent > .ppanel')
            || doc.querySelector('#stage:not([hidden]) #content *');
          return !!stage && doc.querySelectorAll('*').length > 150;
        }, { timeout: 40000 });
        /* 数据通路：夹具快照是 ￥512,300，样本数据是 ￥286,450。 */
        await page.waitForFunction(() => {
          const doc = document.getElementById('linjiang-hud-live')?.contentDocument;
          const text = (doc?.querySelector('.pmoney b') || doc?.querySelector('.money-line .num'))
            ?.textContent || '';
          return text.replace(/\s+/g, '').includes('512,300');
        }, { timeout: 20000 }).catch(() => { record.snapshotMissing = true; });
        await page.waitForTimeout(400);

        /* 静态画像：HUD 文档里到底有多少东西、多少块玻璃。降频前采，避免污染帧时。 */
        record.shape = await page.evaluate(() => {
          const hud = document.getElementById('linjiang-hud-live');
          const doc = hud?.contentDocument;
          if (!doc) return null;
          const all = [...doc.querySelectorAll('*')];
          const visible = (el) => {
            const cs = getComputedStyle(el);
            return cs.display !== 'none' && cs.visibility !== 'hidden';
          };
          const withBackdrop = all.filter((el) => {
            const cs = getComputedStyle(el);
            const v = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
            return v && v !== 'none' && visible(el);
          });
          const withFilter = all.filter((el) => {
            const cs = getComputedStyle(el);
            return cs.filter && cs.filter !== 'none' && visible(el);
          });
          const withShadow = all.filter((el) => {
            const cs = getComputedStyle(el);
            return (cs.boxShadow && cs.boxShadow !== 'none') && visible(el);
          });
          const rect = hud.getBoundingClientRect();
          return {
            nodes: all.length,
            portrait: !!doc.querySelector('.pstage:not([hidden])'),
            perfMode: doc.documentElement.dataset.hudPerformance || '',
            backdrop: withBackdrop.length,
            backdropDesc: withBackdrop.slice(0, 12).map((el) =>
              `${el.className || el.tagName}`),
            cssFilter: withFilter.length,
            boxShadow: withShadow.length,
            svgFilterDefs: doc.querySelectorAll('filter').length,
            svgFilterRefs: [...doc.querySelectorAll('[filter]')].length,
            svgPaths: doc.querySelectorAll('path').length,
            images: doc.querySelectorAll('img').length,
            hudW: Math.round(rect.width),
            hudH: Math.round(rect.height),
            docH: Math.round(doc.documentElement.scrollHeight),
          };
        });

        /* 把 HUD 滚进阅读区顶部附近。 */
        await page.evaluate(() => {
          const chat = document.getElementById('chat');
          const frame = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
          const pane = chat.getBoundingClientRect();
          chat.scrollTop = Math.max(0, chat.scrollTop + frame.top - pane.top - 8);
        });
        await page.waitForTimeout(250);

        if (cpu > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: cpu });

        /* 场景 A：宿主 #chat 直接滚（等价于用户在状态栏外面的正文上滑）。 */
        let m0 = await readMetrics(session);
        const hostScroll = await page.evaluate(async () => {
          const chat = document.getElementById('chat');
          const hud = document.getElementById('linjiang-hud-live');
          const hudHtml = hud.contentDocument.documentElement;
          const times = [];
          let activeFrames = 0;
          let last = performance.now();
          await new Promise((resolve) => {
            let i = 0;
            const step = (now) => {
              times.push(now - last);
              last = now;
              chat.scrollTop += 4;
              if (hudHtml.classList.contains('host-scroll-active')) activeFrames += 1;
              if (++i < 120) requestAnimationFrame(step);
              else resolve();
            };
            requestAnimationFrame(step);
          });
          times.shift();
          return { times, activeFrames };
        });
        record.hostScroll = stats(hostScroll.times);
        record.hostScroll.hostScrollActiveFrames = hostScroll.activeFrames;
        record.hostScrollMetrics = deltaMetrics(m0, await readMetrics(session));
        await page.waitForTimeout(320);

        /* 场景 B：手指按在状态栏上竖着划 —— 走 bridge 的 touchScroll 转发。
           这是移动端最常见的动作，也是现有回归唯一覆盖到（且只在 Tauri 下）的一条。 */
        await page.evaluate(() => {
          const chat = document.getElementById('chat');
          const slot = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
          const pane = chat.getBoundingClientRect();
          chat.scrollTop = Math.max(0, chat.scrollTop + slot.top - pane.top - 30);
        });
        await page.waitForTimeout(250);
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

        m0 = await readMetrics(session);
        await page.evaluate(() => {
          window.__probe = { times: [], last: performance.now(), stop: false };
          const step = (now) => {
            window.__probe.times.push(now - window.__probe.last);
            window.__probe.last = now;
            if (!window.__probe.stop) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
        });
        for (let i = 1; i <= 30; i += 1) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: point.x, y: point.y - i * 6, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
          });
          await new Promise((r) => setTimeout(r, 16));
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const touch = await page.evaluate((before) => {
          window.__probe.stop = true;
          const chat = document.getElementById('chat');
          const hud = document.getElementById('linjiang-hud-live').getBoundingClientRect();
          const slot = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
          const times = window.__probe.times.slice(1);
          return { times, delta: chat.scrollTop - before, align: +(hud.top - slot.top).toFixed(1) };
        }, point.before);
        record.touch = stats(touch.times);
        record.touch.scrolled = Math.round(touch.delta);
        record.touch.align = touch.align;
        record.touchMetrics = deltaMetrics(m0, await readMetrics(session));
        await page.waitForTimeout(300);

        /* 场景 C：点开一个整页（竖屏"背包"那条路），量交互延迟。 */
        m0 = await readMetrics(session);
        const openPage = await page.evaluate(async () => {
          const doc = document.getElementById('linjiang-hud-live').contentDocument;
          const btn = doc.querySelector('[data-page]')
            || doc.querySelector('.pnav button')
            || doc.querySelector('.ptool');
          if (!btn) return { ok: false };
          const t0 = performance.now();
          btn.click();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const settle = performance.now() - t0;
          const opened = !!doc.querySelector('.page-modal, .ppage, .is-page-open')
            || doc.documentElement.classList.contains('is-page-open');
          return { ok: true, settle: +settle.toFixed(1), opened, label: btn.dataset.page || btn.className };
        });
        record.openPage = openPage;
        record.openPageMetrics = deltaMetrics(m0, await readMetrics(session));

        if (cpu > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      } catch (error) {
        record.error = error.message;
      }

      record.consoleErrors = [...new Set(consoleErrors)].slice(0, 4);
      rows.push(record);

      const hs = record.hostScroll || {};
      const tc = record.touch || {};
      const sh = record.shape || {};
      console.log(
        `${label}  ${record.error ? 'ERR ' + record.error : ''}`
        + (record.error ? '' :
          `\n    形态  ${sh.portrait ? '竖屏' : '横屏'} perf=${sh.perfMode} 节点${sh.nodes} `
          + `backdrop${sh.backdrop} filter${sh.cssFilter} shadow${sh.boxShadow} `
          + `svg滤镜引用${sh.svgFilterRefs} HUD ${sh.hudW}x${sh.hudH}`
          + `\n    宿主滚 p50 ${hs.p50} p95 ${hs.p95} p99 ${hs.p99} max ${hs.max} >32ms ${hs.over32}/${hs.n} `
          + `>50ms ${hs.over50} 降级帧${hs.hostScrollActiveFrames} `
          + `| 样式${record.hostScrollMetrics.RecalcStyleCount}次/${(record.hostScrollMetrics.RecalcStyleDuration * 1000).toFixed(0)}ms `
          + `布局${record.hostScrollMetrics.LayoutCount}次/${(record.hostScrollMetrics.LayoutDuration * 1000).toFixed(0)}ms `
          + `脚本${(record.hostScrollMetrics.ScriptDuration * 1000).toFixed(0)}ms`
          + `\n    指划栏 p50 ${tc.p50} p95 ${tc.p95} p99 ${tc.p99} max ${tc.max} >32ms ${tc.over32}/${tc.n} `
          + `>50ms ${tc.over50} 滚动${tc.scrolled}px 对齐${tc.align}px `
          + `| 样式${record.touchMetrics.RecalcStyleCount}次/${(record.touchMetrics.RecalcStyleDuration * 1000).toFixed(0)}ms `
          + `布局${record.touchMetrics.LayoutCount}次/${(record.touchMetrics.LayoutDuration * 1000).toFixed(0)}ms `
          + `脚本${(record.touchMetrics.ScriptDuration * 1000).toFixed(0)}ms`
          + `\n    开整页 ${record.openPage?.ok ? `${record.openPage.settle}ms (${record.openPage.label})` : '未找到入口'} `
          + `| 样式${record.openPageMetrics.RecalcStyleCount}次/${(record.openPageMetrics.RecalcStyleDuration * 1000).toFixed(0)}ms `
          + `布局${record.openPageMetrics.LayoutCount}次/${(record.openPageMetrics.LayoutDuration * 1000).toFixed(0)}ms`
          + (record.consoleErrors.length ? `\n    控制台 ${record.consoleErrors.join(' | ')}` : '')),
      );
      await page.close();
    }
  }
}

await browser.close();
await server.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
console.log(`\n共 ${rows.length} 组。${jsonOut ? `原始数据 -> ${jsonOut}` : ''}`);
