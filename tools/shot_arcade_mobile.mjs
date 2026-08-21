/* Mobile arcade layout shots + clip audit.
   Run against the Vite dev server: node tools/shot_arcade_mobile.mjs */

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.env.HUD_URL || 'http://127.0.0.1:5174/?mode=portrait';
const OUT = 'artifacts/arcade-mobile';
const PHONES = [
  { name: '360', width: 360, height: 740 },
  { name: 'se', width: 375, height: 667 },
  { name: '14', width: 390, height: 844 },
];
const GAMES = ['shrine', 'scratch', 'slots', 'fishing'];

const clipReport = async (handle) => handle.evaluate(() => {
  const vw = innerWidth;
  const vh = innerHeight;
  const hits = [];
  const sel = [
    'button', '.tab', '.wallet-btn', '.packet', '.push-spin', '.fire-button',
    '.buy-btn', '.reveal-btn', '.chip-btn', '.chip', '.ledger-btn', '.back-btn',
    '.small-control', '.auto-button', '#autoButton', '#pauseButton', '#fireButton',
  ].join(',');
  document.querySelectorAll(sel).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return;
    const clip = {
      left: r.left < -2,
      right: r.right > vw + 2,
      top: r.top < -2,
      bottom: r.bottom > vh + 2,
    };
    if (clip.left || clip.right || clip.top || clip.bottom) {
      hits.push({
        id: el.id,
        text: String(el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 48),
        cls: String(el.className || '').slice(0, 72),
        box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        clip,
      });
    }
  });
  const close = parent !== window ? null : document.querySelector('[data-arcade-close]');
  let closeBox = null;
  if (close) {
    const r = close.getBoundingClientRect();
    closeBox = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }
  return {
    vw, vh,
    scroll: { x: document.documentElement.scrollWidth, y: document.documentElement.scrollHeight },
    overflowX: document.documentElement.scrollWidth - vw,
    overflowY: document.documentElement.scrollHeight - vh,
    htmlClass: document.documentElement.className,
    closeBox,
    hits,
  };
});

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

for (const phone of PHONES) {
  const page = await browser.newPage({
    viewport: { width: phone.width, height: phone.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('.ptool[data-page="arcade"]').click();
  await page.waitForSelector('.arcade-layer iframe');
  const frameEl = page.locator('.arcade-frame');
  await frameEl.waitFor({ state: 'attached' });
  await page.waitForTimeout(900);

  for (const game of GAMES) {
    const lobby = page.frameLocator('.arcade-frame');
    await lobby.locator(`#tab-${game}`).click();
    await page.waitForTimeout(game === 'fishing' || game === 'slots' ? 1600 : 900);
    const file = `${OUT}/${phone.name}-${game}.png`;
    await page.screenshot({ path: file, fullPage: false });

    const lobbyFrame = page.frames().find((f) => f.url().includes('arcade/index.html'));
    const gameFrame = lobbyFrame?.childFrames()?.[0];
    const lobbyAudit = lobbyFrame ? await clipReport(lobbyFrame) : null;
    const gameAudit = gameFrame ? await clipReport(gameFrame) : null;
    const close = await page.evaluate(() => {
      const el = document.querySelector('[data-arcade-close]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const tabs = [...document.querySelector('.arcade-frame')?.contentDocument?.querySelectorAll('.tab') || []];
      const overlaps = tabs.map((t) => {
        const b = t.getBoundingClientRect();
        const iframe = document.querySelector('.arcade-frame').getBoundingClientRect();
        const tr = {
          left: iframe.left + b.left,
          right: iframe.left + b.right,
          top: iframe.top + b.top,
          bottom: iframe.top + b.bottom,
        };
        const cr = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        const hit = !(tr.right < cr.left || tr.left > cr.right || tr.bottom < cr.top || tr.top > cr.bottom);
        return { text: t.innerText.replace(/\s+/g, ' '), hit };
      });
      return {
        box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        overlaps: overlaps.filter((x) => x.hit),
      };
    });

    report.push({
      phone: phone.name,
      size: `${phone.width}x${phone.height}`,
      game,
      file,
      close,
      lobby: lobbyAudit,
      game: gameAudit,
    });
  }

  /* Shrine with plaque open + packet visible. */
  {
    const lobby = page.frameLocator('.arcade-frame');
    await lobby.locator('#tab-shrine').click();
    await page.waitForTimeout(800);
    const shrine = page.frames().find((f) => f.url().includes('shrine.html'));
    if (shrine) {
      await shrine.evaluate(() => {
        const today = document.querySelector('.ema-slot.today');
        today?.click();
      });
      await page.waitForTimeout(1400);
      await page.screenshot({ path: `${OUT}/${phone.name}-shrine-open.png`, fullPage: false });
    }
  }

  await page.close();
}

writeFileSync(`${OUT}/audit.json`, JSON.stringify(report, null, 2));
const clipped = report.filter((row) =>
  (row.lobby?.hits?.length || row.game?.hits?.length || row.close?.overlaps?.length
    || (row.lobby?.overflowX > 4) || (row.game?.overflowX > 4)));
console.log(JSON.stringify({
  shots: report.length,
  clipped: clipped.map((row) => ({
    phone: row.phone,
    game: row.game,
    closeHits: row.close?.overlaps,
    lobbyHits: row.lobby?.hits,
    gameHits: row.game?.hits,
    lobbyOverflowX: row.lobby?.overflowX,
    gameOverflowX: row.game?.overflowX,
    gameOverflowY: row.game?.overflowY,
    htmlClass: row.lobby?.htmlClass,
    gameClass: row.game?.htmlClass,
    gameView: row.game ? `${row.game.vw}x${row.game.vh}` : null,
  })),
}, null, 2));
await browser.close();
