import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const port = 5213;
/* optimizeDeps.entries 必须钉死。默认的依赖扫描会去啃项目里所有 HTML，包括
   scripts/lib/real-tavern-sources.mjs 拷进 artifacts/ 的那份真实 SillyTavern index.html ——
   它 import 的是 ST 安装目录里的相对路径，这里当然解析不到，于是扫描整段报错、进程带着
   非零码退出，尽管断言本身全过了。 */
const server = await createServer({
  server: { port },
  logLevel: 'warn',
  optimizeDeps: { entries: ['index.html'] },
});
await server.listen();
/* 产物在某次整理里挪进了 V20260826/，这支脚本的路径没跟着改，于是一直 ENOENT。 */
let source = await readFile('\u5916\u90e8\u90e8\u7f72/V20260826/\u72b6\u6001\u680f.html', 'utf8');
source = source.replace(/^\uFEFF?```(?:text|html)?\s*\r?\n/i, '').replace(/\r?\n```\s*$/i, '');
source = source.replace(/const\s+HUD_URL\s*=\s*(['"])[\s\S]*?\1\s*;/,
  `const HUD_URL='http://127.0.0.1:${port}/';`);
const srcdoc = `<!doctype html><html><body>${source}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, body: '' }));
await page.setContent(`<!doctype html><style>
html,body{margin:0}.mes{width:680px;margin:20px auto}.mes>iframe{width:100%;height:150px;border:0}
</style><div id="chat"></div><script>
window.__stat={};
__stat['\\u4e16\\u754c\\u4fe1\\u606f']={'\\u5e74\\u5386':'x'};
__stat['\\u73a9\\u5bb6\\u4fe1\\u606f']={};
__stat['\\u5bf9\\u8c61\\u4fe1\\u606f']={};
__stat['\\u7cfb\\u7edf\\u914d\\u7f6e']={};
window.Mvu={events:{VARIABLE_UPDATE_ENDED:'variable_update_ended'},getMvuData(){return{stat_data:__stat}},replaceMvuData(d){__stat=d.stat_data;return true}};
window.__hooks={};
window.eventSource={on(n,f){(__hooks[n]??=[]).push(f)}};
window.eventOn=(n,f)=>(__hooks[n]??=[]).push(f);
<\/script>`);

async function addFloor(id) {
  await page.evaluate(({ id, srcdoc }) => {
    const row = document.createElement('div');
    row.className = 'mes';
    row.dataset.floor = id;
    row.innerHTML = '<iframe></iframe>';
    document.getElementById('chat').append(row);
    row.firstElementChild.srcdoc = srcdoc;
  }, { id, srcdoc });
}

await addFloor('A');
await page.waitForFunction(() => window.__linjiangHudManagerV2?.owner && document.getElementById('linjiang-hud-live'));
const firstOwner = await page.evaluate(() => window.__linjiangHudManagerV2.owner.id);
await addFloor('B');
await page.waitForFunction((old) => window.__linjiangHudManagerV2?.owner?.id !== old, firstOwner);
const secondOwner = await page.evaluate(() => window.__linjiangHudManagerV2.owner.id);

const subscriptions = await page.evaluate(() => Object.fromEntries(
  Object.entries(window.__hooks).map(([name, rows]) => [name, rows.length])));
if (Object.values(subscriptions).some((count) => count !== 1)) {
  throw new Error(`duplicate subscriptions: ${JSON.stringify(subscriptions)}`);
}
if (await page.locator('#linjiang-hud-live').count() !== 1) throw new Error('live HUD is not singleton');

await page.click('#linjiang-hud-fs');
await page.waitForTimeout(100);
if (await page.evaluate(() => window.__linjiangHudManagerV2.owner.id) !== secondOwner) {
  throw new Error('shared chrome returned ownership to the old floor');
}

await page.evaluate((origin) => {
  const hud = document.getElementById('linjiang-hud-live');
  dispatchEvent(new MessageEvent('message', {
    origin,
    source: hud.contentWindow,
    data: {
      channel: 'linjiang-hud', kind: 'request', id: 77,
      context: window.__linjiangHudManagerV2.context(), action: 'arcadeEvent',
      payload: { event: { game: 'slots', type: 'audit:settled', detail: { payout: 1, multiplier: 1 } } },
    },
  }));
}, `http://127.0.0.1:${port}`);
await page.waitForTimeout(100);
const spins = await page.evaluate(() => window.__stat['\u7cfb\u7edf\u914d\u7f6e']
  ?.['\u8857\u673a']?.['\u7edf\u8ba1']?.['\u5e78\u8fd0\u673a']?.['\u65cb\u8f6c\u6b21\u6570']);
if (spins !== 1) throw new Error(`one RPC was applied ${spins} times`);

await page.evaluate(() => document.querySelector('[data-floor="A"]')?.remove());
await page.waitForTimeout(150);
if (await page.locator('#linjiang-hud-live').count() !== 1) throw new Error('removing old floor removed current HUD');
if (await page.evaluate(() => window.__linjiangHudManagerV2.owner.id) !== secondOwner) {
  throw new Error('removing old floor changed owner');
}

console.log('double-status singleton, subscriptions, RPC and teardown: ok');
await browser.close();
await server.close();
