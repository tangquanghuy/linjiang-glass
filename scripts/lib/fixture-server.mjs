/* 跑源码驱动夹具用的 vite dev server。
   ------------------------------------------------------------------
   真实源码不能走 vite 的转换管线：
     · public/style.css 里有 `@import 'lib/dialog-polyfill.css'` 这类相对 ST 安装目录的
       路径，vite 的 postcss-import 会去项目里找，找不到就整个 500；
     · public/index.html 有 70 万字节和一堆 <script src>，vite 一旦把它当 HTML 入口
       处理就会去 pre-transform 那些不存在的文件，并且被 parse5 的字符引用报错卡住；
     · TT 的 compat 模块和 ST 自带的 jQuery/lodash 是给浏览器直接吃的，转一遍只会添乱。

   所以给 artifacts/real-tavern 挂一个原样返回的中间件。vite 的 configureServer 在内部
   中间件之前安装，所以这个 handler 会先命中。
*/
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer } from 'vite';
import { PROJECT_ROOT, STAGE_DIR, STAGE_URL } from './real-tavern-sources.mjs';

const MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.vue': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/* 正文美化外链版的素材本地化。
   ------------------------------------------------------------------
   外链版把 5 张图和 22 块 CSS 都推到了 jsDelivr。量测时那些 URL 在离线环境取不到，于是
   external 变体会退化成「不解码图 + 无样式渲染」，跟 inline 变体就不可比了 —— 量出来的差距
   是假的。

   这里把 public/reading/ 直接挂到 /reading/，并且对 .css 做一次改写：把里面指向 jsDelivr 的
   图片地址换成同一个本地前缀。于是 external 变体真的会去解码那 5 张图、真的套上那 171KB 样式，
   只是走本地而不是 CDN。这纯粹是 harness 的事，不动任何产物。 */
function localReadingAssetsPlugin() {
  const READING_DIR = join(PROJECT_ROOT, 'public', 'reading');
  return {
    name: 'linjiang-local-reading-assets',
    configureServer(server) {
      server.middlewares.use('/reading', (req, res, next) => {
        const rawPath = decodeURIComponent((req.url || '').split('?')[0]);
        const target = resolve(join(READING_DIR, normalize(rawPath)));
        if (!target.startsWith(READING_DIR) || !existsSync(target) || !statSync(target).isFile()) {
          next();
          return;
        }
        const ext = extname(target).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        if (ext === '.css') {
          const text = readFileSync(target, 'utf8')
            .replace(/url\((['"]?)https?:\/\/[^)'"]*\/reading\//g, 'url($1/reading/');
          res.end(text);
          return;
        }
        res.end(readFileSync(target));
      });
    },
  };
}

/* 「如果把那 199KB 内联 JS 也外链，还有多少收益」这个问题的量测支架。
   ------------------------------------------------------------------
   要量得准，脚本必须挂在一个**稳定的 http URL** 上：只有这样 16 个楼层 iframe 才会共享
   HTTP 缓存和 V8 的代码缓存，而这正是外链相对内联可能赢的地方。blob: 或者 data: 都拿不到
   这两样，量出来会偏低。

   所以这里直接从产物里现抽：/harness/reading-body.js 提供 外链素材版 里体积最大的那个
   <script> 的内容。抽取规则和 tools/tavern-live-fixture.js 里的一致（取最大的一块），
   两边都断言体积一致，防止漂移。这只是量测支架，不生成任何产物。 */
function harnessScriptPlugin() {
  const PRODUCT = join(PROJECT_ROOT, '外部部署', 'V20260826', '正文美化-外链素材版.html');
  return {
    name: 'linjiang-harness-script',
    configureServer(server) {
      server.middlewares.use('/harness/reading-body.js', (req, res, next) => {
        if (!existsSync(PRODUCT)) { next(); return; }
        const source = readFileSync(PRODUCT, 'utf8');
        const blocks = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
        if (!blocks.length) { next(); return; }
        const biggest = blocks.reduce((a, b) => (b[1].length > a[1].length ? b : a));
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        /* 必须让它可缓存，否则 16 个 iframe 各下一遍，量的就不是同一件事了。 */
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.end(biggest[1]);
      });
    },
  };
}

/* 引导壳路径的本地化。
   ------------------------------------------------------------------
   外部部署/V20260826/状态栏-引导壳.html 里那句 <script src> 指向 GitHub Pages 上的
   shell/status-shell.js。夹具要验的正是「脚本从一个真的 http URL 异步取下来再执行」这条路径
   —— 换成内联或者 blob: 就把异步时序和那两道守卫全绕过去了，等于没测。

   所以这里把 public/shell/ 挂到 /shell/，并且对 status-shell.js 做一次改写：把 HUD_URL 换成
   夹具自己的 origin（本地那份 HUD）。这跟 loadProductionStatusSource 对自包含版做的改写是同一
   件事，只是自包含版能在 HTML 文本里改，引导壳的脚本是浏览器自己去取的，只能在服务端改。

   刻意 no-store：夹具里只有一个状态栏楼层，缓存没有可量的东西，不如让每次都是干净的。 */
function localShellPlugin() {
  const SHELL_DIR = join(PROJECT_ROOT, 'public', 'shell');
  return {
    name: 'linjiang-local-status-shell',
    configureServer(server) {
      server.middlewares.use('/shell', (req, res, next) => {
        const rawPath = decodeURIComponent((req.url || '').split('?')[0]);
        const target = resolve(join(SHELL_DIR, normalize(rawPath)));
        if (!target.startsWith(SHELL_DIR) || !existsSync(target) || !statSync(target).isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', MIME[extname(target).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        let body = readFileSync(target, 'utf8');
        if (target.endsWith('status-shell.js')) {
          /* 默认把 HUD 指到本服务器。但允许用 ?hud=<地址> 覆盖 —— 生产环境里酒馆和 HUD 是
             **两个源**（酒馆是 TT 应用，HUD 在 Pages），而夹具默认把两者放在同一个源上，
             于是「相对地址解析到了错误的源」这一类 bug 天生隐形（实测代价：原生流下商店/CG
             的 iframe 被解析到酒馆域，真机整屏黑，而夹具一路全绿）。
             自包含版能在 HTML 文本里改 HUD_URL，引导壳的脚本是浏览器自己去取的，只能在这里改，
             所以这个覆盖入口必须在服务端也有一份。 */
          const override = new URLSearchParams((req.url || '').split('?')[1] || '').get('hud');
          const local = override || `http://127.0.0.1:${server.config.server.port}/`;
          const patched = body.replace(
            /const\s+HUD_URL\s*=\s*(['"])[\s\S]*?\1\s*;/,
            `const HUD_URL = ${JSON.stringify(local)};`,
          );
          if (patched === body) {
            res.statusCode = 500;
            res.end('// 壳层脚本里找不到 HUD_URL，夹具无法把 HUD 指向本地');
            return;
          }
          body = patched;
        }
        res.end(body);
      });
    },
  };
}

function rawStagePlugin() {
  return {
    name: 'linjiang-raw-real-sources',
    configureServer(server) {
      server.middlewares.use(STAGE_URL, (req, res, next) => {
        const rawPath = decodeURIComponent((req.url || '').split('?')[0]);
        /* 只允许落在 STAGE_DIR 里，避免 ../ 逃出去。 */
        const target = resolve(join(STAGE_DIR, normalize(rawPath)));
        if (!target.startsWith(STAGE_DIR) || !existsSync(target) || !statSync(target).isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', MIME[extname(target).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(target));
      });
    },
  };
}

/**
 * @param {{ port: number }} options
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startFixtureServer({ port }) {
  const server = await createServer({
    root: PROJECT_ROOT,
    /* 量测harness 里必须关掉 HMR 和文件监听。真实源码是 stage 到 artifacts/ 的，也就是
       项目根里面；vite 的 watcher 会（延迟地）看见那批写入，然后给已连接的页面发一次
       full-reload —— 于是 waitForFunction 刚判定就绪，页面就被换掉了，window 上的夹具
       API 凭空消失。测滚动性能时一次意外重载更是直接毁掉整段 trace。 */
    server: { port, host: '127.0.0.1', hmr: false, watch: null },
    logLevel: 'error',
    plugins: [harnessScriptPlugin(), rawStagePlugin(), localReadingAssetsPlugin(), localShellPlugin()],
  });
  await server.listen();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => server.close(),
  };
}
