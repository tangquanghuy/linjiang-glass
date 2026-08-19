import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
await page.addInitScript(() => localStorage.removeItem('glass-hud-pinned'));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
await page.waitForTimeout(250);
const clip = { x: 520, y: 400, width: 1150, height: 330 };
await page.screenshot({ path: 'artifacts/fix_p1.png', clip });
const cards = await page.locator('.card').all();
for (let i = 0; i < cards.length; i++) {
  await cards[i].screenshot({ path: `artifacts/fix_p1c${i + 1}.png` });
}
await page.locator('.rail-next').click();
await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
await page.waitForTimeout(250);
await page.screenshot({ path: 'artifacts/fix_p2.png', clip });
const cards2 = await page.locator('.card').all();
for (let i = 0; i < cards2.length; i++) {
  await cards2[i].screenshot({ path: `artifacts/fix_p2c${i + 1}.png` });
}
await browser.close();
console.log('ok');
