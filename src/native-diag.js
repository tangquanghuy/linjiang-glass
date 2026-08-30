/* 真机诊断条（临时仪器，查清 iOS/TT 黑屏与顶部截断后删掉）。
   ==================================================================
   为什么需要它：iOS + TauriTavern 上「点商店整屏黑」「次级面板被顶栏高度截断」在夹具里
   一个都复现不出来。我已经连续三个假设被真机否掉（WebKit 三层嵌套不绘制、内存不足、
   相对地址解析错源 —— 最后一个是真 bug 且已修，但不是这两个现象的成因）。
   继续猜的成本是用户每次都要在自己唯一一台手机上重装重试，不可接受。

   所以这一条的职责是：**在黑屏发生的那一刻，把我需要的数字直接画在屏幕上。**

   设计约束（都是为了它自己绝不会跟着变黑）：
     · 纯 DOM，不加载任何外部资源、不套 iframe
     · 自己的 z-index 高于覆盖层，底色不透明
     · 自带一个一定能用的关闭钮（不依赖被测那条路的任何东西）
     · 只在原生流下出现，桌面和独立预览完全不受影响 */

const ID = 'linjiang-native-diag';

const px = (n) => (Number.isFinite(n) ? Math.round(n) : '?');

/* 楼层文档与酒馆同源（srcdoc 继承父源），所以 frameElement 和 parent.document 都读得到。
   每一项都单独 try：任何一项读不到也不能让整块诊断消失。 */
function collect(iframe, loadState) {
  const out = [];
  const add = (k, v) => out.push([k, v]);

  add('架构', (() => { try { return window.__linjiangNativeFlow ? '原生流' : '抬升'; } catch (e) { return '?'; } })());
  add('HUD来源', (() => { try { return String(window.__linjiangHudBase || '(未注入)'); } catch (e) { return '?'; } })());
  add('本文档baseURI', String(document.baseURI));

  try {
    add('商店src', String(iframe?.src || '-'));
    add('商店加载', loadState.state + (loadState.detail ? ` (${loadState.detail})` : ''));
    const r = iframe?.getBoundingClientRect();
    add('商店框', r ? `${px(r.width)}x${px(r.height)} @${px(r.left)},${px(r.top)}` : '-');
    let inner = '(读不到)';
    try { inner = iframe.contentDocument ? `同源 body节点=${iframe.contentDocument.body?.querySelectorAll('*').length ?? -1}` : '跨源(正常)'; }
    catch (e) { inner = `跨源(${e.name})`; }
    add('商店内页', inner);
  } catch (e) { add('商店', `读取失败 ${e.name}`); }

  try {
    const fe = window.frameElement;
    if (fe) {
      const cs = getComputedStyle(fe);
      const r = fe.getBoundingClientRect();
      add('楼层定位', `${cs.position} z=${cs.zIndex}`);
      add('楼层框', `${px(r.width)}x${px(r.height)} @${px(r.left)},${px(r.top)}`);
      add('楼层高度样式', fe.style.height || '(无)');
    } else add('楼层', '(拿不到 frameElement)');
  } catch (e) { add('楼层', `读取失败 ${e.name}`); }

  try {
    const tav = window.parent;
    const vv = tav.visualViewport;
    add('酒馆视口', `inner ${px(tav.innerWidth)}x${px(tav.innerHeight)}  visual ${px(vv?.width)}x${px(vv?.height)} offTop=${px(vv?.offsetTop)}`);
    const tdoc = tav.document;
    for (const id of ['top-bar', 'form_sheld', 'sheld', 'chat']) {
      const el = tdoc.getElementById(id);
      if (!el) { add(`#${id}`, '(没有)'); continue; }
      const cs = tav.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      add(`#${id}`, `${cs.visibility} ${cs.position} ${px(r.width)}x${px(r.height)}@${px(r.left)},${px(r.top)}`
        + (id === 'chat' ? ` bf=${cs.backdropFilter}` : ''));
    }
    const de = tdoc.documentElement;
    add('安全区/顶栏变量', ['--tt-inset-top', '--topBarBlockSize', '--tt-base-viewport-height', '--doc-height']
      .map((v) => `${v.replace('--tt-', '').replace('--', '')}=${tav.getComputedStyle(de).getPropertyValue(v).trim() || '-'}`)
      .join(' '));
  } catch (e) { add('酒馆', `读取失败 ${e.name}（跨源？）`); }

  try {
    add('整页记号', document.documentElement.dataset.linjiangNativePage || '(无)');
    add('残留记号数', String(window.parent.document.querySelectorAll('[data-linjiang-cb-saved],[data-linjiang-floor-saved]').length));
  } catch (e) { /* 上面那条已经报过跨源了 */ }

  return out;
}

export function mountNativeDiag(iframe, { onClose } = {}) {
  let native = false;
  try { native = !!window.__linjiangNativeFlow; } catch (e) { native = false; }
  if (!native) return () => {};

  document.getElementById(ID)?.remove();
  const box = document.createElement('div');
  box.id = ID;
  /* 内联样式：不依赖任何样式表，样式表本身也可能加载失败。 */
  box.style.cssText = [
    /* 贴底、按钮靠左：商店自己的关闭钮在右上角，贴顶会正好压在它上面 ——
       回归里 [data-shop-close] 因此永远过不了 Playwright 的命中检测，真机上也点不到。 */
    'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483647',
    'background:#0b1220', 'color:#d8e2ff', 'border-top:2px solid #4ea1ff',
    'font:500 11px/1.45 ui-monospace,Menlo,Consolas,monospace',
    'padding:8px 10px 10px', 'box-sizing:border-box',
    'text-align:left', 'white-space:pre-wrap', 'word-break:break-all',
    /* 整块不吃指针事件，只有下面那颗关闭钮例外。
       否则它会盖住被测界面上的按钮 —— 回归里两个用例的 click 就是这样超时的，
       而真机上也会挡住商店自己的关闭钮。看得见但不挡路，才是仪器该有的样子。 */
    'pointer-events:none',
  ].join(';');

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
  const title = document.createElement('b');
  title.textContent = '真机诊断（临时）';
  title.style.cssText = 'flex:1;font-size:12px;color:#8fd0ff';
  const shut = document.createElement('button');
  shut.type = 'button';
  shut.textContent = '关闭商店';
  shut.style.cssText = 'flex:none;min-height:34px;padding:0 12px;border:1px solid #4ea1ff;'
    + 'border-radius:8px;background:#12233d;color:#d8e2ff;font:600 12px/1 system-ui;'
    + 'touch-action:manipulation;pointer-events:auto';
  shut.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    try { onClose?.(); } catch (e) {}
  });
  head.append(shut, title);

  const body = document.createElement('div');
  box.append(head, body);
  document.body.appendChild(box);

  const loadState = { state: '等待中', detail: '' };
  try {
    iframe?.addEventListener('load', () => { loadState.state = 'load 已触发'; render(); });
    iframe?.addEventListener('error', () => { loadState.state = 'error 已触发'; render(); });
  } catch (e) {}

  const render = () => {
    try {
      body.textContent = collect(iframe, loadState)
        .map(([k, v]) => `${k}：${v}`)
        .join('\n');
    } catch (e) {
      body.textContent = `诊断收集失败：${e && e.message}`;
    }
  };
  render();
  /* 多量几次：几何和加载状态都要等布局与网络安顿。 */
  const timers = [200, 700, 1800, 4000].map((ms) => setTimeout(render, ms));

  return () => {
    timers.forEach(clearTimeout);
    document.getElementById(ID)?.remove();
  };
}
