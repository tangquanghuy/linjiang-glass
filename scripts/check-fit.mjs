/**
 * 宽屏最小缩放：一屏装下所有区卡，并且拖不动。
 * 竖屏 cover：地图铺满视口（左右可拖），不把整座城缩成一条。
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

mkdirSync('artifacts', { recursive: true });
const problems = [];

const browser = await chromium.launch();
const url = pathToFileURL(path.resolve('city/plate_map.html')).href;

const sizes = [
  [1440, 810, '16:9'],
  [1024, 510, '2:1 扁窗口'],
  [1024, 580, '小窗'],
  [1280, 800, '16:10'],
  [2560, 1080, '21:9 超宽'],
  [1180, 820, '接近 4:3'],
  [390, 844, '手机竖屏'],
];

for (const [w, h, label] of sizes) {
  const tall = h > w * 1.15;
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
      names: [...document.querySelectorAll('#nodes .np.on')].map(el => el.querySelector('b')?.textContent || ''),
      places: [...document.querySelectorAll('#nodes .np.on')].filter(el => (el.dataset.k || '').startsWith('N:')).map(el => el.querySelector('b')?.textContent || ''),
      plates: [...document.querySelectorAll('#plates img.dp')].filter(el => el.style.display !== 'none' && +el.style.opacity > 0.05).map(el => el.dataset.k),
      out, odd
    };
  });

  console.log(`${label.padEnd(10)} ${String(w + 'x' + h).padEnd(10)} z=${r.z} 在场${String(r.n).padEnd(3)}` +
    ` 拖动:${r.moved ? '还能动' : '锁住'}${tall ? (r.moved ? ' ✓' : ' ✗') : (r.moved ? ' ✗' : ' ✓')}` +
    (tall
      ? (r.n >= 2 ? '  视口内有区卡 ✓' : '  视口内无区卡 ✗')
      : (r.out.length ? `  出界: ${r.out.join(',')} ✗` : '  全在画面内 ✓')) +
    (r.odd.length ? `  标签偏位: ${r.odd.join(',')}` : '  标签一致朝下 ✓'));
  if (tall) {
    if (!r.moved) problems.push(`${label}: cover should pan`);
    if (r.n < 2) problems.push(`${label}: need district chips in view`);
    if (r.places.length) problems.push(`${label}: place pins on overview (${r.places.join(',')})`);
    if (r.plates.length) problems.push(`${label}: district plates on overview (${r.plates.join(',')})`);
    if (!r.moved) console.log('           (竖屏 cover 应能左右拖)');
    if (r.n < 2) console.log('           (视口里至少该有两张区卡)');
    if (r.places.length) console.log(`           (总览不该有地点: ${r.places.join(',')})`);
    if (r.plates.length) console.log(`           (总览不该叠区底板: ${r.plates.join(',')})`);
    await page.screenshot({ path: 'artifacts/map-phone-overview.png' });

    await page.evaluate(() => window.PLATE_MAP.focus('wuxi'));
    await page.waitForTimeout(900);
    const inn = await page.evaluate(() => ({
      places: [...document.querySelectorAll('#nodes .np.on')].filter(el => (el.dataset.k || '').startsWith('N:')).map(el => el.querySelector('b')?.textContent || ''),
      plates: [...document.querySelectorAll('#plates img.dp')].filter(el => el.style.display !== 'none' && +el.style.opacity > 0.4).map(el => el.dataset.k),
      blurbs: [...document.querySelectorAll('#nodes .np.on')].filter(el => (el.dataset.k || '').startsWith('N:')).map(el => el.querySelector('i')?.textContent?.trim()).filter(Boolean),
      odd: [...document.querySelectorAll('#nodes .np.on')].filter(el => {
        const lab = el.querySelector('.nl');
        const ic = el.querySelector('.ni');
        if (!lab || lab.classList.contains('hide') || +getComputedStyle(el).opacity < 0.5) return false;
        return lab.getBoundingClientRect().top - ic.getBoundingClientRect().top < 12;
      }).map(el => el.querySelector('b')?.textContent || ''),
    }));
    await page.screenshot({ path: 'artifacts/map-phone-in.png' });
    console.log(`           进乌溪  底板:${inn.plates.join(',') || '无'}  地点:${inn.places.slice(0, 6).join(' · ') || '无'}`);
    if (!inn.plates.includes('wuxi')) problems.push(`${label}: focusing 乌溪 did not bring in its plate`);
    if (inn.places.length < 2) problems.push(`${label}: focusing 乌溪 did not show place pins`);
    if (inn.blurbs.length) problems.push(`${label}: place blurbs still showing (${inn.blurbs.join(',')})`);
    if (inn.odd.length) problems.push(`${label}: labels not below the pin (${inn.odd.join(',')})`);
  }
  await page.close();
}
await browser.close();
if (problems.length) {
  console.log('\nPROBLEMS:');
  problems.forEach((p) => console.log(' -', p));
  process.exitCode = 1;
}
