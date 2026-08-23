/* Player preferences.
   ------------------------------------------------------------------
   One store, in localStorage, alongside the pinned-characters list content.js keeps.
   These are choices about the interface rather than game state, so they belong to the
   reader and not to a save: pinning a character or preferring the drawer should hold
   across reloads and across the two layouts.

   Deliberately not a settings object passed down through mount calls.  inventoryOpen
   is read by the landscape 背包 button; a subscription is the only shape that lets
   the store meet a shell that is mounted once at boot. */

const KEY = 'glass-hud-prefs';

const DEFAULTS = {
  /* What the 背包 tool button opens.  The drawer is the default because it keeps the
     scene visible, which matters when carrying a particular item is a precondition an
     event reads -- but browsing icons is not everyone's idea of browsing, so the full
     page has to stay one click away from the button rather than two. */
  inventoryOpen: 'drawer',
  /* 挂进酒馆时 HUD 默认怎么停靠。'page' 是一直以来的行为：铺成 90vw 的浮层，宽度按
     视口来，不受消息楼层的窄栏限制。'embedded' 则一开始就待在消息楼层那个嵌入框里，
     等于开局就替你按了一次右上角的缩小钮。

     两点值得说明，因为它们决定了这个选项的边界：
       1. 只有桌面宽度分得清这两种状态。竖屏和窄屏本来就一直待在栏位里
          （见 状态栏.html 的 fitParentFrame：compacted 分支带 isDesktop() 条件），
          所以在手机上改这个值不会有任何可见变化。
       2. 这是"默认值"，不是"当前状态"。缩小钮照旧随时能临时切换，而且手动切过之后
          本会话就不再被这个默认值覆盖——手动操作应该盖过偏好设置，不是反过来。

     壳层与 HUD 不同源，读不到这里的 localStorage，所以这个值是 HUD 开机后通过
     postMessage 通报过去的（bridge.js 的 reportDockDefault）。 */
  dockDefault: 'page',
  /* Disable backdrop sampling on weaker devices while preserving fills, edges and layout. */
  performanceMode: 'auto',
};

/* The label pairs live here rather than in the page so the enum and the control that
   writes it cannot drift apart. */
export const PREF_CHOICES = {
  inventoryOpen: [
    ['drawer', '底部抽屉'],
    ['page', '直接全屏'],
  ],
  dockDefault: [
    ['page', '适配宽度'],
    ['embedded', '收进嵌入框'],
  ],
  performanceMode: [
    ['auto', '完整效果'],
    ['low', '低负载'],
  ],
};

const state = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  /* Only keys we know about, and only values in their enum: a store written by an
     older build must not be able to put the UI in a state it cannot render. */
  for (const [name, value] of Object.entries(saved)) {
    const choices = PREF_CHOICES[name];
    if (name in DEFAULTS && (!choices || choices.some(([v]) => v === value))) state[name] = value;
  }
} catch { /* a corrupt store is not worth failing boot over */ }

const listeners = new Set();

export function pref(name) { return state[name]; }

export function setPref(name, value) {
  if (!(name in DEFAULTS) || state[name] === value) return;
  state[name] = value;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  listeners.forEach((fn) => fn(name, value));
}

export function onPref(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
