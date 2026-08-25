/* 量测用的外部资源替身。
   ==================================================================
   为什么必须有这个东西：夹具跑的是真实的状态栏 / 正文美化 / 真实 ST 样式，它们会去
   fonts.googleapis.com 取字体、去 anchor.bolt.qzz.io 取图。headless 环境里这些请求在不确定
   的时刻超时或落地，每次落地都让浏览器重新排字、重新解码，于是触发一整轮重绘 + 光栅。

   这件事坑过两次，两次的表现完全不同，所以值得把症状记在这里：

   一、check-hud-raster-perf.mjs 的静止相断言报「297 次 / 460ms 常驻光栅」。先怀疑 CSS 动画
       （遍历顶层 + 4 个 iframe 的 getAnimations()，全是 0），又怀疑安顿时间不够（1.5s 加到
       4s，数字一点没动）。真正的线索是把安顿期切成 8 个窗口分别 trace 后的形状：
       0 → 221 → 236 → 0 → 0 ……，一次爆发夹在两段死寂之间，而且爆发落在哪个窗口每次运行都
       不一样。常驻开销不会长这样，只有外部 I/O 会。

   二、probe-reading-perf.mjs 的 readyMs（从 goto 到所有阅读器脱离 render-pending）。正文美化
       的揭开路径上有 GOOGLE_READING_FONT_HREF，所以这个数字里掺着「Google Fonts 这次花多久
       失败」。它不会像上面那样露出可疑的形状，只是安静地把变体之间的差值淹掉 —— 更危险。

   替身的选择不是随便给的：

     字体样式表  → 200 + 空 CSS。不能 abort：@import 失败和「加载成功但没有规则」在字体回退
                   逻辑里走的分支不同，空 CSS 更接近「这个字体不可用」这个稳定终局。
     字体文件    → 204。让它立刻走回退字体，不留悬挂的 font-display 计时器。
     图          → 200 + 1×1 透明 PNG。刻意不 abort：abort 会让 <img> 塌成 0 高，改变真实
                   几何，而对齐类断言和版面尺寸门禁要看真实几何。1×1 让解码立刻成功且尺寸恒定。
     其它        → abort。

   本机地址（夹具服务器）、data:、blob: 一律放过。
*/

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const LOCAL = /^(?:https?:\/\/(?:127\.0\.0\.1|localhost)[:/]|data:|blob:)/;
const FONT_CSS_HOSTS = /^(?:fonts\.googleapis\.com|fontsapi\.zeoseven\.com)$/;

/* 注意注册顺序：Playwright 按注册的逆序匹配路由，后注册的先被问到，且只会有一个处理器执行
   （没调 route.fallback 的话）。所以这条兜底必须**先**注册，之后再注册那些更专门的路由
   （比如用 git 版本替换某个文件的基线路由），专门的才压得过兜底。 */
export async function stubExternalRequests(page, seenHosts = new Set()) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (LOCAL.test(url)) return route.continue();

    let host = '';
    try { host = new URL(url).host; } catch { /* 畸形 URL，按未知外部处理 */ }
    seenHosts.add(host || url.slice(0, 40));

    if (FONT_CSS_HOSTS.test(host)) {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    }
    if (host === 'fonts.gstatic.com' || /\.(?:woff2?|ttf|otf|eot)(?:\?|$)/i.test(url)) {
      return route.fulfill({ status: 204, body: '' });
    }
    if (/\.(?:png|jpe?g|webp|gif|avif|svg|ico)(?:\?|$)/i.test(url) || route.request().resourceType() === 'image') {
      return route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
    }
    return route.abort();
  });
  return seenHosts;
}
