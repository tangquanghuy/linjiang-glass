/* Portrait full pages.
   ------------------------------------------------------------------
   The existing checks cannot cover this: shot_drawer.mjs and smoke_pages.mjs are both
   pinned to a 1672x941 landscape viewport, and scripts/shot-portrait.mjs only exercises
   the base column and the character preview.

   What is asserted here is what the container decision rests on:

     1. a page *replaces* the column -- one panel, not three -- so it opens where the
        reader is looking rather than below the fold
     2. the stage still measures it: flat bottom, both corners, its own clip path and
        an ornament on its ear
     3. the elastic canvas still has no slack, at the page's own height
     4. closing restores the base column, its rail position and the document scroll
     5. the four pages that are still stubs do not open an empty panel

   Run against a dev server: node tools/shot_portrait_pages.mjs */

import { chromium } from 'playwright';

const url = process.env.HUD_URL || 'http://127.0.0.1:5174/';
const problems = [];
const browser = await chromium.launch();

const state = (page) => page.evaluate(() => {
  const panels = [...document.querySelectorAll('.pcontent > .ppanel')];
  const scale = document.querySelector('.pscale');
  const host = document.getElementById('pstage');
  const k = Number(getComputedStyle(scale).getPropertyValue('--k'));
  return {
    ids: panels.map((p) => p.dataset.panel),
    clips: panels.map((p) => !!document.getElementById(`pClip-${p.dataset.panel}`)),
    blossoms: document.querySelectorAll('.pblossom').length,
    canvas: Math.round(document.querySelector('.pcontent').offsetHeight),
    stage: Math.round(host.getBoundingClientRect().height),
    doc: Math.round(document.documentElement.scrollHeight),
    k: Number(k.toFixed(3)),
    scrollY: Math.round(scrollY),
    rows: document.querySelectorAll('.pinv-row').length,
    cells: document.querySelectorAll('.pslot').length,
    icons: document.querySelectorAll('.pslot-icon').length,
    gems: document.querySelectorAll('.pslot-gem').length,
    iconsLoaded: [...document.querySelectorAll('.pslot-icon')]
      .filter((i) => i.complete && i.naturalWidth > 0).length,
    gemsVisible: [...document.querySelectorAll('.pslot-gem')]
      .filter((g) => getComputedStyle(g).display !== 'none').length,
    /* 强度 as corner notches, only on 消耗品 and only as many lit as the value. */
    notches: [...document.querySelectorAll('.pinv-row')].map((r) => ({
      consumable: r.classList.contains('b-consumable'),
      potency: Number(r.style.getPropertyValue('--potency')) || 0,
      marks: r.querySelectorAll('.item-notch i').length,
      lit: r.querySelectorAll('.item-notch i.on').length,
    })),
    worn: document.querySelectorAll('.pslot-worn').length,
    groups: [...document.querySelectorAll('.pinv-head b')].map((b) => b.textContent),
    visibleGroups: [...document.querySelectorAll('.pinv-group')].filter((group) => !group.hidden)
      .map((group) => group.querySelector('.pinv-head b')?.textContent),
    visibleRows: [...document.querySelectorAll('.pinv-group')].filter((group) => !group.hidden)
      .reduce((sum, group) => sum + group.querySelectorAll('.pinv-row').length, 0),
    inventoryPage: document.querySelector('[data-inventory-page][aria-selected="true"]')?.dataset.inventoryPage,
    railScroll: Math.round(document.querySelector('.prail')?.scrollLeft ?? -1),
  };
});

/* 390 x 640.  Short on purpose: at 390x844 the base column comes to exactly the
   viewport height, so there is nothing to scroll and the restore-on-close assertion
   would pass without testing anything. */
const page = await browser.newPage({ viewport: { width: 390, height: 640 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(`${url}?mode=portrait`, { waitUntil: 'load' });
await page.waitForSelector('#pstage .ppanel');
await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
await page.waitForTimeout(500);

const base = await state(page);
console.log(`base    panels ${JSON.stringify(base.ids)}  canvas ${base.canvas}  doc ${base.doc}  k ${base.k}`);
if (base.ids.join() !== 'status,girls') problems.push(`base panels ${base.ids}`);

/* Scroll down first, so the restore on close has something to restore.  Asked for 120 and
   whatever the document gives back: the base column is only a little taller than one
   screen, so on this viewport 120 clamps to about 58, and the number that matters is the
   one the browser settled on -- see the assertion after the close. */
await page.evaluate(() => scrollTo({ top: 120, behavior: 'auto' }));
await page.evaluate(() => { const r = document.querySelector('.prail'); if (r) r.scrollLeft = 708; });
await page.waitForTimeout(300);
const beforeOpen = await state(page);
console.log(`        scrolled to ${beforeOpen.scrollY}, rail at ${beforeOpen.railScroll}`);
/* Otherwise a restore of 0 onto 0 would pass while testing nothing. */
if (!beforeOpen.scrollY) problems.push('the column did not scroll, so the restore below proves nothing');
if (!beforeOpen.railScroll) problems.push('the rail did not scroll, so the restore below proves nothing');

/* Dispatched rather than clicked through the mouse, and only for this one case: the
   tool pod sits at the very top of the column, so Playwright would scroll it back into
   view before clicking and the scroll position under test would be gone before the
   press ever landed.  Every other press below is a real click. */
await page.evaluate(() => document.querySelector('.ptool[data-page="inventory"]').click());
await page.waitForSelector('.ppanel.is-page');
await page.waitForTimeout(600);
await page.screenshot({ path: 'artifacts/portrait-inventory.png', fullPage: true });

const open = await state(page);
console.log(`\ninventory`);
console.log(`  panels        ${JSON.stringify(open.ids)}  (a page replaces the column)`);
console.log(`  clip + ear    clip=${open.clips.join()} blossoms=${open.blossoms}`);
console.log(`  groups        ${JSON.stringify(open.groups)}; visible ${JSON.stringify(open.visibleGroups)} page ${open.inventoryPage}`);
console.log(`  rows/cells    ${open.rows} rows, ${open.cells} cells, ${open.worn} worn`);
console.log(`  category art  ${open.iconsLoaded}/${open.icons} loaded, ${open.gemsVisible} placeholder(s) still visible`);
console.log(`  canvas ${open.canvas}  stage ${open.stage}  doc ${open.doc}  scrollY ${open.scrollY}`);

if (open.ids.join() !== 'page') problems.push(`a page must be the only panel, got ${open.ids}`);
if (!open.clips.every(Boolean)) problems.push('the page panel has no clip path, so it has no glass');
if (open.blossoms !== 1) problems.push(`expected one ornament on the page's ear, got ${open.blossoms}`);
if (open.groups.join() !== '用品,消耗品,素材') problems.push(`group order ${open.groups}`);
if (open.rows !== 10) problems.push(`expected 10 rows for the sample bag, got ${open.rows}`);
if (open.worn !== 1) problems.push(`expected one 佩戴 ring, got ${open.worn}`);
if (open.icons !== open.cells) problems.push(`only ${open.icons} of ${open.cells} rows kept their <img>`);
if (open.iconsLoaded !== open.cells) problems.push(`${open.cells - open.iconsLoaded} category icon(s) failed to load`);
if (open.gemsVisible) problems.push(`${open.gemsVisible} placeholder gem(s) still visible behind real art`);
const notched = open.notches.filter((n) => n.marks);
console.log(`  强度 notches  ${notched.length} row(s) marked: ${notched.map((n) => `${n.lit}/${n.marks}`).join(' ')}`);
for (const n of open.notches) {
  if (!n.consumable && n.marks) problems.push('a non-consumable row carries 强度 notches');
  if (n.consumable && n.lit !== n.potency) problems.push(`a row lit ${n.lit} notches for 强度 ${n.potency}`);
}
if (open.scrollY !== 0) problems.push(`a page should open at its top, not at ${open.scrollY}`);

/* The elastic contract: the wrapper's height is the measured canvas times k, so there
   is no uncovered strip under the panel and no scrollable void past it. */
const slack = Math.abs(open.stage - Math.round(open.canvas * open.k));
console.log(`  slack         ${slack} (stage height vs canvas x k)`);
if (slack > 2) problems.push(`page canvas leaves ${slack}px of slack`);

/* The bag is paged by bucket now, so it should stay bounded rather than rendering
   all ten rows into one document.  Each named page must reveal exactly its bucket. */
for (const [index, label, count] of [[1, '消耗品', 4], [2, '素材', 3], [0, '用品', 3]]) {
  await page.locator(`[data-inventory-page="${index}"]`).click();
  await page.waitForTimeout(260);
  const paged = await state(page);
  console.log(`  page ${index + 1}/3     ${paged.visibleGroups.join()} · ${paged.visibleRows} rows · canvas ${paged.canvas}`);
  if (paged.inventoryPage !== String(index) || paged.visibleGroups.join() !== label || paged.visibleRows !== count) {
    problems.push(`inventory page ${index}: ${paged.inventoryPage}, ${paged.visibleGroups}, ${paged.visibleRows}`);
  }
}

/* ------------------------------------------------------------------- close */
await page.locator('[data-page-close]').click();
await page.waitForSelector('.ppanel[data-panel="girls"]');
await page.waitForTimeout(500);
const closed = await state(page);
console.log(`\nclose   panels ${JSON.stringify(closed.ids)}  canvas ${closed.canvas}  scrollY ${closed.scrollY}  rail ${closed.railScroll}`);
if (closed.ids.join() !== 'status,girls') problems.push(`close did not restore the column: ${closed.ids}`);
if (closed.canvas !== base.canvas) problems.push(`close left the canvas at ${closed.canvas}, base was ${base.canvas}`);
/* Against where the reader actually was, not against the number we asked for.  These read
   120 and 708 before, and 120 was never reachable: the pre-scroll above clamps to the
   document's own maximum, so the check was failing on a browser doing the right thing.
   The contract is "close puts you back where you were", and beforeOpen is where that was --
   which also keeps the check honest if the column's height changes again. */
if (Math.abs(closed.scrollY - beforeOpen.scrollY) > 40) {
  problems.push(`close did not restore the scroll (${closed.scrollY}, left at ${beforeOpen.scrollY})`);
}
if (Math.abs(closed.railScroll - beforeOpen.railScroll) > 40) {
  problems.push(`close did not restore the rail (${closed.railScroll}, left at ${beforeOpen.railScroll})`);
}

/* Escape peels the page too. */
await page.locator('.ptool[data-page="inventory"]').click();
await page.waitForSelector('.ppanel.is-page');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForSelector('.ppanel[data-panel="girls"]');
console.log('        Escape peels the page: ok');

/* A row opens nothing yet -- there is no deeper level for an item, and it must not
   throw or blank the panel. */
await page.locator('.ptool[data-page="inventory"]').click();
await page.waitForSelector('.ppanel.is-page');
await page.waitForTimeout(300);
await page.locator('.pinv-row').first().click();
await page.waitForTimeout(300);
const afterRow = await state(page);
if (afterRow.ids.join() !== 'page') problems.push('clicking a row disturbed the page');
console.log('        a row click leaves the page standing: ok');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

/* ------------------------------------------------------- every other route */
/* All five routes are built now, so each has to open a page panel and each has to be
   the *only* panel -- the container decision applies to all of them, not just the
   inventory it was first built for. */
console.log('\nroutes:');
const routes = [
  ['当日事件', '.ptool[data-page="events"]', '.pevt'],
  ['地图', '.ptool[data-page="map"]', '.map-layer'],
  ['主角档案', '.pbtn-ghost[data-page="profile"]', '.pfans-fold'],
];
for (const [label, selector, marker] of routes) {
  await page.locator(selector).click();
  await page.waitForSelector(marker, { timeout: 3000 });
  await page.waitForTimeout(420);
  const s = await state(page);
  const count = await page.locator(marker).count();
  const overlay = label === '地图';
  const ok = overlay ? count > 0 : s.ids.join() === 'page' && count > 0;
  console.log(`  ${label.padEnd(6)} panels ${JSON.stringify(s.ids).padEnd(10)} ${marker} x${count}  canvas ${s.canvas}  ${ok ? 'ok' : 'FAIL'}`);
  if (!ok) problems.push(`${label}: panels ${s.ids}, ${marker} x${count}`);
  await page.screenshot({ path: `artifacts/portrait-${marker.slice(1)}.png`, fullPage: true });
  await page.keyboard.press('Escape');
  if (overlay) await page.waitForSelector('.map-layer', { state: 'detached' });
  await page.waitForSelector('.ppanel[data-panel="girls"]');
  await page.waitForTimeout(240);
}

/* 主角档案 -> 档案 is the one route into an archive that does not pass the preview. */
console.log('\narchive:');
await page.locator('.pbtn-ghost[data-page="profile"]').click();
await page.waitForSelector('.pfans-fold');
await page.waitForTimeout(300);
await page.locator('.pfans-fold > summary').click();
await page.waitForSelector('.pfan');
await page.locator('.pfan').first().click();
await page.waitForSelector('.parc-id');
await page.waitForTimeout(500);
await page.screenshot({ path: 'artifacts/portrait-archive.png', fullPage: true });
const arc = await page.evaluate(() => ({
  ids: [...document.querySelectorAll('.pcontent > .ppanel')].map((p) => p.dataset.panel),
  meters: [...document.querySelectorAll('.pmeter-head span')].map((s) => s.textContent),
  tiles: document.querySelectorAll('.pdev-tile').length,
  tallies: document.querySelectorAll('.pexp-list li').length,
  notesOpen: document.querySelectorAll('.pdev-note:not([hidden])').length,
  canvas: Math.round(document.querySelector('.pcontent').offsetHeight),
}));
console.log(`  panels ${JSON.stringify(arc.ids)}  canvas ${arc.canvas}`);
console.log(`  meters ${JSON.stringify(arc.meters)}`);
console.log(`  开发度 tiles ${arc.tiles}, 性经历 tallies ${arc.tallies}, notes open ${arc.notesOpen}`);
if (arc.ids.join() !== 'page') problems.push(`archive panels ${arc.ids}`);
/* 羁绊 two plus 生理 three: the set the landscape archive leaves to the dock behind it,
   which portrait has nothing behind to leave it to. */
if (arc.meters.join() !== '好感度,顺从度,性欲度,体力,尿意') problems.push(`archive meters ${arc.meters}`);
if (arc.tiles !== 4) problems.push(`expected 4 开发度 tiles, got ${arc.tiles}`);
if (arc.tallies !== 12) problems.push(`expected 12 性经历 tallies, got ${arc.tallies}`);
if (arc.notesOpen !== 0) problems.push('a 评语 was open before anything was pressed');

/* The 评语 accordion: opens in place, only one at a time, and the panel is remeasured
   because its height changed. */
const beforeNote = arc.canvas;
await page.locator('[data-dev-part]').first().click();
await page.waitForTimeout(420);
const opened1 = await page.evaluate(() => ({
  open: document.querySelectorAll('.pdev-note:not([hidden])').length,
  expanded: document.querySelectorAll('[data-dev-part][aria-expanded="true"]').length,
  canvas: Math.round(document.querySelector('.pcontent').offsetHeight),
  stage: Math.round(document.getElementById('pstage').getBoundingClientRect().height),
  k: Number(getComputedStyle(document.querySelector('.pscale')).getPropertyValue('--k')),
}));
const noteSlack = Math.abs(opened1.stage - Math.round(opened1.canvas * opened1.k));
console.log(`  评语 opened: ${opened1.open} note, aria-expanded ${opened1.expanded}, canvas ${beforeNote} -> ${opened1.canvas}, slack ${noteSlack}`);
if (opened1.open !== 1 || opened1.expanded !== 1) problems.push('the 评语 accordion did not open exactly one note');
if (opened1.canvas <= beforeNote) problems.push('opening a 评语 did not grow the panel');
if (noteSlack > 2) problems.push(`an open 评语 left ${noteSlack}px of slack -- the silhouette was not redrawn`);

await page.locator('[data-dev-part]').nth(2).click();
await page.waitForTimeout(360);
const opened2 = await page.evaluate(() => document.querySelectorAll('.pdev-note:not([hidden])').length);
console.log(`  a second press leaves ${opened2} open (only one at a time)`);
if (opened2 !== 1) problems.push(`two notes open at once (${opened2})`);
await page.locator('[data-dev-part]').nth(2).click();
await page.waitForTimeout(360);
const closedNote = await page.evaluate(() => document.querySelectorAll('.pdev-note:not([hidden])').length);
if (closedNote !== 0) problems.push('pressing an open tile did not close it');
console.log('  pressing it again closes it: ok');

/* Escape from an archive reached through 羁绊总览 goes back to the base column, not to
   the page it came from: there is one page level, by design. */
await page.keyboard.press('Escape');
await page.waitForSelector('.ppanel[data-panel="girls"]');
console.log('  Escape returns to the column: ok');
await page.close();

/* ---------------------------------------------------- a sweep of widths */
console.log('\nwidth sweep with the page open:');
for (const [w, h] of [[320, 700], [360, 780], [390, 844], [430, 932], [768, 1024]]) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => problems.push(`pageerror ${w}: ${e.message}`));
  await p.goto(`${url}?mode=portrait`, { waitUntil: 'load' });
  await p.waitForSelector('#pstage .ppanel');
  await p.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
  /* The archive, not the inventory: it is the densest page and it carries the tightest
     section headings, so it is the one that finds a width problem first. */
  await p.locator('.pbtn-ghost[data-page="profile"]').click();
  await p.waitForSelector('.pfans-fold');
  await p.waitForTimeout(260);
  await p.locator('.pfans-fold > summary').click();
  await p.waitForSelector('.pfan');
  await p.locator('.pfan').first().click();
  await p.waitForSelector('.parc-id');
  await p.waitForTimeout(420);
  const s = await p.evaluate(() => {
    const scale = document.querySelector('.pscale');
    const k = Number(getComputedStyle(scale).getPropertyValue('--k'));
    const canvas = Math.round(document.querySelector('.pcontent').offsetHeight);
    const stageH = Math.round(document.getElementById('pstage').getBoundingClientRect().height);
    /* Smallest rendered type on the page, against the 13px floor the portrait layout
       is held to. */
    let min = Infinity;
    document.querySelectorAll('.ppanel.is-page *').forEach((el) => {
      if (!el.textContent.trim() || el.children.length) return;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size) min = Math.min(min, size * k);
    });
    /* Nothing may stick out past the panel's silhouette sides. */
    const panel = document.querySelector('.ppanel.is-page').getBoundingClientRect();
    let overflow = 0;
    document.querySelectorAll('.ppanel.is-page *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      overflow = Math.max(overflow, panel.left - r.left, r.right - panel.right);
    });
    /* A section heading is one line by construction: its three text parts are nowrap and
       the rule between them is the only part that gives.  A flex item can shrink below
       its content width, so before that was pinned "身体开发度" broke mid-word -- which
       is exactly the kind of thing that comes back silently, so it is measured. */
    let wrapped = [];
    document.querySelectorAll('.ppage-head').forEach((headEl) => {
      headEl.querySelectorAll('b, span, em').forEach((part) => {
        if (part.getClientRects().length > 1) wrapped.push(part.textContent.trim());
      });
    });
    return {
      k: Number(k.toFixed(3)),
      canvas,
      slack: Math.abs(stageH - Math.round(canvas * k)),
      minType: Number(min.toFixed(1)),
      overflow: Math.round(overflow),
      wrapped,
      pw: Math.round(parseFloat(getComputedStyle(scale).getPropertyValue('--pw'))),
    };
  });
  const ok = s.slack <= 2 && s.minType >= 13 && s.overflow <= 1 && !s.wrapped.length;
  console.log(`  ${String(w).padStart(4)}x${String(h).padEnd(5)} pw=${s.pw} k=${String(s.k).padEnd(6)} canvas=${String(s.canvas).padEnd(5)} slack=${s.slack} minType=${String(s.minType).padEnd(5)} overflow=${s.overflow} headings=${s.wrapped.length ? s.wrapped.join('/') : 'one line'}  ${ok ? 'ok' : 'FAIL'}`);
  if (s.slack > 2) problems.push(`${w}px: ${s.slack}px of slack`);
  if (s.minType < 13) problems.push(`${w}px: type at ${s.minType} real px, under the 13px floor`);
  if (s.overflow > 1) problems.push(`${w}px: content overflows the silhouette by ${s.overflow}px`);
  if (s.wrapped.length) problems.push(`${w}px: section heading wrapped -- ${s.wrapped.join(', ')}`);
  if (w === 390) await p.screenshot({ path: 'artifacts/portrait-archive-390.png', fullPage: true });
  await p.close();
}

await browser.close();
console.log('');
if (problems.length) {
  console.log('PROBLEMS:');
  problems.forEach((p) => console.log(' -', p));
  process.exitCode = 1;
} else {
  console.log('all portrait page checks passed');
}
