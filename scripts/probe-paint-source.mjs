/* 谁在每帧重绘？
   ------------------------------------------------------------------
   probe-mobile-raster.mjs 定位到：宿主滚动的一段手势里，被抬起的 HUD 会产生 300 上下个
   光栅任务、共 450ms 光栅耗时；把 HUD 内容换成纯色后任务数不变而耗时掉到 15ms。也就是
   任务数由"HUD 在动"决定，单次耗时由"玻璃有多贵"决定。

   这支脚本回答剩下的两个问题：
     1. 每帧重绘的是哪个文档、哪块矩形（devtools.timeline 的 Paint 带 layerId/rect/frame）；
     2. 玻璃里的钱花在哪个子树上 —— 按子树逐个摘掉，量同一段手势的光栅耗时。

   用法：node scripts/probe-paint-source.mjs [--only 390]
*/
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const CPU = Number(argValue('--cpu', '4'));
const preset = argValue('--preset', 'phone-iphone');
const SIZES = { 'phone-iphone': { w: 390, h: 844, dsf: 3 } };
const size = SIZES[preset] || SIZES['phone-iphone'];

/* 按子树摘除，量玻璃成本的构成。每项只摘一处。 */
const STRIPS = [
  { id: 'as-is', label: '不动', js: '' },
  { id: 'no-plate', label: '去掉背景底图 .pplate', js: `doc.querySelectorAll('.pplate').forEach((e) => e.remove());` },
  { id: 'no-glass', label: '去掉玻璃层 .pglass（backdrop+tint+frost+edge）', js: `doc.querySelectorAll('.pglass').forEach((e) => e.remove());` },
  { id: 'no-frost', label: '只去掉 frost 颗粒贴图层', js: `doc.querySelectorAll('.pg-frost').forEach((e) => e.remove());` },
  { id: 'no-rim', label: '去掉 SVG 描边光晕 .prim', js: `doc.querySelectorAll('.prim').forEach((e) => e.remove());` },
  { id: 'no-content', label: '去掉 .pcontent（文字/卡片/图标）', js: `doc.querySelectorAll('.pcontent').forEach((e) => e.remove());` },
  { id: 'no-blossom', label: '去掉花饰 .pblossoms', js: `doc.querySelectorAll('.pblossoms').forEach((e) => e.remove());` },
  { id: 'no-cards', label: '去掉角色卡 .card-glass', js: `doc.querySelectorAll('.card-glass').forEach((e) => e.remove());` },
];

const TRACE_CATEGORIES = [
  '-*', 'toplevel', 'viz', 'cc', 'blink',
  'devtools.timeline', 'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
].join(',');

const port = 5218;
const server = await createServer({ server: { port }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch();

const collectTrace = async (session, run) => {
  const events = [];
  const onData = (p) => events.push(...(p.value || []));
  session.on('Tracing.dataCollected', onData);
  const done = new Promise((r) => session.once('Tracing.tracingComplete', r));
  await session.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReportEvents' });
  await run();
  await session.send('Tracing.end');
  await done;
  session.off('Tracing.dataCollected', onData);
  return events;
};

const gesture = async (session, point) => {
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
};

const boot = async (strip) => {
  const page = await browser.newPage({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: size.dsf,
    isMobile: true,
    hasTouch: true,
  });
  const session = await page.context().newCDPSession(page);
  await page.goto(
    `http://127.0.0.1:${port}/tools/tavern-real-fixture.html?chrome=0&preset=${preset}&sheld=50`,
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
  if (strip) {
    await page.evaluate(`(() => {
      const doc = document.getElementById('linjiang-hud-live').contentDocument;
      ${strip}
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
    return {
      x: Math.round(hud.left + hud.width / 2),
      y: Math.round(Math.max(pane.top + 90, hud.top + 90)),
    };
  });
  const frames = await page.evaluate(() => ({
    top: null,
    hudUrl: document.getElementById('linjiang-hud-live').src,
  }));
  return { page, session, point, frames };
};

/* ---------- 第一步：谁在重绘 ---------- */
{
  const { page, session, point } = await boot('');
  if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const events = await collectTrace(session, () => gesture(session, point));
  if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const paints = events.filter((e) => e.name === 'Paint' && e.ph === 'X');
  const byFrame = new Map();
  for (const p of paints) {
    const d = p.args?.data || {};
    const key = `${d.frame || '?'}`;
    if (!byFrame.has(key)) byFrame.set(key, { n: 0, rects: new Map(), layers: new Set() });
    const row = byFrame.get(key);
    row.n += 1;
    const rect = Array.isArray(d.clip) && d.clip.length >= 6
      ? `${Math.round(d.clip[0])},${Math.round(d.clip[1])} ${Math.round(d.clip[4] - d.clip[0])}x${Math.round(d.clip[5] - d.clip[1])}`
      : `${Math.round(d.x || 0)},${Math.round(d.y || 0)} ${Math.round(d.width || 0)}x${Math.round(d.height || 0)}`;
    row.rects.set(rect, (row.rects.get(rect) || 0) + 1);
    if (d.layerId != null) row.layers.add(d.layerId);
  }
  console.log('== 每帧在重绘什么（Paint 事件按文档分组）==');
  for (const [frame, row] of byFrame) {
    const top = [...row.rects.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`  文档 ${frame}  Paint ${row.n} 次  层 ${[...row.layers].join(',')}`);
    top.forEach(([rect, n]) => console.log(`      ${String(n).padStart(3)}× 矩形 ${rect}`));
  }

  const rasters = events.filter((e) => (e.name === 'RasterTask' || e.name === 'Rasterize') && e.ph === 'X');
  const total = rasters.reduce((s, e) => s + (Number(e.dur) || 0), 0) / 1000;
  const byLayer = new Map();
  for (const r of rasters) {
    const layer = r.args?.tileData?.layerId ?? r.args?.data?.layerId ?? '?';
    const row = byLayer.get(layer) || { n: 0, ms: 0 };
    row.n += 1;
    row.ms += (Number(r.dur) || 0) / 1000;
    byLayer.set(layer, row);
  }
  console.log(`\n== 光栅任务 ${rasters.length} 次 / ${total.toFixed(1)}ms，按层 ==`);
  [...byLayer.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 8)
    .forEach(([layer, row]) => console.log(`  层 ${layer}: ${row.n} 次 / ${row.ms.toFixed(1)}ms`));
  const tileSizes = new Map();
  for (const r of rasters) {
    const td = r.args?.tileData || {};
    const key = `${td.tileResolution || '?'}`;
    tileSizes.set(key, (tileSizes.get(key) || 0) + 1);
  }
  console.log('  瓦片分辨率分布:', [...tileSizes.entries()].map(([k, v]) => `${k}=${v}`).join(' '));
  await page.close();
}

/* ---------- 第二步：玻璃成本按子树归因 ---------- */
console.log('\n== 同一段手势，逐个摘掉子树后的光栅耗时 ==');
for (const strip of STRIPS) {
  const { page, session, point } = await boot(strip.js);
  const shape = await page.evaluate(() => {
    const doc = document.getElementById('linjiang-hud-live').contentDocument;
    return { nodes: doc.querySelectorAll('*').length };
  });
  if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const events = await collectTrace(session, () => gesture(session, point));
  if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const rasters = events.filter((e) => (e.name === 'RasterTask' || e.name === 'Rasterize') && e.ph === 'X');
  const ms = rasters.reduce((s, e) => s + (Number(e.dur) || 0), 0) / 1000;
  const paints = events.filter((e) => e.name === 'Paint' && e.ph === 'X');
  const paintMs = paints.reduce((s, e) => s + (Number(e.dur) || 0), 0) / 1000;
  console.log(`  ${strip.id.padEnd(12)} 光栅 ${ms.toFixed(1).padStart(7)}ms/${String(rasters.length).padStart(4)}次  `
    + `主线程绘制 ${paintMs.toFixed(1).padStart(6)}ms/${String(paints.length).padStart(3)}次  节点${shape.nodes}  ${strip.label}`);
  await page.close();
}

await browser.close();
await server.close();
