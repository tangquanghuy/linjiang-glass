/* 内嵌页面（商店 / CG / 街机 / 地图）的加载状态与重试。
   ==================================================================
   为什么需要它 —— 一条真机实测，不是防御性编程

   iOS + TauriTavern 上「点商店直接整屏黑」，真机诊断条给出的两行把成因钉死了：

       商店加载：等待中            ← load 事件从未触发
       商店内页：同源 body节点=0    ← 还停在初始的 about:blank

   「同源」这一点是关键：楼层文档是 tauri://localhost/，商店页在
   https://tangquanghuy.github.io/…，两者不可能同源。唯一能读到、且 body 为空的情况，
   就是那个 iframe **压根还没导航过去**。屏幕上于是只剩 .shop-layer 的底色 #0c1024 —— 近黑。
   用户的描述也对上了：「反复多打开几次就又不会黑屏了」（第一次走网络，之后命中缓存）。

   根因是这几个页面走 GitHub Pages，而本仓库早就量过：Pages 在国内取素材要 178~240 秒、
   甚至取不回来（数据见 scripts/asset-cdn.mjs 顶部），素材因此改走了 jsDelivr。但这几个
   **页面**一直留在 Pages 上，而且不能简单换源 —— 街机和 CG 用 localStorage 存进度与解锁，
   换 origin 等于把玩家存档丢在旧域上（见 scripts/asset-cdn.mjs 里那段）。

   所以这里做的不是加速，是**把「黑屏」这个失败模式消掉**：加载期间给出看得懂的状态，
   慢到一定程度给出解释和出路（重试 / 关闭）。最坏情况从"整屏黑、只能杀进程"变成
   "一个说明白了的等待界面"。

   样式全部内联、不依赖任何样式表：这条路径本身就是在处理"资源没到"，再去依赖一个可能
   同样没到的样式表就没有意义了。 */

/* 多久算「慢」。GitHub Pages 在国内的正常波动可以到几秒，所以别太急着喊问题；
   但也不能等到用户以为死机 —— 6 秒是个能让人相信"它确实在做事"的上限。 */
const SLOW_MS = 6000;

export function mountFrameLoading(layer, iframe, { label = '页面', onClose } = {}) {
  if (!layer || !iframe) return () => {};

  /* 视觉上必须**一眼就不是黑屏**。
     ==================================================================
     第一版用的是 #0c1024 底色 + 30px 转圈 + 一行 14px 小字。按像素量下来（
     scripts/check-overlay-loading.mjs，拦掉页面地址后截图统计），CG 那格非近黑像素只有
     **0.7%** —— 也就是一个细圆环加一行小字落在一大片深色上。人眼能看见，但在手机上扫一眼，
     它跟"黑屏"的区别不够大，用户完全有理由还是叫它黑屏（这条正是用户质疑出来的）。

     所以改成：明显更亮的背板 + 一张有边框的卡片 + 更大的字。目的不是好看，是让"它在加载"
     这件事无法被误读成"它坏了"。 */
  const box = document.createElement('div');
  box.className = 'overlay-loading';
  box.style.cssText = [
    'position:absolute', 'inset:0', 'z-index:5',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'gap:16px', 'padding:22px', 'box-sizing:border-box', 'text-align:center',
    /* 比任何一个覆盖层的底色都明显更亮（它们是 #0c1024 / #100d17 / #070a14 / #05040a）。 */
    'background:#1a2340', 'color:#eef3ff',
    /* 整块不吃指针事件，只有下面那两颗按钮例外。
       覆盖层自己的关闭钮（.shop-chrome 里那颗，z-index 81）在这块之上，但命中检测仍会被
       挡住 —— 回归里 [data-shop-close] 就是这样点不动的，真机上同样点不到。
       跟诊断条踩的是同一个坑，那边也是这么解的。 */
    'pointer-events:none',
    'font:500 15px/1.65 ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif',
  ].join(';');

  /* 卡片：把文字和按钮收在一块更亮的面上，进一步拉开与"纯深色"的差距。 */
  const card = document.createElement('div');
  card.style.cssText = [
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:14px',
    'width:min(21em,100%)', 'padding:22px 20px', 'box-sizing:border-box',
    'border:1px solid #6f8ec9', 'border-radius:16px', 'background:#26325a',
    'box-shadow:0 10px 30px rgba(0,0,0,.35)',
  ].join(';');

  const spinner = document.createElement('div');
  spinner.style.cssText = [
    'width:40px', 'height:40px', 'border-radius:50%',
    'border:4px solid rgba(238,243,255,.34)', 'border-top-color:#b9dcff',
    'animation:overlay-spin 900ms linear infinite',
  ].join(';');
  /* 关键帧注入 head 而不是放进这一层里。
     同样不依赖外部样式表（这条路径正是在处理"资源没到"），但必须放在 box 外面：
     放里面的话 box.textContent 会把 CSS 文本也算进去，读这块文字的人（回归、以及将来看日志
     的人）拿到的第一段就是 @keyframes，而不是给用户看的那句话。 */
  if (!document.getElementById('overlay-loading-kf')) {
    const kf = document.createElement('style');
    kf.id = 'overlay-loading-kf';
    kf.textContent = '@keyframes overlay-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(kf);
  }

  const text = document.createElement('div');
  text.textContent = `正在加载${label}…`;
  text.style.cssText = 'font-size:17px;font-weight:600;color:#eef3ff';

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:13px;line-height:1.75;color:#c3d2f0;display:none';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:none;gap:10px;flex-wrap:wrap;justify-content:center';
  const mkBtn = (caption, primary) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = caption;
    btn.style.cssText = [
      'min-height:40px', 'padding:0 16px', 'border-radius:10px',
      `border:1px solid ${primary ? '#b9dcff' : 'rgba(238,243,255,.45)'}`,
      `background:${primary ? '#2f5f92' : 'rgba(238,243,255,.08)'}`,
      'color:#eef3ff', 'font:600 14px/1 inherit', 'touch-action:manipulation', 'cursor:pointer',
      /* 外层是 pointer-events:none，按钮要自己收回来。 */
      'pointer-events:auto',
    ].join(';');
    return btn;
  };
  const retry = mkBtn('重试', true);
  const quit = mkBtn('关闭', false);
  actions.append(retry, quit);

  card.append(spinner, text, hint, actions);
  box.appendChild(card);
  layer.appendChild(box);

  let done = false;
  let slowTimer = 0;

  const showSlow = () => {
    if (done) return;
    text.textContent = `${label}加载得比平常慢`;
    hint.style.display = 'block';
    hint.textContent = '这几个页面是从 GitHub Pages 取的，国内网络下偶尔会很慢或取不回来。'
      + '可以重试，或者关掉稍后再进 —— 已经取到过一次之后就会走缓存，很快。';
    actions.style.display = 'flex';
    spinner.style.display = 'none';
  };

  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(slowTimer);
    box.remove();
  };

  const arm = () => {
    clearTimeout(slowTimer);
    slowTimer = setTimeout(showSlow, SLOW_MS);
  };

  iframe.addEventListener('load', () => {
    /* about:blank 也会触发 load。只有真的导航到目标地址才算加载完成 ——
       否则这里会在"还停在空文档"的时候就把状态收掉，又变回一片近黑。 */
    let blank = false;
    try { blank = !iframe.contentWindow?.location?.href || iframe.contentWindow.location.href === 'about:blank'; }
    catch (e) { blank = false; /* 读不到 = 跨源 = 真的导航过去了 */ }
    if (blank) return;
    finish();
  });
  iframe.addEventListener('error', showSlow);

  retry.addEventListener('click', () => {
    text.textContent = `正在重新加载${label}…`;
    hint.style.display = 'none';
    actions.style.display = 'none';
    spinner.style.display = '';
    /* 换一个查询串再取：同一个地址如果被浏览器缓存成了失败结果，原样重取可能直接复用。 */
    const base = iframe.dataset.baseSrc || iframe.src;
    iframe.dataset.baseSrc = base;
    iframe.src = `${base}${base.includes('?') ? '&' : '?'}retry=${Date.now()}`;
    arm();
  });
  quit.addEventListener('click', () => { try { onClose?.(); } catch (e) {} });

  arm();
  return finish;
}

/* 预热：HUD 挂好之后在后台把这几个页面的 HTML 取一遍，等用户真的点开时已经在缓存里。
   只取 HTML（商店 18KB、CG 3KB 这个量级），不碰它们各自的重资源 —— 目的是把"第一次点开
   要等网络"这件事挪到用户不在等的时候，而不是提前把整个页面的依赖都拉下来。 */
export function warmOverlayPages(urls) {
  if (!Array.isArray(urls) || !urls.length) return;
  const run = () => {
    for (const url of urls) {
      if (!url) continue;
      /* no-store 会强制走网络、还不进缓存，那就白预热了；默认缓存策略才是我们要的。
         失败静默：预热不成功只是回到"点开时再等"，不该产生任何用户可见的后果。 */
      try { fetch(url, { mode: 'no-cors' }).catch(() => {}); } catch (e) {}
    }
  };
  try {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 1500);
  } catch (e) {
    setTimeout(run, 1500);
  }
}
