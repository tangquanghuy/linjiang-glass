/* Arcade overlay.
   ------------------------------------------------------------------
   The four games are self-contained HTML pages (scratch / slots / fishing /
   shrine) hosted under arcade/.  They cannot be inlined: fishing and slots
   own their own canvas, and a CSS transform on an ancestor breaks pointer
   coordinates the same way it does for the city map.

   So the arcade is an iframe covering the unscaled viewport, matching the
   map overlay.  Games keep their own portrait / landscape CSS; this module
   only mounts, closes, seeds the shared purse from 玩家信息.金钱, and writes
   wins/losses back through the tavern shell. */

import { arcadeProfile, applyArcadeProfile, player, onLive } from './data.js';
import { flushMoney, recordArcadeEvent, setMoney } from './bridge.js';
import { hudPage } from './asset.js';

export function arcadeSrc() {
  /* 基准是 HUD 自己的来源，不是 document.baseURI（见 src/asset.js 的 hudBase）。 */
  return hudPage('arcade/index.html');
}

export function isArcadeOpen() {
  return !!document.querySelector('.arcade-layer');
}

export function arcadeOverlay() {
  return `
<div class="arcade-layer" role="dialog" aria-modal="true" aria-label="幸运街机">
  <iframe class="arcade-frame" src="${arcadeSrc()}" title="幸运街机"
    allow="autoplay" data-arcade-frame></iframe>
  <div class="arcade-chrome">
    <button class="arcade-close" type="button" data-arcade-close aria-label="关闭街机">×</button>
  </div>
</div>`;
}

export function mountArcadeOverlay(host, { onClose } = {}) {
  const root = host || document.body;
  document.querySelectorAll('.arcade-layer').forEach((el) => el.remove());
  root.insertAdjacentHTML('beforeend', arcadeOverlay());
  const layer = root.querySelector(':scope > .arcade-layer') || document.querySelector('.arcade-layer');
  layer.querySelector('[data-arcade-close]').addEventListener('click', () => onClose?.());
  document.documentElement.classList.add('has-arcade');

  const iframe = layer.querySelector('[data-arcade-frame]');
  let lastPushed = NaN;
  const cash = () => Math.max(0, Math.round(Number(player.money) || 0));
  const push = () => {
    const n = cash();
    lastPushed = n;
    try {
      iframe.contentWindow?.postMessage({ type: 'airp-arcade:set-balance', balance: n }, '*');
      iframe.contentWindow?.postMessage({ type: 'airp-arcade:set-profile', profile: arcadeProfile }, '*');
    } catch (_) {}
  };
  let arcadeChain = Promise.resolve();
  const record = (event) => {
    arcadeChain = arcadeChain.then(() => recordArcadeEvent(event)).then((result) => {
      if (result?.profile) applyArcadeProfile(result.profile);
      try {
        iframe.contentWindow?.postMessage({
          type: 'airp-arcade:set-profile',
          profile: result?.profile || arcadeProfile,
          unlocked: Array.isArray(result?.unlocked) ? result.unlocked : [],
        }, '*');
      } catch (_) {}
    }).catch((err) => console.warn('[arcade] milestone', err));
  };
  const onFrameMsg = (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data || {};
    if (data.type === 'airp-arcade:hello') { push(); return; }
    if (data.type === 'airp-arcade:event') { record(data.event || {}); return; }
    if (data.type !== 'airp-arcade:balance') return;
    const n = Math.max(0, Math.round(Number(data.balance) || 0));
    if (!Number.isFinite(n) || n === lastPushed) return;
    lastPushed = n;
    setMoney(n);
  };
  iframe.addEventListener('load', push);
  addEventListener('message', onFrameMsg);
  const offLive = onLive(push);

  return () => {
    offLive();
    removeEventListener('message', onFrameMsg);
    flushMoney();
    layer.remove();
    if (!document.querySelector('.arcade-layer')) document.documentElement.classList.remove('has-arcade');
  };
}
