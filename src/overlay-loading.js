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

  const box = document.createElement('div');
  box.className = 'overlay-loading';
  box.style.cssText = [
    'position:absolute', 'inset:0', 'z-index:5',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'gap:14px', 'padding:24px', 'box-sizing:border-box', 'text-align:center',
    'background:#0c1024', 'color:#e8ecff',
    'font:500 14px/1.6 ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif',
  ].join(';');

  const spinner = document.createElement('div');
  spinner.style.cssText = [
    'width:30px', 'height:30px', 'border-radius:50%',
    'border:3px solid rgba(232,236,255,.22)', 'border-top-color:#8fd0ff',
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

  const hint = document.createElement('div');
  hint.style.cssText = 'max-width:22em;font-size:12.5px;line-height:1.7;color:#9fb0d8;display:none';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:none;gap:10px;flex-wrap:wrap;justify-content:center';
  const mkBtn = (caption, primary) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = caption;
    btn.style.cssText = [
      'min-height:40px', 'padding:0 16px', 'border-radius:10px',
      `border:1px solid ${primary ? '#8fd0ff' : 'rgba(232,236,255,.3)'}`,
      `background:${primary ? '#17395c' : 'transparent'}`,
      'color:#e8ecff', 'font:600 13px/1 inherit', 'touch-action:manipulation', 'cursor:pointer',
    ].join(';');
    return btn;
  };
  const retry = mkBtn('重试', true);
  const quit = mkBtn('关闭', false);
  actions.append(retry, quit);

  box.append(spinner, text, hint, actions);
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
