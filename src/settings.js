/* 全局设置 —— 界面偏好的那一页。
   ------------------------------------------------------------------
   为什么是共享模块而不是各写一遍：这一页两个构图（landscape / portrait）都要有，
   而它的内容不是排版，是"有哪些选项、每个选项有哪些值、选中的是哪个"。这部分一旦
   抄成两份，加一个选项就得改两处，而漏掉一处的表现是"手机上没有这个开关"——
   一种很难被发现的 bug。所以这里出的是行数据和一段行标记，两边的页面各自套自己的
   外壳（landscape 的 pageShell、portrait 的 .ppanel），差异交给 CSS。

   prefs.js 已经存着值和枚举了，这里只补两样它没有的东西：给人读的标题/说明，
   以及"改完之后除了写 store 还要做什么"。 */

import { PREF_CHOICES, onPref, pref, setPref } from './prefs.js';
import { reportDockDefault } from './bridge.js';

/* 面向用户只说明选项带来的直接差别。开发约束留在实现注释中，不放进设置卡片。 */
export const SETTINGS_ROWS = [
  {
    name: 'dockDefault',
    en: 'HUD docking',
    label: 'HUD 停靠方式',
    note: '适配宽度可最大展示状态栏；收进嵌入框对性能更友好。',
    hint: '',
  },
  {
    name: 'inventoryOpen',
    en: 'Bag button',
    label: '背包按钮',
    note: '底部抽屉方便快速查看；直接全屏适合完整浏览背包。',
    hint: '',
  },
  {
    name: 'performanceMode',
    en: 'Visual performance',
    label: '视觉性能模式',
    note: '完整效果保留玻璃质感；低负载模式运行更流畅。',
    hint: '',
  },
];

/* 一行 = 说明 + 一组互斥按钮。用 role=radiogroup / role=radio 而不是一堆普通按钮：
   这确实是"从几个里选一个"，读屏器需要知道当前选中的是哪个，光靠 is-on 的样式说不出来。 */
export function settingsBody() {
  return SETTINGS_ROWS.map((row) => {
    const choices = PREF_CHOICES[row.name] || [];
    const current = pref(row.name);
    const options = choices.map(([value, label]) => {
      const on = value === current;
      return `<button class="set-opt${on ? ' is-on' : ''}" type="button" role="radio"
          aria-checked="${on ? 'true' : 'false'}" data-pref-set="${row.name}"
          data-pref-value="${value}">${label}</button>`;
    }).join('');
    return `
      <div class="set-row">
        <div class="set-copy">
          <span>${row.en}</span>
          <b>${row.label}</b>
          <p>${row.note}</p>
        </div>
        <div class="set-side">
          <div class="set-seg" role="radiogroup" aria-label="${row.label}">${options}</div>
          ${row.hint ? `<em class="set-hint">${row.hint}</em>` : ''}
        </div>
      </div>`;
  }).join('');
}

/* 点一下只改一个值，所以不重建整页：把 is-on 和 aria-checked 挪到被点的那颗上就够了。
   重建的代价是白丢一次滚动位置和焦点，而这一页的其他内容一个字都不会因为这次点击而变。

   返回值告诉调用方"这次点击已经被消化掉了"，好让两个构图各自的事件委托能照它们
   既有的写法 early-return，而不是在这里反过来了解页面结构。 */
export function applyPrefClick(target) {
  const opt = target?.closest?.('[data-pref-set]');
  if (!opt) return false;
  const name = opt.dataset.prefSet;
  const value = opt.dataset.prefValue;
  setPref(name, value);
  opt.closest('.set-seg')?.querySelectorAll('[data-pref-set]').forEach((btn) => {
    const on = btn === opt;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  /* 停靠方式要立刻推给壳层。注意这里不只依赖 onPref 订阅：点已经选中的那颗时 setPref
     不会触发监听（值没变），但壳层的当前布局仍可能需要重新套用，所以通报始终发送。 */
  if (name === 'dockDefault') reportDockDefault(value, { apply: true });
  return true;
}


/* The shell-side shrink button can change dockDefault without a click inside this
   document. Keep any mounted landscape/portrait settings page truthful in place. */
onPref((name, value) => {
  document.querySelectorAll(`[data-pref-set="${name}"]`).forEach((btn) => {
    const on = btn.dataset.prefValue === value;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
});
