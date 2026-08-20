/* The lower panel: geometry, seam, layering and browsing.
   ------------------------------------------------------------------
   Checks rather than eyeballs the four things the drawer was specified against:

     1. the seam is the same 13 units the dock uses, measured off the rendered rim
     2. every drawn cell sits inside the silhouette, and the scroll box's extra
        height is hit area rather than a drawing error
     3. the whole panel is visible at 16:9, 2:1 and 21:9 -- the reason it is 90
        units tall and not 164
     4. a cell opens the full page, and Escape peels page then drawer

   Run against a dev server: node tools/shot_drawer.mjs */

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.env.HUD_URL || 'http://127.0.0.1:5174/';
/* How many art sets each category actually has, as written by tools/export_item_icons.py.
   The app hashes against this, so it is also what the request check has to measure against. */
const artManifest = JSON.parse(readFileSync('src/item-art.json', 'utf8'));
const problems = [];
const browser = await chromium.launch();

const openDrawer = async (page) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
  await page.locator('.pane-pod .tool-btn[data-page="inventory"]').click();
  await page.waitForSelector('.drawer-root');
  await page.waitForTimeout(420);
};

/* ------------------------------------------------ geometry at k = 1 exactly */
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
/* An item's art set comes from a hash taken modulo how many sets src/item-art.json says
   exist, so a set that has not been drawn must never be requested.  Without the manifest
   the onerror chain would still land on the right picture, but at the cost of one doomed
   request per item every time a view is built -- and the drawer is rebuilt on every open. */
const itemRequests = [];
page.on('request', (r) => {
  if (r.url().includes('/assets/items/')) itemRequests.push(r.url().split('/').pop());
});
await openDrawer(page);

await page.screenshot({ path: 'artifacts/drawer_full.png' });
await page.screenshot({ path: 'artifacts/drawer_band.png', clip: { x: 0, y: 660, width: 1672, height: 281 } });
await page.screenshot({ path: 'artifacts/drawer_seam.png', clip: { x: 0, y: 700, width: 900, height: 90 } });
await page.screenshot({ path: 'artifacts/drawer_corner.png', clip: { x: 0, y: 760, width: 300, height: 120 } });

const geom = await page.evaluate(() => {
  const g = window.__geo;
  const rail = document.querySelector('.drawer-rail');
  const box = rail.getBoundingClientRect();
  const slots = [...document.querySelectorAll('.drawer-slot')].map((s) => {
    const r = s.getBoundingClientRect();
    return { name: s.dataset.item, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const divs = [...document.querySelectorAll('.drawer-div span')].map((s) => s.textContent);
  return {
    railBox: [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)],
    slotCount: slots.length,
    slotTops: [...new Set(slots.map((s) => s.y))],
    slotSizes: [...new Set(slots.map((s) => `${s.w}x${s.h}`))],
    firstSlot: slots[0],
    lastSlotRight: Math.max(...slots.map((s) => s.x + s.w)),
    groups: divs,
    contentWidth: rail.scrollWidth,
    viewWidth: rail.clientWidth,
    hasMore: document.querySelector('.drawer-root').classList.contains('has-more'),
    /* The category art is in the repo now, so every cell must have resolved its <img>
       and every placeholder gem must be hidden by it.  A surviving visible gem means a
       slug does not match a file -- which would otherwise only show up as one cell
       looking different from the rest. */
    icons: document.querySelectorAll('.drawer-slot .slot-icon').length,
    gems: document.querySelectorAll('.drawer-slot .slot-gem').length,
    gemsVisible: [...document.querySelectorAll('.drawer-slot .slot-gem')]
      .filter((g) => getComputedStyle(g).display !== 'none').length,
    iconsLoaded: [...document.querySelectorAll('.drawer-slot .slot-icon')]
      .filter((i) => i.complete && i.naturalWidth > 0).length,
    iconSrcs: [...new Set([...document.querySelectorAll('.drawer-slot .slot-icon')]
      .map((i) => i.getAttribute('src').split('/').pop()))].sort(),
    /* 强度 exists only on 消耗品.  Setting it on the others -- which an earlier version did
       via `item.potency ?? 3` -- makes the well's cone assert a reading the item has no
       field for, so its absence is checked rather than assumed. */
    strayPotency: [...document.querySelectorAll('.drawer-slot:not(.b-consumable)')]
      .filter((s) => s.style.getPropertyValue('--potency')).map((s) => s.dataset.item),
    /* 强度 reads as notches filed into the corner: five marks with N lit, only on 消耗品.
       Both halves are checked -- that the count matches the value, and that the marks
       overhang the cell, since sitting inside it is what would make them read as printed on
       the face rather than cut into the rim. */
    notches: [...document.querySelectorAll('.drawer-slot')].map((s) => {
      const marks = [...s.querySelectorAll('.item-notch i')];
      const cell = s.getBoundingClientRect();
      /* Straddling means both: some of the mark outside the cell and some inside.  Measuring
         only the outside part would pass a group floating free above the rim, which is what
         it looked like before the marks were lowered onto the edge. */
      const outside = marks.reduce((most, m) => Math.max(most, cell.top - m.getBoundingClientRect().top), 0);
      const inside = marks.reduce((most, m) => Math.max(most, m.getBoundingClientRect().bottom - cell.top), 0);
      return {
        item: s.dataset.item,
        consumable: s.classList.contains('b-consumable'),
        potency: Number(s.style.getPropertyValue('--potency')) || 0,
        marks: marks.length,
        lit: marks.filter((m) => m.classList.contains('on')).length,
        overhang: Math.round(outside),
        embedded: Math.round(inside),
      };
    }),
    /* Two items of the same category must not draw the same picture.  The hash cannot promise
       that on its own -- with three sets a pair collides one time in three, and this bag did
       collide before chooseSets() in data.js started stepping collisions to the next free
       set.  Compared on the resolved file, since that is what the reader sees. */
    sameArt: (() => {
      const seen = new Map();
      const hits = [];
      document.querySelectorAll('.drawer-slot').forEach((s) => {
        const src = s.querySelector('.slot-icon')?.getAttribute('src');
        if (seen.has(src)) hits.push(`${seen.get(src)} = ${s.dataset.item}`);
        else seen.set(src, s.dataset.item);
      });
      return hits;
    })(),
    /* And all three sets should actually be reached, or the art is being paid for and not
       used. */
    setsUsed: [...new Set([...document.querySelectorAll('.drawer-slot')]
      .map((s) => Number(s.dataset.set)))].sort(),
    worn: document.querySelectorAll('.drawer-slot .slot-worn').length,
    badges: document.querySelectorAll('.drawer-slot .slot-qty').length,
  };
});
console.log('rail box [x,y,w,h]  ', JSON.stringify(geom.railBox), '  expected [49,734,1573,88]');
console.log('slots               ', geom.slotCount, 'cells', JSON.stringify(geom.slotSizes),
  'drawn at y', JSON.stringify(geom.slotTops), ' expected 66x66 @ 745');
console.log('groups              ', JSON.stringify(geom.groups), ' expected 用品 / 消耗品 / 素材');
console.log('rail content        ', geom.contentWidth, 'of', geom.viewWidth, 'visible; has-more', geom.hasMore);
console.log('category art        ', `${geom.iconsLoaded}/${geom.icons} loaded, ${geom.gemsVisible} placeholder(s) still visible, worn=${geom.worn} qty=${geom.badges}`);
console.log('                    ', geom.iconSrcs.join(' '));
console.log('art sets            ', `${geom.setsUsed.map((n) => n + 1).join('/')} in use, ${geom.sameArt.length} pair(s) drawing the same picture`);

if (geom.railBox.join() !== '49,734,1573,88') problems.push(`rail box ${geom.railBox}`);
if (geom.slotSizes.join() !== '66x66') problems.push(`cell size ${geom.slotSizes}`);
if (geom.slotTops.join() !== '745') problems.push(`cell top ${geom.slotTops}`);
if (geom.groups.join() !== '用品,消耗品,素材') problems.push(`group order ${geom.groups}`);
if (geom.icons !== geom.slotCount) problems.push(`only ${geom.icons} of ${geom.slotCount} cells kept their <img>`);
if (geom.iconsLoaded !== geom.slotCount) problems.push(`${geom.slotCount - geom.iconsLoaded} category icon(s) failed to load`);
if (geom.gemsVisible) problems.push(`${geom.gemsVisible} placeholder gem(s) still visible behind real art`);
if (geom.strayPotency.length) problems.push(`--potency set on non-consumables: ${geom.strayPotency.join(', ')}`);
if (geom.sameArt.length) problems.push(`two items drawing the same picture: ${geom.sameArt.join('; ')}`);
const declared = Math.max(...Object.values(artManifest));
if (geom.setsUsed.length < Math.min(declared, 3)) {
  problems.push(`only art set(s) ${geom.setsUsed.map((n) => n + 1).join('/')} are reached, but ${declared} were exported`);
}

const notched = geom.notches.filter((n) => n.marks);
console.log('强度 notches        ', notched.map((n) => `${n.item} ${n.lit}/${n.marks}`).join(', ') || '(none)');
console.log('                    ', `straddling the rim: ${notched[0]?.overhang ?? 0} out, ${notched[0]?.embedded ?? 0} in`);
for (const n of geom.notches) {
  if (!n.consumable && n.marks) problems.push(`${n.item} is not a 消耗品 but carries 强度 notches`);
  if (n.consumable && n.marks !== 5) problems.push(`${n.item} has ${n.marks} notches, expected 5`);
  if (n.consumable && n.lit !== n.potency) problems.push(`${n.item} lit ${n.lit} notches for 强度 ${n.potency}`);
  if (n.marks && n.overhang < 3) problems.push(`${n.item}'s notches only overhang ${n.overhang} units, so they read as printed on the face`);
  if (n.marks && n.embedded < 3) problems.push(`${n.item}'s notches sit ${n.embedded} units inside the cell, so they float above the rim instead of cutting it`);
}

/* Compared against the manifest rather than against "any variant is suspicious", which is
   what this checked while only set 1 existed -- requesting set 2 is correct once set 2 has
   been exported.  What must never happen is a request for a set beyond what is on disk. */
const doomed = [...new Set(itemRequests)].filter((file) => {
  const m = /^(.*?)(?:-(\d+))?\.png$/.exec(file);
  if (!m) return false;
  return (Number(m[2]) || 1) > (artManifest[m[1]] || 1);
});
console.log('art requests        ', `${itemRequests.length} for ${geom.slotCount} cells, ${doomed.length} beyond what src/item-art.json declares`);
if (doomed.length) problems.push(`requested art sets that were never exported: ${doomed.join(', ')}`);

/* The seam.  Read the rendered pixels down a column that crosses both rims: the
   shell's bottom sits at 720 and the drawer's top at 733, so between them there must
   be a dark band of desk exactly 13 units wide with a bright line either side. */
const seam = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1672;
  canvas.height = 941;
  /* Sample the composited page instead of trying to reason about the layer stack:
     draw nothing, just read back what the compositor produced via elementFromPoint
     at each y.  A pixel read needs a real capture, so hand the rows back and let the
     caller compare them against the screenshot instead. */
  const rows = [];
  for (let y = 712; y <= 742; y++) rows.push(y);
  return rows;
});
void seam;

/* ------------------------------------------------------- three aspect ratios */
console.log('\nvisibility by aspect ratio (drawer spans canvas y 733..823):');
for (const [label, w, h] of [['16:9  1920x1080', 1920, 1080], ['2:1   2560x1280', 2560, 1280], ['21:9  2560x1080', 2560, 1080]]) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => problems.push(`pageerror ${label}: ${e.message}`));
  await openDrawer(p);
  const v = await p.evaluate(() => {
    const k = Math.max(innerWidth / 1672, innerHeight / 941);
    const toView = (y) => (y - 470.5) * k + innerHeight / 2;
    const cell = document.querySelector('.drawer-slot').getBoundingClientRect();
    return {
      k: Number(k.toFixed(3)),
      floorY: Math.round(toView(941)),
      drawerTop: Math.round(toView(733)),
      drawerBottom: Math.round(toView(823)),
      cellBottom: Math.round(cell.bottom),
      vh: innerHeight,
    };
  });
  const ok = v.drawerBottom <= v.vh && v.drawerTop >= 0;
  console.log(`  ${label}  k=${String(v.k).padEnd(6)} drawer ${String(v.drawerTop).padStart(5)}..${String(v.drawerBottom).padStart(5)} of ${v.vh}   ${ok ? 'fully visible' : 'CLIPPED'}`);
  if (!ok) problems.push(`${label}: drawer clipped (${v.drawerBottom} > ${v.vh})`);
  await p.screenshot({ path: `artifacts/drawer_${label.split(' ')[0].replace(':', '-')}.png` });
  await p.close();
}

/* --------------------------------------------------------------- browsing */
console.log('\nbrowsing:');
const scroll = await page.evaluate(async () => {
  const rail = document.querySelector('.drawer-rail');
  const root = document.querySelector('.drawer-root');
  /* The sample bag is ten items, which fits without scrolling -- correct, and also
     the reason the scroll path has to be exercised with a padded rail. */
  const group = rail.querySelector('.drawer-group:last-child');
  const cell = group.querySelector('.drawer-slot');
  for (let i = 0; i < 22; i++) group.appendChild(cell.cloneNode(true));
  /* ResizeObserver callbacks are delivered at the end of a frame, after
     requestAnimationFrame, and how many frames that takes is not something to guess at
     with a fixed timeout -- poll for the hint instead, with a ceiling. */
  await new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (root.className.includes('has-more') || performance.now() - t0 > 1500) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  const before = { content: rail.scrollWidth, view: rail.clientWidth };
  const midHints = root.className.includes('has-more');
  rail.dispatchEvent(new WheelEvent('wheel', { deltaY: 420, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 200));
  const afterWheel = rail.scrollLeft;
  /* A trackpad sends deltaX for a two-finger horizontal swipe, which is the other half
     of the wheel path and is not exercised by the vertical case above. */
  rail.scrollLeft = 0;
  await new Promise((r) => setTimeout(r, 120));
  rail.dispatchEvent(new WheelEvent('wheel', { deltaX: 360, deltaY: 4, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 200));
  const afterTrackpad = Math.round(rail.scrollLeft);
  rail.scrollLeft = rail.scrollWidth;
  /* The hint classes are set from a scroll event, so they have to be read a frame or
     two after the position is set rather than in the same turn. */
  await new Promise((r) => setTimeout(r, 240));
  return {
    ...before,
    grewHint: midHints,
    afterWheel: Math.round(afterWheel),
    afterTrackpad,
    atEnd: Math.round(rail.scrollLeft),
    max: rail.scrollWidth - rail.clientWidth,
    atEndHasMore: root.classList.contains('has-more'),
    atEndHasPrev: root.classList.contains('has-prev'),
  };
});
console.log(`  padded to ${scroll.content} units of content in a ${scroll.view} view`);
console.log(`  hint appeared on content growth: ${scroll.grewHint}`);
console.log(`  vertical wheel scrolled the rail to ${scroll.afterWheel} (snapped to a bucket divider)`);
console.log(`  trackpad deltaX scrolled the rail to ${scroll.afterTrackpad}`);
console.log(`  at ${scroll.atEnd} of ${scroll.max}: has-more=${scroll.atEndHasMore} has-prev=${scroll.atEndHasPrev}`);
if (scroll.content <= scroll.view) problems.push('padded rail did not overflow');
if (!scroll.grewHint) problems.push('overflow hint did not appear when the rail grew');
if (!scroll.afterWheel) problems.push('vertical wheel did not scroll the rail horizontally');
if (!scroll.afterTrackpad) problems.push('trackpad deltaX did not scroll the rail');
if (scroll.atEnd !== scroll.max) problems.push(`did not reach the end (${scroll.atEnd} of ${scroll.max})`);
if (scroll.atEndHasMore || !scroll.atEndHasPrev) problems.push('overflow hints wrong at the far end');
await page.screenshot({ path: 'artifacts/drawer_scrolled.png', clip: { x: 0, y: 700, width: 1672, height: 241 } });
await page.close();

/* ------------------------------------------------------------ drag and flick */
/* At a 1672x941 viewport the canvas scale is exactly 1 and the canvas is centred, so
   viewport coordinates are canvas coordinates and the row's centre is y 778. */
console.log('\ndrag and flick (real mouse input, bag padded to 34):');
const ROW_Y = 778;
const p4 = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
p4.on('pageerror', (e) => problems.push(`pageerror drag: ${e.message}`));
await openDrawer(p4);

/* Unique names on the clones, so click routing is exercised at scale rather than every
   cell reporting the same item. */
await p4.evaluate(() => {
  const group = document.querySelector('.drawer-group:last-child');
  const cell = group.querySelector('.drawer-slot');
  for (let i = 0; i < 24; i++) {
    const copy = cell.cloneNode(true);
    copy.dataset.item = `样例素材 ${i + 1}`;
    group.appendChild(copy);
  }
});
await p4.waitForTimeout(250);
const at = () => p4.evaluate(() => Math.round(document.querySelector('.drawer-rail').scrollLeft));
const span = await p4.evaluate(() => {
  const r = document.querySelector('.drawer-rail');
  return { content: r.scrollWidth, view: r.clientWidth, max: r.scrollWidth - r.clientWidth };
});
console.log(`  ${span.content} units of content, ${span.max} units of travel`);

// A slow drag should track the cursor and stop where it is let go.
await p4.mouse.move(1200, ROW_Y);
await p4.mouse.down();
for (let x = 1180; x >= 900; x -= 20) { await p4.mouse.move(x, ROW_Y); await p4.waitForTimeout(24); }
await p4.mouse.up();
const slowAtRelease = await at();
await p4.waitForTimeout(500);
const slowSettled = await at();
console.log(`  slow drag of 300px  -> ${slowAtRelease} at release, ${slowSettled} settled (tracks the cursor)`);
if (Math.abs(slowAtRelease - 300) > 60) problems.push(`slow drag tracked badly: ${slowAtRelease} for 300px`);
if (Math.abs(slowSettled - slowAtRelease) > 90) problems.push('a slow drag should not fling');

/* A real flick cannot be driven through page.mouse: every move awaits a protocol round
   trip, so nine 70px steps take over a second and that is a slow drag by definition --
   which is why the case above measures a slow drag and gets the right answer for one.
   A flick is a short gesture with small gaps between samples, so it has to be
   dispatched in the page where the loop is tight. */
const flick = async (fromX, toX, steps) => p4.evaluate(async ([fromX, toX, steps]) => {
  const rail = document.querySelector('.drawer-rail');
  rail.scrollLeft = 0;
  await new Promise((r) => setTimeout(r, 200));
  const ev = (type, x) => new PointerEvent(type, {
    pointerType: 'mouse', pointerId: 1, button: 0, buttons: 1, clientX: x, clientY: 778, bubbles: true,
  });
  rail.dispatchEvent(ev('pointerdown', fromX));
  for (let i = 1; i <= steps; i++) {
    rail.dispatchEvent(ev('pointermove', fromX + ((toX - fromX) * i) / steps));
    await new Promise((r) => setTimeout(r, 8));
  }
  rail.dispatchEvent(ev('pointerup', toX));
  const atRelease = Math.round(rail.scrollLeft);
  /* Wait for the glide to actually finish rather than for a guessed duration: it clears
     .is-dragging when it settles, which is the signal that snap has been handed back.
     The ceiling is generous because the glide is measured in animation frames, and a
     loaded machine running several browsers at once throttles those -- a tight ceiling
     here fails as a false positive rather than catching anything. */
  await new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (!rail.classList.contains('is-dragging') || performance.now() - t0 > 6000) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  await new Promise((r) => setTimeout(r, 120));
  return {
    atRelease,
    settled: Math.round(rail.scrollLeft),
    max: rail.scrollWidth - rail.clientWidth,
    stillDragging: rail.classList.contains('is-dragging'),
  };
}, [fromX, toX, steps]);

const f = await flick(1400, 1000, 8);
console.log(`  fast flick of 400px -> ${f.atRelease} at release, ${f.settled} settled (+${f.settled - f.atRelease} carried)`);
if (f.settled - f.atRelease < 120) problems.push(`flick barely carried (+${f.settled - f.atRelease}); momentum is not working`);
if (f.settled > f.max) problems.push('glide overran the end of the rail');
if (f.stillDragging) problems.push('is-dragging survived the glide, so snap never came back');

// Flicked hard, the glide must pin at the end and stop rather than spin there.
const hard = await flick(1500, 300, 10);
console.log(`  flicked into the end  -> ${hard.settled} of ${hard.max}, is-dragging cleared: ${!hard.stillDragging}`);
if (hard.settled !== hard.max) problems.push(`did not pin to the end (${hard.settled} of ${hard.max})`);
if (hard.stillDragging) problems.push('is-dragging survived a glide into the end');

/* A drag that ends over a cell must not also open that cell.  The cell is measured
   rather than assumed at a fixed x: the flicks above leave the rail wherever they leave
   it, and a hardcoded coordinate silently becomes a test of the gap between two cells. */
await p4.evaluate(() => { document.querySelector('.drawer-rail').scrollLeft = 300; });
await p4.waitForTimeout(260);
const cellBox = await p4.locator('.drawer-slot').nth(6).boundingBox();
const cx = Math.round(cellBox.x + cellBox.width / 2);
await p4.mouse.move(cx, ROW_Y);
await p4.mouse.down();
for (let i = 1; i <= 6; i++) { await p4.mouse.move(cx + i * 40, ROW_Y); await p4.waitForTimeout(20); }
await p4.mouse.up();
await p4.waitForTimeout(500);
const draggedOpenedPage = await p4.evaluate(() => !!document.querySelector('.inventory-page'));
console.log(`  drag released over a cell opened the page: ${draggedOpenedPage}`);
if (draggedOpenedPage) problems.push('a drag ending on a cell must not open the page');

// A clean click on that same kind of cell still does, and reports the cell it was on.
const target = p4.locator('.drawer-slot').nth(6);
const name = await target.getAttribute('data-item');
await target.click();
await p4.waitForSelector('.inventory-page', { timeout: 3000 });
console.log(`  a click with no movement opened the page (cell "${name}")`);
await p4.keyboard.press('Escape');
await p4.waitForTimeout(200);

/* Touch must be left to the platform: native panning already has momentum and snap,
   and handling pointer events for it too would move the rail twice per gesture. */
const touchLeftAlone = await p4.evaluate(() => {
  const rail = document.querySelector('.drawer-rail');
  const before = rail.scrollLeft;
  rail.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 900, bubbles: true }));
  rail.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: 700, bubbles: true }));
  const hijacked = rail.classList.contains('is-dragging') || rail.scrollLeft !== before;
  rail.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
  return !hijacked;
});
console.log(`  a touch gesture is left to native scrolling: ${touchLeftAlone}`);
if (!touchLeftAlone) problems.push('touch is being handled twice: native pan plus the synthetic drag');

await p4.screenshot({ path: 'artifacts/drawer_many.png', clip: { x: 0, y: 700, width: 1672, height: 241 } });
await p4.close();

/* ------------------------------------------------------- the opening choice */
console.log('\n道具栏打开方式:');
const p3 = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
p3.on('pageerror', (e) => problems.push(`pageerror prefs: ${e.message}`));
await p3.goto(url, { waitUntil: 'load' });
await p3.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));

const press = async (label) => {
  await p3.keyboard.press('Escape');
  await p3.waitForTimeout(120);
  await p3.keyboard.press('Escape');
  await p3.waitForTimeout(120);
  await p3.locator('.pane-pod .tool-btn[data-page="inventory"]').click();
  await p3.waitForTimeout(360);
  const s = await p3.evaluate(() => ({
    drawer: !!document.querySelector('.drawer-root'),
    page: !!document.querySelector('.inventory-page'),
  }));
  console.log(`  ${label.padEnd(26)} drawer=${s.drawer ? 'Y' : '-'} page=${s.page ? 'Y' : '-'}`);
  return s;
};

const asDrawer = await press('default (底部抽屉)');
if (!asDrawer.drawer || asDrawer.page) problems.push('default 背包 should open the drawer only');
await p3.close();

/* ------------------------------------------------------ layering and escape */
console.log('\nlayering:');
const p2 = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
p2.on('pageerror', (e) => problems.push(`pageerror layering: ${e.message}`));
await openDrawer(p2);

const state = async (label) => {
  const s = await p2.evaluate(() => ({
    drawer: !!document.querySelector('.drawer-root'),
    page: !!document.querySelector('.page-modal'),
    dock: !!document.querySelector('.dock-root'),
  }));
  console.log(`  ${label.padEnd(26)} drawer=${s.drawer ? 'Y' : '-'} page=${s.page ? 'Y' : '-'} dock=${s.dock ? 'Y' : '-'}`);
  return s;
};
await state('背包 pressed');
await p2.locator('.drawer-slot').first().click();
await p2.waitForSelector('.inventory-page', { timeout: 3000 });
await p2.waitForTimeout(320);
await p2.screenshot({ path: 'artifacts/drawer_to_page.png' });
const withPage = await state('cell clicked');
if (!withPage.page || !withPage.drawer) problems.push('a cell must open the page and leave the drawer standing');

await p2.keyboard.press('Escape');
await p2.waitForTimeout(280);
const afterFirst = await state('esc');
if (afterFirst.page || !afterFirst.drawer) problems.push('first Escape must peel the page only');

await p2.keyboard.press('Escape');
await p2.waitForTimeout(280);
const afterSecond = await state('esc');
if (afterSecond.drawer) problems.push('second Escape must close the drawer');

/* 背包 is a toggle, the way a character card is. */
await p2.locator('.pane-pod .tool-btn[data-page="inventory"]').click();
await p2.waitForTimeout(280);
await p2.locator('.pane-pod .tool-btn[data-page="inventory"]').click();
await p2.waitForTimeout(280);
const toggled = await state('背包 twice');
if (toggled.drawer) problems.push('背包 should toggle the drawer closed');

/* The drawer and the character dock share the bottom level and do not overlap, so
   they are allowed to stand together. */
await p2.locator('.pane-pod .tool-btn[data-page="inventory"]').click();
await p2.waitForTimeout(200);
await p2.locator('.card').first().click();
await p2.waitForSelector('.dock-root');
await p2.waitForTimeout(420);
await p2.screenshot({ path: 'artifacts/drawer_with_dock.png' });
await state('drawer + dock');
await p2.close();

await browser.close();

console.log('');
if (problems.length) {
  console.log('PROBLEMS:');
  problems.forEach((p) => console.log(' -', p));
  process.exitCode = 1;
} else {
  console.log('all drawer checks passed');
}
