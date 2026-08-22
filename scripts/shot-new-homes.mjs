/**
 * 给新加的住宅节点各出一张区级小样，确认针位落对了、标签没叠。
 * 输出 artifacts/home-<id>.jpg
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const NEW = [
  ['gl_gongguan', 'guling'],
  ['wx_riverhouse', 'wuxi'],
  ['lx_faculty', 'luoxia'],
  ['dt_farmhouse', 'dongtang'],
  ['qp_hillhouse', 'qingping'],
  ['mh_skyloft', 'minghu'],
  ['xz_jiayuan', 'xizhou'],
  ['dt_townhouse', 'dongtang'],
  ['qp_villa', 'qingping']
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(pathToFileURL(path.resolve('city/plate_map.html')).href);
await page.waitForTimeout(1800);

for (const [id, plate] of NEW) {
  const info = await page.evaluate(([id, plate]) => {
    const M = window.__PM;
    const f = M.PLATES[plate].frame;
    const p = M.PLACE[plate][id];
    if (!p) return { ok: false, why: 'PLACE 里没有这个 id' };
    const w = [f.x + p[0] * f.w, f.y + p[1] * f.w];
    // r = frame.w * z，取 1.45 让次级地点也显形
    window.__setView(w[0], w[1], 1.45 / f.w);
    const n = window.CITY_MAP_DATA.nodeById[id];
    return { ok: true, name: n && n.name, world: w, housing: !!(n && n.housing) };
  }, [id, plate]);
  if (!info.ok) { console.log(`FAIL ${id}: ${info.why}`); continue; }
  await page.waitForTimeout(900);
  // 节点针上是否真的画出了这个名字
  const painted = await page.evaluate((name) => document.getElementById('nodes').innerText.includes(name), info.name);
  await page.screenshot({ path: `artifacts/home-${id}.jpg`, type: 'jpeg', quality: 78 });
  console.log(`${painted ? 'ok  ' : 'FAIL'} ${id.padEnd(16)}${String(info.name).padEnd(14)}housing=${info.housing}  world=[${info.world.map(v => v.toFixed(3)).join(', ')}]`);
}
await browser.close();
