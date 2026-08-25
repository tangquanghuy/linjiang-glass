/* 移动端「点一下要等多久」。
   ------------------------------------------------------------------
   滚动那条路已经有 probe-mobile-raster / probe-move-cost 覆盖。这支量的是操作：
   点开每个整页、展开角色预览、关掉再点下一个。每一项分别记

     · 点击到内容落地（连续两帧 rAF）的墙上时间
     · 这段时间里的样式重算 / 布局次数与耗时（CDP Performance）
     · 光栅耗时（trace）

   竖屏展开角色预览是最值得单独看的一项：它会改文档高度 → reportPortraitSize →
   壳层 applyPortraitHeight → setSpacer → isSafeOuterFrame 读 offsetWidth（强制回流）
   → 重排 iframe，一次点击横跨两个文档三轮布局。

   用法：node scripts/probe-mobile-interaction.mjs [--cpu 4] [--preset phone-iphone]
*/
import { createServer } from 'vite';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const CPU = Number(argValue('--cpu', '4'));

const CASES = [
  { id: 'phone-small', preset: 'phone-small', w: 320, h: 568, dsf: 2 },
  { id: 'phone-iphone', preset: 'phone-iphone', w: 390, h: 844, dsf: 3 },
  { id: 'phone-landscape', preset: 'phone-landscape', w: 844, h: 390, dsf: 3 },
  { id: 'tablet-portrait', preset: 'tablet-portrait', w: 768, h: 1024, dsf: 2 },
];

const METRICS = ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration'];
const TRACE_CATEGORIES = ['-*', 'toplevel', 'viz', 'cc', 'devtools.timeline',
  'disabled-by-default-devtools.timeline'].join(',');

const port = 5220;
const server = await createServer({ server: { port }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch();

const readMetrics = async (session) => {
  const { metrics } = await session.send('Performance.getMetrics');
  const out = {};
  for (const row of metrics) if (METRICS.includes(row.name)) out[row.name] = row.value;
  return out;
};

for (const kase of CASES) {
  const page = await browser.newPage({
    viewport: { width: kase.w, height: kase.h },
    deviceScaleFactor: kase.dsf,
    isMobile: true,
    hasTouch: true,
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  console.log(`\n=== ${kase.id} ${kase.w}x${kase.h} (CPU ${CPU}x) ===`);
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
      if (!doc) return false;
      return (!!doc.querySelector('.pstage:not([hidden]) .pcontent > .ppanel')
        || !!doc.querySelector('#stage:not([hidden]) #content *'))
        && doc.querySelectorAll('*').length > 150;
    }, { timeout: 40000 });
    await page.waitForTimeout(600);

    const routes = await page.evaluate(() => {
      const doc = document.getElementById('linjiang-hud-live').contentDocument;
      const seen = new Set();
      const out = [];
      for (const el of doc.querySelectorAll('[data-page]')) {
        const name = el.dataset.page;
        if (!name || seen.has(name)) continue;
        seen.add(name);
        out.push(name);
      }
      return {
        portrait: !!doc.querySelector('.pstage:not([hidden])'),
        pages: out,
        hasPreview: !!doc.querySelector('[data-character-full], .pcard, .card'),
      };
    });
    console.log(`  构图 ${routes.portrait ? '竖屏' : '横屏'} · 整页入口 ${routes.pages.length} 个: ${routes.pages.join(' ')}`);

    if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: CPU });

    const measureAction = async (label, actionJs) => {
      const m0 = await readMetrics(session);
      const events = [];
      const onData = (p) => events.push(...(p.value || []));
      session.on('Tracing.dataCollected', onData);
      const done = new Promise((r) => session.once('Tracing.tracingComplete', r));
      await session.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReportEvents' });
      const result = await page.evaluate(`(async () => {
        const doc = document.getElementById('linjiang-hud-live').contentDocument;
        const t0 = performance.now();
        const ok = (() => { ${actionJs} })();
        if (ok === false) return { skipped: true };
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const settle = performance.now() - t0;
        await new Promise((r) => setTimeout(r, 260));
        const total = performance.now() - t0;
        return {
          settle: +settle.toFixed(1),
          total: +total.toFixed(1),
          nodes: doc.querySelectorAll('*').length,
          hudH: Math.round(document.getElementById('linjiang-hud-live').getBoundingClientRect().height),
        };
      })()`);
      await session.send('Tracing.end');
      await done;
      session.off('Tracing.dataCollected', onData);
      const m1 = await readMetrics(session);
      if (result.skipped) { console.log(`  ${label.padEnd(22)} 没有这个入口`); return; }
      const raster = events.filter((e) => (e.name === 'RasterTask' || e.name === 'Rasterize') && e.ph === 'X');
      const rasterMs = raster.reduce((s, e) => s + (Number(e.dur) || 0), 0) / 1000;
      const d = (k) => (m1[k] ?? 0) - (m0[k] ?? 0);
      console.log(`  ${label.padEnd(22)} 落地 ${String(result.settle).padStart(6)}ms  `
        + `样式 ${String(d('RecalcStyleCount')).padStart(3)}次/${(d('RecalcStyleDuration') * 1000).toFixed(0).padStart(4)}ms  `
        + `布局 ${String(d('LayoutCount')).padStart(3)}次/${(d('LayoutDuration') * 1000).toFixed(0).padStart(4)}ms  `
        + `脚本 ${(d('ScriptDuration') * 1000).toFixed(0).padStart(4)}ms  `
        + `光栅 ${rasterMs.toFixed(0).padStart(4)}ms/${String(raster.length).padStart(3)}次  `
        + `节点 ${result.nodes}  HUD高 ${result.hudH}`);
    };

    for (const name of routes.pages) {
      await measureAction(`打开「${name}」`, `
        const btn = doc.querySelector('[data-page="${name}"]');
        if (!btn || btn.disabled) return false;
        btn.click();`);
      await measureAction(`关闭「${name}」`, `
        const btn = doc.querySelector('[data-page-close]');
        if (!btn) return false;
        btn.click();`);
    }

    if (routes.portrait) {
      await measureAction('展开角色预览', `
        const card = doc.querySelector('.pgirls .pcard, .pgirls [data-girl], .pcard');
        if (!card) return false;
        card.click();`);
      await measureAction('预览翻到下一位', `
        const nav = doc.querySelector('[data-preview-step="1"]');
        if (!nav) return false;
        nav.click();`);
      await measureAction('收起角色预览', `
        const close = doc.querySelector('[data-preview-close]');
        if (!close) return false;
        close.click();`);
    }

    if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  } catch (error) {
    console.log(`  ERR ${error.message}`);
  }
  await page.close();
}

await browser.close();
await server.close();
