/* 鉴宝竞拍 · 数值模拟
 * ---------------------------------------------------------------
 * 用 arcade/auction-engine.js 跑大批场次，检查经济是否成立。
 * 关键在于：机器人只能看 session.view()，也就是玩家能看到的东西。
 * 一旦让它偷看真值，平衡结论就全是假的。
 *
 *   node scripts/sim-auction.mjs            默认 2000 场
 *   node scripts/sim-auction.mjs --n 20000
 * --------------------------------------------------------------- */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
new Function(readFileSync(join(ROOT, 'arcade', 'auction-engine.js'), 'utf8'))();
const Engine = globalThis.AIRPAuctionEngine;

const argv = process.argv.slice(2);
const argNum = (flag, def) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def;
};
const SESSIONS = argNum('--n', 2000);
const LOTS = argNum('--lots', 3);
const BUDGET = argNum('--budget', 400000);

/* ---------------------------------------------------------------
 * 参考机器人。只吃 view()：
 *   view.estimate  已探部分的价值下限（没探到的算 0）
 *   view.suggest   拍卖师给的公允估价，本质是整箱先验期望
 *   view.high      明面最高价
 * 用「下限」和「先验」里更大的那个当整箱判断，再扣掉自己要的利润率。
 * 出不过明面最高价就直接放弃 —— 密封出价里，出一口低于最高价的价毫无意义。
 * --------------------------------------------------------------- */
function play(session, margin) {
  let view = session.view();
  let guard = 0;
  while (view && view.phase === 'bidding' && guard++ < 24) {
    const guess = Math.max(view.estimate, view.suggest);
    const ceiling = Math.floor(view.budgetLeft / (1 + view.commissionRate));
    let target = Math.floor(guess * (1 - margin));
    target = Math.max(target, view.floorPrice);
    let amount = null;
    if (target > view.high && target <= ceiling && target > view.playerBest) amount = target;
    const res = session.bid(amount);
    view = res.view;
    if (res.ok === false) { session.bid(null); break; }
  }
  return session.settle();
}

function runSession(seed, kits, margin) {
  const session = Engine.createSession({
    seed, budget: BUDGET, lots: LOTS, rivalCount: 4, kits,
  });
  while (session.beginLot()) play(session, margin);
  return session;
}

function stats(list) {
  const s = list.slice().sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { mean: s.reduce((a, b) => a + b, 0) / (s.length || 1), p10: q(0.1), median: q(0.5), p90: q(0.9) };
}

/* margin 固定，只变装备 —— 否则策略和情报的贡献混在一起，看不出情报值多少 */
const MARGIN = 0.22;
const BUILDS = [
  { label: '空手（对照）', kits: [] },
  { label: '小型品鉴仪(R1轮廓)', kits: ['scope-s'] },
  { label: '估价镜(R1看清一件)', kits: ['loupe'] },
  { label: '验伪灯(R2标赝品)', kits: ['uv-lamp'] },
  { label: '大型品鉴仪(R4全品类)', kits: ['scope-l'] },
  { label: '下午茶(R1/R3轮廓)', kits: ['tea'] },
  { label: '加密出价器', kits: ['sealed-bid'] },
  { label: '小型+验伪+熟客', kits: ['scope-s', 'uv-lamp', 'regular'] },
  { label: '估价镜+熟客', kits: ['loupe', 'regular'] },
];

const pct = (v) => (v * 100).toFixed(1) + '%';
const num = (v) => Math.round(v).toLocaleString('en-US');

console.log(`鉴宝竞拍数值模拟 · ${SESSIONS} 场 × ${LOTS} 箱 · 预算 ${num(BUDGET)} · margin ${MARGIN}\n`);
console.log(['build', 'ROI', '净收益/场', '拿下率', '流拍率', '成交/真值', '评级分布'].join('\t'));

for (const build of BUILDS) {
  const nets = [];
  let lotsAll = 0, won = 0, passed = 0, spent = 0, gained = 0, paidWon = 0, grossWon = 0;
  const grades = {};
  for (let i = 0; i < SESSIONS; i++) {
    const s = runSession(i * 7919 + 13, build.kits, MARGIN);
    nets.push(s.ledger.reduce((a, e) => a + e.net, 0));
    for (const e of s.ledger) {
      lotsAll++;
      if (e.won) { won++; paidWon += e.paid; grossWon += e.gross; grades[e.grade] = (grades[e.grade] || 0) + 1; }
      if (e.winner === '流拍') passed++;
    }
    spent += s.spent; gained += s.gained;
  }
  const st = stats(nets);
  const roi = spent > 0 ? (gained - spent) / spent : 0;
  const gradeStr = Engine.GRADES.map((g) => g.id)
    .filter((g) => grades[g]).map((g) => `${g}${Math.round(grades[g] / won * 100)}`).join(' ');
  console.log([
    build.label, pct(roi), num(st.mean), pct(won / lotsAll), pct(passed / lotsAll),
    grossWon > 0 ? (paidWon / grossWon).toFixed(2) : '—', gradeStr || '—',
  ].join('\t'));
}
