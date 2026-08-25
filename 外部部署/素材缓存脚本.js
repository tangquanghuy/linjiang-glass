/* 临江 · 素材缓存
   =========================================================================
   贴进酒馆的「脚本」栏，和 辅助计算脚本.js 并列。它跟游戏逻辑无关，只干一件事：
   把卡片要用的图存进 IndexedDB，之后一律从本地取，不再走网络。

   为什么要这一层
   ------------------------------------------------------------------------
   正文美化的卡片每来一条消息就重渲染一次，图片跟着重新走一遍缓存判定。
   而两个资源站给的响应头都不够用：

     图床 anchor.bolt.qzz.io   没有 Cache-Control，Cloudflare 边缘也是 DYNAMIC，
                               只能靠浏览器的启发式缓存，不可控
     GitHub Pages              Cache-Control: max-age=600 + ETag，十分钟后每次
                               重开都要带 If-None-Match 换一个 304

   存进 IndexedDB 之后这两趟都省了：命中就是 0 请求。

   能管到谁：只有 CORS 允许的源
   ------------------------------------------------------------------------
   要把图收进 IndexedDB 必须 fetch 出 Blob，跨源 fetch 读响应体需要对方给
   Access-Control-Allow-Origin。实测：

     Pages     给了 ACAO: *    → 礼物图标、突发事件底图，能接管
     jsDelivr  给了 ACAO: *    → 状态栏背景、毛玻璃颗粒等大素材，能接管
     图床      没给 ACAO       → 头像、SFW 封面，接管不了

   jsDelivr 是后来加的：public/assets 里 bg-plate.png 2MB、frost.png 1MB，走
   Pages 在国内实测要 180 秒以上还会整个取不回来，走 testingcf 是 2~11 秒，所以
   构建时把素材外链指到了 jsDelivr（见仓库 scripts/asset-cdn.mjs）。它同样给
   ACAO: *，而且 max-age 是 604800（Pages 只有 600），所以这层缓存对它更划算 ——
   第一次几秒，之后 0 请求。

   不在名单里的地址 url() 原样返回，`<img>` 直连
   （`<img>` 不需要 CORS，图照样显示，只是没有这层持久缓存）。
   图床那批要想也管上，得在 Cloudflare 那边给它加 ACAO 和 Cache-Control，
   加了之后把域名塞进 ALLOW 就行，这个文件不用改别的。

   开局预取只做礼物图标（11 个 webp，合计 60KB）。底图 10 张压缩前 4MB，
   一个存档实际只会用到两三个大区，所以按需拉、拉到就留下。

   对外接口（window.LinjiangAssets）
   ------------------------------------------------------------------------
     url(远程地址)   同步。命中返回 blob: 地址，没命中返回原地址并在后台补缓存
     warm(地址数组)  异步。批量拉进缓存
     ready           Promise，索引读完就 resolve
     stats()         看缓存了多少、占多少
     clear()         清空
   ========================================================================= */

(function () {
    'use strict';

    const TAG = '[临江素材]';
    const DB_NAME = 'linjiang-assets';
    const DB_VERSION = 1;
    const STORE = 'blobs';

    /* 只有这些源的东西能进缓存（要求对方给 ACAO）。
       testingcf 而不是 cdn.jsdelivr.net：后者在国内被墙。 */
    const ALLOW = [
        'https://tangquanghuy.github.io/',
        'https://testingcf.jsdelivr.net/',
    ];

    /* 重新校验的间隔。Pages 上的文件会随发布变，但不会一天变好几次，
       所以隔一天带 ETag 问一次就够，平时完全不出网。 */
    const REVALIDATE_MS = 24 * 60 * 60 * 1000;

    /* 缓存总量上限。超了就从最久没用的开始扔。 */
    const MAX_BYTES = 24 * 1024 * 1024;

    const mem = new Map();      // url -> { objectUrl, size, blob }
    const inflight = new Map(); // url -> Promise
    let db = null;

    const cacheable = (url) => ALLOW.some((p) => String(url || '').startsWith(p));

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const d = req.result;
                if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'url' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function tx(mode) {
        return db.transaction(STORE, mode).objectStore(STORE);
    }

    function idbAll() {
        return new Promise((resolve, reject) => {
            const req = tx('readonly').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    function idbPut(rec) {
        return new Promise((resolve, reject) => {
            const req = tx('readwrite').put(rec);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    function idbGet(url) {
        return new Promise((resolve) => {
            const req = tx('readonly').get(url);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    function idbDel(url) {
        return new Promise((resolve) => {
            const req = tx('readwrite').delete(url);
            req.onsuccess = req.onerror = () => resolve();
        });
    }

    /* 把一条记录挂进内存：建 objectURL，之后 url() 就是同步查表。 */
    function mount(rec) {
        if (!rec || !rec.blob) return;
        const old = mem.get(rec.url);
        if (old && old.objectUrl) URL.revokeObjectURL(old.objectUrl);
        mem.set(rec.url, {
            objectUrl: URL.createObjectURL(rec.blob),
            size: rec.size || rec.blob.size,
            etag: rec.etag || '',
            at: rec.at || 0
        });
    }

    async function evictIfNeeded() {
        let total = 0;
        for (const v of mem.values()) total += v.size || 0;
        if (total <= MAX_BYTES) return;
        const byAge = [...mem.entries()].sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
        for (const [url, v] of byAge) {
            if (total <= MAX_BYTES) break;
            total -= v.size || 0;
            if (v.objectUrl) URL.revokeObjectURL(v.objectUrl);
            mem.delete(url);
            await idbDel(url);
            console.info(TAG, '容量超了，扔掉', url);
        }
    }

    /* 真正去网上取一份存下来。已经在缓存里且还没到复查时间就直接返回。 */
    function fetchAndStore(url, { force } = {}) {
        if (!cacheable(url)) return Promise.resolve(null);
        if (inflight.has(url)) return inflight.get(url);

        const hit = mem.get(url);
        if (hit && !force && Date.now() - (hit.at || 0) < REVALIDATE_MS) {
            return Promise.resolve(hit.objectUrl);
        }

        const job = (async () => {
            try {
                const headers = {};
                // 有旧副本就带上 ETag：没变的话服务器回 304，一个字节的图都不用重下
                if (hit && hit.etag) headers['If-None-Match'] = hit.etag;
                const res = await fetch(url, {
                    headers,
                    credentials: 'omit',
                    // 首次抓取走默认缓存策略（HTTP 缓存里有就白拿）；复查时才强制回源问 ETag
                    cache: hit ? 'no-cache' : 'default'
                });

                if (res.status === 304 && hit) {
                    // 没变：只把复查时间往后推，blob 留在 IndexedDB 里不动
                    hit.at = Date.now();
                    const rec = await idbGet(url);
                    if (rec) { rec.at = hit.at; await idbPut(rec).catch(() => { }); }
                    return hit.objectUrl;
                }
                if (!res.ok) throw new Error('HTTP ' + res.status);

                const blob = await res.blob();
                const rec = {
                    url,
                    blob,
                    etag: res.headers.get('ETag') || '',
                    size: blob.size,
                    at: Date.now()
                };
                await idbPut(rec);
                mount(rec);
                await evictIfNeeded();
                return mem.get(url).objectUrl;
            } catch (err) {
                // 拿不到就算了：url() 会退回远程地址，卡片照常显示
                console.warn(TAG, '缓存失败，改直连', url, err && err.message);
                return null;
            } finally {
                inflight.delete(url);
            }
        })();

        inflight.set(url, job);
        return job;
    }

    const api = {
        /* 同步取地址。命中给 blob:，没命中给原地址并在后台补。 */
        url(remote) {
            const key = String(remote || '');
            if (!key) return key;
            if (!cacheable(key)) return key;
            const hit = mem.get(key);
            if (hit) {
                // 到期了在后台悄悄复查一次，这次照旧用本地副本
                if (Date.now() - (hit.at || 0) >= REVALIDATE_MS) fetchAndStore(key);
                return hit.objectUrl;
            }
            fetchAndStore(key);
            return key;
        },

        async warm(list) {
            const urls = (Array.isArray(list) ? list : [list]).filter(cacheable);
            const done = await Promise.all(urls.map((u) => fetchAndStore(u).catch(() => null)));
            return done.filter(Boolean).length;
        },

        stats() {
            let bytes = 0;
            for (const v of mem.values()) bytes += v.size || 0;
            return { 条数: mem.size, 占用KB: Math.round(bytes / 1024), 上限KB: Math.round(MAX_BYTES / 1024) };
        },

        async clear() {
            for (const v of mem.values()) if (v.objectUrl) URL.revokeObjectURL(v.objectUrl);
            mem.clear();
            await new Promise((resolve) => {
                const req = tx('readwrite').clear();
                req.onsuccess = req.onerror = () => resolve();
            });
            return true;
        },

        cacheable
    };

    /* 提示走酒馆的 toastr，跟 辅助计算脚本.js 那句「脚本已加载」一个路子。
       toastr 不一定存在（比如在纯浏览器里打开测），所以整段包起来。 */
    function toast(kind, text) {
        console.info(TAG, text);
        try {
            if (typeof toastr !== 'undefined' && toastr[kind]) toastr[kind]('[素材缓存] ' + text);
        } catch (_) { /* ignore */ }
    }

    /* 礼物图标的地址不在这个文件里写死 —— 表在 辅助计算脚本.js，
       这里跟卡片一样从 roomMenu() 问。脚本还没加载就等一会儿再问，问不到就跳过。 */
    async function prefetchGifts(tries) {
        const aux = window.LinjiangAux;
        const menu = aux && typeof aux.roomMenu === 'function' ? aux.roomMenu() : null;
        if (!menu) {
            if ((tries || 0) < 10) {
                setTimeout(() => prefetchGifts((tries || 0) + 1), 1500);
            } else {
                toast('info', '没等到辅助计算脚本，礼物图标改成用到再缓存');
            }
            return;
        }
        const urls = [].concat(menu.礼物 || [], menu.大航海 || [])
            .map((g) => g && g.图标).filter(Boolean);
        const n = await api.warm(urls);
        const s = api.stats();
        if (n < urls.length) {
            // 常见于新图还没随 Pages 发布上线：这时礼物按钮只有文字，不影响功能
            toast('warning', `静态资源缓存 ${n}/${urls.length}，有 ${urls.length - n} 个没取到（共 ${s.条数} 项 / ${s.占用KB} KB）`);
        } else {
            toast('success', `静态资源已缓存 · ${s.条数} 项 / ${s.占用KB} KB`);
        }
    }

    api.ready = (async () => {
        try {
            db = await openDb();
            const all = await idbAll();
            all.forEach(mount);
            console.info(TAG, '就绪', api.stats());
        } catch (err) {
            console.warn(TAG, err);
            toast('warning', 'IndexedDB 打不开，缓存层停用，图片走直连');
            api.url = (u) => String(u || '');
            api.warm = async () => 0;
            api.broken = true;
        }
        return api;
    })();

    /* 酒馆中的脚本和消息卡片可能运行在不同的 iframe。将 API 与加载标记同时
       发布到当前窗口、父窗口和顶层窗口，封面与正文才能稳定检测到。 */
    function publish(target) {
        try {
            if (!target) return;
            target.LinjiangAssets = api;
            target.__素材缓存脚本_loaded__ = true;
            target.__临江素材缓存_loaded__ = true;
        } catch (_) { /* 跨源窗口忽略 */ }
    }

    const publishTargets = [window];
    try { if (window.parent && !publishTargets.includes(window.parent)) publishTargets.push(window.parent); } catch (_) { }
    try { if (window.top && !publishTargets.includes(window.top)) publishTargets.push(window.top); } catch (_) { }
    publishTargets.forEach(publish);

    api.ready.then(() => {
        // 初始化完成后再发布一次，覆盖酒馆重建窗口期间丢失的引用。
        publishTargets.forEach(publish);
        if (!api.broken) prefetchGifts(0);
    });
})();

