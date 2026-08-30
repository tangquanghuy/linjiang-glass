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
      add('楼层定位', `${cs.position} z=${cs.zIndex} vis=${cs.visibility} op=${cs.opacity}`);
      add('楼层框', `${px(r.width)}x${px(r.height)} @${px(r.left)},${px(r.top)}`);
      add('楼层高度样式', fe.style.height || '(无)');
      add('楼层背景', fe.style.background || cs.backgroundColor || '(无)');
      /* 区分「状态二」的两个成因，这几行是关键：
           文档没了（release 导航成 about:blank）→ URL 是 about:blank、根节点数 0
           文档活着但没被合成                  → URL 正常、根节点数几百 */
      let docURL = '(读不到)';
      let rootNodes = -1;
      try {
        const d = fe.contentDocument;
        if (d) {
          docURL = String(d.URL);
          rootNodes = d.getElementById('linjiang-mobile-native-root')?.querySelectorAll('*').length ?? -2;
        }
      } catch (e) { docURL = `(跨源 ${e.name})`; }
      add('楼层文档URL', docURL);
      add('楼层根节点数', `${rootNodes}${rootNodes === 0 ? '  ← 文档是空的（被导航掉了？）' : ''}`);
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

  /* 生命周期日志。它住在 manager 上（酒馆顶层窗口），比任何一条楼层活得久 —— 所以即使
     刚刚发生过「状态栏像刷新一样重置」，导致重置的那几条事件仍然读得到。 */
  try {
    const mgr = window.parent.__linjiangHudManagerV2;
    const log = Array.isArray(mgr?.log) ? mgr.log : null;
    add('owner', mgr?.owner ? String(mgr.owner.id).slice(0, 4) : '(无)');
    add('候选/已挂载', `${mgr?.candidates?.size ?? '?'} / ${(mgr?.mounted || []).length}`);
    if (log && log.length) {
      const t0 = log[log.length - 1].t;
      add('事件（新→旧）', `\n${log.slice(-14).reverse()
        .map((row) => `  ${String(Math.round((row.t - t0) / 100) / 10).padStart(6)}s ${row.msg}`)
        .join('\n')}`);
    } else add('事件', '(空)');
  } catch (e) { add('事件', `读不到 ${e && e.name}`); }

  return out;
}

export function mountNativeDiag(iframe, { onClose } = {}) {
  let native = false;
  try { native = !!window.__linjiangNativeFlow; } catch (e) { native = false; }
  if (!native) return () => {};

  /* 挂到**酒馆文档**上，不是楼层文档。
     ==================================================================
     这一条改过一次，原因是用户的一句更正推翻了前一版的前提：黑屏发生时，连诊断条本身都不
     显示，只有商店加载好之后才看得到日志。

     诊断条是纯 DOM、挂在楼层文档 body 上的。它都不显示，说明**整个楼层文档都没在绘制** ——
     那就不是"商店 iframe 空白、露出覆盖层近黑底色"这种解释了。也就是说存在两个不同的状态，
     而前一版仪器只能观测到其中一个：

       状态一  覆盖层在（深蓝底 + 右上角 ×）、诊断条在、只缺商店内容 —— 就是加载慢
       状态二  整屏纯近黑，× 和诊断条都没有 —— 这才是用户抱怨的黑屏，之前一份数据都没有

     状态二的两个候选成因，都会表现为"全屏纯近黑、什么都没有"：
       · release() 把楼层导航成 about:blank，而整页模式下楼层 iframe 带着内联
         background:#05040a —— 文档没了，那块背景还在
       · 楼层文档活着，但 WebKit 没合成它

     要区分这两者，仪器必须比楼层文档活得久。所以挂到酒馆文档上：楼层被导航掉、或者压根不
     绘制，都杀不掉它。而 body 的子节点在根层叠上下文里，天然盖得住楼层里的任何东西
     （楼层在 #chat 里，抬不出去 —— 这正是之前查全屏时得到的结论）。

     拿不到酒馆文档（跨源之类）就退回楼层文档，总比没有好。 */
  let host = document;
  try {
    const tavernDoc = window.parent?.document;
    if (tavernDoc && tavernDoc.body) host = tavernDoc;
  } catch (e) { host = document; }

  host.getElementById(ID)?.remove();
  const box = host.createElement('div');
  box.id = ID;
  /* 内联样式：不依赖任何样式表，样式表本身也可能加载失败。 */
  box.style.cssText = [
    /* 贴底、按钮靠左：商店自己的关闭钮在右上角，贴顶会正好压在它上面 ——
       回归里 [data-shop-close] 因此永远过不了 Playwright 的命中检测，真机上也点不到。 */
    'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483647',
    /* 封顶，别让日志把整屏吃掉；它不吃指针事件也就没法滚，所以只能靠少显示几条。 */
    'max-height:82%', 'overflow:hidden',
    'background:#0b1220', 'color:#d8e2ff', 'border-top:2px solid #4ea1ff',
    'font:500 11px/1.45 ui-monospace,Menlo,Consolas,monospace',
    'padding:8px 10px 10px', 'box-sizing:border-box',
    'text-align:left', 'white-space:pre-wrap', 'word-break:break-all',
    /* 整块不吃指针事件，只有下面那颗关闭钮例外。
       否则它会盖住被测界面上的按钮 —— 回归里两个用例的 click 就是这样超时的，
       而真机上也会挡住商店自己的关闭钮。看得见但不挡路，才是仪器该有的样子。 */
    'pointer-events:none',
  ].join(';');

  const head = host.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
  const title = host.createElement('b');
  title.textContent = '真机诊断（临时）';
  title.style.cssText = 'flex:1;font-size:12px;color:#8fd0ff';
  const shut = host.createElement('button');
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

  const body = host.createElement('div');
  box.append(head, body);
  host.body.appendChild(box);
  /* 整页期间 escapeFixedContainingBlock 会把宿主 chrome 藏掉（visibility:hidden），而它是
     按 id 逐个藏的，不会碰到我们这块 —— 但楼层的 z-index 是 2147483000，所以这里要更高。
     已经在 cssText 里写了 2147483647，这里只是把这件事记下来。 */

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
  /* 多量几次：几何和加载状态都要等布局与网络安顿。之后持续低频刷新 —— 日志是活的，
     而"楼层被导航掉"这类事件可能在打开之后好几秒才发生。

     注意一个无法绕开的限制：这个 render 闭包属于**楼层文档的 realm**。楼层一旦被导航成
     about:blank，闭包随之消失，面板会冻结在最后一次渲染的内容上。日志本身是安全的（它在
     manager 上、属于酒馆窗口），所以正确的读法是：黑屏之后设法回到可用状态，再打开一次
     商店 —— 新楼层的诊断条会把那 60 条环形日志整段读出来，包含导致黑屏的那几条。 */
  const timers = [200, 700, 1800, 4000].map((ms) => setTimeout(render, ms));
  const beat = setInterval(render, 1000);
  timers.push(beat);
  /* 挂在酒馆文档上的东西必须有自毁时限：楼层被导航掉时卸载函数不会执行，
     否则一块诊断条会永久留在酒馆界面上。3 分钟足够读完，也不会变成永久污染。 */
  const view = host.defaultView || window;
  const autoKill = view.setTimeout(() => {
    try { host.getElementById(ID)?.remove(); } catch (e) {}
  }, 180000);
  timers.push({ __autoKill: autoKill, __view: view });

  return () => {
    timers.forEach((t) => {
      if (t && t.__autoKill != null) { try { t.__view.clearTimeout(t.__autoKill); } catch (e) {} return; }
      clearTimeout(t);
      clearInterval(t);
    });
    /* 从它实际所在的那个文档里摘掉。挂在酒馆文档上的话，楼层卸载时必须自己清干净 ——
       否则一块诊断条会永久留在酒馆界面上（比留下一块黑还烦）。 */
    try { host.getElementById(ID)?.remove(); } catch (e) {}
    try { document.getElementById(ID)?.remove(); } catch (e) {}
  };
}
