import { chromium } from 'playwright';

const url = new URL('../变量相关/弹幕列表.html', import.meta.url).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 680 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto(url, { waitUntil: 'load' });
try {
  await page.waitForFunction(() => {
    const a = document.getElementById('hostAvatar');
    const f = document.getElementById('hostFeed');
    return a && f && a.complete && f.complete && a.naturalWidth > 0 && f.naturalWidth > 0;
  }, { timeout: 20000 });
} catch {
  const info = await page.evaluate(() => ({
    avatar: document.getElementById('hostAvatar')?.src,
    feed: document.getElementById('hostFeed')?.src,
    aw: document.getElementById('hostAvatar')?.naturalWidth,
    fw: document.getElementById('hostFeed')?.naturalWidth,
  }));
  console.log('WARN images not loaded', JSON.stringify(info));
}
const rail = await page.evaluate(() => {
  const el = document.getElementById('gifts');
  const next = document.getElementById('giftNext');
  const prev = document.getElementById('giftPrev');
  return {
    pills: el.children.length,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    nextOff: next.classList.contains('off'),
    prevOff: prev.classList.contains('off'),
  };
});
console.log(JSON.stringify(rail));
await page.locator('.room').screenshot({ path: 'artifacts/danmaku-room.png' });
await page.locator('.pill[data-gift="辣条"]').click({ force: true });
await page.waitForSelector('.overlay.show');
await page.waitForTimeout(200);
console.log('DLG', JSON.stringify(await page.locator('#dlg').innerText()));
await page.locator('.room').screenshot({ path: 'artifacts/danmaku-gift-confirm.png' });
await page.locator('[data-setqty="10"]').click();
await page.waitForTimeout(120);
await page.locator('.room').screenshot({ path: 'artifacts/danmaku-gift-qty.png' });
await browser.close();
