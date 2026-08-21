/* 把 phone/src/ 下的分片拼回酒馆用的单文件脚本 phone/小手机脚本.js
   ------------------------------------------------------------------
   为什么是「拼接」而不是打包成 ES 模块：
   这个脚本是贴进 SillyTavern 里运行的，所有函数/变量共享同一个顶层作用域，
   内联 onclick、window.xxx 暴露、以及跨区域互相调用都依赖这一点。
   纯文本拼接保证拆分前后语义完全一致（构建产物与拆分前的文件逐字节相同）。

   用法：
     node phone/build.mjs           构建，写出 phone/小手机脚本.js
     node phone/build.mjs --check   只校验产物是否与 src/ 同步（CI/提交前用），不写文件
*/

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, '小手机脚本.js');

/* 拼接顺序 = 运行顺序，改动前请确认没有把「定义」排到「调用」后面。
   顶层就地执行的分片（依赖前面已声明的 class/const）：
     13-message-sender  -> new MessageSender()
     23-forum-manager   -> new PhoneForumManager()
     31-global-exports  -> window.xxx = ...
     35-boot            -> $(() => ...) 启动 */
const PARTS = [
  '01-font-awesome.js',      // Font Awesome 按需加载
  '02-styles.js',            // 样式注入（CSS 实体在 src/css/，构建时内联）
  '03-state.js',             // 全局状态 + 角色头像配置
  '04-viewport.js',          // 视口/边界工具函数
  '05-runtime-state.js',     // 拖动、置顶、壁纸、聊天/论坛运行时状态
  '06-init.js',              // initializeMobilePhone：建 DOM
  '07-events.js',            // bindPhoneEvents：事件绑定
  '09-page-swipe.js',        // 主屏分页滑动
  '10-mvu-data.js',          // MVU 变量读取与事件监听
  '11-ui-update.js',         // 时间/数据 -> UI
  '12-phone-controls.js',    // 开关手机、置顶、拖动手机、App 面板开关
  '13-message-sender.js',    // MessageSender 类
  '14-chat-panel.js',        // 聊天面板
  '15-images.js',            // 消息图片处理与大图查看
  '16-chat-extract.js',      // 从聊天记录提取好友/群组
  '17-messages-panel.js',    // 消息列表面板
  '18-cg-data.js',           // CG 数据表与解锁存档
  '19-cg-gallery.js',        // CG 图鉴面板
  '20-friends-panel.js',     // 好友列表与好友详情
  '21-forum-post-detail.js', // 论坛头像与帖子详情
  '22-api-config.js',        // PhoneAPIConfig：独立 API 配置
  '23-forum-manager.js',     // PhoneForumManager：论坛生成
  '24-forum-panel.js',       // 论坛面板
  '25-calendar.js',          // 日历面板与全屏日历
  '26-settings-panel.js',    // 设置面板
  '27-phone-size.js',        // 手机尺寸设置
  '28-wallpaper.js',         // 壁纸设置与全屏壁纸
  '29-cg-fullscreen.js',     // CG 全屏查看与左右切换
  '30-cleanup.js',           // cleanupMobilePhone
  '31-global-exports.js',    // window.* 暴露（内联 onclick 依赖）
  '32-realtime-refresh.js',  // 消息监听与自动刷新
  '33-group-chat.js',        // 群聊管理
  '34-confirm-dialog.js',    // showCustomConfirm
  '35-boot.js',              // 启动、ESC、unload
];

const BANNER = [
  '// ⚠ 本文件由 phone/build.mjs 自动生成，请勿直接编辑。',
  '// 源码分片在 phone/src/（逻辑）与 phone/src/css/（样式）。',
  '// 改完运行：npm run phone:build',
  '',
];

const INCLUDE = /^\s*\/\*\s*@@include\s+(.+?)\s*\*\/\s*$/;

/* 读文件并去掉「文件末尾那一个换行」，避免每拼一片就多出一个空行 */
function readPart(path) {
  const raw = readFileSync(path, 'utf8');
  return raw.replace(/\r?\n$/, '');
}

function expand(path, depth = 0) {
  if (depth > 4) throw new Error(`@@include 嵌套过深: ${path}`);
  const out = [];
  for (const line of readPart(path).split('\n')) {
    const hit = line.match(INCLUDE);
    if (hit) {
      const child = join(dirname(path), hit[1]);
      if (child.endsWith('.css')) assertSelfContained(child);
      out.push(...expand(child, depth + 1));
    } else {
      out.push(line);
    }
  }
  return out;
}

/* 每个 css 分片必须自己开自己闭：一旦某片以「还在 @media 里」结束，
   后面所有分片的规则都会被裹进那个 @media —— 确认弹窗当初就是这么坏掉的。 */
function assertSelfContained(path) {
  const text = readFileSync(path, 'utf8');
  let depth = 0;
  for (const ch of text) {
    if (ch === '{') depth++;
    else if (ch === '}' && --depth < 0) throw new Error(`[phone/build] ${path}：花括号多闭合，请检查`);
  }
  if (depth !== 0) throw new Error(`[phone/build] ${path}：有 ${depth} 个花括号没闭合（@media/选择器块跨文件了）`);
}

/* @keyframes 是全局名字，重名的后者会静默覆盖前者（含 JS 里注入的 <style>）。 */
function assertUniqueKeyframes(lines) {
  const seen = new Map();
  const dup = [];
  lines.forEach((line, i) => {
    const hit = line.match(/@keyframes\s+([\w-]+)/);
    if (!hit) return;
    const name = hit[1];
    if (seen.has(name)) dup.push(`${name}（第 ${seen.get(name)} 行 与 第 ${i + 1} 行）`);
    else seen.set(name, i + 1);
  });
  if (dup.length) throw new Error(`[phone/build] @keyframes 重名：\n  ${dup.join('\n  ')}`);
}

/* 分片漏进 PARTS 是最容易犯的错，直接报错而不是静默丢代码 */
const onDisk = readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
const missing = onDisk.filter((f) => !PARTS.includes(f));
if (missing.length) {
  console.error(`[phone/build] src/ 里这些分片没有登记进 PARTS：\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const lines = [...BANNER];
for (const part of PARTS) lines.push(...expand(join(SRC, part)));
assertUniqueKeyframes(lines);

/* 统一 CRLF，产物与编辑器行尾设置无关 */
const output = lines.map((l) => l.replace(/\r$/, '')).join('\r\n') + '\r\n';

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8');
  if (current === output) {
    console.log('[phone/build] 产物与 src/ 一致');
  } else {
    console.error('[phone/build] 产物与 src/ 不一致，请运行 npm run phone:build');
    process.exit(1);
  }
} else {
  writeFileSync(OUT, output, 'utf8');
  const kb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(0);
  console.log(`[phone/build] 小手机脚本.js  ${PARTS.length} 个分片  ${lines.length} 行  ${kb} KB`);
}
