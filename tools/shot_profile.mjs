import { chromium } from 'playwright';

const url = process.env.HUD_URL || 'http://127.0.0.1:5174/';
const tag = process.argv[2] || 'now';
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));

// the status pane on its own
await page.screenshot({ path: `artifacts/prof_status_${tag}.png`, clip: { x: 23, y: 380, width: 520, height: 350 } });

// how much of the pane's own box the content actually uses
const pane = await page.evaluate(() => {
  const k = Number(getComputedStyle(document.getElementById('stage')).getPropertyValue('--k')) || 1;
  const el = document.querySelector('.pane-status');
  const box = el.getBoundingClientRect();
  const rows = [...el.children].map((child) => {
    const r = child.getBoundingClientRect();
    return {
      what: child.className || child.tagName,
      top: +((r.top - box.top) / k).toFixed(1),
      bottom: +((r.bottom - box.top) / k).toFixed(1),
    };
  });
  const last = rows[rows.length - 1];
  return { paneH: +(box.height / k).toFixed(1), contentBottom: last.bottom, rows };
});
console.log('status pane', JSON.stringify(pane, null, 2));

await page.locator('.btn-ghost').click();
await page.waitForSelector('.profile-page', { timeout: 3000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `artifacts/prof_shut_${tag}.png` });

await page.locator('.profile-fan').first().hover();
await page.waitForTimeout(250);
await page.screenshot({ path: `artifacts/prof_hover_${tag}.png` });

// overflow probe: does anything inside the sheet stick out of its own box?
const probe = await page.evaluate(() => {
  const out = [];
  const body = document.querySelector('.profile-page .page-modal-body');
  const br = body.getBoundingClientRect();
  out.push({ what: 'body', scrollH: body.scrollHeight, clientH: body.clientHeight });
  document.querySelectorAll('.profile-page .page-modal-body *').forEach((el) => {
    if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflow === 'visible') {
      out.push({ what: el.className || el.tagName, scrollH: el.scrollHeight, clientH: el.clientHeight });
    }
  });
  return { br: { top: br.top, height: br.height }, out };
});
console.log(JSON.stringify(probe, null, 2));

await browser.close();
if (errors.length) { console.log('ERRORS:'); errors.forEach((e) => console.log(' -', e)); }
else console.log('no console/page errors');
