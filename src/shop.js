/* Token shop overlay. Browser token balance stays in shop/index.html localStorage;
   only successful product redemption crosses the bridge and writes MVU 背包. */
import { purchaseShopProduct } from './bridge.js';
import { hudPage } from './asset.js';
import { mountNativeDiag } from './native-diag.js';
import { mountFrameLoading } from './overlay-loading.js';

export function shopSrc() {
  /* 基准必须是 HUD 自己的来源，不能是 document.baseURI —— 原生流下后者是酒馆的地址，
     会把这个 iframe 指到一个不存在的路径上，屏幕整片黑。理由详见 src/asset.js 的 hudBase。 */
  return hudPage('shop/index.html');
}
export function isShopOpen() { return !!document.querySelector('.shop-layer'); }
export function shopOverlay() {
  return `<div class="shop-layer" role="dialog" aria-modal="true" aria-label="代币商店">
    <iframe class="shop-frame" src="${shopSrc()}" title="代币商店" data-shop-frame allow="autoplay"></iframe>
    <div class="shop-chrome"><button class="shop-close" type="button" data-shop-close aria-label="关闭商店">×</button></div>
  </div>`;
}
export function mountShopOverlay(host, { onClose } = {}) {
  const root = host || document.body;
  document.querySelectorAll('.shop-layer').forEach((el) => el.remove());
  root.insertAdjacentHTML('beforeend', shopOverlay());
  const layer = root.querySelector(':scope > .shop-layer') || document.querySelector('.shop-layer');
  const iframe = layer.querySelector('[data-shop-frame]');
  const close = () => onClose?.();
  layer.querySelector('[data-shop-close]').addEventListener('click', close);
  document.documentElement.classList.add('has-shop');
  const onMessage = async (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data || {};
    if (data.type === 'airp-shop:close') { close(); return; }
    if (data.type !== 'airp-shop:purchase') return;
    try {
      const product = data.product || {};
      const result = await purchaseShopProduct(product);
      iframe.contentWindow?.postMessage({ type: 'airp-shop:purchase-result', ok: true, price: product.price, name: product.name, item: result?.item || null }, '*');
    } catch (error) {
      iframe.contentWindow?.postMessage({ type: 'airp-shop:purchase-result', ok: false, error: error?.message || '兑换失败' }, '*');
    }
  };
  addEventListener('message', onMessage);
  iframe.addEventListener('load', () => iframe.contentWindow?.postMessage({ type: 'airp-shop:hello' }, '*'));
  /* 临时仪器：iOS/TT 上这里会整屏黑，而夹具复现不出来。诊断条是纯 DOM、不加载任何东西，
     所以它自己不会跟着变黑 —— 黑屏那一刻它就是唯一还能读到的东西。查清后删掉。
     只在原生流下出现（见 src/native-diag.js）。 */
  /* 加载状态：这几个页面从 GitHub Pages 取，国内可能很慢甚至取不回来，而覆盖层底色是近黑
     —— 真机上表现为"点商店直接整屏黑"。理由与实测见 src/overlay-loading.js。 */
  const unmountLoading = mountFrameLoading(layer, iframe, { label: '商店', onClose: close });
  const unmountDiag = mountNativeDiag(iframe, { onClose: close });
  return () => {
    unmountLoading();
    unmountDiag();
    removeEventListener('message', onMessage);
    layer.remove();
    if (!document.querySelector('.shop-layer')) document.documentElement.classList.remove('has-shop');
  };
}
