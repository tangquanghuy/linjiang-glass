/* Arcade mobile audit, part two: the states a player is actually in.
   ------------------------------------------------------------------
   The idle screen is the easy case.  What breaks on a phone is the
   opened fortune plaque, the bought ticket, a spun reel, and the fishing
   HUD mid-cast -- so drive each page into that state before measuring.

   Usage: node scripts/shot-arcade-states.mjs
*/

import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const OUT = 'artifacts/arcade-audit';
mkdirSync(OUT, { recursive: true });

const ROOT = resolve('.');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  let file = join(ROOT, normalize(url).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); }
  catch { res.writeHead(404).end('not found'); return; }
  try { statSync(file); } catch { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/arcade/`;
const browser = await chromium.launch();

const VIEWS = [
  { id: 'p320', w: 320, h: 568 },
  { id: 'p360', w: 360, h: 740 },
  { id: 'p390', w: 390, h: 844 },
  { id: 'l844', w: 844, h: 390 },
  { id: 'l667', w: 667, h: 375 },
];

const STATES = {
  shrine: async (page) => {
    await page.evaluate(() => {
      localStorage.removeItem('airp_shrine_fortune_v1');
      localStorage.removeItem('airp_shrine_history_v1');
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const t = document.querySelector('.ema-slot.today');
      if (t) t.click();
    });
    await page.waitForTimeout(1800);
  },
  scratch: async (page) => {
    await page.evaluate(() => {
      const b = document.querySelector('.buy-btn');
      if (b) b.click();
    });
    await page.waitForTimeout(900);
  },
  slots: async (page) => {
    await page.evaluate(() => {
      const b = document.querySelector('.spin-btn,#spinBtn,[data-spin]')
        || [...document.querySelectorAll('button')].find((x) => /启动|转/.test(x.textContent));
      if (b) b.click();
    });
    await page.waitForTimeout(2600);
  },
  fishing: async (page) => {
    await page.evaluate(() => {
      const f = document.querySelector('.fish,[data-fish],.fish-sprite');
      if (f) f.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /发射/.test(x.textContent));
      if (b) b.click();
    });
    await page.waitForTimeout(1400);
  },
};

const rows = [];
for (const v of VIEWS) {
  for (const game of Object.keys(STATES)) {
    const page = await browser.newPage({
      viewport: { width: v.w, height: v.h },
      deviceScaleFactor: 1, hasTouch: true, isMobile: true,
    });
    await page.goto(`${base}${game}.html`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    try { await STATES[game](page); } catch (e) { rows.push(`${v.id}/${game}: ${e.message}`); }
    writeFileSync(`${OUT}/state-${v.id}-${game}.png`, await page.screenshot());
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const out = [];
      const vis = (el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      for (const el of document.querySelectorAll('body *')) {
        /* A closed <details> still reports laid-out children in Chrome. */
        if (!vis(el) || el.closest('details:not([open])')) continue;
        const r = el.getBoundingClientRect();
        const overX = Math.max(0, r.right - innerWidth) + Math.max(0, -r.left);
        const overY = Math.max(0, r.bottom - innerHeight) + Math.max(0, -r.top);
        if (overX > 2 || overY > 2) {
          out.push({
            tag: el.id || el.className.toString().split(/\s+/).slice(0, 2).join('.') || el.tagName,
            overX: Math.round(overX), overY: Math.round(overY),
          });
        }
      }
      return {
        overflowX: Math.max(0, de.scrollWidth - de.clientWidth),
        overflowY: Math.max(0, de.scrollHeight - de.clientHeight),
        offscreen: out.sort((a, b) => (b.overX + b.overY) - (a.overX + a.overY)).slice(0, 6),
      };
    });
    rows.push({ view: v.id, game, ...m });
    await page.close();
  }
}

await browser.close();
server.close();
writeFileSync(`${OUT}/states.json`, JSON.stringify(rows, null, 2));

console.log('');
for (const r of rows) {
  if (typeof r === 'string') { console.log(`  ! ${r}`); continue; }
  const off = r.offscreen.length
    ? r.offscreen.map((o) => `${o.tag}(x${o.overX} y${o.overY})`).join(' ')
    : '-';
  console.log(`  ${r.view}  ${String(r.game).padEnd(9)} ovfX ${String(r.overflowX).padStart(4)}  ovfY ${String(r.overflowY).padStart(4)}  off: ${off}`);
}
console.log(`\n  shots + states.json in ${OUT}/\n`);
