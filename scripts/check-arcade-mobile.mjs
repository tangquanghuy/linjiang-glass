/* Arcade mobile audit.
   ------------------------------------------------------------------
   The four arcade pages were laid out for a desktop column and then
   patched for phones.  This sweeps the phone sizes that actually ship,
   in both orientations, standalone and inside the lobby shell, and
   reports the three things that break independently:

     horizontal overflow   the page must never scroll sideways
     clipped content       nothing important may sit outside the viewport
     touch targets         every control must render at 44 real px

   Usage: node scripts/check-arcade-mobile.mjs [--shots]
*/

import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const SHOTS = process.argv.includes('--shots');
const OUT = 'artifacts/arcade-audit';
mkdirSync(OUT, { recursive: true });

/* A plain static server, not vite: the 2.8MB fishing page makes the dev
   server's transform pipeline flake, and nothing here needs bundling. */
const ROOT = resolve('.');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  let file = join(ROOT, normalize(url).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
  } catch { res.writeHead(404).end('not found'); return; }
  try { statSync(file); } catch { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
/* Port 0: let the OS pick a free one, so a stale run never blocks this one. */
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/arcade/`;
const browser = await chromium.launch();

/* Smallest phone still in the wild, the Android median, the iPhone band,
   and one short landscape which is where these pages hurt most. */
const VIEWS = [
  { id: 'p320', w: 320, h: 568, name: 'SE1 portrait' },
  { id: 'p360', w: 360, h: 740, name: 'Android portrait' },
  { id: 'p390', w: 390, h: 844, name: 'iPhone 14 portrait' },
  { id: 'p430', w: 430, h: 932, name: 'Pro Max portrait' },
  { id: 'l844', w: 844, h: 390, name: 'iPhone 14 landscape' },
  { id: 'l667', w: 667, h: 375, name: 'SE landscape' },
  /* Guard rail: several of the fixes touch rules shared with the wide
     layouts, so sweep past the breakpoints too. */
  { id: 't768', w: 768, h: 1024, name: 'iPad portrait' },
  { id: 'd1280', w: 1280, h: 800, name: 'desktop' },
];

const GAMES = ['shrine', 'scratch', 'slots', 'fishing'];

/* Runs in the page: everything a layout bug shows up as. */
const MEASURE = () => {
  const de = document.documentElement;
  const vw = innerWidth;
  const vh = innerHeight;

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /* Anything a finger is meant to hit.  The drawn box is not the hit box:
     these pages expand small controls with a transparent ::after, which is
     what a fingertip actually meets, so measure that too. */
  const CONTROL = 'button,[role=button],a[href],input,select,summary,canvas';
  const hitBox = (el) => {
    const r = el.getBoundingClientRect();
    let w = r.width;
    let h = r.height;
    const a = getComputedStyle(el, '::after');
    if (a.content && a.content !== 'none' && a.position === 'absolute') {
      const aw = parseFloat(a.width);
      const ah = parseFloat(a.height);
      if (Number.isFinite(aw)) w = Math.max(w, aw);
      if (Number.isFinite(ah)) h = Math.max(h, ah);
    }
    return { w, h, r };
  };
  const small = [];
  const wide = [];
  for (const el of document.querySelectorAll(CONTROL)) {
    if (!visible(el)) continue;
    const { w, h, r } = hitBox(el);
    const tag = el.id || el.className.toString().split(/\s+/).slice(0, 2).join('.') || el.tagName;
    if (el.tagName !== 'CANVAS' && (w < 43.5 || h < 43.5)) {
      small.push({ tag, w: +w.toFixed(1), h: +h.toFixed(1) });
    }
    if (r.right > vw + 1 || r.left < -1) {
      wide.push({ tag, left: +r.left.toFixed(1), right: +r.right.toFixed(1) });
    }
  }

  /* A closed <details> still reports laid-out children in Chrome, so its
     subtree would show up as a pile of phantom overflow. */
  const inClosedDetails = (el) => !!el.closest('details:not([open])');

  /* Elements poking out sideways, regardless of whether the doc scrolls
     (overflow:hidden hides the scrollbar but still cuts the content). */
  const clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || inClosedDetails(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const over = Math.max(0, r.right - vw) + Math.max(0, -r.left);
    if (over > 2) {
      const tag = el.id || el.className.toString().split(/\s+/).slice(0, 2).join('.') || el.tagName;
      clipped.push({ tag, over: Math.round(over), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }
  clipped.sort((a, b) => b.over - a.over);

  /* Text that has shrunk below readable.  font-size:0 is the deliberate
     "swap the label for a ::before glyph" trick, not shrunken text. */
  let minType = Infinity;
  let minTypeTag = '';
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || inClosedDetails(el)) continue;
    const owns = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!owns) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs === 0) continue;
    if (fs < minType) {
      minType = fs;
      minTypeTag = el.id || el.className.toString().split(/\s+/)[0] || el.tagName;
    }
  }

  /* The one thing that must never need a scroll: the button the game is
     played with.  Page-level overflow on its own is fine -- the records
     drawer is meant to sit below the fold. */
  const PRIMARY = [
    ['buy', '购买'], ['pushSpin', '启动'], ['fireButton', '发射'],
  ];
  let action = null;
  for (const sel of ['#buy', '#pushSpin', '.fire-button', '.ema-slot.today', '.packet']) {
    const el = document.querySelector(sel);
    if (!el || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    action = {
      sel,
      inside: r.top >= -1 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= vw + 1,
      top: Math.round(r.top), bottom: Math.round(r.bottom),
    };
    break;
  }

  /* Any canvas whose bitmap is stretched into a box of a different aspect.
     fishing.html paints a fixed 960x540 bitmap with object-fit:fill, so this
     is the difference between "the fish look right" and "the fish are 3.7x
     too tall".  A layout audit that only measures boxes misses it. */
  const canvases = [];
  for (const c of document.querySelectorAll('canvas')) {
    if (!visible(c) || !c.width || !c.height) continue;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const fit = getComputedStyle(c).objectFit;
    const stretch = (r.width / r.height) / (c.width / c.height);
    canvases.push({
      id: c.id || 'canvas',
      bitmap: `${c.width}x${c.height}`,
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      fit,
      /* object-fit:contain/none letterbox instead of distorting. */
      stretch: fit === 'fill' ? +stretch.toFixed(2) : 1,
    });
  }

  return {
    vw, vh,
    action,
    canvases,
    scrollW: de.scrollWidth,
    scrollH: de.scrollHeight,
    overflowX: Math.max(0, de.scrollWidth - de.clientWidth),
    overflowY: Math.max(0, de.scrollHeight - de.clientHeight),
    bodyOverflow: getComputedStyle(document.body).overflowX,
    minType: Number.isFinite(minType) ? +minType.toFixed(1) : null,
    minTypeTag,
    small: small.slice(0, 8),
    wide: wide.slice(0, 8),
    clipped: clipped.slice(0, 8),
  };
};

const rows = [];
const errors = [];

for (const view of VIEWS) {
  for (const game of GAMES) {
    const page = await browser.newPage({
      viewport: { width: view.w, height: view.h },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    page.on('pageerror', (e) => errors.push(`${view.id}/${game}: ${e.message}`));
    await page.goto(`${base}${game}.html`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    const m = await page.evaluate(MEASURE);
    rows.push({ view: view.id, viewName: view.name, game, ...m });
    if (SHOTS) {
      writeFileSync(`${OUT}/${view.id}-${game}.png`, await page.screenshot());
    }
    await page.close();
  }

  /* The lobby is how a player actually reaches them. */
  for (const game of GAMES) {
    const page = await browser.newPage({
      viewport: { width: view.w, height: view.h },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    page.on('pageerror', (e) => errors.push(`${view.id}/lobby-${game}: ${e.message}`));
    await page.goto(`${base}index.html#${game}`, { waitUntil: 'load' });
    await page.waitForTimeout(1400);
    /* The shell is a chrome; the game is in the iframe.  Once the shell
       rotates for a portrait phone, measuring only the shell tells you
       nothing about the thing being played. */
    const inner = await page.frames()[1].evaluate(MEASURE).catch(() => null);
    const m = await page.evaluate(MEASURE);
    const frame = await page.evaluate(() => {
      const f = document.getElementById('frame');
      const r = f.getBoundingClientRect();
      let inner = null;
      try {
        const d = f.contentDocument;
        inner = {
          scrollW: d.documentElement.scrollWidth,
          scrollH: d.documentElement.scrollHeight,
          clientW: d.documentElement.clientWidth,
          clientH: d.documentElement.clientHeight,
        };
      } catch (_) {}
      return {
        frameH: Math.round(r.height),
        frameW: Math.round(r.width),
        below: Math.round(r.bottom - innerHeight),
        inner,
      };
    });
    rows.push({ view: view.id, viewName: view.name, game: `lobby:${game}`, ...m, frame, inner });
    if (SHOTS) {
      writeFileSync(`${OUT}/${view.id}-lobby-${game}.png`, await page.screenshot());
    }
    await page.close();
  }
}

await browser.close();
server.close();

writeFileSync(`${OUT}/report.json`, JSON.stringify(rows, null, 2));

/* ------------------------------------------------------------------ print */
const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

console.log('');
for (const view of VIEWS) {
  const group = rows.filter((r) => r.view === view.id);
  console.log(`  ${view.name}  ${view.w}x${view.h}`);
  console.log(`  ${'-'.repeat(96)}`);
  console.log(`  ${pad('page', 16)} ${pad('viewport', 10)} ${num('ovfX', 5)} ${num('ovfY', 6)} ${pad(' action', 8)} ${pad('canvas stretch', 15)} small targets`);
  for (const r of group) {
    /* For a lobby row, report the game's own frame, not the shell's. */
    const g = r.inner || r;
    const smalls = g.small.length
      ? `${g.small.length}: ` + g.small.slice(0, 2).map((s) => `${s.tag}(${s.w}x${s.h})`).join(' ')
      : '-';
    const act = !g.action ? '  ?   ' : g.action.inside ? '  ok  ' : ' CUT  ';
    const cv = g.canvases && g.canvases.length
      ? g.canvases.map((c) => (Math.abs(c.stretch - 1) > 0.06 ? `${c.stretch}x BAD` : 'ok')).join(' ')
      : '-';
    const vp = `${g.vw}x${g.vh}${r.frame && r.frame.rotated ? '↻' : ''}`;
    console.log(`  ${pad(r.game, 16)} ${pad(vp, 10)} ${num(g.overflowX, 5)} ${num(g.overflowY, 6)} ${pad(act, 8)} ${pad(cv, 15)} ${smalls}`);
  }
  console.log('');
}

if (errors.length) {
  console.log('  page errors');
  console.log(`  ${'-'.repeat(96)}`);
  [...new Set(errors)].forEach((e) => console.log(`    ${e}`));
  console.log('');
}
console.log(`  report: ${OUT}/report.json${SHOTS ? `  shots: ${OUT}/` : ''}`);
console.log('');
