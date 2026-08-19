/**
 * 最小缩放的两条硬要求：
 *   1. 一屏装下所有区卡，不用拖
 *   2. 真的拖不动（cx/cy 活动区间为零）
 * 按几种窗口比例分别验。
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch();
const url = pathToFileURL(path.resolve('city/plate_map.html')).href;

const sizes = [
  [1440, 810, '16:9'],
  [1024, 510, '2:1 扁窗口'],
  [1024, 580, '小窗'],
  [1280, 800, '16:10'],
  [2560, 1080, '21:9 超宽'],
  [1180, 820, '接近 4:3']
];

for (const [w, h, label] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.PLATE_MAP.fitAll());
  await page.waitForTimeout(900);

  const r = await page.evaluate(() => {
    const v0 = window.PLATE_MAP.view();
    // 试着拖 300px，看视野动不动
    const st = document.getElementById('plates');
    const down = new PointerEvent('pointerdown', { clientX: 400, clientY: 400, bubbles: true, pointerId: 1 });
    const move = new PointerEvent('pointermove', { clientX: 700, clientY: 700, bubbles: true, pointerId: 1 });
    const up = new PointerEvent('pointerup', { clientX: 700, clientY: 700, bubbles: true, pointerId: 1 });
    st.dispatchEvent(down); st.dispatchEvent(move); st.dispatchEvent(up);
    const v1 = window.PLATE_MAP.view();

    const out = [], odd = [];
    document.querySelectorAll('#nodes .np').forEach(el => {
      if (+getComputedStyle(el).opacity < 0.5) return;
      const ic = el.querySelector('.ni'), lab = el.querySelector('.nl');
      const nm = lab ? lab.querySelector('b').textContent : '?';
      const parts = [ic, lab].filter(x => x && getComputedStyle(x).display !== 'none');
      for (const pt of parts) {
        const b = pt.getBoundingClientRect();
        if (b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight) { out.push(nm); break; }
      }
      // 标签默认挂在圆盘正下方，偏到别处的记下来——一屏里越少越整齐
      if (lab && !lab.classList.contains('hide')) {
        const a = ic.getBoundingClientRect(), l = lab.getBoundingClientRect();
        if (l.top - a.top < 12) odd.push(nm);
      }
    });
    return {
      moved: Math.abs(v1.cx - v0.cx) > 1e-6 || Math.abs(v1.cy - v0.cy) > 1e-6,
      z: +v0.z.toFixed(3),
      n: document.querySelectorAll('#nodes .np.on').length,
      out, odd
    };
  });

  console.log(`${label.padEnd(10)} ${String(w + 'x' + h).padEnd(10)} z=${r.z} 在场${String(r.n).padEnd(3)}` +
    ` 拖动:${r.moved ? '还能动 ✗' : '锁住 ✓'}` +
    (r.out.length ? `  出界: ${r.out.join(',')} ✗` : '  全在画面内 ✓') +
    (r.odd.length ? `  标签偏位: ${r.odd.join(',')}` : '  标签一致朝下 ✓'));
  await page.close();
}
await browser.close();
