/* Nested SillyTavern reading-column sweep.
   ------------------------------------------------------------------
   check-responsive.mjs opens the HUD as the top window.  That never sees the
   constraint that actually broke CJK wrapping and the inner scrollbar: a status
   iframe trapped inside #sheld (--sheldWidth 50–90vw from 正文美化) with
   overflow:hidden, then lifted to the tavern body by the character-card shell.

   This drives tools/tavern-fixture.html, which nests:

     tavern window  →  #sheld (reading column)  →  status iframe  →  HUD

   Usage: node scripts/check-embed.mjs
*/

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  PRESETS, portraitHud, isDesktop, portraitHudWidth, desktopHudBox, PORTRAIT_GUTTER,
} from '../tools/embed-contract.js';

const server = await createServer({ server: { port: 5199 }, logLevel: 'warn' });
await server.listen();
const origin = 'http://127.0.0.1:5199';
const browser = await chromium.launch();
mkdirSync('artifacts', { recursive: true });

const problems = [];
const fails = [];

const fixtureUrl = (preset) => {
  const url = new URL('/tools/tavern-fixture.html', origin);
  url.searchParams.set('chrome', '0');
  url.searchParams.set('preset', preset.id);
  url.searchParams.set('sheld', String(preset.sheldVw));
  if (preset.wrapPx) url.searchParams.set('wrap', String(preset.wrapPx));
  if (preset.nest) url.searchParams.set('nest', '1');
  if (preset.sidebar) url.searchParams.set('sidebar', '1');
  return url.toString();
};

const openPreset = async (preset) => {
  const page = await browser.newPage({
    viewport: { width: preset.vw, height: preset.vh },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => problems.push(`${preset.id}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${preset.id}: ${m.text()}`));
  await page.goto(fixtureUrl(preset), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const m = window.__linjiangEmbed?.measure?.();
    if (!m || m.sheldW < 80) return false;
    if (m.mode === 'portrait') return m.lifted && m.hudH > 200 && m.whereW > 0;
    return m.hudW > 80;
  }, { timeout: 20000 });
  await page.waitForTimeout(250);
  return page;
};

const probe = async (page) => page.evaluate(() => window.__linjiangEmbed.measure());

const check = (id, ok, detail) => {
  if (!ok) fails.push(`${id}: ${detail}`);
  return ok ? 'ok  ' : 'FAIL';
};

console.log('\n  tavern embed sweep');
console.log(`  ${'-'.repeat(96)}`);
console.log('        preset                   mode      sheld  slot   hud W×H        where   innerΔ  notes');
console.log(`  ${'-'.repeat(96)}`);

const shotIds = new Set(['iphone-50', 'iphone-squeeze', 'iphone-nest', 'desktop-50']);

for (const preset of PRESETS) {
  const page = await openPreset(preset);
  const m = await probe(page);
  const notes = [];

  const expectPortrait = portraitHud(preset.vw, preset.vh);
  const expectDesktop = isDesktop(preset.vw);
  if (expectPortrait) {
    notes.push(check(preset.id, m.portraitDom, `expected portrait DOM, got landscape`));
    notes.push(check(preset.id, m.lifted, 'HUD was not lifted to tavern body'));
    const wantW = portraitHudWidth(preset.vw, m.slotW);
    notes.push(check(preset.id, Math.abs(m.hudW - wantW) <= 8, `hud width ${m.hudW} want ${wantW}`));
    notes.push(check(preset.id, m.hudLeft >= PORTRAIT_GUTTER - 1, `clipped left ${m.hudLeft}`));
    notes.push(check(preset.id, m.hudLeft + m.hudW <= m.vw - PORTRAIT_GUTTER + 1, `clipped right`));
    notes.push(check(preset.id, m.overflowX <= 1, `HUD overflowX ${m.overflowX}`));
    notes.push(check(preset.id, m.innerScroll <= 2, `nested scrollbar Δ ${m.innerScroll}`));
    if (m.whereFs) {
      const stacked = m.whereH > m.whereFs * 2.8 && m.whereW < m.whereFs * 1.45;
      notes.push(check(preset.id, !stacked, `location stacked ${m.whereW}×${m.whereH} fs ${m.whereFs} “${m.whereText}”`));
    } else {
      notes.push(check(preset.id, false, 'missing .pworld-where b'));
    }
    if (preset.wrapPx) {
      notes.push(check(preset.id, m.slotW <= preset.wrapPx + 8, `slot ${m.slotW} want wrap ${preset.wrapPx}`));
      notes.push(check(preset.id, m.hudW > m.slotW + 40, `HUD did not break out of ${m.slotW} slot`));
    }
    notes.push(check(preset.id, m.hudH > 400, `elastic height too small ${m.hudH}`));
  } else if (expectDesktop) {
    notes.push(check(preset.id, !m.portraitDom, 'desktop still showing portrait'));
    notes.push(check(preset.id, m.lifted, 'desktop HUD was not lifted'));
    const want = desktopHudBox(preset.vw, preset.vh);
    notes.push(check(preset.id, m.hudW + 8 >= want.width, `hud width ${m.hudW} want ${want.width}`));
    if (m.sheldW < want.width - 8) {
      notes.push(check(preset.id, m.hudW > m.sheldW, `HUD ${m.hudW} should outgrow sheld ${m.sheldW}`));
    }
  } else {
    notes.push(check(preset.id, !m.portraitDom, 'landscape phone still showing portrait'));
  }

  const mark = notes.includes('FAIL') ? 'FAIL' : 'ok';
  console.log(
    `  ${mark.padEnd(4)}  ${preset.id.padEnd(22)} ${m.mode.padEnd(18)} `
    + `${String(m.sheldW).padStart(5)} ${String(m.slotW).padStart(5)}  `
    + `${String(m.hudW).padStart(4)}×${String(m.hudH).padStart(4)}   `
    + `${String(m.whereW).padStart(5)}   ${String(m.innerScroll).padStart(5)}  `
    + (notes.includes('FAIL') ? notes.filter((n) => n === 'FAIL').length + ' fail' : ''),
  );

  if (shotIds.has(preset.id)) {
    writeFileSync(`artifacts/embed-${preset.id}.png`, await page.screenshot({ fullPage: false }));
  }

  await page.close();
}

/* Detail page should cover the visual viewport, not the reading slot. */
console.log('\n  portrait detail page (iphone-80)');
console.log(`  ${'-'.repeat(96)}`);
{
  const preset = PRESETS.find((p) => p.id === 'iphone-80');
  const page = await openPreset(preset);
  const hud = page.frameLocator('#linjiang-hud-live');
  await hud.locator('.pbtn-ghost').first().click();
  await page.waitForTimeout(500);
  const m = await probe(page);
  const fillW = Math.abs(m.hudW - preset.vw) <= 2;
  const fillH = Math.abs(m.hudH - preset.vh) <= 2;
  console.log(`  ${fillW && fillH && m.pageOpen ? 'ok  ' : 'FAIL'}  fill ${m.hudW}×${m.hudH} of ${preset.vw}×${preset.vh}  pageOpen=${m.pageOpen}`);
  if (!m.pageOpen) fails.push('iphone-80 page: html.is-page-open missing');
  if (!fillW || !fillH) fails.push(`iphone-80 page: HUD ${m.hudW}×${m.hudH} want ${preset.vw}×${preset.vh}`);
  writeFileSync('artifacts/embed-iphone-80-page.png', await page.screenshot({ fullPage: false }));
  await page.close();
}

await browser.close();
await server.close();

console.log('\n  summary');
console.log(`  ${'-'.repeat(96)}`);
if (fails.length) {
  console.log(`  ${fails.length} check(s) failed`);
  fails.forEach((f) => console.log(`    - ${f}`));
} else {
  console.log('  all embed fixtures passed');
}
if (problems.length) {
  console.log('\n  page errors:');
  [...new Set(problems)].forEach((p) => console.log(`    ${p}`));
}
console.log('');
if (fails.length) process.exit(1);
