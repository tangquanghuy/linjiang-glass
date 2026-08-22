/**
 * 从 city_mapdata.js + city_net.js + plate_map.js 提炼「给 AI 看的」地图静态资料。
 * 在真实浏览器里跑一遍 CITY_NET.build，所以距离/时长/票价/体力和地图 UI 完全同源。
 * 输出：世界书/地图静态资料
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { readOpeningPool } from './lib/opening-pool.mjs';

/* 通勤矩阵的锚点里含"开局可选住所／岗位"，这份名单以 opening.js 为唯一真源，
   不在这里再抄一遍。页面上下文拿不到 node 的变量，所以要显式传进 evaluate。 */
const POOL = readOpeningPool();

/**
 * 区枢纽按【底板】分，不按 district 字段分：
 * city_mapdata 把浦江和雨石写成同一个 "雨石与浦江区"，但它们在地图上是隔江的两张底板，
 * 合成一个枢纽会让"过江"这件事在通勤表里消失。
 */
const HUB = {
  guling: 'gl_wutong',
  minghu: 'mh_plaza',
  xizhou: 'xz_zhoumen',
  wuxi: 'wx_mendong',
  luoxia: 'lx_library',
  yushi: 'ys_station',
  pujiang: 'pj_village',
  qingping: 'qp_visitor',
  dongtang: 'dt_airport'
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(pathToFileURL(path.resolve('city/plate_map.html')).href);
await page.waitForTimeout(2000);

const dump = await page.evaluate(({ HUB, POOL }) => {
  const N = window.CITY_NET, PM = window.__PM, D = window.CITY_MAP_DATA;
  const R = N.R;

  // ---- 世界坐标：区底板 footprint 把区内归一化坐标映射到总览 ----
  const world = {};
  const plateOf = {};
  Object.keys(PM.PLACE).forEach(k => {
    const f = PM.PLATES[k].frame;
    if (!f) return;
    Object.keys(PM.PLACE[k]).forEach(id => {
      const p = PM.PLACE[k][id];
      world[id] = [f.x + p[0] * f.w, f.y + p[1] * f.w];
      plateOf[id] = k;
    });
  });

  const G = N.build({ nodeWorld: world, nameOf: id => (D.nodeById[id] ? D.nodeById[id].name : id) });
  const ids = Object.keys(world).filter(id => D.nodeById[id]);
  const km = (a, b) => N.kmOf(world[a], world[b]);

  // ---- 路网直连：city_net 里 kind==='local' 的边就是地点↔地点的支路/栈桥 ----
  const adj = {};
  ids.forEach(id => { adj[id] = []; });
  G.E.forEach(e => {
    if (e.kind !== 'local') return;
    const a = e.a.startsWith('p:') ? e.a.slice(2) : null;
    const b = e.b.startsWith('p:') ? e.b.slice(2) : null;
    if (!a || !b || !adj[a] || !adj[b]) return;
    adj[a].push(b);
    adj[b].push(a);
  });

  const trip = (a, b, mode) => {
    const r = N.route(G, a, b, mode, '昼');
    return r ? [r.min, r.km, r.yuan, r.stamina] : null;
  };

  // ---- 节点精简资料 ----
  const firstSentence = (s, n) => {
    const t = String(s || '').trim();
    const parts = t.split(/(?<=[。！？])/).filter(Boolean);
    let out = '';
    for (const p of parts) {
      if (out && out.length + p.length > n) break;
      out += p;
      if (out.length >= n) break;
    }
    return (out || t.slice(0, n)).trim();
  };

  const nodes = ids.map(id => {
    const n = D.nodeById[id];
    const f = n.features || {};
    const o = {
      id,
      name: n.name,
      district: n.district,
      plate: plateOf[id],
      arch: n.archetype,
      privacy: n.privacy,
      hours: n.openHours || [],
      f: [f.canGather ? '采' : '', f.canDate ? '约' : '', f.canWork ? '工' : '', f.hasShop ? '店' : ''].filter(Boolean).join(''),
      brief: firstSentence(n.intro, 56),
      draw: firstSentence(n.draw, 60),
      w: [Math.round(world[id][0] * 1e4) / 1e4, Math.round(world[id][1] * 1e4) / 1e4]
    };
    if (n.gather && Array.isArray(n.gather.materials) && n.gather.materials.length) {
      o.mats = n.gather.materials.slice(0, 5);
    }
    if (Array.isArray(n.special) && n.special.length) {
      o.special = n.special.slice(0, 3).map(s => firstSentence(s, 48));
    }
    if (n.housing) {
      o.housing = {
        tier: n.housing.tier,
        deal: n.housing.transaction,
        rent: n.housing.rent,
        deposit: n.housing.deposit,
        sale: n.housing.sale,
        minMoney: n.housing.unlock && n.housing.unlock.minMoney || 0,
        note: n.housing.note || ''
      };
    }
    return o;
  });

  // ---- 邻接：直连节点的实际出行成本 ----
  const links = {};
  ids.forEach(id => {
    const seen = new Set();
    links[id] = adj[id]
      .filter(x => (seen.has(x) ? false : (seen.add(x), true)))
      .map(x => ({
        to: x,
        km: Math.round(km(id, x) * 10) / 10,
        walk: trip(id, x, 'walk'),
        transit: trip(id, x, 'transit'),
        taxi: trip(id, x, 'taxi')
      }))
      .sort((a, b) => a.km - b.km);
  });

  // ---- 次邻：两跳可达且不是直连 ----
  const second = {};
  ids.forEach(id => {
    const direct = new Set(adj[id]);
    const best = new Map();
    adj[id].forEach(mid => {
      (adj[mid] || []).forEach(far => {
        if (far === id || direct.has(far)) return;
        const d = km(id, mid) + km(mid, far);
        const old = best.get(far);
        if (!old || d < old.d) best.set(far, { to: far, via: mid, d });
      });
    });
    second[id] = [...best.values()]
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map(x => {
        const t = trip(id, x.to, 'transit');
        const wk = trip(id, x.to, 'walk');
        return {
          to: x.to,
          via: x.via,
          km: Math.round(km(id, x.to) * 10) / 10,
          walk: wk,
          transit: t
        };
      });
  });

  /* ---- 步行圈 ----
     RNG 支路平均只给每个地点 2.3 个直连邻居，光看直连读不出"走两步就到"的那一圈。
     所以另算一份：直线 3 km 以内、按实际步行时长排序的近邻。 */
  const near = {};
  ids.forEach(id => {
    const cand = ids
      .filter(x => x !== id && km(id, x) <= 3)
      .map(x => ({ to: x, crow: km(id, x) }))
      .sort((a, b) => a.crow - b.crow)
      .slice(0, 14);
    near[id] = cand
      .map(c => {
        const wk = trip(id, c.to, 'walk');
        return wk ? { to: c.to, km: Math.round(wk[1] * 10) / 10, min: wk[0], st: wk[3] } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.min - b.min)
      .slice(0, 10);
  });

  // ---- 每个节点到九个区枢纽的通勤（键是底板 key） ----
  const hubs = HUB;
  const toHub = {};
  ids.forEach(id => {
    toHub[id] = {};
    Object.keys(hubs).forEach(k => {
      const h = hubs[k];
      if (h === id) return;
      toHub[id][k] = { transit: trip(id, h, 'transit'), taxi: trip(id, h, 'taxi'), walk: trip(id, h, 'walk') };
    });
  });

  /* ---- 住宅 × 工作 通勤矩阵 ----
     住所和工作是玩家唯一每天来回跑的一对，值必须精确，不能用"到区枢纽"糊过去。
     可选住所（开局十处 + 带 housing 字段的进阶房）和可选岗位（开局十二个 + canWork 的点）
     都是有限集合，直接把这一对全算完。 */
  // 开局池从 opening.js 读，不再手抄一份：见 scripts/lib/opening-pool.mjs 的说明
  const HOME_IDS = POOL.homeIds
    .concat(ids.filter(id => D.nodeById[id].housing));
  const JOB_IDS = POOL.jobIds
    .concat(ids.filter(id => D.nodeById[id].features && D.nodeById[id].features.canWork));
  const uniq = a => [...new Set(a)].filter(x => world[x]);
  const homeIds = uniq(HOME_IDS), jobIds = uniq(JOB_IDS);
  const commute = {};
  homeIds.forEach(h => {
    commute[h] = {};
    jobIds.forEach(w => {
      if (w === h) return;
      const t = trip(h, w, 'transit'), x = trip(h, w, 'taxi'), wk = trip(h, w, 'walk');
      commute[h][w] = {
        transit: t, taxi: x, walk: wk,
        km: Math.round(((t && t[1]) || (x && x[1]) || 0) * 10) / 10
      };
    });
  });

  // ---- 区：footprint 中心、辖区尺寸、通过路网相邻的区 ----
  const KM = N.KM_PER_UNIT;
  const districts = PM.DISTRICTS.map(d => {
    const f = PM.PLATES[d.key].frame;
    const inThis = ids.filter(id => plateOf[id] === d.key);
    const dn = inThis.length ? D.nodeById[inThis[0]].district : d.name;
    const cx = f.x + f.w / 2, cy = f.y + f.w / 2;
    const border = new Set();
    inThis.forEach(id => (adj[id] || []).forEach(x => {
      if (plateOf[x] && plateOf[x] !== d.key) border.add(plateOf[x]);
    }));
    return {
      key: d.key,
      name: d.name,
      dataName: dn,
      sub: d.sub,
      center: [Math.round(cx * 1e3) / 1e3, Math.round(cy * 1e3) / 1e3],
      spanKm: Math.round(f.w * KM * 10) / 10,
      offsetKm: [Math.round((cx - 0.5) * KM * 10) / 10, Math.round((cy - 0.5) * KM * R * 10) / 10],
      count: inThis.length,
      hub: hubs[d.key] || null,
      nodeIds: inThis,
      border: [...border]
    };
  });

  // ---- 轨道与干道摘要 ----
  const metro = N.METRO.map(l => ({
    id: l.id, name: l.name,
    stations: l.stations.map(s => (s.node ? (D.nodeById[s.node] ? D.nodeById[s.node].name : s.node) : s.name)),
    onNodes: l.stations.filter(s => s.node).map(s => s.node)
  }));
  const ways = N.WAYS.map(w => ({ id: w.id, name: w.name, kind: w.kind }));

  return {
    kmPerUnit: KM, R,
    nodes, links, second, near, toHub, commute, homeIds, jobIds, districts, metro, ways, hubs,
    stats: { pois: ids.length, verts: G.V.size, edges: G.E.length, cutWater: G.cutWater }
  };
}, { HUB, POOL: { homeIds: POOL.homeIds, jobIds: POOL.jobIds } });

await browser.close();

fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/ai-map-dump.json', JSON.stringify(dump, null, 1), 'utf8');
console.log('POI', dump.stats.pois, '顶点', dump.stats.verts, '边', dump.stats.edges);
console.log('区', dump.districts.length, '地铁', dump.metro.length, '干道', dump.ways.length);
console.log('直连边数(单向)', Object.values(dump.links).reduce((a, b) => a + b.length, 0));
console.log('dump → artifacts/ai-map-dump.json');
