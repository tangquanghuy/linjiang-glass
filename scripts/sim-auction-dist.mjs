/* 箱体真值分布探针：看 真值/先验期望 的分位数。
 * 偏斜过大（中位数远低于 1）意味着任何锚定期望值的出价都在系统性高估，
 * 这种分布做不出「捡漏」手感，只会做出「箱箱亏钱，偶尔暴富」。
 *   node scripts/sim-auction-dist.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
new Function(readFileSync(join(ROOT, 'arcade', 'auction-engine.js'), 'utf8'))();
const Engine = globalThis.AIRPAuctionEngine;

const N = Number(process.argv[2] || 30000);
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

const byTheme = new Map();
const all = [];
for (let i = 0; i < N; i++) {
  const s = Engine.createSession({ seed: i * 104729 + 7, lots: 1, rivalCount: 3 });
  s.beginLot();
  const { lot } = s._truth();
  const ratio = lot.trueValue / lot.prior;
  all.push(ratio);
  if (!byTheme.has(lot.theme)) byTheme.set(lot.theme, []);
  byTheme.get(lot.theme).push(ratio);
}
const show = (label, list) => {
  const s = list.slice().sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  console.log([
    label.padEnd(16),
    'n=' + String(s.length).padEnd(7),
    'mean ' + mean.toFixed(2),
    'p10 ' + q(s, 0.10).toFixed(2),
    'p25 ' + q(s, 0.25).toFixed(2),
    '中位 ' + q(s, 0.50).toFixed(2),
    'p75 ' + q(s, 0.75).toFixed(2),
    'p90 ' + q(s, 0.90).toFixed(2),
    'p99 ' + q(s, 0.99).toFixed(2),
  ].join('  '));
};
console.log('真值 / 先验期望 的分布\n');
show('全部', all);
for (const [theme, list] of byTheme) show(theme, list);
