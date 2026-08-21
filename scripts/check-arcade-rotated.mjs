/* Does the rotated shell still accept taps?
   ------------------------------------------------------------------
   On a portrait phone the lobby wraps the dock and the game iframe in a
   rotate(-90deg) subtree.  Two things could plausibly break and neither is
   visible in a screenshot:

     lobby chrome   the tabs and the purse live inside the rotated subtree,
                    so the browser has to hit-test through the transform
     game input     fishing maps taps with canvasPoint(), which assumes an
                    axis-aligned canvas.  That assumption holds only because
                    the transform sits on the iframe element in the parent
                    document, leaving the iframe's own coordinate space
                    unrotated -- worth proving rather than asserting.

   Usage: node scripts/check-arcade-rotated.mjs
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
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/arcade/`;
const browser = await chromium.launch();

const PHONES = [
  { id: 'p360', w: 360, h: 740, name: 'Android 360x740' },
  { id: 'p390', w: 390, h: 844, name: 'iPhone 14 390x844' },
];

const line = (ok, text) => `  ${ok ? 'ok  ' : 'FAIL'} ${text}`;
const results = [];

for (const ph of PHONES) {
  console.log(`\n  ${ph.name}  (portrait phone, shell should rotate)`);
  console.log(`  ${'-'.repeat(76)}`);

  const page = await browser.newPage({
    viewport: { width: ph.w, height: ph.h },
    deviceScaleFactor: 1, hasTouch: true, isMobile: true,
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}index.html#fishing`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  /* 1. the shell rotated, and --nav-h was measured pre-transform */
  const shell = await page.evaluate(() => {
    const bar = document.querySelector('.topbar');
    const cs = getComputedStyle(document.body);
    return {
      rotated: document.documentElement.classList.contains('is-force-landscape'),
      dockH: cs.getPropertyValue('--dock-h').trim(),
      /* offsetHeight is pre-transform; the client rect is post-transform and
         would report the bar's width here.  Show both so the fix is visible. */
      offsetH: bar.offsetHeight,
      rectH: Math.round(bar.getBoundingClientRect().height),
      frame: (() => {
        const d = document.getElementById('frame').contentDocument;
        return d ? `${d.documentElement.clientWidth}x${d.documentElement.clientHeight}` : null;
      })(),
    };
  });
  console.log(line(shell.rotated, `shell rotated  (game viewport ${shell.frame})`));
  console.log(line(shell.dockH === `${shell.offsetH}px`,
    `--dock-h ${shell.dockH} taken from offsetHeight ${shell.offsetH}px, not the post-transform rect ${shell.rectH}px`));
  results.push(shell.rotated, shell.dockH === `${shell.offsetH}px`);

  /* 2. a real tap on the lobby dock, delivered through the transform */
  const tabBox = await page.evaluate(() => {
    /* The client rect IS the right thing here: we want where the pixels
       actually landed on the glass, which is what a finger meets. */
    const r = document.getElementById('tab-slots').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(tabBox.x, tabBox.y);
  await page.waitForTimeout(1200);
  const afterTab = await page.evaluate(() => ({
    hash: location.hash,
    game: document.documentElement.dataset.game,
    rotated: document.documentElement.classList.contains('is-force-landscape'),
  }));
  console.log(line(afterTab.game === 'slots',
    `tapping the 幸运机 tab through the rotation switched games (${afterTab.hash})`));
  console.log(line(afterTab.rotated === false,
    'slots is not in the rotation list, so the shell un-rotated for it'));
  results.push(afterTab.game === 'slots', afterTab.rotated === false);

  /* 3. back to fishing, then tap inside the pool and see if a fish locks.
        This is the input-mapping proof: a wrong mapping locks nothing (or
        locks only when tapping a mirrored position). */
  await page.goto(`${base}index.html#fishing`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);

  /* Wait for the game's own init, not just the document: the chip rack is
     rendered by JS, so a populated rack proves the page is actually running. */
  const gf = page.frames().find((f) => f.url().includes('fishing.html'));
  await gf.waitForFunction(
    () => document.querySelectorAll('#chipRack .chip').length > 0,
    null, { timeout: 15000 },
  ).catch(() => {});

  const present = await gf.evaluate(() => ({
    canvas: !!document.querySelector('canvas'),
    fire: document.querySelectorAll('.fire-button').length,
    chips: document.querySelectorAll('#chipRack .chip').length,
  }));

  /* boundingBox() is already in top-level viewport coordinates and is derived
     from the element quad, so it accounts for the ancestor rotation. */
  const cb = await gf.locator('canvas').boundingBox();
  const fb = present.fire ? await gf.locator('.fire-button').first().boundingBox() : null;

  /* Raw trusted input at viewport coordinates is the ground truth: the browser
     does the real hit-testing through the transform.  Playwright's own
     actionability check reports "obscured" for a rotated ancestor, which is a
     tooling artifact, not something a finger would hit. */
  const readTarget = () => gf.evaluate(() => {
    const el = document.getElementById('targetDisplay');
    return el ? el.textContent.trim() : '';
  }).catch(() => '');

  /* The floating dock occupies the game's top strip, which after the -90deg
     rotation is the screen's left edge.  Stay clear of it. */
  const dockPad = shell.offsetH + 12;
  let locks = 0;
  let firstLock = null;
  const gridX = 12;
  const gridY = 6;
  for (let i = 1; i <= gridX && locks < 3; i++) {
    for (let j = 1; j <= gridY && locks < 3; j++) {
      const x = cb.x + dockPad + ((cb.width - dockPad - 8) * i) / (gridX + 1);
      const y = cb.y + (cb.height * j) / (gridY + 1);
      await page.mouse.click(x, y);
      await page.waitForTimeout(70);
      const t = await readTarget();
      if (t && t !== '尚未锁定') {
        locks += 1;
        if (!firstLock) firstLock = { x: Math.round(x), y: Math.round(y), target: t };
      }
    }
  }
  const stillFishing = await page.evaluate(() => document.documentElement.dataset.game);
  const inputOk = locks > 0 && stillFishing === 'fishing';
  console.log(line(inputOk,
    locks > 0
      ? `tapping the pool locks a fish through the rotation `
        + `(${locks} hits; first "${firstLock.target}" at screen ${firstLock.x},${firstLock.y})`
      : `tapping the pool never locked a fish  [canvas on glass `
        + `${Math.round(cb.width)}x${Math.round(cb.height)} at ${Math.round(cb.x)},${Math.round(cb.y)}; `
        + `game=${stillFishing}; chips=${present.chips}]`));
  results.push(inputOk);

  /* 4. the fire button lives in the game's own overlay; fire a real shot. */
  let fireOk = false;
  if (fb) {
    const before = await gf.evaluate(() => {
      const el = document.getElementById('balanceDisplay');
      return el ? el.textContent.trim() : '';
    }).catch(() => '');
    await page.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.waitForTimeout(1000);
    const after = await gf.evaluate(() => {
      const el = document.getElementById('footerStatus') || document.getElementById('balanceDisplay');
      return el ? el.textContent.trim() : '';
    }).catch(() => '');
    fireOk = after !== '' && after !== before;
  }
  console.log(line(!!fb && fb.width >= 40 && fb.height >= 40,
    fb ? `fire button ${Math.round(fb.width)}x${Math.round(fb.height)} on glass at `
       + `${Math.round(fb.x)},${Math.round(fb.y)}; tap produced a state change: ${fireOk}`
       : `fire button not in the DOM (matches=${present.fire}, canvas=${present.canvas}, chips=${present.chips})`));
  results.push(!!fb && fb.width >= 40 && fb.height >= 40);

  writeFileSync(`${OUT}/rot-${ph.id}-fishing.png`, await page.screenshot());
  if (errs.length) {
    console.log('  page errors:');
    [...new Set(errs)].forEach((e) => console.log(`    ${e}`));
  }
  results.push(errs.length === 0);
  console.log(line(errs.length === 0, 'no page errors'));
  await page.close();
}

await browser.close();
server.close();

const bad = results.filter((r) => !r).length;
console.log(`\n  ${bad === 0 ? 'all rotation checks pass' : `${bad} rotation check(s) FAILING`}\n`);
process.exitCode = bad === 0 ? 0 : 1;
