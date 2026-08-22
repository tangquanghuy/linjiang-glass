import { chromium } from 'playwright';

const url = 'file:///d:/Code/glass-hud/%E5%A4%96%E9%83%A8%E9%83%A8%E7%BD%B2/%E6%AD%A3%E6%96%87%E7%BE%8E%E5%8C%96.html';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
p.on('pageerror', e => console.log('[pageerror]', e.message));
p.on('console', m => console.log('[console]', m.type(), m.text()));
await p.goto(url);
await p.waitForTimeout(1500);

const r = await p.evaluate(() => {
  const box = document.getElementById('inlineControls');
  const log = [];
  const mo = new MutationObserver(muts => muts.forEach(m => log.push('class -> ' + box.className)));
  mo.observe(box, { attributes: true, attributeFilter: ['class'] });
  const btn = box.querySelector('.control-btn[data-theme-key].active');
  log.push('before: ' + box.className);
  btn.click();
  log.push('after click (sync): ' + box.className);
  mo.disconnect();
  return {
    log,
    boxCount: document.querySelectorAll('#inlineControls').length,
    chipParents: [...document.querySelectorAll('.control-btn[data-theme-key]')].map(x => x.parentElement.id || x.parentElement.className),
    hasFn: typeof initThemeCollapse,
    bound: window.__themeCollapseBound
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
