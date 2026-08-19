/* How the first screen is spent.
   ------------------------------------------------------------------
   Reports each panel's share of the collapsed canvas and, inside the Status
   panel, how much each block costs -- so "the scenery is eating the view" is a
   number rather than an impression.  Also reports how many cards the rail shows.
*/

import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 5196 }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:5196/?mode=portrait', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

const r = await page.evaluate(() => {
  const content = document.querySelector('.pcontent');
  const total = content.offsetHeight;
  const panels = [...content.querySelectorAll(':scope > .ppanel')].map((p) => ({
    id: p.dataset.panel,
    h: p.offsetHeight,
  }));
  const status = content.querySelector('[data-panel="status"]');
  const blocks = [];
  for (const sel of ['.pworld', '.pstats', '.pmoney', '.pmeta', '.pfavor']) {
    const el = status.querySelector(sel);
    if (el) blocks.push({ sel, h: Math.round(el.getBoundingClientRect().height / (innerWidth / 941)) });
  }
  const cs = getComputedStyle(status);
  blocks.push({ sel: 'padding top (ear)', h: parseFloat(cs.paddingTop) });
  blocks.push({ sel: 'padding bottom', h: parseFloat(cs.paddingBottom) });

  const rail = content.querySelector('.prail');
  const card = rail.querySelector(':scope > *');
  /* clientWidth of an element inside a scaled container is already unscaled
     layout, i.e. canvas units; only getBoundingClientRect is in real pixels.
     Dividing both by k inflated the visible-card count by 1/k. */
  const cardW = Math.round(card.getBoundingClientRect().width / (innerWidth / 941));
  const gap = parseFloat(getComputedStyle(rail).gap);
  const railInner = rail.clientWidth - parseFloat(getComputedStyle(rail).paddingLeft) * 2;
  return {
    total,
    panels,
    blocks,
    cardW,
    cardH: Math.round(card.getBoundingClientRect().height / (innerWidth / 941)),
    visibleCards: +(railInner / (cardW + gap)).toFixed(2),
  };
});

await browser.close();
await server.close();

console.log(`\n  collapsed canvas: ${r.total} units`);
console.log(`  ${'-'.repeat(58)}`);
for (const p of r.panels) {
  const share = (p.h / r.total) * 100;
  console.log(`  ${p.id.padEnd(10)} ${String(p.h).padStart(5)}  ${share.toFixed(1).padStart(5)}%  `
    + '#'.repeat(Math.round(share / 2)));
}
console.log(`\n  inside the Status panel`);
console.log(`  ${'-'.repeat(58)}`);
for (const b of r.blocks) {
  console.log(`  ${b.sel.padEnd(20)} ${String(b.h).padStart(5)} units`);
}
console.log(`\n  rail`);
console.log(`  ${'-'.repeat(58)}`);
console.log(`  card ${r.cardW} x ${r.cardH} units,  ${r.visibleCards} cards visible\n`);
