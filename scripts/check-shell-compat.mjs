/* 旧粘贴壳层配当前 HUD 产物，还能不能用。
   ==================================================================
   为什么需要这支脚本
   ------------------------------------------------------------------
   这套东西有两半，更新节奏完全不同：

     HUD 产物（src/ → dist → GitHub Pages）   推一次 main，几秒后对**所有**玩家生效
     状态栏壳层（粘进角色卡）                 冻结在每个玩家安装的那一天

   两半是同一个 RPC 契约的两端。所以每次改 HUD 侧，都是在跟一群版本各异、且永远不会自己更新的
   壳层对话。已经吃过一次亏：建设费的扣款只在新壳层里，HUD 侧的价钱显示却随 Pages 上线了，
   旧壳层照样建节点就是不扣钱 —— 静默错账，不是报错。

   引导壳（外部部署/V20260826/状态栏-引导壳.html）从此以后能让壳层跟着线上走，但它救不了已有用户：
   那些人手里的自包含版还在原地。所以「当前 HUD 必须还能配得上旧壳层」这件事需要一条常设断言，
   而不是每次凭记忆检查。

   断言的是「地板」，不是「全部功能」
   ------------------------------------------------------------------
   旧壳层缺新功能是正常的、也是没办法的（CITY_BUILD_COST 只有 821800e 以后才有，
   data-tt-mobile-surface 只有 5799a34 以后才有）。拿新功能去要求旧壳层，只会得到一堆
   「合理的红」，最后没人看红灯。

   所以这里只断言六个版本都具备、且一旦 HUD 侧改坏协议就会立刻塌掉的东西：

     · 壳层把 HUD 抬成了 #linjiang-hud-live
     · HUD 与栏位对齐
     · MVU 快照真的落到了 HUD 上（这一条等于验通了 handshake + getSnapshot 的往返）
     · HUD 把构图建完了，而且只有一份
     · 没有脚本错误

   TT 的浮层准入契约只对声明过 data-tt-mobile-surface 的版本断言，按版本能力放行。

   灵敏度来自哪一条
   ------------------------------------------------------------------
   --selftest 实测（打断 HUD 侧的 handshake）：六条地板断言里只有「MVU 快照落到 HUD 上」会红，
   另外几条照绿。原因值得记住：抬升、对齐、建构图都是壳层和 HUD 各自单方面做的事，不经过 RPC；
   只有快照要跨那道 postMessage 往返。

   而它之所以测得准，是因为两边的数字不一样 —— 夹具的 MVU 给 ￥512,300，HUD 自带的静态样例是
   ￥286,450。协议一断，HUD 退回静态样例，断言看到 286,450 就红。所以别把这条断言改成「有钱数
   就算过」，那样它立刻就废了。

   用法：
     node scripts/check-shell-compat.mjs
     node scripts/check-shell-compat.mjs --only 5c04982
*/
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';
import { stubExternalRequests } from './lib/stub-external.mjs';

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const only = argValue('--only', '');
/* --selftest：故意把 HUD 侧的协议打断，确认这支脚本真的会红。
   ------------------------------------------------------------------
   一盏没有证明过灵敏度的绿灯比没有灯更糟 —— 它会让人以为兼容性被守住了。这个模式拦住
   /src/bridge.js，把 handshake 这个 action 名改掉，于是壳层收到一个它不认识的请求。
   期望：兼容地板里那几条（快照落地、构图建完）全部失败。

   跑法：node scripts/check-shell-compat.mjs --selftest --only 5c04982
   它的退出码是反的：断言全绿才算自检失败。 */
const selftest = argv.includes('--selftest');

/* 要测的壳层版本。
   ------------------------------------------------------------------
   挑选标准是「有多少玩家可能正卡在这一版」，不是「代码有多老」：

     workspace-boot     引导壳。从此以后新装的人走这条，壳层跟着线上走。
     workspace-inline   工作区生成的自包含版。今天照旧粘这一份的人。
     821800e            裁剪台那次发布。滚动性能修复 + 建设费扣款都在这一版进去。
     5c04982            上一次发布，也就是我们推裁剪台之前 origin/main 的样子 ——
                        大多数现存安装应该是这一版或更早。
     122539c            再往前几天。
     83dcb21            明显更老（83KB，商店那版之前），用来把兼容地板压到更低。

   加版本时只加「真的有人可能停在那里」的，别把这支脚本变成全史回归 —— 它每加一个版本就多跑
   两个浏览器实例。 */
const SHELLS = [
  { id: 'workspace-boot', rev: null, shell: 'boot', note: '引导壳（脚本从 http 取回）' },
  { id: 'workspace-inline', rev: null, shell: 'inline', note: '工作区自包含版' },
  { id: '821800e', rev: '821800e', shell: 'inline', note: '裁剪台 + 建设费那次发布' },
  { id: '5c04982', rev: '5c04982', shell: 'inline', note: '推裁剪台之前的 origin/main' },
  { id: '122539c', rev: '122539c', shell: 'inline', note: '再往前几天' },
  { id: '83dcb21', rev: '83dcb21', shell: 'inline', note: '商店那版之前（83KB）' },
];

const HOSTS = [
  { id: 'browser', host: '', w: 390, h: 844, dsf: 3 },
  { id: 'tauritavern', host: 'tauritavern', w: 390, h: 844, dsf: 3 },
];

const meta = stageRealSources();
const server = await startFixtureServer({ port: 5225 });
const browser = await chromium.launch();

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`    ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};

/* 取出某个版本的壳层源码，同时记下它有哪些能力 —— 断言要按能力放行，不能按版本号猜。 */
const shellSource = (rev) => {
  const body = execFileSync('git', ['show', `${rev}:外部部署/状态栏.html`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    body,
    hasTtSurface: /ttMobileSurface/.test(body),
    hasBuildCost: /CITY_BUILD_COST/.test(body),
    hasStage: /linjiang-hud-stage/.test(body),
  };
};

for (const spec of SHELLS) {
  if (only && !spec.id.includes(only)) continue;
  const source = spec.rev ? shellSource(spec.rev) : null;
  const caps = source || { hasTtSurface: true, hasBuildCost: true, hasStage: true };

  for (const target of HOSTS) {
    console.log(`\n=== 壳层 ${spec.id}  宿主 ${target.id}  ${target.w}x${target.h} ===`);
    console.log(`    ${spec.note}${source ? `（${source.body.length} 字节 · 裁剪台${source.hasStage ? '有' : '无'}`
      + ` · 建设费${source.hasBuildCost ? '有' : '无'} · TT契约${source.hasTtSurface ? '有' : '无'}）` : ''}`);

    const page = await browser.newPage({
      viewport: { width: target.w, height: target.h },
      deviceScaleFactor: target.dsf,
      isMobile: true,
      hasTouch: true,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const body = message.text();
      if (/favicon|jsdelivr|fontawesome|webfonts|\.woff|\.ttf|img\/|backgrounds\//i.test(body)) return;
      errors.push(body);
    });

    try {
      /* 先注册兜底替身，再注册版本顶替 —— Playwright 逆序匹配，后注册的先被问到。 */
      await stubExternalRequests(page);
      if (selftest) {
        /* HUD 在 vite dev server 下是逐模块伺服的，所以 /src/bridge.js 是个真实 URL。
           把它取回来改掉 action 名，壳层就会收到一个不认识的请求 —— 这正是「HUD 侧改坏协议」
           在现实中的样子。 */
        await page.route((url) => url.pathname.endsWith('/src/bridge.js'), async (route) => {
          const response = await route.fetch();
          const body = (await response.text()).replace(/'handshake'/g, "'handshake__selftest_broken'");
          await route.fulfill({ response, body });
        });
      }
      if (source) {
        /* 夹具请求的 URL 是百分号编码的中文，glob 匹配不上，必须用谓词。 */
        await page.route(
          (url) => decodeURIComponent(url.pathname).endsWith('状态栏.html'),
          (route) => route.fulfill({
            status: 200, contentType: 'text/html; charset=utf-8', body: source.body,
          }),
        );
      }

      const query = new URLSearchParams({
        chrome: '0', preset: 'phone-iphone', theme: 'Dark V 1.0',
        floors: '12', rendered: '2', shell: spec.shell,
      });
      if (target.host) query.set('host', target.host);
      await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
      await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady());
      await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted());
      await page.waitForTimeout(500);

      const m = await page.evaluate(() => window.__linjiangTavernLive.measure());

      /* ---- 兼容地板：六个版本都必须过 ---- */
      /* 当前工作区的壳层在**两个宿主**上都走原生流：TT 手机端已经并入（见壳层的
         MOBILE_NATIVE_FLOW）。以前这里给 TT 开了个 `&& target.host !== 'tauritavern'` 的
         例外，那是在描述"TT 还没迁移"这个事实，不是在描述应有的行为。
         旧版本壳层（spec.rev）当然仍旧抬升，那一支保持原样 —— 这支脚本的全部意义就是
         「旧粘贴壳层配新 HUD 还得能用」。 */
      const expectsNativeFlow = !spec.rev;
      check(expectsNativeFlow ? (m.nativeFlow && !m.lifted) : m.lifted,
        expectsNativeFlow ? 'workspace browser shell uses native srcdoc HUD' : 'shell lifts HUD as #linjiang-hud-live',
        `native=${m.nativeFlow} lifted=${m.lifted}`);
      check(Math.abs(m.alignment) <= 1, 'HUD 与栏位对齐', `${m.alignment}px`);
      check(m.hudMoney.includes('512,300'),
        'MVU 快照落到 HUD 上（等于验通 handshake + getSnapshot 往返）', m.hudMoney || '(空)');
      check(m.hudNodes > 150, 'HUD 构图已建完', `${m.hudNodes} 节点`);
      check(m.liveHudCount === 1, 'HUD 只有一份', String(m.liveHudCount));
      check(errors.length === 0, '无脚本错误', errors.slice(0, 2).join(' | '));

      /* ---- 按能力放行的部分 ---- */
      /* 浮层准入只对**抬升**架构有意义：那套契约管的是挂在酒馆 body 上的 fixed iframe。
         原生流根本不建那样的面，所以没有 data-tt-mobile-surface 可查，也没有豁免要申请
         —— 这正是原生流在 TT 上比抬升更省心的地方。 */
      if (target.host === 'tauritavern' && m.lifted) {
        if (caps.hasTtSurface) {
          check(m.ttSurface === 'none' && m.ttAdmitted === false && m.ttOriginalTop === '',
            'TT 浮层准入退出契约仍成立',
            `surface=${m.ttSurface} admitted=${m.ttAdmitted} originalTop=${m.ttOriginalTop || '(空)'}`);
        } else {
          console.log('    skip  TT 浮层准入退出契约  这一版壳层还没有 data-tt-mobile-surface');
        }
      }
      if (!caps.hasStage) {
        /* 旧壳层没有裁剪台是预期的。这里不判成失败，但要打出来 —— 它同时也是「这些用户还没拿到
           滚动性能修复」的提醒，而那件事只能靠他们重新粘贴解决。 */
        console.log('    note  这一版没有裁剪台，滚动仍是修复前的表现（需重新粘贴才能拿到）');
      }
    } catch (error) {
      check(false, '用例执行', error.message);
    }
    await page.close();
  }
}

await browser.close();
await server.close();

console.log(`\n真实源码：ST ${meta.versions.sillytavern} · 酒馆助手 ${meta.versions.tavernHelper} · TauriTavern ${meta.versions.tauritavern}`);

/* 自检模式的判定是反的：打断了协议还全绿，说明这支脚本量不出协议破损，它本身没用。 */
if (selftest) {
  console.log(`\n自检模式：故意打断了 HUD 侧的 handshake，收到 ${failures.length} 条失败。`);
  if (!failures.length) {
    console.log('自检失败 —— 协议已经被打断，断言却全绿。这支脚本对协议破损不敏感，不要相信它。');
    process.exit(1);
  }
  failures.slice(0, 8).forEach((f) => console.log(`  - ${f}`));
  console.log('自检通过：断言对协议破损是敏感的。');
  process.exit(0);
}

if (failures.length) {
  console.log('\n壳层兼容性失败 —— 当前 HUD 产物配不上某个线上仍在使用的壳层版本：');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('旧粘贴壳层配当前 HUD：全部通过');
