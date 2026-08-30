/* 原生流下，覆盖层 iframe 的地址解析到哪里去了？
   ==================================================================
   前两版探针假设「WebKit 在三层嵌套里不绘制」，七组变体在两个引擎上全部正常绘制，假设被否掉。
   换方向：那个 iframe 到底**加载成功了吗**。

   怀疑点：src/shop.js 里
       new URL(`${import.meta.env.BASE_URL}shop/index.html`, document.baseURI)
   而 vite 的 base 是相对的（'./'，见 vite.config.js 的注释）。于是地址是相对 document.baseURI
   解析的 —— 抬升架构下 HUD 跑在自己的 iframe 里、baseURI 是 Pages 地址，解析正确；
   **原生流下 HUD 的 DOM 长在楼层 srcdoc 文档里，而 srcdoc 继承父文档的 baseURI，也就是酒馆的
   地址**。那 shop/index.html 就会被解析到酒馆域下 —— 那里没有这个文件。

   如果成立，一切都对得上：
     · 次级页面（日程）是纯 DOM，不解析任何地址 → 正常
     · 商店 / CG / 地图 / 街机 都要解析地址 → 加载不到 → 空白 iframe
     · 空白 iframe + 近黑的 .shop-layer + 整页期间藏掉的宿主 chrome = 整屏黑
     · 只在移动端（原生流）出现，桌面（抬升）正常
   而且跟 WebKit、嵌套深度、内存全都无关。

   用法：node scripts/_probe-native-overlay-src.mjs
*/
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';

stageRealSources({ quiet: true });
/* 两个服务器 = 两个源，这才是生产的真实形态：
     酒馆（TT 应用）在一个源，HUD（GitHub Pages）在另一个源。
   夹具默认把两者放在同一个源上，于是「相对地址解析到酒馆域」这个错误恰好也能命中文件，
   bug 天生隐形。夹具支持 ?hud=<地址>，用它把 HUD 挪到第二个源。 */
const server = await startFixtureServer({ port: 5266 });
const hudServer = await startFixtureServer({ port: 5267 });
const HUD_ORIGIN = `http://127.0.0.1:5267/`;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const failed = [];
page.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
const responses = [];
page.on('response', (r) => { if (/shop|cg\/|plate_map|arcade/.test(r.url())) responses.push(`${r.status()} ${r.url().slice(0, 130)}`); });

const query = new URLSearchParams({
  chrome: '0', preset: 'phone-iphone', theme: 'Dark V 1.0',
  floors: '12', rendered: '2', shell: 'inline', host: 'tauritavern',
  hud: HUD_ORIGIN,
});
await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady());
await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted());
await page.waitForTimeout(600);

const arch = await page.evaluate(() => {
  const frame = window.__linjiangTavernLive.statusFrame;
  const doc = frame.contentDocument;
  return {
    nativeFlow: !!frame.contentWindow.__linjiangNativeFlow,
    tavernURL: location.href.slice(0, 90),
    /* 关键：楼层 srcdoc 文档的 baseURI 是什么 */
    floorBaseURI: doc.baseURI.slice(0, 90),
    floorIsSrcdoc: frame.hasAttribute('srcdoc'),
  };
});
console.log('=== 架构与 baseURI ===');
console.log(JSON.stringify(arch, null, 2));

const frameSelector = await page.evaluate(() => `#${CSS.escape(window.__linjiangTavernLive.statusFrame.id)}`);
const hud = page.frameLocator(frameSelector);
await hud.locator('.pdest-btn[data-page="shop"]').first().click();
await page.waitForTimeout(1500);

const shop = await page.evaluate(() => {
  const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
  const iframe = doc.querySelector('.shop-layer iframe');
  if (!iframe) return { layer: false };
  let innerTitle = '(跨源或未加载)';
  let innerBodyNodes = -1;
  let innerURL = '(读不到)';
  try {
    const d = iframe.contentDocument;
    if (d) {
      innerTitle = d.title || '(空)';
      innerBodyNodes = d.body ? d.body.querySelectorAll('*').length : -1;
      innerURL = d.URL.slice(0, 130);
    }
  } catch (e) { innerTitle = `(跨源: ${e.name})`; }
  return {
    layer: true,
    /* 属性里写的原始值 vs 浏览器解析后的绝对地址 */
    srcAttr: iframe.getAttribute('src').slice(0, 130),
    resolved: iframe.src.slice(0, 130),
    innerURL,
    innerTitle,
    innerBodyNodes,
  };
});
console.log('');
console.log('=== 商店 iframe ===');
console.log(JSON.stringify(shop, null, 2));

console.log('');
console.log('=== 相关网络响应 ===');
if (responses.length) [...new Set(responses)].slice(0, 10).forEach((r) => console.log(`  ${r}`));
else console.log('  （没有任何 shop/cg/map/arcade 请求）');
if (failed.length) {
  console.log('');
  console.log('=== 失败的请求 ===');
  [...new Set(failed)].slice(0, 10).forEach((r) => console.log(`  ${r}`));
}

console.log('');
console.log('=== 判定 ===');
const loaded = shop.innerBodyNodes > 3;
console.log(`  HUD 所在的源            ${HUD_ORIGIN}`);
console.log(`  酒馆所在的源            http://127.0.0.1:5266/`);
console.log(`  商店 iframe 解析到      ${shop.resolved}`);
const onTavernOrigin = String(shop.resolved || '').startsWith('http://127.0.0.1:5266/');
console.log(`  解析到酒馆域了吗        ${onTavernOrigin ? '是 ← 这就是 bug（生产环境那里没有这个文件）' : '否'}`);
console.log(`  商店内页加载出内容了吗   ${loaded ? '是' : '否 ← 空白 iframe，屏幕就是黑的'}  (body 内节点 ${shop.innerBodyNodes})`);
console.log(`  楼层 baseURI 是酒馆地址吗 ${arch.floorBaseURI === arch.tavernURL ? '是（相对地址因此解析到酒馆域）' : '否'}`);

await browser.close();
await server.close();
await hudServer.close();
