# linjiang-dev —— 临江玻璃状态栏的测试镜像

这个仓库不是源头。源头是 [`linjiang-glass`](https://github.com/tangquanghuy/linjiang-glass)，
这里放的是它**当前工作区**的快照，**只为真机验证存在**。

## 它解决的问题

状态栏是两半各自部署的：

| | 部署方式 | 生效时机 |
|---|---|---|
| **壳层** `外部部署/V20260826/状态栏-*.html` | 复制粘贴进角色卡 | 粘下去立刻生效，跟 git 无关 |
| **HUD** `src/*` 的构建产物 | GitHub Pages | 只从 `main` 构建 |

于是想在手机 / 模拟器上验 HUD 侧的改动（视觉性能档、贴图、设置页），以前只有两条路：合并到
生产的 `main`（等于对所有玩家上线），或者把 HUD 指到本机（要和手机同网段，反复用很别扭）。

这个仓库是第三条路。它的 Pages 地址是一个稳定的公网 HUD 地址：

```
https://tangquanghuy.github.io/linjiang-dev/
```

把它填进壳层的 `HUD_URL`，粘一次就能一直用来验。生产的 Pages 和 jsDelivr 一个字节都不受影响。

## 快照的是工作区，不是某个提交

这一点跟直觉相反，但正是这个仓库该有的语义：**镜像装的是磁盘上现在那份代码，包含还没提交的
改动。** `publish-hud-preview.mjs` 用 `git ls-files -c -o --exclude-standard` 取「已跟踪 + 未跟踪
但不被 `.gitignore` 忽略」的全部文件。

原来只快照已提交的 `dev`，结果是安静地验错东西：改完 reading 配色发上来，手机上跑的还是上一版，
因为新的 `reading.<hash>.css` 还没 commit，镜像里根本没有它。要回到"只发已提交的那一版"，
用 `--ref=dev`。

`.gitignore` 仍然被尊重，所以 `node_modules` / `dist` / `artifacts` 不会进来。

## 怎么用

1. **首次**：在本仓库 Settings → Pages 把 Source 设成 **GitHub Actions**（只需做一次）。
2. 在 `linjiang-glass` 仓库里跑 `node scripts/publish-hud-preview.mjs` —— 它把当前工作区推到
   这里，Actions 自动构建部署。
3. 再跑 `node scripts/make-preview-deploy.mjs --verify`，产物在 `artifacts/preview/`。
4. 把那些 HTML / JS 粘进**测试角色卡**（别用线上那张），重开对话。

之后每次更新只需要重复第 2、3 步。壳层脚本从这个仓库的 Pages 取（地址固定），所以
`状态栏-引导壳.html` 和 `辅助计算脚本.js` **粘一次就不用再动**；自包含的 `状态栏.html` /
`状态栏-测试版-流内嵌入.html` 是把壳层内联进去的，壳层一改就得重新粘。

## 怎么确认手机上跑的是哪一版

状态栏 →（右下角齿轮）全局设置 → 拉到底，有一行小字：

```
HUD <git 短 sha>     壳层 <SHELL_VERSION>     原生流 / 抬升
```

- 第一段告诉你 HUD 是哪次构建；
- 第二段告诉你壳层是哪一版（这是最容易搞错的一半，因为它冻结在你粘贴那天）；
- 第三段告诉你走的是哪套架构 —— 移动端应该是「原生流」。显示「抬升」说明架构判定没命中，
  那一半性能改动都没生效。

另一个无需控制台的判据：原生流下全局设置里**不应该有**「HUD 停靠方式」那一项。

## 与生产的差别

只有两处：

1. 这里不 purge 任何 CDN 缓存（本仓库没有走 jsDelivr 的壳层脚本 —— 预览的壳层走的是本仓库
   的 Pages，见上）。
2. 构建同样开 `ASSET_CDN=1`，素材仍然走 `linjiang-glass@main` 上那份。这一点是刻意的，理由在
   `.github/workflows/pages.yml` 里：素材走 Pages 在国内会慢到几分钟，让预览站自己扛素材会把
   一份生产根本不存在的下载等待掺进测量里，比较就失去了意义。

## 注意

- **不要从这个仓库往生产提交。** 它是单向快照，历史每次被 force push 覆盖。
- 这里的代码可能包含还没验证的改动，甚至还没提交的改动，别拿它当参考实现。
- 不要在这个仓库里改代码，改了下一次发布就没了。
