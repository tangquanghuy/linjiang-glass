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

import { CITY_BUILD_COST, characterDetails, customMapNodes, girls, onLive, player, world } from './data.js';
import { cleanCustomMapWorldbook, deleteCustomMapNode, saveCustomMapNode } from './bridge.js';
import { hudPage } from './asset.js';
import { mountFrameLoading } from './overlay-loading.js';
import { acquireOverlayHost } from './overlay-host.js';

const MAP_REV = '20260831-runtime-bridge-v1';
const MAP_CHANNEL = 'linjiang-map';

/* V3 renamed a handful of persisted locations while old saves and older prompts can
   still emit the former area names. These pairs are coordinate-identical nodes, not
   guessed nearby substitutes. */
const LEGACY_LOCATION_ID = {
  '\u9f13\u5cad\u533a\u4e91\u5ead\u516c\u5bd3': 'gl_yunting',
  '\u9f13\u5cad\u533a\u68a7\u6850\u91cc': 'gl_wutong',
  '\u897f\u6d32\u533a\u6781\u5149\u58f0\u5b66\u68da': 'xz_sound_studio',
  '\u897f\u6d32\u533a\u661f\u8292\u7535\u7ade\u8231': 'xz_esports',
};

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
  /* 基准是 HUD 自己的来源，不是 document.baseURI（见 src/asset.js 的 hudBase）。 */
  return hudPage(`city/plate_map.html?v=${MAP_REV}`);
}

let activeMapLayer = null;
export function isMapOpen() {
  return !!activeMapLayer?.isConnected || !!document.querySelector('.map-layer');
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

function normalizeLocation(value = '') {
  return String(value).normalize('NFKC').replace(/[\s\u00b7\u30fb\u2022\u2014\u2013_()\uff08\uff09-]/g, '').toLowerCase();
}

function scoreNode(node, locality, place) {
  const name = node.name || '';
  const full = node.fullName || '';
  const aliases = Array.isArray(node.aliases) ? node.aliases : [];
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
  const normalizedCandidates = [locality, place].map(normalizeLocation).filter((value) => value.length >= 2);
  for (const alias of aliases) {
    const normalizedAlias = normalizeLocation(alias);
    if (normalizedCandidates.some((candidate) => normalizedAlias === candidate)) score = Math.max(score, 95);
    else if (normalizedCandidates.some((candidate) => normalizedAlias.includes(candidate) || candidate.includes(normalizedAlias))) {
      score = Math.max(score, 65);
    }
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
  const legacyId = LEGACY_LOCATION_ID[normalizeLocation(area)];
  if (legacyId && nodes.some((node) => node?.id === legacyId)) return { district, at: legacyId };
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

function mapSnapshot(nodes = [], { resetView = false, createMode = null } = {}) {
  return {
    phase: PHASE_ALIAS[world.time.period] || world.time.period,
    state: mapRuntime(nodes.concat(customMapNodes)),
    customNodes: customMapNodes,
    budget: { cost: CITY_BUILD_COST, funds: player.money },
    resetView: !!resetView,
    createMode: createMode ? { ...createMode, cost: CITY_BUILD_COST, funds: player.money } : null,
  };
}

function applyToFrame(iframe, {
  resetView, onTravel, onCustomCreate, onCustomDelete, createMode, nodes: suppliedNodes,
} = {}) {
  let api;
  let frameNodes = suppliedNodes;
  try {
    api = iframe.contentWindow?.PLATE_MAP;
    if (!frameNodes?.length) frameNodes = iframe.contentWindow?.CITY_MAP_DATA?.nodes || [];
  } catch { return false; }
  if (!api) return false;
  if (typeof onTravel === 'function' && typeof api.onTravel === 'function') api.onTravel(onTravel);
  if (typeof onCustomCreate === 'function' && typeof api.onCustomCreate === 'function') api.onCustomCreate(onCustomCreate);
  if (typeof onCustomDelete === 'function' && typeof api.onCustomDelete === 'function') api.onCustomDelete(onCustomDelete);
  const snapshot = mapSnapshot(frameNodes || [], { resetView, createMode });
  if (typeof api.setCustomNodes === 'function') api.setCustomNodes(snapshot.customNodes);
  api.setPhase(snapshot.phase);
  api.setState(snapshot.state);
  if (snapshot.resetView) api.fitAll(0);
  if (typeof api.setBuildBudget === 'function') api.setBuildBudget(snapshot.budget);
  if (snapshot.createMode && !iframe.dataset.customCreateStarted && typeof api.enterCustomMode === 'function') {
    iframe.dataset.customCreateStarted = '1';
    api.enterCustomMode(snapshot.createMode);
  }
  return true;
}

function bindFrame(iframe, options = {}) {
  if (!iframe) return { push() {}, dispose() {} };
  const eventTarget = iframe.ownerDocument?.defaultView || window;
  let bridgeNodes = [];
  let mappedSnapshotSent = false;
  let disposed = false;

  const post = (type, payload = null, requestId = '') => {
    try {
      iframe.contentWindow?.postMessage({
        channel: MAP_CHANNEL, token: options.bridgeToken || '', type, payload, requestId,
      }, '*');
      return true;
    } catch { return false; }
  };

  const push = (resetView = false) => {
    if (disposed) return false;
    const direct = applyToFrame(iframe, { ...options, resetView, nodes: bridgeNodes });
    /* Native-flow runs the HUD bundle in Tavern's srcdoc origin while the map iframe
       stays on the HUD/Pages origin. Direct contentWindow access is then blocked, so
       the same snapshot crosses by postMessage. Same-origin desktop keeps the direct
       path and receives this message only after the child has announced its node list. */
    if (bridgeNodes.length || !direct) {
      post('snapshot', mapSnapshot(bridgeNodes, { resetView, createMode: options.createMode }));
    }
    return direct || bridgeNodes.length > 0;
  };

  const reply = (requestId, ok, payload, error = '') => post('response', { ok, payload, error }, requestId);
  const onMessage = (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data || {};
    if (data.channel !== MAP_CHANNEL || data.token !== (options.bridgeToken || '')) return;
    if (data.type === 'hello') {
      bridgeNodes = Array.isArray(data.payload?.nodes) ? data.payload.nodes : [];
      const reset = !mappedSnapshotSent;
      mappedSnapshotSent = true;
      push(reset);
      return;
    }
    if (data.type === 'travel') {
      options.onTravel?.(data.payload || {});
      return;
    }
    if (data.type !== 'custom-create' && data.type !== 'custom-delete') return;
    const handler = data.type === 'custom-create' ? options.onCustomCreate : options.onCustomDelete;
    if (typeof handler !== 'function') {
      reply(data.requestId, false, null, 'map host has no write handler');
      return;
    }
    Promise.resolve(handler(data.payload)).then((result) => {
      reply(data.requestId, true, result);
    }).catch((error) => {
      reply(data.requestId, false, null, error?.message || String(error));
    });
  };

  eventTarget.addEventListener('message', onMessage);
  iframe.addEventListener('load', () => push(!mappedSnapshotSent));
  try {
    if (iframe.contentDocument?.readyState === 'complete') push(true);
  } catch { /* cross-origin iframe: child hello drives the first mapped snapshot */ }

  return {
    push,
    dispose() {
      disposed = true;
      eventTarget.removeEventListener('message', onMessage);
    },
  };
}

export const bindMapFrame = bindFrame;

export function mapOverlay(bridgeToken = '') {
  const bridge = bridgeToken ? `&bridge=${encodeURIComponent(bridgeToken)}` : '';
  return `
<div class="map-layer" role="dialog" aria-modal="true" aria-label="\u4e34\u6c5f\u5e02\u5730\u56fe">
  <iframe class="map-frame" src="${mapSrc()}${bridge}" title="\u4e34\u6c5f\u5e02\u5730\u56fe" data-map-frame></iframe>
  <div class="map-chrome">
    <button class="map-close" type="button" data-map-close aria-label="\u5173\u95ed\u5730\u56fe">\u00d7</button>
  </div>
</div>`;
}

export function mountMapOverlay(host, { onClose, onTravel, createMode = null } = {}) {
  const mount = acquireOverlayHost(host || document.body);
  /* ??????????????????? MVU ????????????????????? */
  cleanCustomMapWorldbook().catch((error) => console.warn('[map] clean custom worldbook', error));
  const root = mount.root;
  root.querySelectorAll('.map-layer').forEach((el) => el.remove());
  const bridgeToken = globalThis.crypto?.randomUUID?.() || `map-${Date.now()}-${Math.random()}`;
  root.insertAdjacentHTML('beforeend', mapOverlay(bridgeToken));
  const layer = root.querySelector(':scope > .map-layer');
  activeMapLayer = layer;
  const iframe = layer.querySelector('[data-map-frame]');
  const handleCreate = async (draft) => {
    const result = await saveCustomMapNode(draft);
    return result?.node || result || draft;
  };
  const handleDelete = async (node) => deleteCustomMapNode(node?.id || node);
  const frameBridge = bindFrame(iframe, {
    onTravel, createMode, onCustomCreate: handleCreate, onCustomDelete: handleDelete, bridgeToken,
  });
  layer.querySelector('[data-map-close]').addEventListener('click', () => onClose?.());
  if (!mount.portal) document.documentElement.classList.add('has-map');
  /* 同商店/街机/CG：页面从 Pages 取，慢的时候覆盖层就是一片近黑。见 src/overlay-loading.js。
     地图这条尤其值得有 —— 它带的资源最重（city/ 有 32MB）。 */
  const unmountLoading = mountFrameLoading(layer, iframe, { label: '地图', onClose: () => onClose?.() });
  const offLive = onLive(() => frameBridge.push(false));
  return () => {
    offLive();
    unmountLoading();
    frameBridge.dispose();
    layer.remove();
    mount.release();
    if (activeMapLayer === layer) activeMapLayer = null;
    if (!mount.portal && !document.querySelector('.map-layer')) document.documentElement.classList.remove('has-map');
  };
}
