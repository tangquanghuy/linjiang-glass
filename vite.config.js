import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import {
  ASSETS_ROOT, CDN_HOST, buildRewriteContexts, cdnEnabled, listRewritable, rewriteStaticRefs,
} from './scripts/asset-cdn.mjs';

function copyCityMap(destRoot) {
  if (!existsSync('city')) return;
  const dest = join(destRoot, 'city');
  mkdirSync(join(dest, 'plate'), { recursive: true });
  for (const file of ['plate_map.html', 'plate_map.js', 'city_mapdata.js', 'city_net.js']) {
    const from = join('city', file);
    if (existsSync(from)) cpSync(from, join(dest, file));
  }
  if (!existsSync('city/plate')) return;
  for (const name of readdirSync('city/plate')) {
    if (name.endsWith('.webp')) cpSync(join('city/plate', name), join(dest, 'plate', name));
  }
}

function copyArcade(destRoot) {
  if (!existsSync('arcade')) return;
  cpSync('arcade', join(destRoot, 'arcade'), { recursive: true });
}

/* CG 鉴赏和街机同样是"整目录搬过去"的独立页面：里面是原生脚本（cg-app.js 是从
   phone/src/ 拼出来的产物，见 scripts/build-cg-page.mjs），不进 vite 的模块图。 */
function copyCg(destRoot) {
  if (!existsSync('cg')) return;
  cpSync('cg', join(destRoot, 'cg'), { recursive: true });
}

function copyShop(destRoot) {
  if (!existsSync('shop')) return;
  cpSync('shop', join(destRoot, 'shop'), { recursive: true });
}

function copyOpening(destRoot) {
  for (const file of ['opening.html', 'opening.css', 'opening.js']) {
    if (existsSync(file)) cpSync(file, join(destRoot, file));
  }
}

/* 静态素材是否走 jsDelivr。默认关（本地跑回归时素材走本地，离线可跑、结果确定），
   部署时由 pages.yml 设 ASSET_CDN=1。理由和实测数据见 scripts/asset-cdn.mjs 顶部。 */
const USE_ASSET_CDN = cdnEnabled();

/* 把 dist 里 HTML/CSS 的静态素材引用改写成 CDN 绝对地址。
   JS 不走这里 —— asset() 是运行时拼的，靠下面的 define 注入根地址。 */
function rewriteAssetRefs(destRoot) {
  if (!USE_ASSET_CDN) return;
  /* public/assets 和 arcade/assets 是两棵素材树，相对引用都长成 assets/xxx，
     靠产物文件的位置决定该查哪棵。 */
  const contexts = buildRewriteContexts();
  const touched = {};
  for (const file of listRewritable(destRoot)) {
    const ctx = contexts.find((c) => c.match(file));
    if (!ctx) continue;
    const before = readFileSync(file, 'utf8');
    const after = rewriteStaticRefs(before, ctx.known, ctx.root);
    if (after !== before) {
      writeFileSync(file, after);
      touched[ctx.id] = (touched[ctx.id] || 0) + 1;
    }
  }
  const summary = Object.entries(touched).map(([k, v]) => `${k} ${v} 个`).join('，') || '无改动';
  console.log(`[asset-cdn] 素材外链已指向 ${CDN_HOST}（改写 ${summary}）`);
}

export default defineConfig({
  /* Relative so GitHub project pages (/linjiang-glass/) and local preview both work.
     刻意只让*素材*走 CDN，base 保持相对：HUD 靠 postMessage 和同源 DOM 跟宿主页
     通信，把 JS/CSS 挪成跨源会直接断掉，而且 dist/ 在 gitignore 里，CDN 看不到。 */
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  build: { target: 'chrome110', assetsInlineLimit: 0 },
  /* null 表示走本地 ${BASE_URL}assets/。src/asset.js 和 src/data.js 都读这个。 */
  define: { __ASSETS_ROOT__: JSON.stringify(USE_ASSET_CDN ? ASSETS_ROOT : null) },
  plugins: [{
    name: 'copy-static-pages',
    closeBundle() {
      copyCityMap('dist');
      copyArcade('dist');
      copyCg('dist');
      copyShop('dist');
      copyOpening('dist');
      /* 必须在所有拷贝之后：city/cg/arcade/shop/opening 里也有素材引用。 */
      rewriteAssetRefs('dist');
    },
  }],
});
