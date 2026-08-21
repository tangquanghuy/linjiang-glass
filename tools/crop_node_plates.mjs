/**
 * 从地图布点导出节点 → 区底板 + 归一化坐标。
 * 突发事件卡片用这张表在九张底板上现场裁切，不预存分场景图。
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapUrl = pathToFileURL(path.join(root, 'city', 'plate_map.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.goto(mapUrl, { waitUntil: 'load' });
await page.waitForFunction(() => window.__PM && window.CITY_MAP_DATA, { timeout: 15000 });

const jobs = await page.evaluate(() => {
  const M = window.__PM;
  const nodes = (window.CITY_MAP_DATA && window.CITY_MAP_DATA.nodes) || [];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const out = [];
  Object.keys(M.PLACE).forEach(key => {
    const pl = M.PLATES[key];
    if (!pl || !pl.file) return;
    const file = String(pl.file).replace(/^plate\//, '');
    Object.keys(M.PLACE[key]).forEach(id => {
      const p = M.PLACE[key][id];
      const n = byId[id];
      out.push({
        id,
        nx: p[0],
        ny: p[1],
        file,
        name: n ? n.name : '',
        district: n ? n.district : (pl.district || ''),
      });
    });
  });
  return out;
});
await browser.close();

const art = { byId: {}, byName: {}, byArea: {} };
for (const job of jobs) {
  const rec = { file: job.file, nx: job.nx, ny: job.ny };
  art.byId[job.id] = rec;
  if (job.name) {
    art.byName[job.name] = rec;
    if (job.district) {
      art.byArea[(job.district + '·' + job.name).replace(/\s/g, '')] = rec;
    }
  }
}

const outJson = path.join(root, 'city', 'plate', 'node_art.json');
fs.writeFileSync(outJson, JSON.stringify(art, null, 2));
console.log('wrote', jobs.length, 'node foci to', path.relative(root, outJson));
