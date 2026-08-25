/* 从 public/shell/aux-shell.js 生成粘贴用的 外部部署/V20260826/辅助计算脚本.js（引导版）。
   ==================================================================
   跟状态栏那次拆分的区别
   ------------------------------------------------------------------
   状态栏是「整块搬走，粘贴那份只剩一句 <script src>」。辅助计算脚本不能这么干，因为它有一个
   **必须同步可用**的消费方：

     外部部署/V20260826/正文美化.html 的 mountLiveRoom() 在初始渲染路径里就用 lrMenu() 把礼物列表写进
     DOM。lrMenu() 取不到 LinjiangAux 时退到 LR_MENU_FALLBACK，而那里的 礼物/大航海 是**空数组**。
     所以只要脚本晚到一点，那张直播间卡片就永久显示没有礼物 —— 不崩、不报错，静默错。

   而且 lrAux() 是拿 roomAction 存在与否判定 api 可用的：

     return (api && api.roomAction) ? api : null;

   所以「只挂一个 roomMenu 的半份 api」会被整个拒掉，礼物列表照样是空的。

   于是切法是：粘贴那份留下**礼物栏画得出来所需的最小闭包**，其余全部搬到线上。

     留在粘贴那份（约 2KB）  ART_HOST / PAGES_HOST / GIFTS / GUARD_BUY / QTY_STEPS / SC_STEPS
                             / roomMenu，外加一个占位 roomAction（让 lrAux() 的门过得去）
     搬到线上（约 137KB）    其余全部，包括占 41% 的 DEVELOPMENT_NOTES（57.9KB —— 它只被
                             developmentNoteFor 用，而那是 MVU 写回路径，晚到无所谓）

   占位 roomAction 返回 { ok:false, 提示:'…还在加载…' }。lrDoAction 是完全同步的（直接读
   res.ok / res.快照），所以不能返回 Promise；而它已经为「写不成」设计了 toast 提示，所以这条路
   是走得通的、而且是可见的。真实逻辑落地后会把整个 LinjiangAux 换成完整 api。

   为什么表会在两个文件里各有一份
   ------------------------------------------------------------------
   线上那份自己也要 GIFTS（giftOf 算热度用）。表在两处出现，但两处都由本脚本从同一份源碾出，
   所以不会漂 —— --check 守着。代价是：如果哪天改了礼物表而用户没重新粘贴，礼物栏显示旧表、
   热度结算用新表。这个代价是明确接受的（礼物表基本不动），换来的是另外 137KB 逻辑从此自动更新。

   用法：
     node scripts/build-aux-shell.mjs            生成
     node scripts/build-aux-shell.mjs --check     只校验（CI / 提交前）
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT, 'public', 'shell', 'aux-shell.js');
const OUTPUT = join(ROOT, '外部部署', 'V20260826', '辅助计算脚本.js');

/* 线上地址。用 jsDelivr 而不是 Pages，理由（延迟差 20 倍的实测）写在
   scripts/build-status-shell.mjs 的 SHELL_URL 那一段，两处是同一个判断。 */
const AUX_URL = 'https://testingcf.jsdelivr.net/gh/tangquanghuy/linjiang-glass@main/public/shell/aux-shell.js';

const source = readFileSync(SOURCE, 'utf8');

/* ---------------------------------------------------------------- 碾出具名声明 */

const sourceLines = source.split('\n');
const lineIndexOfOffset = (offset) => source.slice(0, offset).split('\n').length - 1;

/* 往上取紧贴声明的注释，让搬过去的表带着它的说明。
   ------------------------------------------------------------------
   必须能正确处理多行 /* … *\/ 块。第一版的判据是「这一行看起来像注释」（以 /* 、* 、// 开头
   或以 *\/ 结尾），结果 ART_HOST 上面那个块的中间几行是缩进的中文续行、既不以 * 开头也不以
   *\/ 结尾，于是只取到了最后那一行 —— 生成物里留下一个孤立的 *\/，直接语法错误。
   现在的做法：先看紧邻那行是不是块注释的结尾，是就一路往上找到含 /* 的那行；否则按连续的
   // 行往上收。 */
function commentAbove(declLine) {
  let i = declLine - 1;
  while (i >= 0 && sourceLines[i].trim() === '') i -= 1;   // 跳过空行
  if (i < 0) return '';
  const t = sourceLines[i].trim();
  if (t.endsWith('*/')) {
    let start = i;
    while (start >= 0 && !sourceLines[start].includes('/*')) start -= 1;
    if (start < 0) return '';                              // 找不到开头，宁可不带注释
    return sourceLines.slice(start, i + 1).join('\n');
  }
  if (t.startsWith('//')) {
    let start = i;
    while (start - 1 >= 0 && sourceLines[start - 1].trim().startsWith('//')) start -= 1;
    return sourceLines.slice(start, i + 1).join('\n');
  }
  return '';
}

/* 按名字取出一个缩进 4 空格的一级声明。用花括号/方括号配平找结尾，而不是数行数 ——
   行号会随源码改动漂，配平不会。

   刻意**不数圆括号**：数了的话 `function roomMenu() {` 里的那对 () 会让配平在参数列表处
   就归零，声明被截成只剩函数签名（第一版就是这么错的）。函数体靠 {} 界定，数组靠 []，
   两者都不需要 () 参与。 */
function carve(name) {
  const re = new RegExp(`^ {4}(const|function)\\s+${name}\\b`, 'm');
  const m = re.exec(source);
  if (!m) throw new Error(`aux-shell.js 里找不到一级声明 ${name}`);
  const start = m.index;

  let i = start;
  let depth = 0;
  let seen = false;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{' || ch === '[') { depth += 1; seen = true; }
    else if (ch === '}' || ch === ']') depth -= 1;
    else if (ch === '\n' && !seen) break;          // 单行、无括号的声明（比如两个 HOST）
    if (seen && depth === 0) break;
  }
  const lineEnd = source.indexOf('\n', i);
  const body = source.slice(start, lineEnd < 0 ? source.length : lineEnd);
  const head = commentAbove(lineIndexOfOffset(start));
  return `${head ? `${head}\n` : ''}${body}`;
}

const CARVED = ['GIFTS', 'GUARD_BUY', 'QTY_STEPS', 'SC_STEPS', 'ART_HOST', 'PAGES_HOST', 'roomMenu'];
const carved = CARVED.map((name) => carve(name)).join('\n\n');

/* 碾出来的东西必须自成闭包 —— 它引用的每个标识符都得在这一小份里定义，否则粘贴那份一跑
   就是 ReferenceError，而那要等到真机才暴露。这里做一次粗检：把 carved 里出现的
   「大写常量」跟带过来的声明对一遍。

   必须先剥注释再扫。第一版没剥，被 roomMenu 上面那句「图标 URL 都从这里拿」里的 URL 误报成
   缺失常量 —— 注释里的自然语言会混进标识符扫描。 */
{
  const code = carved
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  /* 浏览器内置的大写全局，出现是正常的。 */
  const BUILTINS = new Set(['URL', 'JSON', 'NaN', 'Infinity', 'Math', 'Date', 'Object', 'Array', 'Number', 'String', 'Boolean', 'Promise', 'RegExp', 'Map', 'Set']);
  const defined = new Set(CARVED);
  const referenced = new Set();
  for (const m of code.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) referenced.add(m[1]);
  const missing = [...referenced].filter((n) => !defined.has(n) && !BUILTINS.has(n));
  if (missing.length) {
    throw new Error(`碾出来的片段引用了没带过来的大写常量：${missing.join(', ')}。`
      + '要么把它们加进 CARVED，要么它们其实不该被 roomMenu 用到。');
  }
}

/* ---------------------------------------------------------------- 拼粘贴那份 */

const stub = `/**
 * 管人痴 / 都市日系 SLG · 辅助计算脚本（引导版）
 *
 * 本文件由 scripts/build-aux-shell.mjs 从 public/shell/aux-shell.js 生成，请勿直接编辑。
 * 要改逻辑请改那份，然后 npm run aux:build。
 *
 * 挂在酒馆助手「脚本」里单独运行。酒馆助手把脚本内容包进 <script type="module">
 * （见 JS-Slash-Runner 的 src/panel/script/iframe.ts），所以这里可以直接用 import()。
 *
 * 这份文件里只有两样东西：
 *   一、礼物栏画得出来所需的最小闭包（表 + roomMenu），必须同步可用。
 *       正文美化的 mountLiveRoom() 在初始渲染就用 LinjiangAux.roomMenu() 把礼物列表写进 DOM，
 *       取不到就退到空表并且永久留空 —— 所以这部分不能等网络。
 *   二、把其余 137KB 逻辑从 CDN 取回来执行。那部分随仓库自动更新，不需要重新粘贴。
 *
 * 完整的取舍写在 scripts/build-aux-shell.mjs 的头部。
 */
(function () {
    'use strict';

    const BOOT_VERSION = '2026-08-25-aux-split-v1';

${carved.split('\n').map((l) => (l ? `${l}` : '')).join('\n')}

    /* 占位 api。只撑到真实逻辑落地为止。
       ------------------------------------------------------------------
       为什么必须带一个 roomAction：正文美化的 lrAux() 是这样判定 api 可用的 ——
         return (api && api.roomAction) ? api : null;
       少了它，整个 api 会被拒掉，礼物栏跟着退回空表，那就白留 roomMenu 了。

       为什么返回 { ok:false } 而不是 Promise：lrDoAction 是完全同步的，直接读 res.ok 和
       res.快照。返回 Promise 会被判成「操作没能完成」，而且提示还是错的。返回一个明确的
       ok:false 加一句人话，正好走它已经写好的 toast 那条路。 */
    const bootApi = {
        roomMenu,
        roomAction() {
            return { ok: false, 提示: '辅助计算脚本还在加载，稍等一下再试' };
        },
    };

    const root = typeof globalThis !== 'undefined' ? globalThis : {};
    const publish = (api) => {
        try {
            root.LinjiangAux = api;
            if (root.parent && root.parent !== root) root.parent.LinjiangAux = api;
        } catch (_) { /* 跨域时只写自己 */ }
    };
    /* 先把占位挂上去，再去取真身。顺序很重要：反过来的话网络往返期间 LinjiangAux 是空的，
       礼物栏就会画成空表 —— 那正是这份引导文件要解决的问题。
       刻意不设 __管人痴辅助计算_loaded__：那个标志的含义是「完整逻辑已就位」，
       封面.html 拿它当依赖探针。占位不算就位。 */
    publish(bootApi);

    import('${AUX_URL}')
        /* 真实逻辑自己会把完整 api 挂到 LinjiangAux 上（它末尾就干这件事），
           所以这里不用做什么，只在它没挂上时报一声。 */
        .then(() => {
            if (root.LinjiangAux === bootApi) {
                console.error('[辅助计算脚本] 逻辑已加载但没挂上 LinjiangAux，检查 aux-shell.js 末尾');
            }
        })
        .catch((err) => {
            console.error('[辅助计算脚本] 取不到线上逻辑，只有礼物栏可用', err);
            try {
                if (typeof toastr !== 'undefined') {
                    toastr.error('辅助计算脚本没取到，直播间与变量结算暂时不可用');
                }
            } catch (_) { /* 没有 toastr 就算了 */ }
        });

    console.log('[辅助计算脚本] 引导版已就位', BOOT_VERSION);
})();
`;

/* 生成物必须过语法检查，而且是在这里过，不是等粘到酒馆里才发现。
   ------------------------------------------------------------------
   这一步不是多余的谨慎：碾声明这件事已经错过两次，两次都产出语法错误的文件 ——
   一次是多行注释被截断留下孤立的 *\/，一次是圆括号配平把函数截成只剩签名。两次都能被
   这一行拦住。

   用 vm.Script 而不是 new Function：后者会把代码包一层函数，顶层的语法问题（比如孤立的
   *\/）有可能被换一种方式解释；vm.Script 按脚本原样解析。动态 import() 在脚本里是合法的，
   不会因为它报错。 */
{
  try {
    new Script(stub, { filename: 'aux-boot.generated.js' });
  } catch (error) {
    throw new Error(`生成的引导版有语法错误，碾声明那步出了问题：${error.message}`);
  }
  /* 再抽查几个「必须完整带过来」的证据。语法对不代表内容对：roomMenu 被截成只剩签名的那次，
     单看语法是过不了的，但万一某天截出来的东西恰好语法合法，这几条能兜住。 */
  const MUST_CONTAIN = [
    '礼物: GIFTS.map',          // roomMenu 的函数体真的在
    '数量档位: QTY_STEPS.slice',
    "name: '火箭'",             // GIFTS 的最后一项，证明表没被截断
    "name: '总督'",             // GUARD_BUY 的最后一项
  ];
  const missing = MUST_CONTAIN.filter((needle) => !stub.includes(needle));
  if (missing.length) {
    throw new Error(`生成的引导版缺内容，碾声明那步截断了：${missing.join(' / ')}`);
  }
  /* 反过来也要查：不该带过来的东西别混进来。DEVELOPMENT_NOTES 是 57.9KB 的静态文本，
     它一旦被误碾进粘贴那份，这次拆分的收益就没了，而且不会有任何报错。 */
  if (stub.includes('DEVELOPMENT_NOTES')) {
    throw new Error('DEVELOPMENT_NOTES 被碾进了引导版 —— 那是 57.9KB 静态文本，不该留在粘贴那份');
  }
}

/* 粘贴目标沿用 CRLF：原文件就是 CRLF 为主（虽然混着 47 处裸 LF），保持这个风味。 */
const body = stub.replace(/\r?\n/g, '\r\n');

const checkOnly = process.argv.includes('--check');
let current = null;
try { current = readFileSync(OUTPUT, 'utf8'); } catch { /* 还不存在 */ }
const same = current !== null && Buffer.from(current, 'utf8').equals(Buffer.from(body, 'utf8'));

if (same) {
  console.log(`  ok    引导版  外部部署/V20260826/辅助计算脚本.js  ${Buffer.byteLength(body)} 字节`);
} else if (checkOnly) {
  console.error('\n辅助计算脚本引导版已过期，跑 npm run aux:build 重新生成');
  process.exit(1);
} else {
  writeFileSync(OUTPUT, body, 'utf8');
  console.log(`  写入  引导版  外部部署/V20260826/辅助计算脚本.js  ${Buffer.byteLength(body)} 字节`);
}

console.log(`\n源：public/shell/aux-shell.js（${source.split('\n').length - 1} 行 / ${Buffer.byteLength(source)} 字节）`);
console.log(`碾进引导版的声明：${CARVED.join(' ')}`);
console.log(`体积对比：引导版 ${(Buffer.byteLength(body) / 1024).toFixed(1)} KB`
  + ` / 线上 ${(Buffer.byteLength(source) / 1024).toFixed(1)} KB`
  + `（粘贴那份只剩 ${(Buffer.byteLength(body) / Buffer.byteLength(source) * 100).toFixed(0)}%）`);
console.log(`线上地址：${AUX_URL}`);
