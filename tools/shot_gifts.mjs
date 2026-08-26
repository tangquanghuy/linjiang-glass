/* 送礼 acceptance.  Landscape tray + confirm card, portrait page, and the Escape
   ladder -- the last one because 确认卡 -> 托盘 -> 速览 is three handlers on the same
   key across two modules, which is exactly the kind of thing that works until it
   silently peels two levels at once. */
import { chromium } from 'playwright';

const url = process.env.HUD_URL || 'http://127.0.0.1:5174/';
const errors = [];
const fails = [];
const ok = (name) => console.log(`  ok   ${name}`);
const check = (cond, name) => (cond ? ok(name) : (fails.push(name), console.log(`  FAIL ${name}`)));

const browser = await chromium.launch();
/* One context so the spy below is installed once for both the landscape page and the
   phone page -- newPage() would give each its own context and its own hooks. */
const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

/* The app hands its result to console.info, and the payload is an object -- which
   arrives here as a handle, not as text.  So the spy is installed in the page and
   serialises on that side; reading m.args() would work too but turns every console
   line into an await. */
const sent = [];
await context.exposeFunction('__giftSpy', (line) => { sent.push(line); });
await context.addInitScript(() => {
  const real = console.info.bind(console);
  console.info = (...args) => {
    if (String(args[0]).startsWith('[gift]')) {
      try { window.__giftSpy?.(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')); } catch { /* pre-expose */ }
    }
    real(...args);
  };
});

const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => [...document.querySelectorAll('.card-art')].every((i) => i.dataset.laid === '1'));

const card = (name) => page.locator(`.card[data-name="${name}"]`);
const openDock = async (name) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await card(name).click();
  await page.waitForSelector('.dock-root', { timeout: 3000 });
  await page.waitForTimeout(180);
};

/* --------------------------------------------------- 1. the LIVE badge */
console.log('roster badges');
/* 塔菲 and 璃亚梦 are the two live records in the sample roster, and the badge is the
   only way to know that without opening seven 速览. */
const live = await page.locator('.card-live').count();
check(live > 0, `at least one 直播中 badge on the rail (${live})`);

/* --------------------------------------------------- 2. 打赏 (live) */
console.log('\n打赏 — 塔菲 (直播中)');
await openDock('塔菲');
check(await page.locator('.dock-chip.is-live').count() === 1, 'dock shows 直播中 chip');
const tipLabel = await page.locator('.dock-gift').first().innerText();
check(tipLabel.includes('打赏'), `entry reads 打赏 (got "${tipLabel.trim()}")`);

await page.locator('.dock-gift[data-gift-open]').click();
await page.waitForSelector('.drawer-root.gift-tray', { timeout: 3000 });
await page.waitForTimeout(320);
const tipCells = await page.locator('.gift-tray .gift-slot').count();
check(tipCells === 11, `tray shows the 11 platform entries (${tipCells})`);
check(await page.locator('.gift-tray .gift-bag-slot').count() === 0,
  'no bag cells: 塔菲 is not 同行');
await page.screenshot({ path: 'artifacts/gift_tray_stream.png' });

/* The confirm card, its quantity stepper, and the line it will hand over. */
await page.locator('.gift-slot[data-gift="gift-rocket"]').click();
await page.waitForSelector('.gift-confirm', { timeout: 3000 });
await page.waitForTimeout(260);
check(await page.locator('.gift-qty').count() === 1, '打赏 card carries the qty stepper');
check(await page.locator('.gift-remark').count() === 0, '打赏 card has no 附言 field');
let preview = await page.locator('.gift-preview code').innerText();
check(preview.includes('消费1288') && preview.includes('送出1个火箭'),
  `preview line is right (${preview})`);
await page.screenshot({ path: 'artifacts/gift_card_stream.png' });

await page.locator('[data-gift-qty="10"]').click();
await page.waitForTimeout(200);
preview = await page.locator('.gift-preview code').innerText();
check(preview.includes('消费12880') && preview.includes('送出10个火箭'),
  `stepper recomputes the total (${preview})`);

await page.locator('[data-gift-send]').click();
await page.waitForSelector('.gift-toast', { timeout: 3000 });
check(await page.locator('.gift-confirm').count() === 0, 'send closes the card');
const streamSent = await page.locator('.gift-toast code').innerText();
check(streamSent.includes('消费12880') && streamSent.includes('送出10个火箭'),
  `the stream line was sent (${streamSent})`);
await page.waitForTimeout(240);
await page.screenshot({ path: 'artifacts/gift_toast.png' });

/* 办卡 loses the stepper: a subscription cannot be stacked. */
await page.locator('.gift-slot[data-gift="gift-guard-2"]').click();
await page.waitForSelector('.gift-confirm', { timeout: 3000 });
await page.waitForTimeout(200);
check(await page.locator('.gift-qty').count() === 0, '办卡 card drops the qty stepper');
const guardLine = await page.locator('.gift-preview code').innerText();
check(guardLine.includes('[上舰]') && guardLine.includes('提督'),
  `办卡 line is its own shape (${guardLine})`);
await page.screenshot({ path: 'artifacts/gift_card_guard.png' });

/* ------------------------------------------- 3. the Escape ladder */
console.log('\nEscape ladder — 确认卡 -> 托盘 -> 速览');
await page.keyboard.press('Escape');
await page.waitForTimeout(180);
check(await page.locator('.gift-confirm').count() === 0, 'first press peels the card');
check(await page.locator('.drawer-root.gift-tray').count() === 1, '...and leaves the tray');
await page.keyboard.press('Escape');
await page.waitForTimeout(180);
check(await page.locator('.drawer-root.gift-tray').count() === 0, 'second press peels the tray');
check(await page.locator('.dock-root').count() === 1, '...and leaves the 速览 standing');
await page.keyboard.press('Escape');
await page.waitForTimeout(180);
check(await page.locator('.dock-root').count() === 0, 'third press peels the 速览');

/* ------------------------------------------- 4. 私下送礼 (同行) */
console.log('\n私下送礼 — 东雪莲 (同行)');
await openDock('东雪莲');
const giveLabel = await page.locator('.dock-gift').first().innerText();
check(giveLabel.includes('送礼') && !giveLabel.includes('打赏'),
  `entry reads 送礼 (got "${giveLabel.trim()}")`);
await page.locator('.dock-gift[data-gift-open]').click();
await page.waitForSelector('.drawer-root.gift-tray', { timeout: 3000 });
await page.waitForTimeout(320);
const bagCells = await page.locator('.gift-tray .gift-bag-slot').count();
check(bagCells === 10, `tray shows the whole bag (${bagCells})`);
check(await page.locator('.gift-tray .gift-slot').count() === 0,
  'no platform cells: 东雪莲 is not live');
/* The bag cell is the item drawer's cell and nothing more: the HUD does not judge the
   gift, so there is no verdict mark to draw.  Asserted rather than assumed, because a
   stray badge here is exactly the thing that would leak an answer to the player. */
check(await page.locator('.gift-tray [class*="gift-hearts"]').count() === 0,
  'bag cells carry no 契合度 verdict');
/* Same grouping and order as the item drawer -- 用品 first, 素材 last. */
const groups = await page.locator('.gift-tray .drawer-div span').allInnerTexts();
check(groups.join('/') === '用品/消耗品/素材',
  `bag is grouped like the drawer (${groups.join('/')})`);
await page.screenshot({ path: 'artifacts/gift_tray_private.png' });

await page.locator('.gift-tray .gift-bag-slot').first().click();
await page.waitForSelector('.gift-confirm', { timeout: 3000 });
await page.waitForTimeout(260);
check(await page.locator('.gift-remark').count() === 1, '私下 card carries the 附言 field');
check(await page.locator('.gift-qty').count() === 0, '私下 card has no qty stepper');
const facts = await page.locator('.gift-facts em').allInnerTexts();
check(facts.length > 0 && facts.every((f) => !/最爱|喜欢|不合/.test(f)),
  `card states facts, not a verdict (${facts.join(' ')})`);
await page.screenshot({ path: 'artifacts/gift_card_private.png' });

/* The 附言 has to reach the line the player hands over -- that is the whole reason
   the field exists. */
await page.locator('[data-gift-remark]').fill('今晚别熬太晚');
await page.waitForTimeout(200);
const withRemark = await page.locator('.gift-preview code').innerText();
check(withRemark.includes('今晚别熬太晚') && withRemark.includes('递给了东雪莲'),
  `附言 lands in the outgoing line (${withRemark})`);
check(withRemark.includes('数量-1'),
  `private send includes the inventory decrement (${withRemark})`);
await page.screenshot({ path: 'artifacts/gift_card_remark.png' });

await page.locator('[data-gift-send]').click();
await page.waitForSelector('.gift-toast', { timeout: 3000 });
check(sent.some((l) => l.includes('今晚别熬太晚')), '附言 reached the send callback');
/* The payload states what the thing is and stops.  No 契合度, no expected 好感度 --
   the model judges the gift against the world book's 喜好 table, and a verdict from
   here would regularly contradict what it then narrates. */
const priv = sent.find((l) => l.includes('payload') && l.includes('private'));
check(!!priv && !/affinity|expect/.test(priv), `payload carries no verdict (${priv})`);
check(!!priv && /"category"/.test(priv) && /"description"/.test(priv),
  'payload carries 类别 and 描述 instead');
await page.screenshot({ path: 'artifacts/gift_card_miss.png' });

/* The rail has to stay live under the card: the shade covering it would mean a press
   on another gift dismissed the card rather than switching to that gift. */
await page.locator('.gift-tray .gift-bag-slot').nth(1).click({ timeout: 4000 });
await page.waitForTimeout(260);
check(await page.locator('.gift-confirm').count() === 1,
  'picking another cell swaps the card rather than dismissing it');
const swapped = await page.locator('.gift-head h3').innerText();
check(!swapped.includes('护士服'), `...and it is the new gift (${swapped.trim()})`);

/* ------------------------------------- 5. neither scene open */
console.log('\n不在场且未开播 — 沙花叉');
await openDock('沙花叉');
check(await page.locator('.dock-gift.is-off').count() === 1,
  'entry is disabled rather than absent');
const offText = await page.locator('.dock-gift.is-off').innerText();
check(offText.includes('未开播') && offText.includes('不在身边'),
  `...and states the reason (${offText.trim()})`);
await page.screenshot({ path: 'artifacts/gift_entry_off.png' });

/* --------------------------------- 6. the tray and the drawer are exclusive */
console.log('\n托盘与道具抽屉互斥');
await openDock('东雪莲');
await page.locator('.dock-gift[data-gift-open]').click();
await page.waitForSelector('.drawer-root.gift-tray', { timeout: 3000 });
await page.locator('.pane-pod .tool-btn[data-page="inventory"]').click();
await page.waitForTimeout(320);
check(await page.locator('.drawer-root.gift-tray').count() === 0,
  '背包 evicts the gift tray');
check(await page.locator('.drawer-root').count() === 1, '...leaving one bottom panel');

/* Switching character must take the tray with it, or the rail would be offering one
   girl's menu under another's 速览. */
await page.keyboard.press('Escape');
await page.waitForTimeout(160);
await openDock('塔菲');
await page.locator('.dock-gift[data-gift-open]').click();
await page.waitForSelector('.gift-tray .gift-slot', { timeout: 3000 });
await card('东雪莲').click();
await page.waitForTimeout(320);
check(await page.locator('.drawer-root.gift-tray').count() === 0,
  'switching character closes the tray');

/* ------------------------------------------------ 7. portrait page */
console.log('\n竖屏礼物页');
const phone = await context.newPage();
await phone.setViewportSize({ width: 412, height: 900 });
phone.on('pageerror', (e) => errors.push(`portrait pageerror: ${e.message}`));
phone.on('console', (m) => { if (m.type() === 'error') errors.push(`portrait console: ${m.text()}`); });
await phone.goto(`${url}?mode=portrait`, { waitUntil: 'load' });
await phone.waitForSelector('.pcard', { timeout: 5000 });
await phone.waitForTimeout(500);
check(await phone.locator('.pcard-live').count() > 0, 'portrait cards carry the 直播中 badge');

/* 东雪莲 is 同行, so her preview offers 送礼. */
await phone.locator('.pcard[data-name="东雪莲"]').click();
await phone.waitForSelector('.ppanel.is-preview', { timeout: 3000 });
await phone.waitForTimeout(320);
check(await phone.locator('[data-gift-page]').count() === 1, 'preview offers the 送礼 entry');
await phone.locator('[data-gift-page]').click();
await phone.waitForSelector('.pgift-row', { timeout: 3000 });
await phone.waitForTimeout(420);
const rows = await phone.locator('.pgift-row').count();
check(rows === 10, `portrait page lists the bag (${rows})`);
check(await phone.locator('.pgift-who').count() === 1, '...under a recipient header');
/* No 喜好 sheet on the page: the preferences live in the world book, where the model
   reads them, and printing them here would both duplicate them and hand the player an
   answer meant to be discovered. */
check(await phone.locator('.pgift-note').count() === 0, '...and no 喜好 crib sheet');
await phone.screenshot({ path: 'artifacts/gift_portrait_private.png', fullPage: true });

/* Two presses: the row expands into its own confirmation, then sends.  No overlay --
   the 开发度 评语 tiles use the same pattern for the same reason. */
await phone.locator('.pgift-row').first().click();
await phone.waitForSelector('.pgift-row.is-confirming', { timeout: 3000 });
await phone.waitForTimeout(300);
check(await phone.locator('.pgift-confirm .pgift-line code').count() === 1,
  'row expands and previews the outgoing line');
check(await phone.locator('.pgift-confirm [data-gift-confirm-send]').count() === 1,
  'portrait confirmation exposes a visible confirm-send button');
await phone.locator('.pgift-confirm input').fill('路上小心');
await phone.locator('.pgift-confirm [data-gift-confirm-send]').click();
await phone.waitForSelector('.pgift-done', { timeout: 3000 });
await phone.waitForTimeout(280);
/* The spy is installed on the context, so both pages report through it -- the remark
   text is what tells the two sends apart. */
check(sent.some((l) => l.includes('路上小心')), 'second press sends, 附言 included');
await phone.screenshot({ path: 'artifacts/gift_portrait_sent.png', fullPage: true });

/* 塔菲 is live but not 同行, so her page is the tip ladder instead. */
await phone.keyboard.press('Escape');
await phone.waitForTimeout(240);
await phone.keyboard.press('Escape');
await phone.waitForTimeout(320);
await phone.locator('.pcard[data-name="塔菲"]').click();
await phone.waitForSelector('.ppanel.is-preview', { timeout: 3000 });
await phone.waitForTimeout(300);
await phone.locator('[data-gift-page]').click();
await phone.waitForSelector('.pgift-row.is-tip', { timeout: 3000 });
await phone.waitForTimeout(420);
const tips = await phone.locator('.pgift-row.is-tip').count();
check(tips === 11, `portrait tip ladder lists the 11 entries (${tips})`);
check(await phone.locator('.pgift-row:not(.is-tip)').count() === 0,
  '...and no bag rows: she is not 同行');
await phone.screenshot({ path: 'artifacts/gift_portrait_stream.png', fullPage: true });

/* Width sweep, the same one shot_portrait_pages.mjs runs on the other pages: the gift
   row is a three-column grid, which is the shape most able to push a page wider than
   its panel at the narrow end of the range. */
console.log('\n竖屏宽度扫描');
for (const [w, h] of [[320, 700], [360, 780], [390, 844], [430, 932], [768, 1024]]) {
  await phone.setViewportSize({ width: w, height: h });
  await phone.waitForTimeout(320);
  const over = await phone.evaluate(() => {
    const panel = document.querySelector('.ppanel.is-page');
    if (!panel) return -1;
    const box = panel.getBoundingClientRect();
    let worst = 0;
    for (const el of panel.querySelectorAll('.pgift-row, .pgift-who, .pgift-note, .pgift-stub')) {
      const r = el.getBoundingClientRect();
      worst = Math.max(worst, Math.round(r.right - box.right), Math.round(box.left - r.left));
    }
    return worst;
  });
  check(over <= 1, `${w}x${h}: no horizontal overflow (worst ${over})`);
}

/* Exact tablet regression: selecting a gift must expose a real confirm action, not
   only rely on pressing the whole row a second time. */
await phone.setViewportSize({ width: 768, height: 1024 });
await phone.locator('.pgift-row.is-tip').first().click();
await phone.waitForSelector('.pgift-row.is-confirming [data-gift-confirm-send]', { timeout: 3000 });
const tabletConfirm = phone.locator('.pgift-row.is-confirming [data-gift-confirm-send]');
check(await tabletConfirm.isVisible(), '768x1024: confirm-send button is visible');
await tabletConfirm.scrollIntoViewIfNeeded();
await phone.screenshot({ path: 'artifacts/gift_tablet_confirm.png', fullPage: true });
await phone.setViewportSize({ width: 412, height: 900 });

await browser.close();

console.log('');
if (errors.length) {
  console.log('ERRORS:');
  errors.forEach((e) => console.log(' -', e));
}
if (fails.length) console.log(`FAILED: ${fails.length}\n${fails.map((f) => ` - ${f}`).join('\n')}`);
if (errors.length || fails.length) process.exitCode = 1;
else console.log('all gift checks passed, no console/page errors');
