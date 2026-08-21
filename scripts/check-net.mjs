/**
 * 路网自检。三件事必须过：
 *   1. 图连通（每个地点都能到得了别的地点）
 *   2. 四种方式的时长/距离/花费落在现实量级里
 *   3. 地铁和打车真的在互相竞争——时间接近、钱差一个数量级
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
await page.goto(pathToFileURL(path.resolve('city/plate_map.html')).href);
await page.waitForTimeout(1800);

const info = await page.evaluate(() => {
  const N = window.CITY_NET, PM = window.__PM;
  const world = {};
  Object.keys(PM.PLACE).forEach(k => {
    const f = PM.PLATES[k].frame;
    if (!f) return;
    Object.keys(PM.PLACE[k]).forEach(id => {
      const p = PM.PLACE[k][id];
      world[id] = [f.x + p[0] * f.w, f.y + p[1] * f.w];
    });
  });
  const G = N.build({ nodeWorld: world, nameOf: id => id });

  // 连通性：从第一个地点做一次不限方式的 BFS
  const seen = new Set(['p:' + Object.keys(world)[0]]);
  const q = [...seen];
  while (q.length) {
    const v = q.shift();
    for (const ei of G.adj.get(v) || []) {
      const e = G.E[ei];
      const w = e.a === v ? e.b : e.a;
      if (!seen.has(w)) { seen.add(w); q.push(w); }
    }
  }
  const ids = Object.keys(world);
  const orphan = ids.filter(id => !seen.has('p:' + id));

  // 每种方式单独看连通：从家出发能到多少个地点
  const reach = {};
  N.MODES.forEach(m => {
    reach[m.id] = ids.filter(id => id !== 'wx_home' && N.route(G, 'wx_home', id, m.id, '夜')).length;
  });

  const samples = [
    ['wx_home', 'lx_library', '乌溪家→落霞图书馆（横穿全城）'],
    ['wx_home', 'wx_mendong', '乌溪家→门东（区内）'],
    ['wx_home', 'mh_plaza', '乌溪家→明湖广场'],
    ['wx_home', 'pj_village', '乌溪家→浦江村（过江）'],
    ['wx_home', 'dt_airport', '乌溪家→空港'],
    ['mh_plaza', 'ys_station', '明湖广场→临江南站'],
    ['wx_home', 'qp_main', '乌溪家→青屏山密林']
  ];
  const out = samples.map(([a, b, label]) => {
    const all = N.routeAll(G, a, b, '夜');
    const row = { label, crow: Math.round(N.kmOf(world[a], world[b]) * 10) / 10, m: {} };
    N.MODES.forEach(mo => {
      const r = all[mo.id];
      row.m[mo.id] = r ? `${r.min}分 ${r.km}km ¥${r.yuan} 体${r.stamina}` : '不通';
    });
    row.transitLegs = all.transit ? all.transit.legs.map(l =>
      (l.carrier === 'rail' ? (N.lineOf(l.line) || {}).name + ' ' + l.stops + '站' : l.label + ' ' + (l.km < 1 ? Math.round(l.km * 1000) + 'm' : l.km + 'km')) + ' ' + l.min + '分'
    ).join(' → ') : '';
    return row;
  });

  return {
    verts: G.V.size, edges: G.E.length, cutWater: G.cutWater,
    stations: G.stations.size, wayVerts: G.wv.length,
    pois: ids.length, orphan, reach, out,
    kmPerUnit: N.KM_PER_UNIT
  };
});

console.log(`标尺 ${info.kmPerUnit} km/单位 · 顶点 ${info.verts} · 边 ${info.edges}`);
console.log(`地点 ${info.pois} · 站 ${info.stations} · 干道折点 ${info.wayVerts} · 穿水剔除 ${info.cutWater} 条`);
console.log(info.orphan.length ? `!! 孤立地点: ${info.orphan.join(',')}` : `连通 OK，无孤立地点`);
console.log(`各方式可达（共 ${info.pois - 1} 个目标）: ` +
  Object.entries(info.reach).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('');
for (const r of info.out) {
  console.log(`${r.label}  直线 ${r.crow} km`);
  console.log(`   步行 ${r.m.walk}`);
  console.log(`   开车 ${r.m.car}`);
  console.log(`   打车 ${r.m.taxi}`);
  console.log(`   地铁 ${r.m.transit}`);
  if (r.transitLegs) console.log(`        ${r.transitLegs}`);
}
await browser.close();
