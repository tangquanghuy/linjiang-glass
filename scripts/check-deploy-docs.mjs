/* 外部部署/V20260826/README.md 的守门人。
   ==================================================================
   为什么值得有这一支：那份文档的全部作用是「让以后的人别再往粘贴脚本里加逻辑」。
   一份悄悄过期的文档做不到这件事 —— 它会先变得不可信，然后被跳过，然后规矩就没了。

   断言什么、不断言什么
   ------------------------------------------------------------------
   断言的是**会让文档变得有害的东西**：
     · 文档里的 npm 命令不存在（照着敲会报错，比没写更糟）
     · 文档里的仓库路径不存在（指向空气）
     · 外部部署/V20260826/ 里有文件没被清单提到（新加了粘贴脚本却没记下来，正是文档要防的失误）
     · 酒馆安装目录的路径没标成外部的（本仓库也有 src/，不标会被读成本仓库路径）
     · 配套设施没了（CI 的 purge 作业、stub-external、shell:compat 的自检）

   **不**断言精确体积。那种数字每改一次内容就变，会让这支检查天天红，
   而天天红的检查等于没有检查 —— 这条教训就写在那份文档的「已经掉过的坑」里。
   取而代之的是断言真正承重的设计性质：粘贴那几份必须保持「只有引导、没有逻辑」的规模。

   用法：node scripts/check-deploy-docs.mjs
*/
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DOC = '外部部署/V20260826/README.md';
const doc = readFileSync(DOC, 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};
const kb = (path) => Buffer.byteLength(readFileSync(path, 'utf8')) / 1024;

console.log('=== 文档引用的 npm 命令都存在 ===');
/* 字符类必须含连字符。第一版写的是 [\w:]+，于是 `npm run deploy:docs-typo` 被截成
   `deploy:docs`（真的存在），打错的命令名就这么漏过去了 —— 是给这支检查做注入自检时发现的。
   凡是带连字符的命令名写错都会漏。 */
for (const name of [...new Set([...doc.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]))]) {
  check(Object.hasOwn(pkg.scripts, name), `npm run ${name}`);
}

/* 酒馆安装目录里的文件不在本仓库。它们必须带着目录前缀出现，否则读者会当成本仓库路径 ——
   本仓库确实有 src/，`src/panel/script/iframe.ts` 看起来毫无破绽。 */
const EXTERNAL_PREFIXES = ['JS-Slash-Runner/', 'SillyTavern-release/'];
const EXTERNAL_BARE = ['log.js'];
console.log('\n=== 文档提到的仓库路径都存在 ===');
for (const path of [...new Set([...doc.matchAll(/`([\w\u4e00-\u9fa5./-]+\.(?:js|mjs|cjs|html|md|ts|yml|json))`/g)].map((m) => m[1]))]) {
  if (EXTERNAL_PREFIXES.some((p) => path.startsWith(p)) || EXTERNAL_BARE.includes(path)) continue;
  /* 不带斜杠的多半是正文里指代文件名，去几个常见目录里找。 */
  const candidates = path.includes('/')
    ? [path]
    : ['外部部署/V20260826', 'scripts', 'scripts/lib', 'public/shell', 'tools', '.'].map((d) => join(d, path));
  check(candidates.some(existsSync), path);
}

console.log('\n=== 酒馆安装目录的路径已标成外部 ===');
check(doc.includes('SillyTavern-release/src/server-main.js'), 'server-main.js 带 SillyTavern-release/ 前缀');
check(doc.includes('JS-Slash-Runner/src/panel/script/iframe.ts'), 'iframe.ts 带 JS-Slash-Runner/ 前缀');

console.log('\n=== 外部部署/V20260826/ 里每个文件都在清单里 ===');
for (const name of readdirSync('外部部署/V20260826')) {
  if (name === 'README.md') continue;
  check(doc.includes(name), `清单提到 ${name}`,
    doc.includes(name) ? '' : '（新加的粘贴脚本要记进 README 的清单表）');
}

/* 设计性质：粘贴那几份必须是「引导 + 必须同步可用的最小闭包」，不能重新长出逻辑。
   上限给得比现状宽一截，只拦「有人把几十 KB 逻辑塞回来」这种量级的回退。 */
console.log('\n=== 设计性质：粘贴那几份没有重新长出逻辑 ===');
const BOOT_LIMITS = [
  ['外部部署/V20260826/状态栏-引导壳.html', 12, '只该有 <style> + 两个元素 + 一句 <script src> + 兜底'],
  ['外部部署/V20260826/辅助计算脚本.js', 20, '只该有礼物表 + roomMenu + 占位 api + 一句 import()'],
];
for (const [path, limit, why] of BOOT_LIMITS) {
  const size = kb(path);
  check(size < limit, `${path} < ${limit} KB`, `实际 ${size.toFixed(1)} KB —— ${why}`);
}
/* 那 57.9KB 静态文本一旦被误碾进粘贴那份，拆分收益就归零，而且不会有任何报错。 */
check(!readFileSync('外部部署/V20260826/辅助计算脚本.js', 'utf8').includes('DEVELOPMENT_NOTES'),
  '引导版里没有 DEVELOPMENT_NOTES');
/* 反过来，礼物表**必须**在引导版里 —— 它是刻意的例外，理由见 README 的「什么东西必须留」。
   哪天有人「顺手清理」把它挪走，直播间卡片会静默画出空礼物栏。 */
check(readFileSync('外部部署/V20260826/辅助计算脚本.js', 'utf8').includes("name: '火箭'"),
  '引导版里有礼物表（刻意的例外，不要清理掉）');

console.log('\n=== 配套设施还在 ===');
const yml = readFileSync('.github/workflows/pages.yml', 'utf8');
check(yml.includes('purge-cdn:'), 'pages.yml 有 purge-cdn 作业');
for (const file of ['public/shell/status-shell.js', 'public/shell/aux-shell.js']) {
  check(yml.includes(file), `purge 清单包含 ${file}`);
}
check(existsSync('scripts/lib/stub-external.mjs'), 'scripts/lib/stub-external.mjs 在');
check(readFileSync('scripts/check-shell-compat.mjs', 'utf8').includes('--selftest'),
  'shell:compat 保留 --selftest（证明断言对协议破损敏感）');

if (failures.length) {
  console.log(`\n${DOC} 与代码不符：`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log(`\n${DOC}：与代码一致`);
