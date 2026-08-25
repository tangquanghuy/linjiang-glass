/* 街机素材完整性： npm run arcade:assets
   ==========================================

   守的是一种**静默失败**：fishing 和 slots 的素材原本是 base64 内联在 HTML 里的
   （fishing.html 2753KB 里 2678KB 是 21 个 data URI，slots.html 929KB 里 867KB），
   走 GitHub Pages 在国内约 90s/MB —— 2.7MB 就是四分钟量级，症状是大厅一直停在
   「正在载入…」。现在抽成了 arcade/assets/games/ 下的独立文件，构建期再指向 jsDelivr。

   抽出来之后多了一个新的坏法：素材 404。而这两个页面都写了兜底 ——
     fishing: 每个绘制点判 complete && naturalWidth，取不到就画渐变 / drawBasicFish
     slots:   <img onerror> 切到 symbol-placeholder
   兜底本身是对的，但它会让「素材全丢了」看起来像「游戏正常运行」，没有报错、没有 404 红字，
   只是画面变成了占位图。check-arcade-mobile.mjs 那支也照样全绿（它量的是布局溢出）。

   所以这里直接断言：精灵图能解码、画布上不是兜底纯色、没有 4xx。 */

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { startFixtureServer } from './lib/fixture-server.mjs';

const FISHING_SPRITES = ['background', 'clown', 'jelly', 'puffer', 'turtle', 'shark',
  'whale', 'barrel', 'cannon_base', 'bullet', 'coin'];

let bad = 0;
const ok = (pass, label, detail = '') => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!pass) bad += 1;
};

/* 先做不需要浏览器的静态断言。 */
console.log('=== 源文件不该再有内联 base64 ===');
for (const [file, limitKb] of [['arcade/fishing.html', 200], ['arcade/slots.html', 200]]) {
  const text = readFileSync(file, 'utf8');
  const kb = Math.round(Buffer.byteLength(text) / 1024);
  const inlined = [...text.matchAll(/data:[a-z/+.-]+;base64,/g)].length;
  ok(inlined === 0 && kb <= limitKb, `${file} ${kb}KB / ${inlined} 个 data URI（上限 ${limitKb}KB）`);
}
for (const rel of ['games/fishing-background.webp', 'games/slots-cherry.webp']) {
  ok(existsSync('arcade/assets/' + rel), `arcade/assets/${rel} 在`);
}

const server = await startFixtureServer({ port: 5246 });
const browser = await chromium.launch();

async function openGame(path) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  const failed = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(server.url, '')}`); });
  await page.goto(`${server.url}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  /* 外部 BGM（suno.ai）离线取不到，是已知且无害的。 */
  return { page, errors: errors.filter((e) => !/favicon|suno\.ai|cdn1/i.test(e)), failed };
}

console.log('\n=== arcade/fishing.html ===');
{
  const { page, errors, failed } = await openGame('/arcade/fishing.html');
  const got = await page.evaluate(async (names) => {
    const out = {};
    await Promise.all(names.map((n) => new Promise((res) => {
      const im = new Image();
      im.onload = () => { out[n] = `${im.naturalWidth}x${im.naturalHeight}`; res(); };
      im.onerror = () => { out[n] = 'FAIL'; res(); };
      im.src = `assets/games/fishing-${n}.webp`;
    })));
    return out;
  }, FISHING_SPRITES);
  const broken = Object.entries(got).filter(([, v]) => v === 'FAIL').map(([k]) => k);
  ok(broken.length === 0, `${FISHING_SPRITES.length} 张精灵图全部可解码`,
    broken.length ? '坏的: ' + broken.join(',') : `background=${got.background}`);

  /* 兜底渐变只有很少的颜色；真素材画上去会有上千种。 */
  const painted = await page.evaluate(() => {
    const c = document.getElementById('gameCanvas');
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, Math.min(c.width, 200), Math.min(c.height, 200)).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 37) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return { colors: seen.size, w: c.width, h: c.height };
  });
  ok(!!painted && painted.colors > 50,
    '画布画的是真素材，不是兜底纯色/渐变（颜色种类 > 50）', JSON.stringify(painted));
  ok(failed.length === 0, '没有 4xx/5xx', failed.slice(0, 5).join(' | '));
  ok(errors.length === 0, '没有脚本错误', errors.slice(0, 3).join(' | '));
  await page.close();
}

console.log('\n=== arcade/slots.html ===');
{
  const { page, errors, failed } = await openGame('/arcade/slots.html');
  const imgs = await page.evaluate(() => {
    const list = [...document.querySelectorAll('img')];
    return {
      total: list.length,
      broken: list.filter((i) => i.hidden || !i.naturalWidth).map((i) => (i.getAttribute('src') || '').slice(-36)),
      sample: list.slice(0, 2).map((i) => `${(i.getAttribute('src') || '').split('/').pop()}=${i.naturalWidth}x${i.naturalHeight}`).join(' '),
    };
  });
  ok(imgs.total > 0, '页面里有符号 <img>', `${imgs.total} 个`);
  ok(imgs.broken.length === 0, '没有被 onerror 隐藏的符号图（那会静默退化成占位块）',
    imgs.broken.slice(0, 4).join(' | ') || imgs.sample);
  ok(failed.length === 0, '没有 4xx/5xx', failed.slice(0, 5).join(' | '));
  ok(errors.length === 0, '没有脚本错误', errors.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
await server.close();

console.log(bad ? `\n>>> ${bad} 项失败` : '\n>>> 全部通过');
process.exit(bad ? 1 : 0);
