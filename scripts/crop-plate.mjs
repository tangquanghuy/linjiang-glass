// 把底板某一块放大截出来，叠归一化坐标网格。
// 用法: node scripts/crop-plate.mjs overview_night 0 0 0.55 0.42 [zoom]
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
import { writeFileSync, rmSync } from 'fs';
import path from 'path';

const [file, x0, y0, x1, y1, zm] = process.argv.slice(2);
const f = file || 'overview_night';
const a = +(x0 ?? 0), b = +(y0 ?? 0), c = +(x1 ?? 1), d = +(y1 ?? 1), z = +(zm ?? 2);

const W = 1536, H = 1024;
const cw = Math.round((c - a) * W * z), ch = Math.round((d - b) * H * z);

let g = '';
for (let i = 0; i <= 20; i++) {
  const nx = i / 20, px = (nx - a) * W * z;
  if (px >= 0 && px <= cw) {
    g += `<line x1="${px}" y1="0" x2="${px}" y2="${ch}" stroke="rgba(0,255,255,.4)"/>` +
      `<text x="${px + 3}" y="14" fill="#0ff" font-size="12" font-family="monospace">${nx.toFixed(2)}</text>`;
  }
  const ny = i / 20, py = (ny - b) * H * z;
  if (py >= 0 && py <= ch) {
    g += `<line x1="0" y1="${py}" x2="${cw}" y2="${py}" stroke="rgba(255,200,0,.4)"/>` +
      `<text x="3" y="${py - 3}" fill="#fc0" font-size="12" font-family="monospace">${ny.toFixed(2)}</text>`;
  }
}

// 相对 city/ 写临时页，img 用相对路径，file:// 下才加载得到
const tmp = path.resolve('city/_crop.html');
writeFileSync(tmp, `<body style="margin:0;overflow:hidden;background:#000">
<img src="plate/${f}.png" style="position:absolute;width:${W * z}px;height:${H * z}px;
     left:${-a * W * z}px;top:${-b * H * z}px">
<svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 ${cw} ${ch}">${g}</svg>
</body>`);

const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: cw, height: ch } });
await pg.goto(pathToFileURL(tmp).href);
await pg.waitForLoadState('load');
await pg.waitForTimeout(400);
const out = `artifacts/crop-${f}-${a}_${b}.jpg`;
await pg.screenshot({ path: out, type: 'jpeg', quality: 92 });
console.log(out, `${cw}x${ch}`);
await br.close();
rmSync(tmp);
