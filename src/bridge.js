/* Cross-origin bridge between the HUD and the same-origin tavern deployment shell. */
import { applyStatData, applyMoney } from './data.js';
import { pref, setPref } from './prefs.js';

export const CHANNEL = 'linjiang-hud';
const pending = new Map();
let seq = 0;
let started = false;
let autoscrollActive = false;
let bridgeContext = { chatKey: null, epoch: 0 };
let pendingSnapshot = null;
let snapshotRaf = 0;

function scheduleSnapshot(statData) {
  if (!statData || typeof statData !== 'object') return;
  pendingSnapshot = statData;
  if (snapshotRaf) return;
  snapshotRaf = requestAnimationFrame(() => {
    snapshotRaf = 0;
    const next = pendingSnapshot;
    pendingSnapshot = null;
    if (next) applyStatData(next);
  });
}

const parentOrigin = (() => {
  try { return document.referrer ? new URL(document.referrer).origin : '*'; }
  catch { return '*'; }
})();

export function isEmbedded() {
  try { return window.parent && window.parent !== window; }
  catch { return false; }
}

/* 谁算"壳层"。
   ------------------------------------------------------------------
   以前这里要求 event.source === window.parent，那是壳层还把 HUD iframe 放在自己文档里
   时候的写法。现在 外部部署/状态栏.html 的 manager 把 HUD iframe 挂到酒馆文档上（这样
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
    scheduleSnapshot(data.payload?.stat_data);
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
    document.documentElement.classList.toggle('host-scroll-active', !!data.payload?.active);
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

export function reportPortraitPage(open) {
  if (!isEmbedded()) return;
  if (!open) lastPortraitH = 0;
  postEvent('portraitPage', { open: !!open });
}

/* 横向构图开了铺满视口的覆盖层（地图 / 街机 / CG）。
   ------------------------------------------------------------------
   壳层那两颗浮层钮（全屏、收回嵌入框）是注入到**酒馆顶层文档**里的，全屏时 z-index
   高到 2147483646 —— HUD 内部的层级管不到它们，于是它们压在覆盖层自己右上角的关闭钮
   上面，地图关不掉。竖屏早就有这条通报（reportPortraitPage → layoutPortraitPage →
   hideChromeButtons），横向一直没有，这一个就是补上它。

   只报开合，不带尺寸：横向的排版跟覆盖层无关，壳层要做的只是把两颗钮收起来。 */
let lastOverlay = null;
export function reportOverlay(open) {
  if (!isEmbedded()) return;
  const next = !!open;
  if (next === lastOverlay) return;
  lastOverlay = next;
  postEvent('overlay', { open: next });
}

/* 默认停靠方式住在 HUD 这边的 localStorage 里，而决定停靠的代码在壳层
   （外部部署/状态栏.html）。两边不同源，壳层读不到，所以只能由 HUD 通报。

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
  const hudCanConsumeTouch = (event, deltaY) => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    const seen = new Set();
    for (const candidate of path) {
      if (!(candidate instanceof Element) || seen.has(candidate)) continue;
      seen.add(candidate);
      if (elementCanConsumeTouch(candidate, deltaY)) return true;
    }
    const root = document.scrollingElement || document.documentElement;
    return !seen.has(root) && elementCanConsumeTouch(root, deltaY);
  };
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
    if (event.cancelable) event.preventDefault();
    queueTouchScroll(touch, deltaY, gestureStart);
  }, { capture: true, passive: false });
  addEventListener('touchend', (event) => {
    if (touchScroll.id == null || touchById(event.touches, touchScroll.id)) return;
    if (touchScroll.forwarding) postEvent('touchScrollEnd', {});
    resetTouchScroll(true);
  }, { capture: true, passive: true });
  addEventListener('touchcancel', () => {
    if (touchScroll.forwarding) postEvent('touchScrollEnd', {});
    resetTouchScroll();
  }, { capture: true, passive: true });

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

  rpc('handshake').then((hello) => {
    if (hello?.context) resetContext(hello.context);
    /* 握手之后立刻通报默认停靠方式：壳层已经按它自己的默认排过一次版了，这一步
       是把 HUD 侧的偏好补上。放在 getSnapshot 之前，好让重排和首帧数据一起落地，
       而不是先画好再跳一次。 */
    reportDockDefault(pref('dockDefault'));
    return rpc('getSnapshot');
  }).then((payload) => scheduleSnapshot(payload?.stat_data)).catch((err) => {
    console.warn('[hud] bridge', err);
  });
}
