/**
 * opening.js 的 HOMES / JOBS 必须和 city/city_mapdata.js 的节点逐字对齐。
 * 名字一旦漂移，openingPayload 写出去的 位置.区域 / 居住地 / 工作.地点
 * 在地图、状态栏和《地图加载》里就都定位不到——这个脚本就是为了别再漂。
 * 用法：node scripts/check-opening-nodes.mjs
 */
import fs from 'node:fs';
import { readOpeningPool } from './lib/opening-pool.mjs';

global.window = {};
new Function(fs.readFileSync('city/city_mapdata.js', 'utf8'))();
const D = global.window.CITY_MAP_DATA;

const { HOMES, JOBS } = readOpeningPool();

let 错 = 0;
console.log('=== HOMES（初始住宅，只存在于开局文件） ===');
for (const h of HOMES) {
  const n = D.nodeById[h.id];
  const 问题 = [];
  if (!n) 问题.push('节点不存在');
  else {
    if (n.name !== h.name) 问题.push(`name 应为「${n.name}」`);
    if (n.district !== h.district) 问题.push(`district 应为「${n.district}」`);
  }
  if (h.fullName !== `${h.district} · ${h.name}`) 问题.push(`fullName 应为「${h.district} · ${h.name}」`);
  if (问题.length) 错++;
  console.log(
    (问题.length ? 'BAD ' : 'ok  ') + h.id.padEnd(18) + h.name.padEnd(14) +
    (n ? `${n.archetype}/私密${n.privacy}` : '').padEnd(16) +
    (问题.join('；') || '')
  );
}

console.log('=== JOBS（岗位所在节点） ===');
for (const j of JOBS) {
  if (!j.node) continue;
  const n = D.nodeById[j.node];
  const want = n ? `${n.district} · ${n.name}` : '(节点不存在)';
  const ok = j.place === want;
  if (!ok) 错++;
  console.log((ok ? 'ok  ' : 'BAD ') + j.node.padEnd(18) + j.name.padEnd(16) + j.place + (ok ? '' : `  应为 ${want}`));
}

/* 《地图静态资料》只管路网，不许出现价格/薪酬类字段——那些归按关键字触发的详情条目。
   顺带确认开局岗位节点都带上了「岗」标记、开局住宅都有精确通勤锚点。 */
const wbPath = '世界书/地图静态资料';
if (fs.existsSync(wbPath)) {
  const MAP = new Function(fs.readFileSync(wbPath, 'utf8') + '; return LJ_MAP_DATA;')();
  console.log('');

  const 禁字段 = ['homes', 'jobs'].filter(k => MAP[k]);
  if (禁字段.length) {
    错++;
    console.log(`BAD 静态资料里出现了价格/薪酬表：${禁字段.join(', ')}。这些属于详情条目，不该每轮注入`);
  } else {
    console.log('ok  静态资料不含房源表与岗位薪酬表（价格与薪酬归详情条目）');
  }

  // 节点行只该有 6 项：名称/底板/类型/私密度/时段/功能标记
  const 超长 = Object.entries(MAP.nodes).filter(([, a]) => a.length !== 6).map(([id]) => id);
  if (超长.length) {
    错++;
    console.log(`BAD 节点行字段数不是 6：${超长.slice(0, 5).join(', ')}${超长.length > 5 ? ' 等' : ''}`);
  } else {
    console.log(`ok  ${Object.keys(MAP.nodes).length} 个节点行都只有 6 项，没夹带描述文字`);
  }

  // JOBS 里含「暂时无业」（node 为 null），它不是地图上的点
  const 岗位节点 = JOBS.filter(j => j.node);
  const 缺岗标 = 岗位节点
    .filter(j => !String((MAP.nodes[j.node] || [])[5] || '').includes('岗'))
    .map(j => j.node);
  if (缺岗标.length) {
    错++;
    console.log(`BAD 开局岗位节点缺「岗」标记：${缺岗标.join(', ')}`);
  } else {
    console.log(`ok  ${岗位节点.length} 个开局岗位节点都带「岗」标记`);
  }
  const 缺锚点 = HOMES.filter(h => !MAP.commute[h.id]).map(h => h.id);
  if (缺锚点.length) {
    错++;
    console.log(`BAD 初始住宅缺通勤锚点：${缺锚点.join(', ')}`);
  } else {
    console.log('ok  初始住宅全部有精确通勤锚点');
  }
}

/* ---- city/plate_map.js 的牌面表 ----
   这是这份名单唯一还需要手抄的副本：plate_map 在 iframe 里独立运行，跨域拿不到
   opening.js。而且它漏一条的失败方式是静默的——openingNodeAllowed() 直接 return
   false，牌子不画、节点点不动，页面上什么错都不报。所以逐条比对。 */
const pm = fs.readFileSync('city/plate_map.js', 'utf8');
const objOf = (name) => {
  const at = pm.indexOf(`const ${name} = {`);
  if (at < 0) throw new Error(`plate_map.js 里找不到 ${name}`);
  let depth = 0;
  for (let i = pm.indexOf('{', at); i < pm.length; i++) {
    if (pm[i] === '{') depth++;
    else if (pm[i] === '}' && !--depth) return new Function(`${pm.slice(at, i + 1)}; return ${name};`)();
  }
  throw new Error(`${name} 括号没配平`);
};
const PM_HOME = objOf('OPENING_HOME_META');
const PM_JOB = objOf('OPENING_JOB_META');

console.log('\n=== city/plate_map.js 牌面表（地图上画不画、点不点得动） ===');
const 多余住所 = Object.keys(PM_HOME).filter(id => !HOMES.some(h => h.id === id));
const 多余岗位 = Object.keys(PM_JOB).filter(id => !JOBS.some(j => j.node === id));
for (const h of HOMES) {
  const p = PM_HOME[h.id];
  const 问题 = [];
  if (!p) 问题.push('plate_map 里没有 → 牌子不会画、节点点不动');
  else if (p.cost !== h.cost) 问题.push(`租金文案应为「${h.cost}」，现在是「${p.cost}」`);
  if (问题.length) { 错++; console.log('BAD ' + h.id.padEnd(18) + 问题.join('；')); }
}
for (const j of JOBS.filter(x => x.node)) {
  const p = PM_JOB[j.node];
  const 问题 = [];
  if (!p) 问题.push('plate_map 里没有 → 牌子不会画、节点点不动');
  else {
    const pay = `RMB ${j.monthly.toLocaleString('en-US')} / 月`;
    if (p.label !== j.name) 问题.push(`牌面名应为「${j.name}」，现在是「${p.label}」`);
    if (p.pay !== pay) 问题.push(`牌面月薪应为「${pay}」，现在是「${p.pay}」`);
    if (p.hours !== j.hours) 问题.push(`牌面班次应为「${j.hours}」，现在是「${p.hours}」`);
  }
  if (问题.length) { 错++; console.log('BAD ' + j.node.padEnd(18) + 问题.join('；')); }
}
for (const id of 多余住所) { 错++; console.log(`BAD ${id.padEnd(18)}plate_map 有、HOMES 里没有 → 画出来但选不了`); }
for (const id of 多余岗位) { 错++; console.log(`BAD ${id.padEnd(18)}plate_map 有、JOBS 里没有 → 画出来但选不了`); }
if (!多余住所.length && !多余岗位.length) {
  console.log(`ok  住所 ${HOMES.length} 处、岗位 ${JOBS.filter(j => j.node).length} 个与开局池逐条一致`);
}

/* ---- 每个城区都要有岗位 ----
   青屏山以前一个岗位都没有，等于"选了这个区就别想就近上班"，通勤卡永远是跨城那档。 */
console.log('\n=== 按城区的覆盖 ===');
for (const d of [...new Set(D.nodes.map(n => n.district))].sort()) {
  const hs = HOMES.filter(h => h.district === d);
  const js = JOBS.filter(j => j.node && D.nodeById[j.node] && D.nodeById[j.node].district === d);
  const 缺 = !hs.length || !js.length;
  if (缺) 错++;
  console.log(`${缺 ? 'BAD ' : 'ok  '}${d.padEnd(12)} 住所 ${hs.length}（${[...new Set(hs.map(h => h.tenure))].join('/') || '—'}）  岗位 ${js.length}` +
    (!js.length ? '   ← 一个岗位都没有' : '') + (!hs.length ? '   ← 一处住所都没有' : ''));
}

/* ---- 月薪与日结要对得上《收入与物价规则》 ----
   第一节：日收入 = 月收入 ÷ 22，四舍五入到 5 或 10。
   第三节：标准开局岗位月收入通常 4000~6000。 */
console.log('\n=== 薪酬口径（收入与物价规则 一、三节） ===');
for (const j of JOBS.filter(x => x.node)) {
  const 问题 = [];
  const 期望 = Math.round(j.monthly / 22 / 5) * 5;
  if (Math.abs(j.daily - 期望) > 5) 问题.push(`日结 ${j.daily} 与 月薪÷22≈${期望} 不符`);
  if (j.monthly < 4000 || j.monthly > 6200) 问题.push(`月薪 ${j.monthly} 超出开局区间 4000~6200`);
  if (问题.length) { 错++; console.log('BAD ' + j.name.padEnd(18) + 问题.join('；')); }
}
const 月薪 = JOBS.filter(x => x.node).map(x => x.monthly);
const 极差 = Math.max(...月薪) / Math.min(...月薪);
if (极差 > 2) { 错++; console.log(`BAD 最高/最低月薪 ${极差.toFixed(2)} 倍，超过"不要拉开数倍"`); }
console.log(`ok  月薪 ${Math.min(...月薪)}~${Math.max(...月薪)}，最高/最低 ${极差.toFixed(2)} 倍`);

console.log(错 ? `\n共 ${错} 处不一致` : '\n全部一致');
process.exit(错 ? 1 : 0);
