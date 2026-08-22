/**
 * 把 节点重构V3/batch_1..11 合并进 city/city_mapdata.js
 *   用法：node merge_v3.cjs        （加 --dry 只看报告不落盘）
 *
 * 合并规则（只增不减）：
 *   1. 同 id      → 用 V3 版本覆盖
 *   2. V3 独有 id → 追加，插在同 district 最后一个节点之后
 *   3. 原文件独有 → 原样保留，一个都不许掉
 *   4. housing 字段 V3 没有、原节点有 → 补回去（住房节点的价格/租金不能丢）
 *   5. 合并后节点数 < 原节点数 → 直接中止，不写文件
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'city', 'city_mapdata.js');
const DRY = process.argv.includes('--dry');

/* ---------- 1. 读 V3 批次 ---------- */
function loadV3() {
  const out = [];
  for (let i = 1; i <= 11; i++) {
    const f = path.join(__dirname, `batch_${i}.js`);
    if (!fs.existsSync(f)) throw new Error(`缺少批次文件: ${f}`);
    let src = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
    const m = src.match(/export\s+const\s+(BATCH_\d+_NODES)\s*=/);
    if (!m) throw new Error(`batch_${i}.js 里找不到 export const BATCH_xx_NODES`);
    // 这些批次是 ESM，去掉 export 关键字才能在 CJS 里 eval
    const arr = eval(`(function(){ ${src.replace(/export\s+const/g, 'const')}\n; return ${m[1]}; })()`);
    if (!Array.isArray(arr)) throw new Error(`batch_${i}.js 的 ${m[1]} 不是数组`);
    console.log(`  batch_${i}: ${arr.length} 节点`);
    out.push(...arr);
  }
  return out;
}

const v3 = loadV3();
const dupV3 = v3.length - new Set(v3.map(n => n.id)).size;
if (dupV3) throw new Error(`V3 批次内部有 ${dupV3} 个重复 id`);
console.log(`V3 合计 ${v3.length} 节点\n`);

/* ---------- 2. 读原文件 ---------- */
const rawSrc = fs.readFileSync(SRC, 'utf8');
const original = eval(`(function(){ ${rawSrc}\n; return nodes; })()`);
console.log(`原 city_mapdata.js: ${original.length} 节点`);
const origById = new Map(original.map(n => [n.id, n]));

/* ---------- 3. 覆盖 ---------- */
const v3ById = new Map(v3.map(n => [n.id, n]));
let replaced = 0;
const housingKept = [];
const merged = original.map(n => {
  const rebuilt = v3ById.get(n.id);
  if (!rebuilt) return n;
  replaced++;
  const next = { ...rebuilt };
  // 规则 4：V3 没写 housing 就把原来的补回来
  if (n.housing && !next.housing) {
    next.housing = n.housing;
    housingKept.push(n.id);
  }
  return next;
});

/* ---------- 4. 追加 V3 独有节点 ---------- */
const added = [];
for (const n of v3) {
  if (origById.has(n.id)) continue;
  // 插在同区最后一个节点后面，保持文件按区聚拢
  let at = -1;
  for (let i = merged.length - 1; i >= 0; i--) {
    if (merged[i].district === n.district) { at = i; break; }
  }
  if (at < 0) merged.push(n); else merged.splice(at + 1, 0, n);
  added.push(`${n.id}(${n.name})`);
}

/* ---------- 5. 只增不减自检 ---------- */
const keptOnly = original.filter(n => !v3ById.has(n.id)).map(n => `${n.id}(${n.name})`);
console.log(`覆盖 ${replaced} 个 / 新增 ${added.length} 个 / 保留原有独有 ${keptOnly.length} 个`);
console.log(`  新增：${added.join(', ') || '(无)'}`);
console.log(`  保留：${keptOnly.join(', ') || '(无)'}`);
console.log(`  housing 补回：${housingKept.join(', ') || '(无)'}`);

const lostIds = original.map(n => n.id).filter(id => !merged.some(m => m.id === id));
if (lostIds.length) { console.error(`中止：会丢节点 ${lostIds.join(', ')}`); process.exit(1); }
if (merged.length < original.length) {
  console.error(`中止：节点数会减少 ${original.length} -> ${merged.length}`); process.exit(1);
}
if (merged.length !== new Set(merged.map(n => n.id)).size) {
  console.error('中止：合并结果有重复 id'); process.exit(1);
}
console.log(`\n合并后 ${merged.length} 节点`);

/* ---------- 6. 序列化 ---------- */
// 键名保持不加引号（CJK 在 JS 里也是合法标识符），短字符串数组压成一行，
// 和原文件那种手写风格对得上，diff 才看得懂。
const IDENT = /^[A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*$/;
const q = s => JSON.stringify(s);
const key = k => (IDENT.test(k) ? k : q(k));

function ser(v, ind) {
  const pad = '  '.repeat(ind), pad1 = '  '.repeat(ind + 1);
  if (v === null || typeof v !== 'object') return typeof v === 'string' ? q(v) : String(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const flat = v.every(x => typeof x !== 'object' || x === null);
    if (flat) {
      const one = '[ ' + v.map(x => ser(x, 0)).join(', ') + ' ]';
      if (pad.length + one.length <= 118) return one;
    }
    return '[\n' + v.map(x => pad1 + ser(x, ind + 1)).join(',\n') + '\n' + pad + ']';
  }
  const ks = Object.keys(v);
  if (!ks.length) return '{}';
  const flat = ks.every(k => typeof v[k] !== 'object' || v[k] === null);
  if (flat) {
    const one = '{ ' + ks.map(k => `${key(k)}: ${ser(v[k], 0)}`).join(', ') + ' }';
    if (pad.length + one.length <= 118) return one;
  }
  return '{\n' + ks.map(k => `${pad1}${key(k)}: ${ser(v[k], ind + 1)}`).join(',\n') + '\n' + pad + '}';
}

const header = `/**
 * 临江市节点库（共 ${merged.length} 节点）
 * 数据来源：节点重构V3/batch_1..11（${v3.length} 节点，覆盖 ${replaced} + 新增 ${added.length}）
 *           + 原有独有节点 ${keptOnly.length} 个（住房节点与仓储超市，V3 未涉及，原样保留）
 * 生成方式：node 节点重构V3/merge_v3.cjs（只增不减，同 id 覆盖）
 * 生成时间：${new Date().toISOString().slice(0, 10)}
 */

`;

const body = `const nodes = [\n` +
  merged.map(n => '  ' + ser(n, 1)).join(',\n') + `\n];\n`;

/* 导出契约必须和原文件逐字一致：plate_map.js 读的是 window.CITY_MAP_DATA，
   形状 { nodes, nodeById }。改名或少给 nodeById 都会让地图整层渲染不出来。 */
const footer =
  `const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));\n` +
  `if (typeof window !== 'undefined') window.CITY_MAP_DATA = { nodes, nodeById };\n` +
  (rawSrc.includes('module.exports')
    ? `if (typeof module !== 'undefined' && module.exports) module.exports = { nodes, nodeById };\n`
    : '');

const out = header + body + footer;

/* ---------- 7. 回读校验 ---------- */
const check = eval(`(function(){ ${out}\n; return nodes; })()`);
if (check.length !== merged.length) throw new Error('回读节点数不一致');
if (JSON.stringify(check) !== JSON.stringify(merged)) throw new Error('回读内容与合并结果不一致');
console.log('回读校验通过');

if (DRY) { console.log('--dry：未写入文件'); process.exit(0); }
fs.writeFileSync(SRC, out, 'utf8');
console.log(`已写入 ${SRC}（${merged.length} 节点）`);
