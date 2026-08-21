/* Phone landscape arcade shots.  node tools/shot_arcade_land.mjs */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.env.HUD_URL || 'http://127.0.0.1:5174/?mode=landscape';
const OUT = 'artifacts/arcade-mobile';
const PHONES = [
  { name: 'land-se', width: 667, height: 375 },
  { name: 'land-14', width: 844, height: 390 },
];
const GAMES = ['shrine', 'scratch', 'slots', 'fishing'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const phone of PHONES) {
  const page = await browser.newPage({
    viewport: { width: phone.width, height: phone.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const arcadeBtn = page.locator('.tool-btn[data-page="arcade"], .ptool[data-page="arcade"]').first();
  await arcadeBtn.click();
  await page.waitForSelector('.arcade-layer iframe');
  await page.waitForTimeout(900);

  for (const game of GAMES) {
    const lobby = page.frameLocator('.arcade-frame');
    await lobby.locator(`#tab-${game}`).click();
    await page.waitForTimeout(game === 'fishing' || game === 'slots' ? 1500 : 800);
    await page.screenshot({ path: `${OUT}/${phone.name}-${game}.png`, fullPage: false });
  }

  const lobby = page.frameLocator('.arcade-frame');
  await lobby.locator('#tab-shrine').click();
  await page.waitForTimeout(700);
  const shrine = page.frames().find((f) => f.url().includes('shrine.html'));
  if (shrine) {
    await shrine.evaluate(() => document.querySelector('.ema-slot.today')?.click());
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${OUT}/${phone.name}-shrine-open.png`, fullPage: false });
  }
  await page.close();
}

await browser.close();
console.log('wrote landscape shots to', OUT);
