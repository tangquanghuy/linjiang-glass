/* Arcade overlay.
   ------------------------------------------------------------------
   The four games are self-contained HTML pages (scratch / slots / fishing /
   shrine) hosted under arcade/.  They cannot be inlined: fishing and slots
   own their own canvas, and a CSS transform on an ancestor breaks pointer
   coordinates the same way it does for the city map.

   So the arcade is an iframe covering the unscaled viewport, matching the
   map overlay.  Scratch and fishing force a landscape stage on portrait
   phones inside that iframe (see arcade/index.html); this module only
   mounts, closes, and tells the tavern shell to expand. */

export function arcadeSrc() {
  return new URL(`${import.meta.env.BASE_URL}arcade/index.html`, document.baseURI).href;
}

export function isArcadeOpen() {
  return !!document.querySelector('.arcade-layer');
}

export function arcadeOverlay() {
  return `
<div class="arcade-layer" role="dialog" aria-modal="true" aria-label="幸运街机">
  <iframe class="arcade-frame" src="${arcadeSrc()}" title="幸运街机"
    allow="autoplay" data-arcade-frame></iframe>
  <div class="arcade-chrome">
    <button class="arcade-close" type="button" data-arcade-close aria-label="关闭街机">×</button>
  </div>
</div>`;
}

export function mountArcadeOverlay(host, { onClose } = {}) {
  const root = host || document.body;
  document.querySelectorAll('.arcade-layer').forEach((el) => el.remove());
  root.insertAdjacentHTML('beforeend', arcadeOverlay());
  const layer = root.querySelector(':scope > .arcade-layer') || document.querySelector('.arcade-layer');
  layer.querySelector('[data-arcade-close]').addEventListener('click', () => onClose?.());
  document.documentElement.classList.add('has-arcade');
  return () => {
    layer.remove();
    if (!document.querySelector('.arcade-layer')) document.documentElement.classList.remove('has-arcade');
  };
}
