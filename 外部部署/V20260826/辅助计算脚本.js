/**
 * 管人痴 / 都市日系 SLG · 辅助计算脚本（引导版）
 *
 * 本文件由 scripts/build-aux-shell.mjs 从 public/shell/aux-shell.js 生成，请勿直接编辑。
 * 要改逻辑请改那份，然后 npm run aux:build。
 *
 * 挂在酒馆助手「脚本」里单独运行。酒馆助手把脚本内容包进 <script type="module">
 * （见 JS-Slash-Runner 的 src/panel/script/iframe.ts），所以这里可以直接用 import()。
 *
 * 这份文件里只有两样东西：
 *   一、礼物栏画得出来所需的最小闭包（表 + roomMenu），必须同步可用。
 *       正文美化的 mountLiveRoom() 在初始渲染就用 LinjiangAux.roomMenu() 把礼物列表写进 DOM，
 *       取不到就退到空表并且永久留空 —— 所以这部分不能等网络。
 *   二、把其余 137KB 逻辑从 CDN 取回来执行。那部分随仓库自动更新，不需要重新粘贴。
 *
 * 完整的取舍写在 scripts/build-aux-shell.mjs 的头部。
 */
(function () {
    'use strict';

    const BOOT_VERSION = '2026-08-25-aux-split-v1';

    // 一件东西一行：价格、人气点数、图标文件。以前价格/点数/图标分在三张表里。
    const GIFTS = [
        { name: '小心心', price: 0, pop: 2, file: 'gift-heart.webp' },
        { name: '辣条', price: 1, pop: 8, file: 'gift-snack.webp' },
        { name: '干杯', price: 20, pop: 70, file: 'gift-cheers.webp' },
        { name: '心愿盲盒', price: 50, pop: 150, file: 'gift-blindbox.webp' },
        { name: '情书', price: 100, pop: 400, file: 'gift-letter.webp' },
        { name: '小飞机', price: 200, pop: 900, file: 'gift-plane.webp' },
        { name: '摩天大楼', price: 520, pop: 2200, file: 'gift-tower.webp' },
        { name: '火箭', price: 1288, pop: 8000, file: 'gift-rocket.webp' },
    ];

    const GUARD_BUY = [
        { name: '舰长', price: 138, pop: 500, days: 30, file: 'gift-guard-1.webp' },
        { name: '提督', price: 1998, pop: 9000, days: 30, file: 'gift-guard-2.webp' },
        { name: '总督', price: 19998, pop: 40000, days: 30, file: 'gift-guard-3.webp' },
    ];

    const QTY_STEPS = [1, 10, 66, 233];

    const SC_STEPS = [30, 50, 100];

    /* 两个资源站，分工是被响应头逼出来的：
       ART_HOST（图床）放头像和 SFW 封面。它不给 Cache-Control，也不给
         Access-Control-Allow-Origin —— 后者意味着跨源 fetch 读不到响应体，
         素材缓存脚本没法把它的东西收进 IndexedDB，只能交给浏览器的启发式缓存。
         头像封面本来就在上面、<img> 直连不需要 CORS，所以不动它。
       PAGES_HOST（GitHub Pages）放礼物图标和突发事件底图。它给
         Cache-Control: max-age=600 + ETag + ACAO: *，能被缓存脚本接管；
         而且这两类素材本来就在仓库里，跟着 pages.yml 一起发，不用手动上传。 */
    const ART_HOST = 'https://anchor.bolt.qzz.io';

    const PAGES_HOST = 'https://tangquanghuy.github.io/linjiang-glass';

    /** 礼物栏要画的东西。价格、点数、图标 URL 都从这里拿，卡片不自己存。 */
    function roomMenu() {
        /* 图标走 Pages 的 assets/gifts/。原来拼的是 图床/礼物/gift-*.png，
           那个目录从来没上传过，11 个文件全 404 —— 礼物栏一直是没有图的。
           现在用同目录下新出的 128×128 webp（合计 60KB，原来的 256 png 留着给 HUD 自己的礼物页）。 */
        const icon = file => `${PAGES_HOST}/assets/gifts/${file}`;
        return {
            礼物: GIFTS.map(g => ({ ...g, 图标: icon(g.file) })),
            大航海: GUARD_BUY.map(g => ({ ...g, 图标: icon(g.file) })),
            数量档位: QTY_STEPS.slice(),
            醒目留言档位: SC_STEPS.slice(),
            资源域名: ART_HOST,
            底图域名: `${PAGES_HOST}/city/plate`,
        };
    }

    /* 占位 api。只撑到真实逻辑落地为止。
       ------------------------------------------------------------------
       为什么必须带一个 roomAction：正文美化的 lrAux() 是这样判定 api 可用的 ——
         return (api && api.roomAction) ? api : null;
       少了它，整个 api 会被拒掉，礼物栏跟着退回空表，那就白留 roomMenu 了。

       为什么返回 { ok:false } 而不是 Promise：lrDoAction 是完全同步的，直接读 res.ok 和
       res.快照。返回 Promise 会被判成「操作没能完成」，而且提示还是错的。返回一个明确的
       ok:false 加一句人话，正好走它已经写好的 toast 那条路。 */
    const bootApi = {
        roomMenu,
        roomAction() {
            return { ok: false, 提示: '辅助计算脚本还在加载，稍等一下再试' };
        },
    };

    const root = typeof globalThis !== 'undefined' ? globalThis : {};
    const publish = (api) => {
        try {
            root.LinjiangAux = api;
            if (root.parent && root.parent !== root) root.parent.LinjiangAux = api;
        } catch (_) { /* 跨域时只写自己 */ }
    };
    /* 先把占位挂上去，再去取真身。顺序很重要：反过来的话网络往返期间 LinjiangAux 是空的，
       礼物栏就会画成空表 —— 那正是这份引导文件要解决的问题。
       刻意不设 __管人痴辅助计算_loaded__：那个标志的含义是「完整逻辑已就位」，
       封面.html 拿它当依赖探针。占位不算就位。 */
    publish(bootApi);

    import('https://testingcf.jsdelivr.net/gh/tangquanghuy/linjiang-glass@main/public/shell/aux-shell.js')
        /* 真实逻辑自己会把完整 api 挂到 LinjiangAux 上（它末尾就干这件事），
           所以这里不用做什么，只在它没挂上时报一声。 */
        .then(() => {
            if (root.LinjiangAux === bootApi) {
                console.error('[辅助计算脚本] 逻辑已加载但没挂上 LinjiangAux，检查 aux-shell.js 末尾');
            }
        })
        .catch((err) => {
            console.error('[辅助计算脚本] 取不到线上逻辑，只有礼物栏可用', err);
            try {
                if (typeof toastr !== 'undefined') {
                    toastr.error('辅助计算脚本没取到，直播间与变量结算暂时不可用');
                }
            } catch (_) { /* 没有 toastr 就算了 */ }
        });

    console.log('[辅助计算脚本] 引导版已就位', BOOT_VERSION);
})();
