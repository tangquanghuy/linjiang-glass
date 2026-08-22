/**
 * 把 artifacts/ai-map-dump.json 压成世界书条目《地图静态资料 - 临江市》。
 * 只保留《地图加载》真正要用的字段，全部走定长数组，键名尽量短。
 * 源数据变了就重跑：node scripts/export-ai-map.mjs && node scripts/build-worldbook-map.mjs
 */
import fs from 'node:fs';

const dump = JSON.parse(fs.readFileSync('artifacts/ai-map-dump.json', 'utf8'));

/** 区的方位说明。offsetKm 是 footprint 中心相对全城中心的公里偏移（x 东正，y 南正） */
const BEARING = {
  pujiang: ['城北 · 江北岸', '过临江大桥或过江隧道才到，1 号线北端；园区、城中村与人才公寓混杂'],
  xizhou: ['城西', '直播产业带：剧院、录音棚、电竞舱、Livehouse 和保税仓都在这一片'],
  guling: ['城西偏中', '文化街区：老洋房、买手店、书店、菜场、诊所，生活配套最密'],
  wuxi: ['城南偏西 · 老城', '老城南：明清街巷、扎染工坊、茶馆书场，也有情趣酒店和浴室'],
  minghu: ['市中心', '全市 CBD：百货、影院、医院、银行、市民中心、环湖绿道'],
  yushi: ['城南', '城南枢纽：临江南站、水产批发、船坞、轮渡与集装箱堆场'],
  luoxia: ['城东南', '大学城：图书馆、实验楼、食堂、大排档、公交枢纽、合租与太空舱'],
  qingping: ['城东 · 山区', '风景区：栈道、索道、瀑布、古刹、露营地，末班公交早，夜间脱管'],
  dongtang: ['城西南 · 远郊', '空港与温泉：机场 T2、奥莱、驾培、卡丁车、水库、农家民宿']
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

const HOUSE_TIER = { starter: '初始', advanced: '进阶', upper: '中高级', luxury: '高级' };
const DEAL = { rent_or_buy: '租或买', rent: '仅租', buy: '仅买' };

/* ============================================================
 * 开局页给出的住所与岗位（opening.js 的 HOMES / JOBS）
 * 这两张表是"找工作 / 换住所"规则的基线，必须和开局页一致
 * ============================================================ */
const STARTER_HOMES = [
  ['lx_share', '落霞合租屋', '合租', 1800, 3600, '大学城南的普通两居合租，租金低，隔音一般'],
  ['pj_apt', '浦江人才公寓', '租住', 2600, 5200, '园区外的小户型人才公寓，适合园区通勤'],
  ['gl_yunting', '鼓岭云庭公寓', '租住', 3200, 6400, '老城精装单间，日常配套完整'],
  ['xz_jiayuan', '西洲嘉苑', '租住', 3900, 7800, '靠近直播产业带的高层单间'],
  ['gl_wutong', '梧桐里步行房', '租住', 2200, 4400, '老城区步行房，生活方便，楼梯和邻里声较近'],
  ['pj_village', '浦江城中村单间', '租住', 1500, 3000, '租金最低，离园区近，公共空间紧凑'],
  ['wx_home', '乌溪自宅', '自有', 0, 0, '带小型药剂工坊的自有住宅，无月租'],
  ['mh_youth_apt', '明湖青年公寓', '租住', 3200, 3200, '城区小单间，公交和生活配套方便'],
  ['dt_town_rental', '东塘镇口出租屋', '租住', 1400, 1400, '镇口低租单间，生活成本低但进城较远'],
  ['qp_foothill_share', '青屏山脚合租院', '合租', 1800, 1800, '独立卧室、共用厨房，末班公交较早']
];

const STARTER_JOBS = [
  ['lx_print', '打印店店员', 4500, 205, '09:00-18:00', 'service'],
  ['gl_parcel', '快递驿站店员', 4800, 220, '08:30-18:30', 'service'],
  ['mh_mart', '便利店店员', 4700, 215, '14:00-22:00', 'service'],
  ['xz_esports', '电竞舱值班员', 5200, 235, '16:00-00:00', 'live'],
  ['dt_gas', '加油站夜班店员', 5600, 255, '20:00-06:00', 'service'],
  ['xz_sound_studio', '录音棚助理', 5400, 245, '11:00-20:00', 'live'],
  ['xz_theatre', '剧院场务', 4600, 210, '13:00-22:00', 'live'],
  ['gl_pet', '宠物诊疗所助理', 5000, 225, '10:00-19:00', 'medical'],
  ['mh_hospital', '医院前台助理', 5800, 260, '08:00-17:00', 'medical'],
  ['lx_lab', '实验楼值班助理', 6000, 270, '18:00-02:00', 'academy'],
  ['ys_rdpark', '研创园行政助理', 6200, 280, '09:30-18:30', 'office'],
  ['wx_dye', '扎染作坊学徒', 4200, 190, '10:00-19:00', 'craft']
];

const starterHomeIds = new Set(STARTER_HOMES.map(h => h[0]));
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
    note: '由 city_mapdata.js + city_net.js + plate_map.js 自动提炼，勿手改；改源数据后重跑 scripts/export-ai-map.mjs 与 scripts/build-worldbook-map.mjs'
  },
  // 出行参数（照抄 city_net.js，供 AI 自己估算未列出的路线）
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
  metro: dump.metro.map(l => [l.name, l.stations.join('－')]),
  ways: dump.ways.map(w => [w.name, w.kind]),
  nodes: {},
  link: {},
  near: {},
  hub: {},
  homes: {},
  jobs: {},
  commute: {}
};

/* ---- 区 ---- */
for (const d of dump.districts) {
  const b = BEARING[d.key] || ['', ''];
  out.districts.push({
    key: d.key,
    name: d.name,
    varName: d.dataName,
    label: d.sub,
    bearing: b[0],
    desc: b[1],
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
   [名称, 区(底板), 类型, 私密度, 开放时段, 功能标记, 简述, 看点, 特殊, 采集物] */
for (const n of dump.nodes) {
  out.nodes[n.id] = [
    n.name,
    n.plate,
    n.arch,
    n.privacy,
    hoursCode(n.hours),
    n.f || '',
    n.brief || '',
    n.draw || '',
    // 特殊条件是 AI 编不出来的本地规则（几点没人巡、哪儿是视觉死角），留 2 条
    (n.special || []).slice(0, 2),
    // 采集物只在 canGather 的点有意义，留 4 种
    (n.f || '').includes('采') ? (n.mats || []).slice(0, 4) : []
  ];
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

/* ---- 住所表 ----
   开局十处 + city_mapdata 里带 housing 的进阶房。
   [显示名, 产权, 月租, 押金, 售价, 门槛金钱, 档位, 备注] */
for (const [id, name, tenure, rent, deposit, note] of STARTER_HOMES) {
  out.homes[id] = [name, tenure, rent, deposit, 0, 0, '初始', note];
}
for (const n of dump.nodes) {
  if (!n.housing) continue;
  const h = n.housing;
  out.homes[n.id] = [
    n.name,
    h.deal === 'rent' ? '租住' : '租或买',
    h.rent || 0,
    h.deposit || 0,
    h.sale || 0,
    h.minMoney || 0,
    HOUSE_TIER[h.tier] || h.tier || '',
    (DEAL[h.deal] || h.deal || '') + (h.minMoney ? `，需存款≥${h.minMoney}` : '')
  ];
}

/* ---- 岗位表 ---- [岗位名, 月薪, 日结, 班次, 类别] */
for (const [id, name, monthly, daily, hours, kind] of STARTER_JOBS) {
  out.jobs[id] = [name, monthly, daily, hours, kind];
}
// city_mapdata 里 features.canWork 的点：地图承认"这里可能招人"，但没有预设岗位
for (const n of dump.nodes) {
  if (!(n.f || '').includes('工') || out.jobs[n.id]) continue;
  out.jobs[n.id] = ['（可打工，岗位与薪酬按收入规则现场确定）', 0, 0, '按节点开放时段', n.arch];
}

/* ---- 住宅 × 工作 通勤 ----
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
lines.push('// 只保留《地图加载 - 临江市》要用的字段：区、节点摘要、直连支路、步行圈、到各区枢纽的通勤、住所与岗位表。');
lines.push('var LJ_MAP_DATA = {');
lines.push('  meta: ' + j(out.meta) + ',');
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
lines.push('  homes: {');
Object.keys(out.homes).forEach(k => lines.push(`    ${k}: ${j(out.homes[k])},`));
lines.push('  },');
lines.push('  jobs: {');
Object.keys(out.jobs).forEach(k => lines.push(`    ${k}: ${j(out.jobs[k])},`));
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
console.log('住所', Object.keys(out.homes).length, '岗位', Object.keys(out.jobs).length);
console.log('字节', Buffer.byteLength(text, 'utf8'), '→ 世界书/地图静态资料');
