// 从 public/assets/opening-background.png 里裁一条横幅用的窄带，压成 webp。
// 外部部署/V20260826/开局.html 那张启动卡是一条很扁的横条，直接引 2MB 的原图太重；
// 这里取「花枝 — 书架灯 — 窗外湖面 — 桌沿反光」这一段，保留上下一点余量，
// 让卡片在宽屏（横条）和手机（近方形）两种比例下 object-fit: cover 都裁得住。
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(root, 'public/assets/opening-background.png');
const outPath = path.join(root, 'public/assets/opening-strip.webp');

// 原图 1672x941。y 从 60 到 760 这一段包含花枝、相框、书架暖灯、窗外湖面日落、
// 以及桌沿那道粉蓝反光；顶上的纯天空和底下大片空桌面都不要。
const CROP = { x: 0, y: 58, w: 1672, h: 700 };
const OUT = { w: 1440, h: 603 };
const QUALITY = 0.86;

const dataUri = 'data:image/png;base64,' + readFileSync(srcPath).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = await page.evaluate(async ({ dataUri, CROP, OUT, QUALITY }) => {
  const img = new Image();
  img.src = dataUri;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = OUT.w;
  canvas.height = OUT.h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, OUT.w, OUT.h);
  return canvas.toDataURL('image/webp', QUALITY).split(',')[1];
}, { dataUri, CROP, OUT, QUALITY });
await browser.close();

const buf = Buffer.from(b64, 'base64');
writeFileSync(outPath, buf);
console.log(`opening-strip.webp  ${OUT.w}x${OUT.h}  ${(buf.length / 1024).toFixed(1)} KB`);
