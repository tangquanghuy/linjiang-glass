/* HUD map: desktop farthest cover; phone fills the viewport (cover), not a
   letterboxed strip.  Portrait may hide district chips that sit off-screen. */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.env.HUD_URL || 'http://127.0.0.1:5173/';
const problems = [];
mkdirSync('artifacts', { recursive: true });

const browser = await chromium.launch();

async function probe(page) {
  const frame = page.frameLocator('.map-layer iframe');
  await frame.locator('#stage').waitFor({ timeout: 8000 });
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const iframe = document.querySelector('.map-layer iframe');
    const layer = document.querySelector('.map-layer').getBoundingClientRect();
    const w = iframe.contentWindow;
    const dbg = w.PLATE_MAP.debug();
    const plate = w.document.querySelector('#plates img');
    const pr = plate.getBoundingClientRect();
    const cards = [...w.document.querySelectorAll('#nodes .np.on')].map((el) => {
      const r = el.getBoundingClientRect();
      const op = +getComputedStyle(el).opacity;
      return {
        k: el.dataset.k || '',
        name: el.querySelector('b')?.textContent || '',
        on: op > 0.4,
        x: r.left + r.width / 2,
      };
    });
    const on = cards.filter((c) => c.on);
    const xs = on.map((c) => c.x);
    return {
      z: +dbg.z.toFixed(4),
      zMin: dbg.zMin,
      cx: +dbg.cx.toFixed(4),
      cy: +dbg.cy.toFixed(4),
      names: on.map((c) => c.name),
      places: on.filter((c) => c.k.startsWith('N:')).map((c) => c.name),
      n: on.length,
      spreadX: xs.length > 1 ? +(Math.max(...xs) - Math.min(...xs)).toFixed(1) : 0,
      vw: w.innerWidth,
      vh: w.innerHeight,
      layer: { w: Math.round(layer.width), h: Math.round(layer.height) },
      plate: { w: Math.round(pr.width), h: Math.round(pr.height) },
      plates: [...w.document.querySelectorAll('#plates img.dp')]
        .filter((el) => el.style.display !== 'none' && +el.style.opacity > 0.05)
        .map((el) => el.dataset.k),
    };
  });
}

async function run(label, viewport, href, click) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: label === 'phone' ? 2 : 1,
  });
  page.on('pageerror', (e) => problems.push(`${label} pageerror: ${e.message}`));
  await page.goto(href, { waitUntil: 'load' });
  await page.locator(click).first().click();
  await page.waitForSelector('.map-layer iframe');
  const info = await probe(page);
  await page.screenshot({ path: `artifacts/map-${label}-far.png` });
  console.log(`${label.padEnd(8)} z=${info.z} plate ${info.plate.w}x${info.plate.h} overlay ${info.layer.w}x${info.layer.h} cards ${info.n}  ${info.names.join(' · ')}`);

  if (Math.abs(info.z - 1) > 0.06) problems.push(`${label}: default z ${info.z}, want cover (~1)`);
  if (info.layer.w < viewport.width - 2 || info.layer.h < viewport.height - 2) {
    problems.push(`${label}: overlay ${info.layer.w}x${info.layer.h} does not fill ${viewport.width}x${viewport.height}`);
  }
  if (label === 'pc') {
    if (Math.abs(info.cx - 0.5) > 0.04 || Math.abs(info.cy - 0.5) > 0.04) {
      problems.push(`${label}: view not at 全城`);
    }
    if (info.n < 9) problems.push(`${label}: missing district chips (${info.names.join(',')})`);
  }
  if (label === 'phone') {
    /* Cover: the plate is at least as tall as the phone.  Contain was ~260px tall. */
    if (info.plate.h < info.vh * 0.92) {
      problems.push(`${label}: plate height ${info.plate.h} is a letterboxed strip (vh ${info.vh})`);
    }
    if (info.plate.w < info.vw * 1.15) {
      problems.push(`${label}: plate width ${info.plate.w} did not cover the viewport (${info.vw})`);
    }
    if (info.n < 2) problems.push(`${label}: no district chips in view`);
    if (info.n >= 2 && info.spreadX < 70) problems.push(`${label}: chips piled (${info.spreadX}px)`);
    if (info.places.length) problems.push(`${label}: place pins on overview (${info.places.join(',')})`);
    if (info.plates.length) problems.push(`${label}: district plates on overview (${info.plates.join(',')})`);

    const before = info.cx;
    await page.evaluate(() => {
      const st = document.querySelector('.map-layer iframe').contentDocument.getElementById('plates');
      const down = new PointerEvent('pointerdown', { clientX: 240, clientY: 420, bubbles: true, pointerId: 1 });
      const move = new PointerEvent('pointermove', { clientX: 80, clientY: 420, bubbles: true, pointerId: 1 });
      const up = new PointerEvent('pointerup', { clientX: 80, clientY: 420, bubbles: true, pointerId: 1 });
      st.dispatchEvent(down); st.dispatchEvent(move); st.dispatchEvent(up);
    });
    await page.waitForTimeout(120);
    const dragged = await probe(page);
    await page.screenshot({ path: 'artifacts/map-phone-pan.png' });
    if (Math.abs(dragged.cx - before) < 0.01) {
      problems.push(`${label}: cover view cannot pan (cx ${before} -> ${dragged.cx})`);
    }
    console.log(`         pan cx ${before.toFixed(3)} -> ${dragged.cx.toFixed(3)}`);
  }

  await page.close();
}

await run('pc', { width: 1672, height: 941 }, `${url}?mode=landscape`, '.pane-pod .tool-btn[data-page="map"]');
await run('phone', { width: 390, height: 844 }, `${url}?mode=portrait`, '.ptool[data-page="map"]');

await browser.close();
console.log('');
if (problems.length) {
  console.log('PROBLEMS:');
  problems.forEach((p) => console.log(' -', p));
  process.exitCode = 1;
} else {
  console.log('map overlay checks passed');
}
