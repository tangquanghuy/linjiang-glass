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
  /* 挂进酒馆时 HUD 怎么停靠。'page' 铺成按视口宽度计算的浮层；'embedded' 把
     HUD 收到消息楼层的嵌入框宽度里。这个值就是面板右上角“收回嵌入框”按钮的持久化
     状态，不是另设的一份开机默认值：设置页和右上角按钮无论从哪边修改，都写回这里。

     只有桌面宽度分得清这两种布局。竖屏和窄屏本来就一直待在栏位里（见状态栏.html 的
     fitParentFrame），所以在手机上修改后会被记住，但要回到桌面宽度才看得出差别。

     壳层与 HUD 不同源，读不到这里的 localStorage。HUD 开机时通过 postMessage 把值通报
     给壳层；右上角按钮则反向把新状态发回 HUD，由这里落盘。 */
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

/* 哪些键是**用户真的存过**的。
   ------------------------------------------------------------------
   有些默认值该跟着宿主走（比如手机上默认低负载），但一旦用户自己在设置页里选过，就必须
   听用户的。`pref()` 分不出"默认恰好等于 auto"和"用户明确选了 auto"，所以需要这一份。
   只在启动时按实际读到的键填一次，setPref 时补登记。 */
const storedKeys = new Set(Object.keys((() => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
})()).filter((name) => name in DEFAULTS));
export function prefStored(name) { return storedKeys.has(name); }

const listeners = new Set();

export function pref(name) { return state[name]; }

export function setPref(name, value) {
  if (!(name in DEFAULTS)) return;
  const changed = state[name] !== value;
  /* 第一次明确选择也要通知一遍，哪怕值跟默认值相同。
     否则会出现这种情况：手机上默认低负载（因为没存过），用户点「完整效果」——而它的值恰好
     就是默认的 'auto'，于是旧写法在这里直接 return，界面上按钮亮了、玻璃却没变回来。 */
  const firstTime = !storedKeys.has(name);
  if (!changed && !firstTime) return;
  state[name] = value;
  storedKeys.add(name);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  listeners.forEach((fn) => fn(name, value));
}

export function onPref(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
