/* CG 鉴赏页的外壳。
   ------------------------------------------------------------------
   CG 那三片代码（cg-app.js，产物）是从小手机里原样搬过来的，所以它仍然按小手机的假设
   写着：往 #phone-app-body / #phone-app-title 渲染、用 navigationStack 记返回、用
   escapeHtml 转义、用 toastr 提示、从 currentPhoneData.羁绊列表 里取好感度、用
   #wallpaper-fullscreen-viewer 那套 id 看大图。

   这个文件就是把那些假设在一个独立页面里重新满足一遍 —— 它是这次唯一新写的逻辑，
   CG 本身一行没改。好感度不再自己去摸 MVU（这页跨域，摸不到），改由 HUD 通过
   postMessage 喂进来；HUD 侧见 src/cg.js。 */

/* --------------------------------------------------- 小手机框架的替身 */

let currentPhoneData = null;
/* CG 代码里 toggleCGPanelMode 会检查 `currentPanel === 'gallery'` 才重绘。这一页只有
   CG，所以它恒等于 gallery。 */
let currentPanel = 'gallery';
let navigationStack = [];

/* 与 phone/src/20-friends-panel.js 同一实现。 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* 小手机那版会一路降级去摸 Mvu；这页拿不到，只认 HUD 喂进来的那份。形状保持一致：
   {羁绊列表: {角色名: {好感度: n}}}。 */
function getRelationshipDataSource(source = currentPhoneData) {
  const bonds = source && source.羁绊列表;
  if (bonds && typeof bonds === 'object' && Object.keys(bonds).length > 0) return bonds;
  return null;
}

/* toastr 的替身。CG 代码只用 warning / success 两种，多的不做。 */
const toastr = {
  warning(text) { CGShell.toast(text, 'warn'); },
  success(text) { CGShell.toast(text, 'ok'); },
  info(text) { CGShell.toast(text, ''); },
  error(text) { CGShell.toast(text, 'warn'); },
};

/* ------------------------------------------------------------ 外壳本体 */

const CGShell = (() => {
  const CHANNEL = 'linjiang-cg';
  const ROOT_TITLE = 'CG收集';

  const body = () => $('#phone-app-body');
  const viewerOpen = () => $('#wallpaper-fullscreen-viewer').hasClass('active');

  const toast = (text, kind) => {
    const host = document.getElementById('cg-toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'cg-toast' + (kind === 'warn' ? ' is-warn' : kind === 'ok' ? ' is-ok' : '');
    el.textContent = String(text || '');
    host.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  };

  const syncBack = () => {
    $('#cg-back-btn').prop('hidden', navigationStack.length === 0);
  };

  /* 根页面重绘。收到 HUD 的新好感度、或者从详情页退回来的时候用。 */
  const paintRoot = () => {
    navigationStack.length = 0;
    $('#phone-app-title').text(ROOT_TITLE);
    body().html(generateGalleryPanel(currentPhoneData));
    body().scrollTop(0);
    bindCGGalleryEvents();
    syncBack();
  };

  /* 返回上一层。小手机的 closeAppPanel 是把整段 innerHTML 塞回去，这里照它的语义来：
     showCGCharacterDetail 压栈时存的就是 {title, content, scrollPosition}。 */
  const back = () => {
    const prev = navigationStack.pop();
    if (!prev) return false;
    $('#phone-app-title').text(prev.title || ROOT_TITLE);
    body().html(prev.content || '');
    body().scrollTop(prev.scrollPosition || 0);
    bindCGGalleryEvents();
    syncBack();
    return true;
  };

  const closeViewer = () => {
    $('#wallpaper-fullscreen-viewer').removeClass('active');
    $('#cg-nav-controls').hide();
    $('#cg-index-display').hide();
    $('#wallpaper-fullscreen-img').attr('src', '');
    /* cg-app.js 用这个模块级变量记着"当前在看第几张"，看完要清掉，否则下次按左右键
       会从上一次的位置接着走。它是 let 声明的脚本级全局，这里可以直接赋值。 */
    currentCGInfo = null;
  };

  /* 关掉整页：这页是 HUD 的一个覆盖层，真正的关闭由 HUD 做（它要拆 iframe、恢复
     那两颗浮层钮），所以这里只是通报一声。 */
  const requestClose = () => {
    try { parent?.postMessage({ type: `${CHANNEL}:close` }, '*'); } catch (e) {}
  };

  const onHostMessage = (event) => {
    const data = event.data;
    if (!data) return;
    if (data.type === `${CHANNEL}:unlock`) {
      const unlock = data.unlock || {};
      unlockCG(unlock.character, unlock.scene, unlock.count);
      if (navigationStack.length === 0 && !viewerOpen()) paintRoot();
      return;
    }
    if (data.type !== `${CHANNEL}:data`) return;
    currentPhoneData = { 羁绊列表: data.bonds && typeof data.bonds === 'object' ? data.bonds : {} };
    /* 只在根页面重绘：正在翻某个角色的场景网格时把人踢回列表，比好感度晚一拍更烦。 */
    if (navigationStack.length === 0 && !viewerOpen()) paintRoot();
  };

  const boot = () => {
    $('#cg-back-btn').on('click', (event) => {
      event.preventDefault();
      back();
    });
    /* 全屏看图的三颗钮，和 phone/src/07-events.js 的绑定一一对应（少一颗设为壁纸）。 */
    $('#wallpaper-close-btn').on('click', (event) => {
      event.stopPropagation();
      closeViewer();
    });
    $('#wallpaper-fullscreen-viewer').on('click', (event) => {
      if (event.target.id === 'wallpaper-fullscreen-viewer') closeViewer();
    });
    $('#cg-prev-btn').on('click', (event) => {
      event.stopPropagation();
      switchCGImage('prev');
    });
    $('#cg-next-btn').on('click', (event) => {
      event.stopPropagation();
      switchCGImage('next');
    });

    /* Esc 一层层往外剥：大图 → 详情页 → 整页。和 HUD 自己的分层退出是同一套手感。 */
    $(document).on('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (viewerOpen()) { closeViewer(); return; }
      if (back()) return;
      requestClose();
    });

    /* 返回钮的显隐跟着 navigationStack 走，而压栈的那一下发生在 cg-app.js 里
       （showCGCharacterDetail），外壳收不到通知 —— 那个文件是产物，不改。它压栈的同时一定会
       把 #phone-app-body 整段换掉，所以盯着这一处的子节点变动就够，比给它加钩子干净。 */
    const watcher = new MutationObserver(() => syncBack());
    watcher.observe(document.getElementById('phone-app-body'), { childList: true });

    addEventListener('message', onHostMessage);
    paintRoot();
    /* 通报开机，HUD 收到就把好感度推过来。放在首屏之后：没有好感度也能画（读作 0），
       等数据到了再重绘一次，不必为了一个数字拖慢首屏。 */
    try { parent?.postMessage({ type: `${CHANNEL}:hello` }, '*'); } catch (e) {}
  };

  return { boot, toast, paintRoot, back, closeViewer };
})();
