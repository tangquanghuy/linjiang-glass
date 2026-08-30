/* 转发滚动的作用域回归：只许滚阅读区，不许碰宿主外壳。
   ==================================================================
   为什么有这支脚本
   ------------------------------------------------------------------
   用户反馈「PC 下往下滚动，有时候把酒馆整个输入框都滚上去」，而本地复现不出来。

   原因是壳层把 HUD 里的滚轮转发进宿主时，按原生滚动链的语义把吃不下的余量往父节点喂。
   在宿主文档里，阅读区 #chat 的父节点是 #sheld —— 而 **#sheld 同时装着 #form_sheld
   （输入栏）**，真实 ST 给它的是 overflow-y:auto。实测这条链（真实 ST 1.18.0，桌面 1440x900）：

       节点        overflowY   余量    壳层当时判定可滚
       div#chat    scroll      1061    会
       div#sheld   auto           0    不会 ← 平时没余量，所以大多数人碰不到
       body        hidden         0    不会（顺带纠正一个猜错的方向：body 是 overflow:hidden，
       html        visible        0    不会    scrollTop 压根写不动，不是"滚了文档根"那条路）

   #sheld 平时余量为 0，所以本地是好的。但只要有东西把它撑出余量 —— Quick Reply 工具条多一排
   （反馈截图里输入栏上方那排自定义按钮）、浏览器缩放、或 #chat 有 min-height 让 flex 缩不下去
   —— 它就变成可滚的。这时把 #chat 滚到底再继续往下滚，余量溢出到 #sheld：修复前实测
   #sheld.scrollTop 0 → 226，输入栏从 y=867 被推到 y=641。而 ST 自己从不滚 #sheld，
   所以没有任何东西会把它滚回来。

   自动滚动（中键）走的是同一套目标选择，而且更糟：它会**持续**滚，把外壳一路推出屏幕。

   契约
   ------------------------------------------------------------------
     · 该滚的仍要滚：转发滚轮必须还能滚动 #chat（否则"修好了"其实是"关掉了"）
     · 不许碰外壳：#sheld 有余量、#chat 已到底时，#sheld.scrollTop 和输入栏位置都不得变
     · 自动滚动不得 latch 在装着阅读区的祖先上

   用法：node scripts/check-host-scroll-containment.mjs
*/
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';

const meta = stageRealSources();
const server = await startFixtureServer({ port: 5244 });
const browser = await chromium.launch();
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};

/* 两种投递方式都要跑：线上同时存在自包含版和引导壳，而它们的装载时序不同。 */
const CASES = [
  { id: 'desktop-inline', w: 1440, h: 900, shell: 'inline' },
  { id: 'desktop-boot', w: 1680, h: 1050, shell: 'boot' },
];

/* 从 HUD iframe **内部**发滚轮。壳层的 onHudWheel 要求
   event.source === hudFrame.contentWindow，从顶层窗口 postMessage 会被直接丢掉；
   这也正是 src/bridge.js 真实的转发方式（window.parent.postMessage）。 */
const forwardWheel = async (page, times, deltaY = 120) => {
  const handle = await page.$('#linjiang-hud-live');
  const frame = await handle.contentFrame();
  await frame.evaluate(({ times: n, deltaY: dy }) => {
    for (let i = 0; i < n; i += 1) {
      parent.postMessage({
        channel: 'linjiang-hud', kind: 'event', type: 'wheel',
        payload: {
          deltaY: dy, deltaMode: 0,
          clientX: Math.round(innerWidth / 2),
          clientY: Math.round(innerHeight / 2),
        },
      }, '*');
    }
  }, { times, deltaY });
  await page.waitForTimeout(400);
};

for (const kase of CASES) {
  console.log(`\n=== ${kase.id}  ${kase.w}x${kase.h}  壳层 ${kase.shell} ===`);
  const page = await browser.newPage({ viewport: { width: kase.w, height: kase.h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    const query = new URLSearchParams({
      chrome: '0', preset: 'desktop-work', theme: 'Dark V 1.0',
      floors: '12', rendered: '2', shell: kase.shell,
    });
    await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady());
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted());
    await page.waitForTimeout(500);

    check(await page.evaluate(() => !!document.getElementById('linjiang-hud-live')),
      '前提：桌面走抬升架构（转发滚动只存在于这一支）');

    /* 前提二：真实 ST 的 #sheld 确实是可滚类型、并且确实装着输入栏。
       这两条是整个 bug 的地基；哪天 ST 改了结构，这里要先红，而不是让下面的断言变成空转。 */
    const shape = await page.evaluate(() => {
      const sheld = document.getElementById('sheld');
      return {
        sheldOverflowY: getComputedStyle(sheld).overflowY,
        sheldHoldsForm: sheld.contains(document.getElementById('form_sheld')),
        sheldHoldsChat: sheld.contains(document.getElementById('chat')),
      };
    });
    check(/auto|scroll|overlay/.test(shape.sheldOverflowY) && shape.sheldHoldsForm && shape.sheldHoldsChat,
      '前提：#sheld 是可滚类型，且同时装着 #chat 与输入栏', JSON.stringify(shape));

    /* ---- 正面：该滚的仍然要滚 ---- */
    await page.evaluate(() => { document.getElementById('chat').scrollTop = 200; });
    const before = await page.evaluate(() => document.getElementById('chat').scrollTop);
    await forwardWheel(page, 3);
    const afterChat = await page.evaluate(() => document.getElementById('chat').scrollTop);
    check(afterChat > before + 10, '转发滚轮仍然能滚动阅读区 #chat', `${Math.round(before)} → ${Math.round(afterChat)}`);

    /* ---- 反面：#sheld 有余量时不得被碰 ---- */
    const staged = await page.evaluate(() => {
      const sheld = document.getElementById('sheld');
      const chat = document.getElementById('chat');
      const form = document.getElementById('form_sheld');
      /* 用现实方式把 #sheld 撑出余量：先锁住 #chat 的高度（等价于主题给了 min-height /
         flex 缩不下去），再在输入区上方插一排工具条。顺序要紧 —— 先插会让 #chat 让出空间，
         #sheld 就永远不会溢出（第一版就栽在这上面）。 */
      chat.style.minHeight = `${chat.getBoundingClientRect().height}px`;
      chat.style.flexShrink = '0';
      const bar = document.createElement('div');
      bar.id = '__qr_bar_probe';
      bar.style.cssText = 'height:220px;flex:0 0 auto;';
      form.insertBefore(bar, form.firstChild);
      chat.scrollTop = chat.scrollHeight;      // 滚到底，让余量必然溢出到父链
      return {
        sheldRoom: sheld.scrollHeight - sheld.clientHeight,
        sheldTop: Math.round(sheld.scrollTop),
        formTop: Math.round(form.getBoundingClientRect().top),
        chatLeft: chat.scrollHeight - chat.clientHeight - chat.scrollTop,
      };
    });
    check(staged.sheldRoom > 50 && staged.chatLeft <= 1,
      '已造出「#sheld 有余量且 #chat 已到底」的现场', JSON.stringify(staged));

    await forwardWheel(page, 15);
    const afterShell = await page.evaluate(() => {
      const sheld = document.getElementById('sheld');
      const form = document.getElementById('form_sheld');
      const bar = document.getElementById('top-bar');
      return {
        sheldTop: Math.round(sheld.scrollTop),
        formTop: Math.round(form.getBoundingClientRect().top),
        barTop: Math.round(bar.getBoundingClientRect().top),
      };
    });
    check(afterShell.sheldTop === 0,
      '转发滚轮不得滚动 #sheld（它装着输入栏）', `scrollTop=${afterShell.sheldTop}`);
    check(afterShell.formTop === staged.formTop,
      '输入栏没有被推走', `${staged.formTop} → ${afterShell.formTop}`);

    /* ---- 反面：自动滚动不得 latch 在外壳上 ---- */
    const autoTarget = await page.evaluate(async () => {
      const handle = document.getElementById('linjiang-hud-live');
      handle.contentWindow.parent.postMessage({
        channel: 'linjiang-hud', kind: 'event', type: 'autoscrollToggle',
        payload: { clientX: 10, clientY: 10 },
      }, '*');
      return true;
    });
    /* 中键自动滚动的入口同样要求 source 是 HUD 窗口，所以从 iframe 内部再发一次。 */
    const hudHandle = await page.$('#linjiang-hud-live');
    const hudFrame = await hudHandle.contentFrame();
    await hudFrame.evaluate(() => {
      parent.postMessage({
        channel: 'linjiang-hud', kind: 'event', type: 'autoscrollToggle',
        payload: { clientX: Math.round(innerWidth / 2), clientY: Math.round(innerHeight / 2) },
      }, '*');
    });
    await page.waitForTimeout(700);
    const afterAuto = await page.evaluate(() => {
      const sheld = document.getElementById('sheld');
      const form = document.getElementById('form_sheld');
      return {
        sheldTop: Math.round(sheld.scrollTop),
        formTop: Math.round(form.getBoundingClientRect().top),
      };
    });
    check(afterAuto.sheldTop === 0 && afterAuto.formTop === staged.formTop,
      '自动滚动也不得 latch 在 #sheld 上', JSON.stringify({ ...afterAuto, autoTarget }));

    check(errors.length === 0, '无脚本错误', errors.slice(0, 3).join(' | '));
  } catch (error) {
    check(false, `${kase.id} 执行`, error.message);
  }
  await page.close();
}

await browser.close();
await server.close();
console.log(`\n真实源码：ST ${meta.versions.sillytavern} / 酒馆助手 ${meta.versions.tavernHelper}`);
if (failures.length) {
  console.log('\n转发滚动作用域回归失败：');
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('转发滚动作用域回归：全部通过');
