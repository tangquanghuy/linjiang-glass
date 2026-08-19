/* Talks to 变量相关/状态栏.html.  That shell is same-origin with SillyTavern and
   owns Mvu; this page is the GitHub / Vite HUD and must not touch parent.Mvu. */

import { applyStatData } from './data.js';

export const CHANNEL = 'linjiang-hud';

const pending = new Map();
let seq = 0;
let started = false;

export function isEmbedded() {
  try { return window.parent && window.parent !== window; }
  catch { return false; }
}

function rpc(action, payload = {}) {
  if (!isEmbedded()) {
    return Promise.reject(new Error('not embedded'));
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`bridge timeout: ${action}`));
    }, 8000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    window.parent.postMessage({
      channel: CHANNEL,
      kind: 'request',
      id,
      action,
      payload,
    }, '*');
  });
}

function onMessage(event) {
  const data = event.data;
  if (!data || data.channel !== CHANNEL) return;
  if (data.kind === 'response') {
    const wait = pending.get(data.id);
    if (!wait) return;
    pending.delete(data.id);
    if (data.ok) wait.resolve(data.payload);
    else wait.reject(new Error(data.error || 'bridge error'));
    return;
  }
  if (data.kind === 'event' && data.type === 'snapshot') {
    applyStatData(data.payload?.stat_data);
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

export async function requestClockIn() {
  if (!isEmbedded()) {
    console.info('[hud] clockIn (standalone)');
    return false;
  }
  await rpc('clockIn');
  return true;
}

export function startBridge() {
  if (started) return;
  started = true;
  addEventListener('message', onMessage);
  if (!isEmbedded()) return;
  addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    let node = event.target;
    if (node && node.nodeType !== 1) node = node.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      const y = style.overflowY;
      if ((y === 'auto' || y === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
        const top = node.scrollTop;
        const atStart = top <= 0 && event.deltaY < 0;
        const atEnd = top + node.clientHeight >= node.scrollHeight - 1 && event.deltaY > 0;
        if (!atStart && !atEnd) return;
      }
      node = node.parentElement;
    }
    if (!event.deltaY && !event.deltaX) return;
    window.parent.postMessage({
      channel: CHANNEL,
      kind: 'event',
      type: 'wheel',
      payload: {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
      },
    }, '*');
  }, { passive: true });
  rpc('handshake').then(() => rpc('getSnapshot')).then((payload) => {
    applyStatData(payload?.stat_data);
  }).catch((err) => {
    console.warn('[hud] bridge', err);
  });
}
