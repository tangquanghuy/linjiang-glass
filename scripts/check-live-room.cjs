/**
 * 直播间状态机的干跑测试：拿 变量初始化 当初始状态，假造一个 Mvu，
 * 然后按玩家的操作顺序调 LinjiangAux.roomAction，看榜、热度、钱、牌子对不对。
 * 不需要酒馆，node 直接跑。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const { parseMiniYaml } = require('./mini-yaml.cjs');

const stat = parseMiniYaml(fs.readFileSync(path.join(ROOT, '酒馆变量/变量初始化'), 'utf8'));

// --- 假 Mvu：一份内存里的 stat_data ---
const store = { stat_data: stat };
global.Mvu = {
  events: { VARIABLE_UPDATE_ENDED: 'x' },
  getMvuData: () => store,
  replaceMvuData: (next) => { store.stat_data = next.stat_data; },
};
global.toastr = undefined;
global.eventOn = undefined;
global.waitGlobalInitialized = undefined;
// 脚本末尾判断 isBrowser，node 里没有 window/document 所以不会自己 init
/* 读的是逻辑那份，不是 外部部署/V20260826/辅助计算脚本.js。
   后者从「拆成引导版 + 线上逻辑」之后只剩礼物表加一个占位 roomAction（约 6.5KB），
   拿它跑这个干跑测试会立刻死在 aux.roomAction 上 —— 而且死得莫名其妙。
   逻辑的唯一源头是 public/shell/aux-shell.js，粘贴那份由 scripts/build-aux-shell.mjs 从它生成。 */
const src = fs.readFileSync(path.join(ROOT, 'public/shell/aux-shell.js'), 'utf8');
new Function(src)();
const aux = globalThis.LinjiangAux;
if (!aux || !aux.roomAction) throw new Error('LinjiangAux.roomAction 没挂上');

const yen = (n) => '￥' + Number(n || 0).toLocaleString('en-US');
const board = (view) => view.高能榜.slice(0, 4)
  .map((r, i) => `${i + 1}.${r.名字} ${yen(r.本场消费)}`).join('  ');

/* 变量初始化 的日期是 2026年4月1日 = 周三，正好是塔菲的休播日，
   driveStreams 会把她判成不开播、然后清掉热度。挪到周四并对上她的档期 20:00–23:30。 */
store.stat_data.世界信息.年历 = '2026年4月2日';
store.stat_data.世界信息.日期显示.星期 = '周四';
store.stat_data.世界信息.时间.时钟 = '21:00';
store.stat_data.世界信息.时间.时段 = '夜';
store.stat_data.对象信息.塔菲.直播.开播 = true;
store.stat_data.对象信息.塔菲.直播.标题 = '晚间杂谈与SC回';

console.log('=== 进房前：榜是空的吗 ===');
console.log('高能榜:', JSON.stringify(store.stat_data.系统配置.直播间.塔菲.高能榜));

let view = aux.roomView('塔菲');
console.log('\n=== 进房后（seedRoom 生成对手）===');
console.log('牌子名:', view.牌子名, '| 档期:', view.档期);
console.log('底盘热度:', view.底盘热度, '| 当前热度:', view.热度, '| 粉丝数:', view.粉丝数);
console.log('大航海:', JSON.stringify(view.大航海.舰长) + '舰长', '名单', view.大航海.名单.map(x => x.名字 + '/' + x.档位).join(', '));
console.log('高能榜:', board(view));
console.log('钱:', yen(view.金钱));

const steps = [
  ['礼物', { 礼物: '辣条', 数量: 10 }],
  ['礼物', { 礼物: '干杯', 数量: 1 }],
  ['礼物', { 礼物: '情书', 数量: 1 }],
  ['礼物', { 礼物: '小飞机', 数量: 1 }],
  ['礼物', { 礼物: '火箭', 数量: 1 }],
  ['大航海', { 礼物: '舰长' }],
];
console.log('\n=== 一场消费 ===');
for (const [动作, extra] of steps) {
  const r = aux.roomAction({ 主播: '塔菲', 动作, ...extra });
  if (!r.ok) { console.log('  失败:', r.提示); continue; }
  view = r.快照;
  const rank = view.高能榜.findIndex(x => x.名字 === '你') + 1;
  console.log(`  ${动作} ${extra.礼物}${extra.数量 > 1 ? '×' + extra.数量 : ''}`.padEnd(18)
    + `花 ${yen(r.花费).padEnd(9)} 热度+${String(r.人气).padEnd(6)} → ${view.热度}`.padEnd(34)
    + `我第${rank}名  牌子Lv.${view.牌子等级}`
    + (r.还手 ? `  ← ${r.还手.名字} 还手 ${yen(r.还手.金额)}` : ''));
}
console.log('  余额:', yen(view.金钱), '| 累计打赏:', yen(view.累计打赏), '| 牌子档位:', view.牌子档位 || '无');
console.log('  高能榜:', board(view));

console.log('\n=== 连送递减：连刷同一件 vs 换着送 ===');
for (let i = 0; i < 5; i++) {
  const r = aux.roomAction({ 主播: '塔菲', 动作: '礼物', 礼物: '干杯', 数量: 1 });
  console.log(`  连刷第${i + 1}笔 干杯    人气 +${String(r.人气).padEnd(4)}（不折是 70）`);
}
console.log('  ---- 换一件礼物应该重置 ----');
for (const g of ['辣条', '干杯', '情书']) {
  const unit = { 辣条: 8, 干杯: 70, 情书: 400 }[g];
  const r = aux.roomAction({ 主播: '塔菲', 动作: '礼物', 礼物: g, 数量: 1 });
  console.log(`  换送 ${g.padEnd(4)}        人气 +${String(r.人气).padEnd(4)}（不折是 ${unit}）`);
}
console.log('  ---- 单笔内部也要递减：一次 233 个辣条 ----');
const spam = aux.roomAction({ 主播: '塔菲', 动作: '礼物', 礼物: '辣条', 数量: 233 });
console.log(`  辣条×233        花 ${yen(spam.花费)}  人气 +${spam.人气}（线性会是 ${233 * 8}）`);

console.log('\n=== 本场热度衰减（时钟推进）===');
const room = store.stat_data.系统配置.直播间.塔菲;
console.log('  衰减前 本场热度:', room.本场热度, '| 直播.热度:', store.stat_data.对象信息.塔菲.直播.热度);
for (let i = 1; i <= 8; i++) {
  const before = JSON.parse(JSON.stringify(store.stat_data));
  store.stat_data.世界信息.时间.时钟 = '21:' + String(i * 5).padStart(2, '0');
  aux.handleVariableUpdate({ stat_data: store.stat_data }, { stat_data: before });
  console.log(`  第${i}拍  本场热度 ${String(room.本场热度).padEnd(7)} 直播.热度 ${store.stat_data.对象信息.塔菲.直播.热度}  开播 ${store.stat_data.对象信息.塔菲.直播.开播}`);
}

console.log('\n=== 榜一还手：连抢十次，看三成概率和预算封顶 ===');
store.stat_data.玩家信息.金钱 = 50000;
let strikes = 0;
for (let i = 0; i < 10; i++) {
  const r = aux.roomAction({ 主播: '塔菲', 动作: '礼物', 礼物: '情书', 数量: 1 });
  if (r.还手) { strikes += 1; console.log(`  第${i + 1}次抢榜 → ${r.还手.名字} 还手 ${yen(r.还手.金额)}，预算剩 ${yen(room.还手预算)}`); }
}
console.log(`  十次里还手 ${strikes} 次（期望约 3 次），预算剩 ${yen(room.还手预算)}`);

console.log('\n=== 余额不足要拒绝 ===');
store.stat_data.玩家信息.金钱 = 100;
const poor = aux.roomAction({ 主播: '塔菲', 动作: '大航海', 礼物: '总督' });
console.log('  买总督:', poor.ok ? '通过了（不对）' : '已拒绝 —— ' + poor.提示, '| 钱还是', yen(store.stat_data.玩家信息.金钱));

console.log('\n=== 种子稳定性：重进房间对手不变 ===');
const again = aux.roomView('塔菲');
console.log('  ' + board(again));

console.log('\n=== 下播清场 ===');
const before2 = JSON.parse(JSON.stringify(store.stat_data));
store.stat_data.对象信息.塔菲.直播.开播 = false;
aux.handleVariableUpdate({ stat_data: store.stat_data }, { stat_data: before2 });
console.log('  直播:', JSON.stringify(store.stat_data.对象信息.塔菲.直播));
console.log('  本场热度:', room.本场热度, '| 底盘热度:', room.底盘热度, '（底盘不该被清）');
