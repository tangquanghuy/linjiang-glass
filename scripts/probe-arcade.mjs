/* One-off probe: read computed boxes for a selector list at a given viewport.
   Usage: node scripts/probe-arcade.mjs slots 844 390 ".cabinet-marquee" ".marquee-title"
*/
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const [game, w, h, ...sels] = process.argv.slice(2);
const ROOT = resolve('.');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  let file = join(ROOT, normalize(url).replace(/^([/\\])+/, ''));
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); }
  catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true,
});
await page.goto(`http://127.0.0.1:${server.address().port}/arcade/${game}.html`, { waitUntil: 'load' });
await page.waitForTimeout(700);
const out = await page.evaluate((list) => list.map((sel) => {
  const el = document.querySelector(sel);
  if (!el) return { sel, missing: true };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    sel,
    box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    font: cs.fontSize, line: cs.lineHeight, pad: cs.padding, margin: cs.margin,
    overflow: cs.overflow, stroke: cs.webkitTextStrokeWidth, shadow: cs.textShadow.slice(0, 60),
  };
}), sels);
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
