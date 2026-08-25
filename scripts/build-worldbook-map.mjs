/**
 * 把 artifacts/ai-map-dump.json 压成世界书条目《地图静态资料 - 临江市》。
 * 只保留《地图加载》真正要用的字段，全部走定长数组，键名尽量短。
 * 源数据变了就重跑：node scripts/export-ai-map.mjs && node scripts/build-worldbook-map.mjs
 */
import fs from 'node:fs';
import { readOpeningPool } from './lib/opening-pool.mjs';

const dump = JSON.parse(fs.readFileSync('artifacts/ai-map-dump.json', 'utf8'));

/** 区的方位说明。offsetKm 是 footprint 中心相对全城中心的公里偏移（x 东正，y 南正） */
/**
 * 区的方位说明。措辞跟《舞台背景》对齐（那份是叙事口径的权威），
 * 具体公里偏移仍然用 footprint 中心算出来的 offsetKm，两者一起给。
 * 底板 footprint 是正方形、总览是斜俯视，所以偏移方向和叙事方位偶有一档出入
 * （东塘叙事上是"南郊"，几何上落在西南），这时以叙事口径为准。
 */
const BEARING = {
  pujiang: '江北·全市最北',
  xizhou: '城西河西·直播产业带',
  guling: '老城西北·文化街区',
  wuxi: '老城南·市井水巷',
  minghu: '市中心·商业核心',
  yushi: '城南·枢纽地带',
  luoxia: '城东·大学城',
  qingping: '城东山地·风景区',
  dongtang: '南郊·空港与温泉'
};

/** 区域名去掉行政后缀，用来做匹配 */
const norm = s => String(s || '')
  .normalize('NFKC')
  .replace(/[\s_]+/g, '')
  .replace(/[·・‧.．]/g, '·')
  .toLowerCase();

const nodeById = Object.fromEntries(dump.nodes.map(n => [n.id, n]));

/** 时段数组压成一个串：朝昼暮夜深 → "朝昼暮夜深" */
const hoursCode = arr => (arr || []).map(h => (h === '深夜' ? '深' : h)).join('');

/* ============================================================
 * 这份静态资料只管"路怎么走"，不管"这地方长什么样"
 * ============================================================
 * 地点详情（简介、看点、本地条件、采集物、房租押金售价、岗位薪酬班次）由另一批
 * 按关键字触发的世界书条目负责。加载器只要把节点名打出来，那些条目自己会命中。
 * 所以这里刻意不存任何描述性文字和价格：
 *   - 存了 → 每轮都注入一遍，和详情条目重复，还会互相矛盾
 *   - 不存 → 加载器输出压到一半，详情由玩家实际走到哪儿按需触发
 * 这里留下的只有：名称、所属底板、类型、私密度、开放时段、功能标记，
 * 加上路网（直连/步行圈/区枢纽/住宅×工作通勤）和区位方位。
 */

/* ============================================================
 * 开局页给出的住所与岗位（opening.js 的 HOMES / JOBS）
 * 这两张表是"找工作 / 换住所"规则的基线，必须和开局页一致
 * ============================================================ */
/**
 * 开局初始住宅的节点 id 与岗位表，全部从 opening.js 读——以前这里手抄了一份，
 * 连月薪班次都是第二份数据，一漂就是"给 AI 的岗位基线和开局页说的不是一个数"。
 *
 * 住宅 id 只用来当"住宅×工作通勤矩阵"的锚点：玩家开局就住在这些点上，通勤是天天要
 * 算的数，必须精确。名称与租金不进静态资料，见下面 homes 的说明。
 */
const POOL = readOpeningPool();
const STARTER_HOME_IDS = POOL.homeIds;
const STARTER_JOBS = POOL.JOBS
  .filter(j => j.node)
  .map(j => [j.node, j.name, j.monthly, j.daily, j.hours, j.kind]);

const starterHomeIds = new Set(STARTER_HOME_IDS);
const starterJobIds = new Set(STARTER_JOBS.map(j => j[0]));

/* ============================================================
 * 组装
 * ============================================================ */
const out = {
  meta: {
    title: '临江市地理总图',
    city: '临江市',
    year: 2026,
    kmPerUnit: dump.kmPerUnit,
    span: '全城约 24 × 16 km，横穿建成区约 14 km',
    nodeCount: dump.nodes.length,
    /* 时段划分照抄 外部部署/V20260826/辅助计算脚本.js 的 periodFromClock（起点含、终点不含）。
       「朝昼暮夜深夜」是全项目通用的时段枚举，但光看这五个字读不出几点到几点，
       所以加载器把这行原样打给 AI —— 开放时段、事件触发条件、直播档期全靠它对齐。 */
    periods: '朝 06:00-09:00｜昼 09:00-16:00｜暮 16:00-19:00｜夜 19:00-23:00｜深夜 23:00-06:00',
    /* 功能标记的字典。静态资料里存的是单字，加载器负责展开成人话。 */
    flagLegend: '采=可采集 约=可约会 工=地图标了可打工 店=有商店 岗=有既存正式岗位（薪酬看详情）',
    note: '由 city_mapdata.js + city_net.js + plate_map.js 自动提炼，勿手改；改源数据后重跑 scripts/export-ai-map.mjs 与 scripts/build-worldbook-map.mjs'
  },
  // 出行参数（照抄 city_net.js，供 AI 自己估算未列出的路线）
  runtimeCustom: {
    source: 'stat_data.系统配置.地图.自建节点',
    idPrefix: 'usr_',
    routeRule: '每个玩家节点通过锚点与固定路网接驳；地图加载负责运行时合并，静态矩阵保持不变',
    detailRule: '对应详情由状态栏运行时创建为“玩家地点 - {名称}”世界书条目'
  },
  travel: {
    speed: { 步行: 4.5, 公交: 18, 地铁: 35, 驾车干道: 34, 驾车快速路: 58, 出租: 34 },
    wait: { 公交候车: 6, 进出站: 2.5, 打车等车: 4, 取车找位: 8 },
    fare: {
      地铁: '起步 2 元，超过 4 km 每 6 km +1，上限 9 元',
      公交: '每乘一次 2 元',
      出租: '起步 11 元含 3 km，之后每公里 2.6 元；夜/深夜 ×1.1',
      步行: '0 元'
    },
    stamina: '体力 = 步行km×4 + 轨道km×0.25 + 公交km×0.25 + 驾车km×0.12 + 出租km×0.1，最少 1'
  },
  districts: [],
  /* [线名, 站序, 经过的底板]。第三项让加载器只输出与当前所在区相关的线路——
     五条线全量摊开每轮六百字，而玩家一次只可能站在其中一两条上。 */
  metro: dump.metro.map(l => [
    l.name,
    l.stations.join('－'),
    [...new Set((l.onNodes || []).map(id => (nodeById[id] || {}).plate).filter(Boolean))]
  ]),
  ways: dump.ways.map(w => [w.name, w.kind]),
  nodes: {},
  link: {},
  near: {},
  hub: {},
  commute: {}
};

/* ---- 区 ---- */
for (const d of dump.districts) {
  out.districts.push({
    key: d.key,
    name: d.name,
    varName: d.dataName,
    label: d.sub,
    bearing: BEARING[d.key] || d.sub || '',
    hub: d.hub,
    hubName: nodeById[d.hub] ? nodeById[d.hub].name : d.hub,
    spanKm: d.spanKm,
    offsetKm: d.offsetKm,
    count: d.count,
    border: d.border,
    nodes: d.nodeIds
  });
}

/* ---- 节点 ----
   [名称, 区(底板), 类型, 私密度, 开放时段, 功能标记]
   功能标记：采=可采集 约=可约会 工=地图标了可打工 店=有商店 岗=开局池里有既存正式岗位
   一个描述字都不存，描述归详情条目。 */
for (const n of dump.nodes) {
  const flags = (n.f || '') + (starterJobIds.has(n.id) ? '岗' : '');
  out.nodes[n.id] = [n.name, n.plate, n.arch, n.privacy, hoursCode(n.hours), flags];
}

/* ---- 直连支路 ----
   [目标, 直线km, 步行分, 步行体力, 公交分, 公交元, 公交体力, 打车分, 打车元] */
const three = t => (t ? t : [0, 0, 0, 0]);
for (const id of Object.keys(dump.links)) {
  const rows = dump.links[id].map(l => {
    const w = three(l.walk), t = three(l.transit), x = three(l.taxi);
    return [l.to, l.km, w[0], w[3], t[0], t[2], t[3], x[0], x[2]];
  });
  if (rows.length) out.link[id] = rows;
}

/* ---- 步行圈 ---- [目标, 步行分, 体力]；公里数由 分钟 ÷ 60 × 4.5 反推，不重复存 */
for (const id of Object.keys(dump.near)) {
  const rows = dump.near[id].slice(0, 8).map(n => [n.to, n.min, n.st]);
  if (rows.length) out.near[id] = rows;
}

/* ---- 到各区枢纽 ---- { 底板key: [公交分,公交元,公交体力, 打车分,打车元, 步行分,步行体力, 路程km] } */
for (const id of Object.keys(dump.toHub)) {
  const row = {};
  for (const k of Object.keys(dump.toHub[id])) {
    const e = dump.toHub[id][k];
    const t = three(e.transit), x = three(e.taxi), w = three(e.walk);
    row[k] = [t[0], t[2], t[3], x[0], x[2], w[0], w[3], Math.round((t[1] || x[1] || w[1]) * 10) / 10];
  }
  if (Object.keys(row).length) out.hub[id] = row;
}

/* ---- 住宅 × 工作 通勤 ----
   锚点 = 开局初始住宅 + 带 housing 字段的房源。房租售价门槛一个都不存（详情的事），
   但"从住处到上班地点单程多久、多少钱、掉多少体力"是天天要用的数，必须精确。
   { 住宅id: { 工作id: [公交分,公交元,公交体力, 打车分,打车元, 步行分,步行体力, km] } } */
for (const h of Object.keys(dump.commute)) {
  const row = {};
  for (const w of Object.keys(dump.commute[h])) {
    const e = dump.commute[h][w];
    const t = three(e.transit), x = three(e.taxi), wk = three(e.walk);
    row[w] = [t[0], t[2], t[3], x[0], x[2], wk[0], wk[3], e.km];
  }
  if (Object.keys(row).length) out.commute[h] = row;
}

/* ---- 序列化：手写紧凑格式，比 JSON.stringify(null,2) 小一半还能读 ---- */
const j = v => JSON.stringify(v);
const lines = [];
lines.push('// 《地图静态资料 - 临江市》 — 由 scripts/export-ai-map.mjs + scripts/build-worldbook-map.mjs 自动生成，请勿手改。');
lines.push('// 只管"路怎么走"：区位方位、节点名与类型、直连支路、步行圈、到各区枢纽的通勤、住宅×工作通勤。');
lines.push('// 不含任何描述、看点、本地条件、采集物、房租售价、岗位薪酬——那些由按关键字触发的地点详情条目负责。');
lines.push('//');
lines.push('// nodes 每行 = [名称, 底板key, 类型, 私密度0~5, 开放时段, 功能标记]');
lines.push('//   开放时段：朝昼暮夜深（"深"=深夜）。' + out.meta.periods.replace(/｜/g, '，'));
lines.push('//   功能标记：' + out.meta.flagLegend);
lines.push('//   这两栏都是压缩存的，《地图加载》负责展开成人话再给 AI，AI 看不到这里的单字。');
lines.push('var LJ_MAP_DATA = {');
lines.push('  meta: ' + j(out.meta) + ',');
lines.push('  runtimeCustom: ' + j(out.runtimeCustom) + ',');
lines.push('  travel: ' + j(out.travel) + ',');
lines.push('  districts: [');
out.districts.forEach(d => lines.push('    ' + j(d) + ','));
lines.push('  ],');
lines.push('  metro: [');
out.metro.forEach(m => lines.push('    ' + j(m) + ','));
lines.push('  ],');
lines.push('  ways: ' + j(out.ways) + ',');
lines.push('  nodes: {');
Object.keys(out.nodes).forEach(k => lines.push(`    ${k}: ${j(out.nodes[k])},`));
lines.push('  },');
lines.push('  link: {');
Object.keys(out.link).forEach(k => lines.push(`    ${k}: ${j(out.link[k])},`));
lines.push('  },');
lines.push('  near: {');
Object.keys(out.near).forEach(k => lines.push(`    ${k}: ${j(out.near[k])},`));
lines.push('  },');
lines.push('  hub: {');
Object.keys(out.hub).forEach(k => lines.push(`    ${k}: ${j(out.hub[k])},`));
lines.push('  },');
lines.push('  commute: {');
Object.keys(out.commute).forEach(k => lines.push(`    ${k}: ${j(out.commute[k])},`));
lines.push('  }');
lines.push('};');
lines.push('');

const text = lines.join('\n');
fs.mkdirSync('世界书', { recursive: true });
fs.writeFileSync('世界书/地图静态资料', text, 'utf8');

console.log('节点', Object.keys(out.nodes).length);
console.log('直连表', Object.keys(out.link).length, '步行圈', Object.keys(out.near).length);
console.log('通勤锚点', Object.keys(out.commute).length);
console.log('字节', Buffer.byteLength(text, 'utf8'), '→ 世界书/地图静态资料');
