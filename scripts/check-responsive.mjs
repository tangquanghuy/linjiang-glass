/* Responsive sweep.
   ------------------------------------------------------------------
   The portrait composition was verified at two container widths.  "Responsive"
   means more than that, so this sweeps the widths a phone/tablet/embedded
   container actually takes and checks the things that can break independently of
   each other:

     k                  the single scale factor, containerWidth / 941
     smallest type       must stay >= 13 real px at every width
     horizontal overflow the document must never scroll sideways
     uncovered canvas    no region below the last panel beyond the rim padding
     first screen        whether the two permanent panels still fit one viewport

   It also checks the two cases outside portrait entirely: what a phone held in
   landscape gets, and whether rotating re-picks the layout.

   Usage: node scripts/check-responsive.mjs
*/

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const server = await createServer({ server: { port: 5197 }, logLevel: 'warn' });
await server.listen();
const base = 'http://127.0.0.1:5197/';
const browser = await chromium.launch();

const problems = [];

/* Portrait widths worth covering: smallest phone still shipping, the common
   390-430 band, a large phone, tablet portrait, and a wide embedded column. */
const WIDTHS = [
  [320, 693, 'iPhone SE 1st gen'],
  [360, 800, 'common Android'],
  [390, 844, 'iPhone 14/15'],
  [414, 896, 'iPhone 11'],
  [430, 932, 'iPhone Pro Max'],
  [600, 1000, 'small tablet / embedded'],
  [768, 1024, 'iPad portrait'],
  [820, 1180, 'iPad Air portrait'],
  [1024, 1366, 'iPad Pro portrait'],
];

const probe = async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => problems.push(`${width}x${height}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${width}x${height}: ${m.text()}`));
  await page.goto(`${base}?mode=portrait`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const r = await page.evaluate(() => {
    const scale = document.querySelector('.pscale');
    const content = document.querySelector('.pcontent');
    const stage = document.querySelector('.pstage');
    const k = Number(getComputedStyle(scale).getPropertyValue('--k'));
    let min = Infinity;
    document.querySelectorAll('.pscale *').forEach((el) => {
      const owns = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!owns) return;
      min = Math.min(min, parseFloat(getComputedStyle(el).fontSize));
    });
    const ps = [...content.querySelectorAll(':scope > .ppanel')];
    const last = ps[ps.length - 1];
    const pad = parseFloat(getComputedStyle(content).paddingBottom);
    return {
      k,
      minType: +(min * k).toFixed(1),
      stageH: Math.round(stage.getBoundingClientRect().height),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      slack: Math.round(content.offsetHeight - (last.offsetTop + last.offsetHeight) - pad),
    };
  });
  await page.close();
  return r;
};

console.log('\n  portrait sweep');
console.log(`  ${'-'.repeat(78)}`);
console.log('  width  device                 k      min type   1st screen   overflowX  slack');
console.log(`  ${'-'.repeat(78)}`);
const fails = [];
for (const [w, h, name] of WIDTHS) {
  const r = await probe(w, h);
  const fits = r.stageH <= h;
  const ok = r.minType >= 13 && r.overflowX === 0 && r.slack === 0;
  if (!ok) fails.push(`${w}px: type ${r.minType}, overflowX ${r.overflowX}, slack ${r.slack}`);
  console.log(`  ${String(w).padStart(5)}  ${name.padEnd(22)} ${r.k.toFixed(3)}   `
    + `${String(r.minType).padStart(5)}    ${(fits ? 'fits' : `${r.stageH}px`).padStart(8)}   `
    + `${String(r.overflowX).padStart(7)}   ${String(r.slack).padStart(4)}  ${ok ? '' : '<-- FAIL'}`);
}

/* ------------------------------------------------- phone held in landscape */
console.log('\n  a phone in landscape (no ?mode, so the app picks)');
console.log(`  ${'-'.repeat(78)}`);
const land = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
land.on('pageerror', (e) => problems.push(`844x390: ${e}`));
await land.goto(base, { waitUntil: 'networkidle' });
await land.evaluate(() => document.fonts.ready);
await land.waitForTimeout(350);
const landInfo = await land.evaluate(() => {
  const portrait = !!document.querySelector('.pstage');
  const stage = document.getElementById('stage');
  if (portrait) return { mode: 'portrait' };
  const k = Number(getComputedStyle(stage).getPropertyValue('--k'));
  return {
    mode: 'landscape',
    k,
    visibleCanvasH: Math.round(innerHeight / k),
    visibleCanvasW: Math.round(innerWidth / k),
    croppedTopBottom: Math.round((941 - innerHeight / k) / 2),
    /* Landscape's smallest tier is --fs-micro 13 canvas px. */
    minType: +(13 * k).toFixed(1),
  };
});
console.log(`  picked: ${landInfo.mode}`);
if (landInfo.mode === 'landscape') {
  console.log(`  k ${landInfo.k.toFixed(3)}   visible canvas ${landInfo.visibleCanvasW}x${landInfo.visibleCanvasH} of 1672x941`);
  console.log(`  cropped ${landInfo.croppedTopBottom}px off top and bottom`);
  console.log(`  smallest landscape type lands at ${landInfo.minType} real px  (floor 13)`);
}

/* The type can be lived with at 62% of desktop angular size; a finger cannot, so
   the hit areas are the thing that had to be fixed.  Measured as rendered real
   pixels, which is what a fingertip actually meets. */
const targets = await land.evaluate(() => {
  const k = Number(getComputedStyle(document.getElementById('stage')).getPropertyValue('--k'));
  const out = [];
  for (const [name, sel] of [
    ['tool button', '.pane-pod .tool-btn'],
    ['next page', '.tool-btn.rail-next'],
    ['card star', '.card-star'],
    ['detail button', '.btn-ghost'],
  ]) {
    const el = document.querySelector(sel);
    if (!el) continue;
    /* getBoundingClientRect is post-transform (real px); a pseudo-element's computed
       `top` is pre-transform (canvas units).  Mixing the two inflates the result by
       1/k, so convert the inset before adding it. */
    const drawn = el.getBoundingClientRect().width;
    const grow = parseFloat(getComputedStyle(el, '::after').top) || 0;
    out.push({
      name,
      drawn: +drawn.toFixed(1),
      hit: +(drawn + 2 * Math.abs(grow) * k).toFixed(1),
    });
  }
  return out;
});
/* The one thing a number cannot settle: whether type at 62% of its desktop angular
   size is acceptable.  Shot at deviceScaleFactor 3 so the artifact shows what the
   panel actually resolves to on a phone screen. */
await land.close();
const shot = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 });
await shot.goto(base, { waitUntil: 'networkidle' });
await shot.evaluate(() => document.fonts.ready);
await shot.waitForTimeout(600);
writeFileSync('artifacts/landscape-phone.png', await shot.screenshot());
await shot.close();

console.log('\n  landscape touch targets on that phone (real px; 44 is the guideline)');
console.log(`  ${'-'.repeat(78)}`);
for (const t of targets) {
  console.log(`  ${t.hit >= 43.5 ? 'ok  ' : 'FAIL'} ${t.name.padEnd(16)} drawn ${String(t.drawn).padStart(5)}  `
    + `hit ${String(t.hit).padStart(5)}`);
}

/* ------------------------------------------------------------------- pinning */
/* 置顶 writes to the same localStorage key the landscape rail reads, so a pin has
   to reorder the portrait rail and survive a reload. */
const pin = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
pin.on('pageerror', (e) => problems.push(`pin: ${e}`));
await pin.goto(`${base}?mode=portrait`, { waitUntil: 'networkidle' });
await pin.waitForTimeout(400);
const names = () => pin.$$eval('.prail > .pcard', (els) => els.map((e) => e.dataset.name));
const pinBefore = await names();
await pin.click('.prail > .pcard:nth-child(3) .pcard-star');
await pin.waitForTimeout(400);
const pinAfter = await names();
const stored = await pin.evaluate(() => localStorage.getItem('glass-hud-pinned'));
await pin.reload({ waitUntil: 'networkidle' });
await pin.waitForTimeout(500);
const pinReload = await names();
const pinnedFlag = await pin.$$eval('.prail > .pcard.is-pinned', (n) => n.length);
await pin.close();

console.log('\n  置顶 (portrait)');
console.log(`  ${'-'.repeat(78)}`);
console.log(`  before  ${pinBefore.join(' ')}`);
console.log(`  after   ${pinAfter.join(' ')}`);
console.log(`  ${pinAfter[0] === pinBefore[2] ? 'ok  ' : 'FAIL'} pinned card moves to the front`);
console.log(`  ${stored && stored.includes(pinBefore[2]) ? 'ok  ' : 'FAIL'} written to the shared store  ${stored}`);
console.log(`  ${pinReload[0] === pinBefore[2] ? 'ok  ' : 'FAIL'} survives a reload`);
console.log(`  ${pinnedFlag === 1 ? 'ok  ' : 'FAIL'} exactly one card marked is-pinned (${pinnedFlag})`);

/* --------------------------------------------------------------- rotation */
console.log('\n  rotation');
console.log(`  ${'-'.repeat(78)}`);
const rot = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
rot.on('pageerror', (e) => problems.push(`rotate: ${e}`));
await rot.goto(base, { waitUntil: 'networkidle' });
await rot.waitForTimeout(350);
/* Both layouts stay mounted and are shown one at a time, so presence in the DOM is
   not the mode -- ask which one is actually visible. */
const activeMode = () => rot.evaluate(() => {
  const p = document.querySelector('#pstage');
  const l = document.getElementById('stage');
  const vis = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  if (vis(p) && !vis(l)) return 'portrait';
  if (vis(l) && !vis(p)) return 'landscape';
  return `ambiguous (portrait ${vis(p)}, landscape ${vis(l)})`;
});

const beforeRot = await activeMode();
await rot.setViewportSize({ width: 844, height: 390 });
await rot.waitForTimeout(700);
const afterRot = await activeMode();
await rot.setViewportSize({ width: 390, height: 844 });
await rot.waitForTimeout(700);
const backRot = await activeMode();
await rot.close();
console.log(`  390x844          -> ${beforeRot}`);
console.log(`  rotate to 844x390 -> ${afterRot}   ${afterRot === 'landscape' ? 'ok' : 'FAIL: did not re-pick'}`);
console.log(`  rotate back       -> ${backRot}   ${backRot === 'portrait' ? 'ok' : 'FAIL: did not restore'}`);

await browser.close();
await server.close();

console.log('\n  summary');
console.log(`  ${'-'.repeat(78)}`);
console.log(`  portrait sweep: ${fails.length ? `${fails.length} width(s) failing` : 'all widths pass'}`);
fails.forEach((f) => console.log(`    - ${f}`));
console.log(`  landscape on a phone: touch targets fixed (all ${targets.every((t) => t.hit >= 43.5) ? 'at 44+' : 'FAILING'}); `
  + `type still at ${landInfo.minType} real px = 62% of desktop angular size -- judge from `
  + `artifacts/landscape-phone.png`);
console.log(`  rotation re-picks layout: ${afterRot === 'landscape' && backRot === 'portrait' ? 'yes, both ways' : 'NO'}`);
if (problems.length) {
  console.log('\n  page errors:');
  [...new Set(problems)].forEach((p) => console.log(`    ${p}`));
}
console.log('');
