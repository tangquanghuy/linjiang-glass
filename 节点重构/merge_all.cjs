/**
 * 【已废弃】把 节点重构/batch01~11 合并进 city/city_mapdata.js。
 *
 * 这一批是上一代文案。city_mapdata.js 现在的正主是 节点重构V3/merge_v3.cjs，
 * 直接跑这个脚本会用旧文案把 V3 的节点名和事件全部盖回去。
 * 留着只为了能回溯旧数据，要跑必须显式加 --force。
 *
 * 用法：node merge_all.cjs --force
 * Output: ../city/city_mapdata.js (in place; history is managed by Git).
 */
const fs = require('fs');
const path = require('path');

if (!process.argv.includes('--force')) {
  console.error('已废弃：这会用旧批次覆盖 节点重构V3 的数据。');
  console.error('要合并 V3 请用：node ../节点重构V3/merge_v3.cjs');
  console.error('确实要跑旧批次，加 --force。');
  process.exit(1);
}

const SRC = path.join(__dirname, '..', 'city', 'city_mapdata.js');

// 1. 加载所有重构批次
const batches = [];
for (let i = 1; i <= 11; i++) {
  const pad = String(i).padStart(2, '0');
  const f = path.join(__dirname, `city_nodes_rebuild_batch${pad}.js`);
  if (!fs.existsSync(f)) { console.log('  NOT FOUND:', f); continue; }
  const src = fs.readFileSync(f, 'utf8');
  // Extract the array variable name (REBUILD_BATCH_XX)
  const varMatch = src.match(/const\s+(REBUILD_BATCH_\d+)\s*=\s*\[/);
  if (!varMatch) { console.log(`  batch${pad}: no REBUILD_BATCH_ var found`); continue; }
  const varName = varMatch[1];
  try {
    const arr = eval(`(function(){ ${src}; return ${varName}; })()`);
    console.log(`  batch${pad}: ${arr.length} nodes`);
    batches.push(...arr);
  } catch (e) {
    console.log(`  batch${pad}: eval error: ${e.message}`);
  }
}
console.log(`Loaded ${batches.length} rebuilt nodes from 11 batches`);

// 2. 建 id -> rebuilt node map
const rebuilt = new Map(batches.map(n => [n.id, n]));

// 3. 读原文件，解析 nodes 数组
let src = fs.readFileSync(SRC, 'utf8');

// 原文件结构：const nodes = [ ... ]; + 导出。用简单的方式：eval 拿到 nodes
// 但更安全的方式是按行找每个节点的起止位置然后替换。
// 由于原文件是 const nodes = [...] 且每个节点以 { id: 'xxx' 开头，
// 我们用正则把整个 nodes 数组解构出来。

// 简单方案：require 原文件拿 nodes，然后重建整个文件
// 原文件导出方式未知，先检查
const hasModule = src.includes('module.exports');
const hasWindow = src.includes('window.');

// 通过 eval 方式加载（原文件是 const nodes = [...]）
let originalNodes;
try {
  // 包一层函数来隔离
  const wrapped = `(function(){ ${src}; return nodes; })()`;
  originalNodes = eval(wrapped);
} catch (e) {
  console.error('Failed to parse original file:', e.message);
  process.exit(1);
}
console.log(`Original has ${originalNodes.length} nodes`);

// 4. 替换
let replaced = 0;
const merged = originalNodes.map(n => {
  if (rebuilt.has(n.id)) {
    replaced++;
    return rebuilt.get(n.id);
  }
  return n;
});
console.log(`Replaced ${replaced} nodes`);

// 4b. 合并只允许「同 id 覆盖」，节点总数不得减少
if (merged.length < originalNodes.length) {
  console.error(
    `ABORT: node count would shrink ${originalNodes.length} -> ${merged.length}`
  );
  process.exit(1);
}
const untouched = originalNodes.filter((n) => !rebuilt.has(n.id)).map((n) => n.id);
console.log(`Kept ${untouched.length} original-only nodes: ${untouched.join(', ')}`);

// 5. 序列化回 JS
const serialize = (obj, indent = 2) => {
  return JSON.stringify(obj, null, indent)
    // 把 JSON 的双引号键转成无引号（仅对合法标识符）
    .replace(/"([a-zA-Z_\u4e00-\u9fff][a-zA-Z0-9_\u4e00-\u9fff]*)":/g, '$1:')
    // 把值里的 \\n 还原（不需要，JSON.stringify 已经处理）
    // 短数组放一行
    .replace(/\[\s*\n\s*"([^"]*)"(?:,\s*\n\s*"([^"]*)")*\s*\n\s*\]/g, (match) => {
      if (match.length < 100) {
        return match.replace(/\s*\n\s*/g, ' ');
      }
      return match;
    });
};

const header = `/**
 * 临江市节点库（共 ${merged.length} 节点）
 * = 重构批次 01~11 覆盖 ${replaced} 个节点 + 保留 ${untouched.length} 个原有节点
 * 对齐：PLAN_v3、变量草稿、节点复审清单.md
 * 合并时间：${new Date().toISOString().slice(0, 10)}
 */

`;

const body = `const nodes = ${serialize(merged)};\n`;

/* 导出契约必须和原文件逐字一致：plate_map.js:24 读的是 window.CITY_MAP_DATA，
   且形状是 { nodes, nodeById }。改名或少给 nodeById 都会让地图整层渲染不出来。 */
const footer =
  `const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));\n` +
  `if (typeof window !== 'undefined') window.CITY_MAP_DATA = { nodes, nodeById };\n` +
  (hasModule
    ? `if (typeof module !== 'undefined' && module.exports) module.exports = { nodes, nodeById };\n`
    : '');

fs.writeFileSync(SRC, header + body + footer, 'utf8');
console.log(`Written: ${SRC} (${merged.length} nodes)`);
