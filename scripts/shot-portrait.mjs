/* Portrait renders and checks.
   ------------------------------------------------------------------
   Three things worth verifying automatically, because all three were the reasons
   the portrait layout is a separate composition rather than a rescale:

     1. legibility  -- the smallest type has to clear the platform floor in *real*
                       pixels at a phone-width container, not in canvas units
     2. elasticity  -- opening the preview must make the document taller, and
                       closing it must make it shorter again, with no empty region
                       left behind in either state
     3. the seam    -- the gap between panels has to be one width all the way
                       across, including under each raised title ear

   Usage: node scripts/shot-portrait.mjs
*/

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'artifacts';
const PHONE = { width: 390, height: 844 };
const NATIVE = { width: 941, height: 1200 };

const server = await createServer({ server: { port: 5198 }, logLevel: 'warn' });
await server.listen();
const url = 'http://127.0.0.1:5198/?mode=portrait';

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });

const problems = [];
const openPage = async (viewport, scaleFactor = 1) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scaleFactor });
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return page;
};

/* ---------------------------------------------------------------- 1. render */
const native = await openPage(NATIVE, 1);
writeFileSync(`${OUT}/portrait-native.png`, await native.screenshot({ fullPage: true }));
/* Open the preview so the girls -> preview seam and the meter type are covered. */
await native.click('.prail > .pcard:nth-child(3)');
await native.waitForTimeout(600);
writeFileSync(`${OUT}/portrait-native-open.png`, await native.screenshot({ fullPage: true }));
/* Back to the rail, so the seam and bleed figures below describe the resting state. */
await native.click('[data-preview-close]');
await native.waitForTimeout(600);

const measureSeam = () => native.evaluate(() => {
  const scale = document.querySelector('.pscale');
  const k = Number(getComputedStyle(scale).getPropertyValue('--k'));
  const panels = [...document.querySelectorAll('.pcontent > .ppanel')];
  const rows = [];
  for (let i = 0; i < panels.length - 1; i++) {
    const a = panels[i];
    const b = panels[i + 1];
    const aBottom = a.offsetTop + a.offsetHeight;
    rows.push({
      pair: `${a.dataset.panel} -> ${b.dataset.panel}`,
      /* Under the ear the upper panel's edge sits one seam above the lower ear;
         to the right of it the two edges are the same seam apart because the
         upper panel's bottom carries the matching notch. */
      seamUnderEar: b.offsetTop - (aBottom - 44),
      overlap: aBottom - b.offsetTop,
    });
  }
  return { k, rows };
});

const seam = await measureSeam();

/* Nothing may cross the silhouette's side edges (PANEL.left 33 .. right 908).  The
   rail is the risk: it pulls back out of the panel padding to let cards scroll to
   the edge, and pulling back by the wrong inset puts it over the rim. */
const bleed = await native.evaluate(() => {
  /* Origin is .pscale, not .pstage: above the k ceiling the stage centres the
     column, so the two no longer share a left edge. */
  const scale = document.querySelector('.pscale');
  const origin = scale.getBoundingClientRect().left;
  const k = Number(getComputedStyle(scale).getPropertyValue('--k'));
  const toCanvas = (v) => Math.round((v - origin) / k);
  const rows = [];
  for (const sel of ['.pworld', '.pstats', '.pfavor', '.prail', '.pdots', '.ppreview-body', '.ppreview-foot']) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    rows.push({ sel, left: toCanvas(r.left), right: toCanvas(r.right) });
  }
  return rows;
});

/* Captured while the page is still open; the canvas width is dynamic now. */
const pwNative = await native.evaluate(() =>
  parseFloat(getComputedStyle(document.querySelector('.pscale')).getPropertyValue('--pw')));

/* ------------------------------------------------------------ 2. legibility */
const phone = await openPage(PHONE, 1);
const collapsedType = await phone.evaluate(() => {
  /* Every font-size actually used in the portrait subtree, in canvas units, so a
     new rule cannot slip under the floor unnoticed. */
  const seen = new Map();
  document.querySelectorAll('.pscale *').forEach((el) => {
    /* Only elements that style a text node of their own: a container inherits a
       font-size it never paints, which would report a size nothing is drawn at. */
    const owns = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!owns) return;
    const size = Math.round(parseFloat(getComputedStyle(el).fontSize));
    const key = `${size}`;
    if (!seen.has(key)) seen.set(key, el.className || el.tagName.toLowerCase());
  });
  return [...seen.entries()].map(([size, who]) => ({ size: Number(size), who }))
    .sort((a, b) => a.size - b.size);
});

const type = await phone.evaluate(() => {
  const px = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const k = Number(getComputedStyle(document.querySelector('.pscale')).getPropertyValue('--k'));
    return +(parseFloat(getComputedStyle(el).fontSize) * k).toFixed(1);
  };
  return {
    'world place (smallest)': px('.pworld-place'),
    'meta secondary': px('.pmeta em'),
    'money value': px('.pmoney b'),
    'meter unit': px('.pmeter-head em'),
    'card name': px('.pcard-name b'),
    'card favour max': px('.pcard-favor span'),
    'ear caption': px('.pear-cap span'),
  };
});

const openType = async () => {
  await phone.click('.prail > .pcard:nth-child(3)');
  await phone.waitForTimeout(600);
  const v = await phone.evaluate(() => {
    const k = Number(getComputedStyle(document.querySelector('.pscale')).getPropertyValue('--k'));
    const px = (sel) => {
      const el = document.querySelector(sel);
      return el ? +(parseFloat(getComputedStyle(el).fontSize) * k).toFixed(1) : null;
    };
    return {
      'meter label': px('.pmeter-head span'),
      'meter unit': px('.pmeter-head em'),
      'preview status tag': px('.ppreview-status span'),
      'status tag': px('.ppreview-status span'),
    };
  });
  await phone.click('[data-preview-close]');
  await phone.waitForTimeout(500);
  return v;
};

const height = () => phone.evaluate(() => ({
  doc: Math.round(document.documentElement.scrollHeight),
  stage: Math.round(document.querySelector('.pstage').getBoundingClientRect().height),
  content: Math.round(document.querySelector('.pcontent').offsetHeight),
  panels: [...document.querySelectorAll('.pcontent > .ppanel')].map((p) => p.dataset.panel),
  /* Empty space check: below the last panel there must be nothing but the
     deliberate padding that keeps the bottom rim's outward bloom from being
     clipped.  Anything more than that is a region of canvas no panel covers. */
  slack: (() => {
    const content = document.querySelector('.pcontent');
    const ps = [...content.querySelectorAll(':scope > .ppanel')];
    const last = ps[ps.length - 1];
    const pad = parseFloat(getComputedStyle(content).paddingBottom);
    return Math.round(content.offsetHeight - (last.offsetTop + last.offsetHeight) - pad);
  })(),
}));

Object.assign(type, await openType());

/* -------------------------------------------------------------- 3. elastic */
const collapsed = await height();
/* The type probe scrolled the rail; reset it so the artifact shows the state a
   reader actually lands on. */
await phone.evaluate(() => { document.querySelector('.prail').scrollLeft = 0; });
await phone.waitForTimeout(300);
writeFileSync(`${OUT}/portrait-collapsed.png`, await phone.screenshot({ fullPage: true }));

await phone.click('.prail > .pcard:nth-child(3)');
await phone.waitForTimeout(500);
const expanded = await height();
writeFileSync(`${OUT}/portrait-expanded.png`, await phone.screenshot({ fullPage: true }));

/* The preview's own next/prev must change girl without closing, and must bring the
   matching card into view -- that is what replaces the unhittable paging button. */
const who = () => phone.$eval('.ppreview-id h3', (el) => el.textContent.trim());
const nav = { before: await who() };
await phone.click('[data-preview-step="1"]');
await phone.waitForTimeout(600);
nav.after = await who();
/* The panel swaps in place, so "still open" means the second panel is still in its
   preview state and no third panel appeared. */
nav.panels = await phone.$$eval('.pcontent > .ppanel', (els) => els.length);
nav.stillOpen = await phone.$$eval('.ppanel.is-preview', (n) => n.length === 1);

await phone.click('[data-preview-close]');
await phone.waitForTimeout(600);
const reclosed = await height();
/* Closing has to land the rail on the character that was being read, not at 0. */
nav.railBack = await phone.$eval('.prail', (el) => Math.round(el.scrollLeft));

await browser.close();
await server.close();

/* ------------------------------------------------------------------ report */
const line = (ok) => (ok ? 'ok  ' : 'FAIL');

console.log(`\n  seam widths   (k = ${seam.k.toFixed(4)} at ${NATIVE.width}px container)`);
console.log(`  ${'-'.repeat(64)}`);
for (const r of seam.rows) {
  console.log(`  ${line(r.seamUnderEar === 26)} ${r.pair.padEnd(22)} seam ${String(r.seamUnderEar).padStart(3)}  `
    + `box overlap ${String(r.overlap).padStart(3)}   (want seam 26, overlap 18)`);
}

console.log(`\n  nothing crosses the silhouette edges (33 .. ${pwNative - 33})`);
console.log(`  ${'-'.repeat(64)}`);
for (const b of bleed) {
  console.log(`  ${line(b.left >= 33 && b.right <= pwNative - 33)} ${b.sel.padEnd(18)} `
    + `${String(b.left).padStart(4)} .. ${String(b.right).padStart(4)}`);
}

console.log(`\n  smallest type in real px at a ${PHONE.width}px container`);
console.log(`  ${'-'.repeat(64)}`);
console.log('   iOS reference: body 17, footnote 13, smallest standard 11');
for (const [name, v] of Object.entries(type)) {
  console.log(`  ${line(v !== null && v >= 13)} ${name.padEnd(24)} ${String(v).padStart(6)}`);
}

const kPhone = PHONE.width / 941;
const under = collapsedType.filter((t) => t.size * kPhone < 13);
console.log(`\n  every font-size in the subtree, smallest first (canvas units -> real px)`);
console.log(`  ${'-'.repeat(64)}`);
for (const t of collapsedType.slice(0, 6)) {
  console.log(`  ${line(t.size * kPhone >= 13)} ${String(t.size).padStart(3)} -> `
    + `${(t.size * kPhone).toFixed(1).padStart(5)}   ${String(t.who).slice(0, 34)}`);
}
console.log(`  ${line(!under.length)} ${under.length} rule(s) under the 13px floor`);

console.log(`\n  elastic height   (${PHONE.width}x${PHONE.height} viewport)`);
console.log(`  ${'-'.repeat(64)}`);
const row = (label, h) => console.log(`  ${label.padEnd(12)} doc ${String(h.doc).padStart(5)}   `
  + `stage ${String(h.stage).padStart(5)}   canvas ${String(h.content).padStart(5)}   `
  + `slack ${String(h.slack).padStart(3)}   [${h.panels.join(', ')}]`);
row('collapsed', collapsed);
row('expanded', expanded);
row('reclosed', reclosed);
console.log(`  ${'-'.repeat(64)}`);
console.log(`  ${line(expanded.stage > collapsed.stage)} opening the preview grows the page `
  + `(+${expanded.stage - collapsed.stage}px)`);
console.log(`  ${line(reclosed.stage === collapsed.stage)} closing it restores the original height`);
console.log(`  ${line(collapsed.slack === 0 && expanded.slack === 0)} no uncovered canvas in either state`);

console.log(`\n  preview navigation`);
console.log(`  ${'-'.repeat(64)}`);
console.log(`  ${line(nav.after !== nav.before)} next changes girl  `
  + `${nav.before} -> ${nav.after}`);
console.log(`  ${line(nav.stillOpen)} panel stays in preview state`);
console.log(`  ${line(nav.panels === 2)} still only two panels, no extra level (${nav.panels})`);
console.log(`  ${line(nav.railBack > 0)} closing lands the rail on the character read `
  + `(scrollLeft ${nav.railBack})`);



if (problems.length) {
  console.log('\n  page errors:');
  problems.forEach((p) => console.log('    ' + p));
}
console.log(`\n  wrote ${OUT}/portrait-native.png, portrait-collapsed.png, portrait-expanded.png\n`);
