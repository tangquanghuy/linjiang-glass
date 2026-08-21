/* One-off: 把误写在 @media (max-width: 768px) 里的确认弹窗样式提到顶层，
   并给撞名的 @keyframes 改成唯一名字。 */

import { readFileSync, writeFileSync } from 'node:fs';

const CSS = 'phone/src/css/';
const read = (p) => readFileSync(p, 'utf8').replace(/\r?\n$/, '').split('\n');
const write = (p, lines) => writeFileSync(p, lines.map((l) => l.replace(/\r$/, '')).join('\r\n') + '\r\n', 'utf8');

/* ---- 1. 抽出确认弹窗块 ---- */
const r768 = read(CSS + 'responsive-768.css');
const HEAD = 170; // 1-based：/* ========== 自定义确认弹窗样式 ========== */
const TAIL = 329; // 1-based：.confirm-btn:active 块的最后一行
if (!r768[HEAD - 1].includes('自定义确认弹窗样式')) throw new Error(`第 ${HEAD} 行不是确认弹窗块开头：${r768[HEAD - 1]}`);
if (!r768[TAIL].includes('好友卡片')) throw new Error(`第 ${TAIL + 1} 行不是「好友卡片」：${r768[TAIL]}`);

const block = r768.slice(HEAD - 1, TAIL).map((l) => {
  const body = l.replace(/\r$/, '');
  const dedented = body.startsWith('    ') ? body.slice(4) : body;
  return dedented
    .replace(/\bfadeIn\b/g, 'confirmFadeIn')
    .replace(/\bslideUp\b/g, 'confirmSlideUp')
    .replace(/\biconPulse\b/g, 'confirmIconPulse');
});
/* 去掉块尾多余空行，文件自己会补一个换行 */
while (block.length && block[block.length - 1].trim() === '') block.pop();

write(CSS + 'confirm-dialog.css', [
  '/* ==================== 自定义确认弹窗 ==================== */',
  '/* 原本整块误写在 @media (max-width: 768px) 内，宽屏下不生效；已提到顶层。',
  '   动画名也从 fadeIn / slideUp / iconPulse 改成带前缀的名字，',
  '   避免覆盖 phone-container.css 与 phone-frame.css 里同名的开机动画。 */',
  '',
  ...block,
]);

/* ---- 2. 从 responsive-768.css 里删掉该块（连同它前面那个空行）---- */
write(CSS + 'responsive-768.css', [...r768.slice(0, HEAD - 2), ...r768.slice(TAIL)]);

/* ---- 3. 撞名的 pulse 各自改名 ---- */
const renameAll = (file, from, to) => {
  const lines = read(CSS + file);
  let hits = 0;
  const out = lines.map((l) => {
    const re = new RegExp(`\\b${from}\\b`, 'g');
    if (re.test(l)) hits++;
    return l.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  });
  if (hits < 2) throw new Error(`${file}: 期望至少 2 处 ${from}（定义+引用），实际 ${hits}`);
  write(CSS + file, out);
  console.log(`  ${file}: ${from} -> ${to}  (${hits} 处)`);
};
renameAll('status-bar.css', 'pulse', 'statusDotPulse');
renameAll('chat.css', 'pulse', 'chatTypingPulse');

/* ---- 4. 删掉日历里没人用、却会覆盖全局 slideUp 的死代码 ---- */
const cal = read('phone/src/25-calendar.js');
const at = cal.findIndex((l) => l.includes('@keyframes slideUp'));
if (at < 0) throw new Error('25-calendar.js 里找不到 @keyframes slideUp');
if (!cal[at + 3].trim().startsWith('}')) throw new Error(`slideUp 块不是 4 行：${cal[at + 3]}`);
cal.splice(at, 4);
write('phone/src/25-calendar.js', cal);
console.log('  25-calendar.js: 删除未使用的 @keyframes slideUp');

console.log('done');
