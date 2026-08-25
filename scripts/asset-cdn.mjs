/* 静态素材的 CDN 出口 —— 一个地方定义，vite.config.js 和检查脚本都从这里读。
   ================================================================

   为什么存在这个文件
   ----------------
   public/assets/ 一共 10.12MB，其中四个文件占了 5MB：

       bg-plate.png          2025KB   1672x941   状态栏背景
       opening-background.png 1966KB  1672x941   开局页背景
       frost.png             1035KB   1024x1024  毛玻璃颗粒（首屏就要）
       polish.png             365KB   512x384

   这些走 GitHub Pages 时，在国内移动网络上实测（no-store、与 jsDelivr 交错发起，
   scripts/_probe-bg-plate.mjs）：

       bg-plate.png 走 Pages      178.8s / 217.0s / 240s 超时失败 / 185.7s
       bg-plate.png 走 testingcf    4.2s /   2.0s /  11.0s

   Pages 稳定在三分钟量级，而且会整个取不回来。这就是「几分钟背景图都出不完全」的
   全部原因 —— 不是渲染慢，是根本没下载完。jsDelivr 快约 50 倍，而且它给
   `access-control-allow-origin: *` 和 `max-age=604800`（Pages 只给 600），
   所以素材缓存脚本也能覆盖它、二次打开直接命中本地。

   为什么必须是 testingcf 而不是 cdn.jsdelivr.net
   -------------------------------------------
   cdn.jsdelivr.net 在国内被墙，testingcf.jsdelivr.net 没有。这个项目里凡是外链
   都必须用 testingcf，改回去等于让页面挂掉。cg/index.html 曾经因为用了被墙的域名
   加载 jQuery（同步阻塞）而整页白屏。

   为什么只搬素材，不搬整个 dist
   --------------------------
   dist/ 在 .gitignore 里，jsDelivr 根本看不到它，所以搬不了。而且就算能搬也不该搬：
   HUD 靠 postMessage（linjiang-cg 等通道）和同源 DOM 访问跟宿主页通信，把 JS/CSS
   变成跨源会直接断掉这些。图片没有这个问题 —— <img> 和 CSS background 跨源无所谓，
   而且 src/ 里没有任何 getImageData/toDataURL，不存在画布污染。

   开关语义
   ------
   环境变量 ASSET_CDN=1 才启用，默认关。
   - 本地 dev / preview / playwright 回归：默认关，素材走本地，离线可跑、结果确定，
     也不会因为改了素材还没推就取到旧的。
   - 部署（.github/workflows/pages.yml 的 build 作业）：设 ASSET_CDN=1。
   这样「测的是本地、发的是 CDN」，两边都不会互相干扰。 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';

export const CDN_HOST = 'https://testingcf.jsdelivr.net';
export const CDN_REF = 'gh/tangquanghuy/linjiang-glass@main';

/* 注意路径里带 public/：jsDelivr 是按仓库原样路径服务的，素材在仓库里就住在
   public/assets/ 下面（是 vite 把 public/ 摊平成 dist/ 根，CDN 不做这件事）。 */
export const ASSETS_ROOT = `${CDN_HOST}/${CDN_REF}/public/assets/`;

/* trim 不是多余的：Windows 的 cmd 里 `set ASSET_CDN=1 && ...` 会把值设成 "1 "
   —— 带着 && 前面那个空格。第一次验证就栽在这上面，构建静悄悄地没改写任何东西。 */
export function cdnEnabled(env = process.env) {
    const v = String(env.ASSET_CDN ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

/* public/assets 下所有文件的相对路径，形如 bg-plate.png / items/goods-clothing.png。
   这份清单就是改写的白名单 —— 见下面 rewriteStaticRefs 的说明。 */
export function listPublicAssets(root = 'public/assets') {
    const out = [];
    if (!existsSync(root)) return out;
    (function walk(dir, prefix) {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            const rel = prefix ? posix.join(prefix, name) : name;
            if (statSync(full).isDirectory()) walk(full, rel);
            else out.push(rel);
        }
    })(root, '');
    return out;
}

/* 把 HTML/CSS 里的静态素材引用改写成 CDN 绝对地址。
   ------------------------------------------------
   这里有一个必须靠白名单才能避开的陷阱：dist/index.html 里同时有

       ./assets/bg-plate.png          <- 真素材，要改
       ./assets/index-Du4Zn0KG.js     <- 应用自己的 bundle，绝对不能改
       ./assets/index-LQh4tn6Q.css    <- 同上

   因为 vite 把打包产物也emit到 dist/assets/ 下，跟摊平过来的 public/assets/ 混在
   一个目录里。要是按 `./assets/` 前缀无脑替换，应用主体就会被指到 jsDelivr 上 ——
   那边没有 dist/（gitignore），404；就算有，JS 变跨源也会断掉 postMessage。

   所以判定条件不是「长得像素材路径」，而是「这个文件真的存在于 public/assets/ 里」。
   bundle 名字带 hash，永远不在这份清单里，天然被排除。

   只处理 .html 和 .css。JS 那边不靠文本改写 —— asset() 是运行时拼 URL 的
   （产物里是 a=`./assets/${...}` 这种模板），靠 vite define 注入根地址更准。 */
/* 匹配必须锚在「URL 的起点」上，而不是随便撞到 assets/ 就算。
   起点的判据是前一个字符是定界符（引号、括号、逗号、空白、= 、反引号）或字符串开头。

   这条规则同时解决三个问题，少任何一个都会生成坏地址：

   1. 裸 `/assets/x.png` 要连前面那个斜杠一起吃掉。
      第一版的前缀写成 (?:\.\.?\/)? ，匹配不到开头的 `/`，结果替换出
      `/https://testingcf...`。是拿 scripts/_probe-rewrite-unit.mjs 逐形态考的时候
      才发现的 —— 当时 dist 里恰好没有这种形态，整套构建检查全绿。

   2. 但也不能无条件允许前缀 `/`，否则会命中绝对地址的中段：
      `https://tangquanghuy.github.io/linjiang-glass/assets/bg-plate.png`
      里的 `/assets/bg-plate.png` 会被换掉，拼出 `...linjiang-glassHTTPS://...`。
      要求前一个字符是定界符就排除了这种情况（那里前一个字符是 `s`）。

   3. 幂等是这条规则的副产品，不用另外判：改写后的地址里是 `public/assets/`，
      `assets/` 前面是 `c`，不是定界符，第二遍自然不会再匹配。 */
const REF_RE = /(^|[\s"'`(,=])((?:\.\.?\/|\/)?)assets\/([A-Za-z0-9._/-]+)/g;

export function rewriteStaticRefs(text, known = new Set(listPublicAssets()), root = ASSETS_ROOT) {
    return text.replace(REF_RE, (match, delim, _prefix, rel) => (
        known.has(rel) ? delim + root + rel : match
    ));
}

/* 文件里有没有真的引用了被墙的 cdn.jsdelivr.net。
   ---------------------------------------------
   两个条件都必要：

   - 先剥注释：这个仓库里好几处都写着「cdn.jsdelivr.net 被墙」这样的警示注释，
     按域名裸匹配会把警示本身判成违规。第一版就是这么误报的，而误报的检查最后
     一定会被人加白名单绕过，等于把这条检查废掉。
   - 再要求带 scheme：只有 https://cdn.jsdelivr.net 才是真的在取东西。 */
export function hasWalledCdn(text) {
    const code = String(text ?? '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    return /https?:\/\/cdn\.jsdelivr\.net/.test(code);
}

/* 递归收集 dist 下要改写的文件。 */
export function listRewritable(distRoot = 'dist') {
    const out = [];
    if (!existsSync(distRoot)) return out;
    (function walk(dir) {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (/\.(html|css)$/i.test(name)) out.push(full);
        }
    })(distRoot);
    return out;
}
