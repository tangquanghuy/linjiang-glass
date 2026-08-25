/* Public files live under public/assets and are copied to dist/assets.
   Paths are resolved against the HTML document, not the JS/CSS bundle: Vite
   emits those under /assets/, and a relative url() used as a CSS mask would
   become /assets/assets/*.png and 404. */

/* 素材根目录。构建时由 vite define 注入（见 vite.config.js 和 scripts/asset-cdn.mjs）：
   设了 ASSET_CDN=1 就是 jsDelivr 的绝对地址，否则是 null、走本地相对路径。

   为什么要有这个：public/assets 里 bg-plate.png 2MB、frost.png 1MB，走 GitHub Pages
   在国内实测要 180 秒以上，还会整个取不回来（实测数据见 scripts/asset-cdn.mjs 顶部）。
   走 jsDelivr 是 2~11 秒。

   typeof 判断是为了在没有 define 的环境（比如直接被 node 引）里不炸 —— 对未声明的
   标识符用 typeof 是安全的，不会 ReferenceError。 */
export const ASSETS_ROOT = (typeof __ASSETS_ROOT__ === 'string' && __ASSETS_ROOT__)
  ? __ASSETS_ROOT__
  : `${import.meta.env.BASE_URL}assets/`;

export function asset(path) {
  const file = String(path || '')
    .replace(/^.*\/assets\//, '')
    .replace(/^assets\//, '')
    .replace(/^\//, '');
  const relative = `${ASSETS_ROOT}${file}`;
  try {
    const base = globalThis.document?.baseURI || globalThis.location?.href;
    /* ASSETS_ROOT 已是绝对地址时 new URL 原样返回，所以这一步对两种模式都安全。 */
    return base ? new URL(relative, base).href : relative;
  } catch {
    return relative;
  }
}

export function cssUrl(path) {
  return `url("${asset(path)}")`;
}

export function rebaseSrc(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  if (typeof entry.src !== 'string') return entry;
  return { ...entry, src: asset(entry.src) };
}

export function rebaseRecord(record) {
  const out = {};
  Object.entries(record || {}).forEach(([key, value]) => {
    out[key] = rebaseSrc(value);
  });
  return out;
}
