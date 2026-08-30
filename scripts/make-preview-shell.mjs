/* 生成一份 HUD 指向**测试镜像 Pages** 的壳层，用来在真机 / 模拟器上验证还没上线的改动。
   ==================================================================
   跟 make-local-hud-shell.mjs 的区别：那份指向你本机的 vite preview（要同网段、临时用），
   这份指向公网的镜像站（粘一次能一直用，手机在哪都行）。两者都完全不动生产环境。

   只对移动端有意义 —— 但也够了
   ------------------------------------------------------------------
   移动端走原生流：壳层用 fetch() 取 HUD 首页、DOMParser 解析、再按绝对地址加载入口 module。
   桌面走抬升架构：<iframe src=HUD_URL>。两条都能吃这个地址（镜像是真正的 Pages 站，
   content-type 正常），所以桌面也能用它验。

   用法：
     node scripts/make-preview-shell.mjs
     node scripts/make-preview-shell.mjs --url=https://example.github.io/xxx/
*/
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './lib/real-tavern-sources.mjs';
import { PREVIEW_PAGES } from './publish-hud-preview.mjs';

const args = process.argv.slice(2);
const url = (args.find((item) => item.startsWith('--url=')) || '').slice(6) || PREVIEW_PAGES;

/* 三份粘贴目标都生成：用户线上用哪一份，测试就该用同一份的对应版本，否则测的是另一个东西。
   引导壳不在列 —— 它的逻辑是从 jsDelivr 现取的，改不了 HUD_URL（那正是它的设计意图）。 */
const TARGETS = [
  { label: '流内嵌入（基准版）', file: '状态栏-测试版-流内嵌入.html' },
  { label: '自包含版', file: '状态栏.html' },
];

const OUT_DIR = join(PROJECT_ROOT, 'artifacts', 'preview');
mkdirSync(OUT_DIR, { recursive: true });

const pattern = /const\s+HUD_URL\s*=\s*(['"])[\s\S]*?\1\s*;/;
for (const target of TARGETS) {
  const from = join(PROJECT_ROOT, '外部部署', 'V20260826', target.file);
  const source = readFileSync(from, 'utf8');
  if (!pattern.test(source)) {
    console.error(`${target.file} 里找不到 HUD_URL —— 壳层结构变了，核对 scripts/build-status-shell.mjs`);
    process.exit(1);
  }
  const out = join(OUT_DIR, target.file.replace('.html', '-预览.html'));
  writeFileSync(out, source.replace(pattern, `const HUD_URL = ${JSON.stringify(url)};`), 'utf8');
  const version = source.match(/const\s+SHELL_VERSION\s*=\s*'([^']+)'/)?.[1] || '(未知)';
  console.log(`${target.label.padEnd(18)} → ${out.slice(PROJECT_ROOT.length + 1)}   壳层 ${version}`);
}

console.log('');
console.log(`HUD_URL：${url}`);
console.log('');
console.log('用法：把 artifacts/preview/ 下对应那份的**全文**粘进「测试角色卡」的状态栏，重开对话。');
console.log('确认跑对了：全局设置拉到底那行小字 —— HUD 构建号 / 壳层版本 / 原生流|抬升。');
console.log('           移动端应该显示「原生流」；显示「抬升」说明架构判定没命中。');
console.log('');
console.log('注意 artifacts/ 在 .gitignore 里，这些是本机产物，别粘到正式卡上。');
