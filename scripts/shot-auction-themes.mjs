/* 鉴宝竞拍 · 四主题 × 各面板 视觉巡检
 * ---------------------------------------------------------------
 * 只看暗色主题的三张图就交付是不够的：这个页面要跟着街机切四套主题，
 * 还要嵌在大厅的 iframe 里。这个脚本把每套主题的每个面板都拍下来，
 * 外加大厅内嵌视图，方便逐张对着看。
 *
 *   node scripts/shot-auction-themes.mjs                全部
 *   node scripts/shot-auction-themes.mjs --theme warm-white
 *   node scripts/shot-auction-themes.mjs --only setup,bidding
 * --------------------------------------------------------------- */
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'auction-themes');
const argv = process.argv.slice(2);
const argVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const THEMES = argVal('--theme') ? [argVal('--theme')] : ['dark', 'warm-white', 'green', 'classic-dark'];
const ONLY = argVal('--only') ? argVal('--only').split(',') : null;
const want = (name) => !ONLY || ONLY.includes(name);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  const file = join(ROOT, normalize(url).replace(/^([/\\])+/, ''));
  try {
    if (!statSync(file).isFile()) throw 0;
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch (_) { res.writeHead(404).end(''); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
/* 截图前先回到顶部：点开场按钮会把页面滚下去，不复位的话窄屏拍到的是
   半截画面，看起来像布局坏了。 */
const shot = async (page, name) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(60);
  await page.screenshot({ path: join(OUT, name + '.png') });
};

async function seed(page, theme, balance) {
  await page.addInitScript(([t, b]) => {
    localStorage.setItem('kivotos-theme', t);
    localStorage.setItem('airp_arcade_wallet_v1', JSON.stringify({ balance: b, updatedAt: Date.now() }));
    localStorage.removeItem('airp_auction_state_v1');
  }, [theme, balance]);
}

/* 走到指定阶段。返回 false 表示没走到（记为问题）。 */
async function advance(page, stage) {
  for (let i = 0; i < 90; i++) {
    if (stage === 'result' && !(await page.locator('#resultVeil[hidden]').count())) {
      await page.click('#btnSkipAnim').catch(() => {});
      await page.waitForTimeout(420);
      return true;
    }
    if (stage === 'summary' && !(await page.locator('#summaryVeil[hidden]').count())) return true;
    if (stage === 'keypad' && !(await page.locator('#padVeil[hidden]').count())) return true;

    if (!(await page.locator('#resultVeil[hidden]').count())) {
      await page.click('#btnSkipAnim').catch(() => {});
      await page.waitForTimeout(200);
      await page.click('#btnNext').catch(() => {});
      await page.waitForTimeout(140);
      continue;
    }
    if (!(await page.locator('#padVeil[hidden]').count())) {
      if (await page.locator('#padOk[disabled]').count()) {
        await page.click('#padCancel').catch(() => {});
        await page.click('#btnPass').catch(() => {});
      } else await page.click('#padOk').catch(() => {});
      await page.waitForTimeout(90);
      continue;
    }
    if (!(await page.locator('#btnBid[disabled]').count())) await page.click('#btnBid').catch(() => {});
    else await page.waitForTimeout(160);
    await page.waitForTimeout(80);
  }
  return false;
}

const problems = [];
async function overflowCheck(page, label) {
  const o = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o > 2) problems.push(`${label}: 横向溢出 ${o}px`);
}

for (const theme of THEMES) {
  /* w = 宽屏。「没占满画布」这类问题只有在大视口下才看得出来，
     1280 已经不够代表实际使用了。 */
  for (const [vpName, vp] of [['w', { width: 1760, height: 1000 }],
    ['d', { width: 1280, height: 860 }], ['p', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await seed(page, theme, 4000);
    await page.goto(`${base}/arcade/auction.html?nolimit=1`, { waitUntil: 'load' });

    if (want('setup')) { await shot(page, `${theme}-${vpName}-setup`); await overflowCheck(page, `${theme}/${vpName}/setup`); }
    await page.click('#btnStart');
    await page.waitForTimeout(220);
    if (want('bidding')) { await shot(page, `${theme}-${vpName}-bidding`); await overflowCheck(page, `${theme}/${vpName}/bidding`); }
    if (want('keypad')) {
      await page.click('#btnBid').catch(() => {});
      await page.waitForTimeout(160);
      await shot(page, `${theme}-${vpName}-keypad`);
      await page.click('#padCancel').catch(() => {});
    }
    if (want('result')) {
      if (!(await advance(page, 'result'))) problems.push(`${theme}/${vpName}: 走不到开箱`);
      else await shot(page, `${theme}-${vpName}-result`);
    }
    if (want('summary')) {
      if (!(await advance(page, 'summary'))) problems.push(`${theme}/${vpName}: 走不到总账`);
      else await shot(page, `${theme}-${vpName}-summary`);
    }
    for (const e of errors) problems.push(`${theme}/${vpName}: console ${e}`);
    console.log(`${theme.padEnd(13)} ${vpName}  报错 ${errors.length}`);
    await page.close();
  }
}

/* 大厅内嵌：真实使用形态。iframe 高度由内容决定，最容易露出留白问题。 */
if (want('lobby')) {
  for (const theme of THEMES) {
    for (const [vpName, vp] of [['w', { width: 1760, height: 1000 }],
      ['d', { width: 1280, height: 860 }], ['p', { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport: vp });
      await seed(page, theme, 4000);
      await page.goto(`${base}/arcade/index.html#auction`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await shot(page, `${theme}-${vpName}-lobby`);
      const gap = await page.evaluate(() => {
        const f = document.getElementById('frame');
        const doc = f.contentDocument;
        if (!doc) return null;
        return {
          frameH: Math.round(f.getBoundingClientRect().height),
          contentH: Math.round(doc.documentElement.scrollHeight),
          bodyH: Math.round(doc.body.scrollHeight),
        };
      });
      if (gap) console.log(`lobby ${theme.padEnd(13)} ${vpName}  iframe ${gap.frameH} / 内容 ${gap.contentH}`);
      /* 根元素一旦声明 color-scheme:dark，浏览器会用暗色画 canvas 底色，
         iframe 就不再透明，浅色大厅上会出现一整块黑区。守住这个根因。 */
      const scheme = await page.evaluate(() => {
        const doc = document.getElementById('frame').contentDocument;
        if (!doc) return null;
        return {
          root: getComputedStyle(doc.documentElement).colorScheme,
          body: getComputedStyle(doc.body).colorScheme,
        };
      });
      if (scheme && /dark/.test(scheme.root) && theme !== 'dark' && theme !== 'classic-dark') {
        problems.push(`lobby ${theme}/${vpName}: 根元素 color-scheme=${scheme.root}，浅色主题下 iframe 会被填成暗色`);
      }
      await page.close();
    }
  }
}

await browser.close();
server.close();
console.log('\n图在 artifacts/auction-themes/');
if (problems.length) { console.log('问题：'); for (const p of problems) console.log(' ·', p); process.exit(1); }
