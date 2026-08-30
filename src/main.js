import './styles/tokens.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/content.css';
import './styles/cards.css';
import './styles/tools.css';
import './styles/pages.css';
import './styles/map.css';
import './styles/arcade.css';
/* 跟着 arcade.css：CG 鉴赏是同一种覆盖层，样式也是照它写的。 */
import './styles/cg.css';
import './styles/shop.css';
import './styles/dock.css';
import './styles/drawer.css';
/* After drawer.css: the gift tray is the drawer's panel with different cells, so its
   overrides have to land on top of the cell rules they narrow. */
import './styles/gifts.css';
import './styles/portrait.css';
/* 带标签的去处，两个构图各一套，所以排在两边的样式之后。 */
import './styles/dest.css';
/* Same reason as dest.css: the settings page shares its rows between the two
   compositions, so it lands after both page stylesheets. */
import './styles/settings.css';
import './styles/perf.css';

import { asset, cssUrl } from './asset.js';
import { installImageFallbacks } from './dom.js';
import { warmOverlayPages } from './overlay-loading.js';
import { shopSrc } from './shop.js';
import { cgSrc } from './cg.js';
import { arcadeSrc } from './arcade.js';
installImageFallbacks();

import { buildDefs, buildRim, buildLens } from './glass.js';
import { buildDockDefs } from './dock.js';
import { buildDrawerDefs } from './drawer.js';
import { renderContent } from './content.js';
import { createPortraitStage } from './portrait/stage.js';
import { mountPortraitContent } from './portrait/content.js';
import { pendingRestorePage, startBridge } from './bridge.js';
import { onPref, pref, prefStored } from './prefs.js';

/* Two layouts, not one layout with breakpoints.
   ------------------------------------------------------------------
   The landscape canvas is a fixed 1672x941 reproduction of a measured prototype
   and is scaled to cover the viewport.  Portrait cannot be that same canvas
   rescaled: the aspect mismatch against a phone is about 3.9x, and scaling is the
   one transform that cannot change an aspect ratio, so any fit strategy either
   crops most of the scene or shrinks the type past legibility.  Portrait is
   therefore its own composition on its own canvas -- fixed width, elastic height --
   sharing the material, the tokens' structure and the construction rules.

   ?mode=portrait / ?mode=landscape forces one for testing. */
const portraitMq = matchMedia('(max-width: 879px) and (orientation: portrait)');
let hostMode = window.__linjiangHostMode === 'portrait' || window.__linjiangHostMode === 'landscape'
  ? window.__linjiangHostMode
  : null;

function wantsPortrait() {
  const forced = hostMode || new URLSearchParams(location.search).get('mode');
  /* An explicit host decision is authoritative.  The deployment shell knows the
     actual tavern viewport; this iframe may itself be tall even while the phone is
     held sideways, so inferring from the iframe first picks the wrong composition. */
  if (forced === 'portrait') return true;
  if (forced === 'landscape') return false;
  const phoneColumn = innerWidth < 880 && innerWidth < innerHeight;
  if (phoneColumn) return true;
  return portraitMq.matches || (innerWidth < innerHeight && innerWidth < 720);
}

function bootLandscape() {
  const stage = document.getElementById('stage');
  buildDefs(document.getElementById('defs'));
  /* The dock's and the drawer's clip paths and gradients live in the always-present
     defs so the CSS layers can reference them even though both panels mount on
     demand. */
  buildDockDefs(document.getElementById('defs'));
  buildDrawerDefs(document.getElementById('defs'));
  buildLens(document.getElementById('lens'));
  buildRim(document.getElementById('rim'));
  renderContent(document.getElementById('content'));

  const fitStage = () => {
    const canvasW = 1672;
    const canvasH = 941;
    const fit = new URLSearchParams(location.search).get('fit');
    /* Dock ear/blossom ~y 54, drawer bottom 823 (geometry.json). Pad a few
       units so the glass rim still sits inside the iframe. */
    const body = { x: 16, y: 48, w: 1640, h: 787 };
    if (fit === 'body') {
      const k = Math.min(innerWidth / body.w, innerHeight / body.h);
      const shiftY = canvasH / 2 - (body.y + body.h / 2);
      stage.style.setProperty('--k', String(k));
      stage.style.setProperty('--shift-y', `${shiftY}px`);
      return;
    }
    const contain = fit === 'contain';
    const shellCenter = 535;
    const kW = innerWidth / canvasW;
    const kH = innerHeight / canvasH;
    const k = contain ? Math.min(kW, kH) : Math.max(kW, kH);
    let shiftY = 0;
    if (!contain && kW >= kH) {
      const visibleH = innerHeight / kW;
      let centerY = shellCenter;
      const half = visibleH / 2;
      if (centerY - half < 0) centerY = half;
      if (centerY + half > canvasH) centerY = canvasH - half;
      shiftY = canvasH / 2 - centerY;
    }
    stage.style.setProperty('--k', String(k));
    stage.style.setProperty('--shift-y', `${shiftY}px`);
  };
  fitStage();
  addEventListener('resize', fitStage);
}

function bootPortrait() {
  const viewport = document.querySelector('.viewport');
  let host = document.getElementById('pstage');
  if (!host) {
    host = document.createElement('div');
    host.id = 'pstage';
    viewport.appendChild(host);
  }

  const stage = createPortraitStage(host);
  const column = mountPortraitContent(stage, {
    /* Every route the column offers is built (see src/portrait/pages.js), so this only
       fires for a name nothing routes -- which should be loud rather than a blank
       panel. */
    onPage: (page, arg) => {
      console.warn('[portrait] no page routed for:', page, arg ?? '');
    },
  });

  /* 把楼层文档被销毁之前打开的那一页恢复回来。
     ------------------------------------------------------------------
     TT 的「角色卡渲染管理 = 自动」会随滚动把楼层挪进停车场并重建它的文档。原生流下 HUD 的
     DOM 就住在那个文档里，所以用户正在看的档案面板会凭空消失、视口也跟着跳 —— 真机反馈的
     就是这个。页名和参数由壳层记在酒馆窗口上（见 status-shell.js 的 rememberNativePage），
     这里首帧读回来重开，对用户来说等于没发生过。

     放在 mountPortraitContent 之后、且不等任何往返：等一次 RPC 会让面板先闪一下基础列再回来。 */
  try {
    const restore = pendingRestorePage();
    if (restore?.page) column.openPage(restore.page, restore.arg ?? undefined);
  } catch (error) {
    console.warn('[portrait] 恢复上一页失败', error);
  }
  return stage;
}

/* Both layouts stay mounted once built and are shown one at a time.
   The mode has to be re-picked on resize, not just at boot: rotating a phone
   changes which composition fits, and tearing the other one down would mean
   rebuilding its geometry, its rim SVGs and its scroll position every rotation. */
let landscapeBooted = false;
let portraitStage = null;

function applyMode() {
  const portrait = wantsPortrait();
  const viewport = document.querySelector('.viewport');
  /* The overlay is owned by whichever layout opened it.  Switching composition
     would leave Escape wired to the hidden one, so peel it first. */
  if (viewport.classList.contains('is-portrait') !== portrait) {
    document.querySelector('[data-map-close]')?.click();
    document.querySelector('[data-arcade-close]')?.click();
  }

  viewport.classList.toggle('is-portrait', portrait);
  /* The document only scrolls in portrait: the whole point of the elastic canvas
     is that opening the preview makes the page taller. */
  document.documentElement.classList.toggle('portrait-mode', portrait);

  /* Inline `hidden` so the unused canvas is gone even if the CSS bundle is late.
     A phone otherwise keeps the landscape glass in the tree, paints a second
     portrait copy, and Chrome reloads until it reports the URL repeating. */
  const landscape = document.getElementById('stage');
  if (landscape) landscape.hidden = portrait;
  const portraitHost = document.getElementById('pstage');
  if (portraitHost) portraitHost.hidden = !portrait;

  if (portrait) {
    if (!portraitStage) portraitStage = bootPortrait();
    else portraitStage.sync();
  } else if (!landscapeBooted) {
    bootLandscape();
    landscapeBooted = true;
  }
}

const hostNeedsFlatGlass = new URLSearchParams(location.search).get('host') === 'tauritavern-mobile';
const iosTouchHost = hostNeedsFlatGlass && (() => {
  const ua = String(navigator.userAgent || '');
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1;
})();
if (iosTouchHost) document.documentElement.dataset.hudIosScroll = '1';
/* 原生流下平面玻璃是**默认**，不是强制。
   ------------------------------------------------------------------
   hostNeedsFlatGlass 只认 `?host=tauritavern-mobile` 这个查询串，而那是抬升架构给 HUD
   iframe 拼 URL 时加上的。原生流下 HUD 是当 module 直接在楼层文档里执行的，没有查询串 ——
   于是「专门为救移动端性能而做的那条路」反倒是唯一还在付全套 backdrop-filter 的移动端
   路径，而 TauriTavern 的抬升路径反而拿到了平面玻璃。这是个纯粹的逻辑漏洞。

   补法上跟 TT 那条不同：TT 是硬来（拿不到完整效果），原生流只改默认值。理由是原生流覆盖
   的机型跨度很大，高端手机跑满玻璃完全没问题，不该替他们决定；而 prefStored 能分清
   「默认恰好是 auto」和「用户明确选了完整效果」，所以给得起这个选择。 */
const nativeFlowHost = (() => {
  try { return !!window.__linjiangNativeFlow; } catch (e) { return false; }
})();
/* 两张大贴图跟着档位走。
   ------------------------------------------------------------------
   低负载档以前只关 backdrop-filter，贴图一张不少（perf.css 顶部那句「Frost, tint and
   plus-lighter edge are fills, not filters」说的就是这个）。但在低端机上这两张才是大头：

     bg-plate.png  1672×941  解码后约 6MB 位图
     frost.png     1024×1024 解码后约 4MB，而且要 repeat 铺在 6 个面上

   一份 HUD 实例约 10MB 解码位图，而参考实现（参考/底部状态栏.html）一张图都没有 —— 1G 内存
   的机器上这就是「它不卡我们卡爆」的差距所在。探针实测（6× 限速）：换成 1×1 之后传输
   3076KB → 15KB、首屏解码 69.6ms → 1ms。位图内存和弱 GPU 的合成带宽夹具量不到，只会更多。

   --hud-frost 必须在 JS 里改：它是写在 <html> 上的 inline 自定义属性，样式表覆盖不了。
   .pplate 的 src 也在这里同步，这样用户在设置页来回切换能立刻看到效果，不用重挂。 */
const syncHeavyTextures = () => {
  const low = document.documentElement.dataset.hudPerformance === 'low';
  document.documentElement.style.setProperty('--hud-frost', low ? 'none' : cssUrl('frost.png'));
  document.querySelectorAll('img.pplate').forEach((img) => {
    if (low) img.removeAttribute('src');
    else if (img.getAttribute('src') !== asset('bg-plate.png')) img.src = asset('bg-plate.png');
  });
};

const applyPerformanceMode = () => {
  const choice = pref('performanceMode');
  const low = choice === 'low'
    || hostNeedsFlatGlass
    || (nativeFlowHost && !prefStored('performanceMode'));
  document.documentElement.dataset.hudPerformance = low ? 'low' : 'auto';
  syncHeavyTextures();
};
applyPerformanceMode();

applyMode();
/* 构图建完之后再同步一次：.pplate 是 applyMode 里才创建的，开机那次 syncHeavyTextures
   跑在它出现之前。 */
syncHeavyTextures();
startBridge();

/* 预热几个内嵌页面的 HTML。
   ------------------------------------------------------------------
   它们从 GitHub Pages 取，而国内网络下第一次可能要等很久 —— 真机上表现为"点商店直接黑屏"
   （诊断出的实况：iframe 还停在 about:blank，load 从未触发）。加载状态已经把那个失败模式
   变成看得懂的等待，这一步再把等待本身挪到用户不在等的时候。
   只取 HTML、不碰各自的重资源；空闲时才发，失败静默。理由见 src/overlay-loading.js。 */
warmOverlayPages([shopSrc(), cgSrc(), arcadeSrc()]);

let modeTick = 0;
const scheduleMode = () => {
  cancelAnimationFrame(modeTick);
  modeTick = requestAnimationFrame(applyMode);
};

onPref((name) => {
  if (name === 'performanceMode') applyPerformanceMode();
});

addEventListener('linjiang:layout-mode', (event) => {
  const next = event.detail?.mode === 'portrait' ? 'portrait' : 'landscape';
  if (hostMode === next) return;
  hostMode = next;
  scheduleMode();
});

addEventListener('resize', scheduleMode);
if (portraitMq.addEventListener) portraitMq.addEventListener('change', scheduleMode);
else if (portraitMq.addListener) portraitMq.addListener(scheduleMode);
