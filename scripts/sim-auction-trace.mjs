/* 单局逐回合追踪：看密封出价的走势、情报卡节奏、各人上限。
 *   node scripts/sim-auction-trace.mjs [seed]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
new Function(readFileSync(join(ROOT, 'arcade', 'auction-engine.js'), 'utf8'))();
const Engine = globalThis.AIRPAuctionEngine;

const seed = Number(process.argv[2] || 20260830);
const session = Engine.createSession({
  seed, budget: 400000, lots: 1, rivalCount: 4,
  kits: ['scope-s', 'uv-lamp', 'regular'],
});
let step = session.beginLot();
const truth = session._truth();
const n = (v) => Math.round(v).toLocaleString('en-US');

console.log(`主题 ${truth.lot.theme}  件数 ${truth.lot.items.length}  赝品 ${truth.lot.fakeCount}`);
console.log(`先验 ${n(truth.lot.prior)}  真值 ${n(truth.lot.trueValue)}  起拍 ${n(truth.lot.prior * 0.12)}`);
console.log('装备位', session.slotUsed, '/', Engine.INSTRUMENT_SLOTS);
console.log('竞拍人上限:', truth.rivals.map((r) => `${r.name} ${n(r.cap)}`).join(' | '), '\n');

let view = step.view;
for (let guard = 0; guard < 12 && view.phase === 'bidding'; guard++) {
  console.log(`— 第 ${view.round} 回合  当前估价 ${n(view.estimate)}  明面最高 ${n(view.high)}  推荐 ${n(view.suggest)}`);
  for (const c of (step.cards || [])) console.log(`   [${c.source}] ${c.title}：${c.text}`);
  /* 机器人策略：出到「当前估价 + 未探部分按先验补足」的八成 */
  const target = Math.max(view.floorPrice, Math.round(view.high * 1.05), Math.round(view.estimate * 0.9));
  const amount = target <= view.budgetLeft / (1 + view.commissionRate) ? target : null;
  step = session.bid(amount);
  for (const e of step.events) if (e.text) console.log('     ', e.text);
  view = step.view;
}
const out = session.settle();
console.log('\n各人出价轨迹:');
for (const r of view.rivals) console.log(`  ${r.name.padEnd(6)}`, r.bids.map((b) => (b == null ? '–' : n(b))).join('  '));
console.log(`  ${'你'.padEnd(6)}`, view.playerBids.map((b) => (b == null ? '–' : n(b))).join('  '));
console.log('\n结算:', JSON.stringify(out.entry, null, 1));
