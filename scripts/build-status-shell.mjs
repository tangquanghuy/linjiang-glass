/* 从 public/shell/status-shell.js 生成状态栏的两份 HTML 包装。
   ==================================================================
   源只有一份（那个脚本），这里生成两个粘贴目标：

     外部部署/状态栏-引导壳.html   只有一句 <script src>，把脚本从 GitHub Pages 取下来执行。
                                   粘一次就不用再动，以后改逻辑只推仓库，十分钟内所有人生效。
     外部部署/状态栏.html          自包含版，把脚本内联回去。给已经装了旧版、暂时不想换成
                                   引导壳的用户继续粘。

   为什么两份都要生成，而不是手抄
   ------------------------------------------------------------------
   这两份的骨架（那段 <style>、#hud、#hint）必须逐字一致 —— 它们是同一个壳层的两种投递方式，
   骨架一漂，两条路径的首帧表现就不一样，而回归只会跑其中一条。所以骨架住在这个文件里，
   两份产物都由它拼出来，谁也不许手改。--check 在产物与源不同步时报错。

   同 scripts/build-reading-external.mjs 的路子：源一份、产物若干、check 防过期。

   用法：
     node scripts/build-status-shell.mjs            # 生成两份
     node scripts/build-status-shell.mjs --check    # 只校验，不写盘（CI / 提交前用）
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHELL_JS = join(ROOT, 'public', 'shell', 'status-shell.js');
const OUT_BOOT = join(ROOT, '外部部署', '状态栏-引导壳.html');
const OUT_INLINE = join(ROOT, '外部部署', '状态栏.html');
const OUT_FLOW = join(ROOT, '外部部署', '状态栏-测试版-流内嵌入.html');

/* 脚本的线上地址。
   ------------------------------------------------------------------
   用 jsDelivr（testingcf 那个主机名）而不是 GitHub Pages，理由是延迟，不是缓存。

   一开始选的是 Pages，理由是缓存时长：Pages 给 max-age=600，jsDelivr 的 @main 是 12 小时
   边缘缓存，看起来「改了要尽快让所有人拿到」应该选前者。那个判断是在没量延迟的情况下下的，
   而量完之后结论反了。

   同一个文件（city/plate_map.js，131KB，跟本脚本同量级）、交错发请求、cache: no-store：

     Pages               1767 / 1921 / 4445 / 4684 / 7489 / 5877 ms   中位 4684ms
     jsDelivr testingcf  1629 /  116 /  196 /  350 /  203 /  228 ms   中位  228ms

   快 20.5 倍。这个差别在这里是要命的：拆分之前壳层逻辑是内联的，页面一加载就执行（0ms）然后
   立刻开始取 HUD；拆分之后变成「先取壳层脚本，再执行，再取 HUD」，那一段是**纯新增的串行等待**，
   而且挡在 HUD 开始加载之前。走 Pages 等于拿「消除版本脱节」换「每次开场多等 4.7 秒」。

   为什么 HUD 自己不一起挪过来：HUD 是 vite 构建产物，在 dist/，被 gitignore，由 CI 构建后发到
   Pages。jsDelivr 的 /gh/ 直接读仓库里的文件，读不到 CI 产物。而本脚本是提交进仓库的源文件，
   所以它有得选。

   12 小时边缘缓存的代价用 purge 抵掉，而且是在 .github/workflows/pages.yml 里自动做的 ——
   不能做成手动步骤，「忘了 purge」会让用户拿到 12 小时前的壳层且毫无迹象。purge 接口实测约 1 秒
   返回 {"status":"finished","paths":1}。

   刻意不带 ?v= 版本串：带了就意味着每次发版都要所有人重新粘贴引导壳，那正是这次要消灭的
   东西。 */
const SHELL_URL = 'https://testingcf.jsdelivr.net/gh/tangquanghuy/linjiang-glass@main/public/shell/status-shell.js';

/* 两份产物共用的骨架。留两个槽：头部说明、脚本块。
   这里的 <style> 是唯一一份 —— 它必须在首帧生效（搬进脚本会先白闪一下再变黑），所以两条
   路径都得内联同样的这一段。 */
const skeleton = (headerComment, scriptBlock) => `\`\`\`text
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>临江 · 玻璃状态栏</title>
${headerComment}
<style>
  html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    background: #05040a;
    overflow: hidden;
  }
  #hud {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: #05040a;
  }
  #hint {
    display: none;
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 2;
    padding: 6px 10px;
    border-radius: 8px;
    background: rgba(8, 10, 18, 0.82);
    color: #e2e8f0;
    font: 12px/1.4 system-ui, sans-serif;
    pointer-events: none;
  }
  #hint.show { display: block; }
</style>
</head>
<body>
<iframe id="hud" title="玻璃状态栏" src="" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="clipboard-read; clipboard-write"></iframe>
<div id="hint"></div>
${scriptBlock}
</body>
</html>
\`\`\`
`;

const BOOT_HEADER = `<!-- 引导壳。粘进角色卡「状态栏」，粘一次就不用再动。
     ==================================================================
     本文件由 scripts/build-status-shell.mjs 生成，请勿直接编辑；要改逻辑请改
     public/shell/status-shell.js。

     这里没有任何逻辑，只有一句「把壳层脚本取下来执行」。全部 2700 行逻辑住在
     public/shell/status-shell.js，推一次 main 就对所有人生效（CI 会顺手 purge jsDelivr 缓存）。

     为什么要这样：壳层是粘贴部署的，HUD 产物是 Pages 自动部署的，两者是同一个 RPC 契约的
     两端，却有完全不同的更新节奏。以前把逻辑写在这里，等于把它冻结在每个玩家安装的那一天，
     而依赖它的另一半在他们脚下持续更新 —— 已经因此出过静默错账（建设费不扣钱）。完整的理由
     和取舍写在 public/shell/status-shell.js 的头部。

     下面这些留在这里是有原因的，不要往脚本里搬：
       · <style>   首帧就要生效。搬进脚本会先白闪一下再变黑。
       · #hud      壳层还没接管时的本地兜底 iframe（接管后 manager 会把它换成挂在酒馆文档上
                   的那一个，这里这份会被隐藏并移除）。
       · #hint     提示位。脚本取不到时，下面那段兜底要往它里面写话。 -->`;

const INLINE_HEADER = `<!-- 状态栏（自包含版）。粘进角色卡「状态栏」。
     ==================================================================
     本文件由 scripts/build-status-shell.mjs 从 public/shell/status-shell.js 生成，
     请勿直接编辑 —— 要改逻辑请改那个脚本，然后跑 npm run shell:build。

     这一版把壳层脚本整份内联进来，所以它跟当初那个手写的单文件壳层在行为上完全一样。
     它存在的唯一理由是向后兼容：已经装了旧版的用户可以继续粘这一份。

     但它有一个改不掉的毛病 —— 粘下去就冻结了。HUD 产物在 GitHub Pages 上持续更新，这份
     不会。两者是同一个 RPC 契约的两端，脱节的后果是静默错账（已经出过一次：建设费不扣钱）。
     新装请用 外部部署/状态栏-引导壳.html，那一份粘一次就永远跟着线上走。 -->`;

const BOOT_SCRIPT = `<!-- 壳层脚本。放在两个元素之后，所以脚本执行时它们一定已经在文档里了。

     刻意用同步的 <script src>（不加 async/defer）：这样它无论成功还是失败，都会在下面那段
     兜底之前有结果，不用自己写 onload/onerror 的状态机。 -->
<script src="${SHELL_URL}"></script>
<script>
  /* 兜底提示。上面那条是同步的，走到这里时它已经有结果了。
     壳层一执行就会在 <html> 上留 data-linjiang-shell，没有记号就只有一种可能：脚本没取到。
     （脚本取到了但自己判断不该干活的那几种情况，记号也是落下的 —— 见脚本里那两道守卫。）

     这里只提示，不留本地兜底副本：壳层唯一的用途是伺候 HUD，而 HUD 那 250KB 本来就从同一个
     Pages 加载。取不到脚本的时候 HUD 也起不来，在本地留个旧壳层救不了任何东西。 */
  if (!document.documentElement.dataset.linjiangShell) {
    var hint = document.getElementById('hint');
    if (hint) {
      hint.textContent = '状态栏脚本没取到，检查网络后重开对话';
      hint.className = 'show';
    }
    console.error('[临江状态栏] 引导壳取不到 shell/status-shell.js');
  }
</script>`;

const shellJs = readFileSync(SHELL_JS, 'utf8');

/* 内联安全检查。脚本里只要出现 </script，HTML 解析器就会在那里提前闭合 <script> 元素，
   后面的代码变成页面文本 —— 而且是静默的，页面照样显示，只是壳层没跑。宁可在这里炸。 */
if (/<\/script/i.test(shellJs)) {
  throw new Error('status-shell.js 里出现了 </script，内联会提前闭合脚本标签。请改写那处字面量。');
}

/* 脚本体去掉末尾换行再内联：skeleton 里 ${scriptBlock} 后面已经有一个换行了，不去掉会多出一行，
   让 --check 在无意义的空白上失败。 */
const inlineBody = shellJs.replace(/\n+$/, '');
const INLINE_SCRIPT = `<script>\n${inlineBody}\n</script>`;

/* 两份产物都用 CRLF：状态栏.html 一直是 CRLF，保持不变可以让这次改造的 diff 只落在真正变了
   的地方，而不是整文件换行符翻一遍。 */
const toCrlf = (text) => text.replace(/\r?\n/g, '\r\n');

/* 第三份：收回态换成酒馆原生嵌入的实验版。
   ------------------------------------------------------------------
   它跟自包含版是**同一份逻辑**，唯一差别是在加载壳层脚本之前把 __linjiangInlineDock 设成 true。
   壳层里那个开关只截收回态一条分支（见 status-shell.js 的 INLINE_DOCK 与 layoutInlineDock），
   展开、全屏、竖屏整页仍走原来的生产路径。

   所以它不是「另写一份小实现」—— 停靠方式切换、小手机、全部 13 个 action、竖屏整页都照旧工作，
   被替换的只有受测的那一件事。这也是它必须由本脚本生成而不是手写的原因：手写的那一版漏掉了
   停靠切换和整页处理，把实验做成了另一个东西。 */
const FLOW_HEADER = `<!-- 状态栏（实验版：收回态改用酒馆原生嵌入）。粘进角色卡「状态栏」。
     ==================================================================
     本文件由 scripts/build-status-shell.mjs 从 public/shell/status-shell.js 生成，请勿直接编辑。

     它和 外部部署/状态栏.html 是同一份逻辑，只多一行：加载壳层之前把 __linjiangInlineDock
     设成 true。于是壳层里那个开关生效，**只有收回态**改成真正的原生嵌入 ——
     HUD 直接挂在楼层文档里，position:static、宽 100%，滚动 / 裁剪 / 层叠 / 高度全交给酒馆。

     其余一切不变：全局设置里的「HUD 停靠方式」照旧切换，展开到页面、全屏、竖屏整页、小手机、
     全部 13 个 RPC action 都走原来的生产路径。

     用来在真机上回答「为什么不能干脆交给酒馆的默认嵌入」。已知必然要付的代价，也正是要观察的：
       · 每来一条 AI 消息，owner 交接要把 HUD 挪进新楼层的文档，而 iframe 换父节点必重载
         （实测：同文档换父 1→2 次加载、跨文档挪 2→3、挪回来 3→4；只改 CSS 不重载）。
         表现是闪一下、重新握手，**开着的面板会被关掉**。
       · 在「收回」和「展开到页面」之间切换同样是跨文档挪动，同样重载一次。
       · 收回态下这条栏只有阅读栏那么宽；生产的收回态会突破到 480px（竖屏）。

     想回去就把 状态栏-引导壳.html 或 状态栏.html 再粘回来。 -->`;

const FLOW_SCRIPT = `<script>
  /* 开关必须在壳层脚本之前落地：壳层是在自己顶部一次性读它的。 */
  window.__linjiangInlineDock = true;
</script>
<script>
${inlineBody}
</script>`;

const targets = [
  { path: OUT_BOOT, label: '引导壳', body: toCrlf(skeleton(BOOT_HEADER, BOOT_SCRIPT)) },
  { path: OUT_INLINE, label: '自包含版', body: toCrlf(skeleton(INLINE_HEADER, INLINE_SCRIPT)) },
  { path: OUT_FLOW, label: '流内嵌入实验版', body: toCrlf(skeleton(FLOW_HEADER, FLOW_SCRIPT)) },
];

const checkOnly = process.argv.includes('--check');
const stale = [];

for (const target of targets) {
  let current = null;
  try { current = readFileSync(target.path, 'utf8'); } catch { /* 还不存在 */ }
  const same = current !== null && Buffer.from(current, 'utf8').equals(Buffer.from(target.body, 'utf8'));
  const rel = target.path.slice(ROOT.length).replace(/\\/g, '/');
  if (same) {
    console.log(`  ok    ${target.label.padEnd(8)} ${rel}  ${Buffer.byteLength(target.body)} 字节`);
    continue;
  }
  if (checkOnly) {
    stale.push(`${target.label} ${rel}（${current === null ? '不存在' : '与源不同步'}）`);
    continue;
  }
  writeFileSync(target.path, target.body, 'utf8');
  console.log(`  写入  ${target.label.padEnd(8)} ${rel}  ${Buffer.byteLength(target.body)} 字节`);
}

if (stale.length) {
  console.error('\n状态栏包装已过期，跑 npm run shell:build 重新生成：');
  stale.forEach((row) => console.error(`  - ${row}`));
  process.exit(1);
}

console.log(`\n源：public/shell/status-shell.js（${shellJs.split('\n').length - 1} 行 / ${Buffer.byteLength(shellJs)} 字节）`);
console.log(`线上地址：${SHELL_URL}`);
