# 外部部署

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
| `正文美化.html` | 580.0 KB | SillyTavern 正则把 AI 正文捕成 `$1` 塞进这个模板 | 要 |
| `正文美化-外链素材版.html` | 211.5 KB | 同上。图和 CSS 走 jsDelivr | 要 |
| `开局.html` | 47.5 KB | 粘进角色卡楼层。它只是个壳，真正的开局页在 Pages 上 | 要 |
| `格式修复脚本.js` | 27.3 KB | 粘进酒馆助手「脚本」栏 | 要 |
| `素材缓存脚本.js` | 12.6 KB | 粘进酒馆助手「脚本」栏 | 要 |
| `封面.html` | 18.5 KB | 展示用页面，不参与运行 | — |
| `心里话面板样式小样.html`、`测试.html` | 27.7 KB | 小样 / 试验，不部署 | — |

对应的逻辑本体：

| 线上文件 | 体积 | 谁加载它 |
| --- | --- | --- |
| `public/shell/status-shell.js` | 116.4 KB | `状态栏-引导壳.html` 用 `<script src>` |
| `public/shell/aux-shell.js` | 139.6 KB | `辅助计算脚本.js` 用 `import()` |

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

## 加新东西该放哪

| 你要做的事 | 放哪 | 要重新粘吗 |
| --- | --- | --- |
| 改 HUD 界面、页面、面板 | `src/` | 不用 |
| 加/改一个 RPC action（读写 MVU） | `public/shell/status-shell.js` | 不用 |
| 改直播间数值、热度公式、MVU 写回 | `public/shell/aux-shell.js` | 不用 |
| 改地图、商店、街机、CG | `city/` `shop/` `arcade/` `cg/` | 不用 |
| 改礼物表 / 大航海档位 / 数量档位 | `public/shell/aux-shell.js`，然后 `npm run aux:build` | **要**（见下） |
| 改正文美化的样式或渲染 | `外部部署/正文美化.html`，然后 `npm run reading:build` | 要 |
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

npm run deploy:docs     # 校验这份文档还没跟代码脱节
```

`deploy:docs` 断言的是「会让这份文档变得有害」的那些事：命令名不存在、路径指向空气、
这个目录里新加了文件却没记进清单、酒馆安装目录的路径没标成外部的、
以及粘贴那几份有没有重新长出逻辑（按体积上限拦量级回退）。
它不断言精确体积 —— 理由同上。

`shell:compat` 是保护线上已有用户的那条 —— 它拿 git 历史里六个版本的 `状态栏.html`
配当前 HUD 跑，只断言六个版本都具备的「地板」（HUD 被抬起、对齐、MVU 快照落地、构图建完、无报错），
新功能按版本能力放行。它带 `--selftest`：打断 HUD 侧的 handshake，确认这套断言真的对协议破损敏感。

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

## 相关文档

- `草稿/直播间状态机.md` —— 直播间的表、算法、写入归属，以及「谁负责算、谁只负责画」
- `phone/README.md` —— 小手机脚本的拼接构建，同样是「产物不要直接改」那一类
- `scripts/build-status-shell.mjs`、`scripts/build-aux-shell.mjs`、`public/shell/*.js` 的头部注释
  记着更细的取舍和当时的实测数字
