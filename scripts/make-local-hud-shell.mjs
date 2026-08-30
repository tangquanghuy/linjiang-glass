/* 生成一份「HUD 指向本机」的测试壳层，用来在真机 / 模拟器上验 HUD 侧改动而不碰线上。
   ==================================================================
   为什么需要它
   ------------------------------------------------------------------
   这套东西是两半各自部署的：

     壳层  外部部署/V20260826/状态栏-*.html —— 你从磁盘复制粘贴，跟 git 和 Pages 无关，
           粘下去立刻生效。
     HUD   src/* 构建出的产物 —— 只能通过 GitHub Pages 到用户手上，而 Pages 只从 main 构建。

   于是想在真机上验 HUD 侧的改动（视觉性能档、贴图、设置页），要么合并到 main（等于对所有人
   上线），要么把 HUD_URL 指到本机。后者是唯一「能验真机、又完全不动线上」的办法。

   刻意指向 vite preview（生产构建）而不是 vite dev
   ------------------------------------------------------------------
   dev 服务器把每个模块单独发一遍，几百个请求 —— 在 1 核模拟器上首屏会比生产**更慢**，量出来
   的数字没有意义，还会让人误判"改了没用"。preview 提供的是真实的打包产物，和 Pages 上那份
   同构。

   用法：
     node scripts/make-local-hud-shell.mjs                 # 自动挑一个本机 IP
     node scripts/make-local-hud-shell.mjs --host=10.0.2.2 # Android AVD 里指向宿主回环
     node scripts/make-local-hud-shell.mjs --port=4173
*/
import { networkInterfaces } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './lib/real-tavern-sources.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = args.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const port = arg('port', '4173');

/* 自动挑 IP：跳过回环、link-local，以及 VMware/VirtualBox 那些虚拟网卡 —— 模拟器连不到
   宿主的虚拟网段时，人会以为是壳层坏了。挑不准就用 --host 显式给。 */
function guessHost() {
  const rows = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (/vmware|virtualbox|vethernet|hyper-v|loopback/i.test(name)) continue;
      rows.push({ name, address: addr.address });
    }
  }
  /* 无线/以太网优先。 */
  rows.sort((a, b) => (/wlan|wi-?fi|ethernet|以太网|无线/i.test(b.name) ? 1 : 0)
    - (/wlan|wi-?fi|ethernet|以太网|无线/i.test(a.name) ? 1 : 0));
  return rows[0] || null;
}

const explicit = arg('host', '');
const guess = explicit ? { name: '(命令行指定)', address: explicit } : guessHost();
if (!guess) {
  console.error('找不到可用的本机 IPv4 地址，请用 --host=<地址> 显式指定。');
  process.exit(1);
}
const hudUrl = `http://${guess.address}:${port}/`;

const SOURCE = join(PROJECT_ROOT, '外部部署', 'V20260826', '状态栏-测试版-流内嵌入.html');
const OUT_DIR = join(PROJECT_ROOT, 'artifacts', 'local-hud');
const OUT = join(OUT_DIR, '状态栏-本机HUD测试.html');

const source = readFileSync(SOURCE, 'utf8');
const pattern = /const\s+HUD_URL\s*=\s*(['"])[\s\S]*?\1\s*;/;
if (!pattern.test(source)) {
  console.error('产物里找不到 HUD_URL —— 壳层结构变了，请核对 scripts/build-status-shell.mjs。');
  process.exit(1);
}
const patched = source.replace(pattern, `const HUD_URL = ${JSON.stringify(hudUrl)};`);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, patched, 'utf8');

console.log(`已生成  ${OUT.slice(PROJECT_ROOT.length + 1)}`);
console.log(`HUD_URL ${hudUrl}   （网卡 ${guess.name}）`);
console.log('');
console.log('步骤：');
console.log('  1. npm run build');
console.log(`  2. npx vite preview --port ${port} --host      ← 必须带 --host，否则只听回环`);
console.log('  3. 把上面那个文件的内容整份粘进**测试角色卡**的「状态栏」，重开对话');
console.log('');
console.log('模拟器连不上时：');
console.log('  · Android AVD  用 --host=10.0.2.2（AVD 里 10.0.2.2 就是宿主的 127.0.0.1）');
console.log('  · MuMu/雷电等桥接模拟器  用宿主的局域网 IP（就是上面那个）');
console.log('  · 先在模拟器浏览器里直接打开 HUD_URL 确认能出画面，再去粘壳层');
console.log('  · Windows 防火墙可能拦 4173，第一次运行 vite preview 时要放行');
console.log('');
console.log('这份文件在 artifacts/ 下，已被 .gitignore 忽略 —— 它是本机专用，别粘到正式卡上。');
