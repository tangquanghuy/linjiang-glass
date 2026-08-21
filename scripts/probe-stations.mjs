/** 路网视图打开后，五个换乘站的名字到底有没有在场、落在哪儿 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(pathToFileURL(path.resolve('city/plate_map.html')).href);
await page.waitForTimeout(1600);
await page.evaluate(() => { window.PLATE_MAP.netView(true); window.PLATE_MAP.fitAll(0); });
await page.waitForTimeout(800);

const out = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#nodes .st')].map(el => {
    const cs = getComputedStyle(el);
    return {
      name: el.querySelector('b').textContent,
      inter: el.dataset.inter === '1',
      op: +(+cs.opacity).toFixed(2),
      x: Math.round(parseFloat(el.style.left)),
      y: Math.round(parseFloat(el.style.top))
    };
  });
  return {
    inter: rows.filter(r => r.inter),
    onCount: rows.filter(r => r.op > 0.05).length,
    total: rows.length
  };
});

console.log(`站名 DOM ${out.total} · 在场 ${out.onCount}`);
console.log('换乘站:');
for (const r of out.inter) {
  console.log(`  ${r.name.padEnd(8)} op=${r.op}  (${r.x}, ${r.y})`);
}
await browser.close();
