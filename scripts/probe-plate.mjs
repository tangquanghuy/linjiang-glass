/**
 * 查节点有没有压住地图控件，顺带量帧时间。
 * 分级是连续的，所以要在几个缩放档位上分别查。
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(pathToFileURL(path.resolve('city/plate_map.html')).href);
await page.waitForTimeout(1600);

const views = [
  ['全城 z1.0', 0.5, 0.5, 1.0],
  ['接近 z1.9', 0.42, 0.60, 1.9],
  ['溶解 z2.6', 0.315, 0.685, 2.6],
  ['区级 z3.3', 0.315, 0.685, 3.3],
  ['细节 z4.3', 0.315, 0.685, 4.3],
  ['最近 z5.8', 0.315, 0.685, 5.8]
];

for (const [label, cx, cy, z] of views) {
  await page.evaluate(([a, b, c]) => window.__setView(a, b, c), [cx, cy, z]);
  await page.waitForTimeout(700);
  const o = await page.evaluate(() => {
    const ctl = ['ctl', 'phase', 'dev'].map(id => {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      return { id, x: r.left, y: r.top, w: r.width, h: r.height };
    }).filter(b => b.w > 0);
    const over = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const vis = [...document.querySelectorAll('#nodes .np')]
      .filter(el => +getComputedStyle(el).opacity > 0.45);
    const bad = [], nolabel = [];
    vis.forEach(el => {
      const lab = el.querySelector('.nl');
      const nm = lab ? lab.querySelector('b').textContent : '?';
      if (lab && getComputedStyle(lab).display === 'none') nolabel.push(nm);
      const parts = [el.querySelector('.ni'), lab].filter(x => x && getComputedStyle(x).display !== 'none');
      for (const pt of parts) {
        const r = pt.getBoundingClientRect();
        const b = { x: r.left, y: r.top, w: r.width, h: r.height };
        const h = ctl.filter(x => over(b, x)).map(x => x.id);
        if (h.length) { bad.push(nm + '->' + h.join(',')); break; }
      }
    });
    return { n: vis.length, bad, nolabel, r: window.__view().ratios.wuxi };
  });
  console.log(`${label.padEnd(11)} wuxi_r=${String(o.r).padEnd(5)} 在场 ${String(o.n).padEnd(3)}` +
    (o.bad.length ? '  压住控件: ' + o.bad.join(' | ') : '  无重叠') +
    (o.nolabel.length ? '  省略标签: ' + o.nolabel.join(',') : ''));
}

const fps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const loop = () => { if (++n < 90) requestAnimationFrame(loop); else res(Math.round(n * 1000 / (performance.now() - t0))); };
  requestAnimationFrame(loop);
}));
console.log('帧率 ' + fps + ' fps');
await browser.close();
