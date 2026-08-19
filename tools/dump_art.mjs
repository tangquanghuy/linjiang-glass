import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
await page.addInitScript(() => localStorage.removeItem('glass-hud-pinned'));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));

const dump = async (tag) => {
  const rows = await page.$$eval('.card', (cards) =>
    cards.map((c) => {
      const img = c.querySelector('.card-art');
      const star = c.querySelector('.card-star');
      const cs = getComputedStyle(img);
      return {
        name: c.dataset.name,
        fx: img.dataset.fx,
        fy: img.dataset.fy,
        z: img.dataset.z,
        ox: img.dataset.ox,
        left: cs.left,
        top: cs.top,
        w: cs.width,
        h: cs.height,
        star: star ? { w: star.naturalWidth, src: star.getAttribute('src'), display: getComputedStyle(star).display } : null,
      };
    }),
  );
  console.log(tag, JSON.stringify(rows, null, 2));
};

await dump('p1');
await page.locator('.rail-next').click();
await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
await dump('p2');
await browser.close();
