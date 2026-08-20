/* City map overlay.
   ------------------------------------------------------------------
   plate_map.html is a self-contained page (its own #stage, pan/zoom, plates).
   It cannot be inlined into the HUD: the landscape canvas already owns #stage,
   and a CSS transform on an ancestor breaks iframe pointer coordinates.

   So the map is an iframe covering the unscaled viewport.  Desktop fills the
   window; portrait does the same so labels stay at the map's own type size
   instead of being crushed by the column's scale().  Game state is pushed in
   through window.PLATE_MAP after load.

   Player 「你在这」and heroine pins read the same MVU snapshot the rest of the HUD
   uses: 世界信息.位置 and 对象信息.{名}.位置, already adapted onto world.location
   and characterDetails[name].location by applyStatData. */

import { characterDetails, girls, onLive, world } from './data.js';

const DISTRICT_KEY = {
  乌溪区: 'wuxi',
  明湖区: 'minghu',
  鼓岭区: 'guling',
  西洲区: 'xizhou',
  落霞区: 'luoxia',
  浦江区: 'pujiang',
  雨石区: 'yushi',
  青屏山风景区: 'qingping',
  青屏山: 'qingping',
  东塘区: 'dongtang',
};

/* The map can tint 朝/暮/夜/深夜.  昼 is a HUD period with no plate filter, so it
   borrows 朝 — the brighter of the two daytime-adjacent looks, not a fake noon. */
const PHASE_ALIAS = { 昼: '朝' };

export function mapSrc() {
  return new URL(`${import.meta.env.BASE_URL}city/plate_map.html`, document.baseURI).href;
}

export function isMapOpen() {
  return !!document.querySelector('.map-layer');
}

function districtKey(area = '') {
  const names = Object.keys(DISTRICT_KEY).sort((a, b) => b.length - a.length);
  const hit = names.find((name) => String(area).includes(name));
  return hit ? DISTRICT_KEY[hit] : '';
}

function localityOf(area = '') {
  const s = String(area);
  const i = s.indexOf('·');
  return i >= 0 ? s.slice(i + 1).trim() : '';
}

function sameDistrict(nodeDistrict, areaDistrict) {
  if (!areaDistrict) return true;
  if (!nodeDistrict) return false;
  return nodeDistrict.includes(areaDistrict) || areaDistrict.includes(nodeDistrict.replace('风景区', ''));
}

function scoreNode(node, locality, place) {
  const name = node.name || '';
  const full = node.fullName || '';
  let score = 0;
  if (locality) {
    if (name === locality) score = Math.max(score, 100);
    else if (name.startsWith(locality)) score = Math.max(score, 85);
    else if (name.includes(locality) || (locality.includes(name) && name.length >= 2)) score = Math.max(score, 70);
    else if (full.includes(locality)) score = Math.max(score, 55);
  }
  if (place && place.length >= 2) {
    if (name === place) score = Math.max(score, 90);
    else if (name.includes(place)) score = Math.max(score, 50);
  }
  if (node.parentId) score -= 8;
  return score;
}

/* Map an MVU 区域/场所 onto a plate district and, when the name exists on the
   map, a node id.  Matching stays inside the stated district so 「鼓岭区 · 云庭公寓」
   does not jump to 西洲's 云庭公寓. */
export function resolveMapLocation(area, place, nodes = []) {
  const district = districtKey(area);
  const locality = localityOf(area);
  const areaDistrict = Object.keys(DISTRICT_KEY).sort((a, b) => b.length - a.length)
    .find((name) => String(area).includes(name)) || '';
  let at = '';
  let best = 0;
  nodes.forEach((node) => {
    if (!node?.id || !sameDistrict(node.district, areaDistrict)) return;
    const score = scoreNode(node, locality, place);
    if (score > best) {
      best = score;
      at = node.id;
    }
  });
  return { district, at: best >= 50 ? at : '' };
}

export function mapRuntime(nodes = []) {
  const playerLoc = resolveMapLocation(world.location.area, world.location.place, nodes);
  const actors = girls.map((g) => {
    const loc = characterDetails[g.name]?.location || {};
    const found = resolveMapLocation(loc.area, loc.place, nodes);
    return {
      name: g.name,
      img: g.art,
      at: found.at,
      district: found.district,
    };
  }).filter((a) => a.district || a.at);
  return {
    district: playerLoc.district || 'wuxi',
    player: { at: playerLoc.at },
    actors,
    events: [],
    route: [],
  };
}

function applyToFrame(iframe, { resetView } = {}) {
  let api;
  try { api = iframe.contentWindow?.PLATE_MAP; } catch { return false; }
  if (!api) return false;
  const nodes = iframe.contentWindow.CITY_MAP_DATA?.nodes || [];
  const period = world.time.period;
  api.setPhase(PHASE_ALIAS[period] || period);
  api.setState(mapRuntime(nodes));
  if (resetView) api.fitAll(0);
  return true;
}

function bindFrame(iframe) {
  if (!iframe) return;
  let tries = 0;
  const apply = (resetView) => {
    if (applyToFrame(iframe, { resetView })) return;
    if (tries++ < 40) setTimeout(() => apply(resetView), 50);
  };
  iframe.addEventListener('load', () => apply(true));
  try {
    if (iframe.contentDocument?.readyState === 'complete') apply(true);
  } catch { /* iframe not ready */ }
}

export const bindMapFrame = bindFrame;

export function mapOverlay() {
  return `
<div class="map-layer" role="dialog" aria-modal="true" aria-label="临江市地图">
  <iframe class="map-frame" src="${mapSrc()}" title="临江市地图" data-map-frame></iframe>
  <div class="map-chrome">
    <button class="map-close" type="button" data-map-close aria-label="关闭地图">×</button>
  </div>
</div>`;
}

export function mountMapOverlay(host, { onClose } = {}) {
  const root = host || document.body;
  document.querySelectorAll('.map-layer').forEach((el) => el.remove());
  root.insertAdjacentHTML('beforeend', mapOverlay());
  const layer = root.querySelector(':scope > .map-layer') || document.querySelector('.map-layer');
  const iframe = layer.querySelector('[data-map-frame]');
  bindFrame(iframe);
  layer.querySelector('[data-map-close]').addEventListener('click', () => onClose?.());
  document.documentElement.classList.add('has-map');
  const offLive = onLive(() => applyToFrame(iframe, { resetView: false }));
  return () => {
    offLive();
    layer.remove();
    if (!document.querySelector('.map-layer')) document.documentElement.classList.remove('has-map');
  };
}
