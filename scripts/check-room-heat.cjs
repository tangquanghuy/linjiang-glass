/**
 * 观众热度的干跑测试：拿 变量初始化 当初始状态，假造 Mvu 和一条带 <LiveRoom> 的楼层，
 * 反复过 handleVariableUpdate，看
 *   1) 弹幕结算加了多少、同一条消息重复触发会不会重复加（幂等）
 *   2) swipe 换内容后会不会重新结算
 *   3) 环境流量对没人看的房间有没有效、收敛在什么位置
 *   4) 上限和白名单外礼物有没有被挡住
 * 不需要酒馆，node 直接跑。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { parseMiniYaml } = require('./mini-yaml.cjs');

const stat = parseMiniYaml(fs.readFileSync(path.join(ROOT, '酒馆变量/变量初始化'), 'utf8'));
const store = { stat_data: stat };
global.Mvu = {
  events: { VARIABLE_UPDATE_ENDED: 'x' },
  getMvuData: () => store,
  replaceMvuData: (next) => { store.stat_data = next.stat_data; },
};
global.toastr = undefined;
global.eventOn = undefined;
global.waitGlobalInitialized = undefined;

/* latestMessage() 读 window.parent.SillyTavern.getContext().chat。
   这里假造一份，chatText 变量控制当前楼层内容。 */
let chatText = '';
const fakeWin = {};
fakeWin.parent = fakeWin;
fakeWin.SillyTavern = { getContext: () => ({ chat: [{ is_user: true, mes: '（玩家）' }, { mes: chatText }] }) };
global.window = fakeWin;

/* 读逻辑那份。外部部署/V20260826/辅助计算脚本.js 拆分后只剩礼物表和占位 api，
   没有 settleRoomsFromText。见 scripts/build-aux-shell.mjs。 */
const src = fs.readFileSync(path.join(ROOT, 'public/shell/aux-shell.js'), 'utf8');
new Function(src)();
const aux = globalThis.LinjiangAux;
if (!aux || !aux.settleRoomsFromText) throw new Error('LinjiangAux.settleRoomsFromText 没挂上');

const S = () => store.stat_data;
const room = (n) => S().系统配置.直播间[n];
const live = (n) => S().对象信息[n].直播;
const show = (label, n) => console.log(
  `  ${label.padEnd(22)} 本场=${String(room(n).本场热度).padStart(6)}  直播.热度=${String(live(n).热度).padStart(6)}  (底盘 ${room(n).底盘热度})`
);

// 周四 21:00，塔菲档期 20:00–23:30；东雪莲档期 21:30–00:30 也在播
S().世界信息.年历 = '2026年4月2日';
S().世界信息.日期显示.星期 = '周四';
S().世界信息.时间.时钟 = '21:00';
S().世界信息.时间.时段 = '夜';
live('塔菲').开播 = true;
live('塔菲').标题 = '晚间杂谈';
live('东雪莲').开播 = true;
live('东雪莲').标题 = '深夜杂谈';

const danmu = (n, gift) => {
  const lines = [];
  for (let i = 0; i < n; i += 1) lines.push(`- 类型: 普通 名字: 观众${i} 牌子: 雏草姬 ${i % 20 + 1} 内容: 第${i}条`);
  lines.push('- 类型: 进入 名字: 路人甲');
  lines.push('- 类型: 系统 内容: 有人被禁言');
  if (gift) lines.push(gift);
  return `<LiveRoom>\n主播: 塔菲\n弹幕:\n${lines.join('\n')}\n</LiveRoom>`;
};

// 干跑一轮 VARIABLE_UPDATE_ENDED。before 用改动前的深拷贝。
const tick = (text) => {
  chatText = text == null ? chatText : text;
  const before = JSON.parse(JSON.stringify(S()));
  aux.handleVariableUpdate({ stat_data: S() }, { stat_data: before });
};

console.log('=== 只看不花钱：一轮 20 条发言 + 一条辣条x10 ===');
tick(danmu(20, '- 类型: 礼物 名字: 鼓岭晚风 礼物: 辣条 数量: 10'));
show('第一次结算', '塔菲');
console.log('  结算标记:', room('塔菲').本场结算);

console.log('\n=== 幂等：同一条消息再过三轮 ===');
tick(); show('第 2 次', '塔菲');
tick(); show('第 3 次', '塔菲');
tick(); show('第 4 次', '塔菲');

console.log('\n=== swipe：换成 25 条发言 + 一发火箭 ===');
tick(danmu(25, '- 类型: 礼物 名字: 浦江房东 礼物: 火箭 数量: 1'));
show('重新结算', '塔菲');

console.log('\n=== 白名单外的礼物 / 超量礼物条数 ===');
const base = room('塔菲').底盘热度;
console.log('  20 条发言 =', aux.danmuHeat(Array.from({ length: 20 }, () => ({ 类型: '普通' })), base).人气,
  `（底盘 ${base} × 0.15% × 20）`);
console.log('  野鸡礼物  =', JSON.stringify(aux.danmuHeat([{ 类型: '礼物', 礼物: '航空母舰', 数量: 1 }], base)));
console.log('  八发火箭  =', JSON.stringify(aux.danmuHeat(
  Array.from({ length: 8 }, () => ({ 类型: '礼物', 礼物: '火箭', 数量: 1 })), base)));
console.log('  醒目留言100 =', JSON.stringify(aux.danmuHeat([{ 类型: '醒目留言', 金额: 100 }], base)));

console.log('\n=== 环境流量：没人看的东雪莲，推 60 拍时钟看收敛 ===');
chatText = '（这一轮正文里没有直播间卡片）';
const b = room('东雪莲').底盘热度;
const series = [];
for (let i = 0; i < 60; i += 1) {
  const before = JSON.parse(JSON.stringify(S()));
  S().世界信息.时间.时钟 = `${21 + Math.floor(i / 12)}:${String((i % 12) * 5).padStart(2, '0')}`;
  live('东雪莲').开播 = true;           // 档期只到 00:30，这里按「一直在播」压着测
  aux.handleVariableUpdate({ stat_data: S() }, { stat_data: before });
  series.push(Number(room('东雪莲').本场热度) || 0);
  if (i === 0 || i === 4 || i === 11 || i === 29 || i === 59) show(`第 ${i + 1} 拍`, '东雪莲');
}
const tail = series.slice(-30);
const avg = tail.reduce((x, y) => x + y, 0) / tail.length;
console.log(`  尾 30 拍本场热度均值 ${avg.toFixed(0)} = 底盘 ${b} 的 ${(avg / b * 100).toFixed(0)}%`
  + `，总热度约 ${(1 + avg / b).toFixed(2)} 倍底盘`);
console.log('  （每拍 +底盘×[0,6%]、每拍 ×0.9 衰减，理论稳态 = 3%/10% = 底盘的 30%）');

console.log('\n=== 下播：本场热度和结算标记都清掉 ===');
live('塔菲').开播 = false;
tick();
console.log('  本场热度 =', room('塔菲').本场热度, '| 结算标记 =', JSON.stringify(room('塔菲').本场结算),
  '| 直播.热度 =', live('塔菲').热度, '| 底盘 =', room('塔菲').底盘热度);
