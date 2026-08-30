# 外部部署 · V20260826

这个目录里的文件不由构建系统发布，**要人手粘进 SillyTavern**（角色卡楼层、正则模板、或酒馆助手的脚本栏）。
粘下去之后它们就冻结在那一刻，仓库再怎么改都不会影响已经粘过的人。

所以这里的第一条规矩是：

> **别往这个目录里加逻辑。** 逻辑写进 `public/shell/`，让它随仓库自动发布；
> 这个目录只放「粘一次就不用再动」的引导壳，以及由脚本生成的产物。

`状态栏.html`、`状态栏-引导壳.html`、`辅助计算脚本.js`、`正文美化-外链素材版.html`
**都是生成物，不要直接编辑** —— 改了会被下一次 `*:build` 覆盖，而且 `*:check` 会在提交前报错。

## 现在的清单

体积是写这份文档时的约数，会随内容变 —— 看的是量级，不是精确值。
`npm run deploy:docs` 会校验这份文档跟代码有没有脱节（命令名、路径、清单完整性、以及下面
那几条设计性质），但它刻意**不**校验精确体积：那种断言天天红，等于没有断言。

| 文件 | 体积 | 部署方式 | 改了要重新粘吗 |
| --- | --- | --- | --- |
| `状态栏-引导壳.html` | 3.7 KB | 粘进角色卡「状态栏」。**新装用这个** | **不用**。逻辑在 `public/shell/status-shell.js` |
| `状态栏.html` | 121.0 KB | 同上，自包含版（脚本内联）。给已装旧版的人 | 要。每次改都要 |
| `辅助计算脚本.js` | 6.5 KB | 粘进酒馆助手「脚本」栏 | **基本不用**。只有改礼物表才要（见下） |
| `小手机脚本.js` | 431 KB | 版本归档；可用 jsDelivr 在酒馆助手脚本栏 `import` | 要 |
| `正文美化.html` | 580.0 KB | SillyTavern 正则把 AI 正文捕成 `$1` 塞进这个模板 | 要 |
| `正文美化-外链素材版.html` | 211.5 KB | 同上。图和 CSS 走 jsDelivr | 要 |
| `开局.html` | 47.5 KB | 粘进角色卡楼层。它只是个壳，真正的开局页在 Pages 上 | 要 |
| `格式修复脚本.js` | 27.3 KB | 粘进酒馆助手「脚本」栏 | 要 |
| `素材缓存脚本.js` | 12.6 KB | 粘进酒馆助手「脚本」栏 | 要 |
| `测试部署.md` | — | 不部署。记「怎么在真机上验还没上线的改动而不动生产」 | — |
| `封面.html` | 18.5 KB | 展示用页面，不参与运行 | — |
| `状态栏-测试版-流内嵌入.html` | 19.5 KB | **实验品**，不是生产用的。见下 | — |

对应的逻辑本体：

| 线上文件 | 体积 | 谁加载它 |
| --- | --- | --- |
| `public/shell/status-shell.js` | 116.4 KB | `状态栏-引导壳.html` 用 `<script src>` |
| `public/shell/aux-shell.js` | 139.6 KB | `辅助计算脚本.js` 用 `import()` |

## 2026-08-27: native browser mobile flow

Target: **SillyTavern 1.18.0 + Tavern Helper 4.9.3 + mobile Chrome/Safari**.
The production browser-mobile path no longer lifts a HUD iframe into the tavern body.
It loads the Pages CSS/module directly into Tavern Helper's srcdoc document:

```text
SillyTavern #chat
  -> Tavern Helper srcdoc iframe
       -> #linjiang-mobile-native-root (HUD DOM)
```

This path has no inner `#hud` iframe, `linjiang-hud-stage`, `followHud`,
`nudgePortraitHud`, or synthetic `touchScroll`. Dragging on the HUD uses the
browser's native #chat scrolling, matching the reference bottom-status-bar architecture.
Detail pages remain in the normal-flow floor and do not hide or rewrite tavern chrome.

Desktop keeps the lifted/clip-stage architecture unchanged. TauriTavern keeps its
existing compatibility path until that host is migrated and tested separately.
Regression command:

```bash
npm run tavern:mobile-flow
```

The check covers inline and boot shells, direct DOM mounting, absence of an inner HUD
iframe, native touch scrolling, hidden desktop docking settings, and normal-flow detail pages.

## 为什么非得这么绕

这套东西有两半，更新节奏完全不同：

- **HUD 产物**（`src/` → `dist` → GitHub Pages）：推一次 main，几秒后对**所有**玩家生效
- **这个目录**：冻结在每个玩家安装的那一天，而且你没法强制他们重新粘

两半是同一个 RPC 契约的两端。所以每次改 HUD 侧，都是在跟一群版本各异、且永远不会自己更新的粘贴脚本对话。

**已经出过一次事故**：城市规划蓝图的建设费，扣款逻辑只在 `状态栏.html` 里（`saveCustomMapNode`），
而 HUD 侧的价钱显示和按钮禁用随 Pages 上线了。旧壳层照样建节点、就是不扣钱，
HUD 无从分辨「扣了」和「没扣」—— 于是变成**静默的免费建设**，不是报错。

握手加版本号解决不了这件事：玩家不会因为看到「请更新状态栏」就去重新粘 100 多 KB 代码。
唯一有用的做法是让粘贴的那部分不含逻辑 —— 没有逻辑就没有版本，没有版本就无从脱节。

## 引导壳凭什么能写 MVU

这是整套设计的地基，别把它想反了：

> **同源权限属于「文档」，不属于脚本的来源 URL。**

粘贴的内容被酒馆助手渲染成 srcdoc iframe，那个文档与酒馆顶层**同源**。
从 jsDelivr 取来的脚本在这个文档里执行，照样摸得到 `parent.Mvu`。

两个可能的拦路虎都不存在，已经查过源码。下面这几个路径都在**酒馆的安装目录**里，不是本仓库
（本仓库也有 `src/`，别看混）：

- 酒馆助手不给 srcdoc iframe 加 `sandbox`（`JS-Slash-Runner/` 全目录搜 `sandbox=` 为空）
- SillyTavern 的 `SillyTavern-release/src/server-main.js:105` 是 `contentSecurityPolicy: false`
- 酒馆助手自己就从 `testingcf.jsdelivr.net` 加载 `log.js`
  （`JS-Slash-Runner/src/panel/script/iframe.ts`），这条路是它在用的

脚本栏的内容还会被包进 `<script type="module">`（`JS-Slash-Runner/src/panel/script/iframe.ts`
第 17 行），所以 `import()` 和顶层 `await` 都能直接用。角色卡楼层那边是普通 HTML，
所以用 `<script src>`。

这几个断言由 `npm run tavern:live` 建立在真实源码之上的夹具持续验证
（`scripts/lib/real-tavern-sources.mjs` 直接吃 ST 1.18.0 / 酒馆助手 4.9.3 / TauriTavern 2.2.0 的源码），
所以酒馆升级后如果这些前提变了，回归会先红，而不是等玩家来报。

**「那 CDN 挂了怎么办」不是问题**：壳层唯一的用途是伺候 HUD，而 HUD 那 250KB 本来就从网络加载。
取不到脚本的时候 HUD 也起不来，壳层活着也无事可做。把逻辑留在本地换不来任何韧性，
只是把它钉死在每个玩家的存档里。

## 为什么用 jsDelivr 而不是 Pages

因为延迟，不是因为缓存。一开始选的是 Pages（`max-age=600`，传播快），量完之后结论反了。

同一个文件（`city/plate_map.js`，131 KB）、交错发请求、`cache: no-store`：

| | 六次耗时 (ms) | 中位 |
| --- | --- | --- |
| GitHub Pages | 1767 / 1921 / 4445 / 4684 / 7489 / 5877 | **4684** |
| jsDelivr testingcf | 1629 / 116 / 196 / 350 / 203 / 228 | **228** |

快 20.5 倍。这个差别在这里是要命的：引导壳把「取脚本」插在了「取 HUD」之前，
走 Pages 等于拿「消除版本脱节」换「每次开场多等 4.7 秒」。

用 `testingcf` 而不是 `cdn.jsdelivr.net`：后者被墙，前者没有。

**HUD 自己挪不过来**：它是 vite 产物，在 `dist/`（gitignore），由 CI 构建后发 Pages；
jsDelivr 的 `/gh/` 直接读仓库里的文件，读不到 CI 产物。`public/shell/` 是提交进仓库的源文件，所以它有得选。

### 12 小时缓存靠 CI purge 抵掉

jsDelivr 对 `@main` 这种可变引用给 12 小时边缘缓存。`.github/workflows/pages.yml` 的
`purge-cdn` 作业在推 main 时自动 purge，**不要做成手动步骤** —— 忘了的后果是玩家拿到
12 小时前的脚本，而且没有任何迹象。

那个作业断言的是**结果**不是过程：purge 尽力做，然后真的去取一次，比
`sha256sum(仓库文件)` 和 `sha256sum(CDN 内容)`。这么写有两个具体原因，都是踩出来的：

- jsDelivr 返回的是**格式化过**的 JSON（`"status": "finished"`，冒号后有空格）。
  字面量匹配 `'"status":"finished"'` 会在 purge 成功时判成失败。
- purge 有限流：同一路径几分钟内 purge 三次就会 `"throttled": true`，`throttlingReset` 2880 秒（48 分钟）。
  拿 throttled 判红会让「同一小时推第二次」变成不可行动的红灯 —— 而不可行动的红灯只会训练人忽略红灯。
  但限流时 CDN 边缘如果本来就没缓存过旧版，它照样吐新的，所以只看过程会误报。

内容对不上时发 `::warning::` 而不是 error，并且作业 `exit 0`：这时候唯一能做的事就是等。
它的职责是**让 CDN 状态可见**，不是给发布加一道会随机变红的闸门。

### 静态素材也走 jsDelivr（`ASSET_CDN`）

脚本走 CDN 之后，剩下的瓶颈是图。`public/assets/` 一共 10.12 MB，其中四个文件占 5 MB：

| 文件 | 体积 | 尺寸 | 用途 |
| --- | --- | --- | --- |
| `bg-plate.png` | 2025 KB | 1672×941 | 状态栏背景 |
| `opening-background.png` | 1966 KB | 1672×941 | 开局页背景 |
| `frost.png` | 1035 KB | 1024×1024 | 毛玻璃颗粒，**首屏依赖** |
| `polish.png` | 365 KB | 512×384 | 高光贴片 |

拿 `bg-plate.png` 交错、`no-store` 实测：

| | 四次耗时 | 结论 |
| --- | --- | --- |
| GitHub Pages | 178.8s / 217.0s / **240s 超时失败** / 185.7s | 三分钟量级，而且会整个取不回来 |
| jsDelivr testingcf | 4.2s / 2.0s / 11.0s | 约 50 倍 |

这就是「几分钟背景图都出不完全」的全部原因 —— 不是渲染慢，是**根本没下载完**。
顺带一提 jsDelivr 给 `max-age=604800`，Pages 只给 `600`，缓存也划算得多。

开关是环境变量 `ASSET_CDN`：

- **不设（默认）**：素材走本地。本地跑 playwright 回归时离线可跑、结果确定，
  也不会因为改了素材还没推就测到 CDN 上的旧版。
- **`ASSET_CDN=1`**：素材指向 jsDelivr。只有 `.github/workflows/pages.yml` 的 build 作业会设。

分两条路生效，因为引用形态不一样：

- **JS**：`asset()` 是运行时拼 URL 的，所以靠 vite `define` 注入 `__ASSETS_ROOT__`，
  由 `src/asset.js` 的 `ASSETS_ROOT` 统一出口，`src/data.js` 的 `ITEM_ART`/`GIFT_ART` 也从这里读。
- **HTML/CSS**：静态字面量，构建后由 `scripts/asset-cdn.mjs` 的 `rewriteStaticRefs` 改写。

**改写必须由白名单驱动，这一条不能省。** vite 把打包产物也 emit 到 `dist/assets/` 下，
跟摊平过来的 `public/assets/` 混在同一个目录里：

```
./assets/bg-plate.png          <- 真素材，要改
./assets/index-Du4Zn0KG.js     <- 应用自己的 bundle，绝对不能改
```

按 `./assets/` 前缀无脑替换，应用主体就会被指到 jsDelivr —— 那边没有 `dist/`（gitignore），
直接 404；就算有，JS 变跨源也会断掉 HUD 赖以跟宿主页通信的 `postMessage` 和同源 DOM 访问。
所以判据是「这个文件真的存在于 `public/assets/` 里」，bundle 名字带 hash，天然不在清单里。

图片本身不怕跨源：`<img>` 和 CSS `background` 无所谓，而且 `src/` 里没有任何
`getImageData`/`toDataURL`，不存在画布污染。**能挪的只有图，不是整个 dist。**

素材本体仍然随 `dist` 发到 Pages，作后备，也给本地 `preview` 用。

街机自己带一棵素材树（`arcade/assets/`），也一起改写，用的是各自的白名单和前缀
（`arcade/assets/` vs `public/assets/`，两边的相对引用都长成 `assets/xxx`，靠产物文件的
位置区分）。那边的量同样不小：`shrine/wishing-tree-bg.png` 2427KB、
`shrine/ema-plaque.png` 1405KB，加上从游戏页里抽出来的 `games/` 约 2.6MB。

**游戏页 HTML 本身不能挪到 CDN**：它要读 `parent.document.body.dataset.theme`（同源），
而且每个游戏用 `localStorage` 存自己的进度 —— 换 origin 等于把玩家存档丢在旧域名上。
所以只挪素材，页面留在 Pages。

### 街机为什么会「一直正在载入」

`arcade/fishing.html` 曾经是 **2753KB**，其中 2678KB(97%) 是 21 个 base64 data URI；
`arcade/slots.html` 929KB 里有 867KB(93%)。大厅是按需换 `iframe.src` 的，期间显示「正在载入…」，
所以在国内就是四分钟量级、甚至根本下不完 —— 页面上只有那个 loading 一直转。

现在抽成了 `arcade/assets/games/` 下的独立文件：

| | 之前 | 之后 |
| --- | --- | --- |
| `arcade/fishing.html` | 2753 KB | **78 KB**（−97.2%） |
| `arcade/slots.html` | 929 KB | **65 KB**（−93.3%） |

抽出来是安全的，因为两个页面本来就是按异步加载写的:`fishing` 是
`new Image(); image.src=src`，每个绘制点判 `complete && naturalWidth`；`slots` 是
`<img onerror>` 切占位块。

但这也带来一个**静默失败**:素材 404 时兜底会让画面看起来「正常运行」，只是变成占位图，
既不报错也没有红字，`npm run arcade`（量布局溢出）照样全绿。所以加了
`npm run arcade:assets`，直接断言精灵图能解码、画布上不是兜底纯色（真素材约 1046 种颜色，
兜底渐变只有几种）、并且源文件里不能再出现内联 base64。

配套改了两处粘贴份：

- `素材缓存脚本.js` 的 `ALLOW` 加了 `https://testingcf.jsdelivr.net/`（它也给 `ACAO: *`），
  这样大素材第一次几秒、之后 0 请求。
- `开局.html` 那三个硬编码地址从 Pages 换成 jsDelivr，其中后备图就是 2 MB 的 `opening-background.png`。

检查命令 `npm run assets:cdn`（加 `:net` 会额外抽查 CDN 上的字节是否与仓库一致）。
它先按**形态**考 `rewriteStaticRefs`，再看整份产物 —— 顺序是刻意的：产物检查只能说明
「当前恰好没出问题」，形态检查才能说明「换个写法也不会出问题」。裸 `/assets/` 少吃一个斜杠
那个 bug 就是这么抓到的，当时 `dist` 里没有这种形态，整套产物检查全绿。

## 加新东西该放哪

| 你要做的事 | 放哪 | 要重新粘吗 |
| --- | --- | --- |
| 改 HUD 界面、页面、面板 | `src/` | 不用 |
| 加/改一个 RPC action（读写 MVU） | `public/shell/status-shell.js` | 不用 |
| 改直播间数值、热度公式、MVU 写回 | `public/shell/aux-shell.js` | 不用 |
| 改地图、商店、街机、CG | `city/` `shop/` `arcade/` `cg/` | 不用 |
| 改礼物表 / 大航海档位 / 数量档位 | `public/shell/aux-shell.js`，然后 `npm run aux:build` | **要**（见下） |
| 改正文美化的样式或渲染 | `外部部署/V20260826/正文美化.html`，然后 `npm run reading:build` | 要 |
| 改状态栏的骨架 / 首帧样式 | `scripts/build-status-shell.mjs` 里的 skeleton | 要 |

## 什么东西必须留在粘贴那份

判据只有一条：**有没有消费方在「网络往返之前」就同步读它，而且读不到时是静默的错**。

动手前先搜一遍消费方，别猜。已经查清的两个例子：

**必须留（礼物表）** —— `正文美化.html` 的 `mountLiveRoom()` 在初始渲染路径里就用
`LinjiangAux.roomMenu()` 把礼物列表写进 DOM。取不到就退到 `LR_MENU_FALLBACK`，
而那里的 `礼物`/`大航海` 是**空数组** —— 那张卡片会永久显示没有礼物，不崩也不报错。

而且 `lrAux()` 是拿 `roomAction` 存在与否判定整个 api 的：

```js
return (api && api.roomAction) ? api : null;
```

所以「只挂一个 roomMenu 的半份 api」会被整个拒掉，礼物栏照样是空的。
于是引导版里带了一个占位 `roomAction`，返回 `{ ok:false, 提示:'还在加载，稍等一下再试' }` ——
`lrDoAction` 是完全同步的（直接读 `res.ok` / `res.快照`），返回 Promise 会被判成「操作没能完成」
而且提示还是错的；返回明确的 `ok:false` 正好走它已经写好的 toast 那条路。

**不必留（素材缓存）** —— `正文美化.html` 的 `assetUrl()` 取不到 `LinjiangAssets` 时
**原样返回远程地址**，图照样加载，只是这一次不走本地缓存。这是优雅降级，不是静默错。

### 礼物表为什么在两个文件里各有一份

`aux-shell.js` 自己也要 `GIFTS`（`giftOf` 算热度用）。两处都由 `scripts/build-aux-shell.mjs`
从同一份源碾出，所以不会漂 —— `npm run aux:check` 守着。

代价是明确接受的：如果改了礼物表而用户没重新粘贴，**礼物栏显示旧表、热度结算用新表**。
换来的是另外 137 KB 逻辑从此自动更新。礼物表基本不动，所以这笔交换划算 ——
但你改礼物表的时候要记得这件事。

## 命令

```bash
npm run shell:build     # 从 public/shell/status-shell.js 生成两份状态栏包装
npm run shell:check     # 校验产物与源同步（提交前跑）
npm run shell:compat    # 六个历史版本的粘贴壳层 × 两个宿主，配当前 HUD 还能不能用

npm run aux:build       # 从 public/shell/aux-shell.js 生成辅助计算脚本引导版
npm run aux:check       # 校验产物与源同步
npm run aux:room        # 直播间状态机干跑（不需要浏览器）
npm run aux:heat        # 弹幕热度结算干跑
npm run aux:scale       # 比对 aux-shell 与 opening.js 里两份 streamScale

npm run reading:build   # 生成 正文美化-外链素材版.html
npm run reading:check   # 校验产物与源同步

npm run tavern:live     # 源码驱动夹具自检（inline / boot 两条投递路径 + 故障注入）
npm run tavern:raster   # 状态栏滚动光栅回归（两层断言）
npm run tavern:real     # 高保真集成扫描
npm run embed           # 布局孪生体

npm run assets:cdn      # 素材 CDN 改写回归（形态 + 两种构建；:net 额外联网抽查字节）
npm run arcade:assets   # 街机素材完整性（防「素材全丢但兜底让它看起来正常」）

npm run deploy:docs     # 校验这份文档还没跟代码脱节
```

`deploy:docs` 断言的是「会让这份文档变得有害」的那些事：命令名不存在、路径指向空气、
这个目录里新加了文件却没记进清单、酒馆安装目录的路径没标成外部的、
以及粘贴那几份有没有重新长出逻辑（按体积上限拦量级回退）。
它不断言精确体积 —— 理由同上。

`shell:compat` 是保护线上已有用户的那条 —— 它拿 git 历史里六个版本的 `状态栏.html`
配当前 HUD 跑，只断言六个版本都具备的「地板」（HUD 被抬起、对齐、MVU 快照落地、构图建完、无报错），
新功能按版本能力放行。它带 `--selftest`：打断 HUD 侧的 handshake，确认这套断言真的对协议破损敏感。

## 那份「流内嵌入」测试版是干什么的

`状态栏-测试版-流内嵌入.html` 是第三种做法的实验品：**HUD 直接建在楼层文档里，壳层完全不管
几何**。滚动、裁剪、层叠、跟随对话流全是酒馆和浏览器的默认行为，连高度都由酒馆助手的
`JS-Slash-Runner/src/iframe/adjust_iframe_height.js` 按内容量。
没有裁剪台、没有 `followHud`、没有选举、没有停靠模式。

它用来在真机上回答「为什么不能干脆交还给酒馆」。已知的答案是两条硬约束：

- **iframe 换父节点必重载**（实测：同文档换父 1→2 次加载，跨文档挪 2→3，挪回来 3→4；
  对照组只改 CSS 不重载）。而 owner 随最新楼层走，所以流内嵌入 = 每来一条 AI 消息重载一次
  HUD，**开着的面板会被关掉**（地图/商店/街机/CG/随身手机都是 HUD 内的页面）。
- **流内没有挣脱阅读栏的出口**。生产壳层的全屏钮正是为此存在；竖屏下生产会突破到 480px 宽，
  流内只能是阅读栏那点宽度（夹具里实测 278px）。

这两条是「HUD 必须跟着某条消息走」这个产品选择的后果。如果收回态改成**钉在阅读区顶部**、
不随对话滚动，就不需要 per-floor 锚点，那一整套跟随/裁剪/选举都能删掉。这是产品决定，不是技术限制。

它只实现了 `handshake` / `getSnapshot` / `patch` 三个 action（够 HUD 开机并显示真数据），
其余一律返回「测试版未实现」。所以点街机、商店、打卡、建地图节点会报错 —— 那是预期的。

夹具里可以跑：`?shell=flow`（`tools/tavern-live-fixture.html` 的开关，另两个值是 `inline` / `boot`）。

## 还没拆的，以及每个的评估

| 文件 | 能不能拆 | 拦路的东西 |
| --- | --- | --- |
| `素材缓存脚本.js` | **能，而且干净** | 消费方 `assetUrl()` 优雅降级，不需要占位 api |
| `格式修复脚本.js` | 大概能 | 还没查它的消费方与时序。它清理楼层正文，晚到可能让某条消息没被清 —— 动手前先查 |
| `开局.html` | 大概能 | 它已经是个壳（真正的开局页在 Pages），但里面还有代跑人设生成和 `commitPreview` 写回 |
| `正文美化.html` | 能，但要拆两步 | 骨架和 `$1` 占位必须留（SillyTavern 正则要往里塞正文）；CSS 和图**已经外链**，剩下约 199 KB 内联 JS |

关于 `正文美化.html` 那 199 KB：纯性能视角不值得（边际只省约 0.8 ms/层，在噪声里），
但如果目的是**止住脱节**，价值完全不同 —— 它不是为了快，是为了让那 199 KB 不再冻结在玩家手里。

## 已经掉过的坑（留个记录，别改回去）

- **`--baseline HEAD` 会随时间变错。** `tavern:raster` 的基线模式要给具体 commit：
  裁剪台是在 `821800e` 进去的，修复前的最后一版是 `5c04982`。文档里写 `HEAD` 的那阵子，
  推完修复之后照着跑会看到「基线也全绿」而误以为断言失效。判断某个 rev 在哪一侧，
  看它的 `状态栏.html` 里有没有 `linjiang-hud-stage`。
- **量测必须先把外部请求换成确定性替身**（`scripts/lib/stub-external.mjs`）。
  不做这件事，Google Fonts 在随机时刻落地触发的重绘会伪装成「常驻光栅」，
  也会把变体之间的真实差值淹掉。这个坑踩了两次，两次症状完全不同。
- **生成代码的脚本必须自己验语法。** 碾具名声明这件事错过两次，两次都产出语法错误的文件：
  多行 `/* */` 注释块只吃到最后一行留下孤立的 `*/`；括号配平把 `roomMenu()` 的参数括号
  当成主体、函数被截成只剩签名。`build-aux-shell.mjs` 现在用 `vm.Script` 验语法，
  外加几条内容断言和一条反向断言（`DEVELOPMENT_NOTES` 若被误碾进引导版就报错 ——
  那会让拆分收益归零且不会有任何报错）。
- **一盏没证明过灵敏度的绿灯比没有灯更糟。** `tavern:raster` 里「主线程绘制次数」那条断言
  曾经在册，后来发现它修复前后区间完全重叠（甚至修复后还更高），已降级为诊断输出。
  新加断言时顺手想一想：它红过吗，怎么让它红。
- **不要用 PowerShell 的 `Get-Content` / `Set-Content` / `Add-Content` 改这个仓库的源文件。**
  PS 5.1 按 ANSI 代码页写，中文会整文件变乱码（发生过一次，只能 `git checkout` 重来）。
  改文件用编辑器或 node。
- `辅助计算脚本.js` 拆分前是**混合换行**（1770 个分隔符里 1723 CRLF + 47 裸 LF，
  裸的全挤在原第 1289–1335 行）。归一到 LF 之前验过那段里没有跨行模板字符串 ——
  有的话改换行会改变字符串内容。
- **`position: fixed` 在 `#chat` 里逃不出去 —— 而且只在带模糊的主题上坏。**
  SillyTavern 的 `#chat` 带 `backdrop-filter: blur(13px)`，而 `backdrop-filter`（同
  `filter`/`transform`/`perspective`/`will-change`/`contain`）会让元素成为 **fixed 后代的
  包含块**。流内嵌入版把楼层 iframe 设成 `fixed;top:0` 想让次级页面铺满视口，结果它的
  `rect.top` 等于 `-chat.scrollTop`，跟着聊天滚走并被 `#chat` 裁掉：

  | `chat.scrollTop` | 楼层 `top` | 视口内可见 |
  | --- | --- | --- |
  | 178 | −96 | 259074 px² |
  | 628 | −546 | 84024 px² |
  | 1117 | −1035 | **0 px²（面板消失）** |

  同一时刻只把 `#chat` 的 `backdrop-filter` 去掉，楼层立刻回到 `top:0`、可见整个视口。
  `Dark Lite` 那种 no-blur 主题的 `#chat` 没有这个属性，所以它一直是好的 —— 这就是为什么
  这个 bug 看起来时好时坏。回归用例必须钉住 `Dark V 1.0`。
- **抬不出去的宿主 chrome：z-index 在这个位置根本没用。**
  `#top-bar`（z 3005）和 `#form_sheld`（z 31）会压在整页上面，而返回钮就在顶上那条里 ——
  页面关不掉。楼层 iframe 在 `position:static` 的 `#chat` 里，实测把它的 z-index 提到
  2147483647 仍然输给 z-index 31 的 `#form_sheld`；只有把 `#form_sheld` 自己压下去或藏起来
  才行。所以整页期间把这几件 chrome 临时藏掉（生产壳层的全屏本来就盖住它们，见
  `paintHudFill` 的 2147483000 裁剪台挂在 body 下）。
  **对宿主做的每一处改动都要成对还原**，漏掉的后果是 `#chat` 永久失去模糊 —— 不报错的画面
  退化最难发现，所以 `tavern:live` 里连 `style` 属性都逐字比。
- **对宿主的改动必须在「状态不再成立」时也撤掉，不能只在正常退出路径上撤。**
  流内嵌入的整页会中和 `#chat` 的模糊、藏掉顶栏和输入栏。第一版只在 `layoutInlineDockPage`
  的收尾里还原,于是整页开着时用户去改全局设置里的「HUD 停靠方式」或「适配宽度」,
  分支链直接切去生产路径,收尾永远不执行 —— `#chat` 停在 `backdrop-filter: none`、
  `#top-bar` 和 `#form_sheld` 停在 `visibility: hidden`,看起来就是「切换设置把面板主体
  全屏化」。现在改成每帧先判「这一帧该不该处于整页态」,不该就先拆干净,并且放在那道 TT
  停车守卫的 `return` 之前。
- **兜底会把「素材全丢」伪装成「运行正常」。** 街机两个游戏页都有素材兜底(渐变 /
  占位块),所以素材 404 时没有报错、没有红字,量布局的 `npm run arcade` 也全绿。
  加兜底的时候顺手想一想:兜底生效了,谁会告诉我。
- **夹具支持一个变体不等于有人在测它。** `shell=flow` 在夹具里早就能跑，但一条断言都没有，
  于是上面两个根因是用户在真机上撞出来的。加变体的时候顺手问一句：谁在驱动它。
- **`cdn.jsdelivr.net` 被墙，写错域名会整页白屏。** `cg/index.html` 曾经从
  `cdn.jsdelivr.net` 取 jQuery，那是**同步阻塞**的 `<script>`：取不到就一路挂到超时，
  后面的 `cg/cg-shell.js`、`cg/cg-app.js`、`CGShell.boot()` 全都不执行，页面永远空白 ——
  而且控制台只有一条网络错误，看不出是它导致了白屏。凡是外链一律 `testingcf.jsdelivr.net`。
- **构建期改写素材地址不能按前缀无脑替换。** vite 把 bundle 也 emit 到 `dist/assets/`，
  跟摊平过来的 `public/assets/` 同一个目录，按 `./assets/` 替换会把应用主体指到 CDN 上
  （404，且 JS 跨源会断 `postMessage`）。必须用 `public/assets/` 的真实文件清单当白名单。
- **只验产物、不验规则的检查会漏掉「换个写法就坏」。** 素材改写的正则第一版没吃掉裸
  `/assets/` 前面的斜杠，会拼出 `/https://testingcf...`。当时 `dist` 里恰好没有这种形态，
  整套产物断言全绿；是逐形态单测 `rewriteStaticRefs` 才抓到的。反过来也不能无条件允许
  前缀 `/`，否则会命中绝对地址的中段，把 Pages 地址拼成 `...linjiang-glassHTTPS://...`。
  现在的判据是「前一个字符必须是定界符」，幂等也是这条规则的副产品。

## 相关文档

- 本目录的 `测试部署.md` —— **怎么在真机 / 模拟器上验证还没上线的改动，而生产一个字节都不动。**
  这份 README 讲的是生产怎么部署；那份讲的是验证怎么做。核心是一个测试镜像仓库
  （`tangquanghuy/linjiang-dev`）当预览用的 HUD 地址，配上把整套粘贴文件的外链一起改写过去的
  生成器（`scripts/make-preview-deploy.mjs`）。只改状态栏一份是不够的 —— 那会变成「新壳层配旧
  资源」，一个现实中不存在的组合。
- `草稿/直播间状态机.md` —— 直播间的表、算法、写入归属，以及「谁负责算、谁只负责画」
- `phone/README.md` —— 小手机脚本的拼接构建，同样是「产物不要直接改」那一类
- `scripts/build-status-shell.mjs`、`scripts/build-aux-shell.mjs`、`public/shell/*.js` 的头部注释
  记着更细的取舍和当时的实测数字
