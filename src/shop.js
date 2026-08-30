/* Token shop overlay. Browser token balance stays in shop/index.html localStorage;
   only successful product redemption crosses the bridge and writes MVU 背包. */
import { purchaseShopProduct } from './bridge.js';
import { hudPage } from './asset.js';

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
  return () => {
    removeEventListener('message', onMessage);
    layer.remove();
    if (!document.querySelector('.shop-layer')) document.documentElement.classList.remove('has-shop');
  };
}
