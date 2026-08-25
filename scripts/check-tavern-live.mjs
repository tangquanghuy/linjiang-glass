/* 源码驱动夹具的自检。
   ------------------------------------------------------------------
   这支脚本不测性能，它测的是「夹具本身是不是真的」。性能回归
   （check-hud-raster-perf.mjs）建立在它之上，所以它必须先站得住：

     · 真实源码版本对得上（ST 1.18.0 / 酒馆助手 4.9.3）
     · 真实 ST 样式真的生效了 —— 尤其 #chat 自带 backdrop-filter，这是手写夹具漏掉的
     · 真实 #message_template 被用上了（.mes 结构完整）
     · 酒馆助手注入的真实 adjust_iframe_height.js 真的在改 iframe 高度
     · 状态栏被抬起、对齐栏位、MVU 快照落到了 HUD 上
     · TauriTavern 模式下真实的 geometry firewall 与浮层准入在跑，
       而状态栏 iframe 保住了 data-tt-mobile-surface="none" 的退出契约

   用法：node scripts/check-tavern-live.mjs
*/
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';

const meta = stageRealSources();

const server = await startFixtureServer({ port: 5222 });
const browser = await chromium.launch();
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};

const CASES = [
  { id: 'browser-portrait', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: '', theme: 'Dark V 1.0' },
  { id: 'tauri-portrait', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: 'tauritavern', theme: 'Dark V 1.0' },
  { id: 'browser-desktop', preset: 'desktop-work', w: 1440, h: 900, dsf: 1, host: '', theme: 'Dark V 1.0' },
  { id: 'fast-ui', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: '', theme: 'Dark Lite' },
];

for (const kase of CASES) {
  console.log(`\n=== ${kase.id}  ${kase.w}x${kase.h}  主题 ${kase.theme}  宿主 ${kase.host || 'browser'} ===`);
  const page = await browser.newPage({
    viewport: { width: kase.w, height: kase.h },
    deviceScaleFactor: kase.dsf,
    isMobile: kase.w < 900,
    hasTouch: kase.w < 900,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const body = message.text();
    /* 离线跑不到的 jsdelivr、以及真实 CSS 引用的字体/图片，都是已知且无害的 404。 */
    if (/favicon|jsdelivr|fontawesome|webfonts|\.woff|\.ttf|img\/|backgrounds\//i.test(body)) return;
    errors.push(body);
  });

  try {
    const query = new URLSearchParams({ chrome: '0', preset: kase.preset, theme: kase.theme, floors: '12', rendered: '2' });
    if (kase.host) query.set('host', kase.host);
    await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });

    /* 分三步等，而且每一步的失败要能区分开：夹具模块有没有跑起来 / 壳层有没有抬起
       HUD / HUD 有没有把构图建完。以前把前两步合成一个 waitForFunction，结果模块初始化
       失败时报的是"读不到 waitUntilPainted"，指向完全错误的地方。 */
    await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady());
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted());
    await page.waitForTimeout(500);

    const m = await page.evaluate(() => window.__linjiangTavernLive.measure());

    check(m.versions.sillytavern === '1.18.0', 'SillyTavern 版本', m.versions.sillytavern);
    check(m.versions.tavernHelper === '4.9.3', '酒馆助手版本', m.versions.tavernHelper);
    check(!!m.versions.tauritavern, 'TauriTavern 版本', m.versions.tauritavern);

    /* 真实样式生效的判据：主题带模糊时 #chat 必须真的有 backdrop-filter；
       fast_ui_mode 主题（Dark Lite）则必须被 body.no-blur 关掉。 */
    const wantsBlur = kase.theme !== 'Dark Lite';
    const hasBlur = m.chatBackdropFilter !== 'none' && m.chatBackdropFilter !== '';
    check(hasBlur === wantsBlur, `真实 #chat 的 backdrop-filter（主题 ${kase.theme}）`,
      `${m.chatBackdropFilter} · body=${m.bodyClasses.join(' ')}`);
    check(m.messages === 15, '真实 #message_template 克隆出的楼层数', String(m.messages));
    check(m.renderIframes === 3, '酒馆助手渲染 iframe 数（状态栏 + 2 条正文）', String(m.renderIframes));

    /* 真实 adjust_iframe_height.js 的效果：楼层 iframe 的高度被设成了它内容的高度，
       而不是留在默认的 150px。 */
    const heights = await page.evaluate(() => window.__linjiangTavernLive.renderFrames
      .map((frame) => Math.round(frame.getBoundingClientRect().height)));
    /* 150 是 iframe 的默认高度；脚本没跑起来时正好停在那里，所以必须把它排掉，
       否则"高度同步坏了"会伪装成通过。 */
    check(heights.length > 0 && heights.every((h) => h > 20 && h < 140),
      '真实 adjust_iframe_height.js 调过正文 iframe 高度（≠150 默认值）', JSON.stringify(heights));

    check(m.lifted, '状态栏被抬成 #linjiang-hud-live');
    check(Math.abs(m.alignment) <= 1, 'HUD 与栏位对齐', `${m.alignment}px`);
    check(m.hudMoney.includes('512,300'), 'MVU 快照落到 HUD 上', m.hudMoney || '(空)');
    check(m.liveHudCount === 1, 'HUD 只有一份', String(m.liveHudCount));
    check(m.hudNodes > 150, 'HUD 构图已建完', `${m.hudNodes} 节点`);

    const expectPortrait = kase.w < kase.h && kase.w < 880;
    check(m.portraitDom === expectPortrait, `构图选择（期望 ${expectPortrait ? '竖屏' : '横屏'}）`,
      m.portraitDom ? '竖屏' : '横屏');

    if (kase.host === 'tauritavern') {
      check(m.ttFirewallInstalled, '真实 TT geometry firewall 已安装');
      check(m.hudPerformanceMode === 'low', 'TT 移动端被识别（HUD 进低配模式）', m.hudPerformanceMode);
      /* 这三条是一个整体：状态栏靠"预先声明 none 且未被接管"从 TT 的浮层准入里退出。
         任何一条破了，TT 就会用 !important 改写 HUD 的 top。 */
      check(m.ttSurface === 'none', 'TT 准入退出：surface 仍为 none', String(m.ttSurface));
      check(m.ttAdmitted === false, 'TT 准入退出：未被标记 admitted', String(m.ttAdmitted));
      check(m.ttOriginalTop === '', 'TT 准入退出：没有 --tt-original-top', m.ttOriginalTop || '(空)');
    } else {
      check(m.hudPerformanceMode === 'auto', '原生浏览器不进低配模式', m.hudPerformanceMode);
    }

    check(errors.length === 0, '无脚本错误', errors.slice(0, 2).join(' | '));
  } catch (error) {
    check(false, '夹具启动', error.message);
  }
  await page.close();
}

await browser.close();
await server.close();

console.log(`\n真实源码：ST ${meta.versions.sillytavern} · 酒馆助手 ${meta.versions.tavernHelper} · TauriTavern ${meta.versions.tauritavern}`);
if (failures.length) {
  console.log('\n夹具自检失败：');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('源码驱动夹具自检：全部通过');
