/* HUD transport: postMessage on lifted hosts, direct adapter in mobile native-flow. */
import { applyStatData, applyMoney } from './data.js';
import { pref, setPref } from './prefs.js';

export const CHANNEL = 'linjiang-hud';
const pending = new Map();
let seq = 0;
let started = false;
let autoscrollActive = false;
let bridgeContext = { chatKey: null, epoch: 0 };
/* 壳层版本。原生流下壳层与 HUD 同文档，直接读全局；抬升架构下它随握手回包到达。
   两条路都要有：壳层是粘贴部署的，"用户手上到底是哪一版"只有它自己知道，而 HUD 是跟着
   Pages 自动更新的 —— 排查时要确认的几乎总是前者。 */
let shellVersion = (() => {
  try { return String(window.__linjiangShellVersion || ''); } catch { return ''; }
})();
export function getShellVersion() { return shellVersion; }
let pendingSnapshot = null;
let snapshotRaf = 0;

function scheduleSnapshot(payload) {
  const statData = payload?.stat_data || payload;
  if (!statData || typeof statData !== 'object') return;
  pendingSnapshot = { statData, ui: payload?.ui || {} };
  if (snapshotRaf) return;
  snapshotRaf = requestAnimationFrame(() => {
    snapshotRaf = 0;
    const next = pendingSnapshot;
    pendingSnapshot = null;
    if (next) applyStatData(next.statData, next.ui);
  });
}

const parentOrigin = (() => {
  try { return document.referrer ? new URL(document.referrer).origin : '*'; }
  catch { return '*'; }
})();

/* Mobile native-flow runs the HUD bundle directly inside Tavern Helper's srcdoc
   document. There is no inner HUD iframe in that mode, so bridge requests can call
   the same-document adapter instead of crossing postMessage. */
function directBridge() {
  const bridge = window.__linjiangMobileDirectBridge;
  return bridge && typeof bridge.request === 'function' ? bridge : null;
}

export function isEmbedded() {
  if (directBridge()) return true;
  try { return window.parent && window.parent !== window; }
  catch { return false; }
}

/* 谁算"壳层"。
   ------------------------------------------------------------------
   以前这里要求 event.source === window.parent，那是壳层还把 HUD iframe 放在自己文档里
   时候的写法。现在 外部部署/V20260826/状态栏.html 的 manager 把 HUD iframe 挂到酒馆文档上（这样
   楼层交接不会重载 HUD），于是我们的 window.parent 是酒馆顶层窗口，而说话的脚本仍然跑在
   楼层里那个状态栏 iframe 里 —— postMessage 的 source 是"调用它的那个窗口"，也就是状态栏
   iframe，既不是 parent 也不是 top。结果握手回包和 snapshot 全被丢掉，HUD 一直画 data.js
   里的样本数据。

   所以身份改由 origin + channel 认：壳层和酒馆同源，能拿到我们 contentWindow 的也只有那一
   棵框架树。只把自己发的消息排除掉。 */
function validParentMessage(event) {
  if (!isEmbedded() || !event.source || event.source === window) return false;
  return parentOrigin === '*' || event.origin === parentOrigin;
}

function sameContext(a, b) {
  if (!a || !b) return true;
  return Number(a.epoch || 0) === Number(b.epoch || 0)
    && String(a.chatKey || '') === String(b.chatKey || '');
}

let moneyChain = Promise.resolve();
let pendingMoney = null;
let moneyTimer = 0;
let moneyWaiters = [];

function settleMoneyWaiters(value) {
  const waiters = moneyWaiters;
  moneyWaiters = [];
  waiters.forEach((resolve) => resolve(value));
}

function resetContext(next) {
  const normalized = {
    chatKey: next?.chatKey == null ? null : String(next.chatKey),
    epoch: Math.max(0, Number(next?.epoch) || 0),
  };
  if (sameContext(normalized, bridgeContext)) return;
  bridgeContext = normalized;
  if (moneyTimer) clearTimeout(moneyTimer);
  moneyTimer = 0;
  pendingMoney = null;
  pendingSnapshot = null;
  if (snapshotRaf) {
    cancelAnimationFrame(snapshotRaf);
    snapshotRaf = 0;
  }
  settleMoneyWaiters(false);
  for (const [id, wait] of pending) {
    if (wait.action === 'handshake') continue;
    pending.delete(id);
    wait.reject(new Error('bridge context changed'));
  }
  moneyChain = Promise.resolve();
}

function rpc(action, payload = {}, timeoutMs = 8000) {
  const direct = directBridge();
  if (direct) {
    return Promise.resolve().then(() => direct.request(action, payload, {
      timeoutMs,
      context: { ...bridgeContext },
    }));
  }
  if (!isEmbedded()) return Promise.reject(new Error('not embedded'));
  const id = ++seq;
  const requestContext = { ...bridgeContext };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`bridge timeout: ${action}`));
    }, timeoutMs);
    pending.set(id, {
      action,
      context: requestContext,
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    window.parent.postMessage({
      channel: CHANNEL,
      kind: 'request',
      id,
      context: requestContext,
      action,
      payload,
    }, parentOrigin);
  });
}

function applyCGUnlock(payload) {
  const character = String(payload?.character || '').trim();
  const scene = String(payload?.scene || '').trim();
  const count = Math.max(1, Math.floor(Number(payload?.count) || 1));
  if (!character || !scene) return false;
  let unlocked = {};
  try { unlocked = JSON.parse(localStorage.getItem('unlocked_cg') || '{}') || {}; }
  catch { unlocked = {}; }
  if (!unlocked[character] || typeof unlocked[character] !== 'object') unlocked[character] = {};
  const previous = Number(unlocked[character][scene]) || 0;
  if (previous < count) {
    unlocked[character][scene] = count;
    try { localStorage.setItem('unlocked_cg', JSON.stringify(unlocked)); }
    catch (error) { console.warn('[hud] CG unlock storage', error); }
  }
  dispatchEvent(new CustomEvent('linjiang:cg-unlock', {
    detail: { ...payload, character, scene, count }
  }));
  return true;
}
function onMessage(event) {
  if (!validParentMessage(event)) return;
  const data = event.data;
  if (!data || data.channel !== CHANNEL) return;
  if (data.kind === 'response') {
    const wait = pending.get(data.id);
    if (!wait) return;
    pending.delete(data.id);
    if (data.context && wait.action === 'handshake') resetContext(data.context);
    if (data.context && wait.action !== 'handshake' && !sameContext(data.context, wait.context)) {
      wait.reject(new Error('stale bridge response'));
      return;
    }
    if (data.ok) wait.resolve(data.payload);
    else wait.reject(new Error(data.error || 'bridge error'));
    return;
  }
  if (data.kind === 'event' && data.type === 'context') {
    resetContext(data.context);
    return;
  }
  if (data.kind === 'event' && data.type === 'layoutMode') {
    const mode = data.payload?.mode === 'portrait' ? 'portrait' : 'landscape';
    dispatchEvent(new CustomEvent('linjiang:layout-mode', { detail: { mode } }));
    return;
  }
  if (data.kind === 'event' && data.type === 'dockState') {
    /* The top-right shrink button lives in the tavern shell. Treat it as another
       writer of the same preference as the settings row, so a shell re-render or
       full reload restores the actual last docking state. */
    const mode = data.payload?.mode === 'embedded' ? 'embedded' : 'page';
    setPref('dockDefault', mode);
    return;
  }
  if (data.kind === 'event' && data.type === 'snapshot') {
    if (data.context) resetContext(data.context);
    if (data.context && !sameContext(data.context, bridgeContext)) return;
    scheduleSnapshot(data.payload);
    return;
  }
  if (data.kind === 'event' && data.type === 'cgUnlock') {
    applyCGUnlock(data.payload);
    return;
  }
  if (data.kind === 'event' && data.type === 'autoscrollState') {
    autoscrollActive = !!data.payload?.active;
    return;
  }
  if (data.kind === 'event' && data.type === 'hostScrollState') {
    /* Low mode already removes the expensive sampling permanently. Re-toggling a
       universal selector here only causes a full style invalidation and a flash. */
    if (document.documentElement.dataset.hudPerformance === 'low'
        && document.documentElement.dataset.hudIosScroll !== '1') {
      document.documentElement.classList.remove('host-scroll-active');
      return;
    }
    const active = !!data.payload?.active;
    /* The shell's 160ms idle detector can expire between two heavily delayed
       touchScroll messages on iOS. Keep the local gesture downgrade latched until
       touchend, otherwise the expensive composition returns under the finger and
       immediately starves the next touch RAF again. */
    if (!active && document.documentElement.dataset.hudTouchForwarding === '1') return;
    document.documentElement.classList.toggle('host-scroll-active', active);
  }
}

export async function sendChat(text) {
  const next = String(text || '').trim();
  if (!next) return false;
  if (!isEmbedded()) {
    console.info('[hud] sendChat (standalone)', next);
    return false;
  }
  await rpc('sendMessage', { text: next });
  return true;
}

export async function collapseHud() {
  if (!isEmbedded()) return false;
  await rpc('collapseHud');
  return true;
}

export async function openPhone() {
  if (!isEmbedded()) {
    dispatchEvent(new CustomEvent('linjiang:open-phone'));
    return false;
  }
  await rpc('openPhone');
  return true;
}

export async function recordArcadeEvent(event) {
  if (!isEmbedded()) return { profile: null, unlocked: [] };
  return rpc('arcadeEvent', { event });
}

export async function purchaseShopProduct(product) {
  if (!isEmbedded()) throw new Error('????????????');
  return rpc('purchaseShopProduct', { product });
}

export async function saveCustomMapNode(node) {
  if (!isEmbedded()) {
    console.info('[hud] saveCustomMapNode (standalone)', node);
    return { node };
  }
  return rpc('saveCustomMapNode', { node }, 30000);
}

export async function deleteCustomMapNode(id) {
  const nodeId = String(id || '').trim();
  if (!nodeId) return false;
  if (!isEmbedded()) {
    console.info('[hud] deleteCustomMapNode (standalone)', nodeId);
    return true;
  }
  return rpc('deleteCustomMapNode', { id: nodeId }, 30000);
}

export async function requestClockIn() {
  if (!isEmbedded()) {
    console.info('[hud] clockIn (standalone)');
    return false;
  }
  await rpc('clockIn');
  return true;
}

export async function requestDevelopmentNotesGeneration(payload) {
  if (!isEmbedded()) throw new Error('评语生成只在酒馆内可用');
  return rpc('generateDevelopmentNotes', payload, 120000);
}

export async function requestDevelopmentNotesRestore(payload) {
  if (!isEmbedded()) throw new Error('评语恢复只在酒馆内可用');
  return rpc('restoreDevelopmentNotes', payload, 30000);
}
function sendMoney(n) {
  const context = { ...bridgeContext };
  moneyChain = moneyChain.then(async () => {
    if (!sameContext(context, bridgeContext)) return false;
    await rpc('patch', {
      patches: [{ op: 'replace', path: '/玩家信息/金钱', value: n }],
    });
    return true;
  }).catch((err) => {
    console.warn('[hud] setMoney', err);
    return false;
  });
  return moneyChain;
}

export function setMoney(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  applyMoney(n);
  if (!isEmbedded()) return Promise.resolve(true);
  pendingMoney = n;
  clearTimeout(moneyTimer);
  const result = new Promise((resolve) => moneyWaiters.push(resolve));
  moneyTimer = setTimeout(() => {
    moneyTimer = 0;
    const v = pendingMoney;
    pendingMoney = null;
    if (v == null) { settleMoneyWaiters(true); return; }
    sendMoney(v).then(settleMoneyWaiters);
  }, 280);
  return result;
}

export function flushMoney() {
  if (moneyTimer) clearTimeout(moneyTimer);
  moneyTimer = 0;
  if (pendingMoney == null) return moneyChain;
  const v = pendingMoney;
  pendingMoney = null;
  return sendMoney(v).then((ok) => { settleMoneyWaiters(ok); return ok; });
}

let lastPortraitH = 0;
function postEvent(type, payload) {
  const direct = directBridge();
  if (direct) {
    direct.event?.(type, payload, { context: { ...bridgeContext } });
    return;
  }
  if (!isEmbedded()) return;
  window.parent.postMessage({ channel: CHANNEL, kind: 'event', context: bridgeContext, type, payload }, parentOrigin);
}

export function reportPortraitSize(height) {
  if (!isEmbedded() || document.documentElement.classList.contains('is-page-open')) return;
  const h = Math.round(Number(height) || 0);
  if (h < 1 || h === lastPortraitH) return;
  lastPortraitH = h;
  postEvent('portraitSize', { height: h });
}

/* geometry 说的是「壳层该为这一页做多少事」。
   ==================================================================
   'page'  楼层 iframe 变成 position:fixed 铺满视口，并中和祖先的 backdrop-filter、
           藏掉宿主 chrome。这是真全屏，但它**改动酒馆文档**。
   'flow'  只把楼层高度撑到一个屏幕高，其余一概不动。不是真全屏，但对宿主零改动。

   为什么要有这个区分：iOS + TauriTavern 上，带 iframe 的覆盖层（商店/CG/街机）走 'page'
   会在打开后约 0.2 秒整屏全黑 —— 连挂在**酒馆文档**里的诊断条都一起消失，也就是整个 WebView
   停止了绘制。而纯 DOM 的次级页面（日程、档案）走同一条 'page' 一直正常。
   两者的差别是里面有没有一个跨源 iframe。

   所以带 iframe 的那几个先退到 'flow'：把手从酒馆文档上拿开，代价是它们不再是真全屏。
   真全屏的正确做法是把覆盖层挂到酒馆 body 下当子节点（那才是根层叠上下文，能盖住顶栏而
   不需要藏任何东西，而且嵌套层数从 3 降到 2）—— 那条路还没建好。 */
export function reportPortraitPage(open, { geometry = 'page' } = {}) {
  if (!isEmbedded()) return;
  if (!open) lastPortraitH = 0;
  postEvent('portraitPage', { open: !!open, geometry });
}

/* 横向构图开了铺满视口的覆盖层（地图 / 街机 / CG）。
   ------------------------------------------------------------------
   壳层那两颗浮层钮（全屏、收回嵌入框）是注入到**酒馆顶层文档**里的，全屏时 z-index
   高到 2147483646 —— HUD 内部的层级管不到它们，于是它们压在覆盖层自己右上角的关闭钮
   上面，地图关不掉。竖屏早就有这条通报（reportPortraitPage → layoutPortraitPage →
   hideChromeButtons），横向一直没有，这一个就是补上它。

   只报开合，不带尺寸：横向的排版跟覆盖层无关，壳层要做的只是把两颗钮收起来。 */
let lastOverlay = null;
let lastOverlayPage = null;
export function reportOverlay(open, { page = false } = {}) {
  if (!isEmbedded()) return;
  const next = !!open;
  const isPage = !!page;
  if (next === lastOverlay && isPage === lastOverlayPage) return;
  lastOverlay = next;
  lastOverlayPage = isPage;
  postEvent('overlay', { open: next, page: isPage });
}

/* 默认停靠方式住在 HUD 这边的 localStorage 里，而决定停靠的代码在壳层
   （外部部署/V20260826/状态栏.html）。两边不同源，壳层读不到，所以只能由 HUD 通报。

   `apply` 区分的是两种完全不同的意图，壳层也据此分别处理：
     false —— 开机通报。壳层只在本会话还没被手动干预时采纳，采纳一次就不再听。
     true  —— 用户刚在设置里改的。立即生效，包括把手动切换过的状态掰回来。 */
export function reportDockDefault(mode, { apply = false } = {}) {
  if (!isEmbedded()) return;
  postEvent('dockDefault', {
    mode: mode === 'embedded' ? 'embedded' : 'page',
    apply: !!apply,
  });
}

export function startBridge() {
  if (started) return;
  started = true;
  if (isEmbedded()) document.documentElement.classList.add('is-embedded');
  addEventListener('message', onMessage);
  if (!isEmbedded()) return;

  const finishStartup = () => {
    rpc('handshake').then((hello) => {
      if (hello?.context) resetContext(hello.context);
      if (hello?.shellVersion) shellVersion = String(hello.shellVersion);
      /* Native-flow has no docking geometry to configure. Keeping the preference in
         storage is harmless, but sending it would wake the desktop layout state machine. */
      if (!directBridge()) reportDockDefault(pref('dockDefault'));
      return rpc('getSnapshot');
    }).then((payload) => scheduleSnapshot(payload)).catch((err) => {
      console.warn('[hud] bridge', err);
    });
  };

  /* In native-flow the HUD DOM is already part of the Tavern Helper document. Let
     Chrome perform ordinary scroll chaining; installing touch/wheel forwarding here
     would recreate the exact cross-frame feedback loop this mode is meant to remove. */
  if (directBridge()) {
    finishStartup();
    return;
  }

  const postPointerEvent = (type, point) => postEvent(type, {
    clientX: point.clientX,
    clientY: point.clientY,
  });
  addEventListener('mousedown', (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    postPointerEvent('autoscrollToggle', event);
  }, { capture: true, passive: false });
  addEventListener('auxclick', (event) => {
    if (event.button === 1) event.preventDefault();
  }, { capture: true, passive: false });

  let pointerTick = 0;
  let pointer = null;
  addEventListener('mousemove', (event) => {
    if (!autoscrollActive) return;
    pointer = { clientX: event.clientX, clientY: event.clientY };
    if (pointerTick) return;
    pointerTick = requestAnimationFrame(() => {
      pointerTick = 0;
      if (pointer) postPointerEvent('autoscrollMove', pointer);
    });
  }, { passive: true });

  /* Touch gestures do not bubble out of an iframe. Forward vertical drags that
     the HUD itself cannot consume so a phone can keep scrolling the tavern
     reading pane even when the fixed HUD covers most of the viewport. */
  let iosTouchScrollIdleTimer = 0;
  const setIosTouchScrollActive = (active) => {
    if (document.documentElement.dataset.hudIosScroll !== '1') return;
    clearTimeout(iosTouchScrollIdleTimer);
    iosTouchScrollIdleTimer = 0;
    if (active) {
      document.documentElement.dataset.hudTouchForwarding = '1';
      document.documentElement.classList.add('host-scroll-active');
      return;
    }
    delete document.documentElement.dataset.hudTouchForwarding;
    iosTouchScrollIdleTimer = setTimeout(() => {
      iosTouchScrollIdleTimer = 0;
      document.documentElement.classList.remove('host-scroll-active');
    }, 180);
  };

  const touchScroll = {
    id: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    axis: null,
    forwarding: false,
    pendingY: 0,
    pendingPoint: null,
    pendingGestureStart: false,
    raf: 0,
  };
  const resetTouchScroll = (keepPending = false) => {
    touchScroll.id = null;
    touchScroll.axis = null;
    touchScroll.forwarding = false;
    if (!keepPending) {
      touchScroll.pendingY = 0;
      touchScroll.pendingPoint = null;
      touchScroll.pendingGestureStart = false;
      if (touchScroll.raf) cancelAnimationFrame(touchScroll.raf);
      touchScroll.raf = 0;
    }
  };
  const touchById = (list, id) => {
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].identifier === id) return list[i];
    }
    return null;
  };
  const elementCanConsumeTouch = (element, deltaY) => {
    if (!(element instanceof Element) || !deltaY) return false;
    const root = document.scrollingElement || document.documentElement;
    const isRoot = element === root || element === document.documentElement || element === document.body;
    let overflowY = '';
    try { overflowY = getComputedStyle(element).overflowY; } catch { return false; }
    if (isRoot) {
      if (overflowY === 'hidden' || overflowY === 'clip') return false;
    } else if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') return false;
    const max = Math.max(0, element.scrollHeight - element.clientHeight);
    if (max <= 1) return false;
    return deltaY > 0 ? element.scrollTop < max - 1 : element.scrollTop > 1;
  };
  const hudTouchScroller = (event, deltaY) => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    const seen = new Set();
    for (const candidate of path) {
      if (!(candidate instanceof Element) || seen.has(candidate)) continue;
      seen.add(candidate);
      if (elementCanConsumeTouch(candidate, deltaY)) return candidate;
    }
    const root = document.scrollingElement || document.documentElement;
    return !seen.has(root) && elementCanConsumeTouch(root, deltaY) ? root : null;
  };
  const hudCanConsumeTouch = (event, deltaY) => !!hudTouchScroller(event, deltaY);
  const queueTouchScroll = (point, deltaY, gestureStart = false) => {
    touchScroll.pendingY += deltaY;
    touchScroll.pendingPoint = { clientX: point.clientX, clientY: point.clientY };
    touchScroll.pendingGestureStart ||= gestureStart;
    if (touchScroll.raf) return;
    touchScroll.raf = requestAnimationFrame(() => {
      touchScroll.raf = 0;
      const dy = touchScroll.pendingY;
      const current = touchScroll.pendingPoint;
      const gestureStart = touchScroll.pendingGestureStart;
      touchScroll.pendingY = 0;
      touchScroll.pendingPoint = null;
      touchScroll.pendingGestureStart = false;
      if (!current || Math.abs(dy) < 0.01) return;
      postEvent('touchScroll', {
        deltaX: 0,
        deltaY: dy,
        deltaMode: 0,
        clientX: current.clientX,
        clientY: current.clientY,
        gestureStart,
      });
    });
  };
  addEventListener('touchstart', (event) => {
    if (lastOverlay || document.documentElement.classList.contains('is-page-open') || event.touches.length !== 1) {
      resetTouchScroll();
      return;
    }
    const touch = event.touches[0];
    touchScroll.id = touch.identifier;
    /* clientY is relative to this iframe's viewport. The fixed HUD moves while
       the forwarded gesture scrolls the host, so clientY jumps back and forth
       even when the finger moves in one direction. screenX/screenY stay in the
       device coordinate space and remain monotonic for the whole gesture. */
    const touchX = Number.isFinite(touch.screenX) ? touch.screenX : touch.clientX;
    const touchY = Number.isFinite(touch.screenY) ? touch.screenY : touch.clientY;
    touchScroll.startX = touchScroll.lastX = touchX;
    touchScroll.startY = touchScroll.lastY = touchY;
    touchScroll.axis = null;
    touchScroll.forwarding = false;
  }, { capture: true, passive: true });
  addEventListener('touchmove', (event) => {
    if (touchScroll.id == null || event.touches.length !== 1) return;
    const touch = touchById(event.touches, touchScroll.id);
    if (!touch) return;
    const touchX = Number.isFinite(touch.screenX) ? touch.screenX : touch.clientX;
    const touchY = Number.isFinite(touch.screenY) ? touch.screenY : touch.clientY;
    const totalX = touchX - touchScroll.startX;
    const totalY = touchY - touchScroll.startY;
    if (!touchScroll.axis) {
      if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 6) return;
      touchScroll.axis = Math.abs(totalY) >= Math.abs(totalX) ? 'y' : 'x';
    }
    const deltaY = touchScroll.lastY - touchY;
    touchScroll.lastX = touchX;
    touchScroll.lastY = touchY;
    if (touchScroll.axis !== 'y' || !deltaY) return;
    if (!touchScroll.forwarding && hudCanConsumeTouch(event, deltaY)) return;
    const gestureStart = !touchScroll.forwarding;
    touchScroll.forwarding = true;
    if (gestureStart) setIosTouchScrollActive(true);
    if (event.cancelable) event.preventDefault();
    queueTouchScroll(touch, deltaY, gestureStart);
  }, { capture: true, passive: false });
  addEventListener('touchend', (event) => {
    if (touchScroll.id == null || touchById(event.touches, touchScroll.id)) return;
    if (touchScroll.forwarding) postEvent('touchScrollEnd', {});
    setIosTouchScrollActive(false);
    resetTouchScroll(true);
  }, { capture: true, passive: true });
  addEventListener('touchcancel', () => {
    if (touchScroll.forwarding) postEvent('touchScrollEnd', {});
    setIosTouchScrollActive(false);
    resetTouchScroll();
  }, { capture: true, passive: true });

  /* Chrome device emulation only produces TouchEvents when its touch mapping is
     enabled before the page loads. In responsive mode (or when the mapping toggle is
     off), dragging the circular/arrow cursor is an ordinary mouse drag: browsers do
     not scroll pages for that gesture, and the touch bridge above never sees it.

     Mirror the two gestures the mobile HUD already exposes, only for a real mouse:
       - horizontal drag on an overflow-x rail scrolls that rail;
       - vertical drag scrolls an internal page, or forwards to the tavern reading pane.
     Touch-generated compatibility mouse events advertise firesTouchEvents and are
     ignored, otherwise one finger would be handled twice. */
  const mouseDragScroll = {
    active: false,
    axis: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    horizontal: null,
    forwarding: false,
    consumed: false,
    suppressClick: false,
  };
  const eventElements = (event) => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    return path.filter((candidate) => candidate instanceof Element);
  };
  const horizontalScroller = (event) => {
    for (const element of eventElements(event)) {
      let overflowX = '';
      try { overflowX = getComputedStyle(element).overflowX; } catch { continue; }
      if ((overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay')
          && element.scrollWidth > element.clientWidth + 1) return element;
    }
    return null;
  };
  const resetMouseDragScroll = () => {
    mouseDragScroll.active = false;
    mouseDragScroll.axis = null;
    mouseDragScroll.horizontal = null;
    mouseDragScroll.forwarding = false;
    mouseDragScroll.consumed = false;
  };
  addEventListener('mousedown', (event) => {
    if (!isEmbedded() || event.button !== 0 || event.sourceCapabilities?.firesTouchEvents) return;
    if (lastOverlay) return;
    mouseDragScroll.active = true;
    mouseDragScroll.axis = null;
    mouseDragScroll.startX = mouseDragScroll.lastX = event.clientX;
    mouseDragScroll.startY = mouseDragScroll.lastY = event.clientY;
    mouseDragScroll.horizontal = horizontalScroller(event);
    mouseDragScroll.forwarding = false;
    mouseDragScroll.consumed = false;
  }, { capture: true, passive: true });
  addEventListener('mousemove', (event) => {
    if (!mouseDragScroll.active || !(event.buttons & 1)) return;
    const totalX = event.clientX - mouseDragScroll.startX;
    const totalY = event.clientY - mouseDragScroll.startY;
    if (!mouseDragScroll.axis) {
      if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 6) return;
      mouseDragScroll.axis = Math.abs(totalY) >= Math.abs(totalX) ? 'y' : 'x';
    }
    const deltaX = mouseDragScroll.lastX - event.clientX;
    const deltaY = mouseDragScroll.lastY - event.clientY;
    mouseDragScroll.lastX = event.clientX;
    mouseDragScroll.lastY = event.clientY;

    if (mouseDragScroll.axis === 'x') {
      const scroller = mouseDragScroll.horizontal;
      if (!scroller || !deltaX) return;
      const before = scroller.scrollLeft;
      scroller.scrollLeft += deltaX;
      if (Math.abs(scroller.scrollLeft - before) < 0.01) return;
      mouseDragScroll.consumed = true;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!deltaY) return;
    const internal = hudTouchScroller(event, deltaY);
    if (internal) {
      const before = internal.scrollTop;
      internal.scrollTop += deltaY;
      if (Math.abs(internal.scrollTop - before) < 0.01) return;
      mouseDragScroll.consumed = true;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (document.documentElement.classList.contains('is-page-open')) return;
    const gestureStart = !mouseDragScroll.forwarding;
    mouseDragScroll.forwarding = true;
    mouseDragScroll.consumed = true;
    event.preventDefault();
    event.stopPropagation();
    queueTouchScroll(event, deltaY, gestureStart);
  }, { capture: true, passive: false });
  addEventListener('mouseup', (event) => {
    if (!mouseDragScroll.active || event.button !== 0) return;
    if (mouseDragScroll.forwarding) postEvent('touchScrollEnd', {});
    if (mouseDragScroll.consumed) {
      mouseDragScroll.suppressClick = true;
      event.preventDefault();
      event.stopPropagation();
    }
    resetMouseDragScroll();
  }, { capture: true, passive: false });
  addEventListener('blur', resetMouseDragScroll);
  addEventListener('click', (event) => {
    if (!mouseDragScroll.suppressClick) return;
    mouseDragScroll.suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, passive: false });

  addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    for (const candidate of path) {
      if (!(candidate instanceof Element) || candidate === document.body) continue;
      const y = getComputedStyle(candidate).overflowY;
      if ((y === 'auto' || y === 'scroll') && candidate.scrollHeight > candidate.clientHeight + 1) {
        const atStart = candidate.scrollTop <= 0 && event.deltaY < 0;
        const atEnd = candidate.scrollTop + candidate.clientHeight >= candidate.scrollHeight - 1 && event.deltaY > 0;
        if (!atStart && !atEnd) return;
      }
    }
    if (!event.deltaY && !event.deltaX) return;
    event.preventDefault();
    postEvent('wheel', {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }, { passive: false });

  finishStartup();
}
