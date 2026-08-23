/**
 * 开局地图真页检查：移动端保持“大地图 + 小视口”，视口外节点不被挤回屏幕；
 * 玩家拖动地图后能看到别处，再逐个定位、点击全部住所和岗位。
 *
 * 用法：先起 dev server，再 BASE=http://localhost:5175 node scripts/check-opening-map.mjs
 */
import { chromium } from 'playwright';
import { readOpeningPool } from './lib/opening-pool.mjs';

const BASE = process.env.BASE || 'http://localhost:5175';
const { HOMES, JOBS } = readOpeningPool();
const jobs = JOBS.filter(j => j.node);
const 压住阈值 = 0.22;

let 错 = 0;
const browser = await chromium.launch();
/* 直接用手机视口复现开局页：iframe 实际只有三百多像素宽，最容易暴露
   “把所有节点 clamp 回当前画面”的问题。 */
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => { 错++; console.log('BAD pageerror:', e.message); });

await page.goto(`${BASE}/opening.html`, { waitUntil: 'load' });
await page.fill('#player-name', '林舟');
await page.click('#next');
await page.waitForTimeout(1800);

const visiblePins = () => page.evaluate(() => {
  const doc = document.querySelector('#opening-map-iframe').contentDocument;
  return [...doc.querySelectorAll('[data-opening="home"],[data-opening="work"]')]
    .filter(el => el.classList.contains('on') && +getComputedStyle(el).opacity > 0.1)
    .map(el => {
      const r = el.getBoundingClientRect();
      return {
        k: el.dataset.k.replace('N:', ''), kind: el.dataset.opening,
        x: r.x, y: r.y, w: r.width, h: r.height
      };
    })
    .filter(p => p.w > 0 && p.h > 0);
});

const mapView = () => page.evaluate(() =>
  document.querySelector('#opening-map-iframe').contentWindow.PLATE_MAP.view());

const focus = id => page.evaluate(k =>
  document.querySelector('#opening-map-iframe').contentWindow.PLATE_MAP.goto(k), id);

const tap = id => page.evaluate(k => {
  const doc = document.querySelector('#opening-map-iframe').contentDocument;
  const el = doc.querySelector('[data-k="N:' + k + '"]');
  if (!el || !el.classList.contains('on')) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
}, id);

const overlapPairs = new Map();
function collectOverlap(label, pins) {
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const a = pins[i], b = pins[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox <= 2 || oy <= 2) continue;
      const frac = (ox * oy) / Math.min(a.w * a.h, b.w * b.h);
      if (frac < 压住阈值) continue;
      const key = [label, a.k, b.k].sort().join('|');
      overlapPairs.set(key, { label, a: a.k, b: b.k, ox: Math.round(ox), oy: Math.round(oy), frac });
    }
  }
}

/* ---- 移动端视口行为：首屏只画局部，真实拖动后相机与可见集合都变化 ---- */
let pins = await visiblePins();
const firstIds = new Set(pins.map(p => p.k));
if (!pins.length) {
  错++;
  console.log('BAD 手机首屏没有任何可选住所');
} else if (pins.length >= HOMES.length) {
  错++;
  console.log(`BAD 手机首屏仍把 ${pins.length} 个住所全部塞进视口`);
} else {
  console.log(`ok  手机首屏只显示视口内 ${pins.length}/${HOMES.length} 个住所`);
}

const before = await mapView();
const box = await page.locator('#opening-map-iframe').boundingBox();
await page.mouse.move(box.x + box.width * .78, box.y + box.height * .52);
await page.mouse.down();
await page.mouse.move(box.x + box.width * .22, box.y + box.height * .52, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(450);
const after = await mapView();
pins = await visiblePins();
const secondIds = new Set(pins.map(p => p.k));
const changedPins = [...new Set([...firstIds, ...secondIds])].some(id => firstIds.has(id) !== secondIds.has(id));
if (Math.abs(after.cx - before.cx) < .03) {
  错++;
  console.log('BAD 手机横向拖动没有移动地图相机:', before, '→', after);
} else if (!changedPins) {
  错++;
  console.log('BAD 地图移动后可见节点集合没有变化');
} else {
  console.log(`ok  横向拖动使相机 cx ${before.cx.toFixed(3)} → ${after.cx.toFixed(3)}，视口节点随地图进出`);
}

/* ---- 住所层：逐个把镜头推到真实地点，再点击选择 ---- */
for (const h of HOMES) {
  await page.click('#map-home-mode');
  if (!await focus(h.id)) {
    错++;
    console.log(`BAD 地图不能定位住所 ${h.id}`);
    continue;
  }
  await page.waitForTimeout(720);
  const here = await visiblePins();
  collectOverlap('住所层', here.filter(p => p.kind === 'home'));
  if (!here.some(p => p.k === h.id)) {
    错++;
    console.log(`BAD 镜头移到 ${h.id} 后节点仍未进入视口`);
    continue;
  }
  if (!await tap(h.id)) {
    错++;
    console.log(`BAD ${h.id} 已进入视口但点不到`);
    continue;
  }
  await page.waitForTimeout(220);
  const got = (await page.textContent('#home-name')).trim();
  if (got !== h.name) {
    错++;
    console.log(`BAD 点 ${h.id} 后住所显示「${got}」，应为「${h.name}」`);
  }
}
console.log(`ok  ${HOMES.length} 处住所逐个定位并点过`);

/* ---- 工作层 ---- */
await page.click('#map-work-mode');
for (const j of jobs) {
  if (!await focus(j.node)) {
    错++;
    console.log(`BAD 地图不能定位岗位 ${j.node}`);
    continue;
  }
  await page.waitForTimeout(720);
  const here = await visiblePins();
  collectOverlap('工作层', here.filter(p => p.kind === 'work'));
  if (!here.some(p => p.k === j.node)) {
    错++;
    console.log(`BAD 镜头移到 ${j.node} 后节点仍未进入视口`);
    continue;
  }
  if (!await tap(j.node)) {
    错++;
    console.log(`BAD ${j.node} 已进入视口但点不到`);
    continue;
  }
  await page.waitForTimeout(210);
  const got = (await page.textContent('#work-name')).trim();
  if (got !== j.name) {
    错++;
    console.log(`BAD 点 ${j.node} 后工作显示「${got}」，应为「${j.name}」`);
  }
}
console.log(`ok  ${jobs.length} 个岗位逐个定位并点过`);

if (overlapPairs.size) {
  错 += overlapPairs.size;
  for (const o of overlapPairs.values()) {
    console.log(`BAD ${o.label} ${o.a} × ${o.b} 互相压 ${o.ox}×${o.oy}px（占小牌 ${(o.frac * 100).toFixed(0)}%）` +
      ' → 在 plate_map.js 的 OPENING_NODE_OFFSET 里成对反向推开');
  }
} else {
  console.log('ok  逐区查看时可见牌子互不遮挡');
}

/* ---- 通勤要真算出来，不能停在“路线计算中” ---- */
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
