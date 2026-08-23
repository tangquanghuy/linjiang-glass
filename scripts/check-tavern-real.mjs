/* High-fidelity integration sweep for:
   SillyTavern 1.18.0 -> #chat -> real message DOM -> JS-Slash-Runner 4.9.3
   srcdoc iframe -> actual 变量相关/状态栏.html -> local HUD.

   Usage: node scripts/check-tavern-real.mjs */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  REAL_PRESETS,
  expectedHudMode,
  expectedReadingWidth,
} from '../tools/tavern-real-contract.js';

const server = await createServer({ server: { port: 5201 }, logLevel: 'warn' });
await server.listen();
const origin = 'http://127.0.0.1:5201';
const browser = await chromium.launch({ headless: true });
mkdirSync('artifacts', { recursive: true });

const fails = [];
const problems = [];
const check = (id, condition, detail) => {
  if (!condition) fails.push(`${id}: ${detail}`);
  return condition;
};

function fixtureUrl(preset, extra = {}) {
  const url = new URL('/tools/tavern-real-fixture.html', origin);
  url.searchParams.set('chrome', '0');
  url.searchParams.set('preset', preset.id);
  url.searchParams.set('sheld', String(extra.sheldVw ?? preset.sheldVw ?? 50));
  if (extra.wrapPx) url.searchParams.set('wrap', String(extra.wrapPx));
  return url.toString();
}

async function openPreset(preset, extra = {}) {
  const page = await browser.newPage({
    viewport: { width: preset.vw, height: preset.vh },
    deviceScaleFactor: preset.mobile ? 2 : 1,
    hasTouch: !!preset.touch,
    isMobile: !!preset.mobile,
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '',
  }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ status: 204, body: '' }));
  page.on('pageerror', (error) => problems.push(`${preset.id}: ${error}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      problems.push(`${preset.id}: ${message.text()}`);
    }
  });
  await page.goto(fixtureUrl(preset, extra), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(async () => {
    try { return !!(await window.__linjiangTavernReal?.waitUntilReady?.(100)); }
    catch { return false; }
  }, { timeout: 25000 });
  await page.waitForTimeout(350);
  return page;
}

const probe = (page) => page.evaluate(() => window.__linjiangTavernReal.measure());

console.log('\n  real tavern embed geometry');
console.log(`  ${'-'.repeat(112)}`);
console.log('        preset             viewport    expected            sheld/chat    slot              HUD       align  heights');
console.log(`  ${'-'.repeat(112)}`);

const geometryPresets = REAL_PRESETS;
const screenshotIds = new Set(['phone-iphone', 'hud-880', 'desktop-short', 'desktop-fhd']);

for (const preset of geometryPresets) {
  const page = await openPreset(preset);
  const m = await probe(page);
  const expectedMode = expectedHudMode(preset.vw, preset.vh);
  const expectedReading = expectedReadingWidth(preset.vw, preset.sheldVw ?? 50);

  check(preset.id, Math.abs(m.sheldW - expectedReading) <= 2, `sheld ${m.sheldW}, expected ${expectedReading}`);
  check(preset.id, Math.abs(m.chatW - m.sheldW) <= 2, `chat ${m.chatW}, sheld ${m.sheldW}`);
  check(preset.id, m.sheldScrollable <= 2, `#sheld unexpectedly scrollable by ${m.sheldScrollable}px`);
  check(preset.id, m.chatScrollHeight > m.chatClientHeight + 300, '#chat has no useful scroll range');
  check(preset.id, m.slotW > 80 && m.slotH > 100, `invalid helper iframe ${m.slotW}x${m.slotH}`);
  check(preset.id, m.hudW > 100 && m.hudH > 100, `invalid HUD ${m.hudW}x${m.hudH}`);
  check(preset.id, m.liveHudCount === 1, `live HUD count ${m.liveHudCount}`);
  if (expectedMode !== 'mobile-landscape') {
    check(preset.id, m.lifted, 'production HUD was not lifted to tavern body');
  }
  check(preset.id, Math.abs(m.alignment ?? 999) <= 1, `HUD/spacer alignment ${m.alignment}px`);
  if (expectedMode === 'portrait') {
    check(preset.id, m.portraitDom, 'portrait HUD DOM not active');
    check(preset.id, Math.abs(m.hudOverflowX ?? 0) <= 2, `HUD horizontal overflow ${m.hudOverflowX}px`);
    check(preset.id, m.portraitStatus?.whoLabels?.join() === '\u540c\u884c,\u5728\u770b',
      `portrait people fields ${m.portraitStatus?.whoLabels}`);
    check(preset.id, m.portraitStatus?.lifeLabels?.join() === '\u5de5\u4f5c,\u4f4f\u6240',
      `portrait life fields ${m.portraitStatus?.lifeLabels}`);
    check(preset.id, !m.portraitStatus?.placeMeta, `legacy privacy remained: ${m.portraitStatus?.placeMeta}`);
    check(preset.id, !m.portraitStatus?.timeMeta?.includes('\u7b2c16\u5468'),
      `portrait status still shows week: ${m.portraitStatus?.timeMeta}`);
  } else {
    check(preset.id, !m.portraitDom, `${expectedMode} unexpectedly uses portrait DOM`);
  }
  check(preset.id, m.helperHeightSamples.length <= 12, `helper height oscillated ${m.helperHeightSamples.length} times: ${m.helperHeightSamples.join(',')}`);
  /* 桥有没有真的把 MVU 快照送到 HUD：夹具的 金钱 是 512300，data.js 的样本是 286450。 */
  check(preset.id, m.hudMoney.includes('512,300'), `HUD money reads ${m.hudMoney || '(empty)'}, expected the MVU snapshot 512,300`);

  console.log(
    `  ${fails.some((failure) => failure.startsWith(`${preset.id}:`)) ? 'FAIL' : 'ok  '}  `
    + `${preset.id.padEnd(19)} ${`${preset.vw}x${preset.vh}`.padEnd(11)} ${expectedMode.padEnd(19)} `
    + `${String(m.sheldW).padStart(4)}/${String(m.chatW).padEnd(4)}  `
    + `${`${m.slotW}x${m.slotH}`.padEnd(16)} ${`${m.hudW}x${m.hudH}`.padEnd(10)} `
    + `${String(m.alignment).padStart(5)}  ${m.helperHeightSamples.join('>')}`,
  );

  if (screenshotIds.has(preset.id)) {
    writeFileSync(`artifacts/tavern-real-${preset.id}.png`, await page.screenshot({ fullPage: false }));
  }
  await page.close();
}

console.log('\n  interaction contract (desktop-work)');
console.log(`  ${'-'.repeat(112)}`);
{
  const preset = REAL_PRESETS.find((item) => item.id === 'desktop-work');
  const page = await openPreset(preset);

  const placeStatus = async (scrollTop = null) => {
    await page.evaluate((requested) => {
      const chat = document.getElementById('chat');
      const frame = window.__linjiangTavernReal.statusFrame;
      if (requested == null) {
        const chatRect = chat.getBoundingClientRect();
        const frameRect = frame.getBoundingClientRect();
        chat.scrollTop = Math.max(0,
          chat.scrollTop + frameRect.top - chatRect.top - chat.clientHeight * 0.34);
      } else {
        chat.scrollTop = requested;
      }
    }, scrollTop);
    await page.waitForTimeout(120);
    return page.evaluate(() => {
      const hud = document.getElementById('linjiang-hud-live').getBoundingClientRect();
      const chat = document.getElementById('chat').getBoundingClientRect();
      return {
        baseline: document.getElementById('chat').scrollTop,
        hud: { x: hud.left + hud.width / 2, y: hud.top + Math.min(150, hud.height * .32) },
        reading: { x: chat.left + 20, y: chat.top + 24 },
      };
    });
  };

  const first = await placeStatus();
  await page.mouse.move(first.reading.x, first.reading.y);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(100);
  const directTop = await page.evaluate(() => document.getElementById('chat').scrollTop);
  const directDelta = directTop - first.baseline;

  const second = await placeStatus(first.baseline);
  await page.mouse.move(second.hud.x, second.hud.y);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(100);
  const forwardedTop = await page.evaluate(() => document.getElementById('chat').scrollTop);
  const forwardedDelta = forwardedTop - second.baseline;
  check('interaction-wheel', Math.abs(directDelta - forwardedDelta) <= 1 && directDelta !== 0,
    `direct ${directDelta}, HUD ${forwardedDelta}`);
  console.log(`  ${Math.abs(directDelta - forwardedDelta) <= 1 && directDelta !== 0 ? 'ok  ' : 'FAIL'}  wheel direct=${directDelta}px HUD=${forwardedDelta}px`);

  /* Sample every animation frame while a burst of wheel messages is handled.
     This catches a one-frame jump that an end-state-only assertion misses. */
  const jitterPoint = await placeStatus(first.baseline);
  await page.evaluate(() => {
    window.__fixtureAlignmentSamples = [];
    let frames = 0;
    const sample = () => {
      const hudElement = document.getElementById('linjiang-hud-live');
      const hud = hudElement?.getBoundingClientRect();
      const slot = window.__linjiangTavernReal.statusFrame?.getBoundingClientRect();
      /* Once the anchor has left #chat the HUD is deliberately hidden.  Its dormant
         fixed box may settle one rAF later, but there is no visible jump to score. */
      if (hud && slot && getComputedStyle(hudElement).visibility !== 'hidden') {
        window.__fixtureAlignmentSamples.push(hud.top - slot.top);
      }
      if (++frames < 45) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.mouse.move(jitterPoint.hud.x, jitterPoint.hud.y);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 55);
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(800);
  const alignmentSamples = await page.evaluate(() => window.__fixtureAlignmentSamples || []);
  const maxAlignment = Math.max(0, ...alignmentSamples.map((value) => Math.abs(value)));
  check('interaction-jitter', maxAlignment <= 1, `max frame alignment error ${maxAlignment}px`);
  console.log(`  ${maxAlignment <= 1 ? 'ok  ' : 'FAIL'}  wheel jitter max alignment error=${maxAlignment.toFixed(2)}px over ${alignmentSamples.length} frames`);

  const middlePlacement = await placeStatus(first.baseline);
  const middleStart = middlePlacement.baseline;
  const middlePoint = await page.evaluate(() => {
    const hud = document.getElementById('linjiang-hud-live').getBoundingClientRect();
    return { x: hud.left + hud.width / 2, y: hud.top + Math.min(180, hud.height * .38) };
  });
  await page.mouse.click(middlePoint.x, middlePoint.y, { button: 'middle' });
  await page.waitForSelector('#linjiang-hud-autoscroll', { state: 'attached', timeout: 3000 });
  await page.mouse.move(middlePoint.x, middlePoint.y + 100, { steps: 5 });
  await page.waitForTimeout(500);
  const middleDown = await page.evaluate(() => document.getElementById('chat').scrollTop);
  await page.mouse.move(middlePoint.x, middlePoint.y - 100, { steps: 8 });
  await page.waitForTimeout(500);
  const middleUp = await page.evaluate(() => document.getElementById('chat').scrollTop);
  await page.mouse.click(middlePoint.x, middlePoint.y, { button: 'middle' });
  await page.waitForSelector('#linjiang-hud-autoscroll', { state: 'detached', timeout: 3000 });
  const stoppedAt = await page.evaluate(() => document.getElementById('chat').scrollTop);
  await page.waitForTimeout(250);
  const stoppedAfter = await page.evaluate(() => document.getElementById('chat').scrollTop);
  check('interaction-middle', middleDown > middleStart && middleUp < middleDown, `middle positions ${middleStart}>${middleDown}>${middleUp}`);
  check('interaction-middle-stop', Math.abs(stoppedAfter - stoppedAt) <= 1, `continued ${stoppedAt} -> ${stoppedAfter}`);
  console.log(`  ${middleDown > middleStart && middleUp < middleDown && Math.abs(stoppedAfter - stoppedAt) <= 1 ? 'ok  ' : 'FAIL'}  middle ${middleStart} -> ${middleDown} -> ${middleUp}, stopped ${stoppedAfter}`);

  await page.evaluate(() => window.__linjiangTavernReal.reload());
  await page.waitForFunction(() => {
    const m = window.__linjiangTavernReal.measure();
    return m.liveHudCount === 1 && m.slotH > 100 && m.hudW > 100;
  }, { timeout: 25000 });
  await page.waitForTimeout(500);
  const lifecycle = await probe(page);
  check('interaction-lifecycle', lifecycle.liveHudCount === 1, `live HUD count after reload ${lifecycle.liveHudCount}`);
  check('interaction-lifecycle', Math.abs(lifecycle.alignment ?? 999) <= 1, `alignment after reload ${lifecycle.alignment}`);
  console.log(`  ${lifecycle.liveHudCount === 1 && Math.abs(lifecycle.alignment ?? 999) <= 1 ? 'ok  ' : 'FAIL'}  message iframe reload leaves ${lifecycle.liveHudCount} live HUD, align=${lifecycle.alignment}`);

  writeFileSync('artifacts/tavern-real-interaction.png', await page.screenshot({ fullPage: false }));
  await page.close();
}

console.log('\n  compressed message wrapper regression');
console.log(`  ${'-'.repeat(112)}`);
{
  const preset = REAL_PRESETS.find((item) => item.id === 'phone-iphone');
  const page = await openPreset(preset, { wrapPx: 140 });
  const m = await probe(page);
  check('compressed-140', m.slotW <= 142, `slot width ${m.slotW}`);
  check('compressed-140', m.hudW > m.slotW + 80, `HUD ${m.hudW} did not break out of slot ${m.slotW}`);
  check('compressed-140', Math.abs(m.alignment ?? 999) <= 1, `alignment ${m.alignment}`);
  console.log(`  ${m.slotW <= 142 && m.hudW > m.slotW + 80 ? 'ok  ' : 'FAIL'}  slot=${m.slotW}, HUD=${m.hudW}, alignment=${m.alignment}`);
  await page.close();
}


console.log('\n  partial-slot scroll regression');
console.log(`  ${'-'.repeat(112)}`);
for (const presetId of ['desktop-work', 'phone-iphone']) {
  const preset = REAL_PRESETS.find((item) => item.id === presetId);
  const page = await openPreset(preset);
  await page.evaluate(() => {
    const chat = document.getElementById('chat');
    const frame = window.__linjiangTavernReal.statusFrame;
    const chatRect = chat.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    /* Put the slot top 96px above the reading pane. The old 32px top-edge gate
       hid the complete HUD here even though almost all of the spacer remained. */
    chat.scrollTop = Math.max(0, chat.scrollTop + frameRect.top - chatRect.top + 96);
  });
  await page.waitForTimeout(180);
  const state = await page.evaluate(() => {
    const chat = document.getElementById('chat').getBoundingClientRect();
    const slot = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
    const hud = document.getElementById('linjiang-hud-live');
    const style = getComputedStyle(hud);
    return {
      chatTop: chat.top,
      chatBottom: chat.bottom,
      slotTop: slot.top,
      slotBottom: slot.bottom,
      visibility: style.visibility,
      pointerEvents: style.pointerEvents,
      clipPath: style.clipPath,
    };
  });
  const slotTopLeft = state.slotTop < state.chatTop - 32;
  const slotStillIntersects = state.slotBottom > state.chatTop + 1 && state.slotTop < state.chatBottom - 1;
  const visible = state.visibility === 'visible' && state.pointerEvents === 'auto';
  const clipped = state.clipPath && state.clipPath !== 'none';
  check(`partial-scroll-${presetId}`, slotTopLeft && slotStillIntersects && visible && clipped,
    JSON.stringify(state));
  console.log(`  ${slotTopLeft && slotStillIntersects && visible && clipped ? 'ok  ' : 'FAIL'}  `
    + `${presetId.padEnd(19)} slot ${Math.round(state.slotTop)}..${Math.round(state.slotBottom)} `
    + `chat ${Math.round(state.chatTop)}..${Math.round(state.chatBottom)} ${state.visibility} ${state.clipPath}`);
  if (presetId === 'phone-iphone') {
    writeFileSync('artifacts/tavern-real-phone-partial-scroll.png', await page.screenshot({ fullPage: false }));
  }
  await page.evaluate(() => {
    const chat = document.getElementById('chat');
    const frame = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
    const pane = chat.getBoundingClientRect();
    chat.scrollTop += Math.max(0, frame.bottom - pane.top + 8);
  });
  await page.waitForTimeout(150);
  const fullyGone = await page.evaluate(() => {
    const chat = document.getElementById('chat').getBoundingClientRect();
    const slot = window.__linjiangTavernReal.statusFrame.getBoundingClientRect();
    const hud = document.getElementById('linjiang-hud-live');
    return {
      outside: slot.bottom <= chat.top + 1 || slot.top >= chat.bottom - 1,
      visibility: getComputedStyle(hud).visibility,
    };
  });
  check(`full-scroll-${presetId}`, fullyGone.outside && fullyGone.visibility === 'hidden', JSON.stringify(fullyGone));
  await page.close();
}

await browser.close();
await server.close();

console.log('\n  summary');
console.log(`  ${'-'.repeat(112)}`);
if (fails.length) {
  console.log(`  ${fails.length} check(s) failed`);
  fails.forEach((failure) => console.log(`    - ${failure}`));
} else {
  console.log('  all real tavern fixture checks passed');
}
if (problems.length) {
  console.log('\n  page/console errors:');
  [...new Set(problems)].forEach((problem) => console.log(`    - ${problem}`));
}
console.log('');
if (fails.length || problems.length) process.exit(1);
