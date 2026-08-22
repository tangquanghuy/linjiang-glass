/* 把小手机里的「CG收集」三个分片原样搬到独立页面 cg/ 下面。
   ------------------------------------------------------------------
   CG 鉴赏从小手机里拆出来单开一页，但那三片代码没有跟着分叉：这里把 phone/src/ 的
   原文拼成 cg/cg-app.js，一个字符都不改。手抄一份的话两边一定会漂 —— 改了小手机忘了
   CG 页，或者反过来，而且漂的表现是「某个角色的场景数不一样」这种没人会立刻发现的事。

   外壳（jQuery、返回栈、全屏看图、好感度来源）在 cg/cg-shell.js，那才是这次真正新写的
   代码；cg-app.js 是产物，不要直接改，改 phone/src/ 再重新构建。

   用法：
     node scripts/build-cg-page.mjs           构建，写出 cg/cg-app.js
     node scripts/build-cg-page.mjs --check   只校验产物是否与 phone/src/ 同步
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARTS = [
  'phone/src/18-cg-data.js',
  'phone/src/19-cg-gallery.js',
  'phone/src/29-cg-fullscreen.js',
];
const OUT = join(ROOT, 'cg/cg-app.js');

const header = `/* 产物，不要改这个文件。
   由 scripts/build-cg-page.mjs 从下面这些分片原样拼接而成：
${PARTS.map((part) => `     ${part}`).join('\n')}
   要改 CG 的逻辑或样式就改 phone/src/ 里对应的分片，然后 npm run cg:build。
   外壳（jQuery / 返回栈 / 全屏看图 / 好感度）在 cg/cg-shell.js，那个是手写的。 */
`;

const body = PARTS.map((part) => {
  const source = readFileSync(join(ROOT, part), 'utf8');
  return `/* ------------------------------------------------------ ${part} */\n${source}`;
}).join('\n');

const output = `${header}\n${body}`;
const check = process.argv.includes('--check');

if (check) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { current = ''; }
  if (current !== output) {
    console.error('[cg/build] cg/cg-app.js 与 phone/src/ 不同步，请跑 npm run cg:build');
    process.exit(1);
  }
  console.log('[cg/build] 产物与 phone/src/ 一致');
} else {
  writeFileSync(OUT, output, 'utf8');
  const kb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(0);
  console.log(`[cg/build] cg/cg-app.js  ${PARTS.length} 个分片  ${kb} KB`);
}
