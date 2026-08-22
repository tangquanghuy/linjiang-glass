/* Cross-origin bridge between the HUD and the same-origin tavern deployment shell. */
import { applyStatData, applyMoney } from './data.js';
import { pref } from './prefs.js';

export const CHANNEL = 'linjiang-hud';
const pending = new Map();
let seq = 0;
let started = false;
let autoscrollActive = false;
let bridgeContext = { chatKey: null, epoch: 0 };

const parentOrigin = (() => {
  try { return document.referrer ? new URL(document.referrer).origin : '*'; }
  catch { return '*'; }
})();

export function isEmbedded() {
  try { return window.parent && window.parent !== window; }
  catch { return false; }
}

function validParentMessage(event) {
  if (!isEmbedded() || event.source !== window.parent) return false;
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
  settleMoneyWaiters(false);
  for (const [id, wait] of pending) {
    if (wait.action === 'handshake') continue;
    pending.delete(id);
    wait.reject(new Error('bridge context changed'));
  }
  moneyChain = Promise.resolve();
}

function rpc(action, payload = {}) {
  if (!isEmbedded()) return Promise.reject(new Error('not embedded'));
  const id = ++seq;
  const requestContext = { ...bridgeContext };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`bridge timeout: ${action}`));
    }, 8000);
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
  if (data.kind === 'event' && data.type === 'snapshot') {
    if (data.context) resetContext(data.context);
    if (data.context && !sameContext(data.context, bridgeContext)) return;
    applyStatData(data.payload?.stat_data);
    return;
  }
  if (data.kind === 'event' && data.type === 'autoscrollState') {
    autoscrollActive = !!data.payload?.active;
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

export async function requestClockIn() {
  if (!isEmbedded()) {
    console.info('[hud] clockIn (standalone)');
    return false;
  }
  await rpc('clockIn');
  return true;
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
  }).then((payload) => applyStatData(payload?.stat_data)).catch((err) => {
    console.warn('[hud] bridge', err);
  });
}
