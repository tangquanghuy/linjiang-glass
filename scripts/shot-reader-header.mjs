import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const url = 'file:///d:/Code/glass-hud/%E5%A4%96%E9%83%A8%E9%83%A8%E7%BD%B2/%E6%AD%A3%E6%96%87%E7%BE%8E%E5%8C%96.html';
const outDir = 'd:/Code/glass-hud/artifacts/reader-header';
fs.mkdirSync(outDir, { recursive: true });

const state = () => {
  const box = document.getElementById('inlineControls');
  const r = box.getBoundingClientRect();
  return {
    w: +r.width.toFixed(1),
    ratio: +(r.width / window.innerWidth * 100).toFixed(1),
    cls: box.className.replace('inline-controls ', ''),
    chips: [...box.querySelectorAll('.control-btn[data-theme-key]')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.dataset.themeKey),
    theme: document.body.dataset.theme
  };
};

const b = await chromium.launch();
for (const vp of [{ key: 'p390', w: 390, h: 844, mobile: true }, { key: 'p320', w: 320, h: 640, mobile: true }, { key: 'd1280', w: 1280, h: 800, mobile: false }]) {
  const c = await b.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile });
  const p = await c.newPage();
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  await p.goto(url);
  await p.waitForTimeout(1500);
  console.log(vp.key, 'initial ', JSON.stringify(await p.evaluate(state)));
  await p.screenshot({ path: path.join(outDir, vp.key + '-collapsed.png'), clip: { x: 0, y: 0, width: vp.w, height: Math.min(vp.h, 300) } });

  if (!vp.mobile) { await c.close(); continue; }

  await p.click('.inline-controls .control-btn[data-theme-key].active');
  await p.waitForTimeout(400);
  console.log(vp.key, 'expanded', JSON.stringify(await p.evaluate(state)));
  await p.screenshot({ path: path.join(outDir, vp.key + '-open.png'), clip: { x: 0, y: 0, width: vp.w, height: Math.min(vp.h, 300) } });

  await p.click('.inline-controls .control-btn[data-theme-key="dark"]');
  await p.waitForTimeout(600);
  console.log(vp.key, 'picked  ', JSON.stringify(await p.evaluate(state)));
  await p.screenshot({ path: path.join(outDir, vp.key + '-picked.png'), clip: { x: 0, y: 0, width: vp.w, height: Math.min(vp.h, 300) } });

  // 点面板外应收回
  await p.evaluate(() => { const box = document.getElementById('inlineControls'); box.classList.add('is-theme-open'); });
  await p.mouse.click(20, 500);
  await p.waitForTimeout(300);
  console.log(vp.key, 'outside ', JSON.stringify(await p.evaluate(state)));
  await c.close();
}
await b.close();
