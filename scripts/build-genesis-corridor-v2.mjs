import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const oldPath = path.join(repo, '参考', '创始回廊正文美化.html');
const modernPath = path.join(repo, '外部部署', 'V20260826', '正文美化.html');
const outputPath = path.join(repo, '参考', '创始回廊正文美化-v2-外链素材版.html');
const archiveRoot = path.resolve('D:/Code/dnf-dist/dnf/dist/genesis-corridor-v2');
const assetBase = 'https://testingcf.jsdelivr.net/gh/tangquanghuy/dnf@main/dist/genesis-corridor-v2/';

const oldSource = (await readFile(oldPath, 'utf8')).replace(/\r\n/g, '\n');
let output = (await readFile(modernPath, 'utf8')).replace(/\r\n/g, '\n');

function fail(message) {
  throw new Error(`[创始回廊 v2 构建] ${message}`);
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let templateDepth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1] || '';
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (quote === '`' && ch === '$' && next === '{') { templateDepth += 1; i += 1; continue; }
      if (quote === '`' && templateDepth > 0) {
        if (ch === '{') templateDepth += 1;
        else if (ch === '}') templateDepth -= 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  fail(`从索引 ${openIndex} 开始没有找到配对的 }`);
}

function extractConst(text, name) {
  const marker = `const ${name} =`;
  const start = text.indexOf(marker);
  if (start < 0) fail(`缺少 ${marker}`);
  const open = text.indexOf('{', start);
  const close = findMatchingBrace(text, open);
  const semi = text.indexOf(';', close);
  return text.slice(start, semi + 1);
}

function replaceConst(text, name, replacement) {
  const marker = `const ${name} =`;
  const start = text.indexOf(marker);
  if (start < 0) fail(`新版缺少 ${marker}`);
  const open = text.indexOf('{', start);
  const close = findMatchingBrace(text, open);
  const semi = text.indexOf(';', close);
  return text.slice(0, start) + replacement + text.slice(semi + 1);
}

function extractBetween(text, startMarker, endMarker, includeStart = true) {
  const startAt = text.indexOf(startMarker);
  if (startAt < 0) fail(`缺少起始标记：${startMarker}`);
  const endAt = text.indexOf(endMarker, startAt + startMarker.length);
  if (endAt < 0) fail(`缺少结束标记：${endMarker}`);
  return text.slice(includeStart ? startAt : startAt + startMarker.length, endAt);
}

function replaceOnce(text, needle, replacement, label = needle.slice(0, 60)) {
  const first = text.indexOf(needle);
  if (first < 0) fail(`替换目标不存在：${label}`);
  if (text.indexOf(needle, first + needle.length) >= 0) fail(`替换目标不唯一：${label}`);
  return text.slice(0, first) + replacement + text.slice(first + needle.length);
}

function removeStyleById(text, id) {
  const re = new RegExp(`\\s*<style\\s+id=["']${id}["'][^>]*>[\\s\\S]*?<\\/style>`, 'i');
  if (!re.test(text)) fail(`新版缺少样式块 #${id}`);
  return text.replace(re, '');
}

// 1) 使用新版页面壳、四套主题、设置面板、阅读宽度、头像上传与渲染性能实现；剔除不需要的两类卡片。
output = removeStyleById(output, 'liveroom-css');
output = removeStyleById(output, 'evt-card-css');
const liveStart = '// ==================== 直播间 <LiveRoom> ====================';
const avatarCacheStart = "    const AVATAR_CACHE_PREFIX = 'custom_char_avatar_';";
const liveAt = output.indexOf(liveStart);
const avatarCacheAt = output.indexOf(avatarCacheStart, liveAt);
if (liveAt < 0 || avatarCacheAt < 0) fail('新版直播间/突发事件脚本边界发生变化');
output = output.slice(0, liveAt) + output.slice(avatarCacheAt);

// 2) 原样保留创始回廊内置角色、头像和别名。
output = replaceConst(output, 'CHARACTER_CONFIG', extractConst(oldSource, 'CHARACTER_CONFIG'));

// 3) 原样保留创始回廊图片清单；新版图片管线继续负责懒加载、随机图与跨 iframe 通知。
const oldImageDataStart = oldSource.indexOf('// 图片列表数据');
const oldImageConstEndMarker = '    function safeDecodeURIComponent';
const oldImageDataEnd = oldSource.indexOf(oldImageConstEndMarker, oldImageDataStart);
if (oldImageDataStart < 0 || oldImageDataEnd < 0) fail('旧版图片列表边界发生变化');
const oldImageData = oldSource.slice(oldImageDataStart, oldImageDataEnd).trimEnd();
const newImageDataStart = output.indexOf('// Image manifest generated');
if (newImageDataStart < 0) fail('新版图片列表注释发生变化');
const newImageConstStart = output.indexOf('const IMAGE_LISTS =', newImageDataStart);
const newImageOpen = output.indexOf('{', newImageConstStart);
const newImageClose = findMatchingBrace(output, newImageOpen);
const newImageSemi = output.indexOf(';', newImageClose);
output = output.slice(0, newImageDataStart) + oldImageData + '\n\n    ' + output.slice(newImageSemi + 1);

// 新版清单使用显式编号数组；兼容旧版“最大编号”数字写法，不改变旧数据。
const numbersCompat = "      const rawNumbers = characterData[sceneKey];\n      const numbers = Array.isArray(rawNumbers)\n        ? rawNumbers\n        : (Number.isFinite(Number(rawNumbers)) && Number(rawNumbers) > 0\n          ? Array.from({ length: Math.floor(Number(rawNumbers)) }, (_, index) => index + 1)\n          : []);\n      return { characterKey, sceneKey, numbers, maxNumber: numbers.length };";
const numberLogicRe = /\s{6}const numbers = Array\.isArray\(characterData\[sceneKey\]\) \? characterData\[sceneKey\] : \[\];\r?\n\s{6}return \{ characterKey, sceneKey, numbers, maxNumber: numbers\.length \};/;
if (!numberLogicRe.test(output)) fail('findImageListEntry 的编号数组逻辑发生变化');
output = output.replace(numberLogicRe, '\n' + numbersCompat);

// 4) 接回旧版 RPG/商店卡片渲染器及交易辅助；这些函数内容直接取自旧版。
const merchantHelpers = extractBetween(
  oldSource,
  '// ==================== 商店交易辅助函数（第一阶段：仅读取/发送） ====================',
  "    const AVATAR_CACHE_PREFIX = 'custom_char_avatar_';"
).trim();
const rpgFunctions = extractBetween(oldSource, '    function rpgEsc(s)', '    function processTextContent()').trim();
const processMarker = '    function processTextContent() {';
const processAt = output.indexOf(processMarker);
if (processAt < 0) fail('新版缺少 processTextContent');
output = output.slice(0, processAt) + `    ${merchantHelpers.replaceAll('\n', '\n    ')}\n\n    ${rpgFunctions.replaceAll('\n', '\n    ')}\n\n` + output.slice(processAt);

// 5) 新版正文处理器只识别旧版图片 + RPG 标签，不注册直播间/突发事件。
const tagStart = output.indexOf('      // 标签匹配：图片、直播间和突发事件标签。');
const tagEnd = output.indexOf('      const matches = [];', tagStart);
if (tagStart < 0 || tagEnd < 0) fail('新版标签匹配区发生变化');
const rpgTagBlock = `      // 标签匹配：图片标签 + 创始回廊 RPG 日志标签。\n      const tagPatterns = [\n        { regex: /<Image>([\\s\\S]*?)<\\/Image>/gi, type: 'image-tag' },\n        { regex: /<pic>([\\s\\S]*?)<\\/pic>/gi, type: 'image-tag' },\n        { regex: /<img\\b[^>]*>/gi, type: 'html-img' },\n        { regex: /<(DiceCombat)>([\\s\\S]*?)<\\/DiceCombat>/gi, type: 'rpg-log' },\n        { regex: /<(DiceCheck)>([\\s\\S]*?)<\\/DiceCheck>/gi, type: 'rpg-log' },\n        { regex: /<(Initiative)>([\\s\\S]*?)<\\/Initiative>/gi, type: 'rpg-log' },\n        { regex: /<(EnemyOverview)>([\\s\\S]*?)<\\/EnemyOverview>/gi, type: 'rpg-log' },\n        { regex: /<(SummonOverview)>([\\s\\S]*?)<\\/SummonOverview>/gi, type: 'rpg-log' },\n        { regex: /<(LootLog)>([\\s\\S]*?)<\\/LootLog>/gi, type: 'rpg-log' },\n        { regex: /<(ExperienceLog)>([\\s\\S]*?)<\\/ExperienceLog>/gi, type: 'rpg-log' },\n        { regex: /<(QuestContract)>([\\s\\S]*?)<\\/QuestContract>/gi, type: 'rpg-log' },\n        { regex: /<(MerchantStore)>([\\s\\S]*?)<\\/MerchantStore>/gi, type: 'rpg-log' },\n        { regex: /<(CombatSnapshot)>([\\s\\S]*?)<\\/CombatSnapshot>/gi, type: 'rpg-log' }\n      ];\n`;
output = output.slice(0, tagStart) + rpgTagBlock + output.slice(tagEnd);

const matchBranchStart = output.indexOf("            if (config.type === 'image-tag')", output.indexOf(rpgTagBlock));
const matchBranchEnd = output.indexOf('          }\n        });', matchBranchStart);
if (matchBranchStart < 0 || matchBranchEnd < 0) fail('新版标签收集分支发生变化');
const matchBranch = `            if (config.type === 'image-tag') {\n              matches.push({ index: match.index, length: match[0].length, content: match[1].trim(), raw: match[0], type: 'image-tag' });\n            } else if (config.type === 'html-img') {\n              matches.push({ index: match.index, length: match[0].length, content: match[0], raw: match[0], type: 'html-img' });\n            } else {\n              matches.push({ index: match.index, length: match[0].length, rpgType: match[1], content: match[2], raw: match[0], type: 'rpg-log', rpgIdx: matches.length });\n            }\n`;
output = output.slice(0, matchBranchStart) + matchBranch + output.slice(matchBranchEnd);

output = replaceOnce(
  output,
  "          if (match.type === 'live-room') return renderLiveRoom(match.content, htmlParts.length);\n          if (match.type === 'sudden-event') return renderSuddenEvent(match.content, htmlParts.length);",
  "          if (match.type === 'rpg-log') return '<div class=\"rpg-log-section\">' + renderRpgCard(match.rpgType, match.content, match.rpgIdx) + '</div>';",
  'renderTag 的卡片分支'
);
output = output.replace(/\n\s*try \{ initLiveRooms\(\); \}[^\n]*\n\s*try \{ initEvtCards\(\); \}[^\n]*/g, '');

// 商店按钮需要在正文替换完成后绑定；仍沿用新版分步容错初始化。
output = replaceOnce(
  output,
  "          step('processTextContent', processTextContent);",
  "          step('processTextContent', processTextContent);\n          step('initMerchantTradeUi', initMerchantTradeUi);",
  'DOMContentLoaded 的 processTextContent 步骤'
);

// 6) 旧卡片 CSS 保持原声明；只追加新版壳缺少的静态 Tailwind 工具类和移动端卡片规则。
function extractCssSection(startMarker) {
  const start = oldSource.indexOf(startMarker);
  if (start < 0) fail('缺少旧版 CSS 起点：' + startMarker);
  const end = oldSource.indexOf('</style>', start);
  if (end < 0) fail('缺少旧版 CSS 终点：' + startMarker);
  return oldSource.slice(start, end).trim();
}
const merchantCss = extractCssSection('    /* ===== 神秘商店 ===== */');
const rpgCss = extractCssSection('    /* ===== RPG LOG CARD STYLES ===== */');
const snapshotCss = extractCssSection('    /* ===== 战斗快照 CombatSnapshot（cs- 命名空间） ===== */');
const responsiveCss = `@media (max-width:768px) {\n  .rpg-log-section { margin: 1.2em -10px; }\n  .log-card { border-radius: 6px; }\n  .card-combat .combat-header, .card-check .px-4, .card-combat .px-4 { padding-left: 12px !important; padding-right: 12px !important; }\n  .dice-roll-tag { padding: 4px 8px; }\n  .dice-roll-tag .dice-tag-val { font-size: 1rem; }\n  .narration-quote { font-size: 12px; }\n  .stat-grid { grid-template-columns: repeat(3, 1fr); gap: 3px; }\n  .stat-value { font-size: .9rem; }\n  .monster-icon-frame, .summon-icon-frame { width: 44px; height: 44px; }\n  .monster-icon-frame svg { width: 28px; height: 28px; }\n  .enemy-card, .summon-card { padding: 0 !important; }\n  .summon-card .px-5, .enemy-card .px-5 { padding-left: 12px !important; padding-right: 12px !important; }\n  .enemy-card .enemy-top-row { flex-wrap: wrap; gap: 8px; }\n  .enemy-card .enemy-top-row .enemy-name-block { flex: 1; min-width: 0; }\n  .enemy-card .enemy-top-row .enemy-name-block h3 { font-size: .95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n  .enemy-card .enemy-tag-row { padding-left: 52px; gap: 4px; margin-top: 2px; flex-wrap: wrap; }\n  .enemy-card .enemy-tag-row span { padding: 1px 6px; font-size: .7rem; }\n  .enemy-card .enemy-top-row .enemy-threat-icons { flex-shrink: 0; }\n  .weakness-badge, .resistance-badge { padding: 3px 8px; font-size: .7rem; }\n  .card-exp .px-6 { padding-left: 16px !important; padding-right: 16px !important; }\n  .card-exp .damage-pop span.font-black { font-size: 2.5rem !important; }\n  .quest-banner { font-size: 17px; letter-spacing: 2px; padding: 10px 12px; overflow: hidden; }\n  .quest-banner .quest-cloud-left, .quest-banner .quest-cloud-right, .quest-banner::before, .quest-banner::after { display: none; }\n  .quest-body-3 { padding: 14px 16px; }\n  .quest-section .brush-font { font-size: 1.3rem; }\n  .quest-reward-text { font-size: 14px; }\n  .quest-big-seal { width: 50px; height: 50px; font-size: 13px; bottom: 16px; right: 16px; }\n}\n@media (max-width:480px) {\n  .rpg-log-section { margin: 1em -8px; }\n  .stat-grid { grid-template-columns: repeat(3, 1fr); gap: 2px; }\n  .stat-cell { padding: 4px 1px; }\n  .stat-label { font-size: .5rem; }\n  .stat-value { font-size: .85rem; }\n  .monster-icon-frame, .summon-icon-frame { width: 38px; height: 38px; }\n  .monster-icon-frame svg { width: 24px; height: 24px; }\n  .enemy-card .px-5, .summon-card .px-5 { padding-left: 10px !important; padding-right: 10px !important; }\n  .enemy-card .py-4 { padding-top: 10px !important; padding-bottom: 10px !important; }\n  .enemy-card .enemy-top-row { gap: 8px; }\n  .enemy-card .enemy-top-row .enemy-name-block h3 { font-size: .9rem; }\n  .enemy-card .enemy-tag-row { padding-left: 46px; gap: 3px; }\n  .enemy-card .enemy-tag-row span { padding: 1px 5px; font-size: .65rem; }\n  .enemy-card .enemy-threat-icons i { font-size: .6rem; }\n  .quest-banner { font-size: 15px; letter-spacing: 1px; padding: 8px 10px; overflow: hidden; }\n  .quest-banner::before, .quest-banner::after { display: none; }\n  .quest-banner i.mr-2 { margin-right: 4px !important; }\n  .quest-body-3 { padding: 12px; }\n  .quest-section .brush-font { font-size: 1.2rem; }\n  .quest-section-label { font-size: 10px; letter-spacing: 1px; }\n  .quest-reward-text { font-size: 13px; }\n  .quest-rank-badge { min-width: 28px; width: auto; height: 28px; font-size: 15px; }\n  .quest-big-seal { width: 44px; height: 44px; font-size: 11px; bottom: 12px; right: 12px; }\n  .card-exp .damage-pop span.font-black { font-size: 2rem !important; }\n  .loot-clasp { width: 32px; height: 16px; }\n}`;

const utilityCss = `/* 旧卡片原先由 Tailwind CDN 生成的静态工具类：v2 固化为 CSS，避免每个消息 iframe 重跑 Tailwind。 */\n.flex{display:flex}.inline-flex{display:inline-flex}.inline-block{display:inline-block}.relative{position:relative}.z-10{z-index:10}.flex-1{flex:1 1 0%}.flex-shrink-0{flex-shrink:0}.flex-wrap{flex-wrap:wrap}.min-w-0{min-width:0}.items-center{align-items:center}.items-start{align-items:flex-start}.justify-between{justify-content:space-between}.justify-center{justify-content:center}.overflow-hidden{overflow:hidden}\n.gap-1{gap:.25rem}.gap-1\\.5{gap:.375rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}.space-y-1\\.5>:not([hidden])~:not([hidden]){margin-top:.375rem}.space-y-3>:not([hidden])~:not([hidden]){margin-top:.75rem}\n.mr-1{margin-right:.25rem}.mr-2{margin-right:.5rem}.ml-1{margin-left:.25rem}.ml-2{margin-left:.5rem}.mt-0\\.5{margin-top:.125rem}.mt-1{margin-top:.25rem}.mt-2{margin-top:.5rem}.mb-0\\.5{margin-bottom:.125rem}.mb-1{margin-bottom:.25rem}.mb-2{margin-bottom:.5rem}.mb-3{margin-bottom:.75rem}.mb-4{margin-bottom:1rem}\n.px-1{padding-left:.25rem;padding-right:.25rem}.px-1\\.5{padding-left:.375rem;padding-right:.375rem}.px-2{padding-left:.5rem;padding-right:.5rem}.px-3{padding-left:.75rem;padding-right:.75rem}.px-4{padding-left:1rem;padding-right:1rem}.px-5{padding-left:1.25rem;padding-right:1.25rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}\n.py-0\\.5{padding-top:.125rem;padding-bottom:.125rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.py-1\\.5{padding-top:.375rem;padding-bottom:.375rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}.py-4{padding-top:1rem;padding-bottom:1rem}.py-6{padding-top:1.5rem;padding-bottom:1.5rem}.pt-1{padding-top:.25rem}.pt-2{padding-top:.5rem}.pt-3{padding-top:.75rem}.pb-3{padding-bottom:.75rem}.pb-4{padding-bottom:1rem}.pb-6{padding-bottom:1.5rem}\n.w-10{width:2.5rem}.h-10{height:2.5rem}.h-1\\.5{height:.375rem}.h-3{height:.75rem}.h-full{height:100%}.rounded{border-radius:.25rem}.rounded-lg{border-radius:.5rem}.rounded-full{border-radius:9999px}.border{border-width:1px}\n.text-xs{font-size:.75rem;line-height:1rem}.text-sm{font-size:.875rem;line-height:1.25rem}.text-base{font-size:1rem;line-height:1.5rem}.text-lg{font-size:1.125rem;line-height:1.75rem}.text-2xl{font-size:1.5rem;line-height:2rem}.text-5xl{font-size:3rem;line-height:1}.text-center{text-align:center}.leading-relaxed{line-height:1.625}.tracking-wide{letter-spacing:.025em}.tracking-wider{letter-spacing:.05em}.uppercase{text-transform:uppercase}.italic{font-style:italic}.font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}.font-black{font-weight:900}.font-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.font-noto{font-family:'Noto Serif SC',serif}.font-cinzel_body{font-family:'Cinzel',serif}\n.text-white{color:#fff}.text-white\\/50{color:rgba(255,255,255,.5)}.text-yellow-500{color:#eab308}.text-amber_warm\\/60{color:rgba(200,164,94,.6)}.text-amber_warm\\/70{color:rgba(200,164,94,.7)}.bg-black\\/15{background-color:rgba(0,0,0,.15)}.bg-black\\/20{background-color:rgba(0,0,0,.2)}.bg-yellow-500\\/10{background-color:rgba(234,179,8,.1)}.border-yellow-500\\/20{border-color:rgba(234,179,8,.2)}`;

const faCssPath = path.join(archiveRoot, 'vendor', 'fontawesome', 'css', 'all.min.css');
const rpgAwesomeCssPath = path.join(archiveRoot, 'vendor', 'rpg-awesome', 'css', 'rpg-awesome.min.css');
let faCss = await readFile(faCssPath, 'utf8');
let rpgAwesomeCss = await readFile(rpgAwesomeCssPath, 'utf8');
faCss = faCss.replaceAll('../webfonts/', `${assetBase}vendor/fontawesome/webfonts/`);
rpgAwesomeCss = rpgAwesomeCss.replaceAll('../fonts/', `${assetBase}vendor/rpg-awesome/fonts/`);
const legacyStyle = `\n  <style id="genesis-corridor-legacy-cards">\n${faCss}\n${rpgAwesomeCss}\n${utilityCss}\n${merchantCss}\n${rpgCss}\n${snapshotCss}\n${responsiveCss}\n  </style>\n`;
output = replaceOnce(output, '</head>', legacyStyle + '</head>', '</head>');

// 7) 抽出 5 张主题装饰图到 dnf 仓库，并把全部 head CSS 合并成一个内容哈希外链。
const assetNames = ['banner-day', 'ornament-day', 'ornament-dark', 'ornament-tea', 'banner-dark'];
const dataRe = /url\(\s*(["']?)data:image\/webp;base64,([A-Za-z0-9+/=\r\n]+)\1\s*\)/g;
const dataMatches = [...output.matchAll(dataRe)];
if (dataMatches.length !== assetNames.length) fail(`主题内联图片数量应为 ${assetNames.length}，实际 ${dataMatches.length}`);
await mkdir(archiveRoot, { recursive: true });
let replaced = '';
let cursor = 0;
for (let i = 0; i < dataMatches.length; i += 1) {
  const match = dataMatches[i];
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  const file = `${assetNames[i]}.${hash}.webp`;
  await writeFile(path.join(archiveRoot, file), bytes);
  replaced += output.slice(cursor, match.index) + `url("${assetBase}${file}")`;
  cursor = match.index + match[0].length;
}
output = replaced + output.slice(cursor);

const styleBlocks = [...output.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
if (!styleBlocks.length) fail('没有可抽取的 style 块');
const headEnd = output.indexOf('</head>');
if (styleBlocks.some(block => block.index > headEnd)) fail('存在 head 外 style 块');
const cssText = styleBlocks.map((block, index) => {
  const id = (block[1].match(/id=["']([^"']+)/) || [])[1] || `block-${index + 1}`;
  return `/* ===== ${id} ===== */\n${block[2].trim()}\n`;
}).join('\n');
const cssBytes = Buffer.from(cssText, 'utf8');
const cssHash = createHash('sha256').update(cssBytes).digest('hex').slice(0, 8);
const cssFile = `genesis-corridor-v2.${cssHash}.css`;
await writeFile(path.join(archiveRoot, cssFile), cssBytes);

const styleStart = styleBlocks[0].index;
const styleEnd = styleBlocks.at(-1).index + styleBlocks.at(-1)[0].length;
const externalHead = `  <link rel="preconnect" href="https://testingcf.jsdelivr.net" crossorigin>\n  <link rel="stylesheet" href="${assetBase}${cssFile}">\n  <script defer src="${assetBase}vendor/js-yaml/js-yaml.min.js"></script>`;
output = output.slice(0, styleStart) + externalHead + output.slice(styleEnd);

// 8) 写清来源与独立归档位置，避免后续误把它当成当前外部部署产物。
const banner = `<!-- 创始回廊正文美化 v2 外链素材版\n     页面壳/主题/设置/头像上传/性能策略同步自 外部部署/V20260826/正文美化.html。\n     RPG 卡片、角色头像配置与图片列表保留自 参考/创始回廊正文美化.html。\n     不包含 LiveRoom 与 SuddenEvent。\n     独立归档：https://github.com/tangquanghuy/dnf/tree/main/dist/genesis-corridor-v2/ -->\n`;
output = output.replace(/^```\s*\n/, '```\n' + banner);

// 基础静态断言。
const required = ['DiceCombat', 'DiceCheck', 'Initiative', 'EnemyOverview', 'SummonOverview', 'LootLog', 'ExperienceLog', 'QuestContract', 'MerchantStore', 'CombatSnapshot'];
for (const tag of required) if (!output.includes(tag)) fail(`输出缺少 RPG 标签 ${tag}`);
for (const banned of ['function renderLiveRoom', 'function renderSuddenEvent', '<LiveRoom>', '<SuddenEvent>', 'linjiang-glass@main/public/reading/']) {
  if (output.includes(banned)) fail(`输出仍包含不应保留的内容：${banned}`);
}
if (!output.includes('customCharAvatarUrlInput')) fail('输出缺少新版网络头像输入');
if (!output.includes('readingWidthIncrease')) fail('输出缺少新版阅读宽度设置');
if (!output.includes("data-theme-key=\"paper-white\"")) fail('输出缺少纯白主题');
if (output.includes('cdn.tailwindcss.com')) fail('输出仍依赖 Tailwind 运行时');

await writeFile(outputPath, output, 'utf8');
console.log(JSON.stringify({
  outputPath,
  htmlBytes: Buffer.byteLength(output),
  cssPath: path.join(archiveRoot, cssFile),
  cssBytes: cssBytes.length,
  assetBase,
  styleBlocks: styleBlocks.length,
  dataAssets: dataMatches.length
}, null, 2));





