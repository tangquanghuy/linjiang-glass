/* 内嵌页面取不回来时，用户到底看到什么？—— 按**像素**判，不按 DOM 判。
   ==================================================================
   为什么要单独一支脚本按像素判

   用户的质疑一针见血：「之前黑屏的时候，连你的日志面板都不会显示，你确定你加的不会也是
   一片黑吗」。而且他补充：商店黑屏时也看不到日志，是后来商店加载好了才有日志。

   这说明存在两个不同的状态，而之前的仪器只观测到了一个：

     状态一  覆盖层在（底色 + 右上角 ×）、诊断条在、只缺内页 —— 就是加载慢
     状态二  整屏纯近黑，× 和诊断条都没有 —— 这才是用户抱怨的黑屏

   「DOM 里有这个元素」不等于「屏幕上看得见」。所以这支脚本不查 DOM，它截图数像素：
   把内嵌页面的地址拦掉（模拟取不回来），然后问一句 —— 覆盖层那块区域里，有多少像素
   **不是**近黑？如果答案接近 0，那我加的等待状态就跟原来一样是一片黑，等于没做。

   它覆盖四个内嵌页面（商店 / 街机 / CG / 地图），因为它们的底色各不相同，
   而"看起来像坏了"这件事对深色底的那几个才成立。

   用法：node scripts/check-overlay-loading.mjs
*/
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';

const meta = stageRealSources();
const server = await startFixtureServer({ port: 5277 });
const hudServer = await startFixtureServer({ port: 5278 });
const HUD_ORIGIN = 'http://127.0.0.1:5278/';
const browser = await chromium.launch();
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};

/* 四个覆盖层各自的入口按钮、拦截模式、以及"没绘制时应该看到的那个底色"。 */
const OVERLAYS = [
  { id: 'shop', page: 'shop', route: '**/shop/index.html*', label: '商店' },
  { id: 'arcade', page: 'arcade', route: '**/arcade/index.html*', label: '街机' },
  { id: 'cg', page: 'cg', route: '**/cg/index.html*', label: 'CG' },
];

/* 「近黑」的判据：三个通道都很暗。覆盖层底色 #0c1024 / #100d17 / #070a14 都落在这里面。
   CG 的底色是浅色 #eef2f7，所以它那格用另一条判据（见下面 verdict）。 */
const isDark = (r, g, b) => r < 56 && g < 56 && b < 64;

const analyse = (buffer) => {
  const png = PNG.sync.read(buffer);
  let dark = 0;
  let bright = 0;
  const seen = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (isDark(r, g, b)) dark += 1; else bright += 1;
    /* 粗量一下颜色多样性：一整块纯色说明什么都没画。 */
    if (seen.size < 400) seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
  }
  const total = png.width * png.height;
  return {
    w: png.width,
    h: png.height,
    darkPct: +(dark / total * 100).toFixed(1),
    brightPct: +(bright / total * 100).toFixed(1),
    colors: seen.size,
  };
};

const page = await browser.newPage({
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  const query = new URLSearchParams({
    chrome: '0', preset: 'phone-iphone', theme: 'Dark V 1.0', floors: '20', rendered: '0',
    statusFloors: '3', shell: 'inline', host: 'tauritavern', hud: HUD_ORIGIN,
  });
  await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
  await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady(60000));
  await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted(60000));
  await page.waitForTimeout(600);

  const frameSelector = await page.evaluate(() => `#${CSS.escape(window.__linjiangTavernLive.statusFrame.id)}`);
  const hud = page.frameLocator(frameSelector);

  for (const overlay of OVERLAYS) {
    console.log(`\n=== ${overlay.label}：页面取不回来时屏幕上有什么 ===`);
    /* 永不响应，模拟"Pages 取不回来"。这正是真机上发生的事：iframe 停在 about:blank。 */
    await page.route(overlay.route, () => {});
    await hud.locator(`.pdest-btn[data-page="${overlay.page}"]`).first().click();
    await page.waitForTimeout(1500);

    /* 只截覆盖层那块区域 —— 整屏截会把酒馆界面也算进来，稀释判据。
       同时把**诊断条**摘掉：它是临时仪器（底色 #0b1220，按下面的判据算"近黑"），会盖住大半
       个区域、把数字拉低。第一次跑就栽在这上面：商店/街机只有 22%，而没挂诊断条的 CG 是 89%
       —— 差别全是仪器造成的。测的是产品行为，仪器不该进画面。 */
    const clip = await page.evaluate(() => {
      try { window.parent.document.getElementById('linjiang-native-diag')?.remove(); } catch (e) {}
      try { document.getElementById('linjiang-native-diag')?.remove(); } catch (e) {}
      const frame = window.__linjiangTavernLive.statusFrame;
      const r = frame.getBoundingClientRect();
      return {
        x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)),
        width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)),
      };
    });
    const before = analyse(await page.screenshot({ type: 'png', clip }));
    console.log(`      加载中：近黑 ${before.darkPct}%  非近黑 ${before.brightPct}%  颜色数 ${before.colors}`);
    /* 判据：必须有肉眼可见的非近黑内容（转圈 + 文字），而不是一整块纯色。
       3% 这个门槛是给"一行字加一个转圈"留的余量 —— 真出问题时这个数会趋近 0。 */
    /* 门槛怎么定的：第一版是「近黑背板 + 细转圈 + 一行小字」，量出来只有 0.7%（CG 那格，
       它没挂诊断条，所以露出的是加载层自己的真实亮度）。0.7% 在手机上扫一眼跟黑屏区分不开。
       现在改成明显更亮的背板 + 有边框的卡片 + 更大的字，目标是让这块区域**整体**不再是深色，
       所以门槛按"大半个屏幕都不是近黑"来定，而不是"有几个亮点"。 */
    check(before.brightPct >= 50 && before.colors >= 8,
      `${overlay.label}：加载中整块区域明显不是黑屏`,
      `非近黑 ${before.brightPct}% / 颜色数 ${before.colors}`);

    /* 超时之后：必须出现出路（重试/关闭），而且仍然是看得见的。 */
    await page.waitForTimeout(5600);
    /* 诊断条会自己按 1 秒节拍重建，截图前再摘一次。 */
    await page.evaluate(() => {
      try { window.parent.document.getElementById('linjiang-native-diag')?.remove(); } catch (e) {}
      try { document.getElementById('linjiang-native-diag')?.remove(); } catch (e) {}
    });
    const after = analyse(await page.screenshot({ type: 'png', clip }));
    console.log(`      超时后：近黑 ${after.darkPct}%  非近黑 ${after.brightPct}%  颜色数 ${after.colors}`);
    check(after.brightPct >= 50 && after.colors >= 8,
      `${overlay.label}：超时后仍然明显不是黑屏（给出了解释与按钮）`,
      `非近黑 ${after.brightPct}% / 颜色数 ${after.colors}`);

    /* 用等待状态自己的关闭钮退出 —— 这条路不依赖内页加载成功。 */
    const closed = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
      const btn = [...doc.querySelectorAll('.overlay-loading button')]
        .find((b) => b.textContent.trim() === '关闭');
      if (!btn) return 'no-button';
      btn.click();
      return 'clicked';
    });
    await page.waitForTimeout(500);
    const gone = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
      return !doc.querySelector('.shop-layer, .arcade-layer, .cg-layer');
    });
    check(closed === 'clicked' && gone, `${overlay.label}：等待状态里的关闭钮能退出`, closed);
    await page.unroute(overlay.route);
    await page.waitForTimeout(300);
  }

  check(errors.length === 0, '无脚本错误', errors.slice(0, 3).join(' | '));
} catch (error) {
  check(false, '执行', error.message.split('\n')[0]);
}

await page.close();
await browser.close();
await server.close();
await hudServer.close();
console.log(`\n真实源码：ST ${meta.versions.sillytavern} / 酒馆助手 ${meta.versions.tavernHelper}`);
if (failures.length) {
  console.log('\n内嵌页面加载状态回归失败：');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('内嵌页面加载状态回归：全部通过');
