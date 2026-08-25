/**
 * 开局页截图：五个步骤各一张，第二步额外截"已选住所 + 已选工作"，
 * 第三步截"推满三个"的状态，第四步截自定义主播打开后的热度读数。
 * 地图是 iframe，等它把节点铺完再拍，不然拍到的是空底板。
 * 最后把 openingPayload() 打出来，用来核对写回 MVU 的形状。
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = 'artifacts/opening';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto(`${BASE}/opening.html`, { waitUntil: 'load' });
await page.fill('#player-name', '林舟');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/step1.png` });

await page.click('#next');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/step2-home.png` });

// 选住所 → 自动切到工作层 → 选一个岗位，看路线和通勤卡
const frame = page.frameLocator('#opening-map-iframe');
await frame.locator('[data-k="N:gl_yunting"]').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/step2-work.png` });
await frame.locator('[data-k="N:mh_hospital"]').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/step2-route.png` });

// 03 我推的主播：先拍空的，再推三个，再验证第四个会被拦住
await page.click('#next');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/step3-oshi-empty.png`, fullPage: true });
for (const name of ['塔菲', '红蔷薇', '斯黛拉']) {
  await page.click(`[data-oshi="${name}"]`);
  await page.waitForTimeout(180);
}
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/step3-oshi.png`, fullPage: true });
await page.click('[data-oshi="璃亚梦"]');
await page.waitForTimeout(400);
console.log('第四个是否被拦住:', await page.textContent('#oshi-count'), '/ toast:', await page.textContent('#toast'));

// 04 自定义主播：默认跳过，先拍跳过态，再打开
await page.click('#next');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/step4-skipped.png` });
console.log('跳过时下一步落在:', await page.evaluate(() => {
  document.querySelector('#next').click();
  return document.querySelector('.step-tab.active b').textContent;
}));
await page.waitForTimeout(500);
await page.click('.step-tab[data-step="4"]');
await page.waitForTimeout(400);
await page.fill('#streamer-name', '沈遥');
await page.fill('#streamer-handle', '遥夜');
await page.fill('#streamer-medal', '遥夜众');
await page.fill('#streamer-tier', '64');
await page.dispatchEvent('#streamer-tier', 'input');
await page.click('[data-streamer-theme="violet"]');
await page.evaluate(() => {
  const yaml = document.querySelector('#profile-yaml');
  yaml.value = '---\n角色详情:\n  沈遥:\n    age: 23岁';
  yaml.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.click('#save-custom');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/step4-custom.png`, fullPage: true });
console.log('体量读数:', await page.evaluate(() => ['tier-value', 'tier-label', 'tier-followers', 'tier-base', 'tier-guards']
  .map(id => id + '=' + document.getElementById(id).textContent).join('  ')));

// 05 确认
await page.click('#next');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/step5-confirm.png`, fullPage: true });

// 体量曲线抽样。七个已定稿主播的档位也一起打出来，用来核对反解有没有漂
console.log('\n体量曲线（页面这一份）:');
const fromPage = await page.evaluate(() => {
  const el = document.querySelector('#streamer-tier');
  const rows = [];
  for (const t of [0, 20, 38, 42, 48, 51, 53, 58, 64, 71, 80, 100]) {
    el.value = t;
    el.dispatchEvent(new Event('input'));
    rows.push({
      档位: t,
      档位名: document.getElementById('tier-label').textContent,
      粉丝数: document.getElementById('tier-followers').textContent,
      底盘热度: document.getElementById('tier-base').textContent,
      大航海: document.getElementById('tier-guards').textContent,
    });
  }
  el.value = 64; el.dispatchEvent(new Event('input'));
  return rows;
});
for (const r of fromPage) {
  console.log(`  档位 ${String(r.档位).padStart(3)}  ${r.档位名.padEnd(5)}  粉丝 ${r.粉丝数.padEnd(8)}  底盘热度 ${r.底盘热度.padEnd(8)}  大航海 ${r.大航海}`);
}

/* 曲线在两处各有一份实现：开局页托管在 GitHub Pages、跨域拿不到酒馆的辅助脚本，
   所以只能镜像。这里把 辅助计算脚本.js 里的 streamScale 抠出来跑一遍，逐档比对，
   漂了就直接失败——不然两边悄悄分叉，谁也不会发现。 */
/* 读逻辑那份：streamScale 在 public/shell/aux-shell.js 里。粘贴的 外部部署/V20260826/辅助计算脚本.js
   拆分后只剩礼物表和占位 api，抠不出这个函数。见 scripts/build-aux-shell.mjs。 */
const auxSrc = readFileSync('public/shell/aux-shell.js', 'utf8');
const cutFn = (name) => {
  const at = auxSrc.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('辅助计算脚本.js 里找不到 ' + name);
  let depth = 0;
  for (let j = auxSrc.indexOf('{', at); j < auxSrc.length; j++) {
    if (auxSrc[j] === '{') depth++;
    else if (auxSrc[j] === '}' && !--depth) return auxSrc.slice(at, j + 1);
  }
  throw new Error(name + ' 括号没配平');
};
const tierTable = auxSrc.slice(auxSrc.indexOf('const TIER_LABELS'), auxSrc.indexOf('function roundNice'));
const aux = new Function(
  tierTable + cutFn('roundNice') + cutFn('tierLabel') + cutFn('streamScale') + cutFn('tierOfFollowers')
  + '\nreturn { streamScale, tierOfFollowers };',
)();

let drift = 0;
for (let t = 0; t <= 100; t++) {
  const a = aux.streamScale(t);
  const b = await page.evaluate((x) => {
    const el = document.querySelector('#streamer-tier');
    el.value = x; el.dispatchEvent(new Event('input'));
    return {
      档位名: document.getElementById('tier-label').textContent,
      粉丝数: document.getElementById('tier-followers').textContent,
    };
  }, t);
  const shown = (n) => (n >= 10000 ? (Math.round(n / 1000) / 10).toFixed(1).replace(/\.0$/, '') + '万' : n.toLocaleString('en-US'));
  if (a.档位名 !== b.档位名 || shown(a.粉丝数) !== b.粉丝数) {
    console.log(`  ✗ 档位 ${t} 两处不一致: 脚本 ${a.档位名}/${shown(a.粉丝数)} vs 页面 ${b.档位名}/${b.粉丝数}`);
    drift++;
  }
}
console.log(drift ? `\n两处曲线有 ${drift} 档不一致` : '\n两处曲线逐档一致（0–100 全比过）');
/* 扫完把滑杆放回 64，否则 dump 出来的 payload 是 100 档的。
   此时人已经在第 05 步，滑杆所在的第 04 面板是隐藏的，用 fill 会等可见性等到超时，
   所以走 evaluate 直接改值再派事件。 */
await page.evaluate(() => {
  const el = document.querySelector('#streamer-tier');
  el.value = 64;
  el.dispatchEvent(new Event('input'));
});
await page.waitForTimeout(200);

// 七位已定稿主播：底盘热度 → 档位的反解
console.log('\n已定稿主播的档位反解（底盘热度取自 正文美化.html 的 LR_HOSTS.pop）:');
for (const [name, pop] of [['时雨羽衣', 1200], ['红蔷薇', 2800], ['斯黛拉', 3100], ['沙花叉', 3600], ['东雪莲', 4200], ['璃亚梦', 6310], ['塔菲', 18240]]) {
  // 先按热度找档位，再看这个档位推出来的粉丝数
  let best = 0, gap = Infinity;
  for (let t = 0; t <= 100; t++) {
    const d = Math.abs(aux.streamScale(t).底盘热度 - pop);
    if (d < gap) { gap = d; best = t; }
  }
  const s = aux.streamScale(best);
  console.log(`  ${name.padEnd(5)} 热度 ${String(pop).padStart(6)} → 档位 ${String(best).padStart(3)} ${s.档位名.padEnd(5)} 粉丝 ${String(s.粉丝数).padStart(8)} 舰长 ${String(s.舰长数).padStart(6)} 提督 ${s.提督数} 总督 ${s.总督数}`);
}

// finish() 会 console.log 整个 payload，劫下来核对写回 MVU 的形状。
// 落盘而不是打到终端：中文在 Windows 控制台会被重编码，读回来是乱码。
const payloadJson = await page.evaluate(() => {
  let hit = null;
  const orig = console.log;
  console.log = (...a) => { if (a[0] === '[临江开局配置]') hit = a[1]; };
  document.querySelector('#next').click();
  console.log = orig;
  return JSON.stringify(hit, null, 2);
});
writeFileSync(`${OUT}/payload.json`, payloadJson, 'utf8');
const parsed = JSON.parse(payloadJson);
console.log('\npayload 落盘 ->', `${OUT}/payload.json`);
console.log('  对象信息.沈遥 的块:', Object.keys(parsed.mvu.对象信息.沈遥).join(' / '));
const customInitialFavor = parsed.mvu.对象信息.沈遥.羁绊.好感度;
if (customInitialFavor !== 80) throw new Error(`自定义主播初始好感应为 80，实际为 ${customInitialFavor}`);
console.log('  对象信息.沈遥.羁绊.好感度 =', customInitialFavor);
console.log('  对象信息.沈遥.直播 =', JSON.stringify(parsed.mvu.对象信息.沈遥.直播));
console.log('  对象信息.沈遥.位置 =', JSON.stringify(parsed.mvu.对象信息.沈遥.位置));
console.log('  系统配置.直播间.沈遥 =', JSON.stringify(parsed.mvu.系统配置.直播间.沈遥));
const customTheme = parsed.mvu.系统配置.直播间.沈遥.代表色;
if (customTheme !== 'violet') throw new Error(`自定义主播代表色应为 violet，实际为 ${customTheme}`);
console.log('  系统配置.直播间.沈遥.代表色 =', customTheme);
/* 拿 变量初始化 里塔菲的形状当基准，比一遍新主播缺不缺块 */
const canonShape = ['羁绊', '位置', '性经历', '开发度', '生理', '直播'];
const missing = canonShape.filter(k => !parsed.mvu.对象信息.沈遥[k]);
console.log('  跟七位主播比缺的块:', missing.length ? missing.join(',') : '无');
const dev = parsed.mvu.对象信息.沈遥.开发度;
console.log('  开发度四个部位齐全:', ['口腔', '胸', '小穴', '肛门'].every(k => dev[k] && typeof dev[k].档位 === 'number'));
console.log('  性经历条目数:', Object.keys(parsed.mvu.对象信息.沈遥.性经历).length, '（应为 13）');
console.log('  有没有残留的「人数」:', payloadJson.includes('人数') ? '有，得清掉' : '没有');
const book = parsed.worldbooks[0];
console.log('  世界书条目: 角色详情：' + (book ? book.sourceName : '(无)'), '/ keys:', book ? book.keys.join(',') : '-');
console.log('  正文是 角色详情 YAML:', !!book && /^---[\s\S]*角色详情:/.test(book.content));
if (book) writeFileSync(`${OUT}/profile.yaml`, book.content, 'utf8');

// 手机窄屏：我推那一格单列会变左图右字，热度读数会折成三行
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto(`${BASE}/opening.html`, { waitUntil: 'load' });
await phone.fill('#player-name', '林舟');
await phone.evaluate(() => { document.querySelector('.step-tab[data-step="3"]').click(); });
await phone.waitForTimeout(600);
await phone.click('[data-oshi="塔菲"]');
await phone.click('[data-oshi="璃亚梦"]');
// 七张封面全部等到 complete，否则 fullPage 截出来是一排空框
await phone.waitForFunction(() => [...document.querySelectorAll('.oshi-art img')].every(i => i.complete), null, { timeout: 20000 });
await phone.waitForTimeout(700);
await phone.screenshot({ path: `${OUT}/m-step3-oshi.png`, fullPage: true });
await phone.evaluate(() => { document.querySelector('.step-tab[data-step="4"]').click(); });
await phone.waitForTimeout(400);
await phone.waitForTimeout(400);
await phone.screenshot({ path: `${OUT}/m-step4-custom.png`, fullPage: true });

await browser.close();
console.log('shots ->', OUT);
