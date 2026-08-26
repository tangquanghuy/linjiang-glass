import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { join } from 'node:path';
import { PROJECT_ROOT } from './lib/real-tavern-sources.mjs';
import { startFixtureServer } from './lib/fixture-server.mjs';

const server = await startFixtureServer({ port: 5254 });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(`${server.url}/__reading-room-host`, { waitUntil: 'domcontentloaded' });
errors.length = 0;

await page.setContent(`<!doctype html><html><body>
<textarea id="send_textarea"></textarea><button id="send_but">send</button><iframe id="reading" style="width:1000px;height:760px;border:0"></iframe>
<script>
window.__sent=[];window.__roomCalls=[];window.__replaceCalls=0;
const store={stat_data:{
  ['\u73a9\u5bb6\u4fe1\u606f']:{['\u91d1\u94b1']:20000,['\u7c89\u4e1d\u8eab\u4efd']:{['\u5854\u83f2']:{['\u5173\u6ce8']:false,['\u7d2f\u8ba1\u6253\u8d4f']:0,['\u724c\u5b50\u7b49\u7ea7']:0,['\u724c\u5b50\u6863\u4f4d']:'',['\u724c\u5b50\u5269\u4f59\u5929\u6570']:0}}},
  ['\u5bf9\u8c61\u4fe1\u606f']:{['\u5854\u83f2']:{['\u76f4\u64ad']:{['\u5f00\u64ad']:true,['\u6807\u9898']:'evening',['\u70ed\u5ea6']:18200,['\u7c89\u4e1d\u6570']:550000}}},
  ['\u7cfb\u7edf\u914d\u7f6e']:{['\u76f4\u64ad\u95f4']:{['\u5854\u83f2']:{['\u6863\u671f']:'20:00-23:30',['\u724c\u5b50\u540d']:'badge',['\u5e95\u76d8\u70ed\u5ea6']:18200,['\u672c\u573a\u70ed\u5ea6']:0,['\u9ad8\u80fd\u699c']:[],['\u5927\u822a\u6d77']:{['\u8230\u957f']:0,['\u63d0\u7763']:0,['\u603b\u7763']:0,['\u540d\u5355']:[]}}}}
}};
window.Mvu={getMvuData:()=>store,replaceMvuData:()=>{window.__replaceCalls++}};
window.LinjiangAux={
 roomMenu:()=>({
   ['\u793c\u7269']:[{name:'\u8fa3\u6761',price:1,pop:8}],
   ['\u5927\u822a\u6d77']:[{name:'\u8230\u957f',price:138,days:30}],
   ['\u6570\u91cf\u6863\u4f4d']:[1,10],['\u9192\u76ee\u7559\u8a00\u6863\u4f4d']:[30,50],['\u8d44\u6e90\u57df\u540d']:'https://anchor.bolt.qzz.io'
 }),
 roomAction:(payload)=>{window.__roomCalls.push(payload);return{ok:true,['\u5feb\u7167']:{['\u91d1\u94b1']:123}}}
};
document.getElementById('send_but').onclick=()=>window.__sent.push(document.getElementById('send_textarea').value);
</script></body></html>`);

const sourcePath = join(PROJECT_ROOT, '\u5916\u90e8\u90e8\u7f72', 'V20260826', '\u6b63\u6587\u7f8e\u5316-\u5916\u94fe\u7d20\u6750\u7248.html');
let source = readFileSync(sourcePath, 'utf8')
  .replace(/^\uFEFF?```(?:text|html)?\s*\r?\n/i, '')
  .replace(/\r?\n```\s*$/i, '')
  .replace(/href="https:\/\/[^\"]*\/reading\//g, `href="${server.url}/reading/`);
const liveRoom = `&lt;LiveRoom&gt;\n\u4e3b\u64ad: \u5854\u83f2\n\u4e3b\u64ad\u8bf4: hello\n\u5f39\u5e55:\n- \u7c7b\u578b: \u666e\u901a \u540d\u5b57: viewer \u5185\u5bb9: hello\n&lt;/LiveRoom&gt;`;
source = source.replace('$1', () => liveRoom);
await page.locator('#reading').evaluate((frame, html) => { frame.srcdoc = html; }, source);
const reading = page.frameLocator('#reading');
try {
  await reading.locator('.liveroom[data-lr]').waitFor({ timeout: 15000 });
} catch (error) {
  console.log('frame errors', errors);
  console.log('frame body', (await reading.locator('body').innerText().catch(() => '')).slice(0, 1000));
  throw error;
}

const confirm = async () => {
  await reading.locator('[data-lr="dlg"] [data-ok]').click();
  await page.waitForTimeout(120);
};
await reading.locator('[data-kind="gift"]').first().click();
await confirm();
await reading.locator('[data-kind="guard"]').first().click();
await confirm();
await reading.locator('[data-lr-act="sc"]').click();
await reading.locator('[data-sc-text]').fill('Test SC');
await confirm();

const result = await page.evaluate(() => ({ sent: window.__sent.slice(), roomCalls: window.__roomCalls.slice(), replaceCalls: window.__replaceCalls }));
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(label);
};
check(result.sent.length === 3, 'gift, guard and SC each send one Tavern message', JSON.stringify(result.sent));
check(result.sent.some((line) => line.includes('\u9001\u51fa1\u4e2a\u8fa3\u6761')), 'gift message shape is preserved');
check(result.sent.some((line) => line.includes('\u5f00\u901a\u5854\u83f2\u7684\u8230\u957f')), 'guard message shape is preserved');
check(result.sent.some((line) => line.includes('SC\uff1aTest SC')), 'SC message shape is preserved');
check(result.roomCalls.length === 0, 'consumption UI never calls LinjiangAux.roomAction', JSON.stringify(result.roomCalls));
check(result.replaceCalls === 0, 'consumption UI never writes MVU directly', String(result.replaceCalls));
check(errors.length === 0, 'no script errors', errors.slice(0, 3).join(' | '));

await browser.close();
await server.close();
if (failures.length) process.exit(1);
console.log('reading live-room send-only checks passed');
