/**
 * 底板对比：两张【同尺寸】图取同一块区域，上下并排，1:1 不缩放。
 * 必须同尺寸——上一版拿原图和裁切过的 hd 图硬算映射，结果比错了区域。
 *
 * 用法: node tools/plate_cmp.mjs <图A> <图B> [--x 0.26] [--y 0.52] [--w 900] [--h 440] [--a 标签] [--b 标签]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const [pa, pb] = args.filter(a => !a.startsWith('--'));
const num = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const str = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const FX = num('x', 0.26), FY = num('y', 0.52), CW = num('w', 900), CH = num('h', 440);
const LA = str('a', 'A'), LB = str('b', 'B');

const b64 = p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: CW + 20, height: CH * 2 + 54 } });
page.on('pageerror', e => console.log('ERR', e.message));

const r = await page.evaluate(async ({ a, b, FX, FY, CW, CH, LA, LB }) => {
  const load = async u => { const i = new Image(); i.src = u; await i.decode(); return i; };
  const ia = await load(a), ib = await load(b);
  if (ia.naturalWidth !== ib.naturalWidth || ia.naturalHeight !== ib.naturalHeight) {
    return { err: `尺寸不一致: ${ia.naturalWidth}×${ia.naturalHeight} vs ${ib.naturalWidth}×${ib.naturalHeight}` };
  }

  const x = Math.round(Math.min(ia.naturalWidth - CW, Math.max(0, ia.naturalWidth * FX)));
  const y = Math.round(Math.min(ia.naturalHeight - CH, Math.max(0, ia.naturalHeight * FY)));

  const cv = document.createElement('canvas');
  cv.width = CW + 20; cv.height = CH * 2 + 54;
  const c = cv.getContext('2d');
  c.fillStyle = '#0b0e18';
  c.fillRect(0, 0, cv.width, cv.height);
  c.imageSmoothingEnabled = false;
  c.drawImage(ia, x, y, CW, CH, 10, 30, CW, CH);
  c.drawImage(ib, x, y, CW, CH, 10, CH + 44, CW, CH);
  c.font = '600 13px system-ui';
  c.fillStyle = 'rgba(220,230,255,.85)';
  c.fillText(LA, 12, 20);
  c.fillText(LB, 12, CH + 40);

  const blob = await new Promise(z => cv.toBlob(z, 'image/png'));
  return { crop: [x, y], bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
}, { a: b64(pa), b: b64(pb), FX, FY, CW, CH, LA, LB });

await browser.close();
if (r.err) { console.error(r.err); process.exit(1); }
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/plate_cmp.png', Buffer.from(r.bytes));
console.log(`取样 ${r.crop[0]},${r.crop[1]}  →  artifacts/plate_cmp.png`);
