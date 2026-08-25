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

/* shell 字段 = 壳层的投递路径，见 tools/tavern-live-fixture.js 的 SHELL_VARIANT。
   inline 是自包含版（脚本内联、同步执行，旧用户粘的那份），boot 是引导壳（一句 <script src>，
   脚本从 http URL 取回再执行）。两条都要跑：线上会同时存在这两种安装，而它们的装载时序不同 ——
   boot 把脚本执行推到了网络之后，抬升时机和跨楼层交接都得重新验一遍。 */
const CASES = [
  { id: 'browser-portrait', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: '', theme: 'Dark V 1.0', shell: 'inline' },
  { id: 'tauri-portrait', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: 'tauritavern', theme: 'Dark V 1.0', shell: 'inline' },
  { id: 'browser-desktop', preset: 'desktop-work', w: 1440, h: 900, dsf: 1, host: '', theme: 'Dark V 1.0', shell: 'inline' },
  { id: 'fast-ui', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: '', theme: 'Dark Lite', shell: 'inline' },
  { id: 'boot-portrait', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: '', theme: 'Dark V 1.0', shell: 'boot' },
  { id: 'boot-tauri', preset: 'phone-iphone', w: 390, h: 844, dsf: 3, host: 'tauritavern', theme: 'Dark V 1.0', shell: 'boot' },
  { id: 'boot-desktop', preset: 'desktop-work', w: 1440, h: 900, dsf: 1, host: '', theme: 'Dark V 1.0', shell: 'boot' },
];

for (const kase of CASES) {
  console.log(`\n=== ${kase.id}  ${kase.w}x${kase.h}  主题 ${kase.theme}  宿主 ${kase.host || 'browser'}  壳层 ${kase.shell} ===`);
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
    query.set('shell', kase.shell);
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

    /* 壳层这三条是一组，作用是把「壳层没装上」和「壳层装上了但别处不对」分开。
       没有这一组的话，boot 路径下 <script src> 取不到会表现为下面一大串失败（HUD 没抬起、
       快照没落地、节点数不够），一眼看不出根因其实只是脚本没到。 */
    check(m.shellVariant === kase.shell, '壳层走的是预期路径', `${m.shellVariant}`);
    check(!!m.shellVersion, '壳层脚本已执行（<html> 上有 data-linjiang-shell 记号）',
      m.shellVersion || '(空 —— boot 路径下即「脚本没取到」)');
    check(!m.shellHint.includes('没取到'), '引导壳没有报「脚本没取到」', m.shellHint || '(无提示)');

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

/* 故障注入：引导壳取不到脚本时会怎样。
   ------------------------------------------------------------------
   这是引导壳唯一的新增用户可见行为 —— 以前壳层逻辑内联在 HTML 里，不存在「取不到」这回事。
   不注入一次故障，就没有任何证据说明那段兜底提示有效，它可能写错了选择器、可能被样式藏住、
   也可能因为记号语义搞反了而在正常情况下误报。

   这个用例是反向的：期望壳层**没有**装上、HUD**没有**被抬起，而提示**出现**了。所以它不能走
   waitUntilReady（那会一直等到超时）。 */
console.log('\n=== boot-offline  390x844  引导壳取不到脚本（故障注入） ===');
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  /* 这个用例里 404 是预期的，所以不把 console error 当失败。 */
  try {
    const query = new URLSearchParams({
      chrome: '0', preset: 'phone-iphone', theme: 'Dark V 1.0', floors: '12', rendered: '2',
      shell: 'boot', shellFail: '1',
    });
    await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
    /* 楼层挂完、srcdoc 落地、那句同步 <script src> 失败并跑完兜底，都在这段里发生。 */
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => window.__linjiangTavernLive.measure());

    check(m.shellVersion === '', '脚本没到时没有 data-linjiang-shell 记号', m.shellVersion || '(空)');
    check(m.shellHint.includes('没取到'), '引导壳弹出了看得懂的兜底提示', m.shellHint || '(无提示)');
    check(!m.lifted, '脚本没到时 HUD 不会被抬起（不留半装状态）', String(m.lifted));
    /* 这一条是重点：兜底提示必须真的可见。以前踩过样式没生效、元素还在 display:none 的坑。 */
    const hintVisible = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame?.contentDocument;
      const hint = doc?.getElementById('hint');
      if (!hint) return null;
      const box = hint.getBoundingClientRect();
      return { display: doc.defaultView.getComputedStyle(hint).display, w: Math.round(box.width), h: Math.round(box.height) };
    });
    check(!!hintVisible && hintVisible.display !== 'none' && hintVisible.w > 0 && hintVisible.h > 0,
      '兜底提示真的可见（不是挂着 display:none）', JSON.stringify(hintVisible));
  } catch (error) {
    check(false, '故障注入用例', error.message);
  }
  await page.close();
}

/* 流内嵌入实验版的次级页面。
   ------------------------------------------------------------------
   这一支以前一条断言都没有 —— 夹具支持 shell=flow，但没有用例驱动它，所以下面这两个
   根因是在真机上被用户撞出来的，而且症状是「整个面板直接消失」：

   一、position:fixed 逃不出 #chat。
      SillyTavern 的 #chat 带 backdrop-filter: blur(13px)，而 backdrop-filter 会让元素
      成为 fixed 后代的**包含块**。于是楼层 iframe 设成 fixed;top:0 之后，rect.top 等于
      -chat.scrollTop，跟着聊天滚动走并被 #chat 裁掉：scrollTop 1117 时视口内可见面积为 0。
      注意这条只在**带模糊的主题**上出现，Dark Lite 那种 no-blur 主题一直是好的 ——
      所以用例必须钉住 Dark V 1.0，换成 Lite 就测不出来了。

   二、抬不出去的宿主 chrome。
      #top-bar（z 3005）和 #form_sheld（z 31）会压在整页上面。楼层 iframe 在
      position:static 的 #chat 里，实测把它的 z-index 提到 2147483647 仍然输给
      #form_sheld，所以只能整页期间把这几件 chrome 藏起来（生产壳层的全屏本来就盖住它们）。

   还要断言**退出后精确还原** —— 漏掉的话 #chat 会永久失去 backdrop-filter，那是个
   不报错的画面退化，最难发现。 */
console.log('\n=== flow-tauri-page  390x844  流内嵌入 · 收回嵌入框 · 次级页面 ===');
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const query = new URLSearchParams({
      chrome: '0', preset: 'phone-iphone', theme: 'Dark V 1.0', floors: '12', rendered: '2',
      shell: 'flow', host: 'tauritavern',
    });
    await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady());
    await page.waitForTimeout(1500);

    const reveal = () => page.evaluate(() => {
      const chat = document.getElementById('chat');
      const frame = window.__linjiangTavernLive.statusFrame;
      chat.scrollTop = Math.max(0, chat.scrollTop
        + frame.getBoundingClientRect().top - chat.getBoundingClientRect().top - 12);
    });

    /* 状态：楼层几何 + #chat 的模糊 + chrome 可见性 + 视口四角归谁。 */
    const state = () => page.evaluate(() => {
      const floor = window.__linjiangTavernLive.statusFrame;
      const chat = document.getElementById('chat');
      const box = floor.getBoundingClientRect();
      const chrome = {};
      for (const id of ['top-bar', 'top-settings-holder', 'form_sheld']) {
        const el = document.getElementById(id);
        chrome[id] = el ? { vis: getComputedStyle(el).visibility, style: el.getAttribute('style') || '' } : null;
      }
      const owns = [[195, 60], [195, 420], [195, 830]].map(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el === floor;
      });
      return {
        pos: getComputedStyle(floor).position,
        top: Math.round(box.top),
        left: Math.round(box.left),
        w: Math.round(box.width),
        h: Math.round(box.height),
        chatBackdrop: getComputedStyle(chat).backdropFilter || getComputedStyle(chat).webkitBackdropFilter,
        chatStyleAttr: chat.getAttribute('style') || '',
        chrome,
        ownsAll: owns.every(Boolean),
        pageOpen: (() => {
          try {
            return /is-page-open/.test(floor.contentDocument
              .getElementById('linjiang-hud-live').contentDocument.documentElement.className);
          } catch (e) { return null; }
        })(),
      };
    });

    await reveal();
    await page.waitForTimeout(300);
    const base = await state();
    check(base.chatBackdrop === 'blur(13px)',
      '前提：真实 #chat 带 backdrop-filter（换 no-blur 主题这个用例就失效）', base.chatBackdrop);

    /* 切成「收回嵌入框」。默认停靠方式是「页面」，不切就走不到 INLINE_DOCK 那一支。 */
    const toggled = await page.evaluate(() => {
      const btn = document.getElementById('linjiang-hud-shrink');
      if (!btn) return false;
      btn.click();
      return true;
    });
    check(toggled, '找到并点了停靠切换钮 #linjiang-hud-shrink');
    await page.waitForTimeout(1200);
    await reveal();
    await page.waitForTimeout(300);

    const inFloor = await page.evaluate(() => {
      try { return !!window.__linjiangTavernLive.statusFrame.contentDocument.getElementById('linjiang-hud-live'); }
      catch (e) { return false; }
    });
    check(inFloor, '收回后 HUD 建在楼层文档里（原生嵌入，不是被抬起）');

    const floorSel = await page.evaluate(() => '#' + CSS.escape(window.__linjiangTavernLive.statusFrame.id));
    const hud = page.frameLocator(floorSel).frameLocator('#linjiang-hud-live');
    await hud.locator('.pdest-btn[data-page="schedule"]').first().click({ timeout: 15000 });
    await page.waitForTimeout(900);

    const open = await state();
    check(open.pageOpen === true, '次级页面真的开了（HUD <html> 带 is-page-open）', String(open.pageOpen));
    check(open.pos === 'fixed' && open.top === 0 && open.left === 0,
      '整页锚在视口原点（backdrop-filter 的包含块已中和）', `${open.pos} ${open.left},${open.top}`);
    check(open.w >= 390 && open.h >= 844, '整页铺满视口', `${open.w}x${open.h}`);
    check(open.ownsAll, '视口上/中/下三点都归整页（顶栏和输入栏没压在上面）');

    /* 关键回归：滚动聊天时整页不能跟着走。这正是「面板消失」的动作。 */
    await page.evaluate(() => { document.getElementById('chat').scrollTop += 600; });
    await page.waitForTimeout(400);
    const scrolled = await state();
    check(scrolled.top === 0 && scrolled.ownsAll,
      '滚动聊天 600px 后整页仍钉在视口（修复前这里会滚走并被裁成 0）',
      `top=${scrolled.top} 三点归属=${scrolled.ownsAll}`);

    /* 整页开着时去改停靠方式 —— 全局设置里那一行走的就是这条路（applyDockDefault）。
       分支链会直接切去生产路径，layoutInlineDockPage 的收尾没人执行，于是 #chat 的模糊
       停在 none、顶栏和输入栏停在 hidden。用户看到的就是「切换设置把面板主体全屏化」。 */
    await page.evaluate(() => document.getElementById('linjiang-hud-shrink')?.click());
    await page.waitForTimeout(1400);
    const switched = await state();
    check(switched.pos !== 'fixed', '整页开着时切停靠：楼层不再是 fixed', switched.pos);
    check(switched.chatBackdrop === base.chatBackdrop,
      '整页开着时切停靠：#chat 的模糊已还原', `${base.chatBackdrop} -> ${switched.chatBackdrop}`);
    check(switched.chatStyleAttr === base.chatStyleAttr,
      '整页开着时切停靠：#chat 没留下内联残渣', JSON.stringify(switched.chatStyleAttr));
    for (const id of ['top-bar', 'top-settings-holder', 'form_sheld']) {
      check(switched.chrome[id] && switched.chrome[id].vis === 'visible',
        `整页开着时切停靠：#${id} 恢复可见`, JSON.stringify(switched.chrome[id]));
    }

    /* 切回嵌入，重新开一页，再验正常的关页路径。 */
    await page.evaluate(() => document.getElementById('linjiang-hud-shrink')?.click());
    await page.waitForTimeout(1400);
    await reveal();
    await page.waitForTimeout(300);
    await hud.locator('.pdest-btn[data-page="schedule"]').first().click({ timeout: 15000 });
    await page.waitForTimeout(900);

    /* 退出必须精确还原，否则 #chat 永久失去模糊。 */
    await hud.locator('[data-page-close]').first().click({ timeout: 15000 });
    await page.waitForTimeout(1200);
    const back = await state();
    check(back.chatBackdrop === base.chatBackdrop,
      '关页后 #chat 的 backdrop-filter 还原', `${base.chatBackdrop} -> ${back.chatBackdrop}`);
    check(back.chatStyleAttr === base.chatStyleAttr,
      '关页后 #chat 的 style 属性与基线逐字一致（没留残渣）', JSON.stringify(back.chatStyleAttr));
    for (const id of ['top-bar', 'top-settings-holder', 'form_sheld']) {
      check(open.chrome[id] && open.chrome[id].vis === 'hidden', `整页期间 #${id} 已隐藏`);
      check(JSON.stringify(back.chrome[id]) === JSON.stringify(base.chrome[id]),
        `关页后 #${id} 与基线一致`, JSON.stringify(back.chrome[id]));
    }
    check(back.pos !== 'fixed', '关页后楼层交还给酒馆（不再是 fixed）', back.pos);
    check(errors.length === 0, '无脚本错误', errors.slice(0, 3).join(' | '));
  } catch (error) {
    check(false, '流内嵌入次级页面用例', error.message.split('\n')[0]);
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
