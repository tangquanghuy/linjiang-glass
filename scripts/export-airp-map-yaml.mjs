/**
 * 从 city/city_mapdata.js 导出供 AI 阅读的极简地点 YAML。
 *
 * 保留：地点描述、看点、功能、特殊条件、采集、住宅、预设事件。
 * 省略：内部 id、坐标、底板、图标、颜色、空字段等程序专用信息。
 *
 * 用法：
 *   node scripts/export-airp-map-yaml.mjs
 *   node scripts/export-airp-map-yaml.mjs --source city/city_mapdata.js --out 世界书/临江市地点资料.yaml
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readArg(name, fallback) {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const sourceFile = path.resolve(ROOT, readArg('--source', 'city/city_mapdata.js'));
const outputFile = path.resolve(ROOT, readArg('--out', '世界书/临江市地点资料.yaml'));

const source = fs.readFileSync(sourceFile, 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: sourceFile });

const nodes = context.window.CITY_MAP_DATA?.nodes;
if (!Array.isArray(nodes)) {
  throw new Error(`没有从 ${sourceFile} 读取到 window.CITY_MAP_DATA.nodes`);
}

const TYPE_LABEL = {
  nature: '郊野',
  hotspring: '温泉',
  medical: '医疗',
  commercial: '商业',
  adult: '成人',
  academy: '文教',
  live: '演播',
  living: '生活',
  public: '公共',
  traffic: '交通',
  craft: '手作',
  culture: '文化'
};

const FEATURE_LABEL = {
  canGather: '采集',
  canDate: '约会',
  canWork: '打工',
  hasShop: '商店'
};

const HOUSING_TIER = {
  starter: '起步',
  advanced: '改善',
  upper: '高端',
  luxury: '豪华'
};

const HOUSING_TRANSACTION = {
  rent: '仅租',
  rent_or_buy: '可租可买'
};

const OPTION_LABEL = {
  pureLove: '纯爱',
  mischief: '调教',
  sexAction: '特殊H'
};

function oneLine(value) {
  return String(value ?? '').replace(/\s*\r?\n\s*/g, ' ').trim();
}

function yamlScalar(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value == null) return 'null';

  const text = oneLine(value);
  if (!text) return "''";

  const reserved = /^(?:null|~|true|false|yes|no|on|off)$/i.test(text);
  const numeric = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(text);
  const dateLike = /^\d{4}-\d{1,2}-\d{1,2}(?:[Tt ].*)?$/.test(text);
  const unsafeStart = /^[\-?:,\[\]{}#&*!|>'"%@`]/.test(text);
  const unsafeBody = /:\s|\s#|[\[\]{}]/.test(text);
  const edgeSpace = /^\s|\s$/.test(text);

  return reserved || numeric || dateLike || unsafeStart || unsafeBody || edgeSpace
    ? JSON.stringify(text)
    : text;
}

function yamlKey(value) {
  const text = oneLine(value);
  if (!text || /:\s|\s#|[\[\]{}]|^[\-?:,\[\]{}#&*!|>'"%@`]/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

function inlineList(values) {
  return `[${values.map(yamlScalar).join(', ')}]`;
}

function addField(lines, indent, key, value) {
  if (value == null || oneLine(value) === '') return;
  lines.push(`${' '.repeat(indent)}${yamlKey(key)}: ${yamlScalar(value)}`);
}

function addInlineList(lines, indent, key, values) {
  const list = Array.isArray(values) ? values.filter(v => v != null && oneLine(v) !== '') : [];
  if (!list.length) return;
  lines.push(`${' '.repeat(indent)}${yamlKey(key)}: ${inlineList(list)}`);
}

function addBulletList(lines, indent, key, values) {
  const list = Array.isArray(values) ? values.filter(v => v != null && oneLine(v) !== '') : [];
  if (!list.length) return;
  lines.push(`${' '.repeat(indent)}${yamlKey(key)}:`);
  for (const value of list) lines.push(`${' '.repeat(indent + 2)}- ${yamlScalar(value)}`);
}

function addTrigger(lines, trigger, indent) {
  if (!trigger || typeof trigger !== 'object' || !Object.keys(trigger).length) return;
  lines.push(`${' '.repeat(indent)}触发条件:`);
  for (const [key, value] of Object.entries(trigger)) {
    if (Array.isArray(value)) addInlineList(lines, indent + 2, key, value);
    else addField(lines, indent + 2, key, value);
  }
}

function addOptions(lines, card, indent) {
  if (!card || typeof card !== 'object') return;
  const options = Object.entries(card).filter(([, option]) => option && typeof option === 'object');
  if (!options.length) return;

  lines.push(`${' '.repeat(indent)}选项:`);
  for (const [kind, option] of options) {
    const category = option.分类 || OPTION_LABEL[kind] || kind;
    lines.push(`${' '.repeat(indent + 2)}- 分类: ${yamlScalar(category)}`);
    addField(lines, indent + 4, '门槛', option.门槛);
    addField(lines, indent + 4, '选项', option.选项);
    // 正文美化的 evtParseGains 按中英文逗号拆分；这里保留字符串，不加 YAML 方括号。
    addField(lines, indent + 4, '结算', option.结算);
  }
}

function addEvents(lines, events, indent) {
  const list = Array.isArray(events) ? events.filter(Boolean) : [];
  if (!list.length) return;

  lines.push(`${' '.repeat(indent)}可触发事件:`);
  for (const event of list) {
    lines.push(`${' '.repeat(indent + 2)}- 标题: ${yamlScalar(event.title || '未命名事件')}`);
    addField(lines, indent + 4, '场所', event.场所);
    addField(lines, indent + 4, '优先级', event.优先级);
    addTrigger(lines, event.trigger, indent + 4);
    addField(lines, indent + 4, '简述', event.opportunity);
    addOptions(lines, event.card, indent + 4);
  }
}

function addGather(lines, gather, indent) {
  if (!gather || typeof gather !== 'object') return;
  const materials = Array.isArray(gather.materials) ? gather.materials.filter(Boolean) : [];
  if (!oneLine(gather.desc) && !materials.length) return;

  lines.push(`${' '.repeat(indent)}采集:`);
  addField(lines, indent + 2, '说明', gather.desc);
  addInlineList(lines, indent + 2, '物品', materials);
}

function addHousing(lines, housing, nodePrivacy, indent) {
  if (!housing || typeof housing !== 'object') return;

  lines.push(`${' '.repeat(indent)}住宅:`);
  addField(lines, indent + 2, '档次', HOUSING_TIER[housing.tier] || housing.tier);
  addField(lines, indent + 2, '交易', HOUSING_TRANSACTION[housing.transaction] || housing.transaction);
  if (Number(housing.rent) > 0) addField(lines, indent + 2, '月租', housing.rent);
  if (Number(housing.deposit) > 0) addField(lines, indent + 2, '押金', housing.deposit);
  if (Number(housing.sale) > 0) addField(lines, indent + 2, '售价', housing.sale);
  if (housing.privacy != null && housing.privacy !== nodePrivacy) {
    addField(lines, indent + 2, '私密度', housing.privacy);
  }
  if (Number(housing.unlock?.minMoney) > 0) {
    addField(lines, indent + 2, '解锁条件', `金钱 ≥ ${housing.unlock.minMoney}`);
  }
  addField(lines, indent + 2, '说明', housing.note);
}

const lines = [
  '# 临江市地点资料：由 scripts/export-airp-map-yaml.mjs 自动生成，请修改源数据后重新导出。',
  '# 供 AI 阅读；已省略内部 id、坐标、图标、底板和空字段。',
  '# 私密度：0=公开，1=街面，2=转角，3=僻静，4=私密，5=独用。',
  '地点:'
];

let eventCount = 0;
let gatherCount = 0;
let housingCount = 0;

for (const node of nodes) {
  lines.push(`  ${yamlKey(node.name)}:`);
  addField(lines, 4, '区域', node.district);
  addField(lines, 4, '类型', TYPE_LABEL[node.archetype] || node.archetype);
  addField(lines, 4, '私密度', node.privacy);
  addInlineList(lines, 4, '开放', node.openHours || []);
  addField(lines, 4, '详情', node.intro);
  addField(lines, 4, '看点', node.draw);

  const features = Object.entries(node.features || {})
    .filter(([key, enabled]) => enabled && FEATURE_LABEL[key])
    .map(([key]) => FEATURE_LABEL[key]);
  addInlineList(lines, 4, '功能', features);
  addBulletList(lines, 4, '特殊', node.special || []);

  if (node.gather && (oneLine(node.gather.desc) || node.gather.materials?.length)) {
    addGather(lines, node.gather, 4);
    gatherCount += 1;
  }
  if (node.housing) {
    addHousing(lines, node.housing, node.privacy, 4);
    housingCount += 1;
  }
  if (node.events?.length) {
    addEvents(lines, node.events, 4);
    eventCount += node.events.length;
  }
}

lines.push('');
const output = lines.join('\n');
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, output, 'utf8');

console.log(`地点 ${nodes.length}，事件 ${eventCount}，采集 ${gatherCount}，住宅 ${housingCount}`);
console.log(`${Buffer.byteLength(output, 'utf8')} bytes → ${path.relative(ROOT, outputFile)}`);
