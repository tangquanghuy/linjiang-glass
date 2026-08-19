import { chromium } from 'playwright';

const url = process.env.HUD_URL || 'http://127.0.0.1:5174/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.removeItem('glass-hud-pinned'));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
await page.waitForTimeout(250);

await page.locator('.card').first().click();
await page.waitForSelector('.dock-root');
await page.waitForTimeout(700);

await page.screenshot({ path: 'artifacts/dock_full.png' });
// The seam: the dock's underside and the shell's top edge, 13px apart.
await page.screenshot({ path: 'artifacts/dock_seam.png', clip: { x: 0, y: 300, width: 1672, height: 180 } });
// The two joints, zoomed.
await page.screenshot({ path: 'artifacts/dock_joint_ear.png', clip: { x: 0, y: 340, width: 470, height: 120 } });
await page.screenshot({ path: 'artifacts/dock_joint_pod.png', clip: { x: 1290, y: 310, width: 382, height: 140 } });
await page.screenshot({ path: 'artifacts/dock_panel.png', clip: { x: 0, y: 30, width: 1672, height: 390 } });

const overflow = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.dock-bay').forEach((bay) => {
    const b = bay.getBoundingClientRect();
    let deepest = 0;
    bay.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height && r.bottom > deepest) deepest = r.bottom;
    });
    out.push({
      bay: bay.className.replace('dock-bay ', ''),
      box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
      contentBottom: Math.round(deepest),
      bayBottom: Math.round(b.bottom),
      overflow: Math.round(deepest - b.bottom),
    });
  });
  return out;
});
console.log(JSON.stringify(overflow, null, 2));

await browser.close();
console.log('ok');

// --- second pass: a character with statuses and non-zero counters, then the archive
const page2 = await (await chromium.launch()).newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page2.on('pageerror', (e) => console.log('PAGEERROR2', e.message));
await page2.goto(url, { waitUntil: 'load' });
await page2.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
await page2.locator('.rail-next').click();
await page2.waitForTimeout(400);
await page2.locator('.card[data-name="璃亚梦"]').click();
await page2.waitForSelector('.dock-root');
await page2.waitForTimeout(700);
await page2.screenshot({ path: 'artifacts/dock_panel2.png', clip: { x: 0, y: 30, width: 1672, height: 390 } });
const who = await page2.locator('.dock-id h2').innerText();
console.log('second dock:', who.replace(/\s+/g, ' '));
await page2.locator('[data-character-full]').click();
await page2.waitForSelector('.character-archive');
await page2.waitForTimeout(600);
await page2.screenshot({ path: 'artifacts/dock_archive.png' });
/* The archive must fit without scrolling, and 开发度 must be the largest block on
   the page -- both were explicit asks, so both are measured rather than eyeballed. */
const fit = await page2.evaluate(() => {
  const body = document.querySelector('.page-modal-body');
  const dev = document.querySelector('.archive-sec-dev').getBoundingClientRect();
  const crop = document.querySelector('.dev-crop').getBoundingClientRect();
  const art = document.querySelector('.archive-art').getBoundingClientRect();
  return {
    scrollOverflow: Math.round(body.scrollHeight - body.clientHeight),
    devH: Math.round(dev.height),
    cropBox: [Math.round(crop.width), Math.round(crop.height)],
    artBox: [Math.round(art.width), Math.round(art.height)],
    modalH: Math.round(document.querySelector('.page-modal').getBoundingClientRect().height),
  };
});
console.log('archive fit:', JSON.stringify(fit));

// The 评语 sheet: authored prose, opened from a part tile.
await page2.locator('.dev-tile').nth(2).click();
await page2.waitForSelector('.dev-sheet');
await page2.waitForTimeout(400);
await page2.screenshot({ path: 'artifacts/dock_dev_sheet.png' });
const sheet = await page2.evaluate(() => {
  const p = document.querySelector('.dev-sheet-body p');
  return { muted: p.classList.contains('is-muted'), chars: p.textContent.trim().length };
});
console.log('dev sheet:', JSON.stringify(sheet));
await page2.context().browser().close();

// --- third pass: a character that HAS an authored matrix, and the header crop
const page3 = await (await chromium.launch()).newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page3.on('pageerror', (e) => console.log('PAGEERROR3', e.message));
await page3.goto(url, { waitUntil: 'load' });
await page3.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));
await page3.locator('.card[data-name="塔菲"]').click();
await page3.waitForSelector('.dock-root');
await page3.waitForTimeout(700);
await page3.screenshot({ path: 'artifacts/dock_header.png', clip: { x: 0, y: 30, width: 700, height: 90 } });

// Caption must finish before the ear steps down at x=340.  Measured while the dock
// is still mounted -- opening the archive replaces the layer.
const head = await page3.evaluate(() => {
  const g = (s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
  };
  return { blossom: g('.dock-blossom-art'), title: g('.dock-title-art'), caption: g('.dock-art .head-caption') };
});
console.log('header boxes:', JSON.stringify(head), '| ear steps down at x=340');

await page3.locator('[data-character-full]').click();
await page3.waitForSelector('.character-archive');
await page3.waitForTimeout(500);
await page3.screenshot({ path: 'artifacts/dock_archive_taffy.png' });
await page3.locator('.dev-tile').first().click();
await page3.waitForSelector('.dev-sheet');
await page3.waitForTimeout(400);
await page3.screenshot({ path: 'artifacts/dock_dev_sheet_taffy.png' });
const sheet3 = await page3.evaluate(() => {
  const p = document.querySelector('.dev-sheet-body p');
  const s = document.querySelector('.dev-sheet').getBoundingClientRect();
  const m = document.querySelector('.page-modal').getBoundingClientRect();
  return {
    muted: p.classList.contains('is-muted'),
    chars: p.textContent.trim().length,
    // Centred on the page, give or take the archive's slight vertical offset.
    dx: Math.round((s.left + s.right) / 2 - (m.left + m.right) / 2),
    dy: Math.round((s.top + s.bottom) / 2 - (m.top + m.bottom) / 2),
    // Real refraction, not an opaque fill imitating it.
    blur: getComputedStyle(document.querySelector('.dev-sheet')).backdropFilter,
  };
});
console.log('dev sheet (authored):', JSON.stringify(sheet3));

/* Layering: the dock must survive underneath an open page, so closing the page
   lands back on the quick view.  And a second click on the same card collapses. */
const esc = async () => { await page3.keyboard.press('Escape'); await page3.waitForTimeout(260); };
const state = async (label) => {
  const s = await page3.evaluate(() => ({
    sheet: !!document.querySelector('.dev-sheet'),
    page: !!document.querySelector('.page-modal'),
    dock: !!document.querySelector('.dock-root'),
  }));
  console.log(`  ${label.padEnd(22)} sheet=${s.sheet ? 'Y' : '-'} page=${s.page ? 'Y' : '-'} dock=${s.dock ? 'Y' : '-'}`);
  return s;
};
console.log('escape peels one layer at a time:');
await state('sheet + page + dock');
await esc(); await state('after esc');
await esc(); await state('after esc');
await esc(); await state('after esc');

console.log('card is a toggle:');
await page3.locator('.card[data-name="塔菲"]').click();
await page3.waitForTimeout(260); await state('click 塔菲');
await page3.locator('.card[data-name="东雪莲"]').click();
await page3.waitForTimeout(260);
console.log('  switched to:', await page3.locator('.dock-id h2 b, .dock-id h2').first().innerText().catch(() => '?'));
await page3.locator('.card[data-name="东雪莲"]').click();
await page3.waitForTimeout(260); await state('click 东雪莲 again');
await page3.context().browser().close();
