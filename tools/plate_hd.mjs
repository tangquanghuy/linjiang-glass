/**
 * ============================================================
 * 底板高清化
 * ============================================================
 * 用法：
 *   node tools/plate_hd.mjs city/plate/overview_night.png
 *   node tools/plate_hd.mjs <输入> --w 3840 --h 2160 --out <输出>
 *
 * 算法造不出原图里没有的细节，所以这里不硬拼「变清楚」，而是分开处理
 * 两种内容：
 *   低频（屋顶、山体、江面）——Lanczos-3 放大后保持柔和，本来就该柔和；
 *   点光源（路灯、窗光、车流）——从原图提取，在输出分辨率上重画，
 *   锐利的核 + 柔和的光晕。夜景城市的清晰感几乎全部来自这些亮点，
 *   重建它们比通用放大器有效得多。
 *
 * 不装新依赖：借 playwright 起一个页面，在 canvas 里跑，
 * 顺带白拿 JPG / WebP 解码。
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

// ---- 参数 ----
const argv = process.argv.slice(2);
const src = argv.find(a => !a.startsWith('--'));
if (!src) {
  console.error('用法: node tools/plate_hd.mjs <输入图> [--w 3840] [--h 2160] [--out 路径] [--debug]');
  process.exit(1);
}
const flag = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const OUT_W = +flag('w', 3840);
const OUT_H = +flag('h', 2160);
// 三档增强各自可调。默认值是实测退让后的结果：
// 光点重建默认关闭——原图的灯本来就成形良好，再叠合成光晕只会过曝；
// 锐化只留很轻的一档，夜景暗部一锐就出噪点。
const G_SHARP = +flag('sharpen', 0.35);
// 降噪默认关闭：生成器直出的 PNG 没有压缩块，这步只会白白软化并偏色。
// 输入是 JPEG 或明显有块状噪声时再开 --denoise 1。
const G_DENOISE = +flag('denoise', 0);
const G_LIGHT = +flag('lights', 0);
const G_GRAIN = +flag('grain', 1);
const NAIVE = argv.includes('--naive');   // 只裁切+放大，用来做对照
const debug = argv.includes('--debug');
const out = flag('out', src.replace(/\.(png|jpe?g|webp)$/i, '') + `_hd${OUT_W}.png`);

if (!fs.existsSync(src)) { console.error('找不到输入图:', src); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => console.log('[page]', m.text()));

await page.goto('about:blank');

// about:blank 里 file:// 会被拦，直接把图片当 data URL 送进去
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const dataUrl = `data:${MIME[path.extname(src).toLowerCase()] || 'image/png'};base64,` +
  fs.readFileSync(src).toString('base64');

const result = await page.evaluate(async ({ url, OUT_W, OUT_H, debug, G_SHARP, G_LIGHT, G_GRAIN, G_DENOISE, NAIVE }) => {
  // ============ 载入 ============
  const img = new Image();
  img.src = url;
  await img.decode();
  const SW = img.naturalWidth, SH = img.naturalHeight;

  const cv = document.createElement('canvas');
  cv.width = SW; cv.height = SH;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  let srcData = cx.getImageData(0, 0, SW, SH);

  // ============ cover 裁切 ============
  // 输出是 16:9，原图往往是 3:2。按 cover 裁，中间构图不动。
  const sAsp = SW / SH, tAsp = OUT_W / OUT_H;
  let cw = SW, ch = SH, ox = 0, oy = 0;
  if (sAsp > tAsp) { cw = Math.round(SH * tAsp); ox = Math.round((SW - cw) / 2); }
  else { ch = Math.round(SW / tAsp); oy = Math.round((SH - ch) / 2); }

  // ============ 轻度降噪 ============
  // 放大前先压一次压缩块，否则块状噪声会被一起放大。
  // 只对色度做 3x3 均值，亮度保留——动了亮度就真糊了。
  function denoise(d, w, h) {
    const o = new Uint8ClampedArray(d.data);
    const at = (x, y) => ((y * w + x) << 2);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = at(x, y);
        const Y = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        let sr = 0, sg = 0, sb = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const j = at(x + dx, y + dy);
          sr += d.data[j]; sg += d.data[j + 1]; sb += d.data[j + 2];
        }
        sr /= 9; sg /= 9; sb /= 9;
        const bY = 0.299 * sr + 0.587 * sg + 0.114 * sb;
        // 把平滑后的色度接回原亮度
        const k = bY > 0.5 ? Y / bY : 1;
        o[i] = sr * k; o[i + 1] = sg * k; o[i + 2] = sb * k;
      }
    }
    return new ImageData(o, w, h);
  }

  // 裁出待处理区域
  const crop = cx.getImageData(ox, oy, cw, ch);
  const clean = (NAIVE || !G_DENOISE) ? crop : denoise(crop, cw, ch);

  // ============ Lanczos-3 放大 ============
  // 可分离核，先横后纵。比浏览器默认的双线性锐一档，
  // 且不像双三次那样在高光边缘出黑边。
  const A = 3;
  const sinc = x => x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
  const lanczos = x => (x = Math.abs(x)) >= A ? 0 : sinc(x) * sinc(x / A);

  /** 预算每个目标像素的采样权重，横纵各算一次就够 */
  function weights(srcLen, dstLen) {
    const scale = dstLen / srcLen;
    const support = scale < 1 ? A / scale : A;   // 缩小时要加宽核，防摩尔纹
    const rows = [];
    for (let d = 0; d < dstLen; d++) {
      const center = (d + 0.5) / scale - 0.5;
      const left = Math.ceil(center - support);
      const right = Math.floor(center + support);
      const idx = [], wt = [];
      let sum = 0;
      for (let s = left; s <= right; s++) {
        const w = lanczos(scale < 1 ? (s - center) * scale : s - center);
        if (w === 0) continue;
        const cl = s < 0 ? 0 : s >= srcLen ? srcLen - 1 : s;   // 边缘钳制
        idx.push(cl); wt.push(w); sum += w;
      }
      for (let i = 0; i < wt.length; i++) wt[i] /= sum;
      rows.push({ idx, wt });
    }
    return rows;
  }

  function resize(d, sw, sh, dw, dh) {
    const wx = weights(sw, dw), wy = weights(sh, dh);
    // 横向
    const mid = new Float32Array(dw * sh * 3);
    for (let y = 0; y < sh; y++) {
      const row = y * sw;
      for (let x = 0; x < dw; x++) {
        const { idx, wt } = wx[x];
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < idx.length; k++) {
          const i = (row + idx[k]) << 2, w = wt[k];
          r += d.data[i] * w; g += d.data[i + 1] * w; b += d.data[i + 2] * w;
        }
        const o = (y * dw + x) * 3;
        mid[o] = r; mid[o + 1] = g; mid[o + 2] = b;
      }
    }
    // 纵向
    const outA = new Uint8ClampedArray(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
      const { idx, wt } = wy[y];
      for (let x = 0; x < dw; x++) {
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < idx.length; k++) {
          const o = (idx[k] * dw + x) * 3, w = wt[k];
          r += mid[o] * w; g += mid[o + 1] * w; b += mid[o + 2] * w;
        }
        const o = (y * dw + x) << 2;
        outA[o] = r; outA[o + 1] = g; outA[o + 2] = b; outA[o + 3] = 255;
      }
    }
    return new ImageData(outA, dw, dh);
  }

  const oc = document.createElement('canvas');
  oc.width = OUT_W; oc.height = OUT_H;
  const octx = oc.getContext('2d', { willReadFrequently: true });

  if (NAIVE) {
    // 对照：只裁切，放大交给浏览器默认插值
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(img, ox, oy, cw, ch, 0, 0, OUT_W, OUT_H);
  } else {
    octx.putImageData(resize(clean, cw, ch, OUT_W, OUT_H), 0, 0);
  }

  // ============ 阈值锐化 ============
  // 放大后先把中频提回来。三个约束缺一不可：
  //   带阈值——小差异不动，否则平滑区的噪声全被提起来；
  //   按亮度加权——暗部几乎不锐，夜景的暗部全是噪声；
  //   限幅——不让锐化产生新的极亮/极暗像素，避免高光边缘出白边。
  if (!NAIVE && G_SHARP > 0) {
    const blurC = document.createElement('canvas');
    blurC.width = OUT_W; blurC.height = OUT_H;
    const bctx = blurC.getContext('2d', { willReadFrequently: true });
    bctx.filter = 'blur(1.6px)';
    bctx.drawImage(oc, 0, 0);
    bctx.filter = 'none';

    const a = octx.getImageData(0, 0, OUT_W, OUT_H);
    const b = bctx.getImageData(0, 0, OUT_W, OUT_H);
    const AMT = G_SHARP, TH = 3, CLAMP = 12;
    for (let i = 0; i < a.data.length; i += 4) {
      const Y = 0.299 * a.data[i] + 0.587 * a.data[i + 1] + 0.114 * a.data[i + 2];
      // 暗部权重压到很低，中亮部给足
      const wgt = Y < 28 ? 0.04 : Y < 70 ? 0.18 : Y < 200 ? 1 : 0.5;
      for (let k = 0; k < 3; k++) {
        let d = a.data[i + k] - b.data[i + k];
        if (d > -TH && d < TH) continue;
        d *= AMT * wgt;
        if (d > CLAMP) d = CLAMP; else if (d < -CLAMP) d = -CLAMP;
        a.data[i + k] += d;
      }
    }
    octx.putImageData(a, 0, 0);
  }

  // ============ 光点重建 ============
  // 夜景城市的清晰感几乎全在点光源上。从原图（放大之前）里找出亮点，
  // 在输出分辨率上重画一遍：锐利的核 + 柔和的光晕。
  // 屋顶山体那些本来就该柔和的低频保持柔和，两者分开处理。
  let lightCount = 0;
  if (!NAIVE && G_LIGHT > 0) {
    const d = clean.data;
    const lum = new Float32Array(cw * ch);
    for (let i = 0, p = 0; p < lum.length; i += 4, p++) {
      lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }

    const TH = 168;          // 亮点门槛，只要真正的灯，别把亮屋顶也算进来
    const lights = [];
    for (let y = 1; y < ch - 1; y++) {
      for (let x = 1; x < cw - 1; x++) {
        const p = y * cw + x, v = lum[p];
        if (v < TH) continue;
        // 必须是 3x3 局部极大，否则一个灯会被拆成一片点
        if (v < lum[p - 1] || v < lum[p + 1] || v < lum[p - cw] || v < lum[p + cw] ||
          v < lum[p - cw - 1] || v < lum[p - cw + 1] || v < lum[p + cw - 1] || v < lum[p + cw + 1]) continue;

        // 半高半径：往外走到亮度掉一半为止，最多 5px
        const half = v * 0.5;
        let r = 1;
        while (r < 5 && x - r > 0 && x + r < cw - 1 && y - r > 0 && y + r < ch - 1 &&
          (lum[p - r] > half || lum[p + r] > half || lum[p - cw * r] > half || lum[p + cw * r] > half)) r++;

        const i = p << 2;
        lights.push({ x: x + 0.5, y: y + 0.5, r, v, warm: d[i] > d[i + 2] + 6 });
      }
    }
    lightCount = lights.length;

    // 预烘 8 张光斑贴图（暖/冷 × 4 档半径）。逐个 createRadialGradient
    // 在几万个点上会慢到不可用，贴图 drawImage 快两个数量级。
    const sprite = (warm, R) => {
      const s = document.createElement('canvas');
      const S = Math.max(8, Math.ceil(R * 6));
      s.width = s.height = S;
      const g = s.getContext('2d');
      const c0 = warm ? [255, 226, 170] : [214, 230, 255];
      const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      grad.addColorStop(0, `rgba(${c0[0]},${c0[1]},${c0[2]},0.95)`);
      grad.addColorStop(0.12, `rgba(${c0[0]},${c0[1]},${c0[2]},0.55)`);
      grad.addColorStop(0.34, `rgba(${c0[0]},${c0[1]},${c0[2]},0.16)`);
      grad.addColorStop(1, `rgba(${c0[0]},${c0[1]},${c0[2]},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      return s;
    };
    const RB = [1, 2, 3, 5];
    const sprites = { warm: RB.map(r => sprite(true, r)), cool: RB.map(r => sprite(false, r)) };

    const kx = OUT_W / cw, ky = OUT_H / ch;
    octx.globalCompositeOperation = 'lighter';
    lights.forEach(L => {
      const bi = L.r <= 1 ? 0 : L.r <= 2 ? 1 : L.r <= 3 ? 2 : 3;
      const sp = (L.warm ? sprites.warm : sprites.cool)[bi];
      // 越亮的点画得越实；整体压着来，原图里已经有一层糊光了
      octx.globalAlpha = G_LIGHT * Math.min(0.34, 0.05 + (L.v - TH) / 255 * 0.3);
      const S = RB[bi] * 3.2 * Math.max(kx, ky);
      octx.drawImage(sp, L.x * kx - S / 2, L.y * ky - S / 2, S, S);
    });
    octx.globalAlpha = 1;
    octx.globalCompositeOperation = 'source-over';
  }

  // ============ 细颗粒 ============
  // 障眼法，但确实有效：眼睛读到「有质感」就不再追究底下软不软。
  // 幅度必须小，而且暗部和高光都要收——不然就是噪点而不是颗粒。
  if (G_GRAIN > 0) {
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const a = octx.getImageData(0, 0, OUT_W, OUT_H);
    for (let i = 0; i < a.data.length; i += 4) {
      const Y = 0.299 * a.data[i] + 0.587 * a.data[i + 1] + 0.114 * a.data[i + 2];
      const amp = (Y < 30 ? 0.45 : Y < 150 ? 2.0 : 1.1) * G_GRAIN;
      const n = (rnd() - 0.5) * 2 * amp;
      a.data[i] += n; a.data[i + 1] += n; a.data[i + 2] += n;
    }
    octx.putImageData(a, 0, 0);
  }

  // ============ 导出 ============

  const blob = await new Promise(r => oc.toBlob(r, 'image/png'));
  const buf = new Uint8Array(await blob.arrayBuffer());
  return {
    src: [SW, SH], crop: [cw, ch, ox, oy], out: [OUT_W, OUT_H],
    lights: lightCount, bytes: Array.from(buf)
  };
}, { url: dataUrl, OUT_W, OUT_H, debug, G_SHARP, G_LIGHT, G_GRAIN, G_DENOISE, NAIVE });

await browser.close();

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(result.bytes));

console.log(`原图    ${result.src[0]}×${result.src[1]}`);
console.log(`裁切    ${result.crop[0]}×${result.crop[1]}  偏移 ${result.crop[2]},${result.crop[3]}`);
console.log(`输出    ${result.out[0]}×${result.out[1]}  →  ${out}`);
console.log(`放大倍率 ${(result.out[0] / result.crop[0]).toFixed(2)}×`);
console.log(`重建光点 ${result.lights} 个`);
