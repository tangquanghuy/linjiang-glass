/* 环境流量的实际增量分布：跑 60 拍，量每拍加了多少、收敛在哪。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { parseMiniYaml } = require('./mini-yaml.cjs');

const stat = parseMiniYaml(fs.readFileSync(path.join(ROOT, '酒馆变量/变量初始化'), 'utf8'));
const store = { stat_data: stat };
global.Mvu = { events: { VARIABLE_UPDATE_ENDED: 'x' }, getMvuData: () => store, replaceMvuData: (n) => { store.stat_data = n.stat_data; } };
global.toastr = global.eventOn = global.waitGlobalInitialized = undefined;
const w = {}; w.parent = w; w.SillyTavern = { getContext: () => ({ chat: [{ mes: '无卡片' }] }) };
global.window = w;
new Function(fs.readFileSync(path.join(ROOT, '外部部署/辅助计算脚本.js'), 'utf8'))();
const aux = globalThis.LinjiangAux;

const S = () => store.stat_data;
S().世界信息.年历 = '2026年4月2日';
S().世界信息.日期显示.星期 = '周四';
S().世界信息.时间.时段 = '夜';
S().对象信息.东雪莲.直播.开播 = true;
S().对象信息.东雪莲.直播.标题 = 'x';

const room = () => S().系统配置.直播间.东雪莲;
const base = room().底盘热度;
const adds = [];
const series = [];
let prev = 0;
for (let i = 0; i < 60; i += 1) {
  const before = JSON.parse(JSON.stringify(S()));
  S().世界信息.时间.时钟 = `${21 + Math.floor(i / 12)}:${String((i % 12) * 5).padStart(2, '0')}`;
  S().对象信息.东雪莲.直播.开播 = true;
  aux.handleVariableUpdate({ stat_data: S() }, { stat_data: before });
  const s = Number(room().本场热度) || 0;
  adds.push(s - Math.floor(prev * 0.9));
  series.push(s);
  prev = s;
}
const mean = adds.reduce((a, b) => a + b, 0) / adds.length;
console.log('底盘', base, '| 每拍加的均值', mean.toFixed(0), `= 底盘的 ${(mean / base * 100).toFixed(2)}%`,
  '| 理论上限', (base * 0.06).toFixed(0));
console.log('后 20 拍的本场热度:', series.slice(-20).join(' '));
const tail = series.slice(-30);
const avg = tail.reduce((a, b) => a + b, 0) / tail.length;
console.log('尾段均值', avg.toFixed(0), `= 底盘的 ${(avg / base * 100).toFixed(0)}%`,
  `| 总热度 ≈ ${(1 + avg / base).toFixed(2)} 倍底盘`);
