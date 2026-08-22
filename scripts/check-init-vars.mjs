/**
 * 变量初始化 自检：
 *   1. 每个 位置.区域 都是「{真实行政区} · {真实地图节点名}」
 *   2. 玩家和七位主播的住处互不重复
 *   3. 玩家 居住地 与 房产 的区域一致，且工作地点是真实节点
 * 用法：node scripts/check-init-vars.mjs
 */
import fs from 'node:fs';

const text = fs.readFileSync('酒馆变量/变量初始化', 'utf8');

global.window = {};
new Function(fs.readFileSync('city/city_mapdata.js', 'utf8'))();
const D = global.window.CITY_MAP_DATA;
const nodeNames = new Set(D.nodes.map(n => n.name));
const districts = new Set(D.nodes.map(n => n.district));
const nodeByName = new Map(D.nodes.map(n => [n.name, n]));

const girls = ['东雪莲', '塔菲', '沙花叉', '时雨羽衣', '红蔷薇', '斯黛拉', '璃亚梦'];

/** 抓某个缩进块下的第一个 位置:{区域,场所,私密度} */
function 位置块(anchorRe) {
  const start = text.search(anchorRe);
  if (start < 0) return null;
  const slice = text.slice(start);
  const m = slice.match(/位置:\s*\r?\n\s*区域:\s*(.+?)\s*\r?\n\s*场所:\s*(.+?)\s*\r?\n\s*私密度:\s*(\d+)/);
  return m ? { 区域: m[1], 场所: m[2], 私密度: Number(m[3]) } : null;
}

const rows = [];
rows.push({ who: '玩家', ...位置块(/^世界信息:/m) });
girls.forEach(g => rows.push({ who: g, ...位置块(new RegExp('^  ' + g + ':', 'm')) }));

const 居住地 = (text.match(/^  居住地:\s*(.+?)\s*$/m) || [])[1] || '';
const 房产区域 = (text.match(/^\s{6}区域:\s*(.+?)\s*$/m) || [])[1] || '';
const 工作地点 = (text.match(/^\s{4}地点:\s*(.+?)\s*$/m) || [])[1] || '';
const 日收入 = (text.match(/^\s{4}日收入:\s*(.+?)\s*$/m) || [])[1] || '';

let 错 = 0;
const 校验区域 = (label, v) => {
  const p = String(v || '').split('·').map(s => s.trim());
  const ok = p.length === 2 && districts.has(p[0]) && nodeNames.has(p[1]);
  if (!ok) { 错++; console.log(`FAIL ${label}: 「${v}」不是「真实行政区 · 真实节点名」`); return null; }
  const node = nodeByName.get(p[1]);
  if (node.district !== p[0]) {
    错++;
    console.log(`FAIL ${label}: 「${v}」区名不符，${p[1]} 实际属于 ${node.district}`);
  }
  return node;
};

console.log('谁'.padEnd(12) + '区域'.padEnd(28) + '场所'.padEnd(10) + '私密度 / 节点值 / 类型');
for (const r of rows) {
  if (!r.区域) { 错++; console.log(`FAIL ${r.who}: 没抓到 位置 块`); continue; }
  const node = 校验区域(`${r.who}.位置.区域`, r.区域);
  const np = node ? node.privacy : '-';
  console.log(
    r.who.padEnd(12) + r.区域.padEnd(26) + String(r.场所).padEnd(10) +
    `${r.私密度} / ${np} / ${node ? node.archetype : '-'}` +
    (node && node.privacy !== r.私密度 ? '   ← 与节点私密度不一致' : '')
  );
  if (node && node.privacy !== r.私密度) 错++;
}

const 住处 = rows.map(r => r.区域);
const 重复 = 住处.filter((a, i) => 住处.indexOf(a) !== i);
if (重复.length) { 错++; console.log('\nFAIL 有人住同一处: ' + [...new Set(重复)].join(' / ')); }
else console.log(`\nOK  ${住处.length} 处住所互不重复`);

校验区域('玩家.居住地', 居住地);
校验区域('玩家.房产[].区域', 房产区域);
if (居住地 !== 房产区域) { 错++; console.log(`FAIL 居住地(${居住地}) 与 房产区域(${房产区域}) 不一致`); }
else console.log('OK  居住地与房产区域一致：' + 居住地);
if (居住地 !== rows[0].区域) console.log(`注意 开局位置(${rows[0].区域})与居住地(${居住地})不同，若非刻意请核对`);

const jobNode = 校验区域('玩家.工作.地点', 工作地点);
if (jobNode) console.log(`OK  工作地点节点存在：${工作地点}（${jobNode.archetype}），日收入 ${日收入}`);

console.log(错 ? `\n共 ${错} 处问题` : '\n全部通过');
process.exit(错 ? 1 : 0);
