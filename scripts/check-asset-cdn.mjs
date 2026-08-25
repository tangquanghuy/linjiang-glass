/* 静态素材 CDN 改写的回归检查： npm run assets:cdn
   =================================================

   守的是三件会「静悄悄坏掉」的事：

   1. 应用 bundle 绝不能被改写到 CDN。
      vite 把打包产物也 emit 到 dist/assets/ 下，跟摊平过来的 public/assets/ 混在
      同一个目录里。按 `./assets/` 前缀无脑替换的话，index-<hash>.js 也会被指到
      jsDelivr —— 那边没有 dist/（在 .gitignore 里），直接 404；退一步说就算有，
      JS 变跨源也会断掉 HUD 赖以跟宿主页通信的 postMessage 和同源 DOM 访问。
      所以改写必须由 public/assets/ 的真实文件清单当白名单来驱动。

   2. 大素材必须真的指向了 CDN。
      漏掉的后果不是报错，是玩家那边背景图三分钟出不来（实测 Pages 178~217 秒，
      还出现过 240 秒整个失败）。

   3. 不设 ASSET_CDN 时必须完全走本地。
      否则本地 playwright 回归会依赖外网、且在素材改了还没推的时候测到旧版。

   顺带断言 CDN 上确实有这些文件且字节一致（--net 才联网，默认不联）。 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ASSETS_ROOT, ARCADE_ASSETS_ROOT, listPublicAssets, rewriteStaticRefs, hasWalledCdn,
} from './asset-cdn.mjs';

const WANT_NET = process.argv.includes('--net');
let bad = 0;
const fail = (m) => { console.log('  [失败] ' + m); bad += 1; };
const ok = (m) => console.log('  [通过] ' + m);

function build(useCdn) {
    execFileSync(process.execPath, [join('node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
        stdio: 'pipe',
        env: { ...process.env, ASSET_CDN: useCdn ? '1' : '' },
    });
}

function distFiles(exts = /\.(html|css|js)$/) {
    const out = [];
    (function walk(d) {
        for (const n of readdirSync(d)) {
            const f = join(d, n);
            if (statSync(f).isDirectory()) walk(f);
            else if (exts.test(n)) out.push(f.replace(/\\/g, '/'));
        }
    })('dist');
    return out;
}

/* ---------- 改写规则本身 ----------
   先按形态逐条考 rewriteStaticRefs，再看整份产物。顺序是刻意的：产物检查只能告诉你
   「当前恰好没出问题」，形态检查才能告诉你「换个写法也不会出问题」。裸 /assets/ 那个
   bug 就是这么抓到的 —— 当时 dist 里没有这种形态，整套产物检查全绿。 */
console.log('=== 改写规则（按形态）===');
{
    const known = new Set(['bg-plate.png', 'frost.png', 'items/goods-clothing.png']);
    const R = (s) => rewriteStaticRefs(s, known);
    const eq = (name, got, want) => (got === want
        ? ok(name)
        : fail(`${name}\n      期望: ${want}\n      实际: ${got}`));

    eq('./assets/ 形态', R('./assets/bg-plate.png'), ASSETS_ROOT + 'bg-plate.png');
    eq('../assets/ 形态', R('../assets/frost.png'), ASSETS_ROOT + 'frost.png');
    eq('裸 /assets/ 形态', R('"/assets/frost.png"'), `"${ASSETS_ROOT}frost.png"`);
    eq('子目录', R('./assets/items/goods-clothing.png'), ASSETS_ROOT + 'items/goods-clothing.png');

    /* 白名单外一律原样 —— 这是应用主体不被搬到 CDN 的唯一屏障。 */
    for (const s of [
        './assets/index-Du4Zn0KG.js',
        './assets/index-LQh4tn6Q.css',
        './assets/dev-notes-Dnmi0RQf.js',
        'assets/shrine/token.png',
        './assets/items/nope.png',
    ]) eq(`白名单外原样: ${s}`, R(s), s);

    /* 绝对地址的中段不能被命中，否则拼出 ...linjiang-glassHTTPS://... */
    const pagesUrl = 'https://tangquanghuy.github.io/linjiang-glass/assets/bg-plate.png';
    eq('Pages 绝对地址原样', R(`"${pagesUrl}"`), `"${pagesUrl}"`);

    eq(
        '混排：素材改、bundle 不动',
        R('<img src="./assets/bg-plate.png"><script src="./assets/index-Du4Zn0KG.js">'),
        `<img src="${ASSETS_ROOT}bg-plate.png"><script src="./assets/index-Du4Zn0KG.js">`
    );

    const once = R('./assets/bg-plate.png');
    eq('幂等（二次）', R(once), once);
    eq('幂等（三次）', R(R(once)), once);

    /* 被墙域名的判据：正例证明它真的会红，反例证明它不会被警示注释误伤。
       缺了正例，这条断言就只是一盏没证明过灵敏度的绿灯。 */
    const yes = (name, s) => (hasWalledCdn(s) ? ok(name) : fail(`${name} —— 应该判违规却放过了`));
    const no = (name, s) => (hasWalledCdn(s) ? fail(`${name} —— 误报`) : ok(name));
    yes('能抓到真的 <script src="https://cdn.jsdelivr.net/...">',
        '<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>');
    yes('能抓到 <link href="https://cdn.jsdelivr.net/...">',
        '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/x/y.css">');
    no('HTML 注释里的警示不算违规', '<!-- cdn.jsdelivr.net 被墙，务必保持 testingcf -->');
    no('块注释里的警示不算违规', '/* cdn.jsdelivr.net 被墙，改回去会白屏 */');
    no('注释里连完整地址也不算违规', '<!-- 不要写成 https://cdn.jsdelivr.net/npm/jquery -->');
    no('testingcf 本身不算违规', '<script src="https://testingcf.jsdelivr.net/npm/jquery.min.js"></script>');
}

/* ---------- CDN 模式 ---------- */
console.log('\n=== ASSET_CDN=1 构建 ===');
build(true);

const html = readFileSync('dist/index.html', 'utf8');
if (/jsdelivr[^"'\s]*\/(index|dev-notes)-[A-Za-z0-9_-]+\.(js|css)/.test(html)) {
    fail('index.html 里出现了指向 CDN 的应用 bundle —— CDN 上没有 dist/，且 JS 跨源会断 postMessage');
} else {
    const refs = [...html.matchAll(/\.\/assets\/(?:index|dev-notes)-[A-Za-z0-9_-]+\.(?:js|css)/g)].map((m) => m[0]);
    if (!refs.length) fail('index.html 里找不到相对路径的 bundle 引用，检查假设已失效');
    else ok(`bundle 保持同源相对路径（${refs.length} 处）`);
}

const known = new Set(listPublicAssets());
if (known.size < 50) fail(`public/assets 只列出 ${known.size} 个文件，清单疑似没读到`);
else ok(`public/assets 清单 ${known.size} 个文件`);

/* 大素材：HTML/CSS 里不允许再有本地引用。 */
const BIG = ['bg-plate.png', 'opening-background.png', 'frost.png'];
const rootRe = new RegExp(ASSETS_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
for (const name of BIG) {
    const esc = name.replace(/\./g, '\\.');
    const hosts = distFiles(/\.(html|css)$/).filter((f) => readFileSync(f, 'utf8').includes(name));
    if (!hosts.length) { fail(`${name} 在 dist 的 HTML/CSS 里完全没有引用，检查假设已失效`); continue; }
    for (const f of hosts) {
        const s = readFileSync(f, 'utf8');
        if (!s.includes(ASSETS_ROOT + name)) { fail(`${name} 在 ${f} 里没指向 CDN`); continue; }
        /* 把 CDN 前缀剥掉再找本地形态，否则绝对地址里那一段会被误判成本地引用。 */
        if (new RegExp(`(?:\\.\\.?/)?assets/${esc}`).test(s.replace(rootRe, ''))) {
            fail(`${name} 在 ${f} 里仍残留本地引用`);
        }
    }
}
if (!bad) ok(`大素材均指向 ${ASSETS_ROOT}`);

/* asset() 是运行时拼的，靠 vite define 注入根地址，所以要在 JS 里看到它。 */
const jsBundles = distFiles(/\.js$/).filter((f) => /dist\/assets\/index-/.test(f));
if (!jsBundles.length) fail('找不到主 JS bundle');
else if (jsBundles.some((f) => readFileSync(f, 'utf8').includes(ASSETS_ROOT))) ok('asset()/ITEM_ART/GIFT_ART 的根已注入 JS');
else fail('主 JS bundle 里没有 CDN 根，asset() 还在走本地');

/* 街机自己那棵素材树。它以前整棵都走 Pages，其中 fishing.html 里内联了 2.6MB base64，
   在国内就是「大厅一直停在正在载入」。 */
{
  const arcadeKnown = new Set(listPublicAssets('arcade/assets'));
  if (arcadeKnown.size < 20) fail(`arcade/assets 只列出 ${arcadeKnown.size} 个文件，抽取疑似没落地`);
  else ok(`arcade/assets 清单 ${arcadeKnown.size} 个文件`);

  for (const name of ['games/fishing-background.webp', 'shrine/wishing-tree-bg.png']) {
    if (!arcadeKnown.has(name)) { fail(`arcade/assets 里缺 ${name}`); continue; }
    const hosts = distFiles(/\.(html|css)$/).filter((f) => /[\\/]arcade[\\/]/.test(f) && readFileSync(f, 'utf8').includes(name));
    if (!hosts.length) { fail(`${name} 在 dist/arcade 的 HTML/CSS 里没有引用`); continue; }
    for (const f of hosts) {
      if (readFileSync(f, 'utf8').includes(ARCADE_ASSETS_ROOT + name)) ok(`${name} -> CDN  (${f})`);
      else fail(`${name} 在 ${f} 里没指向 ${ARCADE_ASSETS_ROOT}`);
    }
  }

  /* 反向断言：街机素材绝不能被改写到 public/assets 那棵树的前缀下（两棵树的相对引用
     长得一模一样，选错上下文就会拼出 404，而且是静默的）。 */
  const crossed = distFiles(/\.(html|css)$/)
    .filter((f) => /[\\/]arcade[\\/]/.test(f) && readFileSync(f, 'utf8').includes(ASSETS_ROOT));
  if (crossed.length) fail(`dist/arcade 里出现了 public/assets 的 CDN 前缀（选错素材树）: ${crossed.join(', ')}`);
  else ok('街机产物没有串到 public/assets 的前缀上');

  /* 体积回归：把 base64 内联回 HTML 会让这个修复静默失效。 */
  for (const [file, limitKb] of [['arcade/fishing.html', 200], ['arcade/slots.html', 200]]) {
    const bytes = readFileSync(file).length;
    const b64 = [...readFileSync(file, 'utf8').matchAll(/data:[a-z/+.-]+;base64,/g)].length;
    const kb = Math.round(bytes / 1024);
    if (kb > limitKb) fail(`${file} ${kb}KB 超过 ${limitKb}KB —— 素材是不是又被内联回去了`);
    else if (b64 > 0) fail(`${file} 里还有 ${b64} 个 base64 data URI`);
    else ok(`${file} ${kb}KB（无内联 base64，上限 ${limitKb}KB）`);
  }
}

/* 素材本体仍要留在 dist：Pages 作后备，本地 preview 也要用。 */
const missing = BIG.filter((n) => !existsSync('dist/assets/' + n));
if (missing.length) fail('dist 里少了素材本体: ' + missing.join(', '));
else ok('素材本体仍随 dist 发布（Pages 作后备）');

/* 幂等：不能套娃。 */
const nested = distFiles().filter((f) => {
    const s = readFileSync(f, 'utf8');
    return /public\/assets\/https?:/.test(s) || /jsdelivr[^"')\s]*jsdelivr/.test(s);
});
if (nested.length) fail('出现嵌套改写: ' + nested.join(', '));
else ok('无嵌套改写');

/* ---------- 默认（本地）模式 ---------- */
console.log('\n=== 默认构建（不设 ASSET_CDN）===');
build(false);
const leaked = distFiles().filter((f) => readFileSync(f, 'utf8').includes(ASSETS_ROOT));
if (leaked.length) fail('默认构建里出现 CDN 素材根: ' + leaked.join(', '));
else ok('素材全部走本地，回归可离线跑');
if (/(?:\.\/)?assets\/bg-plate\.png/.test(readFileSync('dist/index.html', 'utf8'))) ok('index.html 仍是本地 ./assets/bg-plate.png');
else fail('默认构建里 bg-plate.png 的本地引用不见了');

/* ---------- 联网抽查 ---------- */
if (WANT_NET) {
    console.log('\n=== CDN 抽查（--net）===');
    const all = [...known];
    const pick = BIG.filter((n) => known.has(n));
    for (const dir of ['items/', 'gifts/']) {
        const first = all.find((p) => p.startsWith(dir));
        if (first) pick.push(first);
    }
    /* 街机那棵树也抽查：games/ 是从 base64 里抽出来的，shrine/ 是原本就最大的两张。 */
    const arcadePicks = ['games/fishing-background.webp', 'games/slots-cherry.webp', 'shrine/wishing-tree-bg.png'];
    for (const rel of arcadePicks) {
        if (!existsSync('arcade/assets/' + rel)) { fail(`arcade/assets/${rel} 本地不存在`); continue; }
        const want = createHash('sha256').update(readFileSync('arcade/assets/' + rel)).digest('hex');
        const t0 = Date.now();
        try {
            const res = await fetch(ARCADE_ASSETS_ROOT + rel, { cache: 'no-store' });
            const buf = Buffer.from(await res.arrayBuffer());
            const got = createHash('sha256').update(buf).digest('hex');
            if (!res.ok) fail(`HTTP ${res.status}  arcade/${rel}（新文件要等推送后 CDN 才有）`);
            else if (got !== want) fail(`字节不一致 arcade/${rel}`);
            else ok(`${String(Date.now() - t0).padStart(6)}ms ${String(Math.round(buf.length / 1024)).padStart(5)}KB  arcade/${rel}`);
        } catch (e) {
            fail(`${e.name}  arcade/${rel}`);
        }
    }

    for (const rel of pick) {
        const want = createHash('sha256').update(readFileSync('public/assets/' + rel)).digest('hex');
        const t0 = Date.now();
        try {
            const res = await fetch(ASSETS_ROOT + rel, { cache: 'no-store' });
            const buf = Buffer.from(await res.arrayBuffer());
            const got = createHash('sha256').update(buf).digest('hex');
            if (!res.ok) fail(`HTTP ${res.status}  ${rel}`);
            else if (got !== want) fail(`字节不一致 ${rel}（本地 ${want.slice(0, 12)} / CDN ${got.slice(0, 12)}）`);
            else ok(`${String(Date.now() - t0).padStart(6)}ms ${String(Math.round(buf.length / 1024)).padStart(5)}KB  ${rel}`);
        } catch (e) {
            fail(`${e.name}: ${e.message}  ${rel}`);
        }
    }
    /* 粘贴份和独立页面里硬编码的外链。这些不经过构建改写，写错了不会有任何检查拦住，
       表现是玩家那边图裂或整页白屏（cg/index.html 的 jQuery 是同步阻塞的，取不到
       就一路挂到超时，后面的脚本全不执行）。所以这里直接去取一次。 */
    console.log('\n=== 硬编码外链是否可取 ===');
    const HARDCODED = ['外部部署/开局.html', 'cg/index.html'];
    const seen = new Set();
    for (const file of HARDCODED) {
        if (!existsSync(file)) { fail(`${file} 不在`); continue; }
        const text = readFileSync(file, 'utf8');
        if (hasWalledCdn(text)) {
            fail(`${file} 里有 https://cdn.jsdelivr.net —— 该域名在国内被墙，必须用 testingcf`);
        }
        for (const m of text.matchAll(/https:\/\/testingcf\.jsdelivr\.net\/[^"'\s>)]+/g)) {
            const url = m[0];
            if (seen.has(url)) continue;
            seen.add(url);
            try {
                const res = await fetch(url, { cache: 'no-store' });
                const buf = Buffer.from(await res.arrayBuffer());
                if (!res.ok) fail(`HTTP ${res.status}  ${url}`);
                else ok(`${String(Math.round(buf.length / 1024)).padStart(5)}KB  ${url.replace(/^https:\/\/testingcf\.jsdelivr\.net\//, '')}`);
            } catch (e) {
                fail(`${e.name}: ${e.message}  ${url}`);
            }
        }
    }
} else {
    console.log('\n（跳过 CDN 联网抽查，加 --net 打开）');
}

console.log(bad ? `\n>>> ${bad} 项失败` : '\n>>> 全部通过');
process.exit(bad ? 1 : 0);
