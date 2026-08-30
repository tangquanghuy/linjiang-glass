/* 鉴宝竞拍页面冒烟检查
 * ---------------------------------------------------------------
 * 用本地 http 起服务（file:// 下 iframe 与相对路径行为不一致），
 * 跑一遍完整流程：选技能 → 入场 → 逐回合加价 → 落槌开箱 → 下一箱 → 总账。
 * 同时在三个宽度截图，并收集 console 错误。
 *
 *   node scripts/check-auction.mjs
 *   node scripts/check-auction.mjs --shots
 * --------------------------------------------------------------- */
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'auction');
const SHOTS = process.argv.includes('--shots');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  const file = join(ROOT, normalize(url).replace(/^([/\\])+/, ''));
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch (_) { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const browser = await chromium.launch();

async function runFlow(label, size) {
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${base}/arcade/auction.html?nolimit=1`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('airp_arcade_wallet_v1',
    JSON.stringify({ balance: 40000, updatedAt: Date.now() })));
  await page.reload({ waitUntil: 'load' });

  /* 面板之间有动画，元素随时可能刚好被藏起来。点不到就当这一轮没点，
     交给外层循环重新判断状态，不要把竞态当成失败。 */
  const tap = async (sel) => {
    try { await page.click(sel, { timeout: 1200 }); return true; }
    catch (_) { return false; }
  };

  // 装备选择面板必须在
  const cards = await page.locator('.kitcard').count();
  if (cards !== 10) problems.push(`${label}: 装备卡 ${cards} 张，应为 10`);
  if (SHOTS) { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: join(OUT, `${label}-setup.png`), fullPage: true }); }

  await page.click('#btnRandom');
  await page.click('#btnStart');
  await page.waitForSelector('#setupVeil[hidden]', { state: 'attached' });

  const seenPhases = new Set();
  let lots = 0, keypadUsed = 0;
  for (let guard = 0; guard < 300; guard++) {
    if (!(await page.locator('#summaryVeil[hidden]').count())) break;      // 总账出来了
    if (!(await page.locator('#resultVeil[hidden]').count())) {
      seenPhases.add('result');
      await tap('#btnSkipAnim');
      await page.waitForFunction(() => document.getElementById('rQuip').textContent.trim().length > 0,
        null, { timeout: 15000 });
      /* 开箱格子有 .26s 的入场动画。不等它跑完就截图，拍到的是 opacity 0
         的一箱空格子 —— 上一版就这样误以为是渲染 bug。 */
      await page.waitForTimeout(360);
      const shown = await page.locator('#resultVault .it').count();
      if (!shown) problems.push(`${label}: 开箱面板没有画出任何藏品`);
      if (SHOTS && lots === 0) await page.screenshot({ path: join(OUT, `${label}-result.png`), fullPage: true });
      lots++;
      await tap('#btnNext');
      await page.waitForTimeout(140);
      continue;
    }
    if (!(await page.locator('#padVeil[hidden]').count())) {
      // 键盘开着：预填值合法时直接确认，否则退回改价
      seenPhases.add('keypad');
      if (SHOTS && keypadUsed === 0) await page.screenshot({ path: join(OUT, `${label}-keypad.png`), fullPage: true });
      keypadUsed++;
      if (await page.locator('#padOk[disabled]').count()) {
        /* 预填价已经不合法（资金到顶了）：退回去改价，然后放弃本箱 */
        await tap('#padCancel');
        await tap('#btnPass');
      } else await tap('#padOk');
      await page.waitForTimeout(90);
      continue;
    }
    const first = !seenPhases.has('bidding');
    seenPhases.add('bidding');
    /* 第一次进竞价就拍，别绑 guard 序号：点了出价键就切到键盘分支了，
       绑序号会永远错过这一帧（上一版就是这样留下了一张过期的旧图）。 */
    if (SHOTS && first) {
      await page.screenshot({ path: join(OUT, `${label}-bidding.png`), fullPage: true });
    }
    if (SHOTS && lots === 1 && !seenPhases.has('mid')) {
      seenPhases.add('mid');
      await page.screenshot({ path: join(OUT, `${label}-round.png`), fullPage: true });
    }
    const bidOff = await page.locator('#btnBid[disabled]').count();
    const passOff = await page.locator('#btnPass[disabled]').count();
    /* 落槌到开箱之间有一段动画空窗，两个按钮都禁用。别去点，等面板。 */
    if (bidOff && passOff) { await page.waitForTimeout(180); continue; }
    await tap(bidOff ? '#btnPass' : '#btnBid');
    await page.waitForTimeout(70);
  }

  if (!seenPhases.has('bidding')) problems.push(`${label}: 没有进入竞价阶段`);
  if (!seenPhases.has('keypad')) problems.push(`${label}: 出价键盘没被用到`);
  if (!seenPhases.has('result')) problems.push(`${label}: 没有走到开箱结算`);
  if (lots < 3) problems.push(`${label}: 只走完 ${lots} 箱，应为 3`);

  const summaryRows = await page.locator('#ledgerBody tr').count();
  if (summaryRows !== 3) problems.push(`${label}: 总账 ${summaryRows} 行，应为 3`);
  if (SHOTS) await page.screenshot({ path: join(OUT, `${label}-summary.png`), fullPage: true });

  // 横向溢出检查
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) problems.push(`${label}: 横向溢出 ${overflow}px`);

  for (const e of errors) problems.push(`${label}: console ${e}`);
  console.log(`${label.padEnd(10)} 箱数 ${lots}  键盘 ${keypadUsed} 次  总账 ${summaryRows} 行  溢出 ${overflow}px  报错 ${errors.length}`);
  await page.close();
}

await runFlow('w1760', { width: 1760, height: 1000 });
await runFlow('d1280', { width: 1280, height: 900 });
await runFlow('t768', { width: 768, height: 1024 });
await runFlow('p360', { width: 360, height: 780 });

// 大厅是否认得第五个标签
const lobby = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await lobby.goto(`${base}/arcade/index.html#auction`, { waitUntil: 'load' });
await lobby.waitForTimeout(1200);
const tabCount = await lobby.locator('#tabs .tab').count();
if (tabCount !== 5) problems.push(`大厅标签 ${tabCount} 个，应为 5`);
const cols = await lobby.evaluate(() =>
  getComputedStyle(document.getElementById('tabs')).gridTemplateColumns.split(' ').length);
if (cols !== 5) problems.push(`大厅标签栏 ${cols} 列，应为 5`);
const frameSrc = await lobby.locator('#frame').getAttribute('src');
if (frameSrc !== 'auction.html') problems.push(`大厅路由到 ${frameSrc}，应为 auction.html`);
console.log(`大厅       标签 ${tabCount} 个  ${cols} 列  当前 ${frameSrc}`);
if (SHOTS) { mkdirSync(OUT, { recursive: true }); await lobby.screenshot({ path: join(OUT, 'lobby.png') }); }

await browser.close();
server.close();

if (problems.length) {
  console.log('\n发现问题：');
  for (const p of problems) console.log(' ·', p);
  process.exit(1);
}
console.log('\n全部通过');
