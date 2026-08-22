/** 开局地图上还有没有互叠的牌子：直接量 DOM 矩形，别靠看图猜 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(`${BASE}/opening.html`, { waitUntil: 'load' });
await page.fill('#player-name', '林舟');
await page.click('#next');
await page.waitForTimeout(2600);

async function report(tag) {
  const frame = page.frames().find(f => f.url().includes('plate_map'));
  const rows = await frame.evaluate(() => [...document.querySelectorAll('#nodes .np.on')]
    .filter(el => el.dataset.k.startsWith('N:'))
    .map(el => {
      const lab = el.querySelector('.nl');
      const vis = lab && !lab.classList.contains('hide');
      const r = vis ? lab.getBoundingClientRect() : null;
      return { k: el.dataset.k, name: el.querySelector('.nl b').textContent, vis,
        r: r ? { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null };
    }));
  const shown = rows.filter(r => r.vis);
  const pairs = [];
  for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
    const a = shown[i].r, b = shown[j].r;
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)
      pairs.push(`${shown[i].name} × ${shown[j].name}`);
  }
  console.log(`\n[${tag}] 牌子 ${rows.length} 个，显名 ${shown.length} 个`);
  console.log('  隐名:', rows.filter(r => !r.vis).map(r => r.name).join(' ') || '（无）');
  console.log('  互叠:', pairs.length ? pairs.join(' | ') : '（无）');
}

await report('住所层');
const frame = page.frameLocator('#opening-map-iframe');
await frame.locator('[data-k="N:gl_yunting"]').click();
await page.waitForTimeout(1400);
await report('工作层');

await browser.close();
