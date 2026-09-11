/* Full-screen host portal for iframe overlays in mobile native-flow.
   ==================================================================
   In native-flow the HUD DOM lives inside a Tavern Helper message floor. Mounting
   shop/CG/arcade/map under .viewport can therefore never cover more than #chat;
   the Tavern top bar and input area remain outside that document. Trying to turn
   the whole message floor into position:fixed caused an iOS/WKWebView repaint
   failure when a cross-origin iframe was inside it.

   The stable shape is a separate fixed child of the Tavern document itself:
     Tavern document -> portal -> page iframe
   The message floor stays ordinary flow content, so no #chat geometry/filter/chrome
   mutation is needed. The portal owns only its own node and removes it on close or
   when this floor document is replaced by TT's render manager. */

const PORTAL_ID = 'linjiang-native-overlay-portal';

const PORTAL_CSS = `
  :host { all:initial; color-scheme:dark; }
  *,*::before,*::after { box-sizing:border-box; }
  .linjiang-overlay-root { position:absolute; inset:0; overflow:hidden; background:#05040a; }
  .shop-layer,.cg-layer,.arcade-layer,.map-layer {
    position:absolute !important; inset:0 !important; width:100% !important; height:100% !important;
    margin:0 !important; z-index:1 !important; overflow:hidden !important;
  }
  .shop-layer { background:#0c1024; }
  .cg-layer { background:#eef2f7; }
  .arcade-layer { background:#100d17; }
  .map-layer { background:#070a14; }
  .shop-frame,.cg-frame,.arcade-frame,.map-frame {
    display:block; width:100%; height:100%; margin:0; border:0;
  }
  .shop-frame { background:#0c1024; }
  .cg-frame { background:#eef2f7; }
  .arcade-frame { background:#100d17; }
  .map-frame { background:#070a14; touch-action:none; }
  .shop-chrome,.cg-chrome,.arcade-chrome,.map-chrome {
    position:absolute; inset:0; z-index:81; pointer-events:none;
  }
  .shop-close,.cg-close,.arcade-close,.map-close {
    pointer-events:auto; position:absolute; display:grid; place-items:center;
    cursor:pointer; -webkit-tap-highlight-color:transparent; touch-action:manipulation;
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  }
  .shop-close {
    right:max(12px,env(safe-area-inset-right,0px)); top:max(12px,env(safe-area-inset-top,0px));
    width:38px; height:38px; border:1px solid #dce7ff38; border-radius:12px;
    background:#202347d9; color:#fff; font:300 23px/1 system-ui,sans-serif;
    box-shadow:0 8px 24px #0008;
  }
  .cg-close,.arcade-close {
    top:max(13px,env(safe-area-inset-top,0px)); right:max(12px,env(safe-area-inset-right,0px));
    width:36px; height:36px; border-radius:11px; font:300 24px/1 system-ui,sans-serif;
  }
  .arcade-close {
    border:1px solid rgba(190,210,255,.22); color:rgba(226,236,255,.88);
    background:linear-gradient(168deg,rgba(44,56,100,.55),rgba(22,31,64,.68));
    box-shadow:0 8px 20px -8px rgba(2,5,16,.8),inset 0 1px 0 rgba(255,255,255,.12);
  }
  .cg-close {
    border:1px solid rgba(15,23,42,.12); color:rgba(15,23,42,.7); background:rgba(255,255,255,.86);
    box-shadow:0 8px 20px -8px rgba(15,23,42,.35),inset 0 1px 0 rgba(255,255,255,.8);
  }
  .map-close {
    top:max(16px,env(safe-area-inset-top,0px)); right:max(16px,env(safe-area-inset-right,0px));
    width:40px; height:40px; border:1px solid rgba(190,210,255,.22); border-radius:12px;
    color:rgba(226,236,255,.88); font:300 28px/1 system-ui,sans-serif;
    background:linear-gradient(168deg,rgba(44,56,100,.55),rgba(22,31,64,.68));
    box-shadow:0 8px 20px -8px rgba(2,5,16,.8),inset 0 1px 0 rgba(255,255,255,.12);
  }
`;

function directNativeBridge() {
  try {
    const bridge = window.__linjiangMobileDirectBridge;
    return bridge && typeof bridge.request === 'function' ? bridge : null;
  } catch {
    return null;
  }
}

export function hasNativeOverlayPortal() {
  if (!directNativeBridge()) return false;
  try { return !!window.top?.document?.body && window.top !== window; }
  catch { return false; }
}

function hostInsetTop(tavern, doc) {
  try {
    const raw = tavern.getComputedStyle(doc.documentElement)
      .getPropertyValue('--tt-inset-top').trim();
    const value = parseFloat(raw);
    if (Number.isFinite(value) && value > 0) return Math.round(value);
  } catch {}
  try {
    const probe = doc.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;'
      + 'height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
    doc.body.appendChild(probe);
    const height = Math.round(probe.getBoundingClientRect().height);
    probe.remove();
    if (height > 0) return height;
  } catch {}
  return 0;
}

function createPortal() {
  const bridge = directNativeBridge();
  if (!bridge) return null;
  let tavern;
  let doc;
  try {
    tavern = window.top;
    doc = tavern.document;
    if (!doc?.body || tavern === window) return null;
  } catch {
    return null;
  }

  /* One global portal. A stale node can survive an abrupt floor teardown; a new
     open always owns the slot and removes whatever was left there. */
  try { doc.getElementById(PORTAL_ID)?.remove(); } catch {}

  const host = doc.createElement('div');
  host.id = PORTAL_ID;
  host.dataset.linjiangOwner = String(bridge.owner || 'native');
  /* TauriTavern classifies unmarked fixed body children as its own mobile surfaces.
     This node owns its geometry and must stay outside that controller. */
  host.dataset.ttMobileSurface = 'none';
  host.style.cssText = [
    'position:fixed', 'left:0', 'top:0', 'width:100vw', 'height:100dvh',
    'max-width:none', 'max-height:none', 'margin:0', 'padding:0', 'border:0',
    'display:block', 'overflow:hidden', 'background:#05040a',
    'z-index:2147483647', 'pointer-events:auto', 'visibility:visible', 'opacity:1',
    'overscroll-behavior:none', 'isolation:isolate',
  ].join(';');

  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = PORTAL_CSS;
  const root = doc.createElement('div');
  root.className = 'linjiang-overlay-root';
  shadow.append(style, root);
  doc.body.appendChild(host);

  const fit = () => {
    try {
      const vv = tavern.visualViewport;
      const left = Math.round(vv?.offsetLeft || 0);
      const visualTop = Math.round(vv?.offsetTop || 0);
      const width = Math.max(1, Math.round(vv?.width || tavern.innerWidth || 1));
      const visualHeight = Math.max(1, Math.round(vv?.height || tavern.innerHeight || 1));
      /* visualViewport includes the iOS status-bar inset in TT. Cover the app below
         that inset (including Tavern's own toolbar/input area), not the phone chrome. */
      const insetTop = Math.min(hostInsetTop(tavern, doc), Math.max(0, visualHeight - 120));
      const top = visualTop + insetTop;
      const height = Math.max(1, visualHeight - insetTop);
      host.dataset.linjiangInsetTop = String(insetTop);
      host.style.setProperty('left', `${left}px`, 'important');
      host.style.setProperty('top', `${top}px`, 'important');
      host.style.setProperty('width', `${width}px`, 'important');
      host.style.setProperty('height', `${height}px`, 'important');
    } catch {}
  };
  fit();
  try {
    tavern.visualViewport?.addEventListener('resize', fit);
    tavern.visualViewport?.addEventListener('scroll', fit);
    tavern.addEventListener('resize', fit);
    tavern.addEventListener('orientationchange', fit);
  } catch {}

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      tavern.visualViewport?.removeEventListener('resize', fit);
      tavern.visualViewport?.removeEventListener('scroll', fit);
      tavern.removeEventListener('resize', fit);
      tavern.removeEventListener('orientationchange', fit);
    } catch {}
    try { host.remove(); } catch {}
    try { window.removeEventListener('pagehide', release); } catch {}
  };
  /* TT render-management can replace this entire floor document. Do not leave a
     full-screen orphan over the app if that happens between ordinary callbacks. */
  try { window.addEventListener('pagehide', release, { once: true }); } catch {}

  return { root, release, portal: true };
}

export function acquireOverlayHost(fallback) {
  const portal = createPortal();
  if (portal) return portal;
  return { root: fallback || document.body, release: () => {}, portal: false };
}
