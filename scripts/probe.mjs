/* Compare the render against the prototype at the specific points the glass was
   characterised from, so tint, bloom and rim can be calibrated by number instead
   of by eye.  Run `npm run diff` first to refresh artifacts/render.png. */

import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const shot = PNG.sync.read(readFileSync('artifacts/render.png'));
const ref = PNG.sync.read(readFileSync('public/ref/prototype.png'));
const W = shot.width;

const patch = (img, x0, y0, x1, y1) => {
  const s = [0, 0, 0];
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) << 2;
      s[0] += img.data[i]; s[1] += img.data[i + 1]; s[2] += img.data[i + 2];
      n++;
    }
  return s.map((v) => v / n);
};

const PATCHES = [
  ['body left      ', 150, 585, 260, 605],
  ['body mid       ', 1140, 420, 1230, 455],
  ['body right     ', 950, 415, 1080, 440],
  ['body far right ', 1180, 415, 1300, 440],
  ['bloom  -90px   ', 900, 625, 1100, 635],
  ['bloom  -40px   ', 900, 675, 1100, 685],
  ['bloom  -12px   ', 900, 703, 1100, 711],
  ['pod interior   ', 1440, 420, 1620, 435],
  ['ear interior   ', 90, 396, 280, 406],
];

console.log('\n  patch                render RGB          prototype RGB       delta');
console.log(`  ${'-'.repeat(70)}`);
for (const [name, ...box] of PATCHES) {
  const a = patch(shot, ...box);
  const b = patch(ref, ...box);
  const d = a.map((v, i) => v - b[i]);
  const f = (v) => v.map((n) => String(Math.round(n)).padStart(4)).join('');
  const sign = (v) => v.map((n) => (n >= 0 ? '+' : '') + Math.round(n)).join(' ').padStart(16);
  console.log(`  ${name}  ${f(a)}      ${f(b)}     ${sign(d)}`);
}

/* Vertical cut through the top and bottom rims: the shape of the falloff matters
   more than any single value. */
const cut = (x0, x1, y0, y1, label) => {
  console.log(`\n  ${label}   (x ${x0}..${x1})`);
  console.log('      y   render lum   ref lum   delta');
  for (let y = y0; y < y1; y++) {
    const a = patch(shot, x0, y, x1, y + 1).reduce((s, v) => s + v, 0) / 3;
    const b = patch(ref, x0, y, x1, y + 1).reduce((s, v) => s + v, 0) / 3;
    const d = a - b;
    const bar = d >= 0 ? ' '.repeat(14) + '#'.repeat(Math.min(24, Math.round(d / 3)))
                       : ' '.repeat(Math.max(0, 14 - Math.round(-d / 3))) + '#'.repeat(Math.min(14, Math.round(-d / 3)));
    console.log(`  ${String(y).padStart(5)} ${a.toFixed(1).padStart(9)} ${b.toFixed(1).padStart(10)} ${d.toFixed(1).padStart(8)}  ${bar}`);
  }
};

cut(1000, 1040, 404, 428, 'top rim (main body)');
cut(1000, 1040, 698, 724, 'bottom rim');
cut(150, 260, 384, 410, 'top rim (title ear)');

const row = (y, x0, x1, label) => {
  console.log(`\n  ${label}   (y ${y})`);
  console.log('      x   render lum   ref lum   delta');
  for (let x = x0; x < x1; x++) {
    const a = patch(shot, x, y, x + 1, y + 1).reduce((s, v) => s + v, 0) / 3;
    const b = patch(ref, x, y, x + 1, y + 1).reduce((s, v) => s + v, 0) / 3;
    const d = a - b;
    const bar = d >= 0 ? ' '.repeat(14) + '#'.repeat(Math.min(24, Math.round(Math.abs(d) / 3)))
                       : ' '.repeat(Math.max(0, 14 - Math.round(-d / 3))) + '#'.repeat(Math.min(14, Math.round(-d / 3)));
    console.log(`  ${String(x).padStart(5)} ${a.toFixed(1).padStart(9)} ${b.toFixed(1).padStart(10)} ${d.toFixed(1).padStart(8)}  ${bar}`);
  }
};
row(560, 12, 36, 'left rim, y=560');
row(560, 1636, 1660, 'right rim, y=560');
row(720, 990, 1020, 'bottom rim, y=720');
