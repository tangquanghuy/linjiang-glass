/* Pixel diff against the prototype.
   ------------------------------------------------------------------
   Boots Vite in preview mode, screenshots the page at exactly 1672x941 with
   deviceScaleFactor 1 (so the canvas scale is exactly 1 and one CSS pixel is one
   prototype pixel), then reports mean absolute error per region.

   Character art is excluded from the headline number, since matching it is out of
   scope -- the placeholder crops are only there so the cards read correctly.

   Usage: npm run diff            all regions
          npm run diff -- rim     only regions whose name contains "rim"
*/

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const W = 1672;
const H = 941;
const OUT = 'artifacts';

/* Regions worth tracking separately: a single global number hides which part of
   the glass is off. */
const REGIONS = [
  ['glass body (left)', 40, 470, 500, 640],
  ['glass body (right)', 830, 420, 1330, 460],
  ['top rim (main)', 360, 402, 1330, 422],
  ['top rim (ear)', 40, 381, 300, 401],
  ['top rim (pod)', 1440, 341, 1630, 361],
  ['bottom rim', 40, 710, 1630, 730],
  ['left edge', 14, 430, 34, 700],
  ['right edge', 1638, 470, 1658, 700],
  ['status header', 40, 400, 320, 455],
  ['status stats', 40, 470, 500, 580],
  ['favor row', 40, 620, 500, 700],
  ['girls header', 515, 395, 800, 462],
  ['tool pod', 1392, 345, 1652, 445],
  ['card1 stats', 680, 470, 800, 700],
  ['card2 stats', 957, 470, 1077, 700],
  ['card3 stats', 1234, 470, 1354, 700],
  ['card4 stats', 1511, 470, 1631, 700],
  ['outside (must be ~0)', 60, 180, 1600, 320],
];

/* Art columns of each card, excluded from the headline figure. */
const ART = [0, 1, 2, 3].map((i) => {
  const x = 537 + i * 277;
  return [x, 467, x + 146, 700];
});

const filter = process.argv[2];

const server = await createServer({ server: { port: 5199 }, logLevel: 'warn' });
await server.listen();
const url = `http://127.0.0.1:5199/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
page.on('pageerror', (e) => problems.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

mkdirSync(OUT, { recursive: true });
const shotBuf = await page.screenshot({ type: 'png' });
writeFileSync(`${OUT}/render.png`, shotBuf);
await browser.close();
await server.close();

if (problems.length) {
  console.log('\npage errors:');
  problems.forEach((p) => console.log('  ' + p));
}

const shot = PNG.sync.read(shotBuf);
const ref = PNG.sync.read(readFileSync('public/ref/prototype.png'));
if (shot.width !== W || ref.width !== W) {
  throw new Error(`size mismatch: render ${shot.width}x${shot.height}, ref ${ref.width}x${ref.height}`);
}

const at = (img, x, y) => {
  const i = (y * W + x) << 2;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const inArt = (x, y) => ART.some(([a, b, c, d]) => x >= a && x < c && y >= b && y < d);

function score(x0, y0, x1, y1, skipArt) {
  let sum = 0;
  let worst = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (skipArt && inArt(x, y)) continue;
      const a = at(shot, x, y);
      const b = at(ref, x, y);
      const e = (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
      sum += e;
      if (e > worst) worst = e;
      n++;
    }
  }
  return n ? { mae: sum / n, worst, n } : { mae: 0, worst: 0, n: 0 };
}

console.log(`\n  region                    MAE   worst   (0 = identical, 255 = inverted)`);
console.log(`  ${'-'.repeat(64)}`);
let shown = 0;
for (const [name, ...box] of REGIONS) {
  if (filter && !name.includes(filter)) continue;
  const s = score(...box, true);
  const bar = '#'.repeat(Math.min(28, Math.round(s.mae)));
  console.log(`  ${name.padEnd(22)} ${s.mae.toFixed(1).padStart(6)}  ${String(Math.round(s.worst)).padStart(5)}  ${bar}`);
  shown++;
}

const all = score(0, 330, W, 800, true);
console.log(`  ${'-'.repeat(64)}`);
console.log(`  HUD band overall      ${all.mae.toFixed(2).padStart(6)}  ${String(Math.round(all.worst)).padStart(5)}   (art excluded)`);

/* Amplified difference image, so small errors are still visible. */
const out = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) << 2;
    const a = at(shot, x, y);
    const b = at(ref, x, y);
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.min(255, Math.abs(a[c] - b[c]) * 4);
    out.data[i + 3] = 255;
  }
}
writeFileSync(`${OUT}/diff.png`, PNG.sync.write(out));

/* Side-by-side of the HUD band for quick eyeballing. */
const band = new PNG({ width: W, height: 470 * 2 });
for (let y = 0; y < 470; y++) {
  for (let x = 0; x < W; x++) {
    const src = ((y + 330) * W + x) << 2;
    const top = (y * W + x) << 2;
    const bot = ((y + 470) * W + x) << 2;
    for (let c = 0; c < 4; c++) {
      band.data[top + c] = ref.data[src + c];
      band.data[bot + c] = shot.data[src + c];
    }
  }
}
writeFileSync(`${OUT}/band.png`, PNG.sync.write(band));
console.log(`\n  wrote ${OUT}/render.png, ${OUT}/diff.png, ${OUT}/band.png  (${shown} regions)\n`);
