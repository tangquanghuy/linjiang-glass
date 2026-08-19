/* Measures the joint: for every point along the dock's underside, the distance to
   the nearest point on the shell's top edge.  If the complement was derived
   correctly this is flat at `gap` across the parallel span, including through both
   S-fillets -- which is the part a hand-drawn shape always gets wrong. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const geo = JSON.parse(readFileSync('src/geometry.json', 'utf8'));

const SHELL_TOP =
  'M 23 419 A 29 29 0 0 1 52 390 L 307 390 A 34 34 0 0 1 331.5 400.5 ' +
  'A 34 34 0 0 0 356 411 L 1333 411 A 54 54 0 0 0 1381.5 380.5 ' +
  'A 54 54 0 0 1 1430 350 L 1603 350 A 45 45 0 0 1 1648 395';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<svg id="s" width="1672" height="941"></svg>');

const result = await page.evaluate(({ dockBottom, shellTop }) => {
  const svg = document.getElementById('s');
  const mk = (d) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return p;
  };
  const dock = mk(dockBottom);
  const shell = mk(shellTop);

  const sample = (p, step) => {
    const len = p.getTotalLength();
    const out = [];
    for (let l = 0; l <= len; l += step) {
      const pt = p.getPointAtLength(l);
      out.push([pt.x, pt.y]);
    }
    return out;
  };

  const shellPts = sample(shell, 0.25);
  const dockPts = sample(dock, 1);

  const rows = dockPts.map(([x, y]) => {
    let best = Infinity;
    for (const [sx, sy] of shellPts) {
      const dx = sx - x;
      const dy = sy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, gap: Math.sqrt(best) };
  });
  return { rows, dockLen: dock.getTotalLength(), shellLen: shell.getTotalLength() };
}, { dockBottom: geo.dock.bottomPath, shellTop: SHELL_TOP });

await browser.close();

/* The four outermost corners are plain rounded corners, not offsets -- there the
   panels' outer edges align vertically instead, so the seam is allowed to open. */
const parallel = result.rows.filter((r) => r.x >= 52 && r.x <= 1603);
const gaps = parallel.map((r) => r.gap);
const min = Math.min(...gaps);
const max = Math.max(...gaps);
const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
const off = parallel.filter((r) => Math.abs(r.gap - geo.dock.gap) > 0.5);

console.log(`target gap        ${geo.dock.gap}px`);
console.log(`parallel span     x 52..1603, ${parallel.length} samples`);
console.log(`gap  min/mean/max ${min.toFixed(2)} / ${mean.toFixed(3)} / ${max.toFixed(2)}`);
console.log(`samples off by >0.5px: ${off.length}`);
if (off.length) console.log(off.slice(0, 12));

/* Spot-check the three faces and both fillets by name. */
const at = (x) => {
  const r = parallel.reduce((b, c) => (Math.abs(c.x - x) < Math.abs(b.x - x) ? c : b));
  return `x=${r.x} y=${r.y} gap=${r.gap.toFixed(2)}`;
};
console.log('\near face      ', at(180));
console.log('ear fillet    ', at(330));
console.log('valley tongue ', at(840));
console.log('pod fillet    ', at(1400));
console.log('pod face      ', at(1530));
