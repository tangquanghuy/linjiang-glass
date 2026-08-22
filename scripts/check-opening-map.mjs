/**
 * 开局地图上的牌子：该画的都画了、都点得动、而且没有互相压。
 *
 * 为什么要跑真页面：opening.js 的池子和 city/plate_map.js 的 OPENING_*_META 是两份
 * 数据，check-opening-nodes.mjs 只能比对"两边写的一样"。但"写对了"到"画出来且点得动"
 * 之间还有两道会静默失败的坎——
 *   1. openingNodeAllowed() 过滤掉的节点根本不进渲染，牌子不画、点不动，页面不报错；
 *   2. 两个选项落得太近时后画的会压住前一张的名字，压过一半就点不到了。
 * 两样都只有在真页面上数牌子、量矩形才看得出来。
 *
 * 用法：先起 dev server，再 BASE=http://localhost:5175 node scripts/check-opening-map.mjs
 */
import { chromium } from 'playwright';
import { readOpeningPool } from './lib/opening-pool.mjs';

const BASE = process.env.BASE || 'http://localhost:5175';
const { HOMES, JOBS } = readOpeningPool();
const jobs = JOBS.filter(j => j.node);
/** 重叠超过小牌面积的这个比例就算压住了 */
const 压住阈值 = 0.22;

let 错 = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => { 错++; console.log('BAD pageerror:', e.message); });

await page.goto(`${BASE}/opening.html`, { waitUntil: 'load' });
await page.fill('#player-name', '林舟');
await page.click('#next');
await page.waitForTimeout(3200);

/** 当前层里真正可见的牌子。上一帧的牌子只是 opacity 归零留在 DOM 里
    （plate_map 的 pool 扫描），offsetParent 照样非空，必须按 .on + 透明度筛 */
const visiblePins = () => page.evaluate(() => {
  const doc = document.querySelector('#opening-map-iframe').contentDocument;
  return [...doc.querySelectorAll('[data-opening="home"],[data-opening="work"]')]
    .filter(el => el.classList.contains('on') && +getComputedStyle(el).opacity > 0.1)
    .map(el => {
      const r = el.getBoundingClientRect();
      return { k: el.dataset.k.replace('N:', ''), kind: el.dataset.opening, x: r.x, y: r.y, w: r.width, h: r.height };
    })
    .filter(p => p.w > 0 && p.h > 0);
});

const tap = (id) => page.evaluate((k) => {
  const doc = document.querySelector('#opening-map-iframe').contentDocument;
  const el = doc.querySelector('[data-k="N:' + k + '"]');
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
}, id);

function checkOverlap(label, pins) {
  const 压 = [];
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const a = pins[i], b = pins[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox <= 2 || oy <= 2) continue;
      const frac = (ox * oy) / Math.min(a.w * a.h, b.w * b.h);
      if (frac >= 压住阈值) 压.push({ a: a.k, b: b.k, ox: Math.round(ox), oy: Math.round(oy), frac });
    }
  }
  if (压.length) {
    错 += 压.length;
    for (const o of 压) {
      console.log(`BAD ${label} ${o.a} × ${o.b} 互相压 ${o.ox}×${o.oy}px（占小牌 ${(o.frac * 100).toFixed(0)}%）` +
        ' → 在 plate_map.js 的 OPENING_NODE_OFFSET 里成对反向推开');
    }
  } else {
    console.log(`ok  ${label} ${pins.length} 个牌子互不遮挡`);
  }
}

/* ---- 住所层 ---- */
await page.click('#map-home-mode');
await page.waitForTimeout(1400);
let pins = await visiblePins();
const 缺住所 = HOMES.filter(h => !pins.some(p => p.k === h.id)).map(h => h.id);
if (缺住所.length) { 错++; console.log('BAD 住所层没画出来（牌子不画、节点点不动）:', 缺住所.join(', ')); }
else console.log(`ok  住所层画出 ${HOMES.length} 处，与开局池一致`);
checkOverlap('住所层', pins);

for (const h of HOMES) {
  // setHome() 选完会自动切到工作层，住所牌就不画了，所以每次先切回来
  await page.click('#map-home-mode');
  await page.waitForTimeout(200);
  if (!await tap(h.id)) { 错++; console.log(`BAD ${h.id} 住所层里没有这个牌子`); continue; }
  await page.waitForTimeout(230);
  const got = (await page.textContent('#home-name')).trim();
  if (got !== h.name) { 错++; console.log(`BAD 点 ${h.id} 后住所显示「${got}」，应为「${h.name}」`); }
}
console.log(`ok  ${HOMES.length} 处住所逐个点过，都能选中`);

/* ---- 工作层 ---- */
await page.click('#map-work-mode');
await page.waitForTimeout(1500);
pins = await visiblePins();
const 缺岗位 = jobs.filter(j => !pins.some(p => p.k === j.node)).map(j => j.node);
if (缺岗位.length) { 错++; console.log('BAD 工作层没画出来（牌子不画、节点点不动）:', 缺岗位.join(', ')); }
else console.log(`ok  工作层画出 ${jobs.length} 个，与开局池一致`);
checkOverlap('工作层', pins.filter(p => p.kind === 'work'));

for (const j of jobs) {
  if (!await tap(j.node)) { 错++; console.log(`BAD ${j.node} 工作层里没有这个牌子`); continue; }
  await page.waitForTimeout(210);
  const got = (await page.textContent('#work-name')).trim();
  if (got !== j.name) { 错++; console.log(`BAD 点 ${j.node} 后工作显示「${got}」，应为「${j.name}」`); }
}
console.log(`ok  ${jobs.length} 个岗位逐个点过，都能选中`);

/* ---- 通勤要真算出来，不能停在"路线计算中" ---- */
const commute = (await page.textContent('#commute-card')).replace(/\s+/g, '');
if (/路线计算中|先选住所|暂未算出/.test(commute)) {
  错++;
  console.log('BAD 选齐住所和工作后通勤仍未算出:', commute.slice(0, 80));
} else if (!/分钟/.test(commute) || !/公里/.test(commute)) {
  错++;
  console.log('BAD 通勤卡缺分钟或公里:', commute.slice(0, 80));
} else {
  console.log('ok  通勤已算出（含分钟与公里）');
}

await browser.close();
console.log(错 ? `\n共 ${错} 处问题` : '\n全部通过');
process.exit(错 ? 1 : 0);
