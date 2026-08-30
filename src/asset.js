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

/* 相对地址该相对**谁**解析。
   ==================================================================
   这是一个真机黑屏事故的根因，值得写清楚。

   vite 的 base 是相对的（'./'，见 vite.config.js），所以 `${BASE_URL}shop/index.html`
   这类地址必须挑一个基准去解析。原来一律用 document.baseURI，那在两种架构下含义不同：

     抬升架构   HUD 跑在自己的 iframe 里，该 iframe 由 Pages 伺服
                → document.baseURI = Pages 地址 → 解析正确
     原生流     HUD 的 DOM 长在**楼层 srcdoc 文档**里，而 srcdoc 继承父文档的 baseURI
                → document.baseURI = **酒馆的地址** → 解析到酒馆域

   真机上酒馆是 TauriTavern 的应用源，HUD 在 tangquanghuy.github.io，两者不同源。于是
   商店 / CG / 地图 / 街机 的 iframe 都指向 `<酒馆域>/shop/index.html` 这种根本不存在的
   路径 → 404 → 空白 iframe。叠上覆盖层的近黑底色和整页期间被藏起来的宿主 chrome，
   屏幕就整片黑。而次级页面（日程）是纯 DOM、不解析任何地址，所以一直是正常的 —— 这正是
   用户观察到的分野。

   夹具为什么一直是绿的：夹具把酒馆和 HUD 放在**同一个源**上，那个错误地址恰好也能命中文件。
   要复现必须让两者分处两个源（scripts/check-mobile-native-flow.mjs 现在就是这么跑的）。

   所以基准改由壳层给：它是唯一知道 HUD 真实来源的一方（原生流下由它 fetch 并注入 bundle），
   在注入之前把 HUD 目录写进 window.__linjiangHudBase。拿不到就退回 document.baseURI ——
   独立访问 Pages 和抬升架构下那本来就是对的。 */
export function hudBase() {
  try {
    const base = globalThis.window?.__linjiangHudBase;
    if (typeof base === 'string' && base) return base;
  } catch (e) { /* 跨源访问 window 属性时不该炸 */ }
  return globalThis.document?.baseURI || globalThis.location?.href || '';
}

/* HUD 自带的那几个内嵌页面（商店 / CG / 地图 / 街机）的绝对地址。 */
export function hudPage(path) {
  const relative = `${import.meta.env.BASE_URL}${String(path || '').replace(/^\//, '')}`;
  try {
    const base = hudBase();
    return base ? new URL(relative, base).href : relative;
  } catch {
    return relative;
  }
}

export function asset(path) {
  const file = String(path || '')
    .replace(/^.*\/assets\//, '')
    .replace(/^assets\//, '')
    .replace(/^\//, '');
  const relative = `${ASSETS_ROOT}${file}`;
  try {
    /* 跟 hudPage 用同一个基准：没开 ASSET_CDN 的构建下 ASSETS_ROOT 是相对的，
       原生流里用 document.baseURI 会把素材也解析到酒馆域去。 */
    const base = hudBase();
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
