/* 从 外部部署/V20260826/正文美化.html 生成「外链素材版」。
   ==================================================================
   为什么要这一版
   ------------------------------------------------------------------
   正文美化的部署方式是 SillyTavern 的正则把 AI 正文捕获成 $1 塞进这份 581KB 模板，酒馆助手
   再把整块渲染成一个 srcdoc iframe —— 也就是**每条 AI 消息一个独立副本**。581KB 里有约
   204KB 是 5 张内联 base64 WebP，而这 5 张里任何时刻只用得到 2 张（1 个页眉横幅 + 1 个开篇
   纹样，其余是主题变体）：

     :root --reading-banner-art                        白昼横幅   38KB
     .reading-opening-mark.bird-opening-ornament       默认纹样   42KB
     body[data-theme="dark"] .bird-opening-ornament    黑夜纹样   43KB
     body[data-theme="green"] .bird-opening-ornament   茶色纹样   43KB
     body[data-theme="dark"] .reading-header-banner    黑夜横幅   33KB

   内联的代价是每个文档都要重新解析这 204KB 文本、并解码全部 5 张位图。挪成外链之后
   HTTP 缓存按顶层站点分区，所有楼层共享一份，解码也能复用。

   为什么默认托管在 jsDelivr 的 testingcf 端点
   ------------------------------------------------------------------
   三条独立的理由：

   1. 墙。cdn.jsdelivr.net 从 2022 年起在国内被墙，testingcf.jsdelivr.net 没有。
      酒馆助手自己在每个渲染 iframe 里注入的就是 testingcf.jsdelivr.net 上的脚本
      （见它的 src/iframe/third_party_message.html），所以这个域名本来就是环境已有依赖，
      不新增故障域。
   2. 缓存头。实测同一个文件：
        testingcf.jsdelivr.net  cache-control: public, max-age=604800, s-maxage=43200
        <用户>.github.io        cache-control: max-age=600
      GitHub Pages 只给 10 分钟浏览器缓存 —— 对一个被 N 个楼层 iframe 同时引用的素材来说，
      等于每 10 分钟全部重新验证一遍。jsDelivr 给 7 天。
   3. 速度。同一个 2MB 文件，jsDelivr 2.5 秒，Pages 163 秒（在一台不在墙内的机器上测的，
      墙内只会更糟）。单次样本，但和第 2 条方向一致。

   两个源都带 Access-Control-Allow-Origin: *，所以 外部部署/V20260826/素材缓存脚本.js 都能把它们收进
   IndexedDB —— 第一次加载之后就完全不走网络，这一点比 CDN 之间差几十毫秒重要得多。

   文件名带内容哈希，因为 jsDelivr 对分支引用（@main）有 12 小时的边缘缓存：换了图就是换了
   URL，不存在拿到旧图的可能，也不用去 purge。

   想换源：
     node scripts/build-reading-external.mjs --target pages
     node scripts/build-reading-external.mjs --base https://自己的域名/路径/

   第二步：369KB CSS 也外链
   ------------------------------------------------------------------
   head 里有 22 个连续的 <style>（行 48–5906，中间只隔空白，后面到 </head> 没有别的东西），
   合计 369KB。把它们按原顺序拼成一个 .css 换成一个 <link>，srcdoc 就从 382KB 掉到 13KB。

   动手前查过四件必须成立的事：
     · 没有任何 JS 按 id 摸这些 <style> 元素（19 个 id 全查过，两处疑似命中分别是
       CSS 变量 --reading-banner-art 和一句注释）；
     · CSS 里所有 url() 都是那 5 张图，第一步之后已经是绝对 URL —— 外链样式表里相对 URL
       会按样式表自己的地址解析，只要没有相对 URL 就不会变含义；
     · 没有 @import；
     · 运行时注入的 3 个 <style>（自定义角色配色、animationPauseStyle）都是 JS 建完追加到
       head 末尾的，仍然排在外链样式表之后，层叠顺序不变。

   代价，必须知道：外链样式表是**渲染阻塞**的。CDN 慢的时候阅读器会白得更久；彻底取不到时
   浏览器会放弃等待并以无样式状态渲染（正文还读得到，但很丑）。内联 CSS 永远不会有这个问题。
   素材缓存脚本也帮不上忙 —— 它拦的是 JS 走 LinjiangAssets.url() 的图片，不是 <link>。
   所以这一版靠的是 jsDelivr 那 7 天的浏览器缓存：第一次之后就不再走网络。

   为什么是生成而不是手抄一份
   ------------------------------------------------------------------
   两份 9700 行的副本并行维护，任何后续改动都要改两遍，迟早漂。这里跟 phone/build.mjs 和
   scripts/build-cg-page.mjs 一样：源只有一份，第二份是产物，--check 保证它没过期。

   用法：
     node scripts/build-reading-external.mjs                 # 生成（默认 jsdelivr）
     node scripts/build-reading-external.mjs --check          # 只校验产物是否与源同步
     node scripts/build-reading-external.mjs --target pages
     node scripts/build-reading-external.mjs --base <前缀>
*/
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT, '外部部署', 'V20260826', '正文美化.html');
const OUTPUT = join(ROOT, '外部部署', 'V20260826', '正文美化-外链素材版.html');
/* 素材放 public/reading/：vite 把 publicDir 整个拷到 dist 根（Pages 上就是 /reading/），
   而 jsDelivr 的 /gh/ 是直接读仓库路径，所以那边要带 public/ 前缀。两个源的路径形状不同，
   下面的 TARGETS 各写一份，不要试图用一个变量拼。 */
const ASSET_DIR = join(ROOT, 'public', 'reading');

const TARGETS = {
  jsdelivr: {
    label: 'jsDelivr testingcf（国内可用，7 天浏览器缓存）',
    prefix: 'https://testingcf.jsdelivr.net/gh/tangquanghuy/linjiang-glass@main/public/reading/',
  },
  pages: {
    label: 'GitHub Pages（只有 10 分钟浏览器缓存，作为备选）',
    prefix: 'https://tangquanghuy.github.io/linjiang-glass/reading/',
  },
};

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const targetName = arg('--target') || 'jsdelivr';
if (!TARGETS[targetName]) {
  console.error(`未知的 --target ${targetName}，可选：${Object.keys(TARGETS).join(' / ')}`);
  process.exit(1);
}
const customBase = arg('--base');
const BASE = (customBase || TARGETS[targetName].prefix).replace(/\/+$/, '') + '/';
const BASE_LABEL = customBase ? '自定义前缀' : TARGETS[targetName].label;

/* 每张图的身份由它所在的 CSS 上下文决定，而不是出现顺序 —— 顺序会随编辑漂移，上下文不会。
   对不上就抛错，绝不猜。 */
const EXPECTED = [
  { name: 'banner-day', selector: ':root', property: '--reading-banner-art', label: '白昼页眉横幅' },
  { name: 'ornament-day', selector: '.reading-opening-mark.bird-opening-ornament', property: 'background-image', label: '默认开篇纹样' },
  { name: 'ornament-dark', selector: 'body[data-theme="dark"] .bird-opening-ornament', property: 'background-image', label: '黑夜开篇纹样' },
  { name: 'ornament-tea', selector: 'body[data-theme="green"] .bird-opening-ornament', property: 'background-image', label: '茶色开篇纹样' },
  { name: 'banner-dark', selector: 'body[data-theme="dark"] .reading-header-banner', property: 'background-image', label: '黑夜页眉横幅' },
];

const source = readFileSync(SOURCE, 'utf8');

/* 直播间消费动作只生成酒馆消息；卡片不先写 MVU。
   这条由源和外链产物共用，防止以后又把 roomAction 接回确认按钮。 */
const directConsumptionCalls = [
  "lrDoAction(state, '礼物'",
  "lrDoAction(state, '大航海'",
  "lrDoAction(state, '醒目留言'",
];
const directHit = directConsumptionCalls.find((marker) => source.includes(marker));
if (directHit) throw new Error(`直播间消费又开始直接写 MVU：${directHit}`);
for (const marker of ['送出${count}个${name}', '开通${state.host}的${pending.name}', '发送价值${pending.amount}的SC']) {
  if (!source.includes(marker)) throw new Error(`直播间缺少酒馆消息路径：${marker}`);
}

/* 找出所有 data URI，并把它所在的选择器/属性一起带出来。 */
const DATA_URI = /url\("data:image\/(?<type>[a-z]+);base64,(?<payload>[A-Za-z0-9+/=]+)"\)/g;
const found = [];
for (const match of source.matchAll(DATA_URI)) {
  const before = source.slice(Math.max(0, match.index - 600), match.index);
  const lines = before.split('\n').reverse();
  const selector = (lines.find((line) => line.trim().endsWith('{')) || '').trim().replace(/\s*\{$/, '');
  const property = (lines.find((line) => /^[\s]*[-a-z]+\s*:/.test(line) && !line.trim().endsWith('{')) || '')
    .trim().split(':')[0].trim();
  found.push({
    full: match[0],
    type: match.groups.type,
    payload: match.groups.payload,
    index: match.index,
    selector,
    property,
    line: before.split('\n').length,
  });
}

const problems = [];
if (found.length !== EXPECTED.length) {
  problems.push(`内联图片数量变了：期望 ${EXPECTED.length} 张，实际 ${found.length} 张。`
    + '请先核对 EXPECTED 表再重新生成。');
}
found.forEach((item, i) => {
  const want = EXPECTED[i];
  if (!want) return;
  if (item.type !== 'webp') problems.push(`#${i + 1} 不是 webp，而是 ${item.type}`);
  if (item.selector !== want.selector) {
    problems.push(`#${i + 1}（${want.label}）选择器对不上：期望 \`${want.selector}\`，实际 \`${item.selector}\`（第 ${item.line} 行）`);
  }
  if (item.property !== want.property) {
    problems.push(`#${i + 1}（${want.label}）属性对不上：期望 \`${want.property}\`，实际 \`${item.property}\``);
  }
});
if (problems.length) {
  console.error('源文件里的内联图片和预期不一致，已停止：');
  problems.forEach((line) => console.error(`  - ${line}`));
  process.exit(1);
}

/* 逐个替换。用函数替换器：替换文本里的 $1 会被当成捕获组引用，而这个模板里恰好有一个真的
   $1（正则的正文占位符），不能让它被牵连。 */
const assets = [];
let output = '';
let cursor = 0;
found.forEach((item, i) => {
  const want = EXPECTED[i];
  const bytes = Buffer.from(item.payload, 'base64');
  /* 内容哈希进文件名：jsDelivr 对 @main 有 12 小时边缘缓存，换了图就换 URL，
     不存在拿到旧图，也不用 purge。 */
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  const file = `${want.name}.${hash}.webp`;
  assets.push({ ...want, file, bytes, base64Length: item.payload.length });
  output += source.slice(cursor, item.index);
  output += `url("${BASE}${file}")`;
  cursor = item.index + item.full.length;
});
output += source.slice(cursor);

/* ---------------------------------------------------------------- CSS 外链 */

/* 必须在图片替换之后做：这样抽出去的 CSS 里那 5 个 url() 已经是绝对 URL，
   外链样式表按自己的地址解析相对路径这件事就不会咬人。 */
const styleBlocks = [...output.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
const headEnd = output.indexOf('</head>');
const cssProblems = [];
if (styleBlocks.length !== 22) {
  cssProblems.push(`<style> 块数变了：期望 22 块，实际 ${styleBlocks.length} 块`);
}
const inHead = styleBlocks.filter((block) => block.index < headEnd);
if (inHead.length !== styleBlocks.length) {
  cssProblems.push(`有 ${styleBlocks.length - inHead.length} 块 <style> 跑到 </head> 外面了`);
}
/* 连续性：块之间只许有空白。中间要是插进了别的元素，整段替换会把它吞掉。 */
for (let i = 0; i < styleBlocks.length - 1; i += 1) {
  const gapStart = styleBlocks[i].index + styleBlocks[i][0].length;
  const gap = output.slice(gapStart, styleBlocks[i + 1].index);
  if (gap.trim()) {
    cssProblems.push(`第 ${i + 1} 与 ${i + 2} 块 <style> 之间夹了内容：${JSON.stringify(gap.trim().slice(0, 80))}`);
  }
}
if (styleBlocks.length) {
  const tail = output.slice(styleBlocks.at(-1).index + styleBlocks.at(-1)[0].length, headEnd);
  if (tail.trim()) cssProblems.push(`最后一块 <style> 与 </head> 之间夹了内容：${JSON.stringify(tail.trim().slice(0, 80))}`);
}
/* 外链样式表里不能有相对 URL。 */
const cssBodyProbe = styleBlocks.map((block) => block[2]).join('\n');
for (const match of cssBodyProbe.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)) {
  const url = match[2].trim();
  if (!/^(https?:|data:|#)/.test(url)) cssProblems.push(`CSS 里有相对 URL，外链后会解析到 CDN 上：${url}`);
}
if (cssBodyProbe.includes('@import')) cssProblems.push('CSS 里有 @import，外链后相对路径会变');

if (cssProblems.length) {
  console.error('CSS 外链的前提不成立，已停止（源文件结构变了）：');
  cssProblems.forEach((line) => console.error(`  - ${line}`));
  process.exit(1);
}

/* 拼接：保留每块原来的 id 作为注释，出问题时还能对回源文件。 */
const cssText = styleBlocks.map((block, i) => {
  const id = (block[1].match(/id="([^"]+)"/) || [])[1] || '(无 id)';
  return `/* ===== 第 ${i + 1}/${styleBlocks.length} 块，源自 <style ${id}> ===== */\n${block[2].trim()}\n`;
}).join('\n');
const cssBytes = Buffer.from(cssText, 'utf8');
const cssHash = createHash('sha256').update(cssBytes).digest('hex').slice(0, 8);
const cssFile = `reading.${cssHash}.css`;

const spanStart = styleBlocks[0].index;
const spanEnd = styleBlocks.at(-1).index + styleBlocks.at(-1)[0].length;
const indent = (output.slice(0, spanStart).match(/([ \t]*)$/) || ['', ''])[1];
const cdnOrigin = (() => {
  try { return new URL(BASE).origin; } catch { return null; }
})();
const linkBlock = [
  cdnOrigin ? `${indent}<link rel="preconnect" href="${cdnOrigin}" crossorigin>` : null,
  `${indent}<!-- 这里原本是 22 个内联 <style>（共 ${(cssBytes.length / 1024).toFixed(0)}KB）。`,
  `${indent}     每条 AI 消息都是一个独立 iframe，内联就等于每层重新解析一遍，所以抽成外链。`,
  `${indent}     注意它是渲染阻塞的：取不到时浏览器会以无样式状态渲染正文。 -->`,
  `${indent}<link rel="stylesheet" href="${BASE}${cssFile}">`,
].filter(Boolean).join('\n');

output = output.slice(0, spanStart) + linkBlock + output.slice(spanEnd);
assets.push({ name: 'reading-css', file: cssFile, bytes: cssBytes, base64Length: 0, label: `合并后的样式表（22 块）` });

/* 在头部留一条说明，避免有人误以为这份是手写的源。 */
const banner = `<!-- 本文件由 scripts/build-reading-external.mjs 从 外部部署/V20260826/正文美化.html 生成，请勿直接编辑。
     与源的差异只有两处：
       1. 5 张内联 base64 WebP 改成了外链；
       2. head 里 22 个内联 <style>（共 ${(cssBytes.length / 1024).toFixed(0)}KB）合并成一个外链样式表。
     素材前缀：${BASE}
     改动请改源文件再重新生成；npm run reading:check 会校验这份有没有过期。 -->`;
const withBanner = output.replace(/^(```(?:text|html)?\r?\n)?/, (fence) => `${fence || ''}${banner}\n`);

const sizeKB = (n) => (n / 1024).toFixed(1);

if (CHECK) {
  const failures = [];
  if (!existsSync(OUTPUT)) failures.push(`产物不存在：${OUTPUT}`);
  else if (readFileSync(OUTPUT, 'utf8') !== withBanner) {
    failures.push('产物与源不同步，请重新运行 npm run reading:build');
  }
  for (const asset of assets) {
    const path = join(ASSET_DIR, asset.file);
    if (!existsSync(path)) failures.push(`素材缺失：public/reading/${asset.file}`);
    else if (!readFileSync(path).equals(asset.bytes)) {
      failures.push(`素材与源内联的字节不一致：public/reading/${asset.file}`);
    }
  }
  /* 换过图之后旧哈希的文件会留在目录里，会被一起部署，属于无声的垃圾。 */
  const expectedFiles = new Set(assets.map((asset) => asset.file));
  if (existsSync(ASSET_DIR)) {
    for (const name of readdirSync(ASSET_DIR)) {
      if (!expectedFiles.has(name)) failures.push(`public/reading/${name} 是过期素材，重新生成会清掉`);
    }
  }
  if (failures.length) {
    console.error('正文美化外链版校验失败：');
    failures.forEach((line) => console.error(`  - ${line}`));
    process.exit(1);
  }
  console.log(`正文美化外链版与源同步（${assets.length} 张素材，前缀 ${BASE}）`);
  process.exit(0);
}

/* 整个目录重建，避免旧哈希的文件残留并被部署。 */
rmSync(ASSET_DIR, { recursive: true, force: true });
mkdirSync(ASSET_DIR, { recursive: true });
for (const asset of assets) writeFileSync(join(ASSET_DIR, asset.file), asset.bytes);
writeFileSync(OUTPUT, withBanner);

const inlinedBytes = assets.reduce((total, asset) => total + asset.base64Length, 0);
const sourceBytes = Buffer.byteLength(source);
const outBytes = Buffer.byteLength(withBanner);
console.log(`源     外部部署/V20260826/正文美化.html            ${sizeKB(sourceBytes)} KB`);
console.log(`产物   外部部署/V20260826/正文美化-外链素材版.html   ${sizeKB(outBytes)} KB`);
console.log(`省下   ${sizeKB(sourceBytes - outBytes)} KB —— 其中 base64 图片 ${sizeKB(inlinedBytes)} KB，`
  + `样式表 ${sizeKB(cssBytes.length)} KB`);
console.log(`       这是**每条 AI 消息**都要省一次的量（每条消息一个独立 iframe）\n`);
console.log(`托管   ${BASE_LABEL}`);
console.log(`前缀   ${BASE}`);
console.log('素材   public/reading/  （vite 把 public/ 拷到 dist 根；jsDelivr 直接读仓库路径）');
for (const asset of assets) {
  console.log(`  ${asset.file.padEnd(30)} ${String(sizeKB(asset.bytes.length)).padStart(6)} KB  ${asset.label}`);
}
console.log('\n⚠ 外链样式表是渲染阻塞的：CDN 慢的时候阅读器白得更久，彻底取不到时浏览器会以无样式'
  + '\n  状态渲染（正文仍可读）。内联版没有这个问题 —— 两份并行的意义就在这里。');
console.log('\n生效前提：public/reading/ 里这几个文件必须先推到 GitHub 的 main 分支，'
  + '\n          jsDelivr 的 /gh/…@main/ 才取得到。');

/* 顺手体检：除了这 5 张，正文里还引用了哪些外部资源。以前这里有三个指向
   assets/bird-pen-emblem-*.png 的死链（.header-bird-ornament 那个类从来没有对应元素），
   已经连同整个类删掉了。留这段检查是为了下次再冒出死链时能立刻看见。 */
const remaining = [...new Set(
  [...source.matchAll(/url\("(?!data:)([^"]+)"\)/g)].map((match) => match[1]),
)];
if (remaining.length) {
  console.log('\n正文里其余的外部资源引用（自查用）：');
  for (const url of remaining) {
    const relative = !/^https?:\/\//.test(url);
    console.log(`  ${relative ? '⚠ 相对路径' : '  外链    '} ${url}`);
  }
  if (remaining.some((url) => !/^https?:\/\//.test(url))) {
    console.log('  ⚠ 相对路径在 srcdoc iframe 里会按酒馆源解析，除非酒馆那边真有这个文件，否则是死链。');
  }
}
