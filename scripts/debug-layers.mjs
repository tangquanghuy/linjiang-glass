/* Bisect the portrait layer stack to find which one draws the hard-edged rectangle
   near the Girls ear.  Shoots the same crop with one layer hidden at a time. */

import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 5193 }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
await page.goto('http://127.0.0.1:5193/?mode=portrait', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

const view = await page.evaluate(() => {
  const s = document.querySelector('.pscale');
  return {
    k: Number(getComputedStyle(s).getPropertyValue('--k')),
    left: s.offsetLeft,
    earTop: document.querySelector('[data-panel="girls"]').offsetTop,
  };
});
const toReal = (v) => v * view.k;
const clip = {
  x: view.left + toReal(10),
  y: toReal(view.earTop - 120),
  width: toReal(430),
  height: toReal(200),
};

const LAYERS = [
  ['baseline', null],
  ['no-blossom', '.pblossoms'],
  ['no-rim', '.prim'],
  ['no-frost', '.pg-frost'],
  ['no-edge', '.pg-edge'],
  ['no-tint', '.pg-tint'],
  ['no-scatter', '.pg-scatter'],
  ['no-blur', '.pg-blur'],
  ['no-content', '.pcontent'],
];

for (const [name, sel] of LAYERS) {
  await page.evaluate((s) => {
    document.querySelectorAll('[data-hidden]').forEach((el) => {
      el.style.visibility = '';
      el.removeAttribute('data-hidden');
    });
    if (!s) return;
    document.querySelectorAll(s).forEach((el) => {
      el.style.visibility = 'hidden';
      el.setAttribute('data-hidden', '1');
    });
  }, sel);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `artifacts/layer-${name}.png`, clip });
  console.log(`  wrote artifacts/layer-${name}.png${sel ? `   (hid ${sel})` : ''}`);
}

await browser.close();
await server.close();
