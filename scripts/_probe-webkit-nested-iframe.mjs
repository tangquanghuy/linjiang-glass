/* 受控实验：原生流的整页结构里，第三层 iframe 到底为什么不绘制。
   ==================================================================
   真机反馈（iPhone 14 + TauriTavern，原生流）：
     · 次级页面（日程）—— 正常
     · 商店 / CG（覆盖层里套 iframe）—— 直接黑屏
   两者走同一条整页路径，唯一差别是里面套了一个 iframe。

   第一版探针只测了「三层嵌套 + fixed」，四组变体在 Chromium 和 WebKit 上**全部正常绘制**，
   也就是说嵌套深度本身不是原因 —— 那个假设被自己的对照组否掉了。所以这一版把当初被我
   剥掉的两个真实条件加回来，它们才是真实结构：

     floor=srcdoc   楼层是 srcdoc（酒馆助手把卡片 HTML 塞进 srcdoc，不是普通地址）
     inner=cross    第三层跨源（HUD 和商店都在 Pages 域，而楼层 srcdoc 继承酒馆的源）

   变体：
     A  楼层常规流   + 内层fixed + iframe 同源     ← 撤销整页几何后的样子
     B  楼层fixed    + 内层fixed + iframe 同源     ← 第一版怀疑的那组（已证明正常）
     C  楼层fixed    + 内层fixed + 纯DOM           ← 次级页面（日程）的类比
     D  楼层fixed    + 内层static + iframe 同源    ← 隔离内层 fixed
     E  楼层fixed    + 内层fixed + iframe **跨源**
     F  楼层**srcdoc** + fixed + 内层fixed + iframe 跨源   ← 最接近真实
     G  楼层**srcdoc** + 常规流 + 内层fixed + iframe 跨源   ← 真实结构但不做整页几何

   两个引擎都跑，Chromium 作对照：只有 WebKit 坏才解释「夹具全绿、iPhone 黑屏」。
   判据是**真的画出来了**：第三层底色是亮品红 #ff00aa，数屏幕上这个颜色的像素。

   用法：node scripts/_probe-webkit-nested-iframe.mjs
*/
import { chromium, webkit } from 'playwright';
import { PNG } from 'pngjs';
import { startFixtureServer } from './lib/fixture-server.mjs';

/* 两个服务器 = 两个源。跨源那几组的第三层从第二个源取。 */
const server = await startFixtureServer({ port: 5255 });
const alt = await startFixtureServer({ port: 5256 });
const HOST = `${server.url}/artifacts/probe-webkit/host.html`;
const SAME = '.';
const CROSS = `${alt.url}/artifacts/probe-webkit`;

const VARIANTS = [
  { id: 'A', floor: 'url', inner: SAME, v: 'A', label: '楼层常规流 + 内层fixed + 同源iframe' },
  { id: 'B', floor: 'url', inner: SAME, v: 'B', label: '楼层fixed + 内层fixed + 同源iframe' },
  { id: 'C', floor: 'url', inner: SAME, v: 'C', label: '楼层fixed + 内层fixed + 纯DOM' },
  { id: 'D', floor: 'url', inner: SAME, v: 'D', label: '楼层fixed + 内层static + 同源iframe' },
  { id: 'E', floor: 'url', inner: CROSS, v: 'B', label: '楼层fixed + 内层fixed + 跨源iframe' },
  { id: 'F', floor: 'srcdoc', inner: CROSS, v: 'B', label: 'srcdoc楼层fixed + 跨源iframe ←最接近真实' },
  { id: 'G', floor: 'srcdoc', inner: CROSS, v: 'A', label: 'srcdoc楼层常规流 + 跨源iframe' },
];

const TARGET = { r: 0xff, g: 0x00, b: 0xaa };
const near = (a, b, tol = 24) => Math.abs(a - b) <= tol;
const countTargetPixels = (buffer) => {
  const png = PNG.sync.read(buffer);
  let hit = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (near(png.data[i], TARGET.r) && near(png.data[i + 1], TARGET.g) && near(png.data[i + 2], TARGET.b)) hit += 1;
  }
  return { hit, total: png.width * png.height };
};

const rows = [];

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  for (const variant of VARIANTS) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 80)); });
    let painted = { hit: 0, total: 1 };
    let info = {};
    try {
      const url = `${HOST}?v=${variant.v}&floor=${variant.floor}&innerBase=${encodeURIComponent(variant.inner)}`;
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__probeApply());
      await page.waitForTimeout(900);
      info = await page.evaluate(() => {
        const floor = document.getElementById('floor');
        const box = floor.getBoundingClientRect();
        return {
          floorPos: getComputedStyle(floor).position,
          floorBox: `${Math.round(box.width)}x${Math.round(box.height)}`,
          frames: window.length,
        };
      });
      painted = countTargetPixels(await page.screenshot({ type: 'png' }));
    } catch (error) {
      errors.push(error.message.split('\n')[0]);
    }
    rows.push({ engine: engineName, variant, pct: +(painted.hit / painted.total * 100).toFixed(1), info, errors });
    await page.close();
  }
  await browser.close();
}

await server.close();
await alt.close();

console.log('');
console.log('第三层（亮品红 #ff00aa）占屏比例 —— 0% 就是没绘制出来');
console.log('─'.repeat(100));
console.log('组  结构                                        Chromium        WebKit');
console.log('─'.repeat(100));
for (const variant of VARIANTS) {
  const cr = rows.find((r) => r.engine === 'chromium' && r.variant.id === variant.id);
  const wk = rows.find((r) => r.engine === 'webkit' && r.variant.id === variant.id);
  const fmt = (r) => {
    if (!r) return '?'.padEnd(15);
    const mark = r.pct > 5 ? '绘制了' : '← 没绘制';
    return `${String(r.pct).padStart(5)}% ${mark}`.padEnd(15);
  };
  console.log(`${variant.id}   ${variant.label.padEnd(42)} ${fmt(cr)} ${fmt(wk)}`);
}
console.log('─'.repeat(100));

const errs = rows.filter((r) => r.errors.length);
if (errs.length) {
  console.log('');
  console.log('页面报错：');
  for (const row of errs) console.log(`  ${row.engine} ${row.variant.id}: ${[...new Set(row.errors)].slice(0, 2).join(' | ')}`);
}

console.log('');
console.log('结论：');
const get = (e, id) => rows.find((r) => r.engine === e && r.variant.id === id);
const broken = VARIANTS.filter((v) => {
  const wk = get('webkit', v.id);
  const cr = get('chromium', v.id);
  return wk && cr && wk.pct <= 5 && cr.pct > 5;
});
if (broken.length) {
  console.log(`  · 只在 WebKit 上不绘制的组：${broken.map((v) => v.id).join(', ')}`);
  console.log('    这就是「夹具（Chromium）全绿、iPhone（WebKit）黑屏」的原因');
} else {
  console.log('  · 没有任何一组是「WebKit 坏、Chromium 好」—— 这个方向还没抓到真机那个条件');
}
const bothBad = VARIANTS.filter((v) => {
  const wk = get('webkit', v.id);
  const cr = get('chromium', v.id);
  return wk && cr && wk.pct <= 5 && cr.pct <= 5;
});
if (bothBad.length) console.log(`  · 两个引擎都不绘制的组：${bothBad.map((v) => v.id).join(', ')}（那是我们自己的布局/加载问题，不是引擎差异）`);
